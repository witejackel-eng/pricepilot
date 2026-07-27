/**
 * PricePilot - Pricing Calculation Engine
 *
 * Core calculation engine for all pricing, margin, markup, and
 * recommendation computations. Uses decimal-safe arithmetic
 * (Math.round with scaling) to avoid floating point errors.
 *
 * CRITICAL: Break-even price accounts for percentage fees being
 * charged on the selling price. Formula:
 *   breakEvenPrice = (totalLandedCost + fixedTransactionFee) /
 *                    (1 - totalPercentageFees - marginTarget)
 *
 * Percentage fees are ON the selling price, so you cannot simply
 * add margin to cost. The denominator shrinks the effective revenue.
 */

import {
  Product,
  BusinessSettings,
  PricingRule,
  PricingStatus,
  ProfitabilityMeter,
  RoundingRule,
  RecommendationMode,
  Warning,
  WarningSeverity,
  RecommendedPrices,
  CompetitorStrategy,
} from './types';
import { roundTo2Decimals, roundTo4Decimals } from './formatting';

// ============================================================
// Decimal-Safe Arithmetic Helpers
// ============================================================

/**
 * Safely add two numbers with decimal precision.
 * Avoids floating point errors by scaling, rounding, then unscaling.
 */
function safeAdd(a: number, b: number): number {
  return roundTo4Decimals(a + b);
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
  if (Math.abs(divisor) < 0.0001) return 0;
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
function safeNonNegative(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || value < 0) return 0;
  return value;
}

/**
 * Get a number value or fallback to default. Handles undefined, NaN, null.
 */
function safeNumber(value: number | undefined | null, fallback: number): number {
  if (value === undefined || value === null || typeof value !== 'number' || isNaN(value)) return fallback;
  return value;
}

// ============================================================
// Cost Calculations
// ============================================================

/**
 * Calculate the base cost of a product (sum of all per-unit cost components).
 * Includes: purchase cost, shipping, packaging, handling, other costs,
 * and freight (as % of purchase cost).
 *
 * Does NOT include return/damage costs or custom duty.
 */
export function calculateBaseCost(
  product: Partial<Product>,
  settings: BusinessSettings
): number {
  const purchaseCost = safeNonNegative(safeNumber(product.purchaseCost, settings.defaultShippingCost || 0));
  const shippingCost = safeNonNegative(safeNumber(product.shippingCost, settings.defaultShippingCost));
  const packagingCost = safeNonNegative(safeNumber(product.packagingCost, settings.defaultPackagingCost));
  const handlingCost = safeNonNegative(safeNumber(product.handlingCost, settings.defaultHandlingCost));
  const otherCosts = safeNonNegative(safeNumber(product.otherCosts, settings.defaultOtherCosts));
  const freightPercent = safeNonNegative(safeNumber(product.freightPercent, settings.defaultFreightPercent));

  // Freight as a percentage of purchase cost
  const freightCost = safeMul(purchaseCost, safeDiv(freightPercent, 100));

  return roundTo2Decimals(
    safeAdd(purchaseCost, safeAdd(shippingCost, safeAdd(packagingCost, safeAdd(handlingCost, safeAdd(otherCosts, freightCost)))))
  );
}

/**
 * Calculate the expected return cost.
 * Return rate means some units will be returned, and the cost of those
 * returned units is spread across all sold units.
 *
 * Formula: baseCost * (returnRate / 100)
 * This represents the additional per-unit cost burden due to returns.
 */
export function calculateExpectedReturnCost(
  product: Partial<Product>,
  settings: BusinessSettings
): number {
  const baseCost = calculateBaseCost(product, settings);
  const returnRatePercent = safeNonNegative(
    safeNumber(product.returnRatePercent, settings.defaultReturnRatePercent)
  );
  // Protect against unrealistic return rates
  const cappedRate = clamp(returnRatePercent, 0, 100);

  return roundTo2Decimals(safeMul(baseCost, safeDiv(cappedRate, 100)));
}

/**
 * Calculate the expected damage cost.
 * Damaged units cannot be resold; their cost is spread across all sold units.
 *
 * Formula: (baseCost + shippingCost) * (damageRate / 100)
 * We include shipping because damaged items still incur inbound shipping costs.
 */
export function calculateExpectedDamageCost(
  product: Partial<Product>,
  settings: BusinessSettings
): number {
  const baseCost = calculateBaseCost(product, settings);
  const damageRatePercent = safeNonNegative(
    safeNumber(product.damageRatePercent, settings.defaultDamageRatePercent)
  );
  // Protect against unrealistic damage rates
  const cappedRate = clamp(damageRatePercent, 0, 100);

  return roundTo2Decimals(safeMul(baseCost, safeDiv(cappedRate, 100)));
}

/**
 * Calculate the total landed cost per unit.
 * This is the complete cost per unit including all direct and indirect costs.
 *
 * Formula: baseCost + returnCost + damageCost + customDuty
 * Custom duty is applied as a percentage of purchase cost.
 */
export function calculateTotalLandedCost(
  product: Partial<Product>,
  settings: BusinessSettings
): number {
  const baseCost = calculateBaseCost(product, settings);
  const returnCost = calculateExpectedReturnCost(product, settings);
  const damageCost = calculateExpectedDamageCost(product, settings);

  const purchaseCost = safeNonNegative(safeNumber(product.purchaseCost, 0));
  const customDutyPercent = safeNonNegative(
    safeNumber(product.customDutyPercent, settings.defaultCustomDutyPercent)
  );
  const cappedDuty = clamp(customDutyPercent, 0, 100);
  const customDutyCost = safeMul(purchaseCost, safeDiv(cappedDuty, 100));

  return roundTo2Decimals(
    safeAdd(baseCost, safeAdd(returnCost, safeAdd(damageCost, customDutyCost)))
  );
}

// ============================================================
// Fee Calculations
// ============================================================

/**
 * Calculate all percentage-based fees that are charged on the selling price.
 * These fees reduce the effective revenue and must be accounted for
 * in the break-even calculation.
 *
 * Returns the total percentage as a decimal fraction (e.g., 0.18 for 18%).
 */
