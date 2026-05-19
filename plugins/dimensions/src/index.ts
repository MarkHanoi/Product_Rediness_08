// @pryzm/plugin-dimensions — public surface (S29 / ADR-0028).

export {
  DimensionStore,
  type DimensionData,
  type DimensionId,
  type DimensionsState,
} from './store.js';
export {
  DimensionSystemError,
  DimensionNotFoundError,
  DimensionSchemaError,
  isDimensionSystemError,
} from './errors.js';
export {
  isFiniteVec3,
  isFiniteVec3Array,
  isDimensionUnit,
  DIMENSION_KINDS,
  DIMENSION_UNITS,
  type DimensionKindLiteral,
  type DimensionUnitLiteral,
} from './intent.js';
export {
  DIMENSION_HANDLER_TYPES,
  buildDimensionHandlerSet,
  registerDimensionHandlers,
  type DimensionHandlerType,
  CreateDimensionHandler, type CreateDimensionPayload,
  DeleteDimensionHandler, type DeleteDimensionPayload,
  MoveDimensionHandler, type MoveDimensionPayload,
  SetDimensionPrecisionHandler, type SetDimensionPrecisionPayload,
  SetDimensionUnitHandler, type SetDimensionUnitPayload,
  SetDimensionTextHandler, type SetDimensionTextPayload,
} from './handlers/index.js';
