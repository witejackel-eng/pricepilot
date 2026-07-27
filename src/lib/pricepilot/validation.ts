/**
 * PricePilot - Data Validation
 *
 * Comprehensive validation for products, pricing rules,
 * business settings, and import data. Returns structured
 * error arrays for UI display.
 */

import {
  Product,
  PricingRule,
  BusinessSettings,
  RuleLevel,
  TaxTreatment,
  SalesChannel,
  RoundingRule,
  CompetitorStrategy,
  SUPPORTED_CURRENCIES,
} from './types';

// ============================================================
// Validation Result Types
// ============================================================

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  value?: unknown;
  suggestion?: string;
}

// ============================================================
// Common Validation Functions
// ============================================================

/**
 * Validate that a value is non-negative.
 */
export function nonNegative(value: number, field: string): ValidationError | null {
  if (typeof value !== 'number' || isNaN(value)) {
    return {
      field,
      message: `${field} must be a valid number`,
      severity: 'error',
      value,
      suggestion: 'Enter a valid number',
    };
  }
  if (value < 0) {
    return {
      field,
      message: `${field} cannot be negative`,
      severity: 'error',
      value,
      suggestion: 'Enter a zero or positive value',
    };
  }
  return null;
}

/**
 * Validate that a percentage value is within a reasonable range.
 */
export function percentageRange(
  value: number,
  field: string,
  min: number = 0,
  max: number = 100
): ValidationError | null {
  if (typeof value !== 'number' || isNaN(value)) {
    return {
      field,
      message: `${field} must be a valid percentage`,
      severity: 'error',
      value,
      suggestion: 'Enter a valid percentage number',
    };
  }
  if (value < min) {
    return {
      field,
      message: `${field} (${value}%) is below the minimum of ${min}%`,
      severity: 'error',
      value,
      suggestion: `Enter a value of at least ${min}%`,
    };
  }
  if (value > max) {
    return {
      field,
      message: `${field} (${value}%) exceeds the maximum of ${max}%`,
      severity: value > max * 2 ? 'error' : 'warning',
      value,
      suggestion: `Most values are under ${max}%. Please verify.`,
    };
  }
  return null;
}

/**
 * Validate that a string field is not blank/empty.
 */
export function notBlank(value: string, field: string): ValidationError | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return {
      field,
      message: `${field} cannot be empty`,
      severity: 'error',
      value,
      suggestion: `Enter a value for ${field}`,
    };
  }
  return null;
}

/**
 * Validate that a currency code is valid.
 */
export function currencyValid(code: string, field: string = 'currencyCode'): ValidationError | null {
  const validCodes = SUPPORTED_CURRENCIES.map(c => c.code);
  if (!validCodes.includes(code)) {
    return {
      field,
      message: `${code} is not a supported currency`,
      severity: 'error',
      value: code,
      suggestion: `Use one of: ${validCodes.join(', ')}`,
    };
  }
  return null;
}

/**
 * Validate that a tax treatment value is valid.
 */
export function taxTreatmentValid(treatment: string): ValidationError | null {
  const validTreatments: TaxTreatment[] = ['inclusive', 'exclusive', 'exempt', 'reverse', 'composite'];
  if (!validTreatments.includes(treatment as TaxTreatment)) {
    return {
      field: 'taxTreatment',
      message: `${treatment} is not a valid tax treatment`,
      severity: 'error',
      value: treatment,
      suggestion: `Use one of: ${validTreatments.join(', ')}`,
    };
  }
  return null;
}

/**
 * Validate a sales channel value.
 */
export function salesChannelValid(channel: string): ValidationError | null {
  const validChannels: SalesChannel[] = [
    'online-marketplace', 'own-website', 'retail-store',
    'wholesale', 'distributor', 'offline', 'other'
  ];
  if (!validChannels.includes(channel as SalesChannel)) {
    return {
      field: 'salesChannel',
      message: `${channel} is not a valid sales channel`,
      severity: 'error',
      value: channel,
      suggestion: `Use one of: ${validChannels.join(', ')}`,
    };
  }
  return null;
}

/**
 * Validate a rounding rule value.
 */
export function roundingRuleValid(rule: string): ValidationError | null {
  const validRules: RoundingRule[] = [
    'no-rounding', 'nearest-whole', 'nearest-5', 'nearest-10',
    'end-in-99', 'end-in-95', 'end-in-9', 'end-in-49',
    'end-in-99-whole', 'custom'
  ];
  if (!validRules.includes(rule as RoundingRule)) {
    return {
      field: 'roundingRule',
      message: `${rule} is not a valid rounding rule`,
      severity: 'error',
      value: rule,
      suggestion: `Use one of: ${validRules.join(', ')}`,
    };
  }
  return null;
}

