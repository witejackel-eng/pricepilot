/**
 * PricePilot - Alert Rules (localStorage) + Evaluation Engine
 *
 * v1.6 (Task 6): User-defined alert rules for pricing conditions.
 *
 * Rules are UI preferences (NOT primary business data), so they live in
 * localStorage alongside other UI prefs (see `app-settings.ts`). They are
 * never persisted through IndexedDB.
 *
 * Evaluation is performed client-side against the current products in the
 * Zustand store. Trigger history (timestamps) is stored in a separate
 * localStorage key so we can compute "triggered count today".
 *
 * NEVER throws — all parsing, storage, and evaluation is best-effort.
 */

import { Product } from './types';
import { formatCurrency, safeNumberValue } from './formatting';

// ============================================================
// Types
// ============================================================

export type AlertCondition =
  | 'margin-below'
  | 'margin-above'
  | 'profit-below'
  | 'price-above-competitor'
  | 'price-below-competitor'
  | 'below-breakeven'
  | 'price-above-recommended'
  | 'price-below-minimum';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertScope = 'all' | 'category' | 'product';

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  threshold: number; // percentage OR currency amount (see condition)
  scope: AlertScope;
  scopeValue?: string; // category name (scope=category) or product ID (scope=product)
  severity: AlertSeverity;
  createdAt: string;
  lastTriggered?: string;
}

export interface TriggeredAlert {
  ruleId: string;
  productId: string;
  productSku: string;
  productName: string;
  severity: AlertSeverity;
  displayValue: string;
  ruleName: string;
  triggeredAt: string;
}

interface TriggerRecord {
  ruleId: string;
  timestamp: string;
}

// ============================================================
// Constants & Metadata
// ============================================================

const ALERT_RULES_KEY = 'pricepilot_alert_rules';
const TRIGGER_HISTORY_KEY = 'pricepilot_alert_triggers';
const TRIGGER_HISTORY_MAX = 500; // cap to avoid unbounded growth

/**
 * Per-condition metadata: human label, the unit suffix for the threshold
 * input ("%" or currency), whether the condition needs competitor data, and
 * a description template used to render the rule card subtitle.
 */
export interface ConditionMeta {
  /** Long label shown in the condition dropdown. */
  label: string;
  /** Short label used for the rule card subtitle (e.g. "Margin drops below"). */
  shortLabel: string;
  /** Threshold unit suffix: "%" or currency. */
  unit: 'percent' | 'currency' | 'none';
  /** Whether the rule should be skipped if the product has no competitor data. */
  requiresCompetitors?: boolean;
}

export const CONDITION_META: Record<AlertCondition, ConditionMeta> = {
  'margin-below': {
    label: 'Margin drops below %',
    shortLabel: 'Margin drops below',
    unit: 'percent',
  },
  'margin-above': {
    label: 'Margin rises above %',
    shortLabel: 'Margin rises above',
    unit: 'percent',
  },
  'profit-below': {
    label: 'Profit per unit below amount',
    shortLabel: 'Profit per unit below',
    unit: 'currency',
  },
  'price-above-competitor': {
    label: 'Price above competitor avg by %',
    shortLabel: 'Price above competitor avg by',
    unit: 'percent',
    requiresCompetitors: true,
  },
  'price-below-competitor': {
    label: 'Price below competitor avg by %',
    shortLabel: 'Price below competitor avg by',
    unit: 'percent',
    requiresCompetitors: true,
  },
  'below-breakeven': {
    label: 'Price below break-even',
    shortLabel: 'Price below break-even by',
    unit: 'currency',
  },
  'price-above-recommended': {
    label: 'Price above recommended (balanced) by %',
    shortLabel: 'Price above recommended by',
    unit: 'percent',
  },
  'price-below-minimum': {
    label: 'Price below minimum safe price by %',
    shortLabel: 'Price below minimum safe price by',
    unit: 'percent',
  },
};

export const CONDITION_ORDER: AlertCondition[] = [
  'margin-below',
  'margin-above',
  'profit-below',
  'below-breakeven',
  'price-above-recommended',
  'price-below-minimum',
  'price-above-competitor',
  'price-below-competitor',
];

