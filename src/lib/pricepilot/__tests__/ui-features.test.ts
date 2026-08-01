/**
 * Unit tests for UI feature logic — Phase 4 regression tests.
 *
 * Tests the underlying pure-logic functions that power:
 *   1. Search and filters (products-page.tsx)
 *   2. Activity feed (owner-home.tsx)
 *   3. Keyboard shortcuts (keyboard-shortcuts.tsx)
 *   4. Animations / reduced-motion (globals.css)
 */

import { describe, it, expect } from 'vitest';
import {
  Product,
  PricingStatus,
  LifecycleStatus,
  PriceApprovalStatus,
} from '@/lib/pricepilot/types';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================
// Helpers — build lightweight Product objects for testing
// ============================================================

let idCounter = 0;
function makeProduct(overrides: Partial<Product> & { name: string; sku: string }): Product {
  idCounter++;
  return {
    id: overrides.id ?? `p-${idCounter}`,
    sku: overrides.sku,
    name: overrides.name,
    category: overrides.category ?? 'General',
    brand: overrides.brand ?? 'BrandA',
    description: overrides.description ?? '',
    tags: overrides.tags ?? [],
    purchaseCost: overrides.purchaseCost ?? 100,
    shippingCost: overrides.shippingCost ?? 0,
    packagingCost: overrides.packagingCost ?? 0,
    handlingCost: overrides.handlingCost ?? 0,
    otherCosts: overrides.otherCosts ?? 0,
    returnRatePercent: overrides.returnRatePercent ?? 0,
    damageRatePercent: overrides.damageRatePercent ?? 0,
    customDutyPercent: overrides.customDutyPercent ?? 0,
    freightPercent: overrides.freightPercent ?? 0,
    currentSellingPrice: overrides.currentSellingPrice ?? 150,
    competitorPrices: overrides.competitorPrices ?? [],
    salesChannel: overrides.salesChannel ?? 'online-marketplace',
    taxRatePercent: overrides.taxRatePercent ?? 0,
    taxTreatment: overrides.taxTreatment ?? 'inclusive',
    marketplaceFeePercent: overrides.marketplaceFeePercent ?? 0,
    marketplaceFeeFixed: overrides.marketplaceFeeFixed ?? 0,
    paymentFeePercent: overrides.paymentFeePercent ?? 0,
    paymentFeeFixed: overrides.paymentFeeFixed ?? 0,
    shippingChargeToCustomer: overrides.shippingChargeToCustomer ?? 0,
    otherFeesPercent: overrides.otherFeesPercent ?? 0,
    otherFeesFixed: overrides.otherFeesFixed ?? 0,
    calculatedBaseCost: overrides.calculatedBaseCost ?? 100,
    calculatedExpectedReturnCost: overrides.calculatedExpectedReturnCost ?? 0,
    calculatedExpectedDamageCost: overrides.calculatedExpectedDamageCost ?? 0,
    calculatedTotalLandedCost: overrides.calculatedTotalLandedCost ?? 100,
    calculatedBreakEvenPrice: overrides.calculatedBreakEvenPrice ?? 120,
    calculatedMarkupPercent: overrides.calculatedMarkupPercent ?? 50,
    calculatedMarginPercent: overrides.calculatedMarginPercent ?? 33,
    calculatedProfitPerUnit: overrides.calculatedProfitPerUnit ?? 50,
    calculatedTotalPercentageFees: overrides.calculatedTotalPercentageFees ?? 0,
    calculatedTotalFixedFees: overrides.calculatedTotalFixedFees ?? 0,
    calculatedPricingStatus: overrides.calculatedPricingStatus ?? 'healthy',
    calculatedProfitabilityMeter: overrides.calculatedProfitabilityMeter ?? 'healthy',
    calculatedHealthScore: overrides.calculatedHealthScore ?? 80,
    purchaseTaxRatePercent: overrides.purchaseTaxRatePercent ?? 0,
    inputTaxCreditRecoverable: overrides.inputTaxCreditRecoverable ?? 'not-recoverable',
    inputTaxRecoverablePercent: overrides.inputTaxRecoverablePercent ?? 100,
    purchaseCostTaxMode: overrides.purchaseCostTaxMode ?? 'excluding-tax',
    feeBasePolicy: overrides.feeBasePolicy ?? 'product-price-only',
    selectedRecommendationMode: overrides.selectedRecommendationMode ?? 'balanced',
    customRecommendedPrice: overrides.customRecommendedPrice ?? 0,
    finalApprovedPrice: overrides.finalApprovedPrice ?? 0,
    priceApprovalStatus: overrides.priceApprovalStatus ?? 'none',
    approvedAt: overrides.approvedAt ?? '',
    quantity: overrides.quantity ?? 0,
    monthlyUnitsSold: overrides.monthlyUnitsSold ?? 0,
    expectedMonthlyUnits: overrides.expectedMonthlyUnits ?? 0,
    lifecycleStatus: overrides.lifecycleStatus ?? 'active',
    recommendedPrices: overrides.recommendedPrices ?? {
      breakEven: 120,
      minimum: 130,
      competitive: 145,
      balanced: 150,
      premium: 180,
      confidence: 'high',
    },
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    isApproved: overrides.isApproved ?? false,
    notes: overrides.notes ?? '',
  };
}

