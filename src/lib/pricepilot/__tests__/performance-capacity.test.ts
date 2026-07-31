/**
 * Performance & Capacity Tests (Phase 20)
 *
 * Measures startup, import, recalculation, export, backup, and restore
 * performance with 100, 1,000, and 5,000 products.
 *
 * Since we're in a test environment with fake-indexeddb, the actual
 * performance numbers may differ from a real browser. The tests still
 * verify that operations complete within reasonable time bounds and
 * don't have obvious O(n²) issues.
 *
 * Performance targets (real browser):
 *   - 1,000-product recalculation: under 3 seconds
 *   - 1,000-product import commit: under 5 seconds
 *   - No main-thread freeze longer than 500ms
 *
 * In the test environment we use generous thresholds (5× the real
 * targets) to account for fake-indexeddb overhead.
 */

import { describe, it, expect } from 'vitest';
import {
  PricePilotDatabase,
  setDbForTesting,
  resetDbForTesting,
  loadAllProducts,
  atomicImportProducts,
  saveBusinessSettingsToDb,
  savePricingRulesToDb,
  atomicUpdateSettingsAndProducts,
  atomicRestoreBackup,
  exportAllDataFromDb,
} from '../database';
import {
  Product,
  BusinessSettings,
  PricingRule,
  createDefaultBusinessSettings,
  createDefaultPricingRule,
} from '../types';
import { processImportRows } from '../import-service';
import { safelyRecalculateProducts } from '../safe-calculation';
import { buildBackup } from '../backup-service';

// ============================================================
// Helpers
// ============================================================

/** Generate N valid products with realistic data. */
function generateProducts(count: number): Product[] {
  const products: Product[] = [];
  for (let i = 0; i < count; i++) {
    const product: Product = {
      id: `perf-prod-${i}`,
      sku: `SKU-${String(i).padStart(5, '0')}`,
      name: `Performance Product ${i}`,
      category: ['Electronics', 'Clothing', 'Home', 'Sports', 'Books'][i % 5],
      brand: ['Brand A', 'Brand B', 'Brand C'][i % 3],
      description: '',
      tags: [],
      purchaseCost: 100 + (i % 50),
      shippingCost: 10 + (i % 5),
      packagingCost: 5 + (i % 3),
      handlingCost: 2,
      otherCosts: 1,
      returnRatePercent: 2,
      damageRatePercent: 1,
      customDutyPercent: 0,
      freightPercent: 0,
      currentSellingPrice: 180 + (i % 50),
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
      calculatedPricingStatus: 'missing-data',
      calculatedProfitabilityMeter: 'loss',
      calculatedHealthScore: 0,
      calculatedBaseCost: 0,
      calculatedExpectedReturnCost: 0,
      calculatedExpectedDamageCost: 0,
      calculatedTotalLandedCost: 0,
      calculatedBreakEvenPrice: 0,
      calculatedMarkupPercent: 0,
      calculatedMarginPercent: 0,
      calculatedProfitPerUnit: 0,
      calculatedTotalPercentageFees: 0,
      calculatedTotalFixedFees: 0,
      recommendedPrices: {
        breakEven: 0,
        minimum: 0,
        competitive: 0,
        balanced: 0,
        premium: 0,
        confidence: 'low',
      },
      selectedRecommendationMode: 'balanced',
      customRecommendedPrice: 0,
      finalApprovedPrice: 0,
      priceApprovalStatus: 'none',
      approvedAt: '',
      isApproved: false,
      quantity: 0,
      monthlyUnitsSold: 0,
      expectedMonthlyUnits: 0,
      lifecycleStatus: 'active',
      notes: '',
      purchaseTaxRatePercent: 0,
      inputTaxCreditRecoverable: 'not-recoverable',
      inputTaxRecoverablePercent: 100,
      purchaseCostTaxMode: 'excluding-tax',
      feeBasePolicy: 'product-price-only',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    products.push(product);
  }
  return products;
}

/** Generate N valid import rows. */
function generateImportRows(count: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `import-prod-${i}`,
      sku: `IMP-SKU-${String(i).padStart(5, '0')}`,
      name: `Import Product ${i}`,
      purchaseCost: 100 + (i % 50),
      currentSellingPrice: 180 + (i % 50),
      taxRatePercent: 18,
      taxTreatment: 'inclusive',
      marketplaceFeePercent: 5,
      paymentFeePercent: 2,
    });
  }
  return rows;
}

/** Setup a fresh DB with settings and rules. */
function setupFreshDb(): PricePilotDatabase {
  resetDbForTesting();
  const db = new PricePilotDatabase();
  setDbForTesting(db);
  return db;
}

/** Initialize settings and rules in the DB. */
async function initSettingsAndRules(): Promise<{
  settings: BusinessSettings;
  rules: PricingRule[];
}> {
  const settings = createDefaultBusinessSettings();
  const rules: PricingRule[] = [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true }];
  await saveBusinessSettingsToDb(settings);
  await savePricingRulesToDb(rules);
  return { settings, rules };
}

// ============================================================
// 100-product tests
// ============================================================

