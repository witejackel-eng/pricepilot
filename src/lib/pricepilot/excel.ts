/**
 * PricePilot - Excel Import and Export Utilities
 *
 * Handles parsing of Excel and CSV files, automatic column
 * mapping detection, data cleaning, and formatted export.
 *
 * Excel I/O is delegated to the spreadsheet-adapter (ExcelJS).
 */

import {
  ColumnMapping,
  Product,
  BusinessSettings,
  ExportPreset,
  ExportConfig,
  CompetitorPrice,
  ImportError,
  WarningSeverity,
  CleaningOptions,
  CleanImportResult,
  ImportedProductDraft,
  ImportRowIssue,
  ImportStatistics,
  PercentFormat,
  DuplicateHandling,
} from './types';
import { parseNumericInput } from './formatting';
import {
  parseSpreadsheet,
  createSpreadsheet,
  sanitizeSpreadsheetCell,
  sanitizeSpreadsheetRow,
  sanitizeSpreadsheetRows,
  type WorkbookBuilder,
} from './spreadsheet-adapter';

// ============================================================
// Excel Parsing
// ============================================================

/**
 * Parse an Excel file (xlsx/xls) and return sheets with rows.
 * Each sheet is returned as an array of objects where keys
 * are column headers and values are cell values (as strings).
 *
 * Excel I/O is delegated to the spreadsheet-adapter (ExcelJS).
 */
export async function parseExcelFile(fileBuffer: ArrayBuffer): Promise<{
  sheets: Array<{
    name: string;
    headers: string[];
    rows: Record<string, string>[];
    rawRows: string[][]; // 2D array of cell values (all rows including header) — used for re-parsing with a different heading row
  }>;
  errors: ImportError[];
}> {
  // Delegate to the adapter — same return shape, no caller changes needed.
  return parseSpreadsheet(fileBuffer);
}

/**
 * Re-build a sheet's { headers, rows } from raw 2D rows using a new heading row index.
 * Returns empty headers/rows if the index is out of range.
 */
export function rebuildSheetFromHeadingRow(rawRows: string[][], headingRow: number): {
  headers: string[];
  rows: Record<string, string>[];
} {
  if (headingRow < 0 || headingRow >= rawRows.length) {
    return { headers: [], rows: [] };
  }

  const headers = rawRows[headingRow];
  const rows: Record<string, string>[] = [];
  for (let i = headingRow + 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const stringRow: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      stringRow[headers[j]] = j < rawRow.length ? rawRow[j] : '';
    }
    rows.push(stringRow);
  }
  return { headers, rows };
}

/**
 * Parse a CSV text file and return rows.
 * Handles common CSV formats including comma and tab separation.
 *
 * Also returns the original non-empty lines (rawRows) so the caller can
 * re-parse with a different heading row using `rebuildCSVFromHeadingRow`.
 */
export function parseCSVFile(text: string): {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[]; // original non-empty lines — used for re-parsing with a different heading row
  delimiter: string; // detected delimiter
  errors: ImportError[];
} {
  const errors: ImportError[] = [];

  try {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length < 2) {
      errors.push({
        row: 0,
        column: '',
        value: '',
        message: 'CSV file must have at least a header row and one data row',
        severity: 'error',
      });
      return { headers: [], rows: [], rawRows: lines, delimiter: ',', errors };
    }

    // Detect delimiter (comma, tab, semicolon, pipe)
    const firstLine = lines[0];
    const delimiters = [',', '\t', ';', '|'];
    let bestDelimiter = ',';
    let maxColumns = 0;

    for (const delimiter of delimiters) {
      const columns = splitCSVLine(firstLine, delimiter).length;
      if (columns > maxColumns) {
        maxColumns = columns;
        bestDelimiter = delimiter;
      }
    }

    // Parse headers
    const headers = splitCSVLine(firstLine, bestDelimiter).map(h => h.trim());

    // Parse rows
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = splitCSVLine(lines[i], bestDelimiter);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = j < values.length ? values[j].trim() : '';
      }
      rows.push(row);
    }

    return { headers, rows, rawRows: lines, delimiter: bestDelimiter, errors };
  } catch (error) {
    errors.push({
      row: 0,
      column: '',
      value: '',
      message: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'critical',
    });
    return { headers: [], rows: [], rawRows: [], delimiter: ',', errors };
  }
}

/**
 * Re-build a CSV { headers, rows } from the original non-empty lines using a new heading row index.
 * Uses the same delimiter detection logic as parseCSVFile.
 */
