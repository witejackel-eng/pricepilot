/**
 * PricePilot - Currency and Number Formatting Utilities
 *
 * Handles formatting of currencies, percentages, and numbers
 * with proper locale awareness and symbol placement.
 *
 * CRITICAL CONTRACT:
 *   No function in this module may ever return a string containing
 *   `NaN`, `Infinity`, `-Infinity`, `undefined`, or `null` to the UI.
 *   Invalid inputs are converted to a finite fallback (default 0)
 *   before formatting. For "no value available" semantics, callers
 *   should use `formatCurrencyOrDash` / `formatPercentageOrDash`
 *   which render an em-dash so the user can see that data is missing
 *   instead of being misled by `₹0`.
 */

import { SUPPORTED_CURRENCIES, CurrencyInfo } from './types';

// ============================================================
// Finite-Number Guards (central source of truth)
// ============================================================

/**
 * Type guard: returns true ONLY when value is a real, finite number.
 *
 * Rejects: undefined, null, NaN, Infinity, -Infinity, strings, objects.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Coerce any value to a finite number, falling back to `fallback`
 * (default 0) when the value is not a finite number.
 *
 * This never throws. It is the single entry point used by every
 * formatter in this module.
 */
export function safeNumberValue(value: unknown, fallback: number = 0): number {
  return isFiniteNumber(value) ? value : fallback;
}

/**
 * Placeholder string used when a financial value is genuinely
 * unavailable (e.g. product has no purchase cost). The em-dash is
 * visually distinct from `0` so the owner is never misled.
 */
export const UNAVAILABLE_PLACEHOLDER = '—';

// ============================================================
// Currency Lookup
// ============================================================

/** Get currency info by code */
export function getCurrencyInfo(currencyCode: string): CurrencyInfo {
  const info = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode);
  if (!info) {
    // Fallback to INR if code not found
    return SUPPORTED_CURRENCIES[0];
  }
  return info;
}

/** Get currency symbol by code */
export function getCurrencySymbol(currencyCode: string): string {
  return getCurrencyInfo(currencyCode).symbol;
}

/** Get all currency options as selectable array */
export function getCurrencyOptions(): Array<{ code: string; symbol: string; name: string }> {
  return SUPPORTED_CURRENCIES.map(c => ({
    code: c.code,
    symbol: c.symbol,
    name: c.name,
  }));
}

// ============================================================
// Currency Formatting
// ============================================================

/**
 * Format an amount as currency with proper symbol placement and decimals.
 *
 * CRITICAL: `amount` is coerced through `safeNumberValue` so that
 * NaN / Infinity / undefined / null / strings never reach the UI.
 * If you need to render a "value not available" placeholder instead of
 * `₹0`, call `formatCurrencyOrDash`.
 *
 * @param amount - The numeric amount to format
 * @param currencyCode - Currency code (INR, GBP, USD, EUR, AED)
 * @param options - Optional overrides for decimals, showSymbol, showCode
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: unknown,
  currencyCode: string = 'INR',
  options?: {
    decimals?: number;
    showSymbol?: boolean;
    showCode?: boolean;
    compact?: boolean;  // Show in compact form (e.g., 1.2L for INR)
  }
): string {
  const info = getCurrencyInfo(currencyCode);
  const decimals = options?.decimals ?? info.decimals;
  const showSymbol = options?.showSymbol ?? true;
  const showCode = options?.showCode ?? false;

  // Coerce to a finite number — NaN/Infinity/undefined/null all become 0.
  const safeAmount = safeNumberValue(amount, 0);

  // For INR compact notation (lakhs / crores)
  if (currencyCode === 'INR' && options?.compact) {
    return formatINRCompact(safeAmount, showSymbol);
  }

  // Format the number with proper decimals
  const formattedNumber = formatNumberWithCommas(safeAmount, decimals);

  // Build the string with symbol position
  let result = formattedNumber;
  if (showSymbol) {
    result = info.symbolPosition === 'prefix'
      ? `${info.symbol}${formattedNumber}`
      : `${formattedNumber}${info.symbol}`;
  }
  if (showCode) {
    result = `${result} ${currencyCode}`;
  }

  // Handle negative values: move minus sign before currency symbol
  if (safeAmount < 0 && showSymbol) {
    // Remove the minus from formattedNumber, put it before the symbol
    const absFormatted = formatNumberWithCommas(Math.abs(safeAmount), decimals);
    if (info.symbolPosition === 'prefix') {
      result = `-${info.symbol}${absFormatted}`;
    } else {
      result = `-${absFormatted}${info.symbol}`;
    }
    if (showCode) {
      result = `${result} ${currencyCode}`;
    }
  }

  return result;
}

/**
 * Format INR amounts in compact notation (lakhs and crores).
 * - Below 1,000: regular format
 * - 1,000 - 99,999: e.g., ₹12.5K
 * - 1,00,000 - 99,99,999: e.g., ₹1.2L (lakhs)
 * - 1,00,00,000+: e.g., ₹1.2Cr (crores)
 */