/**
 * Validate a rule level value.
 */
export function ruleLevelValid(level: string): ValidationError | null {
  const validLevels: RuleLevel[] = ['global', 'category', 'brand', 'channel', 'product'];
  if (!validLevels.includes(level as RuleLevel)) {
    return {
      field: 'level',
      message: `${level} is not a valid rule level`,
      severity: 'error',
      value: level,
      suggestion: `Use one of: ${validLevels.join(', ')}`,
    };
  }
  return null;
}

// ============================================================
// Product Validation
// ============================================================

/**
 * Validate a product and return an array of errors.
 */
export function validateProduct(product: Partial<Product>): ValidationError[] {
  const errors: ValidationError[] = [];

  // --- Required Fields ---
  const nameError = notBlank(product.name ?? '', 'name');
  if (nameError) errors.push(nameError);

  const skuError = notBlank(product.sku ?? '', 'sku');
  if (skuError) errors.push(skuError);

  // --- Cost Fields ---
  const costFields: Array<{ value: number | undefined; field: string }> = [
    { value: product.purchaseCost, field: 'purchaseCost' },
    { value: product.shippingCost, field: 'shippingCost' },
    { value: product.packagingCost, field: 'packagingCost' },
    { value: product.handlingCost, field: 'handlingCost' },
    { value: product.otherCosts, field: 'otherCosts' },
    { value: product.marketplaceFeeFixed, field: 'marketplaceFeeFixed' },
    { value: product.paymentFeeFixed, field: 'paymentFeeFixed' },
    { value: product.otherFeesFixed, field: 'otherFeesFixed' },
  ];

  for (const { value, field } of costFields) {
    if (value !== undefined) {
      const error = nonNegative(value, field);
      if (error) errors.push(error);
    }
  }

  // --- Percentage Fields ---
  const percentFields: Array<{ value: number | undefined; field: string; max: number }> = [
    { value: product.returnRatePercent, field: 'returnRatePercent', max: 100 },
    { value: product.damageRatePercent, field: 'damageRatePercent', max: 100 },
    { value: product.customDutyPercent, field: 'customDutyPercent', max: 100 },
    { value: product.freightPercent, field: 'freightPercent', max: 100 },
    { value: product.taxRatePercent, field: 'taxRatePercent', max: 50 },
    { value: product.marketplaceFeePercent, field: 'marketplaceFeePercent', max: 50 },
    { value: product.paymentFeePercent, field: 'paymentFeePercent', max: 10 },
    { value: product.otherFeesPercent, field: 'otherFeesPercent', max: 20 },
  ];

  for (const { value, field, max } of percentFields) {
    if (value !== undefined) {
      const error = percentageRange(value, field, 0, max);
      if (error) errors.push(error);
    }
  }

  // --- Selling Price ---
  if (product.currentSellingPrice !== undefined) {
    const error = nonNegative(product.currentSellingPrice, 'currentSellingPrice');
    if (error) errors.push(error);

    // Warn if selling price is less than purchase cost
    if (
      product.currentSellingPrice > 0 &&
      product.purchaseCost > 0 &&
      product.currentSellingPrice < product.purchaseCost
    ) {
      errors.push({
        field: 'currentSellingPrice',
        message: 'Selling price is below purchase cost — product will be loss-making',
        severity: 'warning',
        value: product.currentSellingPrice,
        suggestion: 'Increase the selling price above the purchase cost',
      });
    }
  }

  // --- Tax Treatment ---
  if (product.taxTreatment) {
    const error = taxTreatmentValid(product.taxTreatment);
    if (error) errors.push(error);
  }

  // --- Sales Channel ---
  if (product.salesChannel) {
    const error = salesChannelValid(product.salesChannel);
    if (error) errors.push(error);
  }

  // --- Competitor Prices ---
  if (product.competitorPrices) {
    for (const cp of product.competitorPrices) {
      if (cp.price < 0) {
        errors.push({
          field: 'competitorPrices',
          message: `Competitor "${cp.name}" has a negative price`,
          severity: 'error',
          value: cp.price,
          suggestion: 'Set competitor price to zero or a positive value',
        });
      }
      if (!cp.name || cp.name.trim() === '') {
        errors.push({
          field: 'competitorPrices',
          message: 'Competitor name is missing',
          severity: 'warning',
          suggestion: 'Add a name for each competitor price entry',
        });
      }
    }
  }

  // --- Total Fees Check ---
  if (product.marketplaceFeePercent !== undefined &&
      product.paymentFeePercent !== undefined &&
      product.otherFeesPercent !== undefined &&
      product.taxRatePercent !== undefined) {
    const totalPercentFees = 
      product.marketplaceFeePercent +
      product.paymentFeePercent +
      product.otherFeesPercent +
      (product.taxTreatment === 'exclusive' ? product.taxRatePercent : 0);
    
    if (totalPercentFees > 90) {
      errors.push({
        field: 'totalPercentageFees',
        message: `Total percentage fees (${totalPercentFees.toFixed(1)}%) exceed 90% — margins will be impossible`,
        severity: 'error',
        value: totalPercentFees,
        suggestion: 'Reduce marketplace, payment, or other percentage fees',
      });
    } else if (totalPercentFees > 50) {
      errors.push({
        field: 'totalPercentageFees',
        message: `Total percentage fees (${totalPercentFees.toFixed(1)}%) are very high`,
        severity: 'warning',
        value: totalPercentFees,
        suggestion: 'Consider negotiating lower fees or using a different channel',
      });
    }
  }

  // --- ID Check ---
  if (!product.id || product.id.trim() === '') {
    errors.push({
      field: 'id',
      message: 'Product ID is missing',
      severity: 'error',
      suggestion: 'Each product must have a unique ID',
    });
  }

  return errors;
}

