/**
 * PricePilot - Indian Number Format Parsing Tests
 *
 * Tests for parsing Indian supplier spreadsheet formats and
 * missing-value indicators.
 */

import { describe, it, expect } from 'vitest';
import { parseNumericInput } from '../formatting';

describe('Indian number format parsing', () => {
  it('parses ₹12,500', () => {
    expect(parseNumericInput('₹12,500')).toBe(12500);
  });

  it('parses INR 12,500', () => {
    expect(parseNumericInput('INR 12,500')).toBe(12500);
  });

  it('parses 12,500.00', () => {
    expect(parseNumericInput('12,500.00')).toBe(12500);
  });

  it('parses Indian grouping 1,25,000', () => {
    expect(parseNumericInput('1,25,000')).toBe(125000);
  });

  it('parses ₹ 1,25,000/-', () => {
    expect(parseNumericInput('₹ 1,25,000/-')).toBe(125000);
  });

  it('parses plain 12500', () => {
    expect(parseNumericInput('12500')).toBe(12500);
  });

  it('parses space-separated 12 500', () => {
    expect(parseNumericInput('12 500')).toBe(12500);
  });

  it('parses ₹ 1,00,000/-', () => {
    expect(parseNumericInput('₹ 1,00,000/-')).toBe(100000);
  });

  it('parses Rs. 5,000', () => {
    expect(parseNumericInput('Rs. 5,000')).toBe(5000);
  });

  it('parses Rs 5,000', () => {
    expect(parseNumericInput('Rs 5,000')).toBe(5000);
  });
});

describe('Missing-value indicators', () => {
  it('returns NaN for "-"', () => {
    expect(parseNumericInput('-')).toBeNaN();
  });

  it('returns NaN for "—" (em dash)', () => {
    expect(parseNumericInput('—')).toBeNaN();
  });

  it('returns NaN for "–" (en dash)', () => {
    expect(parseNumericInput('–')).toBeNaN();
  });

  it('returns NaN for "N/A"', () => {
    expect(parseNumericInput('N/A')).toBeNaN();
  });

  it('returns NaN for "NA"', () => {
    expect(parseNumericInput('NA')).toBeNaN();
  });

  it('returns NaN for "Not Available"', () => {
    expect(parseNumericInput('Not Available')).toBeNaN();
  });

  it('returns NaN for "Call"', () => {
    expect(parseNumericInput('Call')).toBeNaN();
  });

  it('returns NaN for "On Request"', () => {
    expect(parseNumericInput('On Request')).toBeNaN();
  });

  it('returns NaN for "POA"', () => {
    expect(parseNumericInput('POA')).toBeNaN();
  });

  it('returns NaN for "nil"', () => {
    expect(parseNumericInput('nil')).toBeNaN();
  });

  it('returns NaN for "TBD"', () => {
    expect(parseNumericInput('TBD')).toBeNaN();
  });

  it('returns NaN for empty string', () => {
    expect(parseNumericInput('')).toBeNaN();
  });

  it('returns NaN for blank string', () => {
    expect(parseNumericInput('   ')).toBeNaN();
  });
});

describe('Disambiguation: does not confuse MRP with cost', () => {
  it('parses "MRP" as a selling price, not a cost (this is a column mapping concern, not a parsing concern)', () => {
    // The parser just parses numbers — it doesn't know whether a column is MRP or cost.
    // The column mapping logic handles that.
    expect(parseNumericInput('₹1,250')).toBe(1250);
  });
});

describe('Negative numbers', () => {
  it('parses negative numbers in parentheses', () => {
    expect(parseNumericInput('(1,234)')).toBe(-1234);
  });

  it('parses negative numbers with minus sign', () => {
    expect(parseNumericInput('-1,234')).toBe(-1234);
  });
});

describe('Percentage values', () => {
  it('parses 18%', () => {
    expect(parseNumericInput('18%')).toBe(18);
  });

  it('parses 18.5%', () => {
    expect(parseNumericInput('18.5%')).toBe(18.5);
  });

  it('parses GST 18%', () => {
    expect(parseNumericInput('GST 18%')).toBe(18);
  });
});
