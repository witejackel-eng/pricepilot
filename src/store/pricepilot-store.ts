/**
 * PricePilot - Zustand Store
 * Central state management for the entire application.
 */

import { create } from 'zustand';
import {
  Product,
  BusinessSettings,
  PricingRule,
  Scenario,
  ImportState,
  AppSettings,
  PricingStatus,
  RecommendationMode,
  LifecycleStatus,
  ApplicationMode,
  createDefaultBusinessSettings,
  createDefaultAppSettings,
  createDefaultImportState,
  createDefaultPricingRule,
  createDefaultProduct,
} from '@/lib/pricepilot/types';
import {
  initializeStorage,
  saveBusinessSettings,
  saveProducts,
  savePricingRules,
  saveScenarios,
  saveAppSettings,
  saveOnboardingCompleted,
  clearProducts as clearProductsStorage,
  resetAll as resetAllStorage,
  saveProduct,
  removeProduct as removeProductStorage,
  savePricingRule,
  removePricingRule as removePricingRuleStorage,
  saveScenario,
  removeScenario as removeScenarioStorage,
  exportAllData,
  importAllData,
  getLastSavedTimestamp,
} from '@/lib/pricepilot/storage';
import { calculateAllRecommendations, mapRecommendationsToProduct } from '@/lib/pricepilot/recommendations';
import { resolveEffectivePricingPolicy } from '@/lib/pricepilot/resolve-rule';
import { SAMPLE_PRODUCTS, SAMPLE_PRICING_RULES } from '@/lib/pricepilot/sample-data';
import { RecommendationResult, RecommendedOutcomes } from '@/lib/pricepilot/types';
import { safeNumberValue } from '@/lib/pricepilot/formatting';
import { safelyRecalculateProducts, safelyRecalculateProduct } from '@/lib/pricepilot/safe-calculation';
import {
  AppInitializationSummary,
  makeIdleSummary,
  makeLoadingSummary,
  makeReadySummary,
  makeFailedSummary,
} from '@/lib/pricepilot/initialization';
import { normalizeProduct } from '@/lib/pricepilot/product-normalizer';

/**
 * Helper: Calculate product using the new recommendations engine.
 * Replaces the old calculateProduct() from calculations.ts.
 *
 * NOTE: This thin wrapper still calls the engine directly. For any path
 * that processes UNTRUSTED input (localStorage, imports, backups), use
 * `safelyRecalculateProduct` instead so a single malformed product
 * cannot crash the whole batch.
 */
function recalcProduct(product: Product, settings: BusinessSettings, rules: PricingRule[]): Product {
  const result = safelyRecalculateProduct(product, settings, rules);
  return result.product;
}

// Navigation views
export type AppView =
  | 'owner-home'
  | 'review-prices'
  | 'dashboard'
  | 'products'
  | 'import'
  | 'pricing-rules'
  | 'price-simulator'
  | 'scenarios'
  | 'export'
  | 'settings';

// Undo history item
export interface UndoAction {
  type: 'price-approve' | 'price-apply' | 'product-edit' | 'bulk-approve' | 'import' | 'product-delete';
  productId?: string;
  productIds?: string[];
  previousState: Partial<Product> | Product[];
  timestamp: string;
  description: string;
}

// Auto-backup entry
export interface AutoBackup {
  id: string;
  timestamp: string;
  trigger: 'import' | 'reset' | 'bulk-action' | 'manual';
  dataString: string;
  description: string;
}

interface PricePilotState {
  // Core data
  businessSettings: BusinessSettings;
  products: Product[];
  pricingRules: PricingRule[];
  scenarios: Scenario[];
  appSettings: AppSettings;
  onboardingCompleted: boolean;

  // Initialization lifecycle (Phase 4)
  initialization: AppInitializationSummary;
  retryInitialize: () => void;
  startEmptyWorkspace: () => void;
  downloadExistingData: () => void;

  // Navigation
  currentView: AppView;
  selectedProductId: string | null;
  selectedProducts: string[];
  initialFilterTab: string | null;

  // Import state
  importState: ImportState;

  // UI state
  lastSaved: string | null;
  isCalculating: boolean;
  sidebarCollapsed: boolean;
  recentlyViewedIds: string[];
  undoHistory: UndoAction[];
  autoBackups: AutoBackup[];
  helpPanelOpen: boolean;

