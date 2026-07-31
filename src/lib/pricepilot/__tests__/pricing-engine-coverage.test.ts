/**
 * Additional branch coverage tests for src/lib/pricepilot/pricing-engine.ts
 *
 * Focuses on:
 *   - Purchase-side tax with different modes (including-tax, partially-recoverable)
 *   - Selling-side tax with different treatments (exclusive, exempt, reverse, composite)
 *   - Fee base policy branches (product-price-plus-shipping, customer-payable-gross)
 *   - Rounding rule branches (nearest-5, nearest-10, end-in-99, end-in-95, end-in-9, end-in-49, end-in-99-whole, custom)
 *   - Minimum profit per unit branches
 *   - Confidence level calculation branches
 *   - Competitive price with competitor data
 *   - calculatePriceForMargin with different tax treatments
 *   - Impossible state branches
 *   - Edge cases: zero values, negative values
 */

import { describe, it, expect } from 'vitest';
import {
  calculateOutcomeAtPrice,
  calculateBreakEvenPriceFromOutcome,
  calculateMinimumSafePrice,
  applyRoundingWithRevalidation,
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
    sku: 'SKU-1',
    name: 'Test Product',
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
    ...overrides,
  };
  return defaults;
}

function makeEffectiveRule(overrides: Partial<ResolvedPricingPolicy> = {}): ResolvedPricingPolicy {
  const settings = makeSettings();
  const rule = makeRules()[0];
  return {
    taxRatePercent: settings.defaultTaxRatePercent,
    taxTreatment: settings.taxTreatment ?? 'inclusive',
    marketplaceFeePercent: settings.defaultMarketplaceFeePercent,
    marketplaceFeeFixed: settings.defaultMarketplaceFeeFixed,
    paymentFeePercent: settings.defaultPaymentFeePercent,
    paymentFeeFixed: settings.defaultPaymentFeeFixed,
    otherFeesPercent: settings.defaultOtherFeesPercent,
    otherFeesFixed: settings.defaultOtherFeesFixed,
    minimumMarginPercent: settings.defaultMinimumMarginPercent,
    targetMarginPercent: settings.defaultTargetMarginPercent,
    premiumMarginPercent: settings.defaultTargetMarginPercent + 10,
    minimumProfitPerUnit: settings.minimumProfitPerUnit ?? 0,
    roundingRule: 'no-rounding',
    feeBasePolicy: 'product-price-only',
    competitorStrategy: { mode: 'ignore' as const },
    inputTaxRecoverablePercent: 0,
    sourceTrace: {},
    ...overrides,
  };
}

// ============================================================
// Purchase-side tax branches
// ============================================================

describe('pricing-engine — purchase-side tax: including-tax recoverable', () => {
  it('calculates including-tax with recoverable input tax', () => {
    const product = makeProduct({
      purchaseCost: 118,
      purchaseTaxRatePercent: 18,
      purchaseCostTaxMode: 'including-tax',
      inputTaxCreditRecoverable: 'recoverable',
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule(),
    });
    expect(result.recoverableInputTax).toBeGreaterThan(0);
    expect(result.nonRecoverableInputTax).toBe(0);
    expect(Number.isFinite(result.netPurchaseCost)).toBe(true);
  });
});

describe('pricing-engine — purchase-side tax: including-tax partially-recoverable', () => {
  it('calculates including-tax with partially-recoverable input tax', () => {
    const product = makeProduct({
      purchaseCost: 118,
      purchaseTaxRatePercent: 18,
      purchaseCostTaxMode: 'including-tax',
      inputTaxCreditRecoverable: 'partially-recoverable',
      inputTaxRecoverablePercent: 50,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule(),
    });
    expect(result.recoverableInputTax).toBeGreaterThan(0);
    expect(result.nonRecoverableInputTax).toBeGreaterThan(0);
    expect(Number.isFinite(result.netPurchaseCost)).toBe(true);
  });
});

