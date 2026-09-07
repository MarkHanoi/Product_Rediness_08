// §ENVELOPE-DRAW C5 (lane ENVELOPE-DRAW-2, 2026-09-07) — THE PROJECTION HALF, PINNED.
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS R4 / R5 / R6 · L-13050 · L-10740 · L-446.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS SUITE COVERS, AND — LOUDLY — WHAT IT DOES NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A Cesium/MapLibre draw gesture has two halves. The PICK half (`scene.pickPosition`, `globe.pick`,
// `e.lngLat`) needs a real depth buffer, a real globe and a real map; it is BROWSER-ONLY and this
// lane deliberately builds no fake viewer to feel covered — a fake assembled from the same
// assumptions as the code cannot falsify them ([[fake-more-capable-than-real]]).
//
// The PROJECTION half is pure, and it is the half that fails SILENTLY and PLAUSIBLY: a wrong θ
// draws a correctly-shaped perimeter at the wrong BEARING, and a wrong-signed θ lands it MIRRORED
// across the frame origin — §PARCEL-SHADE-NOT-MIRRORED (L-10740), the defect whose own success
// criterion had no term for it and reported CONSISTENT forever. So it is pinned here, at θ ≠ 0,
// to sub-centimetre, in BOTH directions.
//
// ⛔ AND θ ≠ 0 IS THE WHOLE POINT OF THE FIXTURES. At θ = 0 every one of these assertions passes
// against a conversion that ignores θ entirely — which is precisely the plan's R5 error this
// module was written to correct. A suite that only tests Denmark cannot see Barcelona.

import { describe, expect, it } from 'vitest';
import {
    latLonToProjectXZ,
    projectXZToLatLon,
    resolveSiteDrawFrame,
} from '../siteEnvelopeDrawFrame';

/** Barcelona-ish: the θ ≈ 45° site that made the frame question real. */
const BCN = { lat: 41.3874, lon: 2.1686 };
const THETA_45 = Math.PI / 4;

const frameAt = (theta: number, origin = BCN): ReturnType<typeof resolveSiteDrawFrame> =>
    resolveSiteDrawFrame(origin, { trueNorth: theta });

function okFrame(theta: number, origin = BCN) {
    const r = frameAt(theta, origin);
    if (!r.ok) throw new Error(`fixture frame refused: ${r.reason}`);
    return r.frame;
}

describe('§ENVELOPE-DRAW C5 — resolveSiteDrawFrame: a refusal is never a zero (§L-446)', () => {
    it('⛔ NO ORIGIN refuses, and names the next action — never a guessed origin', () => {
        const r = resolveSiteDrawFrame(null, { trueNorth: 0 });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toContain('ORIGIN');
        expect(r.reason).toContain('Search for the address');
        // ⛔ The reason a user acts on, not a stack trace: it says WHY the refusal is correct.
        expect(r.reason).toContain('wrong land');
    });

    it('⛔ Null Island (0,0) is the `ensureSite` PLACEHOLDER, not a site — refused', () => {
        const r = resolveSiteDrawFrame({ lat: 0, lon: 0 }, { trueNorth: 0 });
        expect(r.ok).toBe(false);
    });

    it('⛔ an UNREACHABLE store refuses — θ-could-not-be-read is NOT θ = 0', () => {
        const r = resolveSiteDrawFrame(BCN, null);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toContain('θ');
        expect(r.reason).toContain('NOT');
        expect(r.reason).toContain('wrong BEARING');
    });

    it('⭐ a REACHABLE store answering 0 is a DEFINITE answer and resolves — the schema defaults it', () => {
        const r = resolveSiteDrawFrame(BCN, { trueNorth: 0 });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.frame.thetaRad).toBe(0);
    });

    it('a non-finite θ falls back to 0 rather than poisoning every vertex with NaN', () => {
        const r = resolveSiteDrawFrame(BCN, { trueNorth: Number.NaN });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.frame.thetaRad).toBe(0);
    });
});

