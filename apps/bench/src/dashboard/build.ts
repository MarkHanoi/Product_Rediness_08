// Bench dashboard — build orchestrator (W-1C-6).
//
// Pipeline:
//   loader → coverage → render → write `docs/bench/dashboard.html`
//
// CLI usage:
//   node --import tsx apps/bench/src/dashboard/build.ts
//
// The build hard-fails if `auditCoverage()` reports any missing
// benches (PHASE-1-COMPLETION-PLAN.md §5.1 #2).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllReports } from './loader.js';
import { auditCoverage, defaultPaths } from './coverage.js';
import { renderHtml } from './render.js';
import type { BaselineReport, CoverageResult } from './types.js';

export interface BuildResult {
  readonly reports: readonly BaselineReport[];
  readonly coverage: CoverageResult;
  readonly outputPath: string;
}

export function buildDashboard(repoRoot: string, outRelative = 'docs/bench/dashboard.html'): BuildResult {
  const { benchDir, reportsDir } = defaultPaths(repoRoot);
  const reports = loadAllReports(reportsDir);
  const allEntries = reports.flatMap((r) => r.entries);
  const coverage = auditCoverage(benchDir, allEntries);
  if (!coverage.ok) {
    throw new Error(
      `[bench-dashboard] coverage gate failed — ${coverage.missing.length} bench file(s) not found in any baseline report:\n  - ${coverage.missing.join('\n  - ')}`,
    );
  }
  const html = renderHtml(reports);
  const outputPath = resolve(repoRoot, outRelative);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, 'utf-8');
  return { reports, coverage, outputPath };
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === __filename;
if (isMain) {
  const repoRoot = resolve(__filename, '..', '..', '..', '..', '..');
  const result = buildDashboard(repoRoot);
  // eslint-disable-next-line no-console
  console.log(
    `[bench-dashboard] wrote ${result.outputPath} — ${result.reports.length} reports, ${result.reports.reduce((a, r) => a + r.entries.length, 0)} entries, coverage OK (${result.coverage.benchFiles.length} bench files).`,
  );
}
