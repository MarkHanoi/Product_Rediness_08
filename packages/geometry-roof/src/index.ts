/**
 * @pryzm/geometry-roof — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/roofs/
 * Sprint S  (2026-05-11): RoofLevelCleanupHandler added (Great Purge)
 * Sprint AA (2026-05-12): RoofGeometryBuilder, RoofFragmentBuilder, RoofTool,
 *                         RoofSlopeSymbolBuilder promoted from src/
 */

export * from './RoofTypes';
export * from './roofSnapshotUtils';
// §GE-06-ROOF-WALL-SLICE — pure roof-vs-walls-beneath clash detection (PR-10).
export {
    detectRoofWallClashes,
    roofUndersideYAt,
    SAMPLES_PER_WALL,
    type RoofClashRoof,
    type RoofClashWall,
    type RoofWallClashFinding,
    type RoofWallClashKind,
} from './pure/roofWallClash';
// §GE-06-ROOF-WALL-WIRE — the adapter that makes the detector reachable from
// the `clash-run` VERB, not only from the level-reconcile announcer.
export {
    createRoofWallClashRunner,
    ROOF_WALL_PAIR,
    type RoofClashSourceRoof,
    type RoofClashSourceWall,
    type RoofWallClashRecord,
    type RoofWallClashRunOutcome,
    type RoofWallClashRunner,
    type RoofWallClashSource,
} from './pure/roofWallClashRunner';
// §ROOF-HOSTED-OPENINGS — the roof's planar-face decomposition and the
// face-plane-local coordinate model a hosted skylight ("lucernario") is authored
// in. Pure; see the module header for the architectural decision and for what
// refuses.
export {
    computeRoofFaces,
    faceYAt,
    faceUVToPlan,
    planToFaceUV,
    faceRectToPlanProfile,
    resolveHostFace,
    worldXZToRoofLocal,
    roofLocalToWorldXZ,
    type FaceRect,
    type FaceUV,
    type HostFaceResolution,
    type RoofFace,
    type RoofFaceRefusalReason,
    type RoofFaceSet,
    type RoofFaceSource,
} from './pure/roofFaces';
export { RoofStore } from './RoofStore';
export { RoofLevelCleanupHandler } from './RoofLevelCleanupHandler';
// ── §TOMBSTONE-ROOF-REGION-DETECTOR (2026-08-12, C79 §6.5) ───────────────────
//
// DELETED HERE: `WallRegionDetector` (was `./WallRegionDetector.ts`).
//
// It was the SECOND, INDEPENDENT region tracer — a duplicate of geometry-slab's
// `SlabRegionTracer` whose `detect(hitPoint, wallStore): Pt[] | null` projected
// the traced loop to bare coordinates and DISCARDED WALL IDENTITY before
// returning (there was no field to fill in). Two tracers is how one fix reaches
// one family: `e6c8cb58` closed the attribution defect in the slab tracer and
// roof did not move at all (C79 §0.1(1), §6.4). C79 §6.5 directs the duplicate
// be RETIRED onto the shared tracer, not extended in parallel.
//
// THE LIVE OWNER — import from this, and only this:
//   `traceRoofRegionAtPoint` (below) → `@pryzm/geometry-slab/region-tracer`'s
//   `traceRegionSketchAtPoint`, which also carries the curved-wall fixes the
//   detector lacked (§FIX-REGION-RING-PRETRIM-FRAME, §ARC-DENSITY) and the
//   attribution machinery it structurally could not (§REGION-HOST-ATTRIBUTION).
export {
    traceRoofRegionAtPoint,
    formatRoofRegionAttributionReport,
} from './RoofRegionTrace';
export type {
    RoofRegionTraceResult,
    RegionSketchAttribution,
    RegionWallLike,
} from './RoofRegionTrace';

