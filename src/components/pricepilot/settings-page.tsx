'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SUPPORTED_CURRENCIES, RoundingRule, TaxTreatment } from '@/lib/pricepilot/types';
import { HelpSection } from './help-section';
import { Building2, Coins, Palette, Database, Download, Upload, Trash2, RefreshCw, Shield } from 'lucide-react';

const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'DE', name: 'Germany' },
  { code: 'AE', name: 'United Arab Emirates' },
];

const TAX_TREATMENTS: { value: TaxTreatment; label: string }[] = [
  { value: 'inclusive', label: 'Tax inclusive' },
  { value: 'exclusive', label: 'Tax exclusive' },
  { value: 'exempt', label: 'Tax exempt' },
  { value: 'composite', label: 'Composite (GST)' },
];

const ROUNDING_OPTIONS: { value: RoundingRule; label: string }[] = [
  { value: 'no-rounding', label: 'No rounding' },
  { value: 'nearest-whole', label: 'Nearest whole' },
  { value: 'nearest-5', label: 'Nearest 5' },
  { value: 'nearest-10', label: 'Nearest 10' },
  { value: 'end-in-99', label: 'End in .99' },
  { value: 'end-in-95', label: 'End in .95' },
  { value: 'end-in-9', label: 'End in .9' },
  { value: 'end-in-49', label: 'End in .49' },
  { value: 'end-in-99-whole', label: 'End in 99 (whole)' },
];

const inputClass = 'bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500';
const labelClass = 'text-sm font-medium text-slate-600';

