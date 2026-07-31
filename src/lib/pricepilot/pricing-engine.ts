/**
 * PricePilot - Canonical Pricing Engine
 *
 * THE SINGLE AUTHORITY for all financial calculations.
 * No other file may compute margin, tax, fee, or profit formulas.
 *
 * This engine implements the PricePilot Production Upgrade Specification
 * for Phase 2, providing:
 *
 * 1. Tax Model Support (inclusive, exclusive, exempt, purchase-side)
 * 2. Percentage Convention (whole numbers → divide by 100 only when computing)
 * 3. Net Profit = Net revenue - total landed cost - all fees - non-recoverable tax
 * 4. Effective Margin = Net profit / Net sales revenue × 100
 * 5. Markup = Net profit / Total effective product cost × 100
 * 6. Confidence system (high / medium / low)
 * 7. Impossible-state handling
 * 8. minimumProfitPerUnit support
 * 9. Rounding revalidation
 *
 * CRITICAL RULE: Purchase cost MUST NEVER fallback to shipping or any
 * other value. If purchase cost is 0 or missing, the product is marked
 * as `missing-cost` and receives NO trusted recommendation.
 */

import {
  Product,
  BusinessSettings,
  ResolvedPricingPolicy,
  PriceOutcome,
  PricingWarning,
  PricingConfidence,
  WarningSeverity,
  RoundingRule,
  FeeBasePolicy,
} from './types';
import { roundTo2Decimals, roundTo4Decimals, safeNumberValue } from './formatting';

// ============================================================
// Percentage Convention Helpers
// ============================================================

/**
 * Convert a whole-number percentage to a decimal fraction.
 * CRITICAL: All percentages are stored as whole numbers (18 = 18%).
 * Only divide by 100 when computing. NEVER double-divide.
 *
 * percentageToDecimal(18) → 0.18
 * percentageToDecimal(0) → 0
 * percentageToDecimal(100) → 1
 */
export function percentageToDecimal(percentValue: number): number {
  if (typeof percentValue !== 'number' || isNaN(percentValue)) return 0;
  return percentValue / 100;
}

/**
 * Convert a decimal fraction to a whole-number percentage.
 * decimalToPercentage(0.18) → 18
 * decimalToPercentage(0) → 0
 * decimalToPercentage(1) → 100
 */
export function decimalToPercentage(decimalValue: number): number {
  if (typeof decimalValue !== 'number' || isNaN(decimalValue)) return 0;
  return decimalValue * 100;
}

// ============================================================
// Decimal-Safe Arithmetic Helpers
// ============================================================

/**
 * Safely add two numbers with 4-decimal precision.
 */
function safeAdd(a: number, b: number): number {
  return roundTo4Decimals(a + b);
}

/**
 * Safely add an array of numbers.
 */
function safeSum(values: number[]): number {
  return values.reduce((acc, v) => safeAdd(acc, v), 0);
}

/**
 * Safely subtract two numbers.
 */
function safeSub(a: number, b: number): number {
  return roundTo4Decimals(a - b);
}

/**
 * Safely multiply two numbers.
 */
function safeMul(a: number, b: number): number {
  return roundTo4Decimals(a * b);
}

/**
 * Safely divide two numbers. Returns 0 if divisor is zero or near-zero.
 */
