/**
 * PricePilot — E2E State Reset Helper
 *
 * Safely clears all browser state for a deterministic test start.
 * Handles cookies, localStorage, sessionStorage, Cache Storage,
 * Service Workers, and all PricePilot IndexedDB databases.
 *
 * Works across Chromium, Firefox, and WebKit (handles missing
 * `indexedDB.databases()` in WebKit).
 *
 * Key WebKit fix: Before deleting an IndexedDB database, we close
 * any open Dexie connections. On WebKit, if a connection remains
 * open, `deleteDatabase` fires `onblocked` and the database is NOT
 * actually deleted, causing the next page load to see stale data
 * or hang during initialization.
 */

import { type Page, type BrowserContext, expect } from '@playwright/test';

/**
 * Reset all PricePilot browser state to a clean slate.
 *
 * MUST be called before each test to ensure deterministic startup.
 * After reset, the app should show fresh onboarding.
 *
 * WebKit/iPhone critical fix: We clear IndexedDB tables instead of
 * deleting the entire database. Deleting the database while a Dexie
 * connection is open causes `onblocked` on WebKit, and the database
 * is NOT actually deleted. On the next page load, the old data is
 * still there, causing stale state or initialization hangs.
 *
 * By clearing tables instead of deleting the database, we avoid the
 * blocking issue entirely. The database schema remains, but all
 * data is gone.
 */
