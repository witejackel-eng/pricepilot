'use client';

/**
 * PricePilot - Price Change History Timeline
 *
 * Displays a visual timeline of price changes (approvals, applications,
 * edits) with colour-coded dots, animated entry, and price/margin
 * change details. Only renders when there are price-related actions
 * in the undoHistory.
 *
 * Task ID: 4
 */

import { useMemo } from 'react';
import { usePricePilotStore, UndoAction } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  ArrowRight,
  ArrowRightLeft,
  Pencil,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
} from 'lucide-react';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';

// ============================================================
// Constants
// ============================================================

const PRICE_ACTION_TYPES = new Set<string>([
  'price-approve',
  'price-apply',
  'product-edit',
]);

const MAX_VISIBLE_EVENTS = 10;

/** Timeline dot colour and label config per action type. */
const TIMELINE_CONFIG: Record<
  string,
  {
    dotColor: string;
    dotRing: string;
    label: string;
    badgeVariant: string;
    icon: React.ElementType;
  }
> = {
  'price-approve': {
    dotColor: 'bg-emerald-500',
    dotRing: 'ring-emerald-500/20',
    label: 'Approved',
    badgeVariant:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  'price-apply': {
    dotColor: 'bg-teal-500',
    dotRing: 'ring-teal-500/20',
    label: 'Applied',
    badgeVariant:
      'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    icon: ArrowRightLeft,
  },
  'product-edit': {
    dotColor: 'bg-amber-500',
    dotRing: 'ring-amber-500/20',
    label: 'Edited',
    badgeVariant:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    icon: Pencil,
  },
};

// ============================================================
// Helpers
// ============================================================

interface TimelineEvent {
  action: UndoAction;
  productName: string;
  oldPrice: number;
  newPrice: number;
  oldMargin: number;
  newMargin: number;
  priceChange: number;
  marginChange: number;
  timestamp: string;
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function buildTimelineEvents(
  undoHistory: UndoAction[],
  products: { id: string; name: string; currentSellingPrice: number; calculatedMarginPercent: number }[]
): TimelineEvent[] {
  const productMap = new Map(products.map((p) => [p.id, p]));

  return undoHistory
    .filter((action) => PRICE_ACTION_TYPES.has(action.type))
    .slice(0, MAX_VISIBLE_EVENTS)
    .map((action) => {
      const prev = action.previousState as Record<string, unknown>;
      const currentProduct = action.productId
        ? productMap.get(action.productId)
        : undefined;

      const productName =
        (action.productId && currentProduct?.name) ||
        (typeof prev?.name === 'string' ? prev.name : '') ||
        action.description;

      // Old price = previous state's selling price
      const oldPrice = safeNumberValue(prev?.currentSellingPrice, 0);
      // New price = current product's selling price, or the approved/applied price
      const newPrice = currentProduct
        ? safeNumberValue(currentProduct.currentSellingPrice, 0)
        : safeNumberValue(prev?.finalApprovedPrice, 0);

      // Old margin = previous state's margin
      const oldMargin = safeNumberValue(prev?.calculatedMarginPercent, 0);
      // New margin = current product's margin
      const newMargin = currentProduct
        ? safeNumberValue(currentProduct.calculatedMarginPercent, 0)
        : safeNumberValue(prev?.calculatedMarginPercent, 0);

      return {
        action,
        productName,
        oldPrice,
        newPrice,
        oldMargin,
        newMargin,
        priceChange: newPrice - oldPrice,
        marginChange: newMargin - oldMargin,
        timestamp: action.timestamp,
      };
    });
}

// ============================================================
// Sub-components
// ============================================================

function ChangeIndicator({
  value,
  type,
  currencyCode,
}: {
  value: number;
  type: 'price' | 'margin';
  currencyCode: string;
}) {
  if (Math.abs(value) < 0.01) {
    return (
      <span className="inline-flex items-center gap-0.5 text-slate-400 dark:text-slate-500 text-xs">
        <Minus className="h-3 w-3" />
        No change
      </span>
    );
  }

  const isPositive = value > 0;
  const colorClass = isPositive
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400';
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const arrow = isPositive ? '↑' : '↓';

  const formattedValue =
    type === 'price'
      ? formatCurrency(Math.abs(value), currencyCode)
      : formatPercentage(Math.abs(value));

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {arrow} {formattedValue}
    </span>
  );
}

function TimelineEntry({
  event,
  index,
  currencyCode,
}: {
  event: TimelineEvent;
  index: number;
  currencyCode: string;
}) {
  const config = TIMELINE_CONFIG[event.action.type] || TIMELINE_CONFIG['product-edit'];
  const Icon = config.icon;
  const isMostRecent = index === 0;

  return (
    <div
      className="animate-timeline-fade-in relative flex gap-3 md:gap-4 group"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`h-4 w-4 rounded-full ${config.dotColor} ring-4 ${config.dotRing} z-10 transition-transform group-hover:scale-125 ${
            isMostRecent ? 'animate-pulse' : ''
          }`}
        />
        {/* Vertical line */}
        <div className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-700 -mt-0.5" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
          {/* Left: product info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {event.productName}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-5 border-0 font-medium ${config.badgeVariant}`}
              >
                <Icon className="h-3 w-3 mr-0.5" />
                {config.label}
              </Badge>
            </div>

            {/* Price change row */}
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="font-mono">{formatCurrency(event.oldPrice, currencyCode)}</span>
              <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                {formatCurrency(event.newPrice, currencyCode)}
              </span>
              <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
              <ChangeIndicator value={event.priceChange} type="price" currencyCode={currencyCode} />
            </div>

            {/* Margin change row */}
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span>Margin:</span>
              <span className="font-mono">{formatPercentage(event.oldMargin)}</span>
              <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                {formatPercentage(event.newMargin)}
              </span>
              <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
              <ChangeIndicator value={event.marginChange} type="margin" currencyCode={currencyCode} />
            </div>
          </div>

          {/* Right: timestamp */}
          <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0 sm:pt-0.5">
            {formatRelativeTime(event.timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function PriceChangeTimeline() {
  const { undoHistory, products, setCurrentView, businessSettings } = usePricePilotStore();

  const currencyCode = businessSettings?.currencyCode || 'INR';

  const timelineEvents = useMemo(
    () => buildTimelineEvents(undoHistory, products),
    [undoHistory, products]
  );

  // Only render when there are price-related actions
  if (timelineEvents.length === 0) {
    return null;
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-600" />
              Price Change History
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 mt-1">
              Recent price approvals, applications, and edits
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">
            {timelineEvents.length} change{timelineEvents.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto pr-1 custom-scrollbar">
          {timelineEvents.map((event, idx) => (
            <TimelineEntry
              key={`${event.action.timestamp}-${idx}`}
              event={event}
              index={idx}
              currencyCode={currencyCode}
            />
          ))}
        </div>

        {/* View all link */}
        {timelineEvents.length >= MAX_VISIBLE_EVENTS && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400"
              onClick={() => setCurrentView('products')}
            >
              View all changes
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
