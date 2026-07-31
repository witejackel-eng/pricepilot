/**
 * Tests for approval invalidation (Phase 10 + Phase 8 product-specific).
 */
import { describe, it, expect } from 'vitest';
import {
  invalidateApproval,
  shouldInvalidateApproval,
  invalidateIfStale,
  invalidateApprovalsForSettingsChange,
  invalidateApprovalsForRulesChange,
  extractEffectivePricingInputs,
  haveEffectivePricingInputsChanged,
  FINANCIAL_DEPENDENCIES,
  SETTINGS_FINANCIAL_DEPENDENCIES,
} from '../approval-invalidation';
import {
  Product,
  BusinessSettings,
  PricingRule,
  createDefaultProduct,
  createDefaultBusinessSettings,
  createDefaultPricingRule,
} from '../types';

// ============================================================
// Helpers
// ============================================================

function makeProduct(overrides: Partial<Product> = {}): Product {
  return { ...createDefaultProduct(), id: 'p1', name: 'Test', sku: 'TEST-001', ...overrides } as Product;
}

function makeApprovedProduct(overrides: Partial<Product> = {}): Product {
  return makeProduct({
    priceApprovalStatus: 'approved',
    finalApprovedPrice: 150,
    approvedAt: '2026-01-01T00:00:00.000Z',
    isApproved: true,
    lifecycleStatus: 'approved',
    ...overrides,
  });
}

function makeSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return { ...createDefaultBusinessSettings(), ...overrides };
}

function makeRule(overrides: Partial<PricingRule> = {}): PricingRule {
  return { ...createDefaultPricingRule(), id: 'rule-1', name: 'Test Rule', ...overrides };
}

// ============================================================
// Existing tests: invalidateApproval
// ============================================================

describe('invalidateApproval', () => {
  it('clears all approval fields and sets needs-review', () => {
    const before = makeApprovedProduct();
    const after = invalidateApproval(before);
    expect(after.priceApprovalStatus).toBe('none');
    expect(after.finalApprovedPrice).toBe(0);
    expect(after.approvedAt).toBe('');
    expect(after.isApproved).toBe(false);
    expect(after.lifecycleStatus).toBe('needs-review');
  });

  it('does not mutate the input', () => {
    const before = makeApprovedProduct();
    invalidateApproval(before);
    expect(before.priceApprovalStatus).toBe('approved');
    expect(before.finalApprovedPrice).toBe(150);
  });
});

// ============================================================
// Existing tests: shouldInvalidateApproval
// ============================================================

describe('shouldInvalidateApproval', () => {
  it('returns true when a financial field changes', () => {
    const before = makeProduct({ purchaseCost: 100 });
    const after = makeProduct({ purchaseCost: 110 });
    expect(shouldInvalidateApproval(before, after)).toBe(true);
  });

  it('returns true when any financial field changes', () => {
    for (const field of FINANCIAL_DEPENDENCIES) {
      const before = makeProduct({ [field]: 1 } as Partial<Product>);
      const after = makeProduct({ [field]: 2 } as Partial<Product>);
      expect(shouldInvalidateApproval(before, after)).toBe(true);
    }
  });

  it('returns false when no financial field changes', () => {
    const before = makeProduct({ purchaseCost: 100, name: 'A' });
    const after = makeProduct({ purchaseCost: 100, name: 'B' });
    expect(shouldInvalidateApproval(before, after)).toBe(false);
  });

  it('handles floating-point near-equality (within 1e-9 epsilon)', () => {
    const before = makeProduct({ purchaseCost: 100.0000000001 });
    const after = makeProduct({ purchaseCost: 100.0000000002 });
    expect(shouldInvalidateApproval(before, after)).toBe(false);
  });

  it('handles string fields like taxTreatment', () => {
    const before = makeProduct({ taxTreatment: 'inclusive' });
    const after = makeProduct({ taxTreatment: 'exclusive' });
    expect(shouldInvalidateApproval(before, after)).toBe(true);
  });
});

// ============================================================
// Existing tests: invalidateIfStale
// ============================================================

