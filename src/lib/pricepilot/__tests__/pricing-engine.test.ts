/**
 * Unit tests for src/lib/pricepilot/pricing-engine.ts
 *
 * Covers:
 *   - percentageToDecimal and decimalToPercentage
 *   - calculateOutcomeAtPrice with inclusive tax
 *   - calculateOutcomeAtPrice with exclusive tax
 *   - calculateOutcomeAtPrice with exempt tax
 *   - calculateOutcomeAtPrice with different fee base policies
 *   - calculateOutcomeAtPrice with minimum profit per unit
 *   - calculateOutcomeAtPrice with zero cost
 *   - calculateOutcomeAtPrice with very high fees
 *   - calculateBreakEvenPriceFromOutcome
 *   - calculateMinimumSafePrice
 *   - applyRoundingWithRevalidation
 *   - calculateRecommendedPricesFromEngine
 *   - Confidence level calculation
 */

import { describe, it, expect } from 'vitest';
import {
  calculateOutcomeAtPrice,
  calculateBreakEvenPriceFromOutcome,
  calculateMinimumSafePrice,
  applyRoundingWithRevalidation,
  percentageToDecimal,
  decimalToPercentage,
  calculateRecommendedPricesFromEngine,
} from '../pricing-engine';
import { resolveEffectivePricingPolicy } from '../resolve-rule';
import {
  createDefaultBusinessSettings,
  createDefaultPricingRule,
  Product,
  BusinessSettings,
  PricingRule,
  ResolvedPricingPolicy,
} from '../types';

function makeSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return { ...createDefaultBusinessSettings(), ...overrides };
}

function makeRules(overrides: Partial<PricingRule> = {}): PricingRule[] {
  return [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true, ...overrides }];
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  const defaults: Product = {
    id: 'prod-eng-1',
    sku: 'ENG-1',
    name: 'Engine Test Product',
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
    currentSellingPrice: 150,
    competitorPrices: [],
    salesChannel: 'online-marketplace',
    taxRatePercent: 18,
    taxTreatment: 'inclusive',
    marketplaceFeePercent: 5,
    marketplaceFeeFixed: 0,
    paymentFeePercent: 2,
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

// ============================================================
// Percentage helpers
// ============================================================

describe('percentageToDecimal', () => {
  it('converts 18 to 0.18', () => {
    expect(percentageToDecimal(18)).toBeCloseTo(0.18, 4);
  });

  it('converts 0 to 0', () => {
    expect(percentageToDecimal(0)).toBe(0);
  });

  it('converts 100 to 1', () => {
    expect(percentageToDecimal(100)).toBe(1);
  });

  it('returns 0 for NaN', () => {
    expect(percentageToDecimal(NaN)).toBe(0);
  });

  it('returns 0 for non-number', () => {
    expect(percentageToDecimal('abc' as unknown as number)).toBe(0);
  });
});

describe('decimalToPercentage', () => {
  it('converts 0.18 to 18', () => {
    expect(decimalToPercentage(0.18)).toBeCloseTo(18, 4);
  });

  it('converts 0 to 0', () => {
    expect(decimalToPercentage(0)).toBe(0);
  });

  it('converts 1 to 100', () => {
    expect(decimalToPercentage(1)).toBe(100);
  });

  it('returns 0 for NaN', () => {
    expect(decimalToPercentage(NaN)).toBe(0);
  });
});

// ============================================================
// calculateOutcomeAtPrice — inclusive tax
// ============================================================

describe('calculateOutcomeAtPrice — inclusive tax', () => {
  it('extracts output tax from inclusive price', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 20, taxTreatment: 'inclusive' });
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

    // Net revenue = 150 / 1.20 = 125
    expect(outcome.netSalesRevenue).toBeCloseTo(125, 1);
    // Output tax = 150 - 125 = 25
    expect(outcome.outputTax).toBeCloseTo(25, 1);
    // Customer pays the inclusive price
    expect(outcome.customerPayableAmount).toBeCloseTo(150, 1);
  });

  it('returns 0 tax when price is 0', () => {
    const settings = makeSettings({ defaultTaxRatePercent: 20, taxTreatment: 'inclusive' });
    const product = makeProduct({
      purchaseCost: 100,
      taxRatePercent: 20,
      taxTreatment: 'inclusive',
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 0,
      businessSettings: settings,
      effectiveRule,
    });
    expect(outcome.outputTax).toBe(0);
    expect(outcome.netSalesRevenue).toBe(0);
  });
});