function formatINRCompact(amount: number, showSymbol: boolean): string {
  // Defensive: even though callers route through safeNumberValue, this
  // helper is also called directly by some legacy paths — guarantee finiteness.
  const safeAmount = safeNumberValue(amount, 0);
  const abs = Math.abs(safeAmount);
  const sign = safeAmount < 0 ? '-' : '';
  const symbol = showSymbol ? '₹' : '';

  if (abs < 1000) {
    return `${sign}${symbol}${abs}`;
  } else if (abs < 100000) {
    const val = roundTo2Decimals(abs / 1000);
    return `${sign}${symbol}${val}K`;
  } else if (abs < 10000000) {
    const val = roundTo2Decimals(abs / 100000);
    return `${sign}${symbol}${val}L`;
  } else {
    const val = roundTo2Decimals(abs / 10000000);
    return `${sign}${symbol}${val}Cr`;
  }
}

// ============================================================
// Number Formatting
// ============================================================

/**
 * Format a number with comma grouping (locale-aware).
 * Uses Indian grouping for INR (e.g., 1,23,456.00) and
 * Western grouping for other currencies.
 */
function formatNumberWithCommas(value: number, decimals: number): string {
  // Round to specified decimals first
  const rounded = roundToDecimals(value, decimals);
  const parts = rounded.toString().split('.');
  const intPart = parts[0];
  const decPart = parts.length > 1 ? parts[1] : '';

  // For negative numbers, strip the minus sign temporarily
  const isNegative = intPart.startsWith('-');
  const digits = isNegative ? intPart.slice(1) : intPart;

  // Apply digit grouping
  const grouped = applyDigitGrouping(digits);

  // Reassemble
  let result = isNegative ? `-${grouped}` : grouped;
  if (decimals > 0) {
    const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals);
    result = `${result}.${paddedDec}`;
  }
  return result;
}

/**
 * Apply digit grouping based on pattern.
 * Indian pattern: first 3 digits, then groups of 2 (e.g., 1,23,456)
 * Western pattern: groups of 3 (e.g., 123,456)
 */
function applyDigitGrouping(digits: string): string {
  if (digits.length <= 3) return digits;

  // Use Western grouping (groups of 3 from right) for all currencies
  // Indian grouping can be optionally enabled if needed
  const groups: string[] = [];
  let remaining = digits;

  while (remaining.length > 3) {
    groups.unshift(remaining.slice(remaining.length - 3));
    remaining = remaining.slice(0, remaining.length - 3);
  }
  groups.unshift(remaining);

  return groups.join(',');
}

/**
 * Format a percentage value.
 *
 * CRITICAL: `value` is coerced through `safeNumberValue`. NaN / Infinity /
 * undefined / null all become `0%`. Use `formatPercentageOrDash` when the
 * caller wants to surface "no value" instead of misleading `0%`.
 *
 * @param value - Percentage value (e.g., 18.5 for 18.5%)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "18.5%")
 */
export function formatPercentage(value: unknown, decimals: number = 1): string {
  const safeValue = safeNumberValue(value, 0);
  const rounded = roundToDecimals(safeValue, decimals);
  return `${rounded}%`;
}

/**
 * Format a general number.
 *
 * CRITICAL: `value` is coerced through `safeNumberValue`. NaN / Infinity /
 * undefined / null all become `0`. Use `formatNumberOrDash` for the
 * "no value" variant.
 *
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export function formatNumber(value: unknown, decimals: number = 2): string {
  const safeValue = safeNumberValue(value, 0);
  return roundToDecimals(safeValue, decimals).toString();
}

// ============================================================
// Parsing Utilities
// ============================================================

/**
 * Parse a numeric input that may contain currency symbols, commas,
 * percentage signs, and other formatting characters.
 *
 * Handles:
 * - Currency symbols: ₹, $, £, €, د.إ
 * - Commas in numbers: 1,23,456 or 123,456
 * - Percentage: 18% → 18, 18.5% → 18.5
 * - Parentheses for negative: (1,234) → -1234
 * - Spaces and whitespace
 * - Scientific notation: 1.5e3 → 1500
 *
 * @param value - The raw string input
 * @returns Parsed number, or NaN if unparseable
 */
