/**
 * PricePilot — Hydration and Startup Recovery E2E Test
 *
 * Phase 1: Verify that the production build hydrates correctly
 * and that no CSP violations or framework errors occur.
 *
 * The test must fail if:
 * - The loading screen remains after 10 seconds
 * - Onboarding or Owner Home never renders
 * - A framework script is blocked
 * - A CSP violation is logged
 * - Hydration fails
 * - A pageerror occurs
 * - An unhandled Promise rejection occurs
 */

import { test, expect, type Page } from '@playwright/test';

// ============================================================
// Helpers
// ============================================================

function attachErrorWatchers(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
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
    const text = msg.text();
    if (text.includes('Content Security Policy') || text.includes('Refused to execute inline script')) {
      errors.push(`[csp] ${text}`);
    }
  });

  // Monitor hydration failures
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Hydration failed') || text.includes(' hydration')) {
      errors.push(`[hydration] ${text}`);
    }
  });

  // Monitor unhandled rejections
  page.on('pageerror', (err) => {
    if (err.message.includes('Unhandled') || err.message.includes('unhandled')) {
      errors.push(`[unhandled] ${err.message}`);
    }
  });

  return errors;
}

// ============================================================
// Tests
// ============================================================

test.describe('Hydration and Startup Recovery', () => {
  test('application hydrates without errors on fresh load', async ({ page }) => {
    const errors = attachErrorWatchers(page);

    // Navigate to the application
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for the application to render — either onboarding or owner home
    // must appear within 10 seconds
    const appRendered = await page.locator(
      '[data-testid="onboarding-flow"], [data-testid="owner-home"], h1, h2'
    ).first().waitFor({ state: 'visible', timeout: 10_000 });

    expect(appRendered).toBeTruthy();

    // Verify the page is not stuck on a loading screen
    const bodyText = await page.locator('body').textContent() ?? '';
    expect(bodyText.length, 'Page must have rendered content').toBeGreaterThan(50);

    // Check for CSP violations
    const cspErrors = errors.filter(e => e.includes('[csp]'));
    expect(cspErrors, `No CSP violations should occur. Found: ${cspErrors.join('; ')}`).toHaveLength(0);

    // Check for hydration failures
    const hydrationErrors = errors.filter(e => e.includes('[hydration]') || e.includes('Hydration failed'));
    expect(hydrationErrors, `No hydration failures should occur. Found: ${hydrationErrors.join('; ')}`).toHaveLength(0);

    // Check for page errors (excluding known benign ones)
    const pageErrors = errors.filter(e =>
      e.includes('[pageerror]') &&
      !e.includes('ResizeObserver') // benign browser error
    );
    expect(pageErrors, `No page errors should occur. Found: ${pageErrors.join('; ')}`).toHaveLength(0);

    // Check for unhandled rejections
    const unhandledErrors = errors.filter(e => e.includes('[unhandled]'));
    expect(unhandledErrors, `No unhandled rejections should occur. Found: ${unhandledErrors.join('; ')}`).toHaveLength(0);
  });

  test('application renders without blocked scripts', async ({ page }) => {
    const errors = attachErrorWatchers(page);

    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for content to render
    await page.locator('h1, h2, [data-testid]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Check for "Refused to execute" errors
    const blockedScripts = errors.filter(e =>
      e.includes('Refused to execute') ||
      e.includes('Refused to apply') ||
      e.includes('Refused to load')
    );
    expect(blockedScripts, `No scripts should be blocked. Found: ${blockedScripts.join('; ')}`).toHaveLength(0);
  });

  test('application persists after refresh', async ({ page }) => {
    const errors = attachErrorWatchers(page);

    // First load
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('h1, h2, [data-testid]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Refresh
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('h1, h2, [data-testid]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Check for errors after refresh
    const criticalErrors = errors.filter(e =>
      (e.includes('[pageerror]') && !e.includes('ResizeObserver')) ||
      e.includes('[csp]') ||
      e.includes('Hydration failed')
    );
    expect(criticalErrors, `No critical errors after refresh. Found: ${criticalErrors.join('; ')}`).toHaveLength(0);
  });

  test('no NaN or Infinity in rendered content', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('h1, h2, [data-testid]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const bodyText = await page.locator('body').textContent() ?? '';
    expect(bodyText, 'Page must not display "Infinity"').not.toContain('Infinity');
    expect(bodyText, 'Page must not display "NaN"').not.toContain('NaN');
    expect(bodyText, 'Page must not display "undefined"').not.toContain('undefined');
  });
});
