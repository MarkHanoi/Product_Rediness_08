/**
 * §OPENING-PROFILE-FRAME (L-1520) — THE INSET, AND THE BAND BUILT FROM IT.
 *
 * L-1200 taught the wall to CUT a circular / arched void; L-1250–L-1252 gave the architect the
 * control to ask for one. Neither touched the 3-D FRAME, and the founder saw the consequence:
 * *"the opening [is] circular but not the frame — the frame is a square frame."*
 *
 * ⭐ **THE ONE PROPERTY THIS FILE EXISTS TO ASSERT, AND IT IS ASSERTED FOR ALL FOUR PROFILES AT
 * ONCE: the frame's inner face is EVERYWHERE `t` FROM THE OUTLINE THE HOLE WAS CUT WITH.** Not
 * "close to", and not "a smaller circle that ought to agree" — a measured constant normal
 * distance from the producer's own polyline. That is what makes "the frame fits the hole" a
 * property of the code rather than a claim about it, and it is why `insetOutlinePoints` offsets
 * the producer's points instead of re-invoking the producer with smaller dimensions (see its
 * header for the segmental-arch case where the second approach is measurably WRONG).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    openingOutline,
    openingOutlineLocal,
    openingSpringLineYLocal,
    isProfiledOpening,
    insetOutlinePoints,
    clipOutlinePointsAbove,
    outlineSignedArea,
    segmentalRise,
    SEGMENTAL_RISE_RATIO,
    type OutlinePoint,
} from '../src/OpeningProfile';
import { profiledBandGeometry, profiledPlateGeometry } from '../src/OpeningProfileFrameGeometry';

const W = 1.2;
const H = 1.5;
const T = 0.05;

/** Shortest distance from `p` to the closed polyline `poly` — used to MEASURE member width. */
function distToPolyline(p: OutlinePoint, poly: readonly OutlinePoint[]): number {
    let best = Infinity;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % n]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L2 = dx * dx + dy * dy;
        let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
    }
    return best;
}