function safeDiv(dividend: number, divisor: number): number {
  if (Math.abs(divisor) < 0.00005) return 0;
  return roundTo4Decimals(dividend / divisor);
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Ensure a value is non-negative. Returns 0 for NaN/undefined/negative.
 */
function safeNonNegative(value: number | undefined | null): number {
  if (value === undefined || value === null || typeof value !== 'number' || isNaN(value) || value < 0) return 0;
  return value;
}

/**
 * Get a number value or fallback to default.
 */
function safeNumber(value: number | undefined | null, fallback: number): number {
  if (value === undefined || value === null || typeof value !== 'number' || isNaN(value)) return fallback;
  return value;
}

// ============================================================
// Purchase Cost (CRITICAL - NO FALLBACK)
// ============================================================

/**
 * Get the effective purchase cost for a product.
 *
 * CRITICAL RULE from spec: Purchase cost MUST NEVER fallback to
 * shipping or any other value. If purchase cost is 0 or missing,
 * the product must be flagged as `missing-cost` and receive NO
 * trusted recommendation.
 *
 * This function returns the raw purchase cost value as-is.
 * A 0 or missing value is a valid state that must be handled
 * downstream with a warning, NOT silently substituted.
 */
function getPurchaseCost(product: Product): number {
  // NEVER fallback. Return the actual value (which may be 0).
  return safeNumber(product.purchaseCost, 0);
}

/**
 * Check whether purchase cost is available and non-zero.
 */
function hasPurchaseCost(product: Product): boolean {
  return product.purchaseCost !== undefined &&
         product.purchaseCost !== null &&
         typeof product.purchaseCost === 'number' &&
         !isNaN(product.purchaseCost) &&
         product.purchaseCost > 0;
}

// ============================================================
// Purchase-Side Tax Calculations
// ============================================================

/**
 * Calculate purchase-side tax components.
 *
 * If purchase cost includes recoverable GST:
 *   Net purchase cost = gross cost / (1 + purchaseTaxRate)
 *   Recoverable input tax = gross cost - net purchase cost
 *   Non-recoverable input tax adds to landed cost.
 *
 * If purchase cost excludes tax (purchaseCostTaxMode = 'excluding-tax'):
 *   Net purchase cost = purchaseCost (already excludes tax)
 *   Input tax on purchase = purchaseCost * purchaseTaxRate
 *   Recoverable portion is subtracted, non-recoverable adds to landed cost.
 *
 * Tax-exempt products: no purchase tax calculations.
 */
function calculatePurchaseSideTax(
  product: Product,
  _businessSettings: BusinessSettings
): {
  netPurchaseCost: number;
  recoverableInputTax: number;
  nonRecoverableInputTax: number;
} {
  const purchaseCost = getPurchaseCost(product);
  const purchaseTaxRatePercent = safeNonNegative(product.purchaseTaxRatePercent);
  const taxMode = product.purchaseCostTaxMode ?? 'excluding-tax';
  const recoverability = product.inputTaxCreditRecoverable ?? 'not-recoverable';

  // If no purchase tax rate or no purchase cost, everything is 0
  if (purchaseTaxRatePercent === 0 || purchaseCost === 0) {
    return {
      netPurchaseCost: purchaseCost,
      recoverableInputTax: 0,
      nonRecoverableInputTax: 0,
    };
  }

  const taxDecimal = percentageToDecimal(purchaseTaxRatePercent);

  if (taxMode === 'including-tax') {
    // Purchase cost includes tax (e.g., GST-inclusive pricing)
    // Net purchase cost = gross cost / (1 + taxRate)
    const netPurchaseCost = safeDiv(purchaseCost, safeAdd(1, taxDecimal));
    const totalInputTax = safeSub(purchaseCost, netPurchaseCost);

    switch (recoverability) {
      case 'recoverable':
        return {
          netPurchaseCost: roundTo2Decimals(netPurchaseCost),
          recoverableInputTax: roundTo2Decimals(totalInputTax),
          nonRecoverableInputTax: 0,
        };
      case 'not-recoverable':
        // All input tax becomes a cost
        return {
          netPurchaseCost: roundTo2Decimals(netPurchaseCost),
          recoverableInputTax: 0,
          nonRecoverableInputTax: roundTo2Decimals(totalInputTax),
        };
      case 'partially-recoverable':
        // Use the configurable recoverable percentage (0-100)
        // Default to 100 if not set (fully recoverable)
        const recoverablePercent = percentageToDecimal(
          safeNumber(product.inputTaxRecoverablePercent, 100)
        );
        const recoverable = safeMul(totalInputTax, recoverablePercent);
        const nonRecoverable = safeSub(totalInputTax, recoverable);
        return {
          netPurchaseCost: roundTo2Decimals(netPurchaseCost),
          recoverableInputTax: roundTo2Decimals(recoverable),
          nonRecoverableInputTax: roundTo2Decimals(nonRecoverable),
        };
      default:
        return {
          netPurchaseCost: roundTo2Decimals(netPurchaseCost),
          recoverableInputTax: 0,
          nonRecoverableInputTax: roundTo2Decimals(totalInputTax),
        };
    }
  } else {
    // Purchase cost excludes tax ('excluding-tax')
    // Input tax = purchaseCost * taxRate
    // This is additional tax ON TOP of the stated purchase cost
    const inputTaxAmount = safeMul(purchaseCost, taxDecimal);

    switch (recoverability) {
      case 'recoverable':
        // Net purchase cost remains purchaseCost; input tax is recoverable
        return {
          netPurchaseCost: purchaseCost,
          recoverableInputTax: roundTo2Decimals(inputTaxAmount),
          nonRecoverableInputTax: 0,
        };
      case 'not-recoverable':
        // Input tax adds to cost
        return {
          netPurchaseCost: purchaseCost,
          recoverableInputTax: 0,
          nonRecoverableInputTax: roundTo2Decimals(inputTaxAmount),
        };
      case 'partially-recoverable':
        const exclRecoverablePercent = percentageToDecimal(
          safeNumber(product.inputTaxRecoverablePercent, 100)
        );
        const exclRecoverable = safeMul(inputTaxAmount, exclRecoverablePercent);
        const exclNonRecoverable = safeSub(inputTaxAmount, exclRecoverable);
        return {
          netPurchaseCost: purchaseCost,
          recoverableInputTax: roundTo2Decimals(exclRecoverable),
          nonRecoverableInputTax: roundTo2Decimals(exclNonRecoverable),
        };
      default:
        return {
          netPurchaseCost: purchaseCost,
          recoverableInputTax: 0,
          nonRecoverableInputTax: roundTo2Decimals(inputTaxAmount),
        };
    }
  }
}

// ============================================================
// Selling-Side Tax Calculations
// ============================================================

/**
 * Calculate selling-side (output) tax components.
 *
 * Tax-inclusive: Net revenue = inclusive price / (1 + taxRate)
 *                Output tax = inclusive price - net revenue
 *                Customer payable = inclusive price
 *
 * Tax-exclusive: Net revenue = entered price
 *                Output tax = entered price * taxRate
 *                Customer payable = entered price + output tax
 *
 * Tax-exempt:    Net revenue = entered price
 *                Output tax = 0
 */
function calculateSellingTax(
  sellingPrice: number,
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule?: ResolvedPricingPolicy
): {
  netSalesRevenue: number;
  outputTax: number;
  customerPayableAmount: number;
  grossSalesAmount: number;
} {
  // Read tax rate directly from ResolvedPricingPolicy (THE AUTHORITY)
  // CRITICAL: Do NOT use safeNonNegative(undefined) ?? fallback pattern.
  // safeNonNegative(undefined) returns 0, blocking the fallback.
  const taxRatePercent = effectiveRule
    ? effectiveRule.taxRatePercent
    : (typeof product.taxRatePercent === 'number' && Number.isFinite(product.taxRatePercent) && product.taxRatePercent > 0)
      ? product.taxRatePercent
      : businessSettings.defaultTaxRatePercent;

  const taxTreatment = effectiveRule
    ? effectiveRule.taxTreatment
    : product.taxTreatment ?? businessSettings.taxTreatment;
  const taxDecimal = percentageToDecimal(taxRatePercent);

  switch (taxTreatment) {
    case 'inclusive':
      if (sellingPrice <= 0 || taxDecimal === 0) {
        return {
          grossSalesAmount: roundTo2Decimals(sellingPrice),
          netSalesRevenue: roundTo2Decimals(sellingPrice),
          outputTax: 0,
          customerPayableAmount: roundTo2Decimals(sellingPrice),
        };
      }
      const denominator = safeAdd(1, taxDecimal);
      const netRevenue = safeDiv(sellingPrice, denominator);
      const outputTax = safeSub(sellingPrice, netRevenue);
      return {
        grossSalesAmount: roundTo2Decimals(sellingPrice),
        netSalesRevenue: roundTo2Decimals(netRevenue),
        outputTax: roundTo2Decimals(outputTax),
        customerPayableAmount: roundTo2Decimals(sellingPrice),
      };

    case 'exclusive':
      const exclusiveOutputTax = safeMul(sellingPrice, taxDecimal);
      const customerPayable = safeAdd(sellingPrice, exclusiveOutputTax);
      return {
        grossSalesAmount: roundTo2Decimals(sellingPrice),
        netSalesRevenue: roundTo2Decimals(sellingPrice),
        outputTax: roundTo2Decimals(exclusiveOutputTax),
        customerPayableAmount: roundTo2Decimals(customerPayable),
      };

    case 'exempt':
      return {
        grossSalesAmount: roundTo2Decimals(sellingPrice),
        netSalesRevenue: roundTo2Decimals(sellingPrice),
        outputTax: 0,
        customerPayableAmount: roundTo2Decimals(sellingPrice),
      };

    case 'reverse':
      const reverseTax = safeMul(sellingPrice, taxDecimal);
      return {
        grossSalesAmount: roundTo2Decimals(sellingPrice),
        netSalesRevenue: roundTo2Decimals(sellingPrice),
        outputTax: roundTo2Decimals(reverseTax),
        customerPayableAmount: roundTo2Decimals(safeAdd(sellingPrice, reverseTax)),
      };

    case 'composite':
      if (sellingPrice <= 0 || taxDecimal === 0) {
        return {
          grossSalesAmount: roundTo2Decimals(sellingPrice),
          netSalesRevenue: roundTo2Decimals(sellingPrice),
          outputTax: 0,
          customerPayableAmount: roundTo2Decimals(sellingPrice),
        };
      }
      const compositeDenominator = safeAdd(1, taxDecimal);
      const compositeNetRevenue = safeDiv(sellingPrice, compositeDenominator);
      const compositeOutputTax = safeSub(sellingPrice, compositeNetRevenue);
      return {
        grossSalesAmount: roundTo2Decimals(sellingPrice),
        netSalesRevenue: roundTo2Decimals(compositeNetRevenue),
        outputTax: roundTo2Decimals(compositeOutputTax),
        customerPayableAmount: roundTo2Decimals(sellingPrice),
      };

    default:
      return {
        grossSalesAmount: roundTo2Decimals(sellingPrice),
        netSalesRevenue: roundTo2Decimals(sellingPrice),
        outputTax: 0,
        customerPayableAmount: roundTo2Decimals(sellingPrice),
      };
  }
}

// ============================================================
// Cost Calculations
// ============================================================

/**
 * Calculate fixed product costs (excluding purchase cost).
 * These are per-unit costs like shipping, packaging, handling, etc.
 *
 * Note: This does NOT include purchase cost. Purchase cost is
 * handled separately because of the purchase-side tax rules.
 */
function calculateFixedProductCosts(
  product: Product,
  businessSettings: BusinessSettings
): number {
  const shippingCost = safeNonNegative(safeNumber(product.shippingCost, businessSettings.defaultShippingCost));
  const packagingCost = safeNonNegative(safeNumber(product.packagingCost, businessSettings.defaultPackagingCost));
  const handlingCost = safeNonNegative(safeNumber(product.handlingCost, businessSettings.defaultHandlingCost));
  const otherCosts = safeNonNegative(safeNumber(product.otherCosts, businessSettings.defaultOtherCosts));
  const freightPercent = safeNonNegative(safeNumber(product.freightPercent, businessSettings.defaultFreightPercent));

  // CRITICAL: Freight as % of purchase cost, NOT shipping cost
  // Purchase cost MUST NEVER fallback to shipping. If purchase cost
  // is 0, freight cost is also 0.
  const purchaseCost = getPurchaseCost(product);
  const freightCost = safeMul(purchaseCost, percentageToDecimal(freightPercent));

  return roundTo2Decimals(
    safeSum([shippingCost, packagingCost, handlingCost, otherCosts, freightCost])
  );
}

/**
 * Calculate expected return cost.
 * Formula: (netPurchaseCost + fixedProductCosts) * (returnRate / 100)
 * Spread across all sold units.
 */
function calculateExpectedReturnCost(
  netPurchaseCost: number,
  fixedProductCosts: number,
  product: Product,
  businessSettings: BusinessSettings
): number {
  const returnRatePercent = clamp(
    safeNonNegative(safeNumber(product.returnRatePercent, businessSettings.defaultReturnRatePercent)),
    0, 100
  );

  const baseForReturn = safeAdd(netPurchaseCost, fixedProductCosts);
  return roundTo2Decimals(safeMul(baseForReturn, percentageToDecimal(returnRatePercent)));
}

/**
 * Calculate expected damage cost.
 * Formula: (netPurchaseCost + fixedProductCosts) * (damageRate / 100)
 * Spread across all sold units.
 */
function calculateExpectedDamageCost(
  netPurchaseCost: number,
  fixedProductCosts: number,
  product: Product,
  businessSettings: BusinessSettings
): number {
  const damageRatePercent = clamp(
    safeNonNegative(safeNumber(product.damageRatePercent, businessSettings.defaultDamageRatePercent)),
    0, 100
  );

  const baseForDamage = safeAdd(netPurchaseCost, fixedProductCosts);
  return roundTo2Decimals(safeMul(baseForDamage, percentageToDecimal(damageRatePercent)));
}

/**
 * Calculate custom duty cost.
 * Formula: purchaseCost * (customDutyPercent / 100)
 * Applied on the gross purchase cost.
 */
function calculateCustomDutyCost(
  product: Product,
  businessSettings: BusinessSettings
): number {
  const purchaseCost = getPurchaseCost(product);
  const customDutyPercent = clamp(
    safeNonNegative(safeNumber(product.customDutyPercent, businessSettings.defaultCustomDutyPercent)),
    0, 100
  );
  return roundTo2Decimals(safeMul(purchaseCost, percentageToDecimal(customDutyPercent)));
}

/**
 * Calculate total landed cost per unit.
 *
 * Formula:
 *   totalLandedCost = netPurchaseCost + fixedProductCosts
 *     + expectedReturnCost + expectedDamageCost
 *     + customDutyCost + nonRecoverableInputTax
 *
 * Non-recoverable input tax is a cost that adds to landed cost
 * because it cannot be recovered from the government.
 */
function calculateTotalLandedCost(
  netPurchaseCost: number,
  fixedProductCosts: number,
  expectedReturnCost: number,
  expectedDamageCost: number,
  customDutyCost: number,
  nonRecoverableInputTax: number
): number {
  return roundTo2Decimals(
    safeSum([
      netPurchaseCost,
      fixedProductCosts,
      expectedReturnCost,
      expectedDamageCost,
      customDutyCost,
      nonRecoverableInputTax,
    ])
  );
}

// ============================================================
// Fee Calculations
// ============================================================

/**
 * Calculate percentage-based selling fees.
 * These are charged as a percentage of the selling price (or net revenue).
 *
 * CRITICAL: For tax-inclusive prices, percentage fees on the selling
 * price include the tax portion. Most marketplaces charge fees on
 * the total selling price (including tax). We follow this convention.
 *
 * Returns individual fee amounts and the total.
 */
function calculateSellingFees(
  sellingPrice: number,
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule?: ResolvedPricingPolicy
): {
  marketplacePercentageFee: number;
  marketplaceFixedFee: number;
  paymentPercentageFee: number;
  paymentFixedFee: number;
  otherPercentageFees: number;
  otherFixedFees: number;
  totalSellingFees: number;
} {
  // Read fee values directly from ResolvedPricingPolicy (THE AUTHORITY)
  // CRITICAL: Do NOT use safeNonNegative(undefined) ?? fallback pattern
  const marketplaceFeePercent = effectiveRule
    ? effectiveRule.marketplaceFeePercent
    : (typeof product.marketplaceFeePercent === 'number' && Number.isFinite(product.marketplaceFeePercent) && product.marketplaceFeePercent > 0)
      ? product.marketplaceFeePercent
      : businessSettings.defaultMarketplaceFeePercent;

  const paymentFeePercent = effectiveRule
    ? effectiveRule.paymentFeePercent
    : (typeof product.paymentFeePercent === 'number' && Number.isFinite(product.paymentFeePercent) && product.paymentFeePercent > 0)
      ? product.paymentFeePercent
      : businessSettings.defaultPaymentFeePercent;

  const otherFeesPercent = effectiveRule
    ? effectiveRule.otherFeesPercent
    : (typeof product.otherFeesPercent === 'number' && Number.isFinite(product.otherFeesPercent) && product.otherFeesPercent > 0)
      ? product.otherFeesPercent
      : businessSettings.defaultOtherFeesPercent;

  const marketplaceFeeFixed = effectiveRule
    ? effectiveRule.marketplaceFeeFixed
    : (typeof product.marketplaceFeeFixed === 'number' && Number.isFinite(product.marketplaceFeeFixed))
      ? product.marketplaceFeeFixed
      : businessSettings.defaultMarketplaceFeeFixed;

  const paymentFeeFixed = effectiveRule
    ? effectiveRule.paymentFeeFixed
    : (typeof product.paymentFeeFixed === 'number' && Number.isFinite(product.paymentFeeFixed))
      ? product.paymentFeeFixed
      : businessSettings.defaultPaymentFeeFixed;

  const otherFeesFixed = effectiveRule
    ? effectiveRule.otherFeesFixed
    : (typeof product.otherFeesFixed === 'number' && Number.isFinite(product.otherFeesFixed))
      ? product.otherFeesFixed
      : businessSettings.defaultOtherFeesFixed;

  // --- Fee Base Policy ---
  // Determines what base percentage fees are calculated on
  const feeBasePolicy: FeeBasePolicy = effectiveRule
    ? effectiveRule.feeBasePolicy
    : product.feeBasePolicy ?? businessSettings.feeBasePolicy ?? 'product-price-only';

  // Calculate the fee base amount depending on the policy
  // For 'product-price-only': fees are on the selling price (entered/net price)
  // For 'product-price-plus-shipping': fees are on selling price + customer shipping
  // For 'customer-payable-gross': fees are on the total customer-payable amount
  let feeBaseAmount: number;
  switch (feeBasePolicy) {
    case 'product-price-plus-shipping':
      feeBaseAmount = roundTo2Decimals(safeAdd(sellingPrice, product.shippingChargeToCustomer ?? 0));
      break;
    case 'customer-payable-gross':
      // Need to calculate customer payable first
      // Simplified: for inclusive tax, it's the selling price; for exclusive, it's selling price + output tax
      const taxTreatment = effectiveRule ? effectiveRule.taxTreatment : (product.taxTreatment ?? businessSettings.taxTreatment);
      const taxRate = effectiveRule ? effectiveRule.taxRatePercent : (product.taxRatePercent ?? businessSettings.defaultTaxRatePercent);
      if (taxTreatment === 'exclusive' || taxTreatment === 'reverse') {
        feeBaseAmount = roundTo2Decimals(safeAdd(sellingPrice, safeMul(sellingPrice, percentageToDecimal(taxRate))));
      } else {
        feeBaseAmount = roundTo2Decimals(sellingPrice);
      }
      break;
    case 'product-price-only':
    default:
      feeBaseAmount = roundTo2Decimals(sellingPrice);
      break;
  }

  // Percentage fee amounts (on the fee base amount)
  const marketplacePercentageFee = roundTo2Decimals(safeMul(feeBaseAmount, percentageToDecimal(marketplaceFeePercent)));
  const paymentPercentageFee = roundTo2Decimals(safeMul(feeBaseAmount, percentageToDecimal(paymentFeePercent)));
  const otherPercentageFees = roundTo2Decimals(safeMul(feeBaseAmount, percentageToDecimal(otherFeesPercent)));

  const totalSellingFees = roundTo2Decimals(
    safeSum([
      marketplacePercentageFee,
      marketplaceFeeFixed,
      paymentPercentageFee,
      paymentFeeFixed,
      otherPercentageFees,
      otherFeesFixed,
    ])
  );

  return {
    marketplacePercentageFee,
    marketplaceFixedFee: marketplaceFeeFixed,
    paymentPercentageFee,
    paymentFixedFee: paymentFeeFixed,
    otherPercentageFees,
    otherFixedFees: otherFeesFixed,
    totalSellingFees,
  };
}

// ============================================================
// Total Percentage Fees (for break-even denominator)
// ============================================================

/**
 * Calculate total percentage fees as a decimal fraction of selling price.
 * Used for the break-even denominator formula.
 *
 * CRITICAL: This is the sum of all percentage-based fees as a decimal
 * fraction. ONLY includes fees that REDUCE the seller's net revenue.
 * Tax-exclusive output GST does NOT reduce net revenue — it is
 * collected separately on top of the base selling price.
 */
function calculateTotalPercentageFeesDecimal(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule?: ResolvedPricingPolicy
): number {
  // Read fee values directly from ResolvedPricingPolicy (THE AUTHORITY)
  const marketplaceFeePercent = effectiveRule
    ? effectiveRule.marketplaceFeePercent
    : (typeof product.marketplaceFeePercent === 'number' && Number.isFinite(product.marketplaceFeePercent) && product.marketplaceFeePercent > 0)
      ? product.marketplaceFeePercent
      : businessSettings.defaultMarketplaceFeePercent;

  const paymentFeePercent = effectiveRule
    ? effectiveRule.paymentFeePercent
    : (typeof product.paymentFeePercent === 'number' && Number.isFinite(product.paymentFeePercent) && product.paymentFeePercent > 0)
      ? product.paymentFeePercent
      : businessSettings.defaultPaymentFeePercent;

  const otherFeesPercent = effectiveRule
    ? effectiveRule.otherFeesPercent
    : (typeof product.otherFeesPercent === 'number' && Number.isFinite(product.otherFeesPercent) && product.otherFeesPercent > 0)
      ? product.otherFeesPercent
      : businessSettings.defaultOtherFeesPercent;

  // ONLY actual selling fees that reduce the seller's revenue
  // Tax-exclusive output GST does NOT reduce net revenue
  const totalPercent = clamp(
    safeSum([marketplaceFeePercent, paymentFeePercent, otherFeesPercent]),
    0, 100
  );

  return percentageToDecimal(totalPercent);
}

// ============================================================
// Net Profit & Margin Calculations
// ============================================================

/**
 * Calculate net profit per unit.
 *
 * Formula:
 *   netProfit = netSalesRevenue - totalLandedCost - totalSellingFees
 *
 * Where:
 *   - netSalesRevenue excludes output tax (for inclusive tax)
 *   - totalLandedCost includes non-recoverable input tax
 *   - totalSellingFees includes all percentage and fixed fees
 */
function calculateNetProfit(
  netSalesRevenue: number,
  totalLandedCost: number,
  totalSellingFees: number
): number {
  return roundTo2Decimals(safeSub(netSalesRevenue, safeAdd(totalLandedCost, totalSellingFees)));
}

/**
 * Calculate effective margin percent.
 *
 * Formula: effectiveMargin = netProfit / netSalesRevenue × 100
 *
 * When tax is included in customer-facing price, margin MUST use
 * net sales revenue EXCLUDING tax. This ensures margin reflects
 * the actual revenue the business retains.
 */
function calculateEffectiveMarginPercent(
  netProfit: number,
  netSalesRevenue: number
): number {
  if (netSalesRevenue <= 0) return 0;
  return roundTo2Decimals(decimalToPercentage(safeDiv(netProfit, netSalesRevenue)));
}

/**
 * Calculate markup percent.
 *
 * Formula: markup = netProfit / totalEffectiveProductCost × 100
 *
 * Where totalEffectiveProductCost = totalLandedCost + totalSellingFees
 * (This represents the total "cost" per successful sale)
 */
function calculateMarkupPercent(
  netProfit: number,
  totalCostPerSuccessfulSale: number
): number {
  if (totalCostPerSuccessfulSale <= 0) {
    // If cost is 0 and profit is positive, markup is infinite
    return netProfit > 0 ? 999999 : 0;
  }
  return roundTo2Decimals(decimalToPercentage(safeDiv(netProfit, totalCostPerSuccessfulSale)));
}

// ============================================================
// Confidence Assessment
// ============================================================

/**
 * Determine the confidence level of a pricing calculation.
 *
 * High confidence:
 *   - Purchase cost available and non-zero
 *   - Selling fees available (at least one defined)
 *   - Tax treatment configured
 *   - Shipping/packaging available
 *   - Return assumptions available
 *   - Competitor data recently checked
 *
 * Medium confidence:
 *   - Core costs and fees available
 *   - Some secondary costs missing
 *   - Limited competitor data
 *
 * Low confidence:
 *   - Missing cost components
 *   - Unknown tax treatment
 *   - No fee information
 *   - Old competitor data
 *   - Missing purchase cost (CRITICAL)
 */
function assessConfidence(
  product: Product,
  businessSettings: BusinessSettings,
  warnings: PricingWarning[]
): PricingConfidence {
  // If purchase cost is missing, confidence is ALWAYS low
  if (!hasPurchaseCost(product)) return 'low';

  // Count critical missing items
  // NOTE: Confidence reflects PRODUCT DATA QUALITY (cost, fees, tax, etc.),
  // not the outcome at a particular probe price. During break-even and
  // safe-price probes the engine intentionally calls calculateOutcomeAtPrice
  // with sellingPrice=0, which legitimately generates 'missing-price' (no
  // real price entered) and 'loss-making' (price 0 < cost) warnings. Those
  // outcome-quality warnings must NOT lower confidence — otherwise every
  // product's overall confidence becomes 'low' simply because the break-even
  // probe is part of the recommendation set.
  // Only data-quality warnings ('missing-cost', 'impossible-margin') lower
  // confidence to 'low'.
  const dataQualityWarnings = warnings.filter(
    w => w.type === 'missing-cost' || w.type === 'impossible-margin'
  );

  // If there are critical data-quality warnings, confidence is low
  if (dataQualityWarnings.length > 0) return 'low';

  // Check what data is available
  const hasTaxTreatment = product.taxTreatment !== undefined && product.taxTreatment !== null;
  const hasTaxRate = product.taxRatePercent > 0 || businessSettings.defaultTaxRatePercent > 0;
  const hasShipping = product.shippingCost > 0 || businessSettings.defaultShippingCost > 0;
  const hasPackaging = product.packagingCost > 0 || businessSettings.defaultPackagingCost > 0;
  const hasReturnRate = product.returnRatePercent > 0 || businessSettings.defaultReturnRatePercent > 0;
  const hasDamageRate = product.damageRatePercent > 0 || businessSettings.defaultDamageRatePercent > 0;
  const hasFees = product.marketplaceFeePercent > 0 || product.paymentFeePercent > 0 ||
                  businessSettings.defaultMarketplaceFeePercent > 0 || businessSettings.defaultPaymentFeePercent > 0;
  const hasCompetitorData = product.competitorPrices && product.competitorPrices.length > 0 &&
                            product.competitorPrices.some(cp => cp.price > 0);

  // Check competitor data freshness (within 30 days)
  const hasRecentCompetitorData = hasCompetitorData && product.competitorPrices.some(cp => {
    if (!cp.dateChecked) return false;
    const checkedDate = new Date(cp.dateChecked);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return checkedDate >= thirtyDaysAgo;
  });

  // Score each component
  const componentsAvailable = [
    hasPurchaseCost(product),
    hasFees,
    hasTaxTreatment && hasTaxRate,
    hasShipping,
    hasPackaging,
    hasReturnRate,
    hasDamageRate,
    hasRecentCompetitorData,
  ];

  const availableCount = componentsAvailable.filter(Boolean).length;

  // High confidence: 7-8 components available, no data-quality warnings
  if (availableCount >= 7 && dataQualityWarnings.length === 0) return 'high';

  // Medium confidence: 4-6 components available
  if (availableCount >= 4) return 'medium';

  // Low confidence: fewer than 4 components available
  return 'low';
}

// ============================================================
// Warning Generation
// ============================================================

/**
 * Generate pricing warnings for a given price outcome.
 * These are engine-level warnings distinct from the app-level Warning type.
 */
function generatePricingWarnings(
  product: Product,
  sellingPrice: number,
  businessSettings: BusinessSettings,
  outcomeData: {
    netProfit: number;
    effectiveMarginPercent: number;
    totalPercentageFeesDecimal: number;
    isImpossible: boolean;
    effectiveRule?: ResolvedPricingPolicy;
  }
): PricingWarning[] {
  const warnings: PricingWarning[] = [];

  // --- Missing Purchase Cost (CRITICAL) ---
  if (!hasPurchaseCost(product)) {
    warnings.push({
      type: 'missing-cost',
      severity: 'critical',
      message: 'Purchase cost is missing or zero',
      detail: 'No trusted recommendation can be generated without purchase cost.',
      suggestion: 'Enter the purchase cost to enable full pricing analysis.',
      field: 'purchaseCost',
      value: 0,
    });
  }

  // --- Impossible State ---
  if (outcomeData.isImpossible) {
    const totalFeesPercent = decimalToPercentage(outcomeData.totalPercentageFeesDecimal);
    const marginTarget = outcomeData.effectiveRule?.minimumMarginPercent ?? businessSettings.defaultMinimumMarginPercent;
    warnings.push({
      type: 'impossible-margin',
      severity: 'critical',
      message: 'Your selected fees and target margin cannot be achieved because they consume 100% or more of revenue.',
      detail: `Total percentage fees: ${roundTo2Decimals(totalFeesPercent)}%, target minimum margin: ${marginTarget}%. Combined: ${roundTo2Decimals(safeAdd(totalFeesPercent, marginTarget))}%.`,
      field: 'totalPercentageFees',
      value: roundTo2Decimals(safeAdd(totalFeesPercent, marginTarget)),
    });
  }

  // --- Loss-Making ---
  if (outcomeData.netProfit < 0) {
    warnings.push({
      type: 'loss-making',
      severity: 'critical',
      message: `Product is loss-making at this price. You lose ${Math.abs(roundTo2Decimals(safeNumberValue(outcomeData.netProfit, 0))).toFixed(2)} per unit.`,
      field: 'netProfit',
      value: roundTo2Decimals(outcomeData.netProfit),
    });
  }

  // --- Below Minimum Margin ---
  const minMargin = outcomeData.effectiveRule?.minimumMarginPercent ?? businessSettings.defaultMinimumMarginPercent;
  if (outcomeData.effectiveMarginPercent < minMargin && outcomeData.netProfit >= 0) {
    warnings.push({
      type: 'below-minimum-margin',
      severity: 'warning',
      message: `Margin (${roundTo2Decimals(outcomeData.effectiveMarginPercent)}%) is below the minimum target (${minMargin}%).`,
      field: 'effectiveMarginPercent',
      value: roundTo2Decimals(outcomeData.effectiveMarginPercent),
    });
  }

  // --- High Total Fees ---
  if (outcomeData.totalPercentageFeesDecimal >= 0.5 && !outcomeData.isImpossible) {
    warnings.push({
      type: 'high-total-fees',
      severity: 'warning',
      message: `Total percentage fees consume ${roundTo2Decimals(decimalToPercentage(outcomeData.totalPercentageFeesDecimal))}% of selling price.`,
      detail: 'This significantly limits available margin.',
      field: 'totalPercentageFees',
      value: roundTo2Decimals(decimalToPercentage(outcomeData.totalPercentageFeesDecimal)),
    });
  }

  // --- No Selling Price ---
  if (sellingPrice <= 0) {
    warnings.push({
      type: 'missing-price',
      severity: 'error',
      message: 'No selling price has been entered.',
      field: 'sellingPrice',
    });
  }

  // --- Unrealistic Return Rate ---
  if (product.returnRatePercent > 50) {
    warnings.push({
      type: 'high-return-rate',
      severity: 'warning',
      message: `Return rate of ${product.returnRatePercent}% is unusually high.`,
      detail: 'Typical return rates are 2-10%.',
      field: 'returnRatePercent',
      value: product.returnRatePercent,
    });
  }

  // --- Unrealistic Damage Rate ---
  if (product.damageRatePercent > 30) {
    warnings.push({
      type: 'high-damage-rate',
      severity: 'warning',
      message: `Damage rate of ${product.damageRatePercent}% is unusually high.`,
      detail: 'Typical damage rates are 0.5-5%.',
      field: 'damageRatePercent',
      value: product.damageRatePercent,
    });
  }

  return warnings;
}

// ============================================================
// Impossible-State Handling
// ============================================================

/**
 * Check if the combined fees and margin target make pricing
 * mathematically impossible.
 *
 * If totalPercentageFees + marginTarget >= 1 (100% of revenue),
 * then the denominator in the break-even formula becomes 0 or negative,
 * meaning no price can satisfy the constraints.
 */
function isPricingImpossible(
  totalPercentageFeesDecimal: number,
  marginTargetPercent: number
): boolean {
  const marginTargetDecimal = percentageToDecimal(marginTargetPercent);
  const denominator = safeSub(1, safeAdd(totalPercentageFeesDecimal, marginTargetDecimal));
  return denominator <= 0;
}

// ============================================================
// CANONICAL: calculateOutcomeAtPrice
// ============================================================

/**
 * THE SINGLE AUTHORITY for evaluating a price.
 *
 * Given a product, a selling price, business settings, and optionally
 * a resolved pricing policy, this function computes the complete
 * PriceOutcome — every financial metric from taxes to profit to
 * confidence assessment.
 *
 * No other function may compute margin, tax, fee, or profit formulas.
 * All other modules must call this function or derive values from
 * its output.
 *
 * @param product - The product being priced
 * @param sellingPrice - The selling price to evaluate
 * @param businessSettings - Business-wide settings and defaults
 * @param effectiveRule - Optional resolved pricing policy (with source tracing)
 * @returns PriceOutcome — complete financial analysis
 */
export function calculateOutcomeAtPrice({
  product,
  sellingPrice,
  businessSettings,
  effectiveRule,
}: {
  product: Product;
  sellingPrice: number;
  businessSettings: BusinessSettings;
  effectiveRule?: ResolvedPricingPolicy;
}): PriceOutcome {
  // ========================================
  // Step 1: Purchase-Side Tax
  // ========================================
  const purchaseTax = calculatePurchaseSideTax(product, businessSettings);
  const netPurchaseCost = purchaseTax.netPurchaseCost;
  const recoverableInputTax = purchaseTax.recoverableInputTax;
  const nonRecoverableInputTax = purchaseTax.nonRecoverableInputTax;

  // ========================================
  // Step 2: Selling-Side Tax
  // ========================================
  const sellingTax = calculateSellingTax(sellingPrice, product, businessSettings, effectiveRule);
  const netSalesRevenue = sellingTax.netSalesRevenue;
  const outputTax = sellingTax.outputTax;
  const customerPayableAmount = sellingTax.customerPayableAmount;
  const grossSalesAmount = sellingTax.grossSalesAmount;

  // ========================================
  // Step 3: Cost Calculations
  // ========================================
  // CRITICAL: Purchase cost comes from getPurchaseCost() with NO fallback.
  // If purchase cost is 0, the product is flagged missing-cost.
  const purchaseCost = getPurchaseCost(product);
  const fixedProductCosts = calculateFixedProductCosts(product, businessSettings);
  const expectedReturnCost = calculateExpectedReturnCost(netPurchaseCost, fixedProductCosts, product, businessSettings);
  const expectedDamageCost = calculateExpectedDamageCost(netPurchaseCost, fixedProductCosts, product, businessSettings);
  const customDutyCost = calculateCustomDutyCost(product, businessSettings);
  const totalLandedCost = calculateTotalLandedCost(
    netPurchaseCost, fixedProductCosts, expectedReturnCost, expectedDamageCost,
    customDutyCost, nonRecoverableInputTax
  );

  // ========================================
  // Step 4: Selling Fees
  // ========================================
  const fees = calculateSellingFees(sellingPrice, product, businessSettings, effectiveRule);
  const totalSellingFees = fees.totalSellingFees;

  // ========================================
  // Step 5: Total Cost per Successful Sale
  // ========================================
  // This represents the total effective "cost" that must be covered
  // by the net sales revenue for the sale to be profitable.
  const totalCostPerSuccessfulSale = roundTo2Decimals(safeAdd(totalLandedCost, totalSellingFees));

  // ========================================
  // Step 6: Net Profit
  // ========================================
  // Net Profit = Net sales revenue - total landed cost - total selling fees
  // Note: For tax-inclusive prices, net sales revenue already excludes tax.
  // Non-recoverable input tax is already included in totalLandedCost.
  const netProfit = calculateNetProfit(netSalesRevenue, totalLandedCost, totalSellingFees);

  // ========================================
  // Step 7: Margin & Markup
  // ========================================
  // Effective Margin = netProfit / netSalesRevenue × 100
  // MUST use net sales revenue (excluding tax for inclusive pricing)
  const effectiveMarginPercent = calculateEffectiveMarginPercent(netProfit, netSalesRevenue);

  // Markup = netProfit / totalCostPerSuccessfulSale × 100
  const markupPercent = calculateMarkupPercent(netProfit, totalCostPerSuccessfulSale);

  // ========================================
  // Step 8: Impossible-State Check
  // ========================================
  const minMargin = effectiveRule?.minimumMarginPercent ?? businessSettings.defaultMinimumMarginPercent;
  const totalPercentageFeesDecimal = calculateTotalPercentageFeesDecimal(product, businessSettings, effectiveRule);
  const impossibleState = isPricingImpossible(totalPercentageFeesDecimal, minMargin);

  // ========================================
  // Step 9: Boolean Flags
  // ========================================
  const isProfitable = netProfit > 0;
  const isBreakEven = Math.abs(netProfit) < 0.01; // Within 1 cent of zero

  // Satisfies minimum margin?
  const satisfiesMinimumMargin = effectiveMarginPercent >= minMargin;

  // Satisfies target margin?
  const targetMargin = effectiveRule?.targetMarginPercent ?? businessSettings.defaultTargetMarginPercent;
  const satisfiesTargetMargin = effectiveMarginPercent >= targetMargin;

  // Satisfies minimum profit per unit?
  const minimumProfit = effectiveRule?.minimumProfitPerUnit ?? businessSettings.minimumProfitPerUnit ?? 0;
  const satisfiesMinimumProfit = netProfit >= minimumProfit;

  // ========================================
  // Step 10: Warnings & Confidence
  // ========================================
  const warnings = generatePricingWarnings(product, sellingPrice, businessSettings, {
    netProfit,
    effectiveMarginPercent,
    totalPercentageFeesDecimal,
    isImpossible: impossibleState,
    effectiveRule,
  });

  const confidence = assessConfidence(product, businessSettings, warnings);

  // ========================================
  // Step 11: Build PriceOutcome
  // ========================================
  return {
    enteredSellingPrice: roundTo2Decimals(sellingPrice),
    customerPayableAmount,
    grossSalesAmount,
    netSalesRevenue,
    outputTax,
    grossPurchaseCost: roundTo2Decimals(purchaseCost),
    netPurchaseCost: roundTo2Decimals(netPurchaseCost),
    recoverableInputTax,
    nonRecoverableInputTax,
    purchaseCost: roundTo2Decimals(purchaseCost),
    fixedProductCosts,
    expectedReturnCost,
    expectedDamageCost,
    customDutyCost: roundTo2Decimals(customDutyCost),
    totalLandedCost,
    marketplacePercentageFee: fees.marketplacePercentageFee,
    marketplaceFixedFee: fees.marketplaceFixedFee,
    paymentPercentageFee: fees.paymentPercentageFee,
    paymentFixedFee: fees.paymentFixedFee,
    otherPercentageFees: fees.otherPercentageFees,
    otherFixedFees: fees.otherFixedFees,
    totalSellingFees,
    totalCostPerSuccessfulSale,
    netProfit,
    effectiveMarginPercent,
    markupPercent,
    isProfitable,
    isBreakEven,
    satisfiesMinimumMargin,
    satisfiesTargetMargin,
    satisfiesMinimumProfit,
    warnings,
    confidence,
  };
}

// ============================================================
// Break-Even & Safe Price Calculations
// ============================================================

/**
 * Calculate the break-even price (0% margin).
 *
 * Formula:
 *   breakEvenPrice = (totalLandedCost + fixedFees) /
 *                    (1 - totalPercentageFees)
 *
 * Where totalPercentageFees is as a decimal fraction.
 * For tax-exclusive, output tax is included in percentage fees.
 */
export function calculateBreakEvenPriceFromOutcome(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule?: ResolvedPricingPolicy
): number {
  // We need total landed cost with 0 selling price to get base costs
  const zeroOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: 0,
    businessSettings,
    effectiveRule,
  });

  const totalLandedCost = zeroOutcome.totalLandedCost;
  const fixedFees = safeSum([
    zeroOutcome.marketplaceFixedFee,
    zeroOutcome.paymentFixedFee,
    zeroOutcome.otherFixedFees,
  ]);

  const totalPercentageFeesDecimal = calculateTotalPercentageFeesDecimal(product, businessSettings, effectiveRule);

  const denominator = safeSub(1, totalPercentageFeesDecimal);

  if (denominator <= 0) {
    // Impossible state — fees exceed 100% of revenue
    // Return 0 to indicate impossible; structured result will capture this
    return 0;
  }

  const numerator = safeAdd(totalLandedCost, fixedFees);
  return roundTo2Decimals(safeDiv(numerator, denominator));
}

