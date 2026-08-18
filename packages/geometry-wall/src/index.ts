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

// ── §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) — the wall's ISO 13567 / Revit FUNCTION ──
// The drawing layer weights the pen by it, so the eye can find the building's envelope.
// It is a property of the TYPE (declared), never of the wall's thickness (inferred).
export * from './WallFunction';
// §FEAT-WALL-SIDE-FINISH — the per-side finish ladder, the render override and
// the SIDE_CLASSIFICATION_UNKNOWN refusal. Pure; no store, no THREE, no DOM.
export * from './WallSideFinishResolver';

// ── ADR-057 P1 (OI-053h) — rebuild delta classifier (openings-only fast path) ─
export * from './WallDeltaClassifier';
export * from './errors';

// ── Stores ────────────────────────────────────────────────────────────────────
export * from './WallStore';
// §MT-06-ONE-AUTHORITY — the derivation contract geometry-window / geometry-door
// resolve their four geometry fields through. Exported from geometry-wall (not
// duplicated in each element package) so there is ONE implementation to keep
// honest — the PR-13 lesson: a copied store is a store that will diverge.
export * from './HostedOpeningAuthority';
export * from './WallSystemTypeStore';
export * from './WallOccupancyStore';
// §C83-S1 — the WALL-side occupancy gate (a proposed wall vs existing hosted
// openings). Sits beside WallOccupancyStore because it extends that store's
// closed `CanPlaceRefusalCode` union rather than rivalling it (C83 §1.4).
export * from './WallCrossesOpening';
// §C83-MERGE (L-903) — pure detector: collinear-merge candidates + redundant
// stubs after a wall MOVE. Detector ONLY — offer/execution wiring not yet built.
export * from './WallMergeDetector';

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
// §FEAT-HOSTED-ON-CURVED-WALL — arc-length parameterisation of a wall centreline
// (the generalisation of C15 §2) + the radial-band carve for hosted openings.
export * from './WallArcParam';
export * from './CurvedWallOpeningBuilder';
export * from './CurvedWallLayerBuilder';
export * from './CurvedWallCapMiter';
export * from './MiterPrismBuilder';
export * from './WallHoleBodyBuilder';

// ── ADR-0055 Pascal-style wall junction pipeline ─────────────────────────────
// New L/T/X-clean geometry: P1 resolver → P2 footprint → P3a extruder → P3b shim.
// DEFAULT ON since 2026-05-27. Emergency opt-out:
//   window.__pryzmWallPipelineV2 = false
export * from './JunctionResolverV2';
// §MOVE-REWELD (Phase C item 3) — pure engine: re-weld joinedTo partners after a
// wall move, outside slab loops. Output is CascadeWallBaselineEntry-shaped.
export * from './WallMoveReweld';
// §MOVE-REWELD-DISPATCH (L-871/L-872) — the dispatch site the engine's header
// specified: joinedTo partners → ONE CascadeWallBaselineCommand ('move-reweld'),
// behind the propagating + isJoinResolving + cross-service cascade latches.
// Wired in apps/editor engineLauncher next to SlabWallConnectivityService.
export * from './WallMoveReweldService';
export * from './WallFootprint2D';
export * from './WallPolygonExtruder';
export * from './WallPipelineV2';
// §WALL-RAKE — the sign convention, the shear maths, and the single authorability gate.
export * from './WallRake';
export * from './WallProfile';
// §FIX-LAYERED-WALL-V2-PARITY — P2 for LAYERED walls: slice the V2 footprint into per-layer
// bands so a layered wall inherits the resolver's clash-free corners instead of re-deriving
// them with the legacy per-layer miter projection.
export * from './WallLayerFootprint2D';

// ── Edge overlay ──────────────────────────────────────────────────────────────
export * from './WallEdgeOverlayBuilder';

// ── Plan layer symbol (§FIX-PLAN-LAYERED-WALL-SYMBOL, L-62) ─────────────────────
export * from './WallLayerPlanLines';
export * from './WallLayerPlanSymbolBuilder';

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

export type {
    JunctionInfillData,
    JunctionInfillRefusal,
    JunctionInfillRefusalReason,
    JunctionInfillResult,
} from './WallJunctionInfill';
// §JUNCTION-INFILL-REFUSAL (L-920) — `computeJunctionInfills` is the infills-only
// wrapper kept for existing call sites; `…Detailed` is the same single pass with
// the typed refusals visible, for any consumer that must SEE a degenerate
// junction rather than silently render nothing there.
export { computeJunctionInfills, computeJunctionInfillsDetailed } from './WallJunctionInfill';

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