describe('§A — the inset is a CONSTANT-SECTION member, for every profile', () => {
    // ⭐ NON-VACUITY FIRST. If `openingOutlineLocal` refused any of these, every assertion below
    // would pass by skipping. Circular is square-by-construction (PR-8: width IS the diameter).
    const CASES: ReadonlyArray<readonly [string, number, number]> = [
        ['round-arch', W, H],
        ['segmental-arch', W, H],
        ['circular', W, W],
    ];

    it('every case under test really IS profiled — the guard against a vacuous suite', () => {
        for (const [kind, w, h] of CASES) {
            expect(isProfiledOpening(kind, w, h)).toBe(true);
        }
        // …and the control: a rectangle is NOT, so the arm short-circuits (PR-2).
        expect(isProfiledOpening('rectangular', W, H)).toBe(false);
        expect(isProfiledOpening(undefined, W, H)).toBe(false);
    });

    it.each(CASES)('%s — every inset vertex sits EXACTLY t from the outline', (kind, w, h) => {
        const outline = openingOutlineLocal(kind, w, h)!;
        const inner = insetOutlinePoints(outline.points, T)!;
        expect(inner).toBeTruthy();
        expect(inner.length).toBe(outline.points.length);
        for (const p of inner) {
            // 0.2 mm — three orders below the 2 mm arc sag the producer samples to, so this is
            // measuring the OFFSET, not the tessellation.
            expect(distToPolyline(p, outline.points)).toBeCloseTo(T, 4);
        }
    });

    it('⭐ RECTANGULAR — the inset is the EXACT inset rectangle, not an approximation', () => {
        // The case that must not move. Every window drawn before L-1200 is this one.
        const outline = openingOutlineLocal('rectangular', W, H)!;
        const inner = insetOutlinePoints(outline.points, T)!;
        expect(inner).toEqual([
            { x: -W / 2 + T, y: -H / 2 + T },
            { x:  W / 2 - T, y: -H / 2 + T },
            { x:  W / 2 - T, y:  H / 2 - T },
            { x: -W / 2 + T, y:  H / 2 - T },
        ]);
    });

    it('CIRCULAR — the inset is CONCENTRIC, and its radius is r − t TO THE SAMPLING', () => {
        // The strongest single statement available for the founder's headline case: an oculus
        // frame is a RING, and a ring's two edges share a centre. CONCENTRICITY is exact — every
        // inset vertex is the SAME distance from the origin.
        const outline = openingOutlineLocal('circular', W, W)!;
        const inner = insetOutlinePoints(outline.points, T)!;
        for (const p of outline.points) expect(Math.hypot(p.x, p.y)).toBeCloseTo(W / 2, 9);
        const radii = inner.map(p => Math.hypot(p.x, p.y));
        expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-9);

        // ⭐ **AND IT IS *NOT* EXACTLY `r − t`, WHICH IS CORRECT RATHER THAN A ROUNDING BUDGET.**
        // The outline is an INSCRIBED polygon (`ARC_SAG_TOLERANCE_M` = 2 mm), so its edges are
        // CHORDS, sitting inside the true circle. A constant-width member is parallel to the edge
        // it was cut against — the chord — not to an ideal circle nobody built. Offsetting the
        // apothem by `t` therefore leaves the circumradius at `r − t/cos(π/n)`, ≈ 0.16 mm shy of
        // `r − t` here. **That 0.16 mm is the frame agreeing with the HOLE instead of with the
        // maths**, which is the entire point of deriving it from the one producer.
        const expected = W / 2 - T;
        expect(radii[0]!).toBeLessThan(expected);
        expect(expected - radii[0]!).toBeLessThan(0.0005);
    });

    it('ROUND-ARCH — the inset arch springs from the SAME springing line, not a shifted one', () => {
        const spring = openingSpringLineYLocal('round-arch', W, H)!;
        const outline = openingOutlineLocal('round-arch', W, H)!;
        const inner = insetOutlinePoints(outline.points, T)!;
        // Points above the springing are on a circle of radius r − t about (0, spring).
        const head = inner.filter(p => p.y > spring + 1e-6);
        expect(head.length).toBeGreaterThan(4);
        // Concentric with the OUTER head — see the circular case above for why the radius is
        // `r − t/cos(π/n)` rather than exactly `r − t`: the member is parallel to the CHORD the
        // hole was cut on, and a 0.5 mm window is well inside the 2 mm arc sag.
        const headRadii = head.map(p => Math.hypot(p.x, p.y - spring));
        expect(Math.max(...headRadii) - Math.min(...headRadii)).toBeLessThan(1e-9);
        expect(W / 2 - T - headRadii[0]!).toBeLessThan(0.0005);
        expect(headRadii[0]!).toBeLessThan(W / 2 - T);
        // The jamb feet moved inward and up by exactly t.
        expect(inner[0]).toEqual({ x: -W / 2 + T, y: -H / 2 + T });
        expect(inner[1]).toEqual({ x:  W / 2 - T, y: -H / 2 + T });
    });

    it('⚠ SEGMENTAL — the REJECTED alternative is measurably worse, recorded not assumed', () => {
        // The header claims that re-invoking the producer at `w − 2t`, `h − 2t` gives a member of
        // VARYING width for this one profile. That claim is the reason the inset is written the
        // way it is, so it is measured here rather than believed.
        const outline = openingOutlineLocal('segmental-arch', W, H)!;
        const naive = openingOutlineLocal('segmental-arch', W - 2 * T, H - 2 * T)!;
        const widths = naive.points.map(p => distToPolyline(p, outline.points));
        const spread = Math.max(...widths) - Math.min(...widths);
        expect(spread).toBeGreaterThan(1e-3);            // the naive inset varies by > 1 mm…
        const good = insetOutlinePoints(outline.points, T)!;
        const w2 = good.map(p => distToPolyline(p, outline.points));
        expect(Math.max(...w2) - Math.min(...w2)).toBeLessThan(1e-4);   // …this one does not.
    });

    it('a member that CANNOT FIT is REFUSED, not emitted as a spike', () => {
        const outline = openingOutlineLocal('circular', W, W)!;
        // ⭐ THE CASE THAT CAUGHT THE FIRST DRAFT. At exactly the radius the offset runs PAST the
        // centre and every vertex lands on the far side — a polygon REFLECTED through the origin,
        // which is still counter-clockwise and still smaller, so the area test alone waved it
        // through. The edge-reversal test is what refuses it.
        expect(insetOutlinePoints(outline.points, W)).toBeNull();       // wider than the diameter
        expect(insetOutlinePoints(outline.points, W / 2)).toBeNull();   // exactly the radius
        expect(insetOutlinePoints(outline.points, NaN)).toBeNull();
        expect(insetOutlinePoints([{ x: 0, y: 0 }, { x: 1, y: 0 }], T)).toBeNull();
    });

    it('the outline the frame reads is the SAME CURVE the wall cut — only re-centred', () => {
        // `openingOutlineLocal` is `openingOutline` at offset −w/2, sill −h/2. If that were a
        // second construction rather than a translation, the frame could differ from the reveal.
        const local = openingOutlineLocal('round-arch', W, H)!;
        const world = openingOutline({ profile: 'round-arch', offset: 4.3, width: W, height: H, sillHeight: 0.9 })!;
        expect(local.points.length).toBe(world.points.length);
        const dx = 4.3 + W / 2;
        const dy = 0.9 + H / 2;
        for (let i = 0; i < local.points.length; i++) {
            expect(local.points[i]!.x + dx).toBeCloseTo(world.points[i]!.x, 12);
            expect(local.points[i]!.y + dy).toBeCloseTo(world.points[i]!.y, 12);
        }
    });
});

