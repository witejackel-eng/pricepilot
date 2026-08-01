/**
 * PricePilot - Approval Invalidation
 *
 * Phase 10 (production-readiness): invalidate price approvals whenever
 * a financial dependency changes. Previously, editing a product's
 * purchase cost left any prior approval intact, which could lead the
 * owner to apply a stale approved price that no longer reflected the
 * current cost structure.
 *
 * Phase 8 (product-specific): only invalidate approvals when the
 * product's *effective* pricing inputs actually changed.  This avoids
 * blanket invalidation of every approved product when a rule or
 * setting that is irrelevant to most products changes.
 *
 * Algorithm:
 *   For each approved product:
 *   1. Resolve its effective pricing policy before the change
 *   2. Resolve its effective pricing policy after the change
 *   3. Compare only financially relevant dependencies
 *   4. Invalidate the approval only when its effective pricing inputs changed
 *
 * This module defines:
 *   - `FINANCIAL_DEPENDENCIES` — the complete list of product fields
 *     that affect a recommendation.
 *   - `invalidateApproval(product)` — returns a new product with the
 *     approval cleared and a `needs-review` lifecycle status.
 *   - `shouldInvalidateApproval(productBefore, productAfter)` — checks
 *     whether any financial field changed.
 *   - `invalidateIfStale(before, after)` — apply invalidation only
 *     when an approval exists AND a financial field changed.
 *   - `invalidateApprovalsForSettingsChange(products, oldSettings, newSettings, rules)`
 *     — product-specific invalidation when business settings change.
 *   - `invalidateApprovalsForRulesChange(products, oldRules, newRules, businessSettings)`
 *     — product-specific invalidation when pricing rules change.
 */

import {
  Product,
  BusinessSettings,
  PricingRule,
  LifecycleStatus,
  RoundingRule,
  TaxTreatment,
  FeeBasePolicy,
} from './types';
import { resolveEffectivePricingPolicy } from './resolve-rule';
import { safeNumberValue } from './formatting';

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
  'otherFeesPercent',
  'otherFeesFixed',
  'taxRatePercent',
  'taxTreatment',
  'purchaseTaxRatePercent',
  'purchaseCostTaxMode',
  'inputTaxCreditRecoverable',
  'feeBasePolicy',
  'currentSellingPrice',
] as const;

/**
 * Business settings fields that affect the recommendation engine. If
 * any of these change, products whose effective inputs depend on the
 * default must have their approval invalidated.
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
// Effective Pricing Inputs
// ============================================================

/**
 * Snapshot of all financially relevant inputs for a product.
 * Used to compare the effective inputs before and after a change.
 */
interface EffectivePricingInputs {
  // From ResolvedPricingPolicy (source trace values — accurate)
  targetMarginPercent: number;
  minimumMarginPercent: number;
  premiumMarginPercent: number;
  minimumProfitPerUnit: number;
  taxRatePercent: number;
  taxTreatment: TaxTreatment;
  marketplaceFeePercent: number;
  marketplaceFeeFixed: number;
  paymentFeePercent: number;
  paymentFeeFixed: number;
  otherFeesPercent: number;
  otherFeesFixed: number;
  feeBasePolicy: FeeBasePolicy;
  roundingRule: RoundingRule;
  customRoundingValue: number;
  inputTaxRecoverablePercent: number;
  competitorStrategy: string; // JSON-stringified for comparison

  // Effective cost fields (product value with settings default fallback)
  effectiveShippingCost: number;
  effectivePackagingCost: number;
  effectiveHandlingCost: number;
  effectiveOtherCosts: number;
  effectiveReturnRatePercent: number;
  effectiveDamageRatePercent: number;
}

/**
 * Extract a snapshot of all financially relevant pricing inputs for a
 * product, resolved against the given rules and business settings.
 *
 * Uses the sourceTrace values from resolveEffectivePricingPolicy,
 * which correctly handle the "0 means use default" convention for
 * tax/fee fields.
 */
