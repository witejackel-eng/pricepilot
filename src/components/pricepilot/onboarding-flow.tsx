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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { SUPPORTED_CURRENCIES, RoundingRule, TaxTreatment } from '@/lib/pricepilot/types';
import { ArrowLeft, ArrowRight, SkipForward, Building2, Store, Coins, Settings, Sparkles } from 'lucide-react';

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

const TAX_TREATMENTS_QS: { value: string; label: string; desc: string }[] = [
  { value: 'yes-inclusive', label: 'Yes, GST is already in my price', desc: 'e.g. ₹590 includes ₹90 GST — most common for Indian sellers' },
  { value: 'no-exclusive', label: 'No, I add GST on top', desc: 'e.g. ₹500 + 18% = ₹590 — common for B2B sellers' },
  { value: 'exempt', label: 'My products are tax exempt', desc: 'No GST/VAT applies' },
  { value: 'composite', label: 'Composite GST (CGST+SGST)', desc: 'Split GST components' },
];

const CHANNELS = [
  { id: 'direct-offline', label: 'Direct / Offline', desc: 'In-store, direct sales', fees: { marketplace: 0, payment: 1.5 } },
  { id: 'own-ecommerce', label: 'Own E-commerce', desc: 'Your own website/shop', fees: { marketplace: 0, payment: 2 } },
  { id: 'amazon', label: 'Amazon', desc: 'Amazon marketplace', fees: { marketplace: 8, payment: 2 } },
  { id: 'flipkart', label: 'Flipkart', desc: 'Flipkart marketplace', fees: { marketplace: 7, payment: 2 } },
  { id: 'meesho', label: 'Meesho', desc: 'Meesho marketplace', fees: { marketplace: 5, payment: 2 } },
  { id: 'wholesale', label: 'Wholesale', desc: 'Bulk/wholesale channels', fees: { marketplace: 0, payment: 1 } },
  { id: 'multiple', label: 'Multiple channels', desc: 'Selling on multiple platforms', fees: { marketplace: 5, payment: 2 } },
];

const inputClass = 'bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500';
const labelClass = 'text-sm font-medium text-slate-600';

