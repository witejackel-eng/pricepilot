/**
 * Unit tests for src/lib/pricepilot/database.ts
 *
 * Covers:
 *   - getDb() singleton creation
 *   - atomicImportProducts success and failure
 *   - atomicBulkUpdateProducts
 *   - atomicApplyApprovedPrices
 *   - atomicRestoreBackup
 *   - atomicResetAll
 *   - CRUD operations (loadAllProducts, saveProductToDb, removeProductFromDb)
 *   - Business settings load/save
 *   - Pricing rules load/save
 *   - Undo history load/save
 *   - Backup operations
 *   - Metadata get/set
 *   - atomicUpdateSettingsAndProducts
 *   - atomicUpdateRulesAndProducts
 *   - atomicRestoreScenario
 *   - exportAllDataFromDb
 *   - clearProductsInDb
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PricePilotDatabase,
  getDb,
  setDbForTesting,
  resetDbForTesting,
  loadAllProducts,
  saveProductsToDb,
  saveProductToDb,
  removeProductFromDb,
  loadBusinessSettingsFromDb,
  saveBusinessSettingsToDb,
  loadPricingRulesFromDb,
  savePricingRulesToDb,
  loadScenariosFromDb,
  saveScenariosToDb,
  loadUndoHistoryFromDb,
  saveUndoHistoryToDb,
  loadBackupsFromDb,
  saveBackupsToDb,
  addBackupToDb,
  getMetadata,
  setMetadata,
  atomicImportProducts,
  atomicBulkUpdateProducts,
  atomicApplyApprovedPrices,
  atomicRestoreBackup,
  atomicResetAll,
  atomicUpdateSettingsAndProducts,
  atomicUpdateRulesAndProducts,
  atomicRestoreScenario,
  exportAllDataFromDb,
  clearProductsInDb,
  BUSINESS_SETTINGS_ID,
} from '../database';
import {
  createDefaultBusinessSettings,
  createDefaultPricingRule,
  createDefaultProduct,
  Product,
  BusinessSettings,
  PricingRule,
  Scenario,
} from '../types';
import { AutoBackup, UndoAction } from '@/store/pricepilot-store';

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
  const now = new Date().toISOString();
  const defaults: Product = {
    id: `prod-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sku: '',
    name: 'Test Product',
    category: '',
    brand: '',
    description: '',
    tags: [],
    purchaseCost: 100,
    shippingCost: 0,
    packagingCost: 0,
    handlingCost: 0,
    otherCosts: 0,
    returnRatePercent: 0,
    damageRatePercent: 0,
    customDutyPercent: 0,
    freightPercent: 0,
    currentSellingPrice: 150,
    competitorPrices: [],
    salesChannel: 'online-marketplace',
    taxRatePercent: 18,
    taxTreatment: 'inclusive',
    marketplaceFeePercent: 5,
    marketplaceFeeFixed: 0,
    paymentFeePercent: 2,
    paymentFeeFixed: 0,
    shippingChargeToCustomer: 0,
    otherFeesPercent: 0,
    otherFeesFixed: 0,
    calculatedBaseCost: 100,
    calculatedExpectedReturnCost: 0,
    calculatedExpectedDamageCost: 0,
    calculatedTotalLandedCost: 100,
    calculatedBreakEvenPrice: 100,
    calculatedMarkupPercent: 0,
    calculatedMarginPercent: 0,
    calculatedProfitPerUnit: 0,
    calculatedTotalPercentageFees: 7,
    calculatedTotalFixedFees: 0,
    calculatedPricingStatus: 'healthy',
    calculatedProfitabilityMeter: 'healthy',
    calculatedHealthScore: 80,
    recommendedPrices: { breakEven: 100, minimum: 110, competitive: 130, balanced: 150, premium: 200, confidence: 'medium' },
    purchaseTaxRatePercent: 0,
    inputTaxCreditRecoverable: 'not-recoverable',
    inputTaxRecoverablePercent: 100,
    purchaseCostTaxMode: 'excluding-tax',
    feeBasePolicy: 'product-price-only',
    selectedRecommendationMode: 'balanced',
    customRecommendedPrice: 0,
    finalApprovedPrice: 0,
    priceApprovalStatus: 'none',
    approvedAt: '',
    quantity: 0,
    monthlyUnitsSold: 0,
    expectedMonthlyUnits: 0,
    lifecycleStatus: 'active',
    createdAt: now,
    updatedAt: now,
    isApproved: false,
    notes: '',
  };
  return { ...defaults, ...overrides } as Product;
}

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: `scenario-${Date.now()}`,
    name: 'Test Scenario',
    scenarioType: 'simulator',
    description: 'Test scenario description',
    snapshotProducts: [],
    snapshotBusinessSettings: makeSettings(),
    snapshotPricingRules: makeRules(),
    isBaseline: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// getDb() singleton
// ============================================================

describe('getDb() singleton', () => {
  beforeEach(() => {
    resetDbForTesting();
  });

  it('returns a PricePilotDatabase instance', () => {
    const db = getDb();
    expect(db).toBeDefined();
    expect(db).toBeInstanceOf(PricePilotDatabase);
  });

  it('returns the same instance on subsequent calls', () => {
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it('creates a new instance after resetDbForTesting', () => {
    const db1 = getDb();
    resetDbForTesting();
    const db2 = getDb();
    expect(db1).not.toBe(db2);
  });
});

// ============================================================
// atomicImportProducts
// ============================================================

describe('atomicImportProducts', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('writes all products atomically', async () => {
    const products = [
      makeProduct({ id: 'p1', sku: 'SKU-1' }),
      makeProduct({ id: 'p2', sku: 'SKU-2' }),
    ];
    const result = await atomicImportProducts(products);
    expect(result.writtenCount).toBe(2);

    const loaded = await loadAllProducts();
    expect(loaded).toHaveLength(2);
  });

  it('includes batchId when batchMetadata is provided', async () => {
    const products = [makeProduct({ id: 'p1' })];
    const batchId = 'batch-123';
    const result = await atomicImportProducts(products, {
      id: batchId,
      fileName: 'test.csv',
      startedAt: new Date().toISOString(),
      totalRows: 1,
      validCount: 1,
      needsReviewCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
    });
    expect(result.batchId).toBe(batchId);
  });

  it('returns writtenCount without batchId when no batchMetadata', async () => {
    const products = [makeProduct({ id: 'p1' })];
    const result = await atomicImportProducts(products);
    expect(result.writtenCount).toBe(1);
    expect(result.batchId).toBeUndefined();
  });

  it('throws on failure and does not persist', async () => {
    // Pre-populate
    const existing = [makeProduct({ id: 'existing-1' })];
    await atomicImportProducts(existing);

    // Close DB to force failure
    db.close();

    const newProducts = [makeProduct({ id: 'new-1' })];
    await expect(atomicImportProducts(newProducts)).rejects.toThrow();

    // Reopen and verify existing data is still there
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
    const after = await loadAllProducts();
    expect(after).toHaveLength(1);
  });
});

// ============================================================
// atomicBulkUpdateProducts
// ============================================================

describe('atomicBulkUpdateProducts', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('updates multiple products atomically', async () => {
    const products = [
      makeProduct({ id: 'p1', sku: 'SKU-1' }),
      makeProduct({ id: 'p2', sku: 'SKU-2' }),
    ];
    await atomicImportProducts(products);

    // Update
    const updated = products.map(p => ({ ...p, purchaseCost: 999 }));
    const count = await atomicBulkUpdateProducts(updated);
    expect(count).toBe(2);

    const loaded = await loadAllProducts();
    expect(loaded.every(p => p.purchaseCost === 999)).toBe(true);
  });
});

// ============================================================
// atomicApplyApprovedPrices
// ============================================================

describe('atomicApplyApprovedPrices', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('applies approved prices atomically', async () => {
    const products = [
      makeProduct({ id: 'p1', sku: 'SKU-1', priceApprovalStatus: 'approved', finalApprovedPrice: 200 }),
    ];
    await atomicImportProducts(products);

    const updated = [{ ...products[0], currentSellingPrice: 200 }];
    const count = await atomicApplyApprovedPrices(updated);
    expect(count).toBe(1);

    const loaded = await loadAllProducts();
    expect(loaded[0].currentSellingPrice).toBe(200);
  });
});

// ============================================================
// atomicRestoreBackup
// ============================================================

describe('atomicRestoreBackup', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('restores products, settings, rules, and scenarios atomically', async () => {
    const products = [makeProduct({ id: 'p1', sku: 'SKU-1' })];
    const settings = makeSettings({ businessName: 'Restored Business' });
    const rules = makeRules();
    const scenarios = [makeScenario({ id: 'sc-1' })];

    await atomicRestoreBackup({ products, businessSettings: settings, pricingRules: rules, scenarios });

    const loadedProducts = await loadAllProducts();
    expect(loadedProducts).toHaveLength(1);

    const loadedSettings = await loadBusinessSettingsFromDb();
    expect(loadedSettings?.businessName).toBe('Restored Business');

    const loadedRules = await loadPricingRulesFromDb();
    expect(loadedRules).toHaveLength(1);

    const loadedScenarios = await loadScenariosFromDb();
    expect(loadedScenarios).toHaveLength(1);
  });

  it('replaces existing data on restore', async () => {
    // Pre-populate with different data
    await atomicImportProducts([makeProduct({ id: 'old-p1' }), makeProduct({ id: 'old-p2' })]);
    await saveBusinessSettingsToDb(makeSettings({ businessName: 'Old Business' }));

    // Restore with new data
    const products = [makeProduct({ id: 'new-p1' })];
    const settings = makeSettings({ businessName: 'New Business' });
    await atomicRestoreBackup({ products, businessSettings: settings, pricingRules: [], scenarios: [] });

    const loadedProducts = await loadAllProducts();
    expect(loadedProducts).toHaveLength(1);
    expect(loadedProducts[0].id).toBe('new-p1');

    const loadedSettings = await loadBusinessSettingsFromDb();
    expect(loadedSettings?.businessName).toBe('New Business');
  });
});

// ============================================================
// atomicResetAll
// ============================================================

describe('atomicResetAll', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('clears all data except metadata', async () => {
    // Populate all tables
    await atomicImportProducts([makeProduct({ id: 'p1' })]);
    await saveBusinessSettingsToDb(makeSettings());
    await savePricingRulesToDb(makeRules());
    await saveScenariosToDb([makeScenario()]);
    await setMetadata('testKey', 'testValue');

    // Reset
    await atomicResetAll();

    // Verify all cleared
    const products = await loadAllProducts();
    expect(products).toHaveLength(0);

    const settings = await loadBusinessSettingsFromDb();
    expect(settings).toBeNull();

    const rules = await loadPricingRulesFromDb();
    expect(rules).toHaveLength(0);

    const scenarios = await loadScenariosFromDb();
    expect(scenarios).toHaveLength(0);

    // Metadata should still be there
    const meta = await getMetadata<string>('testKey');
    expect(meta).toBe('testValue');
  });
});

// ============================================================
// CRUD operations
// ============================================================

describe('CRUD operations', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('loadAllProducts returns empty array when no products', async () => {
    const products = await loadAllProducts();
    expect(products).toEqual([]);
  });

  it('saveProductToDb adds a single product', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1' });
    await saveProductToDb(product);
    const loaded = await loadAllProducts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('p1');
  });

  it('saveProductToDb updates an existing product', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1', name: 'Original' });
    await saveProductToDb(product);

    const updated = makeProduct({ id: 'p1', sku: 'SKU-1', name: 'Updated' });
    await saveProductToDb(updated);

    const loaded = await loadAllProducts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Updated');
  });

  it('removeProductFromDb removes a product', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1' });
    await saveProductToDb(product);
    await removeProductFromDb('p1');

    const loaded = await loadAllProducts();
    expect(loaded).toHaveLength(0);
  });

  it('saveProductsToDb replaces all products', async () => {
    await saveProductsToDb([makeProduct({ id: 'p1' }), makeProduct({ id: 'p2' })]);
    await saveProductsToDb([makeProduct({ id: 'p3' })]);

    const loaded = await loadAllProducts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('p3');
  });

  it('clearProductsInDb removes all products', async () => {
    await saveProductsToDb([makeProduct({ id: 'p1' }), makeProduct({ id: 'p2' })]);
    await clearProductsInDb();
    const loaded = await loadAllProducts();
    expect(loaded).toHaveLength(0);
  });
});

// ============================================================
// Business settings
// ============================================================

describe('Business settings', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('loadBusinessSettingsFromDb returns null when no settings', async () => {
    const settings = await loadBusinessSettingsFromDb();
    expect(settings).toBeNull();
  });

  it('saveBusinessSettingsToDb and loadBusinessSettingsFromDb round-trip', async () => {
    const settings = makeSettings({ businessName: 'Test Business', defaultTaxRatePercent: 28 });
    await saveBusinessSettingsToDb(settings);
    const loaded = await loadBusinessSettingsFromDb();
    expect(loaded).not.toBeNull();
    expect(loaded!.businessName).toBe('Test Business');
    expect(loaded!.defaultTaxRatePercent).toBe(28);
  });

  it('overwrites previous settings on re-save', async () => {
    await saveBusinessSettingsToDb(makeSettings({ businessName: 'First' }));
    await saveBusinessSettingsToDb(makeSettings({ businessName: 'Second' }));
    const loaded = await loadBusinessSettingsFromDb();
    expect(loaded!.businessName).toBe('Second');
  });
});

// ============================================================
// Pricing rules
// ============================================================

describe('Pricing rules', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('loadPricingRulesFromDb returns empty array when no rules', async () => {
    const rules = await loadPricingRulesFromDb();
    expect(rules).toEqual([]);
  });

  it('savePricingRulesToDb and loadPricingRulesFromDb round-trip', async () => {
    const rules = makeRules();
    await savePricingRulesToDb(rules);
    const loaded = await loadPricingRulesFromDb();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('rule-1');
  });

  it('savePricingRulesToDb replaces all rules', async () => {
    const rules1 = [{ ...createDefaultPricingRule(), id: 'r1', isActive: true }];
    const rules2 = [{ ...createDefaultPricingRule(), id: 'r2', isActive: true }];
    await savePricingRulesToDb(rules1);
    await savePricingRulesToDb(rules2);
    const loaded = await loadPricingRulesFromDb();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('r2');
  });
});

// ============================================================
// Scenarios
// ============================================================

describe('Scenarios', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('loadScenariosFromDb returns empty array when no scenarios', async () => {
    const scenarios = await loadScenariosFromDb();
    expect(scenarios).toEqual([]);
  });

  it('saveScenariosToDb and loadScenariosFromDb round-trip', async () => {
    const scenarios = [makeScenario({ id: 'sc-1', name: 'Test Scenario' })];
    await saveScenariosToDb(scenarios);
    const loaded = await loadScenariosFromDb();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Test Scenario');
  });

  it('saveScenariosToDb replaces all scenarios', async () => {
    await saveScenariosToDb([makeScenario({ id: 'sc-1' })]);
    await saveScenariosToDb([makeScenario({ id: 'sc-2' })]);
    const loaded = await loadScenariosFromDb();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('sc-2');
  });
});

// ============================================================
// Undo history
// ============================================================

describe('Undo history', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('loadUndoHistoryFromDb returns empty array when no history', async () => {
    const history = await loadUndoHistoryFromDb();
    expect(history).toEqual([]);
  });

  it('saveUndoHistoryToDb and loadUndoHistoryFromDb round-trip', async () => {
    const history: UndoAction[] = [
      {
        type: 'price-approve',
        productId: 'p1',
        previousState: { id: 'p1' } as Product,
        timestamp: new Date().toISOString(),
        description: 'Approved price for product',
      },
    ];
    await saveUndoHistoryToDb(history);
    const loaded = await loadUndoHistoryFromDb();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].type).toBe('price-approve');
    expect(loaded[0].productId).toBe('p1');
  });

  it('sorts undo history by timestamp descending', async () => {
    const history: UndoAction[] = [
      {
        type: 'product-edit',
        productId: 'p1',
        previousState: { id: 'p1' } as Product,
        timestamp: '2024-01-01T00:00:00.000Z',
        description: 'First edit',
      },
      {
        type: 'product-edit',
        productId: 'p2',
        previousState: { id: 'p2' } as Product,
        timestamp: '2024-01-02T00:00:00.000Z',
        description: 'Second edit',
      },
    ];
    await saveUndoHistoryToDb(history);
    const loaded = await loadUndoHistoryFromDb();
    expect(loaded[0].description).toBe('Second edit');
    expect(loaded[1].description).toBe('First edit');
  });

  it('handles empty history', async () => {
    await saveUndoHistoryToDb([]);
    const loaded = await loadUndoHistoryFromDb();
    expect(loaded).toEqual([]);
  });
});

// ============================================================
// Backups
// ============================================================

describe('Backups', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('loadBackupsFromDb returns empty array when no backups', async () => {
    const backups = await loadBackupsFromDb();
    expect(backups).toEqual([]);
  });

  it('addBackupToDb adds a backup', async () => {
    const backup: AutoBackup = {
      id: 'backup-1',
      timestamp: new Date().toISOString(),
      trigger: 'manual',
      dataString: '{}',
      description: 'Test backup',
    };
    await addBackupToDb(backup);
    const loaded = await loadBackupsFromDb();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('backup-1');
  });

  it('saveBackupsToDb replaces all backups', async () => {
    await addBackupToDb({
      id: 'backup-old',
      timestamp: new Date().toISOString(),
      trigger: 'manual',
      dataString: '{}',
      description: 'Old backup',
    });

    const newBackups: AutoBackup[] = [
      {
        id: 'backup-new',
        timestamp: new Date().toISOString(),
        trigger: 'import',
        dataString: '{}',
        description: 'New backup',
      },
    ];
    await saveBackupsToDb(newBackups);
    const loaded = await loadBackupsFromDb();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('backup-new');
  });

  it('sorts backups by timestamp descending', async () => {
    const backups: AutoBackup[] = [
      {
        id: 'backup-1',
        timestamp: '2024-01-01T00:00:00.000Z',
        trigger: 'manual',
        dataString: '{}',
        description: 'First',
      },
      {
        id: 'backup-2',
        timestamp: '2024-01-02T00:00:00.000Z',
        trigger: 'manual',
        dataString: '{}',
        description: 'Second',
      },
    ];
    await saveBackupsToDb(backups);
    const loaded = await loadBackupsFromDb();
    expect(loaded[0].description).toBe('Second');
    expect(loaded[1].description).toBe('First');
  });

  it('saveBackupsToDb with empty array clears backups', async () => {
    await addBackupToDb({
      id: 'backup-1',
      timestamp: new Date().toISOString(),
      trigger: 'manual',
      dataString: '{}',
      description: 'Test',
    });
    await saveBackupsToDb([]);
    const loaded = await loadBackupsFromDb();
    expect(loaded).toHaveLength(0);
  });
});

// ============================================================
// Metadata
// ============================================================

describe('Metadata', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('getMetadata returns null when key does not exist', async () => {
    const value = await getMetadata<string>('nonexistent');
    expect(value).toBeNull();
  });

  it('setMetadata and getMetadata round-trip', async () => {
    await setMetadata('testKey', 'testValue');
    const value = await getMetadata<string>('testKey');
    expect(value).toBe('testValue');
  });

  it('setMetadata overwrites existing value', async () => {
    await setMetadata('testKey', 'first');
    await setMetadata('testKey', 'second');
    const value = await getMetadata<string>('testKey');
    expect(value).toBe('second');
  });

  it('stores complex objects', async () => {
    const obj = { name: 'test', count: 42, nested: { a: 1 } };
    await setMetadata('complexKey', obj);
    const value = await getMetadata<typeof obj>('complexKey');
    expect(value).toEqual(obj);
  });

  it('stores numbers', async () => {
    await setMetadata('numKey', 42);
    const value = await getMetadata<number>('numKey');
    expect(value).toBe(42);
  });
});

// ============================================================
// atomicUpdateSettingsAndProducts
// ============================================================

describe('atomicUpdateSettingsAndProducts', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('saves settings and products in one transaction', async () => {
    const settings = makeSettings({ businessName: 'Updated' });
    const products = [makeProduct({ id: 'p1' })];
    await atomicUpdateSettingsAndProducts(settings, products);

    const loadedSettings = await loadBusinessSettingsFromDb();
    expect(loadedSettings?.businessName).toBe('Updated');

    const loadedProducts = await loadAllProducts();
    expect(loadedProducts).toHaveLength(1);
  });
});

// ============================================================
// atomicUpdateRulesAndProducts
// ============================================================

describe('atomicUpdateRulesAndProducts', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('saves rules and products in one transaction', async () => {
    const rules = makeRules();
    const products = [makeProduct({ id: 'p1' })];
    await atomicUpdateRulesAndProducts(rules, products);

    const loadedRules = await loadPricingRulesFromDb();
    expect(loadedRules).toHaveLength(1);

    const loadedProducts = await loadAllProducts();
    expect(loadedProducts).toHaveLength(1);
  });
});

// ============================================================
// atomicRestoreScenario
// ============================================================

describe('atomicRestoreScenario', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('restores products, rules, and settings from a scenario', async () => {
    const products = [makeProduct({ id: 'p1' })];
    const rules = makeRules();
    const settings = makeSettings({ businessName: 'Scenario Business' });

    await atomicRestoreScenario(products, rules, settings);

    const loadedProducts = await loadAllProducts();
    expect(loadedProducts).toHaveLength(1);

    const loadedRules = await loadPricingRulesFromDb();
    expect(loadedRules).toHaveLength(1);

    const loadedSettings = await loadBusinessSettingsFromDb();
    expect(loadedSettings?.businessName).toBe('Scenario Business');
  });
});

// ============================================================
// exportAllDataFromDb
// ============================================================

describe('exportAllDataFromDb', () => {
  let db: PricePilotDatabase;

  beforeEach(() => {
    resetDbForTesting();
    db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('returns default settings when no data exists', async () => {
    const data = await exportAllDataFromDb();
    expect(data.businessSettings).toBeDefined();
    expect(data.products).toEqual([]);
    expect(data.pricingRules).toEqual([]);
    expect(data.scenarios).toEqual([]);
  });

  it('returns all stored data', async () => {
    await saveProductsToDb([makeProduct({ id: 'p1' })]);
    await saveBusinessSettingsToDb(makeSettings({ businessName: 'Export Test' }));
    await savePricingRulesToDb(makeRules());
    await saveScenariosToDb([makeScenario({ id: 'sc-1' })]);

    const data = await exportAllDataFromDb();
    expect(data.products).toHaveLength(1);
    expect(data.businessSettings.businessName).toBe('Export Test');
    expect(data.pricingRules).toHaveLength(1);
    expect(data.scenarios).toHaveLength(1);
  });
});
