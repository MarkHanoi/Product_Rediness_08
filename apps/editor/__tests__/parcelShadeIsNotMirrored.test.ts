// §PARCEL-SHADE-NOT-MIRRORED (L-10740) — THE ASYMMETRIC-PARCEL FIXTURE.
//
// Founder 2026-08-24: "the parcel shade in PRYZM view — not always, but often the shade is not
// correct — it sort of MIRRORS to one side outwards."
//
// ⭐ WHY AN ASYMMETRIC PARCEL IS THE WHOLE POINT. A reflection and a rotation are
// indistinguishable on a symmetric shape: a rectangle mirrored about either of its own axes is
// the SAME rectangle, and an axis-aligned rectangle mirrored about ANY axis-parallel line is
// still an axis-aligned rectangle. So a rectangle can never falsify "is this mirrored?" — every
// test built on one passes vacuously. These fixtures use a CHIRAL (L-shaped) ring, and test 1
// proves it is chiral before anything else is asserted, so the suite cannot pass vacuously.
//
// WHAT IS MEASURED HERE (all of it is measurement, none of it is inference):
//   1. the fixture is genuinely chiral                                     (the suite has teeth)
//   2. the θ producer→consumer chain is a PROPER ROTATION, not a reflection (θ's sign is NOT the
//      bug — signed area, the chirality invariant, is preserved exactly)
//   3. `ParcelBoundarySceneRenderer.buildFill` REFLECTS the parcel fill about the scene X axis
//      relative to the outline it is supposed to fill — `rotateX(+π/2)` on a shape already built
//      in (x, −z). This is the defect.
//   4. `buildEnvelopeVolume` (the violet shade) uses `rotateX(−π/2)` and is CORRECT — which is
//      why the two disagree with each other on screen, exactly as reported.
//   5. today's `§SITE-FRAME-PROBE` provably CANNOT detect a mirror (or a 90° flip): its only
//      term is `deriveProjectNorthAngleFromParcel`, which folds mod 90° and is reflection-blind.
//   6. the NEW probe arm (`detectRingFrameDisagreement`) DOES detect both.
//
// The two THREE mappings are exercised with REAL `THREE.Shape` / `ShapeGeometry` /
// `ExtrudeGeometry` / `rotateX`, so the algebra is proven rather than restated; and the
// production source text is PINNED below, so the test cannot silently drift away from the file
// it is describing (the convention `sceneEnuFrame.test.ts` uses for the GLSL string).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import {
    deriveProjectNorthAngleFromParcel,
    trueVectorToProjectNorth,
} from '../src/ui/site/overlay/projectTrueNorth';
import { sceneXZToEnu, detectRingFrameDisagreement, ringSignedAreaXZ } from '../src/ui/geospatial/sceneEnuFrame';

type XZ = { x: number; z: number };

const RENDERER_SRC = resolve(__dirname, '../src/ui/site/ParcelBoundarySceneRenderer.ts');

/**
 * THE FIXTURE — a chiral L-shaped parcel, ~719 m² (the founder's own plot area), anchored with
 * its first vertex at the scene origin because `parcelFrameOrigin` puts it there. That anchoring
 * matters: the reflection under test is about the line z = 0, which therefore passes through a
 * CORNER of the plot — so the mirrored copy lands wholly on the far side of that corner. That is
 * the geometry behind the founder's words, "mirrors to one side outwards".
 */
const L_PARCEL: XZ[] = [
    { x: 0, z: 0 },
    { x: 34, z: 0 },
    { x: 34, z: -14 },
    { x: 13, z: -14 },
    { x: 13, z: -31 },
    { x: 0, z: -31 },
];

