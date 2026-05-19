export type { CurtainGridLine, CurtainGridSystem } from './CurtainGridSystem.js';
export {
    migrateToGridSystem,
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
export { CurtainWallTool } from './CurtainWallTool.js';
