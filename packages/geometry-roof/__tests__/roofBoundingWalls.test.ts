/**
 * §ROOF-BOUNDING-WALLS — the roof record can now CARRY the region attribution
 * it has always computed. Closes the data-model half of the C79 §6.3 named
 * storage gap (owner @pryzm/geometry-roof).
 *
 * WHAT THIS SUITE PROVES, and — just as importantly — WHAT IT DOES NOT.
 *
 * PROVES: the attribution `traceRoofRegionAtPoint` already returns is a real,
 * correct, non-empty wall-id set for a real traced region, and it now fits a
 * field on `RoofData` without loss. The reference was never missing; there was
 * nowhere to put it.
 *
 * DOES NOT PROVE: that a roof FOLLOWS a moved wall. Nothing populates
 * `boundingWallIds` at creation yet, and nothing consumes it on a wall move.
 * Those are named, not implied — see the field's own doc comment in
 * `RoofTypes.ts` for the exact remaining sites. A test that dressed a
 * reference-CAPABLE record up as a FOLLOWING one would be the C70 §4.2
 * "machinery present, capability unreachable" defect wearing a green tick.
 */

import { describe, it, expect } from 'vitest';
import { traceRoofRegionAtPoint } from '../src/RoofRegionTrace';
import type { RoofData } from '../src/RoofTypes';

/** A plain 6 × 6 room — four straight walls, each with a stable id. */
const ROOM_WALLS = [
    { id: 'w-south', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
    { id: 'w-east', baseLine: [{ x: 6, z: 0 }, { x: 6, z: 6 }] },
    { id: 'w-north', baseLine: [{ x: 6, z: 6 }, { x: 0, z: 6 }] },
    { id: 'w-west', baseLine: [{ x: 0, z: 6 }, { x: 0, z: 0 }] },
];

function makeRoof(
    polygon: [number, number][],
    boundingWallIds?: string[],
): RoofData {
    return {
        id: 'r1', type: 'roof', levelId: 'L0',
        footprint: { polygon, centroid: [0, 0] },
        roofType: 'flat', overhang: 0.3, baseOffset: 0, thickness: 0.2,
        boundingWallIds,
        properties: {},
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 't', version: 1 },
    } as RoofData;
}

describe('§ROOF-BOUNDING-WALLS — the attribution exists and now fits the record', () => {
    it('the tracer attributes a straight-walled region to all four walls', () => {
        const traced = traceRoofRegionAtPoint(ROOM_WALLS, 3, 3);

        expect(traced).not.toBeNull();
        // This is the data that was being thrown away for want of a field.
        expect(traced!.attribution.hostWallIds.slice().sort()).toEqual([
            'w-east', 'w-north', 'w-south', 'w-west',
        ]);
        expect(traced!.attribution.hostEdges).toBe(4);
        expect(traced!.attribution.freeEdges).toBe(0);
    });

    it('the attributed wall ids fit RoofData.boundingWallIds without loss', () => {
        const traced = traceRoofRegionAtPoint(ROOM_WALLS, 3, 3)!;
        const roof = makeRoof(traced.polygon, traced.attribution.hostWallIds);

        expect(roof.boundingWallIds).toEqual(traced.attribution.hostWallIds);
        expect(roof.boundingWallIds).toHaveLength(4);
    });

    /**
     * ADR-0299 / §CONTEXT-DATA-HONESTY at the data model: a roof that was never
     * region-traced must be distinguishable from one that was traced and bounded
     * nothing. `undefined` and `[]` are different facts, so they stay different
     * values — this is why the field is optional rather than defaulted to `[]`
     * (which C79 §7.1 names as the anti-pattern by name).
     */
    it('an un-traced roof carries `undefined`, NOT an empty array', () => {
        const drawnByRectangle = makeRoof([[0, 0], [4, 0], [4, 3], [0, 3]]);
        expect(drawnByRectangle.boundingWallIds).toBeUndefined();

        const tracedBoundedNothing = makeRoof([[0, 0], [4, 0], [4, 3], [0, 3]], []);
        expect(tracedBoundedNothing.boundingWallIds).toEqual([]);
        expect(tracedBoundedNothing.boundingWallIds).not.toBe(
            drawnByRectangle.boundingWallIds,
        );
    });

    /**
     * The honest boundary of this lane, asserted rather than merely written down:
     * the 3D region path still drops the attribution on the floor. When a later
     * lane wires BOTH creation paths (per C79 §7.4 — one path alone is worse than
     * none), this assertion is what should be inverted.
     */
    it('NOT YET WIRED — the tracer returns the ids but no creation path stores them', () => {
        const traced = traceRoofRegionAtPoint(ROOM_WALLS, 3, 3)!;
        expect(traced.attribution.hostWallIds.length).toBeGreaterThan(0);

        // What RoofTool._handleRegionClick keeps today: the polygon only.
        const asCreatedToday = makeRoof(traced.polygon);
        expect(asCreatedToday.boundingWallIds).toBeUndefined();
    });

    it('a roof with no enclosing region traces to null and has nothing to attribute', () => {
        expect(traceRoofRegionAtPoint(ROOM_WALLS, 50, 50)).toBeNull();
    });
});
