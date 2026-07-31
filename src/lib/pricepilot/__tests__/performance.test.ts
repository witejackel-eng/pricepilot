/**
 * Performance tests — measures import and reload times.
 *
 * These are vitest tests (not a standalone script) so they get the
 * fake-indexeddb setup from vitest.setup.ts for free.
 *
 * The thresholds are deliberately generous so they pass on slow CI
 * machines, but they will catch gross regressions (e.g. if a future
 * change accidentally brings back the 10,000-step loop).
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
} from '../database';
import { processImportRows } from '../import-service';
import { createDefaultBusinessSettings, createDefaultPricingRule } from '../types';

function makeValidRow(i: number): Record<string, unknown> {
  return {
    id: `prod-perf-${i}`,
    sku: `SKU-${String(i).padStart(5, '0')}`,
    name: `Performance Test Product ${i}`,
    purchaseCost: 100 + (i % 50),
    currentSellingPrice: 150 + (i % 50),
    taxRatePercent: 18,
    taxTreatment: 'inclusive',
    marketplaceFeePercent: 5,
    paymentFeePercent: 2,
  };
}

describe('Performance: import and reload', () => {
  it('imports 100 products in under 2 seconds', async () => {
    resetDbForTesting();
    const db = new PricePilotDatabase();
    setDbForTesting(db);

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 100; i++) rows.push(makeValidRow(i));

    const settings = createDefaultBusinessSettings();
    const rules = [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true }];
    await saveBusinessSettingsToDb(settings);
    await savePricingRulesToDb(rules);

    const start = performance.now();
    const result = processImportRows(rows, settings, rules);
    await atomicImportProducts(result.validProducts);
    const elapsed = performance.now() - start;

    expect(result.validProducts).toHaveLength(100);
    // Generous threshold — 100 products should be well under 2s even on slow CI.
    expect(elapsed, `100-product import took ${elapsed.toFixed(1)}ms`).toBeLessThan(2000);

    db.close();
  });

  it('imports 1000 products in under 15 seconds', async () => {
    resetDbForTesting();
    const db = new PricePilotDatabase();
    setDbForTesting(db);

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) rows.push(makeValidRow(i));

    const settings = createDefaultBusinessSettings();
    const rules = [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true }];
    await saveBusinessSettingsToDb(settings);
    await savePricingRulesToDb(rules);

    const start = performance.now();
    const result = processImportRows(rows, settings, rules);
    await atomicImportProducts(result.validProducts);
    const elapsed = performance.now() - start;

    expect(result.validProducts).toHaveLength(1000);
    // 1000 products should be under 15s. If this regresses, the
    // 10,000-step loop has probably come back.
    expect(elapsed, `1000-product import took ${elapsed.toFixed(1)}ms`).toBeLessThan(15000);

    db.close();
  });

  it('reloads 1000 products from IndexedDB in under 1 second', async () => {
    resetDbForTesting();
    const db = new PricePilotDatabase();
    setDbForTesting(db);

    // Pre-populate.
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) rows.push(makeValidRow(i));
    const settings = createDefaultBusinessSettings();
    const rules = [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true }];
    await saveBusinessSettingsToDb(settings);
    await savePricingRulesToDb(rules);
    const result = processImportRows(rows, settings, rules);
    await atomicImportProducts(result.validProducts);

    const start = performance.now();
    const reloaded = await loadAllProducts();
    const elapsed = performance.now() - start;

    expect(reloaded).toHaveLength(1000);
    expect(elapsed, `Reload of 1000 products took ${elapsed.toFixed(1)}ms`).toBeLessThan(1000);

    db.close();
  });
});