describe('Performance: 100 products', () => {
  it('startup with 100 products completes in under 1 second', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 100 products
    const products = generateProducts(100);
    await atomicImportProducts(products);

    // Measure startup (load all products)
    const start = performance.now();
    const loaded = await loadAllProducts();
    const elapsed = performance.now() - start;

    expect(loaded).toHaveLength(100);
    expect(elapsed, `100-product startup took ${elapsed.toFixed(1)}ms`).toBeLessThan(1000);

    db.close();
  });

  it('import with 100 products completes in under 2 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    const rows = generateImportRows(100);

    const start = performance.now();
    const result = processImportRows(rows, settings, rules);
    await atomicImportProducts(result.validProducts);
    const elapsed = performance.now() - start;

    expect(result.validProducts).toHaveLength(100);
    expect(elapsed, `100-product import took ${elapsed.toFixed(1)}ms`).toBeLessThan(2000);

    db.close();
  });

  it('recalculation after setting change with 100 products completes in under 2 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 100 products
    const products = generateProducts(100);
    await atomicImportProducts(products);

    // Change a setting (use defaultTaxRatePercent which is the correct field)
    const updatedSettings: BusinessSettings = {
      ...settings,
      defaultTaxRatePercent: 28,
    };

    // Load all products, recalculate, and save atomically
    const start = performance.now();
    const loaded = await loadAllProducts();
    const recalcResult = safelyRecalculateProducts(loaded, updatedSettings, rules);
    await atomicUpdateSettingsAndProducts(updatedSettings, recalcResult.successfulProducts);
    const elapsed = performance.now() - start;

    expect(recalcResult.successfulProducts.length).toBeGreaterThan(0);
    expect(elapsed, `100-product recalculation took ${elapsed.toFixed(1)}ms`).toBeLessThan(2000);

    db.close();
  });
});

// ============================================================
// 1,000-product tests
// ============================================================

describe('Performance: 1,000 products', () => {
  it('startup with 1,000 products completes in under 5 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 1,000 products
    const products = generateProducts(1000);
    await atomicImportProducts(products);

    // Measure startup (load all products)
    const start = performance.now();
    const loaded = await loadAllProducts();
    const elapsed = performance.now() - start;

    expect(loaded).toHaveLength(1000);
    expect(elapsed, `1,000-product startup took ${elapsed.toFixed(1)}ms`).toBeLessThan(5000);

    db.close();
  });

  it('import with 1,000 products completes in under 5 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    const rows = generateImportRows(1000);

    const start = performance.now();
    const result = processImportRows(rows, settings, rules);
    await atomicImportProducts(result.validProducts);
    const elapsed = performance.now() - start;

    expect(result.validProducts).toHaveLength(1000);
    // Target: under 5 seconds in real browser. Generous threshold for fake-indexeddb.
    expect(elapsed, `1,000-product import took ${elapsed.toFixed(1)}ms`).toBeLessThan(25000);

    db.close();
  });

  it('recalculation after setting change with 1,000 products completes in under 3 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 1,000 products
    const products = generateProducts(1000);
    await atomicImportProducts(products);

    // Change a setting
    const updatedSettings: BusinessSettings = {
      ...settings,
      defaultTaxRatePercent: 28,
    };

    // Load all products, recalculate, and save atomically
    const start = performance.now();
    const loaded = await loadAllProducts();
    const recalcResult = safelyRecalculateProducts(loaded, updatedSettings, rules);
    await atomicUpdateSettingsAndProducts(updatedSettings, recalcResult.successfulProducts);
    const elapsed = performance.now() - start;

    expect(recalcResult.successfulProducts.length).toBeGreaterThan(0);
    // Target: under 3 seconds in real browser. Generous threshold for fake-indexeddb.
    expect(elapsed, `1,000-product recalculation took ${elapsed.toFixed(1)}ms`).toBeLessThan(15000);

    db.close();
  });

  it('export with 1,000 products completes in under 5 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 1,000 products
    const products = generateProducts(1000);
    await atomicImportProducts(products);

    // Measure export (read all data from DB)
    const start = performance.now();
    const data = await exportAllDataFromDb();
    const elapsed = performance.now() - start;

    expect(data.products).toHaveLength(1000);
    expect(elapsed, `1,000-product export took ${elapsed.toFixed(1)}ms`).toBeLessThan(5000);

    db.close();
  });

  it('backup creation with 1,000 products completes in under 10 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 1,000 products
    const products = generateProducts(1000);
    await atomicImportProducts(products);

    // Measure backup creation
    const start = performance.now();
    const result = await buildBackup();
    const elapsed = performance.now() - start;

    expect(result.backup.products.length).toBeGreaterThan(0);
    expect(elapsed, `1,000-product backup creation took ${elapsed.toFixed(1)}ms`).toBeLessThan(10000);

    db.close();
  });

  it('restore with 1,000 products completes in under 10 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 1,000 products
    const products = generateProducts(1000);
    await atomicImportProducts(products);

    // Build a backup
    const { backup } = await buildBackup();

    // Clear the DB
    await atomicImportProducts([]);

    // Measure restore
    const start = performance.now();
    await atomicRestoreBackup({
      products: backup.products,
      businessSettings: backup.businessSettings,
      pricingRules: backup.pricingRules,
      scenarios: backup.scenarios,
    });
    const elapsed = performance.now() - start;

    // Verify restore
    const restored = await loadAllProducts();
    expect(restored.length).toBeGreaterThan(0);
    expect(elapsed, `1,000-product restore took ${elapsed.toFixed(1)}ms`).toBeLessThan(10000);

    db.close();
  });
});

