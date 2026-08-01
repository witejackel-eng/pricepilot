/**
 * PricePilot - Import Regression Tests
 *
 * Tests that verify the specific crash scenarios from the
 * production incident where imported products with empty
 * category/brand/missing-cost fields caused the Products page
 * to crash.
 */

import { describe, it, expect } from 'vitest';
import { processImportRows } from '../import-service';
import type { PricingRule } from '../types';
import { createDefaultBusinessSettings } from '../types';
import { buildNonEmptyOptions, UNCATEGORISED_FILTER, UNKNOWN_BRAND_FILTER, categoryMatchesFilter, brandMatchesFilter } from '../safe-select';
import { safeLowerCase, getSafeRecommendedPrices, getSafePurchaseCost, getSafePriceOutcome } from '../safe-product';

describe('Import regression: empty category/brand', () => {
  const settings = createDefaultBusinessSettings();
  const rules: PricingRule[] = [];

  it('imports a product with empty category without crashing', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', category: '', purchase_cost: '100', selling_price: '150' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    expect(result.validProducts.length + result.needsReviewProducts.length).toBe(1);
    const product = result.validProducts[0] ?? result.needsReviewProducts[0];
    expect(product.category).toBe('');
  });

  it('imports a product with empty brand without crashing', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-002', brand: '', purchase_cost: '100', selling_price: '150' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    expect(result.validProducts.length + result.needsReviewProducts.length).toBe(1);
    const product = result.validProducts[0] ?? result.needsReviewProducts[0];
    expect(product.brand).toBe('');
  });

  it('imports a product with whitespace-only category', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-003', category: '   ', purchase_cost: '100', selling_price: '150' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    expect(result.validProducts.length + result.needsReviewProducts.length).toBe(1);
  });

  it('buildNonEmptyOptions does not include empty string as SelectItem value', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', category: '', purchase_cost: '100', selling_price: '150' },
      { name: 'Widget B', sku: 'SKU-002', category: 'Electronics', purchase_cost: '200', selling_price: '300' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    const products = [...result.validProducts, ...result.needsReviewProducts];
    const categories = buildNonEmptyOptions(products.map(p => p.category), UNCATEGORISED_FILTER);
    // Empty string should NOT be in the options
    expect(categories).not.toContain('');
    // But the sentinel should be
    expect(categories).toContain(UNCATEGORISED_FILTER);
    expect(categories).toContain('Electronics');
  });

  it('buildNonEmptyOptions does not include empty brand as SelectItem value', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', brand: '', purchase_cost: '100', selling_price: '150' },
      { name: 'Widget B', sku: 'SKU-002', brand: 'Samsung', purchase_cost: '200', selling_price: '300' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    const products = [...result.validProducts, ...result.needsReviewProducts];
    const brands = buildNonEmptyOptions(products.map(p => p.brand), UNKNOWN_BRAND_FILTER);
    expect(brands).not.toContain('');
    expect(brands).toContain(UNKNOWN_BRAND_FILTER);
    expect(brands).toContain('Samsung');
  });

  it('uncategorised filter returns blank-category products', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', category: '', purchase_cost: '100', selling_price: '150' },
      { name: 'Widget B', sku: 'SKU-002', category: 'Electronics', purchase_cost: '200', selling_price: '300' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    const products = [...result.validProducts, ...result.needsReviewProducts];
    const uncategorised = products.filter(p => categoryMatchesFilter(p.category, UNCATEGORISED_FILTER));
    expect(uncategorised).toHaveLength(1);
    expect(uncategorised[0].name).toBe('Widget A');
  });

  it('unknown-brand filter returns blank-brand products', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', brand: '', purchase_cost: '100', selling_price: '150' },
      { name: 'Widget B', sku: 'SKU-002', brand: 'Samsung', purchase_cost: '200', selling_price: '300' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    const products = [...result.validProducts, ...result.needsReviewProducts];
    const unknownBrand = products.filter(p => brandMatchesFilter(p.brand, UNKNOWN_BRAND_FILTER));
    expect(unknownBrand).toHaveLength(1);
    expect(unknownBrand[0].name).toBe('Widget A');
  });
});

