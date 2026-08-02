'use client';

/**
 * PricePilot - Price History Audit Log Page
 *
 * v1.5 (Task 5-c): Full audit-trail page for every recorded price change.
 * Reads the `priceHistory` slice of the Zustand store (backed by the
 * `priceHistory` IndexedDB table) and renders:
 *
 *   - Gradient header with title + subtitle
 *   - Summary stat cards (Total / Approvals / Applications / Avg. Margin Δ)
 *   - Filters bar (search, action-type, date-range, clear)
 *   - Vertical timeline of every entry with coloured dots & badges
 *   - CSV export of the filtered list (client-side download)
 *   - Clear-history action with AlertDialog confirmation
 *   - Friendly CSS-only animated empty state
 *
 * This component is self-contained: the main agent will mount it inside
 * the app-shell. No other files are modified.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { PriceHistoryRecord } from '@/lib/pricepilot/database';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import {
  History,
  Search,
  Filter,
  Download,
  Trash2,
  X,
  CheckCircle2,
  CheckCircle,
  ArrowRightLeft,
  Pencil,
  Ban,
  FileUp,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  FileClock,
  Layers,
  CircleCheckBig,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// Constants
// ============================================================

type ActionType = PriceHistoryRecord['action'];

interface ActionConfig {
  /** Tailwind classes for the timeline dot background. */
  dotBg: string;
  /** Tailwind classes for the action badge pill. */
  badgeClass: string;
  /** Icon component rendered in the dot + badge. */
  Icon: React.ElementType;
  /** Human-readable label for the badge. */
  label: string;
}

const ACTION_CONFIG: Record<ActionType, ActionConfig> = {
  'price-approve': {
    dotBg: 'bg-emerald-500',
    badgeClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    Icon: CheckCircle,
    label: 'Approved',
  },
  'price-apply': {
    dotBg: 'bg-teal-500',
    badgeClass:
      'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    Icon: ArrowRightLeft,
    label: 'Applied',
  },
  'price-edit': {
    dotBg: 'bg-amber-500',
    badgeClass:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    Icon: Pencil,
    label: 'Edited',
  },
  'price-reject': {
    dotBg: 'bg-red-500',
    badgeClass:
      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    Icon: Ban,
    label: 'Rejected',
  },
  'bulk-approve': {
    dotBg: 'bg-emerald-500',
    badgeClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    Icon: CheckCircle2,
    label: 'Bulk Approve',
  },
  'bulk-apply': {
    dotBg: 'bg-teal-500',
    badgeClass:
      'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    Icon: CircleCheckBig,
    label: 'Bulk Apply',
  },
  'import': {
    dotBg: 'bg-blue-500',
    badgeClass:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    Icon: FileUp,
    label: 'Import',
  },
};

type ActionFilterValue = 'all' | 'approvals' | 'applications' | 'edits' | 'imports';

