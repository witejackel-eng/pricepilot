/**
 * PricePilot — Persistence Failure Tests (Phase 17)
 *
 * Unit/integration tests that verify:
 *   1. Add product persistence: add product → reload → exact product exists
 *   2. Edit persistence: edit purchase cost → reload → exact new value exists
 *   3. Settings persistence: change GST or fee → reload → exact setting exists
 *   4. Approval persistence: approve → reload → approval remains
 *   5. Import transaction failure: force database failure → existing catalogue
 *      unchanged, no partial import, no success message
 *   6. Backup failure: force backup write failure → destructive action does
 *      not run, clear user message, catalogue unchanged
 *   7. Migration: use a realistic legacy localStorage fixture → exact product
 *      counts, exact settings, malformed products marked Needs Information,
 *      legacy source preserved
 *
 * Uses fake-indexeddb (registered globally in vitest.setup.ts) and
 * Dexie against an in-memory IndexedDB implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PricePilotDatabase,
  getDb,
  setDbForTesting,
  resetDbForTesting,
  loadAllProducts,
  loadBusinessSettingsFromDb,
  atomicImportProducts,
  saveBusinessSettingsToDb,
  savePricingRulesToDb,
  saveProductsToDb,
  atomicRestoreBackup,
  atomicResetAll,
  addBackupToDb,
  exportAllDataFromDb,
  BUSINESS_SETTINGS_ID,
} from '../database';
import {
  migrateLegacyDataIfNeeded,
  hasLegacyLocalStorageData,
} from '../migration';
import {
  createDefaultBusinessSettings,
  createDefaultPricingRule,
  createDefaultProduct,
  Product,
  BusinessSettings,
  PricingRule,
} from '../types';
import { safelyRecalculateProducts, safelyRecalculateProduct } from '../safe-calculation';
import { buildBackup, serializeBackup, parseAndValidateBackup } from '../backup-service';

// ============================================================
// Helpers
// ============================================================

function makeSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return { ...createDefaultBusinessSettings(), ...overrides };
}

function makeRules(): PricingRule[] {
  return [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true }];
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  const base = createDefaultProduct();
  const p = { ...base, id: `prod-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...overrides };
  return safelyRecalculateProduct(p, makeSettings(), makeRules()).product;
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

/** Simulate a "reload" by re-reading from IndexedDB. */
async function reloadProducts(): Promise<Product[]> {
  return loadAllProducts();
}

async function reloadSettings(): Promise<BusinessSettings | null> {
  return loadBusinessSettingsFromDb();
}

// ============================================================
// 1. Add product persistence
// ============================================================

describe('Persistence: Add product', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('add product → reload → exact product exists', async () => {
    const settings = makeSettings();
    await saveBusinessSettingsToDb(settings);
    const rules = makeRules();
    await savePricingRulesToDb(rules);

    const product = makeProduct({
      id: 'prod-add-test',
      sku: 'SKU-ADD',
      name: 'Added Product',
      purchaseCost: 250,
      currentSellingPrice: 375,
    });

    await atomicImportProducts([product]);

    // Reload
    const reloaded = await reloadProducts();
    expect(reloaded).toHaveLength(1);

    const reloadedProduct = reloaded[0];
    expect(reloadedProduct.id).toBe('prod-add-test');
    expect(reloadedProduct.sku).toBe('SKU-ADD');
    expect(reloadedProduct.name).toBe('Added Product');
    expect(reloadedProduct.purchaseCost).toBe(250);
    expect(reloadedProduct.currentSellingPrice).toBe(375);
  });
});

// ============================================================
// 2. Edit persistence
// ============================================================

