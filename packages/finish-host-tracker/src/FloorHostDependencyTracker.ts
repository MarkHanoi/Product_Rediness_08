/**
 * FloorHostDependencyTracker — the floor-finish binding of
 * `FinishHostDependencyTracker` (§FINISH-FOLLOWS-WALL).
 *
 * THE FIRST CONSUMER of `FloorHostReferenceEdge`. `check-move-propagation` arm A5
 * measured the type at ZERO consumer files (move-propagation.json, 2026-08-13:
 * "reference correct, consumers 0") — the creation-time attribution C79 §6.3
 * rows 6/10 landed was correct and read by nothing. This file is the typed
 * reader that closes the writer-first half of that finding (C71 §1.3: a typed
 * per-family read, not an untyped sweep — and the sanctioned direction: readers
 * for edges that already have writers).
 *
 * Events: `bim-floor-{added,updated,removed}` — canonical payload `{ id }`
 * (event-bus/src/catalog.ts:46-48, F.events.17). Legacy `{ floor }` / `{ floorId }`
 * shapes are tolerated per §FINISH-TRACKER-EVENT-SHAPE (see the base class).
 */

import type { FloorData, FloorHostReferenceEdge, FloorSketchEdge } from '@pryzm/core-app-model/stores';
import {
    FinishHostDependencyTracker,
    type FinishBoundaryCommandFactory,
    type FinishCommandManagerRef,
    type FinishStoreLike,
    type WallStoreRef,
} from './FinishHostDependencyTracker';
import type { FinishGeometryServices } from './FinishSegmentAdapter';

/**
 * Typed reader over a floor's outer-loop host references. Exported so other
 * consumers (schedules, inspectors) read the edges through ONE narrowing rather
 * than each minting their own (C79 §3.4 — one relationship, one read shape).
 *
 * §NO-EMPTY-MEANS-UNKNOWN (C78 §1.4): returns `null` when the floor carries NO
 * sketch — the boundary relationship was never recorded
 * (`RELATIONSHIP_NOT_RECORDED` in C78 §8.1's vocabulary) — and `[]` only for a
 * RECORDED loop none of whose edges attributes to a wall. A caller that cannot
 * tell those apart repeats the defect this repo keeps re-measuring:
 * failure-as-emptiness.
 */
export function floorHostReferenceEdges(floor: FloorData): FloorHostReferenceEdge[] | null {
    if (!floor.sketch) return null;
    return floor.sketch.outerLoop.edges.filter(
        (e: FloorSketchEdge): e is FloorHostReferenceEdge => e.type === 'hostReference'
    );
}

export class FloorHostDependencyTracker extends FinishHostDependencyTracker<FloorData> {
    constructor(
        floorStore: FinishStoreLike<FloorData>,
        wallStore: WallStoreRef,
        geometry: FinishGeometryServices,
        commandManagerRef: FinishCommandManagerRef,
        makeBoundaryCommand?: FinishBoundaryCommandFactory,
    ) {
        super(
            'floor',
            {
                added: 'bim-floor-added',
                updated: 'bim-floor-updated',
                removed: 'bim-floor-removed',
                detailRecordKeys: ['floor'],
                detailIdKeys: ['floorId'],
            },
            floorStore,
            wallStore,
            geometry,
            commandManagerRef,
            makeBoundaryCommand,
        );
    }
}
