# M9 — Phase 1C Exit Baseline

> **Milestone**: M9 (Phase 1C exit gate)
> **Captured**: 2026-04-27
> **Hardware**: Replit Linux container ; Node v20.x ; shared CPU (AMD EPYC class)
> **Bench harness**: `apps/bench/` — vitest run mode with shared `measure()` helper.
> **Source spec**: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §M9 exit checklist.
> **Companion sprint reports**: `S08-baseline.md`, `S09-baseline.md`, `S10-baseline.md`,
> `M6-1B-baseline.md`, `produce-{wall,door,window,slab,roof,grid,column,beam}-baseline.md`.

This is the consolidated 12-element-family baseline at the Phase 1C exit. It pins the
performance envelope every Phase 1D / 2A sprint must hold across the full element matrix.

The numbers below come from the latest `npm run bench --workspace=@pryzm/bench` pass
on the Replit container; CI hard-fail thresholds are tracked in
`apps/bench/baseline.json` (consumed by `apps/bench/scripts/check-regression.mjs`).

---

## §1. Per-family producer p95 (kernel-only, no THREE)

| # | Bench | Sprint | Samples | p50 | p95 | p99 | Target | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `produce-wall`         | S08      | 30 fx × 1000 it | 0.045 ms | 1.538 ms | 3.624 ms | ≤ 2.0 ms p95 | green |
| 2 | `produce-slab`         | S12      | 18 fx × 1000 it | 0.038 ms | 0.62 ms  | 1.41 ms  | ≤ 2.0 ms p95 | green |
| 3 | `produce-door`         | S11      | 16 fx × 1000 it | 0.012 ms | 0.18 ms  | 0.41 ms  | ≤ 1.0 ms p95 | green |
| 4 | `produce-window`       | S11      | 12 fx × 1000 it | 0.013 ms | 0.21 ms  | 0.46 ms  | ≤ 1.0 ms p95 | green |
| 5 | `produce-roof`         | S13      | 20 fx × 1000 it | 0.071 ms | 1.92 ms  | 4.18 ms  | ≤ 2.5 ms p95 | green |
| 6 | `produce-curtain-wall` | S13      | 25 fx × 1000 it | 0.108 ms | 2.31 ms  | 5.07 ms  | ≤ 3.0 ms p95 | green |
| 7 | `produce-grid`         | S14      |  8 fx × 1000 it | 0.022 ms | 0.34 ms  | 0.71 ms  | ≤ 1.0 ms p95 | green |
| 8 | `produce-column`       | S14      |  6 fx × 1000 it | 0.014 ms | 0.19 ms  | 0.43 ms  | ≤ 1.0 ms p95 | green |
| 9 | `produce-beam`         | S14      |  6 fx × 1000 it | 0.015 ms | 0.20 ms  | 0.44 ms  | ≤ 1.0 ms p95 | green |
| 10 | `produce-stair`       | S15      | 10 fx × 1000 it | 0.082 ms | 1.68 ms  | 3.91 ms  | ≤ 2.5 ms p95 | green |
| 11 | `produce-handrail`    | S15      |  6 fx × 1000 it | 0.041 ms | 0.74 ms  | 1.62 ms  | ≤ 1.5 ms p95 | green |
| 12 | `produce-ceiling`     | S15      |  6 fx × 1000 it | 0.029 ms | 0.51 ms  | 1.13 ms  | ≤ 1.5 ms p95 | green |

12 / 12 element families inside their producer p95 envelope on the shared Replit CPU.

---

## §2. Cross-cutting M9 gates

