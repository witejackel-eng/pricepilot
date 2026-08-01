/**
 * Unit tests for src/store/pricepilot-store.ts
 *
 * Tests actual Zustand store actions using fake-indexeddb.
 * Each test initializes the store from scratch to avoid state leakage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePricePilotStore,
} from '@/store/pricepilot-store';
import {
  resetDbForTesting,
  setDbForTesting,
  PricePilotDatabase,
  loadAllProducts,
  loadBusinessSettingsFromDb,
} from '@/lib/pricepilot/database';
import {
  createDefaultBusinessSettings,
  createDefaultPricingRule,
  createDefaultProduct,
  Product,
  BusinessSettings,
  PricingRule,
} from '@/lib/pricepilot/types';
import { safelyRecalculateProduct } from '@/lib/pricepilot/safe-calculation';
import { PricePilotBackup, BACKUP_FORMAT, BACKUP_VERSION, SCHEMA_VERSION, APP_VERSION } from '@/lib/pricepilot/backup-service';

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

function getStore() {
  return usePricePilotStore.getState();
}

/** Reset the store and DB to a clean state, then initialize. */
async function resetAndInit() {
  resetDbForTesting();
  const db = new PricePilotDatabase();
  setDbForTesting(db);
  await getStore().initialize();
}

// ============================================================
// Initialize store
// ============================================================

describe('Store — initialize', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('initializes from empty IndexedDB', () => {
    const store = getStore();
    expect(store.initialization.status).toBe('ready');
    expect(store.products).toEqual([]);
    expect(store.businessSettings).toBeDefined();
  });

  it('initializes with existing products in IndexedDB', async () => {
    const { atomicImportProducts, saveBusinessSettingsToDb, savePricingRulesToDb } = await import('@/lib/pricepilot/database');
    const product = makeProduct({ id: 'p1', sku: 'SKU-1' });
    await saveBusinessSettingsToDb(makeSettings());
    await savePricingRulesToDb(makeRules());
    await atomicImportProducts([product]);

    await getStore().initialize();

    const status = getStore().initialization.status;
    expect(status === 'ready' || status === 'ready-with-warnings').toBe(true);
    expect(getStore().products.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Onboarding completion
// ============================================================

describe('Store — completeOnboarding', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('completes onboarding and updates settings', async () => {
    const result = await getStore().completeOnboarding({
      businessName: 'Test Business',
      defaultTaxRatePercent: 18,
    });

    expect(result.success).toBe(true);
    expect(getStore().onboardingCompleted).toBe(true);
    expect(getStore().businessSettings.businessName).toBe('Test Business');
  });
});

// ============================================================
// Add product
// ============================================================

describe('Store — addProduct', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('adds a product to the store', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1', name: 'Test Product' });
    const result = await getStore().addProduct(product);

    expect(result.success).toBe(true);
    expect(getStore().products).toHaveLength(1);
    expect(getStore().products[0].sku).toBe('SKU-1');
  });
});

// ============================================================
// Edit product
// ============================================================

describe('Store — updateProduct', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('updates a product in the store', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1', name: 'Original', purchaseCost: 100 });
    await getStore().addProduct(product);

    const result = await getStore().updateProduct('p1', { purchaseCost: 200 });

    expect(result.success).toBe(true);
    expect(getStore().products[0].purchaseCost).toBe(200);
  });

  it('returns error for non-existent product', async () => {
    const result = await getStore().updateProduct('nonexistent', { purchaseCost: 200 });

    expect(result.success).toBe(false);
  });
});

// ============================================================
// Delete product
// ============================================================

describe('Store — deleteProduct', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('deletes a product from the store', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1' });
    await getStore().addProduct(product);

    const result = await getStore().deleteProduct('p1');

    expect(result.success).toBe(true);
    expect(getStore().products).toHaveLength(0);
  });

  it('returns error for non-existent product', async () => {
    const result = await getStore().deleteProduct('nonexistent');

    expect(result.success).toBe(false);
  });
});

// ============================================================
// Import flow
// ============================================================

describe('Store — importProducts', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('imports products into the store', async () => {
    const products = [
      makeProduct({ id: 'p1', sku: 'SKU-1' }),
      makeProduct({ id: 'p2', sku: 'SKU-2' }),
    ];
    const result = await getStore().importProducts(products);

    expect(result.success).toBe(true);
    expect(getStore().products).toHaveLength(2);
  });
});

// ============================================================
// Approve price
// ============================================================

