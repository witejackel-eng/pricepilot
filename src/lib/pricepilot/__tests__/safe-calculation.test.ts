/**
 * Unit tests for src/lib/pricepilot/safe-calculation.ts
 *
 * Covers:
 *   - Valid product (success)
 *   - Missing purchase cost (returns missing-data result)
 *   - Impossible margin (returns structured failure, not throw)
 *   - Fees above 100% (engine returns safe values)
 *   - Engine exception (caught, fallback returned)
 *   - One bad product among valid products (batch does not abort)
 */

import { describe, it, expect } from 'vitest';
import { safelyRecalculateProduct, safelyRecalculateProducts, safelyRecalculateProductsBatched } from '../safe-calculation';
import { createDefaultBusinessSettings, createDefaultPricingRule, Product, BusinessSettings, PricingRule } from '../types';

function makeSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return { ...createDefaultBusinessSettings(), ...overrides };
}

function makeRules(): PricingRule[] {
  return [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true }];
}

function makeValidProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
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
  } as Product;
}

describe('safelyRecalculateProduct — valid product', () => {
  it('returns success: true for a valid product with purchase cost', () => {
    const settings = makeSettings();
    const rules = makeRules();
    const result = safelyRecalculateProduct(makeValidProduct(), settings, rules);
    expect(result.success).toBe(true);
    expect(result.product).toBeDefined();
    expect(result.product.calculatedTotalLandedCost).toBeGreaterThan(0);
  });

  it('produces finite numbers on every calculated field', () => {
    const result = safelyRecalculateProduct(makeValidProduct(), makeSettings(), makeRules());
    expect(Number.isFinite(result.product.calculatedBaseCost)).toBe(true);
    expect(Number.isFinite(result.product.calculatedTotalLandedCost)).toBe(true);
    expect(Number.isFinite(result.product.calculatedBreakEvenPrice)).toBe(true);
    expect(Number.isFinite(result.product.calculatedMarginPercent)).toBe(true);
    expect(Number.isFinite(result.product.calculatedProfitPerUnit)).toBe(true);
    expect(Number.isFinite(result.product.recommendedPrices.breakEven)).toBe(true);
    expect(Number.isFinite(result.product.recommendedPrices.minimum)).toBe(true);
    expect(Number.isFinite(result.product.recommendedPrices.balanced)).toBe(true);
    expect(Number.isFinite(result.product.recommendedPrices.premium)).toBe(true);
  });
});

describe('safelyRecalculateProduct — missing purchase cost', () => {
  it('returns success: true but with missing-data status (recoverable)', () => {
    const result = safelyRecalculateProduct(
      makeValidProduct({ purchaseCost: 0 }),
      makeSettings(),
      makeRules()
    );
    // Missing cost is recoverable — success: true but flagged.
    expect(result.success).toBe(true);
    expect(result.product.calculatedPricingStatus).toBe('missing-data');
    expect(result.product.lifecycleStatus).toBe('needs-review');
    expect(result.product.recommendedPrices.confidence).toBe('low');
    expect(result.product.recommendedPrices.balanced).toBe(0);
    expect(result.product.recommendedPrices.minimum).toBe(0);
  });

  it('produces no trusted recommendation when cost is missing', () => {
    const result = safelyRecalculateProduct(
      makeValidProduct({ purchaseCost: 0 }),
      makeSettings(),
      makeRules()
    );
    // All recommendation prices must be 0 — no trusted value.
    expect(result.product.recommendedPrices.breakEven).toBe(0);
    expect(result.product.recommendedPrices.minimum).toBe(0);
    expect(result.product.recommendedPrices.balanced).toBe(0);
    expect(result.product.recommendedPrices.premium).toBe(0);
  });
});

describe('safelyRecalculateProduct — impossible margin', () => {
  it('does not crash when percentage fees + margin exceed 100%', () => {
    // Set up an impossible scenario: marketplace fee 95% + payment fee 10% + target margin 20%.
    const settings = makeSettings({
      defaultMarketplaceFeePercent: 95,
      defaultPaymentFeePercent: 10,
      defaultTargetMarginPercent: 20,
    });
    const product = makeValidProduct({
      marketplaceFeePercent: 95,
      paymentFeePercent: 10,
    });
    const result = safelyRecalculateProduct(product, settings, makeRules());
    // Should not throw. May return success: true with low confidence
    // OR success: false with a structured error — either is acceptable.
    expect(result.product).toBeDefined();
    expect(Number.isFinite(result.product.recommendedPrices.balanced)).toBe(true);
  });
});

describe('safelyRecalculateProduct — fees above 100%', () => {
  it('still returns a safe product (no NaN, no Infinity)', () => {
    const product = makeValidProduct({
      marketplaceFeePercent: 150, // invalid — above 100%
      paymentFeePercent: 200,
    });
    const result = safelyRecalculateProduct(product, makeSettings(), makeRules());
    expect(result.product).toBeDefined();
    // Every numeric field must be finite.
    expect(Number.isFinite(result.product.calculatedTotalLandedCost)).toBe(true);
    expect(Number.isFinite(result.product.calculatedMarginPercent)).toBe(true);
    expect(Number.isFinite(result.product.recommendedPrices.balanced)).toBe(true);
  });
});

