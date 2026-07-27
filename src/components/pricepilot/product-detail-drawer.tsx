'use client';

import { useState, useMemo, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { StatusBadge } from './status-badge';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import {
  Product,
  RecommendationMode,
  LifecycleStatus,
  TaxTreatment,
  SalesChannel,
  InputTaxCreditRecoverable,
  PurchaseCostTaxMode,
  CompetitorPrice,
  PriceApprovalStatus,
} from '@/lib/pricepilot/types';
import { calculateOutcomeAtPrice } from '@/lib/pricepilot/pricing-engine';
import { resolveEffectivePricingPolicy } from '@/lib/pricepilot/resolve-rule';
import {
  AlertTriangle, ArrowUpRight, ArrowDownRight, Calculator,
  Edit3, CheckCircle, Undo2, Copy, ChevronDown, ChevronUp, Plus, X, ShieldCheck, FileCheck
} from 'lucide-react';
import { toast } from 'sonner';

export function ProductDetailDrawer({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { products, businessSettings, pricingRules, updateProduct, approveProductPrice, applyApprovedPrice, duplicateProduct, deleteProduct, addRecentlyViewed } = usePricePilotStore();
  const [selectedMode, setSelectedMode] = useState<RecommendationMode>('balanced');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('recommendations');

  // Edit state
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [editCompetitors, setEditCompetitors] = useState<CompetitorPrice[]>([]);
  const [isEditAdvanced, setIsEditAdvanced] = useState(false);
  const [editHistory, setEditHistory] = useState<Array<{ field: string; oldValue: unknown; newValue: unknown }>>([]);
  const [isEditing, setIsEditing] = useState(false);

  const product = products.find(p => p.id === productId);

  // Initialize edit form when product changes (React pattern for adjusting state when props change)
  const [prevProductId, setPrevProductId] = useState<string | undefined>(undefined);
  if (product && product.id !== prevProductId) {
    setPrevProductId(product.id);
    setEditForm({ ...product });
    setEditCompetitors([...(product.competitorPrices || [])]);
    setEditHistory([]);
    setIsEditing(false);
    setSelectedMode(product.selectedRecommendationMode || 'balanced');
    // Track recently viewed product
    addRecentlyViewed(product.id);
  }

  // Edit form handlers (must be declared before any early return)
  const updateEditField = useCallback(<K extends keyof Product>(key: K, value: Product[K]) => {
    const oldValue = editForm[key];
    setEditForm(prev => ({ ...prev, [key]: value }));
    setEditHistory(prev => [...prev.slice(-9), { field: key, oldValue, newValue: value }]);
  }, [editForm]);

  const undoLastEdit = useCallback(() => {
    if (editHistory.length === 0) return;
    const last = editHistory[editHistory.length - 1];
    setEditForm(prev => ({ ...prev, [last.field]: last.oldValue }));
    setEditHistory(prev => prev.slice(0, -1));
  }, [editHistory]);

  const handleSaveEdit = useCallback(() => {
    if (!product) return;
    const updates: Partial<Product> = { ...editForm, competitorPrices: editCompetitors } as Partial<Product>;
    updateProduct(product.id, updates);
    toast.success('Product updated', { description: `${product.name} has been updated` });
    setIsEditing(false);
    setEditHistory([]);
  }, [product, editForm, editCompetitors, updateProduct]);

  // Edit preview (must be before early return per React hooks rules)
  const editPreviewOutcome = useMemo(() => {
    if (!editForm.purchaseCost || editForm.purchaseCost <= 0) return null;
    const previewProduct: Product = {
      ...(editForm as Product),
      competitorPrices: editCompetitors,
    };
    const effectiveRule = resolveEffectivePricingPolicy(previewProduct, pricingRules, businessSettings);
    try {
      const price = editForm.currentSellingPrice || 0;
      return calculateOutcomeAtPrice({ product: previewProduct, sellingPrice: price, businessSettings, effectiveRule });
    } catch {
      return null;
    }
  }, [editForm, editCompetitors, businessSettings, pricingRules]);

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

  // Lifecycle status badge colors
  const lifecycleBadgeStyle = (status: LifecycleStatus): string => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'draft': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'missing-data': return 'bg-red-100 text-red-700 border-red-200';
      case 'needs-review': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'approved': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
      case 'archived': return 'bg-slate-200 text-slate-500 border-slate-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const lifecycleLabel = (status: LifecycleStatus): string => {
    switch (status) {
      case 'active': return 'Active';
      case 'draft': return 'Draft';
      case 'missing-data': return 'Missing Data';
      case 'needs-review': return 'Needs Review';
      case 'approved': return 'Approved';
      case 'archived': return 'Archived';
      default: return status;
    }
  };

  // Approval workflow status display
  const approvalBadgeStyle = (status: PriceApprovalStatus): string => {
    switch (status) {
      case 'none': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'selected': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'approved': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const approvalLabel = (status: PriceApprovalStatus): string => {
    switch (status) {
      case 'none': return 'Not Selected';
      case 'selected': return 'Selected';
      case 'approved': return 'Approved';
      default: return 'Unknown';
    }
  };

  return (
    <Sheet open={!!productId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-2xl bg-gradient-to-b from-white to-slate-50/30 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {product.name}
            <StatusBadge status={product.calculatedPricingStatus} />
            <Badge className={`rounded-lg text-xs border ${lifecycleBadgeStyle(product.lifecycleStatus || 'active')}`}>
              {lifecycleLabel(product.lifecycleStatus || 'active')}
            </Badge>
            {product.priceApprovalStatus !== 'none' && (
              <Badge className={`rounded-lg text-xs border ${approvalBadgeStyle(product.priceApprovalStatus)}`}>
                {approvalLabel(product.priceApprovalStatus)}
              </Badge>
            )}
          </SheetTitle>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>SKU: {product.sku}</span>
            <span>•</span>
            <span>{product.category}</span>
            {product.brand && <><span>•</span><span>{product.brand}</span></>}
            {product.priceApprovalStatus === 'approved' && product.approvedAt && (
              <><span>•</span><span className="text-emerald-600">Approved {new Date(product.approvedAt).toLocaleDateString()}</span></>
            )}
          </div>
        </SheetHeader>

        {/* Tabs: Recommendations / Edit / Actions */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="bg-slate-100 rounded-lg">
            <TabsTrigger value="recommendations" className="rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              Recommendations
            </TabsTrigger>
            <TabsTrigger value="edit" className="rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Edit3 className="h-4 w-4 mr-1" /> Edit
            </TabsTrigger>
          </TabsList>

          {/* ===== RECOMMENDATIONS TAB ===== */}
          <TabsContent value="recommendations" className="space-y-4">
            {/* Price summary */}
            <div className="grid grid-cols-2 gap-3">
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

            {/* Approved price card (if approved) */}
            {product.priceApprovalStatus === 'approved' && product.finalApprovedPrice > 0 && (
              <Card className="bg-gradient-to-b from-emerald-50 to-emerald-100/50 shadow-sm rounded-xl border border-emerald-300">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    <span className="text-xs text-emerald-600 font-semibold">Approved Price</span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-700">{formatCurrency(product.finalApprovedPrice, cc)}</div>
                  <div className="text-sm text-emerald-600">
                    Mode: {product.selectedRecommendationMode || 'balanced'} • Approved: {product.approvedAt ? new Date(product.approvedAt).toLocaleDateString() : 'N/A'}
                  </div>
                  {product.currentSellingPrice !== product.finalApprovedPrice && (
                    <Button
                      size="sm"
                      onClick={() => { applyApprovedPrice(product.id); toast.success('Price applied', { description: `Approved price has been set as the current selling price for ${product.name}` }); }}
                      className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
                    >
                      <FileCheck className="h-4 w-4 mr-1" /> Apply Approved Price as Current Selling Price
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Cost breakdown */}
            <Card className="shadow-md border-0 rounded-xl">
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

            {/* Approval workflow */}
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500" /> Price Approval Workflow
              </h3>

              {product.priceApprovalStatus === 'none' && (
                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600 border border-slate-200">
                  Select a recommendation mode above, then click "Approve Price" to start the approval process.
                </div>
              )}

              {product.priceApprovalStatus === 'selected' && (
                <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-700 border border-amber-200">
                  You have selected <strong>{product.selectedRecommendationMode}</strong> mode. Review the outcome and click "Approve Price" to confirm.
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {/* Select recommendation button */}
                {product.priceApprovalStatus === 'none' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      updateProduct(product.id, {
                        selectedRecommendationMode: selectedMode === 'custom' ? 'balanced' : selectedMode,
                        priceApprovalStatus: 'selected',
                      });
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" /> Select {selectedMode} Recommendation
                  </Button>
                )}

                {/* Approve price button */}
                {product.priceApprovalStatus !== 'approved' && (
                  <Button
                    size="sm"
                    onClick={() => { approveProductPrice(product.id, selectedMode === 'custom' ? 'balanced' : selectedMode); toast.success('Price approved', { description: `${product.name} price has been approved` }); }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
                  >
                    <ShieldCheck className="h-4 w-4 mr-1" /> Approve Price
                  </Button>
                )}

                {/* Apply approved price */}
                {product.priceApprovalStatus === 'approved' && product.finalApprovedPrice > 0 && product.currentSellingPrice !== product.finalApprovedPrice && (
                  <Button
                    size="sm"
                    onClick={() => { applyApprovedPrice(product.id); toast.success('Price applied', { description: `Approved price has been set as the current selling price for ${product.name}` }); }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-semibold"
                  >
                    <FileCheck className="h-4 w-4 mr-1" /> Apply as Selling Price
                  </Button>
                )}

                {/* Reset approval */}
                {product.priceApprovalStatus !== 'none' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateProduct(product.id, { priceApprovalStatus: 'none', finalApprovedPrice: 0, approvedAt: '' });
                    }}
                    className="rounded-lg border-slate-200 hover:bg-slate-50"
                  >
                    Reset Approval
                  </Button>
                )}
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

            {/* Quick actions */}
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => duplicateProduct(product.id)} className="rounded-lg border-slate-200 hover:bg-slate-50">
                <Copy className="h-4 w-4 mr-1" /> Duplicate
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-lg border-red-200 text-red-600 hover:bg-red-50">
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{product.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { deleteProduct(product.id); toast.success('Product deleted', { description: `${product.name} has been removed` }); onClose(); }} className="bg-red-600 hover:bg-red-700">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TabsContent>

          {/* ===== EDIT TAB ===== */}
          <TabsContent value="edit" className="space-y-4">
            {/* Undo button */}
            {editHistory.length > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={undoLastEdit} className="rounded-lg border-slate-200 hover:bg-slate-50">
                  <Undo2 className="h-4 w-4 mr-1" /> Undo ({editHistory.length})
                </Button>
                <span className="text-xs text-slate-500">Last: changed {editHistory[editHistory.length - 1]?.field}</span>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">
                {isEditAdvanced ? 'Advanced Mode' : 'Basic Mode'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditAdvanced(!isEditAdvanced)}
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
              >
                {isEditAdvanced ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                {isEditAdvanced ? 'Show Basic' : 'Show Advanced'}
              </Button>
            </div>

            {/* Basic edit fields */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-slate-600">Name</Label>
                  <Input
                    value={editForm.name || ''}
                    onChange={e => updateEditField('name', e.target.value)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-600">SKU</Label>
                  <Input
                    value={editForm.sku || ''}
                    onChange={e => updateEditField('sku', e.target.value)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-slate-600">Category</Label>
                  <Input
                    value={editForm.category || ''}
                    onChange={e => updateEditField('category', e.target.value)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-600">Brand</Label>
                  <Input
                    value={editForm.brand || ''}
                    onChange={e => updateEditField('brand', e.target.value)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-slate-600">Purchase Cost</Label>
                  <Input
                    type="number"
                    value={editForm.purchaseCost || ''}
                    onChange={e => updateEditField('purchaseCost', parseFloat(e.target.value) || 0)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-600">Current Selling Price</Label>
                  <Input
                    type="number"
                    value={editForm.currentSellingPrice || ''}
                    onChange={e => updateEditField('currentSellingPrice', parseFloat(e.target.value) || 0)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-slate-600">Shipping Cost</Label>
                  <Input
                    type="number"
                    value={editForm.shippingCost || ''}
                    onChange={e => updateEditField('shippingCost', parseFloat(e.target.value) || 0)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-600">Tax Treatment</Label>
                  <Select value={editForm.taxTreatment || 'inclusive'} onValueChange={v => updateEditField('taxTreatment', v as TaxTreatment)}>
                    <SelectTrigger className="bg-white shadow-sm border-slate-200 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inclusive">Inclusive</SelectItem>
                      <SelectItem value="exclusive">Exclusive</SelectItem>
                      <SelectItem value="exempt">Exempt</SelectItem>
                      <SelectItem value="composite">Composite (GST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-slate-600">Tax Rate (%)</Label>
                  <Input
                    type="number"
                    value={editForm.taxRatePercent || ''}
                    onChange={e => updateEditField('taxRatePercent', parseFloat(e.target.value) || 0)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-600">Marketplace Fee (%)</Label>
                  <Input
                    type="number"
                    value={editForm.marketplaceFeePercent || ''}
                    onChange={e => updateEditField('marketplaceFeePercent', parseFloat(e.target.value) || 0)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-slate-600">Payment Fee (%)</Label>
                  <Input
                    type="number"
                    value={editForm.paymentFeePercent || ''}
                    onChange={e => updateEditField('paymentFeePercent', parseFloat(e.target.value) || 0)}
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-600">Lifecycle Status</Label>
                  <Select value={editForm.lifecycleStatus || 'active'} onValueChange={v => updateEditField('lifecycleStatus', v as LifecycleStatus)}>
                    <SelectTrigger className="bg-white shadow-sm border-slate-200 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="missing-data">Missing Data</SelectItem>
                      <SelectItem value="needs-review">Needs Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Advanced edit fields */}
            {isEditAdvanced && (
              <div className="space-y-3">
                <Separator className="my-2" />
                <h4 className="text-sm font-semibold text-slate-700">Advanced Settings</h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Purchase Cost Tax Mode</Label>
                    <Select value={editForm.purchaseCostTaxMode || 'excluding-tax'} onValueChange={v => updateEditField('purchaseCostTaxMode', v as PurchaseCostTaxMode)}>
                      <SelectTrigger className="bg-white shadow-sm border-slate-200 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excluding-tax">Excluding Tax</SelectItem>
                        <SelectItem value="including-tax">Including Tax</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Input Tax Credit</Label>
                    <Select value={editForm.inputTaxCreditRecoverable || 'not-recoverable'} onValueChange={v => updateEditField('inputTaxCreditRecoverable', v as InputTaxCreditRecoverable)}>
                      <SelectTrigger className="bg-white shadow-sm border-slate-200 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-recoverable">Not Recoverable</SelectItem>
                        <SelectItem value="recoverable">Fully Recoverable</SelectItem>
                        <SelectItem value="partially-recoverable">Partially Recoverable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Packaging Cost</Label>
                    <Input type="number" value={editForm.packagingCost || ''} onChange={e => updateEditField('packagingCost', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Handling Cost</Label>
                    <Input type="number" value={editForm.handlingCost || ''} onChange={e => updateEditField('handlingCost', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Return Rate (%)</Label>
                    <Input type="number" value={editForm.returnRatePercent || ''} onChange={e => updateEditField('returnRatePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Damage Rate (%)</Label>
                    <Input type="number" value={editForm.damageRatePercent || ''} onChange={e => updateEditField('damageRatePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Other Costs</Label>
                    <Input type="number" value={editForm.otherCosts || ''} onChange={e => updateEditField('otherCosts', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Custom Duty (%)</Label>
                    <Input type="number" value={editForm.customDutyPercent || ''} onChange={e => updateEditField('customDutyPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Marketplace Fixed Fee</Label>
                    <Input type="number" value={editForm.marketplaceFeeFixed || ''} onChange={e => updateEditField('marketplaceFeeFixed', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Payment Fixed Fee</Label>
                    <Input type="number" value={editForm.paymentFeeFixed || ''} onChange={e => updateEditField('paymentFeeFixed', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Other Fees (%)</Label>
                    <Input type="number" value={editForm.otherFeesPercent || ''} onChange={e => updateEditField('otherFeesPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Other Fixed Fees</Label>
                    <Input type="number" value={editForm.otherFeesFixed || ''} onChange={e => updateEditField('otherFeesFixed', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-slate-600">Sales Channel</Label>
                  <Select value={editForm.salesChannel || 'online-marketplace'} onValueChange={v => updateEditField('salesChannel', v as SalesChannel)}>
                    <SelectTrigger className="bg-white shadow-sm border-slate-200 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online-marketplace">Online Marketplace</SelectItem>
                      <SelectItem value="own-website">Own Website</SelectItem>
                      <SelectItem value="retail-store">Retail Store</SelectItem>
                      <SelectItem value="wholesale">Wholesale</SelectItem>
                      <SelectItem value="distributor">Distributor</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Quantity</Label>
                    <Input type="number" value={editForm.quantity || ''} onChange={e => updateEditField('quantity', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Monthly Units Sold</Label>
                    <Input type="number" value={editForm.monthlyUnitsSold || ''} onChange={e => updateEditField('monthlyUnitsSold', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Shipping Charge to Customer</Label>
                    <Input type="number" value={editForm.shippingChargeToCustomer || ''} onChange={e => updateEditField('shippingChargeToCustomer', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Freight (% of purchase cost)</Label>
                    <Input type="number" value={editForm.freightPercent || ''} onChange={e => updateEditField('freightPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                  </div>
                </div>

                {/* Competitor prices */}
                <Separator className="my-2" />
                <h4 className="text-sm font-semibold text-slate-700">Competitor Prices</h4>
                {editCompetitors.map((comp, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <Label className="text-xs text-slate-500">Name</Label>
                      <Input
                        value={comp.name}
                        onChange={e => {
                          const newComps = [...editCompetitors];
                          newComps[idx] = { ...newComps[idx], name: e.target.value };
                          setEditCompetitors(newComps);
                        }}
                        className="bg-white shadow-sm border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Price</Label>
                      <Input
                        type="number"
                        value={comp.price}
                        onChange={e => {
                          const newComps = [...editCompetitors];
                          newComps[idx] = { ...newComps[idx], price: parseFloat(e.target.value) || 0 };
                          setEditCompetitors(newComps);
                        }}
                        className="bg-white shadow-sm border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setEditCompetitors(editCompetitors.filter((_, i) => i !== idx))} className="text-red-500 hover:bg-red-50 rounded-lg">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditCompetitors([...editCompetitors, { name: `Competitor ${editCompetitors.length + 1}`, price: 0 }])}
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 rounded-lg"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Competitor
                </Button>

                <div>
                  <Label className="text-sm font-medium text-slate-600">Description</Label>
                  <Input value={editForm.description || ''} onChange={e => updateEditField('description', e.target.value)} className="bg-white shadow-sm border-slate-200 rounded-lg" />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-600">Notes</Label>
                  <Textarea value={editForm.notes || ''} onChange={e => updateEditField('notes', e.target.value)} className="bg-white shadow-sm border-slate-200 rounded-lg min-h-[60px]" />
                </div>
              </div>
            )}

            {/* Edit live preview */}
            {editPreviewOutcome && (
              <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-slate-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calculator className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-semibold text-slate-700">Live Preview After Edit</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-2 rounded-lg ${editPreviewOutcome.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <div className="text-xs text-slate-500">Profit</div>
                      <div className={`font-bold ${editPreviewOutcome.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatCurrency(editPreviewOutcome.netProfit, cc)}
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg ${editPreviewOutcome.effectiveMarginPercent >= businessSettings.defaultMinimumMarginPercent ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <div className="text-xs text-slate-500">Margin</div>
                      <div className={`font-bold ${editPreviewOutcome.effectiveMarginPercent >= businessSettings.defaultMinimumMarginPercent ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatPercentage(editPreviewOutcome.effectiveMarginPercent)}
                      </div>
                    </div>
                  </div>
                  {editPreviewOutcome.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {editPreviewOutcome.warnings.slice(0, 3).map((w, i) => (
                        <div key={i} className={`p-1 rounded text-xs ${w.severity === 'error' || w.severity === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {w.message}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Save / Cancel edit */}
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-semibold">
                <CheckCircle className="h-4 w-4 mr-1" /> Save Changes
              </Button>
              <Button variant="outline" onClick={() => { setEditForm({ ...product }); setEditCompetitors([...(product.competitorPrices || [])]); setEditHistory([]); }} className="rounded-lg border-slate-200 shadow-sm hover:bg-slate-50">
                <Undo2 className="h-4 w-4 mr-1" /> Reset Form
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default ProductDetailDrawer;
