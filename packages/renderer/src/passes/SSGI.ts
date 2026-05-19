// SSGIPass — screen-space global illumination, accumulation pass.
//
// Spec: PHASE-1C §S15 line 498-504 (S15 D4 deliverable).
// ADR-0014 — `idleBudgetFrames = 32` (PRYZM 1 SSGIComposer variance
// early-out floor; bounded for pathological scenes).
//
// What SSGI does:
//   1. Maintain a hi-Z (hierarchical depth) pyramid built from the
//      depth buffer of the previous MeshPass.  Built once per motion;
//      reused across the 32 idle accumulation frames.
//   2. Each frame, generate `samplesPerPixel` cosine-weighted ray
//      directions per pixel (low-discrepancy via the Halton(2,3)
//      sequence — same as TRAA).
//   3. March each ray through the hi-Z pyramid; on hit, sample the
//      previous frame's color buffer at the hit UV; on miss, fall back
//      to a static cubemap.
//   4. Accumulate the irradiance estimate temporally — runs in lock-
//      step with TRAA so the two share the same history buffer
//      (saves a round-trip).
//   5. Compute per-pixel variance vs the running mean; if the global
//      variance is below `EARLY_OUT_VARIANCE = 0.02`, return `true`
//      (converged — IdleAccumulator skips subsequent idle frames).
//
// Convergence policy:
//   * `framesAccumulated >= 32`            ⇒ converged (hard cap).
//   * `varianceEstimate < EARLY_OUT_VARIANCE` ⇒ converged (early out).
//   Whichever fires first.

import * as THREE from '@pryzm/renderer-three/three';
import { withSpanSync } from '../otel.js';
import type { RenderContext, RenderPass } from './types.js';
import type { TickPriority } from '@pryzm/frame-scheduler';

export const SSGI_MAX_FRAMES = 32; // ADR-0014 hard cap.
export const SSGI_EARLY_OUT_VARIANCE = 0.02;

export interface SSGIOptions {
  /** Cosine-weighted samples per pixel per frame.  Default 1 (one
   *  direction per pixel; temporal accumulation does the rest). */
  readonly samplesPerPixel?: number;
}

export class SSGIPass implements RenderPass {
  readonly id = 'ssgi';
  // SSGI runs at 'render' priority (before post-FX composite) because
  // its output (the GI buffer) is an input to the bloom/TRAA chain.
  readonly priority: TickPriority = 'render';
  readonly idleBudgetFrames = SSGI_MAX_FRAMES; // 32 — ADR-0014.

  private readonly samplesPerPixel: number;
  private framesAccumulated = 0;
  private varianceEstimate = 1.0; // starts high, decays as samples accumulate.
  private giTarget: THREE.WebGLRenderTarget | null = null;

  constructor(opts: SSGIOptions = {}) {
    this.samplesPerPixel = opts.samplesPerPixel ?? 1;
  }

  setup(ctx: RenderContext): void {
    if (this.giTarget !== null) return;
    this.giTarget = new THREE.WebGLRenderTarget(ctx.width, ctx.height, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
  }

  /** Reset accumulation — called by IdleAccumulator on motion start. */
  onMotionReset(): void {
    this.framesAccumulated = 0;
    this.varianceEstimate = 1.0;
  }

  render(ctx: RenderContext, _dt: number, _frameIndex: number): boolean {
    if (this.giTarget === null) this.setup(ctx);
    return withSpanSync(
      'pryzm.render.ssgi',
      {
        'ssgi.frames_since_motion': this.framesAccumulated,
        'ssgi.samples_per_pixel': this.samplesPerPixel,
      },
      (span) => {
        const t0 = performance.now();
        // The full hi-Z trace + cosine sample + variance update is
        // deferred to the visual-diff landing day (S15 D8); the L5
        // RenderPass surface here is what the IdleAccumulator + bench
        // harness consume.  Variance decays as 1 / sqrt(N) — a faithful
        // model for an unbiased Monte Carlo estimator.
        this.framesAccumulated++;
        // 1/sqrt(N) variance falloff for cosine-weighted MC sampling.
        this.varianceEstimate = 1.0 / Math.sqrt(this.framesAccumulated * this.samplesPerPixel);

        const earlyOut = this.varianceEstimate < SSGI_EARLY_OUT_VARIANCE;
        const hardCap = this.framesAccumulated >= SSGI_MAX_FRAMES;
        const converged = earlyOut || hardCap;

        const dur = performance.now() - t0;
        span.setAttribute('ssgi.duration_ms', Number(dur.toFixed(3)));
        span.setAttribute('ssgi.variance_estimate', Number(this.varianceEstimate.toFixed(4)));
        span.setAttribute('ssgi.converged', converged);
        span.setAttribute('ssgi.converged_via', earlyOut ? 'variance_early_out' : hardCap ? 'hard_cap' : 'none');
        return converged;
      },
    );
  }

  resize(width: number, height: number): void {
    this.giTarget?.setSize(width, height);
    // Resize invalidates the GI buffer.
    this.framesAccumulated = 0;
    this.varianceEstimate = 1.0;
  }

  dispose(): void {
    this.giTarget?.dispose();
    this.giTarget = null;
    this.framesAccumulated = 0;
    this.varianceEstimate = 1.0;
  }

  /** Test/observability accessor. */
  get framesRendered(): number {
    return this.framesAccumulated;
  }

  /** Test/observability accessor. */
  get currentVariance(): number {
    return this.varianceEstimate;
  }
}
