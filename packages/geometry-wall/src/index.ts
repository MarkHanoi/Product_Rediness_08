/**
 * @pryzm/geometry-wall — public API barrel
 *
 * Sprint E P9-W10 (2026-05-10): extracted from src/engine/subsystems/walls/.
 *
 * Files remaining in src/ (pending Sprint H commands extraction):
 *   - WallTool.ts  (imports ../commands/)
 */

// ── Core types ────────────────────────────────────────────────────────────────
export * from './WallTypes';
export * from './WallDataSchema';
export * from './errors';

// ── Stores ────────────────────────────────────────────────────────────────────
export * from './WallStore';
export * from './WallSystemTypeStore';
export * from './WallOccupancyStore';

// ── Geometry builders ─────────────────────────────────────────────────────────
export * from './PathResolver';
export * from './WallPathBuilder';
export * from './WallIntentResolver';
export * from './WallFragmentBuilder';
export * from './WallInstanceBridge';
export * from './SlabWallCoupling';
export * from './composeWallGeometryHash';

// ── Opening builders ──────────────────────────────────────────────────────────
export * from './WallOpeningPositionResolver';
export * from './WallOpeningRenderData';
export * from './LayeredWallOpeningBuilder';

// ── Curved wall builders ──────────────────────────────────────────────────────
export * from './CurvedWallLayerBuilder';
export * from './CurvedWallCapMiter';
export * from './MiterPrismBuilder';

// ── ADR-0055 Pascal-style wall junction pipeline ─────────────────────────────
// New L/T/X-clean geometry: P1 resolver → P2 footprint → P3a extruder → P3b shim.
// Opt in per session with `window.__pryzmWallPipelineV2 = true`. Default OFF.
export * from './JunctionResolverV2';
export * from './WallFootprint2D';
export * from './WallPolygonExtruder';
export * from './WallPipelineV2';

// ── Edge overlay ──────────────────────────────────────────────────────────────
export * from './WallEdgeOverlayBuilder';

// ── Snap & alignment ──────────────────────────────────────────────────────────
export * from './WallSnapCycler';
export * from './WallAlignmentGuide';

// ── UI helpers ────────────────────────────────────────────────────────────────
export * from './DimensionPreview';
export * from './WallDimensionInput';

// ── Instanced renderer interface ──────────────────────────────────────────────
export type { IInstancedRenderer } from './IInstancedRenderer';

// ── Sprint D P9-W9 deferred (2026-05-10) — Wall junction geometry cluster ────
// (unblocked after Sprint E: walls/ in packages ✅, @pryzm/geometry-wall exists ✅)
export type { EndpointSide, ClusterEndpoint, JunctionCluster } from './WallJunctionClustering';
export { detectJunctionClusters } from './WallJunctionClustering';

export type { JunctionInfillData } from './WallJunctionInfill';
export { computeJunctionInfills } from './WallJunctionInfill';

export { WallJunctionInfillManager } from './WallJunctionInfillManager';

export type { ResolveLevelOptions } from './WallJoinResolver';
export { WallJoinResolver, DEFAULT_SNAP_RADIUS, DEFAULT_MIN_WALL_LENGTH } from './WallJoinResolver';
// JoinData originates in @pryzm/core-app-model but is re-exported here for
// geometry-wall consumers that already import from this barrel.
export type { JoinData } from './WallJoinResolver';

// Sprint X (2026-05-12) — WallTool extracted from src/engine/subsystems/walls/
export { WallTool } from './WallTool';

// ── Openings (Sprint T-2) ─────────────────────────────────────────────────────
export { OpeningCleanupHandler }    from './OpeningCleanupHandler';

// ── Room Bounding Lines (Sprint T-3) ──────────────────────────────────────────
export { RoomBoundingLineBuilder }  from './RoomBoundingLineBuilder';
export { RoomBoundingLineTool }     from './RoomBoundingLineTool';