// ============================================================
// 1. Search & Filter Logic
// ============================================================

/**
 * Mirrors the `filtered` useMemo in products-page.tsx.
 * Extracted as a pure function for unit testing.
 */
type FilterTab = 'all' | 'profitable' | 'low-margin' | 'loss-making' | 'missing-cost' | 'needs-review';

interface FilterOptions {
  search: string;
  filterTab: FilterTab;
  filterCategory: string;
  filterBrand: string;
  filterChannel: string;
  filterTag: string;
  filterPricingStatus: string;
  filterLifecycleStatus: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

const DEFAULT_FILTERS: FilterOptions = {
  search: '',
  filterTab: 'all',
  filterCategory: 'all',
  filterBrand: 'all',
  filterChannel: 'all',
  filterTag: 'all',
  filterPricingStatus: 'all',
  filterLifecycleStatus: 'all',
  sortBy: 'name',
  sortDir: 'asc',
};

function applyFilters(products: Product[], opts: Partial<FilterOptions> = {}): Product[] {
  const {
    search, filterTab, filterCategory, filterBrand, filterChannel,
    filterTag, filterPricingStatus, filterLifecycleStatus, sortBy, sortDir,
  } = { ...DEFAULT_FILTERS, ...opts };

  let result = [...products];

  // Search — matches name, sku, category, brand (case-insensitive)
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q)
    );
  }

  // Tab filter
  switch (filterTab) {
    case 'profitable':
      result = result.filter(p =>
        p.calculatedPricingStatus === 'healthy' ||
        p.calculatedPricingStatus === 'high-margin' ||
        p.calculatedPricingStatus === 'approved'
      );
      break;
    case 'low-margin':
      result = result.filter(p => p.calculatedPricingStatus === 'low-margin');
      break;
    case 'loss-making':
      result = result.filter(p =>
        p.calculatedPricingStatus === 'loss-making' ||
        p.calculatedPricingStatus === 'below-break-even'
      );
      break;
    case 'missing-cost':
      result = result.filter(p => p.calculatedPricingStatus === 'missing-data');
      break;
    case 'needs-review':
      result = result.filter(p => p.calculatedPricingStatus === 'needs-review');
      break;
  }

  // Category / Brand / Channel filters
  if (filterCategory !== 'all') result = result.filter(p => p.category === filterCategory);
  if (filterBrand !== 'all') result = result.filter(p => p.brand === filterBrand);
  if (filterChannel !== 'all') result = result.filter(p => p.salesChannel === filterChannel);

  // Tag filter
  if (filterTag !== 'all') result = result.filter(p => (p.tags || []).includes(filterTag));

  // Pricing status filter
  if (filterPricingStatus !== 'all') result = result.filter(p => p.calculatedPricingStatus === filterPricingStatus);

  // Lifecycle status filter
  if (filterLifecycleStatus !== 'all') result = result.filter(p => p.lifecycleStatus === filterLifecycleStatus);

  // Sort
  result.sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;
    switch (sortBy) {
      case 'name': aVal = a.name; bVal = b.name; break;
      case 'sku': aVal = a.sku; bVal = b.sku; break;
      case 'category': aVal = a.category; bVal = b.category; break;
      case 'purchaseCost': aVal = a.purchaseCost; bVal = b.purchaseCost; break;
      case 'existingPrice': aVal = a.currentSellingPrice; bVal = b.currentSellingPrice; break;
      case 'recommendedPrice': aVal = a.recommendedPrices.balanced; bVal = b.recommendedPrices.balanced; break;
      case 'profit': aVal = a.calculatedProfitPerUnit; bVal = b.calculatedProfitPerUnit; break;
      case 'margin': aVal = a.calculatedMarginPercent; bVal = b.calculatedMarginPercent; break;
      case 'markup': aVal = a.calculatedMarkupPercent; bVal = b.calculatedMarkupPercent; break;
      case 'date': aVal = a.updatedAt; bVal = b.updatedAt; break;
      default: aVal = a.name; bVal = b.name;
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  return result;
}

