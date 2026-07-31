# PricePilot Stability Worklog — 8/10 Release

This worklog tracks every commit and verification step on the `stabilize/pricepilot-8` branch.

## Starting State

- **Starting commit SHA**: `a53cc234ed47227546215875adebff91e61455f0`
- **Starting commit subject**: `fix: add calculatedHealthScore to ENGINE_DEFAULTS in sample-data.ts`
- **Production deployment**: https://pricepilot-self.vercel.app/
- **Backup tag**: `backup/pre-stability-8`
- **Stability branch**: `stabilize/pricepilot-8`
- **Storage version**: 1 (localStorage with `pricepilot_v1_` prefix; no IndexedDB)
- **Package manager**: bun 1.3.14
- **Test availability**:
  - `bun run typecheck` — PASS (tsc --noEmit)
  - `bun run lint` — PASS (eslint .)
  - `bun run build` — PASS (Next.js 16 Turbopack, 3 static routes)
  - `bun run test` — **FAIL** (vitest is referenced in scripts but NOT installed)
  - `bun run test:e2e` — **FAIL** (@playwright/test is referenced but NOT installed)

## Known Failures at Baseline

1. **Test scripts are stubs.** `package.json` declares `vitest run` and `playwright test`, but neither package is installed. CI/verification commands will fail.
2. **No error boundaries.** A single malformed product or a thrown calculation can blank the entire app.
3. **Direct `products.map(p => recalcProduct(...))`** in `initialize()`, `updateBusinessSettings`, `recalculateProducts`, `importProducts`, `addPricingRule`, etc. One throwing product kills the entire batch.
4. **`formatCurrency` / `formatPercentage` silently substitute `0`** for NaN/Infinity, so the user sees `₹0` instead of a real "needs review" signal.
5. **`calculateMinimumSafePrice` has a 10,000-iteration fallback loop** and is invoked multiple times per product inside `calculateCompetitivePrice`, `calculateBalancedPrice`, `calculatePremiumPrice`.
6. **localStorage-only storage** with `JSON.stringify` of the entire products array — quota risk for large catalogues, and no transactional safety on import.
7. **Import flow runs `newProducts.map(p => recalcProduct(...))`** as a single batch — any malformed row aborts the whole import.
8. **No duplicate SKU handling.** Imports always push new products.
9. **No app initialization state.** `page.tsx` calls `initialize()` and synchronously reads `onboardingCompleted` from the store; on slow storage or recalculation the onboarding screen can flicker before the workspace appears.
10. **Auto-backups stored as a single JSON string in localStorage** (`pricepilot_auto_backups`) — large backups will exceed quota and the catch block silently trims to `MAX_AUTO_BACKUPS - 2`, losing data without warning.

## Verification Protocol

After every commit we run:

```bash
bun run typecheck
bun run lint
bun run build
```

Once test infrastructure exists (Phase 13 onwards) we also run:

```bash
bun run test
```

Each phase records the actual command output below.

---

## Phase 0 — chore: capture stability baseline

- Created branch `stabilize/pricepilot-8` from `a53cc23`.
- Created tag `backup/pre-stability-8` pointing at the starting commit.
- Ran baseline verification: typecheck ✓, lint ✓, build ✓, test ✗ (vitest missing), test:e2e ✗ (playwright missing).
- Recorded baseline state in this worklog.

**Commit**: `chore: capture stability baseline`

---

## Phase 1 — fix: add safe finite-number formatting

- Added `isFiniteNumber(value): value is number` — strict type guard rejecting undefined, null, NaN, Infinity, -Infinity, strings, objects.
- Added `safeNumberValue(value, fallback = 0): number` — never throws; central coercion entry point.
- Added `UNAVAILABLE_PLACEHOLDER = '—'` and three `formatCurrencyOrDash` / `formatPercentageOrDash` / `formatNumberOrDash` variants so callers can render an em-dash instead of misleading `₹0` when the real value is genuinely unavailable.
- Widened `formatCurrency`, `formatPercentage`, `formatNumber`, `roundToDecimals`, `roundTo2Decimals`, `roundTo4Decimals` to accept `unknown` and route through `safeNumberValue`. NaN/Infinity/undefined/null now produce finite output (`0` by default, `—` via the *OrDash variants) — never the strings `"NaN"`, `"Infinity"`, `"undefined"`.
- Replaced unsafe manual formatting in `calculations.ts` (`formatCostValue`), `pricing-engine.ts` (loss-making warning), `store/pricepilot-store.ts` (undo descriptions), `app-shell.tsx` (avg margin), `product-detail-drawer.tsx` (diff display), and `dashboard-page.tsx` (insight cards) with the canonical safe formatters.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS (Next.js 16.1.3, 3 static routes)

