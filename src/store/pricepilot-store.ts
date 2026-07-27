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

/**
 * Helper: Calculate product using the new recommendations engine.
 * Replaces the old calculateProduct() from calculations.ts.
 */
function recalcProduct(product: Product, settings: BusinessSettings, rules: PricingRule[]): Product {
  const allRecs = calculateAllRecommendations(product, settings, rules);
  const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
  return mapRecommendationsToProduct(product, allRecs, settings, effectiveRule) as Product;
}

// Navigation views
export type AppView =
  | 'dashboard'
  | 'products'
  | 'import'
  | 'pricing-rules'
  | 'price-simulator'
  | 'scenarios'
  | 'export'
  | 'settings';

interface PricePilotState {
  // Core data
  businessSettings: BusinessSettings;
  products: Product[];
  pricingRules: PricingRule[];
  scenarios: Scenario[];
  appSettings: AppSettings;
  onboardingCompleted: boolean;

  // Navigation
  currentView: AppView;
  selectedProductId: string | null;
  selectedProducts: string[];

  // Import state
  importState: ImportState;

  // UI state
  lastSaved: string | null;
  isCalculating: boolean;
  sidebarCollapsed: boolean;

  // Actions
  initialize: () => void;
  setCurrentView: (view: AppView) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSelectedProductId: (id: string | null) => void;
  setSelectedProducts: (ids: string[]) => void;

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

  // Data management
  exportData: () => string;
  importData: (data: string) => boolean;
  resetApplication: () => void;
}

export const usePricePilotStore = create<PricePilotState>((set, get) => ({
  // Initial state
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
  lastSaved: null,
  isCalculating: false,
  sidebarCollapsed: false,

  // Initialize from localStorage
  initialize: () => {
    const data = initializeStorage();
    // Run calculations on all loaded products
    const recalculated = data.products.map(p => recalcProduct(p, data.businessSettings, data.pricingRules));
    set({
      businessSettings: data.businessSettings,
      products: recalculated,
      pricingRules: data.pricingRules,
      scenarios: data.scenarios,
      appSettings: data.appSettings,
      onboardingCompleted: data.onboardingCompleted,
      lastSaved: getLastSavedTimestamp(),
      currentView: data.onboardingCompleted ? data.appSettings.defaultView : 'dashboard',
    });
    // Save recalculated products
    saveProducts(recalculated);
  },

  // Navigation
  setCurrentView: (view) => set({ currentView: view }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSelectedProductId: (id) => set({ selectedProductId: id }),
  setSelectedProducts: (ids) => set({ selectedProducts: ids }),

  // Business settings
  updateBusinessSettings: (updates) => {
    const newSettings = { ...get().businessSettings, ...updates, updatedAt: new Date().toISOString() };
    saveBusinessSettings(newSettings);
    set({ businessSettings: newSettings });
    // Recalculate all products with new settings
    const { products, pricingRules } = get();
    const recalculated = products.map(p => recalcProduct(p, newSettings, pricingRules));
    saveProducts(recalculated);
    set({ products: recalculated, lastSaved: getLastSavedTimestamp() });
  },

  completeOnboarding: (settings) => {
    const newSettings = { ...get().businessSettings, ...settings, onboardingCompleted: true, updatedAt: new Date().toISOString() };
    saveBusinessSettings(newSettings);
    saveOnboardingCompleted(true);
    set({ businessSettings: newSettings, onboardingCompleted: true });
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
    const newProducts = get().products.filter(p => p.id !== id);
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
    const calculated = SAMPLE_PRODUCTS.map(p => recalcProduct(p, businessSettings, existingRules));
    saveProducts(calculated);
    if (pricingRules.length === 0) {
      savePricingRules(SAMPLE_PRICING_RULES);
      set({ pricingRules: SAMPLE_PRICING_RULES });
    }
    set({ products: calculated, lastSaved: getLastSavedTimestamp() });
  },

  clearAllProducts: () => {
    clearProductsStorage();
    set({ products: [], lastSaved: getLastSavedTimestamp() });
  },

  recalculateProducts: () => {
    set({ isCalculating: true });
    const { businessSettings, pricingRules, products } = get();
    const recalculated = products.map(p => recalcProduct(p, businessSettings, pricingRules));
    saveProducts(recalculated);
    set({ products: recalculated, isCalculating: false, lastSaved: getLastSavedTimestamp() });
  },

  // Import
  updateImportState: (updates) => {
    set({ importState: { ...get().importState, ...updates } });
  },

  importProducts: (newProducts) => {
    const { businessSettings, pricingRules, products } = get();
    const calculated = newProducts.map(p => recalcProduct(p, businessSettings, pricingRules));
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
    });
  },
}));