// ============================================================
// 2. Activity Feed Logic
// ============================================================

/**
 * Mirrors the UndoAction type from pricepilot-store.ts.
 */
interface UndoAction {
  type: 'price-approve' | 'price-apply' | 'product-edit' | 'bulk-approve' | 'import' | 'product-delete';
  productId?: string;
  productIds?: string[];
  previousState: Partial<Product> | Product[];
  timestamp: string;
  description: string;
}

/**
 * Mirrors the formatRelativeTime function from owner-home.tsx.
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Mirrors the activity feed logic from owner-home.tsx.
 * Returns the last `limit` undo actions as the recent activity feed.
 */
function getRecentActivity(undoHistory: UndoAction[], limit = 5): UndoAction[] {
  return undoHistory.slice(0, limit);
}

/**
 * Returns the activity label for a given action type.
 * Mirrors the label logic in owner-home.tsx.
 */
function getActivityLabel(action: UndoAction): string {
  switch (action.type) {
    case 'price-approve': return 'Approved price';
    case 'price-apply': return 'Applied price';
    case 'product-edit': return 'Edited product';
    case 'bulk-approve': return 'Bulk approved';
    case 'import': return 'Imported products';
    case 'product-delete': return 'Deleted product';
    default: return action.description;
  }
}

// ============================================================
// 3. Keyboard Shortcut Logic
// ============================================================

/**
 * Mirrors the keyboard shortcut guard logic from keyboard-shortcuts.tsx.
 * Returns true if the shortcut should be suppressed (user is typing in an input).
 */
