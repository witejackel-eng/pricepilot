'use client';

/**
 * PricePilot — Profit Potential Panel (v1.1)
 *
 * A visually-rich insights panel for the Owner Home that answers the
 * question every small-business owner cares about:
 *
 *   "How much money am I leaving on the table?"
 *
 * It shows:
 *   1. A donut chart of margin-distribution (healthy / low-margin /
 *      below-break-even / missing-data).
 *   2. Three KPI cards:
 *        - Potential extra profit per unit (sum of upside across
 *          products where the balanced recommended price beats the
 *          current selling price).
 *        - Products with upside (count).
 *        - Avg margin now vs. avg margin at the recommended price.
 *   3. A "Top Quick Wins" list — the 3 products with the biggest
 *      absolute profit-per-unit uplift, each clickable to jump
 *      straight to Review Prices.
 *
 * Safety (Phase 3): every product field access is guarded with
 * safeNumberValue so a single malformed/legacy product cannot crash
 * the panel. Products missing a purchase cost or recommendation are
 * excluded from the upside calculation but still counted in the
 * donut's "missing-data" slice.
 *
 * Language: plain, jargon-free. "Potential extra profit" not
 * "delta-net-profit-against-balanced-recommendation".
 */

import { useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { safeNumberValue } from '@/lib/pricepilot/formatting';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  Sparkles,
  TrendingUp,
  Target,
  ArrowUpRight,
  ArrowRight,
  PiggyBank,
} from 'lucide-react';
import type { Product, PricingStatus } from '@/lib/pricepilot/types';

// ============================================================
// Types
// ============================================================

interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

interface QuickWin {
  id: string;
  name: string;
  sku?: string;
  currentPrice: number;
  recommendedPrice: number;
  profitUpliftPerUnit: number;
  currentMargin: number;
  potentialMargin: number;
}

interface ProfitPotential {
  totalProducts: number;
  productsWithUpside: number;
  totalUpliftPerUnit: number;
  avgProfitPerUnitNow: number;
  avgProfitPerUnitPotential: number;
  donut: DonutSlice[];
  quickWins: QuickWin[];
}

// ============================================================
// Margin distribution buckets
// ============================================================

const STATUS_COLORS: Record<PricingStatus, string> = {
  'healthy': '#10b981',      // emerald-500
  'high-margin': '#059669',  // emerald-600
  'above-market': '#0d9488', // teal-600
  'low-margin': '#f59e0b',   // amber-500
  'below-break-even': '#f97316', // orange-500
  'loss-making': '#ef4444',  // red-500
  'missing-data': '#94a3b8', // slate-400
  'approved': '#10b981',     // emerald-500 (treated as healthy)
  'needs-review': '#f59e0b', // amber-500
};

/**
 * Compute the profit-potential insights from the product list.
 *
 * Pure function (no side effects) so it is cheap to memoise and easy
 * to reason about. Every numeric field is guarded.
 */