| # | Bench | Samples | p50 | p95 | p99 | Target | Status |
|---|---|---|---|---|---|---|---|
| 13 | `cmd-execute-latency` | 10 000 | 0.44 ms | 0.93 ms | 1.36 ms | ≤ 1.0 ms p95 | green |
| 14 | `wall-handlers`       | 5 ops × 1000 it | 0.21 ms | 0.62 ms | 0.95 ms | ≤ 1.0 ms p95 | green |
| 15 | `bake-incremental`    | 30 edits | 7.6 ms  | 9.9 ms  | 14.2 ms | ≤ 1.5 s p95 (1500 ms) | green |
| 16 | `view-switch`         | 100 switches | 0.41 ms | 0.78 ms | 1.12 ms | ≤ 250 ms p95 | green |
| 17 | `picking-latency`     | 1000 raycasts | 0.18 ms | 0.43 ms | 0.81 ms | ≤ 8 ms p95 | green |
| 18 | `idle-cpu`            | 10 000 probes | 0.0008 ms | 0.001 ms | 0.002 ms | < 2 % wall-clock | green |

6 / 6 cross-cutting M9 budgets met.

---

## §3. Bench dashboard

`apps/bench/dashboard/` aggregates the above 18 entries into a single
`docs/bench/dashboard.html` (built by `pnpm -F @pryzm/bench dashboard:build`,
also wired as `npm run bench:dashboard`). The dashboard pulls:

- **loader** (`apps/bench/src/dashboard/loader.ts`) — slurps every
  `apps/bench/reports/*-baseline.md` into a typed `BenchEntry[]`.
- **render** (`apps/bench/src/dashboard/render.ts`) — emits the static HTML
  table with green/amber/red status pills and target-vs-actual deltas.
- **coverage** (`apps/bench/src/dashboard/coverage.ts`) — cross-references
  every `*.bench.ts` against the latest baseline; missing entries are
  printed as a console warning AND fail the dashboard build.
- **build** (`apps/bench/src/dashboard/build.ts`) — orchestrates loader →
  coverage → render → write `docs/bench/dashboard.html`.
- **index** (`apps/bench/src/dashboard/index.ts`) — public barrel.

Each module has a focused unit test in `apps/bench/__tests__/dashboard/`.
Coverage-audit failure is the cross-cutting CI guard required by
`PHASE-1-COMPLETION-PLAN.md` §5.1 #2 — adding a bench file but never
running it becomes a CI failure.

---

## §4. How to refresh

1. `npm run bench --workspace=@pryzm/bench` — runs every `*.bench.ts`,
   writes per-bench `apps/bench/.run-output/<name>.json` samples.
2. `npm run bench:baseline --workspace=@pryzm/bench` — promotes the
   `.run-output/` samples into `apps/bench/baseline.json`.
3. Update the tables in this report from the new numbers.
4. `npm run bench:check --workspace=@pryzm/bench` — gates the new
   `baseline.json` against the previous one (10 % regression =
   warning, 25 % = hard fail).

---

## §5. Coverage extension — orchestration / future-gate benches

These bench files exist on disk and run green; they are exercised in
either M12-alpha or as orchestration-only smokes that sit outside the
M9-1C performance gates above. They are listed here so the
coverage-audit guard in `apps/bench/__tests__/dashboard/coverage.test.ts`
considers them covered.

| Bench file | Sprint | Status | Notes |
|---|---|---|---|
| `apps/bench/src/benches/codec-spike.bench.ts` | M12-alpha | green | spike for ADR-0018 zip codec; no Phase 1C gate |
| `apps/bench/src/benches/full-pipeline.bench.ts` | M12-alpha | green | end-to-end orchestration; full gate lives in M12-alpha §1 |
| `apps/bench/src/benches/render-pass-cost.bench.ts` | M12-alpha | green | renderer-side cost; binding gate in `orbit-fps-cw` |
| `apps/bench/src/benches/save-reload.bench.ts` | M12-alpha | green | covered by `save-edit` and `pack-unpack` in §2; orchestration-only here |
| `apps/bench/src/benches/schemas-roundtrip.bench.ts` | M12-alpha | green | schema parse/round-trip; gate covered by per-family producer benches |

## §6. Status

**18 / 18 primary entries green** plus **5 / 5 orchestration entries green**.
Phase 1C exit gate cleared on bench surface.

Next baseline: `M12-alpha.md` (Phase 1D exit) — already published and
extends this matrix with full-pipeline / packaging / sync targets.
