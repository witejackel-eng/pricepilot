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
      case 'loss': return 'bg-red-500';
      case 'break-even': return 'bg-orange-500';
      case 'low-margin': return 'bg-amber-500';
      case 'healthy': return 'bg-emerald-500';
      case 'strong-margin': return 'bg-emerald-600';
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Price Simulator</CardTitle>
            <CardDescription>Calculate prices and profitability for a hypothetical product</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Purchase Cost</Label>
                <Input type="number" value={inputs.purchaseCost} onChange={e => updateInput('purchaseCost', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-sm">Shipping Cost</Label>
                <Input type="number" value={inputs.shippingCost} onChange={e => updateInput('shippingCost', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-sm">Packaging Cost</Label>
                <Input type="number" value={inputs.packagingCost} onChange={e => updateInput('packagingCost', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-sm">Other Fixed Cost</Label>
                <Input type="number" value={inputs.otherFixedCost} onChange={e => updateInput('otherFixedCost', parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Marketplace Commission (%)</Label>
                <Input type="number" value={inputs.marketplaceFeePercent} onChange={e => updateInput('marketplaceFeePercent', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-sm">Payment Gateway (%)</Label>
                <Input type="number" value={inputs.paymentFeePercent} onChange={e => updateInput('paymentFeePercent', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-sm">Tax (%)</Label>
                <Input type="number" value={inputs.taxPercent} onChange={e => updateInput('taxPercent', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-sm">Return Rate (%)</Label>
                <Input type="number" value={inputs.returnRatePercent} onChange={e => updateInput('returnRatePercent', parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Target Margin (%)</Label>
                <Input type="number" value={inputs.targetMarginPercent} onChange={e => updateInput('targetMarginPercent', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-sm">Competitor Price</Label>
                <Input type="number" value={inputs.competitorPrice} onChange={e => updateInput('competitorPrice', parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div>
              <Label className="text-sm">Proposed Selling Price</Label>
              <Input type="number" value={inputs.proposedPrice} onChange={e => updateInput('proposedPrice', parseFloat(e.target.value) || 0)} />
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
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Live Results</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <ResultItem label="Total Landed Cost" value={formatCurrency(results.totalLandedCost, cc)} />
              <ResultItem label="Break-even Price" value={formatCurrency(results.breakEvenPrice, cc)} />
              <ResultItem label="Net Profit" value={formatCurrency(results.proposedProfit, cc)} highlight={results.proposedProfit >= 0 ? 'positive' : 'negative'} />
              <ResultItem label="Margin" value={formatPercentage(results.proposedMargin)} />
              <ResultItem label="Markup" value={formatPercentage(results.proposedMarkup)} />
              <ResultItem label="Total Fees" value={formatCurrency(results.totalFees, cc)} />
              <ResultItem label="Tax Amount" value={formatCurrency(results.taxAmount, cc)} />
            </div>

            <Separator />

            <div>
              <Label className="text-sm font-medium">Recommended Prices</Label>
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
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Profitability Meter</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {(['loss', 'break-even', 'low-margin', 'healthy', 'strong-margin'] as ProfitabilityMeter[]).map(level => (
                <div
                  key={level}
                  className={`h-8 flex-1 rounded ${results.meterLevel === level ? meterColor(level) : 'bg-slate-200'} flex items-center justify-center text-xs font-medium text-white transition-colors`}
                >
                  {results.meterLevel === level ? meterLabel(level) : ''}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveScenario}>
            <Bookmark className="h-4 w-4 mr-2" /> Save as Scenario
          </Button>
          <Button variant="outline" onClick={handleCreateProduct}>
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
    <div className="p-2 rounded border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${colorClass}`}>{value}</div>
    </div>
  );
}

export default PriceSimulator;