export interface SeverityMeta {
  label: string;
  /** Tailwind classes for the badge pill background + text. */
  badgeClass: string;
  /** Tailwind class for the dot indicator. */
  dotClass: string;
  /** Tailwind classes for the left border on a card. */
  borderClass: string;
  /** Tailwind gradient for the icon chip background. */
  iconGradient: string;
  /** Lucide icon name. */
  icon: 'info' | 'warning' | 'critical';
}

export const SEVERITY_META: Record<AlertSeverity, SeverityMeta> = {
  info: {
    label: 'Info',
    badgeClass:
      'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    dotClass: 'bg-sky-500',
    borderClass: 'border-l-sky-500',
    iconGradient: 'from-sky-500 to-cyan-500',
    icon: 'info',
  },
  warning: {
    label: 'Warning',
    badgeClass:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dotClass: 'bg-amber-500',
    borderClass: 'border-l-amber-500',
    iconGradient: 'from-amber-500 to-orange-500',
    icon: 'warning',
  },
  critical: {
    label: 'Critical',
    badgeClass:
      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
    dotClass: 'bg-red-500',
    borderClass: 'border-l-red-500',
    iconGradient: 'from-red-500 to-rose-500',
    icon: 'critical',
  },
};

export const SEVERITY_ORDER: AlertSeverity[] = ['critical', 'warning', 'info'];

// ============================================================
// localStorage CRUD
// ============================================================

/**
 * Load all alert rules from localStorage. Returns [] if missing, malformed,
 * or if localStorage is unavailable. NEVER throws.
 */
export function loadAlertRules(): AlertRule[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ALERT_RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is AlertRule => r && typeof r === 'object' && typeof r.id === 'string')
      .map(normalizeRule)
      .filter((r): r is AlertRule => r !== null);
  } catch {
    return [];
  }
}

/**
 * Persist all alert rules to localStorage. NEVER throws.
 */
export function saveAlertRules(rules: AlertRule[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ALERT_RULES_KEY, JSON.stringify(rules));
  } catch (err) {
    console.warn('[PricePilot] Could not save alert rules to localStorage.', err);
  }
}

/**
 * Add a new alert rule. Returns the updated list (also persisted).
 */
export function addAlertRule(rule: AlertRule): AlertRule[] {
  const rules = loadAlertRules();
  const next = [rule, ...rules];
  saveAlertRules(next);
  return next;
}

/**
 * Update an existing alert rule by ID. Returns the updated list (also persisted).
 * If the ID is not found, the list is returned unchanged.
 */
export function updateAlertRule(id: string, updates: Partial<AlertRule>): AlertRule[] {
  const rules = loadAlertRules();
  const next = rules.map((r) => (r.id === id ? { ...r, ...updates } : r));
  saveAlertRules(next);
  return next;
}

/**
 * Delete an alert rule by ID. Returns the updated list (also persisted).
 */
export function deleteAlertRule(id: string): AlertRule[] {
  const rules = loadAlertRules();
  const next = rules.filter((r) => r.id !== id);
  saveAlertRules(next);
  return next;
}

// ============================================================
// Trigger History (per-rule timestamp log)
// ============================================================

/**
 * Load all trigger records. Returns [] if missing/malformed. NEVER throws.
 */
export function loadTriggerHistory(): TriggerRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TRIGGER_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is TriggerRecord =>
          r && typeof r === 'object' && typeof r.ruleId === 'string' && typeof r.timestamp === 'string',
      )
      .slice(-TRIGGER_HISTORY_MAX);
  } catch {
    return [];
  }
}

/**
 * Persist trigger records (capped at TRIGGER_HISTORY_MAX).
 */
function persistTriggerHistory(records: TriggerRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const trimmed = records.slice(-TRIGGER_HISTORY_MAX);
    localStorage.setItem(TRIGGER_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('[PricePilot] Could not save trigger history to localStorage.', err);
  }
}

/**
 * Record one trigger event for a rule (called when evaluation triggers).
 */
export function recordTrigger(ruleId: string): TriggerRecord[] {
  const records = loadTriggerHistory();
  const next = [...records, { ruleId, timestamp: new Date().toISOString() }];
  persistTriggerHistory(next);
  return next;
}

/**
 * Count how many times a rule triggered today (local date).
 */
export function getTodayTriggerCount(ruleId: string): number {
  const records = loadTriggerHistory();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return records.filter((r) => {
    if (r.ruleId !== ruleId) return false;
    const t = new Date(r.timestamp).getTime();
    return Number.isFinite(t) && t >= startOfToday;
  }).length;
}

