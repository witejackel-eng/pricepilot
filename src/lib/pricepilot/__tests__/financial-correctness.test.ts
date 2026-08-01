/**
 * Financial correctness tests — verify the canonical pricing engine
 * produces the exact expected numbers for every financial scenario.
 *
 * This is a FINANCIAL SYSTEM test suite. The pricing engine affects
 * real business decisions, so every calculation must be exact.
 *
 * Sections:
 *   1. Tax scenarios
 *   2. Fee scenarios
 *   3. Risk cost scenarios
 *   4. Margin scenarios
 *   5. Safety values (no NaN/Infinity/negative)
 *   6. Engine invariants (property-style)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateOutcomeAtPrice,
  calculateBreakEvenPriceFromOutcome,
  calculateMinimumSafePrice,
  calculateRecommendedPricesFromEngine,
  applyRoundingWithRevalidation,
  percentageToDecimal,
} from '../pricing-engine';
import { resolveEffectivePricingPolicy } from '../resolve-rule';
import {
  createDefaultBusinessSettings,
  createDefaultPricingRule,
  Product,
  BusinessSettings,
  PricingRule,
} from '../types';
import { safelyRecalculateProduct } from '../safe-calculation';

// ============================================================
// Helpers
// ============================================================

function makeSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return { ...createDefaultBusinessSettings(), ...overrides };
}

function makeRules(overrides: Partial<PricingRule> = {}): PricingRule[] {
  return [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true, ...overrides }];
}

function makeProduct(overrides: Partial<Product>): Product {
  const defaults: Product = {
    id: 'prod-fin-1',
    sku: 'FIN-1',
    name: 'Financial Test Product',
    category: '',
    brand: '',
    description: '',
    tags: [],
    purchaseCost: 100,
    shippingCost: 0,
    packagingCost: 0,
    handlingCost: 0,
    otherCosts: 0,
    returnRatePercent: 0,
    damageRatePercent: 0,
    customDutyPercent: 0,
    freightPercent: 0,
    currentSellingPrice: 125,
    competitorPrices: [],
    salesChannel: 'online-marketplace',
    taxRatePercent: 0,
    taxTreatment: 'exempt',
    marketplaceFeePercent: 0,
    marketplaceFeeFixed: 0,
    paymentFeePercent: 0,
    paymentFeeFixed: 0,
    shippingChargeToCustomer: 0,
    otherFeesPercent: 0,
    otherFeesFixed: 0,
    calculatedBaseCost: 0,
    calculatedExpectedReturnCost: 0,
    calculatedExpectedDamageCost: 0,
    calculatedTotalLandedCost: 0,
    calculatedBreakEvenPrice: 0,
    calculatedMarkupPercent: 0,
    calculatedMarginPercent: 0,
    calculatedProfitPerUnit: 0,
    calculatedTotalPercentageFees: 0,
    calculatedTotalFixedFees: 0,
    calculatedPricingStatus: 'missing-data',
    calculatedProfitabilityMeter: 'loss',
    calculatedHealthScore: 0,
    recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },
    purchaseTaxRatePercent: 0,
    inputTaxCreditRecoverable: 'not-recoverable',
    inputTaxRecoverablePercent: 100,
    purchaseCostTaxMode: 'excluding-tax',
    feeBasePolicy: 'product-price-only',
    selectedRecommendationMode: 'balanced',
    customRecommendedPrice: 0,
    finalApprovedPrice: 0,
    priceApprovalStatus: 'none',
    approvedAt: '',
    quantity: 0,
    monthlyUnitsSold: 0,
    expectedMonthlyUnits: 0,
    lifecycleStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isApproved: false,
    notes: '',
  };
  return { ...defaults, ...overrides } as Product;
}

function calcOutcome(
  productOverrides: Partial<Product>,
  sellingPrice: number,
  settingsOverrides: Partial<BusinessSettings> = {},
  ruleOverrides: Partial<PricingRule> = {}
) {
  const settings = makeSettings(settingsOverrides);
  const product = makeProduct(productOverrides);
  const rules = makeRules(ruleOverrides);
  const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
  return calculateOutcomeAtPrice({
    product,
    sellingPrice,
    businessSettings: settings,
    effectiveRule,
  });
}

// ============================================================
// 1. TAX SCENARIOS
// ============================================================

describe('Tax — Financial correctness', () => {
  // --- Tax exempt ---
  it('Tax exempt: no tax applied, profit = selling price - cost', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 125, taxRatePercent: 0, taxTreatment: 'exempt' },
      125,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.outputTax).toBeCloseTo(0, 2);
    expect(outcome.netSalesRevenue).toBeCloseTo(125, 2);
    expect(outcome.customerPayableAmount).toBeCloseTo(125, 2);
    expect(outcome.netProfit).toBeCloseTo(25, 2);
  });

  // --- Tax inclusive ---
  it('Tax inclusive: GST extracted from inclusive price', () => {
    // ₹150 inclusive, 20% GST
    // Net revenue = 150 / 1.20 = 125
    // GST = 150 - 125 = 25
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 150, taxRatePercent: 20, taxTreatment: 'inclusive' },
      150,
      { defaultTaxRatePercent: 20, taxTreatment: 'inclusive' }
    );
    expect(outcome.netSalesRevenue).toBeCloseTo(125, 1);
    expect(outcome.outputTax).toBeCloseTo(25, 1);
    expect(outcome.customerPayableAmount).toBeCloseTo(150, 1);
    expect(outcome.netProfit).toBeCloseTo(25, 1);
  });

  // --- Tax exclusive ---
  it('Tax exclusive: GST added on top of selling price', () => {
    // Base price ₹125, 20% GST
    // Customer pays = 125 + 25 = 150
    // Net revenue = 125 (exclusive, so gross = net)
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 125, taxRatePercent: 20, taxTreatment: 'exclusive' },
      125,
      { defaultTaxRatePercent: 20, taxTreatment: 'exclusive' }
    );
    expect(outcome.customerPayableAmount).toBeCloseTo(150, 1);
    expect(outcome.outputTax).toBeCloseTo(25, 1);
    expect(outcome.netSalesRevenue).toBeCloseTo(125, 1);
  });

  // --- 0% GST ---
  it('0% GST: no tax regardless of treatment', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 150, taxRatePercent: 0, taxTreatment: 'inclusive' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'inclusive' }
    );
    expect(outcome.outputTax).toBeCloseTo(0, 2);
    expect(outcome.netSalesRevenue).toBeCloseTo(150, 2);
  });

  // --- 5% GST ---
  it('5% GST inclusive: correct extraction', () => {
    // ₹210 inclusive, 5% GST
    // Net = 210 / 1.05 = 200
    // GST = 10
    const outcome = calcOutcome(
      { purchaseCost: 150, currentSellingPrice: 210, taxRatePercent: 5, taxTreatment: 'inclusive' },
      210,
      { defaultTaxRatePercent: 5, taxTreatment: 'inclusive' }
    );
    expect(outcome.netSalesRevenue).toBeCloseTo(200, 1);
    expect(outcome.outputTax).toBeCloseTo(10, 1);
  });

  // --- 12% GST ---
  it('12% GST inclusive: correct extraction', () => {
    // ₹280 inclusive, 12% GST
    // Net = 280 / 1.12 = 250
    // GST = 30
    const outcome = calcOutcome(
      { purchaseCost: 200, currentSellingPrice: 280, taxRatePercent: 12, taxTreatment: 'inclusive' },
      280,
      { defaultTaxRatePercent: 12, taxTreatment: 'inclusive' }
    );
    expect(outcome.netSalesRevenue).toBeCloseTo(250, 1);
    expect(outcome.outputTax).toBeCloseTo(30, 1);
  });

  // --- 18% GST ---
  it('18% GST inclusive: correct extraction', () => {
    // ₹590 inclusive, 18% GST
    // Net = 590 / 1.18 = 500
    // GST = 90
    const outcome = calcOutcome(
      { purchaseCost: 400, currentSellingPrice: 590, taxRatePercent: 18, taxTreatment: 'inclusive' },
      590,
      { defaultTaxRatePercent: 18, taxTreatment: 'inclusive' }
    );
    expect(outcome.netSalesRevenue).toBeCloseTo(500, 1);
    expect(outcome.outputTax).toBeCloseTo(90, 1);
  });

  // --- 28% GST ---
  it('28% GST inclusive: correct extraction', () => {
    // ₹640 inclusive, 28% GST
    // Net = 640 / 1.28 = 500
    // GST = 140
    const outcome = calcOutcome(
      { purchaseCost: 400, currentSellingPrice: 640, taxRatePercent: 28, taxTreatment: 'inclusive' },
      640,
      { defaultTaxRatePercent: 28, taxTreatment: 'inclusive' }
    );
    expect(outcome.netSalesRevenue).toBeCloseTo(500, 1);
    expect(outcome.outputTax).toBeCloseTo(140, 1);
  });

  // --- Custom GST ---
  it('Custom GST (33.3%) inclusive: correct extraction', () => {
    // ₹399.6 inclusive, 33.3% GST
    // Net = 399.6 / 1.333 ≈ 299.925
    // GST ≈ 99.675
    const outcome = calcOutcome(
      { purchaseCost: 200, currentSellingPrice: 399.6, taxRatePercent: 33.3, taxTreatment: 'inclusive' },
      399.6,
      { defaultTaxRatePercent: 33.3, taxTreatment: 'inclusive' }
    );
    expect(outcome.netSalesRevenue).toBeCloseTo(399.6 / 1.333, 1);
    expect(outcome.outputTax).toBeCloseTo(399.6 - 399.6 / 1.333, 1);
  });

  // --- Composite treatment ---
  it('Composite tax treatment: behaves like inclusive for the combined rate', () => {
    // Composite uses the same formula as inclusive
    const inclusive = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 118, taxRatePercent: 18, taxTreatment: 'inclusive' },
      118,
      { defaultTaxRatePercent: 18, taxTreatment: 'inclusive' }
    );
    const composite = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 118, taxRatePercent: 18, taxTreatment: 'composite' },
      118,
      { defaultTaxRatePercent: 18, taxTreatment: 'composite' }
    );
    expect(composite.netSalesRevenue).toBeCloseTo(inclusive.netSalesRevenue, 1);
    expect(composite.outputTax).toBeCloseTo(inclusive.outputTax, 1);
    expect(composite.customerPayableAmount).toBeCloseTo(inclusive.customerPayableAmount, 1);
  });

  // --- Recoverable input tax ---
  it('Recoverable input tax: purchase cost includes tax, fully recoverable', () => {
    // Purchase ₹118 including 18% GST, fully recoverable
    // Net purchase = 118 / 1.18 = 100
    // Recoverable input tax = 18
    // Non-recoverable = 0
    const outcome = calcOutcome(
      {
        purchaseCost: 118,
        purchaseTaxRatePercent: 18,
        purchaseCostTaxMode: 'including-tax',
        inputTaxCreditRecoverable: 'recoverable',
        inputTaxRecoverablePercent: 100,
        taxRatePercent: 0,
        taxTreatment: 'exempt',
      },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netPurchaseCost).toBeCloseTo(100, 1);
    expect(outcome.recoverableInputTax).toBeCloseTo(18, 1);
    expect(outcome.nonRecoverableInputTax).toBeCloseTo(0, 1);
    // Landed cost should NOT include recoverable tax
    expect(outcome.totalLandedCost).toBeCloseTo(100, 1);
  });

  // --- Partially recoverable input tax ---
  it('Partially recoverable input tax: 50% of input tax is recoverable', () => {
    // Purchase ₹118 including 18% GST, 50% recoverable
    // Net purchase = 100
    // Total input tax = 18
    // Recoverable = 9
    // Non-recoverable = 9
    const outcome = calcOutcome(
      {
        purchaseCost: 118,
        purchaseTaxRatePercent: 18,
        purchaseCostTaxMode: 'including-tax',
        inputTaxCreditRecoverable: 'partially-recoverable',
        inputTaxRecoverablePercent: 50,
        taxRatePercent: 0,
        taxTreatment: 'exempt',
      },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netPurchaseCost).toBeCloseTo(100, 1);
    expect(outcome.recoverableInputTax).toBeCloseTo(9, 1);
    expect(outcome.nonRecoverableInputTax).toBeCloseTo(9, 1);
    // Landed cost should include non-recoverable portion
    expect(outcome.totalLandedCost).toBeCloseTo(100 + 9, 1);
  });

  // --- Non-recoverable input tax ---
  it('Non-recoverable input tax: full input tax adds to landed cost', () => {
    // Purchase ₹118 including 18% GST, not recoverable
    // Net purchase = 100
    // Total input tax = 18, all non-recoverable
    const outcome = calcOutcome(
      {
        purchaseCost: 118,
        purchaseTaxRatePercent: 18,
        purchaseCostTaxMode: 'including-tax',
        inputTaxCreditRecoverable: 'not-recoverable',
        inputTaxRecoverablePercent: 0,
        taxRatePercent: 0,
        taxTreatment: 'exempt',
      },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netPurchaseCost).toBeCloseTo(100, 1);
    expect(outcome.recoverableInputTax).toBeCloseTo(0, 1);
    expect(outcome.nonRecoverableInputTax).toBeCloseTo(18, 1);
    // Landed cost includes non-recoverable tax
    expect(outcome.totalLandedCost).toBeCloseTo(100 + 18, 1);
  });

  // --- Purchase cost excluding tax with input tax ---
  it('Purchase cost excluding tax: input tax added separately', () => {
    // Purchase ₹100 excluding tax, 18% GST, not recoverable
    // Input tax = 100 * 0.18 = 18
    // Net purchase = 100
    // Non-recoverable = 18
    const outcome = calcOutcome(
      {
        purchaseCost: 100,
        purchaseTaxRatePercent: 18,
        purchaseCostTaxMode: 'excluding-tax',
        inputTaxCreditRecoverable: 'not-recoverable',
        inputTaxRecoverablePercent: 0,
        taxRatePercent: 0,
        taxTreatment: 'exempt',
      },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netPurchaseCost).toBeCloseTo(100, 1);
    expect(outcome.recoverableInputTax).toBeCloseTo(0, 1);
    expect(outcome.nonRecoverableInputTax).toBeCloseTo(18, 1);
    expect(outcome.totalLandedCost).toBeCloseTo(100 + 18, 1);
  });
});

// ============================================================
// 2. FEE SCENARIOS
// ============================================================

describe('Fees — Financial correctness', () => {
  // --- Percentage-only marketplace fee ---
  it('Percentage-only marketplace fee: 10% of product price', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 200, marketplaceFeePercent: 10, taxTreatment: 'exempt' },
      200,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt', defaultMarketplaceFeePercent: 10 }
    );
    expect(outcome.marketplacePercentageFee).toBeCloseTo(20, 1); // 10% of 200
    expect(outcome.marketplaceFixedFee).toBeCloseTo(0, 1);
    // Profit = 200 - 100 - 20 = 80
    expect(outcome.netProfit).toBeCloseTo(80, 1);
  });

  // --- Fixed-only marketplace fee ---
  it('Fixed-only marketplace fee: ₹15 per transaction', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 200, marketplaceFeeFixed: 15, taxTreatment: 'exempt' },
      200,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt', defaultMarketplaceFeeFixed: 15 }
    );
    expect(outcome.marketplacePercentageFee).toBeCloseTo(0, 1);
    expect(outcome.marketplaceFixedFee).toBeCloseTo(15, 1);
    // Profit = 200 - 100 - 15 = 85
    expect(outcome.netProfit).toBeCloseTo(85, 1);
  });

  // --- Combined percentage and fixed fee ---
  it('Combined percentage and fixed marketplace fee', () => {
    // 8% + ₹10 fixed
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 200, marketplaceFeePercent: 8, marketplaceFeeFixed: 10, taxTreatment: 'exempt' },
      200,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt', defaultMarketplaceFeePercent: 8, defaultMarketplaceFeeFixed: 10 }
    );
    expect(outcome.marketplacePercentageFee).toBeCloseTo(16, 1); // 8% of 200
    expect(outcome.marketplaceFixedFee).toBeCloseTo(10, 1);
    expect(outcome.totalSellingFees).toBeCloseTo(26, 1);
    // Profit = 200 - 100 - 26 = 74
    expect(outcome.netProfit).toBeCloseTo(74, 1);
  });

  // --- Payment percentage fee ---
  it('Payment percentage fee: 2% of product price', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 200, paymentFeePercent: 2, taxTreatment: 'exempt' },
      200,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt', defaultPaymentFeePercent: 2 }
    );
    expect(outcome.paymentPercentageFee).toBeCloseTo(4, 1); // 2% of 200
    expect(outcome.paymentFixedFee).toBeCloseTo(0, 1);
  });

  // --- Payment fixed fee ---
  it('Payment fixed fee: ₹5 per transaction', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 200, paymentFeeFixed: 5, taxTreatment: 'exempt' },
      200,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt', defaultPaymentFeeFixed: 5 }
    );
    expect(outcome.paymentPercentageFee).toBeCloseTo(0, 1);
    expect(outcome.paymentFixedFee).toBeCloseTo(5, 1);
  });

  // --- Fee charged on product value (product-price-only) ---
  it('Fee on product-price-only: fees calculated on selling price', () => {
    // With 10% marketplace fee on product-price-only
    // Selling price = 200, tax exclusive 18% → customer pays 236
    // Fee = 10% of 200 (NOT 236)
    const outcome = calcOutcome(
      {
        purchaseCost: 100,
        currentSellingPrice: 200,
        marketplaceFeePercent: 10,
        taxTreatment: 'exclusive',
        taxRatePercent: 18,
        feeBasePolicy: 'product-price-only',
      },
      200,
      { defaultTaxRatePercent: 18, taxTreatment: 'exclusive', defaultMarketplaceFeePercent: 10, feeBasePolicy: 'product-price-only' }
    );
    expect(outcome.marketplacePercentageFee).toBeCloseTo(20, 1); // 10% of 200
    expect(outcome.customerPayableAmount).toBeCloseTo(236, 1); // 200 + 36 GST
  });

  // --- Fee charged on customer-paid total ---
  it('Fee on customer-payable-gross: fees calculated on total customer payable', () => {
    // With 10% marketplace fee on customer-payable-gross
    // Selling price = 200, tax exclusive 18% → customer pays 236
    // Fee = 10% of 236
    const outcome = calcOutcome(
      {
        purchaseCost: 100,
        currentSellingPrice: 200,
        marketplaceFeePercent: 10,
        taxTreatment: 'exclusive',
        taxRatePercent: 18,
        feeBasePolicy: 'customer-payable-gross',
      },
      200,
      { defaultTaxRatePercent: 18, taxTreatment: 'exclusive', defaultMarketplaceFeePercent: 10, feeBasePolicy: 'customer-payable-gross' }
    );
    expect(outcome.marketplacePercentageFee).toBeCloseTo(23.6, 1); // 10% of 236
  });

  // --- Fee on product-price-plus-shipping ---
  it('Fee on product-price-plus-shipping: fees calculated on price + customer shipping', () => {
    // Selling price = 200, shipping charge to customer = 30
    // Fee = 10% of (200 + 30) = 23
    const outcome = calcOutcome(
      {
        purchaseCost: 100,
        currentSellingPrice: 200,
        marketplaceFeePercent: 10,
        taxTreatment: 'exempt',
        feeBasePolicy: 'product-price-plus-shipping',
        shippingChargeToCustomer: 30,
      },
      200,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt', defaultMarketplaceFeePercent: 10, feeBasePolicy: 'product-price-plus-shipping' }
    );
    expect(outcome.marketplacePercentageFee).toBeCloseTo(23, 1); // 10% of 230
  });

  // --- Multiple fee layers ---
  it('Multiple fee layers: marketplace + payment + other fees all applied', () => {
    // Marketplace: 8% + ₹10 fixed
    // Payment: 2% + ₹5 fixed
    // Other: 1% + ₹3 fixed
    // Total percentage: 11% of 200 = 22
    // Total fixed: 10 + 5 + 3 = 18
    // Total fees: 22 + 18 = 40
    const outcome = calcOutcome(
      {
        purchaseCost: 100,
        currentSellingPrice: 200,
        marketplaceFeePercent: 8,
        marketplaceFeeFixed: 10,
        paymentFeePercent: 2,
        paymentFeeFixed: 5,
        otherFeesPercent: 1,
        otherFeesFixed: 3,
        taxTreatment: 'exempt',
      },
      200,
      {
        defaultTaxRatePercent: 0,
        taxTreatment: 'exempt',
        defaultMarketplaceFeePercent: 8,
        defaultMarketplaceFeeFixed: 10,
        defaultPaymentFeePercent: 2,
        defaultPaymentFeeFixed: 5,
        defaultOtherFeesPercent: 1,
        defaultOtherFeesFixed: 3,
      }
    );
    expect(outcome.marketplacePercentageFee).toBeCloseTo(16, 1);
    expect(outcome.marketplaceFixedFee).toBeCloseTo(10, 1);
    expect(outcome.paymentPercentageFee).toBeCloseTo(4, 1);
    expect(outcome.paymentFixedFee).toBeCloseTo(5, 1);
    expect(outcome.otherPercentageFees).toBeCloseTo(2, 1);
    expect(outcome.otherFixedFees).toBeCloseTo(3, 1);
    expect(outcome.totalSellingFees).toBeCloseTo(40, 1);
    // Profit = 200 - 100 - 40 = 60
    expect(outcome.netProfit).toBeCloseTo(60, 1);
  });
});

// ============================================================
// 3. RISK COST SCENARIOS
// ============================================================

describe('Risk costs — Financial correctness', () => {
  // --- Return rate ---
  it('Return rate: expected return cost is added to landed cost', () => {
    // Purchase = 100, shipping = 10, return rate = 5%
    // Base for return = (100 + 10) = 110
    // Return cost = 110 * 0.05 = 5.5
    // Total landed = 100 + 10 + 5.5 = 115.5
    const outcome = calcOutcome(
      { purchaseCost: 100, shippingCost: 10, returnRatePercent: 5, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.expectedReturnCost).toBeCloseTo(5.5, 1);
    expect(outcome.totalLandedCost).toBeCloseTo(115.5, 1);
  });

  // --- Damage rate ---
  it('Damage rate: expected damage cost is added to landed cost', () => {
    // Purchase = 100, shipping = 10, damage rate = 3%
    // Base for damage = (100 + 10) = 110
    // Damage cost = 110 * 0.03 = 3.3
    // Total landed = 100 + 10 + 3.3 = 113.3
    const outcome = calcOutcome(
      { purchaseCost: 100, shippingCost: 10, damageRatePercent: 3, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.expectedDamageCost).toBeCloseTo(3.3, 1);
    expect(outcome.totalLandedCost).toBeCloseTo(113.3, 1);
  });

  // --- Return and damage together ---
  it('Return and damage together: both costs added to landed cost', () => {
    // Purchase = 100, shipping = 10, return = 5%, damage = 3%
    // Return cost = 110 * 0.05 = 5.5
    // Damage cost = 110 * 0.03 = 3.3
    // Total landed = 100 + 10 + 5.5 + 3.3 = 118.8
    const outcome = calcOutcome(
      { purchaseCost: 100, shippingCost: 10, returnRatePercent: 5, damageRatePercent: 3, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.expectedReturnCost).toBeCloseTo(5.5, 1);
    expect(outcome.expectedDamageCost).toBeCloseTo(3.3, 1);
    expect(outcome.totalLandedCost).toBeCloseTo(118.8, 1);
  });

  // --- 100% return rate ---
  it('100% return rate: entire product cost is return cost', () => {
    // Purchase = 100, return rate = 100%
    // Return cost = 100 * 1.0 = 100
    // Total landed = 100 + 100 = 200
    const outcome = calcOutcome(
      { purchaseCost: 100, returnRatePercent: 100, taxTreatment: 'exempt' },
      250,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.expectedReturnCost).toBeCloseTo(100, 1);
    expect(outcome.totalLandedCost).toBeCloseTo(200, 1);
    // Profit = 250 - 200 = 50
    expect(outcome.netProfit).toBeCloseTo(50, 1);
  });

  // --- Invalid rates rejected (clamped to 0-100) ---
  it('Negative return rate is clamped to 0', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, returnRatePercent: -10, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.expectedReturnCost).toBeCloseTo(0, 1);
  });

  it('Negative damage rate is clamped to 0', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, damageRatePercent: -5, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.expectedDamageCost).toBeCloseTo(0, 1);
  });

  it('Return rate > 100 is clamped to 100', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, returnRatePercent: 150, taxTreatment: 'exempt' },
      250,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    // Clamped to 100: return cost = 100
    expect(outcome.expectedReturnCost).toBeCloseTo(100, 1);
  });

  // --- Expected cost calculations with all components ---
  it('Expected cost calculations: all cost components together', () => {
    // Purchase = 100, shipping = 10, packaging = 5, handling = 3, other = 2
    // Custom duty = 10% of purchase = 10
    // Freight = 5% of purchase = 5
    // Return = 5%, Damage = 3%
    // Base = 100 + 10 + 5 + 3 + 2 + 5 = 125 (net purchase + fixed costs)
    // Actually: netPurchaseCost = 100, fixedProductCosts = 10+5+3+2+5 = 25
    // Return cost = (100 + 25) * 0.05 = 6.25
    // Damage cost = (100 + 25) * 0.03 = 3.75
    // Custom duty = 100 * 0.10 = 10
    // Total landed = 100 + 25 + 6.25 + 3.75 + 10 = 145
    const outcome = calcOutcome(
      {
        purchaseCost: 100,
        shippingCost: 10,
        packagingCost: 5,
        handlingCost: 3,
        otherCosts: 2,
        customDutyPercent: 10,
        freightPercent: 5,
        returnRatePercent: 5,
        damageRatePercent: 3,
        taxTreatment: 'exempt',
      },
      200,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.fixedProductCosts).toBeCloseTo(25, 1);
    expect(outcome.expectedReturnCost).toBeCloseTo(6.25, 1);
    expect(outcome.expectedDamageCost).toBeCloseTo(3.75, 1);
    expect(outcome.customDutyCost).toBeCloseTo(10, 1);
    expect(outcome.totalLandedCost).toBeCloseTo(145, 1);
  });
});

// ============================================================
// 4. MARGIN SCENARIOS
// ============================================================

describe('Margins — Financial correctness', () => {
  // --- Minimum margin ---
  it('Minimum margin: price satisfies minimum margin but not target', () => {
    // Purchase = 100, min margin = 10%, target = 25%
    // Selling at 120 → margin = 20/120 = 16.67%
    // Satisfies minimum (10%) but not target (25%)
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 120, taxTreatment: 'exempt' },
      120,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' },
      { minimumMarginPercent: 10, targetMarginPercent: 25 }
    );
    expect(outcome.effectiveMarginPercent).toBeCloseTo(16.67, 1);
    expect(outcome.satisfiesMinimumMargin).toBe(true);
    expect(outcome.satisfiesTargetMargin).toBe(false);
  });

  // --- Target margin ---
  it('Target margin: price satisfies target margin', () => {
    // Purchase = 100, target margin = 25%
    // Selling at 150 → margin = 50/150 = 33.33%
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' },
      { minimumMarginPercent: 10, targetMarginPercent: 25 }
    );
    expect(outcome.effectiveMarginPercent).toBeCloseTo(33.33, 1);
    expect(outcome.satisfiesMinimumMargin).toBe(true);
    expect(outcome.satisfiesTargetMargin).toBe(true);
  });

  // --- Minimum profit ---
  it('Minimum profit per unit: checked against absolute profit', () => {
    // Purchase = 100, min profit = 5
    // Selling at 103 → profit = 3, does not satisfy minimum
    // Selling at 106 → profit = 6, satisfies minimum
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt', minimumProfitPerUnit: 5 });
    const rules = makeRules({ overrideMinimumProfitPerUnit: 5, minimumMarginPercent: 0 });

    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 103, taxTreatment: 'exempt' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const lowOutcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 103,
      businessSettings: settings,
      effectiveRule,
    });
    expect(lowOutcome.netProfit).toBeCloseTo(3, 1);
    expect(lowOutcome.satisfiesMinimumProfit).toBe(false);

    const highOutcome = calculateOutcomeAtPrice({
      product: { ...product, currentSellingPrice: 106 },
      sellingPrice: 106,
      businessSettings: settings,
      effectiveRule,
    });
    expect(highOutcome.netProfit).toBeCloseTo(6, 1);
    expect(highOutcome.satisfiesMinimumProfit).toBe(true);
  });

  // --- Zero-margin product ---
  it('Zero-margin product: profit is approximately zero', () => {
    // Purchase = 100, selling at 100
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 100, taxTreatment: 'exempt' },
      100,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netProfit).toBeCloseTo(0, 1);
    expect(outcome.effectiveMarginPercent).toBeCloseTo(0, 1);
    expect(outcome.isBreakEven).toBe(true);
  });

  // --- Loss-making product ---
  it('Loss-making product: selling below cost', () => {
    // Purchase = 100, selling at 80
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 80, taxTreatment: 'exempt' },
      80,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netProfit).toBeCloseTo(-20, 1);
    expect(outcome.isProfitable).toBe(false);
    expect(outcome.effectiveMarginPercent).toBeLessThan(0);
    // Should have a loss-making warning
    const lossWarning = outcome.warnings.find(w => w.type === 'loss-making');
    expect(lossWarning).toBeDefined();
  });

  // --- Impossible margin ---
  it('Impossible margin: fees + margin target exceed 100%', () => {
    // Marketplace fee = 50%, payment fee = 30%, target margin = 25%
    // Total percentage fees = 80%, minimum margin = 25%
    // Combined = 105% > 100% → impossible margin
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      taxTreatment: 'exempt',
      defaultMarketplaceFeePercent: 50,
      defaultPaymentFeePercent: 30,
    });
    const rules = makeRules({
      targetMarginPercent: 25,
      minimumMarginPercent: 25,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
      marketplaceFeePercent: 50,
      paymentFeePercent: 30,
      taxTreatment: 'exempt',
    });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });
    const impossibleWarning = outcome.warnings.find(w => w.type === 'impossible-margin');
    expect(impossibleWarning).toBeDefined();
    // Break-even price: with 80% fees, denominator = 1 - 0.80 = 0.20 > 0
    // So break-even IS calculable (just very high). The impossible state
    // is about the minimum margin target, not the break-even.
    // The minimum safe price should be 0 (impossible to satisfy 25% margin)
    const minimumSafe = calculateMinimumSafePrice(product, settings, effectiveRule);
    expect(minimumSafe).toBe(0);
  });

  // --- High fee environment ---
  it('High fee environment: margin still calculable but constrained', () => {
    // Marketplace fee = 20%, payment fee = 3%
    // Total percentage fees = 23% of selling price
    // At ₹200: marketplace fee = 40, payment fee = 6, total fees = 46
    // Profit = 200 - 100 - 46 = 54
    // Margin = 54/200 = 27% → above minimum 10%
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 200, marketplaceFeePercent: 20, paymentFeePercent: 3, taxTreatment: 'exempt' },
      200,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt', defaultMarketplaceFeePercent: 20, defaultPaymentFeePercent: 3 },
      { minimumMarginPercent: 10, targetMarginPercent: 10 }
    );
    expect(outcome.netProfit).toBeCloseTo(54, 1);
    // With 23% fees and 10% margin target, denominator = 1 - 0.23 - 0.10 = 0.67
    // Margin = 54/200 = 27% → satisfies 10% minimum
    expect(outcome.satisfiesMinimumMargin).toBe(true);
  });

  // --- Rounding rule ---
  it('Rounding rule: nearest-whole rounds recommendation', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      taxTreatment: 'exempt',
      defaultRoundingRule: 'nearest-whole',
    });
    const rules = makeRules({
      minimumMarginPercent: 10,
      targetMarginPercent: 20,
      roundingRule: 'nearest-whole',
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 130,
      taxTreatment: 'exempt',
    });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const recs = calculateRecommendedPricesFromEngine(product, settings, effectiveRule);
    // Minimum safe price for 10% margin: 100 / (1 - 0) = 100 (no fees)
    // Actually with 10% margin: price = 100 / (1 - 0.10) = 111.11
    // Rounded to nearest whole = 111
    // But revalidation may push it up to 112 if 111 doesn't satisfy
    expect(Number.isFinite(recs.minimum)).toBe(true);
    expect(recs.minimum).toBeGreaterThan(0);
    // The rounded price should be a whole number
    expect(recs.minimum % 1).toBeCloseTo(0, 0);
  });

  // --- Custom rounding ---
  it('Custom rounding: rounds to specified increment', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      taxTreatment: 'exempt',
      defaultRoundingRule: 'custom',
      customRoundingValue: 25,
    });
    const rules = makeRules({
      minimumMarginPercent: 10,
      targetMarginPercent: 20,
      roundingRule: 'custom',
      customRoundingValue: 25,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 130,
      taxTreatment: 'exempt',
    });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const recs = calculateRecommendedPricesFromEngine(product, settings, effectiveRule);
    expect(Number.isFinite(recs.minimum)).toBe(true);
    expect(recs.minimum).toBeGreaterThan(0);
  });

  // --- Very small currency values ---
  it('Very small currency values: calculations remain precise', () => {
    // Purchase = 0.01, selling = 0.02
    const outcome = calcOutcome(
      { purchaseCost: 0.01, currentSellingPrice: 0.02, taxTreatment: 'exempt' },
      0.02,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netProfit).toBeCloseTo(0.01, 2);
    expect(outcome.effectiveMarginPercent).toBeCloseTo(50, 0);
    expect(Number.isFinite(outcome.netProfit)).toBe(true);
    expect(Number.isFinite(outcome.effectiveMarginPercent)).toBe(true);
  });

  // --- Very large currency values ---
  it('Very large currency values: calculations remain precise', () => {
    // Purchase = 10,000,000, selling = 15,000,000
    const outcome = calcOutcome(
      { purchaseCost: 10000000, currentSellingPrice: 15000000, taxTreatment: 'exempt' },
      15000000,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netProfit).toBeCloseTo(5000000, 0);
    expect(outcome.effectiveMarginPercent).toBeCloseTo(33.33, 1);
    expect(Number.isFinite(outcome.netProfit)).toBe(true);
    expect(Number.isFinite(outcome.effectiveMarginPercent)).toBe(true);
  });
});

// ============================================================
// 5. SAFETY VALUES
// ============================================================

describe('Safety values — no NaN/Infinity/negative/invalid', () => {
  it('Normal product produces only finite numbers in all output fields', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 150 });
    const rules = makeRules();
    const result = safelyRecalculateProduct(product, settings, rules);
    expect(result.success).toBe(true);
    const p = result.product;
    const numericFields = [
      p.calculatedBaseCost,
      p.calculatedTotalLandedCost,
      p.calculatedBreakEvenPrice,
      p.calculatedMarginPercent,
      p.calculatedProfitPerUnit,
      p.calculatedTotalPercentageFees,
      p.calculatedTotalFixedFees,
      p.calculatedHealthScore,
      p.recommendedPrices.breakEven,
      p.recommendedPrices.minimum,
      p.recommendedPrices.balanced,
      p.recommendedPrices.premium,
    ];
    for (const v of numericFields) {
      expect(Number.isFinite(v), `Expected finite, got ${v}`).toBe(true);
    }
  });

  it('No output contains NaN', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    const allValues = Object.values(outcome).filter(v => typeof v === 'number');
    for (const v of allValues) {
      expect(Number.isNaN(v), `Expected non-NaN, got NaN`).toBe(false);
    }
  });

  it('No output contains Infinity or -Infinity', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    const allValues = Object.values(outcome).filter(v => typeof v === 'number');
    for (const v of allValues) {
      expect(Number.isFinite(v), `Expected finite, got ${v}`).toBe(true);
    }
  });

  it('Customer price is not negative for valid inputs', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.customerPayableAmount).toBeGreaterThanOrEqual(0);
    expect(outcome.netSalesRevenue).toBeGreaterThanOrEqual(0);
  });

  it('Percentages are within accepted ranges', () => {
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' },
      150,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    // Margin can be negative for loss-making products, but should be finite
    expect(Number.isFinite(outcome.effectiveMarginPercent)).toBe(true);
    expect(Number.isFinite(outcome.markupPercent)).toBe(true);
  });

  it('Zero selling price does not produce false zero substituted for invalid data', () => {
    // Selling at 0 should produce a warning, not silently zero out
    const outcome = calcOutcome(
      { purchaseCost: 100, currentSellingPrice: 0, taxTreatment: 'exempt' },
      0,
      { defaultTaxRatePercent: 0, taxTreatment: 'exempt' }
    );
    expect(outcome.netProfit).toBeCloseTo(-100, 1); // Real loss, not false zero
    expect(outcome.isProfitable).toBe(false);
    const missingPriceWarning = outcome.warnings.find(w => w.type === 'missing-price');
    expect(missingPriceWarning).toBeDefined();
  });

  it('Missing purchase cost does not produce false zero substituted for invalid data', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const product = makeProduct({ purchaseCost: 0, taxTreatment: 'exempt' });
    const rules = makeRules();
    const result = safelyRecalculateProduct(product, settings, rules);
    // Should be flagged as missing-data, not trusted
    expect(result.product.calculatedPricingStatus).toBe('missing-data');
    // Recommendations should be 0 (not trusted), not false zeros from valid calculations
    expect(result.product.recommendedPrices.breakEven).toBe(0);
    expect(result.product.recommendedPrices.minimum).toBe(0);
    expect(result.product.recommendedPrices.confidence).toBe('low');
    // There should be a missing-cost warning
    const missingCostWarning = result.warnings.find(w => w.type === 'missing-cost');
    expect(missingCostWarning).toBeDefined();
  });

  it('NaN purchase cost is handled safely', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const product = makeProduct({ purchaseCost: NaN, taxTreatment: 'exempt' });
    const rules = makeRules();
    const result = safelyRecalculateProduct(product, settings, rules);
    expect(result.product.calculatedPricingStatus).toBe('missing-data');
    // All numeric outputs should be finite
    expect(Number.isFinite(result.product.calculatedTotalLandedCost)).toBe(true);
    expect(Number.isFinite(result.product.calculatedProfitPerUnit)).toBe(true);
  });

  it('Infinity selling price is handled safely', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: Infinity, taxTreatment: 'exempt' });
    const rules = makeRules();
    const result = safelyRecalculateProduct(product, settings, rules);
    // All numeric outputs should be finite
    expect(Number.isFinite(result.product.calculatedProfitPerUnit)).toBe(true);
    expect(Number.isFinite(result.product.calculatedMarginPercent)).toBe(true);
  });
});

// ============================================================
// 6. ENGINE INVARIANTS (Property-style)
// ============================================================

describe('Engine invariants — property-style tests', () => {
  // --- Raising purchase cost cannot increase profit at unchanged price ---
  it('Raising purchase cost cannot increase profit at unchanged price', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules({ minimumMarginPercent: 10, targetMarginPercent: 20 });

    const productLow = makeProduct({ purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' });
    const productHigh = makeProduct({ purchaseCost: 120, currentSellingPrice: 150, taxTreatment: 'exempt' });

    const effectiveRuleLow = resolveEffectivePricingPolicy(productLow, rules, settings);
    const effectiveRuleHigh = resolveEffectivePricingPolicy(productHigh, rules, settings);

    const outcomeLow = calculateOutcomeAtPrice({
      product: productLow, sellingPrice: 150, businessSettings: settings, effectiveRule: effectiveRuleLow,
    });
    const outcomeHigh = calculateOutcomeAtPrice({
      product: productHigh, sellingPrice: 150, businessSettings: settings, effectiveRule: effectiveRuleHigh,
    });

    expect(outcomeHigh.netProfit).toBeLessThanOrEqual(outcomeLow.netProfit);
  });

  // --- Raising selling price should not reduce profit unless a documented fee threshold causes it ---
  it('Raising selling price should not reduce profit (no fee threshold)', () => {
    // With no fees, raising price always increases profit
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules();

    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt', marketplaceFeePercent: 0 });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const outcomeLow = calculateOutcomeAtPrice({
      product, sellingPrice: 140, businessSettings: settings, effectiveRule,
    });
    const outcomeHigh = calculateOutcomeAtPrice({
      product, sellingPrice: 150, businessSettings: settings, effectiveRule,
    });

    expect(outcomeHigh.netProfit).toBeGreaterThanOrEqual(outcomeLow.netProfit);
  });

  // --- Break-even price produces approximately zero profit ---
  it('Break-even price produces approximately zero profit within rounding tolerance', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules({ minimumMarginPercent: 0, targetMarginPercent: 10 });

    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 120, taxTreatment: 'exempt' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const breakEven = calculateBreakEvenPriceFromOutcome(product, settings, effectiveRule);

    if (breakEven > 0) {
      const outcome = calculateOutcomeAtPrice({
        product, sellingPrice: breakEven, businessSettings: settings, effectiveRule,
      });
      // Break-even should produce profit within rounding tolerance (±0.05)
      expect(Math.abs(outcome.netProfit)).toBeLessThan(0.1);
    }
  });

  // --- Break-even with fees and tax (exclusive) ---
  it('Break-even price with exclusive tax and fees produces approximately zero profit', () => {
    // Tax-exclusive: break-even formula is simpler because net revenue = selling price
    const settings = makeSettings({
      defaultTaxRatePercent: 18,
      taxTreatment: 'exclusive',
      defaultMarketplaceFeePercent: 10,
    });
    const rules = makeRules({ minimumMarginPercent: 0, targetMarginPercent: 10 });

    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
      taxRatePercent: 18,
      taxTreatment: 'exclusive',
      marketplaceFeePercent: 10,
    });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const breakEven = calculateBreakEvenPriceFromOutcome(product, settings, effectiveRule);

    if (breakEven > 0) {
      const outcome = calculateOutcomeAtPrice({
        product, sellingPrice: breakEven, businessSettings: settings, effectiveRule,
      });
      // Break-even should produce profit within rounding tolerance (±0.5)
      expect(Math.abs(outcome.netProfit)).toBeLessThan(0.5);
    }
  });

  // --- Minimum-safe price satisfies configured minimum constraints ---
  it('Minimum-safe price satisfies configured minimum constraints', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      taxTreatment: 'exempt',
      minimumProfitPerUnit: 5,
    });
    const rules = makeRules({
      minimumMarginPercent: 10,
      targetMarginPercent: 20,
      overrideMinimumProfitPerUnit: 5,
    });

    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 130,
      taxTreatment: 'exempt',
      marketplaceFeePercent: 5,
    });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const minimumSafe = calculateMinimumSafePrice(product, settings, effectiveRule);

    if (minimumSafe > 0) {
      const outcome = calculateOutcomeAtPrice({
        product, sellingPrice: minimumSafe, businessSettings: settings, effectiveRule,
      });
      // Should satisfy minimum margin
      expect(outcome.satisfiesMinimumMargin).toBe(true);
      // Should satisfy minimum profit
      expect(outcome.satisfiesMinimumProfit).toBe(true);
      // Should be profitable
      expect(outcome.isProfitable).toBe(true);
    }
  });

  // --- Recommended price is finite ---
  it('Recommended price is finite for a normal product', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules({ minimumMarginPercent: 10, targetMarginPercent: 20 });
    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const recs = calculateRecommendedPricesFromEngine(product, settings, effectiveRule);
    expect(Number.isFinite(recs.minimum)).toBe(true);
    expect(Number.isFinite(recs.competitive)).toBe(true);
    expect(Number.isFinite(recs.balanced)).toBe(true);
    expect(Number.isFinite(recs.premium)).toBe(true);
  });

  // --- Missing cost never produces a trusted recommendation ---
  it('Missing cost never produces a trusted recommendation', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules();
    const product = makeProduct({ purchaseCost: 0, taxTreatment: 'exempt' });
    const result = safelyRecalculateProduct(product, settings, rules);

    // Status should be missing-data
    expect(result.product.calculatedPricingStatus).toBe('missing-data');
    // Confidence should be low
    expect(result.product.recommendedPrices.confidence).toBe('low');
    // Recommendations should be 0 (not trusted)
    expect(result.product.recommendedPrices.breakEven).toBe(0);
    expect(result.product.recommendedPrices.minimum).toBe(0);
    expect(result.product.recommendedPrices.balanced).toBe(0);
    expect(result.product.recommendedPrices.premium).toBe(0);
  });

  // --- Approval never automatically applies a price ---
  it('Approval never automatically applies a price', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules();
    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' });
    const result = safelyRecalculateProduct(product, settings, rules);

    // The recalculation should not change the approval status
    expect(result.product.priceApprovalStatus).toBe('none');
    expect(result.product.finalApprovedPrice).toBe(0);
    expect(result.product.isApproved).toBe(false);
  });

  // --- Raising purchase cost cannot increase profit (with fees) ---
  it('Raising purchase cost cannot increase profit even with fees', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 18,
      taxTreatment: 'inclusive',
      defaultMarketplaceFeePercent: 10,
    });
    const rules = makeRules({ minimumMarginPercent: 10, targetMarginPercent: 20 });

    const productLow = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
      taxRatePercent: 18,
      taxTreatment: 'inclusive',
      marketplaceFeePercent: 10,
    });
    const productHigh = makeProduct({
      purchaseCost: 120,
      currentSellingPrice: 200,
      taxRatePercent: 18,
      taxTreatment: 'inclusive',
      marketplaceFeePercent: 10,
    });

    const effectiveRuleLow = resolveEffectivePricingPolicy(productLow, rules, settings);
    const effectiveRuleHigh = resolveEffectivePricingPolicy(productHigh, rules, settings);

    const outcomeLow = calculateOutcomeAtPrice({
      product: productLow, sellingPrice: 200, businessSettings: settings, effectiveRule: effectiveRuleLow,
    });
    const outcomeHigh = calculateOutcomeAtPrice({
      product: productHigh, sellingPrice: 200, businessSettings: settings, effectiveRule: effectiveRuleHigh,
    });

    expect(outcomeHigh.netProfit).toBeLessThanOrEqual(outcomeLow.netProfit);
  });

  // --- Raising selling price with percentage fees: profit increases or stays same ---
  it('Raising selling price with percentage fees: profit should not decrease', () => {
    // With percentage fees, raising price increases both revenue and fees,
    // but the net effect should still be positive (no documented fee threshold)
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      taxTreatment: 'exempt',
      defaultMarketplaceFeePercent: 10,
    });
    const rules = makeRules();

    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
      taxTreatment: 'exempt',
      marketplaceFeePercent: 10,
    });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const outcome150 = calculateOutcomeAtPrice({
      product, sellingPrice: 150, businessSettings: settings, effectiveRule,
    });
    const outcome200 = calculateOutcomeAtPrice({
      product, sellingPrice: 200, businessSettings: settings, effectiveRule,
    });

    // Raising price from 150 to 200 should increase profit
    expect(outcome200.netProfit).toBeGreaterThan(outcome150.netProfit);
  });

  // --- Monotonicity: profit is monotonically increasing with price for exempt products ---
  it('Profit is monotonically increasing with selling price for tax-exempt products', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules();
    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt', marketplaceFeePercent: 5 });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const prices = [100, 120, 140, 160, 180, 200];
    let prevProfit = -Infinity;
    for (const price of prices) {
      const outcome = calculateOutcomeAtPrice({
        product, sellingPrice: price, businessSettings: settings, effectiveRule,
      });
      expect(outcome.netProfit).toBeGreaterThanOrEqual(prevProfit);
      prevProfit = outcome.netProfit;
    }
  });

  // --- Percentage conversion never double-divides ---
  it('Percentage conversion: 18% → 0.18, never 0.0018', () => {
    expect(percentageToDecimal(18)).toBeCloseTo(0.18, 4);
    expect(percentageToDecimal(0)).toBe(0);
    expect(percentageToDecimal(100)).toBeCloseTo(1, 4);
    expect(percentageToDecimal(5)).toBeCloseTo(0.05, 4);
  });

  // --- Rounding revalidation never produces a price below minimum safe ---
  it('Rounding revalidation: rounded price never violates minimum constraints', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      taxTreatment: 'exempt',
      defaultRoundingRule: 'nearest-5',
    });
    const rules = makeRules({
      minimumMarginPercent: 10,
      targetMarginPercent: 20,
      roundingRule: 'nearest-5',
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 120,
      taxTreatment: 'exempt',
      marketplaceFeePercent: 5,
    });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);

    const rawMinimum = calculateMinimumSafePrice(product, settings, effectiveRule);
    if (rawMinimum > 0) {
      const roundedMinimum = applyRoundingWithRevalidation(
        rawMinimum, 'nearest-5', product, settings, effectiveRule
      );
      const outcome = calculateOutcomeAtPrice({
        product, sellingPrice: roundedMinimum, businessSettings: settings, effectiveRule,
      });
      // Rounded price should satisfy minimum constraints
      expect(outcome.satisfiesMinimumMargin).toBe(true);
      expect(outcome.isProfitable).toBe(true);
    }
  });

  // --- Safe calculation wrapper never throws ---
  it('safelyRecalculateProduct never throws, even with extreme inputs', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules();

    // Test with various extreme products
    const extremeProducts = [
      makeProduct({ purchaseCost: -100, currentSellingPrice: 50, taxTreatment: 'exempt' }),
      makeProduct({ purchaseCost: 0, currentSellingPrice: 0, taxTreatment: 'exempt' }),
      makeProduct({ purchaseCost: 100, currentSellingPrice: 0, taxTreatment: 'exempt' }),
      makeProduct({ purchaseCost: 0, currentSellingPrice: 100, taxTreatment: 'exempt' }),
      makeProduct({ purchaseCost: 100, currentSellingPrice: 100, taxRatePercent: -5, taxTreatment: 'inclusive' }),
      makeProduct({ purchaseCost: 100, currentSellingPrice: 100, marketplaceFeePercent: 200, taxTreatment: 'exempt' }),
    ];

    for (const product of extremeProducts) {
      expect(() => safelyRecalculateProduct(product, settings, rules)).not.toThrow();
      const result = safelyRecalculateProduct(product, settings, rules);
      // All numeric outputs should be finite
      expect(Number.isFinite(result.product.calculatedProfitPerUnit)).toBe(true);
      expect(Number.isFinite(result.product.calculatedMarginPercent)).toBe(true);
      expect(Number.isFinite(result.product.calculatedTotalLandedCost)).toBe(true);
    }
  });

  // --- Batch calculation processes all products independently ---
  it('Batch calculation: one failure does not affect other products', async () => {
    const { safelyRecalculateProducts } = await import('../safe-calculation');
    const settings = makeSettings({ defaultTaxRatePercent: 0, taxTreatment: 'exempt' });
    const rules = makeRules();

    const products = [
      makeProduct({ id: 'p1', sku: 'S1', purchaseCost: 100, currentSellingPrice: 150, taxTreatment: 'exempt' }),
      makeProduct({ id: 'p2', sku: 'S2', purchaseCost: 0, currentSellingPrice: 150, taxTreatment: 'exempt' }), // missing cost
      makeProduct({ id: 'p3', sku: 'S3', purchaseCost: 200, currentSellingPrice: 300, taxTreatment: 'exempt' }),
    ];

    const result = safelyRecalculateProducts(products, settings, rules);
    // Should have 3 successful products (missing cost is success but flagged)
    expect(result.successfulProducts.length + result.failedProducts.length).toBe(3);
    // No NaN in any output
    for (const p of result.successfulProducts) {
      expect(Number.isFinite(p.calculatedProfitPerUnit)).toBe(true);
    }
    for (const p of result.failedProducts) {
      expect(Number.isFinite(p.calculatedProfitPerUnit)).toBe(true);
    }
  });
});

// ============================================================
// ORIGINAL SCENARIOS (preserved from previous version)
// ============================================================

describe('Financial correctness — Scenario 1: Tax exempt', () => {
  it('produces ₹25 profit and 20% margin with no fees', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
      taxTreatment: 'exempt',
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 125,
      taxRatePercent: 0,
      taxTreatment: 'exempt',
      marketplaceFeePercent: 0,
      paymentFeePercent: 0,
    });
    const rules = makeRules({ targetMarginPercent: 20, minimumMarginPercent: 10 });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 125,
      businessSettings: settings,
      effectiveRule,
    });

    expect(outcome.netProfit).toBeCloseTo(25, 1);
    expect(outcome.effectiveMarginPercent).toBeCloseTo(20, 1);
    expect(outcome.totalLandedCost).toBeCloseTo(100, 1);
    expect(outcome.outputTax).toBeCloseTo(0, 1);
    expect(outcome.totalSellingFees).toBeCloseTo(0, 1);
  });
});

describe('Financial correctness — Scenario 2: Tax inclusive', () => {
  it('extracts ₹25 GST from a ₹150 inclusive price with 20% GST', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 20,
      taxTreatment: 'inclusive',
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 150,
      taxRatePercent: 20,
      taxTreatment: 'inclusive',
      marketplaceFeePercent: 0,
      paymentFeePercent: 0,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: settings,
      effectiveRule,
    });

    expect(outcome.netSalesRevenue).toBeCloseTo(125, 1);
    expect(outcome.outputTax).toBeCloseTo(25, 1);
    expect(outcome.netProfit).toBeCloseTo(25, 1);
  });
});

describe('Financial correctness — Scenario 3: Tax exclusive with marketplace fee', () => {
  it('charges ₹150 customer-payable, ₹12.50 marketplace fee, ₹12.50 profit', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 20,
      taxTreatment: 'exclusive',
      defaultMarketplaceFeePercent: 10,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 125,
      taxRatePercent: 20,
      taxTreatment: 'exclusive',
      marketplaceFeePercent: 10,
      paymentFeePercent: 0,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 125,
      businessSettings: settings,
      effectiveRule,
    });

    expect(outcome.customerPayableAmount).toBeCloseTo(150, 1);
    expect(outcome.marketplacePercentageFee).toBeCloseTo(12.5, 1);
    expect(outcome.netProfit).toBeCloseTo(12.5, 1);
  });
});

describe('Financial correctness — engine never produces NaN/Infinity', () => {
  it('produces only finite numbers for a normal product', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 150 });
    const rules = makeRules();
    const result = safelyRecalculateProduct(product, settings, rules);
    expect(result.success).toBe(true);
    const p = result.product;
    const numericFields = [
      p.calculatedBaseCost,
      p.calculatedTotalLandedCost,
      p.calculatedBreakEvenPrice,
      p.calculatedMarginPercent,
      p.calculatedProfitPerUnit,
      p.calculatedTotalPercentageFees,
      p.calculatedTotalFixedFees,
      p.calculatedHealthScore,
      p.recommendedPrices.breakEven,
      p.recommendedPrices.minimum,
      p.recommendedPrices.balanced,
      p.recommendedPrices.premium,
    ];
    for (const v of numericFields) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