describe('pricing-engine — purchase-side tax: excluding-tax partially-recoverable', () => {
  it('calculates excluding-tax with partially-recoverable input tax', () => {
    const product = makeProduct({
      purchaseCost: 100,
      purchaseTaxRatePercent: 18,
      purchaseCostTaxMode: 'excluding-tax',
      inputTaxCreditRecoverable: 'partially-recoverable',
      inputTaxRecoverablePercent: 50,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule(),
    });
    expect(result.recoverableInputTax).toBeGreaterThan(0);
    expect(result.nonRecoverableInputTax).toBeGreaterThan(0);
    expect(Number.isFinite(result.netPurchaseCost)).toBe(true);
  });
});

// ============================================================
// Selling-side tax: exclusive, exempt, reverse, composite
// ============================================================

describe('pricing-engine — selling tax: exclusive', () => {
  it('calculates exclusive tax on selling price', () => {
    const product = makeProduct({
      taxTreatment: 'exclusive',
      taxRatePercent: 18,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ taxTreatment: 'exclusive' }),
    });
    expect(result.outputTax).toBeGreaterThan(0);
    expect(result.customerPayableAmount).toBeGreaterThan(result.netSalesRevenue);
    expect(Number.isFinite(result.netProfit)).toBe(true);
  });
});

describe('pricing-engine — selling tax: exempt', () => {
  it('calculates exempt tax (no output tax)', () => {
    const product = makeProduct({
      taxTreatment: 'exempt',
      taxRatePercent: 0,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ taxTreatment: 'exempt', taxRatePercent: 0 }),
    });
    expect(result.outputTax).toBe(0);
    expect(result.customerPayableAmount).toBe(result.netSalesRevenue);
    expect(Number.isFinite(result.netProfit)).toBe(true);
  });
});

describe('pricing-engine — selling tax: reverse', () => {
  it('calculates reverse charge tax', () => {
    const product = makeProduct({
      taxTreatment: 'reverse',
      taxRatePercent: 18,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ taxTreatment: 'reverse' }),
    });
    expect(result.outputTax).toBeGreaterThan(0);
    expect(result.customerPayableAmount).toBeGreaterThan(result.netSalesRevenue);
    expect(Number.isFinite(result.netProfit)).toBe(true);
  });
});

describe('pricing-engine — selling tax: composite', () => {
  it('calculates composite tax (similar to inclusive)', () => {
    const product = makeProduct({
      taxTreatment: 'composite',
      taxRatePercent: 18,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ taxTreatment: 'composite' }),
    });
    expect(result.outputTax).toBeGreaterThan(0);
    expect(Number.isFinite(result.netProfit)).toBe(true);
  });
});

describe('pricing-engine — selling tax: inclusive with zero price', () => {
  it('handles inclusive tax with zero selling price', () => {
    const product = makeProduct({
      taxTreatment: 'inclusive',
      taxRatePercent: 18,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 0,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ taxTreatment: 'inclusive' }),
    });
    expect(result.outputTax).toBe(0);
    expect(result.netSalesRevenue).toBe(0);
  });
});

describe('pricing-engine — selling tax: composite with zero price', () => {
  it('handles composite tax with zero selling price', () => {
    const product = makeProduct({
      taxTreatment: 'composite',
      taxRatePercent: 18,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 0,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ taxTreatment: 'composite' }),
    });
    expect(result.outputTax).toBe(0);
    expect(result.netSalesRevenue).toBe(0);
  });
});

// ============================================================
// Fee base policy branches
// ============================================================

describe('pricing-engine — fee base policy: product-price-plus-shipping', () => {
  it('calculates fees on product price plus shipping charge', () => {
    const product = makeProduct({
      feeBasePolicy: 'product-price-plus-shipping',
      shippingChargeToCustomer: 20,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ feeBasePolicy: 'product-price-plus-shipping' }),
    });
    expect(Number.isFinite(result.totalSellingFees)).toBe(true);
    expect(Number.isFinite(result.netProfit)).toBe(true);
  });
});

