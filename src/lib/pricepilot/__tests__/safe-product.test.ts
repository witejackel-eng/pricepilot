/**
 * PricePilot - Safe Product Access Helpers Tests
 *
 * Tests the safe product helpers that prevent crashes when
 * products have missing, empty, or undefined optional fields.
 */

import { describe, it, expect } from 'vitest';
import {
  safeProductText,
  safeLowerCase,
  safeTags,
  safeCompetitorPrices,
  getSafeRecommendedPrices,
  getSafeRecommendedPrice,
  getSafePriceOutcome,
  getSafeRecommendedOutcomes,
  getSafePurchaseCost,
  getSafeSellingPrice,
  getSafeMarginPercent,
  getSafeProfitPerUnit,
  getSafeHealthScore,
  checkRenderSafeProduct,
  isRenderSafeProduct,
} from '../safe-product';
import type { Product } from '../types';

// Helper to create a minimal valid product
function createValidProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-1',
    sku: 'SKU-001',
    name: 'Test Product',
    category: '',
    brand: '',
    description: '',
    tags: [],
    purchaseCost: 0,
    shippingCost: 0,
    packagingCost: 0,
    handlingCost: 0,
    otherCosts: 0,
    returnRatePercent: 0,
    damageRatePercent: 0,
    customDutyPercent: 0,
    freightPercent: 0,
    currentSellingPrice: 0,
    competitorPrices: [],
    salesChannel: 'online-marketplace',
    taxRatePercent: 0,
    taxTreatment: 'inclusive',
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
    recommendedPrices: {
      breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0,
      confidence: 'low',
    },
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
    lifecycleStatus: 'missing-data',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isApproved: false,
    notes: '',
    ...overrides,
  };
}