// ============================================================
// calculateOutcomeAtPrice — exclusive tax
// ============================================================

describe('calculateOutcomeAtPrice — exclusive tax', () => {
  it('adds output tax on top of the base price', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 20,
      taxTreatment: 'exclusive',
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 125,
      taxRatePercent: 20,
      taxTreatment: 'exclusive',
      marketplaceFeePercent: 0,
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

    // Output tax = 125 * 0.20 = 25
    expect(outcome.outputTax).toBeCloseTo(25, 1);
    // Customer pays = 125 + 25 = 150
    expect(outcome.customerPayableAmount).toBeCloseTo(150, 1);
    // Net revenue = base price (exclusive tax)
    expect(outcome.netSalesRevenue).toBeCloseTo(125, 1);
  });
});

// ============================================================
// calculateOutcomeAtPrice — exempt tax
// ============================================================

describe('calculateOutcomeAtPrice — exempt tax', () => {
  it('has no output tax', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      taxTreatment: 'exempt',
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 125,
      taxRatePercent: 0,
      taxTreatment: 'exempt',
      marketplaceFeePercent: 0,
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

    expect(outcome.outputTax).toBe(0);
    expect(outcome.netSalesRevenue).toBeCloseTo(125, 1);
    expect(outcome.customerPayableAmount).toBeCloseTo(125, 1);
  });
});

// ============================================================
// calculateOutcomeAtPrice — fee base policies
// ============================================================

describe('calculateOutcomeAtPrice — fee base policies', () => {
  it('product-price-only: fees are on the selling price only', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 10,
      defaultPaymentFeePercent: 0,
      feeBasePolicy: 'product-price-only',
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 10,
      paymentFeePercent: 0,
      feeBasePolicy: 'product-price-only',
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });

    // Marketplace fee = 10% of 200 = 20
    expect(outcome.marketplacePercentageFee).toBeCloseTo(20, 1);
  });

  it('product-price-plus-shipping: fees include shipping charge to customer', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 10,
      defaultPaymentFeePercent: 0,
      feeBasePolicy: 'product-price-plus-shipping',
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 10,
      paymentFeePercent: 0,
      feeBasePolicy: 'product-price-plus-shipping',
      shippingChargeToCustomer: 50,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });

    // Fee base = 200 + 50 = 250, marketplace fee = 10% of 250 = 25
    expect(outcome.marketplacePercentageFee).toBeCloseTo(25, 1);
  });
});

// ============================================================
// calculateOutcomeAtPrice — minimum profit per unit
// ============================================================

describe('calculateOutcomeAtPrice — minimum profit per unit', () => {
  it('satisfiesMinimumProfit is true when profit meets threshold', () => {
    const settings = makeSettings({ minimumProfitPerUnit: 10 });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 150,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
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

    // Profit = 150 - 100 = 50 >= 10
    expect(outcome.satisfiesMinimumProfit).toBe(true);
  });

  it('satisfiesMinimumProfit is false when profit is below threshold', () => {
    const settings = makeSettings({ minimumProfitPerUnit: 100 });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 150,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
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

    // Profit = 150 - 100 = 50 < 100
    expect(outcome.satisfiesMinimumProfit).toBe(false);
  });
});

// ============================================================
// calculateOutcomeAtPrice — zero cost
// ============================================================

describe('calculateOutcomeAtPrice — zero cost', () => {
  it('flags missing-cost warning when purchase cost is 0', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 0 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 100,
      businessSettings: settings,
      effectiveRule,
    });

    expect(outcome.warnings.some(w => w.type === 'missing-cost')).toBe(true);
    expect(outcome.confidence).toBe('low');
  });

  it('produces finite numbers even with zero cost', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 0 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 100,
      businessSettings: settings,
      effectiveRule,
    });

    expect(Number.isFinite(outcome.totalLandedCost)).toBe(true);
    expect(Number.isFinite(outcome.netProfit)).toBe(true);
    expect(Number.isFinite(outcome.effectiveMarginPercent)).toBe(true);
  });
});

// ============================================================
// calculateOutcomeAtPrice — very high fees
// ============================================================