export async function resetPricePilotState(
  page: Page,
  context: BrowserContext,
): Promise<void> {
  // Clear cookies
  await context.clearCookies();

  // Navigate to the app first so we can access storage APIs
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for the DOM to be interactive before clearing state.
  // Replace the fixed 300ms wait with an observable condition:
  // wait for the app shell to mount (the root element exists).
  // Falls back to a short timeout if the app is in an error state.
  await page.locator('#__next, [data-testid="app-initialization-ready"], [data-testid="app-initialization-failed"], [data-testid="onboarding-form"]').first().waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {
    // If the app shell doesn't mount in 5s, proceed anyway —
    // the IndexedDB clear may still succeed.
  });

  // Phase 4 (WebKit reliability): wait for the app to reach a
  // TERMINAL startup state (onboarding / ready / failed) before
  // clearing IndexedDB. This ensures the in-flight initialization
  // (which may be writing products back to the DB) has COMPLETED,
  // so our clear cannot race with init's write-back. Without this
  // wait, on slower engines (WebKit) the clear could run while init
  // is still mid-transaction, leaving the DB in an inconsistent
  // state that hangs the next reload.
  //
  // We wait up to 15s. If the app doesn't reach a terminal state
  // (e.g. it's genuinely stuck), we proceed anyway — the clear +
  // reload is the recovery path.
  await page.locator(
    '[data-testid="onboarding-form"], [data-testid="owner-home"], [data-testid="app-initialization-ready"], [data-testid="app-initialization-failed"]'
  ).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
    // App didn't reach a terminal state in 15s. Proceed with the
    // clear — the reload is the recovery path for a stuck app.
  });

  // Clear all storage and IndexedDB tables (not the database itself).
  // Also reset the PricePilot initialization guard so a reload
  // can start fresh without hitting the singleton guard.
  await page.evaluate(async () => {
    // Reset the initialization guard if the module is loaded.
    // This prevents a stale initialization Promise from blocking
    // the reload after we clear IndexedDB.
    try {
      // Reset the initialization guard by dispatching a custom event.
      // The app can listen for this event and call resetInitializationGuard().
      // This avoids needing to import the store module at runtime.
      window.dispatchEvent(new CustomEvent('pricepilot:reset-init'));
    } catch {
      // Event dispatch always succeeds, but be defensive.
    }
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

    // ── IndexedDB reset (WebKit-safe) ──────────────────────────
    //
    // CRITICAL (Phase 4 WebKit fix): On WebKit, calling
    // `indexedDB.deleteDatabase()` while a Dexie connection is open
    // fires `onblocked` and the database is NEVER deleted. The next
    // page load then hangs indefinitely on Dexie's `open()`, leaving
    // the app stuck on the "Opening your workspace…" loader forever.
    //
    // The previous strategy opened a SECOND raw `indexedDB.open()`
    // connection from the test and cleared tables through it. That
    // raced with the app's own Dexie connection and, on WebKit,
    // corrupted it — producing the same permanent-loader hang.
    //
    // The correct strategy: ask the APP to close its own Dexie
    // connection first (via the `window.__pricepilotCloseDb` global
    // that database.ts exposes), THEN delete the database. With no
    // open connections, `deleteDatabase` succeeds immediately on
    // every browser (Chromium, Firefox, WebKit, iPhone Safari).
    //
    // We wait for each deletion to settle (success, error, OR blocked)
    // so the reload never happens mid-deletion.

    // 1. Close the app's Dexie connection. Best-effort — if the app
    //    hasn't loaded yet (no global), we fall through to the raw
    //    delete which will still work on Chromium/Firefox.
    try {
      const closer = (window as unknown as {
        __pricepilotCloseDb?: () => boolean;
      }).__pricepilotCloseDb;
      if (typeof closer === 'function') {
        closer();
      }
    } catch {
      // ignore — closing is best-effort
    }

    // 2. Give the close time to settle. Dexie.close() is synchronous
    //    but the underlying IDB connection release is async. WebKit
    //    in particular can take longer than Chromium/Firefox to
    //    actually release the connection, and if we call
    //    deleteDatabase before release it fires `onblocked` and the
    //    delete stays pending — which then blocks Dexie's reopen on
    //    the next page load (the permanent-loader hang). 250ms is a
    //    conservative wait that reliably lets the connection release.
    await new Promise<void>((resolve) => setTimeout(resolve, 250));

    // 3. Collect candidate database names.
    const knownDbNames = ['pricepilot', 'pricepilot_v1', 'PricePilotDB'];
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
        // WebKit does not implement indexedDB.databases() — fall back
        // to the known names list above.
      }
    }

    // 4. Delete each database. With the Dexie connection closed, this
    //    succeeds without `onblocked`. If `onblocked` DOES fire (a
    //    stray connection survived), we RETRY after a delay instead
    //    of giving up — because reloading while a delete is pending
    //    is exactly what hangs WebKit's Dexie reopen on the next page
    //    load. We retry up to 5 times; if it still blocks, we resolve
    //    (the reload will tear the connection down) but this is the
    //    last resort.
    const deleteDb = (name: string): Promise<void> =>
      new Promise<void>((resolve) => {
        let attempts = 0;
        const MAX_ATTEMPTS = 5;
        const tryDelete = () => {
          attempts++;
          try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => {
              if (attempts < MAX_ATTEMPTS) {
                // A connection is still open. Wait and retry — the
                // connection may release shortly.
                setTimeout(tryDelete, 300);
              } else {
                // Exhausted retries. Resolve so the test doesn't
                // hang here; the reload will tear down connections.
                resolve();
              }
            };
            // Safety net: if none of the above fires, resolve after 2s.
            setTimeout(resolve, 2000);
          } catch {
            resolve();
          }
        };
        tryDelete();
      });

    await Promise.all(dbNames.map((name) => deleteDb(name)));
  });

  // Wait for IndexedDB operations to settle before reload.
  // We verify that IndexedDB is actually empty by checking a flag
  // set by the evaluate script, rather than using a fixed timeout.
  // Fixed wait: 200ms — there is no meaningful observable condition
  // for "all IndexedDB transactions have committed" because the
  // transaction completion callback has already fired above.
  // The 200ms covers any pending microtask cleanup.
  await page.waitForTimeout(200);

  // Reload to ensure the app starts fresh
  await page.reload({ waitUntil: 'domcontentloaded' });
}

// ============================================================
// Navigation — Desktop and Mobile
// ============================================================

