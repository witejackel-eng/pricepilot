/**
 * Unit tests for src/lib/pricepilot/product-normalizer.ts
 *
 * Covers:
 *   - Complete product (passes through cleanly)
 *   - Legacy product (missing recommendedPrices, missing arrays)
 *   - Currency string purchase cost ("₹1,250")
 *   - Percentage string ("18%")
 *   - Missing name but valid SKU
 *   - Missing SKU but valid name
 *   - Missing both (rejected)
 *   - Negative cost (clamped)
 *   - Invalid tax treatment (reset to default)
 *   - Invalid fees (rejected, set to 0)
 *   - Infinite selling price (reset to 0)
 *   - Returned product is always safe to render (every field exists)
 */

import { describe, it, expect } from 'vitest';
import { normalizeProduct, normalizeProducts } from '../product-normalizer';
import { createDefaultProduct } from '../types';

// Helper: build a minimal valid product.
function makeValidRawProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'prod-test-1',
    sku: 'SKU-001',
    name: 'Test Product',
    purchaseCost: 100,
    currentSellingPrice: 150,
    taxRatePercent: 18,
    taxTreatment: 'inclusive',
    marketplaceFeePercent: 5,
    paymentFeePercent: 2,
    ...overrides,
  };
}

describe('normalizeProduct — complete product', () => {
  it('passes a complete valid product through with success: true', () => {
    const result = normalizeProduct(makeValidRawProduct(), { source: 'manual' });
    expect(result.success).toBe(true);
    expect(result.product.sku).toBe('SKU-001');
    expect(result.product.name).toBe('Test Product');
    expect(result.product.purchaseCost).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  it('always returns a product with every required field present', () => {
    const result = normalizeProduct(makeValidRawProduct());
    const p = result.product;
    expect(typeof p.id).toBe('string');
    expect(typeof p.sku).toBe('string');
    expect(typeof p.name).toBe('string');
    expect(typeof p.purchaseCost).toBe('number');
    expect(typeof p.currentSellingPrice).toBe('number');
    expect(Array.isArray(p.competitorPrices)).toBe(true);
    expect(Array.isArray(p.tags)).toBe(true);
    expect(typeof p.notes).toBe('string');
    expect(p.recommendedPrices).toBeDefined();
    expect(p.recommendedPrices.breakEven).toBe(0);
    expect(p.recommendedPrices.confidence).toBe('low');
  });
});

describe('normalizeProduct — legacy product', () => {
  it('handles a product missing recommendedPrices', () => {
    const raw = makeValidRawProduct();
    delete (raw as Record<string, unknown>).recommendedPrices;
    const result = normalizeProduct(raw);
    expect(result.success).toBe(true);
    expect(result.product.recommendedPrices).toBeDefined();
    expect(result.product.recommendedPrices.breakEven).toBe(0);
    expect(result.product.recommendedPrices.confidence).toBe('low');
  });

  it('handles a product missing competitorPrices array', () => {
    const raw = makeValidRawProduct();
    delete (raw as Record<string, unknown>).competitorPrices;
    const result = normalizeProduct(raw);
    expect(result.product.competitorPrices).toEqual([]);
  });

  it('handles a product missing tags array', () => {
    const raw = makeValidRawProduct();
    delete (raw as Record<string, unknown>).tags;
    const result = normalizeProduct(raw);
    expect(result.product.tags).toEqual([]);
  });

  it('handles a product missing notes', () => {
    const raw = makeValidRawProduct();
    delete (raw as Record<string, unknown>).notes;
    const result = normalizeProduct(raw);
    expect(result.product.notes).toBe('');
  });
});

describe('normalizeProduct — currency / percentage strings', () => {
  it('parses currency-formatted purchase cost', () => {
    const result = normalizeProduct(makeValidRawProduct({ purchaseCost: '₹1,250' }));
    expect(result.product.purchaseCost).toBe(1250);
  });

  it('parses Indian comma-formatted cost', () => {
    const result = normalizeProduct(makeValidRawProduct({ purchaseCost: '1,25,000' }));
    expect(result.product.purchaseCost).toBe(125000);
  });

  it('parses percentage string for tax rate', () => {
    const result = normalizeProduct(makeValidRawProduct({ taxRatePercent: '18%' }));
    expect(result.product.taxRatePercent).toBe(18);
  });

  it('parses percentage string for marketplace fee', () => {
    const result = normalizeProduct(makeValidRawProduct({ marketplaceFeePercent: '5.5%' }));
    expect(result.product.marketplaceFeePercent).toBe(5.5);
  });

  it('treats empty string purchase cost as 0 (and flags needs-review)', () => {
    const result = normalizeProduct(makeValidRawProduct({ purchaseCost: '' }));
    expect(result.product.purchaseCost).toBe(0);
    expect(result.product.lifecycleStatus).toBe('needs-review');
    expect(result.product.calculatedPricingStatus).toBe('missing-data');
    expect(result.product.recommendedPrices.confidence).toBe('low');
  });
});

describe('normalizeProduct — identity rules', () => {
  it('accepts a product with name but no SKU', () => {
    const raw = makeValidRawProduct();
    delete (raw as Record<string, unknown>).sku;
    const result = normalizeProduct(raw);
    expect(result.success).toBe(true);
    expect(result.product.name).toBe('Test Product');
    expect(result.product.sku).toBe('');
  });

  it('accepts a product with SKU but no name', () => {
    const raw = makeValidRawProduct();
    delete (raw as Record<string, unknown>).name;
    const result = normalizeProduct(raw);
    expect(result.success).toBe(true);
    expect(result.product.sku).toBe('SKU-001');
    expect(result.product.name).toBe('');
  });

  it('rejects a product with neither name nor SKU', () => {
    const raw = makeValidRawProduct();
    delete (raw as Record<string, unknown>).name;
    delete (raw as Record<string, unknown>).sku;
    const result = normalizeProduct(raw);
    expect(result.success).toBe(false);
    // Placeholder is returned, but caller should drop it.
    expect(result.issues.some(i => i.code === 'missing-identity')).toBe(true);
  });
});

describe('normalizeProduct — invalid values', () => {
  it('clamps negative purchase cost to 0 with a warning', () => {
    const result = normalizeProduct(makeValidRawProduct({ purchaseCost: -100 }));
    expect(result.product.purchaseCost).toBe(0);
    expect(result.issues.some(i => i.code === 'negative-clamped')).toBe(true);
    // Missing cost => needs-review
    expect(result.product.lifecycleStatus).toBe('needs-review');
  });

  it('resets NaN purchase cost to 0', () => {
    const result = normalizeProduct(makeValidRawProduct({ purchaseCost: NaN }));
    expect(result.product.purchaseCost).toBe(0);
    expect(result.issues.some(i => i.code === 'non-finite')).toBe(true);
  });

  it('resets Infinity purchase cost to 0', () => {
    const result = normalizeProduct(makeValidRawProduct({ purchaseCost: Infinity }));
    expect(result.product.purchaseCost).toBe(0);
    expect(result.issues.some(i => i.code === 'non-finite')).toBe(true);
  });

  it('resets infinite selling price to 0', () => {
    const result = normalizeProduct(makeValidRawProduct({ currentSellingPrice: Infinity }));
    expect(result.product.currentSellingPrice).toBe(0);
    expect(Number.isFinite(result.product.currentSellingPrice)).toBe(true);
  });

  it('rejects fees above 100% and resets to 0', () => {
    const result = normalizeProduct(makeValidRawProduct({ marketplaceFeePercent: 150 }));
    expect(result.product.marketplaceFeePercent).toBe(0);
    expect(result.issues.some(i => i.code === 'fee-above-100')).toBe(true);
  });

  it('rejects negative fees and resets to 0', () => {
    const result = normalizeProduct(makeValidRawProduct({ paymentFeePercent: -5 }));
    expect(result.product.paymentFeePercent).toBe(0);
    expect(result.issues.some(i => i.code === 'fee-negative')).toBe(true);
  });

  it('resets invalid tax treatment to default (inclusive)', () => {
    const result = normalizeProduct(makeValidRawProduct({ taxTreatment: 'not-a-real-treatment' }));
    expect(result.product.taxTreatment).toBe('inclusive');
    expect(result.issues.some(i => i.code === 'invalid-enum')).toBe(true);
  });

  it('resets invalid sales channel to default', () => {
    const result = normalizeProduct(makeValidRawProduct({ salesChannel: 'mars' }));
    expect(result.product.salesChannel).toBe('online-marketplace');
  });

  it('resets invalid lifecycle status to active', () => {
    const result = normalizeProduct(makeValidRawProduct({ lifecycleStatus: 'invalid' }));
    expect(result.product.lifecycleStatus).toBe('active');
  });
});

describe('normalizeProduct — never throws', () => {
  it('handles null input', () => {
    const result = normalizeProduct(null);
    expect(result.success).toBe(false);
    expect(result.product).toBeDefined();
    expect(result.product.lifecycleStatus).toBe('needs-review');
  });

  it('handles undefined input', () => {
    const result = normalizeProduct(undefined);
    expect(result.success).toBe(false);
    expect(result.product).toBeDefined();
  });

  it('handles array input (not an object)', () => {
    const result = normalizeProduct([1, 2, 3]);
    expect(result.success).toBe(false);
  });

  it('handles string input', () => {
    const result = normalizeProduct('not a product');
    expect(result.success).toBe(false);
  });

  it('handles number input', () => {
    const result = normalizeProduct(42);
    expect(result.success).toBe(false);
  });
});

describe('normalizeProducts — batch helper', () => {
  it('processes a list of valid products', () => {
    const list = [
      makeValidRawProduct({ id: 'p1', sku: 'SKU-1' }),
      makeValidRawProduct({ id: 'p2', sku: 'SKU-2' }),
      makeValidRawProduct({ id: 'p3', sku: 'SKU-3' }),
    ];
    const result = normalizeProducts(list, { source: 'import' });
    expect(result.successfulProducts).toHaveLength(3);
    expect(result.failedProducts).toHaveLength(0);
    expect(result.rejectedCount).toBe(0);
  });

  it('keeps malformed products as needs-review instead of rejecting', () => {
    const list = [
      makeValidRawProduct({ id: 'p1', sku: 'SKU-1' }),
      makeValidRawProduct({ id: 'p2', sku: 'SKU-2', purchaseCost: NaN }),
    ];
    const result = normalizeProducts(list, { source: 'import' });
    expect(result.successfulProducts).toHaveLength(2); // both kept
    expect(result.needsReviewCount).toBe(1); // p2 flagged
  });

  it('counts hard rejections (no name AND no sku)', () => {
    const list = [
      makeValidRawProduct({ id: 'p1', sku: 'SKU-1' }),
      { id: 'p2' }, // no name, no sku
    ];
    const result = normalizeProducts(list, { source: 'import' });
    expect(result.successfulProducts).toHaveLength(1);
    expect(result.rejectedCount).toBe(1);
  });

  it('handles non-array input', () => {
    const result = normalizeProducts(null, { source: 'import' });
    expect(result.successfulProducts).toHaveLength(0);
    expect(result.rejectedCount).toBe(0);
  });
});

describe('normalizeProduct — preserves product identity', () => {
  it('keeps the original ID when present', () => {
    const result = normalizeProduct(makeValidRawProduct({ id: 'my-custom-id' }));
    expect(result.product.id).toBe('my-custom-id');
  });

  it('generates an ID when missing', () => {
    const raw = makeValidRawProduct();
    delete (raw as Record<string, unknown>).id;
    const result = normalizeProduct(raw);
    expect(result.product.id).toBeTruthy();
    expect(result.product.id.startsWith('prod-')).toBe(true);
  });
});
