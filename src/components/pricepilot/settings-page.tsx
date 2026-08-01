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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { SUPPORTED_CURRENCIES, RoundingRule, TaxTreatment, ApplicationMode } from '@/lib/pricepilot/types';
import { AutoBackup } from '@/store/pricepilot-store';
import { HelpSection } from './help-section';
import { RestartTourButton } from './guided-tour';
import { LegacyDataCleanupCard } from './legacy-data-cleanup-card';
import {
  Building2, Coins, Palette, Database, Download, Upload, Trash2, RefreshCw,
  Shield, ChevronDown, ChevronRight, AlertTriangle, FileDown, Eye, Clock, Info,
  Stethoscope, Monitor, Sun, Moon, HardDrive, Archive, Zap, Globe, Receipt,
  TrendingUp, Package, BarChart3, Save, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadDiagnosticReport } from '@/lib/pricepilot/error-reporter';

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

const inputClass = 'bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-200 hover:border-slate-300';
const labelClass = 'text-sm font-medium text-slate-600';

/** Section header icon wrapper */
function SectionIcon({ children, tone = 'emerald' }: { children: React.ReactNode; tone?: 'emerald' | 'amber' | 'purple' | 'red' | 'teal' | 'cyan' }) {
  const bgMap = {
    emerald: 'bg-gradient-to-br from-emerald-200 to-emerald-100 text-emerald-600 dark:from-emerald-900/50 dark:to-emerald-800/30 dark:text-emerald-400',
    amber: 'bg-gradient-to-br from-amber-200 to-amber-100 text-amber-600 dark:from-amber-900/50 dark:to-amber-800/30 dark:text-amber-400',
    purple: 'bg-gradient-to-br from-purple-200 to-purple-100 text-purple-600 dark:from-purple-900/50 dark:to-purple-800/30 dark:text-purple-400',
    red: 'bg-gradient-to-br from-red-200 to-red-100 text-red-600 dark:from-red-900/50 dark:to-red-800/30 dark:text-red-400',
    teal: 'bg-gradient-to-br from-teal-200 to-teal-100 text-teal-600 dark:from-teal-900/50 dark:to-teal-800/30 dark:text-teal-400',
    cyan: 'bg-gradient-to-br from-cyan-200 to-cyan-100 text-cyan-600 dark:from-cyan-900/50 dark:to-cyan-800/30 dark:text-cyan-400',
  }[tone];

  return (
    <span className={`h-9 w-9 rounded-xl ${bgMap} flex items-center justify-center shadow-sm shrink-0`}>
      {children}
    </span>
  );
}

/** Section header with gradient accent bar */
function SectionHeader({ icon, title, description, tone = 'emerald' }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: 'emerald' | 'amber' | 'purple' | 'red' | 'teal' | 'cyan';
}) {
  const gradientMap = {
    emerald: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
    amber: 'from-amber-500/10 via-amber-500/5 to-transparent',
    purple: 'from-purple-500/10 via-purple-500/5 to-transparent',
    red: 'from-red-500/10 via-red-500/5 to-transparent',
    teal: 'from-teal-500/10 via-teal-500/5 to-transparent',
    cyan: 'from-cyan-500/10 via-cyan-500/5 to-transparent',
  }[tone];

  return (
    <div className={`bg-gradient-to-r ${gradientMap} rounded-t-2xl -m-6 mb-0 p-6 pb-3 border-b border-slate-100/50 dark:border-slate-800/50`}>
      <CardTitle className="flex items-center gap-3">
        {icon}
        {title}
      </CardTitle>
      <CardDescription className="mt-1">{description}</CardDescription>
    </div>
  );
}

/** Amber "Estimate" pill with tooltip explaining the value is a pre-filled estimate. */
function EstimateBadge({ channel }: { channel: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] font-medium uppercase tracking-wide flex items-center gap-1 cursor-help hover:bg-amber-100 transition-colors duration-200"
          >
            <Info className="h-3 w-3" />
            Estimate
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px] leading-relaxed">
          Typical {channel} fee. Actual fees vary by category and tier. Verify with each marketplace&apos;s official documentation.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Storage usage indicator */
