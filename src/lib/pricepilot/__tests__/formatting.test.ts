/**
 * Unit tests for src/lib/pricepilot/formatting.ts
 *
 * Covers:
 *   - isFiniteNumber
 *   - safeNumberValue
 *   - formatCurrency (NaN, Infinity, -Infinity, undefined, null, INR, negative)
 *   - formatPercentage
 *   - formatNumber
 *   - formatCurrencyOrDash / formatPercentageOrDash / formatNumberOrDash
 *   - roundToDecimals / roundTo2Decimals / roundTo4Decimals
 */

import { describe, it, expect } from 'vitest';
import {
  isFiniteNumber,
  safeNumberValue,
  formatCurrency,
  formatPercentage,
  formatNumber,
  formatCurrencyOrDash,
  formatPercentageOrDash,
  formatNumberOrDash,
  roundToDecimals,
  roundTo2Decimals,
  roundTo4Decimals,
  UNAVAILABLE_PLACEHOLDER,
} from '../formatting';

describe('isFiniteNumber', () => {
  it('accepts real numbers', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(42)).toBe(true);
    expect(isFiniteNumber(-3.14)).toBe(true);
    expect(isFiniteNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('rejects NaN', () => {
    expect(isFiniteNumber(NaN)).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(isFiniteNumber(Infinity)).toBe(false);
  });

  it('rejects -Infinity', () => {
    expect(isFiniteNumber(-Infinity)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isFiniteNumber(undefined)).toBe(false);
  });

  it('rejects null', () => {
    expect(isFiniteNumber(null)).toBe(false);
  });

  it('rejects strings', () => {
    expect(isFiniteNumber('42')).toBe(false);
    expect(isFiniteNumber('')).toBe(false);
  });

  it('rejects objects and arrays', () => {
    expect(isFiniteNumber({})).toBe(false);
    expect(isFiniteNumber([1, 2])).toBe(false);
  });

  it('rejects booleans', () => {
    expect(isFiniteNumber(true)).toBe(false);
    expect(isFiniteNumber(false)).toBe(false);
  });
});

describe('safeNumberValue', () => {
  it('returns the number when finite', () => {
    expect(safeNumberValue(42)).toBe(42);
    expect(safeNumberValue(-3.14)).toBe(-3.14);
  });

  it('returns the fallback (default 0) for NaN', () => {
    expect(safeNumberValue(NaN)).toBe(0);
    expect(safeNumberValue(NaN, 99)).toBe(99);
  });

  it('returns the fallback for Infinity', () => {
    expect(safeNumberValue(Infinity)).toBe(0);
    expect(safeNumberValue(Infinity, 99)).toBe(99);
  });

  it('returns the fallback for -Infinity', () => {
    expect(safeNumberValue(-Infinity)).toBe(0);
    expect(safeNumberValue(-Infinity, 99)).toBe(99);
  });

  it('returns the fallback for undefined', () => {
    expect(safeNumberValue(undefined)).toBe(0);
    expect(safeNumberValue(undefined, 7)).toBe(7);
  });

  it('returns the fallback for null', () => {
    expect(safeNumberValue(null)).toBe(0);
    expect(safeNumberValue(null, 7)).toBe(7);
  });

  it('returns the fallback for strings', () => {
    expect(safeNumberValue('42')).toBe(0);
    expect(safeNumberValue('hello', 99)).toBe(99);
  });
});

describe('formatCurrency', () => {
  it('formats INR with prefix symbol', () => {
    expect(formatCurrency(1250, 'INR')).toBe('₹1,250.00');
  });

  it('formats negative INR with minus before symbol', () => {
    expect(formatCurrency(-1250, 'INR')).toBe('-₹1,250.00');
  });

  it('returns ₹0.00 for NaN', () => {
    expect(formatCurrency(NaN, 'INR')).toBe('₹0.00');
  });

  it('returns ₹0.00 for Infinity', () => {
    expect(formatCurrency(Infinity, 'INR')).toBe('₹0.00');
  });

  it('returns ₹0.00 for -Infinity', () => {
    expect(formatCurrency(-Infinity, 'INR')).toBe('₹0.00');
  });

  it('returns ₹0.00 for undefined', () => {
    expect(formatCurrency(undefined, 'INR')).toBe('₹0.00');
  });

  it('returns ₹0.00 for null', () => {
    expect(formatCurrency(null, 'INR')).toBe('₹0.00');
  });

  it('handles USD', () => {
    expect(formatCurrency(99.99, 'USD')).toBe('$99.99');
  });

  it('handles compact INR formatting', () => {
    expect(formatCurrency(125000, 'INR', { compact: true })).toBe('₹1.25L');
    expect(formatCurrency(12500000, 'INR', { compact: true })).toBe('₹1.25Cr');
    expect(formatCurrency(12500, 'INR', { compact: true })).toBe('₹12.5K');
  });

  it('does NOT produce "NaN" string for any invalid input', () => {
    expect(formatCurrency(NaN, 'INR')).not.toContain('NaN');
    expect(formatCurrency(Infinity, 'INR')).not.toContain('Infinity');
    expect(formatCurrency(undefined, 'INR')).not.toContain('undefined');
    expect(formatCurrency(null, 'INR')).not.toContain('null');
  });
});

describe('formatPercentage', () => {
  it('formats a normal percentage', () => {
    expect(formatPercentage(18.5, 1)).toBe('18.5%');
  });

  it('returns 0% for NaN', () => {
    expect(formatPercentage(NaN)).toBe('0%');
  });

  it('returns 0% for Infinity', () => {
    expect(formatPercentage(Infinity)).toBe('0%');
  });

  it('returns 0% for -Infinity', () => {
    expect(formatPercentage(-Infinity)).toBe('0%');
  });

  it('returns 0% for undefined', () => {
    expect(formatPercentage(undefined)).toBe('0%');
  });

  it('returns 0% for null', () => {
    expect(formatPercentage(null)).toBe('0%');
  });

  it('does NOT produce "NaN%" string for any invalid input', () => {
    expect(formatPercentage(NaN)).not.toContain('NaN');
    expect(formatPercentage(Infinity)).not.toContain('Infinity');
    expect(formatPercentage(undefined)).not.toContain('undefined');
  });
});

describe('formatNumber', () => {
  it('formats a normal number', () => {
    expect(formatNumber(42.567, 2)).toBe('42.57');
  });

  it('returns 0 for NaN', () => {
    expect(formatNumber(NaN)).toBe('0');
  });

  it('returns 0 for Infinity', () => {
    expect(formatNumber(Infinity)).toBe('0');
  });

  it('returns 0 for undefined', () => {
    expect(formatNumber(undefined)).toBe('0');
  });

  it('returns 0 for null', () => {
    expect(formatNumber(null)).toBe('0');
  });
});

describe('formatCurrencyOrDash', () => {
  it('formats finite numbers normally', () => {
    expect(formatCurrencyOrDash(1250, 'INR')).toBe('₹1,250.00');
  });

  it('returns the em-dash placeholder for NaN', () => {
    expect(formatCurrencyOrDash(NaN, 'INR')).toBe(UNAVAILABLE_PLACEHOLDER);
  });

  it('returns the em-dash placeholder for Infinity', () => {
    expect(formatCurrencyOrDash(Infinity, 'INR')).toBe(UNAVAILABLE_PLACEHOLDER);
  });

  it('returns the em-dash placeholder for undefined', () => {
    expect(formatCurrencyOrDash(undefined, 'INR')).toBe(UNAVAILABLE_PLACEHOLDER);
  });

  it('returns the em-dash placeholder for null', () => {
    expect(formatCurrencyOrDash(null, 'INR')).toBe(UNAVAILABLE_PLACEHOLDER);
  });
});

describe('formatPercentageOrDash', () => {
  it('formats finite numbers normally', () => {
    expect(formatPercentageOrDash(18.5)).toBe('18.5%');
  });

  it('returns the em-dash placeholder for NaN', () => {
    expect(formatPercentageOrDash(NaN)).toBe(UNAVAILABLE_PLACEHOLDER);
  });

  it('returns the em-dash placeholder for undefined', () => {
    expect(formatPercentageOrDash(undefined)).toBe(UNAVAILABLE_PLACEHOLDER);
  });
});

describe('formatNumberOrDash', () => {
  it('formats finite numbers normally', () => {
    expect(formatNumberOrDash(42.5, 1)).toBe('42.5');
  });

  it('returns the em-dash placeholder for NaN', () => {
    expect(formatNumberOrDash(NaN)).toBe(UNAVAILABLE_PLACEHOLDER);
  });

  it('returns the em-dash placeholder for undefined', () => {
    expect(formatNumberOrDash(undefined)).toBe(UNAVAILABLE_PLACEHOLDER);
  });
});

describe('roundToDecimals', () => {
  it('rounds to 2 decimals (half-up, with IEEE 754 caveats)', () => {
    // Some values like 1.005 are subject to IEEE 754 representation
    // issues (1.005 * 100 = 100.4999...). We test values that round
    // predictably.
    expect(roundToDecimals(1.234, 2)).toBe(1.23);
    expect(roundToDecimals(1.236, 2)).toBe(1.24);
    expect(roundToDecimals(1.004, 2)).toBe(1);
    expect(roundToDecimals(2.556, 2)).toBe(2.56);
  });

  it('returns 0 for NaN', () => {
    expect(roundToDecimals(NaN, 2)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(roundToDecimals(Infinity, 2)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(roundToDecimals(undefined, 2)).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(roundToDecimals(null, 2)).toBe(0);
  });

  it('returns 0 for strings', () => {
    expect(roundToDecimals('42', 2)).toBe(0);
  });
});

describe('roundTo2Decimals / roundTo4Decimals', () => {
  it('roundTo2Decimals rounds correctly', () => {
    expect(roundTo2Decimals(3.14159)).toBe(3.14);
    expect(roundTo2Decimals(3.146)).toBe(3.15);
  });

  it('roundTo4Decimals rounds correctly', () => {
    expect(roundTo4Decimals(3.14159265)).toBe(3.1416);
  });

  it('both return 0 for invalid inputs', () => {
    expect(roundTo2Decimals(NaN)).toBe(0);
    expect(roundTo2Decimals(Infinity)).toBe(0);
    expect(roundTo4Decimals(undefined)).toBe(0);
    expect(roundTo4Decimals(null)).toBe(0);
  });
});
