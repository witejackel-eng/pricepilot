/**
 * PricePilot - Backup Service
 *
 * Phase 5 (production-readiness): canonical backup format.
 *
 * Backups are built from the LIVE IndexedDB state inside a single
 * read transaction so the resulting snapshot is internally
 * consistent. Products are normalized and validated before being
 * included. A deterministic content hash is computed so two backups
 * of the same state produce the same hash (useful for diffing).
 *
 * The legacy `exportAllData()` from `legacy-storage.ts` is no longer
 * used for backup creation — it remains only for one-time migration
 * detection.
 */

import { Product, BusinessSettings, PricingRule, Scenario, createDefaultBusinessSettings } from './types';
import {
  exportAllDataFromDb,
  getMetadata,
  BUSINESS_SETTINGS_ID,
  METADATA_KEY_STORAGE_VERSION,
  METADATA_KEY_MIGRATION_STATUS,
  getDb,
} from './database';
import { isFiniteNumber } from './formatting';
import { normalizeProduct } from './product-normalizer';
import { z } from 'zod';

// ============================================================
// Types
// ============================================================

export const BACKUP_FORMAT = 'pricepilot-backup' as const;
export const BACKUP_VERSION = 1 as const;
export const SCHEMA_VERSION = 1 as const;
export const APP_VERSION = '0.2.1' as const;

export interface PricePilotBackup {
  format: typeof BACKUP_FORMAT;
  backupVersion: typeof BACKUP_VERSION;
  schemaVersion: typeof SCHEMA_VERSION;
  appVersion: string;
  createdAt: string;
  businessSettings: BusinessSettings;
  products: Product[];
  pricingRules: PricingRule[];
  scenarios: Scenario[];
  /** Optional SHA-256 content hash for diffing two backups. */
  contentHash?: string;
}

export interface BackupBuildResult {
  backup: PricePilotBackup;
  /** Number of products that were normalized successfully. */
  normalizedCount: number;
  /** Number of products that had issues but were still included. */
  needsReviewCount: number;
  /** Number of products that were rejected (could not be normalized). */
  rejectedCount: number;
  /** Issue strings, useful for showing the user a summary. */
  issues: string[];
}

// ============================================================
// Validation Helpers
// ============================================================

/**
 * Check that a product has all the required top-level fields and that
 * every numeric field is finite (no NaN, Infinity, undefined).
 */
function validateProductFiniteNumbers(product: Product): string[] {
  const issues: string[] = [];
  const numericFields: (keyof Product)[] = [
    'purchaseCost',
    'shippingCost',
    'packagingCost',
    'handlingCost',
    'otherCosts',
    'currentSellingPrice',
    'finalApprovedPrice',
    'taxRatePercent',
    'marketplaceFeePercent',
    'marketplaceFeeFixed',
    'paymentFeePercent',
    'paymentFeeFixed',
    'returnRatePercent',
    'damageRatePercent',
    'purchaseTaxRatePercent',
  ];
  for (const field of numericFields) {
    const value = product[field];
    if (value !== undefined && value !== null && !isFiniteNumber(value)) {
      issues.push(`Product ${product.id || '(no id)'}: ${String(field)} is not finite (${String(value)}).`);
    }
  }
  // Nested recommendedPrices
  if (product.recommendedPrices) {
    const rp = product.recommendedPrices;
    const rpFields: (keyof typeof rp)[] = ['breakEven', 'minimum', 'competitive', 'balanced', 'premium'];
    for (const field of rpFields) {
      if (rp[field] !== undefined && !isFiniteNumber(rp[field])) {
        issues.push(`Product ${product.id}: recommendedPrices.${String(field)} is not finite.`);
      }
    }
  }
  // Identity requirement
  if (!product.name?.trim() && !product.sku?.trim()) {
    issues.push(`Product ${product.id}: missing both name and SKU.`);
  }
  return issues;
}

// ============================================================
// Content Hash (deterministic SHA-256)
// ============================================================

/**
 * Compute a deterministic SHA-256 hash of the backup content.
 *
 * The hash is computed over a canonical JSON serialization (sorted
 * keys, no whitespace) so that two backups of the same state produce
 * the same hash. This is NOT a security feature — it's a diffing
 * convenience.
 *
 * Falls back to a simple string-hash if SubtleCrypto is unavailable
 * (older browsers, non-secure contexts).
 */
