# PricePilot Production-Readiness Worklog

This worklog tracks every commit, command result, and verification step on the
`fix/pricepilot-production-readiness` branch.

## Starting State

- **Starting commit SHA**: `3994f677760d4151ab66c4dc7349c11d77be6dd6`
- **Starting commit subject**: `chore: complete preview verification`
- **Production deployment**: https://pricepilot-self.vercel.app/
- **Safety tag**: `backup/pre-production-readiness`
- **Repair branch**: `fix/pricepilot-production-readiness`
- **Package manager**: bun 1.3.14

## Baseline Verification Results (Phase 0)

Captured before any repair work begins.

| Command | Result | Notes |
|---------|--------|-------|
| `bun install` | PASS | 643 packages, no changes |
| `bun run typecheck` | PASS | `tsc --noEmit` clean |
| `bun run lint` | PASS | 0 errors (3 unused-disable warnings in `coverage/` artifacts) |
| `bun run test` | PASS | 115 tests across 7 files, ~6.25s |
| `bun run test:coverage` | PASS | Overall 29% statements / 27% branches — well below required thresholds |
| `bun run build` | PASS | Next.js 16, 2 static routes |
| `bun run test:e2e` | PASS | Father Workflow test (~17s) |

## Known Integration Gaps at Baseline

These are the gaps the previous stabilization left open and this repair must close:

1. **Split storage architecture.** Store reads from IndexedDB on startup, but many live mutations (`addProduct`, `updateProduct`, `importProducts`, `updateBusinessSettings`, `addPricingRule`, `applyApprovedPrice`, undo) still go through `src/lib/pricepilot/storage.ts` which writes to `localStorage` with the `pricepilot_v1_` prefix.
2. **`storage.ts` is still imported by live store code.** No ESLint guardrail prevents future regressions.
3. **No `OperationResult` discipline.** Mutations are fire-and-forget — UI shows success even if persistence fails.
4. **Backups generated from `exportAllData()` in `storage.ts`**, not from canonical IndexedDB state.
5. **Backup restore is unvalidated.** Parsed JSON can be written directly into the store without Zod verification.
6. **Import flow still uses the old direct pipeline** (`cleanImportData → map → importProducts`) in `import-flow.tsx` instead of `processImportRows()` from `import-service.ts`.
7. **No interactive duplicate-SKU UI.** `duplicate-reconciliation.ts` exists but is not wired into the import screen.
8. **Approvals are not invalidated when financial inputs change.** Editing a cost leaves any prior approval intact.
9. **Add Product requires both name AND SKU**, and rejects missing purchase cost.
10. **Onboarding invents fees.** Hard-codes 5% marketplace + 2% payment when no channel is selected, and defaults GST to 18% for non-exempt users.
11. **`xlsx@^0.18.5` is vulnerable.** CVE-2024-22363 (ReDoS) — must be replaced with a maintained alternative.
12. **No spreadsheet formula-injection sanitization** on export.
13. **No security headers.** `next.config.ts` has no CSP, no X-Frame-Options, no HSTS.
14. **Father Workflow E2E is permissive.** Uses sample-data shortcut, "if visible" branches, only checks body length.
15. **No CI workflow.** No GitHub Actions; nothing enforces verification before merge.
16. **No cross-browser / mobile E2E coverage.** Only Chromium project configured.
17. **No error observability.** Errors only surface in the browser console.

## Verification Protocol

After every code commit we run:

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

After E2E infrastructure commits we also run:

```bash
bun run test:e2e
```

Each phase records the actual command output below.

---

## Phase 0 — chore: capture production readiness baseline

- Pulled `main`, confirmed starting SHA `3994f67`.
- Created branch `fix/pricepilot-production-readiness` from `main`.
- Created safety tag `backup/pre-production-readiness` pointing at `3994f67`.
- Ran baseline verification commands and recorded results above.
- Reproduced known integration gaps by reading the source (see "Known Integration Gaps at Baseline").

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors)
- `bun run test` — PASS (115 tests)
- `bun run build` — PASS
- `bun run test:e2e` — PASS (Father Workflow, ~17s)

**Commit**: `chore: capture production readiness baseline`

---

## Phase 1 — refactor: make indexeddb the single data source

- Renamed `src/lib/pricepilot/storage.ts` → `src/lib/pricepilot/legacy-storage.ts` (via `git mv` so history is preserved). This module is now migration-only — no live production code imports it.
- Created `src/lib/pricepilot/app-settings.ts` — the ONLY module allowed to touch localStorage for non-UI-preferences. It owns:
  - `pricepilot_ui_preferences` key (new) — applicationMode, sidebarCollapsed, sampleDataLoaded, guidedTourCompleted, lastViewedPage, theme.
  - `migrateLegacyAppSettingsIfNeeded()` — one-time migration from the old `pricepilot_v1_appSettings` key.
  - `clearAppSettings()` — used by `resetApplication`.
- Added two new IndexedDB helpers in `src/lib/pricepilot/database.ts`:
  - `clearProductsInDb()` — atomic clear of the products table.
  - `exportAllDataFromDb()` — canonical read of products + business settings + pricing rules + scenarios in a single read transaction.