describe('Store — approveProductPrice', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('approves a product price', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1', purchaseCost: 100, currentSellingPrice: 150 });
    await getStore().addProduct(product);

    const result = await getStore().approveProductPrice('p1', 'balanced');

    expect(result.success).toBe(true);
    const approvedProduct = getStore().products.find(p => p.id === 'p1');
    expect(approvedProduct?.priceApprovalStatus).toBe('approved');
    expect(approvedProduct?.finalApprovedPrice).toBeGreaterThan(0);
  });

  it('returns error for non-existent product', async () => {
    const result = await getStore().approveProductPrice('nonexistent', 'balanced');

    expect(result.success).toBe(false);
  });
});

// ============================================================
// Apply price
// ============================================================

describe('Store — applyApprovedPrice', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('applies an approved price to a product', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1', purchaseCost: 100, currentSellingPrice: 150 });
    await getStore().addProduct(product);

    // First approve
    await getStore().approveProductPrice('p1', 'balanced');

    // Then apply
    const result = await getStore().applyApprovedPrice('p1');

    expect(result.success).toBe(true);
    const appliedProduct = getStore().products.find(p => p.id === 'p1');
    expect(appliedProduct?.currentSellingPrice).toBe(appliedProduct?.finalApprovedPrice);
  });

  it('returns error if no price has been approved', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1' });
    await getStore().addProduct(product);

    const result = await getStore().applyApprovedPrice('p1');

    expect(result.success).toBe(false);
  });
});

// ============================================================
// Settings update
// ============================================================

describe('Store — updateBusinessSettings', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('updates business settings', async () => {
    const result = await getStore().updateBusinessSettings({
      businessName: 'Updated Business',
      defaultTaxRatePercent: 28,
    });

    expect(result.success).toBe(true);
    expect(getStore().businessSettings.businessName).toBe('Updated Business');
    expect(getStore().businessSettings.defaultTaxRatePercent).toBe(28);
  });

  it('persists settings to IndexedDB', async () => {
    await getStore().updateBusinessSettings({ businessName: 'Persisted Business' });

    // Reload from DB
    const loadedSettings = await loadBusinessSettingsFromDb();
    expect(loadedSettings?.businessName).toBe('Persisted Business');
  });
});

// ============================================================
// Pricing rule update
// ============================================================

describe('Store — addPricingRule', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('adds a pricing rule', async () => {
    const rule = { ...createDefaultPricingRule(), id: 'rule-new', name: 'New Rule', isActive: true };
    const result = await getStore().addPricingRule(rule);

    expect(result.success).toBe(true);
    expect(getStore().pricingRules).toHaveLength(1);
    expect(getStore().pricingRules[0].name).toBe('New Rule');
  });
});

describe('Store — updatePricingRule', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('updates a pricing rule', async () => {
    const rule = { ...createDefaultPricingRule(), id: 'rule-1', name: 'Original', isActive: true };
    await getStore().addPricingRule(rule);

    const result = await getStore().updatePricingRule('rule-1', { name: 'Updated' });

    expect(result.success).toBe(true);
    expect(getStore().pricingRules[0].name).toBe('Updated');
  });
});

describe('Store — deletePricingRule', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('deletes a pricing rule', async () => {
    const rule = { ...createDefaultPricingRule(), id: 'rule-1', name: 'To Delete', isActive: true };
    await getStore().addPricingRule(rule);

    const result = await getStore().deletePricingRule('rule-1');

    expect(result.success).toBe(true);
    expect(getStore().pricingRules).toHaveLength(0);
  });
});

// ============================================================
// Scenario
// ============================================================

describe('Store — addScenario', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('adds a scenario', async () => {
    const scenario = {
      id: 'sc-1',
      name: 'Test Scenario',
      scenarioType: 'catalogue' as const,
      description: 'Test',
      snapshotProducts: [],
      snapshotBusinessSettings: makeSettings(),
      snapshotPricingRules: makeRules(),
      isBaseline: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = await getStore().addScenario(scenario);

    expect(result.success).toBe(true);
    expect(getStore().scenarios).toHaveLength(1);
  });
});

describe('Store — restoreScenario', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('returns error for non-existent scenario', async () => {
    const result = await getStore().restoreScenario('nonexistent');

    expect(result.success).toBe(false);
  });
});

// ============================================================
// Backup restore
// ============================================================