export function calculatePercentageFees(
  sellingPrice: number,
  product: Partial<Product>,
  settings: BusinessSettings,
  rule?: PricingRule
): number {
  // Marketplace fee %
  const marketplaceFeePercent = safeNonNegative(
    rule?.overrideMarketplaceFeePercent ?? 
    safeNumber(product.marketplaceFeePercent, settings.defaultMarketplaceFeePercent)
  );

  // Payment fee %
  const paymentFeePercent = safeNonNegative(
    rule?.overridePaymentFeePercent ?? 
    safeNumber(product.paymentFeePercent, settings.defaultPaymentFeePercent)
  );

  // Other fees %
  const otherFeesPercent = safeNonNegative(safeNumber(product.otherFeesPercent, 0));

  // Tax (if exclusive, it's charged on selling price as a percentage)
  const taxRatePercent = safeNonNegative(
    rule?.overrideTaxRatePercent ?? 
    safeNumber(product.taxRatePercent, settings.defaultTaxRatePercent)
  );
  const taxTreatment = product.taxTreatment ?? settings.taxTreatment;

  // Tax is a percentage fee ONLY if treatment is 'exclusive'
  // (inclusive means tax is already in the selling price, not an additional charge)
  const taxAsFeePercent = taxTreatment === 'exclusive' ? taxRatePercent : 0;

  // Sum all percentage fees
  const totalPercent = safeAdd(
    marketplaceFeePercent,
    safeAdd(paymentFeePercent, safeAdd(otherFeesPercent, taxAsFeePercent))
  );

  // Protect: total percentage fees must not exceed 100%
  const cappedTotal = clamp(totalPercent, 0, 100);

  // Convert to decimal fraction
  return safeDiv(cappedTotal, 100);
}

/**
 * Calculate total fixed (per-transaction) fees.
 * These are charged regardless of selling price.
 */
export function calculateFixedFees(
  product: Partial<Product>,
  settings: BusinessSettings
): number {
  const marketplaceFeeFixed = safeNonNegative(
    safeNumber(product.marketplaceFeeFixed, settings.defaultMarketplaceFeeFixed)
  );
  const paymentFeeFixed = safeNonNegative(
    safeNumber(product.paymentFeeFixed, settings.defaultPaymentFeeFixed)
  );
  const otherFeesFixed = safeNonNegative(safeNumber(product.otherFeesFixed, 0));

  return roundTo2Decimals(
    safeAdd(marketplaceFeeFixed, safeAdd(paymentFeeFixed, otherFeesFixed))
  );
}

// ============================================================
// Break-Even Price
// ============================================================

/**
 * Calculate the break-even selling price.
 *
 * CRITICAL: Percentage fees are charged on the selling price, so we
 * cannot simply add margin to cost. We must solve for the selling price
 * where revenue after all fees equals total cost + desired margin.
 *
 * Formula:
 *   breakEvenPrice = (totalLandedCost + fixedFees) /
 *                    (1 - totalPercentageFees - marginTarget)
 *
 * Where:
 *   - totalLandedCost = full per-unit cost
 *   - fixedFees = per-transaction fixed fees
 *   - totalPercentageFees = sum of all % fees (as decimal)
 *   - marginTarget = desired margin (as decimal)
 *
 * This ensures that after deducting percentage fees from the selling price,
 * the remaining revenue covers both costs and the target margin.
 *
 * Without margin target (pure break-even), marginTarget = 0.
 */
export function calculateBreakEvenPrice(
  product: Partial<Product>,
  settings: BusinessSettings,
  rule?: PricingRule,
  marginTargetPercent?: number
): number {
  const totalLandedCost = calculateTotalLandedCost(product, settings);
  const fixedFees = calculateFixedFees(product, settings);

  // Total percentage fees as a decimal fraction
  // We pass 0 as sellingPrice for break-even (percentage fees don't depend on price amount)
  const totalPercentFees = calculatePercentageFees(0, product, settings, rule);

  // Margin target as decimal fraction
  const resolvedRule = rule ?? resolveRuleForProduct(product, []);
  const effectiveMarginTarget = safeNumber(
    marginTargetPercent,
    safeNumber(resolvedRule.minimumMarginPercent, settings.defaultMinimumMarginPercent)
  );
  const marginTargetDecimal = safeDiv(clamp(effectiveMarginTarget, 0, 99.9), 100);

  // Validate: denominator must be positive
  // (1 - percentageFees - marginTarget) must be > 0
  const denominator = safeSub(1, safeAdd(totalPercentFees, marginTargetDecimal));
  
  if (denominator <= 0) {
    // Fees + margin exceed 100% — impossible to break even
    // Return 0 to indicate impossibility; structured result will capture this
    return 0;
  }

  const numerator = safeAdd(totalLandedCost, fixedFees);
  const breakEvenPrice = safeDiv(numerator, denominator);

  return roundTo2Decimals(Math.max(breakEvenPrice, 0));
}

// ============================================================
// Markup & Margin
// ============================================================

/**
 * Calculate markup percentage.
 * Markup = (sellingPrice - cost) / cost * 100
 *
 * @returns Markup percentage (e.g., 33.33 for 33.33% markup)
 */
export function calculateMarkup(cost: number, sellingPrice: number): number {
  const safeCost = safeNonNegative(cost);
  const safePrice = safeNonNegative(sellingPrice);

  if (safeCost === 0) {
    // If cost is 0 and price is positive, markup is effectively infinite
    // We return 0 to avoid division by zero; this edge case should generate a warning
    return safePrice > 0 ? 999999 : 0;
  }

  const markup = safeDiv(safeSub(safePrice, safeCost), safeCost) * 100;
  return roundTo2Decimals(markup);
}

/**
 * Calculate margin percentage.
 * Margin = (sellingPrice - cost) / sellingPrice * 100
 *
 * @returns Margin percentage (e.g., 25 for 25% margin)
 */
export function calculateMargin(cost: number, sellingPrice: number): number {
  const safeCost = safeNonNegative(cost);
  const safePrice = safeNonNegative(sellingPrice);

  if (safePrice === 0) return 0; // No selling price = 0% margin

  // For margin calculation, "cost" here means total landed cost
  // plus fixed fees, because those are deductions from revenue
  const margin = safeDiv(safeSub(safePrice, safeCost), safePrice) * 100;
  return roundTo2Decimals(margin);
}

