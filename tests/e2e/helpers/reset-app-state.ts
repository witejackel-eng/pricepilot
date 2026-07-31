/**
 * PricePilot — E2E State Reset Helper
 *
 * Safely clears all browser state for a deterministic test start.
 * Handles cookies, localStorage, sessionStorage, Cache Storage,
 * Service Workers, and all PricePilot IndexedDB databases.
 *
 * Works across Chromium, Firefox, and WebKit (handles missing
 * `indexedDB.databases()` in WebKit).
 */

import { type Page, type BrowserContext, expect } from '@playwright/test';

/**
 * Reset all PricePilot browser state to a clean slate.
 *
 * MUST be called before each test to ensure deterministic startup.
 * After reset, the app should show fresh onboarding.
 */
export async function resetPricePilotState(
  page: Page,
  context: BrowserContext,
): Promise<void> {
  // Clear cookies
  await context.clearCookies();

  // Navigate to the app first so we can access storage APIs
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Clear all storage and IndexedDB
  await page.evaluate(async () => {
    // localStorage
    try {
      localStorage.clear();
    } catch {
      // ignore
    }

    // sessionStorage
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }

    // Cache Storage
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // ignore
      }
    }

    // Service Workers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister()),
        );
      } catch {
        // ignore
      }
    }

    // IndexedDB — delete all databases
    // WebKit does not support indexedDB.databases(), so we enumerate
    // known database names.
    const knownDbNames = ['pricepilot', 'pricepilot_v1', 'PricePilotDB'];

    // Try to get all databases if supported (Chromium, Firefox)
    let dbNames: string[] = knownDbNames;
    if (typeof indexedDB.databases === 'function') {
      try {
        const dbs = await indexedDB.databases();
        const extraNames = dbs
          .map((db) => db.name)
          .filter((name): name is string => Boolean(name))
          .filter((name) => !knownDbNames.includes(name));
        dbNames = [...knownDbNames, ...extraNames];
      } catch {
        // Fall back to known names
      }
    }

    // Delete each database
    await Promise.all(
      dbNames.map(
        (name) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve(); // Don't fail the test
            request.onblocked = () => resolve(); // Don't fail the test
          }),
      ),
    );
  });

  // Reload to ensure the app starts fresh
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Navigation identifiers — stable test IDs for the sidebar navigation.
 *
 * These match the `data-testid="nav-${item.view}"` attributes
 * added to the sidebar buttons in app-shell.tsx.
 */
export const navigationIds = {
  home: 'nav-owner-home',
  import: 'nav-import',
  products: 'nav-products',
  review: 'nav-review-prices',
  export: 'nav-export',
  settings: 'nav-settings',
  'pricing-rules': 'nav-pricing-rules',
  'price-simulator': 'nav-price-simulator',
  scenarios: 'nav-scenarios',
  dashboard: 'nav-dashboard',
} as const;

export type NavigationTarget = keyof typeof navigationIds;

/**
 * Navigate to a view using the stable test ID.
 *
 * On mobile, opens the mobile navigation first if the sidebar
 * is not visible. Also dismisses any open dialogs/sheets that
 * might intercept pointer events.
 */
export async function navigateTo(
  page: Page,
  target: NavigationTarget,
): Promise<void> {
  const testId = navigationIds[target];

  // Dismiss any open dialogs/sheets/drawers that might intercept clicks.
  // Only press Escape if there's actually an overlay open.
  const overlay = page.locator('[data-slot="sheet-overlay"][data-state="open"], [role="dialog"][data-state="open"]').first();
  if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
    // Press Escape again if still open
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // On mobile, the sidebar may be hidden behind a hamburger menu.
  // Try to open the mobile menu first.
  const sidebarToggle = page.getByRole('button', { name: /menu|toggle sidebar|open sidebar/i }).first();
  if (await sidebarToggle.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await sidebarToggle.click();
    await page.waitForTimeout(500);
  }

  // In owner mode, some nav items (Settings, Pricing Rules, etc.) are
  // inside an "Advanced Tools" collapsible section. Expand it if the
  // target button is not already in the DOM.
  let button = page.getByTestId(testId);
  let isButtonAttached = await button.count().catch(() => 0);

  if (isButtonAttached === 0) {
    // Try expanding the "Advanced Tools" collapsible section using its testid
    const advancedToolsTrigger = page.getByTestId('nav-advanced-tools').first();
    if (await advancedToolsTrigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await advancedToolsTrigger.click();
      // Wait for the button to be attached to the DOM (not just visible)
      await button.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {});
      isButtonAttached = await button.count().catch(() => 0);

      // If still not attached, try clicking again with force
      if (isButtonAttached === 0) {
        await advancedToolsTrigger.click({ force: true }).catch(() => {});
        await button.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {});
      }
    }
  }

  await expect(button, `Navigation button "${target}" (${testId}) must be visible`).toBeVisible({ timeout: 10_000 });
  await expect(button, `Navigation button "${target}" must be enabled`).toBeEnabled();
  await button.click();
}