describe('safeProductText', () => {
  it('returns the string for a string value', () => {
    expect(safeProductText('Electronics')).toBe('Electronics');
  });

  it('returns empty string for null', () => {
    expect(safeProductText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(safeProductText(undefined)).toBe('');
  });

  it('returns empty string for a number', () => {
    // Numbers are not text fields
    expect(safeProductText(42)).toBe('42');
  });

  it('returns empty string for NaN', () => {
    expect(safeProductText(NaN)).toBe('');
  });
});

describe('safeLowerCase', () => {
  it('returns lowercase for a string', () => {
    expect(safeLowerCase('Electronics')).toBe('electronics');
  });

  it('returns empty string for null', () => {
    expect(safeLowerCase(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(safeLowerCase(undefined)).toBe('');
  });
});

describe('safeTags', () => {
  it('returns tags array when present', () => {
    const product = createValidProduct({ tags: ['sale', 'new'] });
    expect(safeTags(product)).toEqual(['sale', 'new']);
  });

  it('returns empty array when tags is undefined', () => {
    const product = createValidProduct({ tags: undefined as unknown as string[] });
    expect(safeTags(product)).toEqual([]);
  });

  it('returns empty array when tags is null', () => {
    const product = createValidProduct({ tags: null as unknown as string[] });
    expect(safeTags(product)).toEqual([]);
  });

  it('filters non-string tag values', () => {
    const product = createValidProduct({ tags: ['sale', 42, null, 'new'] as unknown as string[] });
    expect(safeTags(product)).toEqual(['sale', 'new']);
  });
});

describe('getSafeRecommendedPrices', () => {
  it('returns complete recommended prices for a valid product', () => {
    const product = createValidProduct({
      recommendedPrices: {
        breakEven: 100, minimum: 110, competitive: 120, balanced: 130, premium: 150,
        confidence: 'high',
      },
    });
    const rp = getSafeRecommendedPrices(product);
    expect(rp.breakEven).toBe(100);
    expect(rp.balanced).toBe(130);
    expect(rp.confidence).toBe('high');
  });

  it('returns defaults when recommendedPrices is missing', () => {
    const product = createValidProduct({ recommendedPrices: undefined as unknown as Product['recommendedPrices'] });
    const rp = getSafeRecommendedPrices(product);
    expect(rp.breakEven).toBe(0);
    expect(rp.balanced).toBe(0);
    expect(rp.confidence).toBe('low');
  });

  it('handles partial recommendedPrices', () => {
    const product = createValidProduct({
      recommendedPrices: { balanced: 130 } as Product['recommendedPrices'],
    });
    const rp = getSafeRecommendedPrices(product);
    expect(rp.balanced).toBe(130);
    expect(rp.breakEven).toBe(0);
    expect(rp.confidence).toBe('low');
  });

  it('defaults confidence to low when invalid', () => {
    const product = createValidProduct({
      recommendedPrices: {
        breakEven: 100, minimum: 110, competitive: 120, balanced: 130, premium: 150,
        confidence: 'invalid' as Product['recommendedPrices']['confidence'],
      },
    });
    const rp = getSafeRecommendedPrices(product);
    expect(rp.confidence).toBe('low');
  });
});

describe('getSafeRecommendedPrice', () => {
  it('returns the price for a valid mode', () => {
    const product = createValidProduct({
      recommendedPrices: {
        breakEven: 100, minimum: 110, competitive: 120, balanced: 130, premium: 150,
        confidence: 'high',
      },
    });
    expect(getSafeRecommendedPrice(product, 'balanced')).toBe(130);
    expect(getSafeRecommendedPrice(product, 'premium')).toBe(150);
  });

  it('returns 0 when recommendedPrices is missing', () => {
    const product = createValidProduct({ recommendedPrices: undefined as unknown as Product['recommendedPrices'] });
    expect(getSafeRecommendedPrice(product, 'balanced')).toBe(0);
  });
});

describe('getSafePriceOutcome', () => {
  it('returns null when calculatedPriceOutcome is missing', () => {
    const product = createValidProduct({ calculatedPriceOutcome: undefined });
    expect(getSafePriceOutcome(product)).toBeNull();
  });

  it('returns the outcome when present', () => {
    const product = createValidProduct({
      calculatedPriceOutcome: {
        enteredSellingPrice: 750,
      } as unknown as Product['calculatedPriceOutcome'],
    });
    expect(getSafePriceOutcome(product)).not.toBeNull();
  });
});

describe('getSafeRecommendedOutcomes', () => {
  it('returns null when recommendedOutcomes is missing', () => {
    const product = createValidProduct({ recommendedOutcomes: undefined });
    expect(getSafeRecommendedOutcomes(product)).toBeNull();
  });
});

describe('numeric helpers', () => {
  it('getSafePurchaseCost returns 0 for missing cost', () => {
    const product = createValidProduct({ purchaseCost: 0 });
    expect(getSafePurchaseCost(product)).toBe(0);
  });

  it('getSafeSellingPrice returns 0 for missing price', () => {
    const product = createValidProduct({ currentSellingPrice: 0 });
    expect(getSafeSellingPrice(product)).toBe(0);
  });

  it('getSafeMarginPercent returns 0 for NaN', () => {
    const product = createValidProduct({ calculatedMarginPercent: NaN });
    expect(getSafeMarginPercent(product)).toBe(0);
  });

  it('getSafeProfitPerUnit returns 0 for Infinity', () => {
    const product = createValidProduct({ calculatedProfitPerUnit: Infinity });
    expect(getSafeProfitPerUnit(product)).toBe(0);
  });

  it('getSafeHealthScore returns 0 for negative Infinity', () => {
    const product = createValidProduct({ calculatedHealthScore: -Infinity });
    expect(getSafeHealthScore(product)).toBe(0);
  });
});

describe('checkRenderSafeProduct', () => {
  it('returns no issues for a valid product', () => {
    const product = createValidProduct();
    const issues = checkRenderSafeProduct(product);
    expect(issues).toEqual([]);
  });

  it('detects missing required text fields', () => {
    const product = createValidProduct({ name: undefined as unknown as string });
    const issues = checkRenderSafeProduct(product);
    expect(issues.some(i => i.includes('Missing required field: name'))).toBe(true);
  });

  it('detects NaN in numeric fields', () => {
    const product = createValidProduct({ purchaseCost: NaN });
    const issues = checkRenderSafeProduct(product);
    expect(issues.some(i => i.includes('purchaseCost') && i.includes('not a finite number'))).toBe(true);
  });

  it('detects missing recommendedPrices', () => {
    const product = createValidProduct({ recommendedPrices: undefined as unknown as Product['recommendedPrices'] });
    const issues = checkRenderSafeProduct(product);
    expect(issues.some(i => i.includes('Missing recommendedPrices'))).toBe(true);
  });

  it('detects non-finite recommended price values', () => {
    const product = createValidProduct({
      recommendedPrices: {
        breakEven: Infinity, minimum: 0, competitive: 0, balanced: 0, premium: 0,
        confidence: 'low',
      },
    });
    const issues = checkRenderSafeProduct(product);
    expect(issues.some(i => i.includes('recommendedPrices.breakEven'))).toBe(true);
  });
});

describe('isRenderSafeProduct', () => {
  it('returns true for a valid product', () => {
    const product = createValidProduct();
    expect(isRenderSafeProduct(product)).toBe(true);
  });

  it('returns false for a product with issues', () => {
    const product = createValidProduct({ purchaseCost: NaN });
    expect(isRenderSafeProduct(product)).toBe(false);
  });
});
