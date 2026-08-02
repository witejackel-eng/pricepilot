'use client';

/**
 * PricePilot — Price Comparison Heatmap (v1.8)
 *
 * A visual matrix that compares each product's current selling price
 * against its competitors' prices. Cells are color-coded:
 *
 *   🟢 Green  — Your price is cheaper than this competitor (advantage)
 *   🟡 Amber  — Your price is within ±3% of this competitor (competitive)
 *   🔴 Red    — Your price is more expensive than this competitor (risk)
 *
 * Features:
 *   - Heat intensity scales with the price difference magnitude
 *   - Sortable by competitiveness score
 *   - Collapsible product rows for competitors count > 3
 *   - Summary footer with overall competitive position
 *   - Responsive: horizontal scroll on small screens with sticky first column
 */

import { useMemo, useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { safeNumberValue, formatCurrency } from '@/lib/pricepilot/formatting';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Grid3x3,
  TrendingDown,
  TrendingUp,
  Minus,
  ChevronDown,
  ChevronRight,
  Crown,
  ArrowUpDown,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface HeatmapRow {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  yourPrice: number;
  competitors: { name: string; price: number; diffPercent: number }[];
  competitivenessScore: number; // 0–100, higher = more competitive (cheaper)
  rank: number; // 1 = cheapest overall
}

// ============================================================
// Helpers
// ============================================================

const COMPETITIVE_THRESHOLD = 3; // ±3% considered competitive

function getCellTone(diffPercent: number): {
  bg: string;
  text: string;
  label: string;
} {
  // diffPercent = competitorPrice - yourPrice, as % of yourPrice
  // Positive => competitor is more expensive => you're cheaper (good)
  // Negative => competitor is cheaper => you're more expensive (bad)
  const abs = Math.abs(diffPercent);
  const youAreCheaper = diffPercent > 0;

  if (abs < COMPETITIVE_THRESHOLD) {
    return {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-300',
      label: 'Competitive',
    };
  }

  // Scale intensity: bigger difference = stronger color
  const intensity = Math.min(abs / 20, 1); // cap at 20% diff

  if (youAreCheaper) {
    // Green — you're cheaper
    if (intensity > 0.6) return { bg: 'bg-emerald-200 dark:bg-emerald-800/50', text: 'text-emerald-800 dark:text-emerald-200', label: 'Much cheaper' };
    if (intensity > 0.3) return { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', label: 'Cheaper' };
    return { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400', label: 'Slightly cheaper' };
  } else {
    // Red — you're more expensive
    if (intensity > 0.6) return { bg: 'bg-red-200 dark:bg-red-800/50', text: 'text-red-800 dark:text-red-200', label: 'Much pricier' };
    if (intensity > 0.3) return { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', label: 'Pricier' };
    return { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', label: 'Slightly pricier' };
  }
}

function getRankBadge(rank: number, total: number): React.ReactNode {
  if (rank === 1) return <Crown className="h-3.5 w-3.5 text-amber-500" aria-label="Cheapest" />;
  if (rank === total) return <TrendingDown className="h-3.5 w-3.5 text-red-500" aria-label="Most expensive" />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
}

// ============================================================
// Component
// ============================================================

export function PriceComparisonHeatmap() {
  const { products, businessSettings } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode || 'INR';
  const [sortMode, setSortMode] = useState<'competitiveness' | 'name' | 'price'>('competitiveness');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const rows: HeatmapRow[] = useMemo(() => {
    const built = products
      .map((p): HeatmapRow | null => {
        const yourPrice = safeNumberValue(p.currentSellingPrice, 0);
        if (yourPrice <= 0) return null;
        const comps = (p.competitorPrices || []).filter((c) => safeNumberValue(c.price, 0) > 0);
        if (comps.length === 0) return null;

        const competitors = comps.map((c) => {
          const cPrice = safeNumberValue(c.price, 0);
          const diffPercent = ((cPrice - yourPrice) / yourPrice) * 100;
          return { name: c.name, price: cPrice, diffPercent };
        });

        // Competitiveness score: average of (you're cheaper) advantage
        const avgDiff = competitors.reduce((s, c) => s + c.diffPercent, 0) / competitors.length;
        // Score: 50 + avgDiff*2 clamped 0-100 (positive diff = cheaper = higher score)
        const competitivenessScore = Math.max(0, Math.min(100, Math.round(50 + avgDiff * 2.5)));

        return {
          productId: p.id,
          productName: p.name || p.sku,
          sku: p.sku,
          category: p.category || 'Uncategorized',
          yourPrice,
          competitors,
          competitivenessScore,
          rank: 0, // filled below
        };
      })
      .filter((r): r is HeatmapRow => r !== null);

    // Compute rank by yourPrice among all prices for each product
    built.forEach((row) => {
      const allPrices = [row.yourPrice, ...row.competitors.map((c) => c.price)].sort((a, b) => a - b);
      row.rank = allPrices.indexOf(row.yourPrice) + 1;
    });

    return built;
  }, [products]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    if (sortMode === 'competitiveness') arr.sort((a, b) => b.competitivenessScore - a.competitivenessScore);
    else if (sortMode === 'name') arr.sort((a, b) => a.productName.localeCompare(b.productName));
    else arr.sort((a, b) => b.yourPrice - a.yourPrice);
    return arr;
  }, [rows, sortMode]);

  // Collect all unique competitor names for column headers
  const allCompetitors = useMemo(() => {
    const set = new Map<string, number>(); // name -> count
    rows.forEach((r) => r.competitors.forEach((c) => set.set(c.name, (set.get(c.name) || 0) + 1)));
    return Array.from(set.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [rows]);

  const summary = useMemo(() => {
    if (rows.length === 0) return { avgScore: 0, cheapest: 0, pricier: 0, competitive: 0 };
    const avgScore = Math.round(rows.reduce((s, r) => s + r.competitivenessScore, 0) / rows.length);
    let cheapest = 0;
    let pricier = 0;
    let competitive = 0;
    rows.forEach((r) => {
      r.competitors.forEach((c) => {
        if (c.diffPercent > COMPETITIVE_THRESHOLD) cheapest++;
        else if (c.diffPercent < -COMPETITIVE_THRESHOLD) pricier++;
        else competitive++;
      });
    });
    return { avgScore, cheapest, pricier, competitive };
  }, [rows]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (rows.length === 0) return null;

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-heatmap-enter">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 pb-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
              <Grid3x3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Price Comparison Heatmap
                <Badge variant="secondary" className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-0">
                  {rows.length} products
                </Badge>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Your prices vs. competitors — color shows your competitive position
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortMode((prev) => (prev === 'competitiveness' ? 'name' : prev === 'name' ? 'price' : 'competitiveness'))}
            className="h-8 text-xs shrink-0"
          >
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
            Sort: {sortMode === 'competitiveness' ? 'Score' : sortMode === 'name' ? 'Name' : 'Price'}
          </Button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-200 dark:bg-emerald-800/50" />
            <span className="text-slate-600 dark:text-slate-300">You're cheaper</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-amber-100 dark:bg-amber-900/30" />
            <span className="text-slate-600 dark:text-slate-300">Competitive (±3%)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-red-100 dark:bg-red-900/40" />
            <span className="text-slate-600 dark:text-slate-300">You're pricier</span>
          </span>
        </div>

        {/* Heatmap table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <th className="text-left font-semibold text-slate-600 dark:text-slate-300 px-4 py-2.5 sticky left-0 bg-slate-50 dark:bg-slate-900/30 z-10 min-w-[180px]">
                  Product
                </th>
                <th className="text-right font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap">
                  Your Price
                </th>
                <th className="text-center font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap">
                  Rank
                </th>
                {allCompetitors.slice(0, 5).map((name) => (
                  <th key={name} className="text-center font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap">
                    {name}
                  </th>
                ))}
                <th className="text-center font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => {
                const isExpanded = expandedRows.has(row.productId);
                const scoreTone =
                  row.competitivenessScore >= 65
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : row.competitivenessScore >= 40
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-500 dark:text-red-400';
                return (
                  <>
                    <tr
                      key={row.productId}
                      className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors animate-heatmap-row-in"
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-slate-900 z-10">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleRow(row.productId)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-700 dark:text-slate-200 text-xs truncate max-w-[150px]">
                              {row.productName}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">{row.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        {formatCurrency(row.yourPrice, currencyCode)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 justify-center">
                          {getRankBadge(row.rank, row.competitors.length + 1)}
                          <span className="text-xs text-slate-500 tabular-nums">{row.rank}/{row.competitors.length + 1}</span>
                        </span>
                      </td>
                      {allCompetitors.slice(0, 5).map((name) => {
                        const comp = row.competitors.find((c) => c.name === name);
                        if (!comp) {
                          return <td key={name} className="px-3 py-2.5 text-center text-slate-300 dark:text-slate-700">—</td>;
                        }
                        const tone = getCellTone(comp.diffPercent);
                        return (
                          <td key={name} className="px-2 py-1.5 text-center">
                            <div
                              className={`rounded-lg ${tone.bg} ${tone.text} px-2 py-1.5 transition-all hover:scale-105 cursor-default`}
                              title={`${comp.name}: ${formatCurrency(comp.price, currencyCode)} (${comp.diffPercent > 0 ? '+' : ''}${comp.diffPercent.toFixed(1)}% vs you) — ${tone.label}`}
                            >
                              <p className="text-xs font-semibold tabular-nums whitespace-nowrap">
                                {formatCurrency(comp.price, currencyCode)}
                              </p>
                              <p className="text-[10px] tabular-nums opacity-80">
                                {comp.diffPercent > 0 ? '+' : ''}{comp.diffPercent.toFixed(1)}%
                              </p>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`text-sm font-bold tabular-nums ${scoreTone}`}>
                            {row.competitivenessScore}
                          </span>
                          <div className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-0.5">
                            <div
                              className={`h-full rounded-full ${row.competitivenessScore >= 65 ? 'bg-emerald-500' : row.competitivenessScore >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${row.competitivenessScore}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.productId}-detail`} className="bg-slate-50/50 dark:bg-slate-800/20">
                        <td colSpan={4 + Math.min(allCompetitors.length, 5)} className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-xs">{row.category}</Badge>
                            {row.competitors.map((c) => {
                              const tone = getCellTone(c.diffPercent);
                              return (
                                <span key={c.name} className={`text-xs rounded-md px-2 py-1 ${tone.bg} ${tone.text}`}>
                                  {c.name}: {formatCurrency(c.price, currencyCode)} ({c.diffPercent > 0 ? '+' : ''}{c.diffPercent.toFixed(1)}%)
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            {/* Summary footer */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 text-xs sticky left-0 bg-inherit">
                  Overall Position
                </td>
                <td className="px-3 py-3"></td>
                <td className="px-3 py-3"></td>
                <td colSpan={Math.min(allCompetitors.length, 5)} className="px-3 py-3">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {summary.cheapest} cheaper
                    </span>
                    <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
                      <Minus className="h-3.5 w-3.5" />
                      {summary.competitive} competitive
                    </span>
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <TrendingDown className="h-3.5 w-3.5" />
                      {summary.pricier} pricier
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={`text-lg font-bold tabular-nums ${summary.avgScore >= 65 ? 'text-emerald-600 dark:text-emerald-400' : summary.avgScore >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>
                    {summary.avgScore}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