export function SettingsPage() {
  const { businessSettings, updateBusinessSettings, appSettings, updateAppSettings, exportData, importData, clearAllProducts, resetApplication, products } = usePricePilotStore();
  const [importText, setImportText] = useState('');

  const handleExportData = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pricepilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = () => {
    if (!importText) return;
    const success = importData(importText);
    if (success) {
      setImportText('');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Business Settings */}
      <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/10 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-200 to-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm"><Building2 className="h-4 w-4" /></span>
            Business Settings
          </CardTitle>
          <CardDescription>Core business information that affects all pricing calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="businessName" className={labelClass}>Business Name</Label>
            <Input id="businessName" value={businessSettings.businessName} onChange={e => updateBusinessSettings({ businessName: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="currency" className={labelClass}>Default Currency</Label>
              <Select value={businessSettings.currencyCode} onValueChange={v => updateBusinessSettings({ currencyCode: v })}>
                <SelectTrigger id="currency" className={inputClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.name} ({c.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="country" className={labelClass}>Country</Label>
              <Select value={businessSettings.country} onValueChange={v => updateBusinessSettings({ country: v })}>
                <SelectTrigger id="country" className={inputClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="taxTreatment" className={labelClass}>Tax Treatment</Label>
              <Select value={businessSettings.taxTreatment} onValueChange={v => updateBusinessSettings({ taxTreatment: v as TaxTreatment })}>
                <SelectTrigger id="taxTreatment" className={inputClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_TREATMENTS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="taxRate" className={labelClass}>Default Tax Rate (%)</Label>
              <Input id="taxRate" type="number" value={businessSettings.defaultTaxRatePercent} onChange={e => updateBusinessSettings({ defaultTaxRatePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
          </div>
          <div>
            <Label htmlFor="roundingRule" className={labelClass}>Default Rounding Rule</Label>
            <Select value={businessSettings.defaultRoundingRule} onValueChange={v => updateBusinessSettings({ defaultRoundingRule: v as RoundingRule })}>
              <SelectTrigger id="roundingRule" className={inputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROUNDING_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Defaults */}
      <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-amber-50/10 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-200 to-amber-100 text-amber-600 flex items-center justify-center shadow-sm"><Coins className="h-4 w-4" /></span>
            Pricing Defaults
          </CardTitle>
          <CardDescription>Default margin targets, costs, and fees applied to all products</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="targetMargin" className={labelClass}>Target Margin (%)</Label>
              <Input id="targetMargin" type="number" value={businessSettings.defaultTargetMarginPercent} onChange={e => updateBusinessSettings({ defaultTargetMarginPercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
            <div>
              <Label htmlFor="minimumMargin" className={labelClass}>Minimum Margin (%)</Label>
              <Input id="minimumMargin" type="number" value={businessSettings.defaultMinimumMarginPercent} onChange={e => updateBusinessSettings({ defaultMinimumMarginPercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="premiumMargin" className={labelClass}>Premium Margin (%)</Label>
              <Input id="premiumMargin" type="number" value={businessSettings.defaultMaximumMarginPercent} onChange={e => updateBusinessSettings({ defaultMaximumMarginPercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
            <div>
              <Label htmlFor="targetMarkup" className={labelClass}>Target Markup (%)</Label>
              <Input id="targetMarkup" type="number" value={businessSettings.defaultTargetMarginPercent * 100 / (100 - businessSettings.defaultTargetMarginPercent)} readOnly className="bg-slate-50 shadow-sm border-slate-200" />
              <p className="text-xs text-muted-foreground mt-1">Auto-calculated from target margin</p>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="defaultShipping" className={labelClass}>Default Shipping Cost</Label>
              <Input id="defaultShipping" type="number" value={businessSettings.defaultShippingCost} onChange={e => updateBusinessSettings({ defaultShippingCost: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
            <div>
              <Label htmlFor="defaultPackaging" className={labelClass}>Default Packaging Cost</Label>
              <Input id="defaultPackaging" type="number" value={businessSettings.defaultPackagingCost} onChange={e => updateBusinessSettings({ defaultPackagingCost: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="defaultMarketplaceFee" className={labelClass}>Default Marketplace Fee (%)</Label>
              <Input id="defaultMarketplaceFee" type="number" value={businessSettings.defaultMarketplaceFeePercent} onChange={e => updateBusinessSettings({ defaultMarketplaceFeePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
            <div>
              <Label htmlFor="defaultPaymentFee" className={labelClass}>Default Payment Gateway (%)</Label>
              <Input id="defaultPaymentFee" type="number" value={businessSettings.defaultPaymentFeePercent} onChange={e => updateBusinessSettings({ defaultPaymentFeePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="defaultReturnRate" className={labelClass}>Default Return Rate (%)</Label>
              <Input id="defaultReturnRate" type="number" value={businessSettings.defaultReturnRatePercent} onChange={e => updateBusinessSettings({ defaultReturnRatePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
            <div>
              <Label htmlFor="defaultDamageRate" className={labelClass}>Default Damage Rate (%)</Label>
              <Input id="defaultDamageRate" type="number" value={businessSettings.defaultDamageRatePercent} onChange={e => updateBusinessSettings({ defaultDamageRatePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-purple-50/10 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-200 to-purple-100 text-purple-600 flex items-center justify-center shadow-sm"><Palette className="h-4 w-4" /></span>
            Display Settings
          </CardTitle>
          <CardDescription>How the application looks and behaves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className={labelClass}>Theme</Label>
            <RadioGroup value={appSettings.theme} onValueChange={v => updateAppSettings({ theme: v as 'light' | 'dark' | 'system' })} className="flex gap-4 mt-2">
              <div className="flex items-center space-x-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 transition-all duration-200 cursor-pointer shadow-sm">
                <RadioGroupItem value="light" id="light" />
                <Label htmlFor="light" className="cursor-pointer">Light</Label>
              </div>
              <div className="flex items-center space-x-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 transition-all duration-200 cursor-pointer shadow-sm">
                <RadioGroupItem value="dark" id="dark" />
                <Label htmlFor="dark" className="cursor-pointer">Dark</Label>
              </div>
              <div className="flex items-center space-x-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 transition-all duration-200 cursor-pointer shadow-sm">
                <RadioGroupItem value="system" id="system" />
                <Label htmlFor="system" className="cursor-pointer">System</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex items-center justify-between py-2">
            <Label htmlFor="compactMode" className={labelClass}>Compact Mode</Label>
            <Switch id="compactMode" checked={appSettings.compactMode} onCheckedChange={checked => updateAppSettings({ compactMode: checked })} />
          </div>
          <div className="flex items-center justify-between py-2">
            <Label htmlFor="autoRecalculate" className={labelClass}>Auto Recalculate</Label>
            <Switch id="autoRecalculate" checked={appSettings.autoRecalculate} onCheckedChange={checked => updateAppSettings({ autoRecalculate: checked })} />
          </div>
          <div className="flex items-center justify-between py-2">
            <Label htmlFor="confirmDelete" className={labelClass}>Confirm Before Delete</Label>
            <Switch id="confirmDelete" checked={appSettings.confirmBeforeDelete} onCheckedChange={checked => updateAppSettings({ confirmBeforeDelete: checked })} />
          </div>
          <div>
            <Label htmlFor="pageSize" className={labelClass}>Table Page Size</Label>
            <Select value={String(appSettings.pageSize)} onValueChange={v => updateAppSettings({ pageSize: Number(v) })}>
              <SelectTrigger id="pageSize" className={inputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s} per page</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Data Settings */}
      <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-slate-50/20 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-100 text-slate-600 flex items-center justify-center shadow-sm"><Database className="h-4 w-4" /></span>
            Data Management
          </CardTitle>
          <CardDescription>Backup, restore, or clear your application data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="bg-gradient-to-r from-emerald-50 to-emerald-25/20 rounded-lg p-3 border border-emerald-200/50 flex items-center gap-2 shadow-sm">
            <Shield className="h-4 w-4 text-emerald-600 animate-pulse" />
            <span className="text-sm text-emerald-700">Your data is stored locally in your browser and is never sent to any server.</span>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Export Application Data</p>
                <p className="text-xs text-muted-foreground">Download a backup of all your settings, products, rules, and scenarios</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportData} className="rounded-lg shadow-sm">
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>

            <div>
              <p className="font-medium text-sm mb-2">Import Application Data</p>
              <p className="text-xs text-muted-foreground mb-2">Paste a previously exported JSON backup to restore all data</p>
              <Input
                placeholder="Paste exported JSON data here..."
                value={importText}
                onChange={e => setImportText(e.target.value)}
                className={`mb-2 ${inputClass}`}
              />
              <Button variant="outline" size="sm" onClick={handleImportData} disabled={!importText} className="rounded-lg shadow-sm">
                <Upload className="h-4 w-4 mr-1" /> Import
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Clear Product Data</p>
                    <p className="text-xs text-muted-foreground">Remove all products ({products.length}) but keep settings and rules</p>
                  </div>
                  <Button variant="outline" size="sm" className="text-destructive rounded-lg hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4 mr-1" /> Clear
                  </Button>
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Products?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently remove all {products.length} products. Settings and pricing rules will be preserved.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => clearAllProducts()} className="bg-destructive text-destructive-foreground">Clear Products</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Reset Entire Application</p>
                    <p className="text-xs text-muted-foreground">Remove everything and start fresh</p>
                  </div>
                  <Button variant="outline" size="sm" className="text-destructive rounded-lg hover:bg-red-50 hover:text-red-600">
                    <RefreshCw className="h-4 w-4 mr-1" /> Reset
                  </Button>
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Entire Application?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete ALL your data — products, rules, scenarios, and settings. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetApplication()} className="bg-destructive text-destructive-foreground">Reset Everything</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Help */}
      <HelpSection currencyCode={businessSettings.currencyCode} />
    </div>
  );
}

export default SettingsPage;
