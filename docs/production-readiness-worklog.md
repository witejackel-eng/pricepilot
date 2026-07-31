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

## Phase 3 — fix: persist settings rules and scenarios atomically

- Added three new atomic helpers in `database.ts`:
  - `atomicUpdateSettingsAndProducts(settings, products)` — settings + recalculated products in one Dexie transaction. Prevents the catalogue from ending up with new settings but stale calculations (or vice versa).
  - `atomicUpdateRulesAndProducts(rules, products)` — pricing rules + recalculated products in one transaction. Used by add/update/delete pricing rule.
  - `atomicRestoreScenario(products, rules, settings)` — replaces all three tables in one transaction. Used by restoreScenario.
- Updated store type signatures to return `Promise<OperationResult>` for:
  - `updateBusinessSettings`, `completeOnboarding`
  - `addPricingRule`, `updatePricingRule`, `deletePricingRule`, `duplicatePricingRule`
  - `addScenario`, `updateScenario`, `deleteScenario`, `restoreScenario`
- `updateBusinessSettings` now uses `atomicUpdateSettingsAndProducts` — settings + recalculated products commit or roll back together.
- `addPricingRule` / `updatePricingRule` / `deletePricingRule` now use `atomicUpdateRulesAndProducts` — rules + recalculated products commit together. Previously these actions called `recalculateProducts()` as a separate step AFTER saving the rule, which meant a crash between the two writes could leave the catalogue in an inconsistent state.
- `restoreScenario` now uses `atomicRestoreScenario` — all three datasets are replaced atomically. Snapshot products are recalculated under the snapshot's own settings/rules before the write so the restored state is internally consistent.
- `completeOnboarding` now awaits `persistBusinessSettings` and returns `OperationResult` — onboarding is only marked complete if the IndexedDB write succeeds.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors, 0 warnings)
- `bun run test` — PASS (115 tests, ~6.4s)
- `bun run build` — PASS

**Commit**: `fix: persist settings rules and scenarios atomically`

---

## Phase 4 — feat: complete legacy storage migration cleanup

- Added `verifyMigration()` and `MigrationVerificationReport` to `src/lib/pricepilot/migration.ts`:
  - Reads migration status metadata from IndexedDB (must be `'complete'`).
  - Counts products, pricing rules, scenarios in BOTH IndexedDB and legacy localStorage.
  - Checks that business settings exist in IndexedDB.
  - Compares counts and produces a list of human-readable issue strings.
  - Returns `canRemoveLegacy: true` only when every check passed.
  - Persists the report to the metadata table under key `migrationVerificationReport` so it can be inspected later.
- Created `src/components/pricepilot/legacy-data-cleanup-card.tsx`:
  - Renders ONLY when `isLegacyDataStillPresent()` is true — hidden otherwise.
  - Emerald/amber visual identity preserved.
  - Three actions:
    1. **Download Old Data** — triggers `downloadExistingData()` (canonical IndexedDB export) and instructs the user that the legacy localStorage copy is also accessible via DevTools.
    2. **Verify Migration** — runs `verifyMigration()` and displays the structured report inline (counts, status, issues list).
    3. **Remove Old Storage Copy** — disabled until verification passes. Clicking opens an AlertDialog confirmation. On confirm, calls `removeLegacyLocalStorageCopy()` and refreshes.
- Wired `<LegacyDataCleanupCard />` into `settings-page.tsx` between the Backup section and the Danger Zone.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors, 0 warnings)
- `bun run test` — PASS (115 tests, ~6.1s)
- `bun run build` — PASS

**Commit**: `feat: complete legacy storage migration cleanup`

---

## Phase 5 — fix: build backups from canonical application state