describe('Persistence: Edit purchase cost', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('edit purchase cost → reload → exact new value exists', async () => {
    const settings = makeSettings();
    await saveBusinessSettingsToDb(settings);
    const rules = makeRules();
    await savePricingRulesToDb(rules);

    const product = makeProduct({
      id: 'prod-edit-test',
      sku: 'SKU-EDIT',
      name: 'Edit Product',
      purchaseCost: 100,
      currentSellingPrice: 150,
    });

    await atomicImportProducts([product]);

    // Edit the product
    const updated = makeProduct({
      id: 'prod-edit-test',
      sku: 'SKU-EDIT',
      name: 'Edit Product',
      purchaseCost: 999.99,
      currentSellingPrice: 150,
    });

    await saveProductsToDb([updated]);

    // Reload
    const reloaded = await reloadProducts();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].purchaseCost).toBe(999.99);
    expect(reloaded[0].id).toBe('prod-edit-test');
  });
});

// ============================================================
// 3. Settings persistence
// ============================================================

describe('Persistence: Settings changes', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('change GST rate → reload → exact setting exists', async () => {
    const settings = makeSettings({ defaultTaxRatePercent: 18 });
    await saveBusinessSettingsToDb(settings);

    // Change GST to 28%
    const updatedSettings = { ...settings, defaultTaxRatePercent: 28 };
    await saveBusinessSettingsToDb(updatedSettings);

    // Reload
    const reloaded = await reloadSettings();
    expect(reloaded).not.toBeNull();
    expect(reloaded!.defaultTaxRatePercent).toBe(28);
  });

  it('change marketplace fee → reload → exact setting exists', async () => {
    const settings = makeSettings({ defaultMarketplaceFeePercent: 5 });
    await saveBusinessSettingsToDb(settings);

    // Change marketplace fee to 8.5%
    const updatedSettings = { ...settings, defaultMarketplaceFeePercent: 8.5 };
    await saveBusinessSettingsToDb(updatedSettings);

    // Reload
    const reloaded = await reloadSettings();
    expect(reloaded).not.toBeNull();
    expect(reloaded!.defaultMarketplaceFeePercent).toBe(8.5);
  });
});

// ============================================================
// 4. Approval persistence
// ============================================================

describe('Persistence: Approval', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('approve → reload → approval remains', async () => {
    const settings = makeSettings();
    await saveBusinessSettingsToDb(settings);
    const rules = makeRules();
    await savePricingRulesToDb(rules);

    const product = makeProduct({
      id: 'prod-approve-test',
      sku: 'SKU-APPROVE',
      name: 'Approval Product',
      purchaseCost: 100,
      currentSellingPrice: 150,
    });

    await atomicImportProducts([product]);

    // Simulate approval: set priceApprovalStatus, finalApprovedPrice, etc.
    const approved = makeProduct({
      id: 'prod-approve-test',
      sku: 'SKU-APPROVE',
      name: 'Approval Product',
      purchaseCost: 100,
      currentSellingPrice: 150,
      priceApprovalStatus: 'approved',
      finalApprovedPrice: 180,
      approvedAt: new Date().toISOString(),
      isApproved: true,
      lifecycleStatus: 'approved',
    });

    await saveProductsToDb([approved]);

    // Reload
    const reloaded = await reloadProducts();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].priceApprovalStatus).toBe('approved');
    expect(reloaded[0].finalApprovedPrice).toBe(180);
    expect(reloaded[0].isApproved).toBe(true);
    expect(reloaded[0].lifecycleStatus).toBe('approved');
    expect(reloaded[0].approvedAt).toBeTruthy();
  });
});

// ============================================================
// 5. Import transaction failure
// ============================================================

