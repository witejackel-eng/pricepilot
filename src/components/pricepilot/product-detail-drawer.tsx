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
import { AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export function ProductDetailDrawer({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { products, businessSettings, updateProduct } = usePricePilotStore();
  const [selectedMode, setSelectedMode] = useState<RecommendationMode>('balanced');
  const [customPrice, setCustomPrice] = useState<string>('');

  const product = products.find(p => p.id === productId);

  if (!product) {
    return (
      <Sheet open={!!productId} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent className="sm:max-w-lg">
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
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {product.name}
            <StatusBadge status={product.calculatedPricingStatus} />
          </SheetTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>SKU: {product.sku}</span>
            <span>•</span>
            <span>{product.category}</span>
            {product.brand && <><span>•</span><span>{product.brand}</span></>}
          </div>
        </SheetHeader>

        {/* Price summary */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Card className="bg-slate-50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Existing Price</div>
              <div className="text-lg font-semibold">{formatCurrency(product.currentSellingPrice, cc)}</div>
              <div className="text-xs text-muted-foreground">Margin: {formatPercentage(product.calculatedMarginPercent)}</div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Recommended Price</div>
              <div className="text-lg font-semibold text-emerald-700">{formatCurrency(product.recommendedPrices.balanced, cc)}</div>
              <div className="text-xs text-emerald-600">
                {diffFromExisting(product.recommendedPrices.balanced) > 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
                {diffFromExisting(product.recommendedPrices.balanced) > 0 ? '+' : ''}{formatCurrency(diffFromExisting(product.recommendedPrices.balanced), cc)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost breakdown */}
        <Card className="mt-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cost Breakdown</CardTitle></CardHeader>
          <CardContent className="p-2">
            {costItems.map(item => (
              <div key={item.label} className={`flex justify-between py-1 text-sm ${item.isTotal ? 'font-bold border-t mt-1 pt-1' : ''}`}>
                <span className={item.isCalculated ? 'text-muted-foreground' : ''}>{item.label}</span>
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
                  className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-emerald-500 border-emerald-300' : ''}`}
                  onClick={() => { setSelectedMode(card.mode); setCustomPrice(''); }}
                >
                  <CardContent className="p-3">
                    <div className="text-xs font-medium mb-1">{card.label}</div>
                    <div className="text-base font-bold">{formatCurrency(card.price, cc)}</div>
                    <div className="text-xs text-muted-foreground">
                      Profit: {formatCurrency(profitAt(card.price), cc)} | Margin: {formatPercentage(marginAt(card.price))}
                    </div>
                    <div className={`text-xs mt-1 ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {diff > 0 ? '+' : ''}{formatCurrency(diff, cc)} vs existing
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Custom price input */}
          <div className="mt-3">
            <Label htmlFor="customPrice" className="text-sm">Custom Price</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="customPrice"
                type="number"
                value={customPrice}
                onChange={e => { setCustomPrice(e.target.value); if (e.target.value) setSelectedMode('custom'); }}
                placeholder="Enter custom price"
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
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Warnings
            </h3>
            <div className="space-y-2">
              {product.calculatedProfitPerUnit < 0 && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
                  This product is selling at a loss of {formatCurrency(Math.abs(product.calculatedProfitPerUnit), cc)} per unit.
                </div>
              )}
              {product.calculatedMarginPercent < businessSettings.defaultMinimumMarginPercent && product.calculatedProfitPerUnit >= 0 && (
                <div className="p-2 rounded bg-amber-50 border border-amber-200 text-sm text-amber-700">
                  Margin ({formatPercentage(product.calculatedMarginPercent)}) is below your minimum threshold ({formatPercentage(businessSettings.defaultMinimumMarginPercent)}).
                </div>
              )}
            </div>
          </div>
        )}

        {/* Apply button */}
        <div className="mt-4 flex gap-2">
          <Button
            className="w-full"
            onClick={() => {
              const newPrice = selectedMode === 'custom' ? parseFloat(customPrice) || product.currentSellingPrice : currentPrice;
              updateProduct(product.id, { currentSellingPrice: newPrice });
              onClose();
            }}
          >
            Apply {formatCurrency(currentPrice, cc)} as selling price
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ProductDetailDrawer;
