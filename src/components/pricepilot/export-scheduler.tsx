'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createSpreadsheet, downloadSpreadsheet, sanitizeSpreadsheetRows } from '@/lib/pricepilot/spreadsheet-adapter';
import { ExportPreset } from '@/lib/pricepilot/types';
import {
  Clock,
  Plus,
  Play,
  Trash2,
  Calendar,
  FileSpreadsheet,
  FileText,
  Zap,
  Timer,
  Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// Types
// ============================================================

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';
export type ExportFormat = 'xlsx' | 'csv';

export interface ScheduledExport {
  id: string;
  name: string;
  frequency: ScheduleFrequency;
  format: ExportFormat;
  preset: ExportPreset;
  active: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
}

// ============================================================
// Constants
// ============================================================

const FREQUENCY_OPTIONS: { value: ScheduleFrequency; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Every day at the scheduled time' },
  { value: 'weekly', label: 'Weekly', description: 'Once a week on the same day' },
  { value: 'monthly', label: 'Monthly', description: 'Once a month on the same date' },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: typeof FileSpreadsheet }[] = [
  { value: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { value: 'csv', label: 'CSV (.csv)', icon: FileText },
];

const PRESET_OPTIONS: { value: ExportPreset; label: string }[] = [
  { value: 'full', label: 'Full Analysis' },
  { value: 'summary', label: 'Simple Price List' },
  { value: 'pricing-only', label: 'Pricing Only' },
  { value: 'cost-analysis', label: 'Cost Analysis' },
  { value: 'competitor', label: 'Competitor Comparison' },
];

const PRESET_COLUMNS: Record<ExportPreset, string[]> = {
  full: ['name', 'sku', 'category', 'brand', 'purchaseCost', 'currentSellingPrice', 'recommendedPrice', 'profit', 'margin', 'markup', 'status', 'warnings'],
  summary: ['name', 'sku', 'currentSellingPrice', 'recommendedPrice'],
  'pricing-only': ['name', 'sku', 'purchaseCost', 'totalLandedCost', 'breakEven', 'currentSellingPrice', 'recommendedPrice', 'profit', 'margin'],
  'cost-analysis': ['name', 'sku', 'purchaseCost', 'shippingCost', 'packagingCost', 'handlingCost', 'otherCosts', 'totalLandedCost'],
  competitor: ['name', 'sku', 'currentSellingPrice', 'recommendedPrice', 'competitorLowest', 'competitorAverage', 'competitorHighest'],
  custom: ['name', 'sku', 'currentSellingPrice', 'recommendedPrice'],
};

const STORAGE_KEY = 'pricepilot-scheduled-exports';

// ============================================================
// Helpers
// ============================================================

function generateId(): string {
  return `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function computeNextRun(frequency: ScheduleFrequency): string {
  const now = new Date();
  switch (frequency) {
    case 'daily':
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0);
      break;
    case 'weekly':
      now.setDate(now.getDate() + 7);
      now.setHours(9, 0, 0, 0);
      break;
    case 'monthly':
      now.setMonth(now.getMonth() + 1);
      now.setHours(9, 0, 0, 0);
      break;
  }
  return now.toISOString();
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(Math.abs(diffMs) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMs < 0) {
    // Past
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  // Future
  if (diffMins < 1) return 'In a moment';
  if (diffMins < 60) return `In ${diffMins}m`;
  if (diffHours < 24) return `In ${diffHours}h`;
  return `In ${diffDays}d`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function loadSchedules(): ScheduledExport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSchedules(schedules: ScheduledExport[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

// ============================================================
// Frequency Badge
// ============================================================

function FrequencyBadge({ frequency }: { frequency: ScheduleFrequency }) {
  const styles: Record<ScheduleFrequency, string> = {
    daily: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    weekly: 'bg-teal-100 text-teal-700 border-teal-200',
    monthly: 'bg-amber-100 text-amber-700 border-amber-200',
  };

  const icons: Record<ScheduleFrequency, typeof Clock> = {
    daily: Timer,
    weekly: Calendar,
    monthly: Calendar,
  };

  const Icon = icons[frequency];

  return (
    <Badge variant="outline" className={`text-xs ${styles[frequency]}`}>
      <Icon className="h-3 w-3 mr-1" />
      {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
    </Badge>
  );
}

// ============================================================
// Status Badge
// ============================================================

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5" />
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mr-1.5" />
      Paused
    </Badge>
  );
}

// ============================================================
// Schedule Card
// ============================================================

function ScheduleCard({
  schedule,
  index,
  onToggle,
  onDelete,
  onRunNow,
}: {
  schedule: ScheduledExport;
  index: number;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onRunNow: (schedule: ScheduledExport) => void;
}) {
  const borderColors: Record<ScheduleFrequency, string> = {
    daily: 'border-l-emerald-500',
    weekly: 'border-l-teal-500',
    monthly: 'border-l-amber-500',
  };

  return (
    <div
      className={`schedule-card-enter bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 border-l-4 ${borderColors[schedule.frequency]} shadow-sm hover:shadow-md transition-all duration-300`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                {schedule.name}
              </h4>
              <FrequencyBadge frequency={schedule.frequency} />
              <StatusBadge active={schedule.active} />
            </div>

            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                {schedule.format === 'xlsx' ? (
                  <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                ) : (
                  <FileText className="h-3 w-3 text-teal-600" />
                )}
                {schedule.format.toUpperCase()}
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {PRESET_OPTIONS.find(p => p.value === schedule.preset)?.label ?? schedule.preset}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              {schedule.lastRunAt ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last run: {formatRelativeTime(schedule.lastRunAt)}
                </span>
              ) : (
                <span className="text-slate-400 italic">Not yet run</span>
              )}
              {schedule.active && (
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  Next: {formatDate(schedule.nextRunAt)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={schedule.active}
              onCheckedChange={() => onToggle(schedule.id)}
              aria-label={`Toggle ${schedule.name}`}
              className="data-[state=checked]:bg-emerald-500"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRunNow(schedule)}
              className="run-now-pulse h-8 px-3 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
            >
              <Play className="h-3 w-3 mr-1" />
              Run Now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(schedule.id)}
              className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Add Schedule Dialog
// ============================================================

function AddScheduleDialog({ onAdd }: { onAdd: (schedule: ScheduledExport) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [preset, setPreset] = useState<ExportPreset>('full');

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Please enter a task name');
      return;
    }

    const schedule: ScheduledExport = {
      id: generateId(),
      name: name.trim(),
      frequency,
      format,
      preset,
      active: true,
      lastRunAt: null,
      nextRunAt: computeNextRun(frequency),
      createdAt: new Date().toISOString(),
    };

    onAdd(schedule);
    setOpen(false);
    // Reset form
    setName('');
    setFrequency('daily');
    setFormat('xlsx');
    setPreset('full');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 rounded-lg">
          <Plus className="h-4 w-4 mr-2" />
          Add Schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Clock className="h-5 w-5 text-emerald-600" />
            Schedule Export
          </DialogTitle>
          <DialogDescription>
            Set up an automatic export schedule. Since this runs in your browser, the export will be simulated — use &quot;Run Now&quot; to trigger an immediate export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Task Name */}
          <div className="space-y-2">
            <Label htmlFor="schedule-name" className="text-sm font-medium">
              Task Name
            </Label>
            <Input
              id="schedule-name"
              placeholder="e.g., Weekly pricing report"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Frequency</Label>
            <div className="grid grid-cols-3 gap-2">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value)}
                  className={`rounded-lg p-3 text-center transition-all duration-200 border cursor-pointer ${
                    frequency === opt.value
                      ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-700'
                      : 'border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                    {opt.label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    {opt.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Export Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormat(opt.value)}
                    className={`flex items-center gap-2 rounded-lg p-3 transition-all duration-200 border cursor-pointer ${
                      format === opt.value
                        ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-700'
                        : 'border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
                    }`}
                  >
                    <Icon className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preset */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Export Preset</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as ExportPreset)}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Select preset" />
              </SelectTrigger>
              <SelectContent>
                {PRESET_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg"
          >
            <Clock className="h-4 w-4 mr-2" />
            Create Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Main Component
// ============================================================

export function ExportScheduler() {
  const { products, businessSettings } = usePricePilotStore();
  const cc = businessSettings.currencyCode;
  const [schedules, setSchedules] = useState<ScheduledExport[]>(() => {
    if (typeof window === 'undefined') return [];
    return loadSchedules();
  });

  // Track client-side mount using useSyncExternalStore to avoid lint errors
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Persist schedules to localStorage
  const updateSchedules = useCallback((next: ScheduledExport[]) => {
    setSchedules(next);
    saveSchedules(next);
  }, []);

  const handleAdd = useCallback((schedule: ScheduledExport) => {
    const next = [...schedules, schedule];
    updateSchedules(next);
    toast.success('Schedule created', {
      description: `"${schedule.name}" will run ${schedule.frequency}`,
    });
  }, [schedules, updateSchedules]);

  const handleToggle = useCallback((id: string) => {
    const next = schedules.map((s) =>
      s.id === id ? { ...s, active: !s.active, nextRunAt: !s.active ? computeNextRun(s.frequency) : s.nextRunAt } : s
    );
    updateSchedules(next);
    const toggled = next.find((s) => s.id === id);
    if (toggled) {
      toast.success(toggled.active ? 'Schedule resumed' : 'Schedule paused', {
        description: `"${toggled.name}" is now ${toggled.active ? 'active' : 'paused'}`,
      });
    }
  }, [schedules, updateSchedules]);

  const handleDelete = useCallback((id: string) => {
    const deleted = schedules.find((s) => s.id === id);
    const next = schedules.filter((s) => s.id !== id);
    updateSchedules(next);
    if (deleted) {
      toast.success('Schedule deleted', {
        description: `"${deleted.name}" has been removed`,
      });
    }
  }, [schedules, updateSchedules]);

  const handleRunNow = useCallback(async (schedule: ScheduledExport) => {
    if (products.length === 0) {
      toast.error('No products to export', {
        description: 'Import products first to generate an export.',
      });
      return;
    }

    try {
      const columns = PRESET_COLUMNS[schedule.preset] ?? PRESET_COLUMNS['full'];
      const rows = products.map((p) => {
        const row: Record<string, string | number> = {};
        for (const col of columns) {
          switch (col) {
            case 'name': row['Product Name'] = p.name; break;
            case 'sku': row['SKU'] = p.sku; break;
            case 'category': row['Category'] = p.category; break;
            case 'brand': row['Brand'] = p.brand; break;
            case 'purchaseCost': row['Purchase Cost'] = p.purchaseCost; break;
            case 'shippingCost': row['Shipping Cost'] = p.shippingCost; break;
            case 'packagingCost': row['Packaging Cost'] = p.packagingCost; break;
            case 'handlingCost': row['Handling Cost'] = p.handlingCost; break;
            case 'otherCosts': row['Other Costs'] = p.otherCosts; break;
            case 'totalLandedCost': row['Total Landed Cost'] = p.calculatedTotalLandedCost; break;
            case 'breakEven': row['Break-even Price'] = p.calculatedBreakEvenPrice; break;
            case 'currentSellingPrice': row['Existing Price'] = p.currentSellingPrice; break;
            case 'recommendedPrice': row['Recommended Price'] = p.recommendedPrices.balanced; break;
            case 'profit': row['Profit'] = p.calculatedProfitPerUnit; break;
            case 'margin': row['Margin (%)'] = p.calculatedMarginPercent; break;
            case 'markup': row['Markup (%)'] = p.calculatedMarkupPercent; break;
            case 'status': row['Status'] = p.calculatedPricingStatus; break;
            case 'warnings': row['Warnings'] = p.calculatedProfitPerUnit < 0 ? 'Loss-making' : ''; break;
            case 'competitorLowest': row['Competitor Lowest'] = p.competitorPrices.length > 0 ? Math.min(...p.competitorPrices.map((c) => c.price)) : 0; break;
            case 'competitorAverage': row['Competitor Average'] = p.competitorPrices.length > 0 ? p.competitorPrices.reduce((s, c) => s + c.price, 0) / p.competitorPrices.length : 0; break;
            case 'competitorHighest': row['Competitor Highest'] = p.competitorPrices.length > 0 ? Math.max(...p.competitorPrices.map((c) => c.price)) : 0; break;
            case 'expectedReturnCost': row['Expected Return Cost'] = p.calculatedExpectedReturnCost ?? 0; break;
            case 'expectedDamageCost': row['Expected Damage Cost'] = p.calculatedExpectedDamageCost ?? 0; break;
          }
        }
        return row;
      });

      if (schedule.format === 'csv') {
        if (rows.length === 0) return;
        const headers = Object.keys(rows[0]);
        const csvLines = [
          headers.join(','),
          ...rows.map((row) =>
            headers.map((h) => {
              const val = String(row[h] ?? '');
              if (val.includes(',') || val.includes('"')) {
                return `"${val.replace(/"/g, '""')}"`;
              }
              return val;
            }).join(',')
          ),
        ];
        const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pricepilot-${schedule.preset}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const builder = createSpreadsheet();
        builder.addSheet('Products', sanitizeSpreadsheetRows(rows));
        const summaryData: Record<string, string | number>[] = [
          { Metric: 'Total Products', Value: products.length },
          { Metric: 'Export Date', Value: new Date().toISOString() },
          { Metric: 'Currency', Value: cc },
          { Metric: 'Preset', Value: schedule.preset },
          { Metric: 'Schedule', Value: schedule.name },
        ];
        builder.addSheet('Summary', sanitizeSpreadsheetRows(summaryData));
        const buffer = await builder.writeBuffer();
        downloadSpreadsheet(buffer, `pricepilot-${schedule.preset}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      }

      // Update last run time
      const next = schedules.map((s) =>
        s.id === schedule.id
          ? { ...s, lastRunAt: new Date().toISOString(), nextRunAt: computeNextRun(s.frequency) }
          : s
      );
      updateSchedules(next);

      toast.success('Export completed', {
        description: `"${schedule.name}" ran successfully — ${products.length} products exported`,
      });
    } catch (err) {
      console.error('Scheduled export failed:', err);
      toast.error('Export failed', {
        description: 'An error occurred while running the export.',
      });
    }
  }, [products, cc, schedules, updateSchedules]);

  // Don't render until client-side hydration is complete (localStorage)
  if (!mounted) {
    return (
      <Card className="shadow-md border-0 rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
            <Clock className="h-4 w-4 text-emerald-600" />
            Scheduled Exports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border-0 rounded-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
              <Clock className="h-4 w-4 text-emerald-600" />
              Scheduled Exports
            </CardTitle>
            <CardDescription className="mt-1">
              Automate your data exports on a recurring schedule
            </CardDescription>
          </div>
          <AddScheduleDialog onAdd={handleAdd} />
        </div>
      </CardHeader>
      <CardContent>
        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              No scheduled exports
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              Set up a recurring export schedule to keep your data flowing. Use &quot;Add Schedule&quot; to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule, index) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                index={index}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onRunNow={handleRunNow}
              />
            ))}
            <Separator />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {schedules.filter((s) => s.active).length} of {schedules.length} schedule{schedules.length !== 1 ? 's' : ''} active
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Browser-only: exports run when you click &quot;Run Now&quot;
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ExportScheduler;