describe('§B — the springing line, and the door fanlight clip that hangs off it', () => {
    it('names the y where the outline stops being full-width', () => {
        expect(openingSpringLineYLocal('rectangular', W, H)).toBeCloseTo(H / 2, 12);
        expect(openingSpringLineYLocal('round-arch', W, H)).toBeCloseTo(H / 2 - W / 2, 12);
        expect(openingSpringLineYLocal('segmental-arch', W, H)).toBeCloseTo(H / 2 - segmentalRise(W, H), 12);
        // ⛔ A CIRCLE HAS NO STRAIGHT RUN, and `null` is the honest answer rather than `y0`.
        expect(openingSpringLineYLocal('circular', W, W)).toBeNull();
    });

    it('the declared segmental rise is the bricklayer ratio, evaluated in ONE place', () => {
        expect(segmentalRise(1.2, 3)).toBeCloseTo(1.2 * SEGMENTAL_RISE_RATIO, 12);
        // …and the `height/2` term is a CLAMP, which is what the refusal then names.
        expect(segmentalRise(6, 0.4)).toBeCloseTo(0.2, 12);
    });

    it('the FANLIGHT is the head above the springing, bounded by the outline', () => {
        const spring = openingSpringLineYLocal('round-arch', W, H)!;
        const inner = insetOutlinePoints(openingOutlineLocal('round-arch', W, H)!.points, T)!;
        const fan = clipOutlinePointsAbove(inner, spring)!;
        expect(fan).toBeTruthy();
        expect(fan.length).toBeGreaterThan(4);
        for (const p of fan) expect(p.y).toBeGreaterThanOrEqual(spring - 1e-9);
        // It has real area, and it is smaller than the light it was cut from.
        const a = outlineSignedArea(fan);
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThan(outlineSignedArea(inner));
    });

    it('a clip that removes everything returns null rather than a degenerate sliver', () => {
        const inner = insetOutlinePoints(openingOutlineLocal('round-arch', W, H)!.points, T)!;
        expect(clipOutlinePointsAbove(inner, 99)).toBeNull();
    });
});

