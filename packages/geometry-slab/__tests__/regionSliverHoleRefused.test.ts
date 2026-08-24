/**
 * §REFUSE-SLIVER-REGION-HOLE (L-1401) — a zero-width ring is not a hole.
 *
 * FOUNDER-REPORTED, live, 2026-08-24: *"I am creating a slab by region — and even if
 * the preview is clearly correct … the slab is created as a rectangular shifted
 * away"*. His console:
 *
 * ```
 * [SlabTool] §REGION-HOST-ATTRIBUTION-3D region committed: 16 host-referenced edge(s)
 *    across 16 wall(s), 6 free edge(s) (curved=0, no-wall-id=6, ambiguous=0).
 * [SlabFragmentBuilder] §REFUSE-NONSIMPLE-SLAB-RING slabId="4fd18c72-…" — hole[0]
 *    (4 vertices) crosses itself: edge 1→2 [-11.322, 10.760]→[-11.352, 3.734]
 *    crosses edge 3→4 [-11.336, -0.045]→[-11.324, 11.233] REFUSING to triangulate.
 * [SlabFragmentBuilder] §FIX-REGION-SLAB-3D-LADDER … drawn as a PLAIN BOX
 *    (11.3849 × 21.0587 × 0.2 m) … This is NOT the authored outline.
 * ```
 *
 * ⭐ READ THE FOUR COORDINATES. Every x is the same to within **30 mm**; y spans
 * **11.3 m**. That "hole" is a ZERO-WIDTH SLIVER — a ring that runs ~11 m up a line
 * and ~11 m back down it. A ring like that self-intersects by construction.
 *
 * ⛔ THE REFUSAL IS CORRECT AND IS NOT TOUCHED HERE. `§REFUSE-NONSIMPLE-SLAB-RING`
 * and ADR-0299 §RECOVERY-MUST-REFUSE both hold: feeding a self-crossing hole to
 * earcut punches the void OUTSIDE the slab. The defect is UPSTREAM — something
 * emitted a degenerate zero-area ring as `hole[0]`.
 *
 * THE MECHANISM, MEASURED (not assumed):
 *
 *   `findAttributedRegionWithHolesAtPoint` adopts EVERY loop strictly inside the
 *   outer ring as a hole, gated ONLY on `loop.length < 3` — a VERTEX COUNT. There
 *   is no area test, no width test and no degeneracy test anywhere on the hole
 *   path (the one area guard in the package, `slabRecomputeVerdict.MIN_AREA_M2`,
 *   applies to the OUTER boundary on a different path and never sees holes).
 *
 *   The graph welds nodes at {@link REGION_WELD_TOLERANCE_M} = 0.15 m. When ONE long
 *   boundary chord (a slab edge, a parcel edge) spans the same run as a CHAIN of
 *   shorter chords that is not exactly collinear with it, the two share both welded
 *   end nodes and enclose a face whose mean width is a few millimetres. That face is
 *   a fully-formed 4-node cycle: it passes `length >= 3`, it does not contain the
 *   click, every vertex is inside the outer ring — so it is adopted as a hole.
 *
 * ⭐ THE COORDINATOR'S ARITHMETIC SURVIVES MEASUREMENT. Broken project: 16 host + 6
 * free. Working project, same session, same build: 15 host + 2 free and NO hole.
 * 6 − 2 = 4 = the hole's vertex count, and all four are `no-wall-id` — i.e. the
 * sliver is built ENTIRELY from anonymous (slab-edge / parcel) chords. The fixture
 * below is that shape, at the founder's own coordinates.
 */
import { describe, it, expect } from 'vitest';
import {
    findAttributedRegionWithHolesAtPoint,
    polygonArea,
    REGION_WELD_TOLERANCE_M,
} from '../src/SlabRegionTracer';

type WallLike = {
    id?: string | null;
    baseLine?: ReadonlyArray<{ x: number; z: number }> | null;
};

/** A closed ring of id-carrying walls. */
function ringWalls(ring: Array<{ x: number; z: number }>, prefix: string): WallLike[] {
    return ring.map((a, i) => ({
        id: `${prefix}-${i}`,
        baseLine: [a, ring[(i + 1) % ring.length]!],
    }));
}

