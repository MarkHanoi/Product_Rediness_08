// Casa Unifamiliar — stairwell-void registry (A.21.D29 #1).
//
// PROBLEM: a multi-storey stair auto-punches a VOID in the structural SLAB above
// it (CreateStairCommand.autoCreateOpening → slab opening, sized to the stair's
// bounding footprint — §VOID). But the post-generation finish chain
// (runHousePostGenChain) lays a FLOOR FINISH on the upper storey AND a CEILING
// under it, and NEITHER carried a matching hole — so the finish plate + ceiling
// tile covered the open stairwell, defeating the slab void. You could no longer
// see between storeys.
//
// FIX (ADDITIVE): the HouseLayoutExecutor records each stair's void footprint
// (the SAME world-XZ rect the slab opening uses — `computeStairFootprintRect`,
// keyed by the void's host level = the stair's `topLevelId`) into this tiny
// in-memory registry as it builds the stairs. The floor + ceiling passes then
// read the voids for the level they are finishing and cut / skip the finish over
// the void footprint, so the stairwell stays open through finish + structure +
// ceiling.
//
// Apartment-safe: a single-storey house and the apartment path build NO stairs
// with `autoCreateOpening`, so this registry stays EMPTY for them and the floor /
// ceiling passes behave byte-for-byte as before. It is a simple in-memory map —
// no rAF, no store writes, no new deps. Mirrors `houseFanoutGuard.ts`.

/** A recorded stairwell void: the host level it sits in + its footprint polygon
 *  in WORLD X-Z (the 4 oriented-rect corners `computeStairFootprintRect` returns,
 *  the exact polygon the slab opening was cut from). */
export interface StairVoid {
    /** The level whose slab/floor/ceiling the void pierces (stair.topLevelId). */
    readonly levelId: string;
    /** Footprint polygon in world X-Z (CCW oriented rect; matches the slab void). */
    readonly polygon: ReadonlyArray<{ readonly x: number; readonly z: number }>;
}

let _voids: StairVoid[] = [];

/** Clear all recorded voids — called at the START of each house build so a
 *  re-generate never leaks voids from the previous run. */
export function resetStairVoids(): void {
    _voids = [];
}

/** Record one stairwell void (host levelId + world-XZ footprint polygon). */
export function recordStairVoid(levelId: string, polygon: ReadonlyArray<{ x: number; z: number }>): void {
    if (!levelId || polygon.length < 3) return;
    _voids.push({ levelId, polygon: polygon.map(p => ({ x: p.x, z: p.z })) });
}

/** All voids whose host level === `levelId` (for the floor / ceiling pass). */
export function getStairVoidsForLevel(levelId: string): StairVoid[] {
    return _voids.filter(v => v.levelId === levelId);
}
