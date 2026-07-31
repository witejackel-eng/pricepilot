/**
 * Integration tests for the import + persistence pipeline.
 *
 * These tests use fake-indexeddb (registered globally in vitest.setup.ts)
 * so they exercise the real Dexie code paths against an in-memory
 * IndexedDB implementation.
 *
 * Covers:
 *   1. Clean import — 100 valid products → 100 stored, 0 rejected, reload returns 100.
 *   2. Mixed import — 95 valid + missing-cost + currency string + invalid percentage
 *      + duplicate SKU + empty row → no crash, statuses correct.
 *   3. Failed transaction — forced IndexedDB write failure → existing catalogue
 *      unchanged, no partial import, clear error returned.
 *   4. Legacy migration — old localStorage products missing nested fields →
 *      migrate, products remain available, invalid product becomes needs-review,
 *      no blank screen.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  processImportRows,
  ImportRowResult,
} from '../import-service';
import {
  PricePilotDatabase,
  getDb,
  setDbForTesting,
  resetDbForTesting,
  loadAllProducts,
  atomicImportProducts,
  saveBusinessSettingsToDb,
  savePricingRulesToDb,
} from '../database';
import {
  migrateLegacyDataIfNeeded,
  hasLegacyLocalStorageData,
} from '../migration';
import { createDefaultBusinessSettings, createDefaultPricingRule, Product, BusinessSettings, PricingRule } from '../types';
import { safelyRecalculateProducts } from '../safe-calculation';

function makeSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return { ...createDefaultBusinessSettings(), ...overrides };
}

function makeRules(): PricingRule[] {
  return [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true }];
}

function makeValidRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sku: 'SKU-001',
    name: 'Test Product',
    purchaseCost: 100,
    currentSellingPrice: 150,
    taxRatePercent: 18,
    taxTreatment: 'inclusive',
    marketplaceFeePercent: 5,
    paymentFeePercent: 2,
    ...overrides,
  };
}

// ============================================================
// 1. Clean import
// ============================================================

describe('Integration: Clean import of 100 valid products', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('imports 100 valid products and persists them to IndexedDB', async () => {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      rows.push(makeValidRow({
        sku: `SKU-${String(i).padStart(3, '0')}`,
        name: `Product ${i + 1}`,
      }));
    }

    const settings = makeSettings();
    const rules = makeRules();
    const result = processImportRows(rows, settings, rules);

    expect(result.summary.readyToImport).toBe(100);
    expect(result.summary.needsReview).toBe(0);
    expect(result.summary.rejected).toBe(0);
    expect(result.validProducts).toHaveLength(100);

    // Persist to IndexedDB atomically.
    await atomicImportProducts(result.validProducts);

    // Reload — should return all 100.
    const reloaded = await loadAllProducts();
    expect(reloaded).toHaveLength(100);
  });
});

// ============================================================
// 2. Mixed import
// ============================================================

describe('Integration: Mixed import with various edge cases', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('handles 95 valid + missing-cost + currency string + invalid percentage + duplicate + empty row', () => {
    const rows: Record<string, unknown>[] = [];

    // 95 valid rows
    for (let i = 0; i < 95; i++) {
      rows.push(makeValidRow({
        sku: `SKU-${String(i).padStart(3, '0')}`,
        name: `Product ${i + 1}`,
      }));
    }

    // Missing purchase cost
    rows.push(makeValidRow({
      sku: 'SKU-MISSING-COST',
      name: 'Missing Cost Product',
      purchaseCost: '',
    }));

    // Currency string cost
    rows.push(makeValidRow({
      sku: 'SKU-CURRENCY',
      name: 'Currency String Product',
      purchaseCost: '₹1,250',
    }));

    // Invalid percentage (fee above 100%)
    rows.push(makeValidRow({
      sku: 'SKU-BAD-FEE',
      name: 'Bad Fee Product',
      marketplaceFeePercent: 150,
    }));

    // Duplicate of an existing SKU
    rows.push(makeValidRow({
      sku: 'SKU-000',
      name: 'Duplicate Product',
    }));

    // Empty row
    rows.push({});

    const settings = makeSettings();
    const rules = makeRules();
    const existingSkus = new Set(['sku-000']); // case-insensitive

    const result = processImportRows(rows, settings, rules, { existingSkus });

    // No crash.
    expect(result).toBeDefined();
    expect(result.totalCount).toBe(rows.length);

    // Valid rows imported.
    expect(result.summary.readyToImport).toBeGreaterThan(90);

    // Missing-cost product becomes needs-review.
    const missingCostResult = result.results.find(r => r.product?.sku === 'SKU-MISSING-COST');
    expect(missingCostResult?.status).toBe('needs-review');

    // Currency string parses.
    const currencyResult = result.results.find(r => r.product?.sku === 'SKU-CURRENCY');
    expect(currencyResult?.product?.purchaseCost).toBe(1250);

    // Invalid percentage is reported.
    const badFeeResult = result.results.find(r => r.product?.sku === 'SKU-BAD-FEE');
    expect(badFeeResult?.issues.some(i => i.code === 'fee-above-100')).toBe(true);

    // Duplicate requires reconciliation.
    expect(result.summary.duplicates).toBeGreaterThanOrEqual(1);

    // Empty row rejected (or skipped silently — counts as 0).
    const emptyResult = result.results.find(r => Object.keys(r.originalRow).length === 0);
    // Empty rows are skipped (not added to results at all).
    expect(emptyResult).toBeUndefined();
  });
});

// ============================================================
// 3. Failed transaction
// ============================================================

describe('Integration: Failed transaction does not partially update catalogue', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('rolls back when IndexedDB write fails', async () => {
    const settings = makeSettings();
    const rules = makeRules();

    // Pre-populate the catalogue with 5 products.
    const existingRows: Record<string, unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      existingRows.push(makeValidRow({
        sku: `EXISTING-${i}`,
        name: `Existing ${i}`,
      }));
    }
    const existingResult = processImportRows(existingRows, settings, rules);
    await atomicImportProducts(existingResult.validProducts);

    const beforeCount = await loadAllProducts();
    expect(beforeCount).toHaveLength(5);

    // Now simulate a write failure by closing the database mid-transaction.
    // We close the db so subsequent writes throw.
    db.close();

    // Attempt an import that should fail.
    const newRows: Record<string, unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      newRows.push(makeValidRow({
        sku: `NEW-${i}`,
        name: `New ${i}`,
      }));
    }
    const newResult = processImportRows(newRows, settings, rules);

    // Attempt to persist — should throw because db is closed.
    await expect(atomicImportProducts(newResult.validProducts)).rejects.toThrow();

    // Reopen the database and verify the existing 5 products are still there.
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
    const afterCount = await loadAllProducts();
    // The 5 existing products must still be there — no partial import.
    expect(afterCount).toHaveLength(5);
    // None of the NEW products should be present.
    expect(afterCount.find(p => p.sku.startsWith('NEW-'))).toBeUndefined();
  });
});

// ============================================================
// 4. Legacy migration
// ============================================================

describe('Integration: Legacy localStorage migration', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
    // Clear localStorage between tests.
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('migrates old localStorage products into IndexedDB safely', async () => {
    // Simulate old localStorage data with legacy products.
    const legacyProducts = [
      // Valid product
      {
        id: 'old-1',
        sku: 'OLD-1',
        name: 'Old Product 1',
        purchaseCost: 100,
        currentSellingPrice: 150,
        taxRatePercent: 18,
        taxTreatment: 'inclusive' as const,
        // Missing many nested fields — must be normalized.
      },
      // Invalid product (missing purchase cost)
      {
        id: 'old-2',
        sku: 'OLD-2',
        name: 'Old Product 2',
        purchaseCost: 0,
        currentSellingPrice: 100,
      },
      // Product missing identity
      {
        id: 'old-3',
        // no name, no sku
        purchaseCost: 50,
        currentSellingPrice: 75,
      },
    ];

    localStorage.setItem('pricepilot_v1_products', JSON.stringify(legacyProducts));
    localStorage.setItem('pricepilot_v1_businessSettings', JSON.stringify(makeSettings()));
    localStorage.setItem('pricepilot_v1_pricingRules', JSON.stringify(makeRules()));

    expect(hasLegacyLocalStorageData()).toBe(true);

    // Run the migration.
    const migrationResult = await migrateLegacyDataIfNeeded();
    expect(migrationResult.status).toBe('complete');
    expect(migrationResult.hadLegacyData).toBe(true);

    // Load from IndexedDB.
    const products = await loadAllProducts();
    // Two valid products should be present (old-1 and old-2).
    // old-3 was hard-rejected (no name AND no sku).
    expect(products.length).toBeGreaterThanOrEqual(2);

    // old-1 is valid.
    const p1 = products.find(p => p.id === 'old-1');
    expect(p1).toBeDefined();
    expect(p1?.sku).toBe('OLD-1');
    expect(p1?.purchaseCost).toBe(100);
    // Must have safe nested fields even though legacy data didn't.
    expect(p1?.competitorPrices).toEqual([]);
    expect(p1?.tags).toEqual([]);
    expect(p1?.notes).toBe('');
    expect(p1?.recommendedPrices).toBeDefined();

    // old-2 is kept as needs-review.
    const p2 = products.find(p => p.id === 'old-2');
    expect(p2).toBeDefined();
    expect(p2?.lifecycleStatus).toBe('needs-review');
    expect(p2?.calculatedPricingStatus).toBe('missing-data');

    // old-3 was hard-rejected — should NOT be in the catalogue.
    const p3 = products.find(p => p.id === 'old-3');
    expect(p3).toBeUndefined();
  });

  it('does not delete localStorage data on migration failure', async () => {
    // Set up legacy data.
    localStorage.setItem('pricepilot_v1_products', JSON.stringify([
      { id: 'old-1', sku: 'OLD-1', name: 'Old 1', purchaseCost: 100, currentSellingPrice: 150 },
    ]));

    // Close the database so the migration fails.
    db.close();

    const migrationResult = await migrateLegacyDataIfNeeded();
    expect(migrationResult.status).toBe('failed');

    // localStorage data must still be there.
    expect(localStorage.getItem('pricepilot_v1_products')).not.toBeNull();
  });
});