/**
 * Calculate effective margin accounting for percentage fees.
 * This is the TRUE margin after all percentage-based fees are deducted.
 *
 * effectiveMargin = (sellingPrice - totalLandedCost - fixedFees - percentageFeesOnSellingPrice) / sellingPrice * 100
 */
export function calculateEffectiveMargin(
  product: Partial<Product>,
  settings: BusinessSettings,
  rule?: PricingRule
): number {
  const sellingPrice = safeNonNegative(safeNumber(product.currentSellingPrice, 0));
  if (sellingPrice === 0) return 0;

  const totalLandedCost = calculateTotalLandedCost(product, settings);
  const fixedFees = calculateFixedFees(product, settings);
  const percentFeesDecimal = calculatePercentageFees(sellingPrice, product, settings, rule);
  const percentFeesAmount = safeMul(sellingPrice, percentFeesDecimal);

  const totalDeductions = safeAdd(totalLandedCost, safeAdd(fixedFees, percentFeesAmount));
  const profitPerUnit = safeSub(sellingPrice, totalDeductions);
  const effectiveMargin = safeDiv(profitPerUnit, sellingPrice) * 100;

  return roundTo2Decimals(effectiveMargin);
}

/**
 * Calculate profit per unit.
 */
export function calculateProfitPerUnit(
  product: Partial<Product>,
  settings: BusinessSettings,
  rule?: PricingRule
): number {
  const sellingPrice = safeNonNegative(safeNumber(product.currentSellingPrice, 0));
  const totalLandedCost = calculateTotalLandedCost(product, settings);
  const fixedFees = calculateFixedFees(product, settings);
  const percentFeesDecimal = calculatePercentageFees(sellingPrice, product, settings, rule);
  const percentFeesAmount = safeMul(sellingPrice, percentFeesDecimal);

  const totalDeductions = safeAdd(totalLandedCost, safeAdd(fixedFees, percentFeesAmount));
  return roundTo2Decimals(safeSub(sellingPrice, totalDeductions));
}

// ============================================================
// Recommended Prices
// ============================================================

/**
 * Calculate all four recommended prices for a product.
 *
 * @returns RecommendedPrices object with minimum, competitive, balanced, premium
 */
export function calculateRecommendedPrices(
  product: Partial<Product>,
  settings: BusinessSettings,
  rules: PricingRule[]
): RecommendedPrices {
  const resolvedRule = resolveRuleForProduct(product, rules);

  return {
    breakEven: 0,
    minimum: calculateMinimumSafePrice(product, settings, resolvedRule),
    competitive: calculateCompetitivePrice(product, settings, resolvedRule),
    balanced: calculateBalancedPrice(product, settings, resolvedRule),
    premium: calculatePremiumPrice(product, settings, resolvedRule),
  };
}

/**
 * Minimum Safe Price: The lowest price that covers all costs and fees
 * with the minimum acceptable margin.
 *
 * Formula: (totalLandedCost + fixedFees) / (1 - totalPercentageFees - minimumMargin)
 */
export function calculateMinimumSafePrice(
  product: Partial<Product>,
  settings: BusinessSettings,
  rule?: PricingRule
): number {
  const resolvedRule = rule ?? resolveRuleForProduct(product, []);
  const marginTarget = resolvedRule.minimumMarginPercent ?? settings.defaultMinimumMarginPercent;
  
  const price = calculateBreakEvenPrice(product, settings, resolvedRule, marginTarget);
  return applyRoundingRule(price, resolvedRule.roundingRule ?? settings.defaultRoundingRule, resolvedRule.customRoundingValue);
}

/**
 * Competitive Price: Aligns with competitor pricing while maintaining
 * at least the minimum margin.
 *
 * Strategy depends on the competitorStrategy in the resolved rule.
 * If no competitor data exists, falls back to the balanced price.
 */
export function calculateCompetitivePrice(
  product: Partial<Product>,
  settings: BusinessSettings,
  rule?: PricingRule
): number {
  const resolvedRule = rule ?? resolveRuleForProduct(product, []);
  const strategy = resolvedRule.competitorStrategy ?? { mode: 'match-average', weightPercent: 30 };

  const minimumSafe = calculateBreakEvenPrice(product, settings, resolvedRule, resolvedRule.minimumMarginPercent ?? settings.defaultMinimumMarginPercent);
  const competitorAvg = calculateCompetitorAverage(product);

  // If no competitor data, fall back to balanced price with target margin
  if (competitorAvg === 0) {
    const balanced = calculateBreakEvenPrice(product, settings, resolvedRule, resolvedRule.targetMarginPercent ?? settings.defaultTargetMarginPercent);
    return applyRoundingRule(balanced, resolvedRule.roundingRule ?? settings.defaultRoundingRule, resolvedRule.customRoundingValue);
  }

  let competitivePrice: number;

  switch (strategy.mode) {
    case 'ignore':
      // Ignore competitors; use target margin
      competitivePrice = calculateBreakEvenPrice(product, settings, resolvedRule, resolvedRule.targetMarginPercent ?? settings.defaultTargetMarginPercent);
      break;

    case 'match-average':
      competitivePrice = competitorAvg;
      break;

    case 'below-average':
      competitivePrice = safeMul(competitorAvg, safeSub(1, safeDiv(safeNumber(strategy.offsetPercent ?? 5, 5), 100)));
      break;

    case 'above-average':
      competitivePrice = safeMul(competitorAvg, safeAdd(1, safeDiv(safeNumber(strategy.offsetPercent ?? 5, 5), 100)));
      break;

    case 'match-lowest':
      competitivePrice = calculateCompetitorLowest(product);
      break;

    case 'match-highest':
      competitivePrice = calculateCompetitorHighest(product);
      break;

    case 'custom-offset':
      const offsetPercent = safeNumber(strategy.offsetPercent ?? 0, 0);
      const offsetFixed = safeNumber(strategy.offsetFixed ?? 0, 0);
      competitivePrice = safeAdd(safeMul(competitorAvg, safeAdd(1, safeDiv(offsetPercent, 100))), offsetFixed);
      break;

    default:
      competitivePrice = competitorAvg;
  }

  // NEVER go below minimum safe price
  competitivePrice = Math.max(competitivePrice, minimumSafe);

  // Blend with margin-based price based on weight
  if (strategy.weightPercent !== undefined && strategy.weightPercent > 0 && strategy.weightPercent < 100) {
    const weightDecimal = safeDiv(strategy.weightPercent, 100);
    const marginBasedPrice = calculateBreakEvenPrice(product, settings, resolvedRule, resolvedRule.targetMarginPercent ?? settings.defaultTargetMarginPercent);
    competitivePrice = safeAdd(
      safeMul(competitivePrice, weightDecimal),
      safeMul(marginBasedPrice, safeSub(1, weightDecimal))
    );
    competitivePrice = Math.max(competitivePrice, minimumSafe);
  }

  return applyRoundingRule(
    roundTo2Decimals(competitivePrice),
    resolvedRule.roundingRule ?? settings.defaultRoundingRule,
    resolvedRule.customRoundingValue
  );
}

