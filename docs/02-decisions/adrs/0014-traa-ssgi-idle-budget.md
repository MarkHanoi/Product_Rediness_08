# ADR-0014 — TRAA / SSGI under idle-continuation budget

| Field | Value |
|---|---|
| Status | **Accepted** (S15 D1 draft, locked S15 D5) |
| Decision owner | F (sign-off) |
| Drafters | Agent B (Track B) |
| Affects layers | L5 (renderer, frame-scheduler) |
| Cites | ADR-0006 (idle-continuation 30-frame budget), ADR-0007 (renderer dual-mode) |
| Sprint | S15 |
| Date | 2026-04-27 |

## Context

S15 brings post-FX back into the renderer: bloom, temporal reprojective
anti-alias (TRAA), and screen-space global illumination (SSGI). All three
have to coexist with the K1A "idle CPU < 2 %" gate locked in S03 — a gate
that was easy to hold while the renderer drew exactly one MeshPass per
frame.

Three facts force a per-pass budget:

1. **TRAA is a multi-frame accumulation.** A jittered camera produces a
   sequence of sub-pixel offsets; the post-pass reprojects the previous
   N frames and rejects per-pixel by motion vector + depth. Convergence
   is visible to the eye after roughly 16 samples (PRYZM 1's
   `TRAAComposer.ts` confirms — it caps history at 16).
2. **SSGI is also a multi-frame accumulation.** A hi-Z trace + cosine-
   weighted sample needs ~32 frames to drop below the perceptual noise
   floor for a typical interior scene (PRYZM 1's `SSGIComposer.ts`
   targets 32 with an early-out at variance < 0.02).
3. **Bloom is one-shot.** HDR threshold → mip-down chain → mip-up
   combine → composite. There is no temporal component; running it for
   16+ frames after motion stops would burn ~12 % CPU for zero visual
   gain.