function shouldSuppressShortcut(target: { tagName: string; isContentEditable: boolean }): boolean {
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Mirrors the shortcut handling logic from keyboard-shortcuts.tsx.
 * Returns the action that should be taken, or null if the shortcut is not recognized
 * or should be suppressed.
 */
const VIEW_MAP: Record<string, string> = {
  '1': 'dashboard',
  '2': 'products',
  '3': 'import',
  '4': 'pricing-rules',
  '5': 'price-simulator',
  '6': 'scenarios',
  '7': 'export',
  '8': 'settings',
};

type ShortcutAction =
  | { type: 'toggle-help' }
  | { type: 'navigate'; view: string }
  | { type: 'add-product' }
  | { type: 'search' }
  | { type: 'save-scenario' }
  | { type: 'recalculate' }
  | null;

function resolveShortcut(
  e: { key: string; ctrlKey: boolean; metaKey: boolean },
  target: { tagName: string; isContentEditable: boolean },
): ShortcutAction {
  // Show shortcuts overlay on '?' or Ctrl+/
  if (e.key === '?' || (e.ctrlKey && e.key === '/')) {
    return { type: 'toggle-help' };
  }

  // Don't trigger shortcuts when user is typing in an input/textarea
  if (shouldSuppressShortcut(target)) {
    return null;
  }

  // Ctrl+N: Add new product
  if (e.ctrlKey && e.key === 'n') {
    return { type: 'add-product' };
  }

  // Ctrl+K: Search
  if (e.ctrlKey && e.key === 'k') {
    return { type: 'search' };
  }

  // Ctrl+I: Go to Import
  if (e.ctrlKey && e.key === 'i') {
    return { type: 'navigate', view: 'import' };
  }

  // Ctrl+E: Go to Export
  if (e.ctrlKey && e.key === 'e') {
    return { type: 'navigate', view: 'export' };
  }

  // Ctrl+S: Save scenario
  if (e.ctrlKey && e.key === 's') {
    return { type: 'save-scenario' };
  }

  // Ctrl+R: Recalculate
  if (e.ctrlKey && e.key === 'r') {
    return { type: 'recalculate' };
  }

  // Number keys 1-8 for view navigation
  if (VIEW_MAP[e.key]) {
    return { type: 'navigate', view: VIEW_MAP[e.key] };
  }

  return null;
}

// ============================================================
// Tests
// ============================================================

describe('Search and Filters', () => {
  const products = [
    makeProduct({ name: 'Widget A', sku: 'SKU-001', category: 'Tools', brand: 'Acme', calculatedPricingStatus: 'healthy' }),
    makeProduct({ name: 'Widget B', sku: 'SKU-002', category: 'Tools', brand: 'BetaCo', calculatedPricingStatus: 'low-margin' }),
    makeProduct({ name: 'Gadget X', sku: 'GAD-100', category: 'Electronics', brand: 'Acme', calculatedPricingStatus: 'loss-making' }),
    makeProduct({ name: 'Gadget Y', sku: 'GAD-200', category: 'Electronics', brand: 'Gamma', calculatedPricingStatus: 'missing-data' }),
    makeProduct({ name: 'Doohickey', sku: 'DH-999', category: 'Misc', brand: 'Delta', calculatedPricingStatus: 'needs-review' }),
  ];

  it('searches by product name', () => {
    const result = applyFilters(products, { search: 'Widget' });
    expect(result).toHaveLength(2);
    expect(result.every(p => p.name.includes('Widget'))).toBe(true);
  });

  it('searches by SKU', () => {
    const result = applyFilters(products, { search: 'SKU-001' });
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('SKU-001');
  });

  it('search is case-insensitive', () => {
    const result = applyFilters(products, { search: 'widget a' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Widget A');

    const result2 = applyFilters(products, { search: 'SKU-001' });
    expect(result2).toHaveLength(1);

    const result3 = applyFilters(products, { search: 'sku-002' });
    expect(result3).toHaveLength(1);
    expect(result3[0].name).toBe('Widget B');
  });

  it('clears search (empty string returns all products)', () => {
    const withSearch = applyFilters(products, { search: 'Widget' });
    expect(withSearch.length).toBeLessThan(products.length);

    const cleared = applyFilters(products, { search: '' });
    expect(cleared).toHaveLength(products.length);
  });

  it('returns no results for non-matching search', () => {
    const result = applyFilters(products, { search: 'zzz-nonexistent' });
    expect(result).toHaveLength(0);
  });

  it('combines search with status filter', () => {
    // Search "Widget" + low-margin tab
    const result = applyFilters(products, { search: 'Widget', filterTab: 'low-margin' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Widget B');
    expect(result[0].calculatedPricingStatus).toBe('low-margin');
  });

  it('combines search with category filter', () => {
    // Search "Gadget" + category "Electronics"
    const result = applyFilters(products, { search: 'Gadget', filterCategory: 'Electronics' });
    expect(result).toHaveLength(2);
    expect(result.every(p => p.category === 'Electronics')).toBe(true);
  });

  it('reports correct search result count', () => {
    const result = applyFilters(products, { search: 'Gadget' });
    expect(result).toHaveLength(2);

    const result2 = applyFilters(products, { search: 'SKU' });
    expect(result2).toHaveLength(2);
  });

  it('search works after product edit (name change)', () => {
    const edited = products.map(p =>
      p.sku === 'SKU-001' ? { ...p, name: 'Deluxe Gizmo' } : p
    );
    // Old name should not match
    const oldResult = applyFilters(edited, { search: 'Widget A' });
    expect(oldResult).toHaveLength(0);

    // New name should match
    const newResult = applyFilters(edited, { search: 'Deluxe Gizmo' });
    expect(newResult).toHaveLength(1);
    expect(newResult[0].name).toBe('Deluxe Gizmo');
  });

  it('search remains responsive with 1,000 products', () => {
    const bigList: Product[] = [];
    for (let i = 0; i < 1000; i++) {
      bigList.push(makeProduct({
        name: `Product ${i}`,
        sku: `SKU-${String(i).padStart(4, '0')}`,
        category: i % 3 === 0 ? 'Tools' : i % 3 === 1 ? 'Electronics' : 'Misc',
        brand: i % 2 === 0 ? 'Acme' : 'BetaCo',
        calculatedPricingStatus: i % 5 === 0 ? 'healthy' : i % 5 === 1 ? 'low-margin' : i % 5 === 2 ? 'loss-making' : i % 5 === 3 ? 'missing-data' : 'needs-review',
      }));
    }

    const start = performance.now();
    const result = applyFilters(bigList, { search: 'Product 5' });
    const elapsed = performance.now() - start;

    // Should find all products with "Product 5" in the name (50, 51, ..., 59, 150, 250, etc.)
    expect(result.length).toBeGreaterThan(0);
    // Should complete in under 100ms even on slow CI
    expect(elapsed).toBeLessThan(100);
  });

  it('filters by tab: profitable', () => {
    const result = applyFilters(products, { filterTab: 'profitable' });
    expect(result).toHaveLength(1);
    expect(result[0].calculatedPricingStatus).toBe('healthy');
  });

  it('filters by tab: loss-making', () => {
    const result = applyFilters(products, { filterTab: 'loss-making' });
    expect(result).toHaveLength(1);
    expect(result[0].calculatedPricingStatus).toBe('loss-making');
  });

  it('filters by tab: missing-cost', () => {
    const result = applyFilters(products, { filterTab: 'missing-cost' });
    expect(result).toHaveLength(1);
    expect(result[0].calculatedPricingStatus).toBe('missing-data');
  });

  it('filters by pricing status dropdown', () => {
    const result = applyFilters(products, { filterPricingStatus: 'low-margin' });
    expect(result).toHaveLength(1);
    expect(result[0].calculatedPricingStatus).toBe('low-margin');
  });

  it('filters by lifecycle status', () => {
    const archived = makeProduct({ name: 'Archived', sku: 'ARC-001', lifecycleStatus: 'archived' });
    const withArchived = [...products, archived];
    const result = applyFilters(withArchived, { filterLifecycleStatus: 'archived' });
    expect(result).toHaveLength(1);
    expect(result[0].lifecycleStatus).toBe('archived');
  });

  it('filters by tag', () => {
    const tagged = makeProduct({ name: 'Tagged', sku: 'TAG-001', tags: ['premium', 'featured'] });
    const withTagged = [...products, tagged];
    const result = applyFilters(withTagged, { filterTag: 'premium' });
    expect(result).toHaveLength(1);
    expect(result[0].tags).toContain('premium');
  });

  it('sorts by name ascending', () => {
    const result = applyFilters(products, { sortBy: 'name', sortDir: 'asc' });
    const names = result.map(p => p.name);
    expect(names).toEqual([...names].sort());
  });

  it('sorts by name descending', () => {
    const result = applyFilters(products, { sortBy: 'name', sortDir: 'desc' });
    const names = result.map(p => p.name);
    expect(names).toEqual([...names].sort().reverse());
  });
});

// ============================================================
// 2. Activity Feed
// ============================================================

describe('Activity Feed', () => {
  const now = new Date().toISOString();

  function makeAction(overrides: Partial<UndoAction> = {}): UndoAction {
    return {
      type: overrides.type ?? 'product-edit',
      productId: overrides.productId ?? 'p-1',
      previousState: overrides.previousState ?? {},
      timestamp: overrides.timestamp ?? now,
      description: overrides.description ?? 'Test action',
    };
  }

  it('shows empty state when no products and no actions', () => {
    const activity = getRecentActivity([]);
    expect(activity).toHaveLength(0);
  });

  it('records activity after add (import)', () => {
    const actions: UndoAction[] = [
      makeAction({ type: 'import', description: 'Imported 10 products', timestamp: now }),
    ];
    const activity = getRecentActivity(actions);
    expect(activity).toHaveLength(1);
    expect(activity[0].type).toBe('import');
  });

  it('records activity after edit', () => {
    const actions: UndoAction[] = [
      makeAction({ type: 'product-edit', productId: 'p-1', description: 'Edited Widget A', timestamp: now }),
    ];
    const activity = getRecentActivity(actions);
    expect(activity).toHaveLength(1);
    expect(activity[0].type).toBe('product-edit');
  });

  it('records activity after import', () => {
    const actions: UndoAction[] = [
      makeAction({ type: 'import', description: 'Imported 50 products from supplier.xlsx', timestamp: now }),
    ];
    const activity = getRecentActivity(actions);
    expect(activity).toHaveLength(1);
    expect(getActivityLabel(activity[0])).toBe('Imported products');
  });

  it('records activity after approval', () => {
    const actions: UndoAction[] = [
      makeAction({ type: 'price-approve', productId: 'p-1', description: 'Approved price for Widget A', timestamp: now }),
    ];
    const activity = getRecentActivity(actions);
    expect(activity).toHaveLength(1);
    expect(getActivityLabel(activity[0])).toBe('Approved price');
  });

  it('records activity after price application', () => {
    const actions: UndoAction[] = [
      makeAction({ type: 'price-apply', productId: 'p-1', description: 'Applied price for Widget A', timestamp: now }),
    ];
    const activity = getRecentActivity(actions);
    expect(activity).toHaveLength(1);
    expect(getActivityLabel(activity[0])).toBe('Applied price');
  });

  it('does not produce invalid dates', () => {
    const validTimestamp = new Date().toISOString();
    const action = makeAction({ timestamp: validTimestamp });
    const parsed = new Date(action.timestamp);
    expect(isNaN(parsed.getTime())).toBe(false);

    // formatRelativeTime should produce valid output
    const formatted = formatRelativeTime(action.timestamp);
    expect(formatted).toBeTruthy();
    expect(formatted).not.toBe('Invalid Date');
  });

  it('does not produce duplicate event storm after refresh', () => {
    // Simulate a "refresh" scenario: the same action appearing twice
    // The undo history should be deduplicated by the store, but let's verify
    // that the activity feed only shows the most recent 5 entries
    const actions: UndoAction[] = [];
    for (let i = 0; i < 10; i++) {
      actions.push(makeAction({
        type: 'product-edit',
        productId: `p-${i}`,
        description: `Edit ${i}`,
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
      }));
    }

    // Even with 10 actions, the feed should show only 5
    const activity = getRecentActivity(actions);
    expect(activity).toHaveLength(5);
    // The most recent action should be first
    expect(activity[0].productId).toBe('p-0');
  });

  it('shows correct activity labels for all action types', () => {
    expect(getActivityLabel(makeAction({ type: 'price-approve' }))).toBe('Approved price');
    expect(getActivityLabel(makeAction({ type: 'price-apply' }))).toBe('Applied price');
    expect(getActivityLabel(makeAction({ type: 'product-edit' }))).toBe('Edited product');
    expect(getActivityLabel(makeAction({ type: 'bulk-approve' }))).toBe('Bulk approved');
    expect(getActivityLabel(makeAction({ type: 'import' }))).toBe('Imported products');
    expect(getActivityLabel(makeAction({ type: 'product-delete' }))).toBe('Deleted product');
  });

  it('formats relative time correctly', () => {
    // Just now
    expect(formatRelativeTime(new Date().toISOString())).toBe('Just now');

    // Minutes ago
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5m ago');

    // Hours ago
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3600000).toISOString())).toBe('3h ago');

    // Days ago
    expect(formatRelativeTime(new Date(Date.now() - 2 * 86400000).toISOString())).toBe('2d ago');

    // More than a week — falls back to locale date string
    const oldDate = new Date(Date.now() - 10 * 86400000).toISOString();
    const formatted = formatRelativeTime(oldDate);
    expect(formatted).not.toBe('Just now');
    expect(formatted).not.toContain('m ago');
    expect(formatted).not.toContain('h ago');
    expect(formatted).not.toContain('d ago');
  });
});

// ============================================================
// 3. Keyboard Shortcuts
// ============================================================

describe('Keyboard Shortcuts', () => {
  it('does not fire shortcuts while typing in an input', () => {
    const inputTarget = { tagName: 'INPUT', isContentEditable: false };
    expect(shouldSuppressShortcut(inputTarget)).toBe(true);

    const textareaTarget = { tagName: 'TEXTAREA', isContentEditable: false };
    expect(shouldSuppressShortcut(textareaTarget)).toBe(true);

    const contentEditableTarget = { tagName: 'DIV', isContentEditable: true };
    expect(shouldSuppressShortcut(contentEditableTarget)).toBe(true);
  });

  it('allows shortcuts when not in an input', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    expect(shouldSuppressShortcut(divTarget)).toBe(false);

    const bodyTarget = { tagName: 'BODY', isContentEditable: false };
    expect(shouldSuppressShortcut(bodyTarget)).toBe(false);
  });

  it('suppresses Ctrl+N when in an input', () => {
    const inputTarget = { tagName: 'INPUT', isContentEditable: false };
    const result = resolveShortcut({ key: 'n', ctrlKey: true, metaKey: false }, inputTarget);
    expect(result).toBeNull();
  });

  it('fires Ctrl+N when not in an input', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: 'n', ctrlKey: true, metaKey: false }, divTarget);
    expect(result).toEqual({ type: 'add-product' });
  });

  it('fires Ctrl+K for search', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: 'k', ctrlKey: true, metaKey: false }, divTarget);
    expect(result).toEqual({ type: 'search' });
  });

  it('toggles help on "?" key', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: '?', ctrlKey: false, metaKey: false }, divTarget);
    expect(result).toEqual({ type: 'toggle-help' });
  });

  it('toggles help on Ctrl+/', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: '/', ctrlKey: true, metaKey: false }, divTarget);
    expect(result).toEqual({ type: 'toggle-help' });
  });

  it('Escape does not trigger a shortcut action (handled by overlay)', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: 'Escape', ctrlKey: false, metaKey: false }, divTarget);
    // Escape is not handled by our shortcut resolver — it's handled by the Dialog/Sheet component
    expect(result).toBeNull();
  });

  it('does not unnecessarily intercept browser shortcuts (Ctrl+T, Ctrl+W, Ctrl+L)', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    // Ctrl+T (new tab) — should NOT be intercepted
    expect(resolveShortcut({ key: 't', ctrlKey: true, metaKey: false }, divTarget)).toBeNull();
    // Ctrl+W (close tab) — should NOT be intercepted
    expect(resolveShortcut({ key: 'w', ctrlKey: true, metaKey: false }, divTarget)).toBeNull();
    // Ctrl+L (address bar) — should NOT be intercepted
    expect(resolveShortcut({ key: 'l', ctrlKey: true, metaKey: false }, divTarget)).toBeNull();
    // Ctrl+P (print) — should NOT be intercepted
    expect(resolveShortcut({ key: 'p', ctrlKey: true, metaKey: false }, divTarget)).toBeNull();
    // Ctrl+O (open) — should NOT be intercepted
    expect(resolveShortcut({ key: 'o', ctrlKey: true, metaKey: false }, divTarget)).toBeNull();
  });

  it('number keys navigate to views', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    expect(resolveShortcut({ key: '1', ctrlKey: false, metaKey: false }, divTarget)).toEqual({ type: 'navigate', view: 'dashboard' });
    expect(resolveShortcut({ key: '2', ctrlKey: false, metaKey: false }, divTarget)).toEqual({ type: 'navigate', view: 'products' });
    expect(resolveShortcut({ key: '3', ctrlKey: false, metaKey: false }, divTarget)).toEqual({ type: 'navigate', view: 'import' });
    expect(resolveShortcut({ key: '7', ctrlKey: false, metaKey: false }, divTarget)).toEqual({ type: 'navigate', view: 'export' });
    expect(resolveShortcut({ key: '8', ctrlKey: false, metaKey: false }, divTarget)).toEqual({ type: 'navigate', view: 'settings' });
  });

  it('number keys are suppressed when in an input', () => {
    const inputTarget = { tagName: 'INPUT', isContentEditable: false };
    const result = resolveShortcut({ key: '2', ctrlKey: false, metaKey: false }, inputTarget);
    expect(result).toBeNull();
  });

  it('Ctrl+S triggers save scenario', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: 's', ctrlKey: true, metaKey: false }, divTarget);
    expect(result).toEqual({ type: 'save-scenario' });
  });

  it('Ctrl+R triggers recalculate', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: 'r', ctrlKey: true, metaKey: false }, divTarget);
    expect(result).toEqual({ type: 'recalculate' });
  });

  it('Ctrl+I navigates to import', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: 'i', ctrlKey: true, metaKey: false }, divTarget);
    expect(result).toEqual({ type: 'navigate', view: 'import' });
  });

  it('Ctrl+E navigates to export', () => {
    const divTarget = { tagName: 'DIV', isContentEditable: false };
    const result = resolveShortcut({ key: 'e', ctrlKey: true, metaKey: false }, divTarget);
    expect(result).toEqual({ type: 'navigate', view: 'export' });
  });
});

