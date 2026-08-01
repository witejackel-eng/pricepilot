'use client';

/**
 * PricePilot — Price Alerts Page (v1.6, Task 6)
 *
 * A DEDICATED full page for managing user-defined alert rules and viewing
 * all currently-triggered alerts. Rules are stored in localStorage (they
 * are UI preferences, not primary business data) and evaluated client-side
 * against the current products in the Zustand store.
 *
 * Layout:
 *   1. Gradient header banner ("Price Alerts" + subtitle + action buttons)
 *   2. Summary stat cards (4): Active Rules, Triggered Alerts, Critical,
 *      Products Affected
 *   3. Alert rules list — cards with enable/disable switch, condition
 *      description, severity badge, last-triggered timestamp, today count,
 *      edit + delete actions
 *   4. Triggered alerts panel — every currently-triggered alert with
 *      severity-colored left border, dismiss button, "View Product" link
 *   5. Friendly empty states (no rules, no triggered alerts with celebration)
 *
 * Self-contained: the main agent will mount this inside app-shell.tsx.
 * No other files are modified by this task.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Product } from '@/lib/pricepilot/types';
import { formatCurrency } from '@/lib/pricepilot/formatting';
import {
  AlertRule,
  AlertCondition,
  AlertSeverity,
  AlertScope,
  TriggeredAlert,
  CONDITION_META,
  CONDITION_ORDER,
  SEVERITY_META,
  SEVERITY_ORDER,
  loadAlertRules,
  addAlertRule,
  updateAlertRule,
  deleteAlertRule,
  evaluateAllRules,
  evaluateRule,
  recordTrigger,
  getTodayTriggerCount,
  generateAlertRuleId,
  createDefaultAlertRule,
  describeRule,
} from '@/lib/pricepilot/alert-rules';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import {
  Bell,
  BellRing,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Settings,
  Plus,
  Trash2,
  Check,
  X,
  Sparkles,
  PartyPopper,
  RefreshCw,
  Pencil,
  ShieldAlert,
  Info,
  Target,
  Package,
  ArrowRight,
  Eye,
  HelpCircle,
  Pause,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// Helpers
// ============================================================

/** Parse ISO timestamp safely. Returns null on failure. */
function safeParseDate(iso?: string): Date | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

