/**
 * PricePilot - Recommendation Engine (Phase 3)
 *
 * Rebuilt recommendation system that uses ONLY the canonical
 * `calculateOutcomeAtPrice` function from pricing-engine.ts.
 *
 * Implements five recommendation modes:
 * 1. Break-even (lowest price where net profit = 0)
 * 2. Minimum Safe (lowest price satisfying ALL minimums)
 * 3. Competitive (competitor-aligned, never violating safe price)
 * 4. Balanced (weighted blend of profitability, competitor, existing)
 * 5. Premium (high margin, never below target margin)
 *
 * Also implements:
 * - applyRoundingAndRevalidate (round + revalidate through engine)
 * - calculateAllRecommendations (full recommendation set)
 */

import {
  Product,
  BusinessSettings,
  ResolvedPricingPolicy,
  PriceOutcome,
  PricingConfidence,
  PricingStatus,
  ProfitabilityMeter,
  RoundingRule,
  CompetitorStrategy,
  PricingRule,
} from './types';
import {
  calculateOutcomeAtPrice,
  percentageToDecimal,
} from './pricing-engine';
import { resolveEffectivePricingPolicy } from './resolve-rule';
import { roundTo2Decimals, roundTo4Decimals } from './formatting';

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Safe number: return value or fallback if undefined/NaN.
 */
function safeNumber(value: number | undefined | null, fallback: number): number {
  if (value === undefined || value === null || typeof value !== 'number' || isNaN(value)) return fallback;
  return value;
}

/**
 * Safe non-negative: return 0 for NaN/undefined/negative.
 */
function safeNonNegative(value: number | undefined | null): number {
  if (value === undefined || value === null || typeof value !== 'number' || isNaN(value) || value < 0) return 0;
  return value;
}

/**
 * Safely add two numbers with 4-decimal precision.
 */
function safeAdd(a: number, b: number): number {
  return roundTo4Decimals(a + b);
}

/**
 * Safely subtract two numbers.
 */
function safeSub(a: number, b: number): number {
  return roundTo4Decimals(a - b);
}

/**
 * Safely multiply two numbers.
 */
function safeMul(a: number, b: number): number {
  return roundTo4Decimals(a * b);
}

/**
 * Safely divide two numbers. Returns 0 if divisor is near-zero.
 */
function safeDiv(dividend: number, divisor: number): number {
  if (Math.abs(divisor) < 0.00005) return 0;
  return roundTo4Decimals(dividend / divisor);
}

/**
 * Safely sum an array of numbers.
 */
function safeSum(values: number[]): number {
  return values.reduce((acc, v) => safeAdd(acc, v), 0);
}

/**
 * Clamp value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if purchase cost is available and non-zero.
 * A product with no purchase cost receives no trusted recommendation.
 */
function hasPurchaseCost(product: Product): boolean {
  return product.purchaseCost !== undefined &&
    product.purchaseCost !== null &&
    typeof product.purchaseCost === 'number' &&
    !isNaN(product.purchaseCost) &&
    product.purchaseCost > 0;
}

// ============================================================
// Rounding Logic (self-contained in recommendations.ts)
// ============================================================

/**
 * Apply a rounding rule to a price.
 */
function applyRoundingRuleInternal(
  price: number,
  roundingRule: RoundingRule,
  customValue?: number
): number {
  if (price <= 0) return price;

  switch (roundingRule) {
    case 'no-rounding':
      return roundTo2Decimals(price);
    case 'nearest-whole':
      return Math.round(price);
    case 'nearest-5':
      return Math.round(price / 5) * 5;
    case 'nearest-10':
      return Math.round(price / 10) * 10;
    case 'end-in-99':
      return Math.floor(price) + 0.99;
    case 'end-in-95':
      return Math.floor(price) + 0.95;
    case 'end-in-9':
      return Math.floor(price) + 0.9;
    case 'end-in-49':
      return Math.floor(price) + 0.49;
    case 'end-in-99-whole': {
      const candidateDown = Math.floor(price / 100) * 100 + 99;
      const candidateUp = Math.ceil(price / 100) * 100 - 1;
      if (candidateDown >= 99 && Math.abs(candidateDown - price) <= Math.abs(candidateUp - price)) {
        return candidateDown;
      }
      return candidateUp >= 99 ? candidateUp : 99;
    }
    case 'custom': {
      const custom = safeNumber(customValue, 1);
      if (custom <= 0) return roundTo2Decimals(price);
      return Math.round(price / custom) * custom;
    }
    default:
      return roundTo2Decimals(price);
  }
}

/**
 * Get the increment step for a rounding rule (used for upward revalidation).
 */
function getRoundingStep(roundingRule: RoundingRule, customValue?: number): number {
  switch (roundingRule) {
    case 'nearest-whole': return 1;
    case 'nearest-5': return 5;
    case 'nearest-10': return 10;
    case 'end-in-99': return 1;
    case 'end-in-95': return 1;
    case 'end-in-9': return 1;
    case 'end-in-49': return 1;
    case 'end-in-99-whole': return 1;
    case 'custom': {
      const step = safeNumber(customValue, 1);
      return step > 0 ? step : 1;
    }
    default: return 1;
  }
}

