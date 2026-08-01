'use client';

/**
 * PricePilot — Price Insights Panel (v1.4)
 *
 * A smart insights panel that analyses the product catalog and surfaces
 * actionable pricing insights on the Owner Home page.
 *
 * Insight types:
 *   1. Underpriced Products  — recommended price significantly exceeds current
 *   2. Overpriced Products   — recommended price is below current (competitive risk)
 *   3. Margin Optimization   — products with low margins that could be improved
 *   4. Pricing Consistency   — products in the same category with inconsistent margins
 *
 * Each card expands to show the relevant products. Clicking a product opens
 * the product detail drawer via the store's `setSelectedProductId`.
 */

import { useMemo, useState, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import { Product } from '@/lib/pricepilot/types';
import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Eye,
  ArrowRight,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface InsightProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  currentMargin: number;
  recommendedMargin: number;
  marginGap: number;
  currentPrice: number;
  recommendedPrice: number;
  priceGap: number;
}

type InsightTone = 'opportunity' | 'warning' | 'risk' | 'info';

interface Insight {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  tone: InsightTone;
  products: InsightProduct[];
}

// ============================================================
// Thresholds
// ============================================================

/** Minimum price gap (absolute) to flag as underpriced */
const UNDERPRICED_PRICE_GAP_THRESHOLD = 5;
/** Minimum percentage gap to flag as underpriced */
const UNDERPRICED_PERCENT_THRESHOLD = 5;
/** Minimum price gap (absolute) to flag as overpriced */
const OVERPRICED_PRICE_GAP_THRESHOLD = 5;
/** Minimum percentage gap to flag as overpriced */
const OVERPRICED_PERCENT_THRESHOLD = 5;
/** Margin below which a product is considered "low margin" */
const LOW_MARGIN_THRESHOLD = 10;
/** Standard deviation threshold for pricing inconsistency */
const CONSISTENCY_STD_DEV_THRESHOLD = 10;

// ============================================================
// Tone config
// ============================================================

const TONE_CONFIG: Record<InsightTone, {
  cardBorder: string;
  iconBg: string;
  iconText: string;
  badgeBg: string;
  badgeText: string;
  accentBar: string;
  hoverBg: string;
}> = {
  opportunity: {
    cardBorder: 'border-emerald-200 dark:border-emerald-800',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    accentBar: 'bg-emerald-500',
    hoverBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20',
  },
  warning: {
    cardBorder: 'border-amber-200 dark:border-amber-800',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconText: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
    badgeText: 'text-amber-700 dark:text-amber-300',
    accentBar: 'bg-amber-500',
    hoverBg: 'hover:bg-amber-50/50 dark:hover:bg-amber-950/20',
  },
  risk: {
    cardBorder: 'border-red-200 dark:border-red-800',
    iconBg: 'bg-red-100 dark:bg-red-900/40',
    iconText: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-900/40',
    badgeText: 'text-red-700 dark:text-red-300',
    accentBar: 'bg-red-500',
    hoverBg: 'hover:bg-red-50/50 dark:hover:bg-red-950/20',
  },
  info: {
    cardBorder: 'border-sky-200 dark:border-sky-800',
    iconBg: 'bg-sky-100 dark:bg-sky-900/40',
    iconText: 'text-sky-600 dark:text-sky-400',
    badgeBg: 'bg-sky-100 dark:bg-sky-900/40',
    badgeText: 'text-sky-700 dark:text-sky-300',
    accentBar: 'bg-sky-500',
    hoverBg: 'hover:bg-sky-50/50 dark:hover:bg-sky-950/20',
  },
};

// ============================================================
// Insight computation helpers
// ============================================================

function getEffectiveRecommendedPrice(product: Product): number {
  const mode = product.selectedRecommendationMode;
  if (mode === 'custom' && product.customRecommendedPrice > 0) {
    return product.customRecommendedPrice;
  }
  const prices = product.recommendedPrices;
  if (mode === 'minimum' && prices.minimum > 0) return prices.minimum;
  if (mode === 'competitive' && prices.competitive > 0) return prices.competitive;
  if (mode === 'premium' && prices.premium > 0) return prices.premium;
  // Default to balanced
  if (prices.balanced > 0) return prices.balanced;
  return 0;
}

function computeMargin(price: number, cost: number): number {
  if (price <= 0) return 0;
  return ((price - cost) / price) * 100;
}

function getEffectiveCost(product: Product): number {
  return safeNumberValue(product.calculatedTotalLandedCost, 0)
    || (
      safeNumberValue(product.purchaseCost, 0) +
      safeNumberValue(product.shippingCost, 0) +
      safeNumberValue(product.packagingCost, 0) +
      safeNumberValue(product.handlingCost, 0) +
      safeNumberValue(product.otherCosts, 0)
    );
}

