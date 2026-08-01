'use client';

/**
 * PricePilot — Product Price History Chart
 *
 * Visualises the price evolution of a single product over time, derived
 * from the undo log entries that touch that product's price, plus the
 * current selling price as the latest data point.
 *
 * Shows:
 *   - Line chart of price points (old → new)
 *   - Margin trend overlay (secondary line)
 *   - Event markers (approve / apply / edit)
 *   - Summary stats: total change, % change, # adjustments
 *
 * v1.2 feature.
 */

import { useMemo } from 'react';
import { usePricePilotStore, UndoAction } from '@/store/pricepilot-store';
import { Product } from '@/lib/pricepilot/types';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Area,
  ComposedChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  History,
  CheckCircle,
  CheckCircle2,
  Pencil,
  Activity,
} from 'lucide-react';

interface HistoryPoint {
  timestamp: string;
  label: string;
  price: number;
  margin: number;
  event: string;
  eventLabel: string;
}

interface PriceHistoryChartProps {
  product: Product;
  currencyCode: string;
}

const EVENT_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  'price-approve': { label: 'Approved', color: '#10b981', icon: CheckCircle },
  'price-apply': { label: 'Applied', color: '#14b8a6', icon: CheckCircle2 },
  'product-edit': { label: 'Edited', color: '#f59e0b', icon: Pencil },
  'bulk-approve': { label: 'Bulk Approved', color: '#10b981', icon: CheckCircle },
  'import': { label: 'Imported', color: '#6366f1', icon: History },
  'product-delete': { label: 'Deleted', color: '#ef4444', icon: History },
};

/** Estimate margin at a given price using the product's cost structure. */
function estimateMarginAtPrice(product: Product, price: number): number {
  const totalCost =
    (product.purchaseCost || 0) +
    (product.shippingCost || 0) +
    (product.packagingCost || 0) +
    (product.handlingCost || 0) +
    (product.otherCosts || 0);
  if (price <= 0 || totalCost <= 0) return 0;
  return ((price - totalCost) / price) * 100;
}

function formatChartTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeShort(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PriceHistoryChart({ product, currencyCode }: PriceHistoryChartProps) {
  const { undoHistory } = usePricePilotStore();

  // Derive price history from undo log entries for this product
  const historyPoints = useMemo<HistoryPoint[]>(() => {
    const points: HistoryPoint[] = [];

    // Collect all undo actions that reference this product
    const relevant = undoHistory.filter((a: UndoAction) => {
      if (a.productId === product.id) return true;
      if (a.productIds && a.productIds.includes(product.id)) return true;
      return false;
    });

    // Build points from undo actions (oldest first)
    for (const action of relevant) {
      const prev = action.previousState as Partial<Product>;
      const prevPrice =
        typeof prev.currentSellingPrice === 'number'
          ? prev.currentSellingPrice
          : typeof prev.finalApprovedPrice === 'number'
          ? prev.finalApprovedPrice
          : undefined;

      // The action's "new" price is the current product price at that time;
      // since undo stores PREVIOUS state, we record the previous price as a
      // "before" point and the product's current price as the "after".
      if (prevPrice !== undefined && prevPrice !== product.currentSellingPrice) {
        points.push({
          timestamp: action.timestamp,
          label: formatRelativeShort(action.timestamp),
          price: prevPrice,
          margin: estimateMarginAtPrice(product, prevPrice),
          event: action.type,
          eventLabel: EVENT_META[action.type]?.label || action.type,
        });
      }
    }

    // Always append the current price as the latest point
    points.push({
      timestamp: product.updatedAt || new Date().toISOString(),
      label: 'Now',
      price: product.currentSellingPrice,
      margin: estimateMarginAtPrice(product, product.currentSellingPrice),
      event: 'current',
      eventLabel: 'Current',
    });

    // If we have no history, seed with an "initial" point so the chart isn't empty
    if (points.length === 1) {
      points.unshift({
        timestamp: product.createdAt || product.updatedAt || new Date().toISOString(),
        label: 'Initial',
        price: product.currentSellingPrice,
        margin: estimateMarginAtPrice(product, product.currentSellingPrice),
        event: 'initial',
        eventLabel: 'Initial',
      });
    }

    // Sort by timestamp ascending
    points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return points;
  }, [undoHistory, product]);

  // Summary stats
  const stats = useMemo(() => {
    if (historyPoints.length < 2) {
      return { totalChange: 0, percentChange: 0, adjustments: 0, trend: 'flat' as 'up' | 'down' | 'flat' };
    }
    const first = historyPoints[0].price;
    const last = historyPoints[historyPoints.length - 1].price;
    const totalChange = last - first;
    const percentChange = first > 0 ? (totalChange / first) * 100 : 0;
    const adjustments = historyPoints.filter((p) => p.event !== 'initial' && p.event !== 'current').length;
    return {
      totalChange,
      percentChange,
      adjustments,
      trend: totalChange > 0.01 ? 'up' : totalChange < -0.01 ? 'down' : 'flat',
    };
  }, [historyPoints]);

  const hasRealHistory = historyPoints.length > 1;

  // Chart domain
  const prices = historyPoints.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = Math.max((maxPrice - minPrice) * 0.15, 1);
  const yDomain: [number, number] = [
    Math.max(0, minPrice - padding),
    maxPrice + padding,
  ];

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/50 dark:to-teal-950/50 flex items-center justify-center">
            <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Price History
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {hasRealHistory
                ? `${stats.adjustments} adjustment${stats.adjustments === 1 ? '' : 's'} over time`
                : 'No price changes recorded yet'}
            </p>
          </div>
        </div>
        {hasRealHistory && (
          <div className="flex items-center gap-2">
            <Badge
              className={
                stats.trend === 'up'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : stats.trend === 'down'
                  ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }
              variant="outline"
            >
              {stats.trend === 'up' && <TrendingUp className="h-3 w-3 mr-1" />}
              {stats.trend === 'down' && <TrendingDown className="h-3 w-3 mr-1" />}
              {stats.trend === 'flat' && <Minus className="h-3 w-3 mr-1" />}
              {stats.percentChange >= 0 ? '+' : ''}{formatPercentage(stats.percentChange, 1)}
            </Badge>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
              {stats.totalChange >= 0 ? '+' : ''}{formatCurrency(stats.totalChange, currencyCode)}
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      {hasRealHistory ? (
        <div className="h-48 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50/50 to-white dark:from-slate-900/50 dark:to-slate-900 p-2 animate-chart-fade-in">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={historyPoints} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v) => formatCurrency(v, currencyCode).replace(/\.00$/, '')}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}
                labelStyle={{ fontWeight: 600, color: '#1e293b' }}
                formatter={(value: number, name: string) => {
                  if (name === 'price') return [formatCurrency(value, currencyCode), 'Price'];
                  if (name === 'margin') return [formatPercentage(value, 1), 'Margin'];
                  return [value, name];
                }}
                labelFormatter={(_label, payload) => {
                  const p = payload?.[0]?.payload as HistoryPoint | undefined;
                  return p ? `${formatChartTime(p.timestamp)} · ${p.eventLabel}` : '';
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#priceGradient)"
                dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
              />
              <Line
                type="monotone"
                dataKey="margin"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                yAxisId="margin"
                hide
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-32 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 text-center px-4">
          <History className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-1.5" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            No price changes yet
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Approve or adjust a price to start building history
          </p>
        </div>
      )}

      {/* Event timeline */}
      {hasRealHistory && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scroll">
          {[...historyPoints].reverse().map((pt, idx) => {
            const meta = EVENT_META[pt.event];
            const Icon = meta?.icon || History;
            const isLatest = idx === 0;
            const prevPt = historyPoints[historyPoints.length - 1 - idx + 1];
            const change = prevPt ? pt.price - prevPt.price : 0;
            return (
              <div
                key={`${pt.timestamp}-${idx}`}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs ${
                  isLatest
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                } transition-colors`}
              >
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${meta?.color || '#94a3b8'}20` }}
                >
                  <Icon className="h-3 w-3" style={{ color: meta?.color || '#94a3b8' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {pt.eventLabel}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">·</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatChartTime(pt.timestamp)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {idx < historyPoints.length - 1 && change !== 0 && (
                    <span
                      className={`text-[10px] font-medium tabular-nums ${
                        change > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {change > 0 ? '+' : ''}{formatCurrency(change, currencyCode).replace(/\.00$/, '')}
                    </span>
                  )}
                  <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {formatCurrency(pt.price, currencyCode)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