/**
 * Calculate the minimum safe price that satisfies:
 * 1. Minimum margin target
 * 2. Minimum profit per unit
 * 3. Be above break-even
 *
 * Formula:
 *   priceForMargin = (totalLandedCost + fixedFees) /
 *                    (1 - totalPercentageFees - minimumMarginDecimal)
 *
 *   priceForMinProfit = totalLandedCost + totalSellingFees + minimumProfitPerUnit
 *   (This is simpler but must also account for percentage fees on the selling price)
 *
 *   minimumSafePrice = max(priceForMargin, priceForMinProfit, breakEvenPrice)
 *
 * If impossible state, returns 0 (structured result captures impossibility).
 */
export function calculateMinimumSafePrice(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule?: ResolvedPricingPolicy
): number {
  const minMargin = effectiveRule?.minimumMarginPercent ?? businessSettings.defaultMinimumMarginPercent;
  const minimumProfit = effectiveRule?.minimumProfitPerUnit ?? businessSettings.minimumProfitPerUnit ?? 0;

  // Get base costs using a zero-price evaluation
  const zeroOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: 0,
    businessSettings,
    effectiveRule,
  });

  const totalLandedCost = zeroOutcome.totalLandedCost;
  const fixedFees = safeSum([
    zeroOutcome.marketplaceFixedFee,
    zeroOutcome.paymentFixedFee,
    zeroOutcome.otherFixedFees,
  ]);

  const totalPercentageFeesDecimal = calculateTotalPercentageFeesDecimal(product, businessSettings, effectiveRule);
  const minMarginDecimal = percentageToDecimal(minMargin);

  // --- Price for minimum margin ---
  const marginDenominator = safeSub(1, safeAdd(totalPercentageFeesDecimal, minMarginDecimal));

  if (marginDenominator <= 0) {
    // Impossible state
    return 0;
  }

  const priceForMargin = roundTo2Decimals(safeDiv(safeAdd(totalLandedCost, fixedFees), marginDenominator));

  // --- Break-even price (0% margin) ---
  const breakEvenDenominator = safeSub(1, totalPercentageFeesDecimal);
  const breakEvenPrice = breakEvenDenominator > 0
    ? roundTo2Decimals(safeDiv(safeAdd(totalLandedCost, fixedFees), breakEvenDenominator))
    : 0;

  // --- Price for minimum profit per unit ---
  // We need to find the price where netProfit >= minimumProfit
  // netProfit = netSalesRevenue - totalLandedCost - totalSellingFees
  // For tax-inclusive: netSalesRevenue = price / (1 + taxRate)
  // For tax-exclusive: netSalesRevenue = price
  //
  // We also need percentage fees on the selling price.
  // Simplification: iterate to find the price, or use algebraic approach.
  //
  // Algebraic approach (tax-inclusive):
  //   netRevenue = P / (1+t)
  //   percentageFees = P * totalPercentFeesDecimal
  //   netProfit = P / (1+t) - totalLandedCost - P * totalPercentFeesDecimal - fixedFees
  //   netProfit = P * (1/(1+t) - totalPercentFeesDecimal) - totalLandedCost - fixedFees
  //   P * (1/(1+t) - totalPercentFeesDecimal) = totalLandedCost + fixedFees + minimumProfit
  //   P = (totalLandedCost + fixedFees + minimumProfit) / (1/(1+t) - totalPercentFeesDecimal)
  //
  // For tax-exclusive:
  //   netRevenue = P
  //   percentageFees = P * totalPercentFeesDecimal (which includes tax)
  //   netProfit = P - totalLandedCost - P * totalPercentFeesDecimal - fixedFees
  //   P * (1 - totalPercentFeesDecimal) = totalLandedCost + fixedFees + minimumProfit
  //   P = (totalLandedCost + fixedFees + minimumProfit) / (1 - totalPercentFeesDecimal)

  const taxTreatment = product.taxTreatment ?? businessSettings.taxTreatment;
  const taxRatePercent = safeNumber(product.taxRatePercent, businessSettings.defaultTaxRatePercent);
  const taxDecimal = percentageToDecimal(taxRatePercent);

  let priceForMinProfit: number;

  if (taxTreatment === 'inclusive' || taxTreatment === 'composite') {
    // Tax-inclusive: netRevenue = P / (1+t)
    // Effective revenue factor = 1/(1+t) - totalPercentFees
    const revenueFactor = safeSub(safeDiv(1, safeAdd(1, taxDecimal)), totalPercentageFeesDecimal);

    if (revenueFactor <= 0) {
      // Impossible
      priceForMinProfit = 0;
    } else {
      priceForMinProfit = roundTo2Decimals(
        safeDiv(safeAdd(totalLandedCost, safeAdd(fixedFees, minimumProfit)), revenueFactor)
      );
    }
  } else if (taxTreatment === 'exclusive' || taxTreatment === 'reverse') {
    // Tax-exclusive: netRevenue = P
    // P * (1 - totalPercentFees) = totalLandedCost + fixedFees + minimumProfit
    const exclDenominator = safeSub(1, totalPercentageFeesDecimal);

    if (exclDenominator <= 0) {
      priceForMinProfit = 0;
    } else {
      priceForMinProfit = roundTo2Decimals(
        safeDiv(safeAdd(totalLandedCost, safeAdd(fixedFees, minimumProfit)), exclDenominator)
      );
    }
  } else {
    // Tax-exempt: same as exclusive but no tax in fees
    const exemptDenominator = safeSub(1, totalPercentageFeesDecimal);

    if (exemptDenominator <= 0) {
      priceForMinProfit = 0;
    } else {
      priceForMinProfit = roundTo2Decimals(
        safeDiv(safeAdd(totalLandedCost, safeAdd(fixedFees, minimumProfit)), exemptDenominator)
      );
    }
  }

  // Minimum safe price is the maximum of all three constraints
  const minimumSafe = Math.max(priceForMargin, priceForMinProfit, breakEvenPrice);

  // If purchase cost is missing, no trusted recommendation
  if (!hasPurchaseCost(product)) {
    return 0;
  }

  return minimumSafe;
}