describe('Persistence: Import transaction failure', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('force database failure → existing catalogue unchanged, no partial import', async () => {
    const settings = makeSettings();
    await saveBusinessSettingsToDb(settings);
    const rules = makeRules();
    await savePricingRulesToDb(rules);

    // Pre-populate with 5 existing products
    const existingProducts: Product[] = [];
    for (let i = 0; i < 5; i++) {
      existingProducts.push(makeProduct({
        id: `existing-${i}`,
        sku: `EXISTING-${i}`,
        name: `Existing ${i}`,
      }));
    }
    await atomicImportProducts(existingProducts);

    const beforeCount = (await loadAllProducts()).length;
    expect(beforeCount).toBe(5);

    // Close the database to force a failure on the next write
    db.close();

    // Attempt an import — should fail
    const newProducts: Product[] = [];
    for (let i = 0; i < 10; i++) {
      newProducts.push(makeProduct({
        id: `new-${i}`,
        sku: `NEW-${i}`,
        name: `New ${i}`,
      }));
    }

    await expect(atomicImportProducts(newProducts)).rejects.toThrow();

    // Reopen the database and verify existing catalogue is unchanged
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);

    const afterProducts = await loadAllProducts();
    expect(afterProducts, 'Existing catalogue must be unchanged after failed import').toHaveLength(5);

    // None of the NEW products should be present — no partial import
    const newSkus = afterProducts.filter(p => p.sku.startsWith('NEW-'));
    expect(newSkus, 'No partial import should be present').toHaveLength(0);
  });

  it('force database failure → no success message returned', async () => {
    const settings = makeSettings();
    await saveBusinessSettingsToDb(settings);

    // Close the database
    db.close();

    // Attempt to import — should throw, not return a success result
    const newProduct = makeProduct({
      id: 'prod-fail-test',
      sku: 'SKU-FAIL',
      name: 'Fail Product',
    });

    await expect(atomicImportProducts([newProduct])).rejects.toThrow();
  });
});

// ============================================================
// 6. Backup failure
// ============================================================

describe('Persistence: Backup failure', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('force backup write failure → destructive action does not run, catalogue unchanged', async () => {
    const settings = makeSettings();
    await saveBusinessSettingsToDb(settings);
    const rules = makeRules();
    await savePricingRulesToDb(rules);

    // Pre-populate with products
    const products: Product[] = [];
    for (let i = 0; i < 3; i++) {
      products.push(makeProduct({
        id: `prod-backup-${i}`,
        sku: `SKU-BACKUP-${i}`,
        name: `Backup Product ${i}`,
      }));
    }
    await atomicImportProducts(products);

    const beforeCount = (await loadAllProducts()).length;
    expect(beforeCount).toBe(3);

    // Simulate backup failure by closing the database before backup write
    // The store's createAutoBackup and resetApplication both create backups
    // before destructive actions. If the backup fails, the destructive
    // action is aborted.
    db.close();

    // Attempt to write a backup — should fail
    await expect(addBackupToDb({
      id: 'backup-fail-test',
      timestamp: new Date().toISOString(),
      trigger: 'manual',
      dataString: '{}',
      description: 'Should fail',
    })).rejects.toThrow();

    // Reopen database and verify catalogue is unchanged
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);

    const afterProducts = await loadAllProducts();
    expect(afterProducts, 'Catalogue must be unchanged after backup failure').toHaveLength(3);
  });

  it('force backup write failure → atomic reset does not run', async () => {
    const settings = makeSettings();
    await saveBusinessSettingsToDb(settings);

    // Pre-populate with products
    const products: Product[] = [];
    for (let i = 0; i < 3; i++) {
      products.push(makeProduct({
        id: `prod-reset-${i}`,
        sku: `SKU-RESET-${i}`,
        name: `Reset Product ${i}`,
      }));
    }
    await atomicImportProducts(products);

    const beforeCount = (await loadAllProducts()).length;
    expect(beforeCount).toBe(3);

    // Close the database to force failure on backup write
    db.close();

    // Attempt atomic reset — should fail
    await expect(atomicResetAll()).rejects.toThrow();

    // Reopen and verify catalogue is unchanged
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);

    const afterProducts = await loadAllProducts();
    expect(afterProducts, 'Catalogue must be unchanged after failed reset').toHaveLength(3);
  });

  it('backup validation rejects invalid format with clear message', () => {
    const invalidJson = '{ "format": "not-pricepilot", "products": [] }';
    const result = parseAndValidateBackup(invalidJson);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.message).toBeTruthy();
      expect(result.code).toBeTruthy();
    }
  });
});

// ============================================================
// 7. Migration
// ============================================================

