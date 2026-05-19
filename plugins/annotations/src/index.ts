/// <reference path="./global-window-augment.d.ts" />
// @pryzm/plugin-annotations — public surface (S34 / ADR-0026).
//
// Sprint C full (S5.1-P2 2026-05-10): All 37 annotation files extracted from
// src/engine/subsystems/annotations/ into plugins/annotations/src/.
// Previous partial Sprint C: 10 files in subsystem/.
// This sprint (full C completion): remaining 27 files migrated.

// ── subsystem core types (extracted in Sprint C) ─────────────────────────────

export {
    type SubElementType,
    type StableReference,
    type ResolverStores,
    makeStableKey,
    makeRef,
    makePointRef,
    makeWallFaceRef,
    resolveReferenceToPoint,
} from './subsystem/AnnotationReference.js';

export {
    type AnnotationType,
    type AnnotationStyle,
    type AnnotationGeometry2D,
    type AnnotationSemantics,
    type AnnotationElement,
    type DimensionElement,
    type DimPoint2D,
    type LinearDimSegment,
    DEFAULT_ANNOTATION_STYLE,
    makeAnnotationElement,
} from './subsystem/AnnotationTypes.js';

export {
    type ValidationOutcome,
    validateAnnotationParameters,
} from './subsystem/AnnotationParametersSchema.js';

export {
    AnnotationStore,
    annotationStore,
} from './subsystem/AnnotationStore.js';

export {
    AnnotationDependencyGraph,
} from './subsystem/AnnotationDependencyGraph.js';

export {
    AnnotationVisibilityStore,
    annotationVisibilityStore,
} from './subsystem/AnnotationVisibilityStore.js';

export {
    AnnotationVisibilityPanel,
} from './subsystem/AnnotationVisibilityPanel.js';

export {
    type ConstraintOperator,
    type ConstraintRecord,
    ConstraintStore,
    constraintStore,
} from './subsystem/ConstraintStore.js';

export {
    type ConstraintResult,
    ConstraintSolver,
    constraintSolver,
} from './subsystem/ConstraintSolver.js';

export {
    type DimScreenPoint,
    type WallDimRenderParams,
    type WallDimStringRenderParams,
    WallDimensionRenderer,
} from './subsystem/WallDimensionRenderer.js';

// ── store re-export from @pryzm/plugin-sdk ───────────────────────────────────
// The @pryzm/stores AnnotationStore (Zustand slice) is re-exported here
// for ergonomic plugin-side imports. Named differently to avoid collision
// with the subsystem's in-memory AnnotationStore class above.

export {
    AnnotationStore as StoreAnnotationStore,
    type AnnotationData,
    type AnnotationId,
    type AnnotationsState,
} from '@pryzm/plugin-sdk';

// ── error types ───────────────────────────────────────────────────────────────

export {
    AnnotationSystemError,
    AnnotationNotFoundError,
    AnnotationSchemaError,
    isAnnotationSystemError,
} from './errors.js';

// ── intent constants ──────────────────────────────────────────────────────────

export {
    isFiniteVec3,
    isAnnotationKind,
    ANNOTATION_KINDS,
    ANNOTATION_TEXT_HEIGHT_MAX_MM,
    type AnnotationKindLiteral,
} from './intent.js';

// ── command handlers ──────────────────────────────────────────────────────────

export {
    ANNOTATION_HANDLER_TYPES,
    buildAnnotationHandlerSet,
    registerAnnotationHandlers,
    type AnnotationHandlerType,
    CreateAnnotationHandler, type CreateAnnotationPayload,
    DeleteAnnotationHandler, type DeleteAnnotationPayload,
    MoveAnnotationHandler, type MoveAnnotationPayload,
    SetAnnotationTextHandler, type SetAnnotationTextPayload,
    SetAnnotationKindHandler, type SetAnnotationKindPayload,
    SetAnnotationRotationHandler, type SetAnnotationRotationPayload,
    SetAnnotationTextHeightHandler, type SetAnnotationTextHeightPayload,
    SetAnnotationColorHandler, type SetAnnotationColorPayload,
} from './handlers/index.js';

// ── text note tool ────────────────────────────────────────────────────────────
// TextNoteTool class is exported from tools/ (Sprint C implementation).
// Auxiliary types are re-exported from the legacy tool.ts for compatibility.

export { TextNoteTool } from './tools/TextNoteTool.js';
export type {
    TextNoteToolOptions,
    TextNoteCreatePayload,
    AnnotationCommandBus,
    ScreenToWorldFn,
} from './tool.js';