// ============================================================
// 1. Break-Even Price
// ============================================================

/**
 * Calculate the break-even price — the lowest price where net profit = 0.
 *
 * Must include: landed cost, expected returns, expected damage, fixed fees,
 * percentage fees, tax treatment, non-recoverable tax, other selling costs.
 *
 * Formula: breakEvenPrice = (totalLandedCost + fixedFees) / (1 - totalPercentageFees)
 *
 * For tax-inclusive: the result is the customer-payable amount (includes tax).
 * For tax-exclusive: the result is the base selling price (tax added on top).
 * If totalPercentageFees >= 1, return an impossible state indicator.
 */
export function calculateBreakEvenPrice(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy
): number {
  // If purchase cost is missing, no trusted break-even
  if (!hasPurchaseCost(product)) {
    return 0;
  }

  // Use calculateOutcomeAtPrice at price 0 to extract base costs
  const zeroOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: 0,
    businessSettings,
    effectiveRule,
  });

  const totalLandedCost = zeroOutcome.totalLandedCost;
  const fixedFees = safeSum([
    zeroOutcome.marketplaceFixedFee,
    zeroOutcome.paymentFixedFee,
    zeroOutcome.otherFixedFees,
  ]);

  // Compute total percentage fees as a decimal fraction
  const totalPercentageFeesDecimal = computeTotalPercentageFeesDecimal(
    product, businessSettings, effectiveRule
  );

  const denominator = safeSub(1, totalPercentageFeesDecimal);

  if (denominator <= 0) {
    // Impossible state — fees exceed 100% of revenue
    return 99999999;
  }

  const numerator = safeAdd(totalLandedCost, fixedFees);
  return roundTo2Decimals(safeDiv(numerator, denominator));
}

// ============================================================
// 2. Minimum Safe Price
// ============================================================

/**
 * Calculate the minimum safe price — the lowest price satisfying ALL configured minimums:
 *
 * 1. Net profit is positive
 * 2. Minimum margin is achieved
 * 3. Minimum profit per unit is achieved (from effectiveRule.minimumProfitPerUnit)
 * 4. Price is above pure break-even
 *
 * Iterate upward from break-even until all constraints are met.
 * Use small increments (1 unit of currency) and validate each candidate
 * through calculateOutcomeAtPrice.
 */
export function calculateMinimumSafePrice(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy
): number {
  // If purchase cost is missing, no trusted recommendation
  if (!hasPurchaseCost(product)) {
    return 0;
  }

  const minMargin = effectiveRule.minimumMarginPercent;
  const minimumProfit = effectiveRule.minimumProfitPerUnit ?? businessSettings.minimumProfitPerUnit ?? 0;

  // First, compute an algebraic estimate to avoid excessive iteration
  const zeroOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: 0,
    businessSettings,
    effectiveRule,
  });

  const totalLandedCost = zeroOutcome.totalLandedCost;
  const fixedFees = safeSum([
    zeroOutcome.marketplaceFixedFee,
    zeroOutcome.paymentFixedFee,
    zeroOutcome.otherFixedFees,
  ]);

  const totalPercentageFeesDecimal = computeTotalPercentageFeesDecimal(
    product, businessSettings, effectiveRule
  );
  const minMarginDecimal = percentageToDecimal(minMargin);

  // --- Algebraic estimate for minimum margin ---
  const marginDenominator = safeSub(1, safeAdd(totalPercentageFeesDecimal, minMarginDecimal));
  let algebraicEstimate: number;

  if (marginDenominator <= 0) {
    // Impossible state
    return 99999999;
  }

  algebraicEstimate = roundTo2Decimals(
    safeDiv(safeAdd(totalLandedCost, fixedFees), marginDenominator)
  );

  // Also account for tax treatment in the algebraic estimate for min profit
  const taxTreatment = product.taxTreatment ?? businessSettings.taxTreatment;
  const taxRatePercent = safeNumber(product.taxRatePercent, businessSettings.defaultTaxRatePercent);
  const taxDecimal = percentageToDecimal(taxRatePercent);

  let priceForMinProfit: number;

  if (taxTreatment === 'inclusive' || taxTreatment === 'composite') {
    const revenueFactor = safeSub(safeDiv(1, safeAdd(1, taxDecimal)), totalPercentageFeesDecimal);
    if (revenueFactor <= 0) {
      priceForMinProfit = 99999999;
    } else {
      priceForMinProfit = roundTo2Decimals(
        safeDiv(safeAdd(totalLandedCost, safeAdd(fixedFees, minimumProfit)), revenueFactor)
      );
    }
  } else {
    // tax-exclusive, exempt, reverse
    const exclDenominator = safeSub(1, totalPercentageFeesDecimal);
    if (exclDenominator <= 0) {
      priceForMinProfit = 99999999;
    } else {
      priceForMinProfit = roundTo2Decimals(
        safeDiv(safeAdd(totalLandedCost, safeAdd(fixedFees, minimumProfit)), exclDenominator)
      );
    }
  }

  // Start from the best algebraic estimate, then validate
  const candidateStart = Math.max(algebraicEstimate, priceForMinProfit);

  // Validate the algebraic estimate through calculateOutcomeAtPrice
  const startOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: candidateStart,
    businessSettings,
    effectiveRule,
  });

  if (
    startOutcome.isProfitable &&
    startOutcome.satisfiesMinimumMargin &&
    startOutcome.satisfiesMinimumProfit
  ) {
    return roundTo2Decimals(candidateStart);
  }

  // Iterate upward in small increments until all constraints are met
  const increment = 1; // 1 unit of currency
  const maxIterations = 10000;
  let candidate = candidateStart;

  for (let i = 0; i < maxIterations; i++) {
    candidate = roundTo2Decimals(safeAdd(candidate, increment));

    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: candidate,
      businessSettings,
      effectiveRule,
    });

    if (
      outcome.isProfitable &&
      outcome.satisfiesMinimumMargin &&
      outcome.satisfiesMinimumProfit
    ) {
      return roundTo2Decimals(candidate);
    }
  }

  // If we couldn't find a valid price within maxIterations, return impossible
  return 99999999;
}