describe('§ENVELOPE-DRAW C5 — the round trip is exact to sub-centimetre AT θ ≠ 0 (R5)', () => {
    // Corners spread over ~200 m, the scale a real parcel perimeter is drawn at.
    const CORNERS = [
        { x: 0, z: 0 },
        { x: 42.5, z: -18.25 },
        { x: 137.75, z: 96.5 },
        { x: -88.125, z: 61.375 },
        { x: -12, z: -204.5 },
    ];

    for (const theta of [0, THETA_45, -THETA_45, 0.7853981, 1.9]) {
        it(`project-XZ → lat/lon → project-XZ is identity at θ=${theta.toFixed(4)} rad`, () => {
            const frame = okFrame(theta);
            for (const p of CORNERS) {
                const back = latLonToProjectXZ(projectXZToLatLon(p, frame), frame);
                // ⛔ SUB-CENTIMETRE. Looser than this and a mirrored or 90°-rotated frame could
                // still pass on a small parcel, which is exactly how L-10740 survived.
                expect(Math.abs(back.x - p.x)).toBeLessThan(0.01);
                expect(Math.abs(back.z - p.z)).toBeLessThan(0.01);
            }
        });
    }

    it('lat/lon → project-XZ → lat/lon is identity at θ ≈ 45° (the other direction)', () => {
        const frame = okFrame(THETA_45);
        const points = [
            BCN,
            { lat: BCN.lat + 0.0012, lon: BCN.lon + 0.0009 },
            { lat: BCN.lat - 0.0018, lon: BCN.lon + 0.0021 },
        ];
        for (const ll of points) {
            const back = projectXZToLatLon(latLonToProjectXZ(ll, frame), frame);
            // 1e-7 deg ≈ 1.1 cm of latitude — the same sub-centimetre bar in angular units.
            expect(Math.abs(back.lat - ll.lat)).toBeLessThan(1e-7);
            expect(Math.abs(back.lon - ll.lon)).toBeLessThan(1e-7);
        }
    });

    it('the ORIGIN maps to project (0,0) at every θ — rotation is ABOUT the origin', () => {
        for (const theta of [0, THETA_45, -1.1]) {
            const p = latLonToProjectXZ(BCN, okFrame(theta));
            expect(Math.abs(p.x)).toBeLessThan(1e-6);
            expect(Math.abs(p.z)).toBeLessThan(1e-6);
        }
    });
});

describe('§ENVELOPE-DRAW C5 — θ IS ACTUALLY APPLIED (the R5 correction, made falsifiable)', () => {
    // ⭐ THIS IS THE ARM THAT WOULD HAVE CAUGHT THE PLAN'S ERROR. The round-trip cases above all
    // pass against a conversion that ignores θ, because an inverse of nothing is still an inverse.
    // These do not.
    it('⛔ a point 100 m due EAST in the project frame is NOT due east on earth when θ ≠ 0', () => {
        const east100 = { x: 100, z: 0 };
        const flat = projectXZToLatLon(east100, okFrame(0));
        const turned = projectXZToLatLon(east100, okFrame(THETA_45));
        // At θ = 0 the point is pure east: same latitude as the origin.
        expect(Math.abs(flat.lat - BCN.lat)).toBeLessThan(1e-9);
        // At θ = 45° it must have moved in LATITUDE too — by ~70 m, i.e. ~6.4e-4 deg.
        expect(Math.abs(turned.lat - BCN.lat)).toBeGreaterThan(1e-4);
    });

    it('⛔ the sign of θ matters — +45° and −45° are NOT the same place (the mirror, L-10740)', () => {
        const p = { x: 120, z: 45 };
        const plus = projectXZToLatLon(p, okFrame(THETA_45));
        const minus = projectXZToLatLon(p, okFrame(-THETA_45));
        expect(Math.abs(plus.lat - minus.lat)).toBeGreaterThan(1e-4);
    });

    it('a rotation preserves DISTANCE from the origin — it turns the ring, it does not scale it', () => {
        const p = { x: 300, z: -140 };
        const r0 = latLonToProjectXZ(projectXZToLatLon(p, okFrame(0)), okFrame(0));
        const rT = projectXZToLatLon(p, okFrame(1.234));
        const backIntoFlat = latLonToProjectXZ(rT, okFrame(0));
        const d0 = Math.hypot(r0.x, r0.z);
        const dT = Math.hypot(backIntoFlat.x, backIntoFlat.z);
        expect(Math.abs(d0 - dT)).toBeLessThan(0.02);
    });
});
