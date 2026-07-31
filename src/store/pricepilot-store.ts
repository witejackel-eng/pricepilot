/**
 * PricePilot - Zustand Store
 * Central state management for the entire application.
 *
 * Phase 1 of production-readiness: IndexedDB is the SINGLE source of
 * truth for primary data. localStorage is used only for UI preferences
 * via `src/lib/pricepilot/app-settings.ts`.
 *
 * Mutations are async and write to IndexedDB. UI state updates only
 * after the IndexedDB write succeeds. If the write fails, the prior
 * state is preserved and an error is surfaced.
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
} from '@/lib/pricepilot/types';
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
import {
  loadAllProducts,
  loadBusinessSettingsFromDb,
  loadPricingRulesFromDb,
  loadScenariosFromDb,
  saveProductsToDb,
  saveProductToDb,
  removeProductFromDb,
  saveBusinessSettingsToDb,
  savePricingRulesToDb,
  saveScenariosToDb,
  loadUndoHistoryFromDb,
  saveUndoHistoryToDb,
  loadBackupsFromDb,
  saveBackupsToDb,
  addBackupToDb,
  atomicImportProducts,
  atomicResetAll,
  atomicRestoreBackup,
  atomicBulkUpdateProducts,
  atomicApplyApprovedPrices,
  atomicUpdateSettingsAndProducts,
  atomicUpdateRulesAndProducts,
  atomicRestoreScenario,
  clearProductsInDb,
  exportAllDataFromDb,
  getMetadata,
  setMetadata,
} from '@/lib/pricepilot/database';
import {
  loadAppSettings,
  saveAppSettings,
  clearAppSettings,
  migrateLegacyAppSettingsIfNeeded,
} from '@/lib/pricepilot/app-settings';
import {
  migrateLegacyDataIfNeeded,
  hasLegacyLocalStorageData,
  MigrationResult,
} from '@/lib/pricepilot/migration';
import {
  OperationResult,
  ERROR_CODES,
  ok,
  retryableError,
  invalidInputError,
} from '@/lib/pricepilot/operation-result';
import {
  buildBackup,
  serializeBackup,
  downloadBackupFile,
  downloadRecoveryPayload,
  PricePilotBackup,
} from '@/lib/pricepilot/backup-service';

/**
 * Helper: Calculate product using the new recommendations engine.
 * Replaces the old calculateProduct() from calculations.ts.
 *
 * NOTE: This thin wrapper still calls the engine directly. For any path
 * that processes UNTRUSTED input (imports, backups), use
 * `safelyRecalculateProduct` instead so a single malformed product
 * cannot crash the whole batch.
 */
function recalcProduct(product: Product, settings: BusinessSettings, rules: PricingRule[]): Product {
  const result = safelyRecalculateProduct(product, settings, rules);
  return result.product;
}

/** Metadata key under which the last-successful-save timestamp is stored. */
const METADATA_KEY_LAST_SAVED = 'lastSavedTimestamp';

/**
 * Read the last-saved timestamp from IndexedDB metadata. Returns null
 * if missing. Synchronous callers should use the cached `lastSaved`
 * field on the store; this helper is only for initialization.
 */
async function loadLastSavedTimestampFromDb(): Promise<string | null> {
  try {
    return await getMetadata<string>(METADATA_KEY_LAST_SAVED);
  } catch {
    return null;
  }
}

