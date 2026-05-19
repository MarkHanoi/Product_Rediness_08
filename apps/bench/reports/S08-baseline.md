# S08 — Wall Producer + Command-Bus Baseline

> **Sprint**: S08 (Wall producer + command-bus end-to-end)
> **Captured**: 2026-04-27
> **Hardware**: Replit Linux container ; Node v20.x ; shared CPU (AMD EPYC class)
> **Bench harness**: `apps/bench/` — vitest run mode with shared `measure()` helper.
> **Source spec**: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S08 lines 686-687.
> **Companion**: `apps/bench/reports/produce-wall-baseline.md` carries the per-scenario breakdown.

---

## bench: cmd-execute-latency
- **sprint**: S08
- **timestamp**: 2026-04-27T14:32:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 10000
- **p50**: 0.42 ms
- **p95**: 0.91 ms
- **p99**: 1.32 ms
- **target**: ≤ 1.0 ms p95
- **status**: green

## bench: wall-handlers
- **sprint**: S08
- **timestamp**: 2026-04-27T14:32:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 5000
- **p50**: 0.18 ms
- **p95**: 0.71 ms
- **p99**: 1.04 ms
- **target**: ≤ 1.0 ms p95 per handler (all 5 handlers under budget)
- **status**: green

## bench: produce-wall
- **sprint**: S08
- **timestamp**: 2026-04-27T10:55:21Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 1000 (per scenario; 100-iter warm-up)
- **p50**: 0.045 ms (layered-3layer scenario)
- **p95**: 1.538 ms (layered-openings scenario, hardest case)
- **p99**: 3.624 ms
- **target**: ≤ 50 ms p95 (simple) / ≤ 80 ms p95 (layered+openings) / project-wide ≤ 2.0 ms p95
- **status**: green

## Notes

- Numbers are aggregated from `apps/bench/src/benches/{cmd-execute-latency,wall-handlers,produce-wall}.bench.ts` runs against the unified vitest harness.
- The S08 spec budgets `cmd-execute-latency` at ≤ 1 ms p95 — local Replit shared-CPU shows occasional drift but stays inside the budget envelope per `scripts/check-regression.mjs`.
- The `produce-wall` bench dominates as the post-S07 functional gate; its full per-scenario breakdown lives in the sibling report.
