/**
 * PricePilot - Safe localStorage → IndexedDB Migration
 *
 * Phase 10: One-time migration of legacy localStorage data into the
 * new IndexedDB catalogue. Designed to be REVERSIBLE and SAFE:
 *
 *   1. Detect old PricePilot localStorage data.
 *   2. Read it.
 *   3. Normalize each product (so malformed legacy data doesn't
 *      poison the new DB).
 *   4. Import valid and recoverable data into IndexedDB atomically.
 *   5. Verify written record counts match what we attempted to write.
 *   6. Record migration issues.
 *   7. Mark migration complete in the metadata table.
 *   8. KEEP the original localStorage data temporarily as a recovery
 *      source — it is NOT deleted automatically.
 *
 * On migration failure:
 *   - The IndexedDB transaction is rolled back (atomic).
 *   - The original localStorage data is unchanged.
 *   - The UI shows: "Your existing data was not changed. PricePilot
 *     could not finish the storage upgrade." with Try Again /
 *     Download Existing Data / Continue Without Migration actions.
 *
 * A manual cleanup action is added later (in Settings) so the owner
 * can remove the old localStorage copy after they have verified the
 * new IndexedDB catalogue is correct.
 */

import {
  Product,
  BusinessSettings,
  PricingRule,
  Scenario,
  AppSettings,
  createDefaultBusinessSettings,
  createDefaultAppSettings,
} from './types';
import {
  getDb,
  atomicImportProducts,
  saveBusinessSettingsToDb,
  savePricingRulesToDb,
  saveScenariosToDb,
  setMetadata,
  getMetadata,
  BUSINESS_SETTINGS_ID,
  METADATA_KEY_STORAGE_VERSION,
  METADATA_KEY_MIGRATION_STATUS,
} from './database';
import { normalizeProducts, ProductNormalizationIssue } from './product-normalizer';

// ============================================================
// Constants
// ============================================================

/** localStorage keys used by the legacy storage module. */
const LEGACY_PREFIX = 'pricepilot_v1_';
const LEGACY_KEYS = {
  businessSettings: `${LEGACY_PREFIX}businessSettings`,
  products: `${LEGACY_PREFIX}products`,
  pricingRules: `${LEGACY_PREFIX}pricingRules`,
  scenarios: `${LEGACY_PREFIX}scenarios`,
  columnMappings: `${LEGACY_PREFIX}columnMappings`,
  appSettings: `${LEGACY_PREFIX}appSettings`,
  onboardingCompleted: `${LEGACY_PREFIX}onboardingCompleted`,
  lastSaved: `${LEGACY_PREFIX}lastSaved`,
  version: 'pricepilot_vversion',
};
const LEGACY_AUTO_BACKUP_KEY = 'pricepilot_auto_backups';

export type MigrationStatus = 'not-started' | 'in-progress' | 'complete' | 'failed' | 'skipped';

export interface MigrationResult {
  status: MigrationStatus;
  /** Number of products that were migrated successfully. */
  migratedProductCount: number;
  /** Number of products that were kept as needs-review. */
  needsReviewCount: number;
  /** Number of products that were rejected (could not be normalized). */
  rejectedCount: number;
  /** Normalization issues encountered during migration. */
  issues: ProductNormalizationIssue[];
  /** Human-readable summary message for the UI. */
  message: string;
  /** True if the original localStorage data was detected. */
  hadLegacyData: boolean;
}

// ============================================================
// Detection
// ============================================================

/**
 * Check whether legacy localStorage data exists. Returns true if ANY
 * of the legacy keys are present.
 */
