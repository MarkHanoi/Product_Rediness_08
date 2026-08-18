/**
 * §LANE-Y-PARCEL-REGION-ANNULUS — a PROBE, not a feature.
 *
 * Founder request: with the SLAB "By Region" tool, click between the parcel
 * boundary line and the building's perimeter walls and get a slab for the
 * garden — "cutting the perimeter walls scope", i.e. the parcel polygon MINUS
 * the building footprint. That region is an ANNULUS: an outer ring with a hole.
 *
 * This file exists because the obvious implementation — "just feed the parcel
 * ring to the region tracer alongside the walls" — produces a slab that COVERS
 * THE BUILDING, silently and with no error. These controls pin that, so the
 * next person to reach for it finds a failing expectation instead of a
 * plausible-looking wrong slab.
 *
 * These assertions describe what the code does TODAY. When holes are genuinely
 * supported they SHOULD fail — that is the point. Update them to the annulus
 * assertions at that time; do not delete them and do not relax them.
 */
import { describe, it, expect } from 'vitest';
import {
    traceRegionSketchAtPoint,
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

const PARCEL_AREA = 40 * 40;
const BUILDING_AREA = 20 * 20;
const GARDEN_AREA = PARCEL_AREA - BUILDING_AREA; // 1200 — the correct answer

describe('§LANE-Y-PARCEL-REGION-ANNULUS — the parcel/building gap today', () => {
    it('the fixture itself is sane', () => {
        expect(pointInPolygon(GARDEN_CLICK, PARCEL)).toBe(true);
        expect(pointInPolygon(GARDEN_CLICK, BUILDING)).toBe(false);
        expect(pointInPolygon(BUILDING_CENTRE, BUILDING)).toBe(true);
        expect(Math.abs(polygonArea(PARCEL))).toBeCloseTo(PARCEL_AREA, 6);
    });

    it('WALLS ONLY: a garden click finds no region at all', () => {
        // Today the tracer is fed `wallStore.getAll()` and nothing else
        // (SlabTool.ts:1463), so the parcel edge is not a bounding edge and the
        // garden is simply not enclosed. The tool reports "no region" — wrong,
        // but at least not misleading.
        const result = traceRegionSketchAtPoint(
            ringAsWalls(BUILDING, 'bldg'),
            GARDEN_CLICK.x,
            GARDEN_CLICK.y,
        );
        expect(result).toBeNull();
    });

    it('THE TRAP — adding the parcel ring as edges yields a ring that COVERS the building', () => {
        // This is the naive fix: make the parcel boundary a bounding edge by
        // handing its segments to the tracer with the walls. It "works" — a
        // region is found and it is not null — and the result is catastrophic:
        // the ring returned is the whole PARCEL, so the slab is laid straight
        // over the building instead of around it.
        const result = traceRegionSketchAtPoint(
            [...ringAsWalls(PARCEL, 'parcel'), ...ringAsWalls(BUILDING, 'bldg')],
            GARDEN_CLICK.x,
            GARDEN_CLICK.y,
        );

        expect(result).not.toBeNull();
        const ring = result!.ring;

        // The building centre lies INSIDE the returned ring. A slab built from
        // this polygon buries the building.
        expect(pointInPolygon(BUILDING_CENTRE, ring)).toBe(true);

        // And the area is the full parcel, not the garden.
        expect(Math.abs(polygonArea(ring))).toBeCloseTo(PARCEL_AREA, 6);
        expect(Math.abs(polygonArea(ring))).not.toBeCloseTo(GARDEN_AREA, 6);
    });

    it('the tracer carries NO hole channel, so the annulus cannot be expressed', () => {
        // `RegionSketchResult` is `{ sketch, ring, attribution }` with `ring` a
        // single flat `RegionPoint2D[]`. `buildRegionSketch` populates only
        // `sketch.outerLoop`; `innerLoops` is left undefined and is dead even
        // downstream — `SlabFragmentBuilder` resolves `sketch.outerLoop` only.
        // So there is nowhere to PUT the building ring even once it is known.
        const result = traceRegionSketchAtPoint(
            [...ringAsWalls(PARCEL, 'parcel'), ...ringAsWalls(BUILDING, 'bldg')],
            GARDEN_CLICK.x,
            GARDEN_CLICK.y,
        );
        expect(result).not.toBeNull();
        expect(result!.sketch.innerLoops).toBeUndefined();
        expect(Object.keys(result!)).toEqual(
            expect.not.arrayContaining(['holes']),
        );
    });
});
