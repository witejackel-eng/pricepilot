'use client';

import { useState, useMemo, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
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
  createDefaultProduct,
} from '@/lib/pricepilot/types';
import { calculateOutcomeAtPrice } from '@/lib/pricepilot/pricing-engine';
import { resolveEffectivePricingPolicy } from '@/lib/pricepilot/resolve-rule';
import { Plus, ChevronDown, ChevronUp, Copy, Save, X, Calculator, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProductDialog({ open, onOpenChange }: AddProductDialogProps) {
  const { products, businessSettings, pricingRules, addProduct, duplicateProduct } = usePricePilotStore();
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string>('');
  const [showDuplicate, setShowDuplicate] = useState(false);

  // Form state
  const [form, setForm] = useState<Partial<Product>>(() => {
    const defaults = createDefaultProduct();
    return {
      ...defaults,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lifecycleStatus: 'draft' as LifecycleStatus,
      taxRatePercent: businessSettings.defaultTaxRatePercent,
      marketplaceFeePercent: businessSettings.defaultMarketplaceFeePercent,
      paymentFeePercent: businessSettings.defaultPaymentFeePercent,
      marketplaceFeeFixed: businessSettings.defaultMarketplaceFeeFixed,
      paymentFeeFixed: businessSettings.defaultPaymentFeeFixed,
      taxTreatment: businessSettings.taxTreatment,
      shippingCost: businessSettings.defaultShippingCost,
      packagingCost: businessSettings.defaultPackagingCost,
      handlingCost: businessSettings.defaultHandlingCost,
      otherCosts: businessSettings.defaultOtherCosts,
      returnRatePercent: businessSettings.defaultReturnRatePercent,
      damageRatePercent: businessSettings.defaultDamageRatePercent,
    };
  });

  // Competitor prices state
  const [competitors, setCompetitors] = useState<CompetitorPrice[]>([]);

  const updateField = useCallback(<K extends keyof Product>(key: K, value: Product[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!form.name?.trim()) errors.push('Product name is required');
    if (!form.sku?.trim()) errors.push('SKU is required');
    if (!form.name?.trim() && !form.sku?.trim()) return errors;
    if (form.purchaseCost === undefined || form.purchaseCost <= 0) errors.push('Purchase cost is required for trusted pricing');
    return errors;
  }, [form]);

  // Live pricing preview - use canonical engine
  const previewOutcome = useMemo(() => {
    if (!form.purchaseCost || form.purchaseCost <= 0) return null;
    const previewProduct: Product = {
      ...(form as Product),
      competitorPrices: competitors,
      recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },
    };
    const effectiveRule = resolveEffectivePricingPolicy(previewProduct, pricingRules, businessSettings);
    try {
      const outcome = calculateOutcomeAtPrice({
        product: previewProduct,
        sellingPrice: form.currentSellingPrice || 0,
        businessSettings,
        effectiveRule,
      });
      return outcome;
    } catch {
      return null;
    }
  }, [form, competitors, businessSettings, pricingRules]);

  // Handle duplicate source selection
  const handleDuplicateSelect = useCallback(() => {
    if (!duplicateSourceId) return;
    const source = products.find(p => p.id === duplicateSourceId);
    if (!source) return;
    setForm({
      ...source,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${source.name} (Copy)`,
      sku: `${source.sku}-NEW`,
      lifecycleStatus: 'draft' as LifecycleStatus,
      priceApprovalStatus: 'none',
      finalApprovedPrice: 0,
      approvedAt: '',
      isApproved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setCompetitors(source.competitorPrices || []);
    setShowDuplicate(false);
    setDuplicateSourceId('');
  }, [duplicateSourceId, products]);

  // Reset form
  const resetForm = useCallback(() => {
    const defaults = createDefaultProduct();
    setForm({
      ...defaults,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lifecycleStatus: 'draft',
      taxRatePercent: businessSettings.defaultTaxRatePercent,
      marketplaceFeePercent: businessSettings.defaultMarketplaceFeePercent,
      paymentFeePercent: businessSettings.defaultPaymentFeePercent,
      marketplaceFeeFixed: businessSettings.defaultMarketplaceFeeFixed,
      paymentFeeFixed: businessSettings.defaultPaymentFeeFixed,
      taxTreatment: businessSettings.taxTreatment,
      shippingCost: businessSettings.defaultShippingCost,
      packagingCost: businessSettings.defaultPackagingCost,
      handlingCost: businessSettings.defaultHandlingCost,
      otherCosts: businessSettings.defaultOtherCosts,
      returnRatePercent: businessSettings.defaultReturnRatePercent,
      damageRatePercent: businessSettings.defaultDamageRatePercent,
    });
    setCompetitors([]);
    setIsAdvanced(false);
  }, [businessSettings]);

  // Save handler
  const handleSave = useCallback((keepOpen: boolean = false) => {
    if (validationErrors.length > 0) return;
    const product: Product = {
      ...(form as Product),
      competitorPrices: competitors,
    };
    addProduct(product);
    if (!keepOpen) {
      onOpenChange(false);
    }
    resetForm();
  }, [form, competitors, validationErrors, addProduct, onOpenChange, resetForm]);

  const cc = businessSettings.currencyCode;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-b from-white to-slate-50/30">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-600" />
            Add New Product
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* Left: Form */}
          <div className="space-y-4">
            {/* Duplicate existing product */}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDuplicate(!showDuplicate)}
                className="text-slate-600 border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                <Copy className="h-4 w-4 mr-1" /> Duplicate existing product
              </Button>
              {showDuplicate && (
                <div className="mt-2 flex items-center gap-2">
                  <Select value={duplicateSourceId} onValueChange={setDuplicateSourceId}>
                    <SelectTrigger className="w-full bg-white shadow-sm border-slate-200 rounded-lg">
                      <SelectValue placeholder="Select a product to copy" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleDuplicateSelect} disabled={!duplicateSourceId} className="bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                    Apply
                  </Button>
                </div>
              )}
            </div>

            {/* Mode toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">
                {isAdvanced ? 'Advanced Mode' : 'Basic Mode'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAdvanced(!isAdvanced)}
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
              >
                {isAdvanced ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                {isAdvanced ? 'Show Basic' : 'Show Advanced'}
              </Button>
            </div>

            {/* Basic fields */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-name" className="text-sm font-medium text-slate-600">Name *</Label>
                  <Input
                    id="add-name"
                    value={form.name || ''}
                    onChange={e => updateField('name', e.target.value)}
                    placeholder="Product name"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="add-sku" className="text-sm font-medium text-slate-600">SKU *</Label>
                  <Input
                    id="add-sku"
                    value={form.sku || ''}
                    onChange={e => updateField('sku', e.target.value)}
                    placeholder="SKU code"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-category" className="text-sm font-medium text-slate-600">Category</Label>
                  <Input
                    id="add-category"
                    value={form.category || ''}
                    onChange={e => updateField('category', e.target.value)}
                    placeholder="Category"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="add-brand" className="text-sm font-medium text-slate-600">Brand</Label>
                  <Input
                    id="add-brand"
                    value={form.brand || ''}
                    onChange={e => updateField('brand', e.target.value)}
                    placeholder="Brand"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-purchaseCost" className="text-sm font-medium text-slate-600">Purchase Cost *</Label>
                  <Input
                    id="add-purchaseCost"
                    type="number"
                    value={form.purchaseCost || ''}
                    onChange={e => updateField('purchaseCost', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="add-existingPrice" className="text-sm font-medium text-slate-600">Existing Selling Price</Label>
                  <Input
                    id="add-existingPrice"
                    type="number"
                    value={form.currentSellingPrice || ''}
                    onChange={e => updateField('currentSellingPrice', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-shippingCost" className="text-sm font-medium text-slate-600">Shipping Cost</Label>
                  <Input
                    id="add-shippingCost"
                    type="number"
                    value={form.shippingCost || ''}
                    onChange={e => updateField('shippingCost', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="add-taxMode" className="text-sm font-medium text-slate-600">Tax Treatment</Label>
                  <Select value={form.taxTreatment || 'inclusive'} onValueChange={v => updateField('taxTreatment', v as TaxTreatment)}>
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
                  <Label htmlFor="add-taxRate" className="text-sm font-medium text-slate-600">Tax Rate (%)</Label>
                  <Input
                    id="add-taxRate"
                    type="number"
                    value={form.taxRatePercent || ''}
                    onChange={e => updateField('taxRatePercent', parseFloat(e.target.value) || 0)}
                    placeholder="18"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="add-marketplaceFee" className="text-sm font-medium text-slate-600">Marketplace Fee (%)</Label>
                  <Input
                    id="add-marketplaceFee"
                    type="number"
                    value={form.marketplaceFeePercent || ''}
                    onChange={e => updateField('marketplaceFeePercent', parseFloat(e.target.value) || 0)}
                    placeholder="5"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-paymentFee" className="text-sm font-medium text-slate-600">Payment Fee (%)</Label>
                  <Input
                    id="add-paymentFee"
                    type="number"
                    value={form.paymentFeePercent || ''}
                    onChange={e => updateField('paymentFeePercent', parseFloat(e.target.value) || 0)}
                    placeholder="2"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="add-targetMargin" className="text-sm font-medium text-slate-600">Target Margin (%)</Label>
                  <Input
                    id="add-targetMargin"
                    type="number"
                    value={form.targetMarginPercent || ''}
                    onChange={e => updateField('targetMarginPercent', parseFloat(e.target.value) || 0)}
                    placeholder="25"
                    className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Advanced fields */}
            {isAdvanced && (
              <div className="space-y-3">
                <Separator className="my-2" />
                <h4 className="text-sm font-semibold text-slate-700">Advanced Settings</h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Purchase Cost Tax Mode</Label>
                    <Select value={form.purchaseCostTaxMode || 'excluding-tax'} onValueChange={v => updateField('purchaseCostTaxMode', v as PurchaseCostTaxMode)}>
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
                    <Select value={form.inputTaxCreditRecoverable || 'not-recoverable'} onValueChange={v => updateField('inputTaxCreditRecoverable', v as InputTaxCreditRecoverable)}>
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
                    <Input
                      type="number"
                      value={form.packagingCost || ''}
                      onChange={e => updateField('packagingCost', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Handling Cost</Label>
                    <Input
                      type="number"
                      value={form.handlingCost || ''}
                      onChange={e => updateField('handlingCost', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Return Rate (%)</Label>
                    <Input
                      type="number"
                      value={form.returnRatePercent || ''}
                      onChange={e => updateField('returnRatePercent', parseFloat(e.target.value) || 0)}
                      placeholder="2"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Damage Rate (%)</Label>
                    <Input
                      type="number"
                      value={form.damageRatePercent || ''}
                      onChange={e => updateField('damageRatePercent', parseFloat(e.target.value) || 0)}
                      placeholder="1"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Other Costs</Label>
                    <Input
                      type="number"
                      value={form.otherCosts || ''}
                      onChange={e => updateField('otherCosts', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Custom Duty (%)</Label>
                    <Input
                      type="number"
                      value={form.customDutyPercent || ''}
                      onChange={e => updateField('customDutyPercent', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Marketplace Fixed Fee</Label>
                    <Input
                      type="number"
                      value={form.marketplaceFeeFixed || ''}
                      onChange={e => updateField('marketplaceFeeFixed', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Payment Fixed Fee</Label>
                    <Input
                      type="number"
                      value={form.paymentFeeFixed || ''}
                      onChange={e => updateField('paymentFeeFixed', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Minimum Profit per Unit</Label>
                    <Input
                      type="number"
                      value={form.minimumProfitPerUnit || ''}
                      onChange={e => updateField('minimumProfitPerUnit', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Sales Channel</Label>
                    <Select value={form.salesChannel || 'online-marketplace'} onValueChange={v => updateField('salesChannel', v as SalesChannel)}>
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Quantity</Label>
                    <Input
                      type="number"
                      value={form.quantity || ''}
                      onChange={e => updateField('quantity', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Monthly Units Sold</Label>
                    <Input
                      type="number"
                      value={form.monthlyUnitsSold || ''}
                      onChange={e => updateField('monthlyUnitsSold', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* Competitor prices */}
                <Separator className="my-2" />
                <h4 className="text-sm font-semibold text-slate-700">Competitor Prices</h4>
                {competitors.map((comp, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <Label className="text-xs text-slate-500">Name</Label>
                      <Input
                        value={comp.name}
                        onChange={e => {
                          const newComps = [...competitors];
                          newComps[idx] = { ...newComps[idx], name: e.target.value };
                          setCompetitors(newComps);
                        }}
                        placeholder="Competitor name"
                        className="bg-white shadow-sm border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Price</Label>
                      <Input
                        type="number"
                        value={comp.price}
                        onChange={e => {
                          const newComps = [...competitors];
                          newComps[idx] = { ...newComps[idx], price: parseFloat(e.target.value) || 0 };
                          setCompetitors(newComps);
                        }}
                        placeholder="0"
                        className="bg-white shadow-sm border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCompetitors(competitors.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCompetitors([...competitors, { name: `Competitor ${competitors.length + 1}`, price: 0 }])}
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 rounded-lg"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Competitor
                </Button>

                {/* Description & Notes */}
                <div>
                  <Label className="text-sm font-medium text-slate-600">Description</Label>
                  <Input
                    value={form.description || ''}
                    onChange={e => updateField('description', e.target.value)}
                    placeholder="Short description"
                    className="bg-white shadow-sm border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-600">Notes</Label>
                  <Textarea
                    value={form.notes || ''}
                    onChange={e => updateField('notes', e.target.value)}
                    placeholder="Internal notes..."
                    className="bg-white shadow-sm border-slate-200 rounded-lg min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Other Fees (%)</Label>
                    <Input
                      type="number"
                      value={form.otherFeesPercent || ''}
                      onChange={e => updateField('otherFeesPercent', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Other Fixed Fees</Label>
                    <Input
                      type="number"
                      value={form.otherFeesFixed || ''}
                      onChange={e => updateField('otherFeesFixed', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Shipping Charge to Customer</Label>
                    <Input
                      type="number"
                      value={form.shippingChargeToCustomer || ''}
                      onChange={e => updateField('shippingChargeToCustomer', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Freight (% of purchase cost)</Label>
                    <Input
                      type="number"
                      value={form.freightPercent || ''}
                      onChange={e => updateField('freightPercent', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white shadow-sm border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="p-3 bg-red-50/50 border border-red-200 rounded-lg text-sm text-red-700">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="font-semibold">Validation Errors</span>
                </div>
                {validationErrors.map(e => <div key={e}>{e}</div>)}
              </div>
            )}
          </div>

          {/* Right: Live pricing preview */}
          <div className="space-y-4">
            <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-slate-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-700">Live Pricing Preview</h3>
                </div>

                {!previewOutcome ? (
                  <div className="text-center py-6 text-slate-400">
                    <Calculator className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Enter purchase cost and selling price to see the pricing outcome</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500">Net Revenue</div>
                        <div className="text-lg font-bold">{formatCurrency(previewOutcome.netSalesRevenue, cc)}</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500">Total Cost</div>
                        <div className="text-lg font-bold">{formatCurrency(previewOutcome.totalCostPerSuccessfulSale, cc)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-3 rounded-lg ${previewOutcome.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <div className="text-xs text-slate-500">Net Profit</div>
                        <div className={`text-lg font-bold ${previewOutcome.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {formatCurrency(previewOutcome.netProfit, cc)}
                        </div>
                      </div>
                      <div className={`p-3 rounded-lg ${previewOutcome.effectiveMarginPercent >= businessSettings.defaultMinimumMarginPercent ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <div className="text-xs text-slate-500">Margin</div>
                        <div className={`text-lg font-bold ${previewOutcome.effectiveMarginPercent >= businessSettings.defaultMinimumMarginPercent ? 'text-emerald-700' : 'text-red-700'}`}>
                          {formatPercentage(previewOutcome.effectiveMarginPercent)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500">Markup</div>
                        <div className="text-lg font-bold">{formatPercentage(previewOutcome.markupPercent)}</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500">Confidence</div>
                        <Badge className={`${previewOutcome.confidence === 'high' ? 'bg-emerald-600' : previewOutcome.confidence === 'medium' ? 'bg-amber-500' : 'bg-red-500'} text-white rounded-lg`}>
                          {previewOutcome.confidence}
                        </Badge>
                      </div>
                    </div>

                    {/* Cost breakdown */}
                    <Separator />
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Purchase Cost</span><span>{formatCurrency(previewOutcome.purchaseCost, cc)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Fixed Costs</span><span>{formatCurrency(previewOutcome.fixedProductCosts, cc)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Return Cost</span><span>{formatCurrency(previewOutcome.expectedReturnCost, cc)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Damage Cost</span><span>{formatCurrency(previewOutcome.expectedDamageCost, cc)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Total Fees</span><span>{formatCurrency(previewOutcome.totalSellingFees, cc)}</span></div>
                      <div className="flex justify-between font-bold border-t pt-1"><span>Total Landed Cost</span><span>{formatCurrency(previewOutcome.totalLandedCost, cc)}</span></div>
                    </div>

                    {/* Warnings */}
                    {previewOutcome.warnings.length > 0 && (
                      <div className="space-y-1">
                        {previewOutcome.warnings.map((w, i) => (
                          <div key={i} className={`p-2 rounded-lg text-xs ${w.severity === 'error' || w.severity === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                            {w.message}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Status indicators */}
                    <div className="flex gap-2 flex-wrap">
                      {previewOutcome.isProfitable && <Badge className="bg-emerald-100 text-emerald-700 rounded-lg text-xs">Profitable</Badge>}
                      {!previewOutcome.isProfitable && <Badge className="bg-red-100 text-red-700 rounded-lg text-xs">Loss-making</Badge>}
                      {previewOutcome.satisfiesMinimumMargin && <Badge className="bg-emerald-100 text-emerald-700 rounded-lg text-xs">Above Min Margin</Badge>}
                      {previewOutcome.satisfiesTargetMargin && <Badge className="bg-emerald-100 text-emerald-700 rounded-lg text-xs">Above Target</Badge>}
                      {previewOutcome.satisfiesMinimumProfit && <Badge className="bg-emerald-100 text-emerald-700 rounded-lg text-xs">Above Min Profit</Badge>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="flex items-center gap-2 pt-4">
          <Button
            onClick={() => handleSave(true)}
            disabled={validationErrors.length > 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
          >
            <Save className="h-4 w-4 mr-1" /> Save and Add Another
          </Button>
          <Button
            onClick={() => handleSave(false)}
            disabled={validationErrors.length > 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-semibold"
          >
            <Plus className="h-4 w-4 mr-1" /> Save Product
          </Button>
          <DialogClose asChild>
            <Button variant="outline" className="rounded-lg border-slate-200 shadow-sm hover:bg-slate-50">
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddProductDialog;
