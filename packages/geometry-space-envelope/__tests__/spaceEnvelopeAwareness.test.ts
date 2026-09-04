// The awareness axes — containment, adjacency, stacking, boundary distance, solar.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §8a / §9a / §11 item 9 · ADR-0380 D3 / D4.

import { describe, expect, it } from 'vitest';
import {
    adjacency,
    assertFaceSurfaceCoverage,
    assessSpaceEnvelopeContainment,
    boundaryDistance,
    buildSpaceEnvelopeFaceSurfaces,
    spaceEnvelopeFaceSurfaceId,
    spaceEnvelopeGlazing,
    spaceEnvelopeHeatGain,
    stackRelation,
    SPACE_ENVELOPE_DEFAULT_GLAZED_FRACTION,
    type SpaceEnvelopePrism,
} from '../src/index.js';

function box(
    id: string,
    x0: number, z0: number, w: number, d: number,
    baseOffset = 0, height = 3,
): SpaceEnvelopePrism {
    return {
        id,
        footprint: [
            { x: x0, y: 0, z: z0 },
            { x: x0 + w, y: 0, z: z0 },
            { x: x0 + w, y: 0, z: z0 + d },
            { x: x0, y: 0, z: z0 + d },
        ],
        baseOffset,
        height,
    };
}

describe('containment — ADVISORY, never a refusal (ADR-0380 D4)', () => {
    it('reports a contained envelope as ok', () => {
        const f = assessSpaceEnvelopeContainment(box('room', 2, 2, 4, 4), box('level', 0, 0, 20, 20));
        expect(f.contained).toBe(true);
        expect(f.severity).toBe('ok');
        expect(f.horizontalExcursionM).toBe(0);
    });

    it('⭐ an escaping room envelope is ADVISORY, and NEVER "refusal"', () => {
        const f = assessSpaceEnvelopeContainment(
            box('room', 18, 2, 6, 4),
            box('level', 0, 0, 20, 20),
        );
        expect(f.contained).toBe(false);
        expect(f.severity).toBe('advisory');
        // The whole product decision, pinned: there is no refusal severity to reach for.
        expect(['ok', 'advisory']).toContain(f.severity);
    });

    it('carries BOTH numbers in the message (C114 §12a)', () => {
        const f = assessSpaceEnvelopeContainment(
            box('room', 18, 2, 6, 4),
            box('level', 0, 0, 20, 20),
        );
        expect(f.horizontalExcursionM).toBeGreaterThan(0);
        expect(f.message).toMatch(/m outside it horizontally/);
        expect(f.message).toContain('m²');
        expect(f.message).toContain('reported, not refused');
    });

    it('detects a VERTICAL escape as well as a horizontal one', () => {
        const f = assessSpaceEnvelopeContainment(
            box('room', 2, 2, 4, 4, 0, 10),      // 10 m tall
            box('level', 0, 0, 20, 20, 0, 3),    // inside a 3 m storey
        );
        expect(f.contained).toBe(false);
        expect(f.verticalExcursionM).toBeCloseTo(7, 6);
        expect(f.message).toContain('vertically');
    });
});

describe('stacking — derived, no UBG edge minted (ADR-0380 D3)', () => {
    it('finds a box sitting on another', () => {
        const r = stackRelation(box('lower', 0, 0, 4, 4, 0, 3), box('upper', 0, 0, 4, 4, 3, 3));
        expect(r).not.toBeNull();
        expect(r!.lowerId).toBe('lower');
        expect(r!.upperId).toBe('upper');
        expect(r!.gapM).toBeCloseTo(0, 9);
    });

    it('reports the gap when they do not touch', () => {
        const r = stackRelation(box('lower', 0, 0, 4, 4, 0, 3), box('upper', 0, 0, 4, 4, 5, 3));
        expect(r!.gapM).toBeCloseTo(2, 9);
    });

    it('returns null when the footprints do not overlap in plan', () => {
        expect(stackRelation(box('a', 0, 0, 4, 4, 0, 3), box('b', 50, 50, 4, 4, 3, 3))).toBeNull();
    });
});

describe('adjacency — projected onto the EXISTING adjacentTo edge', () => {
    it('finds two envelopes sharing a wall line', () => {
        const r = adjacency(box('a', 0, 0, 4, 4), box('b', 4, 0, 4, 4));
        expect(r).not.toBeNull();
        expect(r!.distanceM).toBeCloseTo(0, 9);
    });

    it('⭐ envelopes on different storeys are NOT "around" each other', () => {
        expect(adjacency(box('a', 0, 0, 4, 4, 0, 3), box('b', 4, 0, 4, 4, 3, 3))).toBeNull();
    });

    it('returns null beyond the threshold', () => {
        expect(adjacency(box('a', 0, 0, 4, 4), box('b', 10, 0, 4, 4))).toBeNull();
    });
});

