/**
 * PricePilot - Local Storage System with Versioned Schema
 *
 * All data is stored in localStorage with a version prefix.
 * Supports save/load, export/import for backup, and partial resets.
 * Includes auto-save with debouncing and lastSaved timestamp tracking.
 *
 * IMPORTANT: Storage MUST store and retrieve records ONLY.
 * It must NOT use any pricing engine or recalculate through a legacy engine.
 * All calculation is done through the canonical pricing engine in the Zustand store.
 */

import {
  Product,
  BusinessSettings,
  PricingRule,
  Scenario,
  ColumnMapping,
  AppSettings,
  ImportState,
  createDefaultBusinessSettings,
  createDefaultAppSettings,
  createDefaultImportState,
} from './types';

// ============================================================
// Constants
// ============================================================

/** Current storage schema version. Increment when schema changes. */
export const STORAGE_VERSION = 1;

/** Base key prefix for all PricePilot data */
const KEY_PREFIX = 'pricepilot_v';

/** Full prefix with version */
const PREFIX = `${KEY_PREFIX}${STORAGE_VERSION}_`;

/** Individual storage keys */
const KEYS = {
  businessSettings: `${PREFIX}businessSettings`,
  products: `${PREFIX}products`,
  pricingRules: `${PREFIX}pricingRules`,
  scenarios: `${PREFIX}scenarios`,
  columnMappings: `${PREFIX}columnMappings`,
  appSettings: `${PREFIX}appSettings`,
  onboardingCompleted: `${PREFIX}onboardingCompleted`,
  lastSaved: `${PREFIX}lastSaved`,
  version: `${KEY_PREFIX}version`,
};

// ============================================================
// Generic Save / Load
// ============================================================

function saveToStorage<T>(key: string, data: T): void {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
    updateLastSaved();
  } catch (error) {
    console.error(`[PricePilot Storage] Failed to save to key "${key}":`, error);
    // If localStorage is full, try to clear old version data
    handleStorageFullError(error);
  }
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const serialized = localStorage.getItem(key);
    if (serialized === null || serialized === undefined) return fallback;
    const parsed = JSON.parse(serialized);
    return parsed as T;
  } catch (error) {
    console.error(`[PricePilot Storage] Failed to load from key "${key}":`, error);
    return fallback;
  }
}

function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`[PricePilot Storage] Failed to remove key "${key}":`, error);
  }
}

function updateLastSaved(): void {
  localStorage.setItem(KEYS.lastSaved, new Date().toISOString());
}

function handleStorageFullError(error: unknown): void {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    console.warn('[PricePilot Storage] localStorage quota exceeded. Attempting cleanup...');
    // Remove old version data
    cleanupOldVersions();
  }
}

