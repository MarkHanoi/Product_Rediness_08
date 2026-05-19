// Bench dashboard — coverage audit test (W-1C-6).
//
// Cross-cutting CI guard: every `*.bench.ts` file must appear in at
// least one published baseline report.  Adding a bench file and never
// running it = CI fail.

import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllReports } from '../../src/dashboard/loader.js';
import { auditCoverage, listBenchFiles } from '../../src/dashboard/coverage.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPORTS_DIR = resolve(__dirname, '../../reports');
const BENCH_DIR = resolve(__dirname, '../../src/benches');

describe('bench dashboard — coverage audit', () => {
  it('lists at least 18 bench files on disk', () => {
    const files = listBenchFiles(BENCH_DIR);
    expect(files.length).toBeGreaterThanOrEqual(18);
  });

  it('every bench file appears in at least one baseline report', () => {
    const reports = loadAllReports(REPORTS_DIR);
    const allEntries = reports.flatMap((r) => r.entries);
    const result = auditCoverage(BENCH_DIR, allEntries);
    if (!result.ok) {
      // Helpful failure message for the CI log
      // eslint-disable-next-line no-console
      console.error('Bench files missing from any baseline:', result.missing);
    }
    expect(result.ok).toBe(true);
  });
});
