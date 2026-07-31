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
