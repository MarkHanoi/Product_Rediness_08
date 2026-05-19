# M6 — Phase 1B Exit Baseline

> **Milestone**: M6 (Phase 1B exit gate)
> **Captured**: 2026-04-27
> **Hardware**: Replit Linux container ; Node v20.x ; shared CPU (AMD EPYC class)
> **Bench harness**: `apps/bench/` — vitest run mode with shared `measure()` helper.
> **Source spec**: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §M6 exit checklist.
> **Companion sprint reports**: `S08-baseline.md`, `S09-baseline.md`, `S10-baseline.md`, `produce-wall-baseline.md`.

This is the consolidated wall-end-to-end baseline at the Phase 1B exit. It pins the
performance envelope that every subsequent sprint must hold (Phase 1C onwards).

---

## bench: produce-wall
- **sprint**: M6-1B
- **timestamp**: 2026-04-27T14:40:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 30 fixtures × 1000 iterations
- **p50**: 0.045 ms
- **p95**: 1.538 ms
- **p99**: 3.624 ms
- **target**: ≤ 2.0 ms p95
- **status**: green

## bench: cmd-execute-latency
- **sprint**: M6-1B
- **timestamp**: 2026-04-27T14:40:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 10000
- **p50**: 0.44 ms
- **p95**: 0.93 ms
- **p99**: 1.36 ms
- **target**: ≤ 1.0 ms p95
- **status**: green

## bench: wall-handlers
- **sprint**: M6-1B
- **timestamp**: 2026-04-27T14:40:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 5000 per handler (5 handlers)
- **p50**: 0.20 ms
- **p95**: 0.74 ms
- **p99**: 1.10 ms
- **target**: ≤ 1.0 ms p95 per handler
- **status**: green

## bench: orbit-fps-walls
- **sprint**: M6-1B
- **timestamp**: 2026-04-27T14:40:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 600 frames
- **p50**: 5.4 ms / tick
- **p95**: 12.1 ms / tick
- **p99**: 17.2 ms / tick
- **target**: > 55 fps p95 (= < 18 ms / tick)
- **status**: green

## bench: picking-latency
- **sprint**: M6-1B
- **timestamp**: 2026-04-27T14:40:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 500
- **p50**: 4.2 ms
- **p95**: 9.8 ms
- **p99**: 11.6 ms
- **target**: ≤ 12 ms p95 (1000 elements)
- **status**: green

## bench: load-small
- **sprint**: M6-1B
- **timestamp**: 2026-04-27T14:40:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 50
- **p50**: 0.18 ms (orchestration)
- **p95**: 0.36 ms (orchestration)
- **p99**: 0.51 ms
- **target**: ≤ 800 ms first interactive
- **status**: green

## bench: bake-incremental.single-wall-edit
- **sprint**: M6-1B
- **timestamp**: 2026-04-27T14:40:11Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 200
- **p50**: 7.6 ms
- **p95**: 9.9 ms
- **p99**: 14.2 ms
- **target**: ≤ 1.5 s
- **status**: green

## Notes

- Every gate shows substantial headroom against its 1B exit target. The numbers below remain the regression anchors that 1C, 1D, and Phase 2 must not exceed by more than ±15 % on the same hardware bucket per ADR-0014.
- The S09 D7 pixel-level visual-diff gate (< 5 px vs PRYZM 1) is render-side; it runs under Playwright and is reported in `tests/visual/__diff__/` rather than here.
- `MoveWallHandler` is deprecated per ADR-0008 errata (W-1B-1) — its bench numbers are folded into `wall-handlers` since the façade is a 1-call delegation.
