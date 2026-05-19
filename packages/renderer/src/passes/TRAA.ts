// TRAAPass — temporal reprojective anti-alias, accumulation pass.
//
// Spec: PHASE-1C §S15 line 490-496 (S15 D3 deliverable).
// ADR-0014 — `idleBudgetFrames = 16` (Halton(2,3) jitter sequence
// length; matches PRYZM 1's TRAAComposer.MAX_HISTORY).
//
// What TRAA does:
//   1. Each frame, jitter the camera projection matrix by a sub-pixel
//      offset drawn from a Halton(2, 3) sequence — same sequence PRYZM 1
//      uses (`src/rendering/post/jitter.ts`).  Index = frame % 16.
//   2. Render the scene jittered into a "current frame" buffer.
//   3. Sample the previous frame's accumulation buffer at the
//      reprojected UV (current_uv - motion_vector).
//   4. Reject reprojected samples by:
//        * |depth_curr - depth_prev| > epsilon  → disocclusion
//        * any cross-component motion magnitude > 1px → fast move
//      Rejected pixels fall back to a 3×3 spatial blur.
//   5. Blend  output = lerp(reprojected, current, 1/N)  where N grows
//      from 1 up to MAX_HISTORY=16.  After 16 samples the history
//      buffer is fully populated and `render()` returns `true`
//      (converged) so the IdleAccumulator can skip subsequent idle
//      frames.
//
// Convergence early-out:
//   `framesAccumulated >= 16` ⇒ converged.  In practice, motion vectors
//   already gate per-pixel samples; the global early-out is a hard cap
//   to bound idle CPU per ADR-0014.

import * as THREE from '@pryzm/renderer-three/three';
import { withSpanSync } from '../otel.js';
import type { RenderContext, RenderPass } from './types.js';
import type { TickPriority } from '@pryzm/frame-scheduler';

const HALTON23: ReadonlyArray<readonly [number, number]> = (() => {
  // Halton(2, 3), 16 samples, in [-0.5, 0.5] sub-pixel space.
  const halton = (i: number, base: number): number => {
    let f = 1;
    let r = 0;
    let idx = i;
    while (idx > 0) {
      f /= base;
      r += f * (idx % base);
      idx = Math.floor(idx / base);
    }
    return r;
  };
  return Array.from({ length: 16 }, (_, i) => [
    halton(i + 1, 2) - 0.5,
    halton(i + 1, 3) - 0.5,
  ] as const);
})();

export const TRAA_HISTORY_LENGTH = 16; // matches ADR-0014; PRYZM 1 cap.

export interface TRAAOptions {
  /** Sub-pixel jitter strength.  1.0 = full pixel.  Default 1.0. */
  readonly jitterStrength?: number;
}

export class TRAAPass implements RenderPass {
  readonly id = 'traa';
  readonly priority: TickPriority = 'post-render';
  readonly idleBudgetFrames = TRAA_HISTORY_LENGTH; // 16 — ADR-0014.

  private readonly jitterStrength: number;
  private framesAccumulated = 0;
  private historyTarget: THREE.WebGLRenderTarget | null = null;
  private currentTarget: THREE.WebGLRenderTarget | null = null;
  private disocclusionPixels = 0; // exposed via OTel for debugging.

  constructor(opts: TRAAOptions = {}) {
    this.jitterStrength = opts.jitterStrength ?? 1.0;
  }

  setup(ctx: RenderContext): void {
    if (this.historyTarget !== null) return;
    this.historyTarget = new THREE.WebGLRenderTarget(ctx.width, ctx.height, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    this.currentTarget = new THREE.WebGLRenderTarget(ctx.width, ctx.height, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
  }

  /** Reset accumulation — called by IdleAccumulator on motion start
   *  via the `onMotionReset()` hook (the accumulator dispatches its
   *  own reset; this hook is the renderer-side notification). */
  onMotionReset(): void {
    this.framesAccumulated = 0;
    this.disocclusionPixels = 0;
  }

  render(ctx: RenderContext, _dt: number, _frameIndex: number): boolean {
    if (this.historyTarget === null) this.setup(ctx);
    return withSpanSync(
      'pryzm.render.traa',
      {
        'traa.frames_since_motion': this.framesAccumulated,
      },
      (span) => {
        const t0 = performance.now();
        // 1. Apply Halton jitter to the camera projection matrix.
        const jitterIdx = this.framesAccumulated % HALTON23.length;
        const [jx, jy] = HALTON23[jitterIdx]!;
        const projOffsetX = (jx * this.jitterStrength) / ctx.width;
        const projOffsetY = (jy * this.jitterStrength) / ctx.height;
        ctx.camera.projectionMatrix.elements[8]! += projOffsetX * 2;
        ctx.camera.projectionMatrix.elements[9]! += projOffsetY * 2;

        // 2-5. Render jittered + reproject + reject + blend.
        // The full shader chain is deferred to S15 D8's visual-diff
        // landing — the L5 RenderPass surface here is what the
        // IdleAccumulator and bench harness consume.  The skeleton
        // updates accumulator state correctly; the pixel-level shader
        // is wired in via the Pipeline composite step (S15 D5).
        ctx.renderer.render(ctx.scene, ctx.camera);

        // Restore matrix (camera is shared across passes).
        ctx.camera.projectionMatrix.elements[8]! -= projOffsetX * 2;
        ctx.camera.projectionMatrix.elements[9]! -= projOffsetY * 2;

        this.framesAccumulated++;
        const converged = this.framesAccumulated >= TRAA_HISTORY_LENGTH;

        const dur = performance.now() - t0;
        span.setAttribute('traa.duration_ms', Number(dur.toFixed(3)));
        span.setAttribute('traa.disocclusion_pixels', this.disocclusionPixels);
        span.setAttribute('traa.converged', converged);
        return converged;
      },
    );
  }

  resize(width: number, height: number): void {
    this.historyTarget?.setSize(width, height);
    this.currentTarget?.setSize(width, height);
    // Resize invalidates the history buffer.
    this.framesAccumulated = 0;
  }

  dispose(): void {
    this.historyTarget?.dispose();
    this.currentTarget?.dispose();
    this.historyTarget = null;
    this.currentTarget = null;
    this.framesAccumulated = 0;
  }

  /** Test/observability accessor — number of frames already
   *  accumulated since the last motion reset. */
  get framesRendered(): number {
    return this.framesAccumulated;
  }
}
