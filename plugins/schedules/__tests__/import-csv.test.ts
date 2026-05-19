// CSV import tests (S42 / Phase 2C).

import { describe, it, expect } from 'vitest';
import { ScheduleSchema, type ScheduleData } from '@pryzm/plugin-sdk';
import { csvToScheduleRows } from '../src/import/csv.js';
import { scheduleToCSV } from '../src/export/csv.js';

function mkSchedule(): ScheduleData {
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
  });
}

describe('csvToScheduleRows — basic parsing', () => {
  it('parses a header + N rows', () => {
    const csv = 'Type,Width (mm),Fire Rating\r\nWD01,900,60min\r\nWD02,1200,';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.errors).toHaveLength(0);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]!.cells).toEqual({ type: 'WD01', width: '900', rating: '60min' });
    expect(r.rows[1]!.cells).toEqual({ type: 'WD02', width: '1200', rating: '' });
  });

  it('handles \\n-only line endings', () => {
    const csv = 'Type,Width (mm),Fire Rating\nWD01,900,60min';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.rows).toHaveLength(1);
  });

  it('strips a leading BOM', () => {
    const csv = '\uFEFFType,Width (mm),Fire Rating\nWD01,900,60min';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.headers[0]).toBe('Type');
    expect(r.rows).toHaveLength(1);
  });

  it('drops trailing empty columns from a stray Excel comma', () => {
    const csv = 'Type,Width (mm),Fire Rating,\nWD01,900,60min,';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.headers).toHaveLength(3);
    expect(r.rows).toHaveLength(1);
  });

  it('returns an error for an empty input', () => {
    const r = csvToScheduleRows('', mkSchedule());
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]?.message).toMatch(/empty/i);
  });
});

describe('csvToScheduleRows — RFC-4180 unescaping', () => {
  it('unescapes embedded commas', () => {
    const csv = 'Type,Width (mm),Fire Rating\n"hello, world",900,60min';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.rows[0]!.cells.type).toBe('hello, world');
  });

  it('unescapes embedded double quotes', () => {
    const csv = 'Type,Width (mm),Fire Rating\n"says ""hi""",900,60min';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.rows[0]!.cells.type).toBe('says "hi"');
  });

  it('unescapes embedded newlines', () => {
    const csv = 'Type,Width (mm),Fire Rating\n"line1\nline2",900,60min';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.rows[0]!.cells.type).toBe('line1\nline2');
  });

  it('handles CRLF inside quoted cells', () => {
    const csv = 'Type,Width (mm),Fire Rating\r\n"a\r\nb",900,60min';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.rows[0]!.cells.type).toBe('a\r\nb');
  });
});

describe('csvToScheduleRows — header mapping', () => {
  it('matches headers via the (unit) suffix when present', () => {
    const csv = 'Type,Width (mm),Fire Rating\nWD01,900,60min';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.headerMap).toEqual({
      'Type': 'type',
      'Width (mm)': 'width',
      'Fire Rating': 'rating',
    });
    expect(r.unmatchedHeaders).toHaveLength(0);
  });

  it('matches headers without the (unit) suffix when stripUnitSuffix=true', () => {
    const csv = 'Type,Width,Fire Rating\nWD01,900,60min';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.headerMap.Width).toBe('width');
  });

  it('reports unmatched headers separately', () => {
    const csv = 'Type,Width (mm),Cost\nWD01,900,$300';
    const r = csvToScheduleRows(csv, mkSchedule());
    expect(r.unmatchedHeaders).toEqual(['Cost']);
    expect(r.rows[0]!.cells).not.toHaveProperty('Cost');
  });

  it('errors when a row has no cells mapping to any column', () => {
    const sched = mkSchedule();
    const csv = 'Cost,Vendor\n$300,Acme';
    const r = csvToScheduleRows(csv, sched);
    expect(r.errors[0]?.message).toMatch(/no cells mapped/);
  });
});

describe('csvToScheduleRows — round-trip with scheduleToCSV', () => {
  it('export → import round-trip preserves all non-computed string fields', () => {
    const sched = mkSchedule();
    const original = [
      { elementId: 'd1', cells: { type: 'WD01', width: 900, rating: '60min' } },
      { elementId: 'd2', cells: { type: 'WD02', width: 1200, rating: null } },
    ];
    const csv = scheduleToCSV(sched, original);
    const reimport = csvToScheduleRows(csv, sched);
    expect(reimport.errors).toHaveLength(0);
    expect(reimport.rows).toHaveLength(2);
    expect(reimport.rows[0]!.cells).toEqual({ type: 'WD01', width: '900', rating: '60min' });
    expect(reimport.rows[1]!.cells).toEqual({ type: 'WD02', width: '1200', rating: '' });
  });

  it('survives an Excel-style edit cycle (commas + quotes added by user)', () => {
    const sched = mkSchedule();
    const original = [
      { elementId: 'd1', cells: { type: 'WD01', width: 900, rating: 'Fire-rated, 60min' } },
      { elementId: 'd2', cells: { type: 'Door "Special"', width: 1200, rating: '90min' } },
    ];
    const csv = scheduleToCSV(sched, original);
    const reimport = csvToScheduleRows(csv, sched);
    expect(reimport.rows[0]!.cells.rating).toBe('Fire-rated, 60min');
    expect(reimport.rows[1]!.cells.type).toBe('Door "Special"');
  });
});

describe('csvToScheduleRows — CI exit gate (round-trip lossless)', () => {
  it('the 2C exit-criterion gate (line 1023): non-computed fields preserved', () => {
    const sched = mkSchedule();
    const cells = [
      { type: 'WD01', width: 900, rating: '60min' },
      { type: 'WD02', width: 1200, rating: '' },
      { type: 'WD03', width: 800, rating: 'special, with comma' },
      { type: 'WD04', width: 1500, rating: 'with "quotes"' },
    ];
    const original = cells.map((c, i) => ({ elementId: `d${i + 1}`, cells: c }));
    const csv = scheduleToCSV(sched, original);
    const reimport = csvToScheduleRows(csv, sched);
    expect(reimport.errors).toHaveLength(0);
    expect(reimport.rows).toHaveLength(4);
    for (let i = 0; i < cells.length; i += 1) {
      expect(reimport.rows[i]!.cells.type).toBe(cells[i]!.type);
      expect(reimport.rows[i]!.cells.width).toBe(String(cells[i]!.width));
      expect(reimport.rows[i]!.cells.rating).toBe(cells[i]!.rating);
    }
  });
});