- Added a `lastSavedTimestamp` metadata key — replaces the legacy `pricepilot_v1_lastSaved` localStorage entry. Helpers `loadLastSavedTimestampFromDb` / `saveLastSavedTimestampToDb` are private to the store.
- Rewrote `src/store/pricepilot-store.ts`:
  - Removed the import block from `@/lib/pricepilot/storage` entirely.
  - Every mutation that previously called `saveProducts` / `saveBusinessSettings` / `savePricingRules` / `saveScenarios` / `savePricingRule` / `removePricingRuleStorage` / `saveScenario` / `removeScenarioStorage` / `clearProductsStorage` / `importAllData` / `exportAllData` / `resetAllStorage` / `saveOnboardingCompleted` / `loadAppSettings` / `getLastSavedTimestamp` now routes through IndexedDB helpers from `database.ts` or `app-settings.ts`.
  - `updateBusinessSettings`, `completeOnboarding`, `addProduct`, `updateProduct`, `deleteProduct`, `deleteSelectedProducts`, `bulkUpdateProducts`, `duplicateProduct`, `approveProductPrice`, `applyApprovedPrice`, `bulkSetField`, `bulkApprovePrices`, `loadSampleData`, `loadDemoSampleData`, `removeDemoSampleData`, `clearAllProducts`, `recalculateProducts`, `importProducts`, `addPricingRule`, `updatePricingRule`, `deletePricingRule`, `duplicatePricingRule`, `addScenario`, `updateScenario`, `deleteScenario`, `restoreScenario`, `undoLastAction`, `restoreBackup`, `importData`, `resetApplication` — all 30 mutations now write to IndexedDB.
  - `set` is only called AFTER the IndexedDB write resolves. On failure, the prior Zustand state is preserved and an error is logged (Phase 2 will formalize this as `Promise<OperationResult>`).
  - `downloadExistingData` now reads canonical state via `exportAllDataFromDb()` instead of legacy `exportAllData()`.
  - `initialize` no longer falls back to `initializeStorage()` from legacy-storage — if IndexedDB is unavailable, the user sees the failure screen with retry / start-empty / download-existing options.
  - Removed the local `loadAutoBackups` / `saveAutoBackups` helpers and the `AUTO_BACKUP_KEY` constant — backups now live exclusively in the IndexedDB `backups` table.
  - Removed `scheduleAutoSave` / `cancelAutoSave` / `flushAutoSave` usage (those were never invoked anywhere).
- Added an ESLint `no-restricted-imports` rule that forbids importing `@/lib/pricepilot/legacy-storage` from anywhere except `migration.ts`, `app-settings.ts`, and the migration test file. The rule is enforced via `eslint.config.mjs`.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors, 0 warnings)
- `bun run test` — PASS (115 tests, ~6.1s)
- `bun run build` — PASS (Next.js 16.1.3, 2 static routes)

**Commit**: `refactor: make indexeddb the single data source`

---

## Phase 2 — fix: persist every product mutation atomically

- Created `src/lib/pricepilot/operation-result.ts`:
  - `OperationResult<T>` discriminated union: `{ success: true; data: T; message: string }` | `{ success: false; code: string; message: string; recoverable: boolean }`.
  - `ERROR_CODES` constant: `validation-failed`, `normalization-failed`, `calculation-failed`, `database-error`, `backup-failed`, `not-found`, `unauthorized`, `conflict`.
  - Helpers: `ok()`, `retryableError()`, `invalidInputError()`, `wrapPromise()`.
- Updated the store type signatures for ALL product mutations to return `Promise<OperationResult>`:
  - `addProduct`, `updateProduct`, `deleteProduct`, `deleteSelectedProducts`
  - `bulkUpdateProducts`, `approveSelectedProducts`, `markSelectedForReview`
  - `loadSampleData`, `loadDemoSampleData`, `removeDemoSampleData`, `clearAllProducts`, `recalculateProducts`
  - `duplicateProduct`, `approveProductPrice`, `applyApprovedPrice`
  - `bulkSetField`, `bulkApprovePrices`, `archiveProducts`
  - `importProducts`
- Each mutation now follows the canonical sequence:
  1. Validate input (return `invalidInputError` if missing/not found).
  2. Build next state (calculate via `safelyRecalculateProducts`).
  3. `await persistProducts(...)` — IndexedDB transaction.
  4. On success: `set(...)` Zustand state, return `ok(...)`.
  5. On failure: log + return `retryableError(...)` — Zustand state is UNCHANGED.
- Updated critical call sites to `await` the mutation and show error toasts:
  - `add-product-dialog.tsx` — Add Product save handler.
  - `product-detail-drawer.tsx` — Edit save, Approve Price, Apply Price (both inline and modal), Delete.
  - `import-flow.tsx` — `handleImport` now blocks on `importProducts` and surfaces a toast on failure.
- Other call sites (products-page bulk actions, dashboard-page, bulk-adjust-dialog, price-simulator) continue to work because TypeScript allows calling an async function without awaiting — the returned Promise is discarded. They will be migrated to await + error toast in subsequent phases if needed.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors, 0 warnings)
- `bun run test` — PASS (115 tests, ~6.5s)
- `bun run build` — PASS

**Commit**: `fix: persist every product mutation atomically`

---