// ============================================================
// Pricing Rule Validation
// ============================================================

/**
 * Validate a pricing rule and return an array of errors.
 */
export function validatePricingRule(rule: Partial<PricingRule>): ValidationError[] {
  const errors: ValidationError[] = [];

  // --- Required Fields ---
  const nameError = notBlank(rule.name ?? '', 'name');
  if (nameError) errors.push(nameError);

  const levelError = ruleLevelValid(rule.level ?? '');
  if (levelError) errors.push(levelError);

  // --- Level-Specific Target Fields ---
  if (rule.level === 'category' && !rule.targetCategory?.trim()) {
    errors.push({
      field: 'targetCategory',
      message: 'Category-level rule must specify a target category',
      severity: 'error',
      suggestion: 'Set the targetCategory field',
    });
  }
  if (rule.level === 'brand' && !rule.targetBrand?.trim()) {
    errors.push({
      field: 'targetBrand',
      message: 'Brand-level rule must specify a target brand',
      severity: 'error',
      suggestion: 'Set the targetBrand field',
    });
  }
  if (rule.level === 'channel') {
    if (!rule.targetChannel) {
      errors.push({
        field: 'targetChannel',
        message: 'Channel-level rule must specify a target sales channel',
        severity: 'error',
        suggestion: 'Set the targetChannel field',
      });
    } else {
      const channelError = salesChannelValid(rule.targetChannel);
      if (channelError) errors.push(channelError);
    }
  }
  if (rule.level === 'product') {
    if (!rule.targetProductId?.trim() && !rule.targetProductSku?.trim()) {
      errors.push({
        field: 'targetProductId',
        message: 'Product-level rule must specify a target product ID or SKU',
        severity: 'error',
        suggestion: 'Set either targetProductId or targetProductSku',
      });
    }
  }

  // --- Margin / Markup Targets ---
  const marginFields: Array<{ value: number | undefined; field: string; max: number }> = [
    { value: rule.targetMarginPercent, field: 'targetMarginPercent', max: 100 },
    { value: rule.minimumMarginPercent, field: 'minimumMarginPercent', max: 100 },
    { value: rule.maximumMarginPercent, field: 'maximumMarginPercent', max: 100 },
    { value: rule.targetMarkupPercent, field: 'targetMarkupPercent', max: 500 },
  ];

  for (const { value, field, max } of marginFields) {
    if (value !== undefined) {
      const error = percentageRange(value, field, 0, max);
      if (error) errors.push(error);
    }
  }

  // --- Logical Checks ---
  if (rule.minimumMarginPercent !== undefined && rule.maximumMarginPercent !== undefined) {
    if (rule.minimumMarginPercent > rule.maximumMarginPercent) {
      errors.push({
        field: 'minimumMarginPercent',
        message: `Minimum margin (${rule.minimumMarginPercent}%) cannot exceed maximum (${rule.maximumMarginPercent}%)`,
        severity: 'error',
        suggestion: 'Set minimum margin below the maximum margin',
      });
    }
  }

  if (rule.targetMarginPercent !== undefined &&
      rule.minimumMarginPercent !== undefined &&
      rule.targetMarginPercent < rule.minimumMarginPercent) {
    errors.push({
      field: 'targetMarginPercent',
      message: `Target margin (${rule.targetMarginPercent}%) is below minimum (${rule.minimumMarginPercent}%)`,
      severity: 'warning',
      suggestion: 'Set target margin above the minimum margin',
    });
  }

  // --- Override Fields ---
  if (rule.overrideTaxRatePercent !== undefined) {
    const error = percentageRange(rule.overrideTaxRatePercent, 'overrideTaxRatePercent', 0, 50);
    if (error) errors.push(error);
  }
  if (rule.overrideMarketplaceFeePercent !== undefined) {
    const error = percentageRange(rule.overrideMarketplaceFeePercent, 'overrideMarketplaceFeePercent', 0, 50);
    if (error) errors.push(error);
  }
  if (rule.overridePaymentFeePercent !== undefined) {
    const error = percentageRange(rule.overridePaymentFeePercent, 'overridePaymentFeePercent', 0, 10);
    if (error) errors.push(error);
  }

  // --- Rounding Rule ---
  if (rule.roundingRule) {
    const error = roundingRuleValid(rule.roundingRule);
    if (error) errors.push(error);

    if (rule.roundingRule === 'custom' && (!rule.customRoundingValue || rule.customRoundingValue <= 0)) {
      errors.push({
        field: 'customRoundingValue',
        message: 'Custom rounding requires a positive rounding value',
        severity: 'error',
        suggestion: 'Set customRoundingValue to a positive number',
      });
    }
  }

  // --- Competitor Strategy ---
  if (rule.competitorStrategy) {
    const strategy = rule.competitorStrategy;
    const validModes: CompetitorStrategy['mode'][] = [
      'ignore', 'match-average', 'below-average', 'above-average',
      'match-lowest', 'match-highest', 'custom-offset'
    ];
    if (!validModes.includes(strategy.mode)) {
      errors.push({
        field: 'competitorStrategy.mode',
        message: `${strategy.mode} is not a valid competitor strategy mode`,
        severity: 'error',
        suggestion: `Use one of: ${validModes.join(', ')}`,
      });
    }
    if (strategy.weightPercent !== undefined) {
      const error = percentageRange(strategy.weightPercent, 'competitorStrategy.weightPercent', 0, 100);
      if (error) errors.push(error);
    }
  }

  // --- Priority ---
  if (rule.priority !== undefined && rule.priority < 0) {
    errors.push({
      field: 'priority',
      message: 'Priority cannot be negative',
      severity: 'warning',
      suggestion: 'Use 0 or a positive priority number',
    });
  }

  return errors;
}

