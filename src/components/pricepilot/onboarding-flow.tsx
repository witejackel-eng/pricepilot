'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { SUPPORTED_CURRENCIES, RoundingRule, TaxTreatment } from '@/lib/pricepilot/types';
import { ArrowLeft, ArrowRight, SkipForward, Building2, Store, Coins } from 'lucide-react';

const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'DE', name: 'Germany' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'SG', name: 'Singapore' },
];

const ROUNDING_RULES: { value: RoundingRule; label: string }[] = [
  { value: 'no-rounding', label: 'No rounding' },
  { value: 'nearest-whole', label: 'Nearest whole number' },
  { value: 'nearest-5', label: 'Nearest 5' },
  { value: 'nearest-10', label: 'Nearest 10' },
  { value: 'end-in-99', label: 'End in .99' },
  { value: 'end-in-95', label: 'End in .95' },
  { value: 'end-in-9', label: 'End in .9' },
  { value: 'end-in-49', label: 'End in .49' },
  { value: 'end-in-99-whole', label: 'End in 99 (whole)' },
];

const TAX_TREATMENTS: { value: TaxTreatment; label: string; desc: string }[] = [
  { value: 'inclusive', label: 'Tax inclusive (GST/VAT in price)', desc: 'Tax is already included in your selling price' },
  { value: 'exclusive', label: 'Tax exclusive (add tax on top)', desc: 'Tax is added on top of the selling price' },
  { value: 'exempt', label: 'Tax exempt', desc: 'No tax applies to your products' },
  { value: 'composite', label: 'Composite (multi-component GST)', desc: 'GST with CGST + SGST components' },
];

const CHANNELS = [
  { id: 'direct-offline', label: 'Direct / Offline', desc: 'In-store, direct sales' },
  { id: 'own-ecommerce', label: 'Own E-commerce', desc: 'Your own website/shop' },
  { id: 'amazon', label: 'Amazon', desc: 'Amazon marketplace' },
  { id: 'flipkart', label: 'Flipkart', desc: 'Flipkart marketplace' },
  { id: 'meesho', label: 'Meesho', desc: 'Meesho marketplace' },
  { id: 'wholesale', label: 'Wholesale', desc: 'Bulk/wholesale channels' },
  { id: 'multiple', label: 'Multiple channels', desc: 'Selling on multiple platforms' },
];

const inputClass = 'bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500';
const labelClass = 'text-sm font-medium text-slate-600';

