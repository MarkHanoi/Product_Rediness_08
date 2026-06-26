// §RESI-DOUBLE-ROOM-TAGS (ADR-0069 GR1) — the resi pipeline's graph-authoritative
// room decision + pre-mark, extracted PURE so the all-or-nothing rule and the
// "pre-mark BEFORE the async wall commits" invariant are unit-testable without the
// runtime/DOM. Mirrors the HOUSE executor's pre-mark chokepoint.
//
// ROOT CAUSE this guards: the resi executor used to mark a level
// graph-authoritative only DEEP inside the deferred `_finishApartments` batch
// (which polls for async host walls). But the structural batch dispatches the
// apartment walls via the bus (async); every `bim-wall-mutation-committed` arms the
// RoomTopologyObserver's soft-coalesce → `_executeRedetect`. The structural/corridor
// batches only arm a 1 s cooldown, so once it lapses (and BEFORE the deferred finish
// batch marked the level) an auto-redetect ran on a NOT-YET-authoritative level →
// generic "Room NN" rooms. `_finishApartments` then added the NAMED graph rooms on
// top → the founder's double tags. Deciding + pre-marking BEFORE any wall commit
// closes that window.

/** The minimal shape the decision needs from each apartment build: only whether it
 *  carries engine graph room polygons (`set.roomCommands`) and which level it lands on. */
export interface ApartmentBuildLite {
    readonly levelId: string;
    readonly roomCommandCount: number;
}

/** The observer surface this helper pokes — `window.roomTopologyObserver`. */
export interface GraphAuthorityObserverLike {
    markGraphAuthoritative(levelId: string): void;
}

export interface GraphAuthorityDecision {
    /** All-or-nothing: use the engine's named graph rooms (skip detection) for the
     *  apartment levels. False ⇒ legacy detection defines the rooms. */
    readonly useGraphRooms: boolean;
    /** De-duplicated apartment level ids the decision covers (the levels pre-marked). */
    readonly apartmentLevelIds: readonly string[];
}

/**
 * Decide whether the resi build is graph-authoritative (ADR-0069 GR1) and, when it
 * is, PRE-MARK every apartment level on the observer so no observer-driven redetect
 * can mint a generic room to double against.
 *
 * @param builds            one entry per apartment cell (across all levels).
 * @param graphRoomsEnabled `window.__pryzmGraphRooms !== false` (kill-switch).
 * @param observer          `window.roomTopologyObserver` (may be undefined pre-init).
 */
export function decideAndPreMarkGraphAuthority(
    builds: readonly ApartmentBuildLite[],
    graphRoomsEnabled: boolean,
    observer: GraphAuthorityObserverLike | undefined,
): GraphAuthorityDecision {
    const useGraphRooms = graphRoomsEnabled && builds.some(b => b.roomCommandCount > 0);
    const apartmentLevelIds = [...new Set(builds.map(b => b.levelId))];
    if (useGraphRooms && observer) {
        for (const levelId of apartmentLevelIds) {
            try { observer.markGraphAuthoritative(levelId); }
            catch { /* non-fatal — _finishOneApartment re-marks as a safety net */ }
        }
    }
    return { useGraphRooms, apartmentLevelIds };
}