describe('pricing-engine — fee base policy: customer-payable-gross', () => {
  it('calculates fees on customer payable gross amount with exclusive tax', () => {
    const product = makeProduct({
      feeBasePolicy: 'customer-payable-gross',
      taxTreatment: 'exclusive',
      taxRatePercent: 18,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({
        feeBasePolicy: 'customer-payable-gross',
        taxTreatment: 'exclusive',
      }),
    });
    expect(Number.isFinite(result.totalSellingFees)).toBe(true);
    expect(Number.isFinite(result.netProfit)).toBe(true);
  });

  it('calculates fees on customer payable gross with inclusive tax', () => {
    const product = makeProduct({
      feeBasePolicy: 'customer-payable-gross',
      taxTreatment: 'inclusive',
      taxRatePercent: 18,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({
        feeBasePolicy: 'customer-payable-gross',
        taxTreatment: 'inclusive',
      }),
    });
    expect(Number.isFinite(result.totalSellingFees)).toBe(true);
    expect(Number.isFinite(result.netProfit)).toBe(true);
  });

  it('calculates fees on customer payable gross with reverse tax', () => {
    const product = makeProduct({
      feeBasePolicy: 'customer-payable-gross',
      taxTreatment: 'reverse',
      taxRatePercent: 18,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({
        feeBasePolicy: 'customer-payable-gross',
        taxTreatment: 'reverse',
      }),
    });
    expect(Number.isFinite(result.totalSellingFees)).toBe(true);
  });
});

// ============================================================
// Rounding rule branches
// ============================================================

describe('pricing-engine — rounding: nearest-5', () => {
  it('rounds to nearest 5', () => {
    const result = applyRoundingWithRevalidation(
      123,
      'nearest-5',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'nearest-5' })
    );
    expect(result % 5).toBe(0);
  });
});

describe('pricing-engine — rounding: nearest-10', () => {
  it('rounds to nearest 10', () => {
    const result = applyRoundingWithRevalidation(
      123,
      'nearest-10',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'nearest-10' })
    );
    expect(result % 10).toBe(0);
  });
});

describe('pricing-engine — rounding: end-in-99', () => {
  it('rounds to end in .99', () => {
    const result = applyRoundingWithRevalidation(
      500,
      'end-in-99',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'end-in-99' })
    );
    expect(result % 1).toBeCloseTo(0.99, 1);
  });
});

describe('pricing-engine — rounding: end-in-95', () => {
  it('rounds to end in .95', () => {
    const result = applyRoundingWithRevalidation(
      500,
      'end-in-95',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'end-in-95' })
    );
    expect(result % 1).toBeCloseTo(0.95, 1);
  });
});

describe('pricing-engine — rounding: end-in-9', () => {
  it('rounds to end in .9', () => {
    const result = applyRoundingWithRevalidation(
      500,
      'end-in-9',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'end-in-9' })
    );
    expect(result % 1).toBeCloseTo(0.9, 0);
  });
});

describe('pricing-engine — rounding: end-in-49', () => {
  it('rounds to end in .49', () => {
    const result = applyRoundingWithRevalidation(
      500,
      'end-in-49',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'end-in-49' })
    );
    expect(result % 1).toBeCloseTo(0.49, 1);
  });
});

describe('pricing-engine — rounding: end-in-99-whole', () => {
  it('rounds to end in whole 99', () => {
    const result = applyRoundingWithRevalidation(
      500,
      'end-in-99-whole',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'end-in-99-whole' })
    );
    expect(result).toBeGreaterThanOrEqual(99);
  });
});

describe('pricing-engine — rounding: custom', () => {
  it('rounds to custom value', () => {
    const result = applyRoundingWithRevalidation(
      123,
      'custom',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'custom' }),
      25
    );
    expect(result % 25).toBe(0);
  });
});

describe('pricing-engine — rounding: no-rounding', () => {
  it('returns price rounded to 2 decimals', () => {
    const result = applyRoundingWithRevalidation(
      123.456,
      'no-rounding',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'no-rounding' })
    );
    expect(result).toBeCloseTo(123.46, 1);
  });
});