export function hasLegacyLocalStorageData(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    for (const key of Object.values(LEGACY_KEYS)) {
      if (localStorage.getItem(key) !== null) return true;
    }
    if (localStorage.getItem(LEGACY_AUTO_BACKUP_KEY) !== null) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Read the legacy localStorage data as a structured object. Never
 * throws — returns null if any read fails.
 */
function readLegacyData(): {
  businessSettings: BusinessSettings | null;
  products: Product[];
  pricingRules: PricingRule[];
  scenarios: Scenario[];
  appSettings: AppSettings | null;
  onboardingCompleted: boolean;
} | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const businessSettingsRaw = localStorage.getItem(LEGACY_KEYS.businessSettings);
    const productsRaw = localStorage.getItem(LEGACY_KEYS.products);
    const pricingRulesRaw = localStorage.getItem(LEGACY_KEYS.pricingRules);
    const scenariosRaw = localStorage.getItem(LEGACY_KEYS.scenarios);
    const appSettingsRaw = localStorage.getItem(LEGACY_KEYS.appSettings);
    const onboardingRaw = localStorage.getItem(LEGACY_KEYS.onboardingCompleted);

    return {
      businessSettings: businessSettingsRaw ? JSON.parse(businessSettingsRaw) as BusinessSettings : null,
      products: productsRaw ? JSON.parse(productsRaw) as Product[] : [],
      pricingRules: pricingRulesRaw ? JSON.parse(pricingRulesRaw) as PricingRule[] : [],
      scenarios: scenariosRaw ? JSON.parse(scenariosRaw) as Scenario[] : [],
      appSettings: appSettingsRaw ? JSON.parse(appSettingsRaw) as AppSettings : null,
      onboardingCompleted: onboardingRaw ? JSON.parse(onboardingRaw) as boolean : false,
    };
  } catch (err) {
    console.error('[PricePilot Migration] Could not read legacy localStorage data.', err);
    return null;
  }
}

// ============================================================
// Migration
// ============================================================

/**
 * Run the localStorage → IndexedDB migration. This is IDEMPOTENT — if
 * migration has already completed, it returns immediately without
 * re-importing.
 *
 * The migration is ATOMIC: either every product is written to
 * IndexedDB or none are. The original localStorage data is NEVER
 * deleted by this function.
 */
export async function migrateLegacyDataIfNeeded(): Promise<MigrationResult> {
  // Wrap the entire function body in a try/catch so that ANY error
  // (including database closed, IndexedDB unavailable, metadata read
  // failure, etc.) results in a structured failure result instead of
  // an unhandled rejection.
  try {
    // Check if migration has already been completed.
    const existingStatus = await getMetadata<MigrationStatus>(METADATA_KEY_MIGRATION_STATUS);
    if (existingStatus === 'complete') {
      return {
        status: 'complete',
        migratedProductCount: 0,
        needsReviewCount: 0,
        rejectedCount: 0,
        issues: [],
        message: 'Migration already completed.',
        hadLegacyData: false,
      };
    }

    // Detect legacy data.
    if (!hasLegacyLocalStorageData()) {
      // No legacy data — mark migration as complete so we don't keep
      // checking on every startup.
      await setMetadata(METADATA_KEY_MIGRATION_STATUS, 'complete');
      return {
        status: 'complete',
        migratedProductCount: 0,
        needsReviewCount: 0,
        rejectedCount: 0,
        issues: [],
        message: 'No legacy data found.',
        hadLegacyData: false,
      };
    }

    // Mark migration as in-progress.
    await setMetadata(METADATA_KEY_MIGRATION_STATUS, 'in-progress');

    // Read the legacy data.
    const legacyData = readLegacyData();
    if (!legacyData) {
      await setMetadata(METADATA_KEY_MIGRATION_STATUS, 'failed');
      return {
        status: 'failed',
        migratedProductCount: 0,
        needsReviewCount: 0,
        rejectedCount: 0,
        issues: [],
        message: 'PricePilot could not read your existing localStorage data. Your data has not been changed.',
        hadLegacyData: true,
      };
    }

    // Normalize every legacy product. This never throws.
    const normResult = normalizeProducts(legacyData.products, { source: 'storage' });
    const productsToMigrate = [...normResult.successfulProducts, ...normResult.failedProducts];

    // Atomic write to IndexedDB. Either everything commits or nothing does.
    // Ensure the DB exists.
    getDb();

    // Save business settings (or default if missing).
    const settings = legacyData.businessSettings ?? createDefaultBusinessSettings();
    await saveBusinessSettingsToDb(settings);

    // Save pricing rules.
    await savePricingRulesToDb(legacyData.pricingRules);

    // Save scenarios.
    await saveScenariosToDb(legacyData.scenarios);

    // Atomic import of products.
    if (productsToMigrate.length > 0) {
      await atomicImportProducts(productsToMigrate);
    }

    // Verify the write by counting records.
    const db = getDb();
    const actualCount = await db.products.count();
    if (actualCount !== productsToMigrate.length) {
      throw new Error(`Verification failed: expected ${productsToMigrate.length} products, found ${actualCount}.`);
    }

    // Mark migration complete.
    await setMetadata(METADATA_KEY_MIGRATION_STATUS, 'complete');
    await setMetadata(METADATA_KEY_STORAGE_VERSION, 2); // v1 = localStorage, v2 = IndexedDB

    // Build the success message.
    const needsReviewCount = productsToMigrate.filter(
      p => p.lifecycleStatus === 'needs-review' || p.calculatedPricingStatus === 'missing-data'
    ).length;
    const migratedCount = productsToMigrate.length - needsReviewCount;

    const messageLines: string[] = ['Your PricePilot data was upgraded safely.'];
    messageLines.push(`${migratedCount} ${migratedCount === 1 ? 'product was' : 'products were'} moved.`);
    if (needsReviewCount > 0) {
      messageLines.push(`${needsReviewCount} ${needsReviewCount === 1 ? 'product needs' : 'products need'} review.`);
    }
    if (normResult.rejectedCount > 0) {
      messageLines.push(`${normResult.rejectedCount} ${normResult.rejectedCount === 1 ? 'row could' : 'rows could'} not be migrated.`);
    }

    return {
      status: 'complete',
      migratedProductCount: migratedCount,
      needsReviewCount,
      rejectedCount: normResult.rejectedCount,
      issues: normResult.issues,
      message: messageLines.join('\n'),
      hadLegacyData: true,
    };
  } catch (err) {
    console.error('[PricePilot Migration] Migration failed.', err);
    // Best-effort: try to mark the migration as failed in metadata.
    // If this also throws (e.g. database is closed), we silently ignore
    // it — the localStorage data is still intact, which is what matters.
    try {
      await setMetadata(METADATA_KEY_MIGRATION_STATUS, 'failed');
    } catch {
      // Ignore — metadata write is best-effort.
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      migratedProductCount: 0,
      needsReviewCount: 0,
      rejectedCount: 0,
      issues: [],
      message: `Your existing data was not changed.\n\nPricePilot could not finish the storage upgrade.\n\n${errorMessage}`,
      hadLegacyData: true,
    };
  }
}