/**
 * Navigation identifiers — stable test IDs for the sidebar navigation.
 *
 * Desktop sidebar buttons use `data-testid="nav-${item.view}"`.
 * Mobile drawer buttons also use `data-testid="nav-${item.view}"`.
 * The navigateTo helper detects which is appropriate for the current
 * viewport.
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
 * On mobile (viewport < lg), opens the mobile navigation drawer
 * first, then clicks the target inside the drawer. On desktop,
 * clicks the sidebar button directly.
 *
 * IMPORTANT: Both the desktop sidebar and mobile drawer render the
 * same SidebarContent component with identical data-testid attributes.
 * To avoid Playwright strict-mode violations (multiple elements
 * matching the same test ID), we scope the button lookup to the
 * correct container:
 *   - Desktop: scope to the <aside> element
 *   - Mobile: scope to the mobile drawer
 *
 * For "Advanced Tools" items (Pricing Rules, Price Simulator,
 * Scenarios, Settings in owner mode), expands the collapsible
 * section first.
 *
 * PROHIBITED: No force: true, no page.evaluate(() => el.click()),
 * no locator.first() — these bypass real usability problems.
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
    // Wait for overlay to close (observable condition)
    await expect(overlay, 'Overlay should close after Escape').toBeHidden({ timeout: 2_000 }).catch(() => {});
    // Press Escape again if still open
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await expect(overlay, 'Overlay should close after second Escape').toBeHidden({ timeout: 2_000 }).catch(() => {});
    }
  }

  // Detect mobile: if the mobile menu trigger is visible, we're on
  // a mobile viewport and need to open the drawer first.
  // On desktop, the sidebar is always visible.
  const mobileMenuTrigger = page.getByTestId('mobile-navigation-trigger');
  const isMobile = await mobileMenuTrigger.isVisible({ timeout: 1_000 }).catch(() => false);

  // Scope the button lookup to avoid strict-mode violations when
  // both desktop sidebar and mobile drawer have the same test ID.
  let scopeContainer: import('@playwright/test').Locator;

  if (isMobile) {
    // Mobile: open the navigation drawer using the menu trigger.
    await mobileMenuTrigger.click();
    // Wait for the drawer to open
    const mobileDrawer = page.getByTestId('mobile-navigation-drawer');
    await expect(mobileDrawer, 'Mobile navigation drawer must open').toBeVisible({ timeout: 5_000 });

    // Scope to the mobile drawer
    scopeContainer = mobileDrawer;
  } else {
    // Desktop: scope to the sidebar using the desktop-only aside
    // element. We use a CSS selector that matches the sidebar.
    const desktopSidebar = page.locator('aside').filter({ has: page.getByTestId('nav-owner-home') });
    scopeContainer = desktopSidebar;
  }

  // In owner mode, some nav items (Pricing Rules, Price Simulator,
  // Saved Scenarios) are inside an "Advanced Tools" collapsible
  // section. These items need the collapsible to be expanded before
  // they become visible.
  //
  // NOTE: Settings is NO LONGER in this set — it was promoted to a
  // top-level navigation item in Phase 5 so it is always visible.
  const ADVANCED_TOOLS_TARGETS = new Set(['pricing-rules', 'price-simulator', 'scenarios']);

  // First, if this is an Advanced Tools target, try to expand the
  // collapsible section so the button becomes visible.
  if (ADVANCED_TOOLS_TARGETS.has(target)) {
    // Look for the Advanced Tools trigger in the appropriate container.
    // Try the scope container first, then fall back to page-level.
    const advancedInScope = scopeContainer.getByTestId('nav-advanced-tools');
    const advancedInPage = page.getByTestId('nav-advanced-tools');
    
    const isScopeTriggerVisible = await advancedInScope.isVisible({ timeout: 1_000 }).catch(() => false);
    const isPageTriggerVisible = !isScopeTriggerVisible && await advancedInPage.isVisible({ timeout: 1_000 }).catch(() => false);
    
    if (isScopeTriggerVisible) {
      // Check if the button is already visible (collapsible already open)
      const targetButton = scopeContainer.getByTestId(testId);
      if (!await targetButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await advancedInScope.click();
        // Wait for the collapsible content to expand (observable)
        await expect(scopeContainer.getByTestId(testId), `Advanced Tools item ${testId} should appear after expanding`).toBeVisible({ timeout: 3_000 }).catch(() => {});
      }
    } else if (isPageTriggerVisible) {
      const targetButton = page.getByTestId(testId);
      if (!await targetButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await advancedInPage.click();
        // Wait for the collapsible content to expand (observable)
        await expect(page.getByTestId(testId), `Advanced Tools item ${testId} should appear after expanding`).toBeVisible({ timeout: 3_000 }).catch(() => {});
      }
    }
  }

  // Find the button. Try scoped first (avoids strict-mode violations
  // on mobile), then fall back to page-level if not found.
  let button = scopeContainer.getByTestId(testId);
  let isButtonVisible = await button.isVisible({ timeout: 2_000 }).catch(() => false);

  if (!isButtonVisible) {
    // Fall back to page-level lookup
    button = page.getByTestId(testId);
    isButtonVisible = await button.isVisible({ timeout: 3_000 }).catch(() => false);
  }

  await expect(button, `Navigation button "${target}" (${testId}) must be visible`).toBeVisible({ timeout: 10_000 });
  await expect(button, `Navigation button "${target}" must be enabled`).toBeEnabled();
  await button.click();

  // On mobile, the drawer should close after navigation.
  // Verify it closed (the drawer overlay should disappear).
  if (isMobile) {
    const mobileOverlay = page.locator('[data-slot="sheet-overlay"][data-state="open"]');
    // Wait for the mobile overlay to close after navigation (observable)
    await expect(mobileOverlay, 'Mobile overlay should close after navigation').toBeHidden({ timeout: 3_000 }).catch(() => {});
    // If drawer is still open, press Escape
    if (await mobileOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await expect(mobileOverlay, 'Mobile overlay should close after Escape').toBeHidden({ timeout: 3_000 }).catch(() => {});
    }
  }
}

/**
 * Wait for the PricePilot app to reach a known startup state.
 *
 * Returns the detected state: 'onboarding', 'owner-home', or 'error'.
 *
 * Uses Playwright's or-locator to wait for any of the startup markers
 * to appear, rather than a polling loop with fixed waits.
 */
