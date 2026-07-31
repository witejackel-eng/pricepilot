import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PricePilot.
 *
 * The Father Workflow E2E test (Phase 16) launches a Next.js dev
 * server, navigates through Quick Setup, imports a mixed spreadsheet,
 * resolves a duplicate, approves a price, applies it, undoes, re-applies,
 * downloads Excel, refreshes, and verifies products persist.
 *
 * Tests live in tests/e2e/.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
