// @pryzm/plugin-beam — public surface (S12-T3).

export { BeamStore, type BeamData, type BeamId, type BeamsState } from './store.js';
export {
  BeamSystemError,
  BeamNotFoundError,
  BeamSchemaError,
  BeamDimensionsError,
  BeamGeometryError,
  isBeamSystemError,
} from './errors.js';
export { CreateBeamHandler, type CreateBeamPayload } from './handlers/CreateBeam.js';
export { DeleteBeamHandler, type DeleteBeamPayload } from './handlers/DeleteBeam.js';
export { MoveBeamHandler, type MoveBeamPayload } from './handlers/MoveBeam.js';
export { SetBeamTypeHandler, type SetBeamTypePayload } from './handlers/SetBeamType.js';
export { SetBeamSectionHandler, type SetBeamSectionPayload } from './handlers/SetBeamSection.js';
export {
  BEAM_HANDLER_TYPES,
  buildBeamHandlerSet,
  registerBeamHandlers,
  type BeamHandlerType,
} from './handlers/index.js';
export { isFiniteVec3, isNonZeroBaseLine } from './intent.js';
export {
  BeamPlacementTool,
  BEAM_TOOL_ID,
  type BeamPlacementToolDeps,
  type BeamScreenToWorld,
  type BeamToolPoint3D,
} from './tool.js';
export {
  BeamCommitter,
  buildBeamBufferGeometry,
  disposeBeamGeometry,
  makeBeamMaterialFactory,
  colorOfBeamMaterialKey,
  type BeamCommitterDeps,
  type BeamCommitterStats,
} from './committer/index.js';
