/**
 * PricePilot - UI Preferences (localStorage)
 *
 * Phase 1 of production-readiness: localStorage is now used ONLY for
 * lightweight UI preferences, never for primary business data.
 *
 * Allowed keys (all others must live in IndexedDB):
 *   - applicationMode   ('owner' | 'advanced')
 *   - sidebarCollapsed  (boolean)
 *   - sampleDataLoaded  (boolean)
 *   - guidedTourCompleted (boolean)
 *   - lastViewedPage    (string)
 *   - theme             ('light' | 'dark' | 'system')
 *
 * NO products, business settings, pricing rules, scenarios, backups,
 * undo history, or import state may be persisted through this module.
 */

import { AppSettings, createDefaultAppSettings } from './types';

const APP_SETTINGS_KEY = 'pricepilot_ui_preferences';

/**
 * Load UI preferences from localStorage. Returns defaults if missing
 * or unparseable. NEVER throws.
 */
export function loadAppSettings(): AppSettings {
  if (typeof localStorage === 'undefined') return createDefaultAppSettings();
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return createDefaultAppSettings();
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Merge with defaults so missing keys don't crash consumers.
    return { ...createDefaultAppSettings(), ...parsed, updatedAt: new Date().toISOString() };
  } catch {
    return createDefaultAppSettings();
  }
}

/**
 * Save UI preferences to localStorage. NEVER throws.
 */
export function saveAppSettings(settings: AppSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    // localStorage is best-effort for UI prefs. If it's full or
    // unavailable, the app still works in-session.
    console.warn('[PricePilot] Could not save UI preferences to localStorage.', err);
  }
}

/**
 * Remove UI preferences from localStorage. Used by `resetApplication`.
 */
export function clearAppSettings(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(APP_SETTINGS_KEY);
  } catch {
    // ignore
  }
}

/**
 * Check whether the legacy `pricepilot_v1_appSettings` key still
 * exists in localStorage (for migration detection).
 */
export function hasLegacyAppSettings(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem('pricepilot_v1_appSettings') !== null;
  } catch {
    return false;
  }
}

/**
 * One-time migration of the legacy `pricepilot_v1_appSettings` key
 * to the new `pricepilot_ui_preferences` key. Idempotent.
 */
export function migrateLegacyAppSettingsIfNeeded(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const legacyRaw = localStorage.getItem('pricepilot_v1_appSettings');
    if (!legacyRaw) return;
    // Don't overwrite the new key if it already exists.
    if (localStorage.getItem(APP_SETTINGS_KEY) !== null) return;
    localStorage.setItem(APP_SETTINGS_KEY, legacyRaw);
    // We do NOT delete the legacy key here — that happens via the
    // Settings → "Remove Old Storage Copy" action once the user
    // confirms.
  } catch (err) {
    console.warn('[PricePilot] Could not migrate legacy appSettings.', err);
  }
}
