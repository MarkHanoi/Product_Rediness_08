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
export { RoofStore } from './RoofStore';
export { RoofLevelCleanupHandler } from './RoofLevelCleanupHandler';
export { WallRegionDetector } from './WallRegionDetector';
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