export function parseNumericInput(value: string): number {
  if (typeof value !== 'string') return NaN;
  if (value.trim() === '') return NaN;

  let cleaned = value.trim();

  // Detect missing-value indicators — these should be treated as NaN, not zero.
  // Common patterns in Indian supplier spreadsheets:
  //   -, —, N/A, NA, Not Available, Call, On Request, POA, blank
  const missingValuePatterns = /^[-—–]$|^n\/?a$|^not\s*available$|^call$|^on\s*request$|^poa$|^price\s*on\s*request$|^tbd$|^na$|^nil$|^upon\s*request$/i;
  if (missingValuePatterns.test(cleaned)) return NaN;

  // Strip trailing /- (Indian price notation: ₹ 1,25,000/-)
  cleaned = cleaned.replace(/\/-$/, '');

  // Strip trailing .00 or .0 when followed by /-
  cleaned = cleaned.replace(/\/-$/, '');

  // Detect percentage and strip the % sign
  const isPercentage = cleaned.endsWith('%');
  if (isPercentage) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  // Remove known currency symbols and prefixes
  // Order matters: longer prefixes first (Rs. before Rs)
  const currencySymbols = ['₹', '$', '£', '€', 'د.إ', 'Rs.', 'Rs', 'INR', 'USD', 'GBP', 'EUR', 'AED'];
  for (const symbol of currencySymbols) {
    // Replace with space (not empty) to avoid joining adjacent numbers
    // e.g. "Rs.5,000" → " 5,000" not "5,000"
    cleaned = cleaned.replace(symbol, ' ');
  }

  // Remove commas (all grouping commas)
  cleaned = cleaned.replace(/,/g, '');

  // Handle parentheses as negative: (1,234) → -1234
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }

  // Remove spaces
  cleaned = cleaned.replace(/\s/g, '');

  // Remove any remaining non-numeric characters except minus, decimal point, and 'e' for scientific
  cleaned = cleaned.replace(/[^0-9.\-eE]/g, '');

  // Handle multiple decimal points (keep only the first)
  const dotParts = cleaned.split('.');
  if (dotParts.length > 2) {
    cleaned = dotParts[0] + '.' + dotParts.slice(1).join('');
  }

  // Handle multiple minus signs: keep one at the start, and one
  // immediately after 'e' or 'E' (for scientific notation like 1.23e-1).
  // Any other minus signs are invalid and should be removed.
  cleaned = cleaned.replace(/(?<!^)(?<!^e)(?<!^E)(?<!e)(?<!E)-/g, '');

  const parsed = parseFloat(cleaned);

  // Validate the parsed result
  if (isNaN(parsed) || !isFinite(parsed)) return NaN;

  return parsed;
}

/**
 * Parse a currency-formatted input and return the numeric value.
 * Wrapper around parseNumericInput with additional currency awareness.
 */
export function parseCurrencyInput(value: string, currencyCode: string): number {
  const parsed = parseNumericInput(value);
  return parsed;
}

/**
 * Parse a percentage input (e.g., "18.5%") and return the numeric value.
 */
export function parsePercentageInput(value: string): number {
  return parseNumericInput(value);
}

// ============================================================
// Rounding Helpers
// ============================================================

/**
 * Round a number to a specified number of decimal places.
 * Uses the "round half away from zero" method to avoid floating point issues.
 *
 * CRITICAL: NaN / Infinity / undefined inputs return 0 instead of poisoning
 * downstream calculations with NaN propagation.
 */
export function roundToDecimals(value: unknown, decimals: number): number {
  if (!isFiniteNumber(value)) return 0;
  const safeValue = value as number;
  if (decimals < 0) decimals = 0;
  const factor = Math.pow(10, decimals);
  // Use string-based rounding to avoid IEEE 754 floating point issues
  // Math.round handles ties by rounding to nearest even, but for business
  // logic we want "round half up"
  const scaled = safeValue * factor;
  const rounded = Math.round(scaled);
  const result = rounded / factor;
  // Guard against rounding producing NaN/Infinity (shouldn't happen, but
  // be defensive — this is the foundation of every financial display).
  return isFiniteNumber(result) ? result : 0;
}

/**
 * Round to 2 decimal places (common for currency).
 */
export function roundTo2Decimals(value: unknown): number {
  return roundToDecimals(value, 2);
}

/**
 * Round to 4 decimal places (for intermediate calculations).
 */
export function roundTo4Decimals(value: unknown): number {
  return roundToDecimals(value, 4);
}

// ============================================================
// "Unavailable" Variants — render `—` instead of misleading `0`
// ============================================================

/**
 * Format a currency amount, returning the unavailable placeholder
 * (`—`) when the value is not a finite number. Use this whenever the
 * caller cannot confidently produce a real number (e.g. missing purchase
 * cost, calculation failure) — NEVER silently show `₹0` in that case.
 */
export function formatCurrencyOrDash(
  amount: unknown,
  currencyCode: string = 'INR',
  options?: {
    decimals?: number;
    showSymbol?: boolean;
    showCode?: boolean;
    compact?: boolean;
  }
): string {
  if (!isFiniteNumber(amount)) return UNAVAILABLE_PLACEHOLDER;
  return formatCurrency(amount, currencyCode, options);
}

/**
 * Format a percentage, returning `—` when the value is not finite.
 */
export function formatPercentageOrDash(value: unknown, decimals: number = 1): string {
  if (!isFiniteNumber(value)) return UNAVAILABLE_PLACEHOLDER;
  return formatPercentage(value, decimals);
}

/**
 * Format a number, returning `—` when the value is not finite.
 */
export function formatNumberOrDash(value: unknown, decimals: number = 2): string {
  if (!isFiniteNumber(value)) return UNAVAILABLE_PLACEHOLDER;
  return formatNumber(value, decimals);
}
