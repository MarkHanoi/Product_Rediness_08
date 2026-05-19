// @pryzm/plugin-grid — public surface (S12-T4).

export { GridStore, type GridData, type GridId, type GridsState } from './store.js';
export {
  GridSystemError,
  GridNotFoundError,
  GridSchemaError,
  GridConfigError,
  isGridSystemError,
} from './errors.js';
export { CreateGridHandler, type CreateGridPayload } from './handlers/CreateGrid.js';
export { DeleteGridHandler, type DeleteGridPayload } from './handlers/DeleteGrid.js';
export { SetGridSpacingHandler, type SetGridSpacingPayload } from './handlers/SetGridSpacing.js';
export { SetGridExtentHandler, type SetGridExtentPayload } from './handlers/SetGridExtent.js';
export {
  GRID_HANDLER_TYPES,
  buildGridHandlerSet,
  registerGridHandlers,
  type GridHandlerType,
} from './handlers/index.js';
export {
  generateRectGridLines,
  validateRectGridSpec,
  type RectGridSpec,
} from './intent.js';
export {
  GridPlacementTool,
  GRID_TOOL_ID,
  type GridPlacementToolDeps,
  type GridScreenToWorld,
  type GridToolPoint3D,
} from './tool.js';
export {
  GridCommitter,
  buildGridBufferGeometry,
  disposeGridGeometry,
  makeGridMaterialFactory,
  colorOfGridMaterialKey,
  type GridCommitterDeps,
  type GridCommitterStats,
} from './committer/index.js';