/**
 * Balanced Price: Balances margin target with market competitiveness.
 * Uses a weighted blend of the margin-based price and competitor average.
 */
export function calculateBalancedPrice(
  product: Partial<Product>,
  settings: BusinessSettings,
  rule?: PricingRule
): number {
  const resolvedRule = rule ?? resolveRuleForProduct(product, []);
  const marginTarget = resolvedRule.targetMarginPercent ?? settings.defaultTargetMarginPercent;
  const minimumSafe = calculateBreakEvenPrice(product, settings, resolvedRule, resolvedRule.minimumMarginPercent ?? settings.defaultMinimumMarginPercent);
  
  // Margin-based price (target margin)
  const marginBasedPrice = calculateBreakEvenPrice(product, settings, resolvedRule, marginTarget);

  // Competitor average
  const competitorAvg = calculateCompetitorAverage(product);

  // If no competitor data, just use margin-based price
  if (competitorAvg === 0) {
    return applyRoundingRule(marginBasedPrice, resolvedRule.roundingRule ?? settings.defaultRoundingRule, resolvedRule.customRoundingValue);
  }

  // Blend: 50% margin-based, 50% competitor (balanced by definition)
  const weightDecimal = 0.5;
  const blended = safeAdd(
    safeMul(marginBasedPrice, weightDecimal),
    safeMul(competitorAvg, safeSub(1, weightDecimal))
  );

  // Never go below minimum safe price
  const finalPrice = Math.max(roundTo2Decimals(blended), minimumSafe);

  return applyRoundingRule(finalPrice, resolvedRule.roundingRule ?? settings.defaultRoundingRule, resolvedRule.customRoundingValue);
}

/**
 * Premium Price: Maximum margin pricing.
 * Uses the maximum margin target, and if competitors exist,
 * may price above the highest competitor.
 */
export function calculatePremiumPrice(
  product: Partial<Product>,
  settings: BusinessSettings,
  rule?: PricingRule
): number {
  const resolvedRule = rule ?? resolveRuleForProduct(product, []);
  const maxMargin = resolvedRule.maximumMarginPercent ?? settings.defaultMaximumMarginPercent;
  const minimumSafe = calculateBreakEvenPrice(product, settings, resolvedRule, resolvedRule.minimumMarginPercent ?? settings.defaultMinimumMarginPercent);

  // Maximum margin-based price
  const maxMarginPrice = calculateBreakEvenPrice(product, settings, resolvedRule, maxMargin);

  // Competitor highest
  const competitorHighest = calculateCompetitorHighest(product);

  // If no competitor data, use max margin price
  if (competitorHighest === 0) {
    return applyRoundingRule(maxMarginPrice, resolvedRule.roundingRule ?? settings.defaultRoundingRule, resolvedRule.customRoundingValue);
  }

  // Premium: average of max-margin price and competitor highest,
  // but never below minimum safe
  const premiumBlend = safeDiv(safeAdd(maxMarginPrice, competitorHighest), 2);
  const finalPrice = Math.max(roundTo2Decimals(premiumBlend), minimumSafe);

  return applyRoundingRule(finalPrice, resolvedRule.roundingRule ?? settings.defaultRoundingRule, resolvedRule.customRoundingValue);
}

// ============================================================
// Competitor Price Helpers
// ============================================================

function calculateCompetitorAverage(product: Partial<Product>): number {
  const prices = product.competitorPrices ?? [];
  if (prices.length === 0) return 0;
  const validPrices = prices.filter(cp => cp.price > 0);
  if (validPrices.length === 0) return 0;
  const sum = validPrices.reduce((acc, cp) => safeAdd(acc, cp.price), 0);
  return roundTo2Decimals(safeDiv(sum, validPrices.length));
}

function calculateCompetitorLowest(product: Partial<Product>): number {
  const prices = product.competitorPrices ?? [];
  if (prices.length === 0) return 0;
  const validPrices = prices.filter(cp => cp.price > 0);
  if (validPrices.length === 0) return 0;
  return Math.min(...validPrices.map(cp => cp.price));
}

function calculateCompetitorHighest(product: Partial<Product>): number {
  const prices = product.competitorPrices ?? [];
  if (prices.length === 0) return 0;
  const validPrices = prices.filter(cp => cp.price > 0);
  if (validPrices.length === 0) return 0;
  return Math.max(...validPrices.map(cp => cp.price));
}

// ============================================================
// Rounding Rules
// ============================================================

/**
 * Apply a rounding rule to a price.
 *
 * Supported rules:
 * - no-rounding: No change
 * - nearest-whole: Round to nearest integer
 * - nearest-5: Round to nearest 5
 * - nearest-10: Round to nearest 10
 * - end-in-99: e.g., 500 → 499.99
 * - end-in-95: e.g., 500 → 499.95
 * - end-in-9: e.g., 500 → 499.9
 * - end-in-49: e.g., 500 → 499.49
 * - end-in-99-whole: e.g., 500 → 499
 * - custom: round to nearest custom value
 */
