// @pryzm/geometry-kernel — public surface (frozen by ADR-009 in S08 D2).
//
// L4 of the architecture stack — pure DTO → geometry producers.  Lint
// rule `pryzm/no-three-in-kernel` (real-enforced as of S07-T3) hard-fails
// any `three`, `@thatopen/*`, or `web-ifc*` import inside this tree.

export type {
  BufferGeometryDescriptor,
  DescriptorGroup,
  IndexedAttribute,
} from './types/BufferGeometryDescriptor.js';
export type { JoinData, JoinEnd, JoinKind } from './types/JoinData.js';
export { NO_JOINS } from './types/JoinData.js';
export type { Point3D } from './types/Point3D.js';
export type { MaterialKey } from './types/MaterialKey.js';
export { asMaterialKey } from './types/MaterialKey.js';
export {
  assertValidDescriptor,
  DescriptorInvariantError,
} from './types/assertValidDescriptor.js';

export { produceWall, type WallProducer } from './producers/wall.js';
export { composeWallGeometryHash, WALL_HASH_SCHEMA_VERSION } from './producers/_internal/composeWallGeometryHash.js';
export { computeOpeningWorldPos } from './producers/_internal/computeOpeningWorldPos.js';
export {
  produceDoor,
  composeDoorGeometryHash,
  type DoorProducer,
  type DoorWorldPlacement,
} from './producers/door.js';
export {
  produceWindow,
  composeWindowGeometryHash,
  computeMullionsX,
  computeMullionsZ,
  type WindowProducer,
  type WindowWorldPlacement,
} from './producers/window.js';
export { produceRoof, type RoofProducer } from './producers/roof.js';
export { produceSlab, type SlabProducer } from './producers/slab.js';
export {
  composeSlabGeometryHash,
  SLAB_HASH_SCHEMA_VERSION,
} from './producers/_internal/composeSlabGeometryHash.js';
export {
  produceColumn,
  composeColumnGeometryHash,
  type ColumnProducer,
} from './producers/column.js';
export {
  produceBeam,
  composeBeamGeometryHash,
  type BeamProducer,
} from './producers/beam.js';
export {
  produceGrid,
  composeGridGeometryHash,
  type GridProducer,
} from './producers/grid.js';
export {
  produceCurtainWall,
  composeCurtainWallGeometryHash,
  curtainWallBasis,
  computeCurtainWallGrid,
  CURTAIN_WALL_HASH_SCHEMA_VERSION,
  type CurtainWallProducer,
  type CurtainWallBasis,
} from './producers/curtainwall.js';
export {
  buildLinearExtrusion,
  composeStructuralMaterialKey,
  type StructuralProfile,
  type StructuralShape,
  type LinearExtrusion,
} from './producers/_shared/linear-structural.js';
export { produceStair, type StairProducer } from './producers/stair.js';
export {
  composeStairGeometryHash,
  STAIR_HASH_SCHEMA_VERSION,
} from './producers/_internal/stair/composeStairGeometryHash.js';
export { produceHandrail, type HandrailProducer } from './producers/handrail.js';
export {
  composeHandrailGeometryHash,
  HANDRAIL_HASH_SCHEMA_VERSION,
} from './producers/_internal/handrail/composeHandrailGeometryHash.js';
export { produceCeiling, type CeilingProducer } from './producers/ceiling.js';
export {
  composeCeilingGeometryHash,
  CEILING_HASH_SCHEMA_VERSION,
} from './producers/_internal/ceiling/composeCeilingGeometryHash.js';
export {
  produceRoom,
  analyseRoom,
  type RoomProducer,
  type RoomBoundaryContext,
  type RoomAnalytic,
} from './producers/room.js';
export {
  composeRoomGeometryHash,
  ROOM_HASH_SCHEMA_VERSION,
} from './producers/_internal/composeRoomGeometryHash.js';
export {
  produceStructural,
  STRUCTURAL_HASH_SCHEMA_VERSION,
  type StructuralProducer,
} from './producers/structural.js';
export {
  composeStructuralGeometryHash,
} from './producers/_internal/composeStructuralGeometryHash.js';
export {
  produceLighting,
  composeLightingMaterialKey,
  LIGHTING_HASH_SCHEMA_VERSION,
  type LightingProducer,
} from './producers/lighting.js';
export {
  composeLightingGeometryHash,
} from './producers/_internal/composeLightingGeometryHash.js';
export {
  producePlumbing,
  composePlumbingMaterialKey,
  PLUMBING_HASH_SCHEMA_VERSION,
  type PlumbingProducer,
} from './producers/plumbing.js';
export {
  composePlumbingGeometryHash,
} from './producers/_internal/composePlumbingGeometryHash.js';
export {
  produceFurniture,
  selectActiveRepresentation,
  composeFurnitureMaterialKey,
  FURNITURE_HASH_SCHEMA_VERSION,
  type FurnitureProducer,
} from './producers/furniture.js';
export {
  composeFurnitureGeometryHash,
} from './producers/_internal/composeFurnitureGeometryHash.js';
export {
  produceDimension,
  analyseDimension,
  composeDimensionMaterialKey,
  DIMENSION_HASH_SCHEMA_VERSION,
  type DimensionProducer,
  type DimensionAnalytic,
  type DimensionEdge,
  type DimensionArrow,
} from './producers/dimension.js';
export {
  composeDimensionGeometryHash,
} from './producers/_internal/composeDimensionGeometryHash.js';

