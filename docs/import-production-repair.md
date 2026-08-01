# Import Production Repair — Regression Evidence

## Root Cause

When a supplier spreadsheet is imported, products with empty category or brand fields cause the Products page to crash during rendering.

### Exact Runtime Error

```
A <Select.Item /> must have a value prop that is not an empty string.
```

### Component and Line

- **Component**: `src/components/pricepilot/products-page.tsx`
- **Line 132** (original): `const categories = [...new Set(products.map(p => p.category))];`
- **Line 488** (original): `{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}`

### Why Blank Imported Fields Caused It

The Radix UI `<SelectItem>` component does not accept an empty string as a `value` prop. When imported products have `category: ""`, the `new Set()` includes `""` as a unique value, which is then rendered as:

```tsx
<SelectItem value="">  // Radix throws here
```

### Why the Import Appeared Successful Before the Crash

The `importProductsWithBatch` store function commits the data and changes `currentView` to `'products'` in the same `set()` call:

```typescript
set({ products: allProducts, currentView: 'products' });
```

This means:
1. The import transaction succeeds (products are saved to IndexedDB)
2. The undo record is pushed
3. The view switches to Products
4. The Products page renders with the imported products
5. The Radix Select crash occurs because of empty category values

The user sees both a successful import and the error page simultaneously.

### Affected Components

- `src/components/pricepilot/products-page.tsx` — Category filter
- `src/components/pricepilot/dashboard-page.tsx` — Category and brand filters
- `src/components/pricepilot/pricing-rules-page.tsx` — Category, brand, and channel selectors

### Data Characteristics (from real backup)

The attached backup contains 48 products:
- 12 demo products (with categories and brands)
- 21 imported from "Price List - Regular Item..xlsx" (empty categories, zero costs)
- 15 imported from "Tech Pro data quote.xlsx" (empty categories AND brands, zero costs)

All 36 imported products have:
- `category: ""`
- `purchaseCost: 0`
- 21 products also have `currentSellingPrice: 0`
- 15 products also have `brand: ""`
- Missing `calculatedPriceOutcome` and `recommendedOutcomes`
- Fallback `recommendedPrices` object with all zeros

### Fix Applied

1. **`buildNonEmptyOptions()`** — New helper that filters out empty/whitespace-only/null/undefined values and optionally includes a sentinel value for blank-field filtering
2. **Sentinel values** — `__uncategorised__` and `__unknown_brand__` allow users to filter for products with blank fields without using empty strings as SelectItem values
3. **`categoryMatchesFilter()` / `brandMatchesFilter()`** — Filter predicates that handle sentinel values correctly
4. **Separate import navigation** — The store no longer sets `currentView: 'products'` during import; the ImportFlow component handles navigation after showing the completion summary
5. **Safe product access helpers** — `safeLowerCase()`, `getSafeRecommendedPrices()`, etc. prevent crashes from missing/null/undefined fields
6. **Missing-value detection** — `parseNumericInput()` now returns NaN for indicators like "N/A", "Call", "POA", "nil", etc.
7. **Indian number format parsing** — Support for ₹1,25,000/-, Rs. 5,000, INR 12,500, etc.
8. **Purchase-cost column mapping** — Added dealer price, dealer rate, distributor price, DP, unit rate, base rate, net rate, etc.
9. **Cost-coverage warning** — When most imported products have zero purchase cost, a prominent warning is shown
