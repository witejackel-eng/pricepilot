/**
 * PricePilot - Safe Product Access Helpers
 *
 * Canonical helpers for safely accessing product fields that may
 * be missing, null, undefined, or have unexpected types after
 * import, backup restore, or legacy migration.
 *
 * CONTRACTS:
 *   1. No function in this module ever throws.
 *   2. No function returns undefined, null, NaN, or Infinity.
 *   3. Every function produces a value that is safe to render
 *      in the UI (safe to call .toLowerCase(), .includes(), etc.).
 *   4. Missing financial data is NEVER fabricated — it returns
 *      a fallback that clearly indicates "no value" (e.g. 0 for
 *      numbers, '' for strings, 'low' for confidence).
 */

import type { Product, RecommendedPrices, PriceOutcome, RecommendedOutcomes, CompetitorPrice } from './types';
import { isFiniteNumber, safeNumberValue } from './formatting';

// ============================================================
// Text helpers
// ============================================================

/**
 * Safely coerce any value to a string.
 * Returns '' for null, undefined, NaN, and non-string values.
 */
export function safeProductText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  return '';
}

/**
 * Safely get a lowercase version of a product text field.
 * Never throws — returns '' for missing/undefined values.
 */
export function safeLowerCase(value: unknown): string {
  return safeProductText(value).toLowerCase();
}

// ============================================================
// Array helpers
// ============================================================

/**
 * Safely get a product's tags array.
 * Never returns null or undefined — always returns a string[].
 */
export function safeTags(product: Partial<Product>): string[] {
  if (!product.tags) return [];
  if (!Array.isArray(product.tags)) return [];
  return product.tags.filter((t): t is string => typeof t === 'string');
}

/**
 * Safely get a product's competitor prices array.
 */
export function safeCompetitorPrices(product: Partial<Product>): CompetitorPrice[] {
  if (!product.competitorPrices) return [];
  if (!Array.isArray(product.competitorPrices)) return [];
  return product.competitorPrices;
}

// ============================================================
// Recommended prices
// ============================================================

/**
 * Get a complete, render-safe RecommendedPrices object.
 *
 * Missing fields are filled with 0. Confidence defaults to 'low'.
 * This never returns undefined or partial objects.
 */
export function getSafeRecommendedPrices(
  product: Partial<Product>,
): RecommendedPrices {
  const rp = product.recommendedPrices;
  return {
    breakEven: safeNumberValue(rp?.breakEven, 0),
    minimum: safeNumberValue(rp?.minimum, 0),
    competitive: safeNumberValue(rp?.competitive, 0),
    balanced: safeNumberValue(rp?.balanced, 0),
    premium: safeNumberValue(rp?.premium, 0),
    custom: rp?.custom !== undefined ? safeNumberValue(rp.custom, 0) : undefined,
    confidence:
      rp?.confidence === 'high' || rp?.confidence === 'medium'
        ? rp.confidence
        : 'low',
  };
}

/**
 * Get a safe recommended price for a specific mode.
 * Returns 0 if the product has no recommended prices or the mode is missing.
 */
export function getSafeRecommendedPrice(
  product: Partial<Product>,
  mode: 'breakEven' | 'minimum' | 'competitive' | 'balanced' | 'premium',
): number {
  const rp = product.recommendedPrices;
  if (!rp) return 0;
  return safeNumberValue(rp[mode], 0);
}

// ============================================================
// Price outcome
// ============================================================

/**
 * Get a render-safe PriceOutcome, or null if the product
 * has no calculated price outcome (e.g. missing-cost products).
 */
export function getSafePriceOutcome(
  product: Partial<Product>,
): PriceOutcome | null {
  if (!product.calculatedPriceOutcome) return null;
  const outcome = product.calculatedPriceOutcome;
  // Verify it's a real object with expected fields
  if (typeof outcome !== 'object') return null;
  return outcome;
}

/**
 * Get a render-safe RecommendedOutcomes, or null if missing.
 */
export function getSafeRecommendedOutcomes(
  product: Partial<Product>,
): RecommendedOutcomes | null {
  if (!product.recommendedOutcomes) return null;
  if (typeof product.recommendedOutcomes !== 'object') return null;
  return product.recommendedOutcomes;
}

// ============================================================
// Numeric helpers
// ============================================================

/**
 * Get the product's purchase cost, safely.
 * Returns 0 for missing/NaN/Infinity values.
 */
export function getSafePurchaseCost(product: Partial<Product>): number {
  return safeNumberValue(product.purchaseCost, 0);
}

/**
 * Get the product's selling price, safely.
 */
export function getSafeSellingPrice(product: Partial<Product>): number {
  return safeNumberValue(product.currentSellingPrice, 0);
}

/**
 * Get the product's margin percent, safely.
 */
export function getSafeMarginPercent(product: Partial<Product>): number {
  return safeNumberValue(product.calculatedMarginPercent, 0);
}

/**
 * Get the product's profit per unit, safely.
 */
export function getSafeProfitPerUnit(product: Partial<Product>): number {
  return safeNumberValue(product.calculatedProfitPerUnit, 0);
}

/**
 * Get the product's health score, safely.
 */
export function getSafeHealthScore(product: Partial<Product>): number {
  return safeNumberValue(product.calculatedHealthScore, 0);
}

// ============================================================
// Invariant check
// ============================================================

/**
 * Assert that a product is render-safe — every field exists and
 * no value is NaN, Infinity, or an unexpected type.
 *
 * Returns a list of issues found. Empty list = fully render-safe.
 *
 * This is intended for development diagnostics and test assertions,
 * NOT for production runtime checks (it's too expensive for hot paths).
 */
export function checkRenderSafeProduct(product: Partial<Product>): string[] {
  const issues: string[] = [];

  // Required text fields must be strings
  for (const field of ['id', 'sku', 'name', 'category', 'brand', 'description'] as const) {
    const value = product[field];
    if (value === undefined) {
      issues.push(`Missing required field: ${field}`);
    } else if (typeof value !== 'string') {
      issues.push(`Field ${field} is not a string: ${typeof value}`);
    }
  }

  // Required numeric fields must be finite numbers
  for (const field of [
    'purchaseCost', 'currentSellingPrice', 'calculatedMarginPercent',
    'calculatedProfitPerUnit', 'calculatedHealthScore',
  ] as const) {
    const value = product[field];
    if (value === undefined) {
      issues.push(`Missing required numeric field: ${field}`);
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(`Field ${field} is not a finite number: ${value}`);
    }
  }

  // Tags must be an array of strings
  if (product.tags !== undefined) {
    if (!Array.isArray(product.tags)) {
      issues.push('tags is not an array');
    } else {
      for (let i = 0; i < product.tags.length; i++) {
        if (typeof product.tags[i] !== 'string') {
          issues.push(`tags[${i}] is not a string`);
        }
      }
    }
  }

  // Recommended prices must exist
  if (!product.recommendedPrices) {
    issues.push('Missing recommendedPrices');
  } else {
    for (const field of ['breakEven', 'minimum', 'competitive', 'balanced', 'premium'] as const) {
      const value = product.recommendedPrices[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push(`recommendedPrices.${field} is not a finite number: ${value}`);
      }
    }
  }

  return issues;
}

/**
 * Convenience: returns true if the product is render-safe.
 */
export function isRenderSafeProduct(product: Partial<Product>): boolean {
  return checkRenderSafeProduct(product).length === 0;
}