export function OnboardingFlow() {
  const { businessSettings, completeOnboarding, appSettings, updateAppSettings } = usePricePilotStore();
  const [setupMode, setSetupMode] = useState<'quick' | 'advanced'>('quick');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    businessName: businessSettings.businessName || '',
    currencyCode: businessSettings.currencyCode || 'INR',
    country: businessSettings.country || 'IN',
    // Quick setup
    taxAnswer: 'yes-inclusive',
    targetMargin: 25,
    minimumMargin: 10,
    channels: [] as string[],
    // Advanced fields
    taxTreatment: businessSettings.taxTreatment || 'inclusive',
    taxRate: businessSettings.defaultTaxRatePercent || 18,
    roundingRule: businessSettings.defaultRoundingRule || 'no-rounding',
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

  const totalQuickSteps = 4;
  const totalAdvancedSteps = 3;
  const totalSteps = setupMode === 'quick' ? totalQuickSteps : totalAdvancedSteps;
  const progress = (step / totalSteps) * 100;

  const updateForm = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      // Build settings based on setup mode
      if (setupMode === 'quick') {
        const taxTreatment: TaxTreatment = form.taxAnswer === 'yes-inclusive' ? 'inclusive' : form.taxAnswer === 'no-exclusive' ? 'exclusive' : form.taxAnswer === 'exempt' ? 'exempt' : 'composite';
        // Calculate fees from selected channels (use highest marketplace fee)
        const selectedChannels = CHANNELS.filter(c => form.channels.includes(c.id));
        const maxMarketplaceFee = selectedChannels.length > 0 ? Math.max(...selectedChannels.map(c => c.fees.marketplace)) : 5;
        const maxPaymentFee = selectedChannels.length > 0 ? Math.max(...selectedChannels.map(c => c.fees.payment)) : 2;

        completeOnboarding({
          businessName: form.businessName,
          currencyCode: form.currencyCode,
          country: form.country,
          taxTreatment,
          defaultTaxRatePercent: form.taxAnswer === 'exempt' ? 0 : 18,
          defaultTargetMarginPercent: form.targetMargin,
          defaultMinimumMarginPercent: form.minimumMargin,
          defaultRoundingRule: 'no-rounding',
          defaultPackagingCost: 0,
          defaultShippingCost: 0,
          defaultPaymentFeePercent: maxPaymentFee,
          defaultMarketplaceFeePercent: maxMarketplaceFee,
          defaultReturnRatePercent: 2,
          defaultHandlingCost: 0,
          defaultOtherCosts: 0,
        });
      } else {
        // Advanced setup - same as original
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
    }
  };

  const handleSkip = () => {
    completeOnboarding({});
  };

  // Quick Setup steps
  const renderQuickStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="businessName" className={labelClass}>Business Name</Label>
              <Input id="businessName" value={form.businessName} onChange={e => updateForm('businessName', e.target.value)} placeholder="Your business name" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="currency" className={labelClass}>Currency</Label>
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
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Does your selling price already include GST?</p>
            <RadioGroup value={form.taxAnswer} onValueChange={v => updateForm('taxAnswer', v)} className="space-y-3">
              {TAX_TREATMENTS_QS.map(t => (
                <div key={t.value} className={`flex items-start space-x-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer shadow-sm ${
                  form.taxAnswer === t.value ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-emerald-50/50'
                }`}>
                  <RadioGroupItem value={t.value} id={t.value} className="mt-1" />
                  <div>
                    <Label htmlFor={t.value} className="font-medium cursor-pointer">{t.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="targetMargin" className={labelClass}>What profit margin do you normally aim for?</Label>
              <div className="flex items-center gap-3 mt-2">
                <Input id="targetMargin" type="number" value={form.targetMargin} onChange={e => updateForm('targetMargin', parseFloat(e.target.value) || 0)} className={inputClass} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Default: 25% — this is the percentage of selling price that is profit</p>
            </div>
            <div>
              <Label htmlFor="minimumMargin" className={labelClass}>What is the lowest profit margin you are willing to accept?</Label>
              <div className="flex items-center gap-3 mt-2">
                <Input id="minimumMargin" type="number" value={form.minimumMargin} onChange={e => updateForm('minimumMargin', parseFloat(e.target.value) || 0)} className={inputClass} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Default: 10% — prices below this will be flagged as &quot;needs attention&quot;</p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Where do you normally sell?</p>
            <div className="space-y-2">
              {CHANNELS.map(channel => (
                <div key={channel.id} className={`bg-white rounded-lg shadow-sm border transition-all flex items-start space-x-3 p-3 ${
                  form.channels.includes(channel.id) ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/20'
                }`}>
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
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor={channel.id} className="font-medium">{channel.label}</Label>
                    <p className="text-xs text-muted-foreground">{channel.desc}</p>
                  </div>
                  {form.channels.includes(channel.id) && (
                    <div className="text-xs text-emerald-600 shrink-0">
                      <p>Marketplace: {channel.fees.marketplace}% (estimate)</p>
                      <p>Payment: {channel.fees.payment}% (estimate)</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {form.channels.length > 0 && (
              <div className="bg-emerald-50/50 border border-emerald-200/50 rounded-lg p-2 text-xs text-emerald-600">
                <p className="font-medium">Estimated fees based on your channels</p>
                <p>Marketplace commission: ~{Math.max(...CHANNELS.filter(c => form.channels.includes(c.id)).map(c => c.fees.marketplace))}% • Payment gateway: ~{Math.max(...CHANNELS.filter(c => form.channels.includes(c.id)).map(c => c.fees.payment))}%</p>
                <p className="text-muted-foreground mt-0.5">These are estimates — you can adjust exact values later in Settings</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // Advanced Setup steps (original flow)
  const renderAdvancedStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
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
                  <SelectItem value="inclusive">Tax inclusive (GST/VAT in price)</SelectItem>
                  <SelectItem value="exclusive">Tax exclusive (add tax on top)</SelectItem>
                  <SelectItem value="exempt">Tax exempt</SelectItem>
                  <SelectItem value="composite">Composite (multi-component GST)</SelectItem>
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
        );

      case 2:
        return (
          <div className="space-y-3">
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
        );

      case 3:
        return (
          <div className="space-y-4">
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
        );

      default:
        return null;
    }
  };

  const getStepTitle = () => {
    if (setupMode === 'quick') {
      switch (step) {
        case 1: return 'Business Details';
        case 2: return 'Tax & GST';
        case 3: return 'Profit Targets';
        case 4: return 'Selling Channels';
      }
    } else {
      switch (step) {
        case 1: return 'Business Details';
        case 2: return 'Where do you sell?';
        case 3: return 'Default Costs & Fees';
      }
    }
    return '';
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

        {/* Setup mode selector (only on step 1) */}
        {step === 1 && (
          <div className="flex gap-3 mb-4 justify-center">
            <Button
              variant={setupMode === 'quick' ? 'default' : 'outline'}
              onClick={() => { setSetupMode('quick'); setStep(1); }}
              className={`rounded-lg ${setupMode === 'quick' ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md' : ''}`}
            >
              <Sparkles className="h-4 w-4 mr-1" /> Quick Setup
            </Button>
            <Button
              variant={setupMode === 'advanced' ? 'default' : 'outline'}
              onClick={() => { setSetupMode('advanced'); setStep(1); }}
              className={`rounded-lg ${setupMode === 'advanced' ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md' : ''}`}
            >
              <Settings className="h-4 w-4 mr-1" /> Advanced Setup
            </Button>
          </div>
        )}

        <Progress value={progress} className="h-2.5 rounded-full mb-4 animate-pulse bg-emerald-100" />
        <div className="flex items-center justify-between text-sm font-medium text-slate-600 mb-6">
          <span>Step {step} of {totalSteps}</span>
          <span>{getStepTitle()}</span>
        </div>

        <Card className="shadow-lg shadow-emerald-500/10 border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/5 transition-all duration-300 hover:shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-200 to-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm">
                {setupMode === 'quick' && step === 1 && <Building2 className="h-4 w-4" />}
                {setupMode === 'quick' && step === 2 && <Coins className="h-4 w-4" />}
                {setupMode === 'quick' && step === 3 && <Coins className="h-4 w-4" />}
                {setupMode === 'quick' && step === 4 && <Store className="h-4 w-4" />}
                {setupMode === 'advanced' && step === 1 && <Building2 className="h-4 w-4" />}
                {setupMode === 'advanced' && step === 2 && <Store className="h-4 w-4" />}
                {setupMode === 'advanced' && step === 3 && <Coins className="h-4 w-4" />}
              </span>
              {getStepTitle()}
            </CardTitle>
            <CardDescription>
              {setupMode === 'quick' ? 'A few quick questions to get you started' : 'Detailed configuration for advanced users'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {setupMode === 'quick' ? renderQuickStep() : renderAdvancedStep()}

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
