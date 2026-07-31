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
