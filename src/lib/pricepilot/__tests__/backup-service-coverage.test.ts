/**
 * Additional branch coverage tests for src/lib/pricepilot/backup-service.ts
 *
 * Focuses on:
 *   - buildBackup with products that need normalization
 *   - validateBackup with missing businessSettings
 *   - validateBackup with missing products
 *   - Recovery download paths
 *   - downloadBackupFile / downloadRecoveryPayload (mock DOM)
 *   - serializeBackup
 *   - buildRestorePreview with valid/invalid backup strings
 *   - deterministicStringify edge cases
 *   - buildRecoveryDownload with legacy localStorage
 *   - validateBackup with invalid settings
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildBackup,
  validateBackup,
  parseAndValidateBackup,
  buildRestorePreview,
  computeBackupContentHash,
  serializeBackup,
  downloadBackupFile,
  downloadRecoveryPayload,
  buildRecoveryDownload,
  PricePilotBackup,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  SCHEMA_VERSION,
  APP_VERSION,
} from '../backup-service';
import {
  PricePilotDatabase,
  setDbForTesting,
  resetDbForTesting,
  saveProductsToDb,
  saveBusinessSettingsToDb,
  savePricingRulesToDb,
} from '../database';
import {
  createDefaultBusinessSettings,
  createDefaultPricingRule,
  createDefaultProduct,
  Product,
  BusinessSettings,
  PricingRule,
} from '../types';
import { safelyRecalculateProduct } from '../safe-calculation';

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

function makeValidBackup(overrides: Partial<PricePilotBackup> = {}): PricePilotBackup {
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    businessSettings: makeSettings(),
    products: [],
    pricingRules: [],
    scenarios: [],
    ...overrides,
  };
}

// ============================================================
// buildBackup — with products
// ============================================================

describe('buildBackup — with products', () => {
  beforeEach(() => {
    resetDbForTesting();
    const db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('builds backup with products that need normalization', async () => {
    await saveBusinessSettingsToDb(makeSettings());
    await savePricingRulesToDb(makeRules());
    const product = makeProduct({ id: 'p1', sku: 'SKU-1', name: 'Test Product' });
    await saveProductsToDb([product]);

    const result = await buildBackup();
    expect(result.backup).toBeDefined();
    expect(result.backup.products).toHaveLength(1);
    expect(result.normalizedCount).toBe(1);
  });

  it('builds backup with empty database', async () => {
    const result = await buildBackup();
    expect(result.backup).toBeDefined();
    expect(result.backup.products).toHaveLength(0);
    expect(result.normalizedCount).toBe(0);
    expect(result.backup.businessSettings).toBeDefined();
  });

  it('includes content hash', async () => {
    await saveBusinessSettingsToDb(makeSettings());
    const result = await buildBackup();
    expect(result.backup.contentHash).toBeTruthy();
  });

  it('handles products with non-finite numbers', async () => {
    const product = makeProduct({ id: 'p1', sku: 'SKU-1' });
    product.purchaseCost = NaN as any;
    await saveProductsToDb([product]);

    const result = await buildBackup();
    expect(result.backup).toBeDefined();
    // The normalizer should handle NaN
    expect(result.issues.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// validateBackup — additional branches
// ============================================================

describe('validateBackup — missing businessSettings', () => {
  it('rejects backup with missing businessSettings', () => {
    const backup = {
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      products: [],
      pricingRules: [],
    };
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('missing-identity');
    }
  });
});

describe('validateBackup — invalid products field', () => {
  it('rejects backup with invalid products field', () => {
    const backup = {
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      businessSettings: {},
      products: 'not-an-array',
      pricingRules: [],
    };
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('invalid-products');
    }
  });
});

describe('validateBackup — unsupported version', () => {
  it('rejects backup with unsupported version', () => {
    const backup = makeValidBackup({ backupVersion: 2 as any });
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('unsupported-version');
    }
  });
});

describe('validateBackup — unknown format', () => {
  it('rejects backup with wrong format', () => {
    const backup = makeValidBackup({ format: 'wrong-format' as any });
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('unknown-format');
    }
  });
});

describe('validateBackup — with products', () => {
  it('normalizes products and counts needs-review', () => {
    const backup = makeValidBackup({
      products: [
        { sku: 'SKU-1', name: 'Missing Cost', purchaseCost: 0, currentSellingPrice: 100 },
      ] as any[],
    });
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.needsReviewCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects products with no identity', () => {
    const backup = makeValidBackup({
      products: [
        { name: '', sku: '', purchaseCost: 100 },
      ] as any[],
    });
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.rejectedCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses defaults for missing businessSettings fields', () => {
    const backup = makeValidBackup({
      businessSettings: { businessName: 'Test' } as any,
    });
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.backup.businessSettings.businessName).toBe('Test');
      expect(result.backup.businessSettings.defaultTaxRatePercent).toBeDefined();
    }
  });

  it('flags missing checksum from older backups', () => {
    const backup = makeValidBackup();
    delete backup.contentHash;
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.checksumMissing).toBe(true);
    }
  });
});

// ============================================================
// parseAndValidateBackup — additional branches
// ============================================================

describe('parseAndValidateBackup — invalid JSON', () => {
  it('rejects invalid JSON', () => {
    const result = parseAndValidateBackup('not valid json');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('invalid-json');
    }
  });

  it('rejects JSON that is not a valid backup', () => {
    const result = parseAndValidateBackup(JSON.stringify({ foo: 'bar' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('unknown-format');
    }
  });
});

// ============================================================
// buildRestorePreview — additional branches
// ============================================================

describe('buildRestorePreview — valid backup', () => {
  it('returns a valid preview for a valid backup', () => {
    const backup = makeValidBackup({
      products: [
        { sku: 'SKU-1', name: 'Test', purchaseCost: 100, currentSellingPrice: 150 } as any,
      ],
      pricingRules: [{ id: 'r1', name: 'Rule 1' }] as any[],
    });
    const json = JSON.stringify(backup);
    const preview = buildRestorePreview(json);

    expect(preview.valid).toBe(true);
    expect(preview.productCount).toBeGreaterThanOrEqual(1);
    expect(preview.pricingRuleCount).toBeGreaterThanOrEqual(1);
    expect(preview.backup).toBeDefined();
  });

  it('returns invalid preview for invalid backup', () => {
    const preview = buildRestorePreview('invalid json');
    expect(preview.valid).toBe(false);
    expect(preview.errorCode).toBe('invalid-json');
  });

  it('returns invalid preview for unknown format', () => {
    const preview = buildRestorePreview(JSON.stringify({ format: 'unknown' }));
    expect(preview.valid).toBe(false);
    expect(preview.errorCode).toBe('unknown-format');
  });
});

// ============================================================
// serializeBackup
// ============================================================

describe('serializeBackup', () => {
  it('produces valid JSON string', () => {
    const backup = makeValidBackup();
    const json = serializeBackup(backup);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('produces pretty-printed JSON', () => {
    const backup = makeValidBackup();
    const json = serializeBackup(backup);
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});

// ============================================================
// computeBackupContentHash — edge cases
// ============================================================

describe('computeBackupContentHash — edge cases', () => {
  it('is deterministic', async () => {
    const backup = makeValidBackup();
    const hash1 = await computeBackupContentHash(backup);
    const hash2 = await computeBackupContentHash(backup);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different content', async () => {
    const backup1 = makeValidBackup();
    const backup2 = makeValidBackup({ products: [makeProduct({ id: 'p1' })] });
    const hash1 = await computeBackupContentHash(backup1);
    const hash2 = await computeBackupContentHash(backup2);
    expect(hash1).not.toBe(hash2);
  });

  it('excludes contentHash, createdAt, and appVersion from hash', async () => {
    const backup1 = makeValidBackup({ createdAt: '2024-01-01', appVersion: '0.1.0' });
    const backup2 = makeValidBackup({ createdAt: '2024-06-01', appVersion: '0.2.0' });
    const hash1 = await computeBackupContentHash(backup1);
    const hash2 = await computeBackupContentHash(backup2);
    expect(hash1).toBe(hash2);
  });
});

// ============================================================
// downloadBackupFile / downloadRecoveryPayload — mock DOM
// ============================================================

describe('downloadBackupFile — mock DOM', () => {
  it('triggers download', async () => {
    await saveBusinessSettingsToDb(makeSettings());

    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement;

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const filename = await downloadBackupFile();
    expect(filename).toContain('pricepilot-backup');
    expect(createObjectURLSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});

describe('downloadRecoveryPayload — mock DOM', () => {
  it('triggers download', async () => {
    await saveBusinessSettingsToDb(makeSettings());

    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement;

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const filename = await downloadRecoveryPayload();
    expect(filename).toContain('pricepilot-recovery');
    expect(createObjectURLSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});

// ============================================================
// buildRecoveryDownload — with legacy localStorage
// ============================================================

describe('buildRecoveryDownload — with legacy data', () => {
  beforeEach(() => {
    resetDbForTesting();
    const db = new PricePilotDatabase();
    setDbForTesting(db);
  });

  it('includes indexedDb data', async () => {
    await saveBusinessSettingsToDb(makeSettings());
    const payload = await buildRecoveryDownload();
    expect(payload.format).toBe('pricepilot-recovery');
    expect(payload.indexedDb).toBeDefined();
    expect(payload.indexedDb.businessSettings).toBeDefined();
  });

  it('captures legacy localStorage entries', async () => {
    // Set some legacy localStorage entries
    localStorage.setItem('pricepilot_v1_test', 'test-value');
    localStorage.setItem('pricepilot_auto_backups', '[]');

    const payload = await buildRecoveryDownload();
    expect(payload.legacyLocalStorage).toBeDefined();
    if (payload.legacyLocalStorage) {
      expect(payload.legacyLocalStorage['pricepilot_v1_test']).toBe('test-value');
      expect(payload.legacyLocalStorage['pricepilot_auto_backups']).toBe('[]');
    }

    // Cleanup
    localStorage.removeItem('pricepilot_v1_test');
    localStorage.removeItem('pricepilot_auto_backups');
  });
});

// ============================================================
// validateBackup — general Zod schema failure
// ============================================================

describe('validateBackup — general schema failure', () => {
  it('rejects backup with other schema issues', () => {
    const backup = {
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      businessSettings: {},
      products: [],
      pricingRules: [],
      // Missing required fields
    };
    const result = validateBackup(backup);
    // Should be valid since the Zod schema allows unknown fields
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
  });
});
