// ADR-0270 P2 / §L-451 — profundidad edificable depth clip.
//
// THE ACCEPTANCE CRITERION FOR A1b: an alignment zone must yield a DEPTH-LIMITED ring, not a
// whole-plot ring. That is the exact failure ADR-0270 exists to prevent — coercing alineación
// into a setback silently produces an envelope covering the entire plot depth, which looks
// perfectly well-formed and is wrong on the highest-value parcels.

import { describe, it, expect } from 'vitest';
import { clipToDepthBand } from '../src/geometry/depthBandClip';

/** 30 m wide × 40 m deep parcel. Street edge is the z = 0 side, running along +x. */
const parcel = [
    { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: -40 }, { x: 0, z: -40 },
];
const streetA = { x: 0, z: 0 };
const streetB = { x: 30, z: 0 };

/** Shoelace area, absolute. */
function area(ring: ReadonlyArray<{ x: number; z: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

function maxDepthFromStreet(ring: ReadonlyArray<{ x: number; z: number }>): number {
    // Street runs along z=0; interior is -z. Depth is |z|.
    return Math.max(...ring.map((p) => Math.abs(p.z)));
}

describe('ADR-0270 §A1b — clipToDepthBand: THE core acceptance criterion', () => {
    it('yields a DEPTH-LIMITED ring, not the whole plot', () => {
        // 30 × 40 = 1200 m² plot; a 12 m profundidad edificable must give 30 × 12 = 360 m².
        // If this ever returns ~1200, alineación has been silently solved as "no constraint" —
        // the exact defect ADR-0270 was written to eliminate.
        const r = clipToDepthBand(parcel, streetA, streetB, 12);
        expect(r.degenerate).toBe(false);
        expect(r.bandInactive).toBe(false);
        expect(area(r.polygon)).toBeCloseTo(360, 6);
        expect(maxDepthFromStreet(r.polygon)).toBeCloseTo(12, 6);
        expect(area(r.polygon)).toBeLessThan(area(parcel));
    });

    it('keeps the full parcel WIDTH — depth constrains one axis only', () => {
        const r = clipToDepthBand(parcel, streetA, streetB, 12);
        const xs = r.polygon.map((p) => p.x);
        expect(Math.min(...xs)).toBeCloseTo(0, 6);
        expect(Math.max(...xs)).toBeCloseTo(30, 6);
    });

    it('WINDING-INDEPENDENT — a reversed ring clips the same side', () => {
        // Assuming CCW would clip the COMPLEMENTARY band on a CW ring: a plausible-looking,
        // completely wrong envelope. Both windings must agree.
        const ccw = clipToDepthBand(parcel, streetA, streetB, 12);
        const cw = clipToDepthBand([...parcel].reverse(), streetA, streetB, 12);
        expect(area(cw.polygon)).toBeCloseTo(area(ccw.polygon), 6);
        expect(maxDepthFromStreet(cw.polygon)).toBeCloseTo(12, 6);
    });

    it('reports bandInactive when the parcel is SHALLOWER than the ordinance allows', () => {
        // 40 m deep parcel, 50 m permitted depth. The clip is a genuine no-op — and a report
        // citing a depth limit that never applied would be misleading (C58 §1.3).
        const r = clipToDepthBand(parcel, streetA, streetB, 50);
        expect(r.bandInactive).toBe(true);
        expect(r.degenerate).toBe(false);
        expect(area(r.polygon)).toBeCloseTo(area(parcel), 6);
    });

    it('handles a CONCAVE footprint — S-H against one half-plane is exact without convexity', () => {
        // Parcel insets are routinely concave; the founder's real case was a 12-vertex ring.
        const lShaped = [
            { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: -10 },
            { x: 15, z: -10 }, { x: 15, z: -40 }, { x: 0, z: -40 },
        ];
        const r = clipToDepthBand(lShaped, streetA, streetB, 5);
        expect(r.degenerate).toBe(false);
        // Above z = -5 the L is still full width, so the band is 30 × 5.
        expect(area(r.polygon)).toBeCloseTo(150, 6);
        expect(maxDepthFromStreet(r.polygon)).toBeCloseTo(5, 6);
    });

    it('clips from a NON-AXIS-ALIGNED street edge', () => {
        // Real parcels are not axis-aligned. Depth is measured along the edge normal, so a
        // rotated parcel with the same geometry must give the same area.
        const rot = (p: { x: number; z: number }, t: number) => ({
            x: p.x * Math.cos(t) - p.z * Math.sin(t),
            z: p.x * Math.sin(t) + p.z * Math.cos(t),
        });
        const t = 0.4;
        const r = clipToDepthBand(parcel.map((p) => rot(p, t)), rot(streetA, t), rot(streetB, t), 12);
        expect(r.degenerate).toBe(false);
        expect(area(r.polygon)).toBeCloseTo(360, 4);
    });

    it('is DETERMINISTIC — identical inputs give byte-identical output (C58 §1.1)', () => {
        const a = clipToDepthBand(parcel, streetA, streetB, 12);
        const b = clipToDepthBand(parcel, streetA, streetB, 12);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('rejects a non-positive or non-finite depth as degenerate', () => {
        for (const d of [0, -5, NaN, Infinity]) {
            expect(clipToDepthBand(parcel, streetA, streetB, d).degenerate).toBe(true);
        }
    });

    it('is degenerate on a collapsed aligned edge rather than emitting NaN geometry', () => {
        const r = clipToDepthBand(parcel, { x: 5, z: 0 }, { x: 5, z: 0 }, 12);
        expect(r.degenerate).toBe(true);
        expect(r.polygon).toHaveLength(0);
    });

    it('never emits NaN coordinates', () => {
        // A NaN would propagate silently into an area figure presented as buildable m².
        const r = clipToDepthBand(parcel, streetA, streetB, 12);
        for (const p of r.polygon) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.z)).toBe(true);
        }
    });

    it('a tiny depth yields a thin but valid band, not a degenerate one', () => {
        const r = clipToDepthBand(parcel, streetA, streetB, 0.5);
        expect(r.degenerate).toBe(false);
        expect(area(r.polygon)).toBeCloseTo(15, 6);
    });
});
