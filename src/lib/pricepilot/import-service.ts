/**
 * PricePilot - Row-Safe Import Service
 *
 * Replaces the unsafe import execution that previously ran
 * `newProducts.map(p => recalcProduct(...))` as a single batch.
 *
 * CONTRACTS:
 *   1. `processImportRows` NEVER throws. One bad row does NOT stop
 *      the import. Each row produces an independent `ImportRowResult`.
 *   2. Empty rows are skipped or rejected safely.
 *   3. Missing purchase cost imports the row as `needs-review`
 *      (recoverable, NOT rejected).
 *   4. Currency-formatted costs ("₹1,250") parse.
 *   5. Percentage values ("18%") parse.
 *   6. Invalid fees and invalid tax settings are reported per row.
 *   7. The original row number is preserved on every result.
 *   8. A completion summary is produced for the UI:
 *        "97 products are ready to import.
 *         2 products need review.
 *         1 row could not be imported."
 *   9. A CSV issue report can be downloaded for rows that need attention.
 */

import { Product, BusinessSettings, PricingRule } from './types';
import { normalizeProduct, ProductNormalizationIssue } from './product-normalizer';
import { safelyRecalculateProduct } from './safe-calculation';

// ============================================================
// Types
// ============================================================

export interface ImportRowIssue {
  field?: string;
  code: string;
  message: string;
  severity: 'warning' | 'error';
  /** Original value from the spreadsheet, for the issue report. */
  originalValue?: unknown;
  /** Suggested action for the owner. */
  suggestedAction?: string;
}

export interface ImportRowResult {
  rowNumber: number;
  status: 'valid' | 'needs-review' | 'duplicate' | 'rejected';
  product?: Product;
  issues: ImportRowIssue[];
  originalRow: Record<string, unknown>;
}

export interface ImportBatchResult {
  results: ImportRowResult[];
  validProducts: Product[];
  needsReviewProducts: Product[];
  duplicateProducts: Product[];
  rejectedCount: number;
  totalCount: number;
  summary: {
    readyToImport: number;
    needsReview: number;
    rejected: number;
    duplicates: number;
    message: string;
  };
}

// ============================================================
// Internal: detect empty rows
// ============================================================

function isEmptyRow(row: Record<string, unknown>): boolean {
  if (!row || typeof row !== 'object') return true;
  const values = Object.values(row);
  if (values.length === 0) return true;
  // A row is empty if every value is null, undefined, or an empty/whitespace string.
  return values.every(v => {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    return false;
  });
}

// ============================================================
// Internal: convert a normalization issue into an import issue
// ============================================================

function normalizationIssueToImportIssue(
  issue: ProductNormalizationIssue,
  originalRow: Record<string, unknown>
): ImportRowIssue {
  const originalValue = issue.field ? originalRow[issue.field] : undefined;
  let suggestedAction: string | undefined;
  switch (issue.code) {
    case 'missing-purchase-cost':
      suggestedAction = 'Add a purchase cost to this product before approving any price.';
      break;
    case 'fee-negative':
    case 'fee-above-100':
      suggestedAction = 'Correct the fee percentage to a value between 0 and 100.';
      break;
    case 'negative-clamped':
      suggestedAction = 'Provide a non-negative value.';
      break;
    case 'non-finite':
      suggestedAction = 'Replace NaN/Infinity/blank with a real number.';
      break;
    case 'unparseable-string':
      suggestedAction = 'Use a plain number, e.g. 1250 or 1250.50. Avoid mixing currency symbols and text.';
      break;
    case 'invalid-enum':
      suggestedAction = 'Use one of the allowed values for this field.';
      break;
    case 'missing-identity':
      suggestedAction = 'Add at least a Product Name or a SKU.';
      break;
    default:
      suggestedAction = undefined;
  }
  return {
    field: issue.field,
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    originalValue,
    suggestedAction,
  };
}

// ============================================================
// Main Entry Point
// ============================================================