// ============================================================
// 3. Competitive Price
// ============================================================

/**
 * Calculate a competitive price using competitor information while NEVER
 * violating the safe price.
 *
 * Supported strategies:
 * - match-lowest: use the lowest competitor price
 * - match-average: use the average competitor price
 * - match-highest: use the highest competitor price
 * - below-average-by-%: use average minus offsetPercent
 * - above-average-by-%: use average plus offsetPercent
 *
 * If competitor price is below the safe price:
 * - Never recommend competitor price as safe
 * - Return safe price instead with a market-conflict warning
 * - Warning: "Market pricing is below your minimum profitable price."
 */
export function calculateCompetitivePrice(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy,
  competitorStrategy: CompetitorStrategy
): number {
  // If purchase cost is missing, no trusted recommendation
  if (!hasPurchaseCost(product)) {
    return 0;
  }

  const minimumSafe = calculateMinimumSafePrice(product, businessSettings, effectiveRule);
  const roundingRule = effectiveRule.roundingRule;

  const competitorPrices = product.competitorPrices ?? [];
  const validCompetitorPrices = competitorPrices.filter(cp => cp.price > 0);

  if (validCompetitorPrices.length === 0 || competitorStrategy.mode === 'ignore') {
    // No competitor data or strategy is 'ignore' — fall back to balanced price
    const balanced = calculateBalancedPrice(product, businessSettings, effectiveRule, competitorStrategy);
    return balanced;
  }

  // Compute competitor reference price based on strategy
  let competitorTarget: number;

  const prices = validCompetitorPrices.map(cp => cp.price);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const average = roundTo2Decimals(safeDiv(prices.reduce((sum, p) => safeAdd(sum, p), 0), prices.length));

  switch (competitorStrategy.mode) {
    case 'match-lowest':
      competitorTarget = lowest;
      break;
    case 'match-average':
      competitorTarget = average;
      break;
    case 'match-highest':
      competitorTarget = highest;
      break;
    case 'below-average': {
      const offset = competitorStrategy.offsetPercent ?? 5;
      competitorTarget = roundTo2Decimals(safeMul(average, safeSub(1, percentageToDecimal(offset))));
      break;
    }
    case 'above-average': {
      const offset = competitorStrategy.offsetPercent ?? 5;
      competitorTarget = roundTo2Decimals(safeMul(average, safeAdd(1, percentageToDecimal(offset))));
      break;
    }
    case 'custom-offset': {
      const percentOffset = competitorStrategy.offsetPercent ?? 0;
      const fixedOffset = competitorStrategy.offsetFixed ?? 0;
      competitorTarget = roundTo2Decimals(safeAdd(safeMul(average, safeAdd(1, percentageToDecimal(percentOffset))), fixedOffset));
      break;
    }
    default:
      competitorTarget = average;
  }

  // NEVER violate the minimum safe price
  let competitivePrice = Math.max(competitorTarget, minimumSafe);

  // If competitor price is below safe price, we add a market-conflict warning
  // (The warning is captured in the PriceOutcome from calculateOutcomeAtPrice)
  if (competitorTarget < minimumSafe) {
    // Market pricing is below minimum profitable price
    // Return minimumSafe, the conflict will be visible in the outcome
    competitivePrice = minimumSafe;
  }

  // Apply rounding and revalidate
  return applyRoundingAndRevalidate(
    competitivePrice, roundingRule, product, businessSettings, effectiveRule
  );
}

// ============================================================
// 4. Balanced Price
// ============================================================