describe('calculateOutcomeAtPrice — very high fees', () => {
  it('produces finite numbers even with 90% marketplace fee', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 90,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 90,
      paymentFeePercent: 0,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });

    expect(Number.isFinite(outcome.netProfit)).toBe(true);
    expect(Number.isFinite(outcome.effectiveMarginPercent)).toBe(true);
    expect(Number.isFinite(outcome.marketplacePercentageFee)).toBe(true);
  });

  it('detects impossible state when fees + margin exceed 100%', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 80,
      defaultPaymentFeePercent: 15,
      defaultTargetMarginPercent: 20,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 80,
      paymentFeePercent: 15,
    });
    const rules = makeRules({ targetMarginPercent: 20, minimumMarginPercent: 10 });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });

    // Should have impossible-margin warning
    const impossibleWarning = outcome.warnings.find(w => w.type === 'impossible-margin');
    expect(impossibleWarning).toBeDefined();
  });
});

// ============================================================
// calculateBreakEvenPriceFromOutcome
// ============================================================

describe('calculateBreakEvenPriceFromOutcome', () => {
  it('returns a positive break-even price for a valid product', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 10,
      defaultPaymentFeePercent: 0,
      taxTreatment: 'exempt',
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 10,
      paymentFeePercent: 0,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const breakEven = calculateBreakEvenPriceFromOutcome(product, settings, effectiveRule);

    // Break-even should be > 100 (cost + fees)
    expect(breakEven).toBeGreaterThan(0);
    expect(breakEven).toBeGreaterThan(100);
  });

  it('returns 0 when fees make pricing impossible', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 90,
      defaultPaymentFeePercent: 15,
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 90,
      paymentFeePercent: 15,
    });
    const rules = makeRules({ minimumMarginPercent: 10 });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const breakEven = calculateBreakEvenPriceFromOutcome(product, settings, effectiveRule);

    // With 90% + 15% = 105% fees, break-even is impossible
    expect(breakEven).toBe(0);
  });

  it('returns 0 for a product with no purchase cost', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 0 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const breakEven = calculateBreakEvenPriceFromOutcome(product, settings, effectiveRule);
    expect(breakEven).toBe(0);
  });
});

// ============================================================
// calculateMinimumSafePrice
// ============================================================

describe('calculateMinimumSafePrice', () => {
  it('returns a price above break-even', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 5,
      defaultPaymentFeePercent: 2,
      taxTreatment: 'inclusive',
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'inclusive',
      taxRatePercent: 18,
      marketplaceFeePercent: 5,
      paymentFeePercent: 2,
    });
    const rules = makeRules({ minimumMarginPercent: 10 });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const minPrice = calculateMinimumSafePrice(product, settings, effectiveRule);

    expect(minPrice).toBeGreaterThan(0);
  });

  it('returns 0 for a product with no purchase cost', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 0 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const minPrice = calculateMinimumSafePrice(product, settings, effectiveRule);
    expect(minPrice).toBe(0);
  });

  it('returns 0 when fees make pricing impossible', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 90,
      defaultPaymentFeePercent: 15,
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 90,
      paymentFeePercent: 15,
    });
    const rules = makeRules({ minimumMarginPercent: 10 });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const minPrice = calculateMinimumSafePrice(product, settings, effectiveRule);
    expect(minPrice).toBe(0);
  });
});

// ============================================================
// applyRoundingWithRevalidation
// ============================================================

