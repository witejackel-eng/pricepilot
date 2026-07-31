/**
 * PricePilot - Client-side Error Observability
 *
 * Phase 21: Structured error reporting that captures ONLY technical
 * metadata. Business data (product names, prices, costs, spreadsheet
 * contents, business names, full backup contents) is NEVER captured.
 *
 * Output modes:
 *   - Development: console logging with `[PricePilot Error]` prefix
 *   - Production: optional reporting to NEXT_PUBLIC_ERROR_REPORTING_URL
 *   - Local: downloadable diagnostic report (technical metadata only)
 */

import type { AppView } from '@/store/pricepilot-store';

// ============================================================
// Types
// ============================================================

export type ErrorCategory =
  | 'database'
  | 'import'
  | 'backup'
  | 'pricing'
  | 'ui'
  | 'unknown';

export interface ErrorReport {
  /** When the error occurred (ISO 8601). */
  timestamp: string;
  /** Broad category of the error. */
  category: ErrorCategory;
  /** App version from package.json. */
  appVersion: string;
  /** navigator.userAgent at the time of the error. */
  browser: string;
  /** The current view the user was on. */
  currentView: AppView | 'unknown';
  /** What operation was being performed (e.g. "save-product", "import-rows"). */
  operation: string;
  /** Product ID — only included when it is useful for debugging. */
  productId?: string;
  /** Import row number — only for import-related errors. */
  importRowNumber?: number;
  /** Schema version from IndexedDB metadata. */
  schemaVersion?: number | null;
  /** Whether IndexedDB is available. */
  indexedDbAvailable: boolean;
  /** Error message (sanitized — no business data). */
  message: string;
  /** Error digest (if available from Next.js). */
  digest?: string;
}

export interface DiagnosticReport {
  generatedAt: string;
  appVersion: string;
  browser: string;
  userAgent: string;
  indexedDbAvailable: boolean;
  schemaVersion: number | null;
  tableCounts: {
    products: number;
    pricingRules: number;
    scenarios: number;
    importBatches: number;
    importIssues: number;
    undoActions: number;
    backups: number;
  };
  migrationStatus: string | null;
  lastSavedTimestamp: string | null;
  /** Last 50 errors — categories and timestamps only, NO business data. */
  errorHistory: Array<{ timestamp: string; category: ErrorCategory; operation: string }>;
  storageEstimate: {
    usage?: number;
    quota?: number;
  } | null;
}

// ============================================================
// Constants
// ============================================================

const APP_VERSION = '0.2.1';
const MAX_ERROR_HISTORY = 50;
const STORAGE_KEY_ERROR_HISTORY = 'pricepilot_error_history';

// ============================================================
// Error History (in-memory + localStorage persistence)
// ============================================================

interface ErrorHistoryEntry {
  timestamp: string;
  category: ErrorCategory;
  operation: string;
}

let errorHistory: ErrorHistoryEntry[] = [];

/**
 * Load persisted error history from localStorage. Safe to call
 * multiple times — subsequent calls are no-ops if already loaded.
 */
function loadErrorHistory(): void {
  if (errorHistory.length > 0) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY_ERROR_HISTORY);
    if (raw) {
      errorHistory = JSON.parse(raw) as ErrorHistoryEntry[];
    }
  } catch {
    // Ignore — error history is best-effort.
  }
}

function persistErrorHistory(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_ERROR_HISTORY, JSON.stringify(errorHistory));
  } catch {
    // Ignore — quota exceeded, etc.
  }
}

function addToHistory(category: ErrorCategory, operation: string): void {
  loadErrorHistory();
  errorHistory.push({ timestamp: new Date().toISOString(), category, operation });
  // Keep only the last MAX_ERROR_HISTORY entries.
  if (errorHistory.length > MAX_ERROR_HISTORY) {
    errorHistory = errorHistory.slice(-MAX_ERROR_HISTORY);
  }
  persistErrorHistory();
}

// ============================================================
// Sanitization
// ============================================================

/**
 * Strip potentially sensitive business data from an error message.
 * Removes patterns that look like product names, prices, costs,
 * business names, and spreadsheet contents.
 */
function sanitizeMessage(message: string): string {
  // Replace common business data patterns.
  // This is intentionally conservative — we'd rather over-sanitize
  // than leak business data.
  let sanitized = message;

  // Remove anything that looks like a currency value (e.g. "₹1,234.56", "$99.99").
  sanitized = sanitized.replace(/[\$₹€£¥]\s*[\d,]+\.?\d*/g, '[AMOUNT]');

  // Remove quoted strings that might be product names or business names.
  // Matches single or double quoted strings longer than 3 chars.
  sanitized = sanitized.replace(/["']([^"']{4,})["']/g, '"[REDACTED]"');

  return sanitized;
}

// ============================================================
// Category Detection
// ============================================================

/**
 * Infer the error category from the error message and context.
 */
export function inferCategory(error: Error, operation?: string): ErrorCategory {
  const msg = (error.message ?? '').toLowerCase();
  const op = (operation ?? '').toLowerCase();

  // Database errors
  if (
    msg.includes('indexeddb') ||
    msg.includes('dexie') ||
    msg.includes('database') ||
    msg.includes('idb') ||
    msg.includes('transaction') ||
    op.includes('database') ||
    op.includes('db') ||
    op.includes('save-') ||
    op.includes('load-')
  ) {
    return 'database';
  }

  // Import errors
  if (
    msg.includes('import') ||
    msg.includes('spreadsheet') ||
    msg.includes('csv') ||
    msg.includes('excel') ||
    msg.includes('row') ||
    msg.includes('mapping') ||
    op.includes('import')
  ) {
    return 'import';
  }

  // Backup errors
  if (
    msg.includes('backup') ||
    msg.includes('restore') ||
    msg.includes('recovery') ||
    op.includes('backup') ||
    op.includes('restore')
  ) {
    return 'backup';
  }

  // Pricing errors
  if (
    msg.includes('margin') ||
    msg.includes('pricing') ||
    msg.includes('calculation') ||
    msg.includes('recalculate') ||
    op.includes('pricing') ||
    op.includes('calculate') ||
    op.includes('approve') ||
    op.includes('apply')
  ) {
    return 'pricing';
  }

  // UI errors
  if (
    msg.includes('render') ||
    msg.includes('component') ||
    op.includes('render') ||
    op.includes('ui')
  ) {
    return 'ui';
  }

  return 'unknown';
}

