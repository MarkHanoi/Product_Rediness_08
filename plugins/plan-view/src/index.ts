// @pryzm/plugin-plan-view — public surface.
//
// History:
//   • S29  — first cut (`code-level ADR docs/02-decisions/adrs/0028-plan-view-canvas-architecture.md`).
//   • S31  — promotes the skeleton to first full plan-view implementation
//            (`code-level ADR docs/02-decisions/adrs/0023-plan-view-canvas2d-renderer.md`).

export { LevelStore, type LevelData } from './LevelStore.js';
export {
  PlanCamera,
  type PlanScreenPoint,
  type PlanWorldPoint,
  type CanvasContext2DLike,
  type PlanCameraOptions,
} from './PlanCamera.js';
export {
  projectPlanScene,
  type PlanPoint,
  type PlanSegment,
  type PlanPolygon,
  type PlanScene,
  type ProjectPlanSceneInput,
} from './projection.js';
export {
  CanvasHost,
  type CanvasFactory,
  type CanvasHostOptions,
} from './CanvasHost.js';
export {
  PlanViewCanvasHost,
  type PlanViewSourceStore,
  type PlanViewCanvasHostOptions,
  type PlanViewAnnotationLike,
  type PlanViewRoomLike,
  type PlanViewStructuralLike,
  type PlanViewDimensionLike,
} from './PlanViewCanvasHost.js';
export {
  PlanViewRenderer,
  type PlanViewData,
  type PlanViewRendererOptions,
  type PlanViewRendererPalette,
  type PlanRenderingContext2D,
  type PlanRoomPolygon,
  type PlanAnnotationLabel,
  type PlanSlabOutline,
  type PlanDoorBreak,
} from './PlanViewRenderer.js';

// S32 — Plan-view annotation pipeline (layout / committer split).
// See `docs/02-decisions/adrs/0024-plan-view-annotation-pipeline.md`.
export {
  layoutAnnotations,
  type AnnotationDto,
  type AnnotationLayout,
  type LayoutCamera,
  type Vec2,
} from './annotation-renderer.js';
export {
  AnnotationCommitter,
  type AnnotationCommitContext2D,
  type AnnotationCommitterOptions,
} from './annotation-committer.js';
export {
  withSpan,
  setTracer,
  getTracer,
  SPAN,
  type Tracer,
} from './tracing.js';

// S33 — Contract 44 closure (G1–G10).
// See `docs/02-decisions/adrs/0025-plan-view-svp-parity-contract-44.md`.
export {
  StyleResolver,
  type ElementStyle,
  type ViewStyleOverride,
} from './style-resolver.js';
export {
  scopeToLevel,
  scopeToActiveLevels,
  scopeToLinkedModel,
  levelOfDoor,
  indexWallsById,
  type ScopedLevelId,
} from './level-scoped-renderers.js';
export { ViewElementVisibility } from './view-element-visibility.js';
export {
  buildPlanHitTest,
  type HitTestFn,
  type PlanHitTestInput,
} from './hit-test.js';
export {
  PlanViewSelection,
  type PlanViewSelectionOptions,
  type PlanCommandBus,
  type ElementKindLookup,
} from './selection.js';
export {
  PlanViewDrag,
  type PlanViewDragOptions,
  type PlanFrameScheduler,
  type SelectedIdsLookup,
  type ElementPositionLookup,
} from './drag.js';

// Wave 11 recipe completion — handlers + intent.
export { PLAN_VIEW_COMMANDS, registerPlanViewHandlers } from './handlers/index.js';
export type {
  PlanViewCommandId,
  PlanViewHandlerDeps,
  PlanViewHandlerType,
} from './handlers/index.js';
export { PLAN_VIEW_COMMANDS as PLAN_VIEW_INTENTS } from './intent.js';
export type { PlanViewIntentDeps } from './intent.js';
