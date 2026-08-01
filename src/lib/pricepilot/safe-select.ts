/**
 * PricePilot - Safe Select Options
 *
 * Prevents Radix Select from crashing when dynamic data contains
 * empty, whitespace-only, null, or undefined values.
 *
 * Radix Select does not allow an empty-string value on <SelectItem>.
 * When imported products have empty category/brand, the raw
 *   [...new Set(products.map(p => p.category))]
 * pattern would include "" as a SelectItem value, causing:
 *   "A <Select.Item /> must have a value prop that is not an empty string."
 *
 * This module provides:
 *   - `buildNonEmptyOptions()` — safe dedup + sort + filter
 *   - Sentinel values for "Uncategorised" / "Unknown brand" filters
 *   - Filter predicates for blank fields
 */

// ============================================================
// Sentinel values
// ============================================================

/**
 * Sentinel value used in Radix Select to represent products
 * that have no category (empty, whitespace-only, or missing).
 *
 * MUST NOT be stored as a product's actual category — it is
 * only a UI filter value.
 */
export const UNCATEGORISED_FILTER = '__uncategorised__';

/**
 * Sentinel value used in Radix Select to represent products
 * that have no brand (empty, whitespace-only, or missing).
 */
export const UNKNOWN_BRAND_FILTER = '__unknown_brand__';

/**
 * Sentinel value used in Radix Select to represent products
 * that have no supplier (empty, whitespace-only, or missing).
 */
export const UNKNOWN_SUPPLIER_FILTER = '__unknown_supplier__';

// ============================================================
// Option builder
// ============================================================

/**
 * Build a sorted, deduplicated array of non-empty string options
 * from raw product field values.
 *
 * - Empty strings, whitespace-only strings, null, and undefined
 *   are excluded from the returned array.
 * - Values are trimmed before deduplication.
 * - The result is sorted alphabetically.
 *
 * If `includeSentinel` is provided and any values were blank,
 * the sentinel value is appended to the array so the user can
 * filter for blank-field products.
 *
 * @param values   Raw field values from products (e.g. products.map(p => p.category))
 * @param includeSentinel  Optional sentinel to include when blanks are found
 * @returns Sorted, deduplicated non-empty options
 */
export function buildNonEmptyOptions(
  values: Array<string | null | undefined>,
  includeSentinel?: string,
): string[] {
  const seen = new Set<string>();
  let hasBlanks = false;

  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        seen.add(trimmed);
      } else {
        hasBlanks = true;
      }
    } else {
      hasBlanks = true;
    }
  }

  const result = Array.from(seen).sort((a, b) => a.localeCompare(b));

  if (hasBlanks && includeSentinel) {
    result.push(includeSentinel);
  }

  return result;
}

// ============================================================
// Filter predicates
// ============================================================

/**
 * Returns true if the product's category is blank (empty,
 * whitespace-only, null, or undefined).
 */
export function isBlankCategory(category: string | null | undefined): boolean {
  return typeof category !== 'string' || category.trim().length === 0;
}

/**
 * Returns true if the product's brand is blank.
 */
export function isBlankBrand(brand: string | null | undefined): boolean {
  return typeof brand !== 'string' || brand.trim().length === 0;
}

/**
 * Returns true if the product's supplier is blank.
 */
export function isBlankSupplier(supplier: string | null | undefined): boolean {
  return typeof supplier !== 'string' || supplier.trim().length === 0;
}

/**
 * Apply a category filter value to a product.
 *
 * - If filterValue is 'all', the product passes.
 * - If filterValue is the UNCATEGORISED_FILTER sentinel, the product
 *   passes only if its category is blank.
 * - Otherwise, the product passes only if its category exactly matches.
 */
export function categoryMatchesFilter(
  productCategory: string,
  filterValue: string,
): boolean {
  if (filterValue === 'all') return true;
  if (filterValue === UNCATEGORISED_FILTER) {
    return isBlankCategory(productCategory);
  }
  return productCategory === filterValue;
}

/**
 * Apply a brand filter value to a product.
 */
export function brandMatchesFilter(
  productBrand: string,
  filterValue: string,
): boolean {
  if (filterValue === 'all') return true;
  if (filterValue === UNKNOWN_BRAND_FILTER) {
    return isBlankBrand(productBrand);
  }
  return productBrand === filterValue;
}

// ============================================================
// Display labels
// ============================================================

/**
 * Get the display label for a category filter value.
 */
export function categoryFilterLabel(value: string): string {
  if (value === UNCATEGORISED_FILTER) return 'Uncategorised';
  return value;
}

/**
 * Get the display label for a brand filter value.
 */
export function brandFilterLabel(value: string): string {
  if (value === UNKNOWN_BRAND_FILTER) return 'Unknown brand';
  return value;
}
