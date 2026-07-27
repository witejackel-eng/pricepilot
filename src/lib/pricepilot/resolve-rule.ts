/**
 * PricePilot - Pricing Policy Resolver
 *
 * Implements field-by-field resolution of pricing policies with
 * source tracing. Each field inherits from the highest-priority
 * rule that defines it.
 *
 * Priority order: Product > Brand > Category > Channel > Global
 *
 * Unlike the old resolveRuleForProduct() in calculations.ts which
 * returned a single "best match" PricingRule, this resolver merges
 * fields from multiple rules, allowing a global rule to set the
 * rounding rule while a category rule sets the target margin, etc.
 */

import {
  Product,
  BusinessSettings,
  PricingRule,
  RoundingRule,
  ResolvedPricingPolicy,
} from './types';

// ============================================================
// Helpers
// ============================================================

/**
 * Determine the specificity score of a rule level.
 * Higher score = higher priority.
 */
function levelScore(level: string): number {
  switch (level) {
    case 'product': return 4;
    case 'brand': return 3;
    case 'category': return 2;
    case 'channel': return 1;
    case 'global': return 0;
    default: return 0;
  }
}

/**
 * Check if a rule matches a product at its declared level.
 */
function ruleMatchesProduct(rule: PricingRule, product: Product): boolean {
  if (!rule.isActive) return false;

  switch (rule.level) {
    case 'product':
      return rule.targetProductId === product.id || rule.targetProductSku === product.sku;
    case 'brand':
      return rule.targetBrand === product.brand;
    case 'category':
      return rule.targetCategory === product.category;
    case 'channel':
      return rule.targetChannel === product.salesChannel;
    case 'global':
      return true; // Global rules match all products
    default:
      return false;
  }
}

/**
 * Create a source label for a rule, used in source tracing.
 */
function ruleSourceLabel(rule: PricingRule): string {
  switch (rule.level) {
    case 'product':
      return `Product Rule: ${rule.name} (id=${rule.id}, sku=${rule.targetProductSku ?? rule.targetProductId ?? ''})`;
    case 'brand':
      return `Brand Rule: ${rule.name} (brand=${rule.targetBrand ?? ''})`;
    case 'category':
      return `Category Rule: ${rule.name} (category=${rule.targetCategory ?? ''})`;
    case 'channel':
      return `Channel Rule: ${rule.name} (channel=${rule.targetChannel ?? ''})`;
    case 'global':
      return `Global Rule: ${rule.name}`;
    default:
      return `Rule: ${rule.name}`;
  }
}

// ============================================================
// Field-by-Field Resolution
// ============================================================

/**
 * Resolvable fields for the pricing policy.
 * Each field is resolved independently from the highest-priority
 * rule that provides a meaningful value.
 *
 * We consider a value "defined" if it is:
 * - For numeric fields: > 0 (or explicitly set, even if 0 for some)
 * - For string/enum fields: not empty/undefined
 */
interface ResolvableFields {
  targetMarginPercent: number;
  minimumMarginPercent: number;
  premiumMarginPercent: number;
  minimumProfitPerUnit: number;
  roundingRule: RoundingRule;
}

/**
 * Determine whether a numeric value is "defined" for resolution purposes.
 * For margin targets, 0 IS defined (the user may want 0% minimum margin).
 * But for minimumProfitPerUnit, we consider it defined if >= 0 (even 0 is intentional).
 */
function isNumericDefined(value: number | undefined): boolean {
  return value !== undefined && value !== null && !isNaN(value);
}

// ============================================================
// Main Resolver
// ============================================================

/**
 * Resolve the effective pricing policy for a product by merging
 * fields from matching rules in priority order, with full source tracing.
 *
 * Priority order: Product > Brand > Category > Channel > Global > BusinessSettings defaults
 *
 * Each field inherits from the highest-priority source that defines it.
 * Returns a ResolvedPricingPolicy with sourceTrace showing which rule
 * (or business settings default) provided each value.
 *
 * @param product - The product to resolve the policy for
 * @param rules - All pricing rules to consider
 * @param businessSettings - Business settings providing defaults
 * @returns ResolvedPricingPolicy with merged values and source trace
 */
