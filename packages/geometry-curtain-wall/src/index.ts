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