function buildInsightProduct(product: Product, recPrice: number, currentMargin: number, recMargin: number): InsightProduct {
  return {
    id: product.id,
    name: product.name || product.sku,
    sku: product.sku,
    category: product.category,
    currentMargin,
    recommendedMargin: recMargin,
    marginGap: recMargin - currentMargin,
    currentPrice: safeNumberValue(product.currentSellingPrice, 0),
    recommendedPrice: recPrice,
    priceGap: recPrice - safeNumberValue(product.currentSellingPrice, 0),
  };
}

function computeInsights(products: Product[], currencyCode: string): Insight[] {
  const insights: Insight[] = [];

  // --- 1. Underpriced Products ---
  const underpriced: InsightProduct[] = [];
  for (const p of products) {
    const currentPrice = safeNumberValue(p.currentSellingPrice, 0);
    if (currentPrice <= 0) continue;
    const recPrice = getEffectiveRecommendedPrice(p);
    if (recPrice <= 0) continue;
    const gap = recPrice - currentPrice;
    const gapPercent = currentPrice > 0 ? (gap / currentPrice) * 100 : 0;
    if (gap >= UNDERPRICED_PRICE_GAP_THRESHOLD && gapPercent >= UNDERPRICED_PERCENT_THRESHOLD) {
      const cost = getEffectiveCost(p);
      const currentMargin = computeMargin(currentPrice, cost);
      const recMargin = computeMargin(recPrice, cost);
      underpriced.push(buildInsightProduct(p, recPrice, currentMargin, recMargin));
    }
  }
  if (underpriced.length > 0) {
    insights.push({
      id: 'underpriced',
      title: 'Underpriced Products',
      description: 'Products where the suggested price is higher — margin improvement opportunity.',
      icon: TrendingUp,
      tone: 'opportunity',
      products: underpriced.sort((a, b) => b.marginGap - a.marginGap),
    });
  }

  // --- 2. Overpriced Products ---
  const overpriced: InsightProduct[] = [];
  for (const p of products) {
    const currentPrice = safeNumberValue(p.currentSellingPrice, 0);
    if (currentPrice <= 0) continue;
    const recPrice = getEffectiveRecommendedPrice(p);
    if (recPrice <= 0) continue;
    const gap = currentPrice - recPrice;
    const gapPercent = currentPrice > 0 ? (gap / currentPrice) * 100 : 0;
    if (gap >= OVERPRICED_PRICE_GAP_THRESHOLD && gapPercent >= OVERPRICED_PERCENT_THRESHOLD) {
      const cost = getEffectiveCost(p);
      const currentMargin = computeMargin(currentPrice, cost);
      const recMargin = computeMargin(recPrice, cost);
      overpriced.push(buildInsightProduct(p, recPrice, currentMargin, recMargin));
    }
  }
  if (overpriced.length > 0) {
    insights.push({
      id: 'overpriced',
      title: 'Overpriced Products',
      description: 'Products where the current price exceeds the suggestion — competitive risk.',
      icon: TrendingDown,
      tone: 'risk',
      products: overpriced.sort((a, b) => b.priceGap - a.priceGap),
    });
  }

  // --- 3. Margin Optimization ---
  const lowMargin: InsightProduct[] = [];
  for (const p of products) {
    const currentPrice = safeNumberValue(p.currentSellingPrice, 0);
    if (currentPrice <= 0) continue;
    const cost = getEffectiveCost(p);
    const currentMargin = computeMargin(currentPrice, cost);
    if (currentMargin < LOW_MARGIN_THRESHOLD && currentMargin > -100) {
      const recPrice = getEffectiveRecommendedPrice(p);
      const recMargin = recPrice > 0 ? computeMargin(recPrice, cost) : currentMargin;
      lowMargin.push(buildInsightProduct(p, recPrice, currentMargin, recMargin));
    }
  }
  if (lowMargin.length > 0) {
    insights.push({
      id: 'low-margin',
      title: 'Margin Optimization',
      description: 'Products with low margins that could be improved with price adjustments.',
      icon: Target,
      tone: 'warning',
      products: lowMargin.sort((a, b) => a.currentMargin - b.currentMargin),
    });
  }

  // --- 4. Pricing Consistency ---
  const categoryMap = new Map<string, { products: InsightProduct[]; margins: number[] }>();
  for (const p of products) {
    const category = p.category?.trim();
    if (!category) continue;
    const currentPrice = safeNumberValue(p.currentSellingPrice, 0);
    if (currentPrice <= 0) continue;
    const cost = getEffectiveCost(p);
    const currentMargin = computeMargin(currentPrice, cost);
    if (!isFinite(currentMargin)) continue;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { products: [], margins: [] });
    }
    const entry = categoryMap.get(category)!;
    const recPrice = getEffectiveRecommendedPrice(p);
    const recMargin = recPrice > 0 ? computeMargin(recPrice, cost) : currentMargin;
    entry.products.push(buildInsightProduct(p, recPrice, currentMargin, recMargin));
    entry.margins.push(currentMargin);
  }

  const inconsistent: InsightProduct[] = [];
  for (const [, entry] of categoryMap) {
    if (entry.margins.length < 2) continue;
    const mean = entry.margins.reduce((s, m) => s + m, 0) / entry.margins.length;
    const variance = entry.margins.reduce((s, m) => s + (m - mean) ** 2, 0) / entry.margins.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > CONSISTENCY_STD_DEV_THRESHOLD) {
      // Only include products that deviate from the mean by more than 1 std dev
      for (const ip of entry.products) {
        if (Math.abs(ip.currentMargin - mean) > stdDev) {
          inconsistent.push(ip);
        }
      }
    }
  }
  if (inconsistent.length > 0) {
    insights.push({
      id: 'consistency',
      title: 'Pricing Consistency',
      description: 'Products in the same category with inconsistent margins — review for uniformity.',
      icon: BarChart3,
      tone: 'info',
      products: inconsistent.sort((a, b) => a.category.localeCompare(b.category)),
    });
  }

  return insights;
}

