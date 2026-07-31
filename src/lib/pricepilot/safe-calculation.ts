/**
 * PricePilot - Safe Calculation Wrapper
 *
 * Wraps the canonical pricing engine in a try/catch boundary so that a
 * single malformed product can never bring down the entire application.
 *
 * CONTRACTS:
 *   1. `safelyRecalculateProduct` NEVER throws. It always returns a
 *      `ProductCalculationResult` — either success (with the fully
 *      recalculated product and any warnings) or failure (with a safe
 *      fallback product that is still renderable).
 *   2. On failure, the returned product is normalized to
 *      `lifecycleStatus: 'needs-review'`, `calculatedPricingStatus:
 *      'needs-review'`, `recommendedPrices.confidence: 'low'`.
 *   3. The batch helper `safelyRecalculateProducts` processes every
 *      product independently — one failure does NOT stop other
 *      products from being recalculated.
 *
 * The caller is responsible for:
 *   - Normalizing the raw product first (use `normalizeProduct`).
 *   - Persisting the returned products.
 */

import {
  Product,
  BusinessSettings,
  PricingRule,
  PricingWarning,
  PricingStatus,
  LifecycleStatus,
  PricingConfidence,
} from './types';
import {
  calculateAllRecommendations,
  mapRecommendationsToProduct,
} from './recommendations';
import { resolveEffectivePricingPolicy } from './resolve-rule';
import { normalizeProduct, ProductNormalizationResult } from './product-normalizer';
import { isFiniteNumber, safeNumberValue } from './formatting';

// ============================================================
// Result Types
// ============================================================

export type ProductCalculationResult =
  | {
      success: true;
      product: Product;
      warnings: PricingWarning[];
    }
  | {
      success: false;
      product: Product;
      error: {
        code: string;
        message: string;
        field?: string;
      };
      warnings: PricingWarning[];
    };

export interface BatchCalculationResult {
  successfulProducts: Product[];
  failedProducts: Product[];
  issues: Array<{
    productId?: string;
    sku?: string;
    name?: string;
    code: string;
    message: string;
    field?: string;
  }>;
}

// ============================================================
// Internal: validate that every numeric output is finite
// ============================================================

function validateCalculationOutputs(product: Product): string | null {
  // Validate the most critical numeric fields that drive the UI.
  const numericFields: Array<keyof Product> = [
    'calculatedBaseCost',
    'calculatedExpectedReturnCost',
    'calculatedExpectedDamageCost',
    'calculatedTotalLandedCost',
    'calculatedBreakEvenPrice',
    'calculatedMarkupPercent',
    'calculatedMarginPercent',
    'calculatedProfitPerUnit',
    'calculatedTotalPercentageFees',
    'calculatedTotalFixedFees',
    'calculatedHealthScore',
    'currentSellingPrice',
    'purchaseCost',
    'finalApprovedPrice',
  ];

  for (const field of numericFields) {
    const value = product[field];
    if (!isFiniteNumber(value)) {
      return `Calculated field "${String(field)}" is not a finite number (got ${String(value)}).`;
    }
  }

  // Validate recommended prices
  const rp = product.recommendedPrices;
  if (!rp) {
    return 'Recommended prices are missing.';
  }
  const rpFields: Array<keyof typeof rp> = ['breakEven', 'minimum', 'competitive', 'balanced', 'premium'];
  for (const field of rpFields) {
    const value = rp[field];
    if (!isFiniteNumber(value)) {
      return `Recommended price "${String(field)}" is not a finite number (got ${String(value)}).`;
    }
  }

  return null;
}

// ============================================================
// Internal: build a safe fallback product on failure
// ============================================================

