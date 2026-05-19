// @pryzm/plugin-handrail — public surface (S14-T4 deliverable).

export { HandrailStore, type HandrailData, type HandrailId, type HandrailsState } from './store.js';
export {
  HandrailSystemError, HandrailNotFoundError, HandrailSchemaError,
  HandrailGeometryError, isHandrailSystemError,
} from './errors.js';

export { CreateHandrailHandler, type CreateHandrailPayload } from './handlers/CreateHandrail.js';
export { DeleteHandrailHandler, type DeleteHandrailPayload } from './handlers/DeleteHandrail.js';
export { SetHandrailPathHandler, type SetHandrailPathPayload } from './handlers/SetHandrailPath.js';
export { SetHandrailShapeHandler, type SetHandrailShapePayload } from './handlers/SetHandrailShape.js';
export { SetHandrailHostHandler, type SetHandrailHostPayload } from './handlers/SetHandrailHost.js';
export { RecomputeHandrailHandler, type RecomputeHandrailPayload } from './handlers/RecomputeHandrail.js';

export {
  HANDRAIL_HANDLER_TYPES, buildHandrailHandlerSet, registerHandrailHandlers,
  type HandrailHandlerType,
} from './handlers/index.js';

export {
  isFiniteVec3, pathTotalLength, validateHandrailPath, type HandrailValidation,
} from './intent.js';

export {
  HandrailPlacementTool, HANDRAIL_TOOL_ID,
  type HandrailPlacementToolDeps, type HandrailScreenToWorld, type HandrailToolPoint3D,
} from './tool.js';

export {
  HandrailCommitter, buildHandrailBufferGeometry, disposeHandrailGeometry,
  makeHandrailMaterialFactory, colorOfHandrailMaterialKey,
  type HandrailCommitterDeps, type HandrailCommitterStats,
} from './committer/index.js';
