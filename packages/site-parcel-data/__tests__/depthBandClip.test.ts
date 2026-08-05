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

    describe('§DEPTHBAND-SPLIT (2026-08-05) — subject crosses the clip line MORE than twice', () => {
        /** True iff any two non-adjacent edges of `ring` properly cross. */
        function selfIntersects(ring: ReadonlyArray<{ x: number; z: number }>): boolean {
            const cr = (o: any, p: any, q: any) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x);
            const cross = (a: any, b: any, c: any, d: any) => {
                const d1 = cr(a, b, c), d2 = cr(a, b, d), d3 = cr(c, d, a), d4 = cr(c, d, b);
                return (d1 > 1e-9) !== (d2 > 1e-9) && (d3 > 1e-9) !== (d4 > 1e-9);
            };
            const n = ring.length;
            for (let i = 0; i < n; i++) {
                const a = ring[i]!, b = ring[(i + 1) % n]!;
                for (let j = i + 1; j < n; j++) {
                    if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
                    if (cross(a, b, ring[j]!, ring[(j + 1) % n]!)) return true;
                }
            }
            return false;
        }

        // A U-shaped (horseshoe) ring: a notch cut into the front edge between x=12..18,
        // reconnecting only at z=15 — well beyond the depth-5 band. Below z=15 the polygon is
        // genuinely TWO disjoint strips ([0,12]×[0,5] and [18,30]×[0,5]). This is the shape a real
        // irregular cadastral inset (a notch/driveway reentrant near the aligned edge) can produce —
        // the exact class of many-vertex, non-convex ring the founder's real Córdoba UAD-1 parcel
        // was (8–9 boundary edges, several under 5 m).
        const horseshoe = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 15 }, { x: 18, z: 15 },
            { x: 18, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 20 }, { x: 0, z: 20 },
        ];

        it('returns a SIMPLE (non-self-intersecting) ring, not a bowtie', () => {
            const r = clipToDepthBand(horseshoe, streetA, streetB, 5);
            expect(r.degenerate).toBe(false);
            expect(r.polygon.length).toBeGreaterThanOrEqual(3);
            expect(selfIntersects(r.polygon)).toBe(false);
        });

        it('returns ONE of the two disjoint pieces (the larger), not a phantom bridge across the gap', () => {
            const r = clipToDepthBand(horseshoe, streetA, streetB, 5);
            // The two true disjoint pieces are each 12 × 5 = 60 m². The old (buggy) behaviour
            // bridged them into one self-intersecting ring reporting 120 m² total — an area that
            // was never a real simple buildable region. The fixed behaviour keeps the largest
            // genuine simple piece (60 m²), which is the conservative (never-overstate, C58 §1.4)
            // outcome `insetPolygon.ts`'s own §INSET-LOOP-DECOMPOSE precedent already establishes.
            expect(area(r.polygon)).toBeCloseTo(60, 6);
            // Every vertex must be entirely within EITHER the left [0,12] or right [18,30] strip —
            // never straddling the excluded [12,18] gap, which is what the spurious bridge chord did.
            const xs = r.polygon.map((p) => p.x);
            const allLeft = xs.every((x) => x <= 12 + 1e-9);
            const allRight = xs.every((x) => x >= 18 - 1e-9);
            expect(allLeft || allRight).toBe(true);
        });

        it('never emits NaN coordinates on the split path', () => {
            const r = clipToDepthBand(horseshoe, streetA, streetB, 5);
            for (const p of r.polygon) {
                expect(Number.isFinite(p.x)).toBe(true);
                expect(Number.isFinite(p.z)).toBe(true);
            }
        });

        it('is DETERMINISTIC on the split path (C58 §1.1)', () => {
            const a = clipToDepthBand(horseshoe, streetA, streetB, 5);
            const b = clipToDepthBand(horseshoe, streetA, streetB, 5);
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        });

        it('REGRESSION: simple rectangles are completely unaffected by the split-handling path', () => {
            // The core acceptance test's rectangle must still clip to exactly the same ring —
            // the self-intersection check must never fire (and never change behaviour) on the
            // common single-component case.
            const r = clipToDepthBand(parcel, streetA, streetB, 12);
            expect(r.degenerate).toBe(false);
            expect(area(r.polygon)).toBeCloseTo(360, 6);
            expect(selfIntersects(r.polygon)).toBe(false);
        });

        it('REGRESSION: the concave L-shaped case (single component) is unaffected', () => {
            const lShaped = [
                { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: -10 },
                { x: 15, z: -10 }, { x: 15, z: -40 }, { x: 0, z: -40 },
            ];
            const r = clipToDepthBand(lShaped, streetA, streetB, 5);
            expect(r.degenerate).toBe(false);
            expect(area(r.polygon)).toBeCloseTo(150, 6);
            expect(selfIntersects(r.polygon)).toBe(false);
        });

        it('WINDING-INDEPENDENT on the split path — a reversed horseshoe splits the same way', () => {
            const ccw = clipToDepthBand(horseshoe, streetA, streetB, 5);
            const cw = clipToDepthBand([...horseshoe].reverse(), streetA, streetB, 5);
            expect(area(cw.polygon)).toBeCloseTo(area(ccw.polygon), 6);
            expect(selfIntersects(cw.polygon)).toBe(false);
        });
    });
});