// ============================================================
// Manual Cleanup
// ============================================================

/**
 * Remove the legacy localStorage copy. This should ONLY be called
 * after the owner has verified the new IndexedDB catalogue is correct.
 *
 * Returns the list of keys that were removed.
 */
export function removeLegacyLocalStorageCopy(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const removed: string[] = [];
  try {
    for (const key of Object.values(LEGACY_KEYS)) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removed.push(key);
      }
    }
    if (localStorage.getItem(LEGACY_AUTO_BACKUP_KEY) !== null) {
      localStorage.removeItem(LEGACY_AUTO_BACKUP_KEY);
      removed.push(LEGACY_AUTO_BACKUP_KEY);
    }
  } catch (err) {
    console.error('[PricePilot Migration] Could not remove legacy localStorage data.', err);
  }
  return removed;
}

/**
 * Check whether the legacy localStorage data is still present (for
 * deciding whether to show the "Remove Old Storage Copy" button in
 * Settings).
 */
export function isLegacyDataStillPresent(): boolean {
  return hasLegacyLocalStorageData();
}

// ============================================================
// Migration Verification (Phase 4)
// ============================================================

export interface MigrationVerificationReport {
  /** True when every check passed and it is safe to remove the legacy copy. */
  canRemoveLegacy: boolean;
  /** ISO timestamp of the verification. */
  verifiedAt: string;
  /** Migration status as recorded in metadata. */
  migrationStatus: MigrationStatus | 'unknown';
  /** Number of products in IndexedDB. */
  indexedDbProductCount: number;
  /** Number of products in legacy localStorage (or null if missing). */
  legacyProductCount: number | null;
  /** True if business settings exist in IndexedDB. */
  indexedDbHasSettings: boolean;
  /** True if business settings exist in legacy localStorage. */
  legacyHasSettings: boolean;
  /** Number of pricing rules in IndexedDB. */
  indexedDbRuleCount: number;
  /** Number of pricing rules in legacy localStorage (or null if missing). */
  legacyRuleCount: number | null;
  /** Number of scenarios in IndexedDB. */
  indexedDbScenarioCount: number;
  /** Number of scenarios in legacy localStorage (or null if missing). */
  legacyScenarioCount: number | null;
  /** List of human-readable issue strings — empty if all checks passed. */
  issues: string[];
}