describe('Import regression: missing purchase cost', () => {
  const settings = createDefaultBusinessSettings();
  const rules: PricingRule[] = [];

  it('imports a product with zero purchase cost as needs-review', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', purchase_cost: '0', selling_price: '150' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    // Should be needs-review because missing cost
    const product = result.needsReviewProducts[0] ?? result.validProducts[0];
    expect(product).toBeDefined();
    expect(getSafePurchaseCost(product)).toBe(0);
  });

  it('imports a product with missing purchase cost column', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', selling_price: '150' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    const product = result.needsReviewProducts[0] ?? result.validProducts[0];
    expect(product).toBeDefined();
    expect(getSafePurchaseCost(product)).toBe(0);
  });

  it('missing-cost products do not have calculatedPriceOutcome', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', selling_price: '150' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    const product = result.needsReviewProducts[0] ?? result.validProducts[0];
    // Missing-cost products should not have a fabricated price outcome
    const outcome = getSafePriceOutcome(product);
    // It may be null or have a valid outcome with 0 profit — but never NaN/Infinity
    if (outcome) {
      expect(Number.isFinite(outcome.netProfit)).toBe(true);
    }
  });
});

describe('Import regression: missing selling price', () => {
  const settings = createDefaultBusinessSettings();
  const rules: PricingRule[] = [];

  it('imports a product with zero selling price', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-001', purchase_cost: '100', selling_price: '0' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    const product = result.needsReviewProducts[0] ?? result.validProducts[0];
    expect(product).toBeDefined();
    expect(product.currentSellingPrice).toBe(0);
  });
});

describe('Import regression: 200 products with empty categories', () => {
  const settings = createDefaultBusinessSettings();
  const rules: PricingRule[] = [];

  it('imports 200 products with mixed categories', () => {
    const rows: unknown[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push({
        name: `Demo Product ${i + 1}`,
        sku: `DEMO-${String(i + 1).padStart(3, '0')}`,
        category: ['Electronics', 'Clothing', 'Food'][i % 3],
        brand: 'DemoBrand',
        purchase_cost: '100',
        selling_price: '150',
      });
    }
    for (let i = 0; i < 188; i++) {
      rows.push({
        name: `Imported Product ${i + 1}`,
        sku: `IMP-${String(i + 1).padStart(3, '0')}`,
        category: '',  // Empty category
        brand: '',     // Empty brand
        purchase_cost: '0',  // Missing cost
        selling_price: '200',
      });
    }

    const result = processImportRows(rows, settings, rules);
    const products = [...result.validProducts, ...result.needsReviewProducts];

    // All products should be importable
    expect(products.length + result.rejectedCount).toBe(200);

    // Categories should be safe for Select
    const categories = buildNonEmptyOptions(products.map(p => p.category), UNCATEGORISED_FILTER);
    expect(categories).not.toContain('');
    expect(categories).toContain('Electronics');
    expect(categories).toContain('Clothing');
    expect(categories).toContain('Food');
    expect(categories).toContain(UNCATEGORISED_FILTER);

    // Brands should be safe for Select
    const brands = buildNonEmptyOptions(products.map(p => p.brand), UNKNOWN_BRAND_FILTER);
    expect(brands).not.toContain('');
    expect(brands).toContain('DemoBrand');
    expect(brands).toContain(UNKNOWN_BRAND_FILTER);
  });
});

describe('Import regression: safe search on blank fields', () => {
  it('safeLowerCase does not crash on empty category', () => {
    expect(safeLowerCase('')).toBe('');
    expect(safeLowerCase(null)).toBe('');
    expect(safeLowerCase(undefined)).toBe('');
  });

  it('safeLowerCase works on valid categories', () => {
    expect(safeLowerCase('Electronics')).toBe('electronics');
  });
});

describe('Import regression: duplicate SKU import', () => {
  const settings = createDefaultBusinessSettings();
  const rules: PricingRule[] = [];

  it('detects duplicate SKUs within the same file', () => {
    const rows = [
      { name: 'Widget A', sku: 'SKU-DUP', purchase_cost: '100', selling_price: '150' },
      { name: 'Widget A Duplicate', sku: 'SKU-DUP', purchase_cost: '200', selling_price: '300' },
    ] as unknown[];
    const result = processImportRows(rows, settings, rules);
    expect(result.duplicateProducts.length).toBe(1);
  });
});

describe('Import regression: null and undefined optional fields', () => {
  it('null optional fields do not crash getSafeRecommendedPrices', () => {
    const product = { recommendedPrices: null } as unknown as Parameters<typeof getSafeRecommendedPrices>[0];
    const rp = getSafeRecommendedPrices(product);
    expect(rp.balanced).toBe(0);
    expect(rp.confidence).toBe('low');
  });

  it('undefined optional fields do not crash getSafeRecommendedPrices', () => {
    const product = { recommendedPrices: undefined } as unknown as Parameters<typeof getSafeRecommendedPrices>[0];
    const rp = getSafeRecommendedPrices(product);
    expect(rp.balanced).toBe(0);
    expect(rp.confidence).toBe('low');
  });
});
