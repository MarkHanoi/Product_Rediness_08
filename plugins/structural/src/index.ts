// @pryzm/plugin-structural — public surface (S26 / ADR-0026).

// F-P5-04 inversion (2026-08-31): SteelProfileLibrary moved to
// @pryzm/geometry-kernel (pure data) and ISectionGenerator to
// @pryzm/geometry-column (THREE-bearing) so packages/** no longer import
// upward into this L6 plugin. Compat re-exports below keep this barrel's
// public surface identical, routed through the SDK facade (the blessed
// plugin edge — sdk-bypass-neutral).
export { SteelProfileLibrary, type SteelProfile, type SectionSeries } from '@pryzm/plugin-sdk';
export {
  generateColumnISection, generateBeamISection,
  createColumnLOD, createBeamLOD,
  invalidateProfileCache, clearSectionCache,
  columnSnapTargets, beamSnapTargets,
  type LODLevel,
} from '@pryzm/plugin-sdk';

export { StructuralStore, type StructuralData, type StructuralId, type StructuralsState } from './store.js';
export {
  StructuralSystemError,
  StructuralNotFoundError,
  StructuralSchemaError,
  StructuralDimensionsError,
  isStructuralSystemError,
} from './errors.js';
export { isFiniteVec3 } from './intent.js';
export {
  STRUCTURAL_HANDLER_TYPES,
  buildStructuralHandlerSet,
  registerStructuralHandlers,
  type StructuralHandlerType,
  CreateStructuralHandler, type CreateStructuralPayload,
  DeleteStructuralHandler, type DeleteStructuralPayload,
  MoveStructuralHandler, type MoveStructuralPayload,
  SetStructuralKindHandler, type SetStructuralKindPayload,
  SetStructuralDimensionsHandler, type SetStructuralDimensionsPayload,
  SetStructuralMaterialHandler, type SetStructuralMaterialPayload,
  SetBraceEndOffsetHandler, type SetBraceEndOffsetPayload,
} from './handlers/index.js';
export {
  StructuralPlacementTool,
  STRUCTURAL_TOOL_ID,
  type StructuralPlacementToolDeps,
  type StructuralScreenToWorld,
  type StructuralToolPoint3D,
} from './tool.js';
export {
  StructuralCommitter,
  buildStructuralBufferGeometry,
  disposeStructuralGeometry,
  makeStructuralMaterialFactory,
  colorOfStructuralMaterialKey,
  type StructuralCommitterDeps,
  type StructuralCommitterStats,
} from './committer/index.js';
