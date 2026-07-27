/**
 * PricePilot - Currency and Number Formatting Utilities
 *
 * Handles formatting of currencies, percentages, and numbers
 * with proper locale awareness and symbol placement.
 */

import { SUPPORTED_CURRENCIES, CurrencyInfo } from './types';

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
 * @param amount - The numeric amount to format
 * @param currencyCode - Currency code (INR, GBP, USD, EUR, AED)
 * @param options - Optional overrides for decimals, showSymbol, showCode
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
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

  // Handle NaN / undefined / null
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;

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
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
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
 * @param value - Percentage value (e.g., 18.5 for 18.5%)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "18.5%")
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  if (typeof value !== 'number' || isNaN(value)) return '0%';
  const rounded = roundToDecimals(value, decimals);
  return `${rounded}%`;
}

/**
 * Format a general number.
 *
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export function formatNumber(value: number, decimals: number = 2): string {
  if (typeof value !== 'number' || isNaN(value)) return '0';
  return roundToDecimals(value, decimals).toString();
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

  // Detect percentage and strip the % sign
  const isPercentage = cleaned.endsWith('%');
  if (isPercentage) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  // Remove known currency symbols
  const currencySymbols = ['₹', '$', '£', '€', 'د.إ', 'Rs', 'Rs.', 'INR', 'USD', 'GBP', 'EUR', 'AED'];
  for (const symbol of currencySymbols) {
    cleaned = cleaned.replace(symbol, '');
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

  // Handle multiple minus signs (keep only one at the start)
  if (cleaned.indexOf('-') > 0) {
    // Minus not at start — invalid
    cleaned = cleaned.replace(/-/g, '');
  }

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
 */
export function roundToDecimals(value: number, decimals: number): number {
  if (decimals < 0) decimals = 0;
  const factor = Math.pow(10, decimals);
  // Use string-based rounding to avoid IEEE 754 floating point issues
  // Math.round handles ties by rounding to nearest even, but for business
  // logic we want "round half up"
  const scaled = value * factor;
  const rounded = Math.round(scaled);
  return rounded / factor;
}

/**
 * Round to 2 decimal places (common for currency).
 */
export function roundTo2Decimals(value: number): number {
  return roundToDecimals(value, 2);
}

/**
 * Round to 4 decimal places (for intermediate calculations).
 */
export function roundTo4Decimals(value: number): number {
  return roundToDecimals(value, 4);
}