export function OnboardingFlow() {
  const { businessSettings, completeOnboarding } = usePricePilotStore();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    businessName: businessSettings.businessName || '',
    currencyCode: businessSettings.currencyCode || 'INR',
    country: businessSettings.country || 'IN',
    taxTreatment: businessSettings.taxTreatment || 'inclusive',
    taxRate: businessSettings.defaultTaxRatePercent || 18,
    targetMargin: businessSettings.defaultTargetMarginPercent || 25,
    minimumMargin: businessSettings.defaultMinimumMarginPercent || 10,
    roundingRule: businessSettings.defaultRoundingRule || 'no-rounding',
    channels: [] as string[],
    packagingCost: businessSettings.defaultPackagingCost || 0,
    shippingCost: businessSettings.defaultShippingCost || 0,
    paymentFeePercent: businessSettings.defaultPaymentFeePercent || 2,
    marketplaceFeePercent: businessSettings.defaultMarketplaceFeePercent || 5,
    returnRate: businessSettings.defaultReturnRatePercent || 2,
    returnHandlingCost: businessSettings.defaultHandlingCost || 0,
    advertisingCost: businessSettings.defaultOtherCosts || 0,
    otherVariableCost: 0,
    minimumProfitPerProduct: 0,
  });

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      completeOnboarding({
        businessName: form.businessName,
        currencyCode: form.currencyCode,
        country: form.country,
        taxTreatment: form.taxTreatment,
        defaultTaxRatePercent: form.taxRate,
        defaultTargetMarginPercent: form.targetMargin,
        defaultMinimumMarginPercent: form.minimumMargin,
        defaultRoundingRule: form.roundingRule,
        defaultPackagingCost: form.packagingCost,
        defaultShippingCost: form.shippingCost,
        defaultPaymentFeePercent: form.paymentFeePercent,
        defaultMarketplaceFeePercent: form.marketplaceFeePercent,
        defaultReturnRatePercent: form.returnRate,
        defaultHandlingCost: form.returnHandlingCost,
        defaultOtherCosts: form.advertisingCost + form.otherVariableCost,
      });
    }
  };

  const handleSkip = () => {
    completeOnboarding({});
  };

  const updateForm = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-100 via-emerald-50/30 to-slate-50 p-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 shadow-lg shadow-emerald-500/30 flex items-center justify-center text-white font-bold text-xl animate-pulse">P</div>
            <h1 className="text-3xl font-bold text-slate-900">PricePilot</h1>
          </div>
          <p className="text-slate-500 text-base">Product Pricing & Profit Optimiser</p>
        </div>

        <Progress value={progress} className="h-2.5 rounded-full mb-4 animate-pulse bg-emerald-100" />
        <div className="flex items-center justify-between text-sm font-medium text-slate-600 mb-6">
          <span>Step {step} of {totalSteps}</span>
          <span>
            {step === 1 && 'Business Details'}
            {step === 2 && 'Selling Channels'}
            {step === 3 && 'Cost Defaults'}
          </span>
        </div>

        <Card className="shadow-lg shadow-emerald-500/10 border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/5 transition-all duration-300 hover:shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {step === 1 && <span className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-200 to-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm"><Building2 className="h-4 w-4" /></span>}
              {step === 2 && <span className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-200 to-purple-100 text-purple-600 flex items-center justify-center shadow-sm"><Store className="h-4 w-4" /></span>}
              {step === 3 && <span className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-200 to-amber-100 text-amber-600 flex items-center justify-center shadow-sm"><Coins className="h-4 w-4" /></span>}
              {step === 1 && 'Business Details'}
              {step === 2 && 'Where do you sell?'}
              {step === 3 && 'Default Costs & Fees'}
            </CardTitle>
            <CardDescription>
              {step === 1 && 'Tell us about your business to set up pricing defaults'}
              {step === 2 && 'Select all selling channels you use — this affects fee calculations'}
              {step === 3 && 'Set default costs that apply to most of your products'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <div className="space-y-4 relative">
                {/* Decorative building illustration */}
                <div className="absolute -right-4 -top-8 opacity-[0.08] pointer-events-none">
                  <div className="relative w-32 h-40">
                    {/* Building base */}
                    <div className="absolute bottom-0 left-0 w-32 h-20 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-b-lg rounded-t-sm" />
                    {/* Building middle */}
                    <div className="absolute bottom-20 left-4 w-24 h-12 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t-sm" />
                    {/* Building top */}
                    <div className="absolute bottom-32 left-8 w-16 h-8 bg-gradient-to-t from-emerald-400 to-emerald-200 rounded-t-md" />
                    {/* Antenna */}
                    <div className="absolute bottom-40 left-14 w-1 h-6 bg-gradient-to-t from-emerald-300 to-emerald-100 rounded-full" />
                    {/* Windows - base */}
                    <div className="absolute bottom-2 left-3 grid grid-cols-4 gap-1">
                      {Array.from({length: 8}).map((_, i) => (
                        <div key={i} className="w-3 h-3 bg-emerald-100/60 rounded-sm" />
                      ))}
                    </div>
                    {/* Windows - middle */}
                    <div className="absolute bottom-[84px] left-6 grid grid-cols-3 gap-1">
                      {Array.from({length: 6}).map((_, i) => (
                        <div key={i} className="w-3 h-2 bg-emerald-100/60 rounded-sm" />
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="businessName" className={labelClass}>Business Name</Label>
                  <Input id="businessName" value={form.businessName} onChange={e => updateForm('businessName', e.target.value)} placeholder="Your business name" className={inputClass} />
                </div>
                <div>
                  <Label htmlFor="currency" className={labelClass}>Default Currency</Label>
                  <Select value={form.currencyCode} onValueChange={v => updateForm('currencyCode', v)}>
                    <SelectTrigger id="currency" className={inputClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.symbol} {c.name} ({c.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="country" className={labelClass}>Country</Label>
                  <Select value={form.country} onValueChange={v => updateForm('country', v)}>
                    <SelectTrigger id="country" className={inputClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="taxTreatment" className={labelClass}>Tax Treatment</Label>
                  <Select value={form.taxTreatment} onValueChange={v => updateForm('taxTreatment', v)}>
                    <SelectTrigger id="taxTreatment" className={inputClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TAX_TREATMENTS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="taxRate" className={labelClass}>Default Tax Rate (%)</Label>
                  <Input id="taxRate" type="number" value={form.taxRate} onChange={e => updateForm('taxRate', parseFloat(e.target.value) || 0)} className={inputClass} />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="targetMargin" className={labelClass}>Target Margin (%)</Label>
                    <Input id="targetMargin" type="number" value={form.targetMargin} onChange={e => updateForm('targetMargin', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="minimumMargin" className={labelClass}>Minimum Margin (%)</Label>
                    <Input id="minimumMargin" type="number" value={form.minimumMargin} onChange={e => updateForm('minimumMargin', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="roundingRule" className={labelClass}>Price Rounding Rule</Label>
                  <Select value={form.roundingRule} onValueChange={v => updateForm('roundingRule', v)}>
                    <SelectTrigger id="roundingRule" className={inputClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROUNDING_RULES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3 relative">
                {/* Decorative storefront illustration */}
                <div className="absolute -right-2 -top-6 opacity-[0.08] pointer-events-none">
                  <div className="relative w-36 h-36">
                    {/* Awning */}
                    <div className="absolute bottom-24 left-0 w-36 h-10 bg-gradient-to-b from-emerald-400 to-emerald-500 rounded-t-lg" style={{ clipPath: 'polygon(0 0, 100% 0, 90% 80%, 10% 80%)' }} />
                    {/* Storefront body */}
                    <div className="absolute bottom-0 left-2 w-32 h-24 bg-gradient-to-b from-emerald-300 to-emerald-500 rounded-b-md" />
                    {/* Door */}
                    <div className="absolute bottom-0 left-12 w-10 h-18 bg-gradient-to-b from-emerald-100/50 to-emerald-200/50 rounded-t-md" />
                    {/* Window */}
                    <div className="absolute bottom-4 left-4 w-8 h-12 bg-emerald-100/40 rounded-md" />
                    {/* Sign */}
                    <div className="absolute bottom-[96px] left-8 w-20 h-5 bg-emerald-200/60 rounded-sm" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Select all channels where you sell products:</p>
                <div className="space-y-3">
                  {CHANNELS.map(channel => (
                    <div key={channel.id} className="bg-white rounded-lg shadow-sm border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/20 transition-all flex items-start space-x-3 p-3">
                      <Checkbox
                        id={channel.id}
                        checked={form.channels.includes(channel.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            updateForm('channels', [...form.channels, channel.id]);
                          } else {
                            updateForm('channels', form.channels.filter(c => c !== channel.id));
                          }
                        }}
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor={channel.id} className="font-medium">{channel.label}</Label>
                        <p className="text-xs text-muted-foreground">{channel.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 relative">
                {/* Decorative calculator illustration */}
                <div className="absolute -right-2 -top-6 opacity-[0.08] pointer-events-none">
                  <div className="relative w-28 h-40">
                    {/* Calculator body */}
                    <div className="absolute bottom-0 left-0 w-28 h-36 bg-gradient-to-b from-amber-400 to-amber-600 rounded-lg" />
                    {/* Screen */}
                    <div className="absolute bottom-28 left-2 w-24 h-6 bg-amber-100/50 rounded-md" />
                    {/* Buttons grid */}
                    <div className="absolute bottom-2 left-2 grid grid-cols-4 gap-1">
                      {Array.from({length: 16}).map((_, i) => (
                        <div key={i} className={`w-4 h-4 rounded-sm ${i === 12 ? 'bg-amber-100/40' : 'bg-amber-200/30'}`} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="packagingCost" className={labelClass}>Packaging Cost</Label>
                    <Input id="packagingCost" type="number" value={form.packagingCost} onChange={e => updateForm('packagingCost', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="shippingCost" className={labelClass}>Shipping Cost</Label>
                    <Input id="shippingCost" type="number" value={form.shippingCost} onChange={e => updateForm('shippingCost', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="paymentFee" className={labelClass}>Payment Gateway Fee (%)</Label>
                    <Input id="paymentFee" type="number" value={form.paymentFeePercent} onChange={e => updateForm('paymentFeePercent', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="marketplaceFee" className={labelClass}>Marketplace Commission (%)</Label>
                    <Input id="marketplaceFee" type="number" value={form.marketplaceFeePercent} onChange={e => updateForm('marketplaceFeePercent', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="returnRate" className={labelClass}>Expected Return Rate (%)</Label>
                    <Input id="returnRate" type="number" value={form.returnRate} onChange={e => updateForm('returnRate', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="returnHandling" className={labelClass}>Return Handling Cost</Label>
                    <Input id="returnHandling" type="number" value={form.returnHandlingCost} onChange={e => updateForm('returnHandlingCost', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="advertisingCost" className={labelClass}>Advertising Cost</Label>
                    <Input id="advertisingCost" type="number" value={form.advertisingCost} onChange={e => updateForm('advertisingCost', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                  <div>
                    <Label htmlFor="otherVariableCost" className={labelClass}>Other Variable Cost</Label>
                    <Input id="otherVariableCost" type="number" value={form.otherVariableCost} onChange={e => updateForm('otherVariableCost', parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="minimumProfit" className={labelClass}>Minimum Profit per Product</Label>
                  <Input id="minimumProfit" type="number" value={form.minimumProfitPerProduct} onChange={e => updateForm('minimumProfitPerProduct', parseFloat(e.target.value) || 0)} className={inputClass} />
                </div>
              </div>
            )}

            <Separator className="my-4" />

            <div className="flex items-center justify-between">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)} className="bg-white border-slate-200 shadow-sm rounded-lg hover:bg-slate-50 transition-all duration-200 hover:shadow-md">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              ) : (
                <Button variant="ghost" onClick={handleSkip} className="text-slate-500 hover:text-slate-700 rounded-lg">
                  <SkipForward className="h-4 w-4 mr-1" /> Skip setup
                </Button>
              )}
              <Button onClick={handleNext} className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md shadow-emerald-500/20 rounded-lg transition-all duration-200 hover:shadow-lg">
                {step === totalSteps ? 'Complete Setup' : 'Continue'}
                {step < totalSteps && <ArrowRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default OnboardingFlow;
