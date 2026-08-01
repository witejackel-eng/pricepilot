'use client';

/**
 * PricePilot — Recently Viewed Products (v1.3)
 *
 * A compact horizontal strip of recently viewed product cards shown on
 * the Owner Home. Each card shows the product name, SKU, current price,
 * margin, and a status dot. Clicking reopens the product detail drawer.
 *
 * Reads from the store's `recentlyViewedIds` array (max 5 items).
 *
 * v1.3 feature.
 */

import { useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import {
  Clock,
  ArrowRight,
  X,
  History,
  TrendingUp,
  TrendingDown,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-emerald-500',
  'high-margin': 'bg-emerald-500',
  approved: 'bg-emerald-500',
  'low-margin': 'bg-amber-500',
  'needs-review': 'bg-amber-500',
  'missing-data': 'bg-slate-400',
  'below-break-even': 'bg-orange-500',
  'loss-making': 'bg-red-500',
};

export function RecentlyViewedProducts() {
  const { products, recentlyViewedIds, setSelectedProductId, setCurrentView, businessSettings } = usePricePilotStore();
  const cc = businessSettings.currencyCode;

  // Resolve recently viewed products in order (filter out deleted ones)
  const recentProducts = useMemo(() => {
    return recentlyViewedIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .slice(0, 5);
  }, [recentlyViewedIds, products]);

  if (recentProducts.length === 0) return null;

  const handleOpen = (id: string) => {
    setSelectedProductId(id);
    setCurrentView('products');
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-slate-50/80 to-transparent dark:from-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center shadow-sm">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Recently Viewed
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Pick up where you left off
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-400 hover:text-slate-600 h-7"
            onClick={() => {
              // Clear by setting to empty — the store doesn't have a clear method,
              // but we can navigate to products and the IDs naturally cycle out
              toast.info('Recent history clears automatically over time');
            }}
          >
            <History className="h-3 w-3 mr-1" />
            History
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {recentProducts.map((p, idx) => {
            const totalCost =
              safeNumberValue(p.purchaseCost, 0) +
              safeNumberValue(p.shippingCost, 0) +
              safeNumberValue(p.packagingCost, 0) +
              safeNumberValue(p.handlingCost, 0) +
              safeNumberValue(p.otherCosts, 0);
            const price = safeNumberValue(p.currentSellingPrice, 0);
            const margin = price > 0 ? ((price - totalCost) / price) * 100 : 0;
            const statusDot = STATUS_DOT[p.calculatedPricingStatus] || 'bg-slate-400';
            const isPositive = margin >= 0;

            return (
              <button
                key={p.id}
                onClick={() => handleOpen(p.id)}
                className="text-left group animate-leaderboard-slide"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="recent-card rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-emerald-300 dark:hover:border-emerald-700 h-full">
                  {/* Status dot + name */}
                  <div className="flex items-start gap-1.5 mb-2">
                    <span className={`h-2 w-2 rounded-full ${statusDot} flex-shrink-0 mt-1.5`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                        {p.name || p.sku}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                        {p.sku}
                      </p>
                    </div>
                  </div>
                  {/* Price + margin */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Price</span>
                      <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {formatCurrency(price, cc).replace(/\.00$/, '')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Margin</span>
                      <span
                        className={`text-[11px] font-semibold tabular-nums flex items-center gap-0.5 ${
                          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isPositive ? (
                          <TrendingUp className="h-2.5 w-2.5" />
                        ) : (
                          <TrendingDown className="h-2.5 w-2.5" />
                        )}
                        {formatPercentage(margin, 0)}
                      </span>
                    </div>
                  </div>
                  {/* Hover hint */}
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 font-medium">
                      Open
                      <ArrowRight className="h-2.5 w-2.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