/** Persist the last-saved timestamp to IndexedDB metadata. Best-effort. */
async function saveLastSavedTimestampToDb(timestamp: string): Promise<void> {
  try {
    await setMetadata(METADATA_KEY_LAST_SAVED, timestamp);
  } catch (err) {
    console.warn('[PricePilot] Could not persist lastSaved timestamp.', err);
  }
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

  // Initialization lifecycle
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
  updateBusinessSettings: (settings: Partial<BusinessSettings>) => Promise<OperationResult>;
  completeOnboarding: (settings: Partial<BusinessSettings>) => Promise<OperationResult>;

  // Products
  addProduct: (product: Product) => Promise<OperationResult>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<OperationResult>;
  deleteProduct: (id: string) => Promise<OperationResult>;
  deleteSelectedProducts: () => Promise<OperationResult>;
  bulkUpdateProducts: (ids: string[], updates: Partial<Product>) => Promise<OperationResult>;
  approveSelectedProducts: () => Promise<OperationResult>;
  markSelectedForReview: () => Promise<OperationResult>;
  loadSampleData: () => Promise<OperationResult>;
  loadDemoSampleData: () => Promise<OperationResult>;
  removeDemoSampleData: () => Promise<OperationResult>;
  clearAllProducts: () => Promise<OperationResult>;
  recalculateProducts: () => Promise<OperationResult>;

  // Product workflow
  duplicateProduct: (productId: string) => Promise<OperationResult>;
  approveProductPrice: (productId: string, recommendationMode: RecommendationMode) => Promise<OperationResult>;
  applyApprovedPrice: (productId: string) => Promise<OperationResult>;
  bulkSetField: (productIds: string[], field: string, value: unknown) => Promise<OperationResult>;
  bulkApprovePrices: (productIds: string[]) => Promise<OperationResult>;
  archiveProducts: (productIds: string[]) => Promise<OperationResult>;

  // Import
  updateImportState: (updates: Partial<ImportState>) => void;
  importProducts: (products: Product[]) => Promise<OperationResult>;
  resetImportState: () => void;

  // Pricing rules
  addPricingRule: (rule: PricingRule) => Promise<OperationResult>;
  updatePricingRule: (id: string, updates: Partial<PricingRule>) => Promise<OperationResult>;
  deletePricingRule: (id: string) => Promise<OperationResult>;
  duplicatePricingRule: (id: string) => Promise<OperationResult>;

  // Scenarios
  addScenario: (scenario: Scenario) => Promise<OperationResult>;
  updateScenario: (id: string, updates: Partial<Scenario>) => Promise<OperationResult>;
  deleteScenario: (id: string) => Promise<OperationResult>;
  restoreScenario: (id: string) => Promise<OperationResult>;

  // Settings
  updateAppSettings: (settings: Partial<AppSettings>) => void;
  setApplicationMode: (mode: ApplicationMode) => void;

  // Recently viewed
  addRecentlyViewed: (productId: string) => void;

  // Undo
  undoLastAction: () => void;
  pushUndoAction: (action: UndoAction) => void;

  // Backup
  createAutoBackup: (trigger: AutoBackup['trigger'], description: string) => Promise<void>;
  downloadBackup: () => void;
  restoreBackup: (dataString: string) => Promise<boolean>;
  getBackupList: () => AutoBackup[];

  // Data management
  exportData: () => string;
  importData: (data: string) => boolean;
  resetApplication: () => Promise<void>;
}

const MAX_UNDO_HISTORY = 20;
const MAX_AUTO_BACKUPS = 10;

/**
 * Best-effort: persist a list of products to IndexedDB and update the
 * lastSaved timestamp. Logs but does NOT throw on failure so that
 * fire-and-forget call sites (e.g. bulk operations) don't crash.
 *
 * Phase 2 will replace this with proper Promise<OperationResult>.
 */
async function persistProducts(products: Product[]): Promise<void> {
  try {
    await saveProductsToDb(products);
    const ts = new Date().toISOString();
    await saveLastSavedTimestampToDb(ts);
  } catch (err) {
    console.error('[PricePilot] Could not persist products to IndexedDB.', err);
    // Re-throw so callers that need to know can catch.
    throw err;
  }
}

async function persistBusinessSettings(settings: BusinessSettings): Promise<void> {
  try {
    await saveBusinessSettingsToDb(settings);
    const ts = new Date().toISOString();
    await saveLastSavedTimestampToDb(ts);
  } catch (err) {
    console.error('[PricePilot] Could not persist business settings to IndexedDB.', err);
    throw err;
  }
}

async function persistPricingRules(rules: PricingRule[]): Promise<void> {
  try {
    await savePricingRulesToDb(rules);
    const ts = new Date().toISOString();
    await saveLastSavedTimestampToDb(ts);
  } catch (err) {
    console.error('[PricePilot] Could not persist pricing rules to IndexedDB.', err);
    throw err;
  }
}

