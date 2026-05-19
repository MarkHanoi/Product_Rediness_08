// CSV import for schedules (S42 / Phase 2C).
//
// Spec source: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S42
// "CSV Round-Trip Import" (lines 945-975).  The 2C exit-criterion
// requires "CSV export → modify in Excel → re-import preserves all
// non-computed fields" (line 1023).
//
// SCOPE (S42)
// ─────────────────────────────────────────────────────────────────────────────
// This pass produces a FieldUpdateBatch — a list of
// `{ elementId, columnId, importedValue }` triples that the editor
// applies as element-store mutations through ordinary handlers
// (`element.setProperty`).  We do NOT mutate any store from inside
// the importer; that's the editor host's responsibility (so the same
// batch is replayable inside the bake worker for headless re-imports).
//
// SECURITY (ADR-0033 §C)
// ─────────────────────────────────────────────────────────────────────────────
// CSV cells beginning with one of `=`, `+`, `-`, `@`, `\t`, `\r` are
// FORMULA-INJECTION vectors when the file is later opened in Excel.
// We DO NOT strip them on import (the user's file is the user's file),
// but the EXPORTER prefixes them with a single tick (`'`) when the
// caller asks for `excelSafe: true`.  See `csv.ts` for that knob.
// On import, we treat them as plain strings — never as formulas.

import type { ScheduleData } from '@pryzm/plugin-sdk';
import { withScheduleSpan } from '../tracing.js';

export interface CsvImportRow {
  /** Row index in the input (1-based, post-header). */
  readonly rowIndex: number;
  /** Original raw cells, header-keyed.  Cells that didn't map to any
   *  schedule column are dropped (they cannot be applied). */
  readonly cells: Readonly<Record<string, string>>;
}

export interface CsvImportError {
  readonly rowIndex: number;
  readonly message: string;
}

export interface CsvImportResult {
  /** Successfully parsed rows (possibly empty). */
  readonly rows: readonly CsvImportRow[];
  /** Per-row errors (a row appears in EITHER `rows` OR `errors`,
   *  never both). */
  readonly errors: readonly CsvImportError[];
  /** Header columns in the input file, in source order. */
  readonly headers: readonly string[];
  /** Headers that mapped to a schedule column (`headerName` →
   *  `columnId`). */
  readonly headerMap: Readonly<Record<string, string>>;
  /** Headers in the input that DID NOT match any schedule column. */
  readonly unmatchedHeaders: readonly string[];
}

export interface CsvImportOptions {
  /** When true, headers are matched header-text-only after stripping
   *  any trailing `(unit)` suffix.  Default `true`. */
  readonly stripUnitSuffix?: boolean;
  /** Strip leading/trailing whitespace from every cell.  Default `true`. */
  readonly trim?: boolean;
}

const UNIT_SUFFIX = /\s*\([^()]*\)\s*$/;

/** RFC-4180-compliant single-row tokenizer.  Handles embedded commas,
 *  CRLF, and `""` escapes.  Returns the cells of the row that begins
 *  at `cursor`, plus the offset of the next row's first byte. */
function parseCsvRow(text: string, cursor: number): { cells: string[]; next: number } {
  const cells: string[] = [];
  let i = cursor;
  let cell = '';
  let inQuotes = false;
  const len = text.length;
  while (i < len) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    // Not in quotes.
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      cells.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // CRLF or bare CR — terminate row, swallow LF.
      cells.push(cell);
      i += 1;
      if (i < len && text[i] === '\n') i += 1;
      return { cells, next: i };
    }
    if (ch === '\n') {
      cells.push(cell);
      i += 1;
      return { cells, next: i };
    }
    cell += ch;
    i += 1;
  }
  // EOF.
  cells.push(cell);
  return { cells, next: i };
}

function* iterRows(text: string): Generator<string[]> {
  let cursor = 0;
  // BOM strip.
  if (text.charCodeAt(0) === 0xfeff) cursor = 1;
  const len = text.length;
  while (cursor < len) {
    const { cells, next } = parseCsvRow(text, cursor);
    cursor = next;
    // Drop trailing empty row from a trailing line-end.
    if (cells.length === 1 && cells[0] === '' && cursor >= len) return;
    yield cells;
  }
}