// ============================================================
// Rounding Revalidation
// ============================================================

/**
 * Apply a rounding rule to a recommended price, then REVALIDATE
 * the rounded price through calculateOutcomeAtPrice() to verify
 * it still satisfies minimum constraints.
 *
 * If the rounded price makes a safe recommendation unsafe,
 * move upward to the next valid rounded price.
 *
 * This is critical because rounding down (e.g., nearest-5 rounding
 * of 103 → 100) can reduce margin below the minimum threshold.
 */
export function applyRoundingWithRevalidation(
  rawPrice: number,
  roundingRule: RoundingRule,
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule?: ResolvedPricingPolicy,
  customRoundingValue?: number,
  maxIterations: number = 100
): number {
  if (rawPrice <= 0) return rawPrice;
  if (roundingRule === 'no-rounding') return roundTo2Decimals(rawPrice);

  // Apply the rounding rule to get the initial rounded price
  let roundedPrice = applyRoundingRuleInternal(rawPrice, roundingRule, customRoundingValue);

  // Revalidate: check if the rounded price still satisfies all constraints
  const outcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: roundedPrice,
    businessSettings,
    effectiveRule,
  });

  if (outcome.satisfiesMinimumMargin && outcome.satisfiesMinimumProfit && outcome.isProfitable) {
    // Rounded price is valid
    return roundTo2Decimals(roundedPrice);
  }

  // The rounded price is unsafe. Move upward to the next valid rounded price.
  // We increment by the rounding step until we find a price that satisfies constraints.
  const roundingStep = getRoundingStep(roundingRule, customRoundingValue);

  for (let i = 0; i < maxIterations; i++) {
    roundedPrice = roundTo2Decimals(safeAdd(roundedPrice, roundingStep));

    const revalidatedOutcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: roundedPrice,
      businessSettings,
      effectiveRule,
    });

    if (revalidatedOutcome.satisfiesMinimumMargin && revalidatedOutcome.satisfiesMinimumProfit && revalidatedOutcome.isProfitable) {
      return roundTo2Decimals(roundedPrice);
    }
  }

  // If we couldn't find a valid rounded price within maxIterations,
  // return the unrounded price as a fallback
  return roundTo2Decimals(rawPrice);
}