export function applyRoundingRule(
  price: number,
  roundingRule: RoundingRule,
  customValue?: number
): number {
  if (price <= 0) return price;
  if (roundingRule === 'no-rounding') return roundTo2Decimals(price);

  switch (roundingRule) {
    case 'nearest-whole':
      return Math.round(price);

    case 'nearest-5':
      return Math.round(price / 5) * 5;

    case 'nearest-10':
      return Math.round(price / 10) * 10;

    case 'end-in-99':
      // e.g., 500 → 499.99, 1234 → 1233.99
      return Math.floor(price) - 0.01;

    case 'end-in-95':
      return Math.floor(price) - 0.05;

    case 'end-in-9':
      return Math.floor(price) - 0.1;

    case 'end-in-49':
      return Math.floor(price) - 0.51;

    case 'end-in-99-whole':
      // e.g., 500 → 499, 1234 → 1233
      // Round down to nearest whole, then subtract 1 to end in 99
      // But if already whole, subtract 1
      const flooredWhole = Math.floor(price);
      if (flooredWhole <= 1) return flooredWhole; // Don't go below 1
      return flooredWhole - 1;

    case 'custom':
      const custom = safeNumber(customValue, 1);
      if (custom <= 0) return roundTo2Decimals(price);
      return Math.round(price / custom) * custom;

    default:
      return roundTo2Decimals(price);
  }
}

// ============================================================
// Pricing Status & Profitability Meter
// ============================================================

/**
 * Determine the pricing status for a product based on its
 * current selling price relative to costs, margins, and competitors.
 */
export function calculatePricingStatus(
  product: Partial<Product>,
  settings: BusinessSettings,
  rules: PricingRule[]
): PricingStatus {
  const resolvedRule = resolveRuleForProduct(product, rules);
  const sellingPrice = safeNumber(product.currentSellingPrice, 0);
  const totalLandedCost = calculateTotalLandedCost(product, settings);

  // Check for missing data first
  if (sellingPrice === 0 || totalLandedCost === 0) {
    return 'missing-data';
  }

  const effectiveMargin = calculateEffectiveMargin(product, settings, resolvedRule);
  const profitPerUnit = calculateProfitPerUnit(product, settings, resolvedRule);

  // Loss-making: negative profit
  if (profitPerUnit < 0) {
    return 'loss-making';
  }

  // Below break-even: profit is zero or margin below minimum
  const minimumMargin = resolvedRule.minimumMarginPercent ?? settings.defaultMinimumMarginPercent;
  if (effectiveMargin < minimumMargin) {
    if (effectiveMargin <= 0) return 'below-break-even';
    return 'low-margin';
  }

  // Check competitor pricing
  const competitorAvg = calculateCompetitorAverage(product);
  if (competitorAvg > 0) {
    const aboveMarketThreshold = settings.aboveMarketThresholdPercent;
    const percentAboveMarket = safeDiv(safeSub(sellingPrice, competitorAvg), competitorAvg) * 100;
    if (percentAboveMarket > aboveMarketThreshold) {
      return 'above-market';
    }
  }

  // Healthy margins
  const healthyMin = settings.healthyMarginMinPercent;
  const healthyMax = settings.healthyMarginMaxPercent;
  const strongThreshold = settings.strongMarginThresholdPercent;

  if (effectiveMargin >= strongThreshold) {
    return 'high-margin';
  }
  if (effectiveMargin >= healthyMin && effectiveMargin <= healthyMax) {
    return 'healthy';
  }

  // Low margin (between minimum and healthy minimum)
  return 'low-margin';
}

/**
 * Determine the profitability meter level.
 */
export function calculateProfitabilityMeter(
  product: Partial<Product>,
  settings: BusinessSettings,
  rules: PricingRule[]
): ProfitabilityMeter {
  const resolvedRule = resolveRuleForProduct(product, rules);
  const effectiveMargin = calculateEffectiveMargin(product, settings, resolvedRule);

  if (effectiveMargin < 0) return 'loss';
  if (effectiveMargin === 0) return 'break-even';
  if (effectiveMargin < settings.lowMarginThresholdPercent) return 'low-margin';
  if (effectiveMargin >= settings.strongMarginThresholdPercent) return 'strong-margin';
  return 'healthy';
}

// ============================================================
// Pricing Explanation Generator
// ============================================================

/**
 * Generate a plain-language explanation of a product's pricing situation.
 */
export function generatePricingExplanation(
  product: Partial<Product>,
  settings: BusinessSettings,
  rules: PricingRule[]
): string {
  const resolvedRule = resolveRuleForProduct(product, rules);
  const sellingPrice = safeNumber(product.currentSellingPrice, 0);
  const totalLandedCost = calculateTotalLandedCost(product, settings);
  const effectiveMargin = calculateEffectiveMargin(product, settings, resolvedRule);
  const profitPerUnit = calculateProfitPerUnit(product, settings, resolvedRule);
  const breakEvenPrice = calculateBreakEvenPrice(product, settings, resolvedRule, 0);
  const minimumSafe = calculateMinimumSafePrice(product, settings, resolvedRule);
  const status = calculatePricingStatus(product, settings, rules);
  const competitorAvg = calculateCompetitorAverage(product);
  const productName = product.name ?? product.sku ?? 'this product';

  const lines: string[] = [];

  // Header
  lines.push(`Pricing analysis for "${productName}":`);

  // Cost summary
  lines.push(`Total landed cost per unit: ${formatCostValue(totalLandedCost, settings)}`);

  // Current price assessment
  if (sellingPrice > 0) {
    lines.push(`Current selling price: ${formatCostValue(sellingPrice, settings)}`);
    lines.push(`Effective margin after all fees: ${effectiveMargin.toFixed(1)}%`);
    lines.push(`Profit per unit: ${formatCostValue(profitPerUnit, settings)}`);
  } else {
    lines.push(`No selling price has been set yet.`);
  }

  // Break-even and minimum safe
  lines.push(`Pure break-even price (0% margin): ${formatCostValue(breakEvenPrice, settings)}`);
  lines.push(`Minimum safe price (${resolvedRule.minimumMarginPercent ?? settings.defaultMinimumMarginPercent}% margin): ${formatCostValue(minimumSafe, settings)}`);

  // Status-specific explanation
  switch (status) {
    case 'loss-making':
      lines.push(`⚠️ This product is LOSS-MAKING. The selling price does not cover total costs and fees. You lose ${formatCostValue(Math.abs(profitPerUnit), settings)} per unit sold.`);
      lines.push(`Recommendation: Increase price to at least ${formatCostValue(minimumSafe, settings)} to achieve the minimum acceptable margin.`);
      break;

    case 'below-break-even':
      lines.push(`⚠️ This product is BELOW BREAK-EVEN. After accounting for all fees, you make no profit on each unit sold.`);
      lines.push(`Recommendation: Set price to at least ${formatCostValue(breakEvenPrice, settings)} to break even, or ${formatCostValue(minimumSafe, settings)} for a healthy margin.`);
      break;

    case 'low-margin':
      lines.push(`⚡ This product has a LOW MARGIN (${effectiveMargin.toFixed(1)}%). While profitable, the margin is below the healthy threshold of ${settings.healthyMarginMinPercent}%.`);
      lines.push(`Recommendation: Consider increasing the price to improve margin, or accept the trade-off for competitive positioning.`);
      break;

    case 'healthy':
      lines.push(`✓ This product has a HEALTHY margin (${effectiveMargin.toFixed(1)}%). Pricing is within the optimal range.`);
      break;

    case 'high-margin':
      lines.push(`★ This product has a HIGH margin (${effectiveMargin.toFixed(1)}%). Excellent profitability, but verify this doesn't hurt competitiveness.`);
      break;

    case 'above-market':
      lines.push(`⚡ This product is priced significantly ABOVE the market average. Competitor average: ${formatCostValue(competitorAvg, settings)}. Your price is ${(safeDiv(safeSub(sellingPrice, competitorAvg), competitorAvg) * 100).toFixed(1)}% higher.`);
      lines.push(`Consider whether this premium positioning is intentional or needs adjustment.`);
      break;

    case 'missing-data':
      lines.push(`❓ Pricing analysis requires more data. Please set a selling price and verify cost information.`);
      break;

    case 'needs-review':
      lines.push(`🔔 This product has been flagged for manual review. Some values appear unusual.`);
      break;

    case 'approved':
      lines.push(`✓ This product's pricing has been manually reviewed and approved.`);
      break;
  }

  // Competitor context
  if (competitorAvg > 0) {
    lines.push(`Competitor average price: ${formatCostValue(competitorAvg, settings)}`);
    const diff = sellingPrice - competitorAvg;
    const diffPercent = safeDiv(Math.abs(diff), competitorAvg) * 100;
    if (diff > 0) {
      lines.push(`Your price is ${diffPercent.toFixed(1)}% above the competitor average.`);
    } else if (diff < 0) {
      lines.push(`Your price is ${diffPercent.toFixed(1)}% below the competitor average.`);
    } else {
      lines.push(`Your price matches the competitor average.`);
    }
  }

  return lines.join('\n');
}

