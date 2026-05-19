// PDF export tests (S42 / Phase 2C).

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { ScheduleSchema, type ScheduleData, type ScheduleRow } from '@pryzm/plugin-sdk';
import { scheduleToPDF } from '../src/export/pdf.js';

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

function mkRows(n: number): ScheduleRow[] {
  return Array.from({ length: n }, (_, i) => ({
    elementId: `d${i + 1}`,
    cells: { type: `WD${String(i + 1).padStart(3, '0')}`, width: 900 + i, rating: i % 2 ? '60min' : null },
  }));
}

const PDF_MAGIC = Uint8Array.from([0x25, 0x50, 0x44, 0x46]); // "%PDF"

describe('scheduleToPDF — output structure', () => {
  it('emits a valid PDF byte stream beginning with %PDF', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(5));
    expect(bytes.byteLength).toBeGreaterThan(100);
    for (let i = 0; i < PDF_MAGIC.length; i += 1) {
      expect(bytes[i]).toBe(PDF_MAGIC[i]);
    }
  });

  it('PDF parses back via pdf-lib', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(10));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });

  it('sets PDF metadata (title, author, creator)', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(2), { title: 'My Door Schedule' });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe('My Door Schedule');
    expect(pdf.getAuthor()).toBe('PRYZM 2');
    expect(pdf.getCreator()).toContain('S42');
  });
});

describe('scheduleToPDF — page layout', () => {
  it('produces a single page for a small schedule', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(5));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('produces multiple pages for a 500-row schedule', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(500));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it('honours paper=A4, orientation=portrait', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(2), {
      paper: 'A4',
      orientation: 'portrait',
    });
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();
    expect(width).toBeCloseTo(595.28, 0);
    expect(height).toBeCloseTo(841.89, 0);
  });

  it('honours paper=A3, orientation=landscape (default)', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(2), { paper: 'A3' });
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(1190.55, 0);
    expect(height).toBeCloseTo(841.89, 0);
  });

  it('emits 1 page with a "(no rows)" placeholder when there are no rows', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), []);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });
});

describe('scheduleToPDF — performance (CI bench gate)', () => {
  it('500-row schedule exports in < 10 s (S42 bench gate)', async () => {
    const t0 = performance.now();
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(500));
    const dt = performance.now() - t0;
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(dt).toBeLessThan(10_000);
  });
});

describe('scheduleToPDF — robustness', () => {
  it('truncates oversized cells without crashing', async () => {
    const longText = 'X'.repeat(2000);
    const bytes = await scheduleToPDF(mkSchedule(), [
      { elementId: 'd1', cells: { type: longText, width: 900, rating: longText } },
    ]);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });

  it('handles sentinel cells (#ERR / #CIRCULAR / #UNDEF) verbatim', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), [
      { elementId: 'd1', cells: { type: '#ERR', width: 0, rating: '#CIRCULAR' } },
      { elementId: 'd2', cells: { type: '#UNDEF', width: 0, rating: null } },
    ]);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('coerces booleans and Infinity safely', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), [
      { elementId: 'd1', cells: { type: 'true' as unknown as string, width: Infinity, rating: 'NaN' } },
    ]);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('subtitle line renders when supplied', async () => {
    const bytes = await scheduleToPDF(mkSchedule(), mkRows(3), {
      title: 'Door Schedule',
      subtitle: 'Issued for tender — 2026-04-28',
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });
});
