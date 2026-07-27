'use client';

import { useState, useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { calculateOutcomeAtPrice } from '@/lib/pricepilot/pricing-engine';
import { resolveEffectivePricingPolicy } from '@/lib/pricepilot/resolve-rule';
import {
  Product,
  PriceOutcome,
  ProfitabilityMeter,
  TaxTreatment,
  PurchaseCostTaxMode,
  InputTaxCreditRecoverable,
  ResolvedPricingPolicy,
} from '@/lib/pricepilot/types';
import { Bookmark, Package, Calculator, AlertTriangle } from 'lucide-react';

export function PriceSimulator() {
  const { businessSettings, addScenario, addProduct, pricingRules } = usePricePilotStore();
  const cc = businessSettings.currencyCode;

  const [inputs, setInputs] = useState({
    purchaseCost: 0,
    shippingCost: businessSettings.defaultShippingCost,
    packagingCost: businessSettings.defaultPackagingCost,
    handlingCost: businessSettings.defaultHandlingCost,
    otherFixedCost: businessSettings.defaultOtherCosts,
    marketplaceFeePercent: businessSettings.defaultMarketplaceFeePercent,
    marketplaceFeeFixed: businessSettings.defaultMarketplaceFeeFixed,
    paymentFeePercent: businessSettings.defaultPaymentFeePercent,
    paymentFeeFixed: businessSettings.defaultPaymentFeeFixed,
    taxPercent: businessSettings.defaultTaxRatePercent,
    taxTreatment: businessSettings.taxTreatment,
    returnRatePercent: businessSettings.defaultReturnRatePercent,
    damageRatePercent: businessSettings.defaultDamageRatePercent,
    targetMarginPercent: businessSettings.defaultTargetMarginPercent,
    competitorPrice: 0,
    proposedPrice: 0,
    // Purchase-side tax inputs
    purchaseTaxRatePercent: 0,
    purchaseCostTaxMode: 'excluding-tax' as PurchaseCostTaxMode,
    inputTaxCreditRecoverable: 'not-recoverable' as InputTaxCreditRecoverable,
    // Other fees
    otherFeesPercent: 0,
    otherFeesFixed: 0,
    shippingChargeToCustomer: 0,
    // Custom duty & freight
    customDutyPercent: businessSettings.defaultCustomDutyPercent,
    freightPercent: businessSettings.defaultFreightPercent,
  });

  const updateInput = (key: string, value: number | string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  // Create a simulated product object that matches the Product type
  const simProduct: Product = useMemo(() => ({
    id: 'sim-product',
    sku: 'SIM',
    name: 'Simulated Product',
    category: 'Simulated',
    brand: '',
    description: 'Product for price simulation',
    tags: ['simulator'],
    purchaseCost: inputs.purchaseCost,
    shippingCost: inputs.shippingCost,
    packagingCost: inputs.packagingCost,
    handlingCost: inputs.handlingCost,
    otherCosts: inputs.otherFixedCost,
    returnRatePercent: inputs.returnRatePercent,
    damageRatePercent: inputs.damageRatePercent,
    customDutyPercent: inputs.customDutyPercent,
    freightPercent: inputs.freightPercent,
    currentSellingPrice: inputs.proposedPrice,
    competitorPrices: inputs.competitorPrice > 0 ? [{ name: 'Competitor', price: inputs.competitorPrice }] : [],
    salesChannel: 'online-marketplace',
    taxRatePercent: inputs.taxPercent,
    taxTreatment: inputs.taxTreatment as TaxTreatment,
    marketplaceFeePercent: inputs.marketplaceFeePercent,
    marketplaceFeeFixed: inputs.marketplaceFeeFixed,
    paymentFeePercent: inputs.paymentFeePercent,
    paymentFeeFixed: inputs.paymentFeeFixed,
    shippingChargeToCustomer: inputs.shippingChargeToCustomer,
    otherFeesPercent: inputs.otherFeesPercent,
    otherFeesFixed: inputs.otherFeesFixed,
    purchaseTaxRatePercent: inputs.purchaseTaxRatePercent,
    inputTaxCreditRecoverable: inputs.inputTaxCreditRecoverable,
    purchaseCostTaxMode: inputs.purchaseCostTaxMode,
    // Required calculated fields (will be overwritten by engine)
    calculatedBaseCost: 0,
    calculatedExpectedReturnCost: 0,
    calculatedExpectedDamageCost: 0,
    calculatedTotalLandedCost: 0,
    calculatedBreakEvenPrice: 0,
    calculatedMarkupPercent: 0,
    calculatedMarginPercent: 0,
    calculatedProfitPerUnit: 0,
    calculatedTotalPercentageFees: 0,
    calculatedTotalFixedFees: 0,
    inputTaxRecoverablePercent: 100,
    feeBasePolicy: 'product-price-only' as const,
    lifecycleStatus: 'active' as const,
    calculatedPricingStatus: 'missing-data',
    calculatedProfitabilityMeter: 'loss',
    recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },
    selectedRecommendationMode: 'balanced',
    customRecommendedPrice: 0,
    finalApprovedPrice: 0,
    priceApprovalStatus: 'none',
    approvedAt: '',
    quantity: 0,
    monthlyUnitsSold: 0,
    expectedMonthlyUnits: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isApproved: false,
    notes: 'Created from Price Simulator',
  }), [inputs]);

  // Resolve effective pricing policy (using a simulator-specific rule)
  const simEffectiveRule: ResolvedPricingPolicy = useMemo(() => {
    // Create a virtual pricing rule from the simulator's target margin
    const simRules = [{
      id: 'sim-rule',
      name: 'Simulator Rule',
      level: 'global' as const,
      targetMarginPercent: inputs.targetMarginPercent,
      minimumMarginPercent: businessSettings.defaultMinimumMarginPercent,
      maximumMarginPercent: businessSettings.defaultMaximumMarginPercent,
      targetMarkupPercent: 0,
      roundingRule: 'no-rounding' as const,
      competitorStrategy: { mode: 'match-average' as const, weightPercent: 25 },
      priority: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: 'Simulator rule',
    }];
    return resolveEffectivePricingPolicy(simProduct, simRules, businessSettings);
  }, [simProduct, inputs.targetMarginPercent, businessSettings]);

  // Calculate the full PriceOutcome using the canonical engine
  const proposedOutcome: PriceOutcome | null = useMemo(() => {
    const price = inputs.proposedPrice;
    if (price <= 0) return null;
    return calculateOutcomeAtPrice({
      product: simProduct,
      sellingPrice: price,
      businessSettings,
      effectiveRule: simEffectiveRule,
    });
  }, [simProduct, inputs.proposedPrice, businessSettings, simEffectiveRule]);

  // Calculate recommendation prices using the engine
  const recommendations = useMemo(() => {
    if (inputs.purchaseCost <= 0) {
      return { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0 };
    }

    // Use calculateOutcomeAtPrice iteratively to find break-even and minimum safe
    // Break-even: price where net profit = 0
    let breakEven = 0;
    let minimumSafe = 0;
    const increment = 1;
    const maxIterations = 10000;

    // Find break-even (net profit ≈ 0)
    for (let i = 0; i < maxIterations; i++) {
      const candidate = simProduct.calculatedTotalLandedCost + i * increment + increment;
      const outcome = calculateOutcomeAtPrice({
        product: simProduct,
        sellingPrice: candidate,
        businessSettings,
        effectiveRule: simEffectiveRule,
      });
      if (outcome.netProfit >= 0) {
        breakEven = candidate;
        break;
      }
    }

    // Find minimum safe (satisfies minimum margin)
    for (let i = 0; i < maxIterations; i++) {
      const candidate = breakEven + i * increment + increment;
      const outcome = calculateOutcomeAtPrice({
        product: simProduct,
        sellingPrice: candidate,
        businessSettings,
        effectiveRule: simEffectiveRule,
      });
      if (outcome.satisfiesMinimumMargin && outcome.satisfiesMinimumProfit) {
        minimumSafe = candidate;
        break;
      }
    }

    // Balanced: price at target margin
    const targetMargin = simEffectiveRule.targetMarginPercent;
    const totalPctFeesDecimal = proposedOutcome
      ? (proposedOutcome.marketplacePercentageFee + proposedOutcome.paymentPercentageFee + proposedOutcome.otherPercentageFees) / (proposedOutcome.enteredSellingPrice || 1)
      : 0;

    // Simple formula: balancedPrice = totalCost / (1 - totalPctFeesDecimal - targetMarginDecimal)
    const targetMarginDecimal = targetMargin / 100;
    const denominator = 1 - totalPctFeesDecimal - targetMarginDecimal;
    let balanced = 0;
    let premium = 0;

    if (denominator > 0) {
      balanced = Math.round(simProduct.calculatedTotalLandedCost / denominator);
      // Premium: at premiumMarginPercent
      const premiumDecimal = simEffectiveRule.premiumMarginPercent / 100;
      const premiumDenom = 1 - totalPctFeesDecimal - premiumDecimal;
      if (premiumDenom > 0) {
        premium = Math.round(simProduct.calculatedTotalLandedCost / premiumDenom);
      }
    }

    // Competitive: use competitor price if available, otherwise = balanced
    const competitive = inputs.competitorPrice > 0
      ? Math.max(inputs.competitorPrice, minimumSafe)
      : balanced;

    return { breakEven, minimum: minimumSafe, competitive, balanced, premium };
  }, [simProduct, businessSettings, simEffectiveRule, proposedOutcome, inputs.purchaseCost, inputs.competitorPrice]);

  // Determine meter level from proposed outcome
  const meterLevel: ProfitabilityMeter = useMemo(() => {
    if (!proposedOutcome) return 'loss';
    if (proposedOutcome.netProfit < 0) return 'loss';
    if (proposedOutcome.isBreakEven) return 'break-even';
    if (proposedOutcome.effectiveMarginPercent < businessSettings.defaultMinimumMarginPercent) return 'low-margin';
    if (proposedOutcome.effectiveMarginPercent < businessSettings.strongMarginThresholdPercent) return 'healthy';
    return 'strong-margin';
  }, [proposedOutcome, businessSettings]);

  const meterColor = (level: ProfitabilityMeter) => {
    switch (level) {
      case 'loss': return 'bg-[#ef4444]';
      case 'break-even': return 'bg-[#f97316]';
      case 'low-margin': return 'bg-[#f59e0b]';
      case 'healthy': return 'bg-[#10b981]';
      case 'strong-margin': return 'bg-[#059669]';
    }
  };

  const meterLabel = (level: ProfitabilityMeter) => {
    switch (level) {
      case 'loss': return 'Loss';
      case 'break-even': return 'Break-even';
      case 'low-margin': return 'Low Margin';
      case 'healthy': return 'Healthy';
      case 'strong-margin': return 'Strong Margin';
    }
  };

  const handleSaveScenario = () => {
    addScenario({
      id: `scenario-${Date.now()}`,
      name: `Simulator — ${formatCurrency(inputs.purchaseCost, cc)} cost at ${formatCurrency(inputs.proposedPrice, cc)}`,
      description: `Simulated pricing for a product with ${formatCurrency(inputs.purchaseCost, cc)} purchase cost`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scenarioType: 'simulator',
      snapshotProducts: [],
      snapshotPricingRules: pricingRules,
      snapshotBusinessSettings: businessSettings,
      isBaseline: false,
    });
  };

  const handleCreateProduct = () => {
    addProduct({
      ...simProduct,
      id: `prod-sim-${Date.now()}`,
      sku: 'SIM-' + Date.now().toString().slice(-6),
      name: `Simulated Product (${formatCurrency(inputs.purchaseCost, cc)} cost)`,
      currentSellingPrice: inputs.proposedPrice,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input Panel */}
      <div className="space-y-4">
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-md shadow-emerald-500/20">
                <Calculator className="h-4 w-4" />
              </span>
              Price Simulator
            </CardTitle>
            <CardDescription>Calculate prices and profitability using the canonical pricing engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            {/* Proposed selling price — prominent at top so users see it before Live Results */}
            <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50/30 border border-emerald-200/50">
              <Label className="text-sm font-semibold text-emerald-800 flex items-center gap-1">
                <Calculator className="h-3.5 w-3.5" />
                Proposed Selling Price
              </Label>
              <Input
                type="number"
                value={inputs.proposedPrice}
                onChange={e => updateInput('proposedPrice', parseFloat(e.target.value) || 0)}
                className="mt-1 bg-white shadow-sm border-emerald-200 focus:ring-2 focus:ring-emerald-500/20 text-lg font-semibold"
                placeholder="Enter a price to see live results →"
              />
              {inputs.proposedPrice > 0 && (
                <Slider
                  min={Math.max(0, Math.floor(Math.max(recommendations.breakEven, 0) * 0.5))}
                  max={Math.ceil(Math.max(recommendations.premium, recommendations.breakEven || 100) * 1.5)}
                  step={1}
                  value={[inputs.proposedPrice]}
                  onValueChange={([v]) => updateInput('proposedPrice', v)}
                  className="mt-2"
                />
              )}
            </div>

            <Separator className="my-4 bg-slate-100" />

            {/* Cost inputs — 8 fields in a balanced 2-col grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-600">Purchase Cost</Label>
                <Input type="number" value={inputs.purchaseCost} onChange={e => updateInput('purchaseCost', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Shipping Cost</Label>
                <Input type="number" value={inputs.shippingCost} onChange={e => updateInput('shippingCost', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Packaging Cost</Label>
                <Input type="number" value={inputs.packagingCost} onChange={e => updateInput('packagingCost', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Handling Cost</Label>
                <Input type="number" value={inputs.handlingCost} onChange={e => updateInput('handlingCost', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Other Fixed Cost</Label>
                <Input type="number" value={inputs.otherFixedCost} onChange={e => updateInput('otherFixedCost', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Custom Duty (%)</Label>
                <Input type="number" value={inputs.customDutyPercent} onChange={e => updateInput('customDutyPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Freight (%)</Label>
                <Input type="number" value={inputs.freightPercent} onChange={e => updateInput('freightPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Shipping Charge to Customer</Label>
                <Input type="number" value={inputs.shippingChargeToCustomer} onChange={e => updateInput('shippingChargeToCustomer', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
            </div>

            <Separator className="my-4 bg-slate-100" />

            {/* Percentage fees */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-600">Marketplace Commission (%)</Label>
                <Input type="number" value={inputs.marketplaceFeePercent} onChange={e => updateInput('marketplaceFeePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Marketplace Fixed Fee</Label>
                <Input type="number" value={inputs.marketplaceFeeFixed} onChange={e => updateInput('marketplaceFeeFixed', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Payment Gateway (%)</Label>
                <Input type="number" value={inputs.paymentFeePercent} onChange={e => updateInput('paymentFeePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Payment Fixed Fee</Label>
                <Input type="number" value={inputs.paymentFeeFixed} onChange={e => updateInput('paymentFeeFixed', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Other % Fees</Label>
                <Input type="number" value={inputs.otherFeesPercent} onChange={e => updateInput('otherFeesPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Other Fixed Fees</Label>
                <Input type="number" value={inputs.otherFeesFixed} onChange={e => updateInput('otherFeesFixed', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
            </div>

            <Separator className="my-4 bg-slate-100" />

            {/* Tax & selling inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-600">Tax Rate (%)</Label>
                <Input type="number" value={inputs.taxPercent} onChange={e => updateInput('taxPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Tax Treatment</Label>
                <Select value={inputs.taxTreatment} onValueChange={v => updateInput('taxTreatment', v)}>
                  <SelectTrigger className="bg-white shadow-sm border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inclusive">Inclusive (tax in price)</SelectItem>
                    <SelectItem value="exclusive">Exclusive (tax added)</SelectItem>
                    <SelectItem value="exempt">Exempt (no tax)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Return Rate (%)</Label>
                <Input type="number" value={inputs.returnRatePercent} onChange={e => updateInput('returnRatePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Damage Rate (%)</Label>
                <Input type="number" value={inputs.damageRatePercent} onChange={e => updateInput('damageRatePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
            </div>

            <Separator className="my-4 bg-slate-100" />

            {/* Purchase-side tax inputs — 3 fields instead of 4 (Shipping Charge moved up) */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-600">Purchase Tax Rate (%)</Label>
                <Input type="number" value={inputs.purchaseTaxRatePercent} onChange={e => updateInput('purchaseTaxRatePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Purchase Cost Tax Mode</Label>
                <Select value={inputs.purchaseCostTaxMode} onValueChange={v => updateInput('purchaseCostTaxMode', v)}>
                  <SelectTrigger className="bg-white shadow-sm border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excluding-tax">Excluding Tax</SelectItem>
                    <SelectItem value="including-tax">Including Tax</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Input Tax Credit</Label>
                <Select value={inputs.inputTaxCreditRecoverable} onValueChange={v => updateInput('inputTaxCreditRecoverable', v)}>
                  <SelectTrigger className="bg-white shadow-sm border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-recoverable">Not Recoverable</SelectItem>
                    <SelectItem value="recoverable">Recoverable</SelectItem>
                    <SelectItem value="partially-recoverable">Partially Recoverable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator className="my-4 bg-slate-100" />

            {/* Target & competitor */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-600">Target Margin (%)</Label>
                <Input type="number" value={inputs.targetMarginPercent} onChange={e => updateInput('targetMarginPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Competitor Price</Label>
                <Input type="number" value={inputs.competitorPrice} onChange={e => updateInput('competitorPrice', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        {/* Full PriceOutcome from canonical engine */}
        {proposedOutcome ? (
          <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Live Results (from Canonical Engine)</CardTitle>
              <CardDescription className="text-xs">All values computed by pricing-engine.ts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="grid grid-cols-2 gap-3">
                <ResultItem label="Customer Payable" value={formatCurrency(proposedOutcome.customerPayableAmount, cc)} />
                <ResultItem label="Net Sales Revenue" value={formatCurrency(proposedOutcome.netSalesRevenue, cc)} />
                <ResultItem label="Output Tax" value={formatCurrency(proposedOutcome.outputTax, cc)} />
                <ResultItem label="Total Landed Cost" value={formatCurrency(proposedOutcome.totalLandedCost, cc)} />
                <ResultItem label="Total Selling Fees" value={formatCurrency(proposedOutcome.totalSellingFees, cc)} />
                <ResultItem label="Net Profit" value={formatCurrency(proposedOutcome.netProfit, cc)} highlight={proposedOutcome.netProfit >= 0 ? 'positive' : 'negative'} />
                <ResultItem label="Effective Margin" value={formatPercentage(proposedOutcome.effectiveMarginPercent)} />
                <ResultItem label="Markup" value={formatPercentage(proposedOutcome.markupPercent)} />
                <ResultItem label="Recoverable Input Tax" value={formatCurrency(proposedOutcome.recoverableInputTax, cc)} />
                <ResultItem label="Non-Recoverable Tax" value={formatCurrency(proposedOutcome.nonRecoverableInputTax, cc)} />
              </div>

              <Separator className="my-4 bg-slate-100" />

              {/* Market breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <ResultItem label="Marketplace % Fee" value={formatCurrency(proposedOutcome.marketplacePercentageFee, cc)} />
                <ResultItem label="Marketplace Fixed Fee" value={formatCurrency(proposedOutcome.marketplaceFixedFee, cc)} />
                <ResultItem label="Payment % Fee" value={formatCurrency(proposedOutcome.paymentPercentageFee, cc)} />
                <ResultItem label="Payment Fixed Fee" value={formatCurrency(proposedOutcome.paymentFixedFee, cc)} />
                <ResultItem label="Other % Fees" value={formatCurrency(proposedOutcome.otherPercentageFees, cc)} />
                <ResultItem label="Other Fixed Fees" value={formatCurrency(proposedOutcome.otherFixedFees, cc)} />
              </div>

              <Separator className="my-4 bg-slate-100" />

              {/* Boolean flags */}
              <div className="grid grid-cols-3 gap-3">
                <ResultItem label="Profitable?" value={proposedOutcome.isProfitable ? '✓ Yes' : '✗ No'} highlight={proposedOutcome.isProfitable ? 'positive' : 'negative'} />
                <ResultItem label="Break-even?" value={proposedOutcome.isBreakEven ? '≈ Yes' : 'No'} />
                <ResultItem label="Min Margin?" value={proposedOutcome.satisfiesMinimumMargin ? '✓ Yes' : '✗ No'} highlight={proposedOutcome.satisfiesMinimumMargin ? 'positive' : 'negative'} />
                <ResultItem label="Target Margin?" value={proposedOutcome.satisfiesTargetMargin ? '✓ Yes' : '✗ No'} highlight={proposedOutcome.satisfiesTargetMargin ? 'positive' : 'negative'} />
                <ResultItem label="Min Profit?" value={proposedOutcome.satisfiesMinimumProfit ? '✓ Yes' : '✗ No'} highlight={proposedOutcome.satisfiesMinimumProfit ? 'positive' : 'negative'} />
                <ResultItem label="Confidence" value={proposedOutcome.confidence} />
              </div>

              {/* Warnings */}
              {proposedOutcome.warnings.length > 0 && (
                <div className="mt-4 space-y-1">
                  {proposedOutcome.warnings.map((w, i) => (
                    <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                      w.severity === 'critical' || w.severity === 'error' ? 'bg-red-50 border border-red-200 text-red-700' :
                      w.severity === 'warning' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                      'bg-slate-50 border border-slate-200 text-slate-600'
                    }`}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="font-semibold">{w.severity}: </span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommended Prices */}
              <Separator className="my-4 bg-slate-100" />

              <div className="bg-gradient-to-r from-emerald-50/50 to-emerald-25/20 rounded-lg p-4 border border-emerald-200/50 shadow-sm">
                <Label className="text-sm font-medium text-slate-700">Recommended Prices (from Engine)</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <ResultItem label="Break-even" value={formatCurrency(recommendations.breakEven, cc)} />
                  <ResultItem label="Minimum Safe" value={formatCurrency(recommendations.minimum, cc)} />
                  <ResultItem label="Competitive" value={formatCurrency(recommendations.competitive, cc)} />
                  <ResultItem label="Balanced" value={formatCurrency(recommendations.balanced, cc)} highlight="positive" />
                  <ResultItem label="Premium" value={formatCurrency(recommendations.premium, cc)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-slate-50/20">
            <CardHeader className="pb-3"><CardTitle className="text-base">Live Results</CardTitle></CardHeader>
            <CardContent>
              <div className="text-center text-slate-400 py-8">Enter a proposed selling price above to see the full outcome</div>
            </CardContent>
          </Card>
        )}

        {/* Profitability Meter */}
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/10">
          <CardHeader className="pb-3"><CardTitle className="text-base">Profitability Meter</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {(['loss', 'break-even', 'low-margin', 'healthy', 'strong-margin'] as ProfitabilityMeter[]).map(level => (
                <div
                  key={level}
                  className={`h-10 flex-1 rounded-lg transition-all duration-300 ${
                    meterLevel === level
                      ? `${meterColor(level)} shadow-md shadow-emerald-500/10 text-sm font-semibold text-white scale-105`
                      : 'bg-slate-100 text-xs font-medium text-slate-400'
                  } flex items-center justify-center`}
                >
                  {meterLevel === level ? meterLabel(level) : ''}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={handleSaveScenario} className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md shadow-emerald-500/20 rounded-lg transition-all duration-200 hover:shadow-lg">
            <Bookmark className="h-4 w-4 mr-2" /> Save as Scenario
          </Button>
          <Button variant="outline" onClick={handleCreateProduct} className="bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 shadow-sm rounded-lg transition-all duration-200 hover:shadow-md">
            <Package className="h-4 w-4 mr-2" /> Create Product
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResultItem({ label, value, highlight }: { label: string; value: string; highlight?: 'positive' | 'negative' }) {
  const colorClass = highlight === 'positive' ? 'text-emerald-600' : highlight === 'negative' ? 'text-red-600' : '';
  return (
    <div className="rounded-lg p-3 bg-gradient-to-b from-white to-slate-50/30 shadow-sm border border-slate-100 transition-all duration-200 hover:shadow-md hover:border-slate-200">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

export default PriceSimulator;