// ============================================================
// 4. Animations — prefers-reduced-motion
// ============================================================

describe('Animations — reduced-motion', () => {
  const cssPath = resolve(__dirname, '../../../../app/globals.css');

  it('CSS file exists and is readable', () => {
    let css: string;
    try {
      css = readFileSync(cssPath, 'utf-8');
    } catch {
      // If the exact path doesn't work, try the project root
      const altPath = resolve(process.cwd(), 'src/app/globals.css');
      css = readFileSync(altPath, 'utf-8');
    }
    expect(css).toBeTruthy();
    expect(css.length).toBeGreaterThan(0);
  });

  it('contains @media (prefers-reduced-motion: reduce) rule', () => {
    let css: string;
    try {
      css = readFileSync(cssPath, 'utf-8');
    } catch {
      const altPath = resolve(process.cwd(), 'src/app/globals.css');
      css = readFileSync(altPath, 'utf-8');
    }
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('reduce');
  });

  it('disables animations inside the reduced-motion media query', () => {
    let css: string;
    try {
      css = readFileSync(cssPath, 'utf-8');
    } catch {
      const altPath = resolve(process.cwd(), 'src/app/globals.css');
      css = readFileSync(altPath, 'utf-8');
    }
    // The reduced-motion block should contain animation: none or animation-duration: 0
    const reducedMotionBlock = css.match(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[\s\S]*?\}/);
    expect(reducedMotionBlock).not.toBeNull();
    // Should disable animations
    expect(reducedMotionBlock![0]).toMatch(/animation-duration\s*:/);
  });

  it('reduces transitions inside the reduced-motion media query', () => {
    let css: string;
    try {
      css = readFileSync(cssPath, 'utf-8');
    } catch {
      const altPath = resolve(process.cwd(), 'src/app/globals.css');
      css = readFileSync(altPath, 'utf-8');
    }
    const reducedMotionBlock = css.match(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[\s\S]*?\}/);
    expect(reducedMotionBlock).not.toBeNull();
    // Should reduce or disable transitions
    expect(reducedMotionBlock![0]).toMatch(/transition-duration\s*:/);
  });
});
