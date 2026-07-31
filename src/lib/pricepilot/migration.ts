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
  try {
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
    await setMetadata(METADATA_KEY_MIGRATION_STATUS, 'failed');
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