// ============================================================
// Business Settings Validation
// ============================================================

/**
 * Validate business settings and return an array of errors.
 */
export function validateBusinessSettings(settings: Partial<BusinessSettings>): ValidationError[] {
  const errors: ValidationError[] = [];

  // --- Business Name ---
  const nameError = notBlank(settings.businessName ?? '', 'businessName');
  if (nameError) errors.push(nameError);

  // --- Currency ---
  if (settings.currencyCode) {
    const error = currencyValid(settings.currencyCode);
    if (error) errors.push(error);
  } else {
    errors.push({
      field: 'currencyCode',
      message: 'Currency code is required',
      severity: 'error',
      suggestion: 'Select a currency',
    });
  }

  // --- Country ---
  if (!settings.country || settings.country.trim() === '') {
    errors.push({
      field: 'country',
      message: 'Country is required',
      severity: 'error',
      suggestion: 'Select a country',
    });
  }

  // --- Tax Treatment ---
  if (settings.taxTreatment) {
    const error = taxTreatmentValid(settings.taxTreatment);
    if (error) errors.push(error);
  }

  // --- Default Percentage Values ---
  const percentFields: Array<{ value: number | undefined; field: string; max: number }> = [
    { value: settings.defaultTaxRatePercent, field: 'defaultTaxRatePercent', max: 50 },
    { value: settings.defaultMarketplaceFeePercent, field: 'defaultMarketplaceFeePercent', max: 50 },
    { value: settings.defaultPaymentFeePercent, field: 'defaultPaymentFeePercent', max: 10 },
    { value: settings.defaultReturnRatePercent, field: 'defaultReturnRatePercent', max: 100 },
    { value: settings.defaultDamageRatePercent, field: 'defaultDamageRatePercent', max: 100 },
    { value: settings.defaultCustomDutyPercent, field: 'defaultCustomDutyPercent', max: 100 },
    { value: settings.defaultFreightPercent, field: 'defaultFreightPercent', max: 100 },
    { value: settings.defaultTargetMarginPercent, field: 'defaultTargetMarginPercent', max: 100 },
    { value: settings.defaultMinimumMarginPercent, field: 'defaultMinimumMarginPercent', max: 100 },
    { value: settings.defaultMaximumMarginPercent, field: 'defaultMaximumMarginPercent', max: 100 },
  ];

  for (const { value, field, max } of percentFields) {
    if (value !== undefined) {
      const error = percentageRange(value, field, 0, max);
      if (error) errors.push(error);
    }
  }

  // --- Default Cost Values ---
  const costFields: Array<{ value: number | undefined; field: string }> = [
    { value: settings.defaultShippingCost, field: 'defaultShippingCost' },
    { value: settings.defaultPackagingCost, field: 'defaultPackagingCost' },
    { value: settings.defaultHandlingCost, field: 'defaultHandlingCost' },
    { value: settings.defaultOtherCosts, field: 'defaultOtherCosts' },
    { value: settings.defaultMarketplaceFeeFixed, field: 'defaultMarketplaceFeeFixed' },
    { value: settings.defaultPaymentFeeFixed, field: 'defaultPaymentFeeFixed' },
  ];

  for (const { value, field } of costFields) {
    if (value !== undefined) {
      const error = nonNegative(value, field);
      if (error) errors.push(error);
    }
  }

  // --- Margin Logic ---
  if (settings.defaultMinimumMarginPercent !== undefined &&
      settings.defaultMaximumMarginPercent !== undefined &&
      settings.defaultMinimumMarginPercent > settings.defaultMaximumMarginPercent) {
    errors.push({
      field: 'defaultMinimumMarginPercent',
      message: `Minimum margin (${settings.defaultMinimumMarginPercent}%) exceeds maximum (${settings.defaultMaximumMarginPercent}%)`,
      severity: 'error',
    });
  }

  if (settings.defaultTargetMarginPercent !== undefined &&
      settings.defaultMinimumMarginPercent !== undefined &&
      settings.defaultTargetMarginPercent < settings.defaultMinimumMarginPercent) {
    errors.push({
      field: 'defaultTargetMarginPercent',
      message: `Target margin (${settings.defaultTargetMarginPercent}%) is below minimum (${settings.defaultMinimumMarginPercent}%)`,
      severity: 'warning',
    });
  }

  // --- Profitability Thresholds ---
  if (settings.healthyMarginMinPercent !== undefined &&
      settings.healthyMarginMaxPercent !== undefined &&
      settings.healthyMarginMinPercent > settings.healthyMarginMaxPercent) {
    errors.push({
      field: 'healthyMarginMinPercent',
      message: `Healthy margin min (${settings.healthyMarginMinPercent}%) exceeds max (${settings.healthyMarginMaxPercent}%)`,
      severity: 'error',
    });
  }

  // --- Rounding ---
  if (settings.defaultRoundingRule) {
    const error = roundingRuleValid(settings.defaultRoundingRule);
    if (error) errors.push(error);

    if (settings.defaultRoundingRule === 'custom' &&
        (!settings.customRoundingValue || settings.customRoundingValue <= 0)) {
      errors.push({
        field: 'customRoundingValue',
        message: 'Custom rounding requires a positive value',
        severity: 'error',
      });
    }
  }

  return errors;
}

