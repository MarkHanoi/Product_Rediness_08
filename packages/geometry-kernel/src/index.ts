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

// §C73-EPSILON-POLICY — THE declared tolerance policy (C73 §2.1). New or
// modified geometric predicates consume these; they do not invent a literal
// at the call site (gated by `tools/ga-gate/check-epsilon-policy.ts`).
export {
  EPSILON_ZERO,
  COINCIDENT_M,
  PARALLEL_RAD,
  RECOMPUTE_IDENTITY_M,
  isNumericallyZero,
  isCoincidentDistanceM,
  arePointsCoincident2D,
  isParallel,
} from './tolerance.js';

// §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT (founder ruling, 2026-08-24) — THE ortho
// constraint for the whole repo, in ONE function. It lives here and not in
// geometry-slab or geometry-wall because those two DEPEND ON EACH OTHER and the
// kernel depends on neither: this is the only home that is a tree, not a cycle.
// See the module header for the ruling, the census it moved, and the tie-break.
export {
  orthoConstrainXZ,
  offAxisDegXZ,
  type OrthoPointXZ,
} from './math/orthoConstraint.js';

// §CURVE-ONE-CUBIC-OWNER — THE cubic Bézier of this repository, at degree 3.
// The three existing samplers (`_internal/WallPath.ts:arcToPoints`,
// `geometry-slab:tessellateArcSegment`, `formaWallCurve:sampleQuadraticBezierXZ`)
// are all QUADRATIC and all serve curved wall PATHS; degree 3 is a capability
// the repo did not have, not a rival spelling of one it did. Consumed by the
// component-editor sketch surface AND `family-instance/profileToPolygon`, which
// is why it lives here rather than in either of them.
export {
  CUBIC_BEZIER_DEGREE,
  MIN_BEZIER_SEGMENTS,
  MAX_BEZIER_SEGMENTS,
  isCubicBezierChainLength,
  cubicBezierSpanCount,
  cubicBezierPointXZ,
  cubicBezierTangentXZ,
  segmentsForCubicBezier,
  sampleCubicBezierXZ,
  sampleCubicBezierChainXZ,
  catmullRomToCubicBezierChainXZ,
} from './math/cubicBezier.js';

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
// §W2A-ONE-OFFSET — THE polygon offset. `geometry-roof` re-exports this module;
// there is deliberately no second implementation anywhere in the repo (gated by
// `tools/ga-gate/check-offset-implementations.ts`).
export {
  offsetPolygon,
  offsetPolygonOrSelf,
  findSelfIntersection,
  signedArea as polygonSignedArea2D,
  // §C73-AREA-CANONICAL — the same shoelace body behind accessors, so any
  // vertex shape reads area/winding without minting a copy; winding is the
  // SIGN of this computation, never a second orientation body.
  polygonSignedAreaOrdinates,
  dedupeRing,
  FOLD_CHECK_MAX_VERTS,
  type OffsetResult,
  type Pt2,
} from './pure/polygonOffset.js';
// §C73-PIP-CANONICAL — THE point-in-polygon. One even-odd ray-cast body for the
// whole repo; every consumer delegates here instead of minting a private copy
// (gated by `tools/ga-gate/check-predicate-canonical.ts`; semantics — half-open
// boundary, no divide guard, <3 vertices reads false — decided on the record in
// the module header per C73 §3.7).
export {
  pointInEdgeSetEvenOdd,
  pointInRingEvenOdd,
  pointInPolygonXZ,
  pointInPolygonXY,
  type RingOrdinateAt,
} from './pure/pointInPolygon.js';
// §C73-P2S-CANONICAL — THE point-to-segment distance. One clamped-t projection
// body for the whole repo. The CLAMP to [0,1] is what makes it the SEGMENT
// question rather than the point-to-LINE one, exactly as the [0,1] band
// separates segment/segment from line/line below. Its degenerate-segment guard
// is EXACT (`lenSq > 0`, no epsilon) because t = 0 is the CORRECT answer when
// the segment is a point — so no rival's private band is silently adopted, and
// a caller whose band is a real domain decision composes it AT the call site
// (C73 §2.1/§3.7; decided on the record in the module header).
export {
  projectParamOnSegment,
  closestPointOnSegment,
  distanceSqPointToSegment,
  distancePointToSegment,
  distancePointToSegmentXZ,
  distancePointToSegmentXY,
  distancePointToRing,
} from './pure/pointToSegment.js';
// §C73-SEGSEG-CANONICAL — THE segment/segment intersection. One arithmetic
// body (four cross products) with FOUR named boundary views — strict-interior,
// half-open, the parametric closed-[0,1] hit, and (added 2026-08-17) the
// UNBOUNDED solve `intersectLines2D` returning t/u unclamped; the parametric
// divide is guarded by the declared EPSILON_ZERO, never a per-call-site
// literal. The fourth view exists because a caller needing to know how far PAST
// an end a corner lies previously had to spell the solve privately — which is
// how this family reached fourteen rival definitions. The cross-product and t/u
// spellings are proven ONE family in the module header and executed as such in
// __tests__/segmentIntersection.oracle.test.ts.
export {
  intersectLines2D,
  intersectSegments2D,
  segmentsCrossHalfOpen2D,
  segmentsProperlyCross2D,
  type LineIntersection2D,
  type SegmentIntersection2D,
} from './pure/segmentIntersection.js';
// §C73-POLY-BOOLEAN — THE 2-D polygon boolean (GE-05). Before it, the tree had
// ≥5 independent Sutherland–Hodgman half-plane clippers, NO general clipper and
// NO union primitive; three files independently deferred one, and "merge two
// footprints" was not expressible. Arrangement + midpoint classification (NOT
// Greiner–Hormann, whose entry/exit classification breaks on the shared
// street-frontage edge that real cadastral data always carries). Mints no new
// predicate family and no epsilon literal. Oracle-pinned in
// __tests__/polygonBoolean.oracle.test.ts and stressed in
// __tests__/polygonBoolean.differential.test.ts.
//
// ⚠ INTERSECTION AND UNION ONLY — difference (A \ B) is deliberately NOT
// delivered, because it is not oracle-pinned. Read the module header's
// "WHAT THIS IS NOT" before reaching for this.
export {
  polygonBoolean2D,
  intersectPolygons2D,
  unionPolygons2D,
  type PolygonBooleanOp,
  type PolygonBooleanRefusal,
  type PolygonBooleanResult,
} from './pure/polygonBoolean.js';
// §W2A-ROOF-FORM-HONESTY — the PRE-FLIGHT, exported so a command handler can
// refuse IN FRONT OF THE USER before committing, instead of the user discovering
// afterwards that the mansard they asked for was built as a hip.
//
// ⚠ AUTHORED, REACHABLE, AND STILL UNWIRED — stated so it is not mistaken for a
// closed loop. `canProduceRoofForm` has NO CALLER today. Until a roof command
// handler calls it, the only honesty in the shipping path is after-the-fact:
// `produceRoof` logs the substitution and folds it into the geometry hash, so a
// degraded roof can no longer be hash-identical to a faithful one — but nothing
// refuses in front of the user, and nothing reads
// `geo.userData.pryzmRoofDegraded` either. Wiring that refusal is a
// user-visible behaviour change (C67/C68 territory) and is deliberately NOT
// done here.
export {
  canProduceRoofForm,
  describeRoofFormResolution,
  encodeRoofFormResolution,
  type RoofFormResolution,
} from './producers/_internal/roof/roofFormResolution.js';
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
// ── F-P5-04 inversion (2026-08-31): steel section catalogue moved down from
// plugins/structural — pure data (EN 10025 / BS4), zero imports, THREE-free,
// so it keeps the kernel's no-THREE charter intact.
export {
  SteelProfileLibrary,
  type SteelProfile,
  type SectionSeries,
} from './structural/SteelProfileLibrary.js';
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

