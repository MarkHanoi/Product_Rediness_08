// Bench: `export-schedule` — S42-T6.
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S42 Exit
// Criteria line 1026:
//   "apps/bench/export-schedule.ts: CSV < 100 ms, XLSX < 500 ms,
//    PDF < 10 s per schedule."
//
// We exercise the same 500-row Door-Schedule fixture across all three
// formats.  CSV is sync, XLSX/PDF are async — `measure` handles both
// uniformly.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ScheduleSchema, type ScheduleData, type ScheduleRow } from '@pryzm/schemas/schedule';
import { scheduleToCSV } from '../../../../plugins/schedules/src/export/csv.js';
import { scheduleToXLSX } from '../../../../plugins/schedules/src/export/xlsx.js';
import { scheduleToPDF } from '../../../../plugins/schedules/src/export/pdf.js';
import { measure, type BenchSample } from '../timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
const REPORTS = resolve(__dirname, '..', '..', 'reports');
mkdirSync(RUN_OUTPUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

const ROW_COUNT = 500;

function mkSchedule(): ScheduleData {
  return ScheduleSchema.parse({
    id: 'bench',
    name: 'Door Schedule (500-row bench)',
    elementType: 'door',
    columns: [
      { id: 'mark',     header: 'Mark',         formula: 'mark',         type: 'string', widthMm: 25 },
      { id: 'type',     header: 'Type',         formula: 'type',         type: 'string', widthMm: 30 },
      { id: 'width',    header: 'Width',        formula: 'width',        type: 'number', widthMm: 20, unit: 'mm' },
      { id: 'height',   header: 'Height',       formula: 'height',       type: 'number', widthMm: 20, unit: 'mm' },
      { id: 'rating',   header: 'Fire Rating',  formula: 'fireRating',   type: 'string', widthMm: 20 },
      { id: 'material', header: 'Material',     formula: 'material',     type: 'string', widthMm: 25 },
      { id: 'level',    header: 'Level',        formula: 'level',        type: 'string', widthMm: 15 },
      { id: 'room',     header: 'Room',         formula: 'roomNumber',   type: 'string', widthMm: 20 },
    ],
    filter: '',
    seq: 1,
  });
}

function mkRows(n: number): ScheduleRow[] {
  const out: ScheduleRow[] = [];
  const types = ['WD-Single', 'WD-Double', 'AluFr-Single', 'GlazedFr', 'FireExit'];
  const ratings = ['30min', '60min', '90min', '120min', '-'];
  const materials = ['Solid Core', 'Hollow Core', 'Aluminium', 'Glass', 'Steel'];
  for (let i = 0; i < n; i += 1) {
    out.push({
      elementId: `door-${i.toString().padStart(4, '0')}`,
      cells: {
        mark:     `D${(i + 1).toString().padStart(4, '0')}`,
        type:     types[i % types.length]!,
        width:    [800, 900, 1000, 1200, 1500][i % 5]!,
        height:   [2100, 2400, 2700][i % 3]!,
        rating:   ratings[i % ratings.length]!,
        material: materials[i % materials.length]!,
        level:    `L${(i % 8) + 1}`,
        room:     `R${(i % 60) + 100}`,
      },
    });
  }
  return out;
}

interface ExportBenchSample extends BenchSample {
  format: 'csv' | 'xlsx' | 'pdf';
  byteLength: number;
}

const SCHEDULE = mkSchedule();
const ROWS = mkRows(ROW_COUNT);

describe('export-schedule bench (S42 exit gate)', () => {
  it('CSV: 500-row schedule p95 < 100 ms', async () => {
    let lastBytes = 0;
    const sample = await measure(
      'schedule.export.csv.500',
      () => {
        const csv = scheduleToCSV(SCHEDULE, ROWS);
        lastBytes = csv.length;
      },
      { samples: 200, warmup: 20, budgetMs: 100, warnMs: 50 },
    );
    expect(sample.p95).toBeLessThan(100);
    expect(lastBytes).toBeGreaterThan(1000);
    persist({ ...sample, format: 'csv', byteLength: lastBytes });
  });

  it('XLSX: 500-row schedule p95 < 500 ms', async () => {
    let lastBytes = 0;
    const sample = await measure(
      'schedule.export.xlsx.500',
      async () => {
        const bytes = await scheduleToXLSX(SCHEDULE, ROWS);
        lastBytes = bytes.byteLength;
      },
      { samples: 20, warmup: 3, budgetMs: 500, warnMs: 250 },
    );
    expect(sample.p95).toBeLessThan(500);
    expect(lastBytes).toBeGreaterThan(1000);
    persist({ ...sample, format: 'xlsx', byteLength: lastBytes });
  });

  it('PDF: 500-row schedule p95 < 10 s', async () => {
    let lastBytes = 0;
    const sample = await measure(
      'schedule.export.pdf.500',
      async () => {
        const bytes = await scheduleToPDF(SCHEDULE, ROWS);
        lastBytes = bytes.byteLength;
      },
      { samples: 5, warmup: 1, budgetMs: 10_000, warnMs: 5_000 },
    );
    expect(sample.p95).toBeLessThan(10_000);
    expect(lastBytes).toBeGreaterThan(1000);
    persist({ ...sample, format: 'pdf', byteLength: lastBytes });
  });
});

const RUN_LOG: ExportBenchSample[] = [];

function persist(sample: ExportBenchSample): void {
  RUN_LOG.push(sample);
  writeFileSync(
    resolve(RUN_OUTPUT, 'export-schedule.json'),
    JSON.stringify(RUN_LOG, null, 2),
    'utf8',
  );
  writeFileSync(
    resolve(REPORTS, 'export-schedule-baseline.md'),
    renderMd(RUN_LOG),
    'utf8',
  );
}

function renderMd(samples: readonly ExportBenchSample[]): string {
  const rows = samples
    .map(
      (s) =>
        `| ${s.format.toUpperCase()} | ${ROW_COUNT} | ${s.p50.toFixed(2)} | ${s.p95.toFixed(2)} | ${s.p99.toFixed(2)} | ${s.budgetMs} | ${(s.byteLength / 1024).toFixed(1)} KB |`,
    )
    .join('\n');
  return `# Schedule Export Bench Baseline (S42)

Spec: \`phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md\` §S42 line 1026.
Generated: ${new Date().toISOString()}.

| Format | Rows | p50 (ms) | p95 (ms) | p99 (ms) | Budget (ms) | Output |
|---|---|---|---|---|---|---|
${rows}
`;
}