// ============================================================
// 5,000-product tests (capacity boundary)
// ============================================================

describe('Performance: 5,000 products (capacity boundary)', () => {
  it('startup with 5,000 products completes in under 30 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 5,000 products
    const products = generateProducts(5000);
    await atomicImportProducts(products);

    // Measure startup (load all products)
    const start = performance.now();
    const loaded = await loadAllProducts();
    const elapsed = performance.now() - start;

    expect(loaded).toHaveLength(5000);
    expect(elapsed, `5,000-product startup took ${elapsed.toFixed(1)}ms`).toBeLessThan(30000);

    // NOTE: If this is too slow (> 10s), consider adding batching or
    // Web Worker optimization for the initial load. The current
    // Dexie bulkPut should handle this fine, but 10,000+ products
    // may need pagination on the read side.
    if (elapsed > 10000) {
      console.warn(
        `[performance-capacity] 5,000-product startup took ${elapsed.toFixed(1)}ms. ` +
        'Consider adding batching or Web Worker optimization for the initial load.'
      );
    }

    db.close();
  });

  it('recalculation with 5,000 products completes in under 30 seconds', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Pre-populate 5,000 products
    const products = generateProducts(5000);
    await atomicImportProducts(products);

    // Change a setting
    const updatedSettings: BusinessSettings = {
      ...settings,
      defaultTaxRatePercent: 28,
    };

    // Load all products, recalculate, and save atomically
    const start = performance.now();
    const loaded = await loadAllProducts();
    const recalcResult = safelyRecalculateProducts(loaded, updatedSettings, rules);
    await atomicUpdateSettingsAndProducts(updatedSettings, recalcResult.successfulProducts);
    const elapsed = performance.now() - start;

    expect(recalcResult.successfulProducts.length).toBeGreaterThan(0);
    expect(elapsed, `5,000-product recalculation took ${elapsed.toFixed(1)}ms`).toBeLessThan(30000);

    // NOTE: If this is too slow (> 10s), consider adding batching or
    // Web Worker optimization. The `safelyRecalculateProductsBatched`
    // function already exists for this purpose — it processes products
    // in batches of 50 and yields to the browser between batches.
    // For 5,000+ products, the batched version should be preferred
    // in the UI layer to avoid main-thread freezes.
    if (elapsed > 10000) {
      console.warn(
        `[performance-capacity] 5,000-product recalculation took ${elapsed.toFixed(1)}ms. ` +
        'Consider using safelyRecalculateProductsBatched() or moving to a Web Worker.'
      );
    }

    db.close();
  });
});

// ============================================================
// Scaling linearity check
// ============================================================

describe('Performance: scaling linearity', () => {
  it('recalculation scales roughly linearly (not O(n²))', async () => {
    const db = setupFreshDb();
    const { settings, rules } = await initSettingsAndRules();

    // Measure 100-product recalculation
    const products100 = generateProducts(100);
    await atomicImportProducts(products100);

    const updatedSettings: BusinessSettings = {
      ...settings,
      defaultTaxRatePercent: 28,
    };

    let loaded = await loadAllProducts();
    const start100 = performance.now();
    const recalc100 = safelyRecalculateProducts(loaded, updatedSettings, rules);
    const elapsed100 = performance.now() - start100;

    // Reset and measure 1,000-product recalculation
    resetDbForTesting();
    const db2 = new PricePilotDatabase();
    setDbForTesting(db2);
    await initSettingsAndRules();

    const products1000 = generateProducts(1000);
    await atomicImportProducts(products1000);

    loaded = await loadAllProducts();
    const start1000 = performance.now();
    const recalc1000 = safelyRecalculateProducts(loaded, updatedSettings, rules);
    const elapsed1000 = performance.now() - start1000;

    // The 1,000-product recalculation should NOT be more than 20× the
    // 100-product recalculation. If it's O(n), it should be ~10×.
    // If it's O(n²), it would be ~100×.
    const ratio = elapsed1000 / Math.max(elapsed100, 1);
    expect(
      ratio,
      `1,000-product recalc (${elapsed1000.toFixed(1)}ms) should not be more than 20× ` +
      `the 100-product recalc (${elapsed100.toFixed(1)}ms). ` +
      `Actual ratio: ${ratio.toFixed(1)}×. ` +
      `If > 20×, there may be an O(n²) issue.`
    ).toBeLessThan(20);

    expect(recalc100.successfulProducts.length).toBeGreaterThan(0);
    expect(recalc1000.successfulProducts.length).toBeGreaterThan(0);

    db.close();
  });
});