/**
 * Clear all trigger history (used when resetting alerts).
 */
export function clearTriggerHistory(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(TRIGGER_HISTORY_KEY);
  } catch {
    // ignore
  }
}

// ============================================================
// Evaluation Engine
// ============================================================

/**
 * Compute the average competitor price for a product (0 if none).
 */
function avgCompetitorPrice(product: Product): number {
  const list = Array.isArray(product.competitorPrices) ? product.competitorPrices : [];
  const valid = list.filter((c) => c && safeNumberValue(c.price, 0) > 0);
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, c) => acc + safeNumberValue(c.price, 0), 0);
  return sum / valid.length;
}

/**
 * Filter products by rule scope. NEVER throws.
 */
function scopeProducts(rule: AlertRule, products: Product[]): Product[] {
  if (rule.scope === 'all') return products;
  if (rule.scope === 'category') {
    const v = rule.scopeValue || '';
    return products.filter((p) => p && (p.category || '') === v);
  }
  if (rule.scope === 'product') {
    const v = rule.scopeValue || '';
    return products.filter((p) => p && p.id === v);
  }
  return products;
}

/**
 * Evaluate a single alert rule against a list of products.
 * Returns one TriggeredAlert per product that matches the condition.
 *
 * NEVER throws — malformed product fields are coerced to safe fallbacks.
 *
 * NOTE: This function does NOT record trigger history or update
 * `rule.lastTriggered`. Callers are responsible for those side-effects
 * (typically only when the user clicks "Run Check").
 */
export function evaluateRule(rule: AlertRule, products: Product[]): TriggeredAlert[] {
  if (!rule || !rule.enabled) return [];

  const scoped = scopeProducts(rule, products);
  const threshold = safeNumberValue(rule.threshold, 0);
  const nowIso = new Date().toISOString();
  const alerts: TriggeredAlert[] = [];

  for (const p of scoped) {
    if (!p) continue;

    let triggered = false;
    let displayValue = '';
    const meta = CONDITION_META[rule.condition];

    const margin = safeNumberValue(p.calculatedMarginPercent, 0);
    const profit = safeNumberValue(p.calculatedProfitPerUnit, 0);
    const price = safeNumberValue(p.currentSellingPrice, 0);
    const breakEven = safeNumberValue(p.calculatedBreakEvenPrice, 0);
    const balanced = safeNumberValue(p.recommendedPrices?.balanced, 0);
    const minimum = safeNumberValue(p.recommendedPrices?.minimum, 0);

    switch (rule.condition) {
      case 'margin-below': {
        triggered = margin < threshold;
        displayValue = `Margin: ${margin.toFixed(1)}% (below ${threshold}%)`;
        break;
      }
      case 'margin-above': {
        triggered = margin > threshold;
        displayValue = `Margin: ${margin.toFixed(1)}% (above ${threshold}%)`;
        break;
      }
      case 'profit-below': {
        triggered = profit < threshold;
        displayValue = `Profit: ${formatCurrency(profit)} (below ${formatCurrency(threshold)})`;
        break;
      }
      case 'price-above-competitor': {
        const avg = avgCompetitorPrice(p);
        if (avg > 0 && meta.requiresCompetitors) {
          const pctAbove = ((price - avg) / avg) * 100;
          triggered = pctAbove > threshold;
          displayValue = `Price ${pctAbove.toFixed(1)}% above competitor avg (threshold ${threshold}%)`;
        }
        break;
      }
      case 'price-below-competitor': {
        const avg = avgCompetitorPrice(p);
        if (avg > 0 && meta.requiresCompetitors) {
          const pctBelow = ((avg - price) / avg) * 100;
          triggered = pctBelow > threshold;
          displayValue = `Price ${pctBelow.toFixed(1)}% below competitor avg (threshold ${threshold}%)`;
        }
        break;
      }
      case 'below-breakeven': {
        // Threshold = currency buffer below break-even (default 0).
        triggered = breakEven > 0 && price < breakEven - threshold;
        displayValue = `Price ${formatCurrency(price)} below break-even ${formatCurrency(breakEven)}`;
        break;
      }
      case 'price-above-recommended': {
        // Threshold = % above balanced recommended price.
        if (balanced > 0) {
          const pctAbove = ((price - balanced) / balanced) * 100;
          triggered = pctAbove > threshold;
          displayValue = `Price ${formatCurrency(price)} (${pctAbove.toFixed(1)}% above balanced ${formatCurrency(balanced)})`;
        }
        break;
      }
      case 'price-below-minimum': {
        // Threshold = % below minimum safe price.
        if (minimum > 0) {
          const pctBelow = ((minimum - price) / minimum) * 100;
          triggered = pctBelow > threshold;
          displayValue = `Price ${formatCurrency(price)} (${pctBelow.toFixed(1)}% below minimum ${formatCurrency(minimum)})`;
        }
        break;
      }
      default:
        // Unknown condition — never trigger.
        break;
    }

    if (triggered) {
      alerts.push({
        ruleId: rule.id,
        productId: p.id,
        productSku: p.sku || '',
        productName: p.name || '',
        severity: rule.severity,
        displayValue,
        ruleName: rule.name,
        triggeredAt: nowIso,
      });
    }
  }

  return alerts;
}