export function resolveEffectivePricingPolicy(
  product: Product,
  rules: PricingRule[],
  businessSettings: BusinessSettings
): ResolvedPricingPolicy {
  // Filter rules that match this product
  const matchingRules = rules
    .filter(r => ruleMatchesProduct(r, product))
    .sort((a, b) => {
      // Sort by specificity first (descending), then by priority within level (descending)
      const levelDiff = levelScore(b.level) - levelScore(a.level);
      if (levelDiff !== 0) return levelDiff;
      return b.priority - a.priority;
    });

  const sourceTrace: Record<string, { value: number | string; source: string }> = {};

  // --- targetMarginPercent ---
  const targetMarginRule = matchingRules.find(r => isNumericDefined(r.targetMarginPercent));
  if (targetMarginRule) {
    sourceTrace['targetMarginPercent'] = {
      value: targetMarginRule.targetMarginPercent,
      source: ruleSourceLabel(targetMarginRule),
    };
  } else {
    sourceTrace['targetMarginPercent'] = {
      value: businessSettings.defaultTargetMarginPercent,
      source: 'Business Settings (defaultTargetMarginPercent)',
    };
  }

  // --- minimumMarginPercent ---
  const minimumMarginRule = matchingRules.find(r => isNumericDefined(r.minimumMarginPercent));
  if (minimumMarginRule) {
    sourceTrace['minimumMarginPercent'] = {
      value: minimumMarginRule.minimumMarginPercent,
      source: ruleSourceLabel(minimumMarginRule),
    };
  } else {
    sourceTrace['minimumMarginPercent'] = {
      value: businessSettings.defaultMinimumMarginPercent,
      source: 'Business Settings (defaultMinimumMarginPercent)',
    };
  }

  // --- premiumMarginPercent ---
  // Uses maximumMarginPercent from PricingRule as the "premium" target
  const premiumMarginRule = matchingRules.find(r => isNumericDefined(r.maximumMarginPercent));
  if (premiumMarginRule) {
    sourceTrace['premiumMarginPercent'] = {
      value: premiumMarginRule.maximumMarginPercent,
      source: ruleSourceLabel(premiumMarginRule),
    };
  } else {
    sourceTrace['premiumMarginPercent'] = {
      value: businessSettings.defaultMaximumMarginPercent,
      source: 'Business Settings (defaultMaximumMarginPercent)',
    };
  }

  // --- minimumProfitPerUnit ---
  // Not in PricingRule yet, so comes from businessSettings
  // (Future: may be added to PricingRule)
  sourceTrace['minimumProfitPerUnit'] = {
    value: businessSettings.minimumProfitPerUnit,
    source: 'Business Settings (minimumProfitPerUnit)',
  };

  // --- roundingRule ---
  const roundingRule = matchingRules.find(r => r.roundingRule && r.roundingRule !== 'custom' || r.roundingRule === 'custom');
  // Any active rule will have a roundingRule; use the highest priority one
  const roundingSourceRule = matchingRules.find(r => r.roundingRule !== undefined);
  if (roundingSourceRule) {
    sourceTrace['roundingRule'] = {
      value: roundingSourceRule.roundingRule,
      source: ruleSourceLabel(roundingSourceRule),
    };
  } else {
    sourceTrace['roundingRule'] = {
      value: businessSettings.defaultRoundingRule,
      source: 'Business Settings (defaultRoundingRule)',
    };
  }

  // Build the resolved policy
  const resolvedPolicy: ResolvedPricingPolicy = {
    targetMarginPercent: sourceTrace['targetMarginPercent'].value as number,
    minimumMarginPercent: sourceTrace['minimumMarginPercent'].value as number,
    premiumMarginPercent: sourceTrace['premiumMarginPercent'].value as number,
    minimumProfitPerUnit: sourceTrace['minimumProfitPerUnit'].value as number,
    roundingRule: sourceTrace['roundingRule'].value as RoundingRule,
    sourceTrace,
  };

  return resolvedPolicy;
}