// ── CSG Boolean ops (manifold-3d backed) — public surface ────────────────────
// §WALL-SINGLE-VOLUME-CSG phase 1 (2026-05-22): the kernel has had a complete
// CSG engine (KernelCSG.subtract/union/intersect, backed by manifold-3d WASM,
// THREE-free, lazily loaded) and a `produceBoolean` descriptor→descriptor
// producer, but neither was exported from the public surface — so the wall
// builder could not run `wallSolid − openingBox` to produce a SINGLE manifold
// volume with a clean boolean void (the architect's "no seams in 3D / IFC"
// requirement). Exporting them here is the safe enabling step (additive only;
// no consumer wired yet). The wall-builder integration is the next phase — see
// the WALL-SINGLE-VOLUME-CSG task + investigation notes.
export { KernelCSG, descriptorToOperand, type CSGOperand } from './csg/index.js';
export {
  produceBoolean,
  composeBooleanHash,
  type BooleanOp,
  type BooleanOptions,
  type BooleanProducer,
} from './producers/boolean.js';

// §WALL-SINGLE-VOLUME-CSG phase 2 (#96, 2026-05-23): pure helper that subtracts a
// wall's opening boxes from its solid → one manifold descriptor with clean voids
// (no abutting-segment seams). Additive only — NOT wired into the wall builder
// yet (phase 3 routes it on the async path behind a feature flag with a segmented
// fallback). Unit-tested in __tests__/produceWallWithVoids.test.ts.
export {
  produceWallWithVoids,
  type WallVoidsOptions,
} from './producers/wallVoids.js';

