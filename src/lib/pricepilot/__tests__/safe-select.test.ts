/**
 * PricePilot - Safe Select Options Tests
 *
 * Regression tests for the crash caused by empty category/brand
 * values being used as Radix SelectItem values.
 *
 * Root cause: Imported products have empty category/brand strings,
 * and [...new Set(products.map(p => p.category))] includes "" as
 * a SelectItem value, which Radix rejects with:
 *   "A <Select.Item /> must have a value prop that is not an empty string."
 */

import { describe, it, expect } from 'vitest';
import {
  buildNonEmptyOptions,
  UNCATEGORISED_FILTER,
  UNKNOWN_BRAND_FILTER,
  isBlankCategory,
  isBlankBrand,
  categoryMatchesFilter,
  brandMatchesFilter,
  categoryFilterLabel,
  brandFilterLabel,
} from '../safe-select';

describe('buildNonEmptyOptions', () => {
  it('excludes empty strings from the result', () => {
    const values = ['Electronics', '', 'Clothing', '', 'Food'];
    const result = buildNonEmptyOptions(values);
    expect(result).not.toContain('');
    expect(result).toEqual(['Clothing', 'Electronics', 'Food']);
  });

  it('excludes whitespace-only strings from the result', () => {
    const values = ['Electronics', '   ', 'Clothing', '\t', 'Food'];
    const result = buildNonEmptyOptions(values);
    expect(result).not.toContain('');
    expect(result).not.toContain('   ');
    expect(result).toEqual(['Clothing', 'Electronics', 'Food']);
  });

  it('deduplicates category options', () => {
    const values = ['Electronics', 'Electronics', 'Clothing', 'Clothing', 'Food'];
    const result = buildNonEmptyOptions(values);
    expect(result).toEqual(['Clothing', 'Electronics', 'Food']);
  });

  it('sorts options alphabetically', () => {
    const values = ['Zebra', 'Apple', 'Mango'];
    const result = buildNonEmptyOptions(values);
    expect(result).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('excludes null and undefined values', () => {
    const values = ['Electronics', null, 'Clothing', undefined, 'Food'];
    const result = buildNonEmptyOptions(values);
    expect(result).toEqual(['Clothing', 'Electronics', 'Food']);
  });

  it('includes sentinel when blanks are found', () => {
    const values = ['Electronics', '', 'Clothing'];
    const result = buildNonEmptyOptions(values, UNCATEGORISED_FILTER);
    expect(result).toContain(UNCATEGORISED_FILTER);
    expect(result).toEqual(['Clothing', 'Electronics', UNCATEGORISED_FILTER]);
  });

  it('does not include sentinel when no blanks are found', () => {
    const values = ['Electronics', 'Clothing'];
    const result = buildNonEmptyOptions(values, UNCATEGORISED_FILTER);
    expect(result).not.toContain(UNCATEGORISED_FILTER);
    expect(result).toEqual(['Clothing', 'Electronics']);
  });

  it('includes sentinel when only null values are present', () => {
    const values = [null, undefined];
    const result = buildNonEmptyOptions(values, UNCATEGORISED_FILTER);
    expect(result).toEqual([UNCATEGORISED_FILTER]);
  });

  it('returns empty array when no values and no blanks', () => {
    const values: string[] = [];
    const result = buildNonEmptyOptions(values);
    expect(result).toEqual([]);
  });

  it('handles a realistic 200-product scenario with empty categories', () => {
    const values: (string | null | undefined)[] = [];
    // 12 demo products with categories
    for (let i = 0; i < 12; i++) {
      values.push(['Electronics', 'Clothing', 'Food'][i % 3]);
    }
    // 188 imported products with empty categories
    for (let i = 0; i < 188; i++) {
      values.push('');
    }
    const result = buildNonEmptyOptions(values, UNCATEGORISED_FILTER);
    expect(result).not.toContain('');
    expect(result).toContain('Electronics');
    expect(result).toContain('Clothing');
    expect(result).toContain('Food');
    expect(result).toContain(UNCATEGORISED_FILTER);
    expect(result).toHaveLength(4);
  });
});

describe('isBlankCategory', () => {
  it('returns true for empty string', () => {
    expect(isBlankCategory('')).toBe(true);
  });

  it('returns true for whitespace-only string', () => {
    expect(isBlankCategory('   ')).toBe(true);
  });

  it('returns true for null', () => {
    expect(isBlankCategory(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isBlankCategory(undefined)).toBe(true);
  });

  it('returns false for a valid category', () => {
    expect(isBlankCategory('Electronics')).toBe(false);
  });

  it('returns false for a category with leading/trailing spaces', () => {
    expect(isBlankCategory(' Electronics ')).toBe(false);
  });
});

describe('isBlankBrand', () => {
  it('returns true for empty string', () => {
    expect(isBlankBrand('')).toBe(true);
  });

  it('returns true for null', () => {
    expect(isBlankBrand(null)).toBe(true);
  });

  it('returns false for a valid brand', () => {
    expect(isBlankBrand('Samsung')).toBe(false);
  });
});

describe('categoryMatchesFilter', () => {
  it('matches all products when filter is "all"', () => {
    expect(categoryMatchesFilter('Electronics', 'all')).toBe(true);
    expect(categoryMatchesFilter('', 'all')).toBe(true);
  });

  it('matches uncategorised products when filter is UNCATEGORISED_FILTER', () => {
    expect(categoryMatchesFilter('', UNCATEGORISED_FILTER)).toBe(true);
    expect(categoryMatchesFilter('   ', UNCATEGORISED_FILTER)).toBe(true);
  });

  it('does not match categorised products when filter is UNCATEGORISED_FILTER', () => {
    expect(categoryMatchesFilter('Electronics', UNCATEGORISED_FILTER)).toBe(false);
  });

  it('matches products by exact category', () => {
    expect(categoryMatchesFilter('Electronics', 'Electronics')).toBe(true);
    expect(categoryMatchesFilter('Clothing', 'Electronics')).toBe(false);
  });
});

describe('brandMatchesFilter', () => {
  it('matches all products when filter is "all"', () => {
    expect(brandMatchesFilter('Samsung', 'all')).toBe(true);
    expect(brandMatchesFilter('', 'all')).toBe(true);
  });

  it('matches unknown-brand products when filter is UNKNOWN_BRAND_FILTER', () => {
    expect(brandMatchesFilter('', UNKNOWN_BRAND_FILTER)).toBe(true);
  });

  it('does not match known-brand products when filter is UNKNOWN_BRAND_FILTER', () => {
    expect(brandMatchesFilter('Samsung', UNKNOWN_BRAND_FILTER)).toBe(false);
  });

  it('matches products by exact brand', () => {
    expect(brandMatchesFilter('Samsung', 'Samsung')).toBe(true);
    expect(brandMatchesFilter('Apple', 'Samsung')).toBe(false);
  });
});

describe('categoryFilterLabel', () => {
  it('returns "Uncategorised" for the sentinel value', () => {
    expect(categoryFilterLabel(UNCATEGORISED_FILTER)).toBe('Uncategorised');
  });

  it('returns the category name for a regular value', () => {
    expect(categoryFilterLabel('Electronics')).toBe('Electronics');
  });
});

describe('brandFilterLabel', () => {
  it('returns "Unknown brand" for the sentinel value', () => {
    expect(brandFilterLabel(UNKNOWN_BRAND_FILTER)).toBe('Unknown brand');
  });

  it('returns the brand name for a regular value', () => {
    expect(brandFilterLabel('Samsung')).toBe('Samsung');
  });
});
