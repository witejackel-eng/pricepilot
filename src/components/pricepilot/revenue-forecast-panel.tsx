'use client';

/**
 * PricePilot — Revenue Forecast Panel
 *
 * Shows revenue projections based on current product data:
 *   1. Three KPI cards (Monthly Revenue, Monthly Profit, Profit Margin)
 *   2. Revenue Projection Chart (6-month bar chart with gradient fill)
 *   3. Revenue Breakdown (donut chart by category, top 5 + Other)
 *   4. Quick Stats Row (best category, growth opportunity, avg order value)
 *
 * Returns null when no products exist.
 */

import { useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Percent,
  Trophy,
  Lightbulb,
  ShoppingCart,
} from 'lucide-react';
import type { Product } from '@/lib/pricepilot/types';

// ============================================================
// Types
// ============================================================

interface CategoryRevenue {
  name: string;
  revenue: number;
  profit: number;
  color: string;
}

interface ForecastData {
  monthlyRevenue: number;
  monthlyProfit: number;
  profitMargin: number;
  projectionData: { month: string; revenue: number; profit: number }[];
  categoryBreakdown: CategoryRevenue[];
  bestCategory: string;
  growthOpportunity: string;
  avgOrderValue: number;
}

// ============================================================
// Category colors
// ============================================================

const CATEGORY_COLORS = [
  '#10b981', // emerald-500
  '#14b8a6', // teal-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#64748b', // slate-500
];

// ============================================================
// Computation
// ============================================================

function computeForecast(products: Product[]): ForecastData {
  let monthlyRevenue = 0;
  let monthlyProfit = 0;

  // Category-level aggregation
  const categoryMap = new Map<string, { revenue: number; profit: number; margin: number; count: number }>();

  for (const p of products) {
    const price = safeNumberValue(p.currentSellingPrice, 0);
    const units = safeNumberValue(p.monthlyUnitsSold, 0) || safeNumberValue(p.expectedMonthlyUnits, 0) || safeNumberValue(p.quantity, 0);
    const profitPerUnit = safeNumberValue(p.calculatedProfitPerUnit, 0);

    // Use price * units if units > 0, otherwise estimate from price alone
    const productRevenue = units > 0 ? price * units : price;
    const productProfit = units > 0 ? profitPerUnit * units : profitPerUnit;

    monthlyRevenue += productRevenue;
    monthlyProfit += productProfit;

    // Category aggregation
    const category = p.category?.trim() || 'Uncategorized';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, { revenue: 0, profit: 0, margin: 0, count: 0 });
    }
    const cat = categoryMap.get(category)!;
    cat.revenue += productRevenue;
    cat.profit += productProfit;
    cat.count += 1;
  }

  // Calculate average margin per category
  for (const [, cat] of categoryMap) {
    cat.margin = cat.revenue > 0 ? (cat.profit / cat.revenue) * 100 : 0;
  }

  const profitMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;

  // 6-month projection (flat sales assumption)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const projectionData = Array.from({ length: 6 }, (_, i) => {
    const monthIndex = (now.getMonth() + i) % 12;
    return {
      month: monthNames[monthIndex],
      revenue: Math.round(monthlyRevenue),
      profit: Math.round(monthlyProfit),
    };
  });

  // Category breakdown for donut — top 5 + Other
  const sortedCategories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue);

  const top5 = sortedCategories.slice(0, 5);
  const rest = sortedCategories.slice(5);

  const categoryBreakdown: CategoryRevenue[] = top5.map(([name, data], idx) => ({
    name,
    revenue: data.revenue,
    profit: data.profit,
    color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
  }));

  if (rest.length > 0) {
    const otherRevenue = rest.reduce((sum, [, d]) => sum + d.revenue, 0);
    const otherProfit = rest.reduce((sum, [, d]) => sum + d.profit, 0);
    categoryBreakdown.push({
      name: 'Other',
      revenue: otherRevenue,
      profit: otherProfit,
      color: CATEGORY_COLORS[5],
    });
  }

  // Best performing category (highest total profit)
  const bestCategory = sortedCategories.length > 0
    ? [...sortedCategories].sort((a, b) => b[1].profit - a[1].profit)[0][0]
    : '—';

  // Growth opportunity (category with highest margin potential)
  const growthOpportunity = sortedCategories.length > 0
    ? [...sortedCategories].sort((a, b) => b[1].margin - a[1].margin)[0][0]
    : '—';

  // Average order value (avg selling price)
  const productsWithPrice = products.filter(p => safeNumberValue(p.currentSellingPrice, 0) > 0);
  const avgOrderValue = productsWithPrice.length > 0
    ? productsWithPrice.reduce((sum, p) => sum + safeNumberValue(p.currentSellingPrice, 0), 0) / productsWithPrice.length
    : 0;

  return {
    monthlyRevenue,
    monthlyProfit,
    profitMargin,
    projectionData,
    categoryBreakdown,
    bestCategory,
    growthOpportunity,
    avgOrderValue,
  };
}