const ACTION_FILTER_OPTIONS: { value: ActionFilterValue; label: string }[] = [
  { value: 'all', label: 'All actions' },
  { value: 'approvals', label: 'Approvals' },
  { value: 'applications', label: 'Applications' },
  { value: 'edits', label: 'Edits' },
  { value: 'imports', label: 'Imports' },
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================
// Helpers
// ============================================================

/** Safely parse an ISO timestamp, returning null on invalid input. */
function safeParseDate(iso: string): Date | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

/** Format a timestamp as a relative "x ago" string, falling back to absolute. */
function formatRelative(timestamp: string): string {
  const d = safeParseDate(timestamp);
  if (!d) return '—';
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

/** Format a timestamp as an absolute "MMM d, yyyy h:mm a" string. */
function formatAbsolute(timestamp: string): string {
  const d = safeParseDate(timestamp);
  if (!d) return '—';
  try {
    return format(d, 'MMM d, yyyy · h:mm a');
  } catch {
    return '—';
  }
}

/** Escape a CSV cell value per RFC 4180. */
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Trigger a client-side CSV download for the given rows. */
function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
  // Prepend BOM so Excel detects UTF-8 correctly.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ============================================================
// Sub-components
// ============================================================

/**
 * Animated count-up stat number. Uses requestAnimationFrame to interpolate
 * from 0 to the target value over ~600ms, giving the "count-up animation
 * feel" required by the spec.
 */
function CountUpStat({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  // Initialise the visible value to the first `value` so the very first
  // render shows the correct number (no flash of 0). Subsequent value
  // changes trigger the rAF count-up animation below.
  const [display, setDisplay] = useState(() => (Number.isFinite(value) ? value : 0));
  // Mirror of `display` so the animation can start from the currently
  // visible value when interrupted — without reading stale state.
  const displayRef = useRef(Number.isFinite(value) ? value : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const start = displayRef.current;
    const delta = target - start;

    // Skip the animation when the value hasn't meaningfully changed.
    // (No setState here — we only call setState from inside the rAF
    // callback below, which runs asynchronously and avoids the
    // cascading-render lint warning.)
    if (Math.abs(delta) < 0.005) {
      return;
    }

    const duration = 600;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = start + delta * eased;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = target;
        setDisplay(target);
      }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className="tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  Icon: React.ElementType;
  /** Tailwind gradient classes for the card background. */
  gradient: string;
  /** Tailwind classes for the icon chip. */
  iconWrap: string;
}

function StatCard({
  label,
  value,
  decimals = 0,
  prefix,
  suffix,
  Icon,
  gradient,
  iconWrap,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl p-6 transition-all duration-300',
        'shadow-sm hover:shadow-lg hover:-translate-y-1',
        'border border-white/20 dark:border-white/10',
        gradient,
      )}
    >
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/20 blur-2xl opacity-60 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/80 dark:text-white/70">
            {label}
          </div>
          <div className="mt-2 text-3xl font-bold text-white dark:text-white drop-shadow-sm">
            <CountUpStat
              value={value}
              decimals={decimals}
              prefix={prefix}
              suffix={suffix}
            />
          </div>
        </div>
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            'bg-white/25 dark:bg-white/15 backdrop-blur-sm',
            iconWrap,
          )}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

interface TimelineEntryProps {
  entry: PriceHistoryRecord;
  index: number;
  isLast: boolean;
  currencyCode: string;
}

function TimelineEntry({
  entry,
  index,
  isLast,
  currencyCode,
}: TimelineEntryProps) {
  const cfg = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG['price-edit'];
  const { Icon } = cfg;

  const marginDelta =
    entry.oldMargin !== null && entry.newMargin !== null
      ? entry.newMargin - entry.oldMargin
      : null;

  const marginImproved = marginDelta !== null && marginDelta > 0.005;
  const marginDecreased = marginDelta !== null && marginDelta < -0.005;
  const marginColorClass = marginImproved
    ? 'text-emerald-600 dark:text-emerald-400'
    : marginDecreased
      ? 'text-red-600 dark:text-red-400'
      : 'text-slate-500 dark:text-slate-400';
  const MarginIcon =
    marginImproved ? TrendingUp : marginDecreased ? TrendingDown : Minus;

  const absolute = formatAbsolute(entry.timestamp);
  const relative = formatRelative(entry.timestamp);

  const hasOldPrice = entry.oldPrice !== null;
  const hasNewPrice = entry.newPrice !== null;
  const showPriceTransition = hasOldPrice || hasNewPrice;

  return (
    <li
      className="animate-in fade-in slide-in-from-left-4 duration-500 relative flex gap-3 md:gap-4"
      style={{ animationDelay: `${Math.min(index, 20) * 60}ms` }}
    >
      {/* Timeline dot + connecting line */}
      <div className="flex flex-col items-center shrink-0 self-stretch relative">
        <div
          className={cn(
            'relative flex h-3 w-3 items-center justify-center rounded-full z-10',
            'ring-2 ring-white dark:ring-slate-900 shadow-sm',
            cfg.dotBg,
          )}
          aria-hidden="true"
        >
          <Icon className="h-2 w-2 text-white/0" />
        </div>
        {/* Vertical connecting line — gradient emerald-200 → teal-200.
             Absolutely positioned so it always spans from just below the
             dot to the bottom of the row, regardless of card height. */}
        {!isLast && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 bottom-0 w-0.5"
            style={{
              background:
                'linear-gradient(to bottom, rgb(167 243 208), rgb(153 246 236))',
            }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Entry card */}
      <div className="flex-1 min-w-0 pb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 transition-shadow hover:shadow-md">
          {/* Row 1: product name + SKU + action badge */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {entry.productName || 'Unknown product'}
                </span>
                {entry.productSku && (
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">
                    {entry.productSku}
                  </span>
                )}
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] h-5 px-1.5 border-0 font-medium gap-0.5 shrink-0',
                cfg.badgeClass,
              )}
            >
              <Icon className="h-3 w-3" />
              {cfg.label}
            </Badge>
          </div>

          {/* Row 2: price transition + margin change */}
          {showPriceTransition && (
            <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
              <span
                className={cn(
                  'font-mono whitespace-nowrap tabular-nums shrink-0',
                  hasOldPrice
                    ? 'text-slate-400 dark:text-slate-500 line-through'
                    : 'text-slate-300 dark:text-slate-600',
                )}
              >
                {hasOldPrice
                  ? formatCurrency(entry.oldPrice, currencyCode)
                  : '—'}
              </span>
              <ArrowRight className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap tabular-nums shrink-0">
                {hasNewPrice
                  ? formatCurrency(entry.newPrice, currencyCode)
                  : '—'}
              </span>

              {/* Margin change */}
              {marginDelta !== null && (
                <span
                  className={cn(
                    'ml-2 inline-flex items-center gap-0.5 font-medium',
                    marginColorClass,
                  )}
                  title="Margin change"
                >
                  <MarginIcon className="h-3 w-3" />
                  {marginDelta > 0 ? '+' : ''}
                  {formatPercentage(marginDelta)}
                </span>
              )}
            </div>
          )}

          {/* Row 3: description */}
          {entry.description && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {entry.description}
            </p>
          )}

          {/* Row 4: timestamp (relative, with absolute on hover via title) */}
          <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
            <Clock className="h-3 w-3" />
            <span title={absolute}>{relative}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

// ============================================================
// Empty State (CSS-only animated illustration)
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* CSS-only animated illustration: layered floating cards + dot */}
      <div className="relative mb-6 h-32 w-32">
        {/* Outer pulsing ring */}
        <div
          className="absolute inset-0 rounded-full border-2 border-emerald-200 dark:border-emerald-900/60 animate-ping opacity-30"
          style={{ animationDuration: '2.4s' }}
          aria-hidden="true"
        />
        {/* Back card */}
        <div
          className="absolute left-4 top-6 h-20 w-24 rounded-xl bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40 border border-teal-200 dark:border-teal-800 shadow-sm"
          style={{ animation: 'activity-empty-bounce 3s ease-in-out infinite' }}
          aria-hidden="true"
        />
        {/* Front card */}
        <div
          className="absolute right-4 top-2 h-20 w-24 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 border border-emerald-200 dark:border-emerald-800 shadow-md"
          style={{
            animation: 'activity-empty-bounce 3s ease-in-out infinite',
            animationDelay: '0.3s',
          }}
          aria-hidden="true"
        />
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
            <FileClock className="h-7 w-7 text-white" />
          </div>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
        No price changes recorded yet
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        No price changes recorded yet. Start by approving or applying prices to
        build your audit trail.
      </p>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function PriceHistoryPage() {
  const {
    priceHistory,
    refreshPriceHistory,
    clearPriceHistory,
    businessSettings,
  } = usePricePilotStore();

  const currencyCode = businessSettings?.currencyCode || 'INR';

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilterValue>('all');
  const [dateRange, setDateRange] = useState<'30d' | 'all'>('all');

  // Hydrate from IndexedDB on mount.
  useEffect(() => {
    refreshPriceHistory().catch(() => {
      // Swallow — the store already logs the error.
    });
  }, [refreshPriceHistory]);

  // ----- Derived stats (computed on the FULL history, not filtered) -----
  const stats = useMemo(() => {
    const total = priceHistory.length;
    let approvals = 0;
    let applications = 0;
    let marginSum = 0;
    let marginCount = 0;

    for (const h of priceHistory) {
      if (h.action.includes('approve')) approvals += 1;
      if (h.action.includes('apply')) applications += 1;
      if (
        h.oldMargin !== null &&
        h.newMargin !== null &&
        Number.isFinite(h.oldMargin) &&
        Number.isFinite(h.newMargin)
      ) {
        marginSum += h.newMargin - h.oldMargin;
        marginCount += 1;
      }
    }
    const avgMarginChange = marginCount > 0 ? marginSum / marginCount : 0;
    return { total, approvals, applications, avgMarginChange, marginCount };
  }, [priceHistory]);

  // ----- Filtered timeline -----
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();
    const cutoff = now - THIRTY_DAYS_MS;

    return priceHistory.filter((h) => {
      // Action-type filter
      if (actionFilter !== 'all') {
        if (actionFilter === 'approvals' && !h.action.includes('approve')) return false;
        if (actionFilter === 'applications' && !h.action.includes('apply')) return false;
        if (actionFilter === 'edits' && !h.action.includes('edit')) return false;
        if (actionFilter === 'imports' && h.action !== 'import') return false;
      }
      // Date range
      if (dateRange === '30d') {
        const t = new Date(h.timestamp).getTime();
        if (!Number.isFinite(t) || t < cutoff) return false;
      }
      // Search
      if (term) {
        const hay = `${h.productName} ${h.productSku} ${h.description}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [priceHistory, search, actionFilter, dateRange]);

  const hasActiveFilters =
    search.trim() !== '' || actionFilter !== 'all' || dateRange !== 'all';

  const handleClearFilters = () => {
    setSearch('');
    setActionFilter('all');
    setDateRange('all');
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      toast.error('No history entries to export.');
      return;
    }
    const header = [
      'Timestamp',
      'Action',
      'Product Name',
      'SKU',
      'Old Price',
      'New Price',
      'Old Margin (%)',
      'New Margin (%)',
      'Description',
      'Batch ID',
      'Rule ID',
      'Source',
    ];
    const rows = filtered.map((h) => [
      h.timestamp,
      h.action,
      h.productName,
      h.productSku,
      h.oldPrice ?? '',
      h.newPrice ?? '',
      h.oldMargin ?? '',
      h.newMargin ?? '',
      h.description,
      h.metadata?.batchId ?? '',
      h.metadata?.ruleId ?? '',
      h.metadata?.source ?? '',
    ]);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`pricepilot-history-${today}.csv`, [header, ...rows]);
    toast.success(`Exported ${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'} to CSV.`);
  };

  const handleClearHistory = async () => {
    try {
      await clearPriceHistory();
      toast.success('Price history cleared.');
    } catch {
      toast.error('Could not clear price history.');
    }
  };

  // ----- Render -----
  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 p-6 shadow-md">
        {/* Decorative dot pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
          aria-hidden="true"
        />
        {/* Shimmer sweep */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
            animation: 'greeting-shimmer 4s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <History className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white drop-shadow-sm">
                Price Change History
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-white/85 dark:text-white/80">
              Complete audit trail of every price change
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              className="bg-white/90 text-emerald-700 hover:bg-white dark:bg-slate-900/80 dark:text-emerald-300 dark:hover:bg-slate-900"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={priceHistory.length === 0}
                  className="bg-white/90 text-red-700 hover:bg-white hover:text-red-800 border-red-200 dark:bg-slate-900/80 dark:text-red-300 dark:hover:bg-slate-900 dark:border-red-900/50"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all price history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {priceHistory.length} price
                    history entr{priceHistory.length === 1 ? 'y' : 'ies'} from
                    your audit log. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearHistory}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    Yes, clear history
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* ===== Summary stats ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Changes"
          value={stats.total}
          Icon={Layers}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          iconWrap="ring-2 ring-white/30"
        />
        <StatCard
          label="Approvals"
          value={stats.approvals}
          Icon={CheckCircle2}
          gradient="bg-gradient-to-br from-teal-500 to-teal-600"
          iconWrap="ring-2 ring-white/30"
        />
        <StatCard
          label="Applications"
          value={stats.applications}
          Icon={ArrowRightLeft}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          iconWrap="ring-2 ring-white/30"
        />
        <StatCard
          label="Avg. Margin Change"
          value={stats.avgMarginChange}
          decimals={1}
          suffix={stats.marginCount > 0 ? '%' : ''}
          Icon={TrendingUp}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          iconWrap="ring-2 ring-white/30"
        />
      </div>

      {/* ===== Filters bar ===== */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search product, SKU, or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                aria-label="Search price history"
              />
            </div>

            {/* Action type filter */}
            <Select
              value={actionFilter}
              onValueChange={(v) => setActionFilter(v as ActionFilterValue)}
            >
              <SelectTrigger className="w-full md:w-[180px]" aria-label="Filter by action type">
                <Filter className="h-4 w-4 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Action type" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range toggle — two separate buttons with gap-2 spacing */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDateRange('30d')}
                className={cn(
                  'px-3 h-9 text-xs font-medium rounded-md border transition-colors',
                  dateRange === '30d'
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-transparent text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
                aria-pressed={dateRange === '30d'}
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => setDateRange('all')}
                className={cn(
                  'px-3 h-9 text-xs font-medium rounded-md border transition-colors',
                  dateRange === 'all'
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-transparent text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
                aria-pressed={dateRange === 'all'}
              >
                All time
              </button>
            </div>

            {/* Clear filters */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="shrink-0"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>

          {/* Result count */}
          {priceHistory.length > 0 && (
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length}</span>{' '}
              of <span className="font-semibold text-slate-700 dark:text-slate-200">{priceHistory.length}</span>{' '}
              entr{filtered.length === 1 ? 'y' : 'ies'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Timeline ===== */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          {priceHistory.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                No entries match your filters
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Try adjusting your search or clearing filters.
              </p>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="mt-3 text-emerald-700 dark:text-emerald-400"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <ul className="max-h-[600px] overflow-y-auto pr-1 custom-scrollbar list-none p-0 m-0">
              {filtered.map((entry, idx) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  index={idx}
                  isLast={idx === filtered.length - 1}
                  currencyCode={currencyCode}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
