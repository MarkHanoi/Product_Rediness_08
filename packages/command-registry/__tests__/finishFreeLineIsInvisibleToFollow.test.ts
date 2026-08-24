import { describe, it, expect } from 'vitest';
import {
    buildRoomFinishBoundarySketch,
    type IdentifiedFinishWall,
    type XZ,
} from '../src/rooms/roomBoundarySketch';

/**
 * §FF-6 / L-10800 — WHY "PERIMETER ADAPTS, INTERIOR PARTITIONS DO NOT".
 *
 * Founder, 2026-08-24, after testing the L-10640 fix: *"Floor not well fitting the space —
 * taking shortcuts — also not updating / adapting: on PERIMETER changes it adapts, but on
 * INTERIOR PARTITIONS it does not."*
 *
 * ⛔ THE OBVIOUS EXPLANATION IS WRONG, AND THIS SUITE EXISTS TO KEEP IT REFUTED.
 * `FinishHostDependencyTracker` walks `outerLoop` only, so "an interior partition is not an
 * outer-loop edge" is the tempting answer. It is false: a partition that BOUNDS a room is an
 * edge of that room's ring, hence an edge of the finish's outer loop, hence followable. Test
 * 1 pins that. Wiring the tracker to walk `innerLoops` would have added ZERO coverage for
 * this symptom — `innerLoops` are holes, and a partition makes no hole.
 *
 * ⭐ THE ACTUAL MECHANISM is attribution. `buildRoomFinishBoundarySketch` is §2.1
 * CONSTRAINED, not §2.2 searched: candidates are exactly `room.boundingWallIds`, and an edge
 * matching no candidate is emitted as a `freeLine`. The tracker keeps only
 * `type === 'hostReference'`, so **a `freeLine` edge is permanently invisible to the follow.**
 * A wall whose junction is topologically OPEN never enters the planar face walk, so it is
 * never in `boundingWallIds` — which is precisely the state the founder's log reports for his
 * interior partitions (`unresolvedLoopBreaks`, `INCUMBENT_EXTENSION_REQUIRED … junctions LEFT
 * UNREPAIRED`), while his perimeter walls join cleanly.
 *
 * ⛔ DO NOT "FIX" A FAILING CASE HERE BY WIDENING `PERP_TOL_M`. Attributing a finish edge to a
 * wall 793 mm away is attribution by proximity — the §2.2/§2.3 anti-pattern that produces a
 * WRONG hostId (a finish following the neighbour's partition). The repair is the junction.
 */

const T = 0.2;

/** The tracker's own predicate, reproduced so this suite tests the REAL selector shape. */
function hostEdgesOf(sketch: { outerLoop: { edges: Array<{ type: string; hostId?: string }> } }) {
    return sketch.outerLoop.edges.filter(e => e.type === 'hostReference');
}

function wall(id: string, a: XZ, b: XZ, thickness = T): IdentifiedFinishWall {
    return { id, baseLine: [a, b], thickness } as IdentifiedFinishWall;
}

/**
 * A 6 m × 4 m room. Edges 0 and 2 are PERIMETER walls; edge 1 is an INTERIOR PARTITION
 * (it separates this room from the one next door); edge 3 is perimeter.
 */
const RING: XZ[] = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }];
const PERIM_A = wall('wall_perimeter_A', { x: 0, z: 0 }, { x: 6, z: 0 });
const PARTITION = wall('wall_INTERIOR_partition', { x: 6, z: 0 }, { x: 6, z: 4 });
const PERIM_B = wall('wall_perimeter_B', { x: 6, z: 4 }, { x: 0, z: 4 });
const PERIM_C = wall('wall_perimeter_C', { x: 0, z: 4 }, { x: 0, z: 0 });
const ALL = [PERIM_A, PARTITION, PERIM_B, PERIM_C];

function lookup(boundingWallIds: string[], walls: IdentifiedFinishWall[]) {
    return {
        getRoomById: () => ({ boundingWallIds }),
        getWallById: (id: string) => walls.find(w => w.id === id),
    };
}

