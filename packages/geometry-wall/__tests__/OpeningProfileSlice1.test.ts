// §OPENING-PROFILE (L-1200) — slice 1: the outline, the refusals, and THE SEPARATING TEST.
//
// ⭐ THE SEPARATING TEST IS THE DELIVERABLE OF THIS FILE.
//
// C86 §10.1 PR-4 permits arms B and C to keep cutting the opening's BOUNDING BOX and fill the
// difference with a gasket plate. That permission is only honest if something can tell the
// difference between "a circle, decomposed internally into a bbox cut plus a gasket" and "a
// rectangle with a curved label on it". The contract states the test so it cannot be argued
// later:
//
//     every reveal face MUST lie on the outline,
//     and no face may bound the void from the bbox boundary.
//
// Operationally, for a circular opening of diameter d:
//     (1) there IS solid material at the bbox CORNERS   — a bare rectangle has none;
//     (2) there is NO material strictly inside the circle — a staircase has some;
//     (3) every reveal vertex sits ON the circle         — within the declared sag tolerance.
//
// ⛔ AND THE TEST IS ONLY WORTH ANYTHING IF IT CAN FAIL. §D below feeds the SAME assertions a
// deliberately-wrong implementation — the bbox rectangle wearing `isRectangular: false`, i.e.
// precisely "a rectangle called round" — and proves each assertion rejects it. A fake built from
// the header cannot falsify the header; this fake is built to be wrong in the exact way the
// founder forbade.

import { describe, it, expect } from 'vitest';
import {
    openingOutline,
    openingProfileRefusal,
    openingProfileHostRefusal,
    openingProfileShapeRefusal,
    openingProfileTag,
    resolveOpeningProfile,
    isRectangularProfile,
    arcSegments,
    ARC_SAG_TOLERANCE_M,
    SEGMENTAL_RISE_RATIO,
    OPENING_PROFILE_KINDS,
    type OpeningOutline,
    type OutlinePoint,
} from '../src/OpeningProfile';
import { buildOpeningProfileGasket } from '../src/OpeningProfileGasket';

// ── helpers ─────────────────────────────────────────────────────────────────────────────────

/** Shoelace. Positive ⇒ counter-clockwise. */
function signedArea(pts: readonly OutlinePoint[]): number {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const q = pts[(i + 1) % pts.length]!;
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

/** Every triangle of a positions-only geometry, as flat triples. */
function triangles(geo: any): number[][][] {
    const pos = geo.getAttribute('position');
    const out: number[][][] = [];
    for (let i = 0; i < pos.count; i += 3) {
        out.push([
            [pos.getX(i), pos.getY(i), pos.getZ(i)],
            [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)],
            [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)],
        ]);
    }
    return out;
}

function pointInTri(px: number, py: number, t: number[][]): boolean {
    const [a, b, c] = t as [number[], number[], number[]];
    const d = (b[1]! - c[1]!) * (a[0]! - c[0]!) + (c[0]! - b[0]!) * (a[1]! - c[1]!);
    if (Math.abs(d) < 1e-12) return false;
    const l1 = ((b[1]! - c[1]!) * (px - c[0]!) + (c[0]! - b[0]!) * (py - c[1]!)) / d;
    const l2 = ((c[1]! - a[1]!) * (px - c[0]!) + (a[0]! - c[0]!) * (py - c[1]!)) / d;
    const l3 = 1 - l1 - l2;
    return l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9;
}

/**
 * Is there solid material at wall-local `(x, y)`?
 *
 * Answered from the FRONT CAP — the face a viewer standing outside the wall looks at. A point the
 * front cap covers is wall; a point it does not cover is void. That is the same question the
 * founder asks by looking at the screen, expressed as arithmetic.
 */
function solidAt(geo: any, x: number, y: number, zFront: number): boolean {
    for (const t of triangles(geo)) {
        if (t.every((v) => Math.abs(v[2]! - zFront) < 1e-6) && pointInTri(x, y, t)) return true;
    }
    return false;
}

/** Vertices that are neither on the front nor the back plane are reveal-band vertices. */
function revealVertices(geo: any, zBack: number, zFront: number): number[][] {
    const pos = geo.getAttribute('position');
    const out: number[][] = [];
    for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        // Reveal quads span back→front, so their vertices sit on BOTH planes; what distinguishes
        // them is that they lie on the outline rather than filling the cap. Collect every vertex
        // and let the caller assert about the ones inside the bbox.
        out.push([pos.getX(i), pos.getY(i), z]);
    }
    return out;
}