// ============================================================
// Component
// ============================================================

export function RevenueForecastPanel() {
  const { products, businessSettings } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode || 'INR';

  const forecast = useMemo(() => computeForecast(products), [products]);

  // Return null when no products exist
  if (products.length === 0) return null;

  return (
    <Card
      data-testid="revenue-forecast-panel"
      className="relative overflow-hidden border-emerald-200 dark:border-emerald-800/60 shadow-md shadow-emerald-500/5 rounded-2xl"
    >
      {/* Gradient header banner */}
      <div className="relative bg-gradient-to-r from-emerald-500 to-teal-500 dark:from-emerald-700 dark:to-teal-700 p-5 pb-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm text-white shadow-sm">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              Revenue Forecast
              <Badge className="bg-white/20 text-white border-0 text-[10px] backdrop-blur-sm">
                6-month
              </Badge>
            </CardTitle>
            <CardDescription className="text-emerald-50/90 text-xs mt-0.5">
              Projected earnings based on your current pricing
            </CardDescription>
          </div>
        </div>
      </div>

      <CardContent className="relative space-y-5 pt-5">
        {/* ── 3 KPI Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Monthly Revenue */}
          <div className="forecast-card-enter rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-sm">
                <DollarSign className="h-4 w-4" />
              </div>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Monthly Revenue
              </span>
            </div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
              {formatCurrency(forecast.monthlyRevenue, currencyCode, { compact: true, decimals: 0 })}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              based on current prices &amp; sales
            </div>
          </div>

          {/* Monthly Profit */}
          <div className="forecast-card-enter rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-white/80 to-slate-50/50 dark:from-slate-900/40 dark:to-slate-800/30 p-4 backdrop-blur-sm" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white shadow-sm">
                <TrendingUp className="h-4 w-4" />
              </div>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Monthly Profit
              </span>
            </div>
            <div className="text-2xl font-bold text-teal-700 dark:text-teal-400 leading-tight">
              {formatCurrency(forecast.monthlyProfit, currencyCode, { compact: true, decimals: 0 })}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              after all costs &amp; fees
            </div>
          </div>

          {/* Profit Margin */}
          <div className="forecast-card-enter rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-white/80 to-slate-50/50 dark:from-slate-900/40 dark:to-slate-800/30 p-4 backdrop-blur-sm" style={{ animationDelay: '160ms' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-sm">
                <Percent className="h-4 w-4" />
              </div>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Profit Margin
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {formatPercentage(forecast.profitMargin)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              revenue kept as profit
            </div>
          </div>
        </div>

        {/* ── Revenue Projection Chart + Donut ────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          {/* Bar Chart - 6 month projection */}
          <div className="sm:col-span-3 glass-card rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
              Revenue Projection (6 months)
            </h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecast.projectionData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      padding: '4px 8px',
                      background: 'rgba(255,255,255,0.95)',
                    }}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value, currencyCode, { compact: true, decimals: 0 }),
                      name === 'revenue' ? 'Revenue' : 'Profit',
                    ]}
                  />
                  <Bar dataKey="revenue" fill="url(#revenueGradient)" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="profit" fill="url(#profitGradient)" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut Chart - Revenue by category */}
          <div className="sm:col-span-2 glass-card rounded-xl p-4 flex flex-col items-center justify-center">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3 w-full">
              Revenue by Category
            </h4>
            {forecast.categoryBreakdown.length > 0 ? (
              <>
                <div className="relative h-36 w-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={forecast.categoryBreakdown}
                        dataKey="revenue"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={60}
                        paddingAngle={2}
                        stroke="none"
                        className="donut-draw"
                      >
                        {forecast.categoryBreakdown.map((slice) => (
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
                        formatter={(value: number) => [
                          formatCurrency(value, currencyCode, { compact: true, decimals: 0 }),
                          'Revenue',
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none">
                      {forecast.categoryBreakdown.length}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">categories</span>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
                  {forecast.categoryBreakdown.map((slice) => (
                    <div key={slice.name} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{slice.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">No category data</p>
            )}
          </div>
        </div>

        {/* ── Quick Stats Row ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Best performing category */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Best performing category
              </span>
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {forecast.bestCategory}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              highest total profit
            </div>
          </div>

          {/* Growth opportunity */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Growth opportunity
              </span>
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {forecast.growthOpportunity}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              highest margin potential
            </div>
          </div>

          {/* Average order value */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ShoppingCart className="h-3.5 w-3.5 text-teal-500 dark:text-teal-400" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Average order value
              </span>
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {formatCurrency(forecast.avgOrderValue, currencyCode, { decimals: 0 })}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              avg selling price
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default RevenueForecastPanel;
