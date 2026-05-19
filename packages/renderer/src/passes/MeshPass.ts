// MeshPass — single forward pass over the scene graph (S06-T3).
//
// Migrated to the S15 RenderPass interface (PHASE-1C §S15 line 471).
// `idleBudgetFrames = 0` — the MeshPass redraws the static scene; on
// idle it is skipped (the frame buffer already holds the latest
// scene draw).  Returning `true` from `render()` lets the
// IdleAccumulator mark it converged after the first call.
//
// 1A keeps this dead simple: one `renderer.render(scene, camera)`
// call, no shadow maps, no per-object culling tricks.  THREE.js does
// its own frustum culling on every Mesh that has `frustumCulled =
// true` (default).

import type { RenderContext, RenderPass } from './types.js';
import type { TickPriority } from '@pryzm/frame-scheduler';

export class MeshPass implements RenderPass {
  readonly id = 'mesh';
  readonly priority: TickPriority = 'render';
  readonly idleBudgetFrames = 0;

  setup(_ctx: RenderContext): void {
    /* nothing to allocate — scene is owned by the Renderer */
  }

  render(ctx: RenderContext, _dt: number, _frameIndex: number): boolean {
    ctx.renderer.render(ctx.scene, ctx.camera);
    return true; // one-shot per motion event.
  }

  resize(_width: number, _height: number): void {
    /* no per-pass GPU state — Renderer owns the canvas */
  }

  dispose(): void {
    /* no GPU resources owned */
  }
}