const Z_BACK = -0.15;
const Z_FRONT = 0.15;

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§A — the outline: one producer, four profiles', () => {
    it('rectangular is the bounding box, and reports isRectangular (PR-2 byte-identity hinge)', () => {
        const o = openingOutline({ offset: 1, width: 1.2, height: 1.4, sillHeight: 0.9 })!;
        expect(o.isRectangular).toBe(true);
        expect(o.kind).toBe('rectangular');
        expect(o.points).toHaveLength(4);
        expect(o.bbox).toEqual({ x0: 1, x1: 2.2, y0: 0.9, y1: 2.3 });
        // The outline IS the bbox — corner-for-corner.
        expect(o.points.map((p) => [p.x, p.y])).toEqual([
            [1, 0.9], [2.2, 0.9], [2.2, 2.3], [1, 2.3],
        ]);
    });

    it('an ABSENT profile is rectangular — every pre-L-1200 opening must load unchanged', () => {
        const o = openingOutline({ offset: 1, width: 1, height: 1, sillHeight: 1 })!;
        expect(o.isRectangular).toBe(true);
        expect(resolveOpeningProfile(undefined)).toBe('rectangular');
        expect(resolveOpeningProfile('some-future-value')).toBe('rectangular');
        expect(isRectangularProfile(null)).toBe(true);
    });

    it('circular: every point sits on the circle, and the box is square', () => {
        const d = 1.0;
        const o = openingOutline({ profile: 'circular', offset: 2, width: d, height: d, sillHeight: 1.2 })!;
        expect(o.isRectangular).toBe(false);
        const cx = 2 + d / 2;
        const cy = 1.2 + d / 2;
        for (const p of o.points) {
            expect(Math.abs(Math.hypot(p.x - cx, p.y - cy) - d / 2)).toBeLessThan(1e-9);
        }
        expect(o.points.length).toBeGreaterThanOrEqual(16);
    });

    it('round-arch: flat sill, straight jambs, semicircular head of radius width/2', () => {
        const w = 1.0, h = 2.1, sill = 0;
        const o = openingOutline({ profile: 'round-arch', offset: 0.5, width: w, height: h, sillHeight: sill })!;
        const cx = 0.5 + w / 2;
        const ys = sill + h - w / 2;
        // the two sill corners
        expect(o.points[0]).toEqual({ x: 0.5, y: 0 });
        expect(o.points[1]).toEqual({ x: 1.5, y: 0 });
        // the crown is at the top centre, to within the declared sag (see the segmental case for
        // why this is a tolerance and not an equality)
        const crown = o.points.reduce((a, b) => (b.y > a.y ? b : a));
        expect(Math.abs(crown.x - cx)).toBeLessThan(w / 8);
        expect(sill + h - crown.y).toBeGreaterThanOrEqual(0);
        expect(sill + h - crown.y).toBeLessThanOrEqual(ARC_SAG_TOLERANCE_M + 1e-9);
        // every head point is on the springing circle
        for (const p of o.points.slice(2)) {
            expect(Math.abs(Math.hypot(p.x - cx, p.y - ys) - w / 2)).toBeLessThan(1e-9);
        }
        // nothing escapes the bounding box
        for (const p of o.points) {
            expect(p.x).toBeGreaterThanOrEqual(0.5 - 1e-9);
            expect(p.x).toBeLessThanOrEqual(1.5 + 1e-9);
            expect(p.y).toBeLessThanOrEqual(sill + h + 1e-9);
        }
    });

    it('segmental-arch: crown at the top centre, springing one declared rise below it', () => {
        const w = 1.8, h = 2.2;
        const o = openingOutline({ profile: 'segmental-arch', offset: 0, width: w, height: h, sillHeight: 0 })!;
        const rise = Math.min(w * SEGMENTAL_RISE_RATIO, h / 2);
        // ⚠ THE SAMPLED POLYLINE NEED NOT PUT A VERTEX EXACTLY ON THE APEX — asserting it did
        // would be pinning an accident of the segment count, not the geometry. What IS guaranteed
        // is the declared sag: the highest SAMPLE sits within ARC_SAG_TOLERANCE_M of the true
        // crown. (The first draft of this test asserted equality, passed for the round arch
        // because its even segment count happens to land on π/2, and failed here. The geometry
        // was right both times; the assertion was measuring the tessellator.)
        const crown = o.points.reduce((a, b) => (b.y > a.y ? b : a));
        expect(Math.abs(crown.x - w / 2)).toBeLessThan(w / 8);
        expect(h - crown.y).toBeGreaterThanOrEqual(0);
        expect(h - crown.y).toBeLessThanOrEqual(ARC_SAG_TOLERANCE_M + 1e-9);
        // the arch springs from y = h − rise at both jambs
        const head = o.points.slice(2);
        expect(head[0]!.y).toBeCloseTo(h - rise, 9);
        expect(head[head.length - 1]!.y).toBeCloseTo(h - rise, 9);
        // shallower than a round arch of the same span, which is the whole point of the profile
        expect(rise).toBeLessThan(w / 2);
    });

    it('every profile winds COUNTER-CLOCKWISE — consumers depend on it for hole/reveal winding', () => {
        // §OUTLINE80 — `custom` has no fixed shape, so it is exercised here with a real ring rather
        // than skipped: D3 normalises winding on commit, so an apex-up triangle authored CW must
        // still come out CCW like every other profile.
        const CUSTOM_TRIANGLE = { vertices: [{ u: 1, v: 0 }, { u: 0.5, v: 1 }, { u: 0, v: 0 }] };
        for (const kind of OPENING_PROFILE_KINDS) {
            const o = openingOutline({
                profile: kind, offset: 0, width: 1, height: 1, sillHeight: 0,
                ...(kind === 'custom' ? { customOutline: CUSTOM_TRIANGLE } : {}),
            })!;
            expect(o, `${kind} must produce an outline`).not.toBeNull();
            expect(signedArea(o.points), `${kind} must be CCW`).toBeGreaterThan(0);
        }
    });

    it('arcs are sampled to the DECLARED sag tolerance, not to a magic segment count', () => {
        for (const d of [0.3, 1.0, 3.0]) {
            const o = openingOutline({ profile: 'circular', offset: 0, width: d, height: d, sillHeight: 0 })!;
            const r = d / 2;
            let worst = 0;
            for (let i = 0; i < o.points.length; i++) {
                const p = o.points[i]!;
                const q = o.points[(i + 1) % o.points.length]!;
                const mx = (p.x + q.x) / 2 - r;
                const my = (p.y + q.y) / 2 - r;
                worst = Math.max(worst, r - Math.hypot(mx, my)); // chord sag
            }
            expect(worst).toBeLessThanOrEqual(ARC_SAG_TOLERANCE_M + 1e-9);
        }
        expect(arcSegments(0, 1)).toBeGreaterThan(0);       // degenerate radius cannot divide by zero
        expect(arcSegments(1e9, Math.PI * 2)).toBeLessThanOrEqual(128);
    });

    it('is DETERMINISTIC — the outline feeds a cache key, so a wobble is a cache that never hits', () => {
        const mk = () => openingOutline({ profile: 'circular', offset: 1.234, width: 0.8, height: 0.8, sillHeight: 1.1 })!;
        expect(JSON.stringify(mk().points)).toBe(JSON.stringify(mk().points));
    });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§B — the refusals: one predicate, and every message names its alternative', () => {
    it('a CURVED host refuses a profiled opening, and names host + reason + alternative (PR-5, R-11)', () => {
        const msg = openingProfileHostRefusal('circular', { curve: { control: { x: 0, y: 0, z: 0 } } });
        expect(msg).toBeTruthy();
        expect(msg!.toLowerCase()).toContain('curved');
        expect(msg!.toLowerCase()).toContain('arc');
        expect(msg!.toLowerCase()).toContain('straight wall');
    });

    it('a curved host still accepts a RECTANGULAR opening — pre-existing behaviour is untouched', () => {
        expect(openingProfileHostRefusal('rectangular', { curve: {} })).toBeNull();
        expect(openingProfileHostRefusal(undefined, { curve: {} })).toBeNull();
    });

    it('circular with width ≠ height refuses, quoting BOTH numbers (R-12, hard-stopper doctrine)', () => {
        const msg = openingProfileShapeRefusal('circular', 2, 1);
        expect(msg).toBeTruthy();
        expect(msg).toContain('2.000');
        expect(msg).toContain('1.000');
        expect(msg!.toLowerCase()).toContain('diameter');
    });

    it('a round arch shorter than its own head refuses and offers the segmental arch', () => {
        const msg = openingProfileShapeRefusal('round-arch', 2.0, 0.5);
        expect(msg).toBeTruthy();
        expect(msg).toContain('1.000');            // the head alone is 1.0 m
        expect(msg!.toLowerCase()).toContain('segmental');
    });

    it('the ONE gate composes shape and host, and clears an ordinary case', () => {
        expect(openingProfileRefusal({ profile: 'circular', width: 1, height: 1, host: { layers: [] } })).toBeNull();
        expect(openingProfileRefusal({ profile: 'circular', width: 1, height: 2, host: null })).toBeTruthy();
        expect(openingProfileRefusal({ profile: 'circular', width: 1, height: 1, host: { curve: {} } })).toBeTruthy();
        expect(openingProfileRefusal({ width: 1, height: 2, host: { curve: {} } })).toBeNull();
    });

    it('the hash tag is EMPTY for a rectangle — so no existing wall is re-keyed', () => {
        expect(openingProfileTag(undefined)).toBe('');
        expect(openingProfileTag('rectangular')).toBe('');
        expect(openingProfileTag('unknown-future')).toBe('');
        expect(openingProfileTag('circular')).toBe(':circular');
        expect(openingProfileTag('round-arch')).toBe(':round-arch');
    });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§C — ⭐ THE SEPARATING TEST: the gasket draws a circle, not a rectangle', () => {
    const D = 1.0;
    const OFF = 2.0;
    const SILL = 1.0;
    const outline = openingOutline({ profile: 'circular', offset: OFF, width: D, height: D, sillHeight: SILL })!;
    const cx = OFF + D / 2;
    const cy = SILL + D / 2;

    const geo = buildOpeningProfileGasket(outline, Z_BACK, Z_FRONT, 0)!;

    it('a gasket is produced at all', () => {
        expect(geo).toBeTruthy();
        expect(geo.getAttribute('position').count).toBeGreaterThan(0);
    });

    it('(1) there IS SOLID MATERIAL at all four bbox corners — a bare rectangle would have none', () => {
        const inset = 0.02;
        const corners: [number, number][] = [
            [OFF + inset, SILL + inset],
            [OFF + D - inset, SILL + inset],
            [OFF + inset, SILL + D - inset],
            [OFF + D - inset, SILL + D - inset],
        ];
        for (const [x, y] of corners) {
            expect(solidAt(geo, x, y, Z_FRONT), `corner (${x}, ${y}) must be wall`).toBe(true);
        }
    });

    it('(2) there is NO MATERIAL strictly inside the circle — a staircase would leave some', () => {
        // Sample a dense ring just inside the arc, where a rectangular approximation is worst.
        for (let i = 0; i < 64; i++) {
            const t = (Math.PI * 2 * i) / 64;
            const r = D / 2 - ARC_SAG_TOLERANCE_M - 1e-4;
            const x = cx + r * Math.cos(t);
            const y = cy + r * Math.sin(t);
            expect(solidAt(geo, x, y, Z_FRONT), `(${x}, ${y}) is inside the circle and must be void`).toBe(false);
        }
        expect(solidAt(geo, cx, cy, Z_FRONT)).toBe(false);   // the middle, obviously
    });

    it('(3) EVERY vertex inside the bbox lies ON the circle — no face bounds the void from the bbox', () => {
        const verts = revealVertices(geo, Z_BACK, Z_FRONT);
        let checked = 0;
        for (const [x, y] of verts as unknown as [number, number][]) {
            const onBBox =
                Math.abs(x - OFF) < 1e-6 || Math.abs(x - (OFF + D)) < 1e-6 ||
                Math.abs(y - SILL) < 1e-6 || Math.abs(y - (SILL + D)) < 1e-6;
            if (onBBox) continue;   // the gasket's outer edge is allowed to be the bbox
            // Anything else must sit on the arc.
            expect(Math.abs(Math.hypot(x - cx, y - cy) - D / 2)).toBeLessThan(1e-5);
            checked++;
        }
        expect(checked, 'the reveal band must contribute vertices').toBeGreaterThan(8);
    });

    it('⛔ PR-2 — a RECTANGULAR outline produces NO gasket at all', () => {
        const rect = openingOutline({ offset: OFF, width: D, height: D, sillHeight: SILL })!;
        expect(buildOpeningProfileGasket(rect, Z_BACK, Z_FRONT, 0)).toBeNull();
        expect(buildOpeningProfileGasket(null, Z_BACK, Z_FRONT, 0)).toBeNull();
    });

    it('a round-arch gasket fills the two spandrels and nothing else', () => {
        const w = 1.0, h = 2.0, off = 0.5, sill = 0;
        const arch = openingOutline({ profile: 'round-arch', offset: off, width: w, height: h, sillHeight: sill })!;
        const g = buildOpeningProfileGasket(arch, Z_BACK, Z_FRONT, 0)!;
        // spandrel — the top corner, outside the semicircle
        expect(solidAt(g, off + 0.02, sill + h - 0.02, Z_FRONT)).toBe(true);
        expect(solidAt(g, off + w - 0.02, sill + h - 0.02, Z_FRONT)).toBe(true);
        // dead centre of the opening, and the sill zone — both void
        expect(solidAt(g, off + w / 2, sill + h / 2, Z_FRONT)).toBe(false);
        expect(solidAt(g, off + w / 2, sill + 0.2, Z_FRONT)).toBe(false);
        g.dispose();
    });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§D — ⛔ FALSIFIABILITY: the separating test REJECTS a rectangle wearing a curved label', () => {
    // The deliberately-wrong implementation: the bbox rectangle, declaring itself non-rectangular.
    // This is exactly "draw a rectangle and call it round", which the founder forbade by name. If
    // §C's assertions pass on this, §C proves nothing.
    const D = 1.0, OFF = 2.0, SILL = 1.0;
    const cx = OFF + D / 2, cy = SILL + D / 2;
    const fake: OpeningOutline = {
        kind: 'circular',
        isRectangular: false,
        bbox: { x0: OFF, x1: OFF + D, y0: SILL, y1: SILL + D },
        points: [
            { x: OFF, y: SILL },
            { x: OFF + D, y: SILL },
            { x: OFF + D, y: SILL + D },
            { x: OFF, y: SILL + D },
        ],
    };

    it('the fake produces an EMPTY or corner-free gasket — assertion (1) rejects it', () => {
        const g = buildOpeningProfileGasket(fake, Z_BACK, Z_FRONT, 0);
        // (bbox − outline) is empty when the outline IS the bbox, so either no geometry comes back
        // at all, or it covers none of the corners. Both are failures of assertion (1).
        const cornerSolid =
            g !== null && solidAt(g, OFF + 0.02, SILL + 0.02, Z_FRONT);
        expect(cornerSolid, 'a rectangle-called-round must NOT satisfy the corner assertion').toBe(false);
        g?.dispose();
    });

    it('a STAIRCASE approximation is rejected by assertion (2)', () => {
        // 8 steps around the bbox — the "finer rectangles" answer C86 §10.1 forbids. Its outline
        // pokes INSIDE the circle at the step corners, so the ring sample finds material.
        const steps: OutlinePoint[] = [];
        const n = 8;
        for (let i = 0; i < n; i++) {
            const t0 = (Math.PI * 2 * i) / n;
            const t1 = (Math.PI * 2 * (i + 1)) / n;
            // chord endpoints pulled OUTWARD to the secant box — a coarse, visibly-faceted ring
            steps.push({ x: cx + (D / 2) * Math.cos(t0), y: cy + (D / 2) * Math.sin(t0) });
            steps.push({ x: cx + (D / 2) * Math.cos((t0 + t1) / 2) * 0.72, y: cy + (D / 2) * Math.sin((t0 + t1) / 2) * 0.72 });
        }
        const staircase: OpeningOutline = {
            kind: 'circular', isRectangular: false,
            bbox: { x0: OFF, x1: OFF + D, y0: SILL, y1: SILL + D },
            points: steps,
        };
        const g = buildOpeningProfileGasket(staircase, Z_BACK, Z_FRONT, 0)!;
        let violations = 0;
        for (let i = 0; i < 64; i++) {
            const t = (Math.PI * 2 * i) / 64;
            const r = D / 2 - ARC_SAG_TOLERANCE_M - 1e-4;
            if (solidAt(g, cx + r * Math.cos(t), cy + r * Math.sin(t), Z_FRONT)) violations++;
        }
        expect(violations, 'a faceted ring MUST intrude into the circle and be caught').toBeGreaterThan(0);
        g.dispose();
    });

    it('the REAL circle passes the same sampling the staircase fails — the control is live', () => {
        const real = openingOutline({ profile: 'circular', offset: OFF, width: D, height: D, sillHeight: SILL })!;
        const g = buildOpeningProfileGasket(real, Z_BACK, Z_FRONT, 0)!;
        let violations = 0;
        for (let i = 0; i < 64; i++) {
            const t = (Math.PI * 2 * i) / 64;
            const r = D / 2 - ARC_SAG_TOLERANCE_M - 1e-4;
            if (solidAt(g, cx + r * Math.cos(t), cy + r * Math.sin(t), Z_FRONT)) violations++;
        }
        expect(violations).toBe(0);
        g.dispose();
    });
});