**Commit**: `fix: add safe finite-number formatting`

---

## Phase 2 — fix: normalize legacy and malformed product records

- Created `src/lib/pricepilot/product-normalizer.ts`.
- Exports:
  - `ProductNormalizationIssue` — `{ field?, code, message, severity: 'warning' | 'error' }`
  - `ProductNormalizationResult` — discriminated union with `success: true/false`. **Always** carries a `product` that is safe to render.
  - `normalizeProduct(raw, context?)` — never throws. Accepts `unknown` and returns a complete `Product` with finite numbers on every field.
  - `normalizeProducts(rawList, context?)` — batch helper returning `{ successfulProducts, failedProducts, issues, rejectedCount, needsReviewCount }`.
- Numeric coercion handles: real numbers, numeric strings, Indian comma-formatted strings (`1,25,000`), currency strings (`₹1,250`), percentage strings (`18%`), empty strings, null, undefined. NaN / Infinity / -Infinity are rejected with a warning and reset to 0.
- Negative costs and prices are clamped to 0 with a warning.
- Fees below 0% or above 100% are reported as errors and reset to 0%.
- Nested objects guaranteed on every returned product: `competitorPrices: []`, `tags: []`, `notes: ''`, `recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' }`.
- Identity rule: a product is acceptable with EITHER a name OR a sku. When both are missing, the row is rejected (counted in `rejectedCount`) instead of being silently added to the catalogue.
- Missing purchase cost => recoverable: the product is kept, marked `lifecycleStatus: 'needs-review'`, `calculatedPricingStatus: 'missing-data'`, `recommendedPrices.confidence: 'low'`. No trusted recommendation is generated downstream.
- Hard rejections (no identity) return a placeholder product that is safe to render but kept out of the catalogue list.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS

**Commit**: `fix: normalize legacy and malformed product records`

---

## Phase 3 — fix: isolate individual product calculation failures

- Created `src/lib/pricepilot/safe-calculation.ts` with:
  - `ProductCalculationResult` discriminated union — `success: true/false`. The `product` field is ALWAYS present and safe to render.
  - `safelyRecalculateProduct(rawProduct, businessSettings, pricingRules)` — never throws. Pipeline:
    1. Normalizes input via `normalizeProduct`.
    2. Short-circuits with a structured "missing-data" result when purchase cost is missing.
    3. Validates business settings.
    4. Resolves effective pricing policy in try/catch.
    5. Runs `calculateAllRecommendations` in try/catch.
    6. Maps recommendations onto the product in try/catch.
    7. Validates every numeric output with `Number.isFinite`.
    8. On any failure: returns a fallback product with `lifecycleStatus: 'needs-review'`, `calculatedPricingStatus: 'needs-review'`, `recommendedPrices.confidence: 'low'`, plus a useful internal issue like "Price calculation could not be completed because the marketplace fee is invalid."
  - `safelyRecalculateProducts(rawProducts, businessSettings, pricingRules)` — batch helper. Each product processed in its own try/catch. One failure does NOT abort the batch. Returns `{ successfulProducts, failedProducts, issues }`.
- Replaced the unsafe direct `products.map(p => recalcProduct(...))` pattern in the Zustand store:
  - `initialize()` — now uses `safelyRecalculateProducts`.
  - `updateBusinessSettings()` — same.
  - `recalculateProducts()` — same.
  - `importProducts()` — same.
  - `loadSampleData()` and `loadDemoSampleData()` — same.
- The `recalcProduct` helper now delegates to `safelyRecalculateProduct` so all single-product paths (add, update, duplicate, approve, apply, undo) inherit the same isolation guarantees.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS

**Commit**: `fix: isolate individual product calculation failures`

---

## Phase 4 — fix: make application startup recoverable

- Created `src/lib/pricepilot/initialization.ts` with:
  - `AppInitializationStatus = 'idle' | 'loading' | 'ready' | 'ready-with-warnings' | 'failed'`
  - `AppInitializationSummary` carrying counts (`successfulCount`, `needsReviewCount`, `failedCount`) and a human-readable message.
  - Factory helpers `makeIdleSummary`, `makeLoadingSummary`, `makeReadySummary`, `makeFailedSummary`.