// ── S52 D1: Family Creator producers (extrude first; sweep / loft / revolve at S53) ──
export {
  produceExtrude,
  composeExtrudeHash,
  // §82.4-DIRECTED-EXTRUDE — the sweep axis is part of the public option shape.
  type ExtrudeDirection,
  type ExtrudeOptions,
  type ExtrudeProducer,
  type ExtrudeResult,
  type ProfilePoint,
} from './producers/extrude.js';
// ── Phase-4 lane 4D: the OTHER three Family Creator producers reach the public
// surface.  They were written at S52–S53, are complete, and have passed their
// own suites since — but the line above said *"sweep / loft / revolve at S53"*
// and nobody ever moved them, so `@pryzm/family-instance` could not construct
// them EVEN IF the document had described one.  That is axis 1 (import /
// construction) of the four-axis reachability reading, and it was broken for
// all three independently of every other blocker.
//
// ⛔ EXPORTING THEM DOES NOT MAKE THEM REACHABLE FROM A DOCUMENT.  Lane 4D
//    measured the remaining gap and it is SCHEMA-side, not kernel-side:
//    `SolidFeatureSchema`'s `sweep`/`loft`/`revolve` arms and
//    `ReferencePlaneSchema` do not carry the sweep PATH as 3-D, the revolve
//    AXIS, the loft vertex-arity rule, or a plane's IN-PLANE BASIS — and
//    without a basis a 2-D profile has no determined position in 3-D at all.
//    The `GeometryAdapter` port in `@pryzm/family-instance` implements all
//    three against these exports and its document-translation layer refuses in
//    front of them, naming the missing fields.  See
//    `audit/universal-component-editor/2026-09-01/phase4/lane-4d-*.md`.
export {
  produceSweep,
  composeSweepHash,
  type SweepOptions,
  type SweepProducer,
  type SweepProfilePoint,
} from './producers/sweep.js';
export {
  produceLoft,
  composeLoftHash,
  type LoftOptions,
  type LoftProducer,
  type LoftProfilePoint,
  type LoftSection,
} from './producers/loft.js';
export {
  produceRevolve,
  composeRevolveHash,
  type RevolveOptions,
  type RevolveProducer,
  type RevolveProfilePoint,
} from './producers/revolve.js';

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