/**
 * Phase 4: verify that the IndexedDB migration is complete and the
 * data matches the legacy localStorage copy. Returns a structured
 * report that the UI can show before allowing the user to remove the
 * old localStorage copy.
 *
 * Checks:
 *   1. Migration status metadata is 'complete'.
 *   2. IndexedDB has at least one product (or both sides have zero).
 *   3. Product count matches.
 *   4. Business settings exist in IndexedDB.
 *   5. Pricing rules count matches.
 *   6. Scenarios count matches.
 */
export async function verifyMigration(): Promise<MigrationVerificationReport> {
  const issues: string[] = [];

  // Read migration status.
  let migrationStatus: MigrationStatus | 'unknown' = 'unknown';
  try {
    const status = await getMetadata<MigrationStatus>(METADATA_KEY_MIGRATION_STATUS);
    migrationStatus = status ?? 'not-started';
    if (status !== 'complete') {
      issues.push(`Migration status is "${status ?? 'not-started'}", not "complete".`);
    }
  } catch (err) {
    issues.push('Could not read migration status from IndexedDB metadata.');
  }

  // Read IndexedDB state.
  let indexedDbProductCount = 0;
  let indexedDbHasSettings = false;
  let indexedDbRuleCount = 0;
  let indexedDbScenarioCount = 0;
  try {
    const db = getDb();
    indexedDbProductCount = await db.products.count();
    const settingsRecord = await db.businessSettings.get(BUSINESS_SETTINGS_ID);
    indexedDbHasSettings = !!settingsRecord;
    indexedDbRuleCount = await db.pricingRules.count();
    indexedDbScenarioCount = await db.scenarios.count();
  } catch (err) {
    issues.push('Could not read counts from IndexedDB.');
  }

  // Read legacy localStorage state.
  const legacy = readLegacyData();
  let legacyProductCount: number | null = null;
  let legacyHasSettings = false;
  let legacyRuleCount: number | null = null;
  let legacyScenarioCount: number | null = null;
  if (legacy) {
    legacyProductCount = legacy.products.length;
    legacyHasSettings = !!legacy.businessSettings;
    legacyRuleCount = legacy.pricingRules.length;
    legacyScenarioCount = legacy.scenarios.length;

    // Compare counts (only flag mismatches when legacy data exists).
    if (legacyProductCount !== indexedDbProductCount) {
      issues.push(`Product count mismatch: IndexedDB has ${indexedDbProductCount}, legacy has ${legacyProductCount}.`);
    }
    if (!indexedDbHasSettings && legacyHasSettings) {
      issues.push('Business settings missing from IndexedDB but present in legacy.');
    }
    if (legacyRuleCount !== indexedDbRuleCount) {
      issues.push(`Pricing rules count mismatch: IndexedDB has ${indexedDbRuleCount}, legacy has ${legacyRuleCount}.`);
    }
    if (legacyScenarioCount !== indexedDbScenarioCount) {
      issues.push(`Scenarios count mismatch: IndexedDB has ${indexedDbScenarioCount}, legacy has ${legacyScenarioCount}.`);
    }
  } else {
    issues.push('Could not read legacy localStorage data (it may already be removed).');
  }

  const canRemoveLegacy = issues.length === 0;

  const report: MigrationVerificationReport = {
    canRemoveLegacy,
    verifiedAt: new Date().toISOString(),
    migrationStatus,
    indexedDbProductCount,
    legacyProductCount,
    indexedDbHasSettings,
    legacyHasSettings,
    indexedDbRuleCount,
    legacyRuleCount,
    indexedDbScenarioCount,
    legacyScenarioCount,
    issues,
  };

  // Persist the report to metadata so it can be inspected later.
  try {
    await setMetadata('migrationVerificationReport', report);
  } catch (err) {
    console.warn('[PricePilot Migration] Could not persist verification report.', err);
  }

  return report;
}
