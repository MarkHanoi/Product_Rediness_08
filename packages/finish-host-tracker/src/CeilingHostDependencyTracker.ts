/**
 * CeilingHostDependencyTracker — the ceiling binding of
 * `FinishHostDependencyTracker` (§FINISH-FOLLOWS-WALL).
 *
 * THE FIRST CONSUMER of `CeilingHostReferenceEdge` — arm A6 of
 * `check-move-propagation` measured it at ZERO consumers, filed as its own
 * ledger row DELIBERATELY, "so a single row would [not] let one family be fixed
 * while the other silently stayed broken behind a green line" (C79 §7.4). Both
 * families are closed by the same base class for the same reason.
 *
 * Events: `bim-ceiling-{added,updated,removed}` — canonical payload `{ id }`
 * (event-bus/src/catalog.ts:36-38). Legacy `{ ceiling }` / `{ ceilingId }`
 * shapes tolerated per §FINISH-TRACKER-EVENT-SHAPE (see the base class).
 */

import type { CeilingData, CeilingHostReferenceEdge, CeilingSketchEdge } from '@pryzm/core-app-model/stores';
import {
    FinishHostDependencyTracker,
    type FinishBoundaryCommandFactory,
    type FinishCommandManagerRef,
    type FinishStoreLike,
    type WallStoreRef,
} from './FinishHostDependencyTracker';
import type { FinishGeometryServices } from './FinishSegmentAdapter';

/**
 * Typed reader over a ceiling's outer-loop host references — the ceiling twin
 * of `floorHostReferenceEdges`, byte-identical per C79 §3.4.
 *
 * §NO-EMPTY-MEANS-UNKNOWN (C78 §1.4): `null` = no sketch recorded
 * (`RELATIONSHIP_NOT_RECORDED`); `[]` = recorded loop, zero wall attributions.
 * Two different facts, two different values.
 */
export function ceilingHostReferenceEdges(ceiling: CeilingData): CeilingHostReferenceEdge[] | null {
    if (!ceiling.sketch) return null;
    return ceiling.sketch.outerLoop.edges.filter(
        (e: CeilingSketchEdge): e is CeilingHostReferenceEdge => e.type === 'hostReference'
    );
}

export class CeilingHostDependencyTracker extends FinishHostDependencyTracker<CeilingData> {
    constructor(
        ceilingStore: FinishStoreLike<CeilingData>,
        wallStore: WallStoreRef,
        geometry: FinishGeometryServices,
        commandManagerRef: FinishCommandManagerRef,
        makeBoundaryCommand?: FinishBoundaryCommandFactory,
    ) {
        super(
            'ceiling',
            {
                added: 'bim-ceiling-added',
                updated: 'bim-ceiling-updated',
                removed: 'bim-ceiling-removed',
                detailRecordKeys: ['ceiling'],
                detailIdKeys: ['ceilingId'],
            },
            ceilingStore,
            wallStore,
            geometry,
            commandManagerRef,
            makeBoundaryCommand,
        );
    }
}