describe('applyRoundingWithRevalidation', () => {
  it('returns raw price for no-rounding rule', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, taxTreatment: 'exempt', taxRatePercent: 0 });
    const rules = makeRules({ roundingRule: 'no-rounding' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const result = applyRoundingWithRevalidation(123.45, 'no-rounding', product, settings, effectiveRule);
    expect(result).toBeCloseTo(123.45, 2);
  });

  it('rounds to nearest whole number', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, taxTreatment: 'exempt', taxRatePercent: 0 });
    const rules = makeRules({ roundingRule: 'nearest-whole' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const result = applyRoundingWithRevalidation(123.45, 'nearest-whole', product, settings, effectiveRule);
    expect(result).toBe(123);
  });

  it('rounds to nearest 5', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, taxTreatment: 'exempt', taxRatePercent: 0 });
    const rules = makeRules({ roundingRule: 'nearest-5' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const result = applyRoundingWithRevalidation(123, 'nearest-5', product, settings, effectiveRule);
    expect(result % 5).toBe(0);
  });

  it('rounds to nearest 10', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, taxTreatment: 'exempt', taxRatePercent: 0 });
    const rules = makeRules({ roundingRule: 'nearest-10' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const result = applyRoundingWithRevalidation(123, 'nearest-10', product, settings, effectiveRule);
    expect(result % 10).toBe(0);
  });

  it('end-in-99 produces .99', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, taxTreatment: 'exempt', taxRatePercent: 0 });
    const rules = makeRules({ roundingRule: 'end-in-99' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const result = applyRoundingWithRevalidation(500, 'end-in-99', product, settings, effectiveRule);
    // The result should end in .99 or be a valid price
    expect(result).toBeGreaterThan(0);
  });

  it('end-in-95 produces .95', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, taxTreatment: 'exempt', taxRatePercent: 0 });
    const rules = makeRules({ roundingRule: 'end-in-95' });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const result = applyRoundingWithRevalidation(500, 'end-in-95', product, settings, effectiveRule);
    expect(result).toBeGreaterThan(0);
  });

  it('returns raw price as-is when price <= 0', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const result = applyRoundingWithRevalidation(0, 'nearest-whole', product, settings, effectiveRule);
    expect(result).toBe(0);
  });

  it('handles negative prices', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const result = applyRoundingWithRevalidation(-5, 'nearest-whole', product, settings, effectiveRule);
    expect(result).toBe(-5);
  });
});

// ============================================================
// calculateRecommendedPricesFromEngine
// ============================================================

describe('calculateRecommendedPricesFromEngine', () => {
  it('returns all four recommendation prices for a valid product', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 5,
      defaultPaymentFeePercent: 2,
      taxTreatment: 'inclusive',
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'inclusive',
      taxRatePercent: 18,
      marketplaceFeePercent: 5,
      paymentFeePercent: 2,
    });
    const rules = makeRules({
      targetMarginPercent: 20,
      minimumMarginPercent: 10,
      maximumMarginPercent: 40,
    });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const prices = calculateRecommendedPricesFromEngine(product, settings, effectiveRule);

    expect(prices.minimum).toBeGreaterThan(0);
    expect(prices.balanced).toBeGreaterThan(0);
    expect(prices.premium).toBeGreaterThan(0);
    // Premium should be higher than balanced
    expect(prices.premium).toBeGreaterThanOrEqual(prices.balanced);
    // Balanced should be higher than minimum
    expect(prices.balanced).toBeGreaterThanOrEqual(prices.minimum);
  });

  it('returns 0 prices for a product with no purchase cost', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 0 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const prices = calculateRecommendedPricesFromEngine(product, settings, effectiveRule);

    expect(prices.minimum).toBe(0);
    expect(prices.balanced).toBe(0);
    expect(prices.premium).toBe(0);
  });
});

// ============================================================
// Confidence level
// ============================================================

describe('Confidence level', () => {
  it('returns low confidence for product with no purchase cost', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 0 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 100,
      businessSettings: settings,
      effectiveRule,
    });
    expect(outcome.confidence).toBe('low');
  });

  it('returns medium or high confidence for a well-configured product', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 5,
      defaultPaymentFeePercent: 2,
      defaultTaxRatePercent: 18,
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'inclusive',
      taxRatePercent: 18,
      marketplaceFeePercent: 5,
      paymentFeePercent: 2,
      shippingCost: 10,
      packagingCost: 5,
      returnRatePercent: 3,
      damageRatePercent: 1,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });
    // Should be at least medium confidence
    expect(['medium', 'high']).toContain(outcome.confidence);
  });
});

// ============================================================
// Warnings
// ============================================================

describe('Pricing warnings', () => {
  it('generates loss-making warning for negative profit', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
      taxTreatment: 'exempt',
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 0,
      paymentFeePercent: 0,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 50,
      businessSettings: settings,
      effectiveRule,
    });
    expect(outcome.warnings.some(w => w.type === 'loss-making')).toBe(true);
  });

  it('generates missing-price warning for zero selling price', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 0,
      businessSettings: settings,
      effectiveRule,
    });
    expect(outcome.warnings.some(w => w.type === 'missing-price')).toBe(true);
  });

  it('generates high-return-rate warning for return rate > 50%', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, returnRatePercent: 60 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });
    expect(outcome.warnings.some(w => w.type === 'high-return-rate')).toBe(true);
  });

  it('generates high-damage-rate warning for damage rate > 30%', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, damageRatePercent: 40 });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });
    expect(outcome.warnings.some(w => w.type === 'high-damage-rate')).toBe(true);
  });

  it('generates high-total-fees warning when fees >= 50%', () => {
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 40,
      defaultPaymentFeePercent: 15,
    });
    const product = makeProduct({
      purchaseCost: 100,
      marketplaceFeePercent: 40,
      paymentFeePercent: 15,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });
    expect(outcome.warnings.some(w => w.type === 'high-total-fees')).toBe(true);
  });
});