function computeProfitPotential(products: Product[]): ProfitPotential {
  const totalProducts = products.length;

  // ── Donut: margin distribution ────────────────────────────────
  // Group raw statuses into 4 owner-friendly buckets.
  const buckets: Record<string, number> = {
    healthy: 0,
    'low-margin': 0,
    'below-break-even': 0,
    'missing-data': 0,
  };

  for (const p of products) {
    const status = (p.calculatedPricingStatus ?? 'missing-data') as PricingStatus;
    if (status === 'healthy' || status === 'high-margin' || status === 'above-market' || status === 'approved') {
      buckets.healthy++;
    } else if (status === 'low-margin' || status === 'needs-review') {
      buckets['low-margin']++;
    } else if (status === 'below-break-even' || status === 'loss-making') {
      buckets['below-break-even']++;
    } else {
      buckets['missing-data']++;
    }
  }

  const donut: DonutSlice[] = [
    { name: 'Healthy', value: buckets.healthy, color: STATUS_COLORS.healthy },
    { name: 'Low margin', value: buckets['low-margin'], color: STATUS_COLORS['low-margin'] },
    { name: 'Below break-even', value: buckets['below-break-even'], color: STATUS_COLORS['below-break-even'] },
    { name: 'Missing data', value: buckets['missing-data'], color: STATUS_COLORS['missing-data'] },
  ].filter(s => s.value > 0);

  // ── Upside calculation ────────────────────────────────────────
  // For each product with a trusted balanced recommendation, compute
  // the per-unit profit uplift = (recommendedProfit - currentProfit).
  // We prefer the calculated profit outcomes when available; if the
  // recommended outcome is missing we fall back to a price-difference
  // approximation (recommendedPrice - currentPrice) which is a safe
  // lower bound for the upside signal.
  let totalUpliftPerUnit = 0;
  let productsWithUpside = 0;
  const candidates: QuickWin[] = [];

  // Profit-per-unit sums over products that have a cost + a current
  // price (so the average is meaningful). We track BOTH the current
  // profit and the potential profit (at the recommended price) so
  // the KPI always shows a positive delta when there are
  // opportunities — profit goes up when you apply a higher
  // recommended price, even if the margin % dips (because the
  // balanced recommendation balances margin vs competitiveness).
  let profitSumNow = 0;
  let profitSumPotential = 0;
  let profitCount = 0;

  for (const p of products) {
    const cost = safeNumberValue(p.purchaseCost, 0);
    const currentPrice = safeNumberValue(p.currentSellingPrice, 0);
    const recommendedPrice = safeNumberValue(p.recommendedPrices?.balanced, 0);
    const currentMargin = safeNumberValue(p.calculatedMarginPercent, 0);

    // Potential margin at the recommended price (from the outcome if
    // available, otherwise approximate via the price/cost ratio).
    const balancedOutcome = p.recommendedOutcomes?.balanced?.outcome;
    const potentialMargin = balancedOutcome?.effectiveMarginPercent != null
      ? safeNumberValue(balancedOutcome.effectiveMarginPercent, 0)
      : (recommendedPrice > 0 && cost > 0
          ? ((recommendedPrice - cost) / recommendedPrice) * 100
          : 0);

    // Current + potential profit per unit. Prefer the calculated
    // netProfit from the balanced outcome when available; otherwise
    // approximate as price - cost (a safe lower bound).
    const currentProfitPerUnit = currentPrice > 0 && cost > 0
      ? (balancedOutcome?.netProfit != null
          ? safeNumberValue(balancedOutcome.netProfit, 0) - (recommendedPrice - currentPrice)
          : currentPrice - cost)
      : 0;
    const recommendedProfitPerUnit = balancedOutcome?.netProfit != null
      ? safeNumberValue(balancedOutcome.netProfit, 0)
      : (recommendedPrice > 0 && cost > 0 ? recommendedPrice - cost : 0);

    if (currentPrice > 0 && cost > 0) {
      profitSumNow += currentProfitPerUnit;
      profitSumPotential += recommendedProfitPerUnit;
      profitCount++;
    }

    // Upside: only count products where the recommended price is
    // higher than the current price AND we have a trusted recommendation.
    const confidence = p.recommendedPrices?.confidence;
    const isTrusted = confidence !== 'low';
    if (recommendedPrice > currentPrice && recommendedPrice > 0 && cost > 0 && isTrusted) {
      const uplift = recommendedProfitPerUnit - currentProfitPerUnit;

      if (uplift > 0) {
        totalUpliftPerUnit += uplift;
        productsWithUpside++;
        candidates.push({
          id: p.id,
          name: p.name || 'Unnamed product',
          sku: p.sku,
          currentPrice,
          recommendedPrice,
          profitUpliftPerUnit: uplift,
          currentMargin,
          potentialMargin,
        });
      }
    }
  }

  const avgProfitPerUnitNow = profitCount > 0 ? profitSumNow / profitCount : 0;
  const avgProfitPerUnitPotential = profitCount > 0 ? profitSumPotential / profitCount : 0;

  // Top 3 quick wins by absolute profit uplift per unit.
  const quickWins = candidates
    .sort((a, b) => b.profitUpliftPerUnit - a.profitUpliftPerUnit)
    .slice(0, 3);

  return {
    totalProducts,
    productsWithUpside,
    totalUpliftPerUnit,
    avgProfitPerUnitNow,
    avgProfitPerUnitPotential,
    donut,
    quickWins,
  };
}

// ============================================================
// Component
// ============================================================

