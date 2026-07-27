'use client';

import { useState, useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { PricingStatus, Product } from '@/lib/pricepilot/types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  HelpCircle,
  XCircle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

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
function getProblemBadgeLabel(product: Product): { label: string; color: string } {
  if (!product.purchaseCost) return { label: 'Needs Cost', color: 'text-red-600 border-red-200 bg-red-50' };
  if (!product.currentSellingPrice) return { label: 'Missing Price', color: 'text-red-600 border-red-200 bg-red-50' };
  if (product.recommendedPrices.balanced === 0) return { label: 'Impossible', color: 'text-red-600 border-red-200 bg-red-50' };
  if (product.calculatedPricingStatus === 'loss-making') return { label: 'Losing Money', color: 'text-red-600 border-red-200 bg-red-50' };
  if (product.calculatedPricingStatus === 'below-break-even') return { label: 'Below Break-even', color: 'text-amber-600 border-amber-200 bg-amber-50' };
  if (product.calculatedPricingStatus === 'low-margin') return { label: 'Low Profit', color: 'text-amber-600 border-amber-200 bg-amber-50' };
  if (product.calculatedPricingStatus === 'missing-data') return { label: 'Missing Data', color: 'text-slate-500 border-slate-200 bg-slate-50' };
  if (product.calculatedPricingStatus === 'needs-review') return { label: 'Needs Review', color: 'text-amber-600 border-amber-200 bg-amber-50' };
  if (product.recommendedPrices.confidence === 'low') return { label: 'Low Confidence', color: 'text-amber-600 border-amber-200 bg-amber-50' };
  return { label: 'Needs Attention', color: 'text-amber-600 border-amber-200 bg-amber-50' };
}

export function ReviewPricesPage() {
  const {
    products,
    businessSettings,
    appSettings,
    approveProductPrice,
    applyApprovedPrice,
    bulkApprovePrices,
    setSelectedProductId,
    setSelectedProducts,
    setCurrentView,
  } = usePricePilotStore();

  const currencyCode = businessSettings.currencyCode;
  const isOwnerMode = appSettings.applicationMode === 'owner';

  // Categorize products into three sections
  // Action Required: products with REAL problems (not just low confidence)
  const actionRequired = useMemo(() =>
    products.filter(p =>
      !p.purchaseCost ||
      !p.currentSellingPrice ||
      p.calculatedPricingStatus === 'loss-making' ||
      p.calculatedPricingStatus === 'below-break-even' ||
      p.calculatedPricingStatus === 'missing-data' ||
      p.calculatedPricingStatus === 'needs-review' ||
      p.calculatedPricingStatus === 'low-margin' ||
      p.recommendedPrices.balanced === 0 ||
      p.recommendedPrices.confidence === 'low'
    ), [products]);

  // Ready to Approve: products with complete data, valid recommendation, medium/high confidence
  const readyToApprove = useMemo(() =>
    products.filter(p =>
      p.purchaseCost > 0 &&
      p.currentSellingPrice > 0 &&
      p.recommendedPrices.balanced > 0 &&
      p.priceApprovalStatus === 'none' &&
      p.recommendedPrices.confidence !== 'low' &&
      p.calculatedPricingStatus !== 'loss-making' &&
      p.calculatedPricingStatus !== 'missing-data' &&
      p.calculatedPricingStatus !== 'needs-review' &&
      p.calculatedPricingStatus !== 'below-break-even'
    ), [products]);

  const approvedProducts = useMemo(() =>
    products.filter(p => p.priceApprovalStatus === 'approved'), [products]);

  const [selectedForBulk, setSelectedForBulk] = useState<string[]>([]);

  const handleApprove = (productId: string, mode: 'balanced' | 'minimum' | 'premium' = 'balanced') => {
    approveProductPrice(productId, mode);
    toast.success('Price approved', { description: 'The recommended price has been approved. You can apply it when ready.' });
  };

  const handleApply = (productId: string) => {
    applyApprovedPrice(productId);
    toast.success('Price applied', { description: 'The approved price is now your selling price.' });
  };

  const handleBulkApprove = () => {
    if (selectedForBulk.length === 0) return;
    bulkApprovePrices(selectedForBulk);
    setSelectedForBulk([]);
    toast.success('Bulk approved', { description: `${selectedForBulk.length} prices have been approved.` });
  };

  const toggleBulkSelect = (productId: string) => {
    setSelectedForBulk(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  const priceChange = (current: number, recommended: number) => {
    if (current <= 0) return 0;
    return ((recommended - current) / current) * 100;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Section 1: Action Required */}
      {actionRequired.length > 0 && (
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-red-50/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="h-7 w-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Action Required
              <Badge className="bg-red-100 text-red-700 border-red-200">{actionRequired.length}</Badge>
            </CardTitle>
            <CardDescription>These products have problems that need your attention before pricing can be calculated correctly.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {actionRequired.map(product => {
                const problemBadge = getProblemBadgeLabel(product);
                return (
                <div
                  key={product.id}
                  className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-sm">{product.name || 'Unnamed product'}</span>
                      {product.sku && <span className="text-xs text-muted-foreground">{product.sku}</span>}
                      <Badge variant="outline" className={`text-xs ${problemBadge.color}`}>
                        {problemBadge.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{getProblemDescription(product)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg shadow-sm shrink-0"
                    onClick={() => {
                      setSelectedProductId(product.id);
                      setCurrentView('products');
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" /> Review
                  </Button>
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 2: Ready to Approve */}
      {readyToApprove.length > 0 && (
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                Ready to Approve
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{readyToApprove.length}</Badge>
              </CardTitle>
              {selectedForBulk.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md rounded-lg">
                      Approve {selectedForBulk.length} Selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Approve {selectedForBulk.length} prices?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will approve the recommended prices for {selectedForBulk.length} products. You can apply them individually later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkApprove} className="bg-emerald-600 text-white">Approve All</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <CardDescription>These products have complete data and valid pricing recommendations. Select products to bulk-approve, or review individually.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {readyToApprove.map(product => {
                const recommended = product.recommendedPrices.balanced;
                const change = priceChange(product.currentSellingPrice, recommended);
                const isSelected = selectedForBulk.includes(product.id);
                return (
                  <div
                    key={product.id}
                    className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border p-3 transition-all ${
                      isSelected ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-900/20' : 'border-slate-100 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox for bulk select */}
                      <button
                        onClick={() => toggleBulkSelect(product.id)}
                        className={`h-5 w-5 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                          isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-sm">{product.name || 'Unnamed product'}</span>
                          {product.sku && <span className="text-xs text-muted-foreground">{product.sku}</span>}
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                            {getStatusLabel(product.calculatedPricingStatus)}
                          </Badge>
                          {product.recommendedPrices.confidence === 'medium' && (
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

                        {/* Price comparison row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">{isOwnerMode ? 'Current price' : 'Current selling price'}</p>
                            <p className="font-medium">{formatCurrency(product.currentSellingPrice, currencyCode)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{isOwnerMode ? 'Recommended price' : 'Balanced recommendation'}</p>
                            <p className="font-medium text-emerald-600">{formatCurrency(recommended, currencyCode)}</p>
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

                      {/* Actions */}
                      <div className="flex flex-col gap-1 shrink-0">
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
                              <AlertDialogAction onClick={() => handleApprove(product.id, 'balanced')} className="bg-emerald-600 text-white">
                                Approve Price
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setCurrentView('products');
                          }}
                        >
                          <Eye className="h-3 w-3 mr-1" /> Details
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 3: Approved */}
      {approvedProducts.length > 0 && (
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-teal-50/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="h-7 w-7 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              Approved Prices
              <Badge className="bg-teal-100 text-teal-700 border-teal-200">{approvedProducts.length}</Badge>
            </CardTitle>
            <CardDescription>These prices have been approved. Apply them to update your selling prices.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {approvedProducts.map(product => {
                const isApplied = product.currentSellingPrice === product.finalApprovedPrice;
                return (
                  <div
                    key={product.id}
                    className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 p-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">{product.name || 'Unnamed product'}</span>
                        {product.sku && <span className="text-xs text-muted-foreground">{product.sku}</span>}
                        <Badge variant="outline" className="text-xs text-teal-600 border-teal-200">Approved</Badge>
                        {isApplied && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Applied</Badge>}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">{isOwnerMode ? 'Approved price' : 'Final approved price'}</p>
                          <p className="font-medium text-teal-600">{formatCurrency(product.finalApprovedPrice, currencyCode)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{isOwnerMode ? 'Current price' : 'Current selling price'}</p>
                          <p className="font-medium">{formatCurrency(product.currentSellingPrice, currencyCode)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Approved on</p>
                          <p className="font-medium">{product.approvedAt ? new Date(product.approvedAt).toLocaleDateString() : '—'}</p>
                        </div>
                      </div>
                    </div>
                    {!isApplied && (
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
                            <AlertDialogAction onClick={() => handleApply(product.id)} className="bg-teal-600 text-white">
                              Apply Price
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {actionRequired.length === 0 && readyToApprove.length === 0 && approvedProducts.length === 0 && (
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/5">
          <CardContent className="p-8 text-center">
            <Package className="h-12 w-12 text-emerald-300 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">No products to review</h3>
            <p className="text-sm text-muted-foreground mb-4">Import products first, then come back to review their pricing.</p>
            <Button
              onClick={() => setCurrentView('import')}
              className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md rounded-lg"
            >
              Import Products
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ReviewPricesPage;