export function extractEffectivePricingInputs(
  product: Product,
  rules: PricingRule[],
  businessSettings: BusinessSettings,
): EffectivePricingInputs {
  const policy = resolveEffectivePricingPolicy(product, rules, businessSettings);
  const st = policy.sourceTrace;

  return {
    // From resolved policy (source trace values)
    targetMarginPercent: st['targetMarginPercent']?.value as number ?? policy.targetMarginPercent,
    minimumMarginPercent: st['minimumMarginPercent']?.value as number ?? policy.minimumMarginPercent,
    premiumMarginPercent: st['premiumMarginPercent']?.value as number ?? policy.premiumMarginPercent,
    minimumProfitPerUnit: st['minimumProfitPerUnit']?.value as number ?? policy.minimumProfitPerUnit,
    taxRatePercent: st['taxRatePercent']?.value as number ?? policy.taxRatePercent,
    taxTreatment: (st['taxTreatment']?.value as TaxTreatment) ?? policy.taxTreatment,
    marketplaceFeePercent: st['marketplaceFeePercent']?.value as number ?? policy.marketplaceFeePercent,
    marketplaceFeeFixed: st['marketplaceFeeFixed']?.value as number ?? policy.marketplaceFeeFixed,
    paymentFeePercent: st['paymentFeePercent']?.value as number ?? policy.paymentFeePercent,
    paymentFeeFixed: st['paymentFeeFixed']?.value as number ?? policy.paymentFeeFixed,
    otherFeesPercent: st['otherFeesPercent']?.value as number ?? policy.otherFeesPercent,
    otherFeesFixed: st['otherFeesFixed']?.value as number ?? policy.otherFeesFixed,
    feeBasePolicy: (st['feeBasePolicy']?.value as FeeBasePolicy) ?? policy.feeBasePolicy,
    roundingRule: (st['roundingRule']?.value as RoundingRule) ?? policy.roundingRule,
    customRoundingValue: (st['customRoundingValue']?.value as number) ?? policy.customRoundingValue ?? 0,
    inputTaxRecoverablePercent: st['inputTaxRecoverablePercent']?.value as number ?? policy.inputTaxRecoverablePercent,
    competitorStrategy: JSON.stringify(st['competitorStrategy']?.value ?? policy.competitorStrategy),

    // Effective cost fields (product value with settings default fallback)
    effectiveShippingCost: safeNumberValue(product.shippingCost, businessSettings.defaultShippingCost),
    effectivePackagingCost: safeNumberValue(product.packagingCost, businessSettings.defaultPackagingCost),
    effectiveHandlingCost: safeNumberValue(product.handlingCost, businessSettings.defaultHandlingCost),
    effectiveOtherCosts: safeNumberValue(product.otherCosts, businessSettings.defaultOtherCosts),
    effectiveReturnRatePercent: safeNumberValue(product.returnRatePercent, businessSettings.defaultReturnRatePercent),
    effectiveDamageRatePercent: safeNumberValue(product.damageRatePercent, businessSettings.defaultDamageRatePercent),
  };
}

/**
 * Compare two effective pricing inputs snapshots and return true if
 * any financially relevant field changed. Uses epsilon comparison for
 * numbers and strict equality for strings.
 */
export function haveEffectivePricingInputsChanged(
  before: EffectivePricingInputs,
  after: EffectivePricingInputs,
): boolean {
  const keys = Object.keys(before) as (keyof EffectivePricingInputs)[];
  for (const key of keys) {
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
 * Product-specific invalidation when business settings change.
 *
 * For each approved product, resolves its effective pricing inputs
 * before and after the change, and only invalidates the approval if
 * the effective inputs changed. This avoids blanket invalidation of
 * every approved product when a setting that is irrelevant (e.g.
 * overridden by a product-specific rule) changes.
 *
 * Returns a new array — does not mutate the input.
 */
export function invalidateApprovalsForSettingsChange(
  products: Product[],
  oldSettings: BusinessSettings,
  newSettings: BusinessSettings,
  rules: PricingRule[],
): Product[] {
  return products.map(p => {
    // Only check products with an active approval
    if (p.priceApprovalStatus === 'none' || !p.finalApprovedPrice) {
      return p;
    }
    const before = extractEffectivePricingInputs(p, rules, oldSettings);
    const after = extractEffectivePricingInputs(p, rules, newSettings);
    if (haveEffectivePricingInputsChanged(before, after)) {
      return invalidateApproval(p);
    }
    return p;
  });
}

/**
 * Product-specific invalidation when pricing rules change.
 *
 * For each approved product, resolves its effective pricing inputs
 * before and after the rule change, and only invalidates the approval
 * if the effective inputs changed. This means:
 *   - A category rule change only invalidates products in that category
 *   - A channel rule change only invalidates products in that channel
 *   - A global rule change only invalidates products not shielded by
 *     a higher-priority rule
 *   - A product-specific rule change only invalidates the target product
 *
 * Returns a new array — does not mutate the input.
 */
export function invalidateApprovalsForRulesChange(
  products: Product[],
  oldRules: PricingRule[],
  newRules: PricingRule[],
  businessSettings: BusinessSettings,
): Product[] {
  return products.map(p => {
    // Only check products with an active approval
    if (p.priceApprovalStatus === 'none' || !p.finalApprovedPrice) {
      return p;
    }
    const before = extractEffectivePricingInputs(p, oldRules, businessSettings);
    const after = extractEffectivePricingInputs(p, newRules, businessSettings);
    if (haveEffectivePricingInputsChanged(before, after)) {
      return invalidateApproval(p);
    }
    return p;
  });
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
