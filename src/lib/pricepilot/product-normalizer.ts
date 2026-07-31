/**
 * PricePilot - Product Normalizer
 *
 * Central entry point that converts ANY raw input (from localStorage, an
 * Excel/CSV import, a manual form submission, a backup file, or sample
 * data) into a `Product` that is guaranteed safe to render.
 *
 * CONTRACTS:
 *   1. `normalizeProduct` NEVER throws. It always returns a
 *      `ProductNormalizationResult` — either success (with a product
 *      that is safe to render) or failure (with a "needs-review"
 *      product that is STILL safe to render, just flagged).
 *   2. The returned `product` is always a complete `Product` object —
 *      every required field exists and every numeric field is a finite
 *      number. No `undefined`, no `NaN`, no `Infinity`.
 *   3. The caller is informed of every repair via `issues[]`.
 *   4. Identity: a product is acceptable with EITHER a name OR a sku.
 *      When both are missing, the row is rejected.
 *
 * The normalizer uses Zod for structural validation and a custom
 * coercion layer for legacy / human-entered values (currency strings,
 * Indian comma-formatted strings, percentages, etc.).
 */

import { z } from 'zod';
import {
  Product,
  PricingStatus,
  ProfitabilityMeter,
  LifecycleStatus,
  PricingConfidence,
  RecommendationMode,
  PriceApprovalStatus,
  SalesChannel,
  TaxTreatment,
  InputTaxCreditRecoverable,
  PurchaseCostTaxMode,
  FeeBasePolicy,
  CompetitorPrice,
  RecommendedPrices,
} from './types';
import {
  isFiniteNumber,
  safeNumberValue,
  parseNumericInput,
} from './formatting';

// ============================================================
// Issue Reporting
// ============================================================

export interface ProductNormalizationIssue {
  field?: string;
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export type ProductNormalizationResult = {
  success: true;
  product: Product;
  issues: ProductNormalizationIssue[];
} | {
  success: false;
  product: Product; // still safe to render — but flagged needs-review
  issues: ProductNormalizationIssue[];
};

// ============================================================
// Internal: Numeric Coercion
// ============================================================

/**
 * Coerce a value into a finite, non-negative number.
 * Accepts: numbers, numeric strings, currency/percent strings, comma-formatted strings.
 * Returns 0 if the value cannot be parsed or is negative (unless `allowNegative` is true).
 */
function coerceNonNegativeNumber(
  value: unknown,
  field: string,
  issues: ProductNormalizationIssue[],
  options: { allowNegative?: boolean; max?: number } = {}
): number {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') {
    if (!isFiniteNumber(value)) {
      issues.push({
        field,
        code: 'non-finite',
        message: `${field} was ${String(value)} and has been reset to 0.`,
        severity: 'warning',
      });
      return 0;
    }
    if (value < 0 && !options.allowNegative) {
      issues.push({
        field,
        code: 'negative-clamped',
        message: `${field} was ${value} and has been clamped to 0.`,
        severity: 'warning',
      });
      return 0;
    }
    if (options.max !== undefined && value > options.max) {
      issues.push({
        field,
        code: 'above-max-clamped',
        message: `${field} was ${value}% and has been clamped to ${options.max}%.`,
        severity: 'warning',
      });
      return options.max;
    }
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseNumericInput(value);
    if (!isFiniteNumber(parsed)) {
      issues.push({
        field,
        code: 'unparseable-string',
        message: `${field} could not be read from "${value}" and has been reset to 0.`,
        severity: 'warning',
      });
      return 0;
    }
    // Reuse the numeric path for bounds checking.
    return coerceNonNegativeNumber(parsed, field, issues, options);
  }

  // Objects, arrays, booleans, symbols — invalid.
  issues.push({
    field,
    code: 'invalid-type',
    message: `${field} had an invalid type (${typeof value}) and has been reset to 0.`,
    severity: 'warning',
  });
  return 0;
}

/**
 * Coerce a percentage value (0-100). Values outside this range are clamped
 * with a warning.
 */