  // Actions
  initialize: () => void;
  setCurrentView: (view: AppView) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSelectedProductId: (id: string | null) => void;
  setSelectedProducts: (ids: string[]) => void;
  setInitialFilterTab: (tab: string | null) => void;
  setHelpPanelOpen: (open: boolean) => void;

  // Business settings
  updateBusinessSettings: (settings: Partial<BusinessSettings>) => void;
  completeOnboarding: (settings: Partial<BusinessSettings>) => void;

  // Products
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  deleteSelectedProducts: () => void;
  bulkUpdateProducts: (ids: string[], updates: Partial<Product>) => void;
  approveSelectedProducts: () => void;
  markSelectedForReview: () => void;
  loadSampleData: () => void;
  loadDemoSampleData: () => void;
  removeDemoSampleData: () => void;
  clearAllProducts: () => void;
  recalculateProducts: () => void;

  // Phase 6 - Product workflow
  duplicateProduct: (productId: string) => void;
  approveProductPrice: (productId: string, recommendationMode: RecommendationMode) => void;
  applyApprovedPrice: (productId: string) => void;
  bulkSetField: (productIds: string[], field: string, value: unknown) => void;
  bulkApprovePrices: (productIds: string[]) => void;
  archiveProducts: (productIds: string[]) => void;

  // Import
  updateImportState: (updates: Partial<ImportState>) => void;
  importProducts: (products: Product[]) => void;
  resetImportState: () => void;

  // Pricing rules
  addPricingRule: (rule: PricingRule) => void;
  updatePricingRule: (id: string, updates: Partial<PricingRule>) => void;
  deletePricingRule: (id: string) => void;
  duplicatePricingRule: (id: string) => void;

  // Scenarios
  addScenario: (scenario: Scenario) => void;
  updateScenario: (id: string, updates: Partial<Scenario>) => void;
  deleteScenario: (id: string) => void;
  restoreScenario: (id: string) => void;

  // Settings
  updateAppSettings: (settings: Partial<AppSettings>) => void;
  setApplicationMode: (mode: ApplicationMode) => void;

  // Recently viewed
  addRecentlyViewed: (productId: string) => void;

  // Undo
  undoLastAction: () => void;
  pushUndoAction: (action: UndoAction) => void;

  // Backup
  createAutoBackup: (trigger: AutoBackup['trigger'], description: string) => void;
  downloadBackup: () => void;
  restoreBackup: (dataString: string) => boolean;
  getBackupList: () => AutoBackup[];

  // Data management
  exportData: () => string;
  importData: (data: string) => boolean;
  resetApplication: () => void;
}

const MAX_UNDO_HISTORY = 20;
const MAX_AUTO_BACKUPS = 10;
const AUTO_BACKUP_KEY = 'pricepilot_auto_backups';

function loadAutoBackups(): AutoBackup[] {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AutoBackup[];
  } catch {
    return [];
  }
}

function saveAutoBackups(backups: AutoBackup[]): void {
  try {
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_AUTO_BACKUPS)));
  } catch {
    // If storage is full, remove oldest backups
    const trimmed = backups.slice(0, MAX_AUTO_BACKUPS - 2);
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(trimmed));
  }
}

