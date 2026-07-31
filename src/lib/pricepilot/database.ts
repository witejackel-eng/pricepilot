/**
 * PricePilot - IndexedDB Database (Dexie)
 *
 * Phase 9: Catalogue storage migrated from localStorage to IndexedDB.
 *
 * Tables:
 *   - products          — the main catalogue
 *   - businessSettings  — singleton record (key = 'current')
 *   - pricingRules      — pricing rule definitions
 *   - scenarios         — saved catalogue / simulator snapshots
 *   - importBatches     — metadata for each import (file name, timestamps)
 *   - importIssues      — per-row issues from each import
 *   - undoActions       — undo history entries
 *   - backups           — automatic backup snapshots (JSON blobs)
 *   - metadata          — singleton key/value pairs (storage version, migration state, etc.)
 *
 * localStorage is now used ONLY for:
 *   - Theme
 *   - Application mode
 *   - Sidebar state
 *   - Tour completion
 *   - Last opened page
 *
 * Transactions:
 *   - Imports: all-or-nothing. If any row fails to write, the entire
 *     import is rolled back.
 *   - Bulk product updates: atomic.
 *   - Applying approved prices: atomic.
 *   - Backup restoration: atomic.
 *   - Reset: atomic.
 *   - Migration: atomic (the localStorage -> IndexedDB migration is
 *     either fully committed or not at all).
 */

import Dexie, { Table } from 'dexie';
import {
  Product,
  BusinessSettings,
  PricingRule,
  Scenario,
  createDefaultBusinessSettings,
} from './types';
import { UndoAction, AutoBackup } from '@/store/pricepilot-store';
import { ImportRowResult } from './import-service';

// ============================================================
// Database Schema
// ============================================================

export interface ImportBatchRecord {
  id: string;
  fileName: string;
  sheetName?: string;
  startedAt: string;
  completedAt?: string;
  totalRows: number;
  validCount: number;
  needsReviewCount: number;
  duplicateCount: number;
  rejectedCount: number;
}

export interface ImportIssueRecord {
  id: string;
  batchId: string;
  rowNumber: number;
  status: ImportRowResult['status'];
  productName: string;
  sku: string;
  field?: string;
  problem: string;
  originalValue?: string;
  suggestedAction?: string;
}

export interface MetadataRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

// ============================================================
// Database Class
// ============================================================

export class PricePilotDatabase extends Dexie {
  products!: Table<Product, string>;
  businessSettings!: Table<BusinessSettings & { id: string }, string>;
  pricingRules!: Table<PricingRule, string>;
  scenarios!: Table<Scenario, string>;
  importBatches!: Table<ImportBatchRecord, string>;
  importIssues!: Table<ImportIssueRecord, string>;
  undoActions!: Table<UndoAction & { id: string }, string>;
  backups!: Table<AutoBackup, string>;
  metadata!: Table<MetadataRecord, string>;

  constructor() {
    super('pricepilot');
    this.version(1).stores({
      // Primary key + indexed fields. Dexie syntax: 'primaryKey, indexedField1, indexedField2, ...'
      products: 'id, sku, lifecycleStatus, calculatedPricingStatus, category, brand, salesChannel',
      businessSettings: 'id',
      pricingRules: 'id, level, isActive, priority, targetCategory, targetBrand, targetChannel',
      scenarios: 'id, scenarioType, createdAt',
      importBatches: 'id, startedAt, fileName',
      importIssues: 'id, batchId, rowNumber, status',
      undoActions: 'id, timestamp, type',
      backups: 'id, timestamp, trigger',
      metadata: 'key',
    });
  }
}

// ============================================================
// Singleton Accessor
// ============================================================

let dbInstance: PricePilotDatabase | null = null;

/**
 * Get the singleton database instance. Lazily constructed on first
 * call so that SSR / tests that never touch the DB don't pay the
 * IndexedDB open cost.
 */
export function getDb(): PricePilotDatabase {
  if (typeof indexedDB === 'undefined') {
    // In environments without IndexedDB (SSR, fake-indexeddb missing),
    // we still want a usable object so imports don't crash at module
    // load time. The actual operations will throw, which the caller
    // should catch.
    throw new Error('IndexedDB is not available in this environment.');
  }
  if (!dbInstance) {
    dbInstance = new PricePilotDatabase();
  }
  return dbInstance;
}

