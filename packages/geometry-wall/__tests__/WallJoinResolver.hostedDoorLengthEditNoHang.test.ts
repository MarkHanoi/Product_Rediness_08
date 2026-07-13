/**
 * §FIX-WALL-LENGTH-EDIT-HOSTED-DOOR-FREEZE (L-250) — a LENGTH edit on a door-bearing
 * wall must terminate, stay finite, and be a FIXED POINT.
 *
 * THE GAP THIS CLOSES, STATED PLAINLY.
 *
 * L-234's guard (`WallJoinResolver.hostedDoorMoveNoHang.test.ts`) proved the resolver
 * terminates and is idempotent on a wall MOVE. But read its own premise, verbatim:
 *
 *     "A 3D-gizmo wall MOVE is a pure TRANSLATION: both endpoints shift by the same
 *      (dx,dz) … so the moved baseline KEEPS ITS DIRECTION."
 *
 * Every termination argument in that suite rests on that. **A property-panel LENGTH edit
 * is not a translation.** `PropertyPanelSections.ts:98-123` recomputes ONE endpoint:
 *
 *     newEnd = start + dir * newLength        // start is pinned; the far end moves
 *
 * Moving ONE endpoint **changes junction topology** in a way a rigid translation never
 * can. The far end can be driven INTO a neighbouring wall (creating a T-junction that
 * did not exist), or pulled OUT of a corner (destroying one), or — the case our own
 * source calls the founder's hard freeze — shortened until **BOTH ends of the wall fall
 * into a SINGLE junction cluster** (`WallRebuildCoordinator.ts:227-234`,
 * §SELF-CLUSTER-GUARD): "the resolver keeps wanting to re-write it, so the flush re-arms
 * EVERY rAF frame and never converges → the founder's hard freeze."
 *
 * WHY A COST TEST COULD NEVER HAVE CAUGHT THIS. L-234 measured the rebuild COST and drove
 * it from O(level) to O(affected) — 200 wall bodies → 4, 48 CSG extrudes → 0. That work is
 * real and it holds. **But a hang is invisible to a cost measurement**: an O(4) rebuild
 * repeated forever is still a frozen tab. So the property under test here is not speed —
 * it is **CONVERGENCE**:
 *
 *     resolveLevel(resolveLevel(walls)) === resolveLevel(walls)
 *
 * If the resolver is not a fixed point on these topologies, the flush re-arms on its own
 * output, every frame, forever. That is the freeze, expressed as a testable invariant.
 */

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData, Opening } from '../src/WallTypes';

let _seq = 0;

function door(offset: number): Opening {
    return {
        id: `op_${_seq}`,
        type: 'door',
        elementId: `door_${_seq}`,
        offset,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
    } as Opening;
}

function wall(
    start: [number, number],
    end: [number, number],
    thickness = 0.2,
    openings: Opening[] = [],
): WallData {
    const id = `wall_${_seq++}`;
    return {
        id,
        type: 'wall',
        levelId: 'level-0',
        properties: {},
        childrenIds: openings.map(o => o.elementId).filter(Boolean) as string[],
        baseLine: [
            { x: start[0], y: 0, z: start[1] },
            { x: end[0], y: 0, z: end[1] },
        ],
        height: 3,
        thickness,
        baseOffset: 0,
        openings,
    } as WallData;
}

/**
 * The PROPERTY-PANEL length edit, exactly as `PropertyPanelSections.ts:104-116` performs
 * it: keep start, keep direction, move the FAR endpoint to give the requested length.
 * This is the transform L-234 never tested.
 */
function setLength(w: WallData, newLength: number): WallData {
    const [s, e] = w.baseLine;
    const dx = e.x - s.x;
    const dz = e.z - s.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    return {
        ...w,
        baseLine: [
            { x: s.x, y: s.y, z: s.z },
            { x: s.x + ux * newLength, y: e.y, z: s.z + uz * newLength },
        ],
    } as WallData;
}

type Adj = { invalid?: boolean; baseLine: { x: number; y: number; z: number }[] };

const finite = (bl: { x: number; y: number; z: number }[]): boolean =>
    bl.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));

/** Fold a resolve pass back onto the walls, so the next pass sees what the store would. */
function applyAdjustments(walls: WallData[], adj: Map<string, Adj>): WallData[] {
    return walls.map((w) => {
        const a = adj.get(w.id);
        if (!a?.baseLine || a.baseLine.length < 2) return w;
        return {
            ...w,
            baseLine: [
                { x: a.baseLine[0].x, y: 0, z: a.baseLine[0].z },
                { x: a.baseLine[1].x, y: 0, z: a.baseLine[1].z },
            ],
        } as WallData;
    });
}

