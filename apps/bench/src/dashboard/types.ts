// Bench dashboard — shared types (W-1C-6).
//
// Source of truth for the structures consumed by `loader.ts`,
// `coverage.ts`, `render.ts`, `build.ts`, and the dashboard tests.
//
// A `BenchEntry` is one row in the baseline tables: a single bench
// file's latest p50/p95/p99 against its target budget.
//
// A `BaselineReport` is the parsed shape of one
// `apps/bench/reports/<sprint>-baseline.md` document.

export type BenchStatus = 'green' | 'amber' | 'red';

export interface BenchEntry {
  /** Bench identifier — must match the `name` field in the bench's `measure({ name })`. */
  readonly name: string;
  /** Sprint that captured this baseline (e.g. `S08`, `M6-1B`, `M9-1C`, `M12-alpha`). */
  readonly sprint: string;
  /** Origin report file relative to repo root. */
  readonly source: string;
  readonly p50?: number;
  readonly p95?: number;
  readonly p99?: number;
  readonly target?: string;
  readonly status: BenchStatus;
}

export interface BaselineReport {
  readonly file: string;
  readonly milestone: string;
  readonly capturedAt: string;
  readonly entries: readonly BenchEntry[];
}

export interface CoverageResult {
  /** Bench source files found on disk. */
  readonly benchFiles: readonly string[];
  /** Bench `name` values referenced in baseline reports. */
  readonly reportedNames: readonly string[];
  /** Bench files whose `name` is missing from any baseline report. */
  readonly missing: readonly string[];
  /** Whether the coverage gate is satisfied (missing.length === 0). */
  readonly ok: boolean;
}
