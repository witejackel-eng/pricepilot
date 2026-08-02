'use client';

/**
 * PricePilot — Category Analysis Panel
 *
 * Provides detailed category-level analysis with:
 *   1. Category cards (one per category) with:
 *      - Category name with product count badge
 *      - Average margin for the category
 *      - Total revenue potential
 *      - Pricing status breakdown (healthy, low-margin, etc.)
 *      - Margin distribution bar (green/amber/red)
 *      - Best product in category (highest profit)
 *      - Needs attention count
 *   2. Summary bar with overall category health
 *
 * Returns null when no products exist.
 */

import { useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import {
  PieChart,
  TrendingUp,
  Award,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react';
import type { Product, PricingStatus } from '@/lib/pricepilot/types';

// ============================================================
// Types
// ============================================================

interface StatusBreakdown {
  healthy: number;
  lowMargin: number;
  loss: number;
  missingData: number;
}

interface CategoryData {
  name: string;
  productCount: number;
  avgMargin: number;
  totalRevenue: number;
  statusBreakdown: StatusBreakdown;
  bestProduct: string;
  bestProductProfit: number;
  needsAttention: number;
  borderColors: string;
}

// ============================================================
// Category border colors (unique per category)
// ============================================================

const CATEGORY_BORDER_COLORS = [
  'border-l-emerald-500',
  'border-l-teal-500',
  'border-l-amber-500',
  'border-l-violet-500',
  'border-l-pink-500',
  'border-l-cyan-500',
  'border-l-lime-500',
  'border-l-orange-500',
  'border-l-rose-500',
  'border-l-slate-500',
];

// ============================================================
// Computation
// ============================================================

function computeCategoryAnalysis(products: Product[]): CategoryData[] {
  const categoryMap = new Map<string, {
    products: Product[];
    margins: number[];
    revenue: number;
  }>();

  for (const p of products) {
    const category = p.category?.trim() || 'Uncategorized';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, { products: [], margins: [], revenue: 0 });
    }
    const entry = categoryMap.get(category)!;
    entry.products.push(p);

    const price = safeNumberValue(p.currentSellingPrice, 0);
    const units = safeNumberValue(p.monthlyUnitsSold, 0) || safeNumberValue(p.expectedMonthlyUnits, 0) || safeNumberValue(p.quantity, 0);
    const margin = safeNumberValue(p.calculatedMarginPercent, 0);

    entry.margins.push(margin);
    // Revenue potential: use price * units if units > 0, otherwise just price as potential per unit
    entry.revenue += units > 0 ? price * units : price;
  }

  const categories: CategoryData[] = [];

  let colorIdx = 0;
  for (const [name, data] of categoryMap) {
    const productCount = data.products.length;
    const avgMargin = data.margins.length > 0
      ? data.margins.reduce((s, m) => s + m, 0) / data.margins.length
      : 0;

    // Status breakdown
    const statusBreakdown: StatusBreakdown = { healthy: 0, lowMargin: 0, loss: 0, missingData: 0 };
    for (const p of data.products) {
      const status = (p.calculatedPricingStatus ?? 'missing-data') as PricingStatus;
      if (status === 'healthy' || status === 'high-margin' || status === 'above-market' || status === 'approved') {
        statusBreakdown.healthy++;
      } else if (status === 'low-margin' || status === 'needs-review' || status === 'below-break-even') {
        statusBreakdown.lowMargin++;
      } else if (status === 'loss-making') {
        statusBreakdown.loss++;
      } else {
        statusBreakdown.missingData++;
      }
    }

    // Best product (highest profit)
    let bestProduct = '—';
    let bestProductProfit = 0;
    for (const p of data.products) {
      const profit = safeNumberValue(p.calculatedProfitPerUnit, 0);
      if (profit > bestProductProfit) {
        bestProductProfit = profit;
        bestProduct = p.name || p.sku || 'Unnamed';
      }
    }

    // Needs attention count
    const needsAttention = statusBreakdown.lowMargin + statusBreakdown.loss + statusBreakdown.missingData;

    const borderColor = CATEGORY_BORDER_COLORS[colorIdx % CATEGORY_BORDER_COLORS.length];
    colorIdx++;

    categories.push({
      name,
      productCount,
      avgMargin,
      totalRevenue: data.revenue,
      statusBreakdown,
      bestProduct,
      bestProductProfit,
      needsAttention,
      borderColors: borderColor,
    });
  }

  // Sort by revenue descending
  return categories.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// ============================================================
// Component
// ============================================================

export function CategoryAnalysisPanel() {
  const { products, businessSettings } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode || 'INR';

  const categories = useMemo(() => computeCategoryAnalysis(products), [products]);

  // Return null when no products exist
  if (products.length === 0) return null;

  // Overall category health summary
  const totalHealthy = categories.reduce((s, c) => s + c.statusBreakdown.healthy, 0);
  const totalProducts = products.length;
  const healthPercent = totalProducts > 0 ? (totalHealthy / totalProducts) * 100 : 0;
  const categoriesNeedingAttention = categories.filter(c => c.needsAttention > 0).length;

  return (
    <Card
      data-testid="category-analysis-panel"
      className="relative overflow-hidden border-slate-200 dark:border-slate-800 shadow-md rounded-2xl"
    >
      {/* Header */}
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30">
            <PieChart className="h-4 w-4" />
          </span>
          Category Analysis
          <Badge variant="secondary" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-0">
            {categories.length} {categories.length === 1 ? 'category' : 'categories'}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
          Performance breakdown by product category
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Category Cards Grid ─────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((category, idx) => {
            const total = category.productCount;
            const healthyPct = total > 0 ? (category.statusBreakdown.healthy / total) * 100 : 0;
            const lowMarginPct = total > 0 ? (category.statusBreakdown.lowMargin / total) * 100 : 0;
            const lossPct = total > 0 ? (category.statusBreakdown.loss / total) * 100 : 0;
            const missingPct = total > 0 ? (category.statusBreakdown.missingData / total) * 100 : 0;

            return (
              <div
                key={category.name}
                className="category-card-enter"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div
                  className={`rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${category.borderColors} bg-white dark:bg-slate-900/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50`}
                >
                  {/* Category header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[200px]">
                        {category.name}
                      </h3>
                      <Badge className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-0 h-5">
                        {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
                      </Badge>
                    </div>
                    {category.needsAttention > 0 && (
                      <Badge className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-0 h-5 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {category.needsAttention}
                      </Badge>
                    )}
                  </div>

                  {/* Key metrics row */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Avg Margin</span>
                      <span className={`text-sm font-bold ${category.avgMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatPercentage(category.avgMargin)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Revenue Potential</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {formatCurrency(category.totalRevenue, currencyCode, { compact: true, decimals: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Status breakdown */}
                  <div className="flex items-center gap-2 mb-2 text-[10px]">
                    {category.statusBreakdown.healthy > 0 && (
                      <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {category.statusBreakdown.healthy} healthy
                      </span>
                    )}
                    {category.statusBreakdown.lowMargin > 0 && (
                      <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                        <TrendingUp className="h-3 w-3" />
                        {category.statusBreakdown.lowMargin} low-margin
                      </span>
                    )}
                    {category.statusBreakdown.loss > 0 && (
                      <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        {category.statusBreakdown.loss} loss
                      </span>
                    )}
                    {category.statusBreakdown.missingData > 0 && (
                      <span className="flex items-center gap-0.5 text-slate-400 dark:text-slate-500">
                        {category.statusBreakdown.missingData} missing
                      </span>
                    )}
                  </div>

                  {/* Margin distribution bar */}
                  <div className="relative h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
                    {healthyPct > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-l-full"
                        style={{ width: `${healthyPct}%` }}
                      />
                    )}
                    {lowMarginPct > 0 && (
                      <div
                        className="absolute inset-y-0 bg-gradient-to-r from-amber-400 to-amber-500"
                        style={{ left: `${healthyPct}%`, width: `${lowMarginPct}%` }}
                      />
                    )}
                    {lossPct > 0 && (
                      <div
                        className="absolute inset-y-0 bg-gradient-to-r from-red-400 to-red-500"
                        style={{ left: `${healthyPct + lowMarginPct}%`, width: `${lossPct}%` }}
                      />
                    )}
                    {missingPct > 0 && (
                      <div
                        className="absolute inset-y-0 bg-slate-300 dark:bg-slate-600 rounded-r-full"
                        style={{ left: `${healthyPct + lowMarginPct + lossPct}%`, width: `${missingPct}%` }}
                      />
                    )}
                  </div>

                  {/* Best product & attention */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Award className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Best: <span className="font-medium text-slate-700 dark:text-slate-200">{category.bestProduct}</span>
                      </span>
                    </div>
                    {category.bestProductProfit > 0 && (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 shrink-0">
                        {formatCurrency(category.bestProductProfit, currencyCode, { decimals: 0 })}
                        <ArrowUpRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Summary Bar ─────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-800/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Overall Category Health
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {totalHealthy} healthy
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {categoriesNeedingAttention} {categoriesNeedingAttention === 1 ? 'category' : 'categories'} need attention
                </span>
              </div>
            </div>
          </div>
          {/* Health progress bar */}
          <div className="relative h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                healthPercent >= 70 ? 'bg-emerald-500' : healthPercent >= 40 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${healthPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            {formatPercentage(healthPercent, 0)} of products have healthy margins
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CategoryAnalysisPanel;