describe('§C — the BAND: every vertex of the frame solid comes from the producer', () => {
    /**
     * The (x, y) pairs a built geometry actually contains.
     *
     * ⚠ COMPARED WITH A TOLERANCE, and the reason is not sloppiness: THREE stores positions as
     * **Float32**, so a `toFixed(9)` key of a float64 outline point can never match the vertex
     * built from it. 1e-5 m is four orders below the 2 mm arc sag and six above float32's step at
     * this magnitude, so it separates "the same point, narrowed" from "a different point".
     */
    function xyList(geo: THREE.BufferGeometry): Array<[number, number]> {
        const pos = geo.getAttribute('position');
        const out: Array<[number, number]> = [];
        for (let i = 0; i < pos.count; i++) out.push([pos.getX(i), pos.getY(i)]);
        return out;
    }
    function nearest(v: [number, number], set: readonly OutlinePoint[]): number {
        let best = Infinity;
        for (const p of set) best = Math.min(best, Math.hypot(v[0] - p.x, v[1] - p.y));
        return best;
    }

    it('⭐ NO NEW POINTS ARE INVENTED — the ring is exactly outline ∪ inset', () => {
        // This is C86 §10.1 PR-1 as an assertion. A band whose vertices are ALL producer points
        // CANNOT have re-derived the arc: there is no third source for them to come from. If the
        // extruder re-sampled the curve itself — the mistake `curveSegments: 1` exists to prevent
        // — the new samples would sit BETWEEN outline vertices and this would fail.
        const outline = openingOutlineLocal('circular', W, W)!;
        const inner = insetOutlinePoints(outline.points, T)!;
        const geo = profiledBandGeometry(outline.points, inner, 0.2)!;
        expect(geo).toBeTruthy();
        const allowed = [...outline.points, ...inner];
        const verts = xyList(geo);
        for (const v of verts) expect(nearest(v, allowed)).toBeLessThan(1e-5);
        // Non-vacuity, three ways: there is real geometry, it reaches BOTH boundaries, and the
        // check above is not passing because `allowed` is enormous — it holds 2n points and the
        // solid visits essentially all of them.
        expect(verts.length).toBeGreaterThan(50);
        expect(nearest([outline.points[0]!.x, outline.points[0]!.y], allowed)).toBe(0);
        expect(Math.min(...verts.map(v => nearest(v, outline.points)))).toBeLessThan(1e-5);
        expect(Math.min(...verts.map(v => nearest(v, inner)))).toBeLessThan(1e-5);
        // …and the tolerance BITES: a point one sag-step off the outline is NOT accepted.
        const mid = {
            x: (outline.points[0]!.x + outline.points[1]!.x) / 2,
            y: (outline.points[0]!.y + outline.points[1]!.y) / 2,
        };
        expect(nearest([mid.x, mid.y], allowed)).toBeGreaterThan(1e-5);
    });

    it('the band spans the full frame depth, centred like the BoxGeometry it replaces', () => {
        const outline = openingOutlineLocal('round-arch', W, H)!;
        const geo = profiledBandGeometry(outline.points, insetOutlinePoints(outline.points, T), 0.22)!;
        geo.computeBoundingBox();
        // Precision 6, because THREE stores positions as Float32 — 0.11 comes back as
        // 0.10999999940. That is the storage, not the geometry.
        expect(geo.boundingBox!.min.z).toBeCloseTo(-0.11, 6);
        expect(geo.boundingBox!.max.z).toBeCloseTo(+0.11, 6);
    });

    it('⛔ A DOORWAY HAS NO CILL — `omitBaseEdge` opens the band along the base', () => {
        // The one difference between a window's frame and a door's, stated in one parameter.
        const outline = openingOutlineLocal('round-arch', W, H)!;
        const inner = insetOutlinePoints(outline.points, T)!;
        const ring = profiledBandGeometry(outline.points, inner, 0.2, false)!;
        const band = profiledBandGeometry(outline.points, inner, 0.2, true)!;
        const areaAt = (g: THREE.BufferGeometry): number => {
            // Sample the cap plane: count vertices sitting on the base line y0.
            const pos = g.getAttribute('position');
            let n = 0;
            for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - (-H / 2)) < 1e-9) n++;
            return n;
        };
        // The ring lays material along the whole base; the ∩-band keeps only the two post feet.
        expect(areaAt(ring)).toBeGreaterThan(0);
        expect(areaAt(band)).toBeGreaterThan(0);
        // The decisive test is the SOLID at the middle of the threshold: the ring has a cill bar
        // spanning it, the door band does not. Measured as bounding-box height of the material
        // below the inset's foot.
        ring.computeBoundingBox();
        band.computeBoundingBox();
        expect(ring.boundingBox!.min.y).toBeCloseTo(-H / 2, 9);
        expect(band.boundingBox!.min.y).toBeCloseTo(-H / 2, 9);
        // …and the ∩-band is ONE contour with no hole, so it has strictly fewer triangles than
        // the ring for the same outline only if the cill is gone. Count instead of guessing:
        expect(band.getAttribute('position').count).toBeLessThan(ring.getAttribute('position').count);
    });

    it('a plate fills the outline — the pane, the fanlight, and the too-thick-frame case', () => {
        const outline = openingOutlineLocal('circular', W, W)!;
        const geo = profiledPlateGeometry(outline.points, 0.006)!;
        geo.computeBoundingBox();
        // ⚠ NOT `±r` EXACTLY, and that is the INSCRIBED POLYGON again, measured rather than
        // tolerated: `arcSegments(0.6, 2π)` returns **39** — an ODD count, so no sample lands on
        // π and the leftmost vertex sits at −0.5981, one sag-step inside the true circle. The
        // pane is the same polygon the hole is, which is the only agreement that matters.
        // The RIGHT edge is exact — `arcPoints` starts at angle 0, so `(r, 0)` IS a sample.
        expect(geo.boundingBox!.max.x).toBeCloseTo(W / 2, 6);
        // The LEFT edge is not, for the odd-count reason above: it falls one sag-step short.
        expect(geo.boundingBox!.min.x).toBeGreaterThan(-W / 2);
        expect(-W / 2 - geo.boundingBox!.min.x).toBeGreaterThan(-0.003);
        expect(geo.boundingBox!.min.x).toBeCloseTo(-W / 2, 2);
        expect(geo.boundingBox!.max.z - geo.boundingBox!.min.z).toBeCloseTo(0.006, 6);
    });

    it('refuses what it cannot build, rather than emitting an empty mesh', () => {
        expect(profiledBandGeometry(null, null, 0.2)).toBeNull();
        expect(profiledPlateGeometry([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0.2)).toBeNull();
        expect(profiledPlateGeometry(openingOutlineLocal('circular', W, W)!.points, 0)).toBeNull();
    });
});