function StorageIndicator() {
  const totalKB = 5 * 1024; // 5MB typical localStorage limit
  const [usedKB, setUsedKB] = useState(() => {
    try {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += key.length + value.length;
          }
        }
      }
      // Approximate byte size (2 bytes per char in UTF-16)
      return Math.round(totalSize * 2 / 1024);
    } catch {
      return 0;
    }
  });

  const percentage = Math.min((usedKB / totalKB) * 100, 100);
  const isLow = percentage < 50;
  const isMedium = percentage >= 50 && percentage < 80;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Storage Usage</span>
        <span className={`font-medium ${isLow ? 'text-emerald-600' : isMedium ? 'text-amber-600' : 'text-red-600'}`}>
          {usedKB} KB / {totalKB} KB
        </span>
      </div>
      <Progress value={percentage} className={`h-2 rounded-full ${isLow ? '[&>div]:bg-emerald-500' : isMedium ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`} />
      <p className="text-[10px] text-muted-foreground">Data is stored locally in your browser. No data is sent to any server.</p>
    </div>
  );
}

export function SettingsPage() {
  const { businessSettings, updateBusinessSettings, appSettings, updateAppSettings, setApplicationMode, exportData, importData, clearAllProducts, resetApplication, products, downloadBackup, restoreBackup, previewBackupRestore, createAutoBackup, autoBackups, setCurrentView } = usePricePilotStore();
  const [importText, setImportText] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);

  const applicationMode = appSettings.applicationMode || 'owner';

  const handleExportData = () => {
    downloadBackup();
    toast.success('Backup downloaded', { description: 'Your data has been saved as a JSON file' });
  };

  const handleImportData = () => {
    if (!importText) return;
    createAutoBackup('manual', 'Before manual data import');
    const success = importData(importText);
    if (success) {
      setImportText('');
      toast.success('Data imported', { description: 'Your data has been restored from the backup' });
    } else {
      toast.error('Import failed', { description: 'The data format was invalid' });
    }
  };

  const handleRestoreBackup = async (backup: AutoBackup) => {
    createAutoBackup('manual', `Before restoring backup from ${new Date(backup.timestamp).toLocaleDateString()}`)
      .catch((err) => console.warn('[PricePilot] Pre-restore backup failed.', err));
    const result = await restoreBackup(backup.dataString);
    if (result.success) {
      toast.success('Backup restored', { description: backup.description });
    } else {
      toast.error('Restore failed', { description: result.message });
    }
  };

  const handleResetApplication = () => {
    if (resetConfirm !== 'RESET') {
      toast.error('Confirmation required', { description: 'Type RESET to confirm' });
      return;
    }
    resetApplication();
    setResetConfirm('');
    setDangerOpen(false);
    toast.success('Application reset', { description: 'All data has been cleared' });
  };

  const handleModeSwitch = (mode: ApplicationMode) => {
    setApplicationMode(mode);
    toast.success(`Switched to ${mode === 'owner' ? 'Owner' : 'Advanced'} mode`, {
      description: mode === 'owner' ? 'Recommended for everyday pricing work' : 'For detailed rules, simulation and financial configuration',
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
      {/* ───────── Page Header ───────── */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          <p className="text-emerald-100 text-sm">Configure your business, pricing defaults, and application preferences</p>
        </div>
      </div>

      {/* ───────── Interface Mode ───────── */}
      <Card className="shadow-md border-0 rounded-2xl bg-gradient-to-b from-white to-emerald-50/10 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={<SectionIcon><Palette className="h-4 w-4" /></SectionIcon>}
            title="Interface Mode"
            description="Choose how PricePilot presents its features"
            tone="emerald"
          />
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <RadioGroup value={applicationMode} onValueChange={v => handleModeSwitch(v as ApplicationMode)} className="space-y-3">
            <div className={`flex items-start space-x-3 p-4 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm ${
              applicationMode === 'owner' ? 'border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30 ring-1 ring-emerald-200/50' : 'border-slate-200 hover:bg-emerald-50/50 dark:border-slate-700 dark:hover:bg-emerald-950/20'
            }`}>
              <RadioGroupItem value="owner" id="owner" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="owner" className="font-semibold cursor-pointer">Owner Mode</Label>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50">Recommended</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Simplified navigation, plain-language labels, and focused workflows for importing, reviewing, approving, and exporting prices.</p>
              </div>
            </div>
            <div className={`flex items-start space-x-3 p-4 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm ${
              applicationMode === 'advanced' ? 'border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30 ring-1 ring-emerald-200/50' : 'border-slate-200 hover:bg-emerald-50/50 dark:border-slate-700 dark:hover:bg-emerald-950/20'
            }`}>
              <RadioGroupItem value="advanced" id="advanced" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="advanced" className="font-semibold cursor-pointer">Advanced Mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Full access to pricing rules, price simulator, scenarios, and all advanced settings.</p>
              </div>
            </div>
          </RadioGroup>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Guided Tour</p>
                <p className="text-xs text-muted-foreground">Replay the 5-step introduction to PricePilot</p>
              </div>
              <RestartTourButton />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───────── Business Settings ───────── */}
      <Card className="shadow-md border-0 rounded-2xl bg-gradient-to-b from-white to-emerald-50/10 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={<SectionIcon tone="teal"><Building2 className="h-4 w-4" /></SectionIcon>}
            title="Business Settings"
            description="Core business information that affects all pricing calculations"
            tone="teal"
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Business Identity */}
          <div className="bg-white/80 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/50 dark:to-emerald-800/30 flex items-center justify-center">
                <Building2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Business Identity</span>
            </div>
            <div>
              <Label htmlFor="businessName" className={labelClass}>Business Name</Label>
              <Input id="businessName" value={businessSettings.businessName} onChange={e => updateBusinessSettings({ businessName: e.target.value })} className={`mt-1.5 ${inputClass}`} />
            </div>
          </div>

          {/* Location & Currency */}
          <div className="bg-white/80 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/50 dark:to-teal-800/30 flex items-center justify-center">
                <Globe className="h-3 w-3 text-teal-600 dark:text-teal-400" />
              </div>
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wide">Location & Currency</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="currency" className={labelClass}>Default Currency</Label>
                <Select value={businessSettings.currencyCode} onValueChange={v => updateBusinessSettings({ currencyCode: v })}>
                  <SelectTrigger id="currency" className={`mt-1.5 ${inputClass}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.name} ({c.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="country" className={labelClass}>Country</Label>
                <Select value={businessSettings.country} onValueChange={v => updateBusinessSettings({ country: v })}>
                  <SelectTrigger id="country" className={`mt-1.5 ${inputClass}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Tax Configuration */}
          <div className="bg-white/80 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/50 dark:to-amber-800/30 flex items-center justify-center">
                <Receipt className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Tax Configuration</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="taxTreatment" className={labelClass}>Tax Treatment</Label>
                <Select value={businessSettings.taxTreatment} onValueChange={v => updateBusinessSettings({ taxTreatment: v as TaxTreatment })}>
                  <SelectTrigger id="taxTreatment" className={`mt-1.5 ${inputClass}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_TREATMENTS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="taxRate" className={labelClass}>Default Tax Rate (%)</Label>
                <Input id="taxRate" type="number" value={businessSettings.defaultTaxRatePercent} onChange={e => updateBusinessSettings({ defaultTaxRatePercent: parseFloat(e.target.value) || 0 })} className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
            <div>
              <Label htmlFor="roundingRule" className={labelClass}>Default Rounding Rule</Label>
              <Select value={businessSettings.defaultRoundingRule} onValueChange={v => updateBusinessSettings({ defaultRoundingRule: v as RoundingRule })}>
                <SelectTrigger id="roundingRule" className={`mt-1.5 ${inputClass}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROUNDING_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───────── Pricing Defaults ───────── */}
      <Card className="shadow-md border-0 rounded-2xl bg-gradient-to-b from-white to-amber-50/10 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={<SectionIcon tone="amber"><Coins className="h-4 w-4" /></SectionIcon>}
            title="Pricing Defaults"
            description="Default margin targets, costs, and fees applied to all products"
            tone="amber"
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Estimate info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              <span className="font-semibold">Fee estimates.</span> The default marketplace, payment gateway, and return/damage rate values below are typical estimates. Actual fees vary by product category and seller tier — please verify with each marketplace&apos;s official documentation.
            </div>
          </div>

          {/* Margin Targets */}
          <div className="bg-white/80 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/50 dark:to-amber-800/30 flex items-center justify-center">
                <TrendingUp className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Margin Targets</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="targetMargin" className={labelClass}>Target Margin (%)</Label>
                <Input id="targetMargin" type="number" value={businessSettings.defaultTargetMarginPercent} onChange={e => updateBusinessSettings({ defaultTargetMarginPercent: parseFloat(e.target.value) || 0 })} className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <Label htmlFor="minimumMargin" className={labelClass}>Minimum Margin (%)</Label>
                <Input id="minimumMargin" type="number" value={businessSettings.defaultMinimumMarginPercent} onChange={e => updateBusinessSettings({ defaultMinimumMarginPercent: parseFloat(e.target.value) || 0 })} className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="premiumMargin" className={labelClass}>Premium Margin (%)</Label>
                <Input id="premiumMargin" type="number" value={businessSettings.defaultMaximumMarginPercent} onChange={e => updateBusinessSettings({ defaultMaximumMarginPercent: parseFloat(e.target.value) || 0 })} className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <Label htmlFor="targetMarkup" className={labelClass}>Target Markup (%)</Label>
                <Input id="targetMarkup" type="number" value={Math.round((businessSettings.defaultTargetMarginPercent * 100 / (100 - businessSettings.defaultTargetMarginPercent)) * 100) / 100} readOnly className="bg-slate-50 shadow-sm border-slate-200 mt-1.5" />
                <p className="text-xs text-muted-foreground mt-1">Auto-calculated from target margin</p>
              </div>
            </div>
          </div>

          {/* Costs & Fees */}
          <div className="bg-white/80 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/50 dark:to-emerald-800/30 flex items-center justify-center">
                <Package className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Costs & Fees</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="defaultShipping" className={labelClass}>Default Shipping Cost</Label>
                <Input id="defaultShipping" type="number" value={businessSettings.defaultShippingCost} onChange={e => updateBusinessSettings({ defaultShippingCost: parseFloat(e.target.value) || 0 })} className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <Label htmlFor="defaultPackaging" className={labelClass}>Default Packaging Cost</Label>
                <Input id="defaultPackaging" type="number" value={businessSettings.defaultPackagingCost} onChange={e => updateBusinessSettings({ defaultPackagingCost: parseFloat(e.target.value) || 0 })} className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Label htmlFor="defaultMarketplaceFee" className={labelClass}>Default Marketplace Fee (%)</Label>
                  <EstimateBadge channel="marketplace" />
                </div>
                <Input id="defaultMarketplaceFee" type="number" value={businessSettings.defaultMarketplaceFeePercent} onChange={e => updateBusinessSettings({ defaultMarketplaceFeePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Label htmlFor="defaultPaymentFee" className={labelClass}>Default Payment Gateway (%)</Label>
                  <EstimateBadge channel="payment gateway" />
                </div>
                <Input id="defaultPaymentFee" type="number" value={businessSettings.defaultPaymentFeePercent} onChange={e => updateBusinessSettings({ defaultPaymentFeePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Label htmlFor="defaultReturnRate" className={labelClass}>Default Return Rate (%)</Label>
                  <EstimateBadge channel="return rate" />
                </div>
                <Input id="defaultReturnRate" type="number" value={businessSettings.defaultReturnRatePercent} onChange={e => updateBusinessSettings({ defaultReturnRatePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Label htmlFor="defaultDamageRate" className={labelClass}>Default Damage Rate (%)</Label>
                  <EstimateBadge channel="damage rate" />
                </div>
                <Input id="defaultDamageRate" type="number" value={businessSettings.defaultDamageRatePercent} onChange={e => updateBusinessSettings({ defaultDamageRatePercent: parseFloat(e.target.value) || 0 })} className={inputClass} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───────── Display Settings ───────── */}
      <Card className="shadow-md border-0 rounded-2xl bg-gradient-to-b from-white to-purple-50/10 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={<SectionIcon tone="purple"><Monitor className="h-4 w-4" /></SectionIcon>}
            title="Display Settings"
            description="How the application looks and behaves"
            tone="purple"
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Theme */}
          <div className="bg-white/80 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/50 dark:to-purple-800/30 flex items-center justify-center">
                <Palette className="h-3 w-3 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Appearance</span>
            </div>
            <div>
              <Label className={labelClass}>Theme</Label>
              <RadioGroup value={appSettings.theme} onValueChange={v => updateAppSettings({ theme: v as 'light' | 'dark' | 'system' })} className="flex flex-wrap gap-3 mt-2">
                <div className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm ${
                  appSettings.theme === 'light' ? 'border-emerald-300 bg-emerald-50/80 ring-1 ring-emerald-200/50' : 'border-slate-200 hover:bg-emerald-50/50 dark:border-slate-700 dark:hover:bg-emerald-950/20'
                }`}>
                  <Sun className="h-4 w-4 text-amber-500" />
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light" className="cursor-pointer">Light</Label>
                </div>
                <div className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm ${
                  appSettings.theme === 'dark' ? 'border-emerald-300 bg-emerald-50/80 ring-1 ring-emerald-200/50' : 'border-slate-200 hover:bg-emerald-50/50 dark:border-slate-700 dark:hover:bg-emerald-950/20'
                }`}>
                  <Moon className="h-4 w-4 text-slate-500" />
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark" className="cursor-pointer">Dark</Label>
                </div>
                <div className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm ${
                  appSettings.theme === 'system' ? 'border-emerald-300 bg-emerald-50/80 ring-1 ring-emerald-200/50' : 'border-slate-200 hover:bg-emerald-50/50 dark:border-slate-700 dark:hover:bg-emerald-950/20'
                }`}>
                  <Monitor className="h-4 w-4 text-slate-500" />
                  <RadioGroupItem value="system" id="system" />
                  <Label htmlFor="system" className="cursor-pointer">System</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* Behavior toggles */}
          <div className="bg-white/80 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-900/50 dark:to-cyan-800/30 flex items-center justify-center">
                <Zap className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
              </div>
              <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 uppercase tracking-wide">Behavior</span>
            </div>
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors duration-200">
              <div className="flex-1 min-w-0 mr-4">
                <Label htmlFor="compactMode" className={`text-sm font-medium ${appSettings.compactMode ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>Compact Mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Reduce spacing for more content on screen</p>
              </div>
              <Switch id="compactMode" checked={appSettings.compactMode} onCheckedChange={checked => updateAppSettings({ compactMode: checked })} />
            </div>
            <Separator className="my-1" />
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors duration-200">
              <div className="flex-1 min-w-0 mr-4">
                <Label htmlFor="autoRecalculate" className={`text-sm font-medium ${appSettings.autoRecalculate ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>Auto Recalculate</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Automatically recalculate prices when data changes</p>
              </div>
              <Switch id="autoRecalculate" checked={appSettings.autoRecalculate} onCheckedChange={checked => updateAppSettings({ autoRecalculate: checked })} />
            </div>
            <Separator className="my-1" />
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors duration-200">
              <div className="flex-1 min-w-0 mr-4">
                <Label htmlFor="confirmDelete" className={`text-sm font-medium ${appSettings.confirmBeforeDelete ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>Confirm Before Delete</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Show confirmation dialog before deleting products</p>
              </div>
              <Switch id="confirmDelete" checked={appSettings.confirmBeforeDelete} onCheckedChange={checked => updateAppSettings({ confirmBeforeDelete: checked })} />
            </div>
          </div>

          <div>
            <Label htmlFor="pageSize" className={labelClass}>Table Page Size</Label>
            <Select value={String(appSettings.pageSize)} onValueChange={v => updateAppSettings({ pageSize: Number(v) })}>
              <SelectTrigger id="pageSize" className={`mt-1.5 ${inputClass}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s} per page</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ───────── Data Management ───────── */}
      <Card className="shadow-md border-0 rounded-2xl bg-gradient-to-b from-white to-teal-50/10 hover:shadow-lg transition-shadow duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={<SectionIcon tone="teal"><Database className="h-4 w-4" /></SectionIcon>}
            title="Data Management"
            description="Manage your data storage, backups, and imports"
            tone="teal"
          />
        </CardHeader>
        <CardContent className="space-y-5 pt-4">
          {/* Storage usage */}
          <div className="bg-gradient-to-r from-teal-50/80 to-emerald-50/50 dark:from-teal-950/20 dark:to-emerald-950/10 rounded-xl p-4 border border-teal-100 dark:border-teal-900/30">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Local Storage</span>
            </div>
            <StorageIndicator />
          </div>

          {/* Privacy banner */}
          <div className="bg-gradient-to-r from-emerald-50 to-emerald-25/20 rounded-xl p-3.5 border border-emerald-200/50 flex items-center gap-2.5 shadow-sm">
            <Shield className="h-4 w-4 text-emerald-600 animate-pulse" />
            <span className="text-sm text-emerald-700 dark:text-emerald-300">Your data is stored locally in your browser and is never sent to any server.</span>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button variant="outline" data-testid="download-backup-button" onClick={handleExportData} className="rounded-xl shadow-sm h-14 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 border-teal-200 hover:border-teal-300 hover:bg-teal-50/50">
              <div className="flex items-center gap-2">
                <FileDown className="h-4 w-4 text-teal-600" />
                <span className="font-medium text-sm">Download Backup</span>
              </div>
              <span className="text-[10px] text-muted-foreground">Export all data as JSON</span>
            </Button>
            <Button variant="outline" onClick={() => {
              createAutoBackup('manual', 'Manual backup from Settings');
              toast.success('Backup created', { description: 'A snapshot of your current data has been saved' });
            }} className="rounded-xl shadow-sm h-14 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/50">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-sm">Create Snapshot</span>
              </div>
              <span className="text-[10px] text-muted-foreground">Save a quick point-in-time backup</span>
            </Button>
          </div>

          {/* File restore */}
          <div className="bg-white/80 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <Upload className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Restore from File</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Restore from a previously downloaded backup file</p>
            <Input
              type="file"
              accept=".json"
              data-testid="restore-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const text = ev.target?.result as string;
                    const preview = await previewBackupRestore(text);
                    if (!preview.valid) {
                      toast.error('Restore failed', { description: preview.issues[0] ?? 'The backup file is not valid.' });
                      return;
                    }
                    createAutoBackup('manual', 'Before file restore')
                      .catch((err) => console.warn('[PricePilot] Pre-restore backup failed.', err));
                    const result = await restoreBackup(text);
                    if (result.success) {
                      toast.success('Backup restored', { description: `${preview.productCount} product(s), ${preview.pricingRuleCount} rule(s) restored.` });
                    } else {
                      toast.error('Restore failed', { description: result.message });
                    }
                  };
                  reader.readAsText(file);
                }
              }}
              className={inputClass}
            />
          </div>

          {/* Auto-backups list */}
          <Collapsible open={backupsOpen} onOpenChange={setBackupsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-2 h-auto rounded-xl hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors duration-200">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Auto-backups ({autoBackups.length})
                </span>
                {backupsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {autoBackups.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">No auto-backups yet. Backups are created before imports and dangerous actions.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {autoBackups.map(backup => (
                    <div key={backup.id} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 flex items-center justify-between transition-all duration-200 hover:shadow-sm">
                      <div>
                        <p className="text-xs font-medium">{backup.description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(backup.timestamp).toLocaleString()} • {backup.trigger}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs rounded-lg hover:bg-emerald-50 hover:border-emerald-200 transition-all duration-200"
                        onClick={() => handleRestoreBackup(backup)}
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Diagnostic Report */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Diagnostic Report</p>
              <p className="text-xs text-muted-foreground">Download a technical report for troubleshooting. Contains no business data.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl shadow-sm transition-all duration-200 hover:shadow-md shrink-0"
              onClick={() => {
                downloadDiagnosticReport()
                  .then(() => {
                    toast.success('Diagnostic report downloaded', { description: 'The report contains only technical metadata — no business data.' });
                  })
                  .catch(() => {
                    toast.error('Could not generate report', { description: 'An error occurred while generating the diagnostic report.' });
                  });
              }}
            >
              <Stethoscope className="h-4 w-4 mr-1.5" /> Download Report
            </Button>
          </div>

          <Separator />

          <div>
            <p className="font-medium text-sm mb-2">Import Application Data (JSON text)</p>
            <p className="text-xs text-muted-foreground mb-2">Paste a previously exported JSON backup to restore all data</p>
            <Input
              placeholder="Paste exported JSON data here..."
              value={importText}
              onChange={e => setImportText(e.target.value)}
              className={`mb-2 ${inputClass}`}
            />
            <Button variant="outline" size="sm" onClick={handleImportData} disabled={!importText} className="rounded-xl shadow-sm transition-all duration-200 hover:shadow-md">
              <Upload className="h-4 w-4 mr-1.5" /> Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ───────── Legacy Data Cleanup ───────── */}
      <LegacyDataCleanupCard />

      {/* ───────── Danger Zone ───────── */}
      <Card className="shadow-md border-0 rounded-2xl bg-gradient-to-b from-white to-red-50/5 hover:shadow-lg transition-shadow duration-200 border-t-4 border-red-400 dark:border-t-red-600 ring-1 ring-red-100 dark:ring-red-900/30">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={<SectionIcon tone="red"><AlertTriangle className="h-4 w-4" /></SectionIcon>}
            title="Danger Zone"
            description="Irreversible and destructive actions"
            tone="red"
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Clear Product Data */}
          <div className="p-4 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-200/50 dark:border-red-900/30">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              <p className="font-medium text-sm text-red-800 dark:text-red-300">Clear Product Data</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Remove all products ({products.length}) but keep settings and rules</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all duration-200">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Clear Products
                </Button>
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
          </div>

          <Separator />

          {/* Reset Entire Application */}
          <div className="p-4 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-200/50 dark:border-red-900/30">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="h-4 w-4 text-red-500" />
              <p className="font-medium text-sm text-red-800 dark:text-red-300">Reset Entire Application</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              This will permanently delete ALL your data — products, rules, scenarios, and settings. A backup will be created before reset.
            </p>
            <Button variant="outline" size="sm" onClick={handleExportData} className="text-emerald-600 rounded-xl mb-3 hover:bg-emerald-50 transition-all duration-200">
              <Download className="h-4 w-4 mr-1.5" /> Download Backup First
            </Button>
            <AlertDialog open={dangerOpen} onOpenChange={setDangerOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all duration-200">
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Reset Application
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Entire Application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete ALL your data. Type <strong>RESET</strong> below to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  placeholder="Type RESET to confirm"
                  value={resetConfirm}
                  onChange={e => setResetConfirm(e.target.value)}
                  className={`${inputClass} mb-2`}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setResetConfirm('')}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleResetApplication}
                    disabled={resetConfirm !== 'RESET'}
                    className="bg-destructive text-destructive-foreground disabled:opacity-50"
                  >
                    Reset Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* ───────── Help ───────── */}
      <HelpSection currencyCode={businessSettings.currencyCode} />
    </div>
  );
}

export default SettingsPage;
