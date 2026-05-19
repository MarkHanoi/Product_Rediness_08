// Pipeline — ordered list of RenderPass instances, S15 shape.
//
// Spec source: PHASE-1A §S06-T3 (line 580) — original 1A shape.
// Spec source: PHASE-1C §S15 (line 467-514) — S15 RenderPass upgrade
//   replaces the minimal `Pass` interface with a richer `RenderPass`
//   that carries `idleBudgetFrames` + `setup` / `render` / `resize` /
//   `dispose` lifecycle.
//
// Pipeline responsibilities:
//   * Maintain registration order.  Passes drain in registration
//     order; within the same `TickPriority` lane the registration
//     order is the tie-break.
//   * Wrap each `pass.render()` in a `pryzm.render.pass` OTel span
//     (with `pass.id`, `pass.duration_ms`, `pass.priority`,
//     `pass.idle_frame_index`, `pass.converged` attributes).
//   * Reset `renderer.info` before the first pass each frame so
//     the per-frame OTel attributes report only this frame's work.
//   * Dispose every pass on `Pipeline.dispose()`.
//
// The IdleAccumulator (separate file) is the orchestrator that
// decides WHICH passes run on a given idle frame; the Pipeline
// itself just runs whatever passes the caller hands it in order.

import { withSpanSync } from '../otel.js';
import type { RenderContext, RenderPass } from './types.js';

export type { RenderPass, RenderContext } from './types.js';

export class Pipeline {
  private readonly passList: RenderPass[];
  private readonly setupComplete = new Set<string>();

  constructor(passes: readonly RenderPass[]) {
    if (passes.length === 0) {
      throw new Error('[Pipeline] cannot construct an empty pipeline.');
    }
    this.passList = [...passes];
  }

  /** Read-only view of the registered passes.  Useful for tests and
   *  for the IdleAccumulator to register against the same set. */
  get passes(): readonly RenderPass[] {
    return this.passList;
  }

  /** Append a pass at the end of the pipeline.  Used by bootstrap to
   *  add post-FX behind the `?postfx=on` flag. */
  add(pass: RenderPass): void {
    if (this.passList.some((p) => p.id === pass.id)) {
      throw new Error(`[Pipeline] duplicate pass id: ${pass.id}`);
    }
    this.passList.push(pass);
  }

  /** Run every pass in registration order.  Each pass.render() is
   *  wrapped in a `pryzm.render.pass` span. */
  render(ctx: RenderContext, dt = 0, frameIndex = 0): void {
    ctx.renderer.info.reset();
    for (const pass of this.passList) {
      if (!this.setupComplete.has(pass.id)) {
        pass.setup(ctx);
        this.setupComplete.add(pass.id);
      }
      withSpanSync(
        'pryzm.render.pass',
        {
          'pass.id': pass.id,
          'pass.priority': pass.priority,
          'pass.idle_budget_frames': pass.idleBudgetFrames,
          'pass.idle_frame_index': frameIndex,
        },
        (span) => {
          const t0 = performance.now();
          const converged = pass.render(ctx, dt, frameIndex);
          const dur = performance.now() - t0;
          span.setAttribute('pass.duration_ms', Number(dur.toFixed(3)));
          span.setAttribute('pass.converged', converged);
        },
      );
    }
  }

  resize(width: number, height: number): void {
    for (const pass of this.passList) pass.resize(width, height);
  }

  dispose(): void {
    for (const pass of this.passList) pass.dispose();
    this.setupComplete.clear();
  }
}