// ============================================================
// Core Reporting Function
// ============================================================

/**
 * Report an error. Captures technical metadata only — never
 * business data.
 *
 * @param error - The error that was caught.
 * @param options - Additional context for the error report.
 */
export function reportError(
  error: Error,
  options: {
    category?: ErrorCategory;
    operation?: string;
    currentView?: AppView;
    productId?: string;
    importRowNumber?: number;
    digest?: string;
  } = {}
): ErrorReport {
  const category = options.category ?? inferCategory(error, options.operation);
  const operation = options.operation ?? 'unknown';

  const report: ErrorReport = {
    timestamp: new Date().toISOString(),
    category,
    appVersion: APP_VERSION,
    browser: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    currentView: options.currentView ?? 'unknown',
    operation,
    productId: options.productId,
    importRowNumber: options.importRowNumber,
    schemaVersion: null, // Will be populated async in diagnostic report
    indexedDbAvailable: typeof indexedDB !== 'undefined',
    message: sanitizeMessage(error.message),
    digest: options.digest,
  };

  // Add to history (categories and timestamps only — no business data).
  addToHistory(category, operation);

  // Development: console logging.
  if (process.env.NODE_ENV === 'development') {
    console.error('[PricePilot Error]', {
      category: report.category,
      operation: report.operation,
      currentView: report.currentView,
      message: report.message,
      productId: report.productId ?? '(none)',
      importRowNumber: report.importRowNumber ?? '(none)',
      indexedDbAvailable: report.indexedDbAvailable,
      appVersion: report.appVersion,
    });
  }

  // Production: optional reporting to external endpoint.
  const reportingUrl = process.env.NEXT_PUBLIC_ERROR_REPORTING_URL;
  if (reportingUrl && typeof fetch !== 'undefined') {
    // Fire-and-forget — never block the UI.
    fetch(reportingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {
      // Silently ignore — error reporting must never cause errors.
    });
  }

  return report;
}

// ============================================================
// Diagnostic Report
// ============================================================

/**
 * Generate a diagnostic report containing ONLY technical metadata.
 * No business data (product names, prices, costs, spreadsheet
 * contents, business names, full backup contents) is included.
 */
export async function generateDiagnosticReport(): Promise<DiagnosticReport> {
  const browser = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const indexedDbAvailable = typeof indexedDB !== 'undefined';

  // Schema version
  let schemaVersion: number | null = null;
  let migrationStatus: string | null = null;
  let lastSavedTimestamp: string | null = null;

  // Table counts
  const tableCounts = {
    products: 0,
    pricingRules: 0,
    scenarios: 0,
    importBatches: 0,
    importIssues: 0,
    undoActions: 0,
    backups: 0,
  };

  if (indexedDbAvailable) {
    try {
      const { getDb, getMetadata, METADATA_KEY_STORAGE_VERSION, METADATA_KEY_MIGRATION_STATUS } = await import('./database');
      const db = getDb();

      tableCounts.products = await db.products.count();
      tableCounts.pricingRules = await db.pricingRules.count();
      tableCounts.scenarios = await db.scenarios.count();
      tableCounts.importBatches = await db.importBatches.count();
      tableCounts.importIssues = await db.importIssues.count();
      tableCounts.undoActions = await db.undoActions.count();
      tableCounts.backups = await db.backups.count();

      schemaVersion = await getMetadata<number>(METADATA_KEY_STORAGE_VERSION);
      migrationStatus = await getMetadata<string>(METADATA_KEY_MIGRATION_STATUS);
      lastSavedTimestamp = await getMetadata<string>('lastSaved');
    } catch {
      // If we can't read the DB, the counts stay at 0.
    }
  }

  // Error history
  loadErrorHistory();
  const reportErrorHistory: DiagnosticReport['errorHistory'] = errorHistory.map((entry) => ({
    timestamp: entry.timestamp,
    category: entry.category,
    operation: entry.operation,
  }));

  // Storage estimate
  let storageEstimate: DiagnosticReport['storageEstimate'] = null;
  if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      storageEstimate = {
        usage: estimate.usage,
        quota: estimate.quota,
      };
    } catch {
      // Ignore — not available in all browsers.
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    browser,
    userAgent: browser,
    indexedDbAvailable,
    schemaVersion,
    tableCounts,
    migrationStatus,
    lastSavedTimestamp,
    errorHistory: reportErrorHistory,
    storageEstimate,
  };
}

/**
 * Download a diagnostic report as a JSON file. The report contains
 * ONLY technical metadata — no business data.
 */
export async function downloadDiagnosticReport(): Promise<void> {
  const report = await generateDiagnosticReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pricepilot-diagnostic-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Clear the error history. Useful for testing or when the user
 * wants to reset the diagnostic data.
 */
export function clearErrorHistory(): void {
  errorHistory = [];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_ERROR_HISTORY);
    }
  } catch {
    // Ignore.
  }
}
