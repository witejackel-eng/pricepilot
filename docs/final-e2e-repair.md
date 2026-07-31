# Final E2E Repair — Baseline Documentation

## Starting SHA
`194caed3187d1c7b5cef8ba9d476fb1d831d7f45`

## Exact Failed Tests

### Desktop E2E — Father Workflow
1. **Chromium**: `Strict Father Workflow E2E > complete owner workflow` — TIMEOUT
   - Root cause: Full-screen Guided Tour backdrop (`fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm`) intercepts all pointer events after onboarding completes
   - The tour auto-opens after 800ms when `!appSettings.tourCompleted`
   - Every click on Import, Products, etc. is intercepted by the backdrop overlay

2. **Firefox**: Same as Chromium — tour backdrop blocks all interactions

3. **WebKit**: Sometimes does not reach the fresh onboarding screen
   - Possible IndexedDB initialization race
   - `indexedDB.databases()` may not be available in WebKit
   - Tour backdrop also blocks interactions when it does reach owner home

### Hydration/Startup
- Passes on Chromium and Firefox
- WebKit sometimes has initialization timing issues

### Mobile E2E
- **CANCELLED** — not executed because Desktop E2E failed
- CI workflow uses `concurrency` with `cancel-in-progress: true` which may cancel the mobile job
- The `fail-fast` strategy is not explicitly set in the mobile job

## Exact Blocking DOM Element

```html
<div class="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm animate-fade-in" />
```

Located in `src/components/pricepilot/guided-tour.tsx` line 114.
This backdrop covers the entire viewport and intercepts all click events.

## Browser Differences

| Browser | Tour Blocks | Onboarding Persistence | IndexedDB Reset |
|---------|------------|----------------------|-----------------|
| Chromium | YES | OK | OK |
| Firefox | YES | OK | OK |
| WebKit | YES | Sometimes flaky | `indexedDB.databases()` unsupported |

## Current Mobile Job Status
- **CANCELLED** — Desktop E2E failure triggers CI concurrency cancellation
- The `concurrency` group uses `github.workflow` + `github.ref`
- Both desktop and mobile jobs share the same workflow → one cancels the other

## Failure Classification

| Failure | Type | Notes |
|---------|------|-------|
| Tour backdrop blocks all clicks | **Product defect** | Real usability issue, not just test |
| Onboarding retry logic in test | **Test defect** | Conceals real persistence failures |
| CSS selector from RegExp | **Test defect** | `String(viewLabel)` is unreliable |
| No deterministic state reset | **Test defect** | IndexedDB may survive context reset |
| WebKit onboarding flakiness | **Both** | May be initialization race + test timing |
| Mobile E2E cancelled | **CI defect** | Concurrency group cancels jobs |
| Arbitrary sleeps | **Test defect** | Should use state-based assertions |

## Key Files to Modify

1. `src/components/pricepilot/guided-tour.tsx` — Make tour opt-in, non-blocking
2. `src/lib/pricepilot/types.ts` — Add `tourDismissed` to AppSettings
3. `src/components/pricepilot/app-shell.tsx` — Add data-testid to nav elements, add tour invitation
4. `tests/e2e/father-workflow.spec.ts` — Remove retry logic, use stable IDs, remove sleeps
5. `tests/e2e/mobile-flow.spec.ts` — Use stable IDs, add state reset
6. `tests/e2e/hydration-startup.spec.ts` — Add state reset
7. `tests/e2e/helpers/reset-app-state.ts` — New shared state reset helper
8. `.github/workflows/ci.yml` — Fix concurrency, add `fail-fast: false`
9. `playwright.config.ts` — Reduce retries for strictness