// §ROOF-FOLLOWS-WALL (GR-12 · C79 §5.1/§5.2 · C78 §8.1) — a roof FOLLOWS the
// walls it was traced from, or says `undetermined` with a typed reason.
//
// Exported from the barrel because the three sites that must call it all live
// OUTSIDE this package and cannot be written from inside it: an
// `UpdateRoofBoundaryCommand` in `packages/command-registry`, the tracker's
// construction in `apps/editor/src/engine/initTools.ts` beside the other three
// families, and the population of `boundingWallIds` at creation on BOTH
// by-region paths (C79 §7.4 — one path alone is worse than none). See
// `RoofDependencyTracker.ts`'s header for the exact contract each owes.
export {
    RoofDependencyTracker,
    recomputeRoofForWall,
    roofRegionReferenceFromTrace,
} from './RoofDependencyTracker';
export type {
    RoofRecordLike,
    RoofBoundaryWritePayload,
    RoofBoundaryCommandFactory,
    RoofBoundaryCommandLike,
    RoofCommandExecutor,
    RoofWallStoreRef,
    RoofStoreLike,
} from './RoofDependencyTracker';
export {
    classifyRoofRecompute,
    worstRoofRecomputeState,
    ringsEqualCyclicXZ,
    signedAreaXZ,
    selfIntersectsXZ,
    toStoredFootprint,
    toWorldRing,
    ROOF_RECOMPUTE_STATE_ORDER,
} from './roofRecomputeVerdict';
export type {
    RoofRecomputeState,
    RoofRecomputeUndeterminedReason,
    RoofRecomputeVerdict,
    RoofRegionResolution,
    RoofXZ,
} from './roofRecomputeVerdict';

export { RoofSnapEngine } from './RoofSnapEngine';
export type { SnapType, SnapResult } from './RoofSnapEngine';

// Sprint AA
export { RoofGeometryBuilder } from './RoofGeometryBuilder';
export { RoofFragmentBuilder } from './RoofFragmentBuilder';
export { RoofTool, RoofToolState } from './RoofTool';
export type { RoofToolDeps, RoofToolCallbacks } from './RoofTool';
export { RoofSlopeSymbolBuilder } from './RoofSlopeSymbolBuilder';

// A.21.D24 §RIDGE-PRINCIPAL-AXIS — pure (THREE-free) gable ridge-axis helpers.
export { principalAxis, gableRidge, isGableFriendly, isConvexPolygon } from './roofRidgeAxis';
export type { Pt2 } from './roofRidgeAxis';

// §ROOF-CONCAVE-DECOMPOSE (founder L-shape defect, 2026-06-10) — pure rectilinear
// decomposition of a concave (L/T/U) footprint into rectangular wings, so the
// caller can keep a PITCHED roof (one gable per wing) instead of flat-degrading.
export {
    decomposeRectilinear,
    rectToPolygon,
    isRectilinear,
    canDecomposeConcave,
} from './roofDecompose';
export type { Rect2 } from './roofDecompose';

// §FIX-ROOF-REGION-FOLLOWS-ARC (L-699) + §ROOF-ENGINE-STAGE-1 — the pure
// (THREE-free, DOM-free, I/O-free) roof geometry primitives. These are the
// foundation the staged roof engine is built on and are unit-tested on real
// footprints; nothing here may acquire a THREE, DOM or store dependency.
export {
    sampleWallCentreline,
    sampleWallChords,
    isCurvedWall,
    resolveCurveSegments,
    DEFAULT_CURVE_SEGMENTS,
} from './pure/wallCentreline';
export type { CentrelineWall } from './pure/wallCentreline';
export { offsetPolygon, offsetPolygonOrSelf, signedArea, dedupeRing } from './pure/polygonOffset';
export type { OffsetResult } from './pure/polygonOffset';
export {
    pitchedRingsFromOffsets,
    maxInwardOffset,
    needsGeneralPitchedBuilder,
    MAX_RINGS,
} from './pure/pitchedFromOffsets';
export type { PitchedRing, PitchedRingStack } from './pure/pitchedFromOffsets';

// §ROOF-UPPER-LEVEL (founder ruling 2026-08-09) — the roof's OWN declaration of
// which level it belongs to: the level immediately ABOVE the one it was drawn on,
// ordered by elevation. Pure; consumed by CreateRoofCommand.
export { resolveRoofLevel } from './pure/roofLevelPolicy';
export type {
    RoofLevelRef,
    RoofLevelResolution,
    RoofLevelResolutionReason,
} from './pure/roofLevelPolicy';
