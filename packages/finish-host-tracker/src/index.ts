/**
 * @pryzm/finish-host-tracker — §FINISH-FOLLOWS-WALL (GR-12 · C79 §5).
 *
 * Floor-finish & ceiling host dependency trackers: the first consumers of
 * `FloorHostReferenceEdge` / `CeilingHostReferenceEdge`. A moved wall
 * re-projects hosted finishes the way it re-projects slabs
 * (§FIX-SLAB-TRACKER-EVENT-SHAPE, 798f2cfd), and a removed wall degrades their
 * references through an undoable command (C79 §4.2).
 */

export {
    xzPointToResolverPoint,
    resolverPointToXzPoint,
    xzSegmentToResolverSegment,
    resolverSegmentToXzSegment,
    finishEdgeToResolverEdge,
    resolveFinishHostEdgeXZ,
    degradeFinishHostEdgeXZ,
    type XZ,
    type XZSegment,
    type FinishHostReferenceEdgeLike,
    type FinishFreeLineEdgeLike,
    type FinishSketchEdgeLike,
    type ResolverPoint,
    type ResolverSegment,
    type ResolverHostReferenceEdge,
    type ResolverFreeLineEdge,
    type WallFaceResolverLike,
    type SketchLoopIntersectorLike,
    type FinishGeometryServices,
} from './FinishSegmentAdapter';

export {
    reprojectFinishBoundary,
    signedAreaXZ,
    type ReprojectState,
    type ReprojectUndeterminedReason,
    type ReprojectEdgeOutcome,
    type ReprojectFinishBoundaryResult,
    type ReprojectFinishBoundaryInput,
    type WallSnapshotLike,
} from './reprojectFinishBoundary';

export {
    FinishHostDependencyTracker,
    type FinishRecordLike,
    type FinishStoreLike,
    type WallStoreRef,
    type FinishCommandValidationLike,
    type FinishBoundaryCommandLike,
    type FinishCommandManagerLike,
    type FinishCommandManagerRef,
    type FinishBoundaryWritePayload,
    type FinishBoundaryCommandFactory,
    type FinishTrackerEventNames,
    type FinishLateAttribution,
} from './FinishHostDependencyTracker';

export { FloorHostDependencyTracker, floorHostReferenceEdges } from './FloorHostDependencyTracker';
export { CeilingHostDependencyTracker, ceilingHostReferenceEdges } from './CeilingHostDependencyTracker';

// §MESH110-RESTORE-IS-NOT-A-MOVE (L-11567 #3a) — the host-geometry delta gate.
export { wallHostGeometryMoved } from './hostGeometryDelta';