function formatCostValue(value: number, settings: BusinessSettings): string {
  // Simple inline formatting — full formatting should use the formatting.ts module
  const symbol = getCurrencySymbolForCode(settings.currencyCode);
  if (value < 0) {
    return `-${symbol}${Math.abs(value).toFixed(2)}`;
  }
  return `${symbol}${value.toFixed(2)}`;
}

function getCurrencySymbolForCode(code: string): string {
  const symbols: Record<string, string> = {
    INR: '₹', GBP: '£', USD: '$', EUR: '€', AED: 'د.إ',
  };
  return symbols[code] ?? '₹';
}

// ============================================================
// Warning Generator
// ============================================================

/**
 * Generate warnings for a product based on its data and pricing.
 */
export function generateWarnings(
  product: Partial<Product>,
  settings: BusinessSettings,
  rules: PricingRule[]
): Warning[] {
  const warnings: Warning[] = [];
  const resolvedRule = resolveRuleForProduct(product, rules);
  const productId = product.id ?? '';
  let warningCounter = 0;

  function addWarning(
    type: string,
    severity: WarningSeverity,
    message: string,
    detail?: string,
    suggestion?: string,
    field?: string,
    value?: number
  ) {
    warnings.push({
      id: `${productId}-w-${++warningCounter}`,
      productId,
      type,
      severity,
      message,
      detail,
      suggestion,
      field,
      value,
      createdAt: new Date().toISOString(),
    });
  }

  // --- Missing Data Warnings ---
  if (!product.name || product.name.trim() === '') {
    addWarning('missing-name', 'warning', 'Product name is missing', undefined, 'Add a product name for better identification', 'name');
  }
  if (!product.sku || product.sku.trim() === '') {
    addWarning('missing-sku', 'warning', 'SKU is missing', undefined, 'Add a SKU for tracking and identification', 'sku');
  }
  if (!product.currentSellingPrice || product.currentSellingPrice <= 0) {
    addWarning('missing-price', 'error', 'No selling price set', undefined, 'Set a selling price to enable pricing analysis', 'currentSellingPrice');
  }
  if (!product.purchaseCost || product.purchaseCost <= 0) {
    addWarning('missing-cost', 'error', 'Purchase cost is missing or zero', undefined, 'Enter the purchase cost to calculate margins', 'purchaseCost');
  }
  if (!product.category || product.category.trim() === '') {
    addWarning('missing-category', 'info', 'Category is not set', undefined, 'Assign a category for better rule matching', 'category');
  }
  if (!product.brand || product.brand.trim() === '') {
    addWarning('missing-brand', 'info', 'Brand is not set', undefined, 'Assign a brand for better rule matching', 'brand');
  }

  // --- Unrealistic Values ---
  if (product.returnRatePercent && product.returnRatePercent > 50) {
    addWarning('high-return-rate', 'warning', `Return rate of ${product.returnRatePercent}% is unusually high`, 'Returns above 50% are extremely rare', 'Verify this value; typical return rates are 2-10%', 'returnRatePercent', product.returnRatePercent);
  }
  if (product.damageRatePercent && product.damageRatePercent > 30) {
    addWarning('high-damage-rate', 'warning', `Damage rate of ${product.damageRatePercent}% is unusually high`, 'Damage above 30% suggests supply chain issues', 'Investigate quality and logistics; typical rates are 0.5-5%', 'damageRatePercent', product.damageRatePercent);
  }
  if (product.taxRatePercent && product.taxRatePercent > 50) {
    addWarning('high-tax-rate', 'critical', `Tax rate of ${product.taxRatePercent}% exceeds realistic bounds`, undefined, 'Verify the tax rate; most countries have rates under 30%', 'taxRatePercent', product.taxRatePercent);
  }
  if (product.marketplaceFeePercent && product.marketplaceFeePercent > 50) {
    addWarning('high-marketplace-fee', 'warning', `Marketplace fee of ${product.marketplaceFeePercent}% is unusually high`, 'Most marketplace commissions are 5-20%', 'Verify the marketplace fee percentage', 'marketplaceFeePercent', product.marketplaceFeePercent);
  }
  if (product.paymentFeePercent && product.paymentFeePercent > 10) {
    addWarning('high-payment-fee', 'warning', `Payment fee of ${product.paymentFeePercent}% is unusually high`, 'Most payment gateway fees are 1-3%', 'Verify the payment fee percentage', 'paymentFeePercent', product.paymentFeePercent);
  }

  // --- Fee Overflow Check ---
  const totalPercentFees = calculatePercentageFees(
    product.currentSellingPrice ?? 0,
    product,
    settings,
    resolvedRule
  );
  if (totalPercentFees >= 0.9) {
    addWarning('fee-overflow', 'critical', 'Total percentage fees exceed 90% of selling price', `Total percentage fees: ${(totalPercentFees * 100).toFixed(1)}%`, 'Reduce fees or find a different sales channel; margins will be impossible', 'totalPercentageFees', totalPercentFees * 100);
  } else if (totalPercentFees >= 0.5) {
    addWarning('high-fees', 'warning', 'Total percentage fees exceed 50% of selling price', `Total percentage fees: ${(totalPercentFees * 100).toFixed(1)}%`, 'Consider negotiating lower fees or adjusting pricing strategy', 'totalPercentageFees', totalPercentFees * 100);
  }

  // --- Margin Checks ---
  if (product.currentSellingPrice && product.currentSellingPrice > 0 && product.purchaseCost && product.purchaseCost > 0) {
    const effectiveMargin = calculateEffectiveMargin(product, settings, resolvedRule);
    
    if (effectiveMargin < 0) {
      addWarning('loss-making', 'critical', 'Product is loss-making', `Margin: ${effectiveMargin.toFixed(1)}%`, `Increase price above ${formatCostValue(calculateMinimumSafePrice(product, settings, resolvedRule), settings)} to become profitable`, 'effectiveMargin', effectiveMargin);
    } else if (effectiveMargin < settings.defaultMinimumMarginPercent) {
      addWarning('below-min-margin', 'warning', `Margin (${effectiveMargin.toFixed(1)}%) is below minimum target (${settings.defaultMinimumMarginPercent}%)`, undefined, 'Consider increasing the price or reducing costs', 'effectiveMargin', effectiveMargin);
    }
  }

  // --- Competitor Anomaly ---
  const competitorPrices = product.competitorPrices ?? [];
  if (competitorPrices.length > 0) {
    const avg = calculateCompetitorAverage(product);
    if (product.currentSellingPrice && avg > 0) {
      const priceDiff = product.currentSellingPrice - avg;
      const priceDiffPercent = safeDiv(Math.abs(priceDiff), avg) * 100;
      
      if (priceDiff > 0 && priceDiffPercent > settings.aboveMarketThresholdPercent) {
        addWarning('above-market', 'warning', `Price is ${priceDiffPercent.toFixed(1)}% above competitor average`, `Competitor avg: ${formatCostValue(avg, settings)}`, 'Verify the premium positioning is intentional', 'currentSellingPrice', product.currentSellingPrice);
      } else if (priceDiff < 0 && priceDiffPercent > 50) {
        addWarning('far-below-market', 'warning', `Price is ${priceDiffPercent.toFixed(1)}% below competitor average`, `Competitor avg: ${formatCostValue(avg, settings)}`, 'This could indicate a pricing error or aggressive undercutting', 'currentSellingPrice', product.currentSellingPrice);
      }
    }
  }

  // --- Cost Component Imbalance ---
  if (product.purchaseCost && product.currentSellingPrice && product.purchaseCost > product.currentSellingPrice) {
    addWarning('cost-exceeds-price', 'critical', 'Purchase cost exceeds selling price', `Purchase: ${formatCostValue(product.purchaseCost, settings)}, Selling: ${formatCostValue(product.currentSellingPrice, settings)}`, 'The selling price must exceed the purchase cost for profitability', 'purchaseCost', product.purchaseCost);
  }

  // --- Duplicate SKU Warning ---
  // (This is handled at the product list level, not per-product)

  return warnings;
}

