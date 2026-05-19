// @pryzm/plugin-structural — public surface (S26 / ADR-0026).

export { SteelProfileLibrary, type SteelProfile, type SectionSeries } from './SteelProfileLibrary.js';
export {
  generateColumnISection, generateBeamISection,
  createColumnLOD, createBeamLOD,
  invalidateProfileCache, clearSectionCache,
  columnSnapTargets, beamSnapTargets,
  type LODLevel,
} from './ISectionGenerator.js';

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
