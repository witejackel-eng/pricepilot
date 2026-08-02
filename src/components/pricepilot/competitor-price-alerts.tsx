'use client';

/**
 * PricePilot — Competitor Price Change Alerts (v1.9)
 *
 * Scans the catalog and surfaces actionable alerts whenever a competitor's
 * price diverges from the owner's current selling price by more than ±5%:
 *
 *   🔴 UNDERCUT     — competitor is >5% cheaper (you're losing sales)
 *   🟢 OPPORTUNITY  — competitor is >5% pricier (you can raise prices)
 *   ⚪ ALIGNED       — within ±5% (no action needed, subtle note only)
 *
 * Features:
 *   - Summary stats bar (undercuts / opportunities / aligned + avg price gap)
 *   - Filter tabs (All / Undercuts / Opportunities / Aligned)
 *   - Severity-specific left accent + colored price-diff % per alert
 *   - Suggested action line ("Consider lowering price to ₹X")
 *   - Simulated "price changed X days ago" tag on ~30% of alerts
 *     (deterministic hash of productId + competitorName, no Math.random in render)
 *   - Empty state with ShieldAlert icon when no competitor data exists
 *   - Accessible: role="region" + aria-label, proper heading hierarchy
 */

import { useMemo, useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { safeNumberValue, formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Radar,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
  Eye,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

type AlertSeverity = 'undercut' | 'opportunity' | 'aligned';

interface CompetitorAlert {
  /** Stable key: productId + "|" + competitorName */
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  competitorName: string;
  yourPrice: number;
  competitorPrice: number;
  /** Signed percent difference: (competitor - your) / your * 100. Positive = competitor pricier. */
  diffPercent: number;
  severity: AlertSeverity;
  /** True when the deterministic hash flags this competitor as having "recently changed" price. */
  recentlyChanged: boolean;
  /** Deterministic number of days since the (simulated) change. */
  changedDaysAgo: number;
  /** Direction of the (simulated) change — used to pick TrendingUp vs TrendingDown icon. */
  changedDirection: 'up' | 'down';
}

type FilterTab = 'all' | 'undercut' | 'opportunity' | 'aligned';

// ============================================================
// Helpers
// ============================================================

const THRESHOLD = 0.05; // ±5% band

/**
 * Deterministic string hash (FNV-1a inspired). Returns an integer 0..2^31-1.
 * Used so the "price changed recently" tag is stable across renders.
 */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Math.imul avoids 32-bit overflow issues in JS
    h = Math.imul(h, 16777619);
  }
  // Force unsigned 31-bit
  return (h >>> 0) % 1000000;
}

/**
 * Returns a "recently changed" descriptor for a (productId, competitorName)
 * pair. ~30% of pairs are flagged as changed; the day count and direction
 * are also derived deterministically.
 */
function describeRecentChange(productId: string, competitorName: string): {
  recentlyChanged: boolean;
  changedDaysAgo: number;
  changedDirection: 'up' | 'down';
} {
  const h = hashString(`${productId}::${competitorName}`);
  const recentlyChanged = h % 10 < 3; // 30%
  if (!recentlyChanged) {
    return { recentlyChanged: false, changedDaysAgo: 0, changedDirection: 'up' };
  }
  // Derive days ago (1..14) and direction from a second hash slice
  const daysHash = hashString(`${productId}::${competitorName}::days`);
  const changedDaysAgo = (daysHash % 14) + 1;
  const dirHash = hashString(`${productId}::${competitorName}::dir`);
  const changedDirection = dirHash % 2 === 0 ? 'up' : 'down';
  return { recentlyChanged, changedDaysAgo, changedDirection };
}

function severityRank(s: AlertSeverity): number {
  if (s === 'undercut') return 0;
  if (s === 'opportunity') return 1;
  return 2; // aligned
}

function severityLabel(s: AlertSeverity): string {
  if (s === 'undercut') return 'Undercut';
  if (s === 'opportunity') return 'Opportunity';
  return 'Aligned';
}

// ============================================================
// Component
// ============================================================

