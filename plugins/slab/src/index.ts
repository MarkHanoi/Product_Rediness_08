// @pryzm/plugin-slab — public surface (S12-T2 deliverable).

export { SlabStore, type SlabData, type SlabId, type SlabsState } from './store.js';
export {
  SlabSystemError,
  SlabNotFoundError,
  SlabSchemaError,
  SlabBoundaryError,
  SlabHoleNotFoundError,
  SlabThicknessError,
  isSlabSystemError,
} from './errors.js';

export { CreateSlabHandler, type CreateSlabPayload } from './handlers/CreateSlab.js';
export { DeleteSlabHandler, type DeleteSlabPayload } from './handlers/DeleteSlab.js';
export { MoveSlabHandler, type MoveSlabPayload } from './handlers/MoveSlab.js';
export { SetSlabTypeHandler, type SetSlabTypePayload } from './handlers/SetSlabType.js';
export { AddSlabHoleHandler, type AddSlabHolePayload } from './handlers/AddSlabHole.js';
export { RemoveSlabHoleHandler, type RemoveSlabHolePayload } from './handlers/RemoveSlabHole.js';
export {
  SetSlabThicknessHandler,
  type SetSlabThicknessPayload,
} from './handlers/SetSlabThickness.js';
export {
  SetSlabBaseOffsetHandler,
  type SetSlabBaseOffsetPayload,
} from './handlers/SetSlabBaseOffset.js';
export {
  SLAB_HANDLER_TYPES,
  buildSlabHandlerSet,
  registerSlabHandlers,
  type SlabHandlerType,
} from './handlers/index.js';

export {
  signedAreaXZ,
  centroidXZ,
  validateSlabBoundary,
  type SlabPolygonValidation,
} from './intent.js';

export {
  SlabPlacementTool,
  SLAB_TOOL_ID,
  type SlabPlacementToolDeps,
  type SlabScreenToWorld,
  type SlabToolPoint3D,
} from './tool.js';

export {
  SlabCommitter,
  buildSlabBufferGeometry,
  disposeSlabGeometry,
  makeSlabMaterialFactory,
  colorOfSlabMaterialKey,
  slotOfSlabMaterialKey,
  type SlabCommitterDeps,
  type SlabCommitterStats,
  type SlabMaterialSlot,
} from './committer/index.js';