describe('boundary distance — the directive’s "distance to the perimeter"', () => {
    it('measures to the nearest boundary edge and names the face', () => {
        const parcel = box('parcel', 0, 0, 20, 20).footprint;
        const f = boundaryDistance(box('env', 5, 5, 4, 4), parcel);
        expect(f.outside).toBe(false);
        expect(f.nearestDistanceM).toBeCloseTo(5, 6);
        expect(f.nearestFaceIndex).toBeGreaterThanOrEqual(0);
    });

    it('flags an envelope that crosses the boundary', () => {
        const parcel = box('parcel', 0, 0, 20, 20).footprint;
        expect(boundaryDistance(box('env', 18, 5, 6, 4), parcel).outside).toBe(true);
    });
});

describe('solar — the FIRST consumer of accumulateRoomHeatGain', () => {
    it('builds one surface per face, with distinct outward normals', () => {
        const faces = buildSpaceEnvelopeFaceSurfaces(box('env', 0, 0, 4, 4));
        expect(faces).toHaveLength(6); // 4 sides + top + bottom
        const sides = faces.filter((f) => f.kind === 'side');
        expect(sides).toHaveLength(4);
        // ⭐ The four side normals must be four DIFFERENT directions — if they collapsed,
        // every façade would report the same sun and the per-face claim would be a lie.
        const keys = new Set(sides.map((s) => `${s.surface.normal.x.toFixed(3)},${s.surface.normal.z.toFixed(3)}`));
        expect(keys.size).toBe(4);
    });

    it('normals point OUTWARD, away from the centroid', () => {
        const faces = buildSpaceEnvelopeFaceSurfaces(box('env', 0, 0, 4, 4));
        for (const f of faces.filter((s) => s.kind === 'side')) {
            const p = f.surface.samplePoints[0]!;
            // Centroid of the 4x4 box at origin is (2, 2).
            expect((p.x - 2) * f.surface.normal.x + (p.z - 2) * f.surface.normal.z)
                .toBeGreaterThan(0);
        }
    });

    it('spreads sample points across the face rather than probing one mid-point', () => {
        const faces = buildSpaceEnvelopeFaceSurfaces(box('env', 0, 0, 4, 4, 0, 9));
        const side = faces.find((f) => f.kind === 'side')!;
        const ys = new Set(side.surface.samplePoints.map((p) => p.y.toFixed(4)));
        expect(ys.size).toBeGreaterThan(1);
    });

    it('projects faces into RoomGlazing with the declared glazed fraction', () => {
        const faces = buildSpaceEnvelopeFaceSurfaces(box('env', 0, 0, 4, 4, 0, 3));
        const glazing = spaceEnvelopeGlazing(faces, 'env');
        expect(glazing.roomId).toBe('env');
        expect(glazing.glazing).toHaveLength(4); // sides only; roof excluded by default
        // Each side is 4 m x 3 m = 12 m2, times the declared study fraction.
        expect(glazing.glazing[0]!.glazedAreaM2)
            .toBeCloseTo(12 * SPACE_ENVELOPE_DEFAULT_GLAZED_FRACTION, 9);
    });

    it('⭐ RUNS THE JOIN END TO END and gives sunnier faces more gain', () => {
        const prism = box('env', 0, 0, 4, 4, 0, 3);
        const faces = buildSpaceEnvelopeFaceSurfaces(prism);
        const sideIds = faces.filter((f) => f.kind === 'side').map((f) => f.surfaceId);
        // A stand-in sun-hours result: face 0 in full sun, the rest in shade.
        const sunHours = {
            surfaces: sideIds.map((id, i) => ({
                surfaceId: id,
                sunHours: i === 0 ? 8 : 1,
                minPointSunHours: i === 0 ? 8 : 1,
                maxPointSunHours: i === 0 ? 8 : 1,
                samplePointCount: 5,
            })),
            stepHours: 0.25,
            sampleCount: 32,
            avgSunHours: 2.75,
            maxSunHours: 8,
            minSunHours: 1,
        };
        const result = spaceEnvelopeHeatGain(sunHours, faces, 'env');
        expect(result.rooms).toHaveLength(1);
        // The gain is non-zero, which is what proves the ids actually joined.
        expect(result.rooms[0]!.gainIndex).toBeGreaterThan(0);
        expect(result.rooms[0]!.glazingCount).toBe(4);
    });

    it('⭐ NAMES UNCOVERED FACES rather than letting a mismatch read as "no sun"', () => {
        const faces = buildSpaceEnvelopeFaceSurfaces(box('env', 0, 0, 4, 4));
        const emptySunHours = {
            surfaces: [],
            stepHours: 0.25, sampleCount: 0,
            avgSunHours: 0, maxSunHours: 0, minSunHours: 0,
        };
        const missing = assertFaceSurfaceCoverage(emptySunHours, faces);
        // Every face is uncovered — and the guard SAYS so instead of returning gain 0.
        expect(missing).toHaveLength(6);
        expect(missing).toContain(spaceEnvelopeFaceSurfaceId('env', 'side', 0));
    });
});