function makeSafeFallbackProduct(
  input: Product,
  errorMessage: string
): Product {
  return {
    ...input,
    // Force the product into a "needs review" state so the UI surfaces it.
    lifecycleStatus: 'needs-review' as LifecycleStatus,
    calculatedPricingStatus: 'needs-review' as PricingStatus,
    calculatedProfitabilityMeter: 'loss',
    calculatedHealthScore: 0,
    calculatedMarginPercent: 0,
    calculatedProfitPerUnit: 0,
    calculatedBreakEvenPrice: 0,
    calculatedTotalLandedCost: safeNumberValue(input.purchaseCost, 0),
    recommendedPrices: {
      breakEven: 0,
      minimum: 0,
      competitive: 0,
      balanced: 0,
      premium: 0,
      confidence: 'low' as PricingConfidence,
    },
    // Preserve user inputs (cost, price, fees, etc.) so the owner can fix them.
    notes: input.notes
      ? `${input.notes}\n\n[Calculation failed: ${errorMessage}]`
      : `[Calculation failed: ${errorMessage}]`,
  };
}

// ============================================================
// Main Entry Point
// ============================================================

export function safelyRecalculateProduct(
  rawProduct: unknown,
  businessSettings: BusinessSettings,
  pricingRules: PricingRule[]
): ProductCalculationResult {
  // Step 1: Normalize the input product. This itself never throws.
  const normResult: ProductNormalizationResult = normalizeProduct(rawProduct, {
    source: 'storage',
  });
  const product = normResult.product;
  const warnings: PricingWarning[] = [];

  // Convert normalization issues into warnings (preserved for caller).
  for (const issue of normResult.issues) {
    warnings.push({
      type: issue.code,
      severity: issue.severity === 'error' ? 'error' : 'info',
      message: issue.message,
      field: issue.field,
    });
  }

  // Step 2: If the product is already in a missing-data state (no
  // purchase cost), don't bother running the engine — return a
  // structured "missing-data" result instead.
  if (!isFiniteNumber(product.purchaseCost) || product.purchaseCost <= 0) {
    return {
      success: true,
      product: {
        ...product,
        lifecycleStatus: 'needs-review',
        calculatedPricingStatus: 'missing-data',
        calculatedProfitabilityMeter: 'loss',
        calculatedHealthScore: 0,
        recommendedPrices: {
          breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0,
          confidence: 'low',
        },
      },
      warnings: [
        ...warnings,
        {
          type: 'missing-cost',
          severity: 'warning',
          message: 'Purchase cost is missing or zero. No trusted recommendation can be calculated.',
          field: 'purchaseCost',
        },
      ],
    };
  }

  // Step 3: Validate business settings — if they're missing or
  // obviously broken, we can't compute anything safely.
  if (!businessSettings || typeof businessSettings !== 'object') {
    const fallback = makeSafeFallbackProduct(product, 'Business settings are missing.');
    return {
      success: false,
      product: fallback,
      error: {
        code: 'missing-business-settings',
        message: 'Price calculation could not be completed because business settings are missing.',
      },
      warnings,
    };
  }

  // Step 4: Resolve the effective pricing policy. Wrap in try/catch —
  // a malformed rule should never crash the whole batch.
  let effectiveRule;
  try {
    effectiveRule = resolveEffectivePricingPolicy(product, pricingRules ?? [], businessSettings);
    if (!effectiveRule || typeof effectiveRule !== 'object') {
      throw new Error('Resolved pricing policy is null or not an object.');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = makeSafeFallbackProduct(
      product,
      `Pricing policy resolution failed: ${message}`
    );
    return {
      success: false,
      product: fallback,
      error: {
        code: 'pricing-policy-resolution-failed',
        message: `Price calculation could not be completed because the pricing policy could not be resolved (${message}).`,
      },
      warnings,
    };
  }

  // Step 5: Run the canonical calculation engine. This is the most
  // likely place for a thrown error (deep arithmetic), so it gets its
  // own try/catch.
  let allRecs;
  try {
    allRecs = calculateAllRecommendations(product, businessSettings, pricingRules ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = makeSafeFallbackProduct(
      product,
      `Recommendation engine threw: ${message}`
    );
    return {
      success: false,
      product: fallback,
      error: {
        code: 'engine-exception',
        message: `Price calculation could not be completed because the engine threw an exception (${message}).`,
      },
      warnings,
    };
  }

  if (!allRecs || typeof allRecs !== 'object') {
    const fallback = makeSafeFallbackProduct(product, 'Recommendation engine returned no result.');
    return {
      success: false,
      product: fallback,
      error: {
        code: 'engine-empty-result',
        message: 'Price calculation could not be completed because the engine returned no result.',
      },
      warnings,
    };
  }

  // Step 6: Map recommendations onto the product. Wrap in try/catch.
  let calculatedProduct: Product;
  try {
    calculatedProduct = mapRecommendationsToProduct(
      product, allRecs, businessSettings, effectiveRule
    ) as Product;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = makeSafeFallbackProduct(
      product,
      `Mapping recommendations failed: ${message}`
    );
    return {
      success: false,
      product: fallback,
      error: {
        code: 'mapping-failed',
        message: `Price calculation could not be completed because mapping recommendations onto the product failed (${message}).`,
      },
      warnings,
    };
  }

  // Step 7: Validate that every numeric output is finite. If anything
  // is NaN/Infinity, treat the whole calculation as failed.
  const validationError = validateCalculationOutputs(calculatedProduct);
  if (validationError) {
    const fallback = makeSafeFallbackProduct(product, validationError);
    return {
      success: false,
      product: fallback,
      error: {
        code: 'non-finite-output',
        message: `Price calculation could not be completed because ${validationError}`,
      },
      warnings,
    };
  }

  // Step 8: Surface any warnings from the engine.
  if (allRecs.currentOutcome && Array.isArray(allRecs.currentOutcome.warnings)) {
    warnings.push(...allRecs.currentOutcome.warnings);
  }

  return {
    success: true,
    product: calculatedProduct,
    warnings,
  };
}

// ============================================================
// Batch Helper
// ============================================================

export function safelyRecalculateProducts(
  rawProducts: unknown[],
  businessSettings: BusinessSettings,
  pricingRules: PricingRule[]
): BatchCalculationResult {
  const successfulProducts: Product[] = [];
  const failedProducts: Product[] = [];
  const issues: BatchCalculationResult['issues'] = [];

  if (!Array.isArray(rawProducts)) {
    return { successfulProducts, failedProducts, issues };
  }

  for (let i = 0; i < rawProducts.length; i++) {
    const raw = rawProducts[i];
    // Each product is processed in its own try/catch — one thrown
    // error must not abort the batch.
    try {
      const result = safelyRecalculateProduct(raw, businessSettings, pricingRules);
      if (result.success) {
        successfulProducts.push(result.product);
      } else {
        failedProducts.push(result.product);
        issues.push({
          productId: result.product.id,
          sku: result.product.sku,
          name: result.product.name,
          code: result.error.code,
          message: result.error.message,
          field: result.error.field,
        });
      }
    } catch (err) {
      // Last-resort safety net — even our safe wrapper threw.
      const message = err instanceof Error ? err.message : String(err);
      // Try to at least normalize the input so we have SOMETHING to show.
      try {
        const norm = normalizeProduct(raw, { source: 'storage', rowNumber: i + 1 });
        const fallback = makeSafeFallbackProduct(norm.product, `Unexpected exception: ${message}`);
        failedProducts.push(fallback);
        issues.push({
          productId: fallback.id,
          sku: fallback.sku,
          name: fallback.name,
          code: 'unexpected-exception',
          message: `Unexpected exception while calculating product: ${message}`,
        });
      } catch {
        // Total failure — skip this product entirely. We must not
        // crash the rest of the batch.
        issues.push({
          code: 'total-failure',
          message: `Product at index ${i} could not be processed at all: ${message}`,
        });
      }
    }
  }

  return { successfulProducts, failedProducts, issues };
}