export function processImportRows(
  rows: unknown[],
  businessSettings: BusinessSettings,
  pricingRules: PricingRule[],
  options?: {
    /** SKUs already in the catalogue — duplicates are flagged. */
    existingSkus?: Set<string>;
  }
): ImportBatchResult {
  const results: ImportRowResult[] = [];
  const validProducts: Product[] = [];
  const needsReviewProducts: Product[] = [];
  const duplicateProducts: Product[] = [];
  const existingSkus = options?.existingSkus ?? new Set<string>();
  let rejectedCount = 0;

  if (!Array.isArray(rows)) {
    return {
      results,
      validProducts,
      needsReviewProducts,
      duplicateProducts,
      rejectedCount: 0,
      totalCount: 0,
      summary: {
        readyToImport: 0,
        needsReview: 0,
        rejected: 0,
        duplicates: 0,
        message: 'No rows were provided.',
      },
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    const rowNumber = i + 1;

    // The row must be a non-null object we can iterate.
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
      results.push({
        rowNumber,
        status: 'rejected',
        issues: [{
          code: 'not-an-object',
          message: `Row ${rowNumber} was not a valid record and could not be imported.`,
          severity: 'error',
          originalValue: rawRow,
          suggestedAction: 'Make sure the spreadsheet has a header row and consistent columns.',
        }],
        originalRow: {},
      });
      rejectedCount++;
      continue;
    }

    const originalRow = rawRow as Record<string, unknown>;

    // Skip empty rows (don't even count them as rejected).
    if (isEmptyRow(originalRow)) {
      continue;
    }

    // Normalize the row. This never throws.
    const normResult = normalizeProduct(originalRow, {
      source: 'import',
      rowNumber,
    });

    // Convert normalization issues to import issues.
    const importIssues: ImportRowIssue[] = normResult.issues.map(issue =>
      normalizationIssueToImportIssue(issue, originalRow)
    );

    // Hard rejection: no identity (no name AND no sku).
    if (!normResult.success && normResult.product.name === 'Unnamed product' && normResult.product.sku === '') {
      results.push({
        rowNumber,
        status: 'rejected',
        issues: importIssues,
        originalRow,
      });
      rejectedCount++;
      continue;
    }

    // Duplicate detection by SKU.
    const sku = normResult.product.sku?.trim();
    if (sku && existingSkus.has(sku.toLowerCase())) {
      // We still produce the product so the caller can offer reconciliation
      // (update / fill-missing / keep-existing / create-copy / skip).
      duplicateProducts.push(normResult.product);
      results.push({
        rowNumber,
        status: 'duplicate',
        product: normResult.product,
        issues: [
          ...importIssues,
          {
            code: 'duplicate-sku',
            message: `This SKU "${sku}" already exists in your catalogue.`,
            severity: 'warning',
            originalValue: sku,
            suggestedAction: 'Choose: Update Existing Product, Fill Only Missing Fields, Keep Existing Product, Create Separate Copy, or Skip.',
          },
        ],
        originalRow,
      });
      continue;
    }

    // Recalculate using the safe wrapper. This never throws.
    const calcResult = safelyRecalculateProduct(
      normResult.product,
      businessSettings,
      pricingRules
    );

    const product = calcResult.product;

    // Append calculation warnings as import issues.
    if (!calcResult.success && 'error' in calcResult) {
      importIssues.push({
        code: calcResult.error.code,
        message: calcResult.error.message,
        severity: 'warning',
        suggestedAction: 'The product was imported but flagged for review.',
      });
    }

    // Classify the row.
    if (product.lifecycleStatus === 'needs-review' || product.calculatedPricingStatus === 'missing-data') {
      needsReviewProducts.push(product);
      results.push({
        rowNumber,
        status: 'needs-review',
        product,
        issues: importIssues,
        originalRow,
      });
    } else {
      validProducts.push(product);
      results.push({
        rowNumber,
        status: 'valid',
        product,
        issues: importIssues,
        originalRow,
      });
    }
  }

  // Build the completion summary.
  const readyToImport = validProducts.length;
  const needsReview = needsReviewProducts.length;
  const rejected = rejectedCount;
  const duplicates = duplicateProducts.length;

  const messageLines: string[] = [];
  if (readyToImport > 0) {
    messageLines.push(`${readyToImport} ${readyToImport === 1 ? 'product is' : 'products are'} ready to import.`);
  }
  if (needsReview > 0) {
    messageLines.push(`${needsReview} ${needsReview === 1 ? 'product needs' : 'products need'} review.`);
  }
  if (duplicates > 0) {
    messageLines.push(`${duplicates} duplicate ${duplicates === 1 ? 'SKU requires' : 'SKUs require'} reconciliation.`);
  }
  if (rejected > 0) {
    messageLines.push(`${rejected} ${rejected === 1 ? 'row could' : 'rows could'} not be imported.`);
  }
  if (messageLines.length === 0) {
    messageLines.push('No rows were imported.');
  }
  const message = messageLines.join('\n');

  return {
    results,
    validProducts,
    needsReviewProducts,
    duplicateProducts,
    rejectedCount,
    totalCount: rows.length,
    summary: {
      readyToImport,
      needsReview,
      rejected,
      duplicates,
      message,
    },
  };
}

// ============================================================
// Issue Report (CSV)
// ============================================================

/**
 * Build a CSV issue report for rows that need attention
 * (needs-review, duplicate, rejected).
 *
 * Columns: Row, Product Name, SKU, Field, Problem, Original Value, Suggested Action.
 */
export function buildIssueReportCsv(results: ImportRowResult[]): string {
  const header = ['Row', 'Product Name', 'SKU', 'Field', 'Problem', 'Original Value', 'Suggested Action'];
  const lines: string[] = [header.join(',')];

  for (const r of results) {
    if (r.status === 'valid') continue;
    const productName = r.product?.name ?? '';
    const sku = r.product?.sku ?? '';
    for (const issue of r.issues) {
      const row = [
        String(r.rowNumber),
        csvEscape(productName),
        csvEscape(sku),
        csvEscape(issue.field ?? ''),
        csvEscape(issue.message),
        csvEscape(issue.originalValue === undefined ? '' : String(issue.originalValue)),
        csvEscape(issue.suggestedAction ?? ''),
      ];
      lines.push(row.join(','));
    }
    // If the row has no specific issues (shouldn't happen for non-valid rows,
    // but be defensive), still emit one line.
    if (r.issues.length === 0) {
      lines.push([
        String(r.rowNumber),
        csvEscape(productName),
        csvEscape(sku),
        '',
        csvEscape(`Row ${r.rowNumber} was ${r.status}.`),
        '',
        '',
      ].join(','));
    }
  }

  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (value === '') return '';
  // Wrap in quotes if the value contains a comma, quote, or newline.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Trigger a browser download of the issue report CSV.
 */
export function downloadIssueReport(results: ImportRowResult[]): void {
  try {
    const csv = buildIssueReportCsv(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pricepilot-import-issues-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[PricePilot Import] Could not download issue report.', err);
  }
}
