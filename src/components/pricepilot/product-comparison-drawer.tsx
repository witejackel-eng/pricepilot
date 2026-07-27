'use client';

import { usePricePilotStore } from '@/store/pricepilot-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from './status-badge';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { ArrowLeftRight } from 'lucide-react';
import { PricingStatus } from '@/lib/pricepilot/types';

// Explicit comparison value type union (fixes TS inference issue)
type ComparisonValueType = 'currency' | 'percent' | 'number' | 'text' | 'status';

interface ComparisonRow {
  label: string;
  valueA: string | number;
  valueB: string | number;
  type: ComparisonValueType;
}

interface ProductComparisonDrawerProps {
  productIds: [string, string] | null;
  onClose: () => void;
}

export function ProductComparisonDrawer({ productIds, onClose }: ProductComparisonDrawerProps) {
  const { products, businessSettings } = usePricePilotStore();
  const cc = businessSettings.currencyCode;

  const productA = productIds ? products.find(p => p.id === productIds[0]) : null;
  const productB = productIds ? products.find(p => p.id === productIds[1]) : null;

  const isOpen = productIds !== null && productA !== null && productB !== null;

  // Comparison rows
  const comparisonRows: ComparisonRow[] = [
    { label: 'Name', valueA: productA?.name || '', valueB: productB?.name || '', type: 'text' },
    { label: 'SKU', valueA: productA?.sku || '', valueB: productB?.sku || '', type: 'text' },
    { label: 'Category', valueA: productA?.category || '', valueB: productB?.category || '', type: 'text' },
    { label: 'Brand', valueA: productA?.brand || '', valueB: productB?.brand || '', type: 'text' },
    { label: 'Purchase Cost', valueA: productA?.purchaseCost || 0, valueB: productB?.purchaseCost || 0, type: 'currency' },
    { label: 'Total Landed Cost', valueA: productA?.calculatedTotalLandedCost || 0, valueB: productB?.calculatedTotalLandedCost || 0, type: 'currency' },
    { label: 'Current Price', valueA: productA?.currentSellingPrice || 0, valueB: productB?.currentSellingPrice || 0, type: 'currency' },
    { label: 'Recommended Price', valueA: productA?.recommendedPrices.balanced || 0, valueB: productB?.recommendedPrices.balanced || 0, type: 'currency' },
    { label: 'Profit', valueA: productA?.calculatedProfitPerUnit || 0, valueB: productB?.calculatedProfitPerUnit || 0, type: 'currency' },
    { label: 'Margin', valueA: productA?.calculatedMarginPercent || 0, valueB: productB?.calculatedMarginPercent || 0, type: 'percent' },
    { label: 'Markup', valueA: productA?.calculatedMarkupPercent || 0, valueB: productB?.calculatedMarkupPercent || 0, type: 'percent' },
    { label: 'Status', valueA: productA?.calculatedPricingStatus || 'missing-data', valueB: productB?.calculatedPricingStatus || 'missing-data', type: 'status' },
  ];

  const formatValue = (value: string | number, type: ComparisonValueType) => {
    if (type === 'currency') return formatCurrency(value as number, cc);
    if (type === 'percent' || type === 'number') return formatPercentage(value as number);
    if (type === 'status') return <StatusBadge status={value as PricingStatus} />;
    return value as string;
  };

  // Determine if a difference is significant (for highlighting)
  const isSignificantDiff = (row: typeof comparisonRows[number]) => {
    if (row.type === 'currency' || row.type === 'percent') {
      const a = row.valueA as number;
      const b = row.valueB as number;
      const diff = Math.abs(a - b);
      // Significant if difference > 10% of the larger value, or absolute diff > 5
      if (a === 0 && b === 0) return false;
      const maxVal = Math.max(Math.abs(a), Math.abs(b));
      return diff > maxVal * 0.1 || diff > 5;
    }
    if (row.type === 'text') {
      return (row.valueA as string) !== (row.valueB as string);
    }
    return false;
  };

  const getDiffColor = (row: typeof comparisonRows[number]) => {
    if (!isSignificantDiff(row)) return '';
    if (row.type === 'currency') {
      const a = row.valueA as number;
      const b = row.valueB as number;
      if (row.label === 'Profit') {
        // For profit, higher is better → green for the winner
        return a > b ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold';
      }
      // For costs, lower is better → highlight the higher one
      if (row.label.includes('Cost')) {
        return a > b ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold';
      }
      // For margins/percentages, higher is generally better
      if (row.type === 'percent') {
        return a > b ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold';
      }
    }
    if (row.type === 'percent') {
      const a = row.valueA as number;
      const b = row.valueB as number;
      return a > b ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold';
    }
    if (row.type === 'text') {
      return 'text-amber-700 font-semibold';
    }
    return '';
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-3xl bg-gradient-to-b from-white to-slate-50/30 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-emerald-600" />
            Product Comparison
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-500">
            Side-by-side comparison of two products
          </SheetDescription>
        </SheetHeader>

        {productA && productB && (
          <div className="mt-4 space-y-4">
            {/* Product Headers */}
            <div className="grid grid-cols-3 gap-2 items-center">
              <Card className="shadow-sm border-0 bg-gradient-to-r from-emerald-50 to-emerald-100/50">
                <CardContent className="p-3 text-center">
                  <div className="font-bold text-slate-800 truncate">{productA.name}</div>
                  <div className="text-xs text-slate-500">{productA.sku}</div>
                </CardContent>
              </Card>
              <div className="flex items-center justify-center">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-200 to-slate-100 flex items-center justify-center shadow-sm">
                  <ArrowLeftRight className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
              <Card className="shadow-sm border-0 bg-gradient-to-r from-slate-50 to-slate-100/50">
                <CardContent className="p-3 text-center">
                  <div className="font-bold text-slate-800 truncate">{productB.name}</div>
                  <div className="text-xs text-slate-500">{productB.sku}</div>
                </CardContent>
              </Card>
            </div>

            {/* Tags comparison */}
            {(productA.tags.length > 0 || productB.tags.length > 0) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Tags</div>
                  <div className="flex gap-1 flex-wrap">
                    {productA.tags.length > 0
                      ? productA.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="rounded-md text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {tag}
                        </Badge>
                      ))
                      : <span className="text-xs text-slate-400">No tags</span>
                    }
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Tags</div>
                  <div className="flex gap-1 flex-wrap">
                    {productB.tags.length > 0
                      ? productB.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="rounded-md text-xs bg-slate-50 text-slate-700 border border-slate-200">
                          {tag}
                        </Badge>
                      ))
                      : <span className="text-xs text-slate-400">No tags</span>
                    }
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Comparison table */}
            <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-slate-50/20">
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {comparisonRows.map((row) => {
                    const diffSignificant = isSignificantDiff(row);
                    const diffColorA = diffSignificant ? getDiffColor(row) : '';
                    // Reverse the color logic for B (if A is green, B is red)
                    const diffColorB = diffSignificant && row.type !== 'status' && row.type !== 'text'
                      ? (diffColorA.includes('emerald') ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold')
                      : diffSignificant && row.type === 'text' ? 'text-amber-700 font-semibold' : '';

                    return (
                      <div key={row.label} className={`grid grid-cols-3 gap-2 py-2.5 px-4 items-center transition-colors ${diffSignificant ? 'bg-amber-50/30' : 'bg-white'}`}>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {row.label}
                        </div>
                        <div className={`text-right text-sm ${diffColorA || 'text-slate-700'}`}>
                          {formatValue(row.valueA, row.type)}
                        </div>
                        <div className={`text-right text-sm ${diffColorB || 'text-slate-700'}`}>
                          {formatValue(row.valueB, row.type)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Difference summary */}
            <Card className="shadow-sm border-0 bg-gradient-to-b from-emerald-50/30 to-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowLeftRight className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-700">Key Differences</h3>
                </div>
                <div className="space-y-1.5">
                  {productA.calculatedMarginPercent !== productB.calculatedMarginPercent && (
                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs rounded-md border-emerald-200">Margin</Badge>
                      <span>
                        Difference of {formatPercentage(Math.abs(productA.calculatedMarginPercent - productB.calculatedMarginPercent))}
                        {productA.calculatedMarginPercent > productB.calculatedMarginPercent
                          ? ` — ${productA.name} leads`
                          : ` — ${productB.name} leads`
                        }
                      </span>
                    </div>
                  )}
                  {productA.calculatedProfitPerUnit !== productB.calculatedProfitPerUnit && (
                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs rounded-md border-emerald-200">Profit</Badge>
                      <span>
                        Difference of {formatCurrency(Math.abs(productA.calculatedProfitPerUnit - productB.calculatedProfitPerUnit), cc)}
                        {productA.calculatedProfitPerUnit > productB.calculatedProfitPerUnit
                          ? ` — ${productA.name} leads`
                          : ` — ${productB.name} leads`
                        }
                      </span>
                    </div>
                  )}
                  {productA.currentSellingPrice !== productB.currentSellingPrice && (
                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs rounded-md border-emerald-200">Price</Badge>
                      <span>
                        Difference of {formatCurrency(Math.abs(productA.currentSellingPrice - productB.currentSellingPrice), cc)}
                      </span>
                    </div>
                  )}
                  {productA.calculatedTotalLandedCost !== productB.calculatedTotalLandedCost && (
                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs rounded-md border-emerald-200">Landed Cost</Badge>
                      <span>
                        Difference of {formatCurrency(Math.abs(productA.calculatedTotalLandedCost - productB.calculatedTotalLandedCost), cc)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default ProductComparisonDrawer;