function coercePercent(
  value: unknown,
  field: string,
  issues: ProductNormalizationIssue[],
  options: { allowZero?: boolean } = {}
): number {
  const num = coerceNonNegativeNumber(value, field, issues, { max: 100 });
  if (!options.allowZero && num === 0) {
    // 0 is a valid percentage (no fee / no tax) — no issue.
  }
  return num;
}

/**
 * Coerce a fee percentage. Fees must be in [0, 100]. Anything above 100%
 * is rejected (an error, not silently clamped) because it indicates a
 * fundamentally broken configuration.
 */
function coerceFeePercent(
  value: unknown,
  field: string,
  issues: ProductNormalizationIssue[]
): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'string') {
    const parsed = parseNumericInput(value);
    if (!isFiniteNumber(parsed)) {
      issues.push({
        field,
        code: 'fee-unparseable',
        message: `${field} could not be read and has been set to 0%.`,
        severity: 'warning',
      });
      return 0;
    }
    value = parsed;
  }
  if (!isFiniteNumber(value)) {
    issues.push({
      field,
      code: 'fee-non-finite',
      message: `${field} was ${String(value)} and has been set to 0%.`,
      severity: 'warning',
    });
    return 0;
  }
  if (value < 0) {
    issues.push({
      field,
      code: 'fee-negative',
      message: `${field} was ${value}% (negative fees are invalid) and has been set to 0%.`,
      severity: 'error',
    });
    return 0;
  }
  if (value > 100) {
    issues.push({
      field,
      code: 'fee-above-100',
      message: `${field} was ${value}% (a fee above 100% is impossible) and has been set to 0%.`,
      severity: 'error',
    });
    return 0;
  }
  return value;
}

// ============================================================
// Internal: Enum Coercion
// ============================================================

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  field: string,
  issues: ProductNormalizationIssue[]
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  issues.push({
    field,
    code: 'invalid-enum',
    message: `${field} was "${String(value)}" and has been reset to "${fallback}".`,
    severity: 'warning',
  });
  return fallback;
}

const SALES_CHANNELS: readonly SalesChannel[] = [
  'online-marketplace', 'own-website', 'retail-store', 'wholesale',
  'distributor', 'offline', 'other',
];
const TAX_TREATMENTS: readonly TaxTreatment[] = [
  'inclusive', 'exclusive', 'exempt', 'reverse', 'composite',
];
const INPUT_TAX_RECOVERABLE: readonly InputTaxCreditRecoverable[] = [
  'recoverable', 'not-recoverable', 'partially-recoverable',
];
const PURCHASE_TAX_MODES: readonly PurchaseCostTaxMode[] = [
  'including-tax', 'excluding-tax',
];
const FEE_BASE_POLICIES: readonly FeeBasePolicy[] = [
  'product-price-only', 'product-price-plus-shipping', 'customer-payable-gross',
];
const RECOMMENDATION_MODES: readonly RecommendationMode[] = [
  'minimum', 'competitive', 'balanced', 'premium', 'custom',
];
const PRICE_APPROVAL_STATUSES: readonly PriceApprovalStatus[] = [
  'none', 'selected', 'approved',
];
const LIFECYCLE_STATUSES: readonly LifecycleStatus[] = [
  'active', 'draft', 'missing-data', 'needs-review', 'approved', 'archived',
];
const PRICING_STATUSES: readonly PricingStatus[] = [
  'loss-making', 'below-break-even', 'low-margin', 'healthy',
  'high-margin', 'above-market', 'missing-data', 'needs-review', 'approved',
];
const PROFITABILITY_METERS: readonly ProfitabilityMeter[] = [
  'loss', 'break-even', 'low-margin', 'healthy', 'strong-margin',
];
const PRICING_CONFIDENCES: readonly PricingConfidence[] = ['high', 'medium', 'low'];

// ============================================================
// Internal: Competitor Price Coercion
// ============================================================

