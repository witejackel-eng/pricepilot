/**
 * PricePilot - Approval Invalidation
 *
 * Phase 10 (production-readiness): invalidate price approvals whenever
 * a financial dependency changes. Previously, editing a product's
 * purchase cost left any prior approval intact, which could lead the
 * owner to apply a stale approved price that no longer reflected the
 * current cost structure.
 *
 * This module defines:
 *   - `FINANCIAL_DEPENDENCIES` — the complete list of product fields
 *     that affect a recommendation.
 *   - `invalidateApproval(product)` — returns a new product with the
 *     approval cleared and a `needs-review` lifecycle status.
 *   `shouldInvalidateApproval(productBefore, productAfter)` — checks
 *     whether any financial field changed.
 *   - `invalidateApprovalsForSettingsChange(products, oldSettings, newSettings)`
 *     — bulk invalidation when business settings change.
 *   - `invalidateApprovalsForRulesChange(products, oldRules, newRules)`
 *     — bulk invalidation when pricing rules change.
 */

import { Product, BusinessSettings, PricingRule, LifecycleStatus } from './types';

// ============================================================
// Constants
// ============================================================

/**
 * Every product field that affects the recommendation engine. If ANY
 * of these change on a product, any prior approval is stale and must
 * be invalidated.
 */
export const FINANCIAL_DEPENDENCIES = [
  'purchaseCost',
  'shippingCost',
  'packagingCost',
  'handlingCost',
  'otherCosts',
  'returnRatePercent',
  'damageRatePercent',
  'marketplaceFeePercent',
  'marketplaceFeeFixed',
  'paymentFeePercent',
  'paymentFeeFixed',
  'taxRatePercent',
  'taxTreatment',
  'purchaseTaxRatePercent',
  'purchaseCostTaxMode',
  'inputTaxCreditRecoverable',
  'currentSellingPrice',
] as const;

/**
 * Business settings fields that affect the recommendation engine. If
 * any of these change, every product's approval must be invalidated.
 */
export const SETTINGS_FINANCIAL_DEPENDENCIES = [
  'defaultTaxRatePercent',
  'defaultMarketplaceFeePercent',
  'defaultMarketplaceFeeFixed',
  'defaultPaymentFeePercent',
  'defaultPaymentFeeFixed',
  'defaultShippingCost',
  'defaultPackagingCost',
  'defaultHandlingCost',
  'defaultOtherCosts',
  'defaultReturnRatePercent',
  'defaultDamageRatePercent',
  'defaultTargetMarginPercent',
  'defaultMinimumMarginPercent',
  'defaultMinimumProfitPerUnit',
  'defaultRoundingRule',
  'taxTreatment',
  'feeBasePolicy',
  'currencyCode',
] as const;

// ============================================================
// Helpers
// ============================================================

/**
 * Returns a new product with the approval cleared and a `needs-review`
 * lifecycle status. The original product is not mutated.
 *
 * Cleared fields:
 *   - priceApprovalStatus: 'none'
 *   - finalApprovedPrice: 0
 *   - approvedAt: ''
 *   - isApproved: false
 *   - lifecycleStatus: 'needs-review'
 */
export function invalidateApproval(product: Product): Product {
  return {
    ...product,
    priceApprovalStatus: 'none',
    finalApprovedPrice: 0,
    approvedAt: '',
    isApproved: false,
    lifecycleStatus: 'needs-review' as LifecycleStatus,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Compare two products and return true if ANY financial dependency
 * field changed. Used by `updateProduct` and `bulkUpdateProducts` to
 * decide whether to invalidate the approval.
 */
export function shouldInvalidateApproval(
  before: Product,
  after: Product,
): boolean {
  for (const field of FINANCIAL_DEPENDENCIES) {
    const a = before[field];
    const b = after[field];
    if (typeof a === 'number' || typeof b === 'number') {
      // Use a small epsilon for floating-point comparison.
      if (Math.abs(Number(a) - Number(b)) > 1e-9) return true;
    } else if (a !== b) {
      return true;
    }
  }
  return false;
}

/**
 * Apply invalidation to a product ONLY if its approval is currently
 * set AND a financial field changed. Returns the (possibly new)
 * product. Does not mutate the input.
 */
export function invalidateIfStale(
  before: Product,
  after: Product,
): Product {
  // Only invalidate if there was an approval AND something changed.
  if (after.priceApprovalStatus === 'none' || !after.finalApprovedPrice) {
    return after; // nothing to invalidate
  }
  if (shouldInvalidateApproval(before, after)) {
    return invalidateApproval(after);
  }
  return after;
}

/**
 * Compare two business settings objects and return the list of
 * financial dependency fields that changed.
 */
export function getChangedSettingsFields(
  before: BusinessSettings,
  after: BusinessSettings,
): string[] {
  const changed: string[] = [];
  for (const field of SETTINGS_FINANCIAL_DEPENDENCIES) {
    const a = before[field];
    const b = after[field];
    if (typeof a === 'number' || typeof b === 'number') {
      if (Math.abs(Number(a) - Number(b)) > 1e-9) {
        changed.push(field);
      }
    } else if (a !== b) {
      changed.push(field);
    }
  }
  return changed;
}

/**
 * Invalidate the approval on EVERY product that currently has an
 * approval. Used after a business settings change — since settings
 * affect the recommendation engine, every approved price is suspect.
 *
 * Returns a new array — does not mutate the input.
 */
export function invalidateApprovalsForSettingsChange(
  products: Product[],
): Product[] {
  return products.map(p =>
    p.priceApprovalStatus === 'none' || !p.finalApprovedPrice
      ? p
      : invalidateApproval(p),
  );
}

/**
 * Invalidate the approval on every product that currently has an
 * approval AND whose effective pricing rule has changed.
 *
 * For simplicity (and because rule resolution is complex), this
 * invalidates EVERY approved product when ANY rule changes. A more
 * granular implementation would resolve each product's effective rule
 * before and after, and only invalidate those whose rule actually
 * changed. The granular approach is a future optimization.
 *
 * Returns a new array — does not mutate the input.
 */
export function invalidateApprovalsForRulesChange(
  products: Product[],
): Product[] {
  return products.map(p =>
    p.priceApprovalStatus === 'none' || !p.finalApprovedPrice
      ? p
      : invalidateApproval(p),
  );
}

/**
 * Check whether a pricing rule was substantively changed (not just
 * metadata like `updatedAt`). Used by `updatePricingRule` to decide
 * whether to invalidate approvals.
 */
export function didRuleChangeSubstantively(
  before: PricingRule,
  after: PricingRule,
): boolean {
  // Compare every field except `updatedAt`.
  const keys = Object.keys(before) as (keyof PricingRule)[];
  for (const key of keys) {
    if (key === 'updatedAt') continue;
    const a = before[key];
    const b = after[key];
    if (typeof a === 'number' || typeof b === 'number') {
      if (Math.abs(Number(a) - Number(b)) > 1e-9) return true;
    } else if (a !== b) {
      return true;
    }
  }
  return false;
}