// ============================================================
// Rule Resolution
// ============================================================

/**
 * Resolve the effective pricing rule for a product by checking
 * rules in priority order:
 *
 * Priority: product > brand > category > channel > global
 * Within each level, higher `priority` number wins.
 *
 * Falls back to defaults from BusinessSettings if no rules match.
 */
export function resolveRuleForProduct(
  product: Partial<Product>,
  rules: PricingRule[]
): PricingRule {
  // Filter to active rules only
  const activeRules = rules.filter(r => r.isActive);

  // Sort by specificity (product > brand > category > channel > global)
  // and within the same level, by priority number (descending)
  const levelOrder: Record<string, number> = {
    'product': 4,
    'brand': 3,
    'category': 2,
    'channel': 1,
    'global': 0,
  };

  // Try to find matching rules at each level
  const productRules = activeRules
    .filter(r => r.level === 'product' && (r.targetProductId === product.id || r.targetProductSku === product.sku))
    .sort((a, b) => b.priority - a.priority);

  const brandRules = activeRules
    .filter(r => r.level === 'brand' && r.targetBrand === product.brand)
    .sort((a, b) => b.priority - a.priority);

  const categoryRules = activeRules
    .filter(r => r.level === 'category' && r.targetCategory === product.category)
    .sort((a, b) => b.priority - a.priority);

  const channelRules = activeRules
    .filter(r => r.level === 'channel' && r.targetChannel === product.salesChannel)
    .sort((a, b) => b.priority - a.priority);

  const globalRules = activeRules
    .filter(r => r.level === 'global')
    .sort((a, b) => b.priority - a.priority);

  // Pick the first (highest specificity + priority) matching rule
  const allMatching = [
    ...productRules,
    ...brandRules,
    ...categoryRules,
    ...channelRules,
    ...globalRules,
  ];

  if (allMatching.length > 0) {
    return allMatching[0];
  }

  // No rules match — return a default rule based on business settings
  // This is used as the fallback so calculations always have a rule to work with
  return {
    id: 'default-fallback',
    name: 'Default (from Business Settings)',
    level: 'global',
    targetMarginPercent: 25,
    minimumMarginPercent: 10,
    maximumMarginPercent: 60,
    targetMarkupPercent: 33,
    roundingRule: 'no-rounding',
    competitorStrategy: {
      mode: 'match-average',
      weightPercent: 30,
    },
    priority: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: 'Auto-generated default rule from business settings',
  };
}

