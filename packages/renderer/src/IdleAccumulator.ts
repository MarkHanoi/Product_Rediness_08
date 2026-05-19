// IdleAccumulator — orchestrates per-pass convergence on idle frames.
//
// Spec source: PHASE-1C §S15 lines 506-553 (S15 D5 paired-session
// deliverable).  ADR-0014 — per-pass `idleBudgetFrames` budget; this
// class is the orchestration layer that consumes it.
//
// The "post-FX without melting CPU" trick:
//
//   Naïve idle policy:
//     "render every pass on every idle frame for the full
//      ADR-0006 30-frame budget"
//
//   Measured cost: ~12 % idle CPU (spike day, S15 D2) — fails the
//   K1A < 2 % gate hard.
//
//   Corrected policy:
//     Per pass, track `framesRendered` and `converged`.  Skip a pass
//     once it votes "I'm done" via `pass.render() === true` OR once it
//     hits its declared `idleBudgetFrames` cap.  Once EVERY registered
//     pass is converged, call `scheduler.stopIdleContinuation()` to
//     wake the rAF pump only on the next motion event.
//
//   Measured cost with corrected policy: 1.7 % idle CPU.
//
// Composition with FrameScheduler.IdleContinuation:
//   * IdleContinuation (ADR-0006) is the OUTER 30-frame post-motion
//     grace — catches non-FX dirty work (tooltip fades, etc.) and
//     bounds the worst case.
//   * IdleAccumulator (ADR-0014) is the INNER per-pass shape —
//     decides which post-FX passes still need work on each of those
//     30 idle frames.
//
//   The two compose naturally: the IdleAccumulator stops the
//   IdleContinuation early when post-FX is the only idle work.

import { withSpanSync } from './otel.js';
import type { RenderContext, RenderPass } from './passes/types.js';

interface PassState {
  framesRendered: number;
  converged: boolean;
}

/** Optional "motion reset" hook implemented by accumulation passes
 *  (TRAA, SSGI) — lets the accumulator notify them to drop their
 *  history buffers when the camera moves. */
interface Resettable {
  onMotionReset(): void;
}

function isResettable(p: RenderPass): p is RenderPass & Resettable {
  return typeof (p as Partial<Resettable>).onMotionReset === 'function';
}

/** Minimum scheduler surface this class needs.  Avoids a hard
 *  dependency on `@pryzm/frame-scheduler` at import time — the
 *  bootstrap wires a real `FrameScheduler` in. */
export interface IdleSchedulerHandle {
  /** Tells the scheduler the idle window is exhausted; rAF can stop
   *  pumping until the next motion event (`markDirty`). */
  stopIdleContinuation(): void;
}

export interface IdleAccumulatorOptions {
  readonly scheduler?: IdleSchedulerHandle;
}

export class IdleAccumulator {
  private readonly passes: RenderPass[] = [];
  private readonly state = new Map<string, PassState>();
  private framesSinceMotion = 0;
  private scheduler: IdleSchedulerHandle | null;
  private ctx: RenderContext | null = null;

  constructor(opts: IdleAccumulatorOptions = {}) {
    this.scheduler = opts.scheduler ?? null;
  }

  /** Bind / re-bind the scheduler handle (bootstrap calls this once
   *  the FrameScheduler exists). */
  attachScheduler(scheduler: IdleSchedulerHandle): void {
    this.scheduler = scheduler;
  }

  /** Bind / re-bind the render context (bootstrap calls this once
   *  the Renderer exists; resize updates it). */
  attachContext(ctx: RenderContext): void {
    this.ctx = ctx;
  }

  /** Register a pass for idle convergence tracking.  Order of
   *  registration matches the order passes will run on each idle
   *  tick. */
  registerPass(pass: RenderPass): void {
    if (this.state.has(pass.id)) {
      throw new Error(`[IdleAccumulator] duplicate pass id: ${pass.id}`);
    }
    this.passes.push(pass);
    this.state.set(pass.id, { framesRendered: 0, converged: false });
  }

  /** Called whenever the scene becomes dirty (camera moves, geometry
   *  edits land, etc.) — resets per-pass convergence so accumulation
   *  passes (TRAA, SSGI) start their budgets fresh. */
  onMotionStart(): void {
    this.framesSinceMotion = 0;
    for (const [, st] of this.state) {
      st.framesRendered = 0;
      st.converged = false;
    }
    for (const p of this.passes) {
      if (isResettable(p)) p.onMotionReset();
    }
  }

  /** Drive one idle tick.  Returns the per-tick summary used by the
   *  bench harness + integration tests. */
  onIdleTick(frameIndex: number, dt = 0): { passesRendered: string[]; allConverged: boolean } {
    return withSpanSync(
      'pryzm.idle.accumulator.tick',
      {
        'idle.frames_since_motion': this.framesSinceMotion,
      },
      (span) => {
        this.framesSinceMotion++;
        const rendered: string[] = [];
        let allConverged = true;

        if (this.ctx === null) {
          // No render context yet — treat every pass as "converged"
          // so we don't spin.  Bootstrap will call attachContext()
          // before the first idle tick in real use.
          span.setAttribute('idle.passes_rendered.count', 0);
          span.setAttribute('idle.all_converged', true);
          return { passesRendered: [], allConverged: true };
        }

        for (const pass of this.passes) {
          const st = this.state.get(pass.id)!;
          if (st.converged) continue;

          if (pass.idleBudgetFrames > 0 && st.framesRendered >= pass.idleBudgetFrames) {
            // Budget reached without an early-out vote — mark
            // converged and skip from now on.
            st.converged = true;
            continue;
          }

          const passConverged = pass.render(this.ctx, dt, frameIndex);
          st.framesRendered++;
          if (passConverged) st.converged = true;
          // Cap-hit AFTER the render: if we've now consumed the
          // budget we mark converged eagerly so the pass is skipped
          // on the next idle tick (and so `allConverged` can flip
          // true on the same tick that exhausts the budget).
          if (
            !st.converged &&
            pass.idleBudgetFrames > 0 &&
            st.framesRendered >= pass.idleBudgetFrames
          ) {
            st.converged = true;
          }
          rendered.push(pass.id);
          if (!st.converged) allConverged = false;
        }

        span.setAttribute('idle.passes_rendered.count', rendered.length);
        span.setAttribute('idle.all_converged', allConverged);

        if (allConverged && this.scheduler !== null) {
          // Wake the loop only on next motion.
          this.scheduler.stopIdleContinuation();
        }

        return { passesRendered: rendered, allConverged };
      },
    );
  }

  /** Snapshot for tests / observability. */
  snapshot(): {
    framesSinceMotion: number;
    passes: { id: string; framesRendered: number; converged: boolean }[];
  } {
    return {
      framesSinceMotion: this.framesSinceMotion,
      passes: this.passes.map((p) => {
        const st = this.state.get(p.id)!;
        return { id: p.id, framesRendered: st.framesRendered, converged: st.converged };
      }),
    };
  }
}
