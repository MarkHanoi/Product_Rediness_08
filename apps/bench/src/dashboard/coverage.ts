// Bench dashboard — coverage audit (W-1C-6 / §5.1 #2).
//
// Cross-references every `apps/bench/src/benches/*.bench.ts` against
// the bench `name` strings extracted from the published baseline
// reports.  Adding a bench file but never running it (i.e. never
// publishing it into a baseline report) is a CI failure.
//
// The expected `name` for a bench file is its filename stem with the
// `.bench` suffix stripped — this matches the naming convention used
// in `measure({ name: '<file-stem>' })` across every existing bench.
//
// Tolerated drift: a single bench file can publish multiple measure
// calls (e.g. `pack-unpack` → `pack`, `unpack`).  Coverage tolerates
// any reported name that *starts with* the file stem.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchEntry, CoverageResult } from './types.js';

export function listBenchFiles(benchDir: string): readonly string[] {
  if (!existsSync(benchDir)) return [];
  return readdirSync(benchDir)
    .filter((f) => f.endsWith('.bench.ts'))
    .map((f) => f.replace(/\.bench\.ts$/, ''))
    .sort();
}

/** Normalise a reported name to the bench file stem.
 *  Accepts: "load-large", "load-large-bench", "apps/bench/src/benches/load-large.bench.ts". */
function toStem(name: string): string {
  const base = name.split('/').pop() ?? name;
  return base.replace(/\.bench\.ts$/, '').replace(/-bench$/, '');
}

export function auditCoverage(
  benchDir: string,
  entries: readonly BenchEntry[],
): CoverageResult {
  const benchFiles = listBenchFiles(benchDir);
  const reportedRaw = Array.from(new Set(entries.map((e) => e.name))).sort();
  const reportedNames = reportedRaw;
  const reportedStems = new Set(reportedRaw.map(toStem));
  const missing = benchFiles.filter((stem) => {
    if (reportedStems.has(stem)) return false;
    // tolerate stem-prefix matches (e.g. file `pack-unpack` reports `pack` and `unpack`).
    for (const r of reportedStems) {
      if (r === stem) return false;
      if (r.startsWith(stem)) return false;
      if (stem.startsWith(r) && r.length >= 4) return false;
    }
    return true;
  });
  return {
    benchFiles,
    reportedNames,
    missing,
    ok: missing.length === 0,
  };
}

/** Convenience: locate the reports dir relative to a known bench dir. */
export function defaultPaths(repoRoot: string): { benchDir: string; reportsDir: string } {
  return {
    benchDir: join(repoRoot, 'apps/bench/src/benches'),
    reportsDir: join(repoRoot, 'apps/bench/reports'),
  };
}
