// @pryzm/plugin-ceiling — public surface (S14-T8 deliverable).

export { CeilingStore, type CeilingData, type CeilingId, type CeilingsState } from './store.js';
export {
  CeilingSystemError, CeilingNotFoundError, CeilingSchemaError,
  CeilingGeometryError, isCeilingSystemError,
} from './errors.js';

export { CreateCeilingHandler, type CreateCeilingPayload } from './handlers/CreateCeiling.js';
export { DeleteCeilingHandler, type DeleteCeilingPayload } from './handlers/DeleteCeiling.js';
export { SetCeilingBoundaryHandler, type SetCeilingBoundaryPayload } from './handlers/SetCeilingBoundary.js';
export { SetCeilingHeightHandler, type SetCeilingHeightPayload } from './handlers/SetCeilingHeight.js';

export {
  CEILING_HANDLER_TYPES, buildCeilingHandlerSet, registerCeilingHandlers,
  type CeilingHandlerType,
} from './handlers/index.js';

export {
  isFiniteVec3, polygonSignedArea, validateCeilingBoundary, validateCeilingDims,
  type CeilingValidation,
} from './intent.js';

export {
  CeilingPlacementTool, CEILING_TOOL_ID,
  type CeilingPlacementToolDeps, type CeilingScreenToWorld, type CeilingToolPoint3D,
} from './tool.js';

export {
  CeilingCommitter, buildCeilingBufferGeometry, disposeCeilingGeometry,
  makeCeilingMaterialFactory, colorOfCeilingMaterialKey, slotOfCeilingMaterialKey,
  type CeilingCommitterDeps, type CeilingCommitterStats, type CeilingMaterialSlot,
} from './committer/index.js';
