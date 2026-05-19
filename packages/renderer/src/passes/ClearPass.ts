// ClearPass — clears color + depth at the top of every frame (S06-T3).
//
// Migrated to the S15 RenderPass interface (PHASE-1C §S15 line 471).
// `idleBudgetFrames = 0` — clear is one-shot and trivially "converged"
// after the first call.  In practice the IdleAccumulator skips it on
// idle ticks because there's nothing to keep clearing once motion has
// stopped (the frame buffer is already cleared).
//
// In WebGLRenderer, `setClearColor()` only stores the value; the
// actual `gl.clear()` happens inside `renderer.render()` when
// `autoClear` is true.

import type { RenderContext, RenderPass } from './types.js';
import type { TickPriority } from '@pryzm/frame-scheduler';

export class ClearPass implements RenderPass {
  readonly id = 'clear';
  readonly priority: TickPriority = 'pre-render';
  readonly idleBudgetFrames = 0;

  private readonly clearColor: number;

  constructor(clearColor: number) {
    this.clearColor = clearColor;
  }

  setup(_ctx: RenderContext): void {
    /* nothing to allocate */
  }

  render(ctx: RenderContext, _dt: number, _frameIndex: number): boolean {
    ctx.renderer.autoClear = true;
    ctx.renderer.setClearColor(this.clearColor, 1);
    return true; // one-shot.
  }

  resize(_width: number, _height: number): void {
    /* clear is resolution-agnostic */
  }

  dispose(): void {
    /* no GPU resources owned */
  }
}
