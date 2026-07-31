/**
 * PricePilot - Spreadsheet Adapter
 *
 * A thin adapter that wraps the `exceljs` library so the rest of the
 * application does not need to know about ExcelJS internals. This
 * replaces the previous direct usage of the `xlsx` (SheetJS) package
 * which carried CVE-2024-22363 and other known issues.
 *
 * Public surface:
 *   - parseSpreadsheet(fileBuffer)   → sheets + errors
 *   - parseCsvFile(fileBuffer)       → headers + rows + rawRows
 *   - createSpreadsheet()            → WorkbookBuilder
 *   - downloadSpreadsheet(buffer, filename)
 *
 * The shapes returned by `parseSpreadsheet` match the previous
 * `parseExcelFile` return value so callers do not need to change.
 */

import ExcelJS from 'exceljs';
import type { ImportError } from './types';

// ============================================================
// Types
// ============================================================

/** A single worksheet parsed from a spreadsheet file. */
export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
  /** 2D array of cell values (all rows including header) — used for re-parsing with a different heading row. */
  rawRows: string[][];
}

/** Result of parsing a spreadsheet file. */
export interface ParseSpreadsheetResult {
  sheets: ParsedSheet[];
  errors: ImportError[];
}

/** Result of parsing a CSV file. */
export interface ParseCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
  delimiter: string;
  errors: ImportError[];
}

/**
 * Builder used to construct a multi-sheet workbook and serialise it
 * to an ArrayBuffer. Mirrors a small subset of what callers previously
 * did with `json_to_sheet` + `book_append_sheet` from the removed
 * `xlsx` package.
 */
export interface WorkbookBuilder {
  /**
   * Append a worksheet whose first row is the union of the keys of
   * every row object, and whose subsequent rows are the values.
   */
  addSheet(name: string, rows: Record<string, string | number>[]): WorkbookBuilder;
  /** Serialise the workbook to an ArrayBuffer (xlsx format). */
  writeBuffer(): Promise<ArrayBuffer>;
}

// ============================================================
// Cell value extraction
// ============================================================

/**
 * ExcelJS cells come in several flavours:
 *   - primitive `string | number | Date | null`
 *   - rich-text / hyperlink objects: `{ text: string; hyperlink?: string; ... }`
 *   - formula result objects: `{ result: string | number; ... }`
 *
 * Convert every flavour to a trimmed string.
 */
function cellToString(cell: unknown): string {
  if (cell == null) return '';

  // Hyperlink / rich-text object: prefer `.text`
  if (typeof cell === 'object') {
    if ('text' in cell && cell.text != null) {
      return String((cell as { text: unknown }).text ?? '').trim();
    }
    // Formula result: prefer `.result` if present
    if ('result' in cell && (cell as { result?: unknown }).result != null) {
      const result = (cell as { result?: unknown }).result;
      if (typeof result === 'object' && result !== null && 'text' in result) {
        return String((result as { text?: unknown }).text ?? '').trim();
      }
      return String(result ?? '').trim();
    }
    // Date object
    if (cell instanceof Date) {
      return String(cell).trim();
    }
  }

  return String(cell).trim();
}

// ============================================================
// Reading
// ============================================================

/**
 * Parse an xlsx/xls Excel file and return all worksheets.
 *
 * - Empty workbooks return `{ sheets: [], errors: [...] }` (no throw).
 * - Malformed workbooks are caught and reported in `errors`.
 *
 * The first row of each sheet is treated as the headers.
 */
