'use client';

/**
 * PricePilot — Batch Operations Dashboard (v1.9)
 *
 * A powerful workspace for approving, applying, or rejecting multiple
 * product prices at once, with a live preview of the financial impact.
 *
 * Features:
 *   - Filterable product table with per-row + "select all" checkboxes
 *   - Live preview panel: current vs. recommended revenue, margin delta,
 *     and a progress bar showing how many selected products would become
 *     "healthy" after applying the recommended prices.
 *   - Three batch actions wired to the store:
 *       • Approve N  → bulkApprovePrices(ids)
 *       • Apply N    → loops applyApprovedPrice(id) for approved selections
 *       • Reject N   → bulkUpdateProducts(ids, { priceApprovalStatus: 'none',
 *                                                 finalApprovedPrice: 0,
 *                                                 approvedAt: '' })
 *   - Sticky selection summary bar with revenue impact breakdown.
 *   - Sonner toast feedback after every batch action.
 *   - Accessible: role="region", ARIA labels on every checkbox, keyboard
 *     navigable rows (Enter / Space toggles selection).
 *   - Empty state with PackageOpen icon when no products exist.
 */

import { useMemo, useState, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Layers,
  PackageOpen,
  CheckCheck,
  Send,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Receipt,
  HeartPulse,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, safeNumberValue } from '@/lib/pricepilot/formatting';
import { StatusBadge } from './status-badge';
import type { Product, RecommendationMode } from '@/lib/pricepilot/types';

// ============================================================
// Types
// ============================================================

type FilterKey = 'all' | 'needs-review' | 'ready-to-approve' | 'low-margin';

interface FilterChip {
  key: FilterKey;
  label: string;
  predicate: (p: Product) => boolean;
}

interface PreviewMetrics {
  currentRevenue: number;
  recommendedRevenue: number;
  revenueDelta: number;
  currentAvgMargin: number;
  projectedAvgMargin: number;
  marginDelta: number;
  healthyCount: number;
  selectedCount: number;
  healthyPct: number; // 0–100
}

// ============================================================
// Constants
// ============================================================

const FILTERS: FilterChip[] = [
  { key: 'all', label: 'All', predicate: () => true },
  {
    key: 'needs-review',
    label: 'Needs Review',
    predicate: (p) => p.calculatedPricingStatus === 'needs-review',
  },
  {
    key: 'ready-to-approve',
    label: 'Ready to Approve',
    predicate: (p) =>
      getRecommendedPrice(p) > 0 && p.priceApprovalStatus !== 'approved',
  },
  {
    key: 'low-margin',
    label: 'Low Margin',
    predicate: (p) =>
      p.calculatedPricingStatus === 'low-margin' ||
      p.calculatedPricingStatus === 'below-break-even' ||
      p.calculatedPricingStatus === 'loss-making',
  },
];

// ============================================================
// Helpers
// ============================================================

/** Recommended price for the product's selected recommendation mode. */
function getRecommendedPrice(p: Product): number {
  const mode = (p.selectedRecommendationMode || 'balanced') as RecommendationMode;
  return safeNumberValue(p.recommendedPrices[mode], 0) ||
    safeNumberValue(p.recommendedPrices.balanced, 0);
}

/**
 * Projected effective margin % at the recommended price.
 * Prefers the engine-computed outcome; falls back to a simple
 * (price - landedCost) / price estimate.
 */
function getProjectedMargin(p: Product): number {
  const mode = (p.selectedRecommendationMode || 'balanced') as RecommendationMode;
  const outcome = p.recommendedOutcomes?.[mode]?.outcome;
  if (
    outcome &&
    typeof outcome.effectiveMarginPercent === 'number' &&
    Number.isFinite(outcome.effectiveMarginPercent)
  ) {
    return outcome.effectiveMarginPercent;
  }
  const recPrice = getRecommendedPrice(p);
  const cost = safeNumberValue(p.calculatedTotalLandedCost, 0);
  return recPrice > 0 ? ((recPrice - cost) / recPrice) * 100 : 0;
}