/**
 * THE FOUNDER'S FOUR COORDINATES, verbatim from his console. The chain runs
 * 11.233 → 10.760 → 3.734 → −0.045 down the wall line; the single long anonymous
 * chord closes −0.045 → 11.233 straight back up it. x varies by 30 mm across the
 * whole run, so the enclosed face is a sliver ~11 m long and ~9 mm wide.
 */
const SLIVER_CHAIN: WallLike[] = [
    { id: 'w-a', baseLine: [{ x: -11.324, z: 11.233 }, { x: -11.322, z: 10.760 }] },
    { id: 'w-b', baseLine: [{ x: -11.322, z: 10.760 }, { x: -11.352, z: 3.734 }] },
    { id: 'w-c', baseLine: [{ x: -11.352, z: 3.734 }, { x: -11.336, z: -0.045 }] },
    // The anonymous long chord — a slab edge or a parcel edge. No `id`, which is
    // exactly what `no-wall-id=6` reported.
    { baseLine: [{ x: -11.336, z: -0.045 }, { x: -11.324, z: 11.233 }] },
];

/** A generous enclosing room, so the sliver is strictly INSIDE a real outer ring. */
const OUTER_ROOM = ringWalls(
    [{ x: -20, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 20 }, { x: -20, z: 20 }],
    'room',
);

describe('§REFUSE-SLIVER-REGION-HOLE — the degenerate ring the founder saw', () => {
    it('MEASURES the sliver: the founder\'s hole[0] encloses ~0.1 m² across an 11.3 m run', () => {
        // This documents the INPUT, and it is the number the fix keys on. It is not
        // a regression guard on the fix — it is the evidence the ring is degenerate.
        const ring = [
            { x: -11.322, y: 10.760 },
            { x: -11.352, y: 3.734 },
            { x: -11.336, y: -0.045 },
            { x: -11.324, y: 11.233 },
        ];
        const area = Math.abs(polygonArea(ring));
        expect(area).toBeLessThan(0.2);           // ~0.0997 m²
        expect(area).toBeGreaterThan(0);          // …and NOT exactly zero, which is
                                                  // why an `=== 0` test would miss it.

        // The discriminator the fix uses: mean width = area / (perimeter / 2).
        let perim = 0;
        for (let i = 0; i < ring.length; i++) {
            const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
            perim += Math.hypot(q.x - p.x, q.y - p.y);
        }
        const meanWidth = area / (perim / 2);
        expect(meanWidth).toBeLessThan(REGION_WELD_TOLERANCE_M);   // ≈ 0.0088 m ≪ 0.15 m
    });

    it('FAILS ON HEAD: the tracer adopts the sliver as hole[0]', () => {
        const walls = [...OUTER_ROOM, ...SLIVER_CHAIN];
        // Click well clear of the sliver, inside the room.
        const region = findAttributedRegionWithHolesAtPoint(walls, -2, 8);
        expect(region).not.toBeNull();

        // BEFORE THE FIX: 1 — a 4-vertex, ~0.1 m² zero-width ring, which
        // SlabFragmentBuilder then correctly refuses, degrading the whole slab to a
        // plain box. AFTER: 0.
        expect(region!.holes).toHaveLength(0);
    });

    it('a REAL hole of the same vertex count is still punched — the fix is not a blanket ban', () => {
        // A genuine 4 m × 3 m building inside the same room. Same vertex count (4),
        // same nesting, honest area. If this ever returns 0 the threshold is wrong.
        const BUILDING = ringWalls(
            [{ x: -12, z: 2 }, { x: -8, z: 2 }, { x: -8, z: 5 }, { x: -12, z: 5 }],
            'bldg',
        );
        const region = findAttributedRegionWithHolesAtPoint([...OUTER_ROOM, ...BUILDING], -2, 8);
        expect(region).not.toBeNull();
        expect(region!.holes).toHaveLength(1);
        const holeArea = Math.abs(polygonArea(region!.holes[0]!.map(v => v.point)));
        expect(holeArea).toBeCloseTo(12, 6);
    });
});
