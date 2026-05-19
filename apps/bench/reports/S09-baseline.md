# S09 — Wall Render + Visual Diff Baseline

> **Sprint**: S09 (wall committer, scene-host registration, picking, S09-D7 visual-diff gate setup)
> **Captured**: 2026-04-27
> **Hardware**: Replit Linux container ; Node v20.x ; shared CPU (AMD EPYC class)
> **Bench harness**: `apps/bench/` — vitest run mode with shared `measure()` helper.
> **Source spec**: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09 D2 / D7.
> **Companion**: pixel-level S09 D7 < 5 px gate runs under Playwright (W-1B-3) — see `tests/visual/wall.spec.ts`.

---

## bench: load-small
- **sprint**: S09
- **timestamp**: 2026-04-27T14:34:02Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 50
- **p50**: 0.18 ms (orchestration)
- **p95**: 0.36 ms (orchestration)
- **p99**: 0.51 ms
- **target**: ≤ 800 ms first interactive (orchestration only — `onChunkReady` is a no-op stub)
- **status**: green

## bench: orbit-fps-walls
- **sprint**: S09
- **timestamp**: 2026-04-27T14:34:02Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 600 frames
- **p50**: 5.4 ms / tick (committer batch)
- **p95**: 12.1 ms / tick
- **p99**: 17.2 ms / tick
- **target**: > 55 fps p95 (= < 18 ms / tick)
- **status**: green

## bench: cmd-execute-latency
- **sprint**: S09 (re-measured post-D7 hooks)
- **timestamp**: 2026-04-27T14:34:02Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 10000
- **p50**: 0.43 ms
- **p95**: 0.92 ms
- **p99**: 1.34 ms
- **target**: ≤ 1.0 ms p95
- **status**: green

## bench: picking-latency
- **sprint**: S09 (1000-elem scene gate)
- **timestamp**: 2026-04-27T14:34:02Z
- **hardware**: linux x64 ; node 20.x ; shared CPU
- **samples**: 500
- **p50**: 4.2 ms
- **p95**: 9.8 ms
- **p99**: 11.6 ms
- **target**: ≤ 12 ms p95 (1000 elements)
- **status**: green

## Notes

- The S09 D7 visual-diff gate (< 5 px diff vs PRYZM 1) is render-side and runs under Playwright; this report covers the kernel-side / committer-side timing that S09 introduces.
- `orbit-fps-walls` is the post-S09 fps gate; the committer's per-frame batch dominates and stays inside the 18 ms / tick budget.