/**
 * Calculate a balanced price considering:
 * - Target margin (profitability weight)
 * - Competitor data (competitor weight)
 * - Existing price stability (existing-price weight)
 *
 * Default weights: profitability 60%, competitor 25%, existing 15%
 * Never below minimum safe price.
 *
 * The weighted blend:
 *   profitabilityPrice = price that achieves target margin
 *   competitorPrice = competitor-aligned price
 *   existingPrice = current selling price (stability)
 *
 *   balancedPrice = (profitabilityWeight * profitabilityPrice +
 *                    competitorWeight * competitorPrice +
 *                    existingWeight * existingPrice) / 100
 *
 * Subject to: balancedPrice >= minimumSafePrice
 */
export function calculateBalancedPrice(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy,
  competitorStrategy?: CompetitorStrategy
): number {
  // If purchase cost is missing, no trusted recommendation
  if (!hasPurchaseCost(product)) {
    return 0;
  }

  const minimumSafe = calculateMinimumSafePrice(product, businessSettings, effectiveRule);
  const roundingRule = effectiveRule.roundingRule;

  // Weights (configurable, default 60/25/15)
  const profitabilityWeight = competitorStrategy?.weightPercent != null
    ? clamp(100 - competitorStrategy.weightPercent - 15, 0, 100) // Deduct competitor weight, assume 15% for existing
    : 60;
  const competitorWeight = competitorStrategy?.weightPercent ?? 25;
  const existingWeight = clamp(100 - profitabilityWeight - competitorWeight, 0, 100);

  // --- Profitability price: price that achieves target margin ---
  const profitabilityPrice = computePriceForMargin(
    product, businessSettings, effectiveRule, effectiveRule.targetMarginPercent
  );

  // --- Competitor price ---
  const defaultStrategy: CompetitorStrategy = competitorStrategy ?? { mode: 'match-average', weightPercent: 25 };
  const competitorPrice = computeCompetitorReferencePrice(product, defaultStrategy);

  // --- Existing price (current selling price) ---
  const existingPrice = safeNumber(product.currentSellingPrice, 0);

  // --- Weighted blend ---
  // If any component is 0 or missing, redistribute weights
  let adjustedProfitWeight = profitabilityWeight;
  let adjustedCompetitorWeight = competitorWeight;
  let adjustedExistingWeight = existingWeight;
  let totalWeight = 0;

  // Only count weights for components that have valid values
  if (profitabilityPrice > 0) totalWeight += adjustedProfitWeight;
  if (competitorPrice > 0) totalWeight += adjustedCompetitorWeight;
  if (existingPrice > 0) totalWeight += adjustedExistingWeight;

  // If all components are 0, fall back to profitability estimate
  if (totalWeight === 0) {
    const rawPrice = Math.max(profitabilityPrice, minimumSafe);
    return applyRoundingAndRevalidate(
      rawPrice, roundingRule, product, businessSettings, effectiveRule
    );
  }

  // Normalize weights to the available components
  const normProfit = profitabilityPrice > 0 ? adjustedProfitWeight : 0;
  const normCompetitor = competitorPrice > 0 ? adjustedCompetitorWeight : 0;
  const normExisting = existingPrice > 0 ? adjustedExistingWeight : 0;
  const normTotal = normProfit + normCompetitor + normExisting;

  const blendedPrice = roundTo2Decimals(
    safeDiv(
      safeAdd(
        safeMul(normProfit, profitabilityPrice),
        safeAdd(
          safeMul(normCompetitor, competitorPrice),
          safeMul(normExisting, existingPrice)
        )
      ),
      normTotal
    )
  );

  // Never below minimum safe price
  const finalPrice = Math.max(blendedPrice, minimumSafe);

  // Apply rounding and revalidate
  return applyRoundingAndRevalidate(
    finalPrice, roundingRule, product, businessSettings, effectiveRule
  );
}

// ============================================================
// 5. Premium Price
// ============================================================

/**
 * Calculate a premium price considering:
 * - Premium target margin
 * - Competitor highest price
 * - Brand positioning
 * - Maximum market price
 *
 * Never presented as automatically superior.
 * Must satisfy at minimum: target margin (not just premium).
 * Never below minimum safe price.
 */
