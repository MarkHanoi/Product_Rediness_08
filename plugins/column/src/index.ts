// @pryzm/plugin-column — public surface (S12-T3).

export { ColumnStore, type ColumnData, type ColumnId, type ColumnsState } from './store.js';
export {
  ColumnSystemError,
  ColumnNotFoundError,
  ColumnSchemaError,
  ColumnDimensionsError,
  isColumnSystemError,
} from './errors.js';
export { CreateColumnHandler, type CreateColumnPayload } from './handlers/CreateColumn.js';
export { DeleteColumnHandler, type DeleteColumnPayload } from './handlers/DeleteColumn.js';
export { MoveColumnHandler, type MoveColumnPayload } from './handlers/MoveColumn.js';
export { SetColumnTypeHandler, type SetColumnTypePayload } from './handlers/SetColumnType.js';
export { SetColumnHeightHandler, type SetColumnHeightPayload } from './handlers/SetColumnHeight.js';
export {
  COLUMN_HANDLER_TYPES,
  buildColumnHandlerSet,
  registerColumnHandlers,
  type ColumnHandlerType,
} from './handlers/index.js';
export { isFiniteVec3 } from './intent.js';
export {
  ColumnPlacementTool,
  COLUMN_TOOL_ID,
  type ColumnPlacementToolDeps,
  type ColumnScreenToWorld,
  type ColumnToolPoint3D,
} from './tool.js';
export {
  ColumnCommitter,
  buildColumnBufferGeometry,
  disposeColumnGeometry,
  makeColumnMaterialFactory,
  colorOfColumnMaterialKey,
  type ColumnCommitterDeps,
  type ColumnCommitterStats,
} from './committer/index.js';
