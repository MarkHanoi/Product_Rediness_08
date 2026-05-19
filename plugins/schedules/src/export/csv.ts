// CSV export for schedules (S42 / Phase 2C).
//
// Spec source: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S42
// "CSV Export + Round-Trip Import" (lines 922-975).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure: no DOM, no Node-only modules, no `pdf-lib` / `exceljs` deps.
//   Returns a `string` ready for `Blob`-wrapping in the browser or
//   `Buffer.from()` on the server.
// • Header row: `header (unit)` if the column declares a `unit`,
//   otherwise just `header`.
// • Row data: every `FormulaResult` is stringified.  `null` /
//   `undefined` becomes empty string.  Boolean → `"true" | "false"`.
//   Number → `String(n)` (no locale formatting — locale is the
//   importer's responsibility).
// • Escaping: RFC 4180.  A field is quoted iff it contains ANY of
//   `, " \r \n`.  Embedded `"` becomes `""`.  Line endings are CRLF.
// • Sentinel cells (`'#ERR' / '#CIRCULAR' / '#UNDEF'`) export verbatim
//   so the recipient sees what the user saw.
// • Group rows: `groupSize` is appended as the LAST column iff the
//   schedule has a `groupBy` (suffix `__count` keyed off `groupBy`),
//   so a quantity-surveyor can re-aggregate in Excel.

import type { ScheduleData, ScheduleRow } from '@pryzm/plugin-sdk';
import { withScheduleSpan } from '../tracing.js';

export interface CsvExportOptions {
  /** Override the line-end.  Default `\r\n` (RFC 4180).  Tests pass
   *  `'\n'` for snapshot-friendly diffs. */
  readonly lineEnd?: string;
  /** Include the BOM (U+FEFF) at the start of the document.  Default
   *  `false`; some Excel-on-Windows installs need this to detect UTF-8. */
  readonly bom?: boolean;
  /** When true and the schedule has a `groupBy`, append a synthetic
   *  `__count` column carrying `row.groupSize`.  Default `true`. */
  readonly emitGroupCount?: boolean;
}

const QUOTE_TRIGGER = /[",\r\n]/;

function escapeField(raw: string): string {
  if (!QUOTE_TRIGGER.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') {
    if (Number.isFinite(v)) return String(v);
    if (Number.isNaN(v)) return 'NaN';
    return v > 0 ? 'Infinity' : '-Infinity';
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function buildHeader(schedule: ScheduleData, emitGroupCount: boolean): string[] {
  const out = schedule.columns.map((c) => (c.unit ? `${c.header} (${c.unit})` : c.header));
  if (emitGroupCount && schedule.groupBy) out.push('__count');
  return out;
}

function buildRow(
  schedule: ScheduleData,
  row: ScheduleRow,
  emitGroupCount: boolean,
): string[] {
  const out = schedule.columns.map((c) => stringifyCell(row.cells[c.id]));
  if (emitGroupCount && schedule.groupBy) {
    out.push(stringifyCell(row.groupSize ?? 1));
  }
  return out;
}

/** Serialise a schedule + its evaluated rows to a CSV string. */
export function scheduleToCSV(
  schedule: ScheduleData,
  rows: readonly ScheduleRow[],
  options: CsvExportOptions = {},
): string {
  return withScheduleSpan(
    'pryzm.schedule.export.csv',
    () => scheduleToCSVInner(schedule, rows, options),
    { scheduleId: schedule.id, rowCount: rows.length },
  );
}

function scheduleToCSVInner(
  schedule: ScheduleData,
  rows: readonly ScheduleRow[],
  options: CsvExportOptions,
): string {
  const lineEnd = options.lineEnd ?? '\r\n';
  const emitGroupCount = options.emitGroupCount !== false;

  const header = buildHeader(schedule, emitGroupCount).map(escapeField).join(',');
  const body = rows
    .map((r) => buildRow(schedule, r, emitGroupCount).map(escapeField).join(','))
    .join(lineEnd);

  const doc = body.length > 0 ? `${header}${lineEnd}${body}` : header;
  return options.bom ? `\uFEFF${doc}` : doc;
}