export function calculatePremiumPrice(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy,
  competitorStrategy?: CompetitorStrategy
): number {
  // If purchase cost is missing, no trusted recommendation
  if (!hasPurchaseCost(product)) {
    return 0;
  }

  const minimumSafe = calculateMinimumSafePrice(product, businessSettings, effectiveRule);
  const roundingRule = effectiveRule.roundingRule;

  // Premium price must at minimum satisfy the TARGET margin, not just premium
  const targetMarginPrice = computePriceForMargin(
    product, businessSettings, effectiveRule, effectiveRule.targetMarginPercent
  );

  // Premium margin price (higher margin target)
  const premiumMarginPrice = computePriceForMargin(
    product, businessSettings, effectiveRule, effectiveRule.premiumMarginPercent
  );

  // Competitor highest price (aspirational ceiling)
  const competitorPrices = product.competitorPrices ?? [];
  const validCompetitorPrices = competitorPrices.filter(cp => cp.price > 0);
  const competitorHighest = validCompetitorPrices.length > 0
    ? Math.max(...validCompetitorPrices.map(cp => cp.price))
    : 0;

  // Premium price = max of target margin price, premium margin price
  // Consider competitor highest as an aspirational reference
  let premiumPrice = Math.max(
    targetMarginPrice,  // Must satisfy target margin at minimum
    premiumMarginPrice, // Try to achieve premium margin
    minimumSafe         // Never below minimum safe
  );

  // If competitor highest is available and higher than our premium,
  // we can consider it but cap it (don't just match the highest market price blindly)
  if (competitorHighest > premiumPrice) {
    // Take a blend: 70% our premium margin price + 30% competitor highest
    // This avoids blindly following market while acknowledging positioning
    premiumPrice = roundTo2Decimals(
      safeDiv(
        safeAdd(
          safeMul(70, premiumMarginPrice > 0 ? premiumMarginPrice : targetMarginPrice),
          safeMul(30, competitorHighest)
        ),
        100
      )
    );
  }

  // Ensure it never goes below minimum safe
  premiumPrice = Math.max(premiumPrice, minimumSafe);

  // Apply rounding and revalidate
  return applyRoundingAndRevalidate(
    premiumPrice, roundingRule, product, businessSettings, effectiveRule
  );
}

// ============================================================
// Rounding & Revalidation
// ============================================================

/**
 * Apply rounding rule to raw price, then REVALIDATE through calculateOutcomeAtPrice.
 *
 * If the rounded price doesn't satisfy minimums (minimum margin, minimum profit,
 * profitability), increment upward to the next valid rounded price.
 * Re-calculate until safe.
 *
 * This is critical because rounding down (e.g., nearest-5 of 103 → 100)
 * can reduce margin below the minimum threshold.
 */
export function applyRoundingAndRevalidate(
  rawPrice: number,
  roundingRule: RoundingRule,
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy,
  customRoundingValue?: number,
  maxIterations: number = 100
): number {
  if (rawPrice <= 0) return rawPrice;
  if (roundingRule === 'no-rounding') return roundTo2Decimals(rawPrice);

  // Apply the rounding rule
  let roundedPrice = applyRoundingRuleInternal(rawPrice, roundingRule, customRoundingValue);

  // Revalidate through calculateOutcomeAtPrice
  const outcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: roundedPrice,
    businessSettings,
    effectiveRule,
  });

  if (outcome.satisfiesMinimumMargin && outcome.satisfiesMinimumProfit && outcome.isProfitable) {
    return roundTo2Decimals(roundedPrice);
  }

  // Rounded price is unsafe — increment upward until constraints are met
  const roundingStep = getRoundingStep(roundingRule, customRoundingValue);

  for (let i = 0; i < maxIterations; i++) {
    roundedPrice = roundTo2Decimals(safeAdd(roundedPrice, roundingStep));

    const revalidatedOutcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: roundedPrice,
      businessSettings,
      effectiveRule,
    });

    if (revalidatedOutcome.satisfiesMinimumMargin && revalidatedOutcome.satisfiesMinimumProfit && revalidatedOutcome.isProfitable) {
      return roundTo2Decimals(roundedPrice);
    }
  }

  // Fallback: return unrounded price if we couldn't find a valid rounded price
  return roundTo2Decimals(rawPrice);
}

// ============================================================
// Full Recommendation Calculation
// ============================================================

/**
 * All recommendations for a product, including the PriceOutcome for each
 * recommendation level and the current selling price outcome.
 */
export interface AllRecommendations {
  breakEven: number;
  minimumSafe: number;
  competitive: number;
  balanced: number;
  premium: number;
  outcomes: {
    breakEven: PriceOutcome;
    minimumSafe: PriceOutcome;
    competitive: PriceOutcome;
    balanced: PriceOutcome;
    premium: PriceOutcome;
  };
  currentOutcome: PriceOutcome;
  isImpossible: boolean;
  impossibleReason?: string;
  confidence: PricingConfidence;
}

/**
 * Calculate all recommendations for a product using the canonical engine.
 *
 * Steps:
 * 1. Resolve effective pricing policy from rules and business settings
 * 2. Calculate each recommendation level
 * 3. Validate each through calculateOutcomeAtPrice
 * 4. Return full AllRecommendations with outcomes and confidence
 */