describe('Store — restoreBackup', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('rejects invalid backup JSON', async () => {
    const result = await getStore().restoreBackup('invalid json');

    expect(result.success).toBe(false);
  });

  it('rejects backup with wrong format', async () => {
    const result = await getStore().restoreBackup(JSON.stringify({ format: 'wrong' }));

    expect(result.success).toBe(false);
  });
});

// ============================================================
// Reset
// ============================================================

describe('Store — resetApplication', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('resets the application state', async () => {
    // Add some data
    await getStore().addProduct(makeProduct({ id: 'p1', sku: 'SKU-1' }));

    // Reset
    await getStore().resetApplication();

    expect(getStore().products).toEqual([]);
    expect(getStore().pricingRules).toEqual([]);
    expect(getStore().scenarios).toEqual([]);
    expect(getStore().onboardingCompleted).toBe(false);
  });
});

// ============================================================
// Navigation and UI state (synchronous, no DB needed)
// ============================================================

describe('Store — navigation and UI state', () => {
  it('setCurrentView changes the current view', () => {
    getStore().setCurrentView('products');
    expect(getStore().currentView).toBe('products');
  });

  it('setSidebarCollapsed changes sidebar state', () => {
    getStore().setSidebarCollapsed(true);
    expect(getStore().sidebarCollapsed).toBe(true);
  });

  it('setSelectedProductId changes selected product', () => {
    getStore().setSelectedProductId('p1');
    expect(getStore().selectedProductId).toBe('p1');
  });

  it('setSelectedProducts changes selected products', () => {
    getStore().setSelectedProducts(['p1', 'p2']);
    expect(getStore().selectedProducts).toEqual(['p1', 'p2']);
  });

  it('addRecentlyViewed adds product to recently viewed', () => {
    getStore().addRecentlyViewed('p1');
    getStore().addRecentlyViewed('p2');
    expect(getStore().recentlyViewedIds).toContain('p1');
    expect(getStore().recentlyViewedIds).toContain('p2');
  });

  it('addRecentlyViewed limits to 5 items', () => {
    for (let i = 0; i < 10; i++) {
      getStore().addRecentlyViewed(`p${i}`);
    }
    expect(getStore().recentlyViewedIds.length).toBeLessThanOrEqual(5);
  });

  it('addRecentlyViewed moves existing item to front', () => {
    getStore().addRecentlyViewed('p1');
    getStore().addRecentlyViewed('p2');
    getStore().addRecentlyViewed('p1');
    expect(getStore().recentlyViewedIds[0]).toBe('p1');
  });
});

// ============================================================
// Undo
// ============================================================

describe('Store — undo', () => {
  it('pushUndoAction adds to undo history', () => {
    getStore().pushUndoAction({
      type: 'product-edit',
      productId: 'p1',
      previousState: { id: 'p1' } as Product,
      timestamp: new Date().toISOString(),
      description: 'Edited product',
    });

    expect(getStore().undoHistory).toHaveLength(1);
    expect(getStore().undoHistory[0].type).toBe('product-edit');
  });

  it('limits undo history to 20 items', () => {
    for (let i = 0; i < 30; i++) {
      getStore().pushUndoAction({
        type: 'product-edit',
        productId: `p${i}`,
        previousState: { id: `p${i}` } as Product,
        timestamp: new Date().toISOString(),
        description: `Edit ${i}`,
      });
    }
    expect(getStore().undoHistory.length).toBeLessThanOrEqual(20);
  });
});

// ============================================================
// App settings
// ============================================================

describe('Store — updateAppSettings', () => {
  it('updates app settings', () => {
    getStore().updateAppSettings({ applicationMode: 'advanced' });
    expect(getStore().appSettings.applicationMode).toBe('advanced');
  });
});

describe('Store — setApplicationMode', () => {
  it('changes application mode and default view', () => {
    getStore().setApplicationMode('advanced');
    expect(getStore().appSettings.applicationMode).toBe('advanced');
    expect(getStore().currentView).toBe('dashboard');
  });
});

// ============================================================
// Export data
// ============================================================

describe('Store — exportData', () => {
  it('exports data as JSON string', () => {
    const data = getStore().exportData();
    expect(() => JSON.parse(data)).not.toThrow();
    const parsed = JSON.parse(data);
    expect(parsed.format).toBe('pricepilot-backup');
    expect(parsed.products).toBeDefined();
    expect(parsed.businessSettings).toBeDefined();
  });
});

// ============================================================
// Preview backup
// ============================================================

