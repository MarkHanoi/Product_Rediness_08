// XLSX export for schedules (S42 / Phase 2C).
//
// Spec source: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S42
// "XLSX export uses exceljs (pure JS library, no native bindings,
// Node + browser compatible)" (lines 977-1009).
//
// DEPENDENCY: `exceljs` (root `package.json`).  Pure JS, no Cairo /
// libvips, no native compilation; runs identically in Node and the
// browser (bundled via Vite).  Performance budget: 500-row schedule
// in < 500 ms (S42 bench gate).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Async — `Workbook.xlsx.writeBuffer()` is async.
// • Returns `Uint8Array` so the caller can `Blob`-wrap (browser) or
//   `Buffer.from`-wrap (Node) without an extra copy.
// • Bold + light-grey header row (per spec line 991-992).
// • Auto-fit column widths (clamped 10..40) per spec line 1000-1003.
// • Formula-injection guard (ADR-0033 §C): cells beginning with one
//   of `= + - @ \t \r` are prefixed with a single tick when the
//   caller passes `excelSafe: true`.  Default `false` to preserve
//   round-trip fidelity with the matching CSV import (which strips no
//   prefix).
// • One worksheet per call.  Multi-schedule exports use
//   `schedulesToXLSX` which reuses the same workbook.

import ExcelJS from 'exceljs';
import type { ScheduleData, ScheduleRow } from '@pryzm/plugin-sdk';
import { withScheduleSpan } from '../tracing.js';

export interface XlsxExportOptions {
  /** Workbook author (PDF metadata).  Default `'PRYZM 2'`. */
  readonly author?: string;
  /** When true, prefix cells starting with `= + - @ \t \r` with `'` so
   *  Excel never interprets them as formulas.  Default `false`. */
  readonly excelSafe?: boolean;
  /** Worksheet name override (defaults to schedule.name truncated to
   *  31 chars — Excel's hard limit). */
  readonly sheetName?: string;
}

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const SHEET_NAME_MAX = 31;
const SHEET_NAME_FORBIDDEN = /[\\/*?[\]:]/g;

function safeSheetName(raw: string): string {
  const cleaned = raw.replace(SHEET_NAME_FORBIDDEN, '_').slice(0, SHEET_NAME_MAX);
  return cleaned || 'Schedule';
}

function cellValue(v: unknown, excelSafe: boolean): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  const s = typeof v === 'string' ? v : String(v);
  if (excelSafe && FORMULA_TRIGGER.test(s)) return `'${s}`;
  return s;
}

function buildHeaderText(c: { header: string; unit?: string }): string {
  return c.unit ? `${c.header} (${c.unit})` : c.header;
}

function fitColumnWidths(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((col) => {
    let max = 10;
    if (col.eachCell) {
      col.eachCell((cell) => {
        const len = String(cell.value ?? '').length;
        if (len + 2 > max) max = len + 2;
      });
    }
    col.width = Math.min(max, 40);
  });
}

function writeScheduleSheet(
  workbook: ExcelJS.Workbook,
  schedule: ScheduleData,
  rows: readonly ScheduleRow[],
  options: XlsxExportOptions,
): void {
  const safe = options.excelSafe === true;
  const sheet = workbook.addWorksheet(options.sheetName ?? safeSheetName(schedule.name));

  const header = sheet.addRow(schedule.columns.map(buildHeaderText));
  header.font = { bold: true };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD0D0D0' },
  };

  for (const row of rows) {
    sheet.addRow(schedule.columns.map((c) => cellValue(row.cells[c.id], safe)));
  }

  fitColumnWidths(sheet);
}

/** Serialise one schedule to an XLSX workbook (`.xlsx` byte stream). */
export async function scheduleToXLSX(
  schedule: ScheduleData,
  rows: readonly ScheduleRow[],
  options: XlsxExportOptions = {},
): Promise<Uint8Array> {
  return withScheduleSpan(
    'pryzm.schedule.export.xlsx',
    async () => {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = options.author ?? 'PRYZM 2';
      workbook.created = new Date();
      writeScheduleSheet(workbook, schedule, rows, options);
      const buffer = await workbook.xlsx.writeBuffer();
      return new Uint8Array(buffer as ArrayBuffer);
    },
    { scheduleId: schedule.id, rowCount: rows.length },
  ) as Promise<Uint8Array>;
}

/** Serialise N schedules into a single workbook (one tab per
 *  schedule).  Used by the editor's "Export All Schedules" action. */
export async function schedulesToXLSX(
  schedules: ReadonlyArray<{ schedule: ScheduleData; rows: readonly ScheduleRow[] }>,
  options: XlsxExportOptions = {},
): Promise<Uint8Array> {
  return withScheduleSpan(
    'pryzm.schedule.export.xlsx',
    async () => {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = options.author ?? 'PRYZM 2';
      workbook.created = new Date();
      for (const { schedule, rows } of schedules) {
        writeScheduleSheet(workbook, schedule, rows, { ...options, sheetName: undefined });
      }
      const buffer = await workbook.xlsx.writeBuffer();
      return new Uint8Array(buffer as ArrayBuffer);
    },
    { scheduleCount: schedules.length },
  ) as Promise<Uint8Array>;
}
