'use client';

import { useState, useMemo, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Product, PricingStatus } from '@/lib/pricepilot/types';
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  CheckCheck,
  X,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';

type TabKey = 'action-required' | 'ready-to-approve' | 'recently-approved' | 'all';

function getStatusLabel(status: PricingStatus): string {
  switch (status) {
    case 'loss-making': return 'Loss-making';
    case 'below-break-even': return 'Below break-even';
    case 'missing-data': return 'Missing data';
    case 'needs-review': return 'Needs review';
    case 'low-margin': return 'Low margin';
    case 'healthy': return 'Healthy';
    case 'high-margin': return 'High margin';
    case 'above-market': return 'Above market';
    case 'approved': return 'Approved';
    default: return status;
  }
}

function getProblemDescription(product: Product): string {
  if (!product.purchaseCost) return 'Missing purchase cost — cannot calculate pricing';
  if (!product.currentSellingPrice) return 'Missing selling price';
  if (product.recommendedPrices.balanced === 0) return 'Recommendation unavailable — pricing target is impossible under current costs and fees';
  if (product.calculatedPricingStatus === 'loss-making') return `Selling at a loss — profit is ${formatCurrency(product.calculatedProfitPerUnit, 'INR')}`;
  if (product.calculatedPricingStatus === 'below-break-even') return 'Below break-even — not covering costs + minimum margin';
  if (product.calculatedPricingStatus === 'low-margin') return `Low margin (${formatPercentage(product.calculatedMarginPercent)}) — below your minimum threshold`;
  if (product.calculatedPricingStatus === 'missing-data') return 'Critical data missing for pricing calculation';
  if (product.calculatedPricingStatus === 'needs-review') return 'Flagged for manual review';
  if (product.recommendedPrices.confidence === 'low') return 'Low confidence recommendation — verify product data';
  return 'Needs your attention';
}