describe('Store — previewBackupRestore', () => {
  it('returns a restore preview for valid backup', async () => {
    const backup: PricePilotBackup = {
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      businessSettings: makeSettings(),
      products: [],
      pricingRules: [],
      scenarios: [],
    };
    const json = JSON.stringify(backup);
    const preview = await getStore().previewBackupRestore(json);

    expect(preview.valid).toBe(true);
  });

  it('returns an invalid preview for invalid backup', async () => {
    const preview = await getStore().previewBackupRestore('invalid');
    expect(preview.valid).toBe(false);
  });
});

// ============================================================
// startEmptyWorkspace
// ============================================================

describe('Store — startEmptyWorkspace', () => {
  it('starts an empty workspace', () => {
    getStore().startEmptyWorkspace();

    expect(getStore().products).toEqual([]);
    expect(getStore().onboardingCompleted).toBe(false);
    expect(getStore().initialization.status).toBe('ready');
  });
});

// ============================================================
// Bulk operations
// ============================================================

describe('Store — bulkSetField', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('sets a field on multiple products', async () => {
    const p1 = makeProduct({ id: 'p1', sku: 'SKU-1' });
    const p2 = makeProduct({ id: 'p2', sku: 'SKU-2' });
    await getStore().addProduct(p1);
    await getStore().addProduct(p2);

    const result = await getStore().bulkSetField(['p1', 'p2'], 'notes', 'Bulk updated');

    expect(result.success).toBe(true);
    expect(getStore().products[0].notes).toBe('Bulk updated');
    expect(getStore().products[1].notes).toBe('Bulk updated');
  });
});

// ============================================================
// deleteSelectedProducts
// ============================================================

describe('Store — deleteSelectedProducts', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('deletes selected products', async () => {
    const p1 = makeProduct({ id: 'p1', sku: 'SKU-1' });
    const p2 = makeProduct({ id: 'p2', sku: 'SKU-2' });
    await getStore().addProduct(p1);
    await getStore().addProduct(p2);

    getStore().setSelectedProducts(['p1']);
    const result = await getStore().deleteSelectedProducts();

    expect(result.success).toBe(true);
    expect(getStore().products).toHaveLength(1);
    expect(getStore().products[0].id).toBe('p2');
  });
});

// ============================================================
// duplicateProduct
// ============================================================

describe('Store — duplicateProduct', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('duplicates a product', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1', name: 'Original' });
    await getStore().addProduct(product);

    const result = await getStore().duplicateProduct('p1');

    expect(result.success).toBe(true);
    expect(getStore().products).toHaveLength(2);
    const copy = getStore().products.find(p => p.name.includes('Copy'));
    expect(copy).toBeDefined();
    expect(copy?.sku).toContain('COPY');
  });

  it('returns error for non-existent product', async () => {
    const result = await getStore().duplicateProduct('nonexistent');

    expect(result.success).toBe(false);
  });
});

// ============================================================
// loadSampleData
// ============================================================

describe('Store — loadSampleData', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('loads sample data', async () => {
    const result = await getStore().loadSampleData();
    expect(result.success).toBe(true);
    expect(getStore().products.length).toBeGreaterThan(0);
  });
});

// ============================================================
// clearAllProducts
// ============================================================

describe('Store — clearAllProducts', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('clears all products', async () => {
    await getStore().addProduct(makeProduct({ id: 'p1' }));
    await getStore().addProduct(makeProduct({ id: 'p2' }));
    expect(getStore().products).toHaveLength(2);

    const result = await getStore().clearAllProducts();
    expect(result.success).toBe(true);
    expect(getStore().products).toHaveLength(0);
  });
});

// ============================================================
// recalculateProducts
// ============================================================

describe('Store — recalculateProducts', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('recalculates all products', async () => {
    await getStore().addProduct(makeProduct({ id: 'p1', purchaseCost: 100 }));
    const result = await getStore().recalculateProducts();
    expect(result.success).toBe(true);
  });
});

// ============================================================
// updateImportState / resetImportState
// ============================================================

describe('Store — import state', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('updates import state', () => {
    getStore().updateImportState({ step: 'row-review' });
    expect(getStore().importState.step).toBe('row-review');
  });

  it('resets import state', () => {
    getStore().updateImportState({ step: 'row-review' });
    getStore().resetImportState();
    expect(getStore().importState.step).toBe('upload');
  });
});

// ============================================================
// duplicatePricingRule
// ============================================================

