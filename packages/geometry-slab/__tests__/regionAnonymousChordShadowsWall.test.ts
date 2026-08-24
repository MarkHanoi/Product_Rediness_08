/**
 * §FIX-ANONYMOUS-CHORD-IS-NOT-A-RIVAL-HOST (L-1402) — an edge with no host cannot
 * make an edge that HAS one "ambiguous".
 *
 * FOUNDER-REPORTED, live, 2026-08-24, and the coordinator's natural experiment is
 * what makes this measurable. TWO projects, same session, same build:
 *
 *   3D   (broken proj) 16 host-referenced across 16 wall(s),  6 free (ambiguous=0)
 *   3D   (working    ) 15 host-referenced across 15 wall(s),  2 free (ambiguous=0)
 *   PLAN (broken proj)  0 host-referenced across  0 wall(s), 22 free
 *                       (no-wall-id=11, **ambiguous=11**)
 *   PLAN (working    )  0 host-referenced across  0 wall(s), 39 free
 *                       (no-wall-id=24, **ambiguous=15**)
 *
 * ⭐ ZERO HOST-REFERENCED IN **BOTH** PROJECTS IN PLAN — including the one where the
 * 3D path attributes 15 of 17 edges perfectly, on the same model, in the same
 * session. So this is deterministic and universal, not geometry-dependent, and
 * `ambiguous` is the term that distinguishes the two surfaces: 11/15 in plan, 0 in
 * 3D. `ambiguous` means the edges ARE on walls — the matcher simply refuses to
 * choose.
 *
 * THE MECHANISM. `buildAttributedClosedLoops` welds chords into one graph keyed by
 * NODE PAIR, then:
 *
 *     if (existing.hostId !== seg.hostId) { ...drop BOTH to { hostId: null,
 *                                                             reason: 'ambiguous' } }
 *
 * `RegionBoundarySources` deliberately emits every NON-WALL boundary — slab edges,
 * the parcel ring, curtain walls — **anonymously**, `hostId: null`, and says why in
 * its own header. The plan surface's search set contained `18 slab edge(s)` and a
 * `parcel boundary present (17 edge(s))` beside its 16 walls.
 *
 * ⭐⭐ AND THE FOUNDER'S SLABS WERE THEMSELVES MADE BY REGION, so each one's polygon
 * lies EXACTLY on the walls that bounded it. Every later region trace therefore sees
 * a wall chord and an anonymous slab chord on the SAME welded node pair, and the
 * line above concludes "two rivals disagree" and throws the wall id away. The more
 * region slabs the user makes, the fewer walls any region can follow — which is
 * precisely the founder's "it got worse as I retried".
 *
 * ⛔ `null` IS NOT A RIVAL CLAIM. `ATTRIBUTION_RULE`'s ambiguity case is stated as
 * *"two DIFFERENT **walls** welded onto the same ring edge"* — and it is right to
 * refuse that, because following the wrong wall is worse than following none. An
 * anonymous chord names NO host, so there is nothing to disagree with. Collapsing a
 * good attribution against it is not caution; it is discarding a measurement in
 * favour of an absence (§CONTEXT-DATA-HONESTY).
 */
import { describe, it, expect } from 'vitest';
import {
    traceRegionSketchAtPoint,
    wallsToAttributedSegments,
    buildAttributedClosedLoops,
} from '../src/SlabRegionTracer';

type WallLike = {
    id?: string | null;
    baseLine?: ReadonlyArray<{ x: number; z: number }> | null;
};

const ROOM = [
    { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 },
];

/** The four real, id-carrying walls of the room. */
const ROOM_WALLS: WallLike[] = ROOM.map((a, i) => ({
    id: `w-${i}`,
    baseLine: [a, ROOM[(i + 1) % ROOM.length]!],
}));

/**
 * The edges of a slab ALREADY created by region on those same walls — emitted
 * anonymously by `RegionBoundarySources`, exactly as production does. Same
 * coordinates, no id.
 */