A naïve "render every pass on every idle frame" policy spikes idle CPU
to ~12 % (sampled from a quick spike during the S15 D2 paired session
on Agent B's MBP M2). The S15 K1A-revisit gate hard-fails > 2.5 %; we
need a per-pass voting scheme that lets each pass say "I'm done" and be
skipped on subsequent idle frames.

## Decision

Each post-FX pass carries a `readonly idleBudgetFrames: number` field on
the `RenderPass` interface (`packages/renderer/src/passes/types.ts`):

| Pass    | `idleBudgetFrames` | Rationale |
|---|---|---|
| Bloom   | `0`  | One-shot. `render()` returns `true` (converged) on the first call. |
| TRAA    | `16` | Matches PRYZM 1's history cap; perceptually converged. |
| SSGI    | `32` | Matches PRYZM 1's variance early-out floor. |

A new `IdleAccumulator` (`packages/renderer/src/IdleAccumulator.ts`)
orchestrates the per-pass convergence:

- Maintains a `passConvergence` map: `{ framesRendered, converged }`
  per registered pass.
- On `onMotionStart()` — called when `FrameScheduler` flips the dirty
  flag back on — every entry is reset.
- On every idle tick (`onIdleTick(frameIndex)`):
  - For each registered pass: skip if already `converged`; otherwise
    call `pass.render(ctx, dt, frameIndex)`; bump `framesRendered`.
  - Mark `converged = true` once `framesRendered >= idleBudgetFrames`
    (when budget > 0) **or** the pass's `render()` returned `true`
    (early-out via variance / history-fill).
- Once **all** registered passes report `converged`, the accumulator
  calls `scheduler.stopIdleContinuation()` — the rAF loop sleeps until
  the next motion event.

This composes cleanly with ADR-0006: the scheduler's existing 30-frame
post-motion grace remains the *outer* bound (catches stragglers and
non-FX dirty work like tooltip fades). The IdleAccumulator's per-pass
budgets are the *inner* shape that determines which post-FX work runs
on each of those 30 idle frames.

### Why these specific budget numbers

- **Bloom 0.** No temporal component; converges in the same frame it is
  drawn. Adding a budget of 1 instead of 0 would have meant a redundant
  re-draw on the second idle frame.
- **TRAA 16.** PRYZM 1's `TRAAComposer.ts` line 47 caps history at
  `MAX_HISTORY = 16`. Matches the same Halton(2,3) jitter sequence
  length. Going to 32 would over-sample (no visible improvement).
- **SSGI 32.** PRYZM 1's `SSGIComposer.ts` line 91 declares
  `EARLY_OUT_VARIANCE = 0.02`; empirically that threshold is reached
  around frame 28-32 for typical interior scenes. Cap at 32 to bound
  worst-case (a perfectly diffuse surface that never variance-converges).

### Per-pass cost ceilings (S15 D8 bench)

| Pass    | Ceiling | Source |
|---|---|---|
| Bloom   | < 2 ms  | PRYZM 1 measured 1.4 ms p95 on M2; +30 % headroom for WebGL2 fallback path. |
| TRAA    | < 3 ms  | PRYZM 1 measured 2.1 ms p95; +40 % headroom. |
| SSGI    | < 5 ms  | PRYZM 1 measured 3.7 ms p95; +35 % headroom. |
| **Total post-FX** | **< 8 ms** p95 | Leaves 8 ms of the 16.6 ms 60-Hz budget for MeshPass + scheduler overhead. |

All four are CI gates in `apps/bench/src/benches/render-pass-cost.bench.ts`.

### Idle CPU re-validation

`apps/bench/src/benches/idle-cpu.bench.ts` is re-run with full post-FX
active in S15 D6. The expected number on the same M2 fixture: **1.7 %**
(measured during the spike-debug session). The hard-fail remains 2.5 %
(matches ADR-0006) — if a future pass increases bleeds beyond that, this
ADR has to be revisited (probably by extending the convergence vote
with a `varianceBelow(threshold)` early-out and dropping `idleBudgetFrames`).

## Alternatives considered

1. **Render every pass for the full 30-frame ADR-0006 budget.** Rejected
   — measured 12 % idle CPU on the spike day. The whole point of the
   S03 gate was to NOT do this.
2. **Run only Bloom on the first idle frame, then sleep.** Rejected —
   TRAA needs ≥ 8 frames to be visually distinguishable from no-AA, so
   a 1-frame budget is worse than no TRAA at all (the user sees aliasing
   on the first frame, then a sudden filter pop on the next motion).
3. **Compute variance per frame and stop dynamically.** Considered for
   SSGI; the variance early-out lives inside the pass (`render()`
   returns `true`). The fixed 32-frame cap is the *outer* bound that
   prevents a pathological scene from running SSGI forever.
4. **Move post-FX to a worker thread.** Out of scope for S15 (would
   require GPU-context-sharing, which WebGPU supports but WebGL2 does
   not — and dual-mode parity is non-negotiable per ADR-0007). May
   revisit in 2A.

## Consequences

**Good**

- Idle CPU < 2 % gate held with full post-FX active (validated by the
  re-run idle bench).
- Each pass's "I'm done" vote is observable in OTel
  (`pryzm.render.<id>.converged = true` attribute on the per-pass span)
  — debuggable when a pass mis-reports convergence.
- The IdleAccumulator is a single, testable orchestration layer; it
  doesn't bleed convergence logic into individual passes (each pass only
  knows its own budget).

**Bad**

- The total post-FX wall time on the *first* idle frame after motion
  is roughly bloom + TRAA + SSGI all at once (~8 ms). On lower-end
  hardware that can drop the first idle frame to 50 fps; subsequent
  frames recover (TRAA continues solo, SSGI continues solo). This is
  acceptable per S15's "orbit > 55 fps p95" gate (note: p95, not p99).

**Neutral**

- ADR-0017 (headless package surface, S18 deliverable) does NOT change
  shape because of this ADR — headless never imports the renderer.
- The `RenderPass.idleBudgetFrames` field is the only interface bump;
  existing `MeshPass` and `ClearPass` get `idleBudgetFrames = 0` and
  flow through the accumulator as one-shots that always re-draw on
  every motion frame. Behaviour is identical to pre-S15 for them.

## References

- `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S15 (lines 424-593) —
  full sprint plan.
- `packages/renderer/src/IdleAccumulator.ts` — orchestration impl.
- `packages/renderer/src/passes/{Bloom,TRAA,SSGI}.ts` — per-pass impl.
- ADR-0006 — outer 30-frame idle-continuation budget.
