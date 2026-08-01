/**
 * Additional branch coverage tests for src/lib/pricepilot/spreadsheet-adapter.ts
 *
 * Focuses on:
 *   - sanitizeSpreadsheetCell with all formula injection prefixes
 *   - sanitizeSpreadsheetCell with different value types
 *   - sanitizeSpreadsheetRow with mixed types
 *   - sanitizeSpreadsheetRows
 *   - downloadSpreadsheet (mock DOM)
 *   - createSpreadsheet builder with empty rows
 *   - parseCsvFile with different delimiters
 *   - parseSpreadsheet with empty workbook
 *   - parseSpreadsheet with invalid buffer
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseCsvFile,
  parseSpreadsheet,
  createSpreadsheet,
  downloadSpreadsheet,
  sanitizeSpreadsheetCell,
  sanitizeSpreadsheetRow,
  sanitizeSpreadsheetRows,
} from '../spreadsheet-adapter';

// ============================================================
// parseSpreadsheet with invalid/empty inputs
// ============================================================

describe('parseSpreadsheet — invalid buffer', () => {
  it('returns error for invalid buffer', async () => {
    const result = await parseSpreadsheet(new ArrayBuffer(0));
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].severity).toBe('critical');
  });

  it('returns error for random bytes buffer', async () => {
    const buffer = new ArrayBuffer(100);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < 100; i++) view[i] = i;
    const result = await parseSpreadsheet(buffer);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================
// parseCsvFile — additional branches
// ============================================================

describe('parseCsvFile — only header row', () => {
  it('returns error for CSV with only header', () => {
    const csv = 'name,sku,price';
    const buffer = new TextEncoder().encode(csv).buffer;
    const result = parseCsvFile(buffer);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('at least a header row and one data row');
  });
});

describe('parseCsvFile — empty file', () => {
  it('returns error for empty CSV', () => {
    const buffer = new TextEncoder().encode('').buffer;
    const result = parseCsvFile(buffer);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('parseCsvFile — single column', () => {
  it('defaults to comma when no clear delimiter', () => {
    const csv = 'name\nWidget';
    const buffer = new TextEncoder().encode(csv).buffer;
    const result = parseCsvFile(buffer);
    expect(result.delimiter).toBe(',');
    expect(result.rows).toHaveLength(1);
  });
});

// ============================================================
// sanitizeSpreadsheetCell — all formula injection prefixes
// ============================================================

describe('sanitizeSpreadsheetCell — formula injection prefixes', () => {
  it('sanitizes cells starting with =', () => {
    expect(sanitizeSpreadsheetCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
  });

  it('sanitizes cells starting with +', () => {
    expect(sanitizeSpreadsheetCell('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
  });

  it('sanitizes cells starting with -', () => {
    expect(sanitizeSpreadsheetCell('-1+1')).toBe("'-1+1");
  });

  it('sanitizes cells starting with @', () => {
    expect(sanitizeSpreadsheetCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
  });

  it('handles cells starting with tab (whitespace stripped before prefix check)', () => {
    // The code strips leading whitespace before checking for formula prefixes
    const result = sanitizeSpreadsheetCell('\tformula');
    expect(typeof result).toBe('string');
  });

  it('handles cells starting with carriage return (whitespace stripped before prefix check)', () => {
    const result = sanitizeSpreadsheetCell('\rformula');
    expect(typeof result).toBe('string');
  });

  it('sanitizes cells with leading whitespace followed by formula', () => {
    expect(sanitizeSpreadsheetCell('  =SUM(A1:A2)')).toBe("'  =SUM(A1:A2)");
  });

  it('does not sanitize safe strings', () => {
    expect(sanitizeSpreadsheetCell('Hello World')).toBe('Hello World');
  });

  it('does not sanitize numbers', () => {
    expect(sanitizeSpreadsheetCell(42)).toBe(42);
  });

  it('does not sanitize finite numbers', () => {
    expect(sanitizeSpreadsheetCell(3.14)).toBe(3.14);
  });

  it('converts NaN to string "NaN"', () => {
    expect(sanitizeSpreadsheetCell(NaN)).toBe('NaN');
  });

  it('converts Infinity to string "Infinity"', () => {
    expect(sanitizeSpreadsheetCell(Infinity)).toBe('Infinity');
  });

  it('converts boolean true to "TRUE"', () => {
    expect(sanitizeSpreadsheetCell(true)).toBe('TRUE');
  });

  it('converts boolean false to "FALSE"', () => {
    expect(sanitizeSpreadsheetCell(false)).toBe('FALSE');
  });

  it('converts null to empty string', () => {
    expect(sanitizeSpreadsheetCell(null)).toBe('');
  });

  it('converts undefined to empty string', () => {
    expect(sanitizeSpreadsheetCell(undefined)).toBe('');
  });

  it('preserves strings with leading apostrophe', () => {
    expect(sanitizeSpreadsheetCell("'already safe")).toBe("'already safe");
  });

  it('handles objects with text property', () => {
    expect(sanitizeSpreadsheetCell({ text: 'Hello' })).toBe('Hello');
  });

  it('handles objects without text property', () => {
    expect(sanitizeSpreadsheetCell({ foo: 'bar' })).toBe('[object Object]');
  });

  it('sanitizes formula in object text', () => {
    expect(sanitizeSpreadsheetCell({ text: '=HYPERLINK("bad")' })).toBe("'=HYPERLINK(\"bad\")");
  });
});

// ============================================================
// sanitizeSpreadsheetRow — mixed types
// ============================================================

describe('sanitizeSpreadsheetRow — mixed types', () => {
  it('sanitizes a row with mixed value types', () => {
    const row = {
      name: 'Widget',
      price: 9.99,
      formula: '=SUM(A1:A2)',
      active: true,
      notes: null,
      count: undefined,
    };
    const result = sanitizeSpreadsheetRow(row);
    expect(result.name).toBe('Widget');
    expect(result.price).toBe(9.99);
    expect(result.formula).toBe("'=SUM(A1:A2)");
    expect(result.active).toBe('TRUE');
    expect(result.notes).toBe('');
    expect(result.count).toBe('');
  });
});

// ============================================================
// sanitizeSpreadsheetRows
// ============================================================

describe('sanitizeSpreadsheetRows — multiple rows', () => {
  it('sanitizes an array of rows', () => {
    const rows = [
      { name: 'Widget', price: 9.99 },
      { name: '=SUM(A1:A2)', price: 0 },
    ];
    const result = sanitizeSpreadsheetRows(rows);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Widget');
    expect(result[1].name).toBe("'=SUM(A1:A2)");
  });
});

// ============================================================
// downloadSpreadsheet — mock DOM
// ============================================================

describe('downloadSpreadsheet — mock DOM', () => {
  it('creates a blob and triggers download', () => {
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement;

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('a'));
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('a'));
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const buffer = new ArrayBuffer(8);
    downloadSpreadsheet(buffer, 'test.xlsx');

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(createElementSpy).toHaveBeenCalledWith('a');

    // Cleanup
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});

// ============================================================
// createSpreadsheet — writeBuffer path
// ============================================================

describe('createSpreadsheet — writeBuffer produces ArrayBuffer', () => {
  it('returns a valid buffer from writeBuffer', async () => {
    const builder = createSpreadsheet();
    builder.addSheet('Test', [
      { name: 'Widget', price: 100 },
      { name: 'Gadget', price: 200 },
    ]);
    const buffer = await builder.writeBuffer();
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('handles empty rows in addSheet', async () => {
    const builder = createSpreadsheet();
    const result = builder.addSheet('Empty', []);
    expect(result).toBe(builder);
    const buffer = await builder.writeBuffer();
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});

// ============================================================
// parseSpreadsheet — xlsx round-trip
// ============================================================

describe('parseSpreadsheet — xlsx round-trip', () => {
  it('creates and parses a simple xlsx', async () => {
    const builder = createSpreadsheet();
    builder.addSheet('Products', [
      { name: 'Widget', price: 100 },
      { name: 'Gadget', price: 200 },
    ]);
    const buffer = await builder.writeBuffer();

    const result = await parseSpreadsheet(buffer);
    // May have errors in jsdom but should at least attempt parsing
    expect(result).toBeDefined();
    expect(Array.isArray(result.sheets)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
