export type { CurtainGridLine, CurtainGridSystem } from './CurtainGridSystem.js';
export {
    migrateToGridSystem,
    derivedGridLineId,
    insertGridLine,
    removeGridLine,
    validateGridSystem,
} from './CurtainGridSystem.js';

export type { CurtainCell } from './CurtainCellComputer.js';
export { computeCurtainCells, findCell, cellArea } from './CurtainCellComputer.js';

export type {
    PanelType,
    PanelRenderDefaults,
    CurtainPanelHostedDoor,
    CurtainPanelData,
} from './CurtainPanelTypes.js';
export {
    VALID_PANEL_TYPES,
    PANEL_TYPE_DEFAULTS,
    DEFAULT_HOSTED_DOOR,
    isValidPanelType,
    panelTypeSchema,
    parsePanelType,
} from './CurtainPanelTypes.js';

export type {
    CurtainWallDrawingMode,
    CurtainWallData,
    CurtainWallToolCallbacks,
} from './CurtainWallTypes.js';

export type {
    CurtainSubElement,
    CurtainSubElementPanel,
    CurtainSubElementMullion,
} from './CurtainSubElementTypes.js';

export type { InstanceManagerResult } from './CurtainWallInstanceManager.js';
export { CurtainWallInstanceManager } from './CurtainWallInstanceManager.js';

export { CurtainPanelBuilder } from './CurtainPanelBuilder.js';

export { getPanelDefinition } from './CurtainPanelFactory.js';

export { CurtainWallStore } from './CurtainWallStore.js';
export { CurtainPanelStore } from './CurtainPanelStore.js';
export { CurtainPanelSyncHandler } from './CurtainPanelSyncHandler.js';

export { CurtainWallBuilder } from './CurtainWallBuilder.js';

export { GeometryWorkerPool } from './GeometryWorkerPool.js';

export type {
    SerializableCell,
    BoxGeomArrays,
    FallbackPanelResult,
    GeometryWorkerRequest,
    GeometryWorkerResult,
} from './GeometryWorkerTypes.js';

// ── Sprint V (2026-05-12) — CurtainWallTool extracted ─────────────────────
export type { CurtainWallToolDependencies } from './CurtainWallTool.js';
// §FIX-CW-BYSLAB-ASK (L-1165) — the app injects `ToolsAreaLayout`'s ONE pick-a-slab
// flow through this type; it is exported so that wiring is typed, not `any`.
export type { SlabPickRequester } from './CurtainWallTool.js';
export { CurtainWallTool } from './CurtainWallTool.js';

// §L-1057 / C87 §13.1 CW-P — sparse panel overrides (storage + load layer).
export type {
    CurtainPanelOverride,
    RegenerationBaseline,
    PanelUpdateTarget,
    LostOverride,
    GridBearingWall,
} from './curtainPanelOverrides.js';
export {
    REGENERATED_PANEL_TYPE,
    resolveCurtainGrid,
    isAuthoredPanel,
    cellToLineIds,
    lineIdsToCell,
    collectCurtainPanelOverrides,
    applyCurtainPanelOverrides,
    describeLostOverride,
} from './curtainPanelOverrides.js';

// §CW-3 / C87 §13.5 — the curtain-wall DOOR PROJECTION. A curtain-wall door is a
// panel KIND, not a C15 hosted opening (decision 2026-08-19, C87 §13.5), so every
// consumer that enumerates doors reads it through here rather than re-deriving the
// `panelType === 'SystemPanel_Door'` rule (C84 EI-9).
export type { CurtainWallDoorRef } from './curtainWallDoors.js';
export {
    isCurtainWallDoorPanel,
    collectCurtainWallDoors,
    countCurtainWallDoors,
} from './curtainWallDoors.js';

// §CWPROPS152 / C87 §13.6 CW-Mul-1 — the bulk-editable NUMERIC parameter
// vocabulary (mullion size, panel thickness, post/transom spacing) + bounds,
// shared by the single-element and bulk write paths (C84 EI-9).
export type { CurtainWallParameterKey, CurtainWallParameterMeta } from './CurtainWallParameterConstraints.js';
export {
    CURTAIN_WALL_PARAMETER_KEYS,
    CURTAIN_WALL_PARAMETER_META,
    isCurtainWallParameterKey,
    checkCurtainWallParameter,
    unknownCurtainWallParameterRefusal,
} from './CurtainWallParameterConstraints.js';

// §CWWELD169 (L-12800..) — CW↔CW move re-weld: the pure engine + its store
// dispatch service. Mirrors `@pryzm/geometry-wall`'s `WallMoveReweld` /
// `WallMoveReweldService` split; see CurtainWallMoveReweld.ts's module doc for
// what is closed (mutual corner + dependent stem) and what is named as
// deliberately NOT closed (the subject-as-guest case, and CW↔wall joints).
export type {
    CurtainReweldBaseline,
    CurtainMoveReweldMovedWall,
    CurtainMoveReweldPartner,
    CurtainMoveReweldOptions,
    CurtainMoveReweldEntry,
    CurtainMoveRefusalReason,
    CurtainMoveReweldRefusal,
    CurtainMoveNotApplicableReason,
    CurtainMoveNotApplicable,
    CurtainMoveReweldPlan,
} from './CurtainWallMoveReweld.js';
export {
    computeCurtainWallMoveReweldCensus,
    MIN_CURTAIN_MOVE_M,
    MIN_CURTAIN_STUB_LENGTH,
} from './CurtainWallMoveReweld.js';
export type {
    CurtainWallReweldStoreRef,
    CurtainWallMoveReweldServiceDeps,
    CurtainReweldCommandLike,
    CurtainReweldCommandManagerLike,
    CurtainReweldCommandManagerRef,
    CurtainReweldCascadeCommandFactory,
    CurtainReweldConsequenceReport,
} from './CurtainWallMoveReweldService.js';
export { CurtainWallMoveReweldService } from './CurtainWallMoveReweldService.js';
