/**
 * Canonical NFT-target list per `docs/00_NEW_ARCHITECTURE/08-VISION.md` §6.
 *
 * Each row maps a Vision-§6 contract (the user-facing perf promise) to:
 *   - the actual bench file in this repo (correcting §6's legacy paths)
 *   - the baseline key(s) under `apps/bench/baseline.json::benches`
 *
 * The list is the single source of truth for ADR-0053 §C
 * (NFT-target shape lock) + §B (K3-F regression-gate codification).
 *
 * Ownership: `@pryzm/perf-budgets` package.  Updated in lockstep with
 * `08-VISION.md` §6 amendments (currently anchored to the §6 lines
 * 104-119 table from the 2026-04-26 freeze).
 */

export interface NftTarget {
  /** Stable kebab-case identifier. */
  readonly id: string;
  /** Human-readable label matching the §6 table row. */
  readonly displayName: string;
  /**
   * §6 baseline column.  Some rows are "OOM / browser hang" or "n/a";
   * kept as strings for fidelity to the source table.
   */
  readonly pryzm1Baseline: string;
  /** §6 target column (e.g. "< 800 ms", "> 55 fps p95"). */
  readonly pryzm2Target: string;
  /**
   * Repo-relative path to the bench file.  §6 cites legacy paths like
   * `apps/bench/load-small.ts` which this field corrects to the actual
   * post-S03 layout under `apps/bench/src/benches/`.
   */
  readonly benchFile: string;
  /**
   * Key(s) under `apps/bench/baseline.json::benches`.  Multiple keys
   * for rows whose bench writes more than one sample (e.g. cold-load
   * benches write parse + produce + first-interactive + full-load).
   */
  readonly baselineKey: string | readonly string[];
  /**
   * S71 close status.  `landed` = baseline entry exists + bench runs
   * in dev env.  `partial` = bench file exists but a real-runtime
   * complement is operator-side (e.g. orbit-fps real-browser).
   * `gap` = no dedicated bench (documented as known coverage gap).
   */
  readonly s71Status: 'landed' | 'partial' | 'gap';
  /**
   * Free-form note explaining a `partial` or `gap` status, or the
   * sprint that owns the next fill-in.  Empty for `landed` rows.
   */
  readonly s71Note?: string;
}

export const NFT_TARGETS: readonly NftTarget[] = [
  {
    id: 'cold-load-small',
    displayName: 'Cold load — small project (50 walls, 1 level)',
    pryzm1Baseline: '2.4 s wall-clock to interactive',
    pryzm2Target: '< 800 ms',
    benchFile: 'apps/bench/src/benches/load-small.bench.ts',
    baselineKey: 'load-small.parse',
    s71Status: 'partial',
    s71Note:
      'Bench file exists (S19 D3) but no baseline.json entry promoted yet. S71 catalogs the gap; baseline promotion is a future-sprint mechanical step (run bench → bench:baseline) per ADR-0053 §E reversal trigger.',
  },
  {
    id: 'cold-load-medium',
    displayName: 'Cold load — medium (500 walls, 5 levels)',
    pryzm1Baseline: '8.7 s',
    pryzm2Target: '< 1.5 s first interactive, full at 4 s',
    benchFile: 'apps/bench/src/benches/load-medium.bench.ts',
    baselineKey: 'load-medium.parse',
    s71Status: 'partial',
    s71Note:
      'Bench file exists (S19 D4) but no baseline.json entry promoted yet. Same mechanical promotion path as cold-load-small.',
  },
  {
    id: 'cold-load-large',
    displayName: 'Cold load — large (5,000 walls, 20 levels)',
    pryzm1Baseline: 'OOM / browser hang',
    pryzm2Target: '< 3 s first interactive, full at 12 s',
    benchFile: 'apps/bench/src/benches/load-large.bench.ts',
    baselineKey: 'load-large.parse',
    s71Status: 'partial',
    s71Note:
      'Bench file exists (S19 D5 + S23 D9 tier-streamed loader) but no baseline.json entry promoted yet. Same mechanical promotion path. The first-interactive + full-load measurements need an isolated CI runner per ADR-0053 §A reversal trigger.',
  },
  {
    id: 'save-edit',
    displayName: 'Save (single wall edit)',
    pryzm1Baseline: '380 ms (full snapshot POST)',
    pryzm2Target: '< 10 ms (one event append)',
    benchFile: 'apps/bench/src/benches/save-edit.bench.ts',
    baselineKey: [
      'persistence.save-edit.append.idb',
      'persistence.save-edit.append.memory',
    ],
    s71Status: 'landed',
  },
  {
    id: 'idle-cpu',
    displayName: 'Idle CPU (camera still, no input)',
    pryzm1Baseline: '18% (continuous 60 fps render)',
    pryzm2Target: '< 2% (0 fps render, scheduler idle)',
    benchFile: 'apps/bench/src/benches/idle-cpu.bench.ts',
    baselineKey: 'frame-scheduler.idle-cpu',
    s71Status: 'landed',
  },
  {
    id: 'orbit-fps',
    displayName: 'Interactive frame rate (camera orbit)',
    pryzm1Baseline: '28 fps',
    pryzm2Target: '> 55 fps p95',
    benchFile: 'apps/bench/src/benches/orbit-fps-walls.bench.ts',
    baselineKey: 'orbit-fps-walls.commit',
    s71Status: 'partial',
    s71Note:
      'Node-side bench file exists (geometry-side cost) but no baseline.json entry promoted; real-browser fps p95 gate is operator-side via the S70 browser-matrix CI per ADR-0052 §A.',
  },
  {
    id: 'largest-model',
    displayName: 'Largest model (walls × levels) — 10,000 / 50',
    pryzm1Baseline: '~500 walls / 5 levels',
    pryzm2Target: '10,000 walls / 50 levels',
    benchFile: 'apps/bench/src/benches/largest-model.bench.ts',
    baselineKey: ['largest-model.parse', 'largest-model.produce'],
    s71Status: 'landed',
  },
  {
    id: 'bake-incremental',
    displayName: 'Server bake — single wall edit propagated to chunks',
    pryzm1Baseline: 'n/a',
    pryzm2Target: '< 1.5 s',
    benchFile: 'apps/bench/src/benches/bake-incremental.bench.ts',
    baselineKey: 'bake.incremental.single-wall-edit',
    s71Status: 'landed',
  },
  {
    id: 'undo-single',
    displayName: 'Undo single wall edit',
    pryzm1Baseline: '80 ms (structuredClone of 10 stores)',
    pryzm2Target: '< 5 ms (Immer patch reverse-apply)',
    benchFile: 'apps/bench/src/benches/cmd-execute-latency.bench.ts',
    baselineKey: 'command-bus.execute.move-cube',
    s71Status: 'gap',
    s71Note:
      'No dedicated undo-single.bench.ts; cmd-execute-latency.bench.ts covers the same hot path with sufficient signal for catastrophic-regression detection per ADR-0053 §E. Dedicated bench is a future-sprint sweetener.',
  },
];

/** Convenience: flatten baseline keys (single | array) to a flat list. */
export function flattenBaselineKeys(targets: readonly NftTarget[]): string[] {
  const out: string[] = [];
  for (const t of targets) {
    if (typeof t.baselineKey === 'string') {
      out.push(t.baselineKey);
    } else {
      for (const k of t.baselineKey) out.push(k);
    }
  }
  return out;
}

/** Convenience: K3-F threshold (>10% slip on any NFT target halts forward 3D work). */
export const K3F_REGRESSION_THRESHOLD_PCT = 10;
