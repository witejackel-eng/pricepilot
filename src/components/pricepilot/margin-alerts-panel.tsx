'use client';

/**
 * PricePilot — Margin Alerts Panel (v1.3)
 *
 * A header bell icon with a live badge showing how many products need
 * attention (loss-making, below break-even, low margin, or missing
 * data). Clicking opens a dropdown panel listing every problematic
 * product with quick actions (View, Approve, Fix).
 *
 * Severity levels:
 *   - critical (loss-making / below break-even)  → red
 *   - warning (low margin < 10%)                 → amber
 *   - info (missing data / needs review)         → slate
 *
 * v1.3 feature.
 */

import { useState, useMemo, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Product } from '@/lib/pricepilot/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Bell,
  AlertTriangle,
  TrendingDown,
  AlertCircle,
  Package,
  ExternalLink,
  CheckCircle,
  ArrowRight,
  X,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import { toast } from 'sonner';

type Severity = 'critical' | 'warning' | 'info';

interface AlertItem {
  product: Product;
  severity: Severity;
  reason: string;
  reasonShort: string;
  margin: number;
  price: number;
  cost: number;
}

const SEVERITY_META: Record<
  Severity,
  { label: string; color: string; bg: string; border: string; icon: React.ElementType; dot: string }
> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    icon: TrendingDown,
    dot: 'bg-red-500',
  },
  warning: {
    label: 'Warning',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    icon: AlertTriangle,
    dot: 'bg-amber-500',
  },
  info: {
    label: 'Info',
    color: 'text-slate-700 dark:text-slate-300',
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    border: 'border-slate-200 dark:border-slate-700',
    icon: AlertCircle,
    dot: 'bg-slate-400',
  },
};