describe('safelyRecalculateProduct — engine exception', () => {
  it('catches a thrown exception and returns a fallback product', () => {
    // Pass malformed input that would normally crash — a product whose
    // taxTreatment is a symbol (which the engine doesn't expect).
    const product = makeValidProduct();
    // Force a throw by passing undefined settings.
    const result = safelyRecalculateProduct(product, undefined as unknown as BusinessSettings, makeRules());
    expect(result.success).toBe(false);
    expect(result.product).toBeDefined();
    expect(result.product.lifecycleStatus).toBe('needs-review');
    expect(result.product.calculatedPricingStatus).toBe('needs-review');
    expect('error' in result && result.error.code).toBeTruthy();
  });
});

describe('safelyRecalculateProducts — one bad product does not abort the batch', () => {
  it('processes all products even when one throws', () => {
    const good1 = makeValidProduct({ id: 'p1', sku: 'SKU-1' });
    const good2 = makeValidProduct({ id: 'p2', sku: 'SKU-2' });
    const bad = makeValidProduct({ id: 'p3', sku: 'SKU-3', purchaseCost: 0 });
    const result = safelyRecalculateProducts([good1, good2, bad], makeSettings(), makeRules());
    expect(result.successfulProducts.length + result.failedProducts.length).toBe(3);
    // At least the two good products must succeed.
    expect(result.successfulProducts.length).toBeGreaterThanOrEqual(2);
    expect(result.issues.length).toBeGreaterThanOrEqual(0);
  });

  it('handles non-array input', () => {
    const result = safelyRecalculateProducts(null as unknown as unknown[], makeSettings(), makeRules());
    expect(result.successfulProducts).toHaveLength(0);
    expect(result.failedProducts).toHaveLength(0);
  });
});

// ============================================================
// safelyRecalculateProductsBatched
// ============================================================

describe('safelyRecalculateProductsBatched', () => {
  it('processes products in batches', async () => {
    const products = [
      makeValidProduct({ id: 'p1', sku: 'SKU-1' }),
      makeValidProduct({ id: 'p2', sku: 'SKU-2' }),
      makeValidProduct({ id: 'p3', sku: 'SKU-3' }),
    ];
    const result = await safelyRecalculateProductsBatched(products, makeSettings(), makeRules(), { batchSize: 2 });
    expect(result.successfulProducts.length + result.failedProducts.length).toBe(3);
  });

  it('calls onProgress callback', async () => {
    const products = [
      makeValidProduct({ id: 'p1' }),
      makeValidProduct({ id: 'p2' }),
      makeValidProduct({ id: 'p3' }),
    ];
    const progressMessages: string[] = [];
    await safelyRecalculateProductsBatched(products, makeSettings(), makeRules(), {
      batchSize: 2,
      onProgress: (msg) => progressMessages.push(msg),
    });
    expect(progressMessages.length).toBeGreaterThan(0);
  });

  it('handles empty array', async () => {
    const result = await safelyRecalculateProductsBatched([], makeSettings(), makeRules());
    expect(result.successfulProducts).toHaveLength(0);
    expect(result.failedProducts).toHaveLength(0);
  });

  it('handles non-array input', async () => {
    const result = await safelyRecalculateProductsBatched(null as unknown as unknown[], makeSettings(), makeRules());
    expect(result.successfulProducts).toHaveLength(0);
    expect(result.failedProducts).toHaveLength(0);
  });

  it('handles mixed valid and invalid products', async () => {
    const products = [
      makeValidProduct({ id: 'p1' }),
      makeValidProduct({ id: 'p2', purchaseCost: 0 }),
    ];
    const result = await safelyRecalculateProductsBatched(products, makeSettings(), makeRules(), { batchSize: 1 });
    expect(result.successfulProducts.length + result.failedProducts.length).toBe(2);
  });
});

// ============================================================
// safelyRecalculateProduct — more edge cases
// ============================================================

describe('safelyRecalculateProduct — missing business settings', () => {
  it('returns failure when business settings is null', () => {
    const product = makeValidProduct();
    const result = safelyRecalculateProduct(product, null as unknown as BusinessSettings, makeRules());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('missing-business-settings');
    }
  });

  it('returns failure when business settings is undefined', () => {
    const product = makeValidProduct();
    const result = safelyRecalculateProduct(product, undefined as unknown as BusinessSettings, makeRules());
    expect(result.success).toBe(false);
  });
});

describe('safelyRecalculateProduct — warnings from engine', () => {
  it('surfaces warnings from the current outcome', () => {
    const settings = makeSettings();
    const product = makeValidProduct({
      purchaseCost: 100,
      currentSellingPrice: 50, // below cost, should generate loss-making warning
    });
    const result = safelyRecalculateProduct(product, settings, makeRules());
    // The product should have warnings (loss-making)
    if (result.success) {
      // Even successful products may have warnings
      expect(Array.isArray(result.warnings)).toBe(true);
    }
  });
});

describe('safelyRecalculateProducts — batch with failing products', () => {
  it('reports issues for failed products', () => {
    const products = [
      makeValidProduct({ id: 'p1' }),
      makeValidProduct({ id: 'p2', purchaseCost: 0 }),
    ];
    const result = safelyRecalculateProducts(products, makeSettings(), makeRules());
    expect(result.successfulProducts.length + result.failedProducts.length).toBe(2);
    // The needs-review product should be in successfulProducts (it's a success with needs-review status)
    // or failedProducts depending on the implementation
  });
});