// ============================================================
// Full Product Calculation (Convenience)
// ============================================================

/**
 * Run all calculations on a product and return the fully populated
 * calculated fields. This is the main entry point for refreshing
 * a product's calculated values.
 */
export function calculateProduct(
  product: Partial<Product>,
  settings: BusinessSettings,
  rules: PricingRule[]
): Partial<Product> {
  const resolvedRule = resolveRuleForProduct(product, rules);

  const baseCost = calculateBaseCost(product, settings);
  const expectedReturnCost = calculateExpectedReturnCost(product, settings);
  const expectedDamageCost = calculateExpectedDamageCost(product, settings);
  const totalLandedCost = calculateTotalLandedCost(product, settings);

  const sellingPrice = safeNumber(product.currentSellingPrice, 0);
  const totalPercentageFees = calculatePercentageFees(sellingPrice, product, settings, resolvedRule);
  const totalFixedFees = calculateFixedFees(product, settings);

  const breakEvenPrice = calculateBreakEvenPrice(product, settings, resolvedRule, 0);
  const markupPercent = sellingPrice > 0 ? calculateMarkup(totalLandedCost, sellingPrice) : 0;
  const marginPercent = sellingPrice > 0 ? calculateEffectiveMargin(product, settings, resolvedRule) : 0;
  const profitPerUnit = sellingPrice > 0 ? calculateProfitPerUnit(product, settings, resolvedRule) : 0;
  const pricingStatus = calculatePricingStatus(product, settings, rules);
  const profitabilityMeter = calculateProfitabilityMeter(product, settings, rules);
  const recommendedPrices = calculateRecommendedPrices(product, settings, rules);
  const healthScore = calculateHealthScore(product as Product, settings, rules);

  return {
    ...product,
    calculatedBaseCost: roundTo2Decimals(baseCost),
    calculatedExpectedReturnCost: roundTo2Decimals(expectedReturnCost),
    calculatedExpectedDamageCost: roundTo2Decimals(expectedDamageCost),
    calculatedTotalLandedCost: roundTo2Decimals(totalLandedCost),
    calculatedBreakEvenPrice: roundTo2Decimals(breakEvenPrice),
    calculatedMarkupPercent: roundTo2Decimals(markupPercent),
    calculatedMarginPercent: roundTo2Decimals(marginPercent),
    calculatedProfitPerUnit: roundTo2Decimals(profitPerUnit),
    calculatedTotalPercentageFees: roundTo2Decimals(totalPercentageFees * 100), // Store as percentage
    calculatedTotalFixedFees: roundTo2Decimals(totalFixedFees),
    calculatedPricingStatus: pricingStatus,
    calculatedProfitabilityMeter: profitabilityMeter,
    calculatedHealthScore: healthScore,
    recommendedPrices,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================
// Health Score Calculation (Feature 5)
// ============================================================

/**
 * Calculate a health score (0-100) that summarizes a product's overall pricing health.
 *
 * Scoring breakdown:
 *   - Margin health (0-40 points): based on calculatedPricingStatus
 *     0 for loss-making, 10 for below-break-even, 20 for low-margin,
 *     30 for healthy, 40 for high-margin, 25 for approved,
 *     5 for above-market, 5 for missing-data, 15 for needs-review
 *   - Cost coverage (0-30 points): how much of the selling price covers costs
 *     30 if margin > 25%, decreasing linearly from 30 at 25% down to 0 at 0%
 *   - Price alignment (0-30 points): how close current price is to recommended
 *     30 if within 5% of recommended, decreasing with distance
 *
 * @param product  The fully-populated Product object (with calculated fields)
 * @param settings Business settings (for minimum margin threshold)
 * @param rules    Pricing rules
 * @returns        Integer 0-100
 */
export function calculateHealthScore(
  product: Product,
  settings: BusinessSettings,
  rules: PricingRule[]
): number {
  // 1. Margin Health (0-40)
  let marginHealth = 0;
  const status = product.calculatedPricingStatus;
  switch (status) {
    case 'loss-making':         marginHealth = 0; break;
    case 'below-break-even':    marginHealth = 10; break;
    case 'low-margin':          marginHealth = 20; break;
    case 'healthy':             marginHealth = 30; break;
    case 'high-margin':         marginHealth = 40; break;
    case 'approved':            marginHealth = 25; break;
    case 'above-market':        marginHealth = 5; break;
    case 'missing-data':        marginHealth = 5; break;
    case 'needs-review':        marginHealth = 15; break;
    default:                    marginHealth = 10; break;
  }

  // 2. Cost Coverage (0-30) — based on margin percent
  //    30 if margin > 25%, decreasing linearly from 30 at 25% down to 0 at 0% or negative
  const margin = product.calculatedMarginPercent;
  let costCoverage = 0;
  if (margin >= 25) {
    costCoverage = 30;
  } else if (margin > 0) {
    costCoverage = Math.round((margin / 25) * 30);
  } else {
    costCoverage = 0;
  }

  // 3. Price Alignment (0-30) — how close current price is to recommended (balanced)
  let priceAlignment = 0;
  const currentPrice = product.currentSellingPrice;
  const recommendedPrice = product.recommendedPrices?.balanced ?? 0;

  if (recommendedPrice > 0 && currentPrice > 0) {
    const diffPercent = Math.abs((currentPrice - recommendedPrice) / recommendedPrice) * 100;
    if (diffPercent <= 5) {
      priceAlignment = 30;
    } else if (diffPercent <= 10) {
      priceAlignment = 25;
    } else if (diffPercent <= 20) {
      priceAlignment = 20;
    } else if (diffPercent <= 30) {
      priceAlignment = 15;
    } else if (diffPercent <= 50) {
      priceAlignment = 10;
    } else {
      priceAlignment = 5;
    }
  } else {
    // Missing price data
    priceAlignment = 5;
  }

  const totalScore = marginHealth + costCoverage + priceAlignment;
  return Math.max(0, Math.min(100, totalScore));
}