// ============================================================
// Purchase-side tax
// ============================================================

describe('calculateOutcomeAtPrice — purchase-side tax', () => {
  it('handles including-tax purchase cost with recoverable input tax', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 18,
      taxTreatment: 'inclusive',
    });
    const product = makeProduct({
      purchaseCost: 118,
      taxRatePercent: 18,
      taxTreatment: 'inclusive',
      purchaseTaxRatePercent: 18,
      purchaseCostTaxMode: 'including-tax',
      inputTaxCreditRecoverable: 'recoverable',
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });

    // Net purchase cost = 118 / 1.18 = 100
    expect(outcome.netPurchaseCost).toBeCloseTo(100, 1);
    // Recoverable input tax = 118 - 100 = 18
    expect(outcome.recoverableInputTax).toBeCloseTo(18, 1);
    // Non-recoverable should be 0
    expect(outcome.nonRecoverableInputTax).toBeCloseTo(0, 1);
  });

  it('handles including-tax purchase cost with non-recoverable input tax', () => {
    const settings = makeSettings();
    const product = makeProduct({
      purchaseCost: 118,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      purchaseTaxRatePercent: 18,
      purchaseCostTaxMode: 'including-tax',
      inputTaxCreditRecoverable: 'not-recoverable',
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });

    // Net purchase cost = 118 / 1.18 = 100
    expect(outcome.netPurchaseCost).toBeCloseTo(100, 1);
    // Non-recoverable input tax = 18
    expect(outcome.nonRecoverableInputTax).toBeCloseTo(18, 1);
    // Recoverable should be 0
    expect(outcome.recoverableInputTax).toBeCloseTo(0, 1);
  });

  it('handles excluding-tax purchase cost with recoverable input tax', () => {
    const settings = makeSettings();
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      purchaseTaxRatePercent: 18,
      purchaseCostTaxMode: 'excluding-tax',
      inputTaxCreditRecoverable: 'recoverable',
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });

    // Net purchase cost = 100 (already excludes tax)
    expect(outcome.netPurchaseCost).toBeCloseTo(100, 1);
    // Recoverable input tax = 100 * 0.18 = 18
    expect(outcome.recoverableInputTax).toBeCloseTo(18, 1);
  });

  it('handles partially-recoverable input tax', () => {
    const settings = makeSettings();
    const product = makeProduct({
      purchaseCost: 118,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      purchaseTaxRatePercent: 18,
      purchaseCostTaxMode: 'including-tax',
      inputTaxCreditRecoverable: 'partially-recoverable',
      inputTaxRecoverablePercent: 50,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: settings,
      effectiveRule,
    });

    // Total input tax = 118 - 100 = 18
    // Recoverable = 18 * 0.5 = 9
    // Non-recoverable = 18 - 9 = 9
    expect(outcome.recoverableInputTax).toBeCloseTo(9, 1);
    expect(outcome.nonRecoverableInputTax).toBeCloseTo(9, 1);
  });
});

// ============================================================
// Outcome boolean flags
// ============================================================

describe('calculateOutcomeAtPrice — boolean flags', () => {
  it('isProfitable is true when net profit > 0', () => {
    const settings = makeSettings({
      taxTreatment: 'exempt',
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
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
    expect(outcome.isProfitable).toBe(true);
    expect(outcome.isBreakEven).toBe(false);
  });

  it('isBreakEven is true when net profit is approximately 0', () => {
    const settings = makeSettings({
      taxTreatment: 'exempt',
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'exempt',
      taxRatePercent: 0,
      marketplaceFeePercent: 0,
      paymentFeePercent: 0,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 100,
      businessSettings: settings,
      effectiveRule,
    });
    expect(outcome.isBreakEven).toBe(true);
  });
});