// ── annotation tools (Sprint C — all remaining tool classes) ──────────────────

export { ElementTagTool } from './tools/ElementTagTool.js';
export { AngularDimensionAnnotationTool, AngularDimToolState } from './tools/AngularDimensionAnnotationTool.js';
export { SpotElevationAnnotationTool } from './tools/SpotElevationAnnotationTool.js';
export type { SpotElevationUnit } from './tools/SpotElevationAnnotationTool.js';
export { KeynoteTool } from './tools/KeynoteTool.js';
export { LinearDimensionAnnotationTool, LinearDimToolState } from './tools/LinearDimensionAnnotationTool.js';
export { RadiusDimensionTool, RadiusDimToolState } from './tools/RadiusDimensionTool.js';
export { DiameterDimensionTool, DiameterDimToolState } from './tools/DiameterDimensionTool.js';
export { SlopeDimensionTool, SlopeDimToolState } from './tools/SlopeDimensionTool.js';
export { DoorTagTool } from './tools/DoorTagTool.js';
export { WindowTagTool } from './tools/WindowTagTool.js';
export { LevelTagTool } from './tools/LevelTagTool.js';
export { GridBubbleTool } from './tools/GridBubbleTool.js';
export { RevisionCloudTool } from './tools/RevisionCloudTool.js';
export { SectionMarkTool } from './tools/SectionMarkTool.js';
export { ElevationMarkTool } from './tools/ElevationMarkTool.js';
export { CalloutDetailTool } from './tools/CalloutDetailTool.js';
export { MatchlineTool } from './tools/MatchlineTool.js';
export { NorthArrowTool } from './tools/NorthArrowTool.js';
export { ScaleBarTool } from './tools/ScaleBarTool.js';
export { SectionGridLineBuilder, sectionGridLineBuilder } from './tools/SectionGridLineBuilder.js';
export { LevelDatumLineBuilder, levelDatumLineBuilder } from './tools/LevelDatumLineBuilder.js';

// ── plan-view adapter ─────────────────────────────────────────────────────────

export {
    bindAnnotationStoreToPlanView,
    toPlanViewAnnotationLike,
    rendererKindFor,
    type PlanSourceStoreShape,
    type PlanViewAnnotationLikeShape,
    type RendererKind,
} from './plan-view-adapter.js';

// ── Sprint C full: remaining 27 files migrated ────────────────────────────────

export { type DimensionUnit, formatDimension } from './subsystem/DimensionFormatter.js';
export { type ViewLinkInfo, ViewLinkResolver, viewLinkResolver } from './subsystem/ViewLinkResolver.js';

export {
    type WallFaceType, type WallFaceHit, type WallCoreOffsets, type WallData, type WallLayer,
    ALL_WALL_FACE_TYPES, detectWallFace, computeWallCoreOffsets, wallFaceSignedOffset,
} from './plantools/WallFaceDetector.js';

export { LinearDimOptionsBar } from './plantools/LinearDimOptionsBar.js';

export { CreateAnnotationCommand } from './commands/CreateAnnotationCommand.js';
export { DeleteAnnotationCommand } from './commands/DeleteAnnotationCommand.js';
export { UpdateAnnotationCommand } from './commands/UpdateAnnotationCommand.js';
export { LockAnnotationCommand, type LockAnnotationOptions } from './commands/LockAnnotationCommand.js';
export { UpdateConstraintCommand } from './commands/UpdateConstraintCommand.js';
export { CreateSectionMarkCommand, type CreateSectionMarkParams } from './commands/CreateSectionMarkCommand.js';
export { CreateElevationMarkCommand, type CreateElevationMarkParams } from './commands/CreateElevationMarkCommand.js';
export { CreateCalloutDetailCommand, type CreateCalloutDetailParams } from './commands/CreateCalloutDetailCommand.js';

export {
    CommandType,
    type Command, type CommandContext, type CommandValidationResult,
    type CommandResult, type SerializedCommand,
} from './legacy-command-protocol.js';

export { ConstraintViolationPanel } from './ConstraintViolationPanel.js';
export { DimensionPropertiesPanel } from './DimensionPropertiesPanel.js';
export { OBCAnnotationAdapter, obcAnnotationAdapter } from './OBCAnnotationAdapter.js';
export { AnnotationRenderLayer, type DimHoverHint } from './AnnotationRenderLayer.js';
export { AnnotationManager } from './AnnotationManager.js';
export { injectAnnotationStyles } from './annotation-styles.js';