function coerceCompetitorPrices(
  raw: unknown,
  issues: ProductNormalizationIssue[]
): CompetitorPrice[] {
  if (!Array.isArray(raw)) return [];
  const result: CompetitorPrice[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      issues.push({
        field: `competitorPrices[${i}]`,
        code: 'competitor-invalid',
        message: `Competitor price entry ${i + 1} was invalid and has been skipped.`,
        severity: 'warning',
      });
      continue;
    }
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : `Competitor ${i + 1}`;
    const price = coerceNonNegativeNumber(
      obj.price, `competitorPrices[${i}].price`, issues
    );
    if (price <= 0) {
      // Skip competitors with no usable price.
      continue;
    }
    result.push({
      name,
      price,
      url: typeof obj.url === 'string' ? obj.url : undefined,
      dateChecked: typeof obj.dateChecked === 'string' ? obj.dateChecked : undefined,
    });
  }
  return result;
}

// ============================================================
// Internal: String Array Coercion
// ============================================================

function coerceStringArray(raw: unknown, field: string, issues: ProductNormalizationIssue[]): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.trim());
}

// ============================================================
// Internal: Recommended Prices Coercion
// ============================================================

function coerceRecommendedPrices(
  raw: unknown,
  issues: ProductNormalizationIssue[]
): RecommendedPrices {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    breakEven: coerceNonNegativeNumber(obj.breakEven, 'recommendedPrices.breakEven', issues),
    minimum: coerceNonNegativeNumber(obj.minimum, 'recommendedPrices.minimum', issues),
    competitive: coerceNonNegativeNumber(obj.competitive, 'recommendedPrices.competitive', issues),
    balanced: coerceNonNegativeNumber(obj.balanced, 'recommendedPrices.balanced', issues),
    premium: coerceNonNegativeNumber(obj.premium, 'recommendedPrices.premium', issues),
    custom: obj.custom !== undefined && obj.custom !== null
      ? coerceNonNegativeNumber(obj.custom, 'recommendedPrices.custom', issues)
      : undefined,
    confidence: coerceEnum(obj.confidence, PRICING_CONFIDENCES, 'low', 'recommendedPrices.confidence', issues),
  };
}

// ============================================================
// Internal: ID Generation
// ============================================================

