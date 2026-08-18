/**
 * §LANE-Y-PARCEL-REGION-ANNULUS — was a PROBE; is now the feature's control.
 *
 * Founder request: with the SLAB "By Region" tool, click between the parcel
 * boundary line and the building's perimeter walls and get a slab for the
 * garden — "cutting the perimeter walls scope", i.e. the parcel polygon MINUS
 * the building footprint. That region is an ANNULUS: an outer ring with a hole.
 *
 * ── WHAT THIS FILE USED TO PIN (kept verbatim so the movement is legible) ──
 *
 * It existed because the obvious implementation — "just feed the parcel ring to
 * the region tracer alongside the walls" — produced a slab that COVERED THE
 * BUILDING, silently and with no error. The measured reading was:
 *
 *     ring encloses the building centre  ·  |area| = 1600 m² (the whole parcel)
 *     where the correct answer is 1200   ·  sketch.innerLoops === undefined
 *
 * Its own header said: *"When holes are genuinely supported they SHOULD fail —
 * that is the point. Update them to the annulus assertions at that time; do not
 * delete them and do not relax them."* ADR-0329 is that time. The assertions
 * below are the annulus ones; the file is not deleted and nothing is relaxed —
 * every number that was pinned is still pinned, now at its correct value.
 *
 * ── WHY NO POLYGON DIFFERENCE WAS NEEDED (ADR-0329 §1.1) ──
 *
 * The fourth blocker was "there is no polygon DIFFERENCE in the kernel". There
 * still isn't, deliberately (`polygonBoolean.ts:45-49`), and none is used here.
 * The building footprint ring is a loop `buildAttributedClosedLoops` ALREADY
 * returned and `findAttributedRegionAtPoint` discarded — measured on this exact
 * fixture at ±400 m², attributed to the `bldg-*` walls. The planar walk had
 * already made the separation a boolean would have been asked to re-derive.
 */
import { describe, it, expect } from 'vitest';
import {
    traceRegionSketchAtPoint,
    findAttributedRegionWithHolesAtPoint,
    polygonArea,
    pointInPolygon,
    type RegionWallLike,
    type RegionPoint2D,
} from '../src/SlabRegionTracer.js';

/** Turn a closed ring into wall-like segments the tracer accepts. */
function ringAsWalls(ring: ReadonlyArray<RegionPoint2D>, idPrefix: string): RegionWallLike[] {
    const walls: RegionWallLike[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        walls.push({
            id: `${idPrefix}-${i}`,
            baseLine: [{ x: a.x, z: a.y }, { x: b.x, z: b.y }],
        });
    }
    return walls;
}

// A 40 x 40 m parcel with a 20 x 20 m building centred inside it.
// The gap between them is the garden the founder wants to fill.
const PARCEL: RegionPoint2D[] = [
    { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 },
];
const BUILDING: RegionPoint2D[] = [
    { x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 },
];
const BUILDING_CENTRE: RegionPoint2D = { x: 20, y: 20 };
/** A click in the garden strip — outside the building, inside the parcel. */
const GARDEN_CLICK: RegionPoint2D = { x: 5, y: 20 };

const PARCEL_AREA = 40 * 40;        // 1600
const BUILDING_AREA = 20 * 20;      // 400
const GARDEN_AREA = PARCEL_AREA - BUILDING_AREA; // 1200 — the correct answer

const ALL_WALLS = [...ringAsWalls(PARCEL, 'parcel'), ...ringAsWalls(BUILDING, 'bldg')];