async function persistScenarios(scenarios: Scenario[]): Promise<void> {
  try {
    await saveScenariosToDb(scenarios);
    const ts = new Date().toISOString();
    await saveLastSavedTimestampToDb(ts);
  } catch (err) {
    console.error('[PricePilot] Could not persist scenarios to IndexedDB.', err);
    throw err;
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
  autoBackups: [],
  helpPanelOpen: false,

  // Initialize from IndexedDB (single source of truth)
  initialize: async () => {
    // Mark as loading FIRST so the UI can render the "Opening your
    // PricePilot workspace…" screen instead of briefly flashing
    // onboarding.
    set({ initialization: makeLoadingSummary() });

    try {
      // Migrate UI preferences from the legacy localStorage key if needed.
      migrateLegacyAppSettingsIfNeeded();

      // Run the localStorage → IndexedDB migration first. Idempotent
      // and atomic — if it fails, the original localStorage data is
      // untouched.
      let migrationResult: MigrationResult | null = null;
      try {
        migrationResult = await migrateLegacyDataIfNeeded();
        if (migrationResult.status === 'failed') {
          console.warn('[PricePilot] localStorage migration failed.', migrationResult.message);
        } else if (migrationResult.status === 'complete' && migrationResult.hadLegacyData) {
          console.info('[PricePilot] localStorage migration completed.', migrationResult.message);
        }
      } catch (migrationErr) {
        console.error('[PricePilot] Migration threw unexpectedly.', migrationErr);
      }

      // Load primary data from IndexedDB.
      let products: Product[] = [];
      let businessSettings: BusinessSettings | null = null;
      let pricingRules: PricingRule[] = [];
      let scenarios: Scenario[] = [];
      let undoHistory: UndoAction[] = [];
      let backups: AutoBackup[] = [];
      let lastSaved: string | null = null;

      try {
        products = await loadAllProducts();
        businessSettings = await loadBusinessSettingsFromDb();
        pricingRules = await loadPricingRulesFromDb();
        scenarios = await loadScenariosFromDb();
        undoHistory = await loadUndoHistoryFromDb();
        backups = await loadBackupsFromDb();
        lastSaved = await loadLastSavedTimestampFromDb();
      } catch (dbErr) {
        console.error('[PricePilot] Could not load from IndexedDB.', dbErr);
        // No localStorage fallback anymore — IndexedDB is the single
        // source of truth. The user sees an initialization failure
        // screen with retry / start-empty options.
        throw dbErr;
      }

      // Use defaults if business settings weren't found.
      if (!businessSettings) {
        businessSettings = createDefaultBusinessSettings();
      }

      // Run calculations on all loaded products using the SAFE batch helper
      // so a single malformed stored product cannot blank the whole app.
      const batchResult = safelyRecalculateProducts(
        products, businessSettings, pricingRules
      );
      const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
      if (batchResult.issues.length > 0) {
        console.warn(
          `[PricePilot] ${batchResult.issues.length} product(s) had calculation issues during startup.`,
          batchResult.issues
        );
      }

      // UI preferences come from localStorage (theme/mode/sidebar are
      // explicitly UI preferences, not primary data).
      const appSettings = loadAppSettings();
      const actualMode = appSettings.applicationMode || 'owner';
      const defaultView: AppView = actualMode === 'owner' ? 'owner-home' : 'dashboard';

      // Build the initialization summary.
      const needsReviewCount = recalculated.filter(
        p => p.lifecycleStatus === 'needs-review' || p.calculatedPricingStatus === 'missing-data'
      ).length;
      const successfulCount = recalculated.length - needsReviewCount;
      const summary = makeReadySummary(successfulCount, needsReviewCount);

      set({
        businessSettings: businessSettings as BusinessSettings,
        products: recalculated,
        pricingRules,
        scenarios,
        appSettings,
        onboardingCompleted: (businessSettings as BusinessSettings).onboardingCompleted ?? false,
        lastSaved,
        currentView: (businessSettings as BusinessSettings).onboardingCompleted ? defaultView : 'dashboard',
        autoBackups: backups,
        undoHistory,
        initialization: summary,
      });

      // Persist recalculated products back to IndexedDB (best-effort).
      try {
        await saveProductsToDb(recalculated);
      } catch (saveErr) {
        console.warn('[PricePilot] Could not persist recalculated products on startup.', saveErr);
      }
    } catch (err) {
      // Total initialization failure. DO NOT delete any data —
      // surface a failure summary so the UI can offer recovery options.
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
    // IndexedDB data — we just bypass it for this session so the
    // owner can keep using the app while the old data remains
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
    // Best-effort: read canonical state from IndexedDB (and capture
    // leftover legacy localStorage) and offer it as a recovery
    // download. This must never throw into the UI.
    downloadRecoveryPayload().catch((err) => {
      console.error('[PricePilot] Could not download existing data.', err);
    });
  },

  // Navigation
  setCurrentView: (view) => set({ currentView: view }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSelectedProductId: (id) => set({ selectedProductId: id }),
  setSelectedProducts: (ids) => set({ selectedProducts: ids }),
  setInitialFilterTab: (tab) => set({ initialFilterTab: tab }),
  setHelpPanelOpen: (open) => set({ helpPanelOpen: open }),

  // Business settings
  updateBusinessSettings: async (updates) => {
    const newSettings = { ...get().businessSettings, ...updates, updatedAt: new Date().toISOString() };
    // Recalculate all products with new settings using the SAFE batch helper
    const { products, pricingRules } = get();
    const batchResult = safelyRecalculateProducts(products, newSettings, pricingRules);
    const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    // ATOMIC: persist settings + recalculated products in ONE Dexie
    // transaction so the catalogue can never end up with new settings
    // but stale calculations (or vice versa).
    try {
      await atomicUpdateSettingsAndProducts(newSettings, recalculated);
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ businessSettings: newSettings, products: recalculated });
      return ok(undefined, 'Settings saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save settings.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  completeOnboarding: async (settings) => {
    const newSettings = { ...get().businessSettings, ...settings, onboardingCompleted: true, updatedAt: new Date().toISOString() };
    try {
      await persistBusinessSettings(newSettings);
      const mode = get().appSettings.applicationMode || 'owner';
      const defaultView: AppView = mode === 'owner' ? 'owner-home' : 'dashboard';
      set({ businessSettings: newSettings, onboardingCompleted: true, currentView: defaultView });
      return ok(undefined, 'Onboarding complete.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not complete onboarding.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  // Products
  addProduct: async (product) => {
    const { businessSettings, pricingRules, products } = get();
    const calculated = recalcProduct(product, businessSettings, pricingRules);
    const newProducts = [...products, calculated];
    try {
      await persistProducts(newProducts);
      set({ products: newProducts });
      return ok(undefined, 'Product added.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the product.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  updateProduct: async (id, updates) => {
    const { products, businessSettings, pricingRules } = get();
    const productBefore = products.find(p => p.id === id);
    if (!productBefore) {
      return invalidInputError(ERROR_CODES.NOT_FOUND, 'Product not found.');
    }
    get().pushUndoAction({
      type: 'product-edit',
      productId: id,
      previousState: { ...productBefore },
      timestamp: new Date().toISOString(),
      description: `Edited ${productBefore.name || 'product'}`,
    });
    const updated = products.map(p => {
      if (p.id === id) {
        const merged = { ...p, ...updates, updatedAt: new Date().toISOString() };
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    try {
      await persistProducts(updated);
      set({ products: updated });
      return ok(undefined, 'Product saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the product.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  deleteProduct: async (id) => {
    const { products } = get();
    const productBefore = products.find(p => p.id === id);
    if (!productBefore) {
      return invalidInputError(ERROR_CODES.NOT_FOUND, 'Product not found.');
    }
    get().pushUndoAction({
      type: 'product-delete',
      productId: id,
      previousState: { ...productBefore },
      timestamp: new Date().toISOString(),
      description: `Deleted ${productBefore.name || 'product'}`,
    });
    const newProducts = products.filter(p => p.id !== id);
    try {
      await persistProducts(newProducts);
      set({ products: newProducts, selectedProducts: [] });
      return ok(undefined, 'Product deleted.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the product.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  deleteSelectedProducts: async () => {
    const { selectedProducts, products } = get();
    const newProducts = products.filter(p => !selectedProducts.includes(p.id));
    try {
      await persistProducts(newProducts);
      set({ products: newProducts, selectedProducts: [] });
      return ok(undefined, `${selectedProducts.length} product(s) deleted.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the selected products.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  bulkUpdateProducts: async (ids, updates) => {
    const { products, businessSettings, pricingRules } = get();
    const updated = products.map(p => {
      if (ids.includes(p.id)) {
        const merged = { ...p, ...updates, updatedAt: new Date().toISOString() };
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    try {
      await persistProducts(updated);
      set({ products: updated });
      return ok(undefined, `${ids.length} product(s) updated.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update the products.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  approveSelectedProducts: async () => {
    const { selectedProducts } = get();
    return get().bulkUpdateProducts(selectedProducts, { isApproved: true, calculatedPricingStatus: 'approved' as PricingStatus });
  },

  markSelectedForReview: async () => {
    const { selectedProducts } = get();
    return get().bulkUpdateProducts(selectedProducts, { calculatedPricingStatus: 'needs-review' as PricingStatus, lifecycleStatus: 'needs-review' as LifecycleStatus });
  },

  duplicateProduct: async (productId) => {
    const { products, businessSettings, pricingRules } = get();
    const original = products.find(p => p.id === productId);
    if (!original) {
      return invalidInputError(ERROR_CODES.NOT_FOUND, 'Product not found.');
    }
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
    try {
      await persistProducts(newProducts);
      set({ products: newProducts });
      return ok(undefined, 'Product duplicated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not duplicate the product.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  approveProductPrice: async (productId, recommendationMode) => {
    const { products, businessSettings, pricingRules } = get();
    const product = products.find(p => p.id === productId);
    if (!product) {
      return invalidInputError(ERROR_CODES.NOT_FOUND, 'Product not found.');
    }
    const approvedPrice = product.recommendedPrices[recommendationMode] || product.recommendedPrices.balanced;
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
    try {
      await persistProducts(updated);
      set({ products: updated });
      return ok(undefined, 'Price approved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not approve the price.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  applyApprovedPrice: async (productId) => {
    const { products, businessSettings, pricingRules } = get();
    const product = products.find(p => p.id === productId);
    if (!product) {
      return invalidInputError(ERROR_CODES.NOT_FOUND, 'Product not found.');
    }
    if (product.priceApprovalStatus !== 'approved' || product.finalApprovedPrice <= 0) {
      return invalidInputError(ERROR_CODES.VALIDATION_FAILED, 'Approve a price before applying it.');
    }
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
    try {
      await persistProducts(updated);
      set({ products: updated });
      return ok(undefined, 'Price applied.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not apply the price.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  bulkSetField: async (productIds, field, value) => {
    const { products, businessSettings, pricingRules } = get();
    const updated = products.map(p => {
      if (productIds.includes(p.id)) {
        const merged = { ...p, [field]: value, updatedAt: new Date().toISOString() } as Product;
        return recalcProduct(merged, businessSettings, pricingRules);
      }
      return p;
    });
    try {
      await persistProducts(updated);
      set({ products: updated });
      return ok(undefined, `${productIds.length} product(s) updated.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update the products.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  bulkApprovePrices: async (productIds) => {
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
    try {
      await persistProducts(updated);
      set({ products: updated });
      return ok(undefined, `${productIds.length} price(s) approved.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not approve the prices.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  archiveProducts: async (productIds) => {
    return get().bulkSetField(productIds, 'lifecycleStatus', 'archived' as LifecycleStatus);
  },

  loadSampleData: async () => {
    const { businessSettings, pricingRules } = get();
    const existingRules = pricingRules.length > 0 ? pricingRules : SAMPLE_PRICING_RULES;
    const batchResult = safelyRecalculateProducts(SAMPLE_PRODUCTS, businessSettings, existingRules);
    const calculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    const rulesToSave = pricingRules.length === 0 ? SAMPLE_PRICING_RULES : pricingRules;
    try {
      await Promise.all([
        persistProducts(calculated),
        pricingRules.length === 0 ? persistPricingRules(SAMPLE_PRICING_RULES) : Promise.resolve(),
      ]);
      set({ products: calculated, pricingRules: rulesToSave });
      return ok(undefined, 'Sample data loaded.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load sample data.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  loadDemoSampleData: async () => {
    try {
      await get().createAutoBackup('manual', 'Before loading demo sample data');
    } catch (err) {
      return retryableError(ERROR_CODES.BACKUP_FAILED, 'Could not create a safety backup. Sample data was not loaded.');
    }
    const { businessSettings, pricingRules } = get();
    const existingRules = pricingRules.length > 0 ? pricingRules : SAMPLE_PRICING_RULES;
    const batchResult = safelyRecalculateProducts(SAMPLE_PRODUCTS, businessSettings, existingRules);
    const calculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    const rulesToSave = pricingRules.length === 0 ? SAMPLE_PRICING_RULES : pricingRules;
    try {
      await Promise.all([
        persistProducts(calculated),
        pricingRules.length === 0 ? persistPricingRules(SAMPLE_PRICING_RULES) : Promise.resolve(),
      ]);
      get().updateAppSettings({ sampleDataLoaded: true });
      set({ products: calculated, pricingRules: rulesToSave });
      return ok(undefined, 'Demo data loaded.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load demo data.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  removeDemoSampleData: async () => {
    try {
      await clearProductsInDb();
      await saveLastSavedTimestampToDb(new Date().toISOString());
      get().updateAppSettings({ sampleDataLoaded: false });
      set({ products: [] });
      return ok(undefined, 'Demo data removed.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove demo data.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  clearAllProducts: async () => {
    try {
      await clearProductsInDb();
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ products: [] });
      return ok(undefined, 'All products cleared.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not clear products.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  recalculateProducts: async () => {
    set({ isCalculating: true });
    const { businessSettings, pricingRules, products } = get();
    const batchResult = safelyRecalculateProducts(products, businessSettings, pricingRules);
    const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    try {
      await persistProducts(recalculated);
      set({ products: recalculated, isCalculating: false });
      return ok(undefined, 'Recalculated.');
    } catch (err) {
      set({ isCalculating: false });
      const message = err instanceof Error ? err.message : 'Could not recalculate products.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  // Import
  updateImportState: (updates) => {
    set({ importState: { ...get().importState, ...updates } });
  },

  importProducts: async (newProducts) => {
    // Create auto-backup before import. If backup fails, abort.
    try {
      await get().createAutoBackup('import', `Before importing ${newProducts.length} products`);
    } catch (err) {
      return retryableError(ERROR_CODES.BACKUP_FAILED, 'Could not create a safety backup. The import was not applied.');
    }
    const { businessSettings, pricingRules, products } = get();
    const batchResult = safelyRecalculateProducts(newProducts, businessSettings, pricingRules);
    const calculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    get().pushUndoAction({
      type: 'import',
      productIds: calculated.map(p => p.id),
      previousState: [...products],
      timestamp: new Date().toISOString(),
      description: `Imported ${calculated.length} products`,
    });
    const allProducts = [...products, ...calculated];
    try {
      await persistProducts(allProducts);
      set({ products: allProducts, currentView: 'products' });
      get().resetImportState();
      return ok(undefined, `Imported ${calculated.length} product(s).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not import the products.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  resetImportState: () => {
    set({ importState: createDefaultImportState() });
  },

  // Pricing rules
  addPricingRule: async (rule) => {
    const { businessSettings, products, pricingRules } = get();
    const newRules = [...pricingRules, rule];
    // Recalculate products under the new rule set.
    const batchResult = safelyRecalculateProducts(products, businessSettings, newRules);
    const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    try {
      await atomicUpdateRulesAndProducts(newRules, recalculated);
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ pricingRules: newRules, products: recalculated });
      return ok(undefined, 'Pricing rule added.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the pricing rule.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  updatePricingRule: async (id, updates) => {
    const { pricingRules, businessSettings, products } = get();
    const updated = pricingRules.map(r =>
      r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
    );
    const batchResult = safelyRecalculateProducts(products, businessSettings, updated);
    const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    try {
      await atomicUpdateRulesAndProducts(updated, recalculated);
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ pricingRules: updated, products: recalculated });
      return ok(undefined, 'Pricing rule saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the pricing rule.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  deletePricingRule: async (id) => {
    const { pricingRules, businessSettings, products } = get();
    const updated = pricingRules.filter(r => r.id !== id);
    const batchResult = safelyRecalculateProducts(products, businessSettings, updated);
    const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    try {
      await atomicUpdateRulesAndProducts(updated, recalculated);
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ pricingRules: updated, products: recalculated });
      return ok(undefined, 'Pricing rule deleted.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the pricing rule.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  duplicatePricingRule: async (id) => {
    const { pricingRules } = get();
    const original = pricingRules.find(r => r.id === id);
    if (!original) {
      return invalidInputError(ERROR_CODES.NOT_FOUND, 'Pricing rule not found.');
    }
    const newRule: PricingRule = {
      ...original,
      id: `rule-${Date.now()}`,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...pricingRules, newRule];
    try {
      await persistPricingRules(updated);
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ pricingRules: updated });
      return ok(undefined, 'Pricing rule duplicated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not duplicate the pricing rule.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  // Scenarios
  addScenario: async (scenario) => {
    const scenarios = [...get().scenarios, scenario];
    try {
      await persistScenarios(scenarios);
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ scenarios });
      return ok(undefined, 'Scenario saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the scenario.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  updateScenario: async (id, updates) => {
    const { scenarios } = get();
    const updated = scenarios.map(s =>
      s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
    );
    try {
      await persistScenarios(updated);
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ scenarios: updated });
      return ok(undefined, 'Scenario saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the scenario.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  deleteScenario: async (id) => {
    const { scenarios } = get();
    const updated = scenarios.filter(s => s.id !== id);
    try {
      await persistScenarios(updated);
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({ scenarios: updated });
      return ok(undefined, 'Scenario deleted.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the scenario.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  restoreScenario: async (id) => {
    const { scenarios, businessSettings, pricingRules } = get();
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) {
      return invalidInputError(ERROR_CODES.NOT_FOUND, 'Scenario not found.');
    }
    // Recalculate snapshot products under the snapshot's own settings/rules
    // so the restored state is internally consistent.
    const batchResult = safelyRecalculateProducts(
      scenario.snapshotProducts,
      scenario.snapshotBusinessSettings,
      scenario.snapshotPricingRules,
    );
    const recalculated = [...batchResult.successfulProducts, ...batchResult.failedProducts];
    try {
      await atomicRestoreScenario(
        recalculated,
        scenario.snapshotPricingRules,
        scenario.snapshotBusinessSettings,
      );
      await saveLastSavedTimestampToDb(new Date().toISOString());
      set({
        products: recalculated,
        pricingRules: scenario.snapshotPricingRules,
        businessSettings: scenario.snapshotBusinessSettings,
      });
      return ok(undefined, 'Scenario restored.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not restore the scenario.';
      return retryableError(ERROR_CODES.DATABASE_ERROR, message);
    }
  },

  // Settings (UI preferences only — these stay in localStorage)
  updateAppSettings: (updates) => {
    const newSettings = { ...get().appSettings, ...updates, updatedAt: new Date().toISOString() };
    saveAppSettings(newSettings);
    set({ appSettings: newSettings });
  },

  setApplicationMode: (mode) => {
    get().updateAppSettings({ applicationMode: mode });
    const defaultView: AppView = mode === 'owner' ? 'owner-home' : 'dashboard';
    set({ currentView: defaultView });
  },

  // Recently viewed
  addRecentlyViewed: (productId) => {
    const { recentlyViewedIds } = get();
    const updated = [productId, ...recentlyViewedIds.filter(id => id !== productId)].slice(0, 5);
    set({ recentlyViewedIds: updated });
  },

  // Undo
  pushUndoAction: (action) => {
    const { undoHistory } = get();
    const newHistory = [action, ...undoHistory].slice(0, MAX_UNDO_HISTORY);
    set({ undoHistory: newHistory });
    // Persist undo history to IndexedDB (best-effort).
    saveUndoHistoryToDb(newHistory).catch((err) => {
      console.warn('[PricePilot] Could not persist undo history to IndexedDB.', err);
    });
  },

  undoLastAction: () => {
    const { undoHistory, products, businessSettings, pricingRules } = get();
    if (undoHistory.length === 0) return;
    const lastAction = undoHistory[0];
    const remainingHistory = undoHistory.slice(1);

    let newProducts: Product[] = products;

    if (lastAction.type === 'price-approve' || lastAction.type === 'price-apply' || lastAction.type === 'product-edit') {
      const previousProduct = lastAction.previousState as Product;
      newProducts = products.map(p => {
        if (p.id === lastAction.productId) {
          return recalcProduct(previousProduct, businessSettings, pricingRules);
        }
        return p;
      });
    } else if (lastAction.type === 'product-delete') {
      const previousProduct = lastAction.previousState as Product;
      const recalculated = recalcProduct(previousProduct, businessSettings, pricingRules);
      newProducts = [...products, recalculated];
    } else if (lastAction.type === 'bulk-approve') {
      const previousProducts = lastAction.previousState as Product[];
      newProducts = products.map(p => {
        const prev = previousProducts.find(pp => pp.id === p.id);
        if (prev) return recalcProduct(prev, businessSettings, pricingRules);
        return p;
      });
    } else if (lastAction.type === 'import') {
      const previousProducts = lastAction.previousState as Product[];
      newProducts = previousProducts.map(p => recalcProduct(p, businessSettings, pricingRules));
    }

    // Persist to IndexedDB. Best-effort — failures are logged but do
    // not block the undo.
    Promise.all([
      saveProductsToDb(newProducts),
      saveUndoHistoryToDb(remainingHistory),
      saveLastSavedTimestampToDb(new Date().toISOString()),
    ])
      .then(() => {
        set({ products: newProducts, undoHistory: remainingHistory });
      })
      .catch((err) => {
        console.warn('[PricePilot] Could not persist undo result to IndexedDB.', err);
      });
  },

  // Backup
  createAutoBackup: async (trigger, description) => {
    // Backups now live in IndexedDB. Backup creation must NOT crash the
    // operation it was called from. If backup creation fails, we
    // surface a warning to the user and DO NOT continue with any
    // destructive action that depended on the backup.
    try {
      // Phase 5: build the backup from canonical IndexedDB state via
      // the backup-service. The legacy exportAllData() is no longer
      // used.
      const { backup } = await buildBackup();
      const dataString = serializeBackup(backup);
      const autoBackup: AutoBackup = {
        id: `backup-${Date.now()}`,
        timestamp: new Date().toISOString(),
        trigger,
        dataString,
        description,
      };
      const { autoBackups } = get();
      // Keep the latest 10.
      const newBackups = [autoBackup, ...autoBackups].slice(0, MAX_AUTO_BACKUPS);
      // Persist to IndexedDB.
      await saveBackupsToDb(newBackups);
      set({ autoBackups: newBackups });
    } catch (err) {
      console.error('[PricePilot] Could not create safety backup.', err);
      throw new Error(
        'PricePilot could not create a safety backup. The requested change has not been applied.'
      );
    }
  },

  downloadBackup: () => {
    // Phase 5: download the canonical backup file. Best-effort —
    // never throws into the UI.
    downloadBackupFile().catch((err) => {
      console.error('[PricePilot] Could not download backup.', err);
    });
  },

  restoreBackup: async (dataString) => {
    // Restore is now atomic via IndexedDB transactions.
    try {
      const data = JSON.parse(dataString);
      // Create a safety backup first.
      try {
        await get().createAutoBackup('manual', 'Before restoring backup');
      } catch (backupErr) {
        // Backup failed — abort the restore.
        console.error('[PricePilot] Restore aborted because backup creation failed.', backupErr);
        return false;
      }
      // Atomic restore via IndexedDB.
      if (data.products && data.businessSettings) {
        await atomicRestoreBackup({
          products: data.products,
          businessSettings: data.businessSettings,
          pricingRules: data.pricingRules ?? [],
          scenarios: data.scenarios ?? [],
        });
        await saveLastSavedTimestampToDb(new Date().toISOString());
        await get().initialize();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[PricePilot] Restore failed.', err);
      return false;
    }
  },

  getBackupList: () => {
    return get().autoBackups;
  },

  // Data management
  exportData: () => {
    // Synchronous read from in-memory state. The canonical async path
    // is `downloadBackup()` which uses `buildBackup()` from
    // `backup-service.ts` — that one reads from IndexedDB inside a
    // transaction, normalizes products, validates finite numbers, and
    // computes a content hash. This sync helper is kept for callers
    // that need an immediate in-memory snapshot (e.g. error-boundary
    // recovery download).
    const { businessSettings, products, pricingRules, scenarios } = get();
    const payload: PricePilotBackup = {
      format: 'pricepilot-backup',
      backupVersion: 1,
      schemaVersion: 1,
      appVersion: '0.2.1',
      createdAt: new Date().toISOString(),
      businessSettings,
      products,
      pricingRules,
      scenarios,
    };
    return JSON.stringify(payload, null, 2);
  },

  importData: (dataString) => {
    try {
      const data = JSON.parse(dataString);
      // Atomic restore via IndexedDB. Fire-and-forget here; the UI
      // shows a toast and reloads state on success.
      if (data.products && data.businessSettings) {
        atomicRestoreBackup({
          products: data.products,
          businessSettings: data.businessSettings,
          pricingRules: data.pricingRules ?? [],
          scenarios: data.scenarios ?? [],
        })
          .then(() => {
            saveLastSavedTimestampToDb(new Date().toISOString());
            get().initialize();
          })
          .catch((err) => {
            console.error('[PricePilot] importData failed.', err);
          });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  resetApplication: async () => {
    // Create a safety backup BEFORE the reset. If backup creation
    // fails, the reset is aborted.
    try {
      await get().createAutoBackup('reset', 'Before application reset');
    } catch (err) {
      console.error('[PricePilot] Reset aborted because backup creation failed.', err);
      throw err;
    }
    // Atomic reset via IndexedDB.
    try {
      await atomicResetAll();
      await saveLastSavedTimestampToDb(new Date().toISOString());
      clearAppSettings();
    } catch (err) {
      console.error('[PricePilot] IndexedDB reset failed.', err);
      throw err;
    }
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
      autoBackups: [],
    });
  },
}));