export async function parseSpreadsheet(fileBuffer: ArrayBuffer): Promise<ParseSpreadsheetResult> {
  const errors: ImportError[] = [];
  const sheets: ParsedSheet[] = [];

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuffer);

    wb.eachSheet((sheet) => {
      const rawRows: string[][] = [];

      sheet.eachRow({ includeEmpty: true }, (row) => {
        // `row.values` is a 1-indexed sparse array; index 0 is undefined.
        const values = row.values as unknown[];
        const stringRow: string[] = [];
        for (let i = 1; i < values.length; i++) {
          stringRow.push(cellToString(values[i]));
        }
        // Trim trailing empty cells so rows don't grow unbounded
        let end = stringRow.length;
        while (end > 0 && stringRow[end - 1] === '') end--;
        rawRows.push(stringRow.slice(0, end));
      });

      if (rawRows.length === 0) return;

      // Use the first row as headers
      const headers = rawRows[0];

      // Build row objects keyed by header
      const rows: Record<string, string>[] = [];
      for (let i = 1; i < rawRows.length; i++) {
        const rawRow = rawRows[i];
        const rowObj: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          rowObj[headers[j]] = j < rawRow.length ? rawRow[j] : '';
        }
        rows.push(rowObj);
      }

      sheets.push({ name: sheet.name, headers, rows, rawRows });
    });

    if (sheets.length === 0) {
      errors.push({
        row: 0,
        column: '',
        value: '',
        message:
          'No data found in the Excel file. The file may be empty or all sheets are blank.',
        severity: 'error',
      });
    }

    return { sheets, errors };
  } catch (error) {
    errors.push({
      row: 0,
      column: '',
      value: '',
      message: `Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'critical',
    });
    return { sheets: [], errors };
  }
}

// ============================================================
// Writing
// ============================================================

/**
 * Create a new WorkbookBuilder backed by ExcelJS.
 *
 * Usage:
 *   const buf = await createSpreadsheet()
 *     .addSheet('Products', rows)
 *     .addSheet('Summary', summaryRows)
 *     .writeBuffer();
 */
export function createSpreadsheet(): WorkbookBuilder {
  const wb = new ExcelJS.Workbook();

  const builder: WorkbookBuilder = {
    addSheet(name, rows) {
      const ws = wb.addWorksheet(name);

      if (rows.length === 0) {
        return builder;
      }

      // Determine the union of keys across every row, preserving
      // the insertion order of the first row that introduces each key.
      const keySet = new Set<string>();
      const keys: string[] = [];
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          if (!keySet.has(key)) {
            keySet.add(key);
            keys.push(key);
          }
        }
      }

      // Header row
      ws.columns = keys.map((key) => ({
        header: key,
        key,
        width: Math.max(key.length + 2, 14),
      }));

      // Data rows
      for (const row of rows) {
        ws.addRow(row);
      }

      return builder;
    },

    async writeBuffer() {
      // ExcelJS declares `Buffer extends ArrayBuffer`, so `writeBuffer`
      // returns an object that satisfies the ArrayBuffer interface. In
      // browser builds the underlying value may be a Uint8Array or a
      // pure ArrayBuffer — normalise to a standalone ArrayBuffer so
      // `new Blob([buffer])` works in every runtime.
      const buffer = (await wb.xlsx.writeBuffer()) as unknown;
      if (buffer instanceof ArrayBuffer) {
        return buffer;
      }
      if (ArrayBuffer.isView(buffer as unknown as ArrayBufferView)) {
        const view = buffer as ArrayBufferView;
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
      }
      // Last-resort fallback: treat as a byte-like iterable
      return buffer as ArrayBuffer;
    },
  };

  return builder;
}

/**
 * Trigger a browser download of an xlsx ArrayBuffer.
 *
 * Safe to call from client-side code only — guard with `typeof window
 * !== 'undefined'` if calling from a context that might be server-rendered.
 */
export function downloadSpreadsheet(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the click has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ============================================================
// CSV parsing (no library needed)
// ============================================================

/**
 * Parse CSV bytes into headers + rows + rawRows.
 *
 * - Auto-detects the delimiter from the first non-empty line (comma,
 *   tab, semicolon, or pipe).
 * - Respects quoted values that may contain the delimiter.
 * - The `rawRows` field is a 2D array of cells (all rows including
 *   header) so callers can re-parse with a different heading row.
 */
export function parseCsvFile(fileBuffer: ArrayBuffer): ParseCsvResult {
  const errors: ImportError[] = [];

  try {
    const text = new TextDecoder('utf-8').decode(fileBuffer);

    // Split into logical lines respecting quoted cells that may
    // contain embedded newlines. A line break inside a quoted cell
    // does NOT end the row.
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '"') {
        // Check for escaped double quote
        if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
          currentLine += '""';
          i++;
        } else {
          inQuotes = !inQuotes;
          currentLine += char;
        }
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        // End of a logical line (but skip \r\n as one break)
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        if (currentLine.trim() !== '') {
          lines.push(currentLine);
        }
        currentLine = '';
      } else {
        currentLine += char;
      }
    }
    // Push the last line if non-empty
    if (currentLine.trim() !== '') {
      lines.push(currentLine);
    }

    if (lines.length < 2) {
      errors.push({
        row: 0,
        column: '',
        value: '',
        message: 'CSV file must have at least a header row and one data row',
        severity: 'error',
      });
      return {
        headers: [],
        rows: [],
        rawRows: lines.map((line) => [line]),
        delimiter: ',',
        errors,
      };
    }

    // Detect delimiter
    const delimiters = [',', '\t', ';', '|'];
    let bestDelimiter = ',';
    let maxColumns = 0;
    for (const delimiter of delimiters) {
      const columns = splitCsvLine(lines[0], delimiter).length;
      if (columns > maxColumns) {
        maxColumns = columns;
        bestDelimiter = delimiter;
      }
    }

    // Parse every line into a cell array
    const rawRows: string[][] = lines.map((line) =>
      splitCsvLine(line, bestDelimiter).map((c) => c.trim()),
    );

    const headers = rawRows[0];
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < rawRows.length; i++) {
      const rawRow = rawRows[i];
      const rowObj: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        rowObj[headers[j]] = j < rawRow.length ? rawRow[j] : '';
      }
      rows.push(rowObj);
    }

    return { headers, rows, rawRows, delimiter: bestDelimiter, errors };
  } catch (error) {
    errors.push({
      row: 0,
      column: '',
      value: '',
      message: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'critical',
    });
    return { headers: [], rows: [], rawRows: [], delimiter: ',', errors };
  }
}

/**
 * Split a CSV line respecting quoted values.
 * Handles values enclosed in double quotes that may contain the delimiter
 * or escaped double-quotes (`""`).
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped double quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ============================================================
// Phase 14 — Spreadsheet Formula Injection Prevention
// ============================================================

/**
 * Characters that, when they appear at the start of a spreadsheet
 * cell value, cause Excel / Google Sheets / LibreOffice Calc to
 * interpret the cell as a FORMULA rather than as plain text.
 *
 * Attackers who can control a cell value can use this to execute
 * arbitrary formulas (e.g. `=HYPERLINK("malicious")`,
 * `+SUM(1,1)`, `@SUM(A1:A2)`). When the spreadsheet is later
 * opened by the owner, the formula executes.
 *
 * The defence is to prefix any such string with a single apostrophe
 * (`'`), which spreadsheet apps treat as a literal-cell marker.
 */
const FORMULA_INJECTION_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Sanitize a single spreadsheet cell value to prevent formula
 * injection.
 *
 * - Strings beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` are
 *   prefixed with a single apostrophe (`'`) so the spreadsheet app
 *   treats them as literal text.
 * - Strings that contain a leading apostrophe already are left
 *   unchanged (idempotent).
 * - Numbers, booleans, null, and undefined are returned as-is.
 *
 * Returns the sanitized value as `string | number`.
 */
export function sanitizeSpreadsheetCell(value: unknown): string | number {
  // Numbers and booleans cannot start a formula — pass through.
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value == null) return '';

  // Convert anything else to string.
  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'object' && value !== null && 'text' in value) {
    str = String((value as { text: unknown }).text ?? '');
  } else {
    str = String(value);
  }

  // Idempotent: if the string already starts with a leading apostrophe
  // (defence already applied), leave it alone.
  if (str.startsWith("'")) return str;

  // Check the first character of the original string (before any
  // whitespace stripping). Tab (\t) and carriage return (\r) are
  // formula-injection vectors when they appear at the very start
  // of a cell, so we must check them BEFORE stripping.
  if (str.length > 0 && FORMULA_INJECTION_PREFIXES.has(str[0])) {
    // Prefix with apostrophe. The spreadsheet app will display the
    // string without the apostrophe but will NOT evaluate it as a
    // formula.
    return `'${str}`;
  }

  // Also check the first non-whitespace character — formulas may
  // be preceded by spaces as an evasion technique.
  const trimmedStart = str.replace(/^[\s]+/, '');
  if (trimmedStart.length > 0 && FORMULA_INJECTION_PREFIXES.has(trimmedStart[0])) {
    return `'${str}`;
  }

  return str;
}

/**
 * Sanitize every string value in a row object (used before writing
 * user-controlled data to a spreadsheet).
 *
 * Returns a new object — does not mutate the input.
 */
export function sanitizeSpreadsheetRow(row: Record<string, unknown>): Record<string, string | number> {
  const sanitized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeSpreadsheetCell(value);
  }
  return sanitized;
}

/**
 * Sanitize every string value in an array of row objects.
 *
 * Returns a new array — does not mutate the input.
 */
export function sanitizeSpreadsheetRows(rows: Array<Record<string, unknown>>): Array<Record<string, string | number>> {
  return rows.map(sanitizeSpreadsheetRow);
}