// ============================================================
// Import Data Validation
// ============================================================

/**
 * Validate imported data rows (after mapping/cleaning).
 * Checks for required fields, type validity, and logical consistency.
 */
export function validateImportData(rows: Record<string, unknown>[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (rows.length === 0) {
    errors.push({
      field: 'rows',
      message: 'No data rows to validate',
      severity: 'error',
      suggestion: 'Import a file with at least one row of data',
    });
    return errors;
  }

  // Check for duplicate SKUs
  const skuCounts: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = String(row.sku ?? '').trim();
    if (sku) {
      skuCounts[sku] = (skuCounts[sku] ?? 0) + 1;
    }
  }

  const duplicateSkus = Object.entries(skuCounts)
    .filter(([_, count]) => count > 1)
    .map(([sku]) => sku);

  if (duplicateSkus.length > 0) {
    errors.push({
      field: 'sku',
      message: `Duplicate SKUs found: ${duplicateSkus.join(', ')}`,
      severity: 'warning',
      suggestion: 'Remove duplicates or assign unique SKUs to each product',
    });
  }

  // Validate each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowPrefix = `Row ${i + 1}`;

    // Required fields
    if (!row.name || String(row.name).trim() === '') {
      errors.push({
        field: `${rowPrefix}.name`,
        message: `Row ${i + 1}: Product name is missing`,
        severity: 'error',
      });
    }

    if (!row.sku || String(row.sku).trim() === '') {
      errors.push({
        field: `${rowPrefix}.sku`,
        message: `Row ${i + 1}: SKU is missing`,
        severity: 'error',
      });
    }

    // Numeric fields
    const numericFields = [
      'purchaseCost', 'shippingCost', 'packagingCost', 'handlingCost',
      'otherCosts', 'currentSellingPrice', 'marketplaceFeeFixed',
      'paymentFeeFixed', 'otherFeesFixed',
    ];
    for (const field of numericFields) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        const num = Number(row[field]);
        if (isNaN(num)) {
          errors.push({
            field: `${rowPrefix}.${field}`,
            message: `Row ${i + 1}: ${field} "${row[field]}" is not a valid number`,
            severity: 'error',
            value: row[field],
          });
        } else if (num < 0) {
          errors.push({
            field: `${rowPrefix}.${field}`,
            message: `Row ${i + 1}: ${field} cannot be negative`,
            severity: 'error',
            value: num,
          });
        }
      }
    }

    // Percentage fields
    const percentFields = [
      'returnRatePercent', 'damageRatePercent', 'customDutyPercent',
      'freightPercent', 'taxRatePercent', 'marketplaceFeePercent',
      'paymentFeePercent', 'otherFeesPercent',
    ];
    for (const field of percentFields) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        const num = Number(row[field]);
        if (isNaN(num)) {
          errors.push({
            field: `${rowPrefix}.${field}`,
            message: `Row ${i + 1}: ${field} "${row[field]}" is not a valid percentage`,
            severity: 'error',
            value: row[field],
          });
        } else if (num < 0 || num > 100) {
          errors.push({
            field: `${rowPrefix}.${field}`,
            message: `Row ${i + 1}: ${field} (${num}%) is out of range (0-100)`,
            severity: num > 200 ? 'error' : 'warning',
            value: num,
          });
        }
      }
    }

    // Selling price vs purchase cost
    const sellingPrice = Number(row.currentSellingPrice ?? 0);
    const purchaseCost = Number(row.purchaseCost ?? 0);
    if (sellingPrice > 0 && purchaseCost > 0 && sellingPrice < purchaseCost) {
      errors.push({
        field: `${rowPrefix}.currentSellingPrice`,
        message: `Row ${i + 1}: Selling price (${sellingPrice}) is below purchase cost (${purchaseCost})`,
        severity: 'warning',
      });
    }
  }

  return errors;
}