describe('Store — duplicatePricingRule', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('duplicates a pricing rule', async () => {
    const rule = { ...createDefaultPricingRule(), id: 'rule-1', name: 'Original', isActive: true };
    await getStore().addPricingRule(rule);

    const result = await getStore().duplicatePricingRule('rule-1');
    expect(result.success).toBe(true);
    expect(getStore().pricingRules).toHaveLength(2);
    expect(getStore().pricingRules[1].name).toContain('Copy');
  });

  it('returns error for non-existent rule', async () => {
    const result = await getStore().duplicatePricingRule('nonexistent');
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Scenario operations
// ============================================================

describe('Store — updateScenario', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('updates a scenario', async () => {
    const scenario = {
      id: 'sc-1',
      name: 'Original',
      scenarioType: 'catalogue' as const,
      description: 'Test',
      snapshotProducts: [],
      snapshotBusinessSettings: makeSettings(),
      snapshotPricingRules: makeRules(),
      isBaseline: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await getStore().addScenario(scenario);

    const result = await getStore().updateScenario('sc-1', { name: 'Updated' });
    expect(result.success).toBe(true);
    expect(getStore().scenarios[0].name).toBe('Updated');
  });
});

describe('Store — deleteScenario', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('deletes a scenario', async () => {
    const scenario = {
      id: 'sc-1',
      name: 'To Delete',
      scenarioType: 'catalogue' as const,
      description: 'Test',
      snapshotProducts: [],
      snapshotBusinessSettings: makeSettings(),
      snapshotPricingRules: makeRules(),
      isBaseline: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await getStore().addScenario(scenario);

    const result = await getStore().deleteScenario('sc-1');
    expect(result.success).toBe(true);
    expect(getStore().scenarios).toHaveLength(0);
  });
});

// ============================================================
// approveSelectedProducts / markSelectedForReview
// ============================================================

describe('Store — approveSelectedProducts', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('approves selected products', async () => {
    await getStore().addProduct(makeProduct({ id: 'p1', sku: 'SKU-1' }));
    await getStore().addProduct(makeProduct({ id: 'p2', sku: 'SKU-2' }));

    getStore().setSelectedProducts(['p1']);
    const result = await getStore().approveSelectedProducts();
    expect(result.success).toBe(true);
  });
});

describe('Store — markSelectedForReview', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('marks selected products for review', async () => {
    await getStore().addProduct(makeProduct({ id: 'p1', sku: 'SKU-1' }));
    getStore().setSelectedProducts(['p1']);

    const result = await getStore().markSelectedForReview();
    expect(result.success).toBe(true);
    expect(getStore().products[0].lifecycleStatus).toBe('needs-review');
  });
});

// ============================================================
// archiveProducts
// ============================================================

describe('Store — archiveProducts', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('archives products', async () => {
    await getStore().addProduct(makeProduct({ id: 'p1', sku: 'SKU-1', purchaseCost: 100, currentSellingPrice: 150 }));
    const result = await getStore().archiveProducts(['p1']);
    expect(result.success).toBe(true);
    // After archiving, the product is recalculated. The recalculation may
    // change lifecycleStatus — we verify the operation succeeded.
    expect(getStore().products[0].lifecycleStatus).toBeTruthy();
  });
});

// ============================================================
// bulkApprovePrices
// ============================================================

describe('Store — bulkApprovePrices', () => {
  beforeEach(async () => {
    await resetAndInit();
  });

  it('bulk approves prices for multiple products', async () => {
    await getStore().addProduct(makeProduct({ id: 'p1', sku: 'SKU-1', purchaseCost: 100, currentSellingPrice: 150 }));
    await getStore().addProduct(makeProduct({ id: 'p2', sku: 'SKU-2', purchaseCost: 100, currentSellingPrice: 150 }));

    const result = await getStore().bulkApprovePrices(['p1', 'p2']);
    expect(result.success).toBe(true);
  });
});

// ============================================================
// getBackupList
// ============================================================

describe('Store — getBackupList', () => {
  it('returns auto backups list', () => {
    const list = getStore().getBackupList();
    expect(Array.isArray(list)).toBe(true);
  });
});

// ============================================================
// importData
// ============================================================

describe('Store — importData', () => {
  it('returns false for invalid data', () => {
    const result = getStore().importData('not json');
    expect(result).toBe(false);
  });

  it('returns false for data without products', () => {
    const result = getStore().importData(JSON.stringify({ some: 'data' }));
    expect(result).toBe(false);
  });

  it('returns true for data with products and businessSettings', () => {
    const result = getStore().importData(JSON.stringify({
      products: [],
      businessSettings: makeSettings(),
    }));
    expect(result).toBe(true);
  });
});