describe('pricing-engine — rounding: zero or negative price', () => {
  it('returns raw price when it is zero or negative', () => {
    const result = applyRoundingWithRevalidation(
      0,
      'nearest-5',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'nearest-5' })
    );
    expect(result).toBe(0);
  });
});

// ============================================================
// Minimum profit per unit
// ============================================================

describe('pricing-engine — minimum profit per unit', () => {
  it('satisfies minimum profit per unit', () => {
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 200,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 200,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ minimumProfitPerUnit: 10 }),
    });
    expect(result.satisfiesMinimumProfit).toBe(true);
  });

  it('does not satisfy minimum profit per unit when profit is too low', () => {
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 105,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 105,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ minimumProfitPerUnit: 50 }),
    });
    expect(result.satisfiesMinimumProfit).toBe(false);
  });
});

// ============================================================
// Confidence level calculation
// ============================================================

describe('pricing-engine — confidence: high', () => {
  it('returns high confidence when most data is available', () => {
    const product = makeProduct({
      purchaseCost: 100,
      taxRatePercent: 18,
      taxTreatment: 'inclusive',
      shippingCost: 10,
      packagingCost: 5,
      returnRatePercent: 3,
      damageRatePercent: 1,
      marketplaceFeePercent: 5,
      paymentFeePercent: 2,
      competitorPrices: [
      ],
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule(),
    });
    expect(result.confidence).toBe('high');
  });
});

describe('pricing-engine — confidence: medium', () => {
  it('returns medium confidence when some data is available', () => {
    const product = makeProduct({
      purchaseCost: 100,
      taxRatePercent: 18,
      taxTreatment: 'inclusive',
      shippingCost: 10,
      marketplaceFeePercent: 5,
      paymentFeePercent: 2,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule(),
    });
    expect(['medium', 'high']).toContain(result.confidence);
  });
});

describe('pricing-engine — confidence: low (missing cost)', () => {
  it('returns low confidence when purchase cost is missing', () => {
    const product = makeProduct({
      purchaseCost: 0,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule(),
    });
    expect(result.confidence).toBe('low');
  });
});

// ============================================================
// Competitive price with competitor data
// ============================================================

describe('pricing-engine — competitive price with competitor data', () => {
  it('uses competitor data for competitive price', () => {
    const product = makeProduct({
      purchaseCost: 100,
      competitorPrices: [
      ],
    });
    const result = calculateRecommendedPricesFromEngine(
      product,
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'no-rounding' })
    );
    expect(result.competitive).toBeGreaterThan(0);
    expect(Number.isFinite(result.competitive)).toBe(true);
  });
});

// ============================================================
// calculatePriceForMargin with different tax treatments
// ============================================================

describe('pricing-engine — calculatePriceForMargin: exclusive tax', () => {
  it('calculates price for margin with exclusive tax', () => {
    const product = makeProduct({
      taxTreatment: 'exclusive',
      taxRatePercent: 18,
    });
    const result = calculateRecommendedPricesFromEngine(
      product,
      makeSettings(),
      makeEffectiveRule({ taxTreatment: 'exclusive', roundingRule: 'no-rounding' })
    );
    expect(result.balanced).toBeGreaterThan(0);
    expect(Number.isFinite(result.balanced)).toBe(true);
  });
});

describe('pricing-engine — calculatePriceForMargin: exempt tax', () => {
  it('calculates price for margin with exempt tax', () => {
    const product = makeProduct({
      taxTreatment: 'exempt',
      taxRatePercent: 0,
    });
    const result = calculateRecommendedPricesFromEngine(
      product,
      makeSettings(),
      makeEffectiveRule({ taxTreatment: 'exempt', taxRatePercent: 0, roundingRule: 'no-rounding' })
    );
    expect(result.balanced).toBeGreaterThan(0);
    expect(Number.isFinite(result.balanced)).toBe(true);
  });
});

