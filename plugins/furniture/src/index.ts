// @pryzm/plugin-furniture — public surface (S27 / ADR-0027).

export { FurnitureStore, type FurnitureData, type FurnitureId, type FurnituresState } from './store.js';
export {
  FurnitureSystemError,
  FurnitureNotFoundError,
  FurnitureSchemaError,
  FurnitureLodError,
  FurnitureCatalogueLookupError,
  isFurnitureSystemError,
} from './errors.js';
export { isFiniteVec3, isValidLod, isValidScale, FURNITURE_LODS, type FurnitureLodLiteral } from './intent.js';
export {
  FURNITURE_HANDLER_TYPES,
  buildFurnitureHandlerSet,
  registerFurnitureHandlers,
  type FurnitureHandlerType,
  CreateFurnitureHandler, type CreateFurniturePayload,
  DeleteFurnitureHandler, type DeleteFurniturePayload,
  MoveFurnitureHandler, type MoveFurniturePayload,
  RotateFurnitureHandler, type RotateFurniturePayload,
  SetFurnitureScaleHandler, type SetFurnitureScalePayload,
  SetActiveLodHandler, type SetActiveLodPayload,
  SetFurnitureRepresentationHandler, type SetFurnitureRepresentationPayload,
} from './handlers/index.js';
export {
  FurniturePlacementTool,
  FURNITURE_TOOL_ID,
  type FurniturePlacementToolDeps,
  type FurnitureScreenToWorld,
  type FurnitureToolPoint3D,
} from './tool.js';
export {
  FurnitureCatalogue,
  SEED_FURNITURE_CATALOGUE,
  type FurnitureCatalogueEntry,
  type FurnitureCatalogueQuery,
} from './catalogue/index.js';
export {
  FurnitureCommitter,
  buildFurnitureBufferGeometry,
  disposeFurnitureGeometry,
  makeFurnitureMaterialFactory,
  colorOfFurnitureMaterialKey,
  type FurnitureCommitterDeps,
  type FurnitureCommitterStats,
} from './committer/index.js';