/**
 * For testing: inject a fake Dexie instance.
 */
export function setDbForTesting(db: PricePilotDatabase): void {
  dbInstance = db;
}

/**
 * For testing: reset the singleton.
 */
export function resetDbForTesting(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
}

// ============================================================
// Constants
// ============================================================

export const DATABASE_NAME = 'pricepilot';
export const DATABASE_VERSION = 1;
export const BUSINESS_SETTINGS_ID = 'current';
export const METADATA_KEY_STORAGE_VERSION = 'storageVersion';
export const METADATA_KEY_MIGRATION_STATUS = 'migrationStatus';

// ============================================================
// Atomic Operations
// ============================================================

/**
 * Atomically import a batch of products. Either ALL products are
 * written, or NONE are. Returns the count of products written on
 * success, throws on failure.
 */
export async function atomicImportProducts(
  products: Product[],
  batchMetadata?: ImportBatchRecord
): Promise<{ writtenCount: number; batchId?: string }> {
  const db = getDb();
  return db.transaction('rw', db.products, db.importBatches, db.importIssues, async () => {
    if (batchMetadata) {
      await db.importBatches.put(batchMetadata);
    }
    await db.products.bulkPut(products);
    return { writtenCount: products.length, batchId: batchMetadata?.id };
  });
}

/**
 * Atomically update a list of products (e.g. bulk price application,
 * bulk approval). Either all updates apply or none do.
 */
export async function atomicBulkUpdateProducts(
  products: Product[]
): Promise<number> {
  const db = getDb();
  return db.transaction('rw', db.products, async () => {
    await db.products.bulkPut(products);
    return products.length;
  });
}

/**
 * Atomically apply approved prices to a list of products. Either all
 * apply or none do.
 */
export async function atomicApplyApprovedPrices(
  products: Product[]
): Promise<number> {
  const db = getDb();
  return db.transaction('rw', db.products, async () => {
    await db.products.bulkPut(products);
    return products.length;
  });
}

/**
 * Atomically restore a backup. The backup contains the full state
 * (products, rules, settings, scenarios). Either everything is
 * restored or nothing is.
 */
export async function atomicRestoreBackup(payload: {
  products: Product[];
  businessSettings: BusinessSettings;
  pricingRules: PricingRule[];
  scenarios: Scenario[];
}): Promise<void> {
  const db = getDb();
  return db.transaction('rw', db.products, db.businessSettings, db.pricingRules, db.scenarios, async () => {
    await db.products.clear();
    await db.products.bulkPut(payload.products);
    await db.businessSettings.put({ ...payload.businessSettings, id: BUSINESS_SETTINGS_ID });
    await db.pricingRules.clear();
    await db.pricingRules.bulkPut(payload.pricingRules);
    await db.scenarios.clear();
    await db.scenarios.bulkPut(payload.scenarios);
  });
}

/**
 * Atomically reset the entire catalogue (used by the Reset Application
 * action). Either everything is cleared or nothing is.
 */
export async function atomicResetAll(): Promise<void> {
  const db = getDb();
  // Use the array form for >7 tables.
  return db.transaction('rw', [db.products, db.businessSettings, db.pricingRules, db.scenarios, db.importBatches, db.importIssues, db.undoActions, db.backups], async () => {
    await db.products.clear();
    await db.businessSettings.clear();
    await db.pricingRules.clear();
    await db.scenarios.clear();
    await db.importBatches.clear();
    await db.importIssues.clear();
    await db.undoActions.clear();
    await db.backups.clear();
    // Keep metadata table — it tracks migration state.
  });
}

// ============================================================
// CRUD Wrappers
// ============================================================

export async function loadAllProducts(): Promise<Product[]> {
  const db = getDb();
  return db.products.toArray();
}

export async function saveProductsToDb(products: Product[]): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.products, async () => {
    await db.products.clear();
    await db.products.bulkPut(products);
  });
}

export async function saveProductToDb(product: Product): Promise<void> {
  const db = getDb();
  await db.products.put(product);
}

export async function removeProductFromDb(productId: string): Promise<void> {
  const db = getDb();
  await db.products.delete(productId);
}

