// @pryzm/plugin-roof — public surface (S11-T3 deliverable).
//
// Headless half lives at the package root.  THREE-touching surface
// lives under `src/committer/` and is re-exported here for caller
// convenience.

export { RoofStore, type RoofData, type RoofId, type RoofsState } from './store.js';
export {
  RoofSystemError,
  RoofNotFoundError,
  RoofSchemaError,
  RoofTypeNotFoundError,
  RoofPitchOutOfRangeError,
  RoofShapeMismatchError,
  isRoofSystemError,
} from './errors.js';

export { CreateRoofHandler, type CreateRoofPayload } from './handlers/CreateRoof.js';
export { DeleteRoofHandler, type DeleteRoofPayload } from './handlers/DeleteRoof.js';
export { SetRoofShapeHandler, type SetRoofShapePayload } from './handlers/SetRoofShape.js';
export { SetRoofPitchHandler, type SetRoofPitchPayload } from './handlers/SetRoofPitch.js';
export { SetRoofThicknessHandler, type SetRoofThicknessPayload } from './handlers/SetRoofThickness.js';
export { SetRoofOverhangHandler, type SetRoofOverhangPayload } from './handlers/SetRoofOverhang.js';
export { MoveRoofHandler, type MoveRoofPayload } from './handlers/MoveRoof.js';
export { ChangeRoofLevelHandler, type ChangeRoofLevelPayload } from './handlers/ChangeRoofLevel.js';
export { AddSkylightHandler, type AddSkylightPayload } from './handlers/AddSkylight.js';
export { RemoveSkylightHandler, type RemoveSkylightPayload } from './handlers/RemoveSkylight.js';
export { JoinRoofsHandler, type JoinRoofsPayload } from './handlers/JoinRoofs.js';
export {
  ROOF_HANDLER_TYPES,
  buildRoofHandlerSet,
  registerRoofHandlers,
  type RoofHandlerType,
} from './handlers/index.js';

export {
  validatePolygon,
  signedArea,
  centroid,
  type RoofPolygonValidation,
} from './intent.js';

export {
  RoofPlacementTool,
  ROOF_TOOL_ID,
  type RoofPlacementToolDeps,
  type RoofPlacementInput,
} from './tool.js';

export {
  RoofCommitter,
  buildRoofBufferGeometry,
  disposeRoofGeometry,
  makeRoofMaterialFactory,
  colorOfRoofMaterialKey,
  slotOfRoofMaterialKey,
  type RoofCommitterDeps,
  type RoofCommitterStats,
  type RoofMaterialSlot,
} from './committer/index.js';