// Map pricing status to a problem-specific badge label (not the raw calculated status)
function getProblemBadgeLabel(product: Product): { label: string; color: string; dotColor: string } {
  if (!product.purchaseCost) return { label: 'Needs Cost', color: 'text-red-700 border-red-300 bg-red-100', dotColor: 'bg-red-500' };
  if (!product.currentSellingPrice) return { label: 'Missing Price', color: 'text-red-700 border-red-300 bg-red-100', dotColor: 'bg-red-500' };
  if (product.recommendedPrices.balanced === 0) return { label: 'Impossible', color: 'text-red-700 border-red-300 bg-red-100', dotColor: 'bg-red-500' };
  if (product.calculatedPricingStatus === 'loss-making') return { label: 'Losing Money', color: 'text-red-700 border-red-300 bg-red-100', dotColor: 'bg-red-500' };
  if (product.calculatedPricingStatus === 'below-break-even') return { label: 'Below Break-even', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
  if (product.calculatedPricingStatus === 'low-margin') return { label: 'Low Profit', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
  if (product.calculatedPricingStatus === 'missing-data') return { label: 'Missing Data', color: 'text-slate-700 border-slate-300 bg-slate-100', dotColor: 'bg-slate-400' };
  if (product.calculatedPricingStatus === 'needs-review') return { label: 'Needs Review', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
  if (product.recommendedPrices.confidence === 'low') return { label: 'Low Confidence', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
  return { label: 'Needs Attention', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
}

function hasProductProblems(p: Product): boolean {
  return (
    !p.purchaseCost ||
    !p.currentSellingPrice ||
    p.calculatedPricingStatus === 'loss-making' ||
    p.calculatedPricingStatus === 'below-break-even' ||
    p.calculatedPricingStatus === 'missing-data' ||
    p.calculatedPricingStatus === 'needs-review' ||
    p.calculatedPricingStatus === 'low-margin' ||
    p.recommendedPrices.balanced === 0 ||
    p.recommendedPrices.confidence === 'low'
  );
}

function priceChange(current: number, recommended: number): number {
  if (current <= 0) return 0;
  return ((recommended - current) / current) * 100;
}

interface ProductCardProps {
  product: Product;
  isSelected: boolean;
  onToggleSelect: () => void;
  currencyCode: string;
  isOwnerMode: boolean;
  onApprove: (productId: string, mode: 'balanced' | 'minimum' | 'premium') => void;
  onApply: (productId: string) => void;
  onReview: () => void;
}

function ProductCard({
  product,
  isSelected,
  onToggleSelect,
  currencyCode,
  isOwnerMode,
  onApprove,
  onApply,
  onReview,
}: ProductCardProps) {
  const recommended = product.recommendedPrices.balanced;
  const change = priceChange(product.currentSellingPrice, recommended);
  const isApproved = product.priceApprovalStatus === 'approved';
  const isApplied = isApproved && product.currentSellingPrice === product.finalApprovedPrice;
  const hasProblems = hasProductProblems(product);
  const problemBadge = getProblemBadgeLabel(product);

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border p-3 transition-all relative ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-200 dark:border-emerald-500 dark:ring-emerald-900/40'
          : 'border-slate-100 dark:border-slate-700 hover:shadow-md hover:border-slate-200'
      }`}
    >
      {/* Checkbox at top-right corner */}
      <div className="absolute top-3 right-3 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select ${product.name || 'product'}`}
          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:text-white"
        />
      </div>

      <div className="flex items-start gap-3 pr-8">
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-medium text-sm">{product.name || 'Unnamed product'}</span>
            {product.sku && <span className="text-xs text-muted-foreground">{product.sku}</span>}
            {isApproved ? (
              <Badge variant="outline" className="text-xs text-teal-600 border-teal-200">Approved</Badge>
            ) : hasProblems ? (
              <Badge variant="outline" className={`text-xs ${problemBadge.color} flex items-center gap-1`}>
                <span className={`h-1.5 w-1.5 rounded-full ${problemBadge.dotColor}`} />
                {problemBadge.label}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                {getStatusLabel(product.calculatedPricingStatus)}
              </Badge>
            )}
            {isApplied && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Applied</Badge>
            )}
            {product.recommendedPrices.confidence === 'medium' && !isApproved && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">Medium confidence</Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Some data may be estimated. Verify before approving.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Problem description for action-required products */}
          {hasProblems && !isApproved && (
            <p className="text-xs text-muted-foreground mb-2">{getProblemDescription(product)}</p>
          )}

          {/* Price comparison row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">{isOwnerMode ? 'Current price' : 'Current selling price'}</p>
              <p className="font-medium">{formatCurrency(product.currentSellingPrice, currencyCode)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{isApproved ? (isOwnerMode ? 'Approved price' : 'Final approved price') : (isOwnerMode ? 'Recommended price' : 'Balanced recommendation')}</p>
              <p className={`font-medium ${isApproved ? 'text-teal-600' : 'text-emerald-600'}`}>
                {formatCurrency(isApproved ? product.finalApprovedPrice : recommended, currencyCode)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{isOwnerMode ? 'Expected profit' : 'Projected net profit'}</p>
              <p className="font-medium">{formatCurrency(product.calculatedProfitPerUnit, currencyCode)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Change</p>
              <p className={`font-medium flex items-center gap-1 ${change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                {change > 0 ? <ArrowUpRight className="h-3 w-3" /> : change < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                {formatPercentage(Math.abs(change))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {isApproved ? (
          !isApplied && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-md rounded-lg text-xs h-7">
                  Apply Price
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply approved price?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Change the selling price from {formatCurrency(product.currentSellingPrice, currencyCode)} to {formatCurrency(product.finalApprovedPrice, currencyCode)} for {product.name || 'this product'}?
                    This will update the current selling price used in all calculations.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onApply(product.id)} className="bg-teal-600 text-white">
                    Apply Price
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        ) : hasProblems ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg shadow-sm text-xs h-7 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
            onClick={onReview}
          >
            <Eye className="h-3 w-3 mr-1" /> Review
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md rounded-lg text-xs h-7">
                Review & Approve
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Approve recommended price?</AlertDialogTitle>
                <AlertDialogDescription>
                  Approve {formatCurrency(recommended, currencyCode)} for {product.name || 'this product'}?
                  Current price: {formatCurrency(product.currentSellingPrice, currencyCode)}.
                  {change > 0 ? ` This is a ${formatPercentage(change)} increase.` : change < 0 ? ` This is a ${formatPercentage(Math.abs(change))} decrease.` : ' No change.'}
                  The approved price will NOT automatically replace your current selling price. You can apply it separately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onApprove(product.id, 'balanced')} className="bg-emerald-600 text-white">
                  Approve Price
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={onReview}
        >
          <Eye className="h-3 w-3 mr-1" /> Details
        </Button>
      </div>
    </div>
  );
}

export function ReviewPricesPage() {
  const {
    products,
    businessSettings,
    appSettings,
    approveProductPrice,
    applyApprovedPrice,
    updateProduct,
    setSelectedProductId,
    setCurrentView,
  } = usePricePilotStore();

  const currencyCode = businessSettings.currencyCode;
  const isOwnerMode = appSettings.applicationMode === 'owner';

  const [activeTab, setActiveTab] = useState<TabKey>('action-required');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Categorize products into tabs
  const actionRequired = useMemo(
    () => products.filter(p => hasProductProblems(p)),
    [products],
  );

  const readyToApprove = useMemo(
    () =>
      products.filter(
        p =>
          p.purchaseCost > 0 &&
          p.currentSellingPrice > 0 &&
          p.recommendedPrices.balanced > 0 &&
          p.priceApprovalStatus === 'none' &&
          p.recommendedPrices.confidence !== 'low' &&
          p.calculatedPricingStatus !== 'loss-making' &&
          p.calculatedPricingStatus !== 'missing-data' &&
          p.calculatedPricingStatus !== 'needs-review' &&
          p.calculatedPricingStatus !== 'below-break-even',
      ),
    [products],
  );

  const approvedProducts = useMemo(
    () => products.filter(p => p.priceApprovalStatus === 'approved'),
    [products],
  );

  const tabsConfig: { key: TabKey; label: string; items: Product[] }[] = [
    { key: 'action-required', label: 'Action Required', items: actionRequired },
    { key: 'ready-to-approve', label: 'Ready to Approve', items: readyToApprove },
    { key: 'recently-approved', label: 'Recently Approved', items: approvedProducts },
    { key: 'all', label: 'All', items: products },
  ];

  const activeTabItems = useMemo<Product[]>(() => {
    switch (activeTab) {
      case 'action-required': return actionRequired;
      case 'ready-to-approve': return readyToApprove;
      case 'recently-approved': return approvedProducts;
      case 'all': return products;
      default: return [];
    }
  }, [activeTab, actionRequired, readyToApprove, approvedProducts, products]);
  const selectedCount = selectedProductIds.size;
  const currentTabSelectedCount = activeTabItems.filter(p => selectedProductIds.has(p.id)).length;
  const allCurrentTabSelected = useMemo(
    () => activeTabItems.length > 0 && currentTabSelectedCount === activeTabItems.length,
    [activeTabItems, currentTabSelectedCount],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      activeTabItems.forEach(p => next.add(p.id));
      return next;
    });
  }, [activeTabItems]);

  const toggleSelectAllInTab = useCallback(() => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (allCurrentTabSelected) {
        activeTabItems.forEach(p => next.delete(p.id));
      } else {
        activeTabItems.forEach(p => next.add(p.id));
      }
      return next;
    });
  }, [activeTabItems, allCurrentTabSelected]);

  const clearSelection = useCallback(() => setSelectedProductIds(new Set()), []);

  const handleApproveSingle = (productId: string, mode: 'balanced' | 'minimum' | 'premium' = 'balanced') => {
    approveProductPrice(productId, mode);
    toast.success('Price approved', {
      description: 'The recommended price has been approved. You can apply it when ready.',
    });
  };

  const handleApplySingle = (productId: string) => {
    applyApprovedPrice(productId);
    toast.success('Price applied', { description: 'The approved price is now your selling price.' });
  };

  const approveAtRecommended = () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    const n = ids.length;
    ids.forEach(id => approveProductPrice(id, 'balanced'));
    clearSelection();
    toast.success(`Approved ${n} products`, {
      description: 'Prices have been approved and are ready for export',
    });
  };

  const approveAtCurrent = () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    const n = ids.length;
    const now = new Date().toISOString();
    ids.forEach(id => {
      const p = products.find(pr => pr.id === id);
      if (!p) return;
      updateProduct(id, {
        finalApprovedPrice: p.currentSellingPrice,
        priceApprovalStatus: 'approved',
        approvedAt: now,
        lifecycleStatus: 'approved',
        isApproved: true,
      });
    });
    clearSelection();
    toast.success(`Approved ${n} products`, {
      description: 'Current selling prices have been approved and are ready for export',
    });
  };

  const handleReview = (productId: string) => {
    setSelectedProductId(productId);
    setCurrentView('products');
  };

  return (
    <div className="max-w-5xl mx-auto pb-24">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabKey)}>
        <TabsList className="w-full justify-start flex-wrap h-auto p-1 gap-1">
          {tabsConfig.map(tab => {
            const tabSelectedCount = tab.items.filter(p => selectedProductIds.has(p.id)).length;
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
                <span>{tab.label}</span>
                <Badge
                  variant="secondary"
                  className="ml-0.5 text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center"
                >
                  {tab.items.length}
                </Badge>
                {tabSelectedCount > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">
                    {tabSelectedCount}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabsConfig.map(tab => {
          const tabSelectedCount = tab.items.filter(p => selectedProductIds.has(p.id)).length;
          const allSelectedInTab =
            tab.items.length > 0 && tab.items.every(p => selectedProductIds.has(p.id));
          return (
            <TabsContent key={tab.key} value={tab.key} className="mt-4">
              {/* Tab header with select-all checkbox */}
              {tab.items.length > 0 && (
                <div className="flex items-center justify-between mb-3 px-1 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSelectedInTab}
                      onCheckedChange={() => {
                        setSelectedProductIds(prev => {
                          const next = new Set(prev);
                          if (allSelectedInTab) {
                            tab.items.forEach(p => next.delete(p.id));
                          } else {
                            tab.items.forEach(p => next.add(p.id));
                          }
                          return next;
                        });
                      }}
                      aria-label={`Select all in ${tab.label}`}
                      className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:text-white"
                    />
                    <span className="text-sm text-muted-foreground">
                      Select all in {tab.label.toLowerCase()}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {tabSelectedCount} of {tab.items.length} selected
                  </span>
                </div>
              )}

              {tab.items.length === 0 ? (
                <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/5">
                  <CardContent className="p-8 text-center">
                    <Package className="h-12 w-12 text-emerald-300 mx-auto mb-4" />
                    <h3 className="font-semibold text-lg mb-2">Nothing here yet</h3>
                    <p className="text-sm text-muted-foreground">
                      No products in the <span className="font-medium">{tab.label}</span> tab.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                  {tab.items.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isSelected={selectedProductIds.has(product.id)}
                      onToggleSelect={() => toggleSelect(product.id)}
                      currencyCode={currencyCode}
                      isOwnerMode={isOwnerMode}
                      onApprove={handleApproveSingle}
                      onApply={handleApplySingle}
                      onReview={() => handleReview(product.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Hint when items are selected but none in the current tab are selected */}
      {selectedCount > 0 && currentTabSelectedCount === 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 shadow-sm">
          No items selected in this tab — switch tabs to see them, or use the actions below.
        </div>
      )}

      {/* Sticky bulk-action bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl px-4 py-3 flex items-center gap-3 transition-all duration-200 max-w-[calc(100vw-2rem)] flex-wrap justify-center">
          <span className="text-emerald-600 font-bold text-sm whitespace-nowrap">
            {selectedCount} selected
          </span>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          <Button
            variant="outline"
            size="sm"
            onClick={selectAllVisible}
            className="h-8"
            title="Select all products in the current tab"
          >
            <Layers className="h-3.5 w-3.5 mr-1" /> Select All Visible
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection} className="h-8">
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          <Button
            variant="outline"
            size="sm"
            onClick={approveAtCurrent}
            className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            title="Approve at each product's current selling price"
          >
            Approve {selectedCount} at Current
          </Button>
          <Button
            size="sm"
            onClick={approveAtRecommended}
            className="h-8 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
            title="Approve at balanced recommended price for each product"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" /> Approve {selectedCount} at Recommended
          </Button>
        </div>
      )}
    </div>
  );
}

export default ReviewPricesPage;
