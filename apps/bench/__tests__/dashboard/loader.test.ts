// Bench dashboard — loader test (W-1C-6).

import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllReports, parseReport } from '../../src/dashboard/loader.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPORTS_DIR = resolve(__dirname, '../../reports');

describe('bench dashboard — loader', () => {
  it('parses every baseline report under apps/bench/reports/', () => {
    const reports = loadAllReports(REPORTS_DIR);
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) {
      expect(r.file).toMatch(/\.md$/);
      expect(typeof r.milestone).toBe('string');
    }
  });

  it('M9-1C-baseline.md yields ≥ 18 entries', () => {
    const r = parseReport(resolve(REPORTS_DIR, 'M9-1C-baseline.md'));
    expect(r.entries.length).toBeGreaterThanOrEqual(18);
  });

  it('section-block report (M6-1B-baseline.md) yields per-bench entries', () => {
    const r = parseReport(resolve(REPORTS_DIR, 'M6-1B-baseline.md'));
    expect(r.entries.length).toBeGreaterThan(0);
    expect(r.entries.some((e) => e.name === 'produce-wall')).toBe(true);
  });

  it('every entry has a normalised status', () => {
    const reports = loadAllReports(REPORTS_DIR);
    for (const r of reports) {
      for (const e of r.entries) {
        expect(['green', 'amber', 'red']).toContain(e.status);
      }
    }
  });
});