export function rebuildCSVFromHeadingRow(rawRows: string[], headingRow: number): {
  headers: string[];
  rows: Record<string, string>[];
} {
  if (headingRow < 0 || headingRow >= rawRows.length) {
    return { headers: [], rows: [] };
  }

  // Detect delimiter based on the heading row
  const headerLine = rawRows[headingRow];
  const delimiters = [',', '\t', ';', '|'];
  let bestDelimiter = ',';
  let maxColumns = 0;
  for (const delimiter of delimiters) {
    const columns = splitCSVLine(headerLine, delimiter).length;
    if (columns > maxColumns) {
      maxColumns = columns;
      bestDelimiter = delimiter;
    }
  }

  const headers = splitCSVLine(headerLine, bestDelimiter).map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = headingRow + 1; i < rawRows.length; i++) {
    const values = splitCSVLine(rawRows[i], bestDelimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < values.length ? values[j].trim() : '';
    }
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Split a CSV line respecting quoted values.
 * Handles values enclosed in double quotes that may contain the delimiter.
 */
function splitCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Double quote inside quoted value = escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ============================================================
// Column Mapping Detection
// ============================================================

/**
 * Mapping of our target fields to common heading variations.
 * Used for auto-detecting column mappings during import.
 */
const COLUMN_VARIATIONS: Record<string, string[]> = {
  // Identification
  'name': ['product name', 'product_name', 'name', 'item name', 'item_name', 'title', 'description', 'product', 'item'],
  'sku': ['sku', 'product code', 'product_code', 'item code', 'item_code', 'code', 'product id', 'product_id', 'item no', 'item_no', 'part number', 'part_no', 'article number', 'article_no', 'pid', 'prod_id', 'model', 'model number', 'model no'],
  'category': ['category', 'product category', 'product_category', 'cat', 'type', 'product type', 'product_type', 'group', 'product group', 'classification', 'class'],
  'brand': ['brand', 'brand name', 'brand_name', 'manufacturer', 'maker', 'supplier', 'vendor', 'company'],
  'description': ['description', 'desc', 'product description', 'product_desc', 'details', 'short description', 'short_desc', 'summary', 'long description', 'long_desc'],

  // Cost Fields
  'purchaseCost': ['purchase cost', 'purchase_cost', 'cost', 'purchase price', 'purchase_price', 'buying price', 'buying_price', 'buy price', 'unit cost', 'unit_cost', 'base cost', 'base_cost', 'wholesale cost', 'wholesale_cost', 'wholesale price', 'cogs', 'cost of goods', 'acquisition cost', 'acquisition_price', 'price paid', 'paid price', 'supplier price', 'factory cost', 'manufacturing cost', 'raw cost', 'product cost', 'product_cost', 'cost price', 'cost_price', 'landed cost', 'landed_cost'],
  'shippingCost': ['shipping cost', 'shipping_cost', 'shipping', 'freight cost', 'freight_cost', 'freight', 'delivery cost', 'delivery_cost', 'transport cost', 'transport_cost', 'logistics cost', 'logistics_cost', 'inbound shipping', 'inbound_shipping'],
  'packagingCost': ['packaging cost', 'packaging_cost', 'packaging', 'packing cost', 'packing_cost', 'packing', 'box cost', 'box_cost', 'wrapping cost', 'wrapping_cost'],
  'handlingCost': ['handling cost', 'handling_cost', 'handling', 'labour cost', 'labour_cost', 'labor cost', 'labor_cost', 'processing cost', 'processing_cost', 'assembly cost', 'assembly_cost'],
  'otherCosts': ['other costs', 'other_costs', 'other cost', 'misc costs', 'misc_costs', 'miscellaneous costs', 'miscellaneous_costs', 'additional costs', 'additional_costs', 'extra costs', 'extra_costs', 'overhead cost', 'overhead_cost', 'overhead'],
  'returnRatePercent': ['return rate', 'return_rate', 'return rate %', 'return_rate_pct', 'returns %', 'return percentage', 'return_pct', 'refund rate', 'refund_rate', 'returns', 'return pct'],
  'damageRatePercent': ['damage rate', 'damage_rate', 'damage rate %', 'damage_rate_pct', 'damage %', 'damage percentage', 'damage_pct', 'defect rate', 'defect_rate', 'defective rate', 'defective_rate', 'damage pct'],
  'customDutyPercent': ['custom duty', 'custom_duty', 'custom duty %', 'custom_duty_pct', 'duty %', 'import duty', 'import_duty', 'import duty %', 'duty', 'customs duty', 'tariff', 'tariff rate', 'duty pct'],
  'freightPercent': ['freight %', 'freight_pct', 'freight percentage', 'freight percent', 'freight percent of cost', 'shipping percent', 'shipping_pct', 'transport %'],

  // Selling Fields
  'currentSellingPrice': ['selling price', 'selling_price', 'sell price', 'sell_price', 'current price', 'current_price', 'price', 'sale price', 'sale_price', 'retail price', 'retail_price', 'listing price', 'listing_price', 'mrp', 'maximum retail price', 'market price', 'market_price', 'offered price', 'offered_price', 'selling', 'sp', 'sell'],
  'taxRatePercent': ['tax rate', 'tax_rate', 'tax %', 'tax_pct', 'gst rate', 'gst_rate', 'gst %', 'gst_pct', 'vat rate', 'vat_rate', 'vat %', 'vat_pct', 'tax', 'gst', 'vat', 'sales tax', 'sales_tax', 'tax percentage', 'commission'],
  'taxTreatment': ['tax treatment', 'tax_treatment', 'tax type', 'tax_type', 'tax inclusive', 'tax_inclusive', 'tax exclusive', 'tax_exclusive', 'gst treatment', 'gst_treatment', 'gst type', 'gst_type'],

  // Fee Fields
  'marketplaceFeePercent': ['marketplace fee', 'marketplace_fee', 'marketplace fee %', 'marketplace_fee_pct', 'platform fee', 'platform_fee', 'platform fee %', 'platform_fee_pct', 'commission %', 'commission_pct', 'marketplace commission', 'channel fee', 'channel_fee', 'channel fee %', 'seller fee', 'seller_fee', 'listing fee %', 'listing_fee_pct'],
  'marketplaceFeeFixed': ['marketplace fixed fee', 'marketplace_fixed_fee', 'fixed marketplace fee', 'platform fixed fee', 'platform_fixed_fee', 'fixed commission', 'fixed_fee', 'fixed fee', 'per order fee', 'per_order_fee', 'order fee', 'transaction fee fixed', 'flat fee'],
  'paymentFeePercent': ['payment fee', 'payment_fee', 'payment fee %', 'payment_fee_pct', 'gateway fee', 'gateway_fee', 'gateway fee %', 'gateway_fee_pct', 'payment gateway fee', 'payment_gateway_fee', 'payment commission', 'payment commission %', 'processing fee %', 'processing_fee_pct'],
  'paymentFeeFixed': ['payment fixed fee', 'payment_fixed_fee', 'fixed payment fee', 'gateway fixed fee', 'gateway_fixed_fee', 'payment processing fixed', 'payment_processing_fixed', 'transaction fee', 'transaction_fee', 'flat payment fee'],
  'shippingChargeToCustomer': ['shipping charge', 'shipping_charge', 'customer shipping', 'customer_shipping', 'shipping to customer', 'shipping_to_customer', 'delivery charge', 'delivery_charge', 'outbound shipping', 'outbound_shipping'],
  'otherFeesPercent': ['other fees %', 'other_fees_pct', 'additional fees %', 'additional_fees_pct', 'extra fees %', 'extra_fees_pct', 'other percentage fees', 'other_percentage_fees'],
  'otherFeesFixed': ['other fixed fees', 'other_fixed_fees', 'other fees fixed', 'additional fixed fees', 'additional_fixed_fees', 'extra fixed fees', 'extra_fixed_fees', 'misc fees fixed', 'misc_fees_fixed'],
  'salesChannel': ['channel', 'sales channel', 'sales_channel', 'channel type', 'channel_type', 'platform', 'selling channel', 'selling_channel', 'distribution channel', 'distribution_channel'],

  // Competitor
  'competitorPrices': ['competitor price', 'competitor_price', 'comp price', 'comp_price', 'competitor', 'market price competitor', 'rival price', 'rival_price', 'competition price', 'competition_price', 'other seller price'],
  'competitorPrice1': ['competitor price 1', 'competitor_price_1', 'comp price 1', 'comp_price_1', 'competitor 1', 'competitor_1', 'market price 1', 'market_price_1', 'rival price 1', 'rival_price_1'],
  'competitorPrice2': ['competitor price 2', 'competitor_price_2', 'comp price 2', 'comp_price_2', 'competitor 2', 'competitor_2', 'market price 2', 'market_price_2', 'rival price 2', 'rival_price_2'],
  'competitorPrice3': ['competitor price 3', 'competitor_price_3', 'comp price 3', 'comp_price_3', 'competitor 3', 'competitor_3', 'market price 3', 'market_price_3', 'rival price 3', 'rival_price_3'],
  'competitorPrice4': ['competitor price 4', 'competitor_price_4', 'comp price 4', 'comp_price_4', 'competitor 4', 'competitor_4', 'market price 4', 'market_price_4'],
  'competitorName1': ['competitor name 1', 'competitor_name_1', 'comp name 1', 'comp_name_1', 'competitor 1 name', 'competitor_1_name'],
  'competitorName2': ['competitor name 2', 'competitor_name_2', 'comp name 2', 'comp_name_2', 'competitor 2 name', 'competitor_2_name'],
  'competitorName3': ['competitor name 3', 'competitor_name_3', 'comp name 3', 'comp_name_3', 'competitor 3 name', 'competitor_3_name'],

  // Inventory & Sales
  'quantity': ['quantity', 'qty', 'stock', 'inventory', 'stock quantity', 'stock_qty', 'available stock', 'available_quantity', 'qty in stock', 'units', 'units in stock'],
  'monthlyUnitsSold': ['monthly sales', 'monthly_units_sold', 'monthly units sold', 'units sold', 'units_sold', 'monthly sales volume', 'sales volume', 'sold last month', 'monthly quantity sold', 'monthly_qty_sold', 'sales qty', 'sales last month'],

  // Metadata
  'notes': ['notes', 'note', 'comments', 'comment', 'remarks', 'remark', 'memo', 'internal notes', 'internal_notes', 'description notes'],
  'tags': ['tags', 'tag', 'labels', 'label', 'keywords', 'keyword'],
};

/**
 * Detect column mappings automatically based on headers.
 * Returns suggested mappings with confidence scores.
 *
 * Algorithm:
 * 1. Normalize header names (lowercase, replace spaces/dashes with underscores)
 * 2. Check for exact match in variation lists
 * 3. Check for partial match (contains variation)
 * 4. Assign confidence based on match quality
 */
export function detectColumnMappings(headers: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedHeaders = new Set<string>();

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim().replace(/[\s\-\.]+/g, '_').replace(/[^a-z0-9_]/g, '');

    let bestMatch: string | null = null;
    let bestConfidence = 0;

    for (const [targetField, variations] of Object.entries(COLUMN_VARIATIONS)) {
      for (const variation of variations) {
        const normalizedVariation = variation.toLowerCase().replace(/[\s\-\.]+/g, '_').replace(/[^a-z0-9_]/g, '');

        // Exact match = highest confidence
        if (normalizedHeader === normalizedVariation) {
          bestMatch = targetField;
          bestConfidence = 1.0;
          break;
        }

        // Header contains variation (e.g., "product_name_v2" contains "product_name")
        if (normalizedHeader.includes(normalizedVariation) && bestConfidence < 0.85) {
          bestMatch = targetField;
          bestConfidence = 0.85;
        }

        // Variation contains header (e.g., "sku" is contained in "sku_code")
        if (normalizedVariation.includes(normalizedHeader) && bestConfidence < 0.7 && normalizedHeader.length >= 3) {
          bestMatch = targetField;
          bestConfidence = 0.7;
        }
      }

      if (bestConfidence === 1.0) break; // Can't improve on exact match
    }

    if (bestMatch) {
      mappings.push({
        sourceColumn: header,
        targetField: bestMatch,
        confidence: bestConfidence,
        isManual: false,
      });
      usedHeaders.add(header);
    } else {
      // No match found — header remains unmapped
      // We don't add it to mappings; it will show as "unmapped"
    }
  }

  return mappings;
}