export function calculateAllRecommendations(
  product: Product,
  businessSettings: BusinessSettings,
  rules: PricingRule[],
  competitorStrategy?: CompetitorStrategy
): AllRecommendations {
  // Step 1: Resolve effective pricing policy
  const effectiveRule = resolveEffectivePricingPolicy(product, rules, businessSettings);

  // Step 2: Determine competitor strategy
  const strategy: CompetitorStrategy = competitorStrategy ?? {
    mode: 'match-average',
    weightPercent: 25,
  };

  // Step 3: Calculate each recommendation level
  const breakEvenPrice = calculateBreakEvenPrice(product, businessSettings, effectiveRule);
  const minimumSafePrice = calculateMinimumSafePrice(product, businessSettings, effectiveRule);
  const competitivePrice = calculateCompetitivePrice(product, businessSettings, effectiveRule, strategy);
  const balancedPrice = calculateBalancedPrice(product, businessSettings, effectiveRule, strategy);
  const premiumPrice = calculatePremiumPrice(product, businessSettings, effectiveRule, strategy);

  // Step 4: Validate each through calculateOutcomeAtPrice
  const breakEvenOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: breakEvenPrice,
    businessSettings,
    effectiveRule,
  });
  const minimumSafeOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: minimumSafePrice,
    businessSettings,
    effectiveRule,
  });
  const competitiveOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: competitivePrice,
    businessSettings,
    effectiveRule,
  });
  const balancedOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: balancedPrice,
    businessSettings,
    effectiveRule,
  });
  const premiumOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: premiumPrice,
    businessSettings,
    effectiveRule,
  });

  // Step 5: Current selling price outcome
  const currentOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: product.currentSellingPrice,
    businessSettings,
    effectiveRule,
  });

  // Step 6: Check for impossible state
  const isImpossible = breakEvenPrice >= 99999999 || minimumSafePrice >= 99999999;
  let impossibleReason: string | undefined;

  if (!hasPurchaseCost(product)) {
    impossibleReason = 'Purchase cost is missing or zero. No trusted recommendation possible.';
  } else if (isImpossible) {
    impossibleReason = 'Percentage fees and margin requirements exceed 100% of revenue. No profitable price exists.';
  }

  // Step 7: Determine overall confidence (use the worst confidence among outcomes)
  const allConfidences: PricingConfidence[] = [
    breakEvenOutcome.confidence,
    minimumSafeOutcome.confidence,
    competitiveOutcome.confidence,
    balancedOutcome.confidence,
    premiumOutcome.confidence,
    currentOutcome.confidence,
  ];

  // 'low' overrides everything, 'medium' overrides 'high'
  let overallConfidence: PricingConfidence = 'high';
  if (allConfidences.includes('low')) {
    overallConfidence = 'low';
  } else if (allConfidences.includes('medium')) {
    overallConfidence = 'medium';
  }

  // If impossible, confidence is always low
  if (isImpossible) {
    overallConfidence = 'low';
  }

  return {
    breakEven: breakEvenPrice,
    minimumSafe: minimumSafePrice,
    competitive: competitivePrice,
    balanced: balancedPrice,
    premium: premiumPrice,
    outcomes: {
      breakEven: breakEvenOutcome,
      minimumSafe: minimumSafeOutcome,
      competitive: competitiveOutcome,
      balanced: balancedOutcome,
      premium: premiumOutcome,
    },
    currentOutcome,
    isImpossible,
    impossibleReason,
    confidence: overallConfidence,
  };
}

// ============================================================
// Internal: Price-for-Margin Calculator
// ============================================================

/**
 * Compute the price needed to achieve a specific margin target.
 * Uses calculateOutcomeAtPrice at price 0 to extract base costs,
 * then solves algebraically.
 *
 * For tax-inclusive:
 *   P = (totalLandedCost + fixedFees) /
 *       [ (1/(1+t)) * (1 - marginTarget) - totalPercentFees ]
 *
 * For tax-exclusive/exempt:
 *   P = (totalLandedCost + fixedFees) / (1 - totalPercentFees - marginTarget)
 */
function computePriceForMargin(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy,
  marginTargetPercent: number
): number {
  if (!hasPurchaseCost(product)) return 0;

  const zeroOutcome = calculateOutcomeAtPrice({
    product,
    sellingPrice: 0,
    businessSettings,
    effectiveRule,
  });

  const totalLandedCost = zeroOutcome.totalLandedCost;
  const fixedFees = safeSum([
    zeroOutcome.marketplaceFixedFee,
    zeroOutcome.paymentFixedFee,
    zeroOutcome.otherFixedFees,
  ]);

  const totalPercentageFeesDecimal = computeTotalPercentageFeesDecimal(
    product, businessSettings, effectiveRule
  );
  const marginDecimal = percentageToDecimal(marginTargetPercent);
  const taxTreatment = product.taxTreatment ?? businessSettings.taxTreatment;
  const taxRatePercent = safeNumber(product.taxRatePercent, businessSettings.defaultTaxRatePercent);
  const taxDecimal = percentageToDecimal(taxRatePercent);

  if (taxTreatment === 'inclusive' || taxTreatment === 'composite') {
    // Tax-inclusive: margin is on net revenue (price / (1+tax))
    // P * [ (1/(1+t)) * (1 - margin) - totalPercentFees ] = totalLandedCost + fixedFees
    const revenueFactor = safeSub(
      safeMul(safeDiv(1, safeAdd(1, taxDecimal)), safeSub(1, marginDecimal)),
      totalPercentageFeesDecimal
    );

    if (revenueFactor <= 0) {
      return 99999999;
    }

    return roundTo2Decimals(safeDiv(safeAdd(totalLandedCost, fixedFees), revenueFactor));
  } else {
    // Tax-exclusive/exempt/reverse: simpler formula
    const denominator = safeSub(1, safeAdd(totalPercentageFeesDecimal, marginDecimal));

    if (denominator <= 0) {
      return 99999999;
    }

    return roundTo2Decimals(safeDiv(safeAdd(totalLandedCost, fixedFees), denominator));
  }
}

