// Bench dashboard — build orchestrator test (W-1C-6).

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { buildDashboard } from '../../src/dashboard/build.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');

describe('bench dashboard — build', () => {
  it('writes a self-contained HTML to a temp out path and returns coverage info', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bench-dash-'));
    const rel = `tmp-out/${Date.now()}.html`;
    const result = buildDashboard(REPO_ROOT, join(tmp, 'dashboard.html').replace(REPO_ROOT + '/', ''));
    expect(result.outputPath.endsWith('dashboard.html')).toBe(true);
    expect(existsSync(result.outputPath)).toBe(true);
    const html = readFileSync(result.outputPath, 'utf-8');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('PRYZM 2 — bench dashboard');
    expect(result.reports.length).toBeGreaterThan(0);
    expect(result.coverage.ok).toBe(true);
    void rel;
  });
});
