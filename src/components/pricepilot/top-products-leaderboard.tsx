'use client';

/**
 * PricePilot — Top Products Leaderboard (v1.2)
 *
 * A compact, visually rich card showing:
 *   - Top 3 most profitable products (by absolute profit per unit)
 *   - Bottom 3 products needing attention (by margin)
 *   - Mini bar chart of margin distribution
 *
 * Renders on the Owner Home below the action cards when products exist.
 */

import { useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import {
  Trophy,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Crown,
  Package,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from 'recharts';

interface ProductRank {
  id: string;
  name: string;
  sku: string;
  category: string;
  profit: number;
  margin: number;
  price: number;
  cost: number;
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#a16207']; // gold, silver, bronze
const ALERT_COLORS = ['#ef4444', '#f97316', '#f59e0b'];

export function TopProductsLeaderboard() {
  const { products, businessSettings, setCurrentView, setSelectedProductId } = usePricePilotStore();

  const ranked = useMemo(() => {
    if (products.length === 0) {
      return { top: [], bottom: [], distribution: [] };
    }

    const enriched = products
      .map((p) => {
        const totalCost =
          safeNumberValue(p.purchaseCost, 0) +
          safeNumberValue(p.shippingCost, 0) +
          safeNumberValue(p.packagingCost, 0) +
          safeNumberValue(p.handlingCost, 0) +
          safeNumberValue(p.otherCosts, 0);
        const price = safeNumberValue(p.currentSellingPrice, 0);
        const profit = price - totalCost;
        const margin = price > 0 ? (profit / price) * 100 : 0;
        return {
          id: p.id,
          name: p.name || p.sku || 'Unnamed',
          sku: p.sku || '',
          category: p.category || 'Uncategorised',
          profit,
          margin,
          price,
          cost: totalCost,
        };
      })
      .filter((p) => p.price > 0);

    // Top 3 by absolute profit (per unit)
    const top = [...enriched]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 3);

    // Bottom 3 by margin (only those that are actually problematic)
    const bottom = [...enriched]
      .filter((p) => p.margin < 15) // below 15% margin is concerning
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 3);

    // Margin distribution buckets
    const buckets = {
      'Loss': enriched.filter((p) => p.margin < 0).length,
      '0-10%': enriched.filter((p) => p.margin >= 0 && p.margin < 10).length,
      '10-25%': enriched.filter((p) => p.margin >= 10 && p.margin < 25).length,
      '25-50%': enriched.filter((p) => p.margin >= 25 && p.margin < 50).length,
      '50%+': enriched.filter((p) => p.margin >= 50).length,
    };
    const distribution = Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));

    return { top, bottom, distribution };
  }, [products]);

  if (products.length === 0) return null;

  const cc = businessSettings.currencyCode;

  const openProduct = (id: string) => {
    setSelectedProductId(id);
    setCurrentView('products');
  };

  const maxProfit = ranked.top.length > 0 ? Math.max(...ranked.top.map((p) => p.profit)) : 1;
  const minMargin = ranked.bottom.length > 0 ? Math.min(...ranked.bottom.map((p) => p.margin)) : 0;
  const maxMargin = ranked.bottom.length > 0 ? Math.max(...ranked.bottom.map((p) => p.margin)) : 15;

  return (
    <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
            <Trophy className="h-4 w-4 text-white" />
          </div>
          Product Leaderboard
        </CardTitle>
        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
          Your best performers and products that need attention
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top performers */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Top Earners
            </span>
          </div>
          {ranked.top.length === 0 ? (
            <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              No profitable products yet
            </div>
          ) : (
            <div className="space-y-2">
              {ranked.top.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => openProduct(p.id)}
                  className="w-full text-left group animate-leaderboard-slide"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
                    {/* Rank badge */}
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0 shadow-sm ${idx === 0 ? 'rank-badge-gold' : ''}`}
                      style={idx !== 0 ? { backgroundColor: RANK_COLORS[idx] } : {}}
                    >
                      {idx + 1}
                    </div>
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {p.name}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.category}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                          <TrendingUp className="h-3 w-3" />
                          {formatPercentage(p.margin)}
                        </span>
                      </div>
                    </div>
                    {/* Profit */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        +{formatCurrency(p.profit, cc)}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">
                        per unit
                      </div>
                    </div>
                  </div>
                  {/* Mini progress bar */}
                  <div className="ml-10 mr-2 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full profit-bar-shimmer rounded-full transition-all duration-500"
                      style={{ width: `${(p.profit / maxProfit) * 100}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom performers */}
        {ranked.bottom.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Needs Attention
              </span>
            </div>
            <div className="space-y-2">
              {ranked.bottom.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => openProduct(p.id)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: `${ALERT_COLORS[idx]}20` }}
                    >
                      <TrendingDown className="h-3.5 w-3.5" style={{ color: ALERT_COLORS[idx] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {p.name}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600 group-hover:text-red-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.category}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                          {formatCurrency(p.price, cc)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-medium ${
                          p.margin < 0
                            ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800'
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800'
                        }`}
                      >
                        {formatPercentage(p.margin)}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Margin distribution mini chart */}
        {ranked.distribution.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Package className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Margin Distribution
              </span>
            </div>
            <div className="h-32 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ranked.distribution} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.1)' }}
                    contentStyle={{
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '11px',
                      padding: '4px 8px',
                    }}
                    formatter={(value: number) => [`${value} product${value === 1 ? '' : 's'}`, 'Count']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {ranked.distribution.map((entry, idx) => {
                      const color =
                        entry.name === 'Loss'
                          ? '#ef4444'
                          : entry.name === '0-10%'
                          ? '#f97316'
                          : entry.name === '10-25%'
                          ? '#f59e0b'
                          : entry.name === '25-50%'
                          ? '#22c55e'
                          : '#10b981';
                      return <Cell key={`cell-${idx}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