/** Format a currency value for compact display in the table. */
function fmtCompact(value: number): string {
  const safe = safeNumberValue(value, 0);
  if (Math.abs(safe) >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(2)}L`;
  }
  if (Math.abs(safe) >= 1_000) {
    return `${(safe / 1_000).toFixed(1)}k`;
  }
  return formatCurrency(safe);
}

// ============================================================
// Component
// ============================================================

export function BatchOperationsDashboard() {
  const products = usePricePilotStore((s) => s.products);
  const businessSettings = usePricePilotStore((s) => s.businessSettings);
  const bulkApprovePrices = usePricePilotStore((s) => s.bulkApprovePrices);
  const applyApprovedPrice = usePricePilotStore((s) => s.applyApprovedPrice);
  const bulkUpdateProducts = usePricePilotStore((s) => s.bulkUpdateProducts);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKey>('all');
  const [previewOpen, setPreviewOpen] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const minimumMargin = safeNumberValue(
    businessSettings?.defaultMinimumMarginPercent,
    10,
  );

  // --- Derived: filtered products ----------------------------------------
  const filteredProducts = useMemo(() => {
    const chip = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    return products.filter(chip.predicate);
  }, [products, filter]);

  // --- Derived: filter counts (for chip badges) --------------------------
  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      all: products.length,
      'needs-review': 0,
      'ready-to-approve': 0,
      'low-margin': 0,
    };
    for (const p of products) {
      if (p.calculatedPricingStatus === 'needs-review') counts['needs-review']++;
      if (getRecommendedPrice(p) > 0 && p.priceApprovalStatus !== 'approved') {
        counts['ready-to-approve']++;
      }
      if (
        p.calculatedPricingStatus === 'low-margin' ||
        p.calculatedPricingStatus === 'below-break-even' ||
        p.calculatedPricingStatus === 'loss-making'
      ) {
        counts['low-margin']++;
      }
    }
    return counts;
  }, [products]);

  // --- Derived: selected products ----------------------------------------
  const selectedProducts = useMemo(
    () => filteredProducts.filter((p) => selectedIds.has(p.id)),
    [filteredProducts, selectedIds],
  );

  // --- Derived: selection state for header checkbox ----------------------
  const selectionState: 'all' | 'some' | 'none' = useMemo(() => {
    if (filteredProducts.length === 0) return 'none';
    const selectedInFilter = filteredProducts.filter((p) =>
      selectedIds.has(p.id),
    ).length;
    if (selectedInFilter === 0) return 'none';
    if (selectedInFilter === filteredProducts.length) return 'all';
    return 'some';
  }, [filteredProducts, selectedIds]);

  // --- Derived: live preview metrics -------------------------------------
  const preview = useMemo<PreviewMetrics>(() => {
    if (selectedProducts.length === 0) {
      return {
        currentRevenue: 0,
        recommendedRevenue: 0,
        revenueDelta: 0,
        currentAvgMargin: 0,
        projectedAvgMargin: 0,
        marginDelta: 0,
        healthyCount: 0,
        selectedCount: 0,
        healthyPct: 0,
      };
    }

    let currentRevenue = 0;
    let recommendedRevenue = 0;
    let currentMarginSum = 0;
    let projectedMarginSum = 0;
    let healthyCount = 0;

    for (const p of selectedProducts) {
      const qty = safeNumberValue(p.monthlyUnitsSold, 0);
      const curPrice = safeNumberValue(p.currentSellingPrice, 0);
      const recPrice = getRecommendedPrice(p);
      currentRevenue += curPrice * qty;
      recommendedRevenue += recPrice * qty;
      currentMarginSum += safeNumberValue(p.calculatedMarginPercent, 0);
      const projected = getProjectedMargin(p);
      projectedMarginSum += projected;
      if (projected >= minimumMargin && projected > 0) healthyCount++;
    }

    const n = selectedProducts.length;
    const currentAvg = currentMarginSum / n;
    const projectedAvg = projectedMarginSum / n;

    return {
      currentRevenue,
      recommendedRevenue,
      revenueDelta: recommendedRevenue - currentRevenue,
      currentAvgMargin: currentAvg,
      projectedAvgMargin: projectedAvg,
      marginDelta: projectedAvg - currentAvg,
      healthyCount,
      selectedCount: n,
      healthyPct: Math.round((healthyCount / n) * 100),
    };
  }, [selectedProducts, minimumMargin]);

  // --- Derived: count of selected products that can be applied -----------
  const applicableApplyCount = useMemo(
    () =>
      selectedProducts.filter(
        (p) =>
          p.priceApprovalStatus === 'approved' &&
          safeNumberValue(p.finalApprovedPrice, 0) > 0,
      ).length,
    [selectedProducts],
  );

  // --- Handlers ----------------------------------------------------------
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      // If all filtered are selected → clear filtered selection.
      // Otherwise → select all filtered.
      const allFilteredSelected =
        filteredProducts.length > 0 &&
        filteredProducts.every((p) => prev.has(p.id));
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const p of filteredProducts) next.delete(p.id);
      } else {
        for (const p of filteredProducts) next.add(p.id);
      }
      return next;
    });
  }, [filteredProducts]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleApprove = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || isBusy) return;
    setIsBusy(true);
    try {
      const result = await bulkApprovePrices(ids);
      if (result.success) {
        toast.success(`Approved ${ids.length} prices`, {
          description: `${ids.length} product price(s) marked as approved.`,
        });
      } else {
        toast.error('Batch approve failed', {
          description: result.message || 'Could not approve the prices.',
        });
      }
    } catch {
      toast.error('Batch approve failed', {
        description: 'An unexpected error occurred.',
      });
    } finally {
      setIsBusy(false);
    }
  }, [selectedIds, bulkApprovePrices, isBusy]);

  const handleApply = useCallback(async () => {
    const applicable = selectedProducts.filter(
      (p) =>
        p.priceApprovalStatus === 'approved' &&
        safeNumberValue(p.finalApprovedPrice, 0) > 0,
    );
    if (applicable.length === 0 || isBusy) {
      toast.warning('Nothing to apply', {
        description:
          'Approve the selected prices first — only approved prices can be applied.',
      });
      return;
    }
    setIsBusy(true);
    let applied = 0;
    let failed = 0;
    try {
      for (const p of applicable) {
        const result = await applyApprovedPrice(p.id);
        if (result.success) applied++;
        else failed++;
      }
      if (failed === 0) {
        toast.success(`Applied ${applied} prices`, {
          description: `${applied} approved price(s) applied to current selling price.`,
        });
      } else {
        toast.warning(`Applied ${applied} of ${applicable.length} prices`, {
          description: `${failed} price(s) could not be applied.`,
        });
      }
    } catch {
      toast.error('Batch apply failed', {
        description: 'An unexpected error occurred.',
      });
    } finally {
      setIsBusy(false);
    }
  }, [selectedProducts, applyApprovedPrice, isBusy]);

  const handleReject = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || isBusy) return;
    setIsBusy(true);
    try {
      const result = await bulkUpdateProducts(ids, {
        priceApprovalStatus: 'none',
        finalApprovedPrice: 0,
        approvedAt: '',
        isApproved: false,
      });
      if (result.success) {
        toast.success(`Rejected ${ids.length} prices`, {
          description: `${ids.length} product price(s) reset to needs-review.`,
        });
      } else {
        toast.error('Batch reject failed', {
          description: result.message || 'Could not reject the prices.',
        });
      }
    } catch {
      toast.error('Batch reject failed', {
        description: 'An unexpected error occurred.',
      });
    } finally {
      setIsBusy(false);
    }
  }, [selectedIds, bulkUpdateProducts, isBusy]);

  // --- Early return: empty state -----------------------------------------
  if (products.length === 0) {
    return (
      <Card
        role="region"
        aria-label="Batch Operations Dashboard"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <div className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Batch Operations
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Approve, apply, or reject multiple prices at once
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <PackageOpen className="h-7 w-7 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            No products available for batch operations.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Import products to begin approving or applying prices in bulk.
          </p>
        </div>
      </Card>
    );
  }

  // --- Render ------------------------------------------------------------
  return (
    <Card
      role="region"
      aria-label="Batch Operations Dashboard"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 pb-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Batch Operations
              <Badge
                variant="secondary"
                className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-0"
              >
                {products.length} products
              </Badge>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Approve, apply, or reject multiple prices at once
            </p>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="h-8 text-xs shrink-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Clear selection ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
        {FILTERS.map((chip) => {
          const isActive = filter === chip.key;
          const count = filterCounts[chip.key];
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              aria-pressed={isActive}
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1',
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-400',
              ].join(' ')}
            >
              {chip.label}
              <span
                className={[
                  'inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full px-1 text-[10px] font-semibold',
                  isActive
                    ? 'bg-white/25 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
                ].join(' ')}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Product table */}
      <div className="relative">
        <div className="overflow-x-auto custom-scrollbar max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur">
                <th className="w-10 px-4 py-2.5 text-left">
                  <Checkbox
                    checked={
                      selectionState === 'all'
                        ? true
                        : selectionState === 'some'
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all products"
                  />
                </th>
                <th className="text-left font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 min-w-[200px]">
                  Product
                </th>
                <th className="text-left font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap">
                  SKU
                </th>
                <th className="text-right font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap tabular-nums">
                  Current Price
                </th>
                <th className="text-right font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap tabular-nums">
                  Recommended
                </th>
                <th className="text-right font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap tabular-nums">
                  Margin %
                </th>
                <th className="text-center font-semibold text-slate-600 dark:text-slate-300 px-3 py-2.5 whitespace-nowrap">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const isSelected = selectedIds.has(p.id);
                const recPrice = getRecommendedPrice(p);
                const margin = safeNumberValue(p.calculatedMarginPercent, 0);
                const marginTone =
                  margin >= minimumMargin
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : margin > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-500 dark:text-red-400';
                return (
                  <tr
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleSelect(p.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`Select ${p.name}`}
                    className={[
                      'border-b border-slate-50 dark:border-slate-800/60 cursor-pointer transition-colors duration-150 outline-none',
                      'focus-visible:bg-emerald-50/50 dark:focus-visible:bg-emerald-950/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400',
                      isSelected
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                    ].join(' ')}
                  >
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(p.id)}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 min-w-[200px]">
                      <div className="flex items-center min-w-0">
                        <span className="block max-w-[220px] truncate text-slate-700 dark:text-slate-200 font-medium">
                          {p.name || 'Unnamed product'}
                        </span>
                        {p.name && p.name.length > 28 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="ml-1 text-slate-300 dark:text-slate-600 cursor-help">
                                …
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {p.name}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[220px]">
                        {p.category || 'Uncategorised'}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {p.sku || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">
                      {formatCurrency(safeNumberValue(p.currentSellingPrice, 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">
                      {recPrice > 0 ? formatCurrency(recPrice) : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-medium ${marginTone}`}>
                      {margin.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge
                        status={p.calculatedPricingStatus}
                        pulse={
                          p.calculatedPricingStatus === 'needs-review' ||
                          p.calculatedPricingStatus === 'low-margin' ||
                          p.calculatedPricingStatus === 'loss-making' ||
                          p.calculatedPricingStatus === 'below-break-even'
                        }
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <PackageOpen className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No products match this filter.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Live preview panel + sticky selection bar */}
        {selectedIds.size > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Live preview (collapsible) */}
            <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
              <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-inset"
                    aria-expanded={previewOpen}
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      Live Impact Preview
                      <span className="text-slate-400 dark:text-slate-500 font-normal">
                        ({preview.selectedCount} selected)
                      </span>
                    </span>
                    {previewOpen ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-5 pb-4 pt-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Current revenue */}
                    <PreviewStat
                      icon={<Receipt className="h-4 w-4 text-slate-400" />}
                      label="Current revenue"
                      value={fmtCompact(preview.currentRevenue)}
                      hint="Σ current price × monthly units"
                    />
                    {/* Recommended revenue */}
                    <PreviewStat
                      icon={<Receipt className="h-4 w-4 text-emerald-500" />}
                      label="Recommended revenue"
                      value={fmtCompact(preview.recommendedRevenue)}
                      hint="Σ recommended price × monthly units"
                    />
                    {/* Revenue delta */}
                    <PreviewStat
                      icon={
                        preview.revenueDelta > 0 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                        ) : preview.revenueDelta < 0 ? (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        ) : (
                          <Minus className="h-4 w-4 text-slate-400" />
                        )
                      }
                      label="Revenue delta"
                      value={fmtCompact(preview.revenueDelta)}
                      valueTone={
                        preview.revenueDelta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : preview.revenueDelta < 0
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }
                      hint={
                        preview.revenueDelta > 0
                          ? 'Higher after applying'
                          : preview.revenueDelta < 0
                            ? 'Lower after applying'
                            : 'No change'
                      }
                    />
                    {/* Avg margin change */}
                    <PreviewStat
                      icon={
                        preview.marginDelta > 0 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                        ) : preview.marginDelta < 0 ? (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        ) : (
                          <Minus className="h-4 w-4 text-slate-400" />
                        )
                      }
                      label="Avg margin change"
                      value={`${preview.currentAvgMargin.toFixed(1)}% → ${preview.projectedAvgMargin.toFixed(1)}%`}
                      valueTone={
                        preview.marginDelta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : preview.marginDelta < 0
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }
                      hint={`Δ ${preview.marginDelta >= 0 ? '+' : ''}${preview.marginDelta.toFixed(1)} pts`}
                    />
                  </div>

                  {/* Healthy-after-apply progress bar */}
                  <div className="px-5 pb-4">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                        <HeartPulse className="h-3.5 w-3.5 text-emerald-500" />
                        Would become healthy after applying
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                        {preview.healthyCount} of {preview.selectedCount}{' '}
                        <span className="text-slate-400 dark:text-slate-500 font-normal">
                          ({preview.healthyPct}%)
                        </span>
                      </span>
                    </div>
                    <Progress
                      value={preview.healthyPct}
                      className="h-2 bg-slate-200 dark:bg-slate-700"
                    />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                      Based on projected margin ≥ {minimumMargin}% (your minimum
                      margin threshold).
                    </p>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            <Separator className="bg-slate-100 dark:bg-slate-800" />

            {/* Sticky selection summary bar */}
            <div className="sticky bottom-0 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border-t border-emerald-200 dark:border-emerald-800 px-5 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    <Layers className="h-4 w-4" />
                    {preview.selectedCount} product{preview.selectedCount === 1 ? '' : 's'} selected
                  </span>
                  <span className="hidden sm:inline text-emerald-300 dark:text-emerald-700">
                    |
                  </span>
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    Potential revenue impact:{' '}
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(preview.recommendedRevenue)}
                    </span>
                    {preview.revenueDelta !== 0 && (
                      <span
                        className={[
                          'ml-1.5 font-medium tabular-nums',
                          preview.revenueDelta > 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-red-600 dark:text-red-400',
                        ].join(' ')}
                      >
                        ({preview.revenueDelta >= 0 ? '+' : ''}
                        {formatCurrency(preview.revenueDelta)})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    disabled={isBusy || preview.selectedCount === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm h-8"
                    aria-label={`Approve ${preview.selectedCount} selected prices`}
                  >
                    <CheckCheck className="h-4 w-4" />
                    Approve {preview.selectedCount}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApply}
                    disabled={
                      isBusy ||
                      applicableApplyCount === 0
                    }
                    className="bg-teal-600 hover:bg-teal-700 text-white border-0 shadow-sm h-8"
                    aria-label={`Apply ${applicableApplyCount} approved prices`}
                  >
                    <Send className="h-4 w-4" />
                    Apply {applicableApplyCount}
                    {applicableApplyCount !== preview.selectedCount && (
                      <span className="ml-1 text-[10px] opacity-80">
                        /{preview.selectedCount}
                      </span>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReject}
                    disabled={isBusy || preview.selectedCount === 0}
                    className="border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:border-red-700 h-8"
                    aria-label={`Reject ${preview.selectedCount} selected prices`}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject {preview.selectedCount}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// Sub-components
// ============================================================

interface PreviewStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  valueTone?: string;
}

function PreviewStat({ icon, label, value, hint, valueTone }: PreviewStatProps) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p
        className={`text-sm font-semibold tabular-nums ${
          valueTone ?? 'text-slate-800 dark:text-slate-100'
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          {hint}
        </p>
      )}
    </div>
  );
}

export default BatchOperationsDashboard;