export async function loadBusinessSettingsFromDb(): Promise<BusinessSettings | null> {
  const db = getDb();
  const record = await db.businessSettings.get(BUSINESS_SETTINGS_ID);
  if (!record) return null;
  const { id: _id, ...settings } = record;
  return settings as BusinessSettings;
}

export async function saveBusinessSettingsToDb(settings: BusinessSettings): Promise<void> {
  const db = getDb();
  await db.businessSettings.put({ ...settings, id: BUSINESS_SETTINGS_ID });
}

export async function loadPricingRulesFromDb(): Promise<PricingRule[]> {
  const db = getDb();
  return db.pricingRules.toArray();
}

export async function savePricingRulesToDb(rules: PricingRule[]): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.pricingRules, async () => {
    await db.pricingRules.clear();
    await db.pricingRules.bulkPut(rules);
  });
}

export async function loadScenariosFromDb(): Promise<Scenario[]> {
  const db = getDb();
  return db.scenarios.toArray();
}

export async function saveScenariosToDb(scenarios: Scenario[]): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.scenarios, async () => {
    await db.scenarios.clear();
    await db.scenarios.bulkPut(scenarios);
  });
}

// ============================================================
// Undo History
// ============================================================

export async function loadUndoHistoryFromDb(): Promise<UndoAction[]> {
  const db = getDb();
  const records = await db.undoActions.toArray();
  // Sort by timestamp descending (most recent first).
  return records
    .map(({ id: _id, ...action }) => action as UndoAction)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function saveUndoHistoryToDb(history: UndoAction[]): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.undoActions, async () => {
    await db.undoActions.clear();
    if (history.length > 0) {
      const records = history.map((action, idx) => ({
        ...action,
        id: `undo-${action.timestamp}-${idx}`,
      }));
      await db.undoActions.bulkPut(records);
    }
  });
}

// ============================================================
// Backups
// ============================================================

export async function loadBackupsFromDb(): Promise<AutoBackup[]> {
  const db = getDb();
  const records = await db.backups.toArray();
  // Sort by timestamp descending.
  return records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function saveBackupsToDb(backups: AutoBackup[]): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.backups, async () => {
    await db.backups.clear();
    if (backups.length > 0) {
      await db.backups.bulkPut(backups);
    }
  });
}

export async function addBackupToDb(backup: AutoBackup): Promise<void> {
  const db = getDb();
  await db.backups.put(backup);
}

// ============================================================
// Metadata
// ============================================================

export async function getMetadata<T>(key: string): Promise<T | null> {
  const db = getDb();
  const record = await db.metadata.get(key);
  if (!record) return null;
  return record.value as T;
}

export async function setMetadata(key: string, value: unknown): Promise<void> {
  const db = getDb();
  await db.metadata.put({
    key,
    value,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Atomically clear the entire products table. Used by `clearAllProducts`
 * and `removeDemoSampleData`.
 */
export async function clearProductsInDb(): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.products, async () => {
    await db.products.clear();
  });
}

/**
 * Canonical export — reads the entire primary state from IndexedDB in
 * one read transaction so the resulting snapshot is internally
 * consistent. Used by backup/export paths.
 */
export async function exportAllDataFromDb(): Promise<{
  businessSettings: BusinessSettings;
  products: Product[];
  pricingRules: PricingRule[];
  scenarios: Scenario[];
}> {
  const db = getDb();
  return db.transaction('r', db.products, db.businessSettings, db.pricingRules, db.scenarios, async () => {
    const [products, settingsRecord, pricingRules, scenarios] = await Promise.all([
      db.products.toArray(),
      db.businessSettings.get(BUSINESS_SETTINGS_ID),
      db.pricingRules.toArray(),
      db.scenarios.toArray(),
    ]);
    const businessSettings = settingsRecord
      ? (() => {
          const { id: _id, ...rest } = settingsRecord;
          return rest as BusinessSettings;
        })()
      : null;
    return {
      businessSettings: businessSettings ?? createDefaultBusinessSettings(),
      products,
      pricingRules,
      scenarios,
    };
  });
}

// Local import to avoid circular dependency at module load.
// (Moved to top of file alongside other type imports.)