export function MarginAlertsPanel() {
  const { products, businessSettings, setSelectedProductId, setCurrentView, approveProductPrice } = usePricePilotStore();
  const [open, setOpen] = useState(false);

  // Build alert list
  const alerts = useMemo<AlertItem[]>(() => {
    return products
      .map((p): AlertItem | null => {
        const totalCost =
          safeNumberValue(p.purchaseCost, 0) +
          safeNumberValue(p.shippingCost, 0) +
          safeNumberValue(p.packagingCost, 0) +
          safeNumberValue(p.handlingCost, 0) +
          safeNumberValue(p.otherCosts, 0);
        const price = safeNumberValue(p.currentSellingPrice, 0);
        const margin = price > 0 ? ((price - totalCost) / price) * 100 : 0;

        // Critical: loss-making or below break-even
        if (
          p.calculatedPricingStatus === 'loss-making' ||
          p.calculatedPricingStatus === 'below-break-even' ||
          margin < 0
        ) {
          return {
            product: p,
            severity: 'critical',
            reason: margin < 0 ? 'Selling below cost — losing money on every sale' : 'Below break-even point',
            reasonShort: 'Below break-even',
            margin,
            price,
            cost: totalCost,
          };
        }

        // Warning: low margin (< 10%)
        if (p.calculatedPricingStatus === 'low-margin' || (margin >= 0 && margin < 10)) {
          return {
            product: p,
            severity: 'warning',
            reason: `Margin is only ${formatPercentage(margin, 1)} — below healthy threshold`,
            reasonShort: 'Low margin',
            margin,
            price,
            cost: totalCost,
          };
        }

        // Info: missing data or needs review
        if (
          p.calculatedPricingStatus === 'missing-data' ||
          p.calculatedPricingStatus === 'needs-review' ||
          !p.purchaseCost ||
          p.purchaseCost <= 0 ||
          p.recommendedPrices.confidence === 'low'
        ) {
          return {
            product: p,
            severity: 'info',
            reason: !p.purchaseCost || p.purchaseCost <= 0 ? 'Missing purchase cost' : 'Needs review — low confidence recommendation',
            reasonShort: 'Needs info',
            margin,
            price,
            cost: totalCost,
          };
        }

        return null;
      })
      .filter((a): a is AlertItem => a !== null)
      .sort((a, b) => {
        // Critical first, then warning, then info; within each, worst margin first
        const sevOrder = { critical: 0, warning: 1, info: 2 };
        if (sevOrder[a.severity] !== sevOrder[b.severity]) {
          return sevOrder[a.severity] - sevOrder[b.severity];
        }
        return a.margin - b.margin;
      });
  }, [products]);

  const counts = useMemo(
    () => ({
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      info: alerts.filter((a) => a.severity === 'info').length,
      total: alerts.length,
    }),
    [alerts]
  );

  const cc = businessSettings.currencyCode;

  const handleView = useCallback(
    (productId: string) => {
      setSelectedProductId(productId);
      setCurrentView('products');
      setOpen(false);
    },
    [setSelectedProductId, setCurrentView]
  );

  const handleApprove = useCallback(
    async (productId: string) => {
      try {
        await approveProductPrice(productId, 'balanced');
        toast.success('Price approved', {
          description: 'Approved at the balanced recommendation',
        });
      } catch (err) {
        toast.error('Failed to approve', { description: String(err) });
      }
    },
    [approveProductPrice]
  );

  const handleGoToReview = useCallback(() => {
    setCurrentView('review-prices');
    setOpen(false);
  }, [setCurrentView]);

  // No alerts badge
  if (counts.total === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 h-8 px-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 group"
        title="No alerts — all products are healthy"
      >
        <div className="relative">
          <Bell className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 hidden sm:inline">
          All clear
        </span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 px-2.5 hover:bg-amber-50 dark:hover:bg-amber-950/40 group relative bell-shake-on-hover"
          title={`${counts.total} product${counts.total === 1 ? '' : 's'} need attention`}
        >
          <div className="relative">
            <Bell className="bell-icon h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            {/* Pulsing dot for critical */}
            {counts.critical > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 animate-ping" />
            )}
            {counts.critical > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 dot-pulse-critical" />
            )}
          </div>
          <Badge
            className={`text-[10px] font-bold h-4 min-w-4 px-1 flex items-center justify-center badge-pulse ${
              counts.critical > 0
                ? 'bg-red-500 text-white'
                : 'bg-amber-500 text-white'
            }`}
          >
            {counts.total}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0"
        align="end"
        sideOffset={8}
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Margin Alerts</h3>
                <p className="text-xs text-amber-50/90">
                  {counts.total} product{counts.total === 1 ? '' : 's'} need attention
                </p>
              </div>
            </div>
          </div>
          {/* Summary chips */}
          <div className="flex items-center gap-2 mt-3">
            {counts.critical > 0 && (
              <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-[11px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-red-200" />
                {counts.critical} Critical
              </div>
            )}
            {counts.warning > 0 && (
              <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-[11px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
                {counts.warning} Warning
              </div>
            )}
            {counts.info > 0 && (
              <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-[11px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                {counts.info} Info
              </div>
            )}
          </div>
        </div>

        {/* Alert list */}
        <div className="max-h-[360px] overflow-y-auto custom-scroll">
          {alerts.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                All caught up!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                No products need attention right now.
              </p>
            </div>
          ) : (
            alerts.slice(0, 20).map((alert, idx) => {
              const meta = SEVERITY_META[alert.severity];
              const Icon = meta.icon;
              const rec = alert.product.recommendedPrices?.balanced || 0;
              return (
                <div
                  key={alert.product.id}
                  className={`px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${meta.bg} hover:bg-opacity-70 transition-colors group`}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Severity icon */}
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${meta.bg} border ${meta.border}`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                    </div>
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {alert.product.name || alert.product.sku}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                        {alert.reason}
                      </p>
                      {/* Price/margin stats */}
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400">
                          Price: <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatCurrency(alert.price, cc)}</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className={`font-semibold tabular-nums ${alert.margin < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {formatPercentage(alert.margin, 1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Quick actions */}
                  <div className="flex items-center gap-1.5 mt-2 ml-9">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2 rounded-md"
                      onClick={() => handleView(alert.product.id)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    {rec > 0 && alert.severity !== 'info' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2 rounded-md border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        onClick={() => handleApprove(alert.product.id)}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Approve {formatCurrency(rec, cc).replace(/\.00$/, '')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {alerts.length > 0 && (
          <>
            <Separator />
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/50">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs h-8 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                onClick={handleGoToReview}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Review all {counts.total} product{counts.total === 1 ? '' : 's'}
                <ArrowRight className="h-3 w-3 ml-1.5" />
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