/**
 * Get all unmapped headers (those without a suggested mapping).
 */
export function getUnmappedHeaders(headers: string[], mappings: ColumnMapping[]): string[] {
  const mappedSources = new Set(mappings.map(m => m.sourceColumn));
  return headers.filter(h => !mappedSources.has(h));
}

// ============================================================
// Data Cleaning
// ============================================================

/** Currency symbols to strip when stripCurrencySymbols is enabled */
const CURRENCY_SYMBOLS = ['₹', '$', '£', '€', '¥', 'د.إ', 'Rs', 'Rs.', 'INR', 'USD', 'GBP', 'EUR', 'AED'];

/**
 * Pre-process a raw cell value according to cleaning options.
 * Handles currency symbols, grouping commas, and percent signs.
 */
function preprocessCellValue(
  rawValue: string,
  options: CleaningOptions,
  isPercentField: boolean,
): string {
  let cleaned = rawValue.trim();

  // Strip currency symbols
  if (options.stripCurrencySymbols) {
    for (const symbol of CURRENCY_SYMBOLS) {
      cleaned = cleaned.replace(symbol, '');
    }
    // Also remove any remaining currency-style prefix/suffix patterns
    cleaned = cleaned.replace(/^[A-Z]{3}\s/, ''); // e.g. "INR 500"
  }

  // Strip grouping commas (Indian: 1,00,000 → 100000; Western: 1,000 → 1000)
  if (options.stripGroupingCommas) {
    // Remove commas that are grouping separators (not decimal commas)
    // A comma is a grouping separator if it's followed by 2 or 3 digits
    // and there's no period after it (period = decimal point)
    cleaned = cleaned.replace(/,/g, '');
  }

  // Strip percent signs (percentage fields)
  if (isPercentField && options.parsePercentages) {
    cleaned = cleaned.replace(/%/g, '');
  }

  return cleaned.trim();
}