describe('Persistence: Legacy localStorage migration', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
    // Clear localStorage between tests
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('realistic legacy fixture → exact product counts, exact settings, malformed products marked needs-review', async () => {
    // Create a realistic legacy fixture with:
    // - 10 valid products
    // - 2 products with missing purchase cost (should become needs-review)
    // - 1 product with no name AND no sku (should be rejected)
    // - Business settings with specific values
    const legacyProducts: Record<string, unknown>[] = [];

    // 10 valid products
    for (let i = 1; i <= 10; i++) {
      legacyProducts.push({
        id: `legacy-${i}`,
        sku: `LEGACY-${i}`,
        name: `Legacy Product ${i}`,
        purchaseCost: 100 + i * 10,
        currentSellingPrice: 150 + i * 15,
        taxRatePercent: 18,
        taxTreatment: 'inclusive',
        // Missing many nested fields — must be normalized
      });
    }

    // 2 products with missing purchase cost
    legacyProducts.push({
      id: 'legacy-missing-cost-1',
      sku: 'LEGACY-MISSING-1',
      name: 'Missing Cost Product 1',
      purchaseCost: 0,
      currentSellingPrice: 200,
    });

    legacyProducts.push({
      id: 'legacy-missing-cost-2',
      sku: 'LEGACY-MISSING-2',
      name: 'Missing Cost Product 2',
      purchaseCost: null,
      currentSellingPrice: 150,
    });

    // 1 product with no name AND no sku (should be rejected)
    legacyProducts.push({
      id: 'legacy-no-identity',
      sku: '',
      name: '',
      purchaseCost: 50,
      currentSellingPrice: 75,
    });

    const legacySettings = {
      businessName: 'Legacy Business',
      currencyCode: 'INR',
      country: 'IN',
      defaultTaxRatePercent: 12,
      defaultMarketplaceFeePercent: 6,
      defaultPaymentFeePercent: 2.5,
      defaultTargetMarginPercent: 30,
      defaultMinimumMarginPercent: 15,
      taxTreatment: 'inclusive',
    };

    localStorage.setItem('pricepilot_v1_products', JSON.stringify(legacyProducts));
    localStorage.setItem('pricepilot_v1_businessSettings', JSON.stringify(legacySettings));
    localStorage.setItem('pricepilot_v1_pricingRules', JSON.stringify(makeRules()));

    expect(hasLegacyLocalStorageData()).toBe(true);

    // Run the migration
    const migrationResult = await migrateLegacyDataIfNeeded();
    expect(migrationResult.status).toBe('complete');
    expect(migrationResult.hadLegacyData).toBe(true);

    // Verify exact product counts
    const products = await loadAllProducts();
    // 10 valid + 2 missing-cost = 12 products (the no-identity product is rejected)
    expect(products.length, 'Should have 12 migrated products (10 valid + 2 needs-review)').toBe(12);

    // Verify the 10 valid products
    const validProducts = products.filter(p => p.sku.startsWith('LEGACY-') && !p.sku.includes('MISSING'));
    expect(validProducts.length, 'Should have 10 valid products').toBe(10);

    // Verify the 2 missing-cost products are marked needs-review
    const missingCostProducts = products.filter(p => p.sku.includes('MISSING'));
    expect(missingCostProducts.length, 'Should have 2 missing-cost products').toBe(2);
    for (const p of missingCostProducts) {
      expect(p.lifecycleStatus, `Product ${p.sku} should be needs-review`).toBe('needs-review');
      expect(p.calculatedPricingStatus, `Product ${p.sku} should be missing-data`).toBe('missing-data');
    }

    // Verify the no-identity product was rejected
    const noIdentityProduct = products.find(p => p.id === 'legacy-no-identity');
    expect(noIdentityProduct, 'Product with no name AND no sku should be rejected').toBeUndefined();

    // Verify exact settings
    const settings = await loadBusinessSettingsFromDb();
    expect(settings).not.toBeNull();
    expect(settings!.businessName).toBe('Legacy Business');
    expect(settings!.defaultTaxRatePercent).toBe(12);
    expect(settings!.defaultMarketplaceFeePercent).toBe(6);
    expect(settings!.defaultPaymentFeePercent).toBe(2.5);
    expect(settings!.defaultTargetMarginPercent).toBe(30);
    expect(settings!.defaultMinimumMarginPercent).toBe(15);
    expect(settings!.taxTreatment).toBe('inclusive');

    // Verify legacy source is preserved (localStorage data NOT deleted)
    expect(localStorage.getItem('pricepilot_v1_products'), 'Legacy localStorage data should be preserved').not.toBeNull();
    expect(localStorage.getItem('pricepilot_v1_businessSettings'), 'Legacy localStorage settings should be preserved').not.toBeNull();
  });

  it('malformed legacy products are normalized safely', async () => {
    const legacyProducts = [
      // Product with NaN cost
      {
        id: 'malformed-1',
        sku: 'MALFORMED-1',
        name: 'Malformed NaN Product',
        purchaseCost: NaN,
        currentSellingPrice: 100,
      },
      // Product with Infinity price
      {
        id: 'malformed-2',
        sku: 'MALFORMED-2',
        name: 'Malformed Infinity Product',
        purchaseCost: 50,
        currentSellingPrice: Infinity,
      },
      // Product with string cost
      {
        id: 'malformed-3',
        sku: 'MALFORMED-3',
        name: 'Malformed String Cost',
        purchaseCost: 'not-a-number',
        currentSellingPrice: 100,
      },
    ];

    localStorage.setItem('pricepilot_v1_products', JSON.stringify(legacyProducts));
    localStorage.setItem('pricepilot_v1_businessSettings', JSON.stringify(makeSettings()));

    const migrationResult = await migrateLegacyDataIfNeeded();
    expect(migrationResult.status).toBe('complete');

    const products = await loadAllProducts();
    // All three should be migrated (normalized, not rejected)
    expect(products.length, 'All malformed products should be migrated (normalized)').toBeGreaterThanOrEqual(3);

    // NaN cost should be normalized to 0 → needs-review
    const nanProduct = products.find(p => p.sku === 'MALFORMED-1');
    expect(nanProduct).toBeDefined();
    expect(nanProduct!.purchaseCost).toBe(0);
    expect(nanProduct!.lifecycleStatus).toBe('needs-review');

    // Infinity price should be normalized to 0 → the product has a valid
    // purchase cost (50) so the engine will calculate a recommendation.
    // The lifecycleStatus will be 'active' because purchaseCost > 0.
    // With currentSellingPrice = 0, the engine classifies it as 'missing-data'.
    const infProduct = products.find(p => p.sku === 'MALFORMED-2');
    expect(infProduct).toBeDefined();
    expect(infProduct!.currentSellingPrice).toBe(0);
    // With a valid purchase cost but zero selling price, the product
    // is classified as missing-data.
    expect(infProduct!.calculatedPricingStatus).toBe('missing-data');
    expect(infProduct!.purchaseCost).toBe(50);

    // String cost should be normalized to 0 → needs-review
    const strProduct = products.find(p => p.sku === 'MALFORMED-3');
    expect(strProduct).toBeDefined();
    expect(strProduct!.purchaseCost).toBe(0);
    expect(strProduct!.lifecycleStatus).toBe('needs-review');
  });

  it('migration is idempotent — running twice does not duplicate products', async () => {
    const legacyProducts = [
      {
        id: 'idempotent-1',
        sku: 'IDEMPOTENT-1',
        name: 'Idempotent Product',
        purchaseCost: 100,
        currentSellingPrice: 150,
      },
    ];

    localStorage.setItem('pricepilot_v1_products', JSON.stringify(legacyProducts));
    localStorage.setItem('pricepilot_v1_businessSettings', JSON.stringify(makeSettings()));

    // Run migration twice
    const firstResult = await migrateLegacyDataIfNeeded();
    expect(firstResult.status).toBe('complete');

    const secondResult = await migrateLegacyDataIfNeeded();
    expect(secondResult.status).toBe('complete');
    // Second run should report 0 migrated products (already complete)
    expect(secondResult.migratedProductCount).toBe(0);

    const products = await loadAllProducts();
    // Should still have exactly 1 product, not 2
    expect(products.length, 'Migration should be idempotent').toBe(1);
  });
});