/**
 * Wait for the PricePilot app to reach a known startup state.
 *
 * Returns the detected state: 'onboarding', 'owner-home', or 'error'.
 */
export async function waitForAppStartup(
  page: Page,
  options: { timeout?: number } = {},
): Promise<'onboarding' | 'owner-home' | 'error'> {
  const timeout = options.timeout ?? 30_000;

  const onboardingForm = page.locator('[data-testid="onboarding-form"]');
  const ownerHome = page.locator('[data-testid="owner-home"]');
  const initReady = page.locator('[data-testid="app-initialization-ready"]');
  const initFailed = page.locator('[data-testid="app-initialization-failed"]');

  // Wait for any of the startup states to appear
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await onboardingForm.isVisible({ timeout: 0 }).catch(() => false)) {
      return 'onboarding';
    }
    if (await ownerHome.isVisible({ timeout: 0 }).catch(() => false)) {
      return 'owner-home';
    }
    if (await initReady.isVisible({ timeout: 0 }).catch(() => false)) {
      // App shell is rendered, but we need to check if owner-home is inside
      if (await ownerHome.isVisible({ timeout: 0 }).catch(() => false)) {
        return 'owner-home';
      }
      // Could be on a different view, still valid
      return 'owner-home';
    }
    if (await initFailed.isVisible({ timeout: 0 }).catch(() => false)) {
      return 'error';
    }
    await page.waitForTimeout(200);
  }

  throw new Error(
    `App did not reach a known startup state within ${timeout}ms. ` +
    `Page content: ${(await page.locator('body').textContent() ?? '').slice(0, 200)}`,
  );
}

/**
 * Collect browser console errors, page errors, unhandled rejections,
 * and CSP violations.
 */
export function attachErrorWatchers(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore expected warnings from third-party libraries and our own intentional warnings.
      if (text.includes('Download the React DevTools')) return;
      if (text.includes('fake-indexeddb')) return;
      errors.push(`[console.error] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  page.on('crash', () => {
    errors.push('[crash] Page crashed');
  });

  // Monitor CSP violations
  page.on('console', (msg) => {
    if (msg.text().includes('Content Security Policy') || msg.text().includes('CSP')) {
      errors.push(`[csp] ${msg.text()}`);
    }
  });

  return errors;
}

/**
 * Assert that the page does not contain Infinity, NaN, or undefined
 * in financial contexts.
 */
export async function assertNoInvalidNumbers(
  page: Page,
  context?: string,
): Promise<void> {
  const bodyText = await page.locator('body').textContent() ?? '';
  const ctx = context ? ` (context: ${context})` : '';
  expect(bodyText, `Page must not display "Infinity"${ctx}`).not.toContain('Infinity');
  expect(bodyText, `Page must not display "NaN"${ctx}`).not.toContain('NaN');
  expect(bodyText, `Page must not display "₹ undefined"${ctx}`).not.toContain('₹ undefined');
  expect(bodyText, `Page must not display "undefined%"${ctx}`).not.toContain('undefined%');
  expect(bodyText, `Page must not display "NaN%"${ctx}`).not.toContain('NaN%');
  expect(bodyText, `Page must not display "Infinity%"${ctx}`).not.toContain('Infinity%');
}

/**
 * Parse a currency-formatted number from text (e.g. "₹225.00" → 225).
 */
export function parseCurrency(text: string): number {
  const numStr = text.replace(/[^\d.-]/g, '');
  return parseFloat(numStr);
}


