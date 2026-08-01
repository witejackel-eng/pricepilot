/**
 * PricePilot — Hydration and Startup Recovery E2E Test
 *
 * Verifies that the production build hydrates correctly
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

import { test, expect } from '@playwright/test';
import {
  resetPricePilotState,
  waitForAppStartup,
  attachErrorWatchers,
} from './helpers/reset-app-state';

test.describe('Hydration and Startup Recovery', () => {
  test('application hydrates without errors on fresh load', async ({ page, context }) => {
    const errors = attachErrorWatchers(page);

    await resetPricePilotState(page, context);

    // Wait for the application to render
    const startupState = await waitForAppStartup(page);
    expect(['onboarding', 'owner-home'], `Expected valid startup state, got: ${startupState}`).toContain(startupState);

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

  test('application renders without blocked scripts', async ({ page, context }) => {
    const errors = attachErrorWatchers(page);

    await resetPricePilotState(page, context);
    await waitForAppStartup(page);

    // Check for "Refused to execute" errors
    const blockedScripts = errors.filter(e =>
      e.includes('Refused to execute') ||
      e.includes('Refused to apply') ||
      e.includes('Refused to load')
    );
    expect(blockedScripts, `No scripts should be blocked. Found: ${blockedScripts.join('; ')}`).toHaveLength(0);
  });

  test('application persists after refresh', async ({ page, context }) => {
    const errors = attachErrorWatchers(page);

    await resetPricePilotState(page, context);
    await waitForAppStartup(page);

    // Refresh
    await page.reload();
    await waitForAppStartup(page);

    // Check for errors after refresh
    const criticalErrors = errors.filter(e =>
      (e.includes('[pageerror]') && !e.includes('ResizeObserver')) ||
      e.includes('[csp]') ||
      e.includes('Hydration failed')
    );
    expect(criticalErrors, `No critical errors after refresh. Found: ${criticalErrors.join('; ')}`).toHaveLength(0);
  });

  test('no NaN or Infinity in rendered content', async ({ page, context }) => {
    await resetPricePilotState(page, context);
    await waitForAppStartup(page);

    const bodyText = await page.locator('body').textContent() ?? '';
    expect(bodyText, 'Page must not display "Infinity"').not.toContain('Infinity');
    expect(bodyText, 'Page must not display "NaN"').not.toContain('NaN');
  });

  test('guided tour does not auto-open after onboarding', async ({ page, context }) => {
    await resetPricePilotState(page, context);
    const startupState = await waitForAppStartup(page);
    expect(startupState, 'Fresh browser must show onboarding').toBe('onboarding');

    // Complete onboarding quickly
    const businessNameInput = page.locator('#businessName');
    await expect(businessNameInput, 'Business name input must be visible').toBeVisible({ timeout: 10_000 });
    await businessNameInput.fill('Tour Test Business');

    // Click through all steps
    for (let i = 0; i < 4; i++) {
      const nextBtn = page.locator('[data-testid="onboarding-next"]');
      if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nextBtn.click();
      }
    }

    // Wait for owner home
    const ownerHome = page.locator('[data-testid="owner-home"]');
    await expect(ownerHome, 'Owner Home must be visible after onboarding').toBeVisible({ timeout: 15_000 });

    // Verify the guided tour dialog does NOT auto-open
    const tourDialog = page.locator('[data-testid="guided-tour-dialog"]');
    await expect(tourDialog, 'Guided tour dialog must NOT auto-open after onboarding').not.toBeVisible({ timeout: 5_000 });

    // Refresh and verify tour still does not auto-open
    await page.reload();
    await waitForAppStartup(page);
    await expect(tourDialog, 'Guided tour dialog must NOT auto-open after refresh').not.toBeVisible({ timeout: 5_000 });
  });
});
