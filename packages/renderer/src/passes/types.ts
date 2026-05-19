// L5 RenderPass contract — frozen S15 D1 (PHASE-1C §S15 line 471).
//
// This is the interface every render pass implements once S15 lands.
// It supersedes the minimal `Pass` interface that lived in
// `Pipeline.ts` for sprints S06–S14 (single `render(renderer,scene,
// camera)` method).  The richer surface unlocks:
//
//   * `idleBudgetFrames`  — per-pass convergence budget consumed by
//                           `IdleAccumulator` (ADR-0014).
//   * `setup` / `dispose` — explicit lifecycle for render targets and
//                           shader programs allocated lazily on the
//                           first frame.
//   * `resize`            — for accumulation passes that own history
//                           buffers sized to the canvas.
//   * `render` returns    — passes vote `true` ("I'm converged") to
//                           let the IdleAccumulator skip them on
//                           subsequent idle ticks.
//
// THREE is firewalled to this package by the
// `pryzm/no-three-outside-committer` lint rule (eslint.config.js
// `RENDERER_ALLOW`).  Importing `three` here is allowed; the type
// surface intentionally exposes `RenderContext` so callers across the
// L5 boundary never see `THREE.*`.

import type * as THREE from '@pryzm/renderer-three/three';
import type { TickPriority } from '@pryzm/frame-scheduler';

/** Render context handed to every pass each tick.  Read-only — passes
 *  do not mutate the renderer / scene / camera; they sample them. */
export interface RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Canvas pixel size.  Mirrors `renderer.getSize()` but is cached on
   *  the context so passes don't re-query every frame. */
  readonly width: number;
  readonly height: number;
}

/** A unit of per-frame render work.  Frozen S15 D1.
 *
 *  Implementations live in `packages/renderer/src/passes/*.ts`.
 *  Registration order matters — the Pipeline executes passes in the
 *  order they were added, and within a single Pipeline two passes with
 *  the same `priority` run in registration order.
 */
export interface RenderPass {
  /** Stable identity — used as the OTel attribute `pryzm.render.pass.id`
   *  and as the IdleAccumulator's per-pass key.  Lowercase, no spaces.
   *  Examples: `'clear'`, `'mesh'`, `'bloom'`, `'traa'`, `'ssgi'`. */
  readonly id: string;

  /** TickPriority lane this pass runs in (orthogonal to the
   *  FrameScheduler queue-class Priority).  Most rendering work is
   *  `'render'` or `'post-render'`; the SSGI pre-trace is `'render'`
   *  (it feeds composite inputs); bloom/TRAA composite at
   *  `'post-render'`. */
  readonly priority: TickPriority;

  /** Convergence budget per ADR-0014.  `0` means "one-shot" — `render`
   *  returns `true` on its first call.  `> 0` means "may consume up to
   *  N idle frames before the IdleAccumulator marks the pass
   *  converged regardless of its return value". */
  readonly idleBudgetFrames: number;

  /** Lazy-init hook.  Called once before the first `render()` (or
   *  again after a `dispose()`).  Allocate render targets, compile
   *  shaders, etc. here — NOT in the constructor — so the pass can be
   *  registered with the Pipeline without owning a GPU context. */
  setup(ctx: RenderContext): void;

  /** Render this pass for the current frame.
   *
   *  @param ctx        — current RenderContext.
   *  @param dt         — wall-clock delta since the previous frame, ms.
   *  @param frameIndex — monotonic frame counter from the scheduler.
   *  @returns          — `true` if the pass output is fully converged
   *                      ("I'm done; skip me on subsequent idle ticks
   *                      until motion resumes").  One-shot passes
   *                      always return `true`.
   */
  render(ctx: RenderContext, dt: number, frameIndex: number): boolean;

  /** Resize hook — called when the canvas size changes.  Accumulation
   *  passes resize their history buffers here. */
  resize(width: number, height: number): void;

  /** Free GPU resources.  Idempotent.  Pipeline disposes every pass on
   *  Renderer.dispose(). */
  dispose(): void;
}

/** Convenience: a pass that has no setup/resize/dispose work to do.
 *  Implementations can spread this in to satisfy the interface
 *  without writing four empty methods. */
export const NOOP_LIFECYCLE = {
  setup(_ctx: RenderContext): void {},
  resize(_w: number, _h: number): void {},
  dispose(): void {},
} as const;