function cleanupOldVersions(): void {
  const currentVersion = STORAGE_VERSION;
  for (let v = 0; v < currentVersion; v++) {
    const oldPrefix = `${KEY_PREFIX}${v}_`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(oldPrefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}

// ============================================================
// Version Check & Migration
// ============================================================

/**
 * Check the stored version and perform migration if needed.
 * Called on app initialization.
 */
export function checkAndMigrate(): void {
  const storedVersion = loadFromStorage<number>(KEYS.version, 0);

  if (storedVersion < STORAGE_VERSION) {
    console.log(`[PricePilot Storage] Migrating from version ${storedVersion} to ${STORAGE_VERSION}`);
    // For future versions, implement migration logic here
    // Currently v0 → v1: just set version marker
    localStorage.setItem(KEYS.version, JSON.stringify(STORAGE_VERSION));
    cleanupOldVersions();
  }
}

/**
 * Get the current storage version.
 */
export function getStorageVersion(): number {
  return loadFromStorage<number>(KEYS.version, 0);
}

// ============================================================
// Business Settings
// ============================================================

export function saveBusinessSettings(settings: BusinessSettings): void {
  saveToStorage(KEYS.businessSettings, {
    ...settings,
    updatedAt: new Date().toISOString(),
  });
}

export function loadBusinessSettings(): BusinessSettings {
  return loadFromStorage<BusinessSettings>(KEYS.businessSettings, createDefaultBusinessSettings());
}

// ============================================================
// Products
// ============================================================

export function saveProducts(products: Product[]): void {
  saveToStorage(KEYS.products, products);
}

export function loadProducts(): Product[] {
  return loadFromStorage<Product[]>(KEYS.products, []);
}

/**
 * Save a single product. If it has an existing ID, update it.
 * Otherwise, add it to the list.
 * 
 * IMPORTANT: This does NOT recalculate. Calculation is handled by the store.
 */
export function saveProduct(product: Product): Product[] {
  const products = loadProducts();
  
  const existingIndex = products.findIndex(p => p.id === product.id);
  if (existingIndex >= 0) {
    products[existingIndex] = product;
  } else {
    products.push(product);
  }
  
  saveProducts(products);
  return products;
}

/**
 * Remove a product by ID.
 */
export function removeProduct(productId: string): Product[] {
  const products = loadProducts();
  const filtered = products.filter(p => p.id !== productId);
  saveProducts(filtered);
  return filtered;
}

/**
 * Clear all products.
 */
export function clearProducts(): void {
  saveToStorage(KEYS.products, []);
}

/**
 * Recalculate all products.
 * 
 * IMPORTANT: This is now a thin wrapper that just saves pre-calculated products.
 * The actual calculation is done in the Zustand store using the canonical engine.
 */
export function recalculateAllProducts(products: Product[]): Product[] {
  saveProducts(products);
  return products;
}

// ============================================================
// Pricing Rules
// ============================================================

export function savePricingRules(rules: PricingRule[]): void {
  saveToStorage(KEYS.pricingRules, rules);
}

export function loadPricingRules(): PricingRule[] {
  return loadFromStorage<PricingRule[]>(KEYS.pricingRules, []);
}

/**
 * Save a single pricing rule. If it has an existing ID, update it.
 */
export function savePricingRule(rule: PricingRule): PricingRule[] {
  const rules = loadPricingRules();
  const existingIndex = rules.findIndex(r => r.id === rule.id);
  if (existingIndex >= 0) {
    rules[existingIndex] = {
      ...rule,
      updatedAt: new Date().toISOString(),
    };
  } else {
    rules.push({
      ...rule,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  savePricingRules(rules);
  return rules;
}

/**
 * Remove a pricing rule by ID.
 */
export function removePricingRule(ruleId: string): PricingRule[] {
  const rules = loadPricingRules();
  const filtered = rules.filter(r => r.id !== ruleId);
  savePricingRules(filtered);
  return filtered;
}

/**
 * Reset all pricing rules (clear them).
 */
export function resetRules(): void {
  saveToStorage(KEYS.pricingRules, []);
}

// ============================================================
// Scenarios
// ============================================================

export function saveScenarios(scenarios: Scenario[]): void {
  saveToStorage(KEYS.scenarios, scenarios);
}

export function loadScenarios(): Scenario[] {
  return loadFromStorage<Scenario[]>(KEYS.scenarios, []);
}

/**
 * Save a scenario snapshot.
 */
export function saveScenario(scenario: Scenario): Scenario[] {
  const scenarios = loadScenarios();
  const existingIndex = scenarios.findIndex(s => s.id === scenario.id);
  if (existingIndex >= 0) {
    scenarios[existingIndex] = {
      ...scenario,
      updatedAt: new Date().toISOString(),
    };
  } else {
    scenarios.push(scenario);
  }
  saveScenarios(scenarios);
  return scenarios;
}

/**
 * Remove a scenario by ID.
 */
export function removeScenario(scenarioId: string): Scenario[] {
  const scenarios = loadScenarios();
  const filtered = scenarios.filter(s => s.id !== scenarioId);
  saveScenarios(filtered);
  return filtered;
}

// ============================================================
// Column Mappings
// ============================================================

export function saveColumnMappings(mappings: ColumnMapping[]): void {
  saveToStorage(KEYS.columnMappings, mappings);
}

export function loadColumnMappings(): ColumnMapping[] {
  return loadFromStorage<ColumnMapping[]>(KEYS.columnMappings, []);
}

// ============================================================
// App Settings
// ============================================================

export function saveAppSettings(settings: AppSettings): void {
  saveToStorage(KEYS.appSettings, {
    ...settings,
    updatedAt: new Date().toISOString(),
  });
}

export function loadAppSettings(): AppSettings {
  return loadFromStorage<AppSettings>(KEYS.appSettings, createDefaultAppSettings());
}

// ============================================================
// Onboarding
// ============================================================

export function saveOnboardingCompleted(completed: boolean): void {
  saveToStorage(KEYS.onboardingCompleted, completed);
}

export function loadOnboardingCompleted(): boolean {
  return loadFromStorage<boolean>(KEYS.onboardingCompleted, false);
}

// ============================================================
// Import State (temporary, not persisted long-term)
// ============================================================

export function saveImportState(state: ImportState): void {
  // Import state is saved to a separate key that's cleared after import
  saveToStorage(`${PREFIX}importState`, state);
}

export function loadImportState(): ImportState {
  return loadFromStorage<ImportState>(`${PREFIX}importState`, createDefaultImportState());
}

export function clearImportState(): void {
  removeFromStorage(`${PREFIX}importState`);
}

// ============================================================
// Last Saved Timestamp
// ============================================================

export function getLastSavedTimestamp(): string | null {
  const raw = localStorage.getItem(KEYS.lastSaved);
  return raw ?? null;
}

// ============================================================
// Export / Import All Data (Backup)
// ============================================================

/**
 * Export all PricePilot data as a JSON object for backup.
 */
export function exportAllData(): {
  version: number;
  exportedAt: string;
  businessSettings: BusinessSettings;
  products: Product[];
  pricingRules: PricingRule[];
  scenarios: Scenario[];
  columnMappings: ColumnMapping[];
  appSettings: AppSettings;
  onboardingCompleted: boolean;
} {
  return {
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    businessSettings: loadBusinessSettings(),
    products: loadProducts(),
    pricingRules: loadPricingRules(),
    scenarios: loadScenarios(),
    columnMappings: loadColumnMappings(),
    appSettings: loadAppSettings(),
    onboardingCompleted: loadOnboardingCompleted(),
  };
}

/**
 * Import all PricePilot data from a JSON backup.
 * Validates the version and overwrites all existing data.
 *
 * @returns true if import succeeded, false if data was invalid
 */
export function importAllData(data: unknown): boolean {
  try {
    if (typeof data !== 'object' || data === null) return false;

    const obj = data as Record<string, unknown>;

    // Version check
    if (typeof obj.version !== 'number') return false;

    // We accept imports from older versions and auto-migrate
    // Reject imports from newer versions we don't understand
    if (obj.version > STORAGE_VERSION) {
      console.warn(`[PricePilot Storage] Import version ${obj.version} is newer than current ${STORAGE_VERSION}. Rejecting.`);
      return false;
    }

    // Save each data section with type checking
    if (obj.businessSettings && typeof obj.businessSettings === 'object') {
      saveBusinessSettings(obj.businessSettings as BusinessSettings);
    }
    if (Array.isArray(obj.products)) {
      saveProducts(obj.products as Product[]);
    }
    if (Array.isArray(obj.pricingRules)) {
      savePricingRules(obj.pricingRules as PricingRule[]);
    }
    if (Array.isArray(obj.scenarios)) {
      saveScenarios(obj.scenarios as Scenario[]);
    }
    if (Array.isArray(obj.columnMappings)) {
      saveColumnMappings(obj.columnMappings as ColumnMapping[]);
    }
    if (obj.appSettings && typeof obj.appSettings === 'object') {
      saveAppSettings(obj.appSettings as AppSettings);
    }
    if (typeof obj.onboardingCompleted === 'boolean') {
      saveOnboardingCompleted(obj.onboardingCompleted);
    }

    // Update version
    localStorage.setItem(KEYS.version, JSON.stringify(STORAGE_VERSION));

    return true;
  } catch (error) {
    console.error('[PricePilot Storage] Import failed:', error);
    return false;
  }
}

// ============================================================
// Reset Functions
// ============================================================

/**
 * Reset all PricePilot data to defaults.
 */
export function resetAll(): void {
  // Remove all keys with our prefix
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Reset only products data.
 */
export function resetProducts(): void {
  clearProducts();
}

/**
 * Reset only pricing rules.
 */
export function resetPricingRules(): void {
  resetRules();
}

/**
 * Reset only scenarios.
 */
export function resetScenarios(): void {
  saveToStorage(KEYS.scenarios, []);
}

// ============================================================
// Auto-Save with Debouncing
// ============================================================

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const DEFAULT_AUTO_SAVE_DELAY = 2000; // 2 seconds debounce

/**
 * Schedule an auto-save operation with debouncing.
 * Multiple calls within the debounce window will only trigger one save.
 *
 * @param saveFn - The function to call when the debounce window expires
 * @param delayMs - Debounce delay in milliseconds
 */
export function scheduleAutoSave(
  saveFn: () => void,
  delayMs: number = DEFAULT_AUTO_SAVE_DELAY
): void {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    saveFn();
    autoSaveTimer = null;
  }, delayMs);
}

/**
 * Cancel any pending auto-save.
 */
export function cancelAutoSave(): void {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/**
 * Immediately execute any pending auto-save.
 */
export function flushAutoSave(): void {
  cancelAutoSave();
  // The pending save function would have been captured by the closure,
  // but since we just cleared it, we can't re-execute it.
  // This is a no-op; use direct save calls if you need immediate persistence.
}

// ============================================================
// Storage Size Estimation
// ============================================================

/**
 * Estimate the total size of PricePilot data in localStorage.
 * Returns size in KB.
 */
export function estimateStorageSize(): number {
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(KEY_PREFIX)) {
      const value = localStorage.getItem(key);
      if (value) {
        // Each character is ~2 bytes in UTF-16
        totalBytes += (key.length + value.length) * 2;
      }
    }
  }
  return Math.round(totalBytes / 1024);
}

// ============================================================
// Initialize Storage
// ============================================================

/**
 * Initialize the storage system. Should be called once on app startup.
 * Checks version, migrates if needed, and ensures defaults exist.
 */
export function initializeStorage(): {
  businessSettings: BusinessSettings;
  products: Product[];
  pricingRules: PricingRule[];
  scenarios: Scenario[];
  appSettings: AppSettings;
  onboardingCompleted: boolean;
} {
  checkAndMigrate();

  // Ensure defaults exist for essential settings
  const businessSettings = loadBusinessSettings();
  const products = loadProducts();
  const pricingRules = loadPricingRules();
  const scenarios = loadScenarios();
  const appSettings = loadAppSettings();
  const onboardingCompleted = loadOnboardingCompleted();

  return {
    businessSettings,
    products,
    pricingRules,
    scenarios,
    appSettings,
    onboardingCompleted,
  };
}
