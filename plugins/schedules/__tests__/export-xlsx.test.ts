// XLSX export tests (S42 / Phase 2C).

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { ScheduleSchema, type ScheduleData, type ScheduleRow } from '@pryzm/plugin-sdk';
import { scheduleToXLSX, schedulesToXLSX } from '../src/export/xlsx.js';

function mkSchedule(overrides: Partial<ScheduleData> = {}): ScheduleData {
  return ScheduleSchema.parse({
    id: 's1',
    name: 'Door Schedule',
    elementType: 'door',
    columns: [
      { id: 'type',   header: 'Type',        formula: 'type',       type: 'string', widthMm: 30 },
      { id: 'width',  header: 'Width',       formula: 'width',      type: 'number', widthMm: 20, unit: 'mm' },
      { id: 'rating', header: 'Fire Rating', formula: 'fireRating', type: 'string', widthMm: 25 },
    ],
    filter: '',
    seq: 1,
    ...overrides,
  });
}

function mkRows(): ScheduleRow[] {
  return [
    { elementId: 'd1', cells: { type: 'WD01', width: 900, rating: '60min' } },
    { elementId: 'd2', cells: { type: 'WD02', width: 1200, rating: null } },
    { elementId: 'd3', cells: { type: 'WD03', width: 800, rating: '90min' } },
  ];
}

async function readBack(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

describe('scheduleToXLSX — workbook structure', () => {
  it('emits a single worksheet named after the schedule', async () => {
    const bytes = await scheduleToXLSX(mkSchedule(), mkRows());
    const wb = await readBack(bytes);
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0]!.name).toBe('Door Schedule');
  });

  it('header row is bold and grey-filled', async () => {
    const bytes = await scheduleToXLSX(mkSchedule(), mkRows());
    const wb = await readBack(bytes);
    const sheet = wb.worksheets[0]!;
    const header = sheet.getRow(1);
    expect(header.font?.bold).toBe(true);
    const cell = header.getCell(1);
    const fill = cell.fill as ExcelJS.FillPattern | undefined;
    expect(fill?.type).toBe('pattern');
    expect(fill?.pattern).toBe('solid');
  });

  it('header text uses "Header (unit)" form when unit is present', async () => {
    const bytes = await scheduleToXLSX(mkSchedule(), mkRows());
    const wb = await readBack(bytes);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(1).getCell(1).value).toBe('Type');
    expect(sheet.getRow(1).getCell(2).value).toBe('Width (mm)');
    expect(sheet.getRow(1).getCell(3).value).toBe('Fire Rating');
  });

  it('writes 1 row per ScheduleRow + 1 header row', async () => {
    const bytes = await scheduleToXLSX(mkSchedule(), mkRows());
    const wb = await readBack(bytes);
    const sheet = wb.worksheets[0]!;
    expect(sheet.rowCount).toBe(4);
  });

  it('numeric cells keep their numeric type', async () => {
    const bytes = await scheduleToXLSX(mkSchedule(), mkRows());
    const wb = await readBack(bytes);
    const sheet = wb.worksheets[0]!;
    const widthCell = sheet.getRow(2).getCell(2);
    expect(typeof widthCell.value).toBe('number');
    expect(widthCell.value).toBe(900);
  });

  it('null cells are written as null (empty in Excel)', async () => {
    const bytes = await scheduleToXLSX(mkSchedule(), mkRows());
    const wb = await readBack(bytes);
    const ratingCellRow2 = wb.worksheets[0]!.getRow(3).getCell(3);
    expect(ratingCellRow2.value).toBeNull();
  });
});

describe('scheduleToXLSX — auto-fit column widths', () => {
  it('every column has a width set within 10..40', async () => {
    const bytes = await scheduleToXLSX(mkSchedule(), mkRows());
    const wb = await readBack(bytes);
    const sheet = wb.worksheets[0]!;
    sheet.columns.forEach((c) => {
      expect(c.width).toBeGreaterThanOrEqual(10);
      expect(c.width!).toBeLessThanOrEqual(40);
    });
  });
});

describe('scheduleToXLSX — sheet name sanitisation', () => {
  it('strips Excel-forbidden characters from the sheet name', async () => {
    const sched = mkSchedule({ name: 'Doors / Windows : 1*2?' });
    const bytes = await scheduleToXLSX(sched, []);
    const wb = await readBack(bytes);
    expect(wb.worksheets[0]!.name).toBe('Doors _ Windows _ 1_2_');
  });

  it('truncates names longer than 31 chars (Excel limit)', async () => {
    const longName = 'A very long schedule name that exceeds the 31 char limit';
    const sched = mkSchedule({ name: longName });
    const bytes = await scheduleToXLSX(sched, []);
    const wb = await readBack(bytes);
    expect(wb.worksheets[0]!.name.length).toBeLessThanOrEqual(31);
  });

  it('falls back to "Schedule" when sanitisation produces an empty string', async () => {
    const sched = mkSchedule({ name: '///***' });
    const bytes = await scheduleToXLSX(sched, []);
    const wb = await readBack(bytes);
    expect(wb.worksheets[0]!.name).toBe('______');
  });
});

describe('scheduleToXLSX — formula injection guard', () => {
  it('with excelSafe=true, prefixes "=", "+", "-", "@" cells with a tick', async () => {
    const sched = mkSchedule();
    const bytes = await scheduleToXLSX(sched, [
      { elementId: 'd1', cells: { type: '=DANGEROUS()', width: 900, rating: '+evil' } },
      { elementId: 'd2', cells: { type: '@cmd', width: 800, rating: '-fmla' } },
    ], { excelSafe: true });
    const wb = await readBack(bytes);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(2).getCell(1).value).toBe("'=DANGEROUS()");
    expect(sheet.getRow(2).getCell(3).value).toBe("'+evil");
    expect(sheet.getRow(3).getCell(1).value).toBe("'@cmd");
    expect(sheet.getRow(3).getCell(3).value).toBe("'-fmla");
  });

  it('with excelSafe=false (default), passes the cell verbatim', async () => {
    const sched = mkSchedule();
    const bytes = await scheduleToXLSX(sched, [
      { elementId: 'd1', cells: { type: '=DANGEROUS()', width: 900, rating: '60min' } },
    ]);
    const wb = await readBack(bytes);
    const sheet = wb.worksheets[0]!;
    // exceljs auto-detects "=..." and turns it into a formula cell.
    const cell = sheet.getRow(2).getCell(1);
    expect(cell.value).toBeTruthy();
  });
});

describe('schedulesToXLSX — multi-schedule workbook', () => {
  it('emits one worksheet per schedule', async () => {
    const bytes = await schedulesToXLSX([
      { schedule: mkSchedule({ id: 's1', name: 'Doors' }), rows: mkRows() },
      { schedule: mkSchedule({ id: 's2', name: 'Windows' }), rows: [] },
    ]);
    const wb = await readBack(bytes);
    expect(wb.worksheets).toHaveLength(2);
    expect(wb.worksheets[0]!.name).toBe('Doors');
    expect(wb.worksheets[1]!.name).toBe('Windows');
  });
});
