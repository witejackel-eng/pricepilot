# PricePilot — Final Release Baseline

## Checkout
- **Repository**: witejackel-eng/pricepilot
- **Branch**: release/pricepilot-v1
- **Remote SHA**: 2fc573e235d54082089c310f2d4435e0cf202d28
- **Date**: 2025-08-01

## Baseline Results
- **TypeCheck**: ✅ PASS
- **Lint**: ✅ PASS
- **Unit Tests**: 934 PASS
- **Build**: ✅ PASS

## Coverage
| Metric | Percentage |
|--------|-----------|
| Statements | 86.45% |
| Branches | 71.42% |
| Functions | 91.81% |
| Lines | 86.93% |

## CI Failure Evidence (Run #30655657487)
### Desktop E2E — FAILED
- **WebKit** (5 tests): All timeout at 30s. App stuck on "Opening your workspace…"
- **Firefox** (Father Workflow): CSP eval() violation from Next.js chunk `c685914988d8f287.js` line 9
- **Chromium**: PASS

### Mobile E2E — FAILED
- **iPhone 14** (all tests): Timeout at ~31s. Same initialization hang as WebKit
- **Pixel 7** (8 tests): Navigation buttons (nav-import, nav-products) not visible — mobile drawer not opened
- **iPad** (2 tests): Owner home visibility, clipped controls

## Root Causes Identified
1. **WebKit/iPhone initialization hang**: No singleton promise guard on `initialize()`. React Strict Mode calls useEffect twice, causing concurrent IndexedDB operations that deadlock on WebKit.
2. **Firefox CSP eval()**: Next.js production bundle contains eval() in runtime chunk. CSP `script-src 'self' 'unsafe-inline'` blocks it.
3. **Mobile navigation**: `navigateTo()` helper doesn't properly open mobile drawer before clicking nav items. Same test IDs used for desktop sidebar and mobile drawer.
4. **Clipped controls audit**: Doesn't exclude hidden/off-canvas elements (sidebar behind mobile drawer).
5. **Touch targets**: Some icon buttons smaller than 44×44px.

## Existing Test Architecture
- **Test Files**: 27
- **Test Count**: 934
- **E2E Tests**: father-workflow.spec.ts, hydration-startup.spec.ts, mobile-flow.spec.ts
- **E2E Projects**: chromium, firefox, webkit, mobile-pixel-7, mobile-iphone-14, tablet-ipad
- **CI Jobs**: Verification, Desktop E2E, Mobile E2E
- **Coverage Thresholds**: Statements 70%, Branches 65%, Functions 70%, Lines 70%