/** Format a relative "x ago" string. */
function formatRelative(iso?: string): string {
  const d = safeParseDate(iso);
  if (!d) return 'never';
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

/** Stable dismissed-alert ID from a triggered alert. */
function dismissedId(a: TriggeredAlert): string {
  return `${a.ruleId}::${a.productId}`;
}

// ============================================================
// Severity icon resolver
// ============================================================

function SeverityIcon({ severity, className }: { severity: AlertSeverity; className?: string }) {
  const icon =
    severity === 'critical'
      ? ShieldAlert
      : severity === 'warning'
        ? AlertTriangle
        : Info;
  const Cmp = icon;
  return <Cmp className={className} />;
}

// ============================================================
// Sub-component: Gradient Header
// ============================================================

function GradientHeader({
  hasRules,
  triggeredCount,
  onCreate,
  onRunCheck,
  isChecking,
}: {
  hasRules: boolean;
  triggeredCount: number;
  onCreate: () => void;
  onRunCheck: () => void;
  isChecking: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600 p-5 shadow-lg shadow-emerald-500/20 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-24 w-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-emerald-100 text-xs font-medium uppercase tracking-wider mb-1">
            <span
              className={cn(
                'h-2 w-2 rounded-full bg-emerald-200',
                triggeredCount > 0 && 'animate-pulse',
              )}
            />
            {triggeredCount > 0 ? (
              <BellRing className="h-3.5 w-3.5" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            {triggeredCount > 0
              ? `${triggeredCount} active alert${triggeredCount === 1 ? '' : 's'}`
              : 'Threshold monitoring'}
          </div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white">Price Alerts</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  aria-label="How price alerts work"
                >
                  <HelpCircle className="h-3 w-3 text-white" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-xs bg-slate-900 text-white border-slate-700 text-xs leading-relaxed"
              >
                <div className="space-y-1.5">
                  <div className="font-semibold text-emerald-300">How it works</div>
                  <div>
                    1. Create alert rules for any pricing condition (margin, profit, break-even,
                    competitor prices, recommended prices).
                  </div>
                  <div>
                    2. Click <span className="font-medium">Run Check</span> to evaluate every rule
                    against your current products.
                  </div>
                  <div>
                    3. Triggered alerts appear below with severity colors. Dismiss them for the
                    session or fix the underlying pricing.
                  </div>
                  <div>4. Rules live in localStorage (UI preferences, never in your DB).</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-emerald-50/80">
            Monitor pricing conditions and get notified when action is needed.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={onRunCheck}
            disabled={isChecking || !hasRules}
            className="rounded-xl bg-white/20 backdrop-blur-sm text-white border border-white/30 hover:bg-white/30 hover:border-white/50 transition-all duration-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isChecking ? (
              <>
                <span className="h-3.5 w-3.5 mr-1.5 inline-block animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Run Check
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={onCreate}
            className="rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 text-white shadow-md shadow-emerald-900/20 border border-white/20 transition-all duration-200"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Alert Rule
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-component: Summary Stat Cards
// ============================================================

interface SummaryCardsProps {
  activeRules: number;
  triggeredCount: number;
  criticalCount: number;
  affectedProducts: number;
}

function SummaryCards({
  activeRules,
  triggeredCount,
  criticalCount,
  affectedProducts,
}: SummaryCardsProps) {
  const cards = [
    {
      label: 'Active Rules',
      value: activeRules,
      sub: 'enabled rules',
      icon: Settings,
      gradient: 'from-emerald-500 to-teal-500',
      ring: 'ring-emerald-200/40',
    },
    {
      label: 'Triggered Alerts',
      value: triggeredCount,
      sub: triggeredCount === 0 ? 'all clear' : 'need attention',
      icon: triggeredCount > 0 ? BellRing : Bell,
      gradient: triggeredCount > 0 ? 'from-teal-500 to-cyan-500' : 'from-teal-500 to-emerald-500',
      ring: 'ring-teal-200/40',
      pulse: triggeredCount > 0,
    },
    {
      label: 'Critical Alerts',
      value: criticalCount,
      sub: criticalCount === 0 ? 'no critical issues' : 'urgent action',
      icon: AlertTriangle,
      gradient:
        criticalCount > 0 ? 'from-rose-500 to-red-500' : 'from-amber-500 to-orange-500',
      ring: criticalCount > 0 ? 'ring-rose-200/40' : 'ring-amber-200/40',
      pulse: criticalCount > 0,
    },
    {
      label: 'Products Affected',
      value: affectedProducts,
      sub: affectedProducts === 0 ? 'all healthy' : 'unique products',
      icon: Package,
      gradient: 'from-emerald-600 to-teal-600',
      ring: 'ring-emerald-200/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.label}
            className={cn(
              'relative overflow-hidden rounded-2xl border-0 shadow-md ring-1',
              card.ring,
              'bg-gradient-to-br',
              card.gradient,
              'transition-all hover:shadow-lg hover:-translate-y-0.5 duration-200',
              'animate-in fade-in slide-in-from-bottom-4 duration-500',
            )}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="absolute top-0 right-0 -mt-6 -mr-6 h-20 w-20 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-white/80 mb-1">
                    {card.label}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
                      {card.value}
                    </div>
                    {card.pulse && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] sm:text-xs text-white/70 mt-0.5">{card.sub}</div>
                </div>
                <div className="shrink-0 rounded-xl bg-white/20 backdrop-blur-sm p-2 sm:p-2.5">
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
// Sub-component: Severity Badge
// ============================================================

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const meta = SEVERITY_META[severity];
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide border px-2 py-0.5',
        meta.badgeClass,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full mr-1', meta.dotClass)} />
      {meta.label}
    </Badge>
  );
}

// ============================================================
// Sub-component: Alert Rule Card
// ============================================================

interface RuleCardProps {
  rule: AlertRule;
  index: number;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (rule: AlertRule) => void;
  onDelete: (rule: AlertRule) => void;
  onViewProduct: (productId: string) => void;
  // Pass the first triggered alert for this rule (so the card can show a "View Product" hint).
  firstTrigger?: TriggeredAlert | null;
}

function RuleCard({
  rule,
  index,
  onToggle,
  onEdit,
  onDelete,
  onViewProduct,
  firstTrigger,
}: RuleCardProps) {
  const meta = SEVERITY_META[rule.severity];
  const todayCount = getTodayTriggerCount(rule.id);
  const lastTriggered = formatRelative(rule.lastTriggered);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60',
        'border-l-4',
        meta.borderClass,
        'transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
        'animate-in fade-in slide-in-from-bottom-4 duration-500',
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 50}ms` }}
    >
      {/* Top accent bar */}
      <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {/* Enable / disable switch */}
          <div className="flex flex-col items-center pt-1">
            <Switch
              checked={rule.enabled}
              onCheckedChange={(checked) => onToggle(rule.id, checked)}
              aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
              className={cn(
                'data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300 dark:data-[state=unchecked]:bg-slate-600',
              )}
            />
            <span
              className={cn(
                'text-[9px] font-medium uppercase tracking-wide mt-1',
                rule.enabled
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500',
              )}
            >
              {rule.enabled ? 'On' : 'Off'}
            </span>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    className={cn(
                      'text-sm font-semibold truncate',
                      rule.enabled
                        ? 'text-slate-800 dark:text-slate-100'
                        : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {rule.name || 'Untitled rule'}
                  </h3>
                  <SeverityBadge severity={rule.severity} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {describeRule(rule)}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(rule)}
                      className="h-8 w-8 p-0 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors rounded-lg"
                      aria-label="Edit rule"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Edit rule
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(rule)}
                      className="h-8 w-8 p-0 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors rounded-lg"
                      aria-label="Delete rule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Delete rule
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Footer row: timestamps + first-triggered product */}
            <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
              <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Last triggered:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {lastTriggered}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bell className="h-3 w-3" />
                  Today:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">{todayCount}</span>
                </span>
              </div>
              {firstTrigger && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewProduct(firstTrigger.productId)}
                  className="h-7 text-[11px] rounded-lg border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors px-2"
                >
                  <Eye className="h-3 w-3 mr-1" /> View product
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-component: Triggered Alert Row
// ============================================================

interface TriggeredAlertRowProps {
  alert: TriggeredAlert;
  index: number;
  onDismiss: (id: string) => void;
  onViewProduct: (productId: string) => void;
}

function TriggeredAlertRow({
  alert,
  index,
  onDismiss,
  onViewProduct,
}: TriggeredAlertRowProps) {
  const meta = SEVERITY_META[alert.severity];
  const isCritical = alert.severity === 'critical';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60',
        'border-l-4',
        meta.borderClass,
        'transition-all duration-200 hover:shadow-md',
        'animate-in fade-in slide-in-from-bottom-4 duration-500',
        isCritical && 'animate-pulse',
      )}
      style={{ animationDelay: `${Math.min(index, 16) * 50}ms` }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Severity icon chip */}
          <div
            className={cn(
              'shrink-0 rounded-xl bg-gradient-to-br p-2 shadow-sm',
              meta.iconGradient,
            )}
          >
            <SeverityIcon severity={alert.severity} className="h-4 w-4 text-white" />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                {/* Product name + SKU */}
                <button
                  onClick={() => onViewProduct(alert.productId)}
                  className="group flex items-center gap-2 text-left max-w-full focus:outline-none"
                >
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors truncate">
                    {alert.productName || 'Unknown product'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded font-mono">
                    {alert.productSku || '—'}
                    <ArrowRight className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </button>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Rule: <span className="font-medium">{alert.ruleName}</span>
                </div>
                <div className="text-xs mt-1.5 text-slate-700 dark:text-slate-200 font-medium">
                  {alert.displayValue}
                </div>
              </div>

              {/* Severity badge */}
              <SeverityBadge severity={alert.severity} />
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Checked {formatRelative(alert.triggeredAt)}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewProduct(alert.productId)}
                  className="h-7 text-[11px] rounded-lg border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors px-2"
                >
                  <Eye className="h-3 w-3 mr-1" /> View Product
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDismiss(dismissedId(alert))}
                  className="h-7 text-[11px] rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors px-2"
                >
                  <X className="h-3 w-3 mr-1" /> Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-component: Empty States
// ============================================================

function NoRulesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-emerald-200/50 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/20 shadow-md rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-emerald-200/40 dark:bg-emerald-900/30 blur-xl animate-pulse" />
            <div className="relative h-20 w-20 rounded-full bg-white dark:bg-slate-900 shadow-md ring-1 ring-emerald-100 dark:ring-emerald-900 flex items-center justify-center">
              <BellRing className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
            </div>
            {/* Floating mini-bells */}
            <div className="absolute -top-2 -right-3 h-6 w-6 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center shadow-sm animate-bounce" style={{ animationDelay: '0ms', animationDuration: '2.5s' }}>
              <Bell className="h-3 w-3 text-teal-600 dark:text-teal-300" />
            </div>
            <div className="absolute -bottom-1 -left-3 h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shadow-sm animate-bounce" style={{ animationDelay: '400ms', animationDuration: '3s' }}>
              <Bell className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
            Create your first alert rule
          </h3>
          <p className="text-sm text-emerald-700/80 dark:text-emerald-400/70 max-w-md">
            Set up rules that monitor your pricing conditions — like margin drops, profit thresholds,
            break-even breaches, or competitor price gaps — and get notified when action is needed.
          </p>
          <Button
            onClick={onCreate}
            className="mt-5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Alert Rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AllClearTriggeredEmpty() {
  return (
    <Card className="border-emerald-200/50 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/20 shadow-md rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-emerald-200/40 dark:bg-emerald-900/30 blur-xl animate-pulse" />
            <div className="relative h-16 w-16 rounded-full bg-white dark:bg-slate-900 shadow-md ring-1 ring-emerald-100 dark:ring-emerald-900 flex items-center justify-center">
              <PartyPopper className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            {/* Confetti dots */}
            <div className="absolute -top-3 -left-3 h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '2s' }} />
            <div className="absolute -top-2 -right-4 h-2.5 w-2.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '2.4s' }} />
            <div className="absolute -bottom-3 -right-2 h-2 w-2 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: '600ms', animationDuration: '2.8s' }} />
            <div className="absolute -bottom-2 -left-4 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '900ms', animationDuration: '3.2s' }} />
          </div>
          <h3 className="text-base font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
            All clear! No pricing alerts triggered.
          </h3>
          <p className="text-sm text-emerald-700/80 dark:text-emerald-400/70 max-w-md">
            Every enabled rule was evaluated and no products currently breach any threshold. Click{' '}
            <span className="font-medium">Run Check</span> to re-evaluate.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Sub-component: Rule Form Dialog (Create / Edit)
// ============================================================

interface RuleFormDialogProps {
  open: boolean;
  rule: AlertRule | null; // null = creating new
  categories: string[];
  products: Product[];
  currencyCode: string;
  onClose: () => void;
  onSave: (rule: AlertRule, isNew: boolean) => void;
}

function RuleFormDialog({
  open,
  rule,
  categories,
  products,
  currencyCode,
  onClose,
  onSave,
}: RuleFormDialogProps) {
  // Local form state — initialised LAZILY from `rule` (or defaults for new).
  // The parent passes a `key` so this component fully remounts whenever the
  // rule being edited changes (or when switching between create / edit mode),
  // which causes these lazy initializers to re-run with the correct values.
  const [name, setName] = useState<string>(() => rule?.name || '');
  const [condition, setCondition] = useState<AlertCondition>(
    () => (rule?.condition && rule.condition in CONDITION_META ? rule.condition : 'margin-below'),
  );
  const [threshold, setThreshold] = useState<number>(() =>
    rule && typeof rule.threshold === 'number' && Number.isFinite(rule.threshold)
      ? rule.threshold
      : createDefaultAlertRule().threshold,
  );
  const [scope, setScope] = useState<AlertScope>(() => rule?.scope || 'all');
  const [scopeValue, setScopeValue] = useState<string>(() => rule?.scopeValue || '');
  const [severity, setSeverity] = useState<AlertSeverity>(() => rule?.severity || 'warning');
  const [enabled, setEnabled] = useState<boolean>(() => (rule ? rule.enabled !== false : true));
  const [productSearch, setProductSearch] = useState<string>('');

  const meta = CONDITION_META[condition];
  const isNew = !rule;

  // Filtered products for the "Specific Product" picker.
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 50);
    const q = productSearch.toLowerCase();
    return products
      .filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [products, productSearch]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Rule name required', {
        description: 'Please give your alert rule a name.',
      });
      return;
    }
    if (scope === 'category' && !scopeValue) {
      toast.error('Category required', {
        description: 'Pick a category for this rule, or change the scope to "All Products".',
      });
      return;
    }
    if (scope === 'product' && !scopeValue) {
      toast.error('Product required', {
        description: 'Pick a product for this rule, or change the scope to "All Products".',
      });
      return;
    }

    const savedRule: AlertRule = {
      id: rule?.id || generateAlertRuleId(),
      name: trimmedName,
      enabled,
      condition,
      threshold: Number.isFinite(threshold) ? threshold : 0,
      scope,
      scopeValue: scope === 'all' ? undefined : scopeValue || undefined,
      severity,
      createdAt: rule?.createdAt || new Date().toISOString(),
      lastTriggered: rule?.lastTriggered,
    };
    onSave(savedRule, isNew);
  }, [name, enabled, condition, threshold, scope, scopeValue, severity, rule, isNew, onSave]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <BellRing className="h-5 w-5 text-emerald-600" />
            {isNew ? 'Create Alert Rule' : 'Edit Alert Rule'}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? 'Define a pricing condition and PricePilot will flag matching products on every check.'
              : 'Update the rule conditions, scope, or severity. Changes apply on the next check.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Rule name */}
          <div className="space-y-1.5">
            <Label htmlFor="alert-name" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Rule name
            </Label>
            <Input
              id="alert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Margin below 15% alert"
              className="bg-white shadow-sm border-slate-200 focus:border-emerald-400 focus:ring-emerald-400/30 rounded-xl h-10"
              autoFocus
            />
          </div>

          {/* Condition */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Condition
            </Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as AlertCondition)}>
              <SelectTrigger className="w-full bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors rounded-xl h-10">
                <SelectValue placeholder="Pick a condition..." />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_ORDER.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CONDITION_META[c].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Threshold */}
          {meta.unit !== 'none' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Threshold{' '}
                <span className="text-slate-400 normal-case font-normal">
                  ({meta.unit === 'percent' ? 'percentage' : `${currencyCode} amount`})
                </span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={Number.isFinite(threshold) ? threshold : 0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setThreshold(Number.isFinite(v) ? v : 0);
                  }}
                  className="bg-white shadow-sm border-slate-200 focus:border-emerald-400 focus:ring-emerald-400/30 rounded-xl h-10 pr-12"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                  {meta.unit === 'percent' ? '%' : currencyCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {condition === 'below-breakeven'
                  ? 'Currency buffer below break-even (0 = any breach).'
                  : condition === 'price-above-recommended' || condition === 'price-below-minimum'
                    ? 'Percent above/below the recommended price (0 = any breach).'
                    : condition === 'profit-below'
                      ? 'Currency amount per unit.'
                      : 'Percentage threshold.'}
              </p>
            </div>
          )}

          {/* Scope */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Scope
            </Label>
            <Select value={scope} onValueChange={(v) => setScope(v as AlertScope)}>
              <SelectTrigger className="w-full bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors rounded-xl h-10">
                <SelectValue placeholder="Pick a scope..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="category">Specific Category</SelectItem>
                <SelectItem value="product">Specific Product</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scope value (conditional) */}
          {scope === 'category' && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Category
              </Label>
              {categories.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No categories available yet.</p>
              ) : (
                <Select value={scopeValue} onValueChange={setScopeValue}>
                  <SelectTrigger className="w-full bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors rounded-xl h-10">
                    <SelectValue placeholder="Pick a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {scope === 'product' && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Product
              </Label>
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search by name, SKU, or category..."
                className="bg-white shadow-sm border-slate-200 focus:border-emerald-400 focus:ring-emerald-400/30 rounded-xl h-10"
              />
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 divide-y divide-slate-100 dark:divide-slate-800 custom-scrollbar">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic px-3 py-3">
                    No products match your search.
                  </p>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setScopeValue(p.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        scopeValue === p.id
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{p.sku}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {scopeValue && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Selected: {products.find((p) => p.id === scopeValue)?.name || scopeValue}
                </p>
              )}
            </div>
          )}

          {/* Severity */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Severity
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITY_ORDER.map((s) => {
                const m = SEVERITY_META[s];
                const isSelected = severity === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={cn(
                      'flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all',
                      isSelected
                        ? cn('border-2 bg-white dark:bg-slate-800', m.badgeClass)
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/40',
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', m.dotClass)} />
                    {m.label}
                    {isSelected && <Check className="h-3 w-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              {enabled ? (
                <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Pause className="h-4 w-4 text-slate-400 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {enabled ? 'Rule is active' : 'Rule is paused'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {enabled ? 'Will be evaluated on the next check.' : 'Will be skipped during checks.'}
                </div>
              </div>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300 dark:data-[state=unchecked]:bg-slate-600"
              aria-label="Toggle rule enabled"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-xl border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {isNew ? 'Create rule' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Sub-component: Delete Confirm Dialog
// ============================================================

function DeleteConfirmDialog({
  open,
  rule,
  onClose,
  onConfirm,
}: {
  open: boolean;
  rule: AlertRule | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <Trash2 className="h-5 w-5" />
            Delete alert rule?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {rule
              ? `This will permanently remove "${rule.name}". Triggered alerts from this rule will disappear on the next check. This cannot be undone.`
              : 'This will permanently remove the alert rule.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onClose}
            className="rounded-xl border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white border-0 shadow-md shadow-red-500/20 transition-all duration-200"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete rule
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// Main component: PriceAlertsPage
// ============================================================

export function PriceAlertsPage() {
  const { products, businessSettings, setSelectedProductId, setCurrentView } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode || 'INR';

  // ---- Rule state ----
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  // ---- Dialog state ----
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<AlertRule | null>(null);

  // ---- Load rules from localStorage on mount ----
  const refreshRules = useCallback(() => {
    setRules(loadAlertRules());
  }, []);

  useEffect(() => {
    refreshRules();
  }, [refreshRules]);

  // ---- Categories list (for scope dropdown) ----
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p && typeof p.category === 'string' && p.category.trim()) {
        set.add(p.category);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // ---- Triggered alerts (live evaluation) ----
  const triggeredAlerts = useMemo<TriggeredAlert[]>(() => {
    return evaluateAllRules(rules, products);
  }, [rules, products]);

  // Filter out dismissed alerts for the visible list.
  const visibleTriggeredAlerts = useMemo(() => {
    return triggeredAlerts.filter((a) => !dismissedIds.has(dismissedId(a)));
  }, [triggeredAlerts, dismissedIds]);

  // ---- Summary stats ----
  const summary = useMemo(() => {
    const activeRules = rules.filter((r) => r.enabled).length;
    const visible = visibleTriggeredAlerts;
    const criticalCount = visible.filter((a) => a.severity === 'critical').length;
    const affectedProducts = new Set(visible.map((a) => a.productId)).size;
    return {
      activeRules,
      triggeredCount: visible.length,
      criticalCount,
      affectedProducts,
    };
  }, [rules, visibleTriggeredAlerts]);

  // ---- Handlers ----

  const handleCreateClick = useCallback(() => {
    setEditingRule(null);
    setFormOpen(true);
  }, []);

  const handleEditClick = useCallback((rule: AlertRule) => {
    setEditingRule(rule);
    setFormOpen(true);
  }, []);

  const handleSave = useCallback(
    (rule: AlertRule, isNew: boolean) => {
      if (isNew) {
        const next = addAlertRule(rule);
        setRules(next);
        toast.success('Alert rule created', {
          description: `"${rule.name}" is now ${rule.enabled ? 'active' : 'paused'}.`,
        });
      } else {
        const next = updateAlertRule(rule.id, rule);
        setRules(next);
        toast.success('Alert rule updated', {
          description: `"${rule.name}" saved.`,
        });
      }
      setFormOpen(false);
      setEditingRule(null);
    },
    [],
  );

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    const next = updateAlertRule(id, { enabled });
    setRules(next);
    const r = next.find((x) => x.id === id);
    toast(enabled ? 'Rule enabled' : 'Rule paused', {
      description: r ? `"${r.name}" is now ${enabled ? 'active' : 'paused'}.` : undefined,
    });
  }, []);

  const handleDeleteClick = useCallback((rule: AlertRule) => {
    setDeletingRule(rule);
    setDeleteOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingRule) {
      setDeleteOpen(false);
      return;
    }
    const next = deleteAlertRule(deletingRule.id);
    setRules(next);
    toast.success('Alert rule deleted', {
      description: `"${deletingRule.name}" was removed.`,
    });
    setDeleteOpen(false);
    setDeletingRule(null);
  }, [deletingRule]);

  const handleRunCheck = useCallback(() => {
    if (rules.length === 0) {
      toast('No alert rules to check', {
        description: 'Create an alert rule first.',
      });
      return;
    }
    setIsChecking(true);
    // Defer the evaluation so the spinner can paint, then record triggers.
    setTimeout(() => {
      try {
        const nowIso = new Date().toISOString();
        let totalTriggered = 0;
        let criticalTriggered = 0;
        const triggeredRuleIds = new Set<string>();

        for (const rule of rules) {
          if (!rule.enabled) continue;
          const alerts = evaluateRule(rule, products);
          if (alerts.length > 0) {
            triggeredRuleIds.add(rule.id);
            totalTriggered += alerts.length;
            if (rule.severity === 'critical') criticalTriggered += alerts.length;
            recordTrigger(rule.id);
            updateAlertRule(rule.id, { lastTriggered: nowIso });
          }
        }
        // Refresh rules state so lastTriggered renders in the cards.
        if (triggeredRuleIds.size > 0) {
          setRules(loadAlertRules());
        }

        // Clear dismissals so the user sees fresh results.
        setDismissedIds(new Set());
        setHasChecked(true);

        if (totalTriggered === 0) {
          toast.success('Check complete: all clear', {
            description: `Evaluated ${rules.filter((r) => r.enabled).length} rule(s) — no alerts triggered.`,
          });
        } else {
          toast.error('Check complete: alerts triggered', {
            description: `${totalTriggered} alert(s) triggered across ${triggeredRuleIds.size} rule(s)${
              criticalTriggered > 0 ? ` (${criticalTriggered} critical)` : ''
            }.`,
          });
        }
      } finally {
        setIsChecking(false);
      }
    }, 250);
  }, [rules, products]);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleViewProduct = useCallback(
    (productId: string) => {
      setSelectedProductId(productId);
      setCurrentView('products');
    },
    [setSelectedProductId, setCurrentView],
  );

  // ---- Render ----

  const hasRules = rules.length > 0;

  return (
    <div className="space-y-4 sm:space-y-5 pb-20">
      {/* 1. Gradient header */}
      <GradientHeader
        hasRules={hasRules}
        triggeredCount={summary.triggeredCount}
        onCreate={handleCreateClick}
        onRunCheck={handleRunCheck}
        isChecking={isChecking}
      />

      {/* 2. Summary cards */}
      <SummaryCards
        activeRules={summary.activeRules}
        triggeredCount={summary.triggeredCount}
        criticalCount={summary.criticalCount}
        affectedProducts={summary.affectedProducts}
      />

      {/* 3. Rules list (or empty state) */}
      {!hasRules ? (
        <NoRulesEmpty onCreate={handleCreateClick} />
      ) : (
        <section className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '150ms' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Alert Rules
              </h2>
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              >
                {rules.length} total
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateClick}
              className="rounded-xl border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New rule
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {rules.map((rule, idx) => {
              const firstTrigger =
                visibleTriggeredAlerts.find((a) => a.ruleId === rule.id) || null;
              return (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  index={idx}
                  onToggle={handleToggle}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteClick}
                  onViewProduct={handleViewProduct}
                  firstTrigger={firstTrigger}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Triggered alerts panel */}
      {hasRules && (
        <section className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {summary.triggeredCount > 0 ? (
                <BellRing className="h-4 w-4 text-rose-500 dark:text-rose-400" />
              ) : (
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              )}
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Triggered Alerts
              </h2>
              {summary.triggeredCount > 0 && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    summary.criticalCount > 0
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                      : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
                  )}
                >
                  {summary.triggeredCount} active
                  {dismissedIds.size > 0 && ` · ${dismissedIds.size} dismissed`}
                </Badge>
              )}
            </div>
            {dismissedIds.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDismissedIds(new Set())}
                className="rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Restore dismissed
              </Button>
            )}
          </div>

          {visibleTriggeredAlerts.length === 0 ? (
            hasChecked ? (
              <AllClearTriggeredEmpty />
            ) : (
              <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-sm rounded-2xl">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="relative mb-4">
                      <div className="absolute inset-0 rounded-full bg-slate-200/40 dark:bg-slate-700/30 blur-xl" />
                      <div className="relative h-14 w-14 rounded-full bg-gradient-to-br from-slate-50 to-emerald-50 dark:from-slate-800 dark:to-emerald-950/30 shadow-md ring-1 ring-slate-100 dark:ring-slate-700 flex items-center justify-center">
                        <Target className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                      </div>
                    </div>
                    <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      Ready to check your alerts
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                      Click <span className="font-medium">Run Check</span> above to evaluate every
                      rule against your current products. Triggered alerts will appear here.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRunCheck}
                      disabled={isChecking}
                      className="mt-4 rounded-xl border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isChecking && 'animate-spin')} />
                      Run Check now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          ) : (
            <div className="max-h-[640px] overflow-y-auto pr-1 custom-scrollbar space-y-3">
              {visibleTriggeredAlerts.map((alert, idx) => (
                <TriggeredAlertRow
                  key={`${alert.ruleId}-${alert.productId}-${idx}`}
                  alert={alert}
                  index={idx}
                  onDismiss={handleDismiss}
                  onViewProduct={handleViewProduct}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5. Dialogs */}
      <RuleFormDialog
        key={editingRule ? `edit-${editingRule.id}` : 'create'}
        open={formOpen}
        rule={editingRule}
        categories={categories}
        products={products}
        currencyCode={currencyCode}
        onClose={() => {
          setFormOpen(false);
          setEditingRule(null);
        }}
        onSave={handleSave}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        rule={deletingRule}
        onClose={() => {
          setDeleteOpen(false);
          setDeletingRule(null);
        }}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