export function ProfitPotentialPanel() {
  const { products, businessSettings, setCurrentView, setInitialFilterTab } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode || 'INR';

  const potential = useMemo(() => computeProfitPotential(products), [products]);

  // Don't render the panel until there are products to analyse.
  if (potential.totalProducts === 0) {
    return null;
  }

  const hasUpside = potential.productsWithUpside > 0;
  // Average extra profit per product that has an opportunity. Always
  // positive (we only count products where recommended > current).
  const avgUpliftPerProduct = hasUpside
    ? potential.totalUpliftPerUnit / potential.productsWithUpside
    : 0;

  return (
    <Card
      data-testid="profit-potential-panel"
      className="relative overflow-hidden border-emerald-200 dark:border-emerald-800/60 shadow-md shadow-emerald-500/5 rounded-2xl"
    >
      {/* Subtle gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 via-transparent to-teal-50/30 dark:from-emerald-950/20 dark:via-transparent dark:to-teal-950/10 pointer-events-none" />

      <CardHeader className="relative pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30">
            <Sparkles className="h-4 w-4" />
          </span>
          Profit Potential
          {hasUpside && (
            <Badge className="ml-1 bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-[10px] animate-pulse">
              {potential.productsWithUpside} {potential.productsWithUpside === 1 ? 'opportunity' : 'opportunities'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
          How much more you could earn by applying suggested prices.
        </CardDescription>
      </CardHeader>

      <CardContent className="relative space-y-5">
        {/* ── KPI row ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Potential extra profit per unit */}
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-white/70 dark:bg-slate-900/40 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <PiggyBank className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Extra profit / unit
              </span>
            </div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
              {formatCurrency(potential.totalUpliftPerUnit, currencyCode, { decimals: 0 })}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {hasUpside
                ? `across ${potential.productsWithUpside} ${potential.productsWithUpside === 1 ? 'product' : 'products'}`
                : 'all prices look good'}
            </div>
          </div>

          {/* Avg uplift per product with an opportunity */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Avg uplift / product
              </span>
            </div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 leading-tight flex items-center gap-1">
              {hasUpside ? (
                <>
                  <ArrowUpRight className="h-4 w-4" />
                  {formatCurrency(avgUpliftPerProduct, currencyCode, { decimals: 0 })}
                </>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">—</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {hasUpside
                ? `per product with room to raise`
                : `no raise needed right now`}
            </div>
          </div>

          {/* Products with upside count */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Pricing health
              </span>
            </div>
            <div className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {potential.donut.find(s => s.name === 'Healthy')?.value ?? 0}
              <span className="text-sm font-medium text-slate-400 dark:text-slate-500"> / {potential.totalProducts}</span>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              products with healthy margins
            </div>
          </div>
        </div>

        {/* ── Donut + Quick Wins ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          {/* Donut chart */}
          <div className="sm:col-span-2 flex flex-col items-center justify-center">
            <div className="relative h-32 w-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={potential.donut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={56}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {potential.donut.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      padding: '4px 8px',
                    }}
                    formatter={(value: number, name: string) => [`${value} ${value === 1 ? 'product' : 'products'}`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-none">
                  {potential.totalProducts}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">products</span>
              </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
              {potential.donut.map((slice) => (
                <div key={slice.name} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{slice.name}</span>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{slice.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Wins */}
          <div className="sm:col-span-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Top quick wins
              </h4>
              {hasUpside && (
                <button
                  onClick={() => { setInitialFilterTab(null); setCurrentView('review-prices'); }}
                  className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors flex items-center gap-0.5"
                >
                  Review all <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
            {potential.quickWins.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
                <CheckCircle2Safe />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Your prices are well-tuned. No quick wins right now.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {potential.quickWins.map((win, idx) => (
                  <button
                    key={win.id}
                    onClick={() => { setInitialFilterTab(null); setCurrentView('review-prices'); }}
                    data-testid={`quick-win-${idx}`}
                    className="w-full text-left rounded-lg border border-slate-100 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-2.5 hover:border-emerald-200 hover:bg-emerald-50/40 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center h-5 w-5 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {win.name}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                          {win.sku ? `${win.sku} · ` : ''}{formatCurrency(win.currentPrice, currencyCode, { decimals: 0 })} → {formatCurrency(win.recommendedPrice, currencyCode, { decimals: 0 })}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                          +{formatCurrency(win.profitUpliftPerUnit, currencyCode, { decimals: 0 })}
                          <ArrowUpRight className="h-3 w-3" />
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          {formatPercentage(win.currentMargin)} → {formatPercentage(win.potentialMargin)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Small inline icon to avoid an extra import line for the empty state.
function CheckCircle2Safe() {
  return (
    <svg
      className="h-6 w-6 text-emerald-400 mx-auto"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default ProfitPotentialPanel;