const key = (bl: { x: number; z: number }[]): string =>
    bl.map(p => `${p.x.toFixed(6)},${p.z.toFixed(6)}`).join('|');

/**
 * THE CONVERGENCE ASSERTION — the whole point of this file.
 *
 * Re-resolve the level, feeding each pass its own output, and count how many passes it
 * takes for the geometry to stop changing. A resolver that is a fixed point settles in
 * ONE further pass. A resolver that keeps re-writing its own output never settles — and
 * in production that is `_flush` re-arming every rAF frame, i.e. the founder's frozen tab.
 */
function passesToSettle(walls: WallData[], maxPasses = 12): number {
    let current = walls;
    let prevKey = current.map(w => key(w.baseLine)).join(';');

    for (let pass = 1; pass <= maxPasses; pass++) {
        const adj = WallJoinResolver.resolveLevel(current as WallData[]) as unknown as Map<string, Adj>;
        for (const w of current) {
            const a = adj.get(w.id);
            if (a?.baseLine) expect(finite(a.baseLine)).toBe(true);   // never NaN, on any pass
        }
        current = applyAdjustments(current, adj);
        const nextKey = current.map(w => key(w.baseLine)).join(';');
        if (nextKey === prevKey) return pass;    // settled
        prevKey = nextKey;
    }
    return Number.POSITIVE_INFINITY;             // never converged → the freeze
}

describe('§FIX-WALL-LENGTH-EDIT-HOSTED-DOOR-FREEZE (L-250) — a LENGTH edit must CONVERGE', () => {
    it('(a) SHRINK a door-bearing wall away from its corner — resolveLevel converges', () => {
        _seq = 0;
        // A door-bearing wall meeting a perpendicular neighbour at a corner…
        const host = wall([0, 0], [6, 0], 0.2, [door(3)]);
        const perp = wall([6, 0], [6, 5], 0.2);
        // …then the founder types a SHORTER length: the far end retreats from the corner,
        // DESTROYING the junction. A translation can never do this.
        const shortened = setLength(host, 4);

        expect(passesToSettle([shortened, perp])).toBeLessThanOrEqual(2);
    });

    it('(b) EXTEND a door-bearing wall INTO a neighbour — a NEW T-junction is created, and it converges', () => {
        _seq = 0;
        const host = wall([0, 0], [4, 0], 0.2, [door(2)]);
        // A neighbour standing clear of the host, crossing its axis further along.
        const cross = wall([6, -3], [6, 3], 0.2);
        // The founder types a LONGER length: the far end is driven ONTO the neighbour's
        // midspan, CREATING a T-junction that did not exist a moment ago.
        const extended = setLength(host, 6);

        expect(passesToSettle([extended, cross])).toBeLessThanOrEqual(2);
    });

    it('(c) THE FREEZE CANDIDATE — shrink until BOTH ends fall in ONE junction cluster (§SELF-CLUSTER)', () => {
        _seq = 0;
        // Two neighbours close together; the door-bearing wall spans between them…
        const left  = wall([0, -3], [0, 3], 0.2);
        const right = wall([3, -3], [3, 3], 0.2);
        const host  = wall([0, 0], [3, 0], 0.2, [door(1.5)]);
        // …and the founder shortens it until it is barely longer than the junction
        // clustering radius, so BOTH of its endpoints land inside a SINGLE cluster.
        // This is the exact condition WallRebuildCoordinator.ts:227-234 names as the one
        // where "the resolver keeps wanting to re-write it … and never converges".
        const selfClustered = setLength(host, 0.35);

        // It may legitimately be flagged invalid/degenerate — that is a CORRECT outcome.
        // What it must NEVER do is fail to settle.
        expect(passesToSettle([selfClustered, left, right])).toBeLessThanOrEqual(2);
    });

    it('(d) resolveLevel is a FIXED POINT on a length-edited door wall (re-running changes nothing)', () => {
        _seq = 0;
        const host = wall([0, 0], [5, 0], 0.2, [door(2.5)]);
        const perp = wall([5, 0], [5, 4], 0.2);
        const edited = setLength(host, 5.6);   // far end pushed 600 mm PAST the corner
        const walls = [edited, perp];

        const first  = WallJoinResolver.resolveLevel(walls) as unknown as Map<string, Adj>;
        const folded = applyAdjustments(walls, first);
        const second = WallJoinResolver.resolveLevel(folded) as unknown as Map<string, Adj>;

        // The second pass must agree with the first, to the micron. If it does not, the
        // store gets re-written, which re-arms the flush, which resolves again — forever.
        for (const w of walls) {
            const a = first.get(w.id);
            const b = second.get(w.id);
            if (!a?.baseLine || !b?.baseLine) continue;
            expect(key(b.baseLine)).toBe(key(a.baseLine));
        }
    });
});
