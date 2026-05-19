// CSV export tests (S42 / Phase 2C).

import { describe, it, expect } from 'vitest';
import { ScheduleSchema, type ScheduleData, type ScheduleRow } from '@pryzm/plugin-sdk';
import { scheduleToCSV } from '../src/export/csv.js';

function mkSchedule(overrides: Partial<ScheduleData> = {}): ScheduleData {
  return ScheduleSchema.parse({
    id: 's1',
    name: 'Door Schedule',
    elementType: 'door',
    columns: [
      { id: 'type',   header: 'Type',         formula: 'type',          type: 'string', widthMm: 30 },
      { id: 'width',  header: 'Width',        formula: 'width',         type: 'number', widthMm: 20, unit: 'mm' },
      { id: 'rating', header: 'Fire Rating',  formula: 'fireRating',    type: 'string', widthMm: 25 },
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
    { elementId: 'd3', cells: { type: 'WD03', width: 800, rating: '#ERR' } },
  ];
}

describe('scheduleToCSV — output structure', () => {
  it('emits a header row + body rows separated by CRLF by default', () => {
    const csv = scheduleToCSV(mkSchedule(), mkRows());
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Type,Width (mm),Fire Rating');
    expect(lines[1]).toBe('WD01,900,60min');
    expect(lines[2]).toBe('WD02,1200,');
    expect(lines[3]).toBe('WD03,800,#ERR');
  });

  it('honours a custom lineEnd', () => {
    const csv = scheduleToCSV(mkSchedule(), mkRows(), { lineEnd: '\n' });
    expect(csv.split('\n')).toHaveLength(4);
    expect(csv.includes('\r')).toBe(false);
  });

  it('emits the BOM when bom=true', () => {
    const csv = scheduleToCSV(mkSchedule(), [], { bom: true });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('emits header-only when there are no rows', () => {
    const csv = scheduleToCSV(mkSchedule(), [], { lineEnd: '\n' });
    expect(csv).toBe('Type,Width (mm),Fire Rating');
  });
});

describe('scheduleToCSV — RFC-4180 escaping', () => {
  const sched = mkSchedule({
    columns: [
      { id: 'a', header: 'A', formula: '', type: 'string', widthMm: 20 },
      { id: 'b', header: 'B', formula: '', type: 'string', widthMm: 20 },
    ],
  });

  it('quotes cells containing commas', () => {
    const csv = scheduleToCSV(sched, [
      { elementId: 'x', cells: { a: 'one, two', b: 'plain' } },
    ], { lineEnd: '\n' });
    expect(csv.split('\n')[1]).toBe('"one, two",plain');
  });

  it('quotes cells containing double quotes and doubles them', () => {
    const csv = scheduleToCSV(sched, [
      { elementId: 'x', cells: { a: 'hello "world"', b: 'plain' } },
    ], { lineEnd: '\n' });
    expect(csv.split('\n')[1]).toBe('"hello ""world""",plain');
  });

  it('quotes cells containing newlines (CR or LF)', () => {
    const csv = scheduleToCSV(sched, [
      { elementId: 'x', cells: { a: 'line1\nline2', b: 'crlf\r\nhere' } },
    ], { lineEnd: '\n' });
    const body = csv.split('\n').slice(1).join('\n'); // join back since cell has \n
    expect(body.startsWith('"line1\nline2"')).toBe(true);
    expect(body.includes('"crlf\r\nhere"')).toBe(true);
  });

  it('does NOT quote plain alphanumerics', () => {
    const csv = scheduleToCSV(sched, [
      { elementId: 'x', cells: { a: 'PlainText', b: '123.45' } },
    ], { lineEnd: '\n' });
    expect(csv.split('\n')[1]).toBe('PlainText,123.45');
  });
});

describe('scheduleToCSV — value coercion', () => {
  const sched = mkSchedule({
    columns: [
      { id: 'n',   header: 'Number', formula: '', type: 'number',  widthMm: 20 },
      { id: 'b',   header: 'Bool',   formula: '', type: 'boolean', widthMm: 20 },
      { id: 's',   header: 'Str',    formula: '', type: 'string',  widthMm: 20 },
    ],
  });

  it('null/undefined → empty string', () => {
    const csv = scheduleToCSV(sched, [
      { elementId: 'x', cells: { n: null, b: null, s: null } },
    ], { lineEnd: '\n' });
    expect(csv.split('\n')[1]).toBe(',,');
  });

  it('true/false → "true" / "false"', () => {
    const csv = scheduleToCSV(sched, [
      { elementId: 'x', cells: { n: 0, b: true, s: '' } },
      { elementId: 'y', cells: { n: 0, b: false, s: '' } },
    ], { lineEnd: '\n' });
    expect(csv.split('\n')[1]).toBe('0,true,');
    expect(csv.split('\n')[2]).toBe('0,false,');
  });

  it('Infinity / NaN → "Infinity" / "NaN"', () => {
    const csv = scheduleToCSV(sched, [
      { elementId: 'x', cells: { n: Infinity, b: false, s: '' } },
      { elementId: 'y', cells: { n: -Infinity, b: false, s: '' } },
      { elementId: 'z', cells: { n: NaN, b: false, s: '' } },
    ], { lineEnd: '\n' });
    const lines = csv.split('\n');
    expect(lines[1]).toBe('Infinity,false,');
    expect(lines[2]).toBe('-Infinity,false,');
    expect(lines[3]).toBe('NaN,false,');
  });
});

describe('scheduleToCSV — groupBy synthesises __count column', () => {
  it('appends a __count cell when groupBy is set', () => {
    const sched = mkSchedule({ groupBy: 'type' });
    const csv = scheduleToCSV(sched, [
      { elementId: 'd1', cells: { type: 'WD01', width: 900, rating: '60min' }, groupSize: 4 },
      { elementId: 'd2', cells: { type: 'WD02', width: 1200, rating: null }, groupSize: 2 },
    ], { lineEnd: '\n' });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Type,Width (mm),Fire Rating,__count');
    expect(lines[1]).toBe('WD01,900,60min,4');
    expect(lines[2]).toBe('WD02,1200,,2');
  });

  it('omits __count when emitGroupCount=false', () => {
    const sched = mkSchedule({ groupBy: 'type' });
    const csv = scheduleToCSV(sched, [
      { elementId: 'd1', cells: { type: 'WD01', width: 900, rating: '60min' }, groupSize: 4 },
    ], { lineEnd: '\n', emitGroupCount: false });
    expect(csv.split('\n')[0]).toBe('Type,Width (mm),Fire Rating');
  });

  it('does not append __count when there is no groupBy', () => {
    const csv = scheduleToCSV(mkSchedule(), mkRows(), { lineEnd: '\n' });
    expect(csv.split('\n')[0]).toBe('Type,Width (mm),Fire Rating');
  });
});

describe('scheduleToCSV — header row formats unit suffix', () => {
  it('omits the unit suffix when the column has no unit', () => {
    const csv = scheduleToCSV(mkSchedule(), [], { lineEnd: '\n' });
    expect(csv).toBe('Type,Width (mm),Fire Rating');
  });
});