describe('invalidateIfStale', () => {
  it('invalidates when an approval exists and a financial field changed', () => {
    const before = makeProduct({
      purchaseCost: 100,
      priceApprovalStatus: 'approved',
      finalApprovedPrice: 150,
    });
    const after = makeProduct({
      purchaseCost: 110,
      priceApprovalStatus: 'approved',
      finalApprovedPrice: 150,
    });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('none');
    expect(result.finalApprovedPrice).toBe(0);
  });

  it('does NOT invalidate when no approval exists', () => {
    const before = makeProduct({ purchaseCost: 100, priceApprovalStatus: 'none' });
    const after = makeProduct({ purchaseCost: 110, priceApprovalStatus: 'none' });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('none');
    expect(result.finalApprovedPrice).toBe(0);
  });

  it('does NOT invalidate when an approval exists but nothing changed', () => {
    const before = makeProduct({
      purchaseCost: 100,
      priceApprovalStatus: 'approved',
      finalApprovedPrice: 150,
      name: 'A',
    });
    const after = makeProduct({
      purchaseCost: 100,
      priceApprovalStatus: 'approved',
      finalApprovedPrice: 150,
      name: 'B', // non-financial change
    });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('approved');
    expect(result.finalApprovedPrice).toBe(150);
  });
});

// ============================================================
// Product-specific: invalidateApprovalsForSettingsChange
// ============================================================

describe('invalidateApprovalsForSettingsChange', () => {
  it('invalidates products whose effective pricing inputs changed', () => {
    const products = [makeApprovedProduct({ id: 'p1' })];
    const oldSettings = makeSettings({ defaultTargetMarginPercent: 25 });
    const newSettings = makeSettings({ defaultTargetMarginPercent: 35 });
    const rules: PricingRule[] = [];
    const result = invalidateApprovalsForSettingsChange(products, oldSettings, newSettings, rules);
    expect(result[0].priceApprovalStatus).toBe('none');
    expect(result[0].finalApprovedPrice).toBe(0);
  });

  it('does NOT invalidate products whose effective inputs are unchanged', () => {
    const products = [makeApprovedProduct({ id: 'p1' })];
    const oldSettings = makeSettings();
    const newSettings = makeSettings({ defaultTargetMarginPercent: 25 }); // same as default
    const rules: PricingRule[] = [];
    const result = invalidateApprovalsForSettingsChange(products, oldSettings, newSettings, rules);
    expect(result[0].priceApprovalStatus).toBe('approved');
    expect(result[0].finalApprovedPrice).toBe(150);
  });

  it('does NOT invalidate products without an active approval', () => {
    const products = [makeProduct({ id: 'p1', priceApprovalStatus: 'none' })];
    const oldSettings = makeSettings({ defaultTargetMarginPercent: 25 });
    const newSettings = makeSettings({ defaultTargetMarginPercent: 35 });
    const rules: PricingRule[] = [];
    const result = invalidateApprovalsForSettingsChange(products, oldSettings, newSettings, rules);
    expect(result[0].priceApprovalStatus).toBe('none');
  });

  it('does not mutate the input', () => {
    const products = [makeApprovedProduct({ id: 'p1' })];
    const oldSettings = makeSettings({ defaultTargetMarginPercent: 25 });
    const newSettings = makeSettings({ defaultTargetMarginPercent: 35 });
    const rules: PricingRule[] = [];
    invalidateApprovalsForSettingsChange(products, oldSettings, newSettings, rules);
    expect(products[0].priceApprovalStatus).toBe('approved');
  });
});

// ============================================================
// Product-specific: invalidateApprovalsForRulesChange
// ============================================================

describe('invalidateApprovalsForRulesChange', () => {
  it('invalidates products whose effective pricing inputs changed due to rule change', () => {
    const products = [makeApprovedProduct({ id: 'p1' })];
    const oldRules: PricingRule[] = [];
    const newRules = [makeRule({ id: 'r1', level: 'global', targetMarginPercent: 50 })];
    const settings = makeSettings();
    const result = invalidateApprovalsForRulesChange(products, oldRules, newRules, settings);
    expect(result[0].priceApprovalStatus).toBe('none');
  });

  it('does NOT invalidate products whose effective inputs are unchanged', () => {
    const products = [makeApprovedProduct({ id: 'p1' })];
    const oldRules = [makeRule({ id: 'r1', level: 'global', targetMarginPercent: 25 })];
    const newRules = [makeRule({ id: 'r1', level: 'global', targetMarginPercent: 25 })];
    const settings = makeSettings();
    const result = invalidateApprovalsForRulesChange(products, oldRules, newRules, settings);
    expect(result[0].priceApprovalStatus).toBe('approved');
  });

  it('does NOT invalidate products without an active approval', () => {
    const products = [makeProduct({ id: 'p1', priceApprovalStatus: 'none' })];
    const oldRules: PricingRule[] = [];
    const newRules = [makeRule({ id: 'r1', level: 'global', targetMarginPercent: 50 })];
    const settings = makeSettings();
    const result = invalidateApprovalsForRulesChange(products, oldRules, newRules, settings);
    expect(result[0].priceApprovalStatus).toBe('none');
  });
});