/**
 * Interpret a percentage value according to the percent format setting.
 * - 'auto': detect from column distribution (max < 1 → decimal; max >= 1 → whole)
 * - 'whole-percentages': 18 → 18%
 * - 'decimal-fractions': 0.18 → 18%
 */
function interpretPercentValue(
  rawParsed: number,
  percentFormat: PercentFormat,
  columnMaxValue?: number,
): number {
  if (percentFormat === 'decimal-fractions') {
    // 0.18 → 18%
    return rawParsed < 1 ? rawParsed * 100 : rawParsed;
  }
  if (percentFormat === 'whole-percentages') {
    // 18 → 18% (already whole)
    return rawParsed;
  }
  // 'auto': detect from column distribution
  // If the max value in the column is < 1, assume decimal fractions
  // Otherwise, assume whole percentages
  if (columnMaxValue !== undefined && columnMaxValue < 1) {
    return rawParsed * 100;
  }
  return rawParsed;
}

/**
 * Detect the max numeric value in a percentage column for auto-detection.
 */
function detectPercentColumnMax(
  rows: Record<string, string>[],
  sourceColumn: string,
  options: CleaningOptions,
): number {
  let maxVal = 0;
  for (const row of rows) {
    const raw = row[sourceColumn] ?? '';
    const processed = preprocessCellValue(raw, options, true);
    const parsed = parseNumericInput(processed);
    if (!isNaN(parsed) && parsed > maxVal) {
      maxVal = parsed;
    }
  }
  return maxVal;
}

/**
 * Clean imported data rows based on column mappings, settings, and cleaning options.
 * Returns a unified CleanImportResult with product drafts, row issues, and statistics.
 */