// ============================================================
// Internal: Total Percentage Fees Decimal
// ============================================================

/**
 * Compute the total percentage fees as a decimal fraction.
 * Includes marketplace, payment, other percentage fees, and tax (if exclusive).
 *
 * All percentages are stored as whole numbers (18 = 18%).
 * Only divide by 100 when computing.
 */
function computeTotalPercentageFeesDecimal(
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy
): number {
  const marketplaceFeePercent = safeNonNegative(
    safeNumber(product.marketplaceFeePercent, businessSettings.defaultMarketplaceFeePercent)
  );
  const paymentFeePercent = safeNonNegative(
    safeNumber(product.paymentFeePercent, businessSettings.defaultPaymentFeePercent)
  );
  const otherFeesPercent = safeNonNegative(safeNumber(product.otherFeesPercent, 0));

  const taxRatePercent = safeNonNegative(
    safeNumber(product.taxRatePercent, businessSettings.defaultTaxRatePercent)
  );

  const taxTreatment = product.taxTreatment ?? businessSettings.taxTreatment;

  // Tax is a percentage fee ONLY for exclusive/reverse treatment
  const taxAsFeePercent = (taxTreatment === 'exclusive' || taxTreatment === 'reverse')
    ? taxRatePercent : 0;

  const totalPercent = clamp(
    safeSum([marketplaceFeePercent, paymentFeePercent, otherFeesPercent, taxAsFeePercent]),
    0, 100
  );

  return percentageToDecimal(totalPercent);
}

// ============================================================
// Internal: Competitor Reference Price
// ============================================================

/**
 * Compute the competitor reference price based on strategy.
 * Returns 0 if no competitor data or strategy is 'ignore'.
 */
function computeCompetitorReferencePrice(
  product: Product,
  strategy: CompetitorStrategy
): number {
  const competitorPrices = product.competitorPrices ?? [];
  const validPrices = competitorPrices.filter(cp => cp.price > 0);

  if (validPrices.length === 0 || strategy.mode === 'ignore') {
    return 0;
  }

  const prices = validPrices.map(cp => cp.price);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const average = roundTo2Decimals(safeDiv(prices.reduce((s, p) => safeAdd(s, p), 0), prices.length));

  switch (strategy.mode) {
    case 'match-lowest': return lowest;
    case 'match-average': return average;
    case 'match-highest': return highest;
    case 'below-average': {
      const offset = strategy.offsetPercent ?? 5;
      return roundTo2Decimals(safeMul(average, safeSub(1, percentageToDecimal(offset))));
    }
    case 'above-average': {
      const offset = strategy.offsetPercent ?? 5;
      return roundTo2Decimals(safeMul(average, safeAdd(1, percentageToDecimal(offset))));
    }
    case 'custom-offset': {
      const percentOffset = strategy.offsetPercent ?? 0;
      const fixedOffset = strategy.offsetFixed ?? 0;
      return roundTo2Decimals(safeAdd(safeMul(average, safeAdd(1, percentageToDecimal(percentOffset))), fixedOffset));
    }
    default: return average;
  }
}

// ============================================================
// Product Field Mapping
// ============================================================

/**
 * Derive PricingStatus from the current PriceOutcome and business settings.
 * Uses the same logic as the old calculations.ts but now sourced from
 * the canonical engine's PriceOutcome.
 */
