/**
 * @pryzm/room-topology — public barrel
 *
 * Room topology: 3-D spatial index + adjacency graph.
 * Migrated from src/engine/subsystems/topology/ (Task 5.1, C01 §3).
 */

export type { BoundingBox } from './TopologySpatialIndex.js';
export { TopologySpatialIndex, topologySpatialIndex } from './TopologySpatialIndex.js';

export type {
    TopologyChangeEvent,
    AdjacencyRelationship,
} from './TopologyLayer.js';
export { TopologyEventBus, topologyEventBus, TopologyLayer, topologyLayer } from './TopologyLayer.js';

// ── Room types + polygon utils + snapshot utils ────────────────────────────────
// Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/rooms/

export * from './RoomTypes';
export * from './RoomPolygonUtils';
export * from './roomSnapshotUtils';

// ── Wall junction resolution + planar topology (Phase D/E) ──────────────────
// Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/ai/
export type { WallNode, WallGraph, SplitWallEntry } from './WallIntersectionResolver';
export {
    DEFAULT_CORNER_THRESHOLD_M,
    DEFAULT_T_JUNCTION_THRESHOLD_M,
    resolveWallJunctions,
    detectAndLogCrossings,
    splitWallsAtCrossings,
    buildWallGraph,
} from './WallIntersectionResolver';

export type { DetectedRoom, TopologyResult } from './PlanarTopologyEngine';
export { computeTopology, assignOpeningsToWalls } from './PlanarTopologyEngine';

// ── Room detection engine ────────────────────────────────────────────────────
// Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/rooms/
export { RoomDetectionEngine } from './RoomDetectionEngine';
export { RoomStore } from './RoomStore';

// ── Sprint H P9.2 (2026-05-10) — RoomDataSchema + LightingRoomResolver ───────
export {
    RoomVertexSchema, RoomOccupancyTypeSchema, RoomDetectionMethodSchema,
    RoomBoundarySchema, RoomFinishSpecSchema, RoomFinishesSchema,
    RoomComputedMetricsSchema, RoomIfcDataSchema, RoomMetadataSchema,
    RoomPropertiesSchema, RoomDataAddSchema, RoomDataUpdateSchema,
    formatRoomZodError,
} from './RoomDataSchema';

export { LightingRoomResolver } from './LightingRoomResolver';

// ── Sprint J (2026-05-10) — full rooms subsystem extraction ──────────────────
// 10 remaining files from src/engine/subsystems/rooms/ → @pryzm/room-topology

export { RoomColourSystem } from './RoomColourSystem';
export type { RoomVisualisationMode } from './RoomColourSystem';
export { OCCUPANCY_PALETTE, SYNC_STATE_COLOURS, ROOM_CSS_TOKENS } from './RoomColourSystem';

export { RoomRelationshipService } from './RoomRelationshipService';
export type { RoomRef, DoorRoomRelationship, WindowRoomRelationship } from './RoomRelationshipService';

export { RoomSystemTypeStore } from './RoomSystemTypeStore';
export type { SerializedRoomTypeStore } from './RoomSystemTypeStore';

export { RoomContentsService } from './RoomContentsService';
export type { ElementRef, RoomContents, RoomContentsServiceDeps } from './RoomContentsService';

export { RoomLabelRenderer } from './RoomLabelRenderer';

export { RoomBoundaryBuilder } from './RoomBoundaryBuilder';

export { RoomLevelCleanupHandler } from './RoomLevelCleanupHandler';

export { RoomTagAutoPopulator } from './RoomTagAutoPopulator';
export type { RoomTagAutoPopulatorDeps } from './RoomTagAutoPopulator';

export { roomTagNeedsRefresh, desiredRoomLabel } from './roomTagIdempotency';
export type { RoomTagSourceLike, RoomTagParamsLike } from './roomTagIdempotency';

export { RoomTool } from './RoomTool';
export type { RoomToolPickDeps, RoomToolManualDeps } from './RoomTool';

export { RoomTopologyObserver } from './RoomTopologyObserver';
