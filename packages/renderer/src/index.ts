// @pryzm/renderer — L5 renderer.  Public surface.
//
// Higher layers should import ONLY from this entry point.  THREE.js is
// firewalled to the package internals by the
// `pryzm-no-three-outside-committer` lint rule.

// ── D.4.1 — scene composition-root entry point (S79-WIRE) ────────────
// `bootstrapScene()` owns the typed input/output contract + the
// `pryzm.bootstrap.scene` OTel span for the scene half of runtime
// composition. composeRuntime delegates to it instead of inlining the
// render-half wiring. See `./SceneBootstrap.ts` header for spec anchors.
export {
  bootstrapScene,
  bootstrapSceneIdle,
  type SceneBootstrapAudit,
  type SceneBootstrapInput,
  type SceneBootstrapResult,
  type SceneSlotShape,
  type RenderEverythingBootstrapFn,
} from './SceneBootstrap.js';

export {
  Renderer,
  RendererInitError,
  type RendererInitOptions,
  type RendererMode,
  type ResolvedRendererMode,
} from './Renderer.js';

// ── D.5.A.7 (2026-04-30 evening) — `MaterialPool` re-export ──────────
// Re-exported here so `@pryzm/runtime-composer` can name `MaterialPool`
// in its `SceneSlot.materialPool: MaterialPool | null` typed surface
// (Wave 4 Track A.7) without adding a new `@pryzm/scene-committer` dep
// edge.  `@pryzm/renderer` already depends on `@pryzm/scene-committer`
// transitively (the renderer holds the shared MaterialPool that
// committers populate), so this re-export is free.  Anchor:
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2 PR 4.A.7`.
export { MaterialPool } from '@pryzm/scene-committer';

// ── D.5.A.9 (2026-04-30 evening) — `FrameScheduler` re-export ────────
// Re-exported here so `@pryzm/runtime-composer` can name
// `FrameScheduler` in its `SceneSlot.scheduler: FrameScheduler | null`
// typed surface (Wave-4 Track A SceneSlot follow-on PR #1) without
// adding a new `@pryzm/frame-scheduler` dep edge.  `@pryzm/renderer`
// already depends on `@pryzm/frame-scheduler` (it owns the
// `IdleAccumulator` orchestrator + the `RafAdapter` is registered by
// the renderer's bootstrap path), so this re-export is dep-edge-free
// at the workspace graph level.  Same canonical pattern as the
// `MaterialPool` re-export above.  Anchor:
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2 SceneSlot follow-on #1`.
export { FrameScheduler } from '@pryzm/frame-scheduler';

// ── D.5.A.10 (2026-04-30 evening) — `CommitterHost` re-export ────────
// Re-exported here so `@pryzm/runtime-composer` can name `CommitterHost`
// in its `SceneSlot.host: CommitterHost` and `SceneSlot.committer:
// CommitterHost` typed surfaces (Wave-4 Track A SceneSlot follow-on
// PR #2) without adding a new `@pryzm/scene-committer` dep edge.
// `@pryzm/renderer` already depends on `@pryzm/scene-committer`
// (the renderer holds the shared MaterialPool that committers populate
// — already exploited by the `MaterialPool` re-export above), so this
// re-export is dep-edge-free at the workspace graph level.  Same
// canonical pattern as the `MaterialPool` and `FrameScheduler`
// re-exports above.  Closes the third (and final) nested `unknown`
// field on `SceneSlot` — after this slice the entire `SceneSlot`
// interface is `unknown`-free.  Anchor:
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2.5 SceneSlot follow-on #2`.
export { CommitterHost } from '@pryzm/scene-committer';
export {
  CameraController,
  type CameraControllerOptions,
  type CameraPose,
  type PlainPose,
  type Vec3Like,
} from './CameraController.js';

// ── Pass plumbing (S15 RenderPass interface) ─────────────────────────
export { Pipeline } from './passes/Pipeline.js';
export type { RenderPass, RenderContext } from './passes/types.js';
export { NOOP_LIFECYCLE } from './passes/types.js';
export { ClearPass } from './passes/ClearPass.js';
export { MeshPass } from './passes/MeshPass.js';

// ── Post-FX passes (S15) ─────────────────────────────────────────────
export { BloomPass, type BloomOptions } from './passes/Bloom.js';
export {
  TRAAPass,
  TRAA_HISTORY_LENGTH,
  type TRAAOptions,
} from './passes/TRAA.js';
export {
  SSGIPass,
  SSGI_MAX_FRAMES,
  SSGI_EARLY_OUT_VARIANCE,
  type SSGIOptions,
} from './passes/SSGI.js';

// ── Idle accumulation orchestrator (S15, ADR-0014) ──────────────────
export {
  IdleAccumulator,
  type IdleAccumulatorOptions,
  type IdleSchedulerHandle,
} from './IdleAccumulator.js';