/**
 * Evaluate all rules and flatten the results into a single list of triggered
 * alerts. Sorted by severity (critical → warning → info) then by product name.
 */
export function evaluateAllRules(rules: AlertRule[], products: Product[]): TriggeredAlert[] {
  const all: TriggeredAlert[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const alerts = evaluateRule(rule, products);
    all.push(...alerts);
  }
  // Sort by severity weight then by product name for stable display.
  const severityWeight: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  all.sort((a, b) => {
    const w = severityWeight[a.severity] - severityWeight[b.severity];
    if (w !== 0) return w;
    return (a.productName || '').localeCompare(b.productName || '');
  });
  return all;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Generate a unique ID for a new alert rule.
 * Uses crypto.randomUUID when available, falls back to a timestamp-based ID.
 */
export function generateAlertRuleId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Coerce a partially-typed object into a valid AlertRule.
 * Returns null if the object is fundamentally broken (missing id).
 */
function normalizeRule(raw: Partial<AlertRule> | null): AlertRule | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;

  const condition =
    raw.condition && raw.condition in CONDITION_META
      ? (raw.condition as AlertCondition)
      : 'margin-below';
  const severity =
    raw.severity && raw.severity in SEVERITY_META ? (raw.severity as AlertSeverity) : 'warning';
  const scope =
    raw.scope === 'all' || raw.scope === 'category' || raw.scope === 'product'
      ? raw.scope
      : 'all';

  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : 'Untitled rule',
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    condition,
    threshold: safeNumberValue(raw.threshold, 0),
    scope,
    scopeValue: typeof raw.scopeValue === 'string' ? raw.scopeValue : undefined,
    severity,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    lastTriggered: typeof raw.lastTriggered === 'string' ? raw.lastTriggered : undefined,
  };
}

/**
 * Build a human-readable description of a rule for the rule card subtitle.
 * Example: "Margin drops below 15% for All Products"
 */
export function describeRule(rule: AlertRule): string {
  const meta = CONDITION_META[rule.condition];
  let thresholdPart = '';
  if (meta.unit === 'percent') {
    thresholdPart = `${rule.threshold}%`;
  } else if (meta.unit === 'currency') {
    thresholdPart = formatCurrency(rule.threshold);
  }
  const conditionText = meta.shortLabel;
  const scopeText =
    rule.scope === 'all'
      ? 'All Products'
      : rule.scope === 'category'
        ? `Category: ${rule.scopeValue || '—'}`
        : `Product ID: ${rule.scopeValue ? rule.scopeValue.slice(0, 8) + '…' : '—'}`;
  const joined = thresholdPart
    ? `${conditionText} ${thresholdPart}`
    : conditionText;
  return `${joined} for ${scopeText}`;
}

/**
 * Create a default AlertRule with sensible values (used as the starting point
 * when the user opens the "Create Alert Rule" dialog).
 */
export function createDefaultAlertRule(): AlertRule {
  return {
    id: generateAlertRuleId(),
    name: '',
    enabled: true,
    condition: 'margin-below',
    threshold: 15,
    scope: 'all',
    scopeValue: undefined,
    severity: 'warning',
    createdAt: new Date().toISOString(),
  };
}