// ============================================================
// Component
// ============================================================

export function PriceInsightsPanel() {
  const { products, businessSettings, setSelectedProductId, setCurrentView } = usePricePilotStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const currencyCode = businessSettings.currencyCode || 'INR';

  const insights = useMemo(
    () => computeInsights(products, currencyCode),
    [products, currencyCode],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleProductClick = useCallback(
    (productId: string) => {
      setSelectedProductId(productId);
      setCurrentView('products');
    },
    [setSelectedProductId, setCurrentView],
  );

  // Return null when no products exist
  if (products.length === 0) return null;

  // Celebration state when all products are optimally priced
  if (insights.length === 0) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 shadow-soft-emerald">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-3 animate-scale-in">
              <Sparkles className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
              All products are optimally priced! 🎉
            </h3>
            <p className="text-sm text-emerald-600/80 dark:text-emerald-400/70 max-w-sm">
              Your catalog looks great — no significant pricing issues detected. Keep up the good work!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="price-insights-panel">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Price Insights
        </h2>
        <Badge variant="secondary" className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-0">
          {insights.length} {insights.length === 1 ? 'insight' : 'insights'}
        </Badge>
      </div>

      {/* Insight cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-stagger-in">
        {insights.map((insight, idx) => {
          const Icon = insight.icon;
          const tone = TONE_CONFIG[insight.tone];
          const isExpanded = expandedId === insight.id;

          return (
            <div
              key={insight.id}
              className="animate-insight-card-slide"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <Card
                className={`border ${tone.cardBorder} transition-all duration-200 overflow-hidden py-0 ${isExpanded ? 'ring-2 ring-offset-1 ring-emerald-300/50 dark:ring-emerald-700/50' : ''}`}
              >
                {/* Accent bar at top */}
                <div className={`h-1 w-full ${tone.accentBar}`} />

                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${tone.iconBg}`}>
                      <Icon className={`h-5 w-5 ${tone.iconText}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {insight.title}
                        </h3>
                        <Badge className={`text-[10px] px-1.5 py-0 h-5 ${tone.badgeBg} ${tone.badgeText} border-0 font-semibold`}>
                          {insight.products.length}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {insight.description}
                      </p>
                    </div>
                  </div>

                  {/* Toggle expand button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs justify-between px-2 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                    onClick={() => toggleExpand(insight.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`insight-detail-${insight.id}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      {isExpanded ? 'Hide details' : 'View details'}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </Button>

                  {/* Expandable product list */}
                  {isExpanded && (
                    <div
                      id={`insight-detail-${insight.id}`}
                      className="animate-insight-expand space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar"
                      role="list"
                    >
                      {insight.products.map((ip) => (
                        <button
                          key={ip.id}
                          className={`w-full text-left rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 transition-colors ${tone.hoverBg} group`}
                          onClick={() => handleProductClick(ip.id)}
                          role="listitem"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[60%]">
                              {ip.name}
                            </span>
                            <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <span className="text-slate-400 dark:text-slate-500 block">Current</span>
                              <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                                {formatPercentage(ip.currentMargin)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 dark:text-slate-500 block">Suggested</span>
                              <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                                {formatPercentage(ip.recommendedMargin)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 dark:text-slate-500 block">Gap</span>
                              <span
                                className={`font-semibold tabular-nums ${
                                  ip.marginGap > 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : ip.marginGap < 0
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-slate-500'
                                }`}
                              >
                                {ip.marginGap > 0 ? '+' : ''}
                                {formatPercentage(ip.marginGap)}
                              </span>
                            </div>
                          </div>
                          {/* Price row for underpriced/overpriced */}
                          {(insight.id === 'underpriced' || insight.id === 'overpriced') && (
                            <div className="grid grid-cols-2 gap-2 text-[10px] mt-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                              <div>
                                <span className="text-slate-400 dark:text-slate-500 block">Current Price</span>
                                <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                                  {formatCurrency(ip.currentPrice, currencyCode)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 dark:text-slate-500 block">Suggested Price</span>
                                <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                                  {formatCurrency(ip.recommendedPrice, currencyCode)}
                                </span>
                              </div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