// ── S30: Plan-view edge projection + poche fill (pure) ───────────────────────
export {
  projectWallEdges,
  _mergeIntervals,
  _invertIntervals,
  _groupByWall,
  type Vec2 as EdgeVec2,
  type Edge2D,
  type ProjectWallEdgesInput,
} from './edge-projection.js';
export {
  computePocheFills,
  type Vec2 as PocheVec2,
  type PocheFill,
  type ComputePocheFillsInput,
} from './poche.js';

// ── S33/S34 Track C: Auto-Dimension pipeline (Phase 2B Supplement §A2/A3) ──
//
// Pure L4 modules.  Distinct from the S29 `produceDimension` /
// `analyseDimension` pair above (which produces the THREE body-mesh primitives
// for first-class Dimension elements in the perspective viewer).  The
// `produceDimensions` / `evaluateDimensions` pair below operates on the new
// `DimensionString` schema for the headless plan-view auto-dim pipeline.
export {
  makeMonotonicDimensionIdFactory,
  produceDimensions,
  type DimensionElementSnapshot,
  type DimensionRequest,
  type DoorLike as DimDoorLike,
  type RoomLike as DimRoomLike,
  type WallLike as DimWallLike,
  type WindowLike as DimWindowLike,
} from './dimensions/producer.js';
export {
  evaluateDimensions,
  formatDimension,
  type DoorLikeEvaluator,
  type ElementSnapshotForDim,
  type ProjectUnitSettings,
  type RoomLikeEvaluator,
  type Vec3Like as DimVec3Like,
  type WallLikeEvaluator,
  type WindowLikeEvaluator,
} from './dimensions/evaluator.js';

// ── S52 D1: Family Creator producers (extrude first; sweep / loft / revolve at S53) ──
export {
  produceExtrude,
  composeExtrudeHash,
  type ExtrudeOptions,
  type ExtrudeProducer,
  type ExtrudeResult,
  type ProfilePoint,
} from './producers/extrude.js';

// ── S33 Track C: ViewResolutionAlgorithm (Phase 2B Supplement §B3) ────────
export {
  classifyElement,
  evaluateCondition,
  resolveElementInstructions,
  type ElementClassification,
  type ElementForView,
  type ElementRenderInstruction,
  type ResolvedViewRange,
} from './view-resolution/index.js';

// ── W-09: Section-cut producer (moved from plugin-section-view) ────────────
export {
  produceSectionCut,
  type AabbForSection,
  type SectionCutResult,
  type SectionEdge2D,
  type SectionLine,
  type Vec2,
  type Vec3,
} from './producers/section-cut.js';
