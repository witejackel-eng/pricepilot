/**
 * PricePilot - Excel Import and Export Utilities
 *
 * Handles parsing of Excel and CSV files, automatic column
 * mapping detection, data cleaning, and formatted export.
 *
 * Uses the xlsx library for Excel operations and implements
 * intelligent column detection for common heading variations.
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
} from './types';
import { parseNumericInput } from './formatting';

// ============================================================
// Excel Parsing
// ============================================================

/**
 * Parse an Excel file (xlsx) and return sheets with rows.
 * Each sheet is returned as an array of objects where keys
 * are column headers and values are cell values (as strings).
 *
 * Uses the xlsx library which must be available at runtime.
 */
export async function parseExcelFile(fileBuffer: ArrayBuffer): Promise<{
  sheets: Array<{
    name: string;
    headers: string[];
    rows: Record<string, string>[];
  }>;
  errors: ImportError[];
}> {
  const errors: ImportError[] = [];

  try {
    // Dynamic import of xlsx (it's a large library)
    const XLSX = await import('xlsx');

    const workbook = XLSX.read(fileBuffer, { type: 'array' });

    const sheets: Array<{
      name: string;
      headers: string[];
      rows: Record<string, string>[];
    }> = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON with headers
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
        raw: false,  // Get formatted strings instead of raw values
      });

      if (rawData.length === 0) continue;

      // Extract headers from first row
      const headers = Object.keys(rawData[0]);

      // Convert all values to strings for uniform handling
      const rows: Record<string, string>[] = rawData.map(row => {
        const stringRow: Record<string, string> = {};
        for (const key of headers) {
          stringRow[key] = String(row[key] ?? '');
        }
        return stringRow;
      });

      sheets.push({ name: sheetName, headers, rows });
    }

    if (sheets.length === 0) {
      errors.push({
        row: 0,
        column: '',
        value: '',
        message: 'No data found in the Excel file. The file may be empty or all sheets are blank.',
        severity: 'error',
      });
    }

    return { sheets, errors };
  } catch (error) {
    errors.push({
      row: 0,
      column: '',
      value: '',
      message: `Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'critical',
    });
    return { sheets: [], errors };
  }
}

/**
 * Parse a CSV text file and return rows.
 * Handles common CSV formats including comma and tab separation.
 */
export function parseCSVFile(text: string): {
  headers: string[];
  rows: Record<string, string>[];
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
      return { headers: [], rows: [], errors };
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

    return { headers, rows, errors };
  } catch (error) {
    errors.push({
      row: 0,
      column: '',
      value: '',
      message: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'critical',
    });
    return { headers: [], rows: [], errors };
  }
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
  'sku': ['sku', 'product code', 'product_code', 'item code', 'item_code', 'code', 'product id', 'product_id', 'item no', 'item_no', 'part number', 'part_no', 'article number', 'article_no', 'pid', 'prod_id', 'model', 'model number'],
  'category': ['category', 'product category', 'product_category', 'cat', 'type', 'product type', 'product_type', 'group', 'product group', 'classification', 'class'],
  'brand': ['brand', 'brand name', 'brand_name', 'manufacturer', 'maker', 'supplier', 'vendor', 'company'],
  'description': ['description', 'desc', 'product description', 'product_desc', 'details', 'short description', 'short_desc', 'summary', 'long description', 'long_desc'],

  // Cost Fields
  'purchaseCost': ['purchase cost', 'purchase_cost', 'cost', 'purchase price', 'purchase_price', 'buying price', 'buying_price', 'buy price', 'unit cost', 'unit_cost', 'base cost', 'base_cost', 'wholesale cost', 'wholesale_cost', 'wholesale price', 'cogs', 'cost of goods', 'acquisition cost', 'acquisition_price', 'price paid', 'paid price', 'supplier price', 'factory cost', 'manufacturing cost', 'raw cost', 'product cost', 'product_cost'],
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
  'taxRatePercent': ['tax rate', 'tax_rate', 'tax %', 'tax_pct', 'gst rate', 'gst_rate', 'gst %', 'gst_pct', 'vat rate', 'vat_rate', 'vat %', 'vat_pct', 'tax', 'gst', 'vat', 'sales tax', 'sales_tax', 'tax percentage'],
  'taxTreatment': ['tax treatment', 'tax_treatment', 'tax type', 'tax_type', 'tax inclusive', 'tax_inclusive', 'tax exclusive', 'tax_exclusive', 'gst treatment', 'gst_treatment', 'gst type', 'gst_type'],

  // Fee Fields
  'marketplaceFeePercent': ['marketplace fee', 'marketplace_fee', 'marketplace fee %', 'marketplace_fee_pct', 'platform fee', 'platform_fee', 'platform fee %', 'platform_fee_pct', 'commission', 'commission %', 'commission_pct', 'marketplace commission', 'channel fee', 'channel_fee', 'channel fee %', 'seller fee', 'seller_fee', 'listing fee %', 'listing_fee_pct'],
  'marketplaceFeeFixed': ['marketplace fixed fee', 'marketplace_fixed_fee', 'fixed marketplace fee', 'platform fixed fee', 'platform_fixed_fee', 'fixed commission', 'fixed_fee', 'fixed fee', 'per order fee', 'per_order_fee', 'order fee', 'transaction fee fixed', 'flat fee'],
  'paymentFeePercent': ['payment fee', 'payment_fee', 'payment fee %', 'payment_fee_pct', 'gateway fee', 'gateway_fee', 'gateway fee %', 'gateway_fee_pct', 'payment gateway fee', 'payment_gateway_fee', 'payment commission', 'payment commission %', 'processing fee %', 'processing_fee_pct'],
  'paymentFeeFixed': ['payment fixed fee', 'payment_fixed_fee', 'fixed payment fee', 'gateway fixed fee', 'gateway_fixed_fee', 'payment processing fixed', 'payment_processing_fixed', 'transaction fee', 'transaction_fee', 'flat payment fee'],
  'shippingChargeToCustomer': ['shipping charge', 'shipping_charge', 'customer shipping', 'customer_shipping', 'shipping to customer', 'shipping_to_customer', 'delivery charge', 'delivery_charge', 'outbound shipping', 'outbound_shipping'],
  'otherFeesPercent': ['other fees %', 'other_fees_pct', 'additional fees %', 'additional_fees_pct', 'extra fees %', 'extra_fees_pct', 'other percentage fees', 'other_percentage_fees'],
  'otherFeesFixed': ['other fixed fees', 'other_fixed_fees', 'other fees fixed', 'additional fixed fees', 'additional_fixed_fees', 'extra fixed fees', 'extra_fixed_fees', 'misc fees fixed', 'misc_fees_fixed'],
  'salesChannel': ['channel', 'sales channel', 'sales_channel', 'channel type', 'channel_type', 'platform', 'selling channel', 'selling_channel', 'distribution channel', 'distribution_channel'],

  // Competitor
  'competitorPrice1': ['competitor price 1', 'competitor_price_1', 'comp price 1', 'comp_price_1', 'competitor 1', 'competitor_1', 'market price 1', 'market_price_1', 'rival price 1', 'rival_price_1'],
  'competitorPrice2': ['competitor price 2', 'competitor_price_2', 'comp price 2', 'comp_price_2', 'competitor 2', 'competitor_2', 'market price 2', 'market_price_2', 'rival price 2', 'rival_price_2'],
  'competitorPrice3': ['competitor price 3', 'competitor_price_3', 'comp price 3', 'comp_price_3', 'competitor 3', 'competitor_3', 'market price 3', 'market_price_3', 'rival price 3', 'rival_price_3'],
  'competitorPrice4': ['competitor price 4', 'competitor_price_4', 'comp price 4', 'comp_price_4', 'competitor 4', 'competitor_4', 'market price 4', 'market_price_4'],
  'competitorName1': ['competitor name 1', 'competitor_name_1', 'comp name 1', 'comp_name_1', 'competitor 1 name', 'competitor_1_name'],
  'competitorName2': ['competitor name 2', 'competitor_name_2', 'comp name 2', 'comp_name_2', 'competitor 2 name', 'competitor_2_name'],
  'competitorName3': ['competitor name 3', 'competitor_name_3', 'comp name 3', 'comp_name_3', 'competitor 3 name', 'competitor_3_name'],

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

/**
 * Clean imported data rows based on column mappings and settings.
 * Handles: currency symbols, commas, blanks, percentages, duplicates.
 *
 * Returns cleaned rows and cleaning statistics.
 */
export function cleanImportData(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  settings: BusinessSettings
): {
  cleanedRows: Record<string, unknown>[];
  skippedRows: number;
  duplicateCount: number;
  blankFieldCount: number;
  invalidValueCount: number;
  errors: ImportError[];
  warnings: ImportError[];
} {
  const cleanedRows: Record<string, unknown>[] = [];
  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];
  let skippedRows = 0;
  let duplicateCount = 0;
  let blankFieldCount = 0;
  let invalidValueCount = 0;

  // Track SKUs for duplicate detection
  const seenSkus: Set<string> = new Set();

  // Build a map from source column → target field + transform
  const mappingMap = new Map<string, { targetField: string; transform?: string }>();
  for (const mapping of mappings) {
    mappingMap.set(mapping.sourceColumn, {
      targetField: mapping.targetField,
      transform: mapping.transform,
    });
  }

  // Fields that are numeric (costs, percentages, fees)
  const numericFields = new Set([
    'purchaseCost', 'shippingCost', 'packagingCost', 'handlingCost',
    'otherCosts', 'currentSellingPrice', 'marketplaceFeeFixed',
    'paymentFeeFixed', 'otherFeesFixed', 'shippingChargeToCustomer',
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cleanedRow: Record<string, unknown> = {};
    let hasCriticalError = false;

    // Process each mapped column
    for (const [sourceCol, mappingInfo] of mappingMap.entries()) {
      const rawValue = row[sourceCol] ?? '';
      const targetField = mappingInfo.targetField;
      const transform = mappingInfo.transform;

      // Handle blank values
      if (rawValue.trim() === '') {
        blankFieldCount++;

        // Set defaults for blank fields
        if (numericFields.has(targetField)) {
          cleanedRow[targetField] = getDefaultForField(targetField, settings);
        } else if (percentFields.has(targetField)) {
          cleanedRow[targetField] = getDefaultPercentForField(targetField, settings);
        } else if (stringFields.has(targetField)) {
          cleanedRow[targetField] = '';
        } else {
          cleanedRow[targetField] = '';
        }
        continue;
      }

      // Apply transforms and parse values
      if (numericFields.has(targetField)) {
        const parsed = parseNumericInput(rawValue);
        if (isNaN(parsed)) {
          invalidValueCount++;
          errors.push({
            row: i + 1,
            column: sourceCol,
            value: rawValue,
            message: `Could not parse numeric value "${rawValue}" for ${targetField}`,
            severity: 'error',
          });
          cleanedRow[targetField] = getDefaultForField(targetField, settings);
        } else {
          // Ensure non-negative
          cleanedRow[targetField] = parsed < 0 ? 0 : parsed;
        }
      } else if (percentFields.has(targetField)) {
        // Strip % sign and parse
        let percentRaw = rawValue;
        if (percentRaw.includes('%')) {
          percentRaw = percentRaw.replace(/%/g, '');
        }
        const parsed = parseNumericInput(percentRaw);
        if (isNaN(parsed)) {
          invalidValueCount++;
          errors.push({
            row: i + 1,
            column: sourceCol,
            value: rawValue,
            message: `Could not parse percentage value "${rawValue}" for ${targetField}`,
            severity: 'error',
          });
          cleanedRow[targetField] = getDefaultPercentForField(targetField, settings);
        } else {
          // Clamp to 0-100 range
          cleanedRow[targetField] = Math.max(0, Math.min(100, parsed));
        }
      } else if (stringFields.has(targetField)) {
        let strValue = rawValue.trim();

        // Apply transforms
        if (transform === 'trim' || transform === 'split-comma') {
          strValue = strValue.trim();
        }

        cleanedRow[targetField] = strValue;
      } else {
        // Other fields (competitor prices, tags)
        if (targetField.startsWith('competitorPrice')) {
          const parsed = parseNumericInput(rawValue);
          cleanedRow[targetField] = isNaN(parsed) ? 0 : Math.max(0, parsed);
        } else if (targetField.startsWith('competitorName')) {
          cleanedRow[targetField] = rawValue.trim();
        } else if (targetField === 'tags') {
          cleanedRow[targetField] = rawValue.split(/[,\|;]/).map(t => t.trim()).filter(t => t !== '');
        } else {
          cleanedRow[targetField] = rawValue.trim();
        }
      }
    }

    // Duplicate SKU check
    const sku = String(cleanedRow['sku'] ?? '').trim();
    if (sku) {
      if (seenSkus.has(sku)) {
        duplicateCount++;
        warnings.push({
          row: i + 1,
          column: 'sku',
          value: sku,
          message: `Duplicate SKU "${sku}" found`,
          severity: 'warning',
        });
      } else {
        seenSkus.add(sku);
      }
    }

    // Skip rows with critical errors (missing both name and sku)
    if (!cleanedRow['name'] && !cleanedRow['sku']) {
      skippedRows++;
      errors.push({
        row: i + 1,
        column: 'name/sku',
        value: '',
        message: `Row ${i + 1} skipped: missing both product name and SKU`,
        severity: 'error',
      });
      continue;
    }

    // Assign ID if missing
    if (!cleanedRow['id']) {
      cleanedRow['id'] = generateUniqueId(i);
    }

    // Set defaults for missing required fields
    if (!cleanedRow['salesChannel']) cleanedRow['salesChannel'] = 'online-marketplace';
    if (!cleanedRow['taxTreatment']) cleanedRow['taxTreatment'] = settings.taxTreatment;
    if (!cleanedRow['taxRatePercent']) cleanedRow['taxRatePercent'] = settings.defaultTaxRatePercent;
    if (!cleanedRow['marketplaceFeePercent']) cleanedRow['marketplaceFeePercent'] = settings.defaultMarketplaceFeePercent;
    if (!cleanedRow['paymentFeePercent']) cleanedRow['paymentFeePercent'] = settings.defaultPaymentFeePercent;
    if (!cleanedRow['marketplaceFeeFixed']) cleanedRow['marketplaceFeeFixed'] = settings.defaultMarketplaceFeeFixed;
    if (!cleanedRow['paymentFeeFixed']) cleanedRow['paymentFeeFixed'] = settings.defaultPaymentFeeFixed;

    // Convert competitor price/name fields into structured competitorPrices array
    const competitorPrices: CompetitorPrice[] = [];
    for (let c = 1; c <= 4; c++) {
      const priceKey = `competitorPrice${c}`;
      const nameKey = `competitorName${c}`;
      const price = cleanedRow[priceKey];
      const name = cleanedRow[nameKey];

      if (typeof price === 'number' && price > 0) {
        competitorPrices.push({
          name: typeof name === 'string' && name.trim() ? name : `Competitor ${c}`,
          price: price,
        });
      }

      // Remove flat competitor fields (they're now in the array)
      delete cleanedRow[priceKey];
      delete cleanedRow[nameKey];
    }
    cleanedRow['competitorPrices'] = competitorPrices;

    // Set timestamps
    cleanedRow['createdAt'] = new Date().toISOString();
    cleanedRow['updatedAt'] = new Date().toISOString();
    cleanedRow['isApproved'] = false;

    if (!hasCriticalError) {
      cleanedRows.push(cleanedRow);
    }
  }

  return {
    cleanedRows,
    skippedRows,
    duplicateCount,
    blankFieldCount,
    invalidValueCount,
    errors,
    warnings,
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
  const XLSX = await import('xlsx');

  const workbook = XLSX.utils.book_new();
  const currency = settings.currencyCode;

  // Determine columns based on preset
  const columns = getExportColumns(preset, config?.columns);

  // Build main data sheet
  const mainData = products.map(product => {
    const row: Record<string, string | number> = {};
    for (const col of columns) {
      const value = getExportValue(product, col, settings);
      row[col.label] = value;
    }
    return row;
  });

  const mainSheet = XLSX.utils.json_to_sheet(mainData);

  // Set column widths
  const colWidths = columns.map(col => ({
    wch: Math.max(col.label.length + 2, 15),
  }));
  mainSheet['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(workbook, mainSheet, config?.sheetName ?? 'Products');

  // Add additional sheets based on preset
  if (preset === 'full' || preset === 'cost-analysis') {
    const costSheet = createCostAnalysisSheet(products, settings, XLSX);
    XLSX.utils.book_append_sheet(workbook, costSheet, 'Cost Analysis');
  }

  if (preset === 'full' || preset === 'competitor') {
    const competitorSheet = createCompetitorSheet(products, settings, XLSX);
    XLSX.utils.book_append_sheet(workbook, competitorSheet, 'Competitor Analysis');
  }

  if (preset === 'full') {
    const summarySheet = createSummarySheet(products, settings, XLSX);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  }

  // Generate the workbook as an array buffer
  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });

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

  // Data rows
  const dataLines = products.map(product => {
    return columns.map(col => {
      const value = getExportValue(product, col, null); // No settings for simple CSV
      // Escape values that contain commas or quotes
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
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

function createCostAnalysisSheet(
  products: Product[],
  settings: BusinessSettings,
  XLSX: typeof import('xlsx')
): import('xlsx').WorkSheet {
  const data = products.map(p => ({
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

  return XLSX.utils.json_to_sheet(data);
}

function createCompetitorSheet(
  products: Product[],
  settings: BusinessSettings,
  XLSX: typeof import('xlsx')
): import('xlsx').WorkSheet {
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

  return XLSX.utils.json_to_sheet(data);
}

function createSummarySheet(
  products: Product[],
  settings: BusinessSettings,
  XLSX: typeof import('xlsx')
): import('xlsx').WorkSheet {
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

  const data = [
    { 'Metric': 'Total Products', 'Value': totalProducts },
    { 'Metric': 'Loss-Making Products', 'Value': lossMaking },
    { 'Metric': 'Below Break-Even', 'Value': belowBreakEven },
    { 'Metric': 'Healthy Pricing', 'Value': healthy },
    { 'Metric': 'High Margin', 'Value': highMargin },
    { 'Metric': 'Average Margin %', 'Value': Number(avgMargin.toFixed(1)) },
    { 'Metric': 'Average Profit/Unit', 'Value': Number(avgProfit.toFixed(2)) },
    { 'Metric': 'Export Date', 'Value': new Date().toISOString() },
  ];

  return XLSX.utils.json_to_sheet(data);
}