- Created `src/lib/pricepilot/backup-service.ts`:
  - `PricePilotBackup` interface: `format: 'pricepilot-backup'`, `backupVersion: 1`, `schemaVersion: 1`, `appVersion`, `createdAt`, `businessSettings`, `products`, `pricingRules`, `scenarios`, optional `contentHash`.
  - `buildBackup()` — reads canonical state from IndexedDB inside a single read transaction via `exportAllDataFromDb()`. Normalizes every product (rejects those with no name AND no sku). Validates finite numbers on every numeric field (`purchaseCost`, `shippingCost`, `packagingCost`, `handlingCost`, `otherCosts`, `currentSellingPrice`, `finalApprovedPrice`, `taxRatePercent`, fees, rates, nested `recommendedPrices`). Computes a deterministic SHA-256 content hash (with FNV-1a fallback for non-secure contexts). Returns a `BackupBuildResult` with `normalizedCount`, `needsReviewCount`, `rejectedCount`, and `issues` array.
  - `serializeBackup()` — pretty-printed JSON.
  - `computeBackupContentHash()` — deterministic SHA-256 over canonical JSON (sorted keys, no whitespace); excludes `contentHash`, `createdAt`, `appVersion` so two backups of the same state produce the same hash.
  - `downloadBackupFile()` — triggers browser download of the canonical backup.
  - `buildRecoveryDownload()` — builds the "Download Existing Data" payload: canonical IndexedDB state + migration metadata + raw legacy localStorage entries (when still present) + app version + timestamp. Both sources are clearly labelled.
  - `downloadRecoveryPayload()` — triggers browser download of the recovery payload.
- Updated the store:
  - `createAutoBackup` now calls `buildBackup()` instead of the sync `exportData()`. The backup `dataString` is the canonical serialized `PricePilotBackup`.
  - `downloadBackup` now calls `downloadBackupFile()` (canonical backup-service path).
  - `downloadExistingData` now calls `downloadRecoveryPayload()` (includes IndexedDB + migration state + legacy localStorage).
  - `exportData` (sync) still exists for callers that need an immediate in-memory snapshot, but its output is now typed as `PricePilotBackup` so the shape is enforced.
- The legacy `exportAllData()` from `legacy-storage.ts` is no longer called by any production code path.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors, 0 warnings)
- `bun run test` — PASS (115 tests, ~6.4s)
- `bun run build` — PASS

**Commit**: `fix: build backups from canonical application state`

---

## Phase 6 — fix: validate and normalize backup restoration

- Added to `src/lib/pricepilot/backup-service.ts`:
  - Zod schema for the `PricePilotBackup` format — `format` literal, version bounds, required top-level fields, permissive nested records (the normalizer does the rigorous product validation).
  - `BackupValidationResult` discriminated union: success with validated `backup` + `needsReviewCount` + `rejectedCount` + `issues`, OR failure with `code` (`invalid-json` | `unknown-format` | `missing-identity` | `invalid-products` | `invalid-settings` | `unsupported-version`).
  - `validateBackup(raw)` — runs the Zod schema, rejects unsupported future backup versions, normalizes every product, validates settings, returns the result.
  - `parseAndValidateBackup(jsonString)` — JSON.parse + validateBackup, with a structured `invalid-json` failure path.
  - `RestorePreview` interface — the structured preview shown to the user before they confirm a restore.
  - `buildRestorePreview(jsonString)` — returns counts (products, rules, scenarios), needs-review count, rejected count, and issue list.
- Updated the store:
  - `restoreBackup` now returns `Promise<OperationResult>` instead of `Promise<boolean>`. Pipeline:
    1. `parseAndValidateBackup` — invalid backups never reach IndexedDB.
    2. `createAutoBackup('manual', ...)` — safety backup first; abort if it fails.
    3. `atomicRestoreBackup` — atomic IndexedDB transaction.
    4. `saveLastSavedTimestampToDb`.
    5. `get().initialize()` — reload state from IndexedDB so the UI matches the committed transaction.
    6. Verify exact counts (`db.products.count()` etc.) against expected counts from the backup. If mismatch, return a retryable error.
  - New action `previewBackupRestore(dataString)` — synchronous, returns `RestorePreview` so the UI can show counts before the user commits.
- Updated `settings-page.tsx`:
  - `handleRestoreBackup` (auto-backup list) — awaits `restoreBackup`, shows success/error toast with the structured message.
  - File upload restore handler — now calls `previewBackupRestore` first to validate; if invalid, shows the first issue as the toast description and aborts. If valid, proceeds with restore and shows counts in the success toast.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors, 0 warnings)
- `bun run test` — PASS (115 tests, ~6.3s)
- `bun run build` — PASS

**Commit**: `fix: validate and normalize backup restoration`

---

## Phase 13 — security: replace vulnerable spreadsheet parser