/** Shoelace, SIGNED. Sign = winding = chirality. A reflection negates it; a rotation cannot. */
function signedArea(ring: XZ[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

/** Rotate a scene-XZ ring about the scene origin by `deg` (CCW in the East/North plane). */
function rotateRing(ring: XZ[], deg: number): XZ[] {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    // via East/North so the rotation means what a bearing change means
    return ring.map((p) => {
        const e = p.x, n = -p.z;
        return { x: e * c - n * s, z: -(e * s + n * c) };
    });
}

/** Mirror a scene-XZ ring about the scene X axis (z → −z) — the exact defect under test. */
function mirrorAboutX(ring: XZ[]): XZ[] {
    return ring.map((p) => ({ x: p.x, z: -p.z }));
}

/** The EXACT de-rotation `dispatchParcelBoundary` applies to a committed ring. */
function squareRingToProjectFrame(ring: XZ[], theta: number): XZ[] {
    return ring.map((p) => {
        const e = trueVectorToProjectNorth({ east: p.x, north: -p.z }, theta);
        return { x: e.east, z: -e.north };
    });
}

/** Collect the distinct XZ footprint of a THREE geometry's vertices at the ground plane. */
function geometryXZ(geo: THREE.BufferGeometry): XZ[] {
    const pos = geo.getAttribute('position');
    const out: XZ[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const key = `${x.toFixed(6)}|${z.toFixed(6)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ x, z });
    }
    return out;
}

/** Is `p` present in `set` (within tolerance)? */
function hasPoint(set: XZ[], p: XZ, tol = 1e-6): boolean {
    return set.some((q) => Math.abs(q.x - p.x) <= tol && Math.abs(q.z - p.z) <= tol);
}

// ── 1. THE FIXTURE HAS TEETH ──────────────────────────────────────────────────────────────────
describe('§PARCEL-SHADE-NOT-MIRRORED — the fixture itself', () => {
    it('is CHIRAL: no rotation of the mirrored L reproduces the original (a rectangle could not prove this)', () => {
        const mirrored = mirrorAboutX(L_PARCEL);
        // A rotation preserves signed area exactly; a reflection negates it.
        expect(Math.sign(signedArea(mirrored))).toBe(-Math.sign(signedArea(L_PARCEL)));
        // And no rotation about the origin, at any angle, maps the mirror back onto the original —
        // checked densely rather than argued.
        for (let deg = 0; deg < 360; deg += 1) {
            const r = rotateRing(mirrored, deg);
            const same = r.every((p, i) =>
                Math.abs(p.x - L_PARCEL[i]!.x) < 1e-6 && Math.abs(p.z - L_PARCEL[i]!.z) < 1e-6);
            expect(same).toBe(false);
        }
    });

    it('CONTROL: an axis-aligned rectangle is its OWN mirror — which is why it can never falsify a reflection', () => {
        const rect: XZ[] = [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: -24 }, { x: 0, z: -24 }];
        const m = mirrorAboutX(rect).map((p) => ({ x: p.x, z: p.z - 24 })); // translate back
        // Same point SET, so a reflection of a rectangle is invisible to any shape comparison.
        for (const p of rect) expect(hasPoint(m, p)).toBe(true);
    });
});

// ── 2. VERDICT ON θ: PROPER ROTATION, NOT A REFLECTION ───────────────────────────────────────
describe('§PARCEL-SHADE-NOT-MIRRORED — is θ the mirror? MEASURED: no', () => {
    // Barcelona's Cerdà grid sits ~45° off true north — the founder's own θ = −44.87°.
    const BARCELONA_BEARINGS = [-44.87, 43.4, 45.13, -30, 12.5, 0];

    it.each(BARCELONA_BEARINGS)(
        'producer → consumer round-trips an ASYMMETRIC parcel exactly at bearing %s° (no reflection, no drift)',
        (bearingDeg) => {
            const trueRing = rotateRing(L_PARCEL, bearingDeg);
            const theta = deriveProjectNorthAngleFromParcel(trueRing);
            const stored = squareRingToProjectFrame(trueRing, theta);
            // The globe re-applies θ at the scene→ENU boundary.
            const backEnu = stored.map((p) => sceneXZToEnu(p.x, p.z, theta));
            const trueEnu = trueRing.map((p) => ({ east: p.x, north: -p.z }));
            for (let i = 0; i < trueEnu.length; i++) {
                expect(backEnu[i]!.east).toBeCloseTo(trueEnu[i]!.east, 9);
                expect(backEnu[i]!.north).toBeCloseTo(trueEnu[i]!.north, 9);
            }
        },
    );

    it('θ preserves SIGNED area (chirality) — a sign error in θ would be a rotation, never a mirror', () => {
        for (const bearingDeg of BARCELONA_BEARINGS) {
            const trueRing = rotateRing(L_PARCEL, bearingDeg);
            const theta = deriveProjectNorthAngleFromParcel(trueRing);
            const stored = squareRingToProjectFrame(trueRing, theta);
            // Exact equality of the SIGNED area is the chirality statement.
            expect(signedArea(stored)).toBeCloseTo(signedArea(trueRing), 6);
            // …and with θ NEGATED (the hypothesised sign flip) it is STILL preserved: a wrong-signed
            // θ misplaces the parcel by 2θ but does NOT mirror it. This is the negative control that
            // rules the sign hypothesis out rather than merely failing to confirm it.
            const wrongSign = squareRingToProjectFrame(trueRing, -theta);
            expect(signedArea(wrongSign)).toBeCloseTo(signedArea(trueRing), 6);
        }
    });

    it('θ is LEGITIMATELY NEGATIVE for some plots: the fold is (−45°, +45°], so BOTH −44.87° and +43.40° are in range', () => {
        // Two genuinely different plots, two genuinely different angles — not a regression.
        const a = deriveProjectNorthAngleFromParcel(rotateRing(L_PARCEL, 44.87));
        const b = deriveProjectNorthAngleFromParcel(rotateRing(L_PARCEL, -43.4));
        expect((a * 180) / Math.PI).toBeCloseTo(-44.87, 6);
        expect((b * 180) / Math.PI).toBeCloseTo(43.4, 6);
    });

    it('⚠ THE FOLD IS BISTABLE AT ±45° — a 0.3° change in the dominant edge flips θ by 90°', () => {
        // Barcelona's grid sits exactly on this discontinuity. The flip is a ROTATION, not a mirror,
        // and it is self-cancelling end-to-end (the round-trip test above passes at 45.13°) — but it
        // is why θ "changes sign between sessions" on the same city, and it is worth stating so the
        // next reader does not mistake it for a regression.
        const lo = (deriveProjectNorthAngleFromParcel(rotateRing(L_PARCEL, 44.85)) * 180) / Math.PI;
        const hi = (deriveProjectNorthAngleFromParcel(rotateRing(L_PARCEL, 45.15)) * 180) / Math.PI;
        expect(lo).toBeLessThan(0);
        expect(hi).toBeGreaterThan(0);
        expect(Math.abs(hi - lo)).toBeGreaterThan(89);
    });
});

// ── 3+4. VERDICT ON THE RENDERER: THE FILL *IS* MIRRORED, THE SHADE IS NOT ───────────────────
describe('§PARCEL-SHADE-NOT-MIRRORED — the three.js PRYZM-view rasteriser', () => {
    /** `buildFill` / `buildEnvelopeVolume` both build the 2D shape in (x, −z). */
    function shapeFromRing(ring: XZ[]): THREE.Shape {
        const s = new THREE.Shape();
        s.moveTo(ring[0]!.x, -ring[0]!.z);
        for (let i = 1; i < ring.length; i++) s.lineTo(ring[i]!.x, -ring[i]!.z);
        s.closePath();
        return s;
    }

    it('⭐ THE REGRESSION PIN: both builders construct the shape identically AND rotate identically', () => {
        // This is the guard, not a restatement. The defect was two builders 100 lines apart in ONE
        // file with identical shape construction and OPPOSITE rotation signs. Pin both halves.
        const src = readFileSync(RENDERER_SRC, 'utf8');
        expect(src).toContain('shape.moveTo(polygon[0]!.x, -polygon[0]!.z);');   // fill
        expect(src).toContain('shape.moveTo(ring[0]!.x, -ring[0]!.z);');         // envelope / shade
        // BOTH must now rotate the same way…
        expect(src.match(/geo\.rotateX\(-Math\.PI \/ 2\);/g) ?? []).toHaveLength(2);
        // …and the mirroring sign must not reappear anywhere in this file.
        expect(src).not.toMatch(/geo\.rotateX\(Math\.PI \/ 2\);/);
    });

    it('MEASURED: rotateX(+π/2) sends a shape built in (x, −z) to scene z = −p.z — A REFLECTION', () => {
        const geo = new THREE.ShapeGeometry(shapeFromRing(L_PARCEL));
        geo.rotateX(Math.PI / 2);
        const got = geometryXZ(geo);
        for (const p of L_PARCEL) {
            expect(hasPoint(got, { x: p.x, z: -p.z })).toBe(true);   // mirrored copy is present
        }
        // …and the correctly-placed ring is ABSENT (excluding the z = 0 vertices, which are their
        // own mirror — precisely why a plot touching z = 0 can look partly right).
        for (const p of L_PARCEL.filter((q) => Math.abs(q.z) > 1e-9)) {
            expect(hasPoint(got, p)).toBe(false);
        }
    });

    it('MEASURED: rotateX(−π/2) — what the ENVELOPE SHADE uses — lands on scene z = +p.z. CORRECT', () => {
        const geo = new THREE.ExtrudeGeometry(shapeFromRing(L_PARCEL), {
            depth: 0.12, bevelEnabled: false, steps: 1,
        });
        geo.rotateX(-Math.PI / 2);
        const got = geometryXZ(geo);
        for (const p of L_PARCEL) expect(hasPoint(got, p)).toBe(true);
    });

    it('⭐ THE FOUNDER\'S REPORT, REPRODUCED: fill and shade land as MIRROR IMAGES of each other', () => {
        const fill = new THREE.ShapeGeometry(shapeFromRing(L_PARCEL));
        fill.rotateX(Math.PI / 2);
        const shade = new THREE.ExtrudeGeometry(shapeFromRing(L_PARCEL), {
            depth: 0.12, bevelEnabled: false, steps: 1,
        });
        shade.rotateX(-Math.PI / 2);
        const fillXZ = geometryXZ(fill);
        const shadeXZ = geometryXZ(shade);
        // Every shade vertex has its MIRROR in the fill, and (off the z = 0 line) not itself.
        for (const p of shadeXZ.filter((q) => Math.abs(q.z) > 1e-9)) {
            expect(hasPoint(fillXZ, { x: p.x, z: -p.z })).toBe(true);
            expect(hasPoint(fillXZ, p)).toBe(false);
        }
        // The displacement is "to one side, outwards": the two centroids straddle z = 0.
        const cz = (s: XZ[]) => s.reduce((a, p) => a + p.z, 0) / s.length;
        expect(Math.sign(cz(fillXZ))).toBe(-Math.sign(cz(shadeXZ)));
    });

    it('THE FIX: rotateX(−π/2) in buildFill makes the fill match the outline vertex-for-vertex', () => {
        const geo = new THREE.ShapeGeometry(shapeFromRing(L_PARCEL));
        geo.rotateX(-Math.PI / 2);
        const got = geometryXZ(geo);
        for (const p of L_PARCEL) expect(hasPoint(got, p)).toBe(true);
        // The outline writes its vertices DIRECTLY at (p.x, y, p.z) — it is correct by construction,
        // which is what makes it the reference the fill must match.
    });
});

// ── 5. THE PROBE IS BLIND ────────────────────────────────────────────────────────────────────
describe('§SITE-FRAME-PROBE — what its ONE term can and cannot see', () => {
    it('⛔ CANNOT SEE A MIRROR: a reflected ring re-derives residual 0, so the probe prints CONSISTENT', () => {
        const square = squareRingToProjectFrame(
            rotateRing(L_PARCEL, -44.87),
            deriveProjectNorthAngleFromParcel(rotateRing(L_PARCEL, -44.87)),
        );
        const residualOk = (deriveProjectNorthAngleFromParcel(square) * 180) / Math.PI;
        const residualMirrored = (deriveProjectNorthAngleFromParcel(mirrorAboutX(square)) * 180) / Math.PI;
        expect(Math.abs(residualOk)).toBeLessThan(0.5);        // verdict: CONSISTENT
        expect(Math.abs(residualMirrored)).toBeLessThan(0.5);  // verdict: CONSISTENT — AND IT IS WRONG
    });

    it('⛔ CANNOT SEE A 90° FLIP either: the derivation folds mod 90° by construction', () => {
        const square = squareRingToProjectFrame(L_PARCEL, 0);
        const flipped = rotateRing(square, 90);
        expect(Math.abs((deriveProjectNorthAngleFromParcel(flipped) * 180) / Math.PI)).toBeLessThan(0.5);
    });
});

// ── 6. THE NEW ARM SEES BOTH ─────────────────────────────────────────────────────────────────
describe('§SITE-FRAME-PROBE — the NEW reflection/displacement arm', () => {
    /** A plausible buildable envelope: the L parcel inset ~3 m, same frame, same winding. */
    const ENVELOPE: XZ[] = [
        { x: 3, z: -3 },
        { x: 31, z: -3 },
        { x: 31, z: -11 },
        { x: 10, z: -11 },
        { x: 10, z: -28 },
        { x: 3, z: -28 },
    ];

    it('passes cleanly when the envelope really is an inset of the boundary', () => {
        const r = detectRingFrameDisagreement(L_PARCEL, ENVELOPE);
        expect(r.reflected).toBe(false);
        expect(r.displaced).toBe(false);
        expect(r.ok).toBe(true);
    });

    it('⭐ DETECTS THE MIRROR the old term is blind to', () => {
        const r = detectRingFrameDisagreement(L_PARCEL, mirrorAboutX(ENVELOPE));
        expect(r.ok).toBe(false);
        // Mirrored about a line through the plot corner ⇒ the envelope centroid leaves the parcel.
        expect(r.displaced).toBe(true);
    });

    it('⭐ DETECTS A REVERSED WINDING (the `north = +z` slip) via signed-area orientation', () => {
        const r = detectRingFrameDisagreement(L_PARCEL, [...ENVELOPE].reverse());
        expect(r.reflected).toBe(true);
        expect(r.ok).toBe(false);
    });

    it('⭐ DETECTS the 2026-08-05 STALE-ENVELOPE race too: a neighbouring parcel\'s envelope is displaced', () => {
        const neighbour = ENVELOPE.map((p) => ({ x: p.x + 40, z: p.z }));
        const r = detectRingFrameDisagreement(L_PARCEL, neighbour);
        expect(r.displaced).toBe(true);
        expect(r.ok).toBe(false);
    });

    it('DETECTS an envelope LARGER than its own parcel (an inset can never grow)', () => {
        const bigger = L_PARCEL.map((p) => ({ x: p.x * 1.4, z: p.z * 1.4 }));
        expect(detectRingFrameDisagreement(L_PARCEL, bigger).oversized).toBe(true);
    });

    it('is SILENT when it has nothing to compare — an absent envelope is not a defect', () => {
        expect(detectRingFrameDisagreement(L_PARCEL, null).ok).toBe(true);
        expect(detectRingFrameDisagreement(null, ENVELOPE).ok).toBe(true);
        expect(detectRingFrameDisagreement(L_PARCEL, [{ x: 0, z: 0 }]).ok).toBe(true);
    });

    it('ringSignedAreaXZ is the chirality primitive: a reflection negates it, a rotation does not', () => {
        expect(Math.sign(ringSignedAreaXZ(mirrorAboutX(L_PARCEL))))
            .toBe(-Math.sign(ringSignedAreaXZ(L_PARCEL)));
        expect(ringSignedAreaXZ(rotateRing(L_PARCEL, 37))).toBeCloseTo(ringSignedAreaXZ(L_PARCEL), 6);
    });
});