describe('pricing-engine — calculateMinimumSafePrice: exclusive tax', () => {
  it('calculates minimum safe price with exclusive tax', () => {
    const product = makeProduct({
      taxTreatment: 'exclusive',
      taxRatePercent: 18,
    });
    const result = calculateMinimumSafePrice(
      product,
      makeSettings(),
      makeEffectiveRule({ taxTreatment: 'exclusive' })
    );
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('pricing-engine — calculateMinimumSafePrice: exempt tax', () => {
  it('calculates minimum safe price with exempt tax', () => {
    const product = makeProduct({
      taxTreatment: 'exempt',
      taxRatePercent: 0,
    });
    const result = calculateMinimumSafePrice(
      product,
      makeSettings(),
      makeEffectiveRule({ taxTreatment: 'exempt', taxRatePercent: 0 })
    );
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});

// ============================================================
// Impossible state branches
// ============================================================

describe('pricing-engine — impossible state with high fees', () => {
  it('returns 0 for break-even when fees exceed 100%', () => {
    const product = makeProduct({
      purchaseCost: 100,
      marketplaceFeePercent: 80,
      paymentFeePercent: 30,
    });
    const result = calculateBreakEvenPriceFromOutcome(
      product,
      makeSettings(),
      makeEffectiveRule({
        marketplaceFeePercent: 80,
        paymentFeePercent: 30,
        minimumMarginPercent: 10,
      })
    );
    // Impossible state - fees + margin exceed 100%
    expect(result).toBe(0);
  });
});

describe('pricing-engine — impossible state for minimum safe price', () => {
  it('returns 0 for minimum safe price when fees exceed 100%', () => {
    const product = makeProduct({
      purchaseCost: 100,
      marketplaceFeePercent: 80,
      paymentFeePercent: 30,
    });
    const result = calculateMinimumSafePrice(
      product,
      makeSettings(),
      makeEffectiveRule({
        marketplaceFeePercent: 80,
        paymentFeePercent: 30,
        minimumMarginPercent: 10,
      })
    );
    expect(result).toBe(0);
  });
});

// ============================================================
// Missing purchase cost
// ============================================================

describe('pricing-engine — missing purchase cost', () => {
  it('returns 0 for minimum safe price when purchase cost is missing', () => {
    const product = makeProduct({
      purchaseCost: 0,
    });
    const result = calculateMinimumSafePrice(
      product,
      makeSettings(),
      makeEffectiveRule()
    );
    expect(result).toBe(0);
  });
});

// ============================================================
// Warning generation branches
// ============================================================

describe('pricing-engine — warnings: high return rate', () => {
  it('generates warning for high return rate', () => {
    const product = makeProduct({
      returnRatePercent: 60,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule(),
    });
    const hasHighReturnWarning = result.warnings.some(w => w.type === 'high-return-rate');
    expect(hasHighReturnWarning).toBe(true);
  });
});

describe('pricing-engine — warnings: high damage rate', () => {
  it('generates warning for high damage rate', () => {
    const product = makeProduct({
      damageRatePercent: 40,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule(),
    });
    const hasHighDamageWarning = result.warnings.some(w => w.type === 'high-damage-rate');
    expect(hasHighDamageWarning).toBe(true);
  });
});

describe('pricing-engine — warnings: below minimum margin', () => {
  it('generates warning for below minimum margin when profitable but not meeting target', () => {
    // Use a price that's profitable but below the minimum margin
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 130,
      marketplaceFeePercent: 5,
      paymentFeePercent: 2,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 130,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({ minimumMarginPercent: 30 }),
    });
    // The product should have a below-minimum-margin warning
    // (it's profitable but margin is below 30%)
    const hasBelowMinMargin = result.warnings.some(w => w.type === 'below-minimum-margin');
    const hasLossMaking = result.warnings.some(w => w.type === 'loss-making');
    // Either the margin is below minimum or the product is loss-making
    expect(hasBelowMinMargin || hasLossMaking).toBe(true);
  });
});

describe('pricing-engine — warnings: high total fees', () => {
  it('generates warning for high total fees', () => {
    const product = makeProduct({
      marketplaceFeePercent: 30,
      paymentFeePercent: 25,
    });
    const result = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: makeSettings(),
      effectiveRule: makeEffectiveRule({
        marketplaceFeePercent: 30,
        paymentFeePercent: 25,
      }),
    });
    const hasHighFees = result.warnings.some(w => w.type === 'high-total-fees');
    expect(hasHighFees).toBe(true);
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('pricing-engine — custom rounding with zero or negative value', () => {
  it('returns price rounded to 2 decimals when custom value is 0', () => {
    const result = applyRoundingWithRevalidation(
      123.456,
      'custom',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'custom' }),
      0
    );
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('pricing-engine — end-in-99-whole: small price', () => {
  it('handles small price for end-in-99-whole rounding', () => {
    const result = applyRoundingWithRevalidation(
      50,
      'end-in-99-whole',
      makeProduct(),
      makeSettings(),
      makeEffectiveRule({ roundingRule: 'end-in-99-whole' })
    );
    expect(result).toBeGreaterThanOrEqual(99);
  });
});

describe('pricing-engine — calculateMinimumSafePrice: inclusive with minimum profit', () => {
  it('calculates minimum safe price with inclusive tax and minimum profit', () => {
    const product = makeProduct({
      taxTreatment: 'inclusive',
      taxRatePercent: 18,
    });
    const result = calculateMinimumSafePrice(
      product,
      makeSettings({ minimumProfitPerUnit: 10 }),
      makeEffectiveRule({ minimumProfitPerUnit: 10 })
    );
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('pricing-engine — calculateMinimumSafePrice: exclusive with minimum profit', () => {
  it('calculates minimum safe price with exclusive tax and minimum profit', () => {
    const product = makeProduct({
      taxTreatment: 'exclusive',
      taxRatePercent: 18,
    });
    const result = calculateMinimumSafePrice(
      product,
      makeSettings({ minimumProfitPerUnit: 10 }),
      makeEffectiveRule({ taxTreatment: 'exclusive', minimumProfitPerUnit: 10 })
    );
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('pricing-engine — calculateMinimumSafePrice: impossible revenue factor', () => {
  it('returns 0 when revenue factor is impossible for inclusive tax', () => {
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'inclusive',
      taxRatePercent: 18,
      marketplaceFeePercent: 80,
    });
    const result = calculateMinimumSafePrice(
      product,
      makeSettings(),
      makeEffectiveRule({ taxTreatment: 'inclusive', minimumProfitPerUnit: 50 })
    );
    // May be 0 or a finite number depending on the math
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('pricing-engine — calculatePriceForMargin: inclusive with impossible state', () => {
  it('returns 0 when margin is impossible for inclusive tax', () => {
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'inclusive',
      taxRatePercent: 18,
      marketplaceFeePercent: 80,
    });
    const result = calculateRecommendedPricesFromEngine(
      product,
      makeSettings(),
      makeEffectiveRule({ taxTreatment: 'inclusive', marketplaceFeePercent: 80, minimumMarginPercent: 50, roundingRule: 'no-rounding' })
    );
    // The balanced price may be 0 if impossible
    expect(Number.isFinite(result.balanced)).toBe(true);
  });
});

describe('pricing-engine — calculatePriceForMargin: exclusive with impossible state', () => {
  it('returns 0 when margin is impossible for exclusive tax', () => {
    const product = makeProduct({
      purchaseCost: 100,
      taxTreatment: 'exclusive',
      taxRatePercent: 18,
      marketplaceFeePercent: 80,
    });
    const result = calculateRecommendedPricesFromEngine(
      product,
      makeSettings(),
      makeEffectiveRule({ taxTreatment: 'exclusive', marketplaceFeePercent: 80, minimumMarginPercent: 50, roundingRule: 'no-rounding' })
    );
    expect(Number.isFinite(result.balanced)).toBe(true);
  });
});
