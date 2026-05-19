// @pryzm/plugin-plumbing — public surface (S26 / ADR-0026).

export { PlumbingStore, type PlumbingData, type PlumbingId, type PlumbingsState } from './store.js';
export {
  PlumbingSystemError,
  PlumbingNotFoundError,
  PlumbingSchemaError,
  isPlumbingSystemError,
} from './errors.js';
export { isFiniteVec3 } from './intent.js';
export {
  PLUMBING_HANDLER_TYPES,
  buildPlumbingHandlerSet,
  registerPlumbingHandlers,
  type PlumbingHandlerType,
  CreatePlumbingHandler, type CreatePlumbingPayload,
  DeletePlumbingHandler, type DeletePlumbingPayload,
  MovePlumbingHandler, type MovePlumbingPayload,
  SetPlumbingSystemHandler, type SetPlumbingSystemPayload,
} from './handlers/index.js';
export {
  PlumbingPlacementTool,
  PLUMBING_TOOL_ID,
  type PlumbingPlacementToolDeps,
  type PlumbingScreenToWorld,
  type PlumbingToolPoint3D,
} from './tool.js';
export {
  PlumbingCommitter,
  buildPlumbingBufferGeometry,
  disposePlumbingGeometry,
  makePlumbingMaterialFactory,
  colorOfPlumbingMaterialKey,
  type PlumbingCommitterDeps,
  type PlumbingCommitterStats,
} from './committer/index.js';