- Added `initialization`, `retryInitialize`, `startEmptyWorkspace`, `downloadExistingData` to the Zustand store.
- Rewrote `initialize()`:
  1. Sets `initialization: loading` BEFORE doing any work, so the UI shows "Opening your PricePilot workspace…" instead of briefly flashing onboarding.
  2. Wraps `initializeStorage()` and the recalculation in a single try/catch.
  3. On success: counts needs-review products and produces a `ready` or `ready-with-warnings` summary.
  4. On failure: sets `initialization: failed` with the error message — **does NOT delete old localStorage data**.
  5. Persisting recalculated products is best-effort (wrapped in its own try/catch) — a save failure does not blank the in-memory state.
- `startEmptyWorkspace()` DOES NOT delete old data — it bypasses storage for this session so the owner can keep working while the old data remains recoverable.
- `downloadExistingData()` exports whatever is in localStorage as a JSON recovery file. Never throws.
- Created `src/components/pricepilot/initialization-screen.tsx`:
  - Loading state: emerald spinner, "Opening your PricePilot workspace…"
  - Failure state: red AlertTriangle, "PricePilot could not open your saved workspace. Your browser data has not been deleted." with three buttons: Try Again, Download Existing Data, Start Empty Workspace.
- Updated `src/app/page.tsx`:
  - Renders `<InitializationScreen />` while status is `idle` / `loading` / `failed`.
  - On `ready-with-warnings`, fires a `toast.warning` telling the owner how many products need review.
  - On `ready`, fires a `toast.success`.
  - Hooks are called in stable order (no conditional hooks).

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS (after fixing a rules-of-hooks violation)
- `bun run build` — PASS

**Commit**: `fix: make application startup recoverable`

---

## Phase 5 — fix: add client error recovery boundaries

- Created `src/components/pricepilot/error-boundary.tsx`:
  - `PricePilotErrorBoundary` class component.
  - Props: `children`, `boundaryName`, `contextProductId`, `contextImportRow`, `onReturnHome`.
  - On caught error: logs full details (error message, component stack, boundary name, active product ID, import row when relevant) to the console for development debugging.
  - Renders a friendly recovery UI: "PricePilot could not complete this action. Your existing catalogue has not been deleted." with three buttons: Return Home, Try Again, Download Backup.
  - NEVER exposes raw stack traces to the business user — developer details only appear in a `<details>` element when `NODE_ENV === 'development'`.
- Created `src/app/error.tsx` — Next.js route-level error boundary. Same recovery UI; logs message/stack/digest to console.
- Created `src/app/global-error.tsx` — Next.js global error boundary. Self-contained (renders its own `<html>` and `<body>`) because the regular layout may be what failed. Backup download reads `pricepilot_v1_products` directly from localStorage to avoid depending on the store.
- Wrapped the Import Flow in `app-shell.tsx` with `<PricePilotErrorBoundary boundaryName="Import Flow">`.
- Wrapped the Product Detail Drawer in `products-page.tsx` with `<PricePilotErrorBoundary boundaryName="Product Detail Drawer" contextProductId={selectedProduct}>`.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS

**Commit**: `fix: add client error recovery boundaries`

---

## Phase 6 — perf: remove repeated recommendation recalculation

- Replaced the 10,000-step linear search in `calculateMinimumSafePrice` with a bounded adaptive search:
  1. Algebraic estimate (unchanged — already in place).
  2. Validate the estimate (single `calculateOutcomeAtPrice` call).
  3. If invalid: geometrically expand an upper bound (1, 2, 4, 8, …) until a valid price is found, capped at `MAX_VALIDATION_STEPS = 50` evaluations.
  4. Binary-search between `lowerBound` and `upperBound` to find the smallest currency-unit-aligned price that satisfies all constraints, also capped at `MAX_VALIDATION_STEPS`.
  5. Impossible state (no valid upper bound within budget) returns 0 — structured result captures this.
- Worst case is now O(log n) engine evaluations per product instead of 10,000.
- Added `RecommendationCalculationContext` interface so shared values (effective rule, break-even, minimum-safe, current outcome) are computed once per product.
- Added an optional `precomputedMinimumSafe` parameter to `calculateCompetitivePrice`, `calculateBalancedPrice`, `calculatePremiumPrice`. When provided, the expensive search is skipped.
- Rewrote `calculateAllRecommendations` so it computes `breakEvenPrice`, `minimumSafePrice`, and `currentOutcome` once and passes the precomputed minimum-safe to all three downstream recommendations. Previously each of those functions called `calculateMinimumSafePrice` internally, so the search ran 4× per product.
- Added `safelyRecalculateProductsBatched` to `safe-calculation.ts` — processes large imports in controlled batches (default 50), yielding to the browser between batches via `setTimeout(0)`. Progress callback receives messages like "Processing products 1-50 of 500". Web Worker is intentionally NOT added — the spec requires measuring first.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS

**Commit**: `perf: remove repeated recommendation recalculation`

---

## Phase 7 — fix: make imports row-safe

- Created `src/lib/pricepilot/import-service.ts` with:
  - `ImportRowResult` — `{ rowNumber, status: 'valid' | 'needs-review' | 'duplicate' | 'rejected', product?, issues[], originalRow }`.
  - `ImportBatchResult` — `{ results, validProducts, needsReviewProducts, duplicateProducts, rejectedCount, totalCount, summary }`.
  - `processImportRows(rows, businessSettings, pricingRules, options?)` — NEVER throws.
    - Each row is processed independently in its own try/catch via `normalizeProduct` + `safelyRecalculateProduct`.
    - Empty rows are skipped silently (not counted as rejected).
    - Non-object rows are rejected with a clear issue.
    - Missing purchase cost → row is kept as `needs-review` (recoverable, not rejected).
    - Currency-formatted costs ("₹1,250") and percentage values ("18%") are parsed by the normalizer.
    - Invalid fees and tax settings are reported per row.
    - Original row number is preserved on every result.
    - Duplicate SKUs (matched against `options.existingSkus`) are flagged as `duplicate` — the product is still produced so the caller can offer reconciliation in Phase 8.
  - `buildIssueReportCsv(results)` — produces a CSV with columns: Row, Product Name, SKU, Field, Problem, Original Value, Suggested Action. Only includes rows that are not `valid`.
  - `downloadIssueReport(results)` — triggers a browser download of the CSV. Never throws.
  - `summary.message` example:
    ```
    97 products are ready to import.
    2 products need review.
    1 duplicate SKU requires reconciliation.
    1 row could not be imported.
    ```
  - Each issue carries a `suggestedAction` so the owner knows what to do.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS

**Commit**: `fix: make imports row-safe`

---

## Phase 8 — fix: reconcile duplicate SKUs during import

- Created `src/lib/pricepilot/duplicate-reconciliation.ts`.
- Five resolution strategies:
  - `update-existing`: Replace financial inputs on the existing product with the uploaded values.
  - `fill-missing`: Only fill fields that are currently empty/zero on the existing product.
  - `keep-existing`: Skip this row entirely (no change).
  - `create-copy`: Create a new product with a new SKU suffix (`-COPY`).
  - `skip`: Same as keep-existing but tracked separately.
- `computeDuplicateDiff(existing, uploaded)` — produces a per-field diff list with labels like "Purchase Cost", "Current Selling Price", etc., flagged with `affectsCalculation: boolean` so the UI can show only financial changes prominently.
- `reconcileDuplicate(input, businessSettings, pricingRules)`:
  - **update-existing** preserves: internal product ID, notes (only if non-empty on existing), tags (only if non-empty on existing), `createdAt`.
  - When any financial input changes: invalidates the previous approval (`priceApprovalStatus: 'none'`, `finalApprovedPrice: 0`, `approvedAt: ''`, `isApproved: false`) and returns the message "Updated the existing product. The previous approval was removed because the product cost changed."
  - When no financial inputs changed: preserves the existing approval and returns "Updated the existing product. No financial inputs changed, so the existing approval was preserved."
  - **fill-missing** only copies uploaded values for fields that are empty/zero on the existing product. Invalidates approval only if any financial field was newly filled.
  - **create-copy** always creates a new product with `id: prod-<timestamp>-<random>`, `sku: <uploaded-sku>-COPY`, `priceApprovalStatus: 'none'`, `finalApprovedPrice: 0`, `approvedAt: ''`.
- `reconcileDuplicates(inputs, businessSettings, pricingRules)` — batch helper returning `{ updatedProducts, newProducts, skippedSkus, messages, anyApprovalInvalidated }`.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS

**Commit**: `fix: reconcile duplicate SKUs during import`

---

## Phase 9 — feat: migrate catalogue storage to indexeddb

- Installed `dexie@4.4.4`.
- Created `src/lib/pricepilot/database.ts` with `PricePilotDatabase` class extending Dexie.
- Database name: `pricepilot`. Database version: 1.
- Tables:
  - `products` (key: `id`; indexes: `sku`, `lifecycleStatus`, `calculatedPricingStatus`, `category`, `brand`, `salesChannel`)
  - `businessSettings` (key: `id`; singleton with id `current`)
  - `pricingRules` (key: `id`; indexes: `level`, `isActive`, `priority`, `targetCategory`, `targetBrand`, `targetChannel`)
  - `scenarios` (key: `id`; indexes: `scenarioType`, `createdAt`)
  - `importBatches` (key: `id`; indexes: `startedAt`, `fileName`)
  - `importIssues` (key: `id`; indexes: `batchId`, `rowNumber`, `status`)
  - `undoActions` (key: `id`; indexes: `timestamp`, `type`)
  - `backups` (key: `id`; indexes: `timestamp`, `trigger`)
  - `metadata` (key: `key` — generic key/value store)