function derivePricingStatus(
  outcome: PriceOutcome,
  product: Product,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy
): PricingStatus {
  const sellingPrice = outcome.enteredSellingPrice;

  // Missing data: no selling price or no purchase cost
  if (sellingPrice === 0 || outcome.purchaseCost === 0) {
    return 'missing-data';
  }

  // Loss-making: negative net profit
  if (outcome.netProfit < 0) {
    return 'loss-making';
  }

  // Below break-even: margin is <= 0
  if (outcome.effectiveMarginPercent <= 0) {
    return 'below-break-even';
  }

  // Low margin: below minimum margin
  if (!outcome.satisfiesMinimumMargin) {
    return 'low-margin';
  }

  // Check competitor pricing for above-market status
  const competitorPrices = product.competitorPrices ?? [];
  const validCompetitorPrices = competitorPrices.filter(cp => cp.price > 0);
  if (validCompetitorPrices.length > 0) {
    const competitorAvg = roundTo2Decimals(
      safeDiv(validCompetitorPrices.reduce((s, cp) => safeAdd(s, cp.price), 0), validCompetitorPrices.length)
    );
    if (competitorAvg > 0) {
      const percentAboveMarket = safeMul(safeDiv(safeSub(sellingPrice, competitorAvg), competitorAvg), 100);
      if (percentAboveMarket > businessSettings.aboveMarketThresholdPercent) {
        return 'above-market';
      }
    }
  }

  // High margin: above strong threshold
  if (outcome.effectiveMarginPercent >= businessSettings.strongMarginThresholdPercent) {
    return 'high-margin';
  }

  // Healthy: within healthy range
  if (
    outcome.effectiveMarginPercent >= businessSettings.healthyMarginMinPercent &&
    outcome.effectiveMarginPercent <= businessSettings.healthyMarginMaxPercent
  ) {
    return 'healthy';
  }

  // Fallback
  return 'healthy';
}

/**
 * Derive ProfitabilityMeter from the current PriceOutcome.
 */
function deriveProfitabilityMeter(
  outcome: PriceOutcome,
  businessSettings: BusinessSettings
): ProfitabilityMeter {
  const margin = outcome.effectiveMarginPercent;

  if (margin < 0) return 'loss';
  if (margin === 0) return 'break-even';
  if (margin < businessSettings.lowMarginThresholdPercent) return 'low-margin';
  if (margin >= businessSettings.strongMarginThresholdPercent) return 'strong-margin';
  return 'healthy';
}

/**
 * Map the AllRecommendations result onto the Product's calculated fields.
 *
 * This replaces the old calculateProduct() from calculations.ts with the
 * new canonical engine approach. All calculated fields are populated from
 * the current PriceOutcome, while recommendations come from AllRecommendations.
 *
 * Returns a Partial<Product> with all calculated fields set, suitable for
 * merging into an existing Product.
 */
export function mapRecommendationsToProduct(
  product: Product,
  allRecs: AllRecommendations,
  businessSettings: BusinessSettings,
  effectiveRule: ResolvedPricingPolicy
): Partial<Product> {
  const currentOutcome = allRecs.currentOutcome;

  // Derive status and meter from the current selling price outcome
  const pricingStatus = derivePricingStatus(currentOutcome, product, businessSettings, effectiveRule);
  const profitabilityMeter = deriveProfitabilityMeter(currentOutcome, businessSettings);

  // Compute total percentage fees as whole-number percent (for display)
  // The engine stores this as decimal; multiply by 100 for the Product field
  const totalPercentageFeesPercent = roundTo2Decimals(
    currentOutcome.marketplacePercentageFee +
    currentOutcome.paymentPercentageFee +
    currentOutcome.otherPercentageFees +
    // For tax-exclusive, output tax is also a percentage fee on selling price
    (product.taxTreatment === 'exclusive' || product.taxTreatment === 'reverse'
      ? currentOutcome.outputTax : 0)
  );

  return {
    ...product,
    // Calculated values from current selling price outcome
    calculatedBaseCost: roundTo2Decimals(currentOutcome.purchaseCost + currentOutcome.fixedProductCosts),
    calculatedExpectedReturnCost: roundTo2Decimals(currentOutcome.expectedReturnCost),
    calculatedExpectedDamageCost: roundTo2Decimals(currentOutcome.expectedDamageCost),
    calculatedTotalLandedCost: roundTo2Decimals(currentOutcome.totalLandedCost),
    calculatedBreakEvenPrice: roundTo2Decimals(allRecs.breakEven),
    calculatedMarkupPercent: roundTo2Decimals(currentOutcome.markupPercent),
    calculatedMarginPercent: roundTo2Decimals(currentOutcome.effectiveMarginPercent),
    calculatedProfitPerUnit: roundTo2Decimals(currentOutcome.netProfit),
    calculatedTotalPercentageFees: roundTo2Decimals(totalPercentageFeesPercent),
    calculatedTotalFixedFees: roundTo2Decimals(
      currentOutcome.marketplaceFixedFee +
      currentOutcome.paymentFixedFee +
      currentOutcome.otherFixedFees
    ),
    calculatedPricingStatus: pricingStatus,
    calculatedProfitabilityMeter: profitabilityMeter,
    // Store the full PriceOutcome so UI can use it directly
    calculatedPriceOutcome: currentOutcome,
    // Recommendations
    recommendedPrices: {
      breakEven: roundTo2Decimals(allRecs.breakEven),
      minimum: roundTo2Decimals(allRecs.minimumSafe),
      competitive: roundTo2Decimals(allRecs.competitive),
      balanced: roundTo2Decimals(allRecs.balanced),
      premium: roundTo2Decimals(allRecs.premium),
      confidence: allRecs.confidence,
    },
    updatedAt: new Date().toISOString(),
  };
}
