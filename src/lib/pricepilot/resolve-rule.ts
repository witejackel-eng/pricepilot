/**
 * PricePilot - Pricing Policy Resolver
 *
 * THE SINGLE AUTHORITY for resolving effective pricing policy values.
 * Each field is resolved independently from the highest-priority source:
 * Product > Brand > Category > Channel > Global > BusinessSettings defaults
 *
 * Higher-specificity rules override only the fields they define.
 * A product-level rule that sets a target margin must not erase a
 * category-level rounding rule or global marketplace fee.
 *
 * sourceTrace is for explanation and auditability only.
 * Components must read final values directly from ResolvedPricingPolicy.
 *
 * CRITICAL: Uses resolveNumber() pattern instead of safeNonNegative() ?? fallback,
 * because safeNonNegative(undefined) returns zero, preventing the fallback.
 */

import {
  Product,
  BusinessSettings,
  PricingRule,
  RoundingRule,
  TaxTreatment,
  CompetitorStrategy,
  FeeBasePolicy,
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

/**
 * Resolve a numeric field using the correct precedence:
 * 1. Rule override (if defined and finite)
 * 2. Product value (if defined and finite)
 * 3. Business settings default
 *
 * CRITICAL: We check for undefined/null BEFORE applying Math.max(0, ...).
 * This prevents undefined from becoming 0 and blocking the fallback.
 */
function resolveNumber(
  override: unknown,
  productValue: unknown,
  defaultValue: number,
): number {
  if (typeof override === 'number' && Number.isFinite(override)) {
    return Math.max(0, override);
  }
  if (typeof productValue === 'number' && Number.isFinite(productValue)) {
    return Math.max(0, productValue);
  }
  return Math.max(0, defaultValue);
}

/**
 * Resolve a numeric field from rules only (no product override),
 * then fall back to business settings default.
 * Used for fields that are policy-level (tax rates, fees) rather than product-level.
 */
function resolvePolicyNumber(
  ruleOverride: unknown,
  defaultValue: number,
): number {
  if (typeof ruleOverride === 'number' && Number.isFinite(ruleOverride)) {
    return Math.max(0, ruleOverride);
  }
  return Math.max(0, defaultValue);
}

/**
 * Find the highest-priority matching rule that provides a numeric override.
 */
function findNumericOverride(
  matchingRules: PricingRule[],
  fieldExtractor: (rule: PricingRule) => number | undefined,
): { value: number; source: string } | null {
  for (const rule of matchingRules) {
    const val = fieldExtractor(rule);
    if (typeof val === 'number' && Number.isFinite(val)) {
      return { value: Math.max(0, val), source: ruleSourceLabel(rule) };
    }
  }
  return null;
}

/**
 * Find the highest-priority matching rule that provides a string/object override.
 */
function findStringOverride(
  matchingRules: PricingRule[],
  fieldExtractor: (rule: PricingRule) => string | undefined | null,
): { value: string; source: string } | null {
  for (const rule of matchingRules) {
    const val = fieldExtractor(rule);
    if (val !== undefined && val !== null && val !== '') {
      return { value: val, source: ruleSourceLabel(rule) };
    }
  }
  return null;
}

function findObjectOverride<T>(
  matchingRules: PricingRule[],
  fieldExtractor: (rule: PricingRule) => T | undefined,
): { value: T; source: string } | null {
  for (const rule of matchingRules) {
    const val = fieldExtractor(rule);
    if (val !== undefined && val !== null) {
      return { value: val, source: ruleSourceLabel(rule) };
    }
  }
  return null;
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
 */
export function resolveEffectivePricingPolicy(
  product: Product,
  rules: PricingRule[],
  businessSettings: BusinessSettings,
): ResolvedPricingPolicy {
  // Filter rules that match this product, sorted by specificity
  const matchingRules = rules
    .filter(r => ruleMatchesProduct(r, product))
    .sort((a, b) => {
      const levelDiff = levelScore(b.level) - levelScore(a.level);
      if (levelDiff !== 0) return levelDiff;
      return b.priority - a.priority;
    });

  const sourceTrace: Record<string, { value: number | string | object; source: string }> = {};

  // --- Margin Targets ---
  // These can be overridden by rules
  const targetMarginOverride = findNumericOverride(matchingRules, r => r.targetMarginPercent);
  sourceTrace['targetMarginPercent'] = targetMarginOverride
    ? { value: targetMarginOverride.value, source: targetMarginOverride.source }
    : { value: businessSettings.defaultTargetMarginPercent, source: 'Business Settings (defaultTargetMarginPercent)' };

  const minimumMarginOverride = findNumericOverride(matchingRules, r => r.minimumMarginPercent);
  sourceTrace['minimumMarginPercent'] = minimumMarginOverride
    ? { value: minimumMarginOverride.value, source: minimumMarginOverride.source }
    : { value: businessSettings.defaultMinimumMarginPercent, source: 'Business Settings (defaultMinimumMarginPercent)' };

  const premiumMarginOverride = findNumericOverride(matchingRules, r => r.maximumMarginPercent);
  sourceTrace['premiumMarginPercent'] = premiumMarginOverride
    ? { value: premiumMarginOverride.value, source: premiumMarginOverride.source }
    : { value: businessSettings.defaultMaximumMarginPercent, source: 'Business Settings (defaultMaximumMarginPercent)' };

  const minimumProfitOverride = findNumericOverride(matchingRules, r => r.overrideMinimumProfitPerUnit);
  sourceTrace['minimumProfitPerUnit'] = minimumProfitOverride
    ? { value: minimumProfitOverride.value, source: minimumProfitOverride.source }
    : { value: businessSettings.minimumProfitPerUnit, source: 'Business Settings (minimumProfitPerUnit)' };

  // --- Tax ---
  // Rule override > product value > business settings default
  const taxRateOverride = findNumericOverride(matchingRules, r => r.overrideTaxRatePercent);
  const taxRateValue = resolveNumber(
    taxRateOverride?.value,
    product.taxRatePercent,
    businessSettings.defaultTaxRatePercent,
  );
  sourceTrace['taxRatePercent'] = taxRateOverride
    ? { value: taxRateOverride.value, source: taxRateOverride.source }
    : (typeof product.taxRatePercent === 'number' && Number.isFinite(product.taxRatePercent) && product.taxRatePercent > 0)
      ? { value: product.taxRatePercent, source: `Product: ${product.name}` }
      : { value: businessSettings.defaultTaxRatePercent, source: 'Business Settings (defaultTaxRatePercent)' };

  const taxTreatmentOverride = findStringOverride(matchingRules, r => r.overrideTaxTreatment);
  sourceTrace['taxTreatment'] = taxTreatmentOverride
    ? { value: taxTreatmentOverride.value, source: taxTreatmentOverride.source }
    : (product.taxTreatment && product.taxTreatment !== 'inclusive') // Only use product if explicitly set to non-default
      ? { value: product.taxTreatment, source: `Product: ${product.name}` }
      : { value: businessSettings.taxTreatment, source: 'Business Settings (taxTreatment)' };

  // --- Marketplace Fees ---
  const mktFeePercentOverride = findNumericOverride(matchingRules, r => r.overrideMarketplaceFeePercent);
  const mktFeePercentValue = resolveNumber(
    mktFeePercentOverride?.value,
    product.marketplaceFeePercent,
    businessSettings.defaultMarketplaceFeePercent,
  );
  sourceTrace['marketplaceFeePercent'] = mktFeePercentOverride
    ? { value: mktFeePercentOverride.value, source: mktFeePercentOverride.source }
    : (typeof product.marketplaceFeePercent === 'number' && Number.isFinite(product.marketplaceFeePercent) && product.marketplaceFeePercent > 0)
      ? { value: product.marketplaceFeePercent, source: `Product: ${product.name}` }
      : { value: businessSettings.defaultMarketplaceFeePercent, source: 'Business Settings (defaultMarketplaceFeePercent)' };

  const mktFeeFixedOverride = findNumericOverride(matchingRules, r => r.overrideMarketplaceFeeFixed);
  const mktFeeFixedValue = resolveNumber(
    mktFeeFixedOverride?.value,
    product.marketplaceFeeFixed,
    businessSettings.defaultMarketplaceFeeFixed,
  );
  sourceTrace['marketplaceFeeFixed'] = mktFeeFixedOverride
    ? { value: mktFeeFixedOverride.value, source: mktFeeFixedOverride.source }
    : (typeof product.marketplaceFeeFixed === 'number' && Number.isFinite(product.marketplaceFeeFixed) && product.marketplaceFeeFixed > 0)
      ? { value: product.marketplaceFeeFixed, source: `Product: ${product.name}` }
      : { value: businessSettings.defaultMarketplaceFeeFixed, source: 'Business Settings (defaultMarketplaceFeeFixed)' };

  // --- Payment Fees ---
  const payFeePercentOverride = findNumericOverride(matchingRules, r => r.overridePaymentFeePercent);
  const payFeePercentValue = resolveNumber(
    payFeePercentOverride?.value,
    product.paymentFeePercent,
    businessSettings.defaultPaymentFeePercent,
  );
  sourceTrace['paymentFeePercent'] = payFeePercentOverride
    ? { value: payFeePercentOverride.value, source: payFeePercentOverride.source }
    : (typeof product.paymentFeePercent === 'number' && Number.isFinite(product.paymentFeePercent) && product.paymentFeePercent > 0)
      ? { value: product.paymentFeePercent, source: `Product: ${product.name}` }
      : { value: businessSettings.defaultPaymentFeePercent, source: 'Business Settings (defaultPaymentFeePercent)' };

  const payFeeFixedOverride = findNumericOverride(matchingRules, r => r.overridePaymentFeeFixed);
  const payFeeFixedValue = resolveNumber(
    payFeeFixedOverride?.value,
    product.paymentFeeFixed,
    businessSettings.defaultPaymentFeeFixed,
  );
  sourceTrace['paymentFeeFixed'] = payFeeFixedOverride
    ? { value: payFeeFixedOverride.value, source: payFeeFixedOverride.source }
    : (typeof product.paymentFeeFixed === 'number' && Number.isFinite(product.paymentFeeFixed) && product.paymentFeeFixed > 0)
      ? { value: product.paymentFeeFixed, source: `Product: ${product.name}` }
      : { value: businessSettings.defaultPaymentFeeFixed, source: 'Business Settings (defaultPaymentFeeFixed)' };

  // --- Other Fees ---
  const otherFeesPercentOverride = findNumericOverride(matchingRules, r => r.overrideOtherFeesPercent);
  const otherFeesPercentValue = resolveNumber(
    otherFeesPercentOverride?.value,
    product.otherFeesPercent,
    businessSettings.defaultOtherFeesPercent,
  );
  sourceTrace['otherFeesPercent'] = otherFeesPercentOverride
    ? { value: otherFeesPercentOverride.value, source: otherFeesPercentOverride.source }
    : (typeof product.otherFeesPercent === 'number' && Number.isFinite(product.otherFeesPercent) && product.otherFeesPercent > 0)
      ? { value: product.otherFeesPercent, source: `Product: ${product.name}` }
      : { value: businessSettings.defaultOtherFeesPercent, source: 'Business Settings (defaultOtherFeesPercent)' };

  const otherFeesFixedOverride = findNumericOverride(matchingRules, r => r.overrideOtherFeesFixed);
  const otherFeesFixedValue = resolveNumber(
    otherFeesFixedOverride?.value,
    product.otherFeesFixed,
    businessSettings.defaultOtherFeesFixed,
  );
  sourceTrace['otherFeesFixed'] = otherFeesFixedOverride
    ? { value: otherFeesFixedOverride.value, source: otherFeesFixedOverride.source }
    : (typeof product.otherFeesFixed === 'number' && Number.isFinite(product.otherFeesFixed) && product.otherFeesFixed > 0)
      ? { value: product.otherFeesFixed, source: `Product: ${product.name}` }
      : { value: businessSettings.defaultOtherFeesFixed, source: 'Business Settings (defaultOtherFeesFixed)' };

  // --- Competitor Strategy ---
  const competitorOverride = findObjectOverride<CompetitorStrategy>(matchingRules, r => r.overrideCompetitorStrategy);
  sourceTrace['competitorStrategy'] = competitorOverride
    ? { value: competitorOverride.value, source: competitorOverride.source }
    : { value: matchingRules.length > 0 ? matchingRules[0].competitorStrategy : businessSettings.defaultTargetMarginPercent, source: matchingRules.length > 0 ? ruleSourceLabel(matchingRules[0]) : 'Business Settings' };
  const competitorStrategy: CompetitorStrategy = competitorOverride?.value ?? (matchingRules.length > 0 ? matchingRules[0].competitorStrategy : { mode: 'match-average', weightPercent: 30 });

  // --- Rounding ---
  const roundingOverride = findStringOverride(matchingRules, r => r.roundingRule);
  sourceTrace['roundingRule'] = roundingOverride
    ? { value: roundingOverride.value, source: roundingOverride.source }
    : { value: businessSettings.defaultRoundingRule, source: 'Business Settings (defaultRoundingRule)' };
  const roundingRule = (roundingOverride?.value ?? businessSettings.defaultRoundingRule) as RoundingRule;

  const customRoundingOverride = findNumericOverride(matchingRules, r => r.overrideCustomRoundingValue ?? r.customRoundingValue);
  sourceTrace['customRoundingValue'] = customRoundingOverride
    ? { value: customRoundingOverride.value, source: customRoundingOverride.source }
    : businessSettings.customRoundingValue
      ? { value: businessSettings.customRoundingValue, source: 'Business Settings (customRoundingValue)' }
      : { value: 0, source: 'Default (0)' };

  // --- Fee Base Policy ---
  const feeBaseOverride = findStringOverride(matchingRules, r => r.overrideFeeBasePolicy);
  sourceTrace['feeBasePolicy'] = feeBaseOverride
    ? { value: feeBaseOverride.value, source: feeBaseOverride.source }
    : (product.feeBasePolicy && product.feeBasePolicy !== 'product-price-only')
      ? { value: product.feeBasePolicy, source: `Product: ${product.name}` }
      : { value: businessSettings.feeBasePolicy, source: 'Business Settings (feeBasePolicy)' };
  const feeBasePolicy = (feeBaseOverride?.value ?? product.feeBasePolicy ?? businessSettings.feeBasePolicy) as FeeBasePolicy;

  // --- Input Tax Recovery ---
  const inputTaxRecoverablePercent = resolveNumber(
    undefined, // No rule override for this yet
    product.inputTaxRecoverablePercent,
    businessSettings.defaultInputTaxRecoverablePercent,
  );
  sourceTrace['inputTaxRecoverablePercent'] = (typeof product.inputTaxRecoverablePercent === 'number' && Number.isFinite(product.inputTaxRecoverablePercent))
    ? { value: product.inputTaxRecoverablePercent, source: `Product: ${product.name}` }
    : { value: businessSettings.defaultInputTaxRecoverablePercent, source: 'Business Settings (defaultInputTaxRecoverablePercent)' };

  // Build the resolved policy with ALL final values
  const resolvedPolicy: ResolvedPricingPolicy = {
    // Margin targets
    targetMarginPercent: sourceTrace['targetMarginPercent'].value as number,
    minimumMarginPercent: sourceTrace['minimumMarginPercent'].value as number,
    premiumMarginPercent: sourceTrace['premiumMarginPercent'].value as number,
    minimumProfitPerUnit: sourceTrace['minimumProfitPerUnit'].value as number,
    
    // Tax
    taxRatePercent: taxRateValue,
    taxTreatment: sourceTrace['taxTreatment'].value as TaxTreatment,
    
    // Marketplace fees
    marketplaceFeePercent: mktFeePercentValue,
    marketplaceFeeFixed: mktFeeFixedValue,
    
    // Payment fees
    paymentFeePercent: payFeePercentValue,
    paymentFeeFixed: payFeeFixedValue,
    
    // Other fees
    otherFeesPercent: otherFeesPercentValue,
    otherFeesFixed: otherFeesFixedValue,
    
    // Competitor strategy
    competitorStrategy,
    
    // Rounding
    roundingRule,
    customRoundingValue: customRoundingOverride?.value ?? businessSettings.customRoundingValue,
    
    // Fee base policy
    feeBasePolicy,
    
    // Purchase-side tax
    inputTaxRecoverablePercent,
    
    // Source trace
    sourceTrace,
  };

  return resolvedPolicy;
}