// ============================================================
// Required Test Cases (Phase 8)
// ============================================================

describe('Phase 8: Product-specific approval invalidation', () => {
  // ----------------------------------------------------------
  // 1. Product cost change invalidates that product
  // ----------------------------------------------------------
  it('product cost change invalidates that product', () => {
    const before = makeApprovedProduct({ id: 'p1', purchaseCost: 100 });
    const after = makeApprovedProduct({ id: 'p1', purchaseCost: 120 });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('none');
    expect(result.finalApprovedPrice).toBe(0);
    expect(result.lifecycleStatus).toBe('needs-review');
  });

  // ----------------------------------------------------------
  // 2. Unrelated product edit does not invalidate another product
  // ----------------------------------------------------------
  it('unrelated product edit does not invalidate another product', () => {
    const p1 = makeApprovedProduct({ id: 'p1', purchaseCost: 100 });
    const p2 = makeApprovedProduct({ id: 'p2', purchaseCost: 200 });
    // p1 is edited (cost change) — only p1 should be invalidated
    const p1After = makeApprovedProduct({ id: 'p1', purchaseCost: 120 });
    const result1 = invalidateIfStale(p1, p1After);
    // p2 is not edited — should remain approved
    expect(p2.priceApprovalStatus).toBe('approved');
    expect(p2.finalApprovedPrice).toBe(150);
    // p1 is invalidated
    expect(result1.priceApprovalStatus).toBe('none');
  });

  // ----------------------------------------------------------
  // 3. Category rule change invalidates only matching category
  // ----------------------------------------------------------
  it('category rule change invalidates only matching category', () => {
    const electronics = makeApprovedProduct({
      id: 'p1', category: 'Electronics', sku: 'E-001',
    });
    const clothing = makeApprovedProduct({
      id: 'p2', category: 'Clothing', sku: 'C-001',
    });

    const oldRules: PricingRule[] = [];
    const newRules = [makeRule({
      id: 'r1', level: 'category', targetCategory: 'Electronics',
      targetMarginPercent: 50, name: 'Electronics Rule',
    })];
    const settings = makeSettings();

    const result = invalidateApprovalsForRulesChange(
      [electronics, clothing], oldRules, newRules, settings,
    );

    // Electronics product is invalidated (category rule now applies)
    expect(result[0].priceApprovalStatus).toBe('none');
    // Clothing product is NOT invalidated (category rule doesn't match)
    expect(result[1].priceApprovalStatus).toBe('approved');
    expect(result[1].finalApprovedPrice).toBe(150);
  });

  // ----------------------------------------------------------
  // 4. Channel rule change invalidates only matching channel
  // ----------------------------------------------------------
  it('channel rule change invalidates only matching channel', () => {
    const online = makeApprovedProduct({
      id: 'p1', salesChannel: 'online-marketplace', sku: 'O-001',
    });
    const retail = makeApprovedProduct({
      id: 'p2', salesChannel: 'retail-store', sku: 'R-001',
    });

    const oldRules: PricingRule[] = [];
    const newRules = [makeRule({
      id: 'r1', level: 'channel', targetChannel: 'online-marketplace',
      targetMarginPercent: 40, name: 'Online Rule',
    })];
    const settings = makeSettings();

    const result = invalidateApprovalsForRulesChange(
      [online, retail], oldRules, newRules, settings,
    );

    // Online product is invalidated
    expect(result[0].priceApprovalStatus).toBe('none');
    // Retail product is NOT invalidated
    expect(result[1].priceApprovalStatus).toBe('approved');
    expect(result[1].finalApprovedPrice).toBe(150);
  });

  // ----------------------------------------------------------
  // 5. Global default change invalidates products using the default
  // ----------------------------------------------------------
  it('global default change invalidates products using the default', () => {
    // Product with no rule override — uses the default target margin
    const product = makeApprovedProduct({ id: 'p1' });

    const oldSettings = makeSettings({ defaultTargetMarginPercent: 25 });
    const newSettings = makeSettings({ defaultTargetMarginPercent: 40 });
    const rules: PricingRule[] = [];

    const result = invalidateApprovalsForSettingsChange(
      [product], oldSettings, newSettings, rules,
    );

    // Product is invalidated because its effective target margin changed
    expect(result[0].priceApprovalStatus).toBe('none');
    expect(result[0].finalApprovedPrice).toBe(0);
  });

  // ----------------------------------------------------------
  // 6. Product-specific override shields product from unrelated default change
  // ----------------------------------------------------------
  it('product-specific override shields product from unrelated default change', () => {
    // Product with a product-specific rule that overrides target margin
    const product = makeApprovedProduct({ id: 'p1', sku: 'SHIELDED-001' });

    const productRule = makeRule({
      id: 'r1', level: 'product', targetProductSku: 'SHIELDED-001',
      targetMarginPercent: 30, name: 'Product Override',
    });

    const oldSettings = makeSettings({ defaultTargetMarginPercent: 25 });
    const newSettings = makeSettings({ defaultTargetMarginPercent: 40 });
    const rules = [productRule];

    const result = invalidateApprovalsForSettingsChange(
      [product], oldSettings, newSettings, rules,
    );

    // Product is NOT invalidated — its effective target margin comes from
    // the product-specific rule, not the default
    expect(result[0].priceApprovalStatus).toBe('approved');
    expect(result[0].finalApprovedPrice).toBe(150);
  });

  // ----------------------------------------------------------
  // 7. Cosmetic name change does not invalidate approval
  // ----------------------------------------------------------
  it('cosmetic name change does not invalidate approval', () => {
    const before = makeApprovedProduct({ name: 'Widget A' });
    const after = makeApprovedProduct({ name: 'Widget B' });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('approved');
    expect(result.finalApprovedPrice).toBe(150);
  });

  // ----------------------------------------------------------
  // 8. Notes and tags do not invalidate approval
  // ----------------------------------------------------------
  it('notes change does not invalidate approval', () => {
    const before = makeApprovedProduct({ notes: 'Old notes' });
    const after = makeApprovedProduct({ notes: 'New notes' });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('approved');
    expect(result.finalApprovedPrice).toBe(150);
  });

  it('tags change does not invalidate approval', () => {
    const before = makeApprovedProduct({ tags: ['sale'] });
    const after = makeApprovedProduct({ tags: ['clearance', 'sale'] });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('approved');
    expect(result.finalApprovedPrice).toBe(150);
  });

  // ----------------------------------------------------------
  // 9. Import financial update invalidates approval
  // ----------------------------------------------------------
  it('import financial update invalidates approval', () => {
    // Simulates an import that updates a product's purchase cost
    const before = makeApprovedProduct({ purchaseCost: 100 });
    const after = makeApprovedProduct({ purchaseCost: 120 });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('none');
    expect(result.finalApprovedPrice).toBe(0);
    expect(result.lifecycleStatus).toBe('needs-review');
  });

  it('import tax rate change invalidates approval', () => {
    const before = makeApprovedProduct({ taxRatePercent: 18 });
    const after = makeApprovedProduct({ taxRatePercent: 20 });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('none');
  });

  it('import marketplace fee change invalidates approval', () => {
    const before = makeApprovedProduct({ marketplaceFeePercent: 5 });
    const after = makeApprovedProduct({ marketplaceFeePercent: 8 });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('none');
  });

  // ----------------------------------------------------------
  // 10. Fill-missing non-financial update preserves approval
  // ----------------------------------------------------------
  it('fill-missing non-financial update preserves approval', () => {
    // Simulates an import that fills in missing non-financial fields
    const before = makeApprovedProduct({
      description: '',
      brand: '',
      quantity: 0,
      monthlyUnitsSold: 0,
    });
    const after = makeApprovedProduct({
      description: 'New description',
      brand: 'BrandX',
      quantity: 100,
      monthlyUnitsSold: 50,
    });
    const result = invalidateIfStale(before, after);
    expect(result.priceApprovalStatus).toBe('approved');
    expect(result.finalApprovedPrice).toBe(150);
  });

  // ----------------------------------------------------------
  // Additional edge cases
  // ----------------------------------------------------------

  it('category rule update only affects products in that category', () => {
    const electronics = makeApprovedProduct({
      id: 'p1', category: 'Electronics', sku: 'E-001',
    });
    const clothing = makeApprovedProduct({
      id: 'p2', category: 'Clothing', sku: 'C-001',
    });

    const oldRules = [makeRule({
      id: 'r1', level: 'category', targetCategory: 'Electronics',
      targetMarginPercent: 25, name: 'Electronics Rule',
    })];
    const newRules = [makeRule({
      id: 'r1', level: 'category', targetCategory: 'Electronics',
      targetMarginPercent: 45, name: 'Electronics Rule',
    })];
    const settings = makeSettings();

    const result = invalidateApprovalsForRulesChange(
      [electronics, clothing], oldRules, newRules, settings,
    );

    // Electronics product is invalidated (its rule changed)
    expect(result[0].priceApprovalStatus).toBe('none');
    // Clothing product is NOT invalidated (no matching rule changed)
    expect(result[1].priceApprovalStatus).toBe('approved');
  });

  it('deleting a category rule only invalidates products in that category', () => {
    const electronics = makeApprovedProduct({
      id: 'p1', category: 'Electronics', sku: 'E-001',
    });
    const clothing = makeApprovedProduct({
      id: 'p2', category: 'Clothing', sku: 'C-001',
    });

    const oldRules = [makeRule({
      id: 'r1', level: 'category', targetCategory: 'Electronics',
      targetMarginPercent: 50, name: 'Electronics Rule',
    })];
    const newRules: PricingRule[] = []; // Rule deleted
    const settings = makeSettings();

    const result = invalidateApprovalsForRulesChange(
      [electronics, clothing], oldRules, newRules, settings,
    );

    // Electronics product is invalidated (its rule was removed)
    expect(result[0].priceApprovalStatus).toBe('none');
    // Clothing product is NOT invalidated (no matching rule existed)
    expect(result[1].priceApprovalStatus).toBe('approved');
  });

  it('product-specific rule change only invalidates the target product', () => {
    const target = makeApprovedProduct({ id: 'p1', sku: 'TARGET-001' });
    const other = makeApprovedProduct({ id: 'p2', sku: 'OTHER-001' });

    const oldRules = [makeRule({
      id: 'r1', level: 'product', targetProductSku: 'TARGET-001',
      targetMarginPercent: 30, name: 'Product Rule',
    })];
    const newRules = [makeRule({
      id: 'r1', level: 'product', targetProductSku: 'TARGET-001',
      targetMarginPercent: 50, name: 'Product Rule',
    })];
    const settings = makeSettings();

    const result = invalidateApprovalsForRulesChange(
      [target, other], oldRules, newRules, settings,
    );

    // Target product is invalidated
    expect(result[0].priceApprovalStatus).toBe('none');
    // Other product is NOT invalidated
    expect(result[1].priceApprovalStatus).toBe('approved');
  });

  it('global rule change invalidates all products without a higher-priority override', () => {
    const product1 = makeApprovedProduct({ id: 'p1', sku: 'P1' });
    const product2 = makeApprovedProduct({ id: 'p2', sku: 'P2' });

    const oldRules: PricingRule[] = [];
    const newRules = [makeRule({
      id: 'r1', level: 'global',
      targetMarginPercent: 50, name: 'Global Rule',
    })];
    const settings = makeSettings();

    const result = invalidateApprovalsForRulesChange(
      [product1, product2], oldRules, newRules, settings,
    );

    // Both products are invalidated (global rule now applies)
    expect(result[0].priceApprovalStatus).toBe('none');
    expect(result[1].priceApprovalStatus).toBe('none');
  });

  it('product-specific rule shields from global rule change', () => {
    const shielded = makeApprovedProduct({ id: 'p1', sku: 'SHIELDED-001' });
    const unshielded = makeApprovedProduct({ id: 'p2', sku: 'UNSHIELDED-001' });

    // Both products have a product-specific rule that overrides target margin
    const productRule = makeRule({
      id: 'r1', level: 'product', targetProductSku: 'SHIELDED-001',
      targetMarginPercent: 30, name: 'Product Rule',
    });

    const oldRules = [productRule];
    // Global rule is added but the shielded product has a product-specific override
    const newRules = [
      productRule,
      makeRule({
        id: 'r2', level: 'global',
        targetMarginPercent: 50, name: 'Global Rule',
      }),
    ];
    const settings = makeSettings();

    const result = invalidateApprovalsForRulesChange(
      [shielded, unshielded], oldRules, newRules, settings,
    );

    // Shielded product is NOT invalidated (product-specific rule takes priority)
    expect(result[0].priceApprovalStatus).toBe('approved');
    // Unshielded product IS invalidated (global rule now applies)
    expect(result[1].priceApprovalStatus).toBe('none');
  });

  it('settings change to unrelated field does not invalidate approval', () => {
    const product = makeApprovedProduct({ id: 'p1' });

    const oldSettings = makeSettings({ businessName: 'Old Name' });
    const newSettings = makeSettings({ businessName: 'New Name' });
    const rules: PricingRule[] = [];

    const result = invalidateApprovalsForSettingsChange(
      [product], oldSettings, newSettings, rules,
    );

    // Business name is not a financial field — approval preserved
    expect(result[0].priceApprovalStatus).toBe('approved');
  });

  it('rounding rule change invalidates products using the default', () => {
    const product = makeApprovedProduct({ id: 'p1' });

    const oldSettings = makeSettings({ defaultRoundingRule: 'no-rounding' });
    const newSettings = makeSettings({ defaultRoundingRule: 'nearest-whole' });
    const rules: PricingRule[] = [];

    const result = invalidateApprovalsForSettingsChange(
      [product], oldSettings, newSettings, rules,
    );

    expect(result[0].priceApprovalStatus).toBe('none');
  });

  it('fee base policy change invalidates products using the default', () => {
    const product = makeApprovedProduct({ id: 'p1' });

    const oldSettings = makeSettings({ feeBasePolicy: 'product-price-only' });
    const newSettings = makeSettings({ feeBasePolicy: 'product-price-plus-shipping' });
    const rules: PricingRule[] = [];

    const result = invalidateApprovalsForSettingsChange(
      [product], oldSettings, newSettings, rules,
    );

    expect(result[0].priceApprovalStatus).toBe('none');
  });

  it('category rule with rounding override shields from default rounding change', () => {
    const product = makeApprovedProduct({ id: 'p1', category: 'Electronics', sku: 'E-001' });

    const categoryRule = makeRule({
      id: 'r1', level: 'category', targetCategory: 'Electronics',
      roundingRule: 'end-in-99', name: 'Electronics Rounding',
    });

    const oldSettings = makeSettings({ defaultRoundingRule: 'no-rounding' });
    const newSettings = makeSettings({ defaultRoundingRule: 'nearest-whole' });
    const rules = [categoryRule];

    const result = invalidateApprovalsForSettingsChange(
      [product], oldSettings, newSettings, rules,
    );

    // Product is NOT invalidated — its effective rounding comes from the
    // category rule, not the default
    expect(result[0].priceApprovalStatus).toBe('approved');
  });

  it('multiple products: only affected ones are invalidated', () => {
    const p1 = makeApprovedProduct({ id: 'p1', category: 'Electronics', sku: 'E-001' });
    const p2 = makeApprovedProduct({ id: 'p2', category: 'Clothing', sku: 'C-001' });
    const p3 = makeApprovedProduct({ id: 'p3', category: 'Electronics', sku: 'E-002' });

    const oldRules: PricingRule[] = [];
    const newRules = [makeRule({
      id: 'r1', level: 'category', targetCategory: 'Electronics',
      targetMarginPercent: 50, name: 'Electronics Rule',
    })];
    const settings = makeSettings();

    const result = invalidateApprovalsForRulesChange(
      [p1, p2, p3], oldRules, newRules, settings,
    );

    // Electronics products are invalidated
    expect(result[0].priceApprovalStatus).toBe('none');
    expect(result[2].priceApprovalStatus).toBe('none');
    // Clothing product is NOT invalidated
    expect(result[1].priceApprovalStatus).toBe('approved');
  });
});