/**
 * Get the increment step for a rounding rule.
 * Used for revalidation upward movement.
 */
function getRoundingStep(roundingRule: RoundingRule, customValue?: number): number {
  switch (roundingRule) {
    case 'nearest-whole': return 1;
    case 'nearest-5': return 5;
    case 'nearest-10': return 10;
    case 'end-in-99': return 1;    // Next .99 price
    case 'end-in-95': return 1;    // Next .95 price
    case 'end-in-9': return 1;     // Next .9 price
    case 'end-in-49': return 1;    // Next .49 price
    case 'end-in-99-whole': return 1; // Next whole-99 price
    case 'custom':
      const step = safeNumber(customValue, 1);
      return step > 0 ? step : 1;
    default: return 1;
  }
}

/**
 * Apply a rounding rule to a price (internal implementation).
 * Same logic as in calculations.ts but duplicated here to keep
 * the engine self-contained and as the SINGLE AUTHORITY.
 */
function applyRoundingRuleInternal(
  price: number,
  roundingRule: RoundingRule,
  customValue?: number
): number {
  if (price <= 0) return price;

  switch (roundingRule) {
    case 'no-rounding':
      return roundTo2Decimals(price);

    case 'nearest-whole':
      return Math.round(price);

    case 'nearest-5':
      return Math.round(price / 5) * 5;

    case 'nearest-10':
      return Math.round(price / 10) * 10;

    case 'end-in-99':
      // e.g., 500 → 499.99
      return Math.floor(price) + 0.99;

    case 'end-in-95':
      return Math.floor(price) + 0.95;

    case 'end-in-9':
      return Math.floor(price) + 0.9;

    case 'end-in-49':
      return Math.floor(price) + 0.49;

    case 'end-in-99-whole':
      // e.g., 500 → 499
      const flooredWhole = Math.floor(price);
      // We want the nearest whole number ending in 99
      // Find the nearest number ending in 99
      const candidateDown = Math.floor(price / 100) * 100 + 99;
      const candidateUp = Math.ceil(price / 100) * 100 - 1;
      if (candidateDown >= 99 && Math.abs(candidateDown - price) <= Math.abs(candidateUp - price)) {
        return candidateDown;
      }
      return candidateUp >= 99 ? candidateUp : 99;

    case 'custom':
      const custom = safeNumber(customValue, 1);
      if (custom <= 0) return roundTo2Decimals(price);
      return Math.round(price / custom) * custom;

    default:
      return roundTo2Decimals(price);
  }
}