// ============================================================
// Batch Validation
// ============================================================

/**
 * Validate multiple products at once.
 */
export function validateProducts(products: Partial<Product>[]): ValidationError[] {
  const allErrors: ValidationError[] = [];

  // Individual validation
  for (const product of products) {
    allErrors.push(...validateProduct(product));
  }

  // Duplicate SKU check
  const skuCounts: Record<string, number> = {};
  for (const product of products) {
    const sku = (product.sku ?? '').trim();
    if (sku) skuCounts[sku] = (skuCounts[sku] ?? 0) + 1;
  }
  const duplicateSkus = Object.entries(skuCounts)
    .filter(([_, count]) => count > 1)
    .map(([sku]) => sku);

  if (duplicateSkus.length > 0) {
    allErrors.push({
      field: 'sku',
      message: `Duplicate SKUs found: ${duplicateSkus.join(', ')}`,
      severity: 'warning',
      suggestion: 'Each product should have a unique SKU',
    });
  }

  // Duplicate ID check
  const idCounts: Record<string, number> = {};
  for (const product of products) {
    const id = (product.id ?? '').trim();
    if (id) idCounts[id] = (idCounts[id] ?? 0) + 1;
  }
  const duplicateIds = Object.entries(idCounts)
    .filter(([_, count]) => count > 1)
    .map(([id]) => id);

  if (duplicateIds.length > 0) {
    allErrors.push({
      field: 'id',
      message: `Duplicate IDs found: ${duplicateIds.join(', ')}`,
      severity: 'error',
      suggestion: 'Each product must have a unique ID',
    });
  }

  return allErrors;
}
