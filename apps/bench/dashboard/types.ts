// Bench dashboard data types (S18-T6).
//
// Spec: PHASE-1C §S18 typed contracts lines 1029-1038.
// ADR: docs/02-decisions/adrs/0017-headless-package-surface.md.
//
// Used by apps/bench/dashboard/src/loader.ts and src/render.ts to
// aggregate bench report lines from apps/bench/reports/*.md into a
// dashboard view.

export interface BenchEntry {
  readonly id: string;
  readonly sprint: string;
  readonly metric: string;
  readonly target: number;
  readonly latest: number;
  readonly status: 'green' | 'yellow' | 'red';
  readonly lastRun: string;
}

export type BenchStatus = BenchEntry['status'];

export function computeStatus(
  latest: number,
  target: number,
  hardFail: number,
  softWarn: number,
  higherIsBetter: boolean,
): BenchStatus {
  if (higherIsBetter) {
    if (latest >= target)   return 'green';
    if (latest >= softWarn) return 'yellow';
    return 'red';
  }
  if (latest <= target)   return 'green';
  if (latest <= softWarn) return 'yellow';
  return 'red';
}

export interface BenchReport {
  readonly sprint:    string;
  readonly bench:     string;
  readonly timestamp: string;
  readonly p50:       number;
  readonly p95:       number;
  readonly p99:       number;
  readonly samples:   number;
  readonly hardware:  string;
}
