/**
 * PricePilot — Pricing Health Score utility (v1.9)
 *
 * Single source of truth for the 0–100 pricing health score.
 * Previously the Pricing Health Gauge (v1.3) and the KPI Summary Strip
 * (v1.8) each computed their own score with different formulas, which
 * caused confusing inconsistencies (e.g. gauge showed 90/100 while the
 * KPI card showed 79/100 for the same catalog).
 *
 * The weighted blend is:
 *   - Profitability (40%): % of products with positive margin
 *   - Margin health (30%): average margin vs target
 *   - Coverage     (20%): % of products with complete cost data
 *   - Action rate  (10%): % of products approved
 *
 * Exported helpers:
 *   - computeHealthScore(products, targetMargin)  → full breakdown + total
 *   - getHealthScoreColor(score)                  → stroke / bg / text / label
 */

import { safeNumberValue } from './formatting';
import type { Product } from './types';

export interface HealthScoreBreakdown {
  profitability: number;
  marginHealth: number;
  coverage: number;
  actionRate: number;
  total: number;
}

/**
 * Compute the pricing health score breakdown for a list of products.
 * Returns all zeros when the product list is empty.
 */
export function computeHealthScore(
  products: Product[],
  targetMargin: number = 25,
): HealthScoreBreakdown {
  if (!products || products.length === 0) {
    return { profitability: 0, marginHealth: 0, coverage: 0, actionRate: 0, total: 0 };
  }

  const total = products.length;

  // 1. Profitability: % of products with positive margin
  const profitable = products.filter((p) => {
    const cost =
      safeNumberValue(p.calculatedTotalLandedCost, 0) ||
      (safeNumberValue(p.purchaseCost, 0) +
        safeNumberValue(p.shippingCost, 0) +
        safeNumberValue(p.packagingCost, 0) +
        safeNumberValue(p.handlingCost, 0) +
        safeNumberValue(p.otherCosts, 0));
    const price = safeNumberValue(p.currentSellingPrice, 0);
    return price > 0 && price > cost;
  }).length;
  const profitability = (profitable / total) * 100;

  // 2. Margin health: avg margin vs target margin
  const safeTarget = targetMargin > 0 ? targetMargin : 25;
  const avgMargin = products.reduce((sum, p) => {
    const cost =
      safeNumberValue(p.calculatedTotalLandedCost, 0) ||
      (safeNumberValue(p.purchaseCost, 0) +
        safeNumberValue(p.shippingCost, 0) +
        safeNumberValue(p.packagingCost, 0) +
        safeNumberValue(p.handlingCost, 0) +
        safeNumberValue(p.otherCosts, 0));
    const price = safeNumberValue(p.currentSellingPrice, 0);
    return sum + (price > 0 ? ((price - cost) / price) * 100 : 0);
  }, 0) / total;
  const marginHealth = Math.min(100, (avgMargin / safeTarget) * 100);

  // 3. Coverage: % with complete cost data (purchase cost > 0)
  const withCost = products.filter((p) => safeNumberValue(p.purchaseCost, 0) > 0).length;
  const coverage = (withCost / total) * 100;

  // 4. Action rate: % approved
  const acted = products.filter((p) => p.priceApprovalStatus === 'approved').length;
  const actionRate = (acted / total) * 100;

  // Weighted total
  const score = Math.round(
    profitability * 0.4 + marginHealth * 0.3 + coverage * 0.2 + actionRate * 0.1,
  );

  return {
    profitability: Math.round(profitability),
    marginHealth: Math.round(marginHealth),
    coverage: Math.round(coverage),
    actionRate: Math.round(actionRate),
    total: score,
  };
}

export interface HealthScoreColor {
  stroke: string;
  bg: string;
  text: string;
  label: string;
}

/**
 * Map a 0–100 score to a color palette and human-readable label.
 * Thresholds match the Pricing Health Gauge (v1.3) for visual consistency.
 */
export function getHealthScoreColor(score: number): HealthScoreColor {
  if (score >= 80) {
    return {
      stroke: '#10b981',
      bg: 'from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40',
      text: 'text-emerald-600 dark:text-emerald-400',
      label: 'Excellent',
    };
  }
  if (score >= 60) {
    return {
      stroke: '#22c55e',
      bg: 'from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40',
      text: 'text-green-600 dark:text-green-400',
      label: 'Good',
    };
  }
  if (score >= 40) {
    return {
      stroke: '#f59e0b',
      bg: 'from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40',
      text: 'text-amber-600 dark:text-amber-400',
      label: 'Fair',
    };
  }
  if (score >= 20) {
    return {
      stroke: '#f97316',
      bg: 'from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40',
      text: 'text-orange-600 dark:text-orange-400',
      label: 'Needs Work',
    };
  }
  return {
    stroke: '#ef4444',
    bg: 'from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/40',
    text: 'text-red-600 dark:text-red-400',
    label: 'Critical',
  };
}