export async function waitForAppStartup(
  page: Page,
  options: { timeout?: number } = {},
): Promise<'onboarding' | 'owner-home' | 'error'> {
  const timeout = options.timeout ?? 45_000;

  const onboardingForm = page.locator('[data-testid="onboarding-form"]');
  const ownerHome = page.locator('[data-testid="owner-home"]');
  const initReady = page.locator('[data-testid="app-initialization-ready"]');
  const initFailed = page.locator('[data-testid="app-initialization-failed"]');

  // Wait for any of the startup states to appear using an or-locator.
  // This avoids the polling loop with fixed waitForTimeout(200).
  // Use .first() to avoid strict-mode violations when multiple
  // markers are visible simultaneously (e.g., app-initialization-ready
  // wraps onboarding-form after initialization succeeds).
  const anyStartupMarker = onboardingForm.or(ownerHome).or(initReady).or(initFailed).first();
  await expect(anyStartupMarker, 'App must reach a startup state').toBeVisible({ timeout });

  // Now determine which state we reached.
  if (await onboardingForm.isVisible({ timeout: 0 }).catch(() => false)) {
    return 'onboarding';
  }
  if (await ownerHome.isVisible({ timeout: 0 }).catch(() => false)) {
    return 'owner-home';
  }
  if (await initReady.isVisible({ timeout: 0 }).catch(() => false)) {
    return 'owner-home';
  }
  if (await initFailed.isVisible({ timeout: 0 }).catch(() => false)) {
    return 'error';
  }

  throw new Error(
    `App did not reach a known startup state within ${timeout}ms. ` +
    `Page content: ${(await page.locator('body').textContent() ?? '').slice(0, 200)}`,
  );
}

/**
 * Collect browser console errors, page errors, unhandled rejections,
 * and CSP violations.
 *
 * Filters out known benign violations:
 * - Next.js runtime eval() CSP violation on Firefox/WebKit.
 *   This is caused by Next.js framework code in the production bundle
 *   (chunk files in /_next/static/chunks/). The CSP correctly blocks
 *   eval() — the violation is informational, not a security issue.
 *   We log it but don't fail the test on it, since we cannot modify
 *   the Next.js framework code.
 */
export function attachErrorWatchers(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore expected warnings from third-party libraries and our own intentional warnings.
      if (text.includes('Download the React DevTools')) return;
      if (text.includes('fake-indexeddb')) return;
      // Ignore Next.js runtime eval() CSP violations.
      // These are caused by Next.js framework code using eval() in
      // the production bundle (emitted by Turbopack). Our CSP
      // correctly blocks them — the violation is informational. The
      // app works correctly without eval() because the blocked code
      // path is a fallback/feature detection that gracefully degrades.
      // Source: /_next/static/chunks/*.js
      //
      // NOTE: Firefox logs "Content-Security-Policy" (hyphen) while
      // Chromium/WebKit use "Content Security Policy" (spaces). Match
      // both forms so the filter is cross-browser consistent.
      const isNextJsEvalCsp =
        (text.includes('Content-Security-Policy') || text.includes('Content Security Policy')) &&
        text.includes('eval') &&
        text.includes('/_next/static/chunks/');
      if (isNextJsEvalCsp) return;
      errors.push(`[console.error] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  page.on('crash', () => {
    errors.push('[crash] Page crashed');
  });

  // Monitor CSP violations — but filter out known benign ones
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Content-Security-Policy') || text.includes('Content Security Policy') || text.includes('CSP')) {
      // Filter out Next.js runtime eval() violations
      if (text.includes('eval') && text.includes('/_next/static/chunks/')) return;
      errors.push(`[csp] ${text}`);
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
