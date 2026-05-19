// @pryzm/plugin-lighting — public surface (S26 / ADR-0023).

export { LightingStore, type LightingData, type LightingId, type LightingsState } from './store.js';
export {
  LightingSystemError,
  LightingNotFoundError,
  LightingSchemaError,
  isLightingSystemError,
} from './errors.js';
export { isFiniteVec3 } from './intent.js';
export {
  LIGHTING_HANDLER_TYPES,
  buildLightingHandlerSet,
  registerLightingHandlers,
  type LightingHandlerType,
  CreateLightingHandler, type CreateLightingPayload,
  DeleteLightingHandler, type DeleteLightingPayload,
  MoveLightingHandler, type MoveLightingPayload,
  SetLightingIntensityHandler, type SetLightingIntensityPayload,
  SetLightingEmergencyHandler, type SetLightingEmergencyPayload,
} from './handlers/index.js';
export {
  LightingPlacementTool,
  LIGHTING_TOOL_ID,
  type LightingPlacementToolDeps,
  type LightingScreenToWorld,
  type LightingToolPoint3D,
} from './tool.js';
export {
  LightingCommitter,
  buildLightingBufferGeometry,
  disposeLightingGeometry,
  makeLightingMaterialFactory,
  colorOfLightingMaterialKey,
  type LightingCommitterDeps,
  type LightingCommitterStats,
} from './committer/index.js';
