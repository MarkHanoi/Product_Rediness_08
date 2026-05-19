# S10 — Wall Cascade + Transform Baseline

> **Sprint**: S10 (wall transform unification, cascade rules, MoveWall façade)
> **Captured**: 2026-04-27
> **Hardware**: Replit Linux container ; Node v20.x ; shared CPU (AMD EPYC class)
> **Bench harness**: `apps/bench/` — vitest run mode with shared `measure()` helper.
> **Source spec**: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10.

---

## bench: cmd-execute-latency
- **sprint**: S10 (with cascade runner overhead)
- **timestamp**: 2026-04-27T14:35:41Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 10000
- **p50**: 0.45 ms
- **p95**: 0.95 ms
- **p99**: 1.41 ms
- **target**: ≤ 1.0 ms p95 (cascade overhead must stay inside the S08 budget)
- **status**: green

## bench: wall-handlers (TransformWall + MoveWall façade)
- **sprint**: S10
- **timestamp**: 2026-04-27T14:35:41Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 5000 (per handler)
- **p50**: 0.21 ms
- **p95**: 0.78 ms
- **p99**: 1.12 ms
- **target**: ≤ 1.0 ms p95 per handler
- **status**: green
- **notes**: `MoveWallHandler` is now a 1-call façade over `TransformWallHandler.referenceEdit`; latency unchanged within noise.

## bench: produce-wall (post-cascade)
- **sprint**: S10
- **timestamp**: 2026-04-27T14:35:41Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 1000 per scenario
- **p50**: 0.046 ms
- **p95**: 1.55 ms (layered-openings)
- **p99**: 3.71 ms
- **target**: ≤ 2.0 ms p95 project-wide
- **status**: green

## bench: bake-incremental.single-wall-edit
- **sprint**: S10 (cascade-aware bake recompute)
- **timestamp**: 2026-04-27T14:35:41Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 200
- **p50**: 7.6 ms
- **p95**: 9.9 ms
- **p99**: 14.2 ms
- **target**: ≤ 1.5 s
- **status**: green

## Notes

- The S10 cascade-runner introduces ~30-50 µs of overhead per command on average; the bench shows the budget envelope is preserved.
- `MoveWall` remains as a deprecated façade per ADR-0008 errata (W-1B-1).
- Bake-incremental is the largest gate this sprint owns; comfortable headroom against the 1.5 s budget.
