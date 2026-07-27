'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from './status-badge';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { RecommendationMode } from '@/lib/pricepilot/types';
import { AlertTriangle, ArrowUpRight, ArrowDownRight, Calculator } from 'lucide-react';

export function ProductDetailDrawer({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { products, businessSettings, updateProduct } = usePricePilotStore();
  const [selectedMode, setSelectedMode] = useState<RecommendationMode>('balanced');
  const [customPrice, setCustomPrice] = useState<string>('');

  const product = products.find(p => p.id === productId);

  if (!product) {
    return (
      <Sheet open={!!productId} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent className="sm:max-w-xl bg-gradient-to-b from-white to-slate-50/30 overflow-y-auto">
          <SheetHeader><SheetTitle>Product Details</SheetTitle></SheetHeader>
          <div className="py-8 text-center text-muted-foreground">Product not found</div>
        </SheetContent>
      </Sheet>
    );
  }

  const cc = businessSettings.currencyCode;
  const diffFromExisting = (price: number) => price - product.currentSellingPrice;
  const profitAt = (price: number) => price - product.calculatedTotalLandedCost;
  const marginAt = (price: number) => price > 0 ? ((price - product.calculatedTotalLandedCost) / price) * 100 : 0;
  const markupAt = (price: number) => product.calculatedTotalLandedCost > 0 ? ((price - product.calculatedTotalLandedCost) / product.calculatedTotalLandedCost) * 100 : 0;

  const currentPrice = selectedMode === 'custom' && customPrice
    ? parseFloat(customPrice) || 0
    : product.recommendedPrices[selectedMode === 'custom' ? 'balanced' : selectedMode] || product.recommendedPrices.balanced;

  const recCards: { mode: RecommendationMode; label: string; price: number }[] = [
    { mode: 'minimum', label: 'Minimum', price: product.recommendedPrices.minimum },
    { mode: 'competitive', label: 'Competitive', price: product.recommendedPrices.competitive },
    { mode: 'balanced', label: 'Balanced', price: product.recommendedPrices.balanced },
    { mode: 'premium', label: 'Premium', price: product.recommendedPrices.premium },
  ];

  // Cost breakdown items
  const costItems = [
    { label: 'Purchase Cost', value: product.purchaseCost },
    { label: 'Shipping', value: product.shippingCost },
    { label: 'Packaging', value: product.packagingCost },
    { label: 'Handling', value: product.handlingCost },
    { label: 'Marketplace Commission', value: product.currentSellingPrice > 0 ? (product.currentSellingPrice * product.marketplaceFeePercent / 100) : 0, isCalculated: true },
    { label: 'Payment Fee', value: product.currentSellingPrice > 0 ? (product.currentSellingPrice * product.paymentFeePercent / 100) : 0, isCalculated: true },
    { label: 'Expected Returns', value: product.calculatedExpectedReturnCost, isCalculated: true },
    { label: 'Tax', value: product.taxRatePercent > 0 ? (product.currentSellingPrice * product.taxRatePercent / 100) : 0, isCalculated: true },
    { label: 'Other Costs', value: product.otherCosts },
    { label: 'Total Landed Cost', value: product.calculatedTotalLandedCost, isTotal: true },
  ];

  return (
    <Sheet open={!!productId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-xl bg-gradient-to-b from-white to-slate-50/30 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {product.name}
            <StatusBadge status={product.calculatedPricingStatus} />
          </SheetTitle>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>SKU: {product.sku}</span>
            <span>•</span>
            <span>{product.category}</span>
            {product.brand && <><span>•</span><span>{product.brand}</span></>}
          </div>
        </SheetHeader>

        {/* Price summary */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Card className="bg-gradient-to-b from-slate-50 to-white shadow-sm rounded-xl border border-slate-100">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Existing Price</div>
              <div className="text-2xl font-bold">{formatCurrency(product.currentSellingPrice, cc)}</div>
              <div className="text-sm font-medium text-muted-foreground">Margin: {formatPercentage(product.calculatedMarginPercent)}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-b from-emerald-50 to-white shadow-sm rounded-xl border border-emerald-200">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Recommended Price</div>
              <div className="text-2xl font-bold text-emerald-700">{formatCurrency(product.recommendedPrices.balanced, cc)}</div>
              <div className="text-sm font-medium text-emerald-600">
                {diffFromExisting(product.recommendedPrices.balanced) > 0 ? <ArrowUpRight className="h-4 w-4 inline" /> : <ArrowDownRight className="h-4 w-4 inline" />}
                {diffFromExisting(product.recommendedPrices.balanced) > 0 ? '+' : ''}{formatCurrency(diffFromExisting(product.recommendedPrices.balanced), cc)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost breakdown */}
        <Card className="mt-4 shadow-md border-0 rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-slate-500" />
              Cost Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {costItems.map(item => (
              <div key={item.label} className={`flex justify-between py-2 text-sm ${item.isTotal ? 'font-bold text-lg border-t-2 border-emerald-500 pt-2' : ''}`}>
                <span className={item.isCalculated ? 'text-slate-500' : ''}>{item.label}</span>
                <span>{formatCurrency(item.value, cc)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recommendation cards */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Price Recommendations</h3>
          <div className="grid grid-cols-2 gap-3">
            {recCards.map(card => {
              const isSelected = selectedMode === card.mode;
              const diff = diffFromExisting(card.price);
              return (
                <Card
                  key={card.mode}
                  className={`cursor-pointer transition-all duration-200 bg-white shadow-sm rounded-lg border border-slate-100 hover:shadow-md hover:border-emerald-200 ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50 border-emerald-300 shadow-md' : ''}`}
                  onClick={() => { setSelectedMode(card.mode); setCustomPrice(''); }}
                >
                  <CardContent className="p-3">
                    <div className="text-sm font-semibold mb-1">{card.label}</div>
                    <div className="text-lg font-bold">{formatCurrency(card.price, cc)}</div>
                    <div className="text-xs text-slate-500">
                      Profit: {formatCurrency(profitAt(card.price), cc)} | Margin: {formatPercentage(marginAt(card.price))}
                    </div>
                    <div className={`text-xs mt-1 flex items-center gap-1 ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                      {diff > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : diff < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                      {diff > 0 ? '+' : ''}{formatCurrency(diff, cc)} vs existing
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Custom price input */}
          <div className="mt-3">
            <Label htmlFor="customPrice" className="text-sm font-medium text-slate-600">Custom Price</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="customPrice"
                type="number"
                value={customPrice}
                onChange={e => { setCustomPrice(e.target.value); if (e.target.value) setSelectedMode('custom'); }}
                placeholder="Enter custom price"
                className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
              />
              {customPrice && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Margin: </span>
                  <span className="font-semibold">{formatPercentage(marginAt(parseFloat(customPrice) || 0))}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Warnings */}
        {(product.calculatedProfitPerUnit < 0 || product.calculatedMarginPercent < businessSettings.defaultMinimumMarginPercent) && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Warnings
            </h3>
            <div className="space-y-2">
              {product.calculatedProfitPerUnit < 0 && (
                <div className="p-3 bg-red-50/50 border border-red-200 rounded-lg text-sm text-red-700">
                  This product is selling at a loss of {formatCurrency(Math.abs(product.calculatedProfitPerUnit), cc)} per unit.
                </div>
              )}
              {product.calculatedMarginPercent < businessSettings.defaultMinimumMarginPercent && product.calculatedProfitPerUnit >= 0 && (
                <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  Margin ({formatPercentage(product.calculatedMarginPercent)}) is below your minimum threshold ({formatPercentage(businessSettings.defaultMinimumMarginPercent)}).
                </div>
              )}
            </div>
          </div>
        )}

        {/* Apply button */}
        <div className="mt-4 flex gap-2">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-lg font-semibold"
            onClick={() => {
              const newPrice = selectedMode === 'custom' ? parseFloat(customPrice) || product.currentSellingPrice : currentPrice;
              updateProduct(product.id, { currentSellingPrice: newPrice });
              onClose();
            }}
          >
            Apply {formatCurrency(currentPrice, cc)} as selling price
          </Button>
          <Button variant="outline" className="bg-white border-slate-200 shadow-sm rounded-lg hover:bg-slate-50" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ProductDetailDrawer;