export const usePricePilotStore = create<PricePilotState>((set, get) => ({
  // Initial state
  businessSettings: createDefaultBusinessSettings(),
  products: [],
  pricingRules: [],
  scenarios: [],
  appSettings: createDefaultAppSettings(),
  onboardingCompleted: false,
  initialization: makeIdleSummary(),
  currentView: 'owner-home',
  selectedProductId: null,
  selectedProducts: [],
  initialFilterTab: null,
  importState: createDefaultImportState(),
  lastSaved: null,
  isCalculating: false,
  sidebarCollapsed: false,
  recentlyViewedIds: [],
  undoHistory: [],
  autoBackups: loadAutoBackups(),
  helpPanelOpen: false,

  // Initialize from localStorage
  initialize: () => {
    // Mark as loading FIRST so the UI can render the "Opening your
    // PricePilot workspace…" screen instead of briefly flashing
    // onboarding.
    set({ initialization: makeLoadingSummary() });

    try {
      const data = initializeStorage();

      // Run calculations on all loaded products using the SAFE batch helper
      // so a single malformed stored product cannot blank the whole app.
      const batchResult = safelyRecalculateProducts(
        data.products, data.businessSettings, data.pricingRules
      );
      const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
      if (batchResult.issues.length > 0) {
        console.warn(
          `[PricePilot] ${batchResult.issues.length} product(s) had calculation issues during startup.`,
          batchResult.issues
        );
      }

      const mode = data.appSettings.applicationMode || 'owner';
      const defaultView: AppView = mode === 'owner' ? 'owner-home' : 'dashboard';

      // Build the initialization summary.
      const needsReviewCount = recalculated.filter(
        p => p.lifecycleStatus === 'needs-review' || p.calculatedPricingStatus === 'missing-data'
      ).length;
      const successfulCount = recalculated.length - needsReviewCount;
      const summary = makeReadySummary(successfulCount, needsReviewCount);

      set({
        businessSettings: data.businessSettings,
        products: recalculated,
        pricingRules: data.pricingRules,
        scenarios: data.scenarios,
        appSettings: data.appSettings,
        onboardingCompleted: data.onboardingCompleted,
        lastSaved: getLastSavedTimestamp(),
        currentView: data.onboardingCompleted ? defaultView : 'dashboard',
        autoBackups: loadAutoBackups(),
        initialization: summary,
      });

      // Save recalculated products (best-effort; failure here is not fatal
      // because we already have the data in memory).
      try {
        saveProducts(recalculated);
      } catch (saveErr) {
        console.warn('[PricePilot] Could not persist recalculated products on startup.', saveErr);
      }
    } catch (err) {
      // Storage initialization failed entirely. DO NOT delete the old
      // data — surface a failure summary so the UI can offer recovery
      // options (Try Again / Download Existing Data / Start Empty).
      console.error('[PricePilot] Initialization failed.', err);
      set({ initialization: makeFailedSummary(err) });
    }
  },

  retryInitialize: () => {
    // The user clicked "Try Again" on the failure screen.
    get().initialize();
  },

  startEmptyWorkspace: () => {
    // The user clicked "Start Empty Workspace". We DO NOT delete the
    // old localStorage data — we just bypass it for this session so
    // the owner can keep using the app while the old data remains
    // available for download or a later retry.
    try {
      const defaults = createDefaultBusinessSettings();
      const appDefaults = createDefaultAppSettings();
      set({
        businessSettings: defaults,
        products: [],
        pricingRules: [],
        scenarios: [],
        appSettings: appDefaults,
        onboardingCompleted: false,
        currentView: 'dashboard',
        initialization: makeReadySummary(0, 0),
      });
    } catch (err) {
      console.error('[PricePilot] Could not start empty workspace.', err);
      set({ initialization: makeFailedSummary(err) });
    }
  },

  downloadExistingData: () => {
    // Best-effort: try to export whatever is in localStorage so the
    // owner has a recovery file. This must never throw into the UI.
    try {
      const data = exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pricepilot-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[PricePilot] Could not download existing data.', err);
    }
  },

  // Navigation
  setCurrentView: (view) => set({ currentView: view }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSelectedProductId: (id) => set({ selectedProductId: id }),
  setSelectedProducts: (ids) => set({ selectedProducts: ids }),
  setInitialFilterTab: (tab) => set({ initialFilterTab: tab }),
  setHelpPanelOpen: (open) => set({ helpPanelOpen: open }),

  // Business settings
  updateBusinessSettings: (updates) => {
    const newSettings = { ...get().businessSettings, ...updates, updatedAt: new Date().toISOString() };
    saveBusinessSettings(newSettings);
    set({ businessSettings: newSettings });
    // Recalculate all products with new settings using the SAFE batch helper
    const { products, pricingRules } = get();
    const batchResult = safelyRecalculateProducts(products, newSettings, pricingRules);
    const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    saveProducts(recalculated);
    set({ products: recalculated, lastSaved: getLastSavedTimestamp() });
  },

  completeOnboarding: (settings) => {
    const newSettings = { ...get().businessSettings, ...settings, onboardingCompleted: true, updatedAt: new Date().toISOString() };
    saveBusinessSettings(newSettings);
    saveOnboardingCompleted(true);
    // After onboarding, set default view based on mode
    const mode = get().appSettings.applicationMode || 'owner';
    const defaultView: AppView = mode === 'owner' ? 'owner-home' : 'dashboard';
    set({ businessSettings: newSettings, onboardingCompleted: true, currentView: defaultView });
  },

  // Products
  addProduct: (product) => {
    const { businessSettings, pricingRules, products } = get();
    const calculated = recalcProduct(product, businessSettings, pricingRules);
    const newProducts = [...products, calculated];
    saveProducts(newProducts);
    set({ products: newProducts, lastSaved: getLastSavedTimestamp() });
  },

  updateProduct: (id, updates) => {
    const { products, businessSettings, pricingRules } = get();
    const productBefore = products.find(p => p.id === id);
    if (productBefore) {
      get().pushUndoAction({
        type: 'product-edit',
        productId: id,
        previousState: { ...productBefore },
        timestamp: new Date().toISOString(),
        description: `Edited ${productBefore.name || 'product'}`,
      });
    }
    const updated = products.map(p => {
      if (p.id === id) {
        const merged = { ...p, ...updates, updatedAt: new Date().toISOString() };
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    saveProducts(updated);
    set({ products: updated, lastSaved: getLastSavedTimestamp() });
  },

  deleteProduct: (id) => {
    const { products } = get();
    const productBefore = products.find(p => p.id === id);
    if (productBefore) {
      get().pushUndoAction({
        type: 'product-delete',
        productId: id,
        previousState: { ...productBefore },
        timestamp: new Date().toISOString(),
        description: `Deleted ${productBefore.name || 'product'}`,
      });
    }
    const newProducts = products.filter(p => p.id !== id);
    saveProducts(newProducts);
    set({ products: newProducts, lastSaved: getLastSavedTimestamp() });
  },

  deleteSelectedProducts: () => {
    const { selectedProducts, products } = get();
    const newProducts = products.filter(p => !selectedProducts.includes(p.id));
    saveProducts(newProducts);
    set({ products: newProducts, selectedProducts: [], lastSaved: getLastSavedTimestamp() });
  },

  bulkUpdateProducts: (ids, updates) => {
    const { products, businessSettings, pricingRules } = get();
    const updated = products.map(p => {
      if (ids.includes(p.id)) {
        const merged = { ...p, ...updates, updatedAt: new Date().toISOString() };
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    saveProducts(updated);
    set({ products: updated, lastSaved: getLastSavedTimestamp() });
  },

  approveSelectedProducts: () => {
    const { selectedProducts } = get();
    get().bulkUpdateProducts(selectedProducts, { isApproved: true, calculatedPricingStatus: 'approved' as PricingStatus });
  },

  markSelectedForReview: () => {
    const { selectedProducts } = get();
    get().bulkUpdateProducts(selectedProducts, { calculatedPricingStatus: 'needs-review' as PricingStatus, lifecycleStatus: 'needs-review' as LifecycleStatus });
  },

  duplicateProduct: (productId) => {
    const { products, businessSettings, pricingRules } = get();
    const original = products.find(p => p.id === productId);
    if (!original) return;
    const newProduct: Product = {
      ...original,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${original.name} (Copy)`,
      sku: `${original.sku}-COPY`,
      lifecycleStatus: 'draft' as LifecycleStatus,
      priceApprovalStatus: 'none',
      finalApprovedPrice: 0,
      approvedAt: '',
      isApproved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const calculated = recalcProduct(newProduct, businessSettings, pricingRules);
    const newProducts = [...products, calculated];
    saveProducts(newProducts);
    set({ products: newProducts, lastSaved: getLastSavedTimestamp() });
  },

  approveProductPrice: (productId, recommendationMode) => {
    const { products, businessSettings, pricingRules } = get();
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const approvedPrice = product.recommendedPrices[recommendationMode] || product.recommendedPrices.balanced;
    // Push undo action
    get().pushUndoAction({
      type: 'price-approve',
      productId,
      previousState: { ...product },
      timestamp: new Date().toISOString(),
      description: `Approved price for ${product.name || 'product'}: ${safeNumberValue(approvedPrice, 0).toFixed(2)}`,
    });
    const updated = products.map(p => {
      if (p.id === productId) {
        const merged = {
          ...p,
          selectedRecommendationMode: recommendationMode,
          priceApprovalStatus: 'approved' as const,
          finalApprovedPrice: approvedPrice,
          approvedAt: new Date().toISOString(),
          lifecycleStatus: 'approved' as LifecycleStatus,
          updatedAt: new Date().toISOString(),
        };
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    saveProducts(updated);
    set({ products: updated, lastSaved: getLastSavedTimestamp() });
  },

  applyApprovedPrice: (productId) => {
    const { products, businessSettings, pricingRules } = get();
    const product = products.find(p => p.id === productId);
    if (!product || product.priceApprovalStatus !== 'approved' || product.finalApprovedPrice <= 0) return;
    // Push undo action
    get().pushUndoAction({
      type: 'price-apply',
      productId,
      previousState: { ...product },
      timestamp: new Date().toISOString(),
      description: `Applied approved price for ${product.name || 'product'}: ${safeNumberValue(product.finalApprovedPrice, 0).toFixed(2)}`,
    });
    const updated = products.map(p => {
      if (p.id === productId) {
        const merged = {
          ...p,
          currentSellingPrice: product.finalApprovedPrice,
          updatedAt: new Date().toISOString(),
        };
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    saveProducts(updated);
    set({ products: updated, lastSaved: getLastSavedTimestamp() });
  },

  bulkSetField: (productIds, field, value) => {
    const { products, businessSettings, pricingRules } = get();
    const updated = products.map(p => {
      if (productIds.includes(p.id)) {
        const merged = { ...p, [field]: value, updatedAt: new Date().toISOString() } as Product;
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    saveProducts(updated);
    set({ products: updated, lastSaved: getLastSavedTimestamp() });
  },

  bulkApprovePrices: (productIds) => {
    const { products, businessSettings, pricingRules } = get();
    get().pushUndoAction({
      type: 'bulk-approve',
      productIds,
      previousState: productIds.map(id => ({ ...products.find(p => p.id === id)! })).filter(Boolean),
      timestamp: new Date().toISOString(),
      description: `Bulk approved prices for ${productIds.length} products`,
    });
    const updated = products.map(p => {
      if (productIds.includes(p.id)) {
        const approvedPrice = p.recommendedPrices[p.selectedRecommendationMode || 'balanced'] || p.recommendedPrices.balanced;
        const merged = {
          ...p,
          priceApprovalStatus: 'approved' as const,
          finalApprovedPrice: approvedPrice,
          approvedAt: new Date().toISOString(),
          lifecycleStatus: 'approved' as LifecycleStatus,
          updatedAt: new Date().toISOString(),
        };
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    saveProducts(updated);
    set({ products: updated, lastSaved: getLastSavedTimestamp() });
  },

  archiveProducts: (productIds) => {
    get().bulkSetField(productIds, 'lifecycleStatus', 'archived' as LifecycleStatus);
  },

  loadSampleData: () => {
    const { businessSettings, pricingRules } = get();
    const existingRules = pricingRules.length > 0 ? pricingRules : SAMPLE_PRICING_RULES;
    // Use the SAFE batch helper so even sample data can't crash the app
    // if it ever drifts out of sync with the schema.
    const batchResult = safelyRecalculateProducts(SAMPLE_PRODUCTS, businessSettings, existingRules);
    const calculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    saveProducts(calculated);
    if (pricingRules.length === 0) {
      savePricingRules(SAMPLE_PRICING_RULES);
      set({ pricingRules: SAMPLE_PRICING_RULES });
    }
    set({ products: calculated, lastSaved: getLastSavedTimestamp() });
  },

  loadDemoSampleData: () => {
    get().createAutoBackup('manual', 'Before loading demo sample data');
    const { businessSettings, pricingRules } = get();
    const existingRules = pricingRules.length > 0 ? pricingRules : SAMPLE_PRICING_RULES;
    const batchResult = safelyRecalculateProducts(SAMPLE_PRODUCTS, businessSettings, existingRules);
    const calculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    saveProducts(calculated);
    if (pricingRules.length === 0) {
      savePricingRules(SAMPLE_PRICING_RULES);
      set({ pricingRules: SAMPLE_PRICING_RULES });
    }
    get().updateAppSettings({ sampleDataLoaded: true });
    set({ products: calculated, lastSaved: getLastSavedTimestamp() });
  },

  removeDemoSampleData: () => {
    clearProductsStorage();
    get().updateAppSettings({ sampleDataLoaded: false });
    set({ products: [], lastSaved: getLastSavedTimestamp() });
  },

  clearAllProducts: () => {
    clearProductsStorage();
    set({ products: [], lastSaved: getLastSavedTimestamp() });
  },

  recalculateProducts: () => {
    set({ isCalculating: true });
    const { businessSettings, pricingRules, products } = get();
    // Use the SAFE batch helper so a single malformed product cannot
    // abort the entire recalculation.
    const batchResult = safelyRecalculateProducts(products, businessSettings, pricingRules);
    const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    saveProducts(recalculated);
    set({ products: recalculated, isCalculating: false, lastSaved: getLastSavedTimestamp() });
  },

  // Import
  updateImportState: (updates) => {
    set({ importState: { ...get().importState, ...updates } });
  },

  importProducts: (newProducts) => {
    // Create auto-backup before import
    get().createAutoBackup('import', `Before importing ${newProducts.length} products`);
    const { businessSettings, pricingRules, products } = get();
    // Use the SAFE batch helper so a single malformed import row cannot
    // abort the entire import.
    const batchResult = safelyRecalculateProducts(newProducts, businessSettings, pricingRules);
    const calculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    // Push undo action
    get().pushUndoAction({
      type: 'import',
      productIds: calculated.map(p => p.id),
      previousState: [...products],
      timestamp: new Date().toISOString(),
      description: `Imported ${calculated.length} products`,
    });
    const allProducts = [...products, ...calculated];
    saveProducts(allProducts);
    set({ products: allProducts, lastSaved: getLastSavedTimestamp(), currentView: 'products' });
    get().resetImportState();
  },

  resetImportState: () => {
    set({ importState: createDefaultImportState() });
  },

  // Pricing rules
  addPricingRule: (rule) => {
    const rules = savePricingRule(rule);
    set({ pricingRules: rules, lastSaved: getLastSavedTimestamp() });
    get().recalculateProducts();
  },

  updatePricingRule: (id, updates) => {
    const { pricingRules } = get();
    const updated = pricingRules.map(r =>
      r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
    );
    savePricingRules(updated);
    set({ pricingRules: updated, lastSaved: getLastSavedTimestamp() });
    get().recalculateProducts();
  },

  deletePricingRule: (id) => {
    const rules = removePricingRuleStorage(id);
    set({ pricingRules: rules, lastSaved: getLastSavedTimestamp() });
    get().recalculateProducts();
  },

  duplicatePricingRule: (id) => {
    const { pricingRules } = get();
    const original = pricingRules.find(r => r.id === id);
    if (!original) return;
    const newRule: PricingRule = {
      ...original,
      id: `rule-${Date.now()}`,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const rules = savePricingRule(newRule);
    set({ pricingRules: rules, lastSaved: getLastSavedTimestamp() });
  },

  // Scenarios
  addScenario: (scenario) => {
    const scenarios = saveScenario(scenario);
    set({ scenarios, lastSaved: getLastSavedTimestamp() });
  },

  updateScenario: (id, updates) => {
    const { scenarios } = get();
    const updated = scenarios.map(s =>
      s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
    );
    saveScenarios(updated);
    set({ scenarios: updated, lastSaved: getLastSavedTimestamp() });
  },

  deleteScenario: (id) => {
    const scenarios = removeScenarioStorage(id);
    set({ scenarios, lastSaved: getLastSavedTimestamp() });
  },

  restoreScenario: (id) => {
    const { scenarios } = get();
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) return;
    saveProducts(scenario.snapshotProducts);
    savePricingRules(scenario.snapshotPricingRules);
    saveBusinessSettings(scenario.snapshotBusinessSettings);
    set({
      products: scenario.snapshotProducts,
      pricingRules: scenario.snapshotPricingRules,
      businessSettings: scenario.snapshotBusinessSettings,
      lastSaved: getLastSavedTimestamp(),
    });
  },

  // Settings
  updateAppSettings: (updates) => {
    const newSettings = { ...get().appSettings, ...updates, updatedAt: new Date().toISOString() };
    saveAppSettings(newSettings);
    set({ appSettings: newSettings, lastSaved: getLastSavedTimestamp() });
  },

  setApplicationMode: (mode) => {
    get().updateAppSettings({ applicationMode: mode });
    const defaultView: AppView = mode === 'owner' ? 'owner-home' : 'dashboard';
    set({ currentView: defaultView });
  },

  // Recently viewed
  addRecentlyViewed: (productId) => {
    const { recentlyViewedIds } = get();
    // Remove if already in list, then add at front (most recent)
    const updated = [productId, ...recentlyViewedIds.filter(id => id !== productId)].slice(0, 5);
    set({ recentlyViewedIds: updated });
  },

  // Undo
  pushUndoAction: (action) => {
    const { undoHistory } = get();
    const newHistory = [action, ...undoHistory].slice(0, MAX_UNDO_HISTORY);
    set({ undoHistory: newHistory });
  },

  undoLastAction: () => {
    const { undoHistory, products, businessSettings, pricingRules } = get();
    if (undoHistory.length === 0) return;
    const lastAction = undoHistory[0];
    const remainingHistory = undoHistory.slice(1);

    if (lastAction.type === 'price-approve' || lastAction.type === 'price-apply' || lastAction.type === 'product-edit') {
      // Restore the product from previousState
      const previousProduct = lastAction.previousState as Product;
      const updated = products.map(p => {
        if (p.id === lastAction.productId) {
          return recalcProduct(previousProduct, businessSettings, pricingRules);
        }
        return p;
      });
      saveProducts(updated);
      set({ products: updated, undoHistory: remainingHistory, lastSaved: getLastSavedTimestamp() });
    } else if (lastAction.type === 'product-delete') {
      // Re-add the deleted product
      const previousProduct = lastAction.previousState as Product;
      const recalculated = recalcProduct(previousProduct, businessSettings, pricingRules);
      const newProducts = [...products, recalculated];
      saveProducts(newProducts);
      set({ products: newProducts, undoHistory: remainingHistory, lastSaved: getLastSavedTimestamp() });
    } else if (lastAction.type === 'bulk-approve') {
      // Restore all products from previousState
      const previousProducts = lastAction.previousState as Product[];
      const updated = products.map(p => {
        const prev = previousProducts.find(pp => pp.id === p.id);
        if (prev) return recalcProduct(prev, businessSettings, pricingRules);
        return p;
      });
      saveProducts(updated);
      set({ products: updated, undoHistory: remainingHistory, lastSaved: getLastSavedTimestamp() });
    } else if (lastAction.type === 'import') {
      // Remove imported products (restore to pre-import state)
      const previousProducts = lastAction.previousState as Product[];
      const recalculated = previousProducts.map(p => recalcProduct(p, businessSettings, pricingRules));
      saveProducts(recalculated);
      set({ products: recalculated, undoHistory: remainingHistory, lastSaved: getLastSavedTimestamp() });
    }
  },

  // Backup
  createAutoBackup: (trigger, description) => {
    const dataString = get().exportData();
    const backup: AutoBackup = {
      id: `backup-${Date.now()}`,
      timestamp: new Date().toISOString(),
      trigger,
      dataString,
      description,
    };
    const { autoBackups } = get();
    const newBackups = [backup, ...autoBackups].slice(0, MAX_AUTO_BACKUPS);
    saveAutoBackups(newBackups);
    set({ autoBackups: newBackups });
  },

  downloadBackup: () => {
    const data = get().exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pricepilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  restoreBackup: (dataString) => {
    try {
      const data = JSON.parse(dataString);
      const success = importAllData(data);
      if (success) {
        get().initialize();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  getBackupList: () => {
    return get().autoBackups;
  },

  // Data management
  exportData: () => {
    const data = exportAllData();
    return JSON.stringify(data, null, 2);
  },

  importData: (dataString) => {
    try {
      const data = JSON.parse(dataString);
      const success = importAllData(data);
      if (success) {
        get().initialize();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  resetApplication: () => {
    get().createAutoBackup('reset', 'Before application reset');
    resetAllStorage();
    set({
      businessSettings: createDefaultBusinessSettings(),
      products: [],
      pricingRules: [],
      scenarios: [],
      appSettings: createDefaultAppSettings(),
      onboardingCompleted: false,
      currentView: 'dashboard',
      selectedProductId: null,
      selectedProducts: [],
      importState: createDefaultImportState(),
      undoHistory: [],
    });
  },
}));