// ============================================================
// extractEffectivePricingInputs
// ============================================================

describe('extractEffectivePricingInputs', () => {
  it('returns a snapshot with all financially relevant fields', () => {
    const product = makeProduct({ id: 'p1', sku: 'TEST-001' });
    const rules: PricingRule[] = [];
    const settings = makeSettings();

    const inputs = extractEffectivePricingInputs(product, rules, settings);

    // Policy fields
    expect(typeof inputs.targetMarginPercent).toBe('number');
    expect(typeof inputs.minimumMarginPercent).toBe('number');
    expect(typeof inputs.taxRatePercent).toBe('number');
    expect(typeof inputs.taxTreatment).toBe('string');
    expect(typeof inputs.feeBasePolicy).toBe('string');
    expect(typeof inputs.roundingRule).toBe('string');

    // Cost fields
    expect(typeof inputs.effectiveShippingCost).toBe('number');
    expect(typeof inputs.effectivePackagingCost).toBe('number');
  });

  it('reflects rule overrides', () => {
    const product = makeProduct({ id: 'p1', sku: 'TEST-001' });
    const rules = [makeRule({
      id: 'r1', level: 'global', targetMarginPercent: 50, name: 'Override',
    })];
    const settings = makeSettings({ defaultTargetMarginPercent: 25 });

    const inputs = extractEffectivePricingInputs(product, rules, settings);

    // Rule override takes priority
    expect(inputs.targetMarginPercent).toBe(50);
  });

  it('reflects settings defaults when no rule override', () => {
    const product = makeProduct({ id: 'p1', sku: 'TEST-001' });
    const rules: PricingRule[] = [];
    const settings = makeSettings({ defaultTargetMarginPercent: 30 });

    const inputs = extractEffectivePricingInputs(product, rules, settings);

    expect(inputs.targetMarginPercent).toBe(30);
  });
});

