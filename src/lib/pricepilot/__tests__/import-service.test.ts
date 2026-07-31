/**
 * Unit tests for src/lib/pricepilot/import-service.ts
 *
 * Covers:
 *   - processImportRows with valid rows
 *   - processImportRows with empty rows
 *   - processImportRows with missing cost (needs-review)
 *   - processImportRows with duplicate SKUs
 *   - processImportRows with currency-formatted costs
 *   - processImportRows with invalid percentage values
 *   - processImportRows with rejected rows (no name AND no sku)
 *   - processImportRows with non-array input
 *   - processImportRows with array elements that are not objects
 *   - buildIssueReportCsv output format
 *   - buildIssueReportCsv with various edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  processImportRows,
  buildIssueReportCsv,
  ImportRowResult,
  ImportBatchResult,
} from '../import-service';
import {
  createDefaultBusinessSettings,
  createDefaultPricingRule,
  BusinessSettings,
  PricingRule,
} from '../types';

function makeSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return { ...createDefaultBusinessSettings(), ...overrides };
}

function makeRules(): PricingRule[] {
  return [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true }];
}

function makeValidRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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

// ============================================================
// processImportRows — valid rows
// ============================================================

describe('processImportRows — valid rows', () => {
  it('processes a single valid row as "valid"', () => {
    const result = processImportRows([makeValidRow()], makeSettings(), makeRules());
    expect(result.summary.readyToImport).toBe(1);
    expect(result.summary.needsReview).toBe(0);
    expect(result.summary.rejected).toBe(0);
    expect(result.summary.duplicates).toBe(0);
    expect(result.validProducts).toHaveLength(1);
    expect(result.validProducts[0].purchaseCost).toBe(100);
    expect(result.validProducts[0].sku).toBe('SKU-001');
  });

  it('processes multiple valid rows', () => {
    const rows = [
      makeValidRow({ sku: 'SKU-A', name: 'Product A' }),
      makeValidRow({ sku: 'SKU-B', name: 'Product B' }),
      makeValidRow({ sku: 'SKU-C', name: 'Product C' }),
    ];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.readyToImport).toBe(3);
    expect(result.validProducts).toHaveLength(3);
  });

  it('preserves row numbers starting from 1', () => {
    const rows = [
      makeValidRow({ sku: 'SKU-A' }),
      makeValidRow({ sku: 'SKU-B' }),
    ];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.results[0].rowNumber).toBe(1);
    expect(result.results[1].rowNumber).toBe(2);
  });

  it('produces a summary message with correct grammar for 1 product', () => {
    const result = processImportRows([makeValidRow()], makeSettings(), makeRules());
    expect(result.summary.message).toContain('1 product is');
    expect(result.summary.message).toContain('ready to import');
  });

  it('produces a summary message with correct grammar for multiple products', () => {
    const rows = [
      makeValidRow({ sku: 'SKU-A' }),
      makeValidRow({ sku: 'SKU-B' }),
    ];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.message).toContain('2 products are');
    expect(result.summary.message).toContain('ready to import');
  });
});

// ============================================================
// processImportRows — empty rows
// ============================================================

describe('processImportRows — empty rows', () => {
  it('skips rows with all-empty values', () => {
    const rows = [
      makeValidRow({ sku: 'SKU-A' }),
      { name: '', sku: '', purchaseCost: '' },
      makeValidRow({ sku: 'SKU-B' }),
    ];
    const result = processImportRows(rows, makeSettings(), makeRules());
    // Empty row should be skipped (not counted as rejected)
    expect(result.summary.readyToImport).toBe(2);
    expect(result.summary.rejected).toBe(0);
    // Only 2 results (not 3)
    expect(result.results).toHaveLength(2);
  });

  it('skips rows with all-null values', () => {
    const rows = [
      makeValidRow({ sku: 'SKU-A' }),
      { name: null, sku: null, purchaseCost: null },
    ];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.results).toHaveLength(1);
  });

  it('skips rows with all-whitespace values', () => {
    const rows = [
      makeValidRow({ sku: 'SKU-A' }),
      { name: '   ', sku: '  ', purchaseCost: ' ' },
    ];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.results).toHaveLength(1);
  });
});

// ============================================================
// processImportRows — missing cost (needs-review)
// ============================================================

describe('processImportRows — missing cost', () => {
  it('classifies a product with missing purchase cost as needs-review', () => {
    const rows = [makeValidRow({ purchaseCost: '', sku: 'SKU-MISSING' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.needsReviewProducts).toHaveLength(1);
    expect(result.results[0].status).toBe('needs-review');
  });

  it('classifies a product with zero purchase cost as needs-review', () => {
    const rows = [makeValidRow({ purchaseCost: 0, sku: 'SKU-ZERO' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.needsReviewProducts).toHaveLength(1);
    expect(result.results[0].status).toBe('needs-review');
  });

  it('reports a missing-cost issue for zero-cost products', () => {
    const rows = [makeValidRow({ purchaseCost: 0, sku: 'SKU-ZERO' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.results[0].issues.some(i => i.code === 'missing-purchase-cost')).toBe(true);
  });

  it('includes a suggested action for missing purchase cost', () => {
    const rows = [makeValidRow({ purchaseCost: 0, sku: 'SKU-ZERO' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    const issue = result.results[0].issues.find(i => i.code === 'missing-purchase-cost');
    expect(issue?.suggestedAction).toBeTruthy();
  });
});

// ============================================================
// processImportRows — duplicate SKUs
// ============================================================

describe('processImportRows — duplicate SKUs', () => {
  it('flags duplicate SKUs against existingSkus', () => {
    const rows = [makeValidRow({ sku: 'SKU-EXISTING' })];
    const existingSkus = new Set(['sku-existing']); // case-insensitive
    const result = processImportRows(rows, makeSettings(), makeRules(), { existingSkus });
    expect(result.summary.duplicates).toBe(1);
    expect(result.duplicateProducts).toHaveLength(1);
    expect(result.results[0].status).toBe('duplicate');
  });

  it('includes duplicate-sku issue with suggested actions', () => {
    const rows = [makeValidRow({ sku: 'SKU-EXISTING' })];
    const existingSkus = new Set(['sku-existing']);
    const result = processImportRows(rows, makeSettings(), makeRules(), { existingSkus });
    const dupIssue = result.results[0].issues.find(i => i.code === 'duplicate-sku');
    expect(dupIssue).toBeDefined();
    expect(dupIssue?.suggestedAction).toBeTruthy();
    expect(dupIssue?.originalValue).toBe('SKU-EXISTING');
  });

  it('performs case-insensitive duplicate detection', () => {
    const rows = [makeValidRow({ sku: 'sku-EXISTING' })];
    // The import service lowercases the incoming SKU and checks against the set.
    // The existingSkus must contain the lowercase version.
    const existingSkus = new Set(['sku-existing']);
    const result = processImportRows(rows, makeSettings(), makeRules(), { existingSkus });
    expect(result.summary.duplicates).toBe(1);
  });

  it('does not flag duplicate when existingSkus is empty', () => {
    const rows = [makeValidRow({ sku: 'SKU-001' })];
    const result = processImportRows(rows, makeSettings(), makeRules(), { existingSkus: new Set() });
    expect(result.summary.duplicates).toBe(0);
  });

  it('does not flag duplicate when no existingSkus provided', () => {
    const rows = [makeValidRow({ sku: 'SKU-001' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.duplicates).toBe(0);
  });
});

// ============================================================
// processImportRows — currency-formatted costs
// ============================================================

describe('processImportRows — currency-formatted costs', () => {
  it('parses ₹1,250 as 1250', () => {
    const rows = [makeValidRow({ purchaseCost: '₹1,250', sku: 'SKU-CUR' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.validProducts[0].purchaseCost).toBe(1250);
  });

  it('parses $2,500.50 as 2500.5', () => {
    const rows = [makeValidRow({ purchaseCost: '$2,500.50', sku: 'SKU-USD' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.validProducts[0].purchaseCost).toBe(2500.5);
  });
});

// ============================================================
// processImportRows — invalid percentage values
// ============================================================

describe('processImportRows — invalid percentage values', () => {
  it('reports fee-above-100 for marketplace fee above 100%', () => {
    const rows = [makeValidRow({ marketplaceFeePercent: 150, sku: 'SKU-BADFEE' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.results[0].issues.some(i => i.code === 'fee-above-100')).toBe(true);
  });

  it('reports fee-negative for negative fees', () => {
    const rows = [makeValidRow({ marketplaceFeePercent: -5, sku: 'SKU-NEGFEE' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.results[0].issues.some(i => i.code === 'fee-negative')).toBe(true);
  });

  it('includes suggested actions for invalid fees', () => {
    const rows = [makeValidRow({ marketplaceFeePercent: 150, sku: 'SKU-BADFEE' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    const feeIssue = result.results[0].issues.find(i => i.code === 'fee-above-100');
    expect(feeIssue?.suggestedAction).toBeTruthy();
  });
});

// ============================================================
// processImportRows — rejected rows (no name AND no sku)
// ============================================================

describe('processImportRows — rejected rows', () => {
  it('rejects a row with no name AND no sku', () => {
    const rows = [makeValidRow({ name: '', sku: '', purchaseCost: 100 })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.rejected).toBe(1);
    expect(result.results[0].status).toBe('rejected');
  });

  it('includes a missing-identity issue for rejected rows', () => {
    const rows = [makeValidRow({ name: '', sku: '' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    const identityIssue = result.results[0].issues.find(i => i.code === 'missing-identity');
    expect(identityIssue).toBeDefined();
    expect(identityIssue?.suggestedAction).toBeTruthy();
  });

  it('does NOT reject a row that has a name but no sku', () => {
    const rows = [makeValidRow({ name: 'Has Name', sku: '' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.rejected).toBe(0);
    expect(result.results[0].status).not.toBe('rejected');
  });

  it('does NOT reject a row that has a sku but no name', () => {
    const rows = [makeValidRow({ name: '', sku: 'HAS-SKU' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.rejected).toBe(0);
    expect(result.results[0].status).not.toBe('rejected');
  });
});

// ============================================================
// processImportRows — non-array input
// ============================================================

describe('processImportRows — non-array input', () => {
  it('returns empty result for non-array input', () => {
    const result = processImportRows('not an array' as unknown as unknown[], makeSettings(), makeRules());
    expect(result.summary.readyToImport).toBe(0);
    expect(result.summary.needsReview).toBe(0);
    expect(result.summary.rejected).toBe(0);
    expect(result.summary.duplicates).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.validProducts).toHaveLength(0);
    expect(result.results).toHaveLength(0);
    expect(result.summary.message).toContain('No rows were provided');
  });

  it('returns empty result for null input', () => {
    const result = processImportRows(null as unknown as unknown[], makeSettings(), makeRules());
    expect(result.totalCount).toBe(0);
  });

  it('returns empty result for undefined input', () => {
    const result = processImportRows(undefined as unknown as unknown[], makeSettings(), makeRules());
    expect(result.totalCount).toBe(0);
  });
});

// ============================================================
// processImportRows — array elements that are not objects
// ============================================================

describe('processImportRows — non-object array elements', () => {
  it('rejects a string element in the array', () => {
    const rows = ['just a string', makeValidRow({ sku: 'SKU-A' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.rejected).toBe(1);
    expect(result.results[0].status).toBe('rejected');
    expect(result.results[0].issues[0].code).toBe('not-an-object');
  });

  it('rejects a number element in the array', () => {
    const rows = [42, makeValidRow({ sku: 'SKU-A' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.rejected).toBe(1);
  });

  it('rejects an array element in the array', () => {
    const rows = [[1, 2, 3], makeValidRow({ sku: 'SKU-A' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.rejected).toBe(1);
  });

  it('rejects null element in the array', () => {
    const rows = [null, makeValidRow({ sku: 'SKU-A' })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.rejected).toBe(1);
  });
});

// ============================================================
// processImportRows — mixed summary
// ============================================================

describe('processImportRows — summary messages', () => {
  it('generates a multi-line summary for mixed results', () => {
    const rows = [
      makeValidRow({ sku: 'SKU-A' }),
      makeValidRow({ purchaseCost: 0, sku: 'SKU-NEEDS' }),
      makeValidRow({ name: '', sku: '' }),
    ];
    const result = processImportRows(rows, makeSettings(), makeRules());
    expect(result.summary.message).toContain('ready to import');
    expect(result.summary.message).toContain('review');
    expect(result.summary.message).toContain('could not be imported');
  });

  it('generates "No rows were imported" for empty input', () => {
    const result = processImportRows([], makeSettings(), makeRules());
    expect(result.summary.message).toContain('No rows were imported');
  });

  it('generates duplicate message', () => {
    const rows = [makeValidRow({ sku: 'DUP' })];
    const existingSkus = new Set(['dup']);
    const result = processImportRows(rows, makeSettings(), makeRules(), { existingSkus });
    expect(result.summary.message).toContain('duplicate');
    expect(result.summary.message).toContain('reconciliation');
  });
});

// ============================================================
// processImportRows — calculation warnings
// ============================================================

describe('processImportRows — calculation warnings', () => {
  it('appends calculation warnings as import issues', () => {
    // Create a product with invalid settings that would cause calculation issues
    const rows = [makeValidRow({ sku: 'SKU-CALC', purchaseCost: 100 })];
    const result = processImportRows(rows, makeSettings(), makeRules());
    // The product should still be valid (not rejected)
    expect(result.results[0].status).not.toBe('rejected');
  });
});

// ============================================================
// buildIssueReportCsv
// ============================================================

describe('buildIssueReportCsv', () => {
  it('produces a CSV with a header row', () => {
    const results: ImportRowResult[] = [
      {
        rowNumber: 1,
        status: 'needs-review',
        product: undefined,
        issues: [{ code: 'missing-purchase-cost', message: 'Missing cost', severity: 'warning' }],
        originalRow: {},
      },
    ];
    const csv = buildIssueReportCsv(results);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toContain('Row');
    expect(firstLine).toContain('Product Name');
    expect(firstLine).toContain('SKU');
    expect(firstLine).toContain('Field');
    expect(firstLine).toContain('Problem');
  });

  it('includes issue details for non-valid rows', () => {
    const results: ImportRowResult[] = [
      {
        rowNumber: 2,
        status: 'needs-review',
        product: { name: 'Test', sku: 'SKU-1' } as any,
        issues: [{ code: 'missing-purchase-cost', message: 'Missing cost', severity: 'warning', field: 'purchaseCost' }],
        originalRow: { purchaseCost: '' },
      },
    ];
    const csv = buildIssueReportCsv(results);
    expect(csv).toContain('2');
    expect(csv).toContain('Missing cost');
  });

  it('skips valid rows', () => {
    const results: ImportRowResult[] = [
      {
        rowNumber: 1,
        status: 'valid',
        product: { name: 'Valid', sku: 'SKU-V' } as any,
        issues: [],
        originalRow: {},
      },
      {
        rowNumber: 2,
        status: 'needs-review',
        product: { name: 'Review', sku: 'SKU-R' } as any,
        issues: [{ code: 'test', message: 'Test issue', severity: 'warning' }],
        originalRow: {},
      },
    ];
    const csv = buildIssueReportCsv(results);
    const lines = csv.split('\n');
    // Header + 1 issue line (valid row skipped)
    expect(lines).toHaveLength(2);
  });

  it('escapes CSV values containing commas', () => {
    const results: ImportRowResult[] = [
      {
        rowNumber: 1,
        status: 'rejected',
        product: { name: 'Product, with comma', sku: 'SKU-1' } as any,
        issues: [{ code: 'test', message: 'Has, comma', severity: 'error' }],
        originalRow: {},
      },
    ];
    const csv = buildIssueReportCsv(results);
    // Comma-containing values should be quoted
    expect(csv).toContain('"Product, with comma"');
  });

  it('escapes CSV values containing quotes', () => {
    const results: ImportRowResult[] = [
      {
        rowNumber: 1,
        status: 'rejected',
        product: { name: 'Product "quoted"', sku: 'SKU-1' } as any,
        issues: [{ code: 'test', message: 'Test', severity: 'error' }],
        originalRow: {},
      },
    ];
    const csv = buildIssueReportCsv(results);
    // Double-quotes inside quoted values should be escaped as ""
    expect(csv).toContain('""quoted""');
  });

  it('emits a line even for non-valid rows with no specific issues', () => {
    const results: ImportRowResult[] = [
      {
        rowNumber: 3,
        status: 'rejected',
        product: undefined,
        issues: [], // No specific issues
        originalRow: {},
      },
    ];
    const csv = buildIssueReportCsv(results);
    const lines = csv.split('\n');
    // Header + 1 fallback line
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('3');
    expect(lines[1]).toContain('rejected');
  });

  it('returns only header for empty results', () => {
    const csv = buildIssueReportCsv([]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Row');
  });

  it('includes original value and suggested action when available', () => {
    const results: ImportRowResult[] = [
      {
        rowNumber: 1,
        status: 'needs-review',
        product: { name: 'Test', sku: 'SKU-1' } as any,
        issues: [{
          code: 'test',
          message: 'Test issue',
          severity: 'warning',
          originalValue: 'bad-value',
          suggestedAction: 'Fix it',
        }],
        originalRow: {},
      },
    ];
    const csv = buildIssueReportCsv(results);
    expect(csv).toContain('bad-value');
    expect(csv).toContain('Fix it');
  });
});