function generateId(): string {
  return `prod-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureId(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  return generateId();
}

function ensureIsoDate(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    // Best-effort: validate it parses as a date.
    const parsed = Date.parse(raw);
    if (isFiniteNumber(parsed)) return raw;
  }
  return fallback;
}

// ============================================================
// Main Entry Point
// ============================================================

export type NormalizationSource = 'storage' | 'import' | 'manual' | 'sample' | 'backup';

export function normalizeProduct(
  raw: unknown,
  context?: {
    source?: NormalizationSource;
    rowNumber?: number;
  }
): ProductNormalizationResult {
  const issues: ProductNormalizationIssue[] = [];
  const source = context?.source ?? 'storage';
  const rowLabel = context?.rowNumber !== undefined ? ` (row ${context.rowNumber})` : '';

  // Reject non-object input cleanly.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push({
      code: 'not-an-object',
      message: `Product${rowLabel} was not an object and has been replaced with a placeholder needs-review product.`,
      severity: 'error',
    });
    return {
      success: false,
      product: makeNeedsReviewPlaceholder(),
      issues,
    };
  }

  const obj = raw as Record<string, unknown>;

  // --- Identity ---
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  const sku = typeof obj.sku === 'string' ? obj.sku.trim() : '';
  const hasName = name.length > 0;
  const hasSku = sku.length > 0;

  if (!hasName && !hasSku) {
    issues.push({
      code: 'missing-identity',
      message: `Product${rowLabel} has neither a name nor a SKU. It cannot be imported.`,
      severity: 'error',
    });
    return {
      success: false,
      product: makeNeedsReviewPlaceholder(),
      issues,
    };
  }

  // --- Numeric fields ---
  const purchaseCost = coerceNonNegativeNumber(obj.purchaseCost, 'purchaseCost', issues);
  const shippingCost = coerceNonNegativeNumber(obj.shippingCost, 'shippingCost', issues);
  const packagingCost = coerceNonNegativeNumber(obj.packagingCost, 'packagingCost', issues);
  const handlingCost = coerceNonNegativeNumber(obj.handlingCost, 'handlingCost', issues);
  const otherCosts = coerceNonNegativeNumber(obj.otherCosts, 'otherCosts', issues);
  const returnRatePercent = coercePercent(obj.returnRatePercent, 'returnRatePercent', issues);
  const damageRatePercent = coercePercent(obj.damageRatePercent, 'damageRatePercent', issues);
  const customDutyPercent = coercePercent(obj.customDutyPercent, 'customDutyPercent', issues);
  const freightPercent = coercePercent(obj.freightPercent, 'freightPercent', issues);
  const currentSellingPrice = coerceNonNegativeNumber(obj.currentSellingPrice, 'currentSellingPrice', issues);
  const taxRatePercent = coercePercent(obj.taxRatePercent, 'taxRatePercent', issues);
  const marketplaceFeePercent = coerceFeePercent(obj.marketplaceFeePercent, 'marketplaceFeePercent', issues);
  const marketplaceFeeFixed = coerceNonNegativeNumber(obj.marketplaceFeeFixed, 'marketplaceFeeFixed', issues);
  const paymentFeePercent = coerceFeePercent(obj.paymentFeePercent, 'paymentFeePercent', issues);
  const paymentFeeFixed = coerceNonNegativeNumber(obj.paymentFeeFixed, 'paymentFeeFixed', issues);
  const shippingChargeToCustomer = coerceNonNegativeNumber(obj.shippingChargeToCustomer, 'shippingChargeToCustomer', issues);
  const otherFeesPercent = coerceFeePercent(obj.otherFeesPercent, 'otherFeesPercent', issues);
  const otherFeesFixed = coerceNonNegativeNumber(obj.otherFeesFixed, 'otherFeesFixed', issues);

  const purchaseTaxRatePercent = coercePercent(obj.purchaseTaxRatePercent, 'purchaseTaxRatePercent', issues);
  const inputTaxRecoverablePercent = coercePercent(
    obj.inputTaxRecoverablePercent, 'inputTaxRecoverablePercent', issues
  );
  if (inputTaxRecoverablePercent > 100) {
    // Already clamped by coercePercent, but the issue is informational.
  }

  const customRecommendedPrice = coerceNonNegativeNumber(obj.customRecommendedPrice, 'customRecommendedPrice', issues);
  const finalApprovedPrice = coerceNonNegativeNumber(obj.finalApprovedPrice, 'finalApprovedPrice', issues);
  const quantity = coerceNonNegativeNumber(obj.quantity, 'quantity', issues);
  const monthlyUnitsSold = coerceNonNegativeNumber(obj.monthlyUnitsSold, 'monthlyUnitsSold', issues);
  const expectedMonthlyUnits = coerceNonNegativeNumber(obj.expectedMonthlyUnits, 'expectedMonthlyUnits', issues);

  // Calculated fields — all forced to safe defaults. The calculation
  // engine will populate them on the next recalc.
  const calculatedBaseCost = 0;
  const calculatedExpectedReturnCost = 0;
  const calculatedExpectedDamageCost = 0;
  const calculatedTotalLandedCost = 0;
  const calculatedBreakEvenPrice = 0;
  const calculatedMarkupPercent = 0;
  const calculatedMarginPercent = 0;
  const calculatedProfitPerUnit = 0;
  const calculatedTotalPercentageFees = 0;
  const calculatedTotalFixedFees = 0;
  const calculatedHealthScore = safeNumberValue(obj.calculatedHealthScore, 0);

  // --- Enums ---
  const salesChannel = coerceEnum(obj.salesChannel, SALES_CHANNELS, 'online-marketplace', 'salesChannel', issues);
  const taxTreatment = coerceEnum(obj.taxTreatment, TAX_TREATMENTS, 'inclusive', 'taxTreatment', issues);
  const inputTaxCreditRecoverable = coerceEnum(
    obj.inputTaxCreditRecoverable, INPUT_TAX_RECOVERABLE, 'not-recoverable', 'inputTaxCreditRecoverable', issues
  );
  const purchaseCostTaxMode = coerceEnum(
    obj.purchaseCostTaxMode, PURCHASE_TAX_MODES, 'excluding-tax', 'purchaseCostTaxMode', issues
  );
  const feeBasePolicy = coerceEnum(
    obj.feeBasePolicy, FEE_BASE_POLICIES, 'product-price-only', 'feeBasePolicy', issues
  );
  const selectedRecommendationMode = coerceEnum(
    obj.selectedRecommendationMode, RECOMMENDATION_MODES, 'balanced', 'selectedRecommendationMode', issues
  );
  const priceApprovalStatus = coerceEnum(
    obj.priceApprovalStatus, PRICE_APPROVAL_STATUSES, 'none', 'priceApprovalStatus', issues
  );

  // --- Nested objects ---
  const competitorPrices = coerceCompetitorPrices(obj.competitorPrices, issues);
  const tags = coerceStringArray(obj.tags, 'tags', issues);
  const recommendedPrices = coerceRecommendedPrices(obj.recommendedPrices, issues);

  // --- Strings ---
  const category = typeof obj.category === 'string' ? obj.category : '';
  const brand = typeof obj.brand === 'string' ? obj.brand : '';
  const description = typeof obj.description === 'string' ? obj.description : '';
  const notes = typeof obj.notes === 'string' ? obj.notes : '';
  const approvedAt = typeof obj.approvedAt === 'string' && obj.approvedAt.length > 0 ? obj.approvedAt : '';
  const importBatchId = typeof obj.importBatchId === 'string' && obj.importBatchId.length > 0 ? obj.importBatchId : undefined;
  const importSourceFileName = typeof obj.importSourceFileName === 'string' && obj.importSourceFileName.length > 0 ? obj.importSourceFileName : undefined;
  const importSourceSheet = typeof obj.importSourceSheet === 'string' && obj.importSourceSheet.length > 0 ? obj.importSourceSheet : undefined;
  const importOriginalRowNumber = typeof obj.importOriginalRowNumber === 'number' && isFiniteNumber(obj.importOriginalRowNumber)
    ? obj.importOriginalRowNumber
    : undefined;

  // --- Identity / metadata ---
  const id = ensureId(obj.id);
  const now = new Date().toISOString();
  const createdAt = ensureIsoDate(obj.createdAt, now);
  const updatedAt = ensureIsoDate(obj.updatedAt, now);
  const isApproved = obj.isApproved === true;

  // --- Lifecycle / status ---
  // If purchase cost is missing or zero, force needs-review / missing-data.
  let lifecycleStatus = coerceEnum(
    obj.lifecycleStatus, LIFECYCLE_STATUSES, 'active', 'lifecycleStatus', issues
  );
  let calculatedPricingStatus = coerceEnum(
    obj.calculatedPricingStatus, PRICING_STATUSES, 'missing-data', 'calculatedPricingStatus', issues
  );
  const calculatedProfitabilityMeter = coerceEnum(
    obj.calculatedProfitabilityMeter, PROFITABILITY_METERS, 'loss', 'calculatedProfitabilityMeter', issues
  );

  let success = true;
  if (purchaseCost <= 0) {
    // Missing purchase cost => recoverable, but flagged.
    lifecycleStatus = 'needs-review';
    calculatedPricingStatus = 'missing-data';
    recommendedPrices.confidence = 'low';
    issues.push({
      field: 'purchaseCost',
      code: 'missing-purchase-cost',
      message: `Product${rowLabel} ("${name || sku}") is missing a purchase cost. It has been imported but flagged for review — no trusted recommendation will be shown until the cost is added.`,
      severity: 'warning',
    });
    // Missing cost is recoverable — not a hard failure.
    success = true;
  }

  const product: Product = {
    id,
    sku,
    name,
    category,
    brand,
    description,
    tags,
    purchaseCost,
    shippingCost,
    packagingCost,
    handlingCost,
    otherCosts,
    returnRatePercent,
    damageRatePercent,
    customDutyPercent,
    freightPercent,
    currentSellingPrice,
    competitorPrices,
    salesChannel,
    taxRatePercent,
    taxTreatment,
    marketplaceFeePercent,
    marketplaceFeeFixed,
    paymentFeePercent,
    paymentFeeFixed,
    shippingChargeToCustomer,
    otherFeesPercent,
    otherFeesFixed,
    calculatedBaseCost,
    calculatedExpectedReturnCost,
    calculatedExpectedDamageCost,
    calculatedTotalLandedCost,
    calculatedBreakEvenPrice,
    calculatedMarkupPercent,
    calculatedMarginPercent,
    calculatedProfitPerUnit,
    calculatedTotalPercentageFees,
    calculatedTotalFixedFees,
    calculatedPricingStatus,
    calculatedProfitabilityMeter,
    calculatedHealthScore,
    recommendedPrices,
    purchaseTaxRatePercent,
    inputTaxCreditRecoverable,
    inputTaxRecoverablePercent,
    purchaseCostTaxMode,
    feeBasePolicy,
    selectedRecommendationMode,
    customRecommendedPrice,
    finalApprovedPrice,
    priceApprovalStatus,
    approvedAt,
    quantity,
    monthlyUnitsSold,
    expectedMonthlyUnits,
    importBatchId,
    importSourceFileName,
    importSourceSheet,
    importOriginalRowNumber,
    lifecycleStatus,
    createdAt,
    updatedAt,
    isApproved,
    notes,
  };

  // The hard failure cases (no name AND no sku, or non-object) are
  // already returned above. Everything else is "success" (the product
  // is safe to render, even if it has warnings).
  const hasError = issues.some(i => i.severity === 'error');
  return {
    success: success && !hasError,
    product,
    issues,
  };
}

// ============================================================
// Placeholder for hard rejections
// ============================================================

function makeNeedsReviewPlaceholder(): Product {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    sku: '',
    name: 'Unnamed product',
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
    lifecycleStatus: 'needs-review',
    createdAt: now,
    updatedAt: now,
    isApproved: false,
    notes: '',
  };
}

// ============================================================
// Batch Normalization Helper
// ============================================================

export interface BatchNormalizationResult {
  successfulProducts: Product[];
  failedProducts: Product[];
  issues: ProductNormalizationIssue[];
  /** Products that were rejected outright (no placeholder kept). */
  rejectedCount: number;
  /** Products kept as needs-review placeholders. */
  needsReviewCount: number;
}

export function normalizeProducts(
  rawList: unknown,
  context?: { source?: NormalizationSource }
): BatchNormalizationResult {
  const successfulProducts: Product[] = [];
  const failedProducts: Product[] = [];
  const issues: ProductNormalizationIssue[] = [];
  let rejectedCount = 0;
  let needsReviewCount = 0;

  if (!Array.isArray(rawList)) {
    return {
      successfulProducts,
      failedProducts,
      issues,
      rejectedCount: 0,
      needsReviewCount: 0,
    };
  }

  for (let i = 0; i < rawList.length; i++) {
    const result = normalizeProduct(rawList[i], {
      source: context?.source ?? 'storage',
      rowNumber: i + 1,
    });
    issues.push(...result.issues);
    if (result.success) {
      if (result.product.lifecycleStatus === 'needs-review') {
        needsReviewCount++;
      }
      successfulProducts.push(result.product);
    } else {
      // Even on failure, the placeholder is safe to render — but we
      // also keep it in a separate list so the caller can decide
      // whether to display it.
      if (result.product.name === 'Unnamed product' && result.product.sku === '') {
        // Hard rejection (no identity) — don't keep the placeholder.
        rejectedCount++;
      } else {
        failedProducts.push(result.product);
        needsReviewCount++;
      }
    }
  }

  return {
    successfulProducts,
    failedProducts,
    issues,
    rejectedCount,
    needsReviewCount,
  };
}
