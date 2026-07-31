import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PricePilot.
 *
 * Phase 19: Cross-browser and mobile testing.
 *
 * Projects:
 *   - Desktop Chrome   (existing)
 *   - Desktop Firefox
 *   - Desktop WebKit
 *   - Mobile: Pixel 7
 *   - Mobile: iPhone 14
 *   - Tablet: iPad-like viewport
 *
 * Mobile and tablet projects include metadata.name that can be used
 * to filter tests with --project. Mobile-focused tests live in
 * mobile-flow.spec.ts.
 *
 * Tests live in tests/e2e/.
 *
 * Gate 3: CI runs against the production build (`bun run start`),
 * not the dev server. The webServer is only launched when
 * PLAYWRIGHT_BASE_URL is not provided (i.e., when testing locally).
 *
 * Gate 5: When PLAYWRIGHT_BASE_URL is set (e.g., a Vercel preview
 * URL), no local web server is launched and tests run against that
 * external URL.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // ── Desktop browsers ──────────────────────────────────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // ── Mobile devices ───────────────────────────────────────────
    // Run mobile-only tests with: npx playwright test --project=mobile-pixel-7
    // Exclude mobile tests in CI with: npx playwright test --project=chromium
    {
      name: 'mobile-pixel-7',
      use: {
        ...devices['Pixel 7'],
      },
    },
    {
      name: 'mobile-iphone-14',
      use: {
        ...devices['iPhone 14'],
      },
    },

    // ── Tablet viewport ──────────────────────────────────────────
    {
      name: 'tablet-ipad',
      use: {
        // iPad Pro 11 landscape — close enough for a general tablet
        // viewport check. Uses a custom viewport since Playwright's
        // built-in iPad descriptors are portrait-only.
        viewport: { width: 1194, height: 834 },
        deviceScaleFactor: 2,
        isMobile: false,
        hasTouch: true,
      },
    },
  ],
  // Gate 3 & Gate 5: When PLAYWRIGHT_BASE_URL is provided (e.g. a
  // Vercel preview URL), do NOT launch a local web server — run
  // tests against the external URL. When testing locally, CI uses
  // `bun run start` (production build) and dev uses `bun run dev`.
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: process.env.CI ? 'bun run start' : 'bun run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
