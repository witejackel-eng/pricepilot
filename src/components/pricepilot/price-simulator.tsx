'use client';

import { useState, useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import {
  calculateBaseCost,
  calculateExpectedReturnCost,
  calculateExpectedDamageCost,
  calculateTotalLandedCost,
  calculatePercentageFees,
  calculateFixedFees,
  calculateBreakEvenPrice,
  calculateMinimumSafePrice,
  calculateBalancedPrice,
  calculatePremiumPrice,
  calculateMarkup,
  calculateMargin,
} from '@/lib/pricepilot/calculations';
import { ProfitabilityMeter } from '@/lib/pricepilot/types';
import { Bookmark, Package, Calculator } from 'lucide-react';

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
    paymentFeePercent: businessSettings.defaultPaymentFeePercent,
    taxPercent: businessSettings.defaultTaxRatePercent,
    returnRatePercent: businessSettings.defaultReturnRatePercent,
    damageRatePercent: businessSettings.defaultDamageRatePercent,
    targetMarginPercent: businessSettings.defaultTargetMarginPercent,
    competitorPrice: 0,
    proposedPrice: 0,
  });

  const updateInput = (key: string, value: number) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  // Create a simulated product object for calculations
  const simProduct = useMemo(() => ({
    purchaseCost: inputs.purchaseCost,
    shippingCost: inputs.shippingCost,
    packagingCost: inputs.packagingCost,
    handlingCost: inputs.handlingCost,
    otherCosts: inputs.otherFixedCost,
    marketplaceFeePercent: inputs.marketplaceFeePercent,
    paymentFeePercent: inputs.paymentFeePercent,
    taxRatePercent: inputs.taxPercent,
    returnRatePercent: inputs.returnRatePercent,
    damageRatePercent: inputs.damageRatePercent,
    currentSellingPrice: inputs.proposedPrice,
    competitorPrices: inputs.competitorPrice > 0 ? [{ name: 'Competitor', price: inputs.competitorPrice }] : [],
    freightPercent: 0,
    customDutyPercent: 0,
    marketplaceFeeFixed: 0,
    paymentFeeFixed: 0,
    otherFeesFixed: 0,
    otherFeesPercent: 0,
  }), [inputs]);

  // Calculations using the real engine
  const results = useMemo(() => {
    const baseCost = calculateBaseCost(simProduct, businessSettings);
    const returnCost = calculateExpectedReturnCost(simProduct, businessSettings);
    const damageCost = calculateExpectedDamageCost(simProduct, businessSettings);
    const totalLandedCost = calculateTotalLandedCost(simProduct, businessSettings);
    const pctFees = calculatePercentageFees(inputs.proposedPrice || 0, simProduct, businessSettings);
    const fixedFees = calculateFixedFees(simProduct, businessSettings);
    const breakEvenPrice = calculateBreakEvenPrice(simProduct, businessSettings);
    const minPrice = calculateMinimumSafePrice(simProduct, businessSettings);
    const balancedPrice = calculateBalancedPrice(simProduct, businessSettings);
    const premiumPrice = calculatePremiumPrice(simProduct, businessSettings);

    const proposedPrice = inputs.proposedPrice || 0;
    const proposedProfit = proposedPrice > 0
      ? proposedPrice - totalLandedCost - (proposedPrice * pctFees / 100) - fixedFees
      : 0;
    const proposedMargin = calculateMargin(totalLandedCost, proposedPrice);
    const proposedMarkup = calculateMarkup(totalLandedCost, proposedPrice);
    const taxAmount = proposedPrice * inputs.taxPercent / 100;

    // Determine meter level
    let meterLevel: ProfitabilityMeter = 'loss';
    if (proposedPrice > 0) {
      if (proposedMargin < 0) meterLevel = 'loss';
      else if (proposedMargin < 2) meterLevel = 'break-even';
      else if (proposedMargin < businessSettings.defaultMinimumMarginPercent) meterLevel = 'low-margin';
      else if (proposedMargin < businessSettings.strongMarginThresholdPercent) meterLevel = 'healthy';
      else meterLevel = 'strong-margin';
    }

    return {
      totalLandedCost,
      breakEvenPrice,
      minPrice,
      balancedPrice,
      premiumPrice,
      proposedProfit,
      proposedMargin,
      proposedMarkup,
      totalFees: pctFees + fixedFees,
      taxAmount,
      meterLevel,
    };
  }, [simProduct, businessSettings, inputs.proposedPrice, inputs.taxPercent]);

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
      snapshotProducts: [],
      snapshotPricingRules: pricingRules,
      snapshotBusinessSettings: businessSettings,
      isBaseline: false,
    });
  };

  const handleCreateProduct = () => {
    addProduct({
      id: `prod-sim-${Date.now()}`,
      sku: 'SIM-' + Date.now().toString().slice(-6),
      name: `Simulated Product (${formatCurrency(inputs.purchaseCost, cc)} cost)`,
      category: 'Simulated',
      brand: '',
      description: 'Created from Price Simulator',
      tags: ['simulator'],
      purchaseCost: inputs.purchaseCost,
      shippingCost: inputs.shippingCost,
      packagingCost: inputs.packagingCost,
      handlingCost: inputs.handlingCost,
      otherCosts: inputs.otherFixedCost,
      returnRatePercent: inputs.returnRatePercent,
      damageRatePercent: inputs.damageRatePercent,
      customDutyPercent: 0,
      freightPercent: 0,
      currentSellingPrice: inputs.proposedPrice,
      competitorPrices: inputs.competitorPrice > 0 ? [{ name: 'Competitor', price: inputs.competitorPrice }] : [],
      salesChannel: 'online-marketplace',
      taxRatePercent: inputs.taxPercent,
      taxTreatment: businessSettings.taxTreatment,
      marketplaceFeePercent: inputs.marketplaceFeePercent,
      marketplaceFeeFixed: 0,
      paymentFeePercent: inputs.paymentFeePercent,
      paymentFeeFixed: 0,
      shippingChargeToCustomer: 0,
      otherFeesPercent: 0,
      otherFeesFixed: 0,
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
      calculatedPricingStatus: 'missing-data',
      calculatedProfitabilityMeter: 'loss',
      recommendedPrices: { minimum: 0, competitive: 0, balanced: 0, premium: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isApproved: false,
      notes: 'Created from Price Simulator',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input Panel */}
      <div className="space-y-4">
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Calculator className="h-4 w-4" />
              </span>
              Price Simulator
            </CardTitle>
            <CardDescription>Calculate prices and profitability for a hypothetical product</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
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
                <Label className="text-sm font-medium text-slate-600">Other Fixed Cost</Label>
                <Input type="number" value={inputs.otherFixedCost} onChange={e => updateInput('otherFixedCost', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
            </div>

            <Separator className="my-4 bg-slate-100" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-600">Marketplace Commission (%)</Label>
                <Input type="number" value={inputs.marketplaceFeePercent} onChange={e => updateInput('marketplaceFeePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Payment Gateway (%)</Label>
                <Input type="number" value={inputs.paymentFeePercent} onChange={e => updateInput('paymentFeePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Tax (%)</Label>
                <Input type="number" value={inputs.taxPercent} onChange={e => updateInput('taxPercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-600">Return Rate (%)</Label>
                <Input type="number" value={inputs.returnRatePercent} onChange={e => updateInput('returnRatePercent', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
            </div>

            <Separator className="my-4 bg-slate-100" />

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

            <Separator className="my-4 bg-slate-100" />

            <div>
              <Label className="text-sm font-medium text-slate-600">Proposed Selling Price</Label>
              <Input type="number" value={inputs.proposedPrice} onChange={e => updateInput('proposedPrice', parseFloat(e.target.value) || 0)} className="bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20" />
              {inputs.proposedPrice > 0 && (
                <Slider
                  min={Math.max(0, Math.floor(results.breakEvenPrice * 0.5))}
                  max={Math.ceil(Math.max(results.premiumPrice, results.breakEvenPrice) * 1.5)}
                  step={1}
                  value={[inputs.proposedPrice]}
                  onValueChange={([v]) => updateInput('proposedPrice', v)}
                  className="mt-2"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader className="pb-3"><CardTitle className="text-base">Live Results</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <div className="grid grid-cols-2 gap-3">
              <ResultItem label="Total Landed Cost" value={formatCurrency(results.totalLandedCost, cc)} />
              <ResultItem label="Break-even Price" value={formatCurrency(results.breakEvenPrice, cc)} />
              <ResultItem label="Net Profit" value={formatCurrency(results.proposedProfit, cc)} highlight={results.proposedProfit >= 0 ? 'positive' : 'negative'} />
              <ResultItem label="Margin" value={formatPercentage(results.proposedMargin)} />
              <ResultItem label="Markup" value={formatPercentage(results.proposedMarkup)} />
              <ResultItem label="Total Fees" value={formatCurrency(results.totalFees, cc)} />
              <ResultItem label="Tax Amount" value={formatCurrency(results.taxAmount, cc)} />
            </div>

            <Separator className="my-4 bg-slate-100" />

            <div className="bg-emerald-50/30 rounded-lg p-4">
              <Label className="text-sm font-medium text-slate-700">Recommended Prices</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <ResultItem label="Minimum Safe" value={formatCurrency(results.minPrice, cc)} />
                <ResultItem label="Balanced" value={formatCurrency(results.balancedPrice, cc)} highlight="positive" />
                <ResultItem label="Premium" value={formatCurrency(results.premiumPrice, cc)} />
                <ResultItem label="Break-even" value={formatCurrency(results.breakEvenPrice, cc)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profitability Meter */}
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader className="pb-3"><CardTitle className="text-base">Profitability Meter</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {(['loss', 'break-even', 'low-margin', 'healthy', 'strong-margin'] as ProfitabilityMeter[]).map(level => (
                <div
                  key={level}
                  className={`h-10 flex-1 rounded-lg transition-all duration-300 ${
                    results.meterLevel === level
                      ? `${meterColor(level)} shadow-md text-sm font-semibold text-white`
                      : 'bg-slate-100 text-xs font-medium text-slate-400'
                  } flex items-center justify-center`}
                >
                  {results.meterLevel === level ? meterLabel(level) : ''}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={handleSaveScenario} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm rounded-lg">
            <Bookmark className="h-4 w-4 mr-2" /> Save as Scenario
          </Button>
          <Button variant="outline" onClick={handleCreateProduct} className="bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50 shadow-sm rounded-lg">
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
    <div className="rounded-lg p-3 bg-white shadow-sm border border-slate-100 bg-gradient-to-b from-white to-slate-50/30">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

export default PriceSimulator;