describe('§LANE-Y-PARCEL-REGION-ANNULUS — the parcel/building gap', () => {
    it('the fixture itself is sane', () => {
        expect(pointInPolygon(GARDEN_CLICK, PARCEL)).toBe(true);
        expect(pointInPolygon(GARDEN_CLICK, BUILDING)).toBe(false);
        expect(pointInPolygon(BUILDING_CENTRE, BUILDING)).toBe(true);
        expect(Math.abs(polygonArea(PARCEL))).toBeCloseTo(PARCEL_AREA, 6);
    });

    it('WALLS ONLY: a garden click finds no region at all', () => {
        // UNCHANGED from the probe, and it must stay unchanged: without the parcel
        // edge as a bounding edge the garden is simply not enclosed, so "no region"
        // is the correct answer, not a degraded one. ADR-0329 changes what happens
        // once the boundary IS present; it does not invent a region out of nothing.
        const result = traceRegionSketchAtPoint(
            ringAsWalls(BUILDING, 'bldg'),
            GARDEN_CLICK.x,
            GARDEN_CLICK.y,
        );
        expect(result).toBeNull();
    });

    it('THE ANNULUS — the outer ring is the parcel and the HOLE is the building', () => {
        // This was "THE TRAP". The same call, the same inputs; what changed is that
        // the building loop is no longer discarded on the way out.
        const result = traceRegionSketchAtPoint(ALL_WALLS, GARDEN_CLICK.x, GARDEN_CLICK.y);
        expect(result).not.toBeNull();

        // ── the outer ring is still the parcel ──────────────────────────────
        const ring = result!.ring;
        expect(Math.abs(polygonArea(ring))).toBeCloseTo(PARCEL_AREA, 6);

        // ── and there is now exactly ONE hole, and it is the building ───────
        expect(result!.innerRings).toHaveLength(1);
        const hole = result!.innerRings[0]!;
        expect(Math.abs(polygonArea(hole))).toBeCloseTo(BUILDING_AREA, 6);
        expect(pointInPolygon(BUILDING_CENTRE, hole)).toBe(true);

        // ── THE NUMBER THE PROBE EXISTED FOR: 1200, not 1600 ────────────────
        // Effective area = outer minus holes. The probe pinned 1600 and asserted
        // `.not.toBeCloseTo(GARDEN_AREA)`; both are inverted here, deliberately.
        const effectiveArea = Math.abs(polygonArea(ring))
            - result!.innerRings.reduce((sum, h) => sum + Math.abs(polygonArea(h)), 0);
        expect(effectiveArea).toBeCloseTo(GARDEN_AREA, 6);
        expect(effectiveArea).not.toBeCloseTo(PARCEL_AREA, 6);

        // ── the building centre is NOT covered ──────────────────────────────
        // The building centre is inside the OUTER ring (it must be — the outer ring
        // is the parcel) and inside a HOLE, so it is not covered by the slab. That
        // conjunction is the honest statement of "the slab does not bury the
        // building"; asserting only `!pointInPolygon(centre, ring)` would be false
        // for the correct answer and would pass for a slab that had shrunk instead.
        expect(pointInPolygon(BUILDING_CENTRE, ring)).toBe(true);
        expect(result!.innerRings.some(h => pointInPolygon(BUILDING_CENTRE, h))).toBe(true);
    });

    it('the hole is carried PARAMETRICALLY — every hole edge references a building wall', () => {
        // The probe asserted `sketch.innerLoops === undefined` and that the result
        // carried no hole channel. Both are inverted here. What matters is not that
        // a hole exists but that it is stored BY REFERENCE (C79 §1.1) — coordinates
        // could render the hole once and could never follow a wall.
        const result = traceRegionSketchAtPoint(ALL_WALLS, GARDEN_CLICK.x, GARDEN_CLICK.y);
        expect(result).not.toBeNull();

        const innerLoops = result!.sketch.innerLoops;
        expect(innerLoops).toBeDefined();
        expect(innerLoops).toHaveLength(1);

        const holeEdges = innerLoops![0]!.edges;
        expect(holeEdges).toHaveLength(4);
        for (const edge of holeEdges) {
            expect(edge.type).toBe('hostReference');
            if (edge.type !== 'hostReference') continue;
            // C79 §3.1/§3.2 — the traced frame, at offset 0. Naming a face would
            // shift the hole by half a wall thickness off what the user saw.
            expect(edge.reference).toBe('centerLine');
            expect(edge.offset).toBe(0);
            expect(edge.hostType).toBe('wall');
            // C79 §4.3 — the fallback exists at AUTHORING time, so a wall deleted
            // before any rebuild degrades to geometry rather than to nothing.
            expect(edge.fallback).toBeDefined();
            // It is a BUILDING wall, not a parcel wall — the hole references the
            // thing it is a hole of.
            expect(edge.hostId.startsWith('bldg-')).toBe(true);
        }

        // C79 §3.4 — the hole edges are byte-identical in SHAPE to the outer ones.
        const shapeOf = (e: any) => Object.keys(e).sort().join(',');
        const outerHostEdge = result!.sketch.outerLoop.edges.find(e => e.type === 'hostReference');
        expect(outerHostEdge).toBeDefined();
        expect(shapeOf(holeEdges[0])).toBe(shapeOf(outerHostEdge));

        // C79 §2.5/§2.6 — the counts cover ALL loops, so a hole edge is never
        // absorbed. 4 outer + 4 inner, every one attributed.
        expect(result!.attribution.hostEdges).toBe(8);
        expect(result!.attribution.freeEdges).toBe(0);
        expect(result!.attribution.hostWallIds).toHaveLength(8);
    });

    it('NON-REGRESSION — a click INSIDE the building is the ordinary room slab', () => {
        // The outer-ring selection rule is unchanged: smallest loop enclosing the
        // click. A click in the building yields the building, 400 m², with no holes
        // and no `innerLoops` on the sketch. Had this regressed, every existing
        // region slab in every project would have gained a hole.
        const result = traceRegionSketchAtPoint(ALL_WALLS, BUILDING_CENTRE.x, BUILDING_CENTRE.y);
        expect(result).not.toBeNull();
        expect(Math.abs(polygonArea(result!.ring))).toBeCloseTo(BUILDING_AREA, 6);
        expect(result!.innerRings).toEqual([]);
        // OMITTED, not `[]` — a plain region's sketch is byte-identical to what it
        // was before ADR-0329, which is what keeps every stored-sketch equality
        // check downstream reading the same value it read yesterday.
        expect(result!.sketch.innerLoops).toBeUndefined();
    });

    it('a room INSIDE the building does not become a second hole of the garden', () => {
        // ADR-0329 D2 step (b): keep only the OUTERMOST candidates. The building's
        // own interior partitions are in the same wall set, and punching them would
        // turn one honest hole into a sieve of overlapping contours.
        const partition: RegionWallLike[] = [
            { id: 'part-0', baseLine: [{ x: 20, z: 10 }, { x: 20, z: 30 }] },
        ];
        const region = findAttributedRegionWithHolesAtPoint(
            [...ALL_WALLS, ...partition],
            GARDEN_CLICK.x,
            GARDEN_CLICK.y,
        );
        expect(region).not.toBeNull();
        // The partition creates two 10x20 rooms inside the building. Both are loops
        // strictly inside the parcel that do not contain the click — i.e. both are
        // hole CANDIDATES — and both are correctly dropped as nested.
        expect(region!.holes).toHaveLength(1);
        expect(Math.abs(polygonArea(region!.holes[0]!.map(v => v.point))))
            .toBeCloseTo(BUILDING_AREA, 6);
    });

    it('two separate buildings on one parcel are two separate holes', () => {
        // The nesting rule must not collapse SIBLINGS. Two buildings side by side
        // are two outermost candidates and must both survive — this is the arm that
        // would catch a "keep the largest candidate" shortcut.
        const parcel: RegionPoint2D[] = [
            { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 },
        ];
        const bldgA: RegionPoint2D[] = [
            { x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 30 }, { x: 10, y: 30 },
        ];
        const bldgB: RegionPoint2D[] = [
            { x: 35, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 30 }, { x: 35, y: 30 },
        ];
        const region = findAttributedRegionWithHolesAtPoint(
            [
                ...ringAsWalls(parcel, 'parcel'),
                ...ringAsWalls(bldgA, 'a'),
                ...ringAsWalls(bldgB, 'b'),
            ],
            5,
            20,
        );
        expect(region).not.toBeNull();
        expect(region!.holes).toHaveLength(2);
        const areas = region!.holes
            .map(h => Math.abs(polygonArea(h.map(v => v.point))))
            .sort((p, q) => p - q);
        expect(areas[0]).toBeCloseTo(10 * 20, 6);   // building A
        expect(areas[1]).toBeCloseTo(15 * 20, 6);   // building B
    });
});