// ============================================================
// Convenience: Full Recommendation Calculation
// ============================================================

/**
 * Calculate all recommended prices for a product using the canonical engine.
 *
 * Returns prices for each recommendation mode, all rounded with
 * revalidation to ensure they satisfy minimum constraints.
 */
export function calculateRecommendedPricesFromEngine(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy
): {
  minimum: number;
  competitive: number;
  balanced: number;
  premium: number;
} {
  const roundingRule = effectiveRule.roundingRule;

  // Minimum safe price (satisfies min margin + min profit + break-even)
  const rawMinimum = calculateMinimumSafePrice(product, businessSettings, effectiveRule);
  const minimum = applyRoundingWithRevalidation(
    rawMinimum, roundingRule, product, businessSettings, effectiveRule
  );

  // Balanced price (target margin)
  const rawBalanced = calculatePriceForMargin(
    product, businessSettings, effectiveRule, effectiveRule.targetMarginPercent
  );
  const balanced = applyRoundingWithRevalidation(
    rawBalanced, roundingRule, product, businessSettings, effectiveRule
  );

  // Premium price (premium margin)
  const rawPremium = calculatePriceForMargin(
    product, businessSettings, effectiveRule, effectiveRule.premiumMarginPercent
  );
  const premium = applyRoundingWithRevalidation(
    rawPremium, roundingRule, product, businessSettings, effectiveRule
  );

  // Competitive price (competitor-aligned)
  const competitive = calculateCompetitivePriceFromEngine(
    product, businessSettings, effectiveRule, minimum
  );

  return {
    minimum,
    competitive,
    balanced,
    premium,
  };
}