const COINCIDENT_SLAB_EDGES: WallLike[] = ROOM.map((a, i) => ({
    baseLine: [a, ROOM[(i + 1) % ROOM.length]!],
}));

describe('§FIX-ANONYMOUS-CHORD-IS-NOT-A-RIVAL-HOST — the plan surface\'s 0/22', () => {
    it('CONTROL: walls alone attribute all four edges (this is the 3D surface)', () => {
        const traced = traceRegionSketchAtPoint(ROOM_WALLS as never, 3, 2);
        expect(traced).not.toBeNull();
        expect(traced!.attribution.hostEdges).toBe(4);
        expect(traced!.attribution.ambiguousFallbacks).toBe(0);
        expect(traced!.attribution.hostWallIds).toHaveLength(4);
    });

    it('FAILS ON HEAD: one anonymous slab edge per wall collapses ALL attribution', () => {
        // This is the plan surface's edge set: the SAME walls, plus the anonymous
        // edges of a region slab already sitting on them.
        const traced = traceRegionSketchAtPoint(
            [...ROOM_WALLS, ...COINCIDENT_SLAB_EDGES] as never, 3, 2,
        );
        expect(traced).not.toBeNull();

        // BEFORE THE FIX: hostEdges 0, ambiguousFallbacks 4 — the founder's
        // "0 host-referenced edge(s) across 0 wall(s) … ambiguous=11".
        expect(traced!.attribution.hostEdges).toBe(4);
        expect(traced!.attribution.ambiguousFallbacks).toBe(0);
        expect(traced!.attribution.hostWallIds.sort()).toEqual(['w-0', 'w-1', 'w-2', 'w-3']);
    });

    it('order does not matter — the anonymous chords may arrive FIRST', () => {
        // `assembleRegionBoundary` emits walls, then slabs, then curtain walls, then
        // the parcel ring; but nothing in the tracer may depend on that order, and a
        // fix that only handles "wall seen first" would be half a fix.
        const traced = traceRegionSketchAtPoint(
            [...COINCIDENT_SLAB_EDGES, ...ROOM_WALLS] as never, 3, 2,
        );
        expect(traced).not.toBeNull();
        expect(traced!.attribution.hostEdges).toBe(4);
        expect(traced!.attribution.ambiguousFallbacks).toBe(0);
    });

    it('⛔ TWO REAL WALLS ON ONE EDGE ARE STILL AMBIGUOUS — the refusal is preserved', () => {
        // The case ATTRIBUTION_RULE actually exists for, and it must not be relaxed:
        // following the WRONG wall is strictly worse than following none.
        const RIVAL: WallLike[] = ROOM.map((a, i) => ({
            id: `rival-${i}`,
            baseLine: [a, ROOM[(i + 1) % ROOM.length]!],
        }));
        const traced = traceRegionSketchAtPoint([...ROOM_WALLS, ...RIVAL] as never, 3, 2);
        expect(traced).not.toBeNull();
        expect(traced!.attribution.hostEdges).toBe(0);
        expect(traced!.attribution.ambiguousFallbacks).toBe(4);
    });

    it('a THIRD anonymous chord after two rival walls cannot RESURRECT an attribution', () => {
        // Once two real walls have disagreed the edge is ambiguous for good; an
        // anonymous chord arriving later must not reset it to either wall.
        const RIVAL: WallLike[] = ROOM.map((a, i) => ({
            id: `rival-${i}`,
            baseLine: [a, ROOM[(i + 1) % ROOM.length]!],
        }));
        const segs = wallsToAttributedSegments(
            [...ROOM_WALLS, ...RIVAL, ...COINCIDENT_SLAB_EDGES] as never,
        );
        const loops = buildAttributedClosedLoops(segs);
        const attributed = loops.flat().filter(v => v.hostId !== null);
        expect(attributed).toHaveLength(0);
    });
});