export function CompetitorPriceAlerts() {
  const { products, businessSettings, setCurrentView } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode || 'INR';
  const [filter, setFilter] = useState<FilterTab>('all');

  // ----------------------------------------------------------
  // Alert generation
  // ----------------------------------------------------------
  const alerts: CompetitorAlert[] = useMemo(() => {
    const built: CompetitorAlert[] = [];
    for (const p of products) {
      const yourPrice = safeNumberValue(p.currentSellingPrice, 0);
      if (yourPrice <= 0) continue;
      const comps = (p.competitorPrices || []).filter(
        (c) => safeNumberValue(c.price, 0) > 0 && typeof c.name === 'string' && c.name.length > 0
      );
      if (comps.length === 0) continue;

      for (const c of comps) {
        const competitorPrice = safeNumberValue(c.price, 0);
        const diffPercent = ((competitorPrice - yourPrice) / yourPrice) * 100;
        let severity: AlertSeverity;
        if (competitorPrice < yourPrice * (1 - THRESHOLD)) {
          severity = 'undercut';
        } else if (competitorPrice > yourPrice * (1 + THRESHOLD)) {
          severity = 'opportunity';
        } else {
          severity = 'aligned';
        }

        const change = describeRecentChange(p.id, c.name);
        built.push({
          id: `${p.id}|${c.name}`,
          productId: p.id,
          productName: p.name || p.sku || 'Untitled product',
          productSku: p.sku || '',
          competitorName: c.name,
          yourPrice,
          competitorPrice,
          diffPercent,
          severity,
          recentlyChanged: change.recentlyChanged,
          changedDaysAgo: change.changedDaysAgo,
          changedDirection: change.changedDirection,
        });
      }
    }

    // Sort by severity (undercuts first, then opportunities, then aligned).
    // Within the same severity, sort by magnitude (largest gap first).
    built.sort((a, b) => {
      const rankDiff = severityRank(a.severity) - severityRank(b.severity);
      if (rankDiff !== 0) return rankDiff;
      return Math.abs(b.diffPercent) - Math.abs(a.diffPercent);
    });

    return built;
  }, [products]);

  // ----------------------------------------------------------
  // Summary stats
  // ----------------------------------------------------------
  const summary = useMemo(() => {
    let undercuts = 0;
    let opportunities = 0;
    let aligned = 0;
    let absGapSum = 0;
    for (const a of alerts) {
      if (a.severity === 'undercut') undercuts++;
      else if (a.severity === 'opportunity') opportunities++;
      else aligned++;
      absGapSum += Math.abs(a.diffPercent);
    }
    const avgGap = alerts.length > 0 ? absGapSum / alerts.length : 0;
    return { undercuts, opportunities, aligned, avgGap };
  }, [alerts]);

  // ----------------------------------------------------------
  // Filtered list
  // ----------------------------------------------------------
  const filteredAlerts = useMemo(() => {
    if (filter === 'all') return alerts;
    return alerts.filter((a) => a.severity === filter);
  }, [alerts, filter]);

  // ----------------------------------------------------------
  // Empty state — no products with competitor data
  // ----------------------------------------------------------
  if (alerts.length === 0) {
    return (
      <Card
        role="region"
        aria-label="Competitor price alerts"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shadow-sm shrink-0">
              <Radar className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Competitor Price Alerts
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stay informed about competitor price movements
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center text-center py-10 px-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3">
              <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 max-w-md">
              No competitor data yet. Import competitor prices in Competitor Tracking to start monitoring.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------------
  // Filter tabs
  // ----------------------------------------------------------
  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: alerts.length },
    { key: 'undercut', label: 'Undercuts', count: summary.undercuts },
    { key: 'opportunity', label: 'Opportunities', count: summary.opportunities },
    { key: 'aligned', label: 'Aligned', count: summary.aligned },
  ];

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <Card
      role="region"
      aria-label="Competitor price alerts"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 pb-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/50">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shadow-sm shrink-0">
            <Radar className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Competitor Price Alerts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Stay informed about competitor price movements
            </p>
          </div>
        </div>

        {/* Summary stats bar */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          <Badge
            className="rounded-full bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 px-3 py-1 text-xs font-medium"
            aria-label={`${summary.undercuts} undercuts`}
          >
            <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            {summary.undercuts} {summary.undercuts === 1 ? 'undercut' : 'undercuts'}
          </Badge>
          <Badge
            className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1 text-xs font-medium"
            aria-label={`${summary.opportunities} opportunities`}
          >
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            {summary.opportunities} {summary.opportunities === 1 ? 'opportunity' : 'opportunities'}
          </Badge>
          <Badge
            className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-medium"
            aria-label={`${summary.aligned} aligned`}
          >
            {summary.aligned} aligned
          </Badge>
          <span
            className="ml-auto text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums"
            aria-label={`Average price gap ${summary.avgGap.toFixed(1)} percent`}
          >
            Avg price gap: ±{formatPercentage(summary.avgGap, 1)}
          </span>
        </div>

        {/* Filter tabs */}
        <div
          role="tablist"
          aria-label="Filter competitor alerts"
          className="flex items-center gap-1.5 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 overflow-x-auto custom-scrollbar"
        >
          {tabs.map((t) => {
            const isActive = filter === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={isActive}
                aria-label={`${t.label} (${t.count})`}
                onClick={() => setFilter(t.key)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
                ].join(' ')}
              >
                {t.label}
                <span
                  className={[
                    'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                    isActive
                      ? 'bg-white/20 dark:bg-slate-900/20'
                      : 'bg-white dark:bg-slate-900',
                  ].join(' ')}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Alert list */}
        <div
          className="max-h-[600px] overflow-y-auto custom-scrollbar p-4 space-y-3"
          role="list"
          aria-label="Competitor price alerts"
        >
          {filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 px-6">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No alerts in this category.
              </p>
            </div>
          ) : (
            filteredAlerts.map((a, idx) => {
              const accentBorder =
                a.severity === 'undercut'
                  ? 'border-l-4 border-l-red-400'
                  : a.severity === 'opportunity'
                    ? 'border-l-4 border-l-emerald-400'
                    : 'border-l-4 border-l-slate-300';

              const badgeClasses =
                a.severity === 'undercut'
                  ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50'
                  : a.severity === 'opportunity'
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700';

              // Price diff %: red if you're pricier (competitor cheaper, diff<0),
              // emerald if you're cheaper (competitor pricier, diff>0).
              const diffColor =
                a.diffPercent < 0
                  ? 'text-red-600 dark:text-red-400'
                  : a.diffPercent > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400';

              // Suggested action.
              let suggestedAction: string;
              if (a.severity === 'undercut') {
                // Competitor is cheaper — suggest matching/undercutting them.
                const target = Math.round(a.competitorPrice);
                suggestedAction = `Consider lowering price to ${formatCurrency(target, currencyCode)}`;
              } else if (a.severity === 'opportunity') {
                // Competitor is pricier — you have room to raise toward their price.
                const room = Math.max(0, a.competitorPrice - a.yourPrice);
                suggestedAction = `Room to raise price by ${formatCurrency(room, currencyCode)}`;
              } else {
                suggestedAction = 'No action needed — prices are well aligned.';
              }

              return (
                <div
                  key={a.id}
                  role="listitem"
                  className={`rounded-xl border border-slate-200 dark:border-slate-800 ${accentBorder} bg-white dark:bg-slate-900 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}
                  style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                >
                  {/* Top row: severity + competitor name + (optional) changed tag */}
                  <div className="flex flex-wrap items-center gap-2 mb-2.5">
                    <Badge className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${badgeClasses}`}>
                      {severityLabel(a.severity)}
                    </Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="sr-only">Competitor: </span>
                      {a.competitorName}
                    </span>

                    {a.recentlyChanged && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          a.changedDirection === 'up'
                            ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                            : 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50'
                        }`}
                        title={`Competitor price changed ${a.changedDirection === 'up' ? 'up' : 'down'} ${a.changedDaysAgo} day${a.changedDaysAgo === 1 ? '' : 's'} ago (simulated)`}
                      >
                        {a.changedDirection === 'up' ? (
                          <TrendingUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <TrendingDown className="h-3 w-3" aria-hidden="true" />
                        )}
                        Changed {a.changedDaysAgo}d ago
                      </span>
                    )}
                  </div>

                  {/* Product name (truncated with tooltip) */}
                  <div className="mb-2.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p
                          className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate max-w-full cursor-help"
                          title={a.productName}
                        >
                          {a.productName}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm">
                        <p className="text-xs">{a.productName}</p>
                        {a.productSku && (
                          <p className="text-[10px] opacity-80 mt-0.5">SKU: {a.productSku}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Price comparison */}
                  <div className="flex items-center gap-3 mb-2.5 flex-wrap">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Your price
                      </span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        {formatCurrency(a.yourPrice, currencyCode)}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Competitor
                      </span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        {formatCurrency(a.competitorPrice, currencyCode)}
                      </span>
                    </div>
                    <span
                      className={`ml-auto text-sm font-bold tabular-nums ${diffColor}`}
                      aria-label={`Price difference ${a.diffPercent > 0 ? 'competitor pricier by' : 'competitor cheaper by'} ${Math.abs(a.diffPercent).toFixed(1)} percent`}
                    >
                      {a.diffPercent > 0 ? '+' : ''}
                      {formatPercentage(a.diffPercent, 1)}
                    </span>
                  </div>

                  {/* Suggested action + View product button */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-slate-600 dark:text-slate-300 flex-1 min-w-0">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Suggested action: </span>
                      {suggestedAction}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => setCurrentView('products')}
                      aria-label={`View product ${a.productName} in product list`}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      View product
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