- Removed `"xlsx": "^0.18.5"` from `package.json` — the package has known CVEs (CVE-2024-22363 ReDoS, prototype pollution, plus the upstream SheetJS distribution model is no longer trustworthy).
- Installed `exceljs@4.4.0` as the maintained replacement. ExcelJS is widely deployed, has an active maintainer, supports XLSX + CSV read/write, multi-sheet workbooks, browser operation, and a reasonable bundle size.
- Created `src/lib/pricepilot/spreadsheet-adapter.ts`:
  - `parseSpreadsheet(fileBuffer)` — wraps `ExcelJS.Workbook.xlsx.load()`, iterates sheets with `eachSheet` + `eachRow`, returns the same shape as the old `parseExcelFile` (`{ sheets: [{ name, headers, rows, rawRows }], errors }`).
  - `parseCsvFile(fileBuffer)` — simple CSV parser (no library needed).
  - `createSpreadsheet()` → `WorkbookBuilder` — builder pattern with `addSheet(name, rows)` and `writeBuffer()`.
  - `downloadSpreadsheet(buffer, filename)` — browser download trigger.
- Migrated `src/lib/pricepilot/excel.ts`:
  - `parseExcelFile` now delegates to `parseSpreadsheet` from the adapter. Same public API, same return shape — callers (import-flow.tsx) unchanged.
  - `exportToExcel` now uses `createSpreadsheet` from the adapter. Helper functions renamed `createCostAnalysisSheet` → `buildCostAnalysisRows`, `createCompetitorSheet` → `buildCompetitorRows`, `createSummarySheet` → `buildSummaryRows` — they now return plain `Record<string, string | number>[]` instead of XLSX WorkSheet objects.
  - All `await import('xlsx')` calls and all `XLSX.utils.*` / `XLSX.write` / `XLSX.read` references removed.
- Updated `src/components/pricepilot/export-page.tsx`:
  - `handleExport` and `handleOwnerExport` no longer dynamic-import xlsx.
  - Both now build workbooks via `createSpreadsheet` + `downloadSpreadsheet` from the adapter (or call `exportToExcel` from excel.ts which uses the adapter internally).
- Regenerated `bun.lock` (1 package removed, 0 added beyond what was already installed).
- Verified no remaining `from 'xlsx'` / `require('xlsx')` / `await import('xlsx')` / `XLSX.utils` references anywhere in `src/`. Only benign string-literal mentions of `.xlsx` as a file extension remain.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors, 0 warnings)
- `bun run test` — PASS (115 tests, ~6.2s)
- `bun run build` — PASS

**Commit**: `security: replace vulnerable spreadsheet parser`

---

## Phase 14 — security: prevent spreadsheet formula injection

- Added three exports to `src/lib/pricepilot/spreadsheet-adapter.ts`:
  - `sanitizeSpreadsheetCell(value: unknown): string | number` — prefixes any string beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` with a single apostrophe (`'`) so spreadsheet apps treat it as literal text. Passes finite numbers through unchanged. Converts booleans to `'TRUE'`/`'FALSE'`. Converts `null`/`undefined` to `''`. Handles ExcelJS cell objects (`{ text: string }`). Idempotent — strings already starting with `'` are left alone.
  - `sanitizeSpreadsheetRow(row)` — sanitizes every value in a row object, returns a new object.
  - `sanitizeSpreadsheetRows(rows)` — sanitizes every row in an array.
- Wired sanitization into every export path:
  - `excel.ts → exportToExcel` — main data sheet, cost analysis sheet, competitor analysis sheet, and summary sheet all run through `sanitizeSpreadsheetRows` before being added to the workbook.
  - `excel.ts → exportToCSV` — every cell value runs through `sanitizeSpreadsheetCell` before CSV escaping.
  - `export-page.tsx → handleExport` — Products, Summary, and Products Requiring Review sheets all sanitized.
  - `export-page.tsx → handleOwnerExport` — Updated Prices, Products Needing Attention, Summary, and Export Information sheets all sanitized.
- Created `src/lib/pricepilot/__tests__/spreadsheet-sanitization.test.ts` (26 tests):
  - Coverage of every formula prefix (`=`, `+`, `-`, `@`, `\t`, `\r`).
  - Whitespace-before-prefix cases.
  - Idempotency — strings already starting with `'` are not double-prefixed.
  - Number/boolean/null/undefined handling.
  - Object-with-text-property handling (ExcelJS cell shape).
  - Non-mutation of input.
  - Real-world attack payloads from the spec: `=HYPERLINK("malicious")`, `+SUM(1,1)`, `-10+20`, `@SUM(A1:A2)`.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (0 errors, 0 warnings)
- `bun run test` — PASS (141 tests, ~7.3s — 26 new tests added)
- `bun run build` — PASS

**Commit**: `security: prevent spreadsheet formula injection`

---