describe('§FF-6 — an INTERIOR PARTITION is followable; a FREE LINE is not (L-10800)', () => {
    it('1. ⭐ REFUTES "outerLoop cannot see a partition" — a BOUNDING partition IS a host edge', () => {
        const sketch = buildRoomFinishBoundarySketch(
            RING, 'room-1', lookup(ALL.map(w => w.id), ALL),
        );
        const hosts = hostEdgesOf(sketch as never).map(e => e.hostId);

        // The partition is on the OUTER loop and carries a hostReference like any perimeter wall.
        expect(hosts).toContain('wall_INTERIOR_partition');
        expect(sketch.boundingWallIds).toContain('wall_INTERIOR_partition');
        // Nothing about being "interior" excludes it.
        expect(hosts).toHaveLength(4);
    });

    it('2. ⛔ THE REAL FAILURE — a wall absent from `boundingWallIds` yields a FREE LINE', () => {
        // The room's planar face walk never produced this partition (its junction is
        // topologically open), so it is not a candidate. Its edge cannot attribute.
        const withoutPartition = ALL.filter(w => w.id !== PARTITION.id);
        const sketch = buildRoomFinishBoundarySketch(
            RING, 'room-1', lookup(withoutPartition.map(w => w.id), withoutPartition),
        );
        const hosts = hostEdgesOf(sketch as never).map(e => e.hostId);

        expect(hosts).not.toContain('wall_INTERIOR_partition');
        expect(sketch.boundingWallIds).not.toContain('wall_INTERIOR_partition');
        // ⭐ The edge still EXISTS in the ring — it is simply un-followable.
        const free = (sketch.outerLoop.edges as Array<{ type: string }>).filter(e => e.type === 'freeLine');
        expect(free.length).toBeGreaterThanOrEqual(1);
        // ⛔ AND THAT IS THE WHOLE DEFECT: the tracker's selector cannot see it.
        expect(hostEdgesOf(sketch as never)).toHaveLength(3);
    });

    it('3. a free edge is INVISIBLE to the tracker selector, not merely unlabelled', () => {
        const withoutPartition = ALL.filter(w => w.id !== PARTITION.id);
        const sketch = buildRoomFinishBoundarySketch(
            RING, 'room-1', lookup(withoutPartition.map(w => w.id), withoutPartition),
        );
        // Moving the partition can never reach this finish: no edge names it.
        const watched = new Set(hostEdgesOf(sketch as never).map(e => e.hostId));
        expect(watched.has('wall_INTERIOR_partition')).toBe(false);
    });

    it('4. ⛔ a room that declares NO bounding walls follows NOTHING — and says so', () => {
        const sketch = buildRoomFinishBoundarySketch(RING, 'room-1', lookup([], ALL));
        expect(hostEdgesOf(sketch as never)).toHaveLength(0);
        expect(sketch.boundingWallIds).toHaveLength(0);
        // §NO-EMPTY-MEANS-UNKNOWN — the reason is NAMED, not left as a bare empty set.
        expect(sketch.attribution.freeEdges).toBe(RING.length);
    });

    it('5. ⛔ no hostRoomId → every edge free, reason `roomUndetected` (never a silent guess)', () => {
        const sketch = buildRoomFinishBoundarySketch(RING, undefined, lookup(ALL.map(w => w.id), ALL));
        expect(hostEdgesOf(sketch as never)).toHaveLength(0);
        expect(sketch.attribution.roomUndetectedFallbacks).toBe(RING.length);
    });

    it('6. ⭐ PARTIAL attribution is the "taking shortcuts" shape — some edges follow, some do not', () => {
        // Exactly the founder's report: perimeter walls attribute, the partition does not.
        const withoutPartition = ALL.filter(w => w.id !== PARTITION.id);
        const sketch = buildRoomFinishBoundarySketch(
            RING, 'room-1', lookup(withoutPartition.map(w => w.id), withoutPartition),
        );
        expect(sketch.attribution.hostEdges).toBeGreaterThan(0);   // perimeter adapts
        expect(sketch.attribution.freeEdges).toBeGreaterThan(0);   // the partition does not
        // A mixed ring is not a corner case — it is the normal state of a damaged wall graph,
        // and it is what `window.pryzmFinishHosts()` now surfaces per finish.
    });
});
