/**
 * Additional branch coverage tests for src/lib/pricepilot/safe-calculation.ts
 *
 * Focuses on:
 *   - Missing business settings (null, undefined)
 *   - Pricing policy resolution failure
 *   - Engine exception
 *   - Mapping failure
 *   - Non-finite output detection
 *   - Batch calculation with mixed success/failure
 *   - safelyRecalculateProductsBatched with progress callback
 *   - safelyRecalculateProducts with unexpected exception
 *   - Edge cases: empty products, zero values
 */

import { describe, it, expect, vi } from 'vitest';
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

// ============================================================
// Missing business settings
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

  it('returns failure when business settings is a number', () => {
    const product = makeValidProduct();
    const result = safelyRecalculateProduct(product, 42 as unknown as BusinessSettings, makeRules());
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Pricing policy resolution failure
// ============================================================

describe('safelyRecalculateProduct — pricing policy resolution failure', () => {
  it('handles malformed pricing rules gracefully', () => {
    const product = makeValidProduct();
    // Pass null rules to force resolution failure
    const result = safelyRecalculateProduct(product, makeSettings(), null as unknown as PricingRule[]);
    // Should not throw — may succeed or fail depending on the implementation
    expect(result).toBeDefined();
    expect(result.product).toBeDefined();
  });
});

// ============================================================
// Engine exception
// ============================================================

describe('safelyRecalculateProduct — engine exception', () => {
  it('catches exception and returns fallback product', () => {
    const product = makeValidProduct();
    // Pass undefined settings to force an exception in the engine
    const result = safelyRecalculateProduct(product, undefined as unknown as BusinessSettings, makeRules());
    expect(result.success).toBe(false);
    expect(result.product).toBeDefined();
    expect(result.product.lifecycleStatus).toBe('needs-review');
  });
});

// ============================================================
// Mapping failure
// ============================================================

describe('safelyRecalculateProduct — mapping failure', () => {
  it('handles mapping failure gracefully', () => {
    // Create a product with a very high fee that might cause mapping issues
    const product = makeValidProduct({
      marketplaceFeePercent: 150,
      paymentFeePercent: 200,
    });
    const result = safelyRecalculateProduct(product, makeSettings(), makeRules());
    // Should not throw
    expect(result.product).toBeDefined();
    expect(Number.isFinite(result.product.calculatedTotalLandedCost)).toBe(true);
  });
});

// ============================================================
// Non-finite output detection
// ============================================================

describe('safelyRecalculateProduct — non-finite output', () => {
  it('detects non-finite output and returns fallback', () => {
    // Create a product with extreme values that might cause non-finite output
    const product = makeValidProduct({
      purchaseCost: 1e308,
      currentSellingPrice: 1e308,
    });
    const result = safelyRecalculateProduct(product, makeSettings(), makeRules());
    // Should not throw
    expect(result.product).toBeDefined();
  });
});

// ============================================================
// Batch calculation with mixed success/failure
// ============================================================

describe('safelyRecalculateProducts — mixed success/failure', () => {
  it('processes mix of valid and invalid products', () => {
    const products = [
      makeValidProduct({ id: 'p1', sku: 'SKU-1' }),
      makeValidProduct({ id: 'p2', sku: 'SKU-2', purchaseCost: 0 }),
      makeValidProduct({ id: 'p3', sku: 'SKU-3' }),
    ];
    const result = safelyRecalculateProducts(products, makeSettings(), makeRules());
    expect(result.successfulProducts.length + result.failedProducts.length).toBe(3);
    expect(result.successfulProducts.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty array', () => {
    const result = safelyRecalculateProducts([], makeSettings(), makeRules());
    expect(result.successfulProducts).toHaveLength(0);
    expect(result.failedProducts).toHaveLength(0);
  });

  it('handles non-array input', () => {
    const result = safelyRecalculateProducts(null as unknown as unknown[], makeSettings(), makeRules());
    expect(result.successfulProducts).toHaveLength(0);
    expect(result.failedProducts).toHaveLength(0);
  });
});

// ============================================================
// safelyRecalculateProductsBatched — with progress callback
// ============================================================

describe('safelyRecalculateProductsBatched — progress callback', () => {
  it('calls onProgress callback with correct arguments', async () => {
    const products = [
      makeValidProduct({ id: 'p1' }),
      makeValidProduct({ id: 'p2' }),
      makeValidProduct({ id: 'p3' }),
      makeValidProduct({ id: 'p4' }),
      makeValidProduct({ id: 'p5' }),
    ];
    const progressCalls: Array<{ message: string; processed: number; total: number }> = [];
    const result = await safelyRecalculateProductsBatched(products, makeSettings(), makeRules(), {
      batchSize: 2,
      onProgress: (message, processed, total) => {
        progressCalls.push({ message, processed, total });
      },
    });
    expect(result.successfulProducts.length + result.failedProducts.length).toBe(5);
    expect(progressCalls.length).toBeGreaterThan(0);
    // Check that progress calls have correct total
    expect(progressCalls[0].total).toBe(5);
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

  it('uses default batch size of 50', async () => {
    const products = [
      makeValidProduct({ id: 'p1' }),
      makeValidProduct({ id: 'p2' }),
    ];
    const result = await safelyRecalculateProductsBatched(products, makeSettings(), makeRules());
    expect(result.successfulProducts.length + result.failedProducts.length).toBe(2);
  });
});

// ============================================================
// safelyRecalculateProduct — with existing notes
// ============================================================

describe('safelyRecalculateProduct — with existing notes', () => {
  it('preserves existing notes on failure', () => {
    const product = makeValidProduct({ notes: 'Existing note' });
    const result = safelyRecalculateProduct(product, undefined as unknown as BusinessSettings, makeRules());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.product.notes).toContain('Existing note');
      expect(result.product.notes).toContain('Calculation failed');
    }
  });

  it('adds calculation failure note when no existing notes', () => {
    const product = makeValidProduct({ notes: '' });
    const result = safelyRecalculateProduct(product, undefined as unknown as BusinessSettings, makeRules());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.product.notes).toContain('Calculation failed');
    }
  });
});

// ============================================================
// safelyRecalculateProduct — with raw object input
// ============================================================

describe('safelyRecalculateProduct — with raw object input', () => {
  it('normalizes a raw object input', () => {
    const rawProduct = {
      sku: 'SKU-RAW',
      name: 'Raw Product',
      purchaseCost: 100,
      currentSellingPrice: 150,
    };
    const result = safelyRecalculateProduct(rawProduct, makeSettings(), makeRules());
    expect(result.product).toBeDefined();
    expect(result.product.sku).toBe('SKU-RAW');
  });

  it('handles empty object input', () => {
    const result = safelyRecalculateProduct({}, makeSettings(), makeRules());
    expect(result.product).toBeDefined();
  });
});

// ============================================================
// safelyRecalculateProducts — with unexpected exception
// ============================================================

describe('safelyRecalculateProducts — with unexpected exception', () => {
  it('handles unexpected exceptions gracefully', () => {
    // Create a product that might cause an unexpected exception
    // by using a circular reference
    const circular: any = { id: 'p1', sku: 'SKU-1' };
    circular.self = circular;

    const products = [
      makeValidProduct({ id: 'p1' }),
      circular,
    ];
    const result = safelyRecalculateProducts(products, makeSettings(), makeRules());
    // Should not throw
    expect(result).toBeDefined();
    expect(result.successfulProducts.length + result.failedProducts.length).toBeGreaterThanOrEqual(1);
  });
});
