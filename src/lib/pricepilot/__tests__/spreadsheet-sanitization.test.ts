/**
 * Tests for spreadsheet formula-injection sanitization (Phase 14).
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeSpreadsheetCell,
  sanitizeSpreadsheetRow,
  sanitizeSpreadsheetRows,
} from '../spreadsheet-adapter';

describe('sanitizeSpreadsheetCell', () => {
  it('prefixes strings starting with =', () => {
    expect(sanitizeSpreadsheetCell('=HYPERLINK("malicious")')).toBe("'=HYPERLINK(\"malicious\")");
    expect(sanitizeSpreadsheetCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
  });

  it('prefixes strings starting with +', () => {
    expect(sanitizeSpreadsheetCell('+SUM(1,1)')).toBe("'+SUM(1,1)");
  });

  it('prefixes strings starting with -', () => {
    expect(sanitizeSpreadsheetCell('-10+20')).toBe("'-10+20");
  });

  it('prefixes strings starting with @', () => {
    expect(sanitizeSpreadsheetCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
  });

  it('prefixes strings starting with tab', () => {
    expect(sanitizeSpreadsheetCell('\t=cmd')).toBe("'\t=cmd");
  });

  it('prefixes strings starting with carriage return', () => {
    expect(sanitizeSpreadsheetCell('\r=cmd')).toBe("'\r=cmd");
  });

  it('prefixes strings with leading whitespace before a formula char', () => {
    expect(sanitizeSpreadsheetCell('  =SUM(1)')).toBe("'  =SUM(1)");
    expect(sanitizeSpreadsheetCell(' \t+1')).toBe("' \t+1");
  });

  it('does NOT modify strings that do not start with a formula char', () => {
    expect(sanitizeSpreadsheetCell('Hello World')).toBe('Hello World');
    expect(sanitizeSpreadsheetCell('SKU-001')).toBe('SKU-001'); // hyphen NOT at start (after chars)
    expect(sanitizeSpreadsheetCell('100')).toBe('100');
    expect(sanitizeSpreadsheetCell('product name')).toBe('product name');
  });

  it('is idempotent — does not double-prefix strings that already start with apostrophe', () => {
    expect(sanitizeSpreadsheetCell("'=already-sanitized")).toBe("'=already-sanitized");
    expect(sanitizeSpreadsheetCell("'already has apostrophe")).toBe("'already has apostrophe");
  });

  it('passes through finite numbers unchanged', () => {
    expect(sanitizeSpreadsheetCell(42)).toBe(42);
    expect(sanitizeSpreadsheetCell(0)).toBe(0);
    expect(sanitizeSpreadsheetCell(-3.14)).toBe(-3.14);
    expect(sanitizeSpreadsheetCell(1e10)).toBe(1e10);
  });

  it('converts non-finite numbers to a safe string representation', () => {
    // NaN/Infinity are not finite numbers — they fall through to the
    // string conversion path. The result is a literal string like
    // "NaN" or "Infinity" which does NOT start with a formula char.
    // "-Infinity" DOES start with "-", so it gets the apostrophe
    // prefix (defence in depth — even though no spreadsheet would
    // evaluate it as a formula, the apostrophe guarantees it).
    expect(sanitizeSpreadsheetCell(NaN)).toBe('NaN');
    expect(sanitizeSpreadsheetCell(Infinity)).toBe('Infinity');
    expect(sanitizeSpreadsheetCell(-Infinity)).toBe("'-Infinity");
  });

  it('converts booleans to TRUE/FALSE strings', () => {
    expect(sanitizeSpreadsheetCell(true)).toBe('TRUE');
    expect(sanitizeSpreadsheetCell(false)).toBe('FALSE');
  });

  it('converts null/undefined to empty string', () => {
    expect(sanitizeSpreadsheetCell(null)).toBe('');
    expect(sanitizeSpreadsheetCell(undefined)).toBe('');
  });

  it('handles objects with a text property', () => {
    expect(sanitizeSpreadsheetCell({ text: '=malicious' })).toBe("'=malicious");
    expect(sanitizeSpreadsheetCell({ text: 'safe text' })).toBe('safe text');
  });

  it('converts arbitrary objects to string and then sanitizes', () => {
    expect(sanitizeSpreadsheetCell({ toString: () => '=cmd' })).toBe("'=cmd");
  });
});

describe('sanitizeSpreadsheetRow', () => {
  it('sanitizes every value in a row object', () => {
    const row = {
      name: '=evil',
      sku: 'SKU-001',
      price: 100,
      note: '+SUM(1,1)',
    };
    const result = sanitizeSpreadsheetRow(row);
    expect(result.name).toBe("'=evil");
    expect(result.sku).toBe('SKU-001');
    expect(result.price).toBe(100);
    expect(result.note).toBe("'+SUM(1,1)");
  });

  it('does not mutate the input', () => {
    const row = { name: '=evil' };
    const result = sanitizeSpreadsheetRow(row);
    expect(row.name).toBe('=evil'); // unchanged
    expect(result.name).toBe("'=evil");
  });

  it('handles empty objects', () => {
    expect(sanitizeSpreadsheetRow({})).toEqual({});
  });
});

describe('sanitizeSpreadsheetRows', () => {
  it('sanitizes every row in an array', () => {
    const rows = [
      { name: '=evil1', price: 10 },
      { name: 'safe', price: 20 },
      { name: '+evil2', price: 30 },
    ];
    const result = sanitizeSpreadsheetRows(rows);
    expect(result[0].name).toBe("'=evil1");
    expect(result[1].name).toBe('safe');
    expect(result[2].name).toBe("'+evil2");
    expect(result[0].price).toBe(10);
  });

  it('does not mutate the input', () => {
    const rows = [{ name: '=evil' }];
    const result = sanitizeSpreadsheetRows(rows);
    expect(rows[0].name).toBe('=evil');
    expect(result[0].name).toBe("'=evil");
  });

  it('handles empty arrays', () => {
    expect(sanitizeSpreadsheetRows([])).toEqual([]);
  });
});

describe('real-world attack payloads', () => {
  // The exact payloads from the spec.
  const attackPayloads = [
    '=HYPERLINK("malicious")',
    '+SUM(1,1)',
    '-10+20',
    '@SUM(A1:A2)',
  ];

  for (const payload of attackPayloads) {
    it(`neutralizes "${payload.slice(0, 20)}..."`, () => {
      const sanitized = sanitizeSpreadsheetCell(payload);
      expect(typeof sanitized).toBe('string');
      expect(String(sanitized).startsWith("'")).toBe(true);
      // The sanitized string, when interpreted by a spreadsheet app,
      // would be treated as literal text — not a formula.
    });
  }

  it('neutralizes a row of attack payloads', () => {
    const row = {
      productName: '=HYPERLINK("evil")',
      sku: '+SUM(1,1)',
      category: '-10+20',
      note: '@SUM(A1:A2)',
      price: 100,
    };
    const result = sanitizeSpreadsheetRow(row);
    expect(String(result.productName).startsWith("'")).toBe(true);
    expect(String(result.sku).startsWith("'")).toBe(true);
    expect(String(result.category).startsWith("'")).toBe(true);
    expect(String(result.note).startsWith("'")).toBe(true);
    expect(result.price).toBe(100); // numbers unchanged
  });
});