- Singleton `getDb()` lazily constructs the database. Throws cleanly if IndexedDB is unavailable (SSR / tests without fake-indexeddb).
- `setDbForTesting(db)` and `resetDbForTesting()` for test injection.
- Atomic operations using Dexie transactions:
  - `atomicImportProducts(products, batchMetadata?)` — all-or-nothing import. Either every product is written or none are. Records the import batch metadata in the same transaction.
  - `atomicBulkUpdateProducts(products)` — atomic bulk update.
  - `atomicApplyApprovedPrices(products)` — atomic price application.
  - `atomicRestoreBackup(payload)` — atomic restore across products, businessSettings, pricingRules, scenarios.
  - `atomicResetAll()` — atomic reset of every table except `metadata` (which tracks migration state).
- CRUD wrappers: `loadAllProducts`, `saveProductsToDb`, `saveProductToDb`, `removeProductFromDb`, `loadBusinessSettingsFromDb`, `saveBusinessSettingsToDb`, `loadPricingRulesFromDb`, `savePricingRulesToDb`, `loadScenariosFromDb`, `saveScenariosToDb`, `loadUndoHistoryFromDb`, `saveUndoHistoryToDb`, `loadBackupsFromDb`, `saveBackupsToDb`, `addBackupToDb`, `getMetadata`, `setMetadata`.
- localStorage is now reserved for: theme, application mode, sidebar state, tour completion, last opened page.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS

**Commit**: `feat: migrate catalogue storage to indexeddb`

---

## Phase 10 — feat: add safe localstorage migration

- Created `src/lib/pricepilot/migration.ts`:
  - `MigrationStatus = 'not-started' | 'in-progress' | 'complete' | 'failed' | 'skipped'`
  - `MigrationResult` interface with counts and a human-readable message.
  - `hasLegacyLocalStorageData()` — detects any of the legacy `pricepilot_v1_*` keys or the legacy auto-backup key.
  - `migrateLegacyDataIfNeeded()` — IDEMPOTENT. Checks metadata first; if migration already completed, returns immediately.
    1. Marks migration as `in-progress` in the metadata table.
    2. Reads legacy localStorage data.
    3. Normalizes every product via `normalizeProducts` so malformed legacy data is repaired before being written.
    4. Saves business settings, pricing rules, scenarios, and atomically imports products into IndexedDB.
    5. Verifies the written count matches the attempted count.
    6. Marks migration as `complete` and sets storage version to 2.
    7. On failure: rolls back the IndexedDB transaction; localStorage data is **never** deleted.
    8. Success message: `"Your PricePilot data was upgraded safely. 104 products were moved. 3 products need review."`
    9. Failure message: `"Your existing data was not changed. PricePilot could not finish the storage upgrade."`
  - `removeLegacyLocalStorageCopy()` — manually removes the legacy keys. To be wired into a Settings button (only enabled after migration is verified complete).
  - `isLegacyDataStillPresent()` — for showing/hiding the manual cleanup button.
- Updated `store/pricepilot-store.ts`:
  - Imported all IndexedDB CRUD helpers and migration functions.
  - Converted `initialize()` to `async`. New startup sequence:
    1. Set `initialization: loading`.
    2. Run `migrateLegacyDataIfNeeded()` (idempotent, atomic, never deletes localStorage).
    3. Load products, businessSettings, pricingRules, scenarios, undoHistory, backups from IndexedDB.
    4. Fall back to legacy `initializeStorage()` if IndexedDB is unavailable (e.g. private browsing).
    5. Use defaults if business settings were not found.
    6. Recalculate via `safelyRecalculateProducts` (one malformed product cannot abort the batch).
    7. Count needs-review products and produce a `ready` or `ready-with-warnings` summary.
    8. Persist recalculated products back to IndexedDB (best-effort).
    9. On any uncaught failure: set `initialization: failed` — **does NOT delete localStorage**.

**Verification**:
- `bun run typecheck` — PASS
- `bun run lint` — PASS
- `bun run build` — PASS

**Commit**: `feat: add safe localstorage migration`