export async function computeBackupContentHash(backup: PricePilotBackup): Promise<string> {
  // Strip the hash itself + timestamp + appVersion from the hashed
  // content so two backups of the same state produce the same hash.
  const { contentHash: _ch, createdAt: _ca, appVersion: _av, ...rest } = backup;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(canonical);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fall through to the simple hash below.
  }
  // FNV-1a 32-bit (deterministic, fast, good enough for diffing)
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `fnv1a-${h.toString(16)}`;
}

// ============================================================
// Build Backup
// ============================================================

/**
 * Build a canonical backup from the live IndexedDB state.
 *
 * Reads products, business settings, pricing rules, and scenarios
 * inside a single read transaction. Normalizes every product. Rejects
 * products that cannot be normalized (no name AND no sku). Validates
 * finite numbers. Computes a content hash.
 *
 * Never calls legacy `exportAllData()`.
 */
export async function buildBackup(): Promise<BackupBuildResult> {
  // Read canonical state from IndexedDB inside a single transaction.
  const state = await exportAllDataFromDb();

  const issues: string[] = [];
  let normalizedCount = 0;
  let needsReviewCount = 0;
  let rejectedCount = 0;

  // Normalize every product.
  const validProducts: Product[] = [];
  for (const raw of state.products) {
    const normResult = normalizeProduct(raw, { source: 'backup' });
    if (normResult.success) {
      validProducts.push(normResult.product);
      normalizedCount++;
      if (normResult.product.lifecycleStatus === 'needs-review' ||
          normResult.product.calculatedPricingStatus === 'missing-data') {
        needsReviewCount++;
      }
      // Validate finite numbers post-normalization.
      const finiteIssues = validateProductFiniteNumbers(normResult.product);
      issues.push(...finiteIssues);
    } else {
      rejectedCount++;
      issues.push(`Rejected product ${raw.id || '(no id)'}: ${normResult.issues.map(i => i.message).join('; ')}`);
    }
  }

  // Validate settings have required fields (use defaults if missing).
  const businessSettings: BusinessSettings = {
    ...createDefaultBusinessSettings(),
    ...state.businessSettings,
  };

  // Build the backup object.
  const backup: PricePilotBackup = {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    businessSettings,
    products: validProducts,
    pricingRules: state.pricingRules,
    scenarios: state.scenarios,
  };

  // Compute content hash.
  try {
    backup.contentHash = await computeBackupContentHash(backup);
  } catch (err) {
    issues.push(`Could not compute content hash: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    backup,
    normalizedCount,
    needsReviewCount,
    rejectedCount,
    issues,
  };
}

// ============================================================
// Serialize / Parse
// ============================================================

/** Serialize a backup to a pretty-printed JSON string. */
export function serializeBackup(backup: PricePilotBackup): string {
  return JSON.stringify(backup, null, 2);
}

// ============================================================
// Recovery Download (canonical "Download Existing Data")
// ============================================================

export interface RecoveryDownloadPayload {
  format: 'pricepilot-recovery';
  exportedAt: string;
  appVersion: string;
  /** Canonical IndexedDB state. */
  indexedDb: {
    businessSettings: BusinessSettings;
    products: Product[];
    pricingRules: PricingRule[];
    scenarios: Scenario[];
  };
  /** Migration metadata. */
  migration: {
    storageVersion: number | null;
    migrationStatus: string | null;
    verificationReport: unknown | null;
  };
  /** Raw legacy localStorage entries (when still present). */
  legacyLocalStorage: Record<string, string> | null;
}

/**
 * Build the "Download Existing Data" payload — a recovery download
 * that includes BOTH the canonical IndexedDB state AND any leftover
 * legacy localStorage entries. Used by the initialization failure
 * screen and the Settings → Download Existing Data action.
 */
export async function buildRecoveryDownload(): Promise<RecoveryDownloadPayload> {
  const indexedDb = await exportAllDataFromDb();

  let storageVersion: number | null = null;
  let migrationStatus: string | null = null;
  let verificationReport: unknown | null = null;
  try {
    storageVersion = await getMetadata<number>(METADATA_KEY_STORAGE_VERSION);
    migrationStatus = await getMetadata<string>(METADATA_KEY_MIGRATION_STATUS);
    verificationReport = await getMetadata<unknown>('migrationVerificationReport');
  } catch {
    // metadata reads are best-effort
  }

  // Capture legacy localStorage entries (raw strings) if any are present.
  let legacyLocalStorage: Record<string, string> | null = null;
  if (typeof localStorage !== 'undefined') {
    const legacy: Record<string, string> = {};
    const prefix = 'pricepilot_v1_';
    const autoKey = 'pricepilot_auto_backups';
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(prefix) || key === autoKey || key === 'pricepilot_vversion') {
          const value = localStorage.getItem(key);
          if (value !== null) legacy[key] = value;
        }
      }
      if (Object.keys(legacy).length > 0) {
        legacyLocalStorage = legacy;
      }
    } catch {
      // ignore
    }
  }

  return {
    format: 'pricepilot-recovery',
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    indexedDb,
    migration: {
      storageVersion,
      migrationStatus,
      verificationReport,
    },
    legacyLocalStorage,
  };
}

/**
 * Trigger a browser download of the recovery payload as JSON.
 * Returns the filename used.
 */
export async function downloadRecoveryPayload(): Promise<string> {
  const payload = await buildRecoveryDownload();
  const filename = `pricepilot-recovery-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * Trigger a browser download of a canonical backup as JSON.
 * Returns the filename used.
 */
export async function downloadBackupFile(): Promise<string> {
  const { backup } = await buildBackup();
  const filename = `pricepilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

// ============================================================
// Backup Validation & Restore Pipeline (Phase 6)
// ============================================================

/**
 * Zod schema for the PricePilotBackup format. We use a permissive
 * schema for nested records because `product-normalizer.ts` already
 * validates products rigorously — we don't want to reject a backup
 * just because one product has a missing optional field that the
 * normalizer can repair.
 */
const backupSchema = z.object({
  format: z.literal('pricepilot-backup'),
  backupVersion: z.number().int().min(1).max(10),
  schemaVersion: z.number().int().min(1).max(10),
  appVersion: z.string().optional(),
  createdAt: z.string().optional(),
  businessSettings: z.record(z.string(), z.unknown()),
  products: z.array(z.record(z.string(), z.unknown())),
  pricingRules: z.array(z.record(z.string(), z.unknown())),
  scenarios: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  contentHash: z.string().optional(),
});

export type BackupValidationResult =
  | {
      valid: true;
      backup: PricePilotBackup;
      /** Number of products that will need review after restore. */
      needsReviewCount: number;
      /** Number of products that were rejected during normalization. */
      rejectedCount: number;
      /** Issue strings (warnings, not blockers). */
      issues: string[];
    }
  | {
      valid: false;
      code: 'invalid-json' | 'unknown-format' | 'missing-identity' | 'invalid-products' | 'invalid-settings' | 'unsupported-version';
      message: string;
      issues: string[];
    };

/**
 * Validate and normalize a raw backup object (typically the result of
 * `JSON.parse(uploadedFile)`).
 *
 * Pipeline:
 *   1. Zod schema check (format, version, required top-level fields).
 *   2. Reject unsupported future backup versions.
 *   3. Run every product through `normalizeProduct` — repairs missing
 *      fields, rejects products with no name AND no sku.
 *   4. Validate business settings has the minimum required fields.
 *
 * Never writes to IndexedDB. The caller is responsible for the
 * atomic restore transaction.
 */
export function validateBackup(raw: unknown): BackupValidationResult {
  const issues: string[] = [];

  // Step 1: Zod schema check.
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const zodIssues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    // Distinguish "not a PricePilot backup at all" from "shape is wrong".
    const formatError = parsed.error.issues.find(i => i.path.length === 1 && i.path[0] === 'format');
    if (formatError) {
      return {
        valid: false,
        code: 'unknown-format',
        message: 'This file is not a PricePilot backup. Missing or incorrect "format" field.',
        issues: zodIssues,
      };
    }
    // Check for missing identity (products / businessSettings).
    if (zodIssues.some(i => i.includes('businessSettings'))) {
      return {
        valid: false,
        code: 'missing-identity',
        message: 'Backup is missing business settings.',
        issues: zodIssues,
      };
    }
    if (zodIssues.some(i => i.includes('products'))) {
      return {
        valid: false,
        code: 'invalid-products',
        message: 'Backup products field is invalid.',
        issues: zodIssues,
      };
    }
    return {
      valid: false,
      code: 'unknown-format',
      message: 'Backup failed schema validation.',
      issues: zodIssues,
    };
  }

  const data = parsed.data;

  // Step 2: Reject unsupported future versions.
  if (data.backupVersion > BACKUP_VERSION) {
    return {
      valid: false,
      code: 'unsupported-version',
      message: `Backup version ${data.backupVersion} is newer than this app supports (${BACKUP_VERSION}). Please update PricePilot and try again.`,
      issues: [],
    };
  }

  // Step 3: Normalize every product.
  const validProducts: Product[] = [];
  let needsReviewCount = 0;
  let rejectedCount = 0;
  for (const rawProduct of data.products) {
    const normResult = normalizeProduct(rawProduct, { source: 'backup' });
    if (normResult.success) {
      validProducts.push(normResult.product);
      if (normResult.product.lifecycleStatus === 'needs-review' ||
          normResult.product.calculatedPricingStatus === 'missing-data') {
        needsReviewCount++;
      }
    } else {
      rejectedCount++;
      issues.push(`Rejected product: ${normResult.issues.map(i => i.message).join('; ')}`);
    }
  }

  // Step 4: Validate settings (use defaults for missing fields).
  const businessSettings: BusinessSettings = {
    ...createDefaultBusinessSettings(),
    ...(data.businessSettings as Partial<BusinessSettings>),
  };

  const backup: PricePilotBackup = {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: data.appVersion ?? APP_VERSION,
    createdAt: data.createdAt ?? new Date().toISOString(),
    businessSettings,
    products: validProducts,
    pricingRules: (data.pricingRules as unknown as PricingRule[]) ?? [],
    scenarios: (data.scenarios as unknown as Scenario[]) ?? [],
    contentHash: data.contentHash,
  };

  return {
    valid: true,
    backup,
    needsReviewCount,
    rejectedCount,
    issues,
  };
}

/**
 * Convenience: parse a JSON string and validate it as a backup.
 */
export function parseAndValidateBackup(jsonString: string): BackupValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      valid: false,
      code: 'invalid-json',
      message: 'This file is not valid JSON.',
      issues: [err instanceof Error ? err.message : String(err)],
    };
  }
  return validateBackup(parsed);
}

// ============================================================
// Restore Preview (Phase 6)
// ============================================================

export interface RestorePreview {
  valid: boolean;
  /** ISO date string of the backup (or 'unknown'). */
  createdAt: string;
  /** Counts shown in the preview UI. */
  productCount: number;
  pricingRuleCount: number;
  scenarioCount: number;
  /** Products that will need review after restore. */
  needsReviewCount: number;
  /** Products that will be rejected during restore. */
  rejectedCount: number;
  /** Issue strings (warnings). */
  issues: string[];
  /** The validated backup (only present when valid). */
  backup?: PricePilotBackup;
}

/**
 * Build a restore preview from a JSON string. The UI shows this
 * before committing the restore.
 */
export function buildRestorePreview(jsonString: string): RestorePreview {
  const result = parseAndValidateBackup(jsonString);
  if (!result.valid) {
    return {
      valid: false,
      createdAt: 'unknown',
      productCount: 0,
      pricingRuleCount: 0,
      scenarioCount: 0,
      needsReviewCount: 0,
      rejectedCount: 0,
      issues: result.issues,
    };
  }
  return {
    valid: true,
    createdAt: result.backup.createdAt ?? 'unknown',
    productCount: result.backup.products.length,
    pricingRuleCount: result.backup.pricingRules.length,
    scenarioCount: result.backup.scenarios.length,
    needsReviewCount: result.needsReviewCount,
    rejectedCount: result.rejectedCount,
    issues: result.issues,
    backup: result.backup,
  };
}
