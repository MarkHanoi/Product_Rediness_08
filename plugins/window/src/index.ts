// @pryzm/plugin-window — public surface (S11-T2 deliverable).

export { WindowStore, type WindowData, type WindowId, type WindowsState } from './store.js';
export {
  WindowSystemError,
  WindowNotFoundError,
  WindowSchemaError,
  WindowDimensionsError,
  WindowTypeNotFoundError,
  isWindowSystemError,
} from './errors.js';

export { CreateWindowHandler, type CreateWindowPayload } from './handlers/CreateWindow.js';
export { DeleteWindowHandler, type DeleteWindowPayload } from './handlers/DeleteWindow.js';
export { MoveWindowHandler, type MoveWindowPayload } from './handlers/MoveWindow.js';
export { SetWindowTypeHandler, type SetWindowTypePayload } from './handlers/SetWindowType.js';
export { SetWindowSizeHandler, type SetWindowSizePayload } from './handlers/SetWindowSize.js';
export {
  WINDOW_HANDLER_TYPES,
  buildWindowHandlerSet,
  registerWindowHandlers,
  type WindowHandlerType,
} from './handlers/index.js';

export {
  resolveWindowPlacement as resolveWindowPlacementIntent,
  wallLength,
  type WindowPlacementResult,
} from './intent.js';

export {
  WindowPlacementTool,
  WINDOW_TOOL_ID,
  type WindowCreationToolDeps,
  type WindowScreenToWorld,
  type WindowToolPoint3D,
  type WallsSnapshot,
} from './tool.js';

export {
  WindowCommitter,
  resolveWindowPlacement,
  buildWindowBufferGeometry,
  disposeWindowGeometry,
  makeWindowMaterialFactory,
  colorOfWindowMaterialKey,
  slotOfWindowMaterialKey,
  type WindowCommitterDeps,
  type WindowCommitterStats,
} from './committer/index.js';
