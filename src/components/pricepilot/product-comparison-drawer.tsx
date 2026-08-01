'use client';

import { useState, useMemo, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from './status-badge';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import { Product, PricingStatus } from '@/lib/pricepilot/types';
import {
  ArrowLeftRight, Search, X, Trophy, TrendingUp, Crown, Plus, Minus, BarChart3, Sparkles,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Label,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────

type ComparisonValueType = 'currency' | 'percent' | 'number' | 'text' | 'status';

interface ComparisonRow {
  label: string;
  key: string;
  getValue: (p: Product) => string | number;
  type: ComparisonValueType;
  /** For numeric types: "higher-is-better" or "lower-is-better" */
  bestDirection: 'higher-is-better' | 'lower-is-better' | 'neutral';
}

interface ProductComparisonDrawerProps {
  /** Product IDs to compare (2-4). Pass null to close. */
  productIds: string[] | null;
  onClose: () => void;
}

// ── Color palette for up to 4 products ─────────────────────────────────

const PRODUCT_COLORS = [
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', accent: 'text-emerald-600', bar: '#10b981', headerBg: 'from-emerald-50 to-emerald-100/50' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', accent: 'text-amber-600', bar: '#f59e0b', headerBg: 'from-amber-50 to-amber-100/50' },
  { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', accent: 'text-teal-600', bar: '#14b8a6', headerBg: 'from-teal-50 to-teal-100/50' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', accent: 'text-rose-600', bar: '#f43f5e', headerBg: 'from-rose-50 to-rose-100/50' },
];

// ── Comparison rows definition ──────────────────────────────────────────

const COMPARISON_ROWS: ComparisonRow[] = [
  { label: 'Product Name', key: 'name', getValue: p => p.name, type: 'text', bestDirection: 'neutral' },
  { label: 'SKU', key: 'sku', getValue: p => p.sku, type: 'text', bestDirection: 'neutral' },
  { label: 'Category', key: 'category', getValue: p => p.category, type: 'text', bestDirection: 'neutral' },
  { label: 'Brand', key: 'brand', getValue: p => p.brand, type: 'text', bestDirection: 'neutral' },
  { label: 'Purchase Cost', key: 'purchaseCost', getValue: p => p.purchaseCost, type: 'currency', bestDirection: 'lower-is-better' },
  { label: 'Current Selling Price', key: 'currentSellingPrice', getValue: p => p.currentSellingPrice, type: 'currency', bestDirection: 'neutral' },
  { label: 'Recommended Price (Balanced)', key: 'recommendedPrice', getValue: p => p.recommendedPrices.balanced, type: 'currency', bestDirection: 'neutral' },
  { label: 'Current Margin', key: 'margin', getValue: p => p.calculatedMarginPercent, type: 'percent', bestDirection: 'higher-is-better' },
  { label: 'Potential Margin', key: 'potentialMargin', getValue: p => {
    const rec = safeNumberValue(p.recommendedPrices.balanced);
    const cost = safeNumberValue(p.calculatedTotalLandedCost);
    if (rec <= 0 || cost <= 0) return 0;
    return ((rec - cost) / rec) * 100;
  }, type: 'percent', bestDirection: 'higher-is-better' },
  { label: 'Profit per Unit', key: 'profit', getValue: p => p.calculatedProfitPerUnit, type: 'currency', bestDirection: 'higher-is-better' },
  { label: 'Status', key: 'status', getValue: p => p.calculatedPricingStatus, type: 'status', bestDirection: 'neutral' },
];

// ── Component ───────────────────────────────────────────────────────────

export function ProductComparisonDrawer({ productIds, onClose }: ProductComparisonDrawerProps) {
  const { products, businessSettings } = usePricePilotStore();
  const cc = businessSettings.currencyCode;

  // Search state for adding products
  const [searchQuery, setSearchQuery] = useState('');

  // Resolve selected products
  const selectedProducts = useMemo(() => {
    if (!productIds) return [];
    return productIds.map(id => products.find(p => p.id === id)).filter((p): p is Product => p != null);
  }, [productIds, products]);

  const isOpen = productIds !== null && selectedProducts.length >= 2;

  // Filtered product list for search dropdown (exclude already selected)
  const availableProducts = useMemo(() => {
    const selectedIdSet = new Set(productIds ?? []);
    return products.filter(p => !selectedIdSet.has(p.id));
  }, [products, productIds]);

  const filteredAvailable = useMemo(() => {
    if (!searchQuery.trim()) return availableProducts.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return availableProducts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [availableProducts, searchQuery]);

  // ── Determine best value per row ─────────────────────────────────────

  const getBestIndex = useCallback((row: ComparisonRow, prods: Product[]): number => {
    if (row.bestDirection === 'neutral' || row.type === 'text' || row.type === 'status' || prods.length < 2) return -1;
    const values = prods.map(p => safeNumberValue(row.getValue(p), -Infinity));
    if (row.bestDirection === 'higher-is-better') {
      const max = Math.max(...values);
      return values.indexOf(max);
    } else {
      const min = Math.min(...values.filter(v => v !== -Infinity));
      if (min === Infinity) return -1;
      return values.indexOf(min);
    }
  }, []);

  // ── Verdict: most profitable product ─────────────────────────────────

  const verdict = useMemo(() => {
    if (selectedProducts.length < 2) return null;
    // Score each product by margin + profit
    const scores = selectedProducts.map(p => ({
      product: p,
      score: safeNumberValue(p.calculatedMarginPercent) + safeNumberValue(p.calculatedProfitPerUnit) * 0.1,
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores[0];
  }, [selectedProducts]);

  // ── Chart data ───────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    return selectedProducts.map((p, i) => ({
      name: p.name.length > 15 ? p.name.slice(0, 14) + '…' : p.name,
      currentMargin: Math.round(safeNumberValue(p.calculatedMarginPercent, 0) * 10) / 10,
      potentialMargin: Math.round((() => {
        const rec = safeNumberValue(p.recommendedPrices.balanced);
        const cost = safeNumberValue(p.calculatedTotalLandedCost);
        if (rec <= 0 || cost <= 0) return 0;
        return ((rec - cost) / rec) * 100;
      })() * 10) / 10,
      fill: PRODUCT_COLORS[i % PRODUCT_COLORS.length].bar,
    }));
  }, [selectedProducts]);

  // ── Format value ─────────────────────────────────────────────────────

  const formatValue = (value: string | number, type: ComparisonValueType) => {
    if (type === 'currency') return formatCurrency(safeNumberValue(value), cc);
    if (type === 'percent') return formatPercentage(safeNumberValue(value));
    if (type === 'number') return formatPercentage(safeNumberValue(value));
    if (type === 'status') return <StatusBadge status={value as PricingStatus} />;
    return String(value);
  };

  // ── Add/Remove product helpers ───────────────────────────────────────

  // We need to communicate product additions back to the parent.
  // We'll use a callback pattern: pass productIds from parent, and
  // the parent controls the state. For add/remove we call onClose
  // and the parent can re-open. Instead, let's use a simpler approach:
  // we manage the IDs internally once opened.

  // Actually, the simplest approach: we expose add/remove via a local
  // state that's initialized from productIds, and the parent syncs.

  // For this implementation, we'll keep it simple: the parent manages
  // the IDs, and we just render what's given. We can add a "remove"
  // button that calls a callback, and show available products to add.

  // Since the parent passes productIds, we need a way to add/remove.
  // We'll use a local state that syncs from props.

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-[90vw] lg:max-w-[1100px] bg-gradient-to-b from-white to-slate-50/30 overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-emerald-600" />
            Product Comparison
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-500">
            Side-by-side comparison of {selectedProducts.length} products
          </SheetDescription>
        </SheetHeader>

        {selectedProducts.length >= 2 && (
          <div className="mt-4 space-y-6">
            {/* ── Product Header Cards ─────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {selectedProducts.map((product, idx) => {
                const color = PRODUCT_COLORS[idx % PRODUCT_COLORS.length];
                const isWinner = verdict?.product.id === product.id;
                return (
                  <Card
                    key={product.id}
                    className={`shadow-sm border ${color.border} bg-gradient-to-r ${color.headerBg} relative overflow-hidden transition-all duration-200 hover:shadow-md`}
                  >
                    {isWinner && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-gradient-to-r from-amber-400 to-amber-500 text-white rounded-lg shadow-md animate-pulse text-xs font-bold px-2 py-0.5 gap-1">
                          <Crown className="h-3 w-3" /> Winner
                        </Badge>
                      </div>
                    )}
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`h-3 w-3 rounded-full ${color.bg} ring-2 ${color.border}`} />
                        <div className="font-bold text-slate-800 truncate text-sm">{product.name}</div>
                      </div>
                      <div className="text-xs text-slate-500">{product.sku}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{product.category} · {product.brand}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* ── Comparison Table ──────────────────────────────────────── */}
            <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-slate-50/20">
              <CardContent className="p-0">
                {/* Desktop: side-by-side table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4 w-[180px]">Attribute</th>
                        {selectedProducts.map((product, idx) => {
                          const color = PRODUCT_COLORS[idx % PRODUCT_COLORS.length];
                          return (
                            <th key={product.id} className={`text-center text-xs font-semibold ${color.text} uppercase tracking-wider py-3 px-4`}>
                              <div className="flex items-center justify-center gap-1.5">
                                <div className={`h-2.5 w-2.5 rounded-full ${color.bg} ring-2 ${color.border}`} />
                                {product.name.length > 20 ? product.name.slice(0, 19) + '…' : product.name}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {COMPARISON_ROWS.map((row) => {
                        const bestIdx = getBestIndex(row, selectedProducts);
                        return (
                          <tr key={row.key} className="transition-colors hover:bg-slate-50/50">
                            <td className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-4">
                              {row.label}
                            </td>
                            {selectedProducts.map((product, idx) => {
                              const value = row.getValue(product);
                              const isBest = idx === bestIdx;
                              const color = PRODUCT_COLORS[idx % PRODUCT_COLORS.length];
                              let cellClass = 'text-sm text-slate-700';
                              if (isBest) {
                                cellClass = 'text-sm font-bold text-emerald-700';
                              }
                              return (
                                <td key={product.id} className={`text-center py-2.5 px-4 ${cellClass}`}>
                                  <div className="flex items-center justify-center gap-1">
                                    {formatValue(value, row.type)}
                                    {isBest && (
                                      <span className="inline-flex items-center gap-0.5">
                                        {row.bestDirection === 'higher-is-better' ? (
                                          <TrendingUp className="h-3 w-3 text-emerald-600" />
                                        ) : (
                                          <TrendingUp className="h-3 w-3 text-emerald-600 rotate-180" />
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: stacked comparison */}
                <div className="md:hidden divide-y divide-slate-100">
                  {COMPARISON_ROWS.map((row) => {
                    const bestIdx = getBestIndex(row, selectedProducts);
                    return (
                      <div key={row.key} className="px-4 py-3">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                          {row.label}
                        </div>
                        <div className="space-y-1.5">
                          {selectedProducts.map((product, idx) => {
                            const value = row.getValue(product);
                            const isBest = idx === bestIdx;
                            const color = PRODUCT_COLORS[idx % PRODUCT_COLORS.length];
                            return (
                              <div key={product.id} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${color.bg} ring-2 ${color.border}`} />
                                  <span className="text-xs text-slate-500 truncate max-w-[80px]">{product.name.length > 12 ? product.name.slice(0, 11) + '…' : product.name}</span>
                                </div>
                                <div className={`text-sm ${isBest ? 'font-bold text-emerald-700' : 'text-slate-700'}`}>
                                  <div className="flex items-center gap-1">
                                    {formatValue(value, row.type)}
                                    {isBest && <TrendingUp className="h-3 w-3 text-emerald-600" />}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* ── Margin Comparison Bar Chart ───────────────────────────── */}
            <Card className="shadow-md border-0 bg-gradient-to-b from-white to-slate-50/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-700">Margin Comparison</h3>
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={4} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                        width={45}
                      >
                        <Label value="Margin (%)" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fontSize: 11, fill: '#94a3b8' }} />
                      </YAxis>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) => {
                          const label = name === 'currentMargin' ? 'Current Margin' : 'Potential Margin';
                          return [`${value}%`, label];
                        }}
                      />
                      <Bar dataKey="currentMargin" name="currentMargin" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        {chartData.map((entry, index) => (
                          <Cell key={`current-${index}`} fill={entry.fill} opacity={0.9} />
                        ))}
                      </Bar>
                      <Bar dataKey="potentialMargin" name="potentialMargin" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        {chartData.map((entry, index) => (
                          <Cell key={`potential-${index}`} fill={entry.fill} opacity={0.4} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 mt-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <div className="h-2.5 w-6 rounded bg-emerald-500 opacity-90" />
                    Current Margin
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <div className="h-2.5 w-6 rounded bg-emerald-500 opacity-40" />
                    Potential Margin
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Verdict Section ───────────────────────────────────────── */}
            {verdict && (
              <Card className="shadow-md border-0 bg-gradient-to-r from-emerald-50/50 via-amber-50/30 to-emerald-50/50 overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    <h3 className="text-base font-bold text-slate-800">Verdict</h3>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center shadow-lg">
                        <Crown className="h-7 w-7 text-amber-600" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-slate-800">{verdict.product.name}</span>
                        <Badge className="bg-gradient-to-r from-amber-400 to-amber-500 text-white rounded-lg shadow-sm text-xs font-bold px-2 py-0.5 gap-1">
                          <Sparkles className="h-3 w-3" /> Most Profitable
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">
                        This product has the best overall profitability based on margin and profit per unit.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Current Margin:</span>
                          <span className="text-sm font-bold text-emerald-700">
                            {formatPercentage(safeNumberValue(verdict.product.calculatedMarginPercent))}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Profit per Unit:</span>
                          <span className="text-sm font-bold text-emerald-700">
                            {formatCurrency(safeNumberValue(verdict.product.calculatedProfitPerUnit), cc)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Status:</span>
                          <StatusBadge status={verdict.product.calculatedPricingStatus} />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Key Differences Summary ───────────────────────────────── */}
            {selectedProducts.length === 2 && (
              <Card className="shadow-sm border-0 bg-gradient-to-b from-emerald-50/30 to-white">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowLeftRight className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-semibold text-slate-700">Key Differences</h3>
                  </div>
                  <div className="space-y-1.5">
                    {(() => {
                      const [a, b] = selectedProducts;
                      const diffs: React.ReactNode[] = [];
                      if (Math.abs(a.calculatedMarginPercent - b.calculatedMarginPercent) > 0.01) {
                        diffs.push(
                          <div key="margin" className="text-xs text-slate-600 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs rounded-md border-emerald-200">Margin</Badge>
                            <span>
                              Difference of {formatPercentage(Math.abs(a.calculatedMarginPercent - b.calculatedMarginPercent))}
                              {a.calculatedMarginPercent > b.calculatedMarginPercent
                                ? ` — ${a.name} leads`
                                : ` — ${b.name} leads`
                              }
                            </span>
                          </div>
                        );
                      }
                      if (Math.abs(a.calculatedProfitPerUnit - b.calculatedProfitPerUnit) > 0.01) {
                        diffs.push(
                          <div key="profit" className="text-xs text-slate-600 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs rounded-md border-emerald-200">Profit</Badge>
                            <span>
                              Difference of {formatCurrency(Math.abs(a.calculatedProfitPerUnit - b.calculatedProfitPerUnit), cc)}
                              {a.calculatedProfitPerUnit > b.calculatedProfitPerUnit
                                ? ` — ${a.name} leads`
                                : ` — ${b.name} leads`
                              }
                            </span>
                          </div>
                        );
                      }
                      if (Math.abs(a.currentSellingPrice - b.currentSellingPrice) > 0.01) {
                        diffs.push(
                          <div key="price" className="text-xs text-slate-600 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs rounded-md border-emerald-200">Price</Badge>
                            <span>
                              Difference of {formatCurrency(Math.abs(a.currentSellingPrice - b.currentSellingPrice), cc)}
                            </span>
                          </div>
                        );
                      }
                      if (Math.abs(a.purchaseCost - b.purchaseCost) > 0.01) {
                        diffs.push(
                          <div key="cost" className="text-xs text-slate-600 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs rounded-md border-emerald-200">Cost</Badge>
                            <span>
                              Difference of {formatCurrency(Math.abs(a.purchaseCost - b.purchaseCost), cc)}
                            </span>
                          </div>
                        );
                      }
                      return diffs.length > 0 ? diffs : (
                        <div className="text-xs text-slate-400">No significant differences found</div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default ProductComparisonDrawer;