export function cleanImportData(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  settings: BusinessSettings,
  options?: CleaningOptions,
  sourceFileName?: string,
  sourceSheet?: string,
): CleanImportResult {
  // Use defaults if options not provided
  const opts: CleaningOptions = options ?? {
    stripCurrencySymbols: true,
    stripGroupingCommas: true,
    parsePercentages: true,
    skipBlankRequired: true,
    skipDuplicateSku: true,
    duplicateHandling: 'skip',
    percentFormat: 'auto',
  };

  // Resolve effective duplicate handling: prefer the new explicit field, but
  // fall back to the legacy boolean for backward compatibility.
  const duplicateHandling: DuplicateHandling =
    opts.duplicateHandling ?? (opts.skipDuplicateSku ? 'skip' : 'overwrite');

  const cleanedProducts: ImportedProductDraft[] = [];
  const skippedRowIssues: ImportRowIssue[] = [];
  const duplicateRowIssues: ImportRowIssue[] = [];
  const invalidRowIssues: ImportRowIssue[] = [];
  const warningIssues: ImportRowIssue[] = [];
  const batchId = generateUniqueId(0);

  let missingCostRows = 0;
  let missingPriceRows = 0;
  let invalidPercentRows = 0;

  // Track SKUs for duplicate detection
  const seenSkus: Map<string, ImportedProductDraft> = new Map();

  // Build a map from source column → target field + transform
  const mappingMap = new Map<string, { targetField: string; transform?: string }>();
  for (const mapping of mappings) {
    mappingMap.set(mapping.sourceColumn, {
      targetField: mapping.targetField,
      transform: mapping.transform,
    });
  }

  // Fields that are numeric (costs, fees)
  const numericFields = new Set([
    'purchaseCost', 'shippingCost', 'packagingCost', 'handlingCost',
    'otherCosts', 'currentSellingPrice', 'marketplaceFeeFixed',
    'paymentFeeFixed', 'otherFeesFixed', 'shippingChargeToCustomer',
    'quantity', 'monthlyUnitsSold',
  ]);

  // Fields that are percentages
  const percentFields = new Set([
    'returnRatePercent', 'damageRatePercent', 'customDutyPercent',
    'freightPercent', 'taxRatePercent', 'marketplaceFeePercent',
    'paymentFeePercent', 'otherFeesPercent',
  ]);

  // Fields that are string identifiers
  const stringFields = new Set([
    'name', 'sku', 'category', 'brand', 'description', 'notes',
    'salesChannel', 'taxTreatment',
  ]);

  // Required fields that must not be blank (when skipBlankRequired is on)
  const requiredFields = new Set(['name', 'sku', 'purchaseCost']);

  // Pre-compute max values for each percent column (for auto-detection)
  const percentColumnMaxes = new Map<string, number>();
  if (opts.percentFormat === 'auto' && opts.parsePercentages) {
    for (const [sourceCol, mappingInfo] of mappingMap.entries()) {
      if (percentFields.has(mappingInfo.targetField)) {
        const maxVal = detectPercentColumnMax(rows, sourceCol, opts);
        percentColumnMaxes.set(sourceCol, maxVal);
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const draft: Partial<ImportedProductDraft> = {};
    const rawOriginalData: Record<string, string> = {};

    // Capture original data for import metadata
    for (const key of Object.keys(row)) {
      rawOriginalData[key] = row[key] ?? '';
    }

    // Check for blank required fields
    let missingRequired: string[] = [];
    if (opts.skipBlankRequired) {
      for (const [sourceCol, mappingInfo] of mappingMap.entries()) {
        if (requiredFields.has(mappingInfo.targetField)) {
          const val = (row[sourceCol] ?? '').trim();
          if (val === '') {
            missingRequired.push(mappingInfo.targetField);
          }
        }
      }
    }

    // Skip row if missing any required field and option is enabled
    if (opts.skipBlankRequired && missingRequired.length > 0) {
      if (missingRequired.includes('purchaseCost')) missingCostRows++;
      skippedRowIssues.push({
        originalRowNumber: i + 2, // +2 for header row + 1-based index
        reason: `Missing required fields: ${missingRequired.join(', ')}`,
        originalData: rawOriginalData,
      });
      continue;
    }

    // Skip rows with both name and sku missing (always, regardless of options)
    const nameSource = mappingMap.entries().find(e => e[1].targetField === 'name');
    const skuSource = mappingMap.entries().find(e => e[1].targetField === 'sku');
    const nameVal = nameSource ? (row[nameSource[0]] ?? '').trim() : '';
    const skuVal = skuSource ? (row[skuSource[0]] ?? '').trim() : '';
    if (!nameVal && !skuVal) {
      skippedRowIssues.push({
        originalRowNumber: i + 2,
        reason: 'Missing both product name and SKU',
        originalData: rawOriginalData,
      });
      continue;
    }

    // Process each mapped column
    for (const [sourceCol, mappingInfo] of mappingMap.entries()) {
      const rawValue = row[sourceCol] ?? '';
      const targetField = mappingInfo.targetField;

      // Handle blank values — set defaults
      if (rawValue.trim() === '') {
        if (numericFields.has(targetField)) {
          (draft as Record<string, unknown>)[targetField] = getDefaultForField(targetField, settings);
        } else if (percentFields.has(targetField)) {
          (draft as Record<string, unknown>)[targetField] = getDefaultPercentForField(targetField, settings);
        } else {
          (draft as Record<string, unknown>)[targetField] = '';
        }
        continue;
      }

      // Pre-process value according to cleaning options
      const isPercent = percentFields.has(targetField);
      const processed = preprocessCellValue(rawValue, opts, isPercent);

      // Parse and assign
      if (numericFields.has(targetField)) {
        const parsed = parseNumericInput(processed);
        if (isNaN(parsed)) {
          invalidRowIssues.push({
            originalRowNumber: i + 2,
            reason: `Could not parse numeric value "${rawValue}" for ${targetField}`,
            originalData: rawOriginalData,
          });
          (draft as Record<string, unknown>)[targetField] = getDefaultForField(targetField, settings);
        } else {
          (draft as Record<string, unknown>)[targetField] = parsed < 0 ? 0 : parsed;
        }
      } else if (percentFields.has(targetField)) {
        const parsed = parseNumericInput(processed);
        if (isNaN(parsed)) {
          invalidPercentRows++;
          invalidRowIssues.push({
            originalRowNumber: i + 2,
            reason: `Could not parse percentage value "${rawValue}" for ${targetField}`,
            originalData: rawOriginalData,
          });
          (draft as Record<string, unknown>)[targetField] = getDefaultPercentForField(targetField, settings);
        } else {
          // Interpret percentage based on format
          const columnMax = percentColumnMaxes.get(sourceCol);
          const interpreted = interpretPercentValue(parsed, opts.percentFormat, columnMax);
          (draft as Record<string, unknown>)[targetField] = Math.max(0, Math.min(100, interpreted));
        }
      } else if (stringFields.has(targetField)) {
        (draft as Record<string, unknown>)[targetField] = processed || rawValue.trim();
      } else {
        // Other fields (competitor prices, tags)
        if (targetField.startsWith('competitorPrice') || targetField === 'competitorPrices') {
          const parsed = parseNumericInput(processed);
          (draft as Record<string, unknown>)[targetField] = isNaN(parsed) ? 0 : Math.max(0, parsed);
        } else if (targetField.startsWith('competitorName')) {
          (draft as Record<string, unknown>)[targetField] = rawValue.trim();
        } else if (targetField === 'tags') {
          (draft as Record<string, unknown>)[targetField] = rawValue.split(/[,\|;]/).map(t => t.trim()).filter(t => t !== '');
        } else {
          (draft as Record<string, unknown>)[targetField] = rawValue.trim();
        }
      }
    }

    // Track missing cost/price for statistics (even if not skipped)
    if (!(draft as Record<string, unknown>)['purchaseCost'] || (draft as Record<string, unknown>)['purchaseCost'] === 0) {
      missingCostRows++;
    }
    if (!(draft as Record<string, unknown>)['currentSellingPrice'] || (draft as Record<string, unknown>)['currentSellingPrice'] === 0) {
      missingPriceRows++;
    }

    // Duplicate SKU check
    const sku = String((draft as Record<string, unknown>)['sku'] ?? '').trim();
    if (sku) {
      if (seenSkus.has(sku)) {
        if (duplicateHandling === 'skip') {
          duplicateRowIssues.push({
            originalRowNumber: i + 2,
            reason: `Duplicate SKU "${sku}" — skipped`,
            originalData: rawOriginalData,
          });
          continue; // Skip this duplicate row
        } else if (duplicateHandling === 'overwrite') {
          // Keep the row — it will overwrite the existing product with the same SKU on import
          duplicateRowIssues.push({
            originalRowNumber: i + 2,
            reason: `Duplicate SKU "${sku}" — kept (will overwrite existing product)`,
            originalData: rawOriginalData,
          });
        } else {
          // 'allow' — keep all duplicate rows as separate products
          duplicateRowIssues.push({
            originalRowNumber: i + 2,
            reason: `Duplicate SKU "${sku}" — kept (duplicates allowed)`,
            originalData: rawOriginalData,
          });
        }
      } else {
        seenSkus.set(sku, draft as ImportedProductDraft);
      }
    }

    // Convert competitor price/name fields into structured competitorPrices array
    const competitorPrices: Array<{ name: string; price: number }> = [];
    for (let c = 1; c <= 4; c++) {
      const priceKey = `competitorPrice${c}`;
      const nameKey = `competitorName${c}`;
      const price = (draft as Record<string, unknown>)[priceKey];
      const name = (draft as Record<string, unknown>)[nameKey];

      if (typeof price === 'number' && price > 0) {
        competitorPrices.push({
          name: typeof name === 'string' && name.trim() ? name : `Competitor ${c}`,
          price: price,
        });
      }

      delete (draft as Record<string, unknown>)[priceKey];
      delete (draft as Record<string, unknown>)[nameKey];
    }

    // Handle single competitorPrices field (mapped from a generic "competitor price" column)
    if ((draft as Record<string, unknown>)['competitorPrices'] !== undefined) {
      const singlePrice = (draft as Record<string, unknown>)['competitorPrices'];
      if (typeof singlePrice === 'number' && singlePrice > 0 && competitorPrices.length === 0) {
        competitorPrices.push({ name: 'Competitor 1', price: singlePrice });
      }
      delete (draft as Record<string, unknown>)['competitorPrices'];
    }

    (draft as Record<string, unknown>)['competitorPrices'] = competitorPrices;

    // Set import metadata
    draft.importBatchId = batchId;
    draft.importSourceFileName = sourceFileName ?? '';
    draft.importOriginalRowNumber = i + 2;
    draft.importOriginalData = rawOriginalData;
    draft.importSourceSheet = sourceSheet;

    cleanedProducts.push(draft as ImportedProductDraft);
  }

  const statistics: ImportStatistics = {
    totalRows: rows.length,
    validRows: cleanedProducts.length,
    skippedRows: skippedRowIssues.length,
    duplicateRows: duplicateRowIssues.length,
    invalidRows: invalidRowIssues.length,
    missingCostRows,
    missingPriceRows,
    invalidPercentRows,
  };

  return {
    cleanedProducts,
    skippedRows: skippedRowIssues,
    duplicateRows: duplicateRowIssues,
    invalidRows: invalidRowIssues,
    warnings: warningIssues,
    statistics,
  };
}

function getDefaultForField(field: string, settings: BusinessSettings): number {
  const defaults: Record<string, number> = {
    'purchaseCost': 0,
    'shippingCost': settings.defaultShippingCost,
    'packagingCost': settings.defaultPackagingCost,
    'handlingCost': settings.defaultHandlingCost,
    'otherCosts': settings.defaultOtherCosts,
    'currentSellingPrice': 0,
    'marketplaceFeeFixed': settings.defaultMarketplaceFeeFixed,
    'paymentFeeFixed': settings.defaultPaymentFeeFixed,
    'otherFeesFixed': 0,
    'shippingChargeToCustomer': 0,
  };
  return defaults[field] ?? 0;
}

function getDefaultPercentForField(field: string, settings: BusinessSettings): number {
  const defaults: Record<string, number> = {
    'returnRatePercent': settings.defaultReturnRatePercent,
    'damageRatePercent': settings.defaultDamageRatePercent,
    'customDutyPercent': settings.defaultCustomDutyPercent,
    'freightPercent': settings.defaultFreightPercent,
    'taxRatePercent': settings.defaultTaxRatePercent,
    'marketplaceFeePercent': settings.defaultMarketplaceFeePercent,
    'paymentFeePercent': settings.defaultPaymentFeePercent,
    'otherFeesPercent': 0,
  };
  return defaults[field] ?? 0;
}

function generateUniqueId(index: number): string {
  return `import-${Date.now()}-${index}`;
}

// ============================================================
// Excel Export
// ============================================================

/**
 * Export products to an Excel workbook with multiple sheets.
 *
 * Presets determine which columns and sheets are included:
 * - full: All data with calculations
 * - summary: Key metrics only
 * - pricing-only: Price-related columns
 * - cost-analysis: Cost breakdown
 * - competitor: Competitor comparison
 * - custom: User-selected columns
 */
export async function exportToExcel(
  products: Product[],
  settings: BusinessSettings,
  preset: ExportPreset,
  config?: Partial<ExportConfig>
): Promise<Blob> {
  // Determine columns based on preset
  const columns = getExportColumns(preset, config?.columns);

  // Build main data sheet — Phase 14: sanitize every cell to prevent
  // spreadsheet formula injection. Product names, SKUs, categories,
  // brands, notes etc. are all user-controlled and could otherwise
  // start with `=`, `+`, `-`, `@` and execute formulas when the
  // exported file is opened.
  const mainData = products.map(product => {
    const row: Record<string, string | number> = {};
    for (const col of columns) {
      const value = getExportValue(product, col, settings);
      row[col.label] = value;
    }
    return sanitizeSpreadsheetRow(row);
  });

  const builder = createSpreadsheet();
  builder.addSheet(config?.sheetName ?? 'Products', mainData);

  // Add additional sheets based on preset
  if (preset === 'full' || preset === 'cost-analysis') {
    builder.addSheet('Cost Analysis', sanitizeSpreadsheetRows(buildCostAnalysisRows(products, settings)));
  }

  if (preset === 'full' || preset === 'competitor') {
    builder.addSheet('Competitor Analysis', sanitizeSpreadsheetRows(buildCompetitorRows(products, settings)));
  }

  if (preset === 'full') {
    builder.addSheet('Summary', sanitizeSpreadsheetRows(buildSummaryRows(products, settings)));
  }

  const buffer = await builder.writeBuffer();

  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Export products to CSV format.
 */
export function exportToCSV(
  products: Product[],
  preset: ExportPreset,
  config?: Partial<ExportConfig>
): string {
  const columns = getExportColumns(preset, config?.columns);

  // Header row
  const headerLine = columns.map(col => `"${col.label}"`).join(',');

  // Data rows — Phase 14: sanitize every cell to prevent spreadsheet
  // formula injection. CSV cells beginning with `=`, `+`, `-`, `@`
  // would execute as formulas when the CSV is opened in Excel.
  const dataLines = products.map(product => {
    return columns.map(col => {
      const value = getExportValue(product, col, null); // No settings for simple CSV
      // Sanitize for formula injection FIRST, then escape for CSV.
      const sanitized = sanitizeSpreadsheetCell(value);
      const str = String(sanitized);
      // Escape values that contain commas or quotes
      if (str.includes(',') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  });

  return [headerLine, ...dataLines].join('\n');
}

// ============================================================
// Export Column Definitions
// ============================================================

interface ExportColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'percentage' | 'currency' | 'status';
}

function getExportColumns(preset: ExportPreset, customColumns?: string[]): ExportColumn[] {
  const allColumns: ExportColumn[] = [
    // Identification
    { key: 'sku', label: 'SKU', type: 'string' },
    { key: 'name', label: 'Product Name', type: 'string' },
    { key: 'category', label: 'Category', type: 'string' },
    { key: 'brand', label: 'Brand', type: 'string' },
    { key: 'description', label: 'Description', type: 'string' },

    // Cost Fields
    { key: 'purchaseCost', label: 'Purchase Cost', type: 'currency' },
    { key: 'shippingCost', label: 'Shipping Cost', type: 'currency' },
    { key: 'packagingCost', label: 'Packaging Cost', type: 'currency' },
    { key: 'handlingCost', label: 'Handling Cost', type: 'currency' },
    { key: 'otherCosts', label: 'Other Costs', type: 'currency' },
    { key: 'calculatedBaseCost', label: 'Base Cost', type: 'currency' },
    { key: 'calculatedExpectedReturnCost', label: 'Expected Return Cost', type: 'currency' },
    { key: 'calculatedExpectedDamageCost', label: 'Expected Damage Cost', type: 'currency' },
    { key: 'calculatedTotalLandedCost', label: 'Total Landed Cost', type: 'currency' },

    // Selling & Fees
    { key: 'currentSellingPrice', label: 'Current Selling Price', type: 'currency' },
    { key: 'taxRatePercent', label: 'Tax Rate (%)', type: 'percentage' },
    { key: 'taxTreatment', label: 'Tax Treatment', type: 'string' },
    { key: 'marketplaceFeePercent', label: 'Marketplace Fee (%)', type: 'percentage' },
    { key: 'marketplaceFeeFixed', label: 'Marketplace Fee (Fixed)', type: 'currency' },
    { key: 'paymentFeePercent', label: 'Payment Fee (%)', type: 'percentage' },
    { key: 'paymentFeeFixed', label: 'Payment Fee (Fixed)', type: 'currency' },
    { key: 'calculatedTotalPercentageFees', label: 'Total Percentage Fees (%)', type: 'percentage' },
    { key: 'calculatedTotalFixedFees', label: 'Total Fixed Fees', type: 'currency' },

    // Calculated Values
    { key: 'calculatedBreakEvenPrice', label: 'Break-Even Price', type: 'currency' },
    { key: 'calculatedMarkupPercent', label: 'Markup (%)', type: 'percentage' },
    { key: 'calculatedMarginPercent', label: 'Effective Margin (%)', type: 'percentage' },
    { key: 'calculatedProfitPerUnit', label: 'Profit Per Unit', type: 'currency' },
    { key: 'calculatedPricingStatus', label: 'Pricing Status', type: 'status' },
    { key: 'calculatedProfitabilityMeter', label: 'Profitability', type: 'status' },

    // Recommendations
    { key: 'recommendedPrices.minimum', label: 'Min Safe Price', type: 'currency' },
    { key: 'recommendedPrices.competitive', label: 'Competitive Price', type: 'currency' },
    { key: 'recommendedPrices.balanced', label: 'Balanced Price', type: 'currency' },
    { key: 'recommendedPrices.premium', label: 'Premium Price', type: 'currency' },

    // Other
    { key: 'salesChannel', label: 'Sales Channel', type: 'string' },
    { key: 'isApproved', label: 'Approved', type: 'string' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ];

  switch (preset) {
    case 'full':
      return allColumns;

    case 'summary':
      return allColumns.filter(col =>
        ['sku', 'name', 'category', 'brand', 'purchaseCost', 'currentSellingPrice',
         'calculatedTotalLandedCost', 'calculatedMarginPercent', 'calculatedProfitPerUnit',
         'calculatedPricingStatus', 'recommendedPrices.balanced'].includes(col.key)
      );

    case 'pricing-only':
      return allColumns.filter(col =>
        ['sku', 'name', 'currentSellingPrice', 'calculatedBreakEvenPrice',
         'calculatedMarginPercent', 'calculatedProfitPerUnit', 'calculatedPricingStatus',
         'recommendedPrices.minimum', 'recommendedPrices.competitive',
         'recommendedPrices.balanced', 'recommendedPrices.premium'].includes(col.key)
      );

    case 'cost-analysis':
      return allColumns.filter(col =>
        ['sku', 'name', 'purchaseCost', 'shippingCost', 'packagingCost',
         'handlingCost', 'otherCosts', 'calculatedBaseCost',
         'calculatedExpectedReturnCost', 'calculatedExpectedDamageCost',
         'calculatedTotalLandedCost', 'currentSellingPrice',
         'calculatedProfitPerUnit', 'calculatedMarginPercent'].includes(col.key)
      );

    case 'competitor':
      return allColumns.filter(col =>
        ['sku', 'name', 'currentSellingPrice', 'calculatedMarginPercent'].includes(col.key)
      );
      // Plus competitor columns added separately

    case 'custom':
      if (customColumns && customColumns.length > 0) {
        return allColumns.filter(col => customColumns.includes(col.key));
      }
      return allColumns;

    default:
      return allColumns;
  }
}

function getExportValue(
  product: Product,
  column: ExportColumn,
  settings: BusinessSettings | null
): string | number {
  // Handle nested keys (e.g., "recommendedPrices.minimum")
  const keyParts = column.key.split('.');
  let value: unknown = product;

  for (const part of keyParts) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      value = undefined;
    }
  }

  if (value === undefined || value === null) return '';

  switch (column.type) {
    case 'currency':
      return typeof value === 'number' ? Number(value.toFixed(2)) : String(value);
    case 'percentage':
      return typeof value === 'number' ? Number(value.toFixed(1)) : String(value);
    case 'number':
      return typeof value === 'number' ? Number(value.toFixed(2)) : String(value);
    case 'string':
    case 'status':
      return String(value);
    default:
      return String(value);
  }
}

// ============================================================
// Additional Export Sheets
// ============================================================

/**
 * Build the rows for the Cost Analysis sheet.
 * Returns plain row objects so the WorkbookBuilder can append them
 * directly — no library-specific WorkSheet type needed.
 */
function buildCostAnalysisRows(
  products: Product[],
  _settings: BusinessSettings,
): Record<string, string | number>[] {
  return products.map(p => ({
    'SKU': p.sku,
    'Product': p.name,
    'Purchase Cost': p.purchaseCost,
    'Shipping': p.shippingCost,
    'Packaging': p.packagingCost,
    'Handling': p.handlingCost,
    'Other': p.otherCosts,
    'Freight': p.freightPercent > 0 ? (p.purchaseCost * p.freightPercent / 100) : 0,
    'Base Cost': p.calculatedBaseCost,
    'Return Cost': p.calculatedExpectedReturnCost,
    'Damage Cost': p.calculatedExpectedDamageCost,
    'Custom Duty': p.customDutyPercent > 0 ? (p.purchaseCost * p.customDutyPercent / 100) : 0,
    'Total Landed Cost': p.calculatedTotalLandedCost,
    'Current Price': p.currentSellingPrice,
    'Profit/Unit': p.calculatedProfitPerUnit,
    'Margin %': p.calculatedMarginPercent,
  }));
}

/**
 * Build the rows for the Competitor Analysis sheet.
 */
function buildCompetitorRows(
  products: Product[],
  _settings: BusinessSettings,
): Record<string, string | number>[] {
  const data: Record<string, string | number>[] = [];

  for (const p of products) {
    const baseRow: Record<string, string | number> = {
      'SKU': p.sku,
      'Product': p.name,
      'Our Price': p.currentSellingPrice,
    };

    // Add each competitor as a column
    if (p.competitorPrices.length > 0) {
      const avgComp = p.competitorPrices.reduce((sum, cp) => sum + cp.price, 0) / p.competitorPrices.length;
      baseRow['Competitor Avg'] = Number(avgComp.toFixed(2));
      baseRow['Difference'] = Number((p.currentSellingPrice - avgComp).toFixed(2));
      baseRow['Diff %'] = Number(((p.currentSellingPrice - avgComp) / avgComp * 100).toFixed(1));

      for (const cp of p.competitorPrices) {
        baseRow[cp.name] = cp.price;
      }
    } else {
      baseRow['Competitor Avg'] = 'N/A';
      baseRow['Difference'] = 'N/A';
      baseRow['Diff %'] = 'N/A';
    }

    data.push(baseRow);
  }

  return data;
}

/**
 * Build the rows for the Summary sheet.
 */
function buildSummaryRows(
  products: Product[],
  _settings: BusinessSettings,
): Record<string, string | number>[] {
  const totalProducts = products.length;
  const lossMaking = products.filter(p => p.calculatedPricingStatus === 'loss-making').length;
  const belowBreakEven = products.filter(p => p.calculatedPricingStatus === 'below-break-even').length;
  const healthy = products.filter(p => p.calculatedPricingStatus === 'healthy').length;
  const highMargin = products.filter(p => p.calculatedPricingStatus === 'high-margin').length;
  const avgMargin = products.length > 0
    ? products.reduce((sum, p) => sum + p.calculatedMarginPercent, 0) / products.length
    : 0;
  const avgProfit = products.length > 0
    ? products.reduce((sum, p) => sum + p.calculatedProfitPerUnit, 0) / products.length
    : 0;

  return [
    { 'Metric': 'Total Products', 'Value': totalProducts },
    { 'Metric': 'Loss-Making Products', 'Value': lossMaking },
    { 'Metric': 'Below Break-Even', 'Value': belowBreakEven },
    { 'Metric': 'Healthy Pricing', 'Value': healthy },
    { 'Metric': 'High Margin', 'Value': highMargin },
    { 'Metric': 'Average Margin %', 'Value': Number(avgMargin.toFixed(1)) },
    { 'Metric': 'Average Profit/Unit', 'Value': Number(avgProfit.toFixed(2)) },
    { 'Metric': 'Export Date', 'Value': new Date().toISOString() },
  ];
}

// `WorkbookBuilder` is re-exported here so legacy callers that imported
// the type from excel.ts can still resolve it. Kept as a private alias
// to avoid introducing a new public API surface.
export type { WorkbookBuilder };