/**
 * Calculate the price needed to achieve a specific margin target.
 *
 * Formula:
 *   price = (totalLandedCost + fixedFees) /
 *           (1 - totalPercentageFees - marginTargetDecimal)
 *
 * For tax-inclusive:
 *   The margin is on net revenue (excluding tax).
 *   price = (totalLandedCost + fixedFees + minimumProfit) /
 *           (1/(1+taxRate) - totalPercentageFees)
 *   (This assumes percentage fees are on the gross selling price)
 */
function calculatePriceForMargin(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy,
  marginTargetPercent: number
): number {
  const zeroOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: 0,
    businessSettings,
    effectiveRule,
  });

  const totalLandedCost = zeroOutcome.totalLandedCost;
  const fixedFees = safeSum([
    zeroOutcome.marketplaceFixedFee,
    zeroOutcome.paymentFixedFee,
    zeroOutcome.otherFixedFees,
  ]);

  const totalPercentageFeesDecimal = calculateTotalPercentageFeesDecimal(product, businessSettings, effectiveRule);
  const marginDecimal = percentageToDecimal(marginTargetPercent);
  const taxTreatment = product.taxTreatment ?? businessSettings.taxTreatment;
  const taxRatePercent = safeNumber(product.taxRatePercent, businessSettings.defaultTaxRatePercent);
  const taxDecimal = percentageToDecimal(taxRatePercent);

  if (taxTreatment === 'inclusive' || taxTreatment === 'composite') {
    // For tax-inclusive pricing, percentage fees are on the gross price
    // but margin is on net revenue (price / (1 + tax))
    //
    // netRevenue = P / (1+t)
    // percentageFeesOnGross = P * totalPercentFees
    // netProfit = P / (1+t) - totalLandedCost - P * totalPercentFees - fixedFees
    //
    // We want margin = netProfit / netRevenue = marginTarget
    // So: netProfit = netRevenue * marginTarget
    // P / (1+t) * marginTarget = P / (1+t) - totalLandedCost - P * totalPercentFees - fixedFees
    // P * (marginTarget/(1+t) + totalPercentFees) = P/(1+t) - totalLandedCost - fixedFees
    // Wait, let me redo this algebra...
    //
    // netProfit = netRevenue - totalLandedCost - totalSellingFees
    // netRevenue = P / (1+t)
    // percentageFees = P * totalPercentFees (on gross selling price)
    // netProfit = P/(1+t) - totalLandedCost - P*totalPercentFees - fixedFees
    //
    // margin = netProfit / netRevenue = marginTarget
    // netProfit = marginTarget * netRevenue = marginTarget * P/(1+t)
    //
    // So: marginTarget * P/(1+t) = P/(1+t) - totalLandedCost - P*totalPercentFees - fixedFees
    // P/(1+t) - marginTarget*P/(1+t) = totalLandedCost + P*totalPercentFees + fixedFees
    // P*(1/(1+t))*(1 - marginTarget) = totalLandedCost + P*totalPercentFees + fixedFees
    //
    // This has P on both sides, so we rearrange:
    // P*(1/(1+t))*(1 - marginTarget) - P*totalPercentFees = totalLandedCost + fixedFees
    // P * [ (1/(1+t))*(1 - marginTarget) - totalPercentFees ] = totalLandedCost + fixedFees
    //
    // P = (totalLandedCost + fixedFees) / [ (1/(1+t))*(1 - marginTarget) - totalPercentFees ]

    const revenueFactor = safeSub(
      safeMul(safeDiv(1, safeAdd(1, taxDecimal)), safeSub(1, marginDecimal)),
      totalPercentageFeesDecimal
    );

    if (revenueFactor <= 0) {
      return 0; // Impossible state
    }

    return roundTo2Decimals(safeDiv(safeAdd(totalLandedCost, fixedFees), revenueFactor));
  } else {
    // For tax-exclusive/exempt, simpler formula:
    // price = (totalLandedCost + fixedFees) / (1 - totalPercentageFees - marginTarget)
    const denominator = safeSub(1, safeAdd(totalPercentageFeesDecimal, marginDecimal));

    if (denominator <= 0) {
      return 0; // Impossible state
    }

    return roundTo2Decimals(safeDiv(safeAdd(totalLandedCost, fixedFees), denominator));
  }
}

/**
 * Calculate a competitive price aligned with competitor data.
 * Falls back to balanced price if no competitor data available.
 */
function calculateCompetitivePriceFromEngine(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy,
  minimumSafePrice: number
): number {
  const roundingRule = effectiveRule.roundingRule;
  const competitorPrices = product.competitorPrices ?? [];
  const validCompetitorPrices = competitorPrices.filter(cp => cp.price > 0);

  if (validCompetitorPrices.length === 0) {
    // No competitor data — fall back to balanced price
    const rawBalanced = calculatePriceForMargin(
      product, businessSettings, effectiveRule, effectiveRule.targetMarginPercent
    );
    return applyRoundingWithRevalidation(
      rawBalanced, roundingRule, product, businessSettings, effectiveRule
    );
  }

  const competitorAvg = roundTo2Decimals(
    safeDiv(validCompetitorPrices.reduce((sum, cp) => safeAdd(sum, cp.price), 0), validCompetitorPrices.length)
  );

  // Competitive price = competitor average, but never below minimum safe
  let competitivePrice = Math.max(competitorAvg, minimumSafePrice);

  return applyRoundingWithRevalidation(
    competitivePrice, roundingRule, product, businessSettings, effectiveRule
  );
}