// ============================================================
// haveEffectivePricingInputsChanged
// ============================================================

describe('haveEffectivePricingInputsChanged', () => {
  it('returns false for identical inputs', () => {
    const inputs = extractEffectivePricingInputs(
      makeProduct(), [], makeSettings(),
    );
    expect(haveEffectivePricingInputsChanged(inputs, inputs)).toBe(false);
  });

  it('returns true when a numeric field changes', () => {
    const before = extractEffectivePricingInputs(
      makeProduct(), [], makeSettings({ defaultTargetMarginPercent: 25 }),
    );
    const after = extractEffectivePricingInputs(
      makeProduct(), [], makeSettings({ defaultTargetMarginPercent: 30 }),
    );
    expect(haveEffectivePricingInputsChanged(before, after)).toBe(true);
  });

  it('returns true when a string field changes', () => {
    const before = extractEffectivePricingInputs(
      makeProduct(), [], makeSettings({ feeBasePolicy: 'product-price-only' }),
    );
    const after = extractEffectivePricingInputs(
      makeProduct(), [], makeSettings({ feeBasePolicy: 'product-price-plus-shipping' }),
    );
    expect(haveEffectivePricingInputsChanged(before, after)).toBe(true);
  });

  it('returns false for near-equal numeric values (epsilon)', () => {
    // Use a setting that does NOT affect competitorStrategy (which is
    // JSON-stringified and compared as a string, bypassing epsilon).
    const before = extractEffectivePricingInputs(
      makeProduct(), [], makeSettings({ defaultShippingCost: 50.0000000001 }),
    );
    const after = extractEffectivePricingInputs(
      makeProduct(), [], makeSettings({ defaultShippingCost: 50.0000000002 }),
    );
    expect(haveEffectivePricingInputsChanged(before, after)).toBe(false);
  });
});

// ============================================================
// SETTINGS_FINANCIAL_DEPENDENCIES
// ============================================================

describe('SETTINGS_FINANCIAL_DEPENDENCIES', () => {
  it('includes target margin, minimum margin, and minimum profit', () => {
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultTargetMarginPercent');
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultMinimumMarginPercent');
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultMinimumProfitPerUnit');
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultRoundingRule');
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('feeBasePolicy');
  });

  it('includes all tax and fee defaults', () => {
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultTaxRatePercent');
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultMarketplaceFeePercent');
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultPaymentFeePercent');
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultShippingCost');
    expect(SETTINGS_FINANCIAL_DEPENDENCIES).toContain('defaultReturnRatePercent');
  });
});
