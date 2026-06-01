// @pryzm/scene-committer — public barrel.
//
// L5 module.  See `docs/04-reference/architecture-detail/scene-committer.md` for the design
// brief and ADR-005 for the interface ratification.

export type { ElementId, MaterialHandle, PrimitiveCommitter } from './types.js';
export { SceneRegistry } from './SceneRegistry.js';
export { MaterialPool } from './MaterialPool.js';
export {
  CommitterHost,
  type CommitterHostOptions,
  type SceneDelta,
} from './CommitterHost.js';
export {
  bindStore,
  diffToDeltas,
  type BindStoreHandle,
  type BindStoreOptions,
} from './dispatcher.js';

// S34 Track C / Phase 2B Supplement §A4 — Canvas2D DimensionCommitter.
// Distinct from the THREE-bound `plugins/dimensions/.../DimensionCommitter`
// (S29 Track A), which renders body meshes for the perspective viewer.  This
// module renders to a Canvas2D context for the headless plan-view pipeline
// and is loadable in Node test harnesses (no THREE, no DOM polyfill).
export {
  commitDimensions,
  type Canvas2DLike,
  type ViewTransformMatrix,
} from './dimensions.js';

// Wave A16-T3 (S122) — scene management utilities extracted from
// src/engine/subsystems/core/scene/ using the strangler-fig pattern.
// The src/ originals now re-export from here; all consumers continue to
// compile without any import-path changes.
export {
  BIM_LAYER,
  EDITOR_LAYER,
  ANNOTATION_LAYER,
  PLAN_SYMBOL_LAYER,
  DOCUMENTATION_LAYER,
} from './SceneLayers.js';
export { SceneObjectClassifier } from './SceneObjectClassifier.js';
export { SceneBoundsCache } from './SceneBoundsCache.js';
export { PreviewRegistry, previewRegistry } from './PreviewRegistry.js';
export { StairPlanSymbolRegistry, stairPlanSymbolRegistry } from './StairPlanSymbolRegistry.js';
export { LODManager, type LODTier, type LODThresholds } from './LODManager.js';

// ADR-046 · C04 §3.5 — Task 4.1: InstancedMesh coalescing post-batch.
// Reduces draw calls from O(walls) to O(levels × materialTypes) after a
// curtain-wall batch by merging per-wall InstancedMeshes into unified groups.
export { InstancedMeshCoalescer } from './InstancedMeshCoalescer.js';
