/**
 * Tests for approval invalidation (Phase 10).
 */
import { describe, it, expect } from 'vitest';
import {
  invalidateApproval,
  shouldInvalidateApproval,
  invalidateIfStale,
  invalidateApprovalsForSettingsChange,
  invalidateApprovalsForRulesChange,
  FINANCIAL_DEPENDENCIES,
  SETTINGS_FINANCIAL_DEPENDENCIES,
} from '../approval-invalidation';
import { Product, BusinessSettings, createDefaultProduct, createDefaultBusinessSettings } from '../types';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return { ...createDefaultProduct(), id: 'p1', name: 'Test', sku: 'TEST-001', ...overrides } as Product;
}

describe('invalidateApproval', () => {
  it('clears all approval fields and sets needs-review', () => {
    const before = makeProduct({
      priceApprovalStatus: 'approved',
      finalApprovedPrice: 100,
      approvedAt: '2026-01-01T00:00:00.000Z',
      isApproved: true,
      lifecycleStatus: 'approved',
    });
    const after = invalidateApproval(before);
    expect(after.priceApprovalStatus).toBe('none');
    expect(after.finalApprovedPrice).toBe(0);
    expect(after.approvedAt).toBe('');
    expect(after.isApproved).toBe(false);
    expect(after.lifecycleStatus).toBe('needs-review');
  });

  it('does not mutate the input', () => {
    const before = makeProduct({
      priceApprovalStatus: 'approved',
      finalApprovedPrice: 100,
      approvedAt: '2026-01-01T00:00:00.000Z',
      isApproved: true,
    });
    invalidateApproval(before);
    expect(before.priceApprovalStatus).toBe('approved');
    expect(before.finalApprovedPrice).toBe(100);
  });
});

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
    // Difference is 1e-10, below the 1e-9 epsilon threshold.
    expect(shouldInvalidateApproval(before, after)).toBe(false);
  });

  it('handles string fields like taxTreatment', () => {
    const before = makeProduct({ taxTreatment: 'inclusive' });
    const after = makeProduct({ taxTreatment: 'exclusive' });
    expect(shouldInvalidateApproval(before, after)).toBe(true);
  });
});

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

describe('invalidateApprovalsForSettingsChange', () => {
  it('invalidates EVERY approved product', () => {
    const products = [
      makeProduct({ id: 'p1', priceApprovalStatus: 'approved', finalApprovedPrice: 100 }),
      makeProduct({ id: 'p2', priceApprovalStatus: 'none', finalApprovedPrice: 0 }),
      makeProduct({ id: 'p3', priceApprovalStatus: 'approved', finalApprovedPrice: 200 }),
    ];
    const result = invalidateApprovalsForSettingsChange(products);
    expect(result[0].priceApprovalStatus).toBe('none');
    expect(result[0].finalApprovedPrice).toBe(0);
    expect(result[1].priceApprovalStatus).toBe('none'); // was already none
    expect(result[2].priceApprovalStatus).toBe('none');
    expect(result[2].finalApprovedPrice).toBe(0);
  });

  it('does not mutate the input', () => {
    const products = [
      makeProduct({ id: 'p1', priceApprovalStatus: 'approved', finalApprovedPrice: 100 }),
    ];
    invalidateApprovalsForSettingsChange(products);
    expect(products[0].priceApprovalStatus).toBe('approved');
  });
});

describe('invalidateApprovalsForRulesChange', () => {
  it('invalidates EVERY approved product (same as settings change)', () => {
    const products = [
      makeProduct({ id: 'p1', priceApprovalStatus: 'approved', finalApprovedPrice: 100 }),
      makeProduct({ id: 'p2', priceApprovalStatus: 'none' }),
    ];
    const result = invalidateApprovalsForRulesChange(products);
    expect(result[0].priceApprovalStatus).toBe('none');
    expect(result[1].priceApprovalStatus).toBe('none');
  });
});

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