function buildHeaderMap(
  headers: readonly string[],
  schedule: ScheduleData,
  stripUnitSuffix: boolean,
): { headerMap: Record<string, string>; unmatched: string[] } {
  const headerMap: Record<string, string> = {};
  const unmatched: string[] = [];
  // Build column lookup: header name → column id.  Both the canonical
  // header AND the `header (unit)` form must match for round-trip.
  const lookup = new Map<string, string>();
  for (const col of schedule.columns) {
    lookup.set(col.header, col.id);
    if (col.unit) lookup.set(`${col.header} (${col.unit})`, col.id);
  }
  for (const h of headers) {
    const direct = lookup.get(h);
    if (direct !== undefined) {
      headerMap[h] = direct;
      continue;
    }
    if (stripUnitSuffix) {
      const stripped = h.replace(UNIT_SUFFIX, '');
      const m = lookup.get(stripped);
      if (m !== undefined) {
        headerMap[h] = m;
        continue;
      }
    }
    unmatched.push(h);
  }
  return { headerMap, unmatched };
}

/** Parse a CSV document into per-row, header-keyed cell maps.  Pure;
 *  does not mutate any store.  The editor host applies the result via
 *  ordinary `element.setProperty` commands. */
export function csvToScheduleRows(
  csvText: string,
  schedule: ScheduleData,
  options: CsvImportOptions = {},
): CsvImportResult {
  return withScheduleSpan(
    'pryzm.schedule.import.csv',
    () => csvToScheduleRowsInner(csvText, schedule, options),
    { scheduleId: schedule.id, byteLength: csvText.length },
  );
}

function csvToScheduleRowsInner(
  csvText: string,
  schedule: ScheduleData,
  options: CsvImportOptions,
): CsvImportResult {
  const stripUnitSuffix = options.stripUnitSuffix !== false;
  const trim = options.trim !== false;

  const it = iterRows(csvText);
  const headerRow = it.next();
  if (headerRow.done) {
    return {
      rows: [], errors: [{ rowIndex: 0, message: 'CSV is empty' }],
      headers: [], headerMap: {}, unmatchedHeaders: [],
    };
  }
  const rawHeaders = headerRow.value.map((h) => (trim ? h.trim() : h));
  // Empty trailing headers (Excel sometimes appends a stray comma) are dropped.
  while (rawHeaders.length > 0 && rawHeaders[rawHeaders.length - 1] === '') {
    rawHeaders.pop();
  }
  const headers = rawHeaders;
  const { headerMap, unmatched } = buildHeaderMap(headers, schedule, stripUnitSuffix);

  const rows: CsvImportRow[] = [];
  const errors: CsvImportError[] = [];
  let rowIndex = 0;
  for (const cells of it) {
    rowIndex += 1;
    // Skip pure-empty rows (a trailing line-end sometimes produces one).
    const isAllEmpty = cells.every((c) => (trim ? c.trim() : c) === '');
    if (isAllEmpty) continue;
    if (cells.length > headers.length + 16) {
      errors.push({ rowIndex, message: `row has ${cells.length} cells, header has ${headers.length}` });
      continue;
    }
    const map: Record<string, string> = {};
    let hadAnyMapped = false;
    for (let i = 0; i < headers.length; i += 1) {
      const h = headers[i]!;
      const colId = headerMap[h];
      if (colId === undefined) continue;
      const v = cells[i] ?? '';
      map[colId] = trim ? v.trim() : v;
      hadAnyMapped = true;
    }
    if (!hadAnyMapped) {
      errors.push({ rowIndex, message: 'no cells mapped to schedule columns' });
      continue;
    }
    rows.push({ rowIndex, cells: map });
  }
  return { rows, errors, headers, headerMap, unmatchedHeaders: unmatched };
}
