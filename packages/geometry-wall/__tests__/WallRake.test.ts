// §WALL-RAKE — the foundation suite.
//
// Three things are pinned here and nowhere else:
//   1. THE SIGN CONVENTION. If someone "fixes" the sign, these fail loudly with a
//      worked example rather than shipping every raked wall leaning the wrong way.
//   2. THE VERTICAL INVARIANT. A 90° (or absent) rake must produce the EXACT same
//      buffer as before the feature existed — not "close", identical.
//   3. THE REFUSALS. Curve / layers / hosted openings × rake are rejected, because
//      the geometry for those does not exist yet (C65 §3.9).

import { describe, it, expect } from 'vitest';
import {
    RAKE_VERTICAL_DEG, RAKE_MIN_DEG, RAKE_MAX_DEG,
    resolveRakeDeg, isVerticalRake, isRakeInRange,
    rakeShearPerMetre, rakeTopOffset, rakeLateralShift,
    perpendicularThickness, rakeAuthorability,
} from '../src/WallRake';
import { buildWallFootprint } from '../src/WallFootprint2D';
import { buildWallExtrusion, expectedVertexCount } from '../src/WallPolygonExtruder';
import type { WallInput } from '../src/JunctionResolverV2';

// A plain 4 m wall along +X, 0.2 m thick. Direction (1,0) ⇒ leftPerp (0,1) = +Z.
const WALL: WallInput = {
    id: 'w1',
    start: { x: 0, z: 0 },
    end:   { x: 4, z: 0 },
    thickness: 0.2,
};
const HEIGHT = 3;

function posOf(g: ReturnType<typeof buildWallExtrusion>): Float32Array {
    return g.getAttribute('position').array as Float32Array;
}
function normOf(g: ReturnType<typeof buildWallExtrusion>): Float32Array {
    return g.getAttribute('normal').array as Float32Array;
}

describe('§WALL-RAKE — defaults and the round-trip guarantee', () => {
    it('an absent rake IS 90° (this is what every pre-rake snapshot loads as)', () => {
        expect(resolveRakeDeg(undefined)).toBe(RAKE_VERTICAL_DEG);
        expect(resolveRakeDeg(null)).toBe(RAKE_VERTICAL_DEG);
        expect(resolveRakeDeg(Number.NaN)).toBe(RAKE_VERTICAL_DEG);
        expect(isVerticalRake(undefined)).toBe(true);
        expect(isVerticalRake(90)).toBe(true);
    });

    it('90° produces NO shear at all — the field is inert until an author sets it', () => {
        expect(rakeShearPerMetre(undefined)).toBe(0);
        expect(rakeShearPerMetre(90)).toBe(0);
        expect(rakeTopOffset(undefined, HEIGHT, { x: 1, z: 0 })).toBeNull();
        expect(rakeTopOffset(90, HEIGHT, { x: 1, z: 0 })).toBeNull();
        expect(rakeLateralShift(90, HEIGHT)).toBe(0);
    });

    it('a wall with no rake extrudes BIT-IDENTICALLY to the pre-rake builder', () => {
        // The pre-rake call signature had no `topOffset` at all. Passing it as
        // undefined / null / (0,0) must all land on the untouched original path.
        const fp = buildWallFootprint(WALL, null);
        const base   = posOf(buildWallExtrusion(fp, { height: HEIGHT }));
        const baseN  = normOf(buildWallExtrusion(fp, { height: HEIGHT }));
        for (const topOffset of [undefined, null, { x: 0, z: 0 }] as const) {
            const g = buildWallExtrusion(fp, { height: HEIGHT, topOffset });
            expect(Array.from(posOf(g))).toEqual(Array.from(base));
            expect(Array.from(normOf(g))).toEqual(Array.from(baseN));
        }
    });
});

describe('§WALL-RAKE — the sign convention, pinned by worked example', () => {
    // The doc comment in WallTypes/WallRake claims: 80° on a +X wall of height 3
    // displaces the top by +0.529 m in +Z (toward the LEFT). Prove exactly that.
    it('80° leans the top toward the wall LEFT (+Z for a +X wall)', () => {
        const off = rakeTopOffset(80, 3, { x: 1, z: 0 })!;
        expect(off).not.toBeNull();
        expect(off.x).toBeCloseTo(0, 12);
        expect(off.z).toBeCloseTo(3 * (Math.cos(80 * Math.PI / 180) / Math.sin(80 * Math.PI / 180)), 12);
        expect(off.z).toBeCloseTo(0.52898, 5);
        expect(off.z).toBeGreaterThan(0);          // ← LEFT. If this flips, walls lean wrong.
    });

    it('120° leans the top toward the wall RIGHT (−Z for a +X wall)', () => {
        const off = rakeTopOffset(120, 3, { x: 1, z: 0 })!;
        expect(off.z).toBeCloseTo(-1.73205, 5);
        expect(off.z).toBeLessThan(0);
    });

    it('"left" is the wall direction rotated CCW — reversing the wall flips the lean', () => {
        const fwd = rakeTopOffset(80, 3, { x: 1, z: 0 })!;
        const rev = rakeTopOffset(80, 3, { x: -1, z: 0 })!;
        expect(rev.z).toBeCloseTo(-fwd.z, 12);
    });

    it('the offset is independent of the direction vector length (it is normalised)', () => {
        const a = rakeTopOffset(70, 3, { x: 1, z: 0 })!;
        const b = rakeTopOffset(70, 3, { x: 17.5, z: 0 })!;
        expect(b.x).toBeCloseTo(a.x, 12);
        expect(b.z).toBeCloseTo(a.z, 12);
    });

    it('the lean scales linearly with height — it is a shear, not a rotation of the base', () => {
        const h1 = rakeTopOffset(80, 1, { x: 1, z: 0 })!;
        const h3 = rakeTopOffset(80, 3, { x: 1, z: 0 })!;
        expect(h3.z).toBeCloseTo(3 * h1.z, 12);
    });
});

describe('§WALL-RAKE — thickness semantics', () => {
    it('thickness stays HORIZONTAL; the perpendicular thickness is the derived one', () => {
        expect(perpendicularThickness(0.2, undefined)).toBe(0.2);
        expect(perpendicularThickness(0.2, 90)).toBe(0.2);
        // 80° ⇒ 0.2 · sin80° ≈ 0.19696 — thinner than authored, and that is why a
        // LAYERED wall (whose layers ARE authored perpendicular) refuses a rake.
        expect(perpendicularThickness(0.2, 80)).toBeCloseTo(0.19696, 5);
        expect(perpendicularThickness(0.2, 120)).toBeCloseTo(0.17321, 5);
    });

    it('the BASE footprint is untouched by the rake — that is what keeps junctions valid', () => {
        // buildWallFootprint never sees the rake; prove the plan polygon is the same
        // object shape a vertical wall produces, so the junction solve is unaffected.
        const fp = buildWallFootprint(WALL, null);
        const vertical = buildWallExtrusion(fp, { height: HEIGHT });
        const raked    = buildWallExtrusion(fp, {
            height: HEIGHT, topOffset: rakeTopOffset(80, HEIGHT, fp.direction),
        });
        const nBot = (fp.polygon.length - 2) * 3;   // bottom-fan vertex count
        const pv = posOf(vertical), pr = posOf(raked);
        // Bottom fan lives immediately after the top fan; compare it vertex-for-vertex.
        for (let i = nBot * 3; i < nBot * 6; i++) {
            expect(pr[i]).toBeCloseTo(pv[i]!, 12);
        }
    });
});

describe('§WALL-RAKE — the sheared extrusion', () => {
    const fp = buildWallFootprint(WALL, null);
    const off = rakeTopOffset(80, HEIGHT, fp.direction)!;
    const g = buildWallExtrusion(fp, { height: HEIGHT, topOffset: off });

    it('emits the same vertex count as a vertical wall (topology is unchanged)', () => {
        expect(posOf(g).length / 3).toBe(expectedVertexCount(fp.polygon.length));
    });

    it('every vertex is finite', () => {
        for (const v of posOf(g)) expect(Number.isFinite(v)).toBe(true);
        for (const v of normOf(g)) expect(Number.isFinite(v)).toBe(true);
    });

    it('the TOP face is displaced by exactly topOffset and stays HORIZONTAL', () => {
        const p = posOf(g);
        const nTopFan = (fp.polygon.length - 2) * 3;
        for (let i = 0; i < nTopFan; i++) {
            expect(p[i * 3 + 1]).toBeCloseTo(HEIGHT, 12);   // all top verts at yTop
        }
        // Top-face centroid − bottom-face centroid == topOffset, in XZ.
        const cen = (from: number, count: number): { x: number; z: number } => {
            let x = 0, z = 0;
            for (let i = from; i < from + count; i++) { x += p[i * 3]!; z += p[i * 3 + 2]!; }
            return { x: x / count, z: z / count };
        };
        const top = cen(0, nTopFan);
        const bot = cen(nTopFan, nTopFan);
        // Float32BufferAttribute — assert to single-precision, not double.
        expect(top.x - bot.x).toBeCloseTo(off.x, 5);
        expect(top.z - bot.z).toBeCloseTo(off.z, 5);
    });

    it('SIDE normals acquire a Y component — a raked face is not vertical', () => {
        const n = normOf(g);
        const sideStart = (fp.polygon.length - 2) * 6;      // after top+bottom fans
        let maxAbsY = 0;
        for (let i = sideStart; i < n.length / 3; i++) maxAbsY = Math.max(maxAbsY, Math.abs(n[i * 3 + 1]!));
        expect(maxAbsY).toBeGreaterThan(0.01);
    });

    it('every normal is unit length (the shear formula is normalised, not approximated)', () => {
        const n = normOf(g);
        for (let i = 0; i < n.length / 3; i++) {
            const L = Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!);
            expect(L).toBeCloseTo(1, 5);   // Float32 storage
        }
    });

    it('side normals still point OUTWARD — a sign slip here renders the wall inside-out', () => {
        // Identify each face by its BASE EDGE, never by an averaged vertex position:
        // under a rake the TOP of the −Z face sits at +Z, so a positional heuristic
        // picks the wrong face and "proves" the normal is inverted when it is not.
        // Side emission is 6 vertices per polygon edge, edges in polygon order.
        const n = normOf(g);
        const sideStart = (fp.polygon.length - 2) * 6;
        const poly = fp.polygon;
        let checkedPlusZ = false, checkedMinusZ = false;
        for (let e = 0; e < poly.length; e++) {
            const a = poly[e]!, b = poly[(e + 1) % poly.length]!;
            const v = sideStart + e * 6;             // first vertex of this edge's quad
            const nz = n[v * 3 + 2]!;
            const midZ = (a.z + b.z) / 2;
            if (Math.abs(a.z - b.z) > 1e-9) continue;   // an end cap, not a long face
            if (midZ > 0)  { expect(nz).toBeGreaterThan(0); checkedPlusZ  = true; }
            if (midZ < 0)  { expect(nz).toBeLessThan(0);    checkedMinusZ = true; }
        }
        expect(checkedPlusZ).toBe(true);
        expect(checkedMinusZ).toBe(true);
    });

    it('a 100° rake mirrors an 80° rake about the vertical', () => {
        // Compare DISPLACEMENT from the vertical build, not raw z: a top vertex sits at
        // (base_z + off_z), and base_z is ±halfThickness, so the raw coordinates of two
        // opposite rakes are not negatives of one another.
        const g90  = buildWallExtrusion(fp, { height: HEIGHT });
        const g80  = buildWallExtrusion(fp, { height: HEIGHT, topOffset: rakeTopOffset(80,  HEIGHT, fp.direction) });
        const g100 = buildWallExtrusion(fp, { height: HEIGHT, topOffset: rakeTopOffset(100, HEIGHT, fp.direction) });
        const p90 = posOf(g90), p80 = posOf(g80), p100 = posOf(g100);
        const nTopFan = (fp.polygon.length - 2) * 3;
        let sawNonZero = false;
        for (let i = 0; i < nTopFan; i++) {
            const d80  = p80[i * 3 + 2]!  - p90[i * 3 + 2]!;
            const d100 = p100[i * 3 + 2]! - p90[i * 3 + 2]!;
            expect(d100).toBeCloseTo(-d80, 5);
            if (Math.abs(d80) > 0.1) sawNonZero = true;
        }
        expect(sawNonZero).toBe(true);   // guard against a vacuous 0 === -0 pass
    });
});

describe('§WALL-RAKE — range and refusals (C65 §3.9: no affordance without an implementation)', () => {
    it('accepts the range it can actually build', () => {
        expect(isRakeInRange(RAKE_MIN_DEG)).toBe(true);
        expect(isRakeInRange(RAKE_MAX_DEG)).toBe(true);
        expect(isRakeInRange(80)).toBe(true);
        expect(isRakeInRange(120)).toBe(true);
    });

    it('REJECTS out-of-range angles rather than clamping them', () => {
        for (const bad of [0, 5, 14.9, 165.1, 180, 200, -30]) {
            const a = rakeAuthorability({ rakeAngleDeg: bad });
            expect(a.ok).toBe(false);
            expect(a.code).toBe('out-of-range');
        }
    });

    it('a VERTICAL wall is always authorable, whatever else it has', () => {
        expect(rakeAuthorability({}).ok).toBe(true);
        expect(rakeAuthorability({ rakeAngleDeg: 90, curve: {}, layers: [1, 2], openings: [1] }).ok).toBe(true);
        // ↑ the critical one: adding this field must never reject an existing wall.
    });

    it('REFUSES rake × curve — the shear direction varies along an arc', () => {
        const a = rakeAuthorability({ rakeAngleDeg: 80, curve: { control: { x: 0, y: 0, z: 0 }, segments: 16 } });
        expect(a.ok).toBe(false);
        expect(a.code).toBe('curved');
    });

    it('REFUSES rake × layered — layer thickness is authored perpendicular', () => {
        const a = rakeAuthorability({ rakeAngleDeg: 80, layers: [{}, {}] });
        expect(a.ok).toBe(false);
        expect(a.code).toBe('layered');
    });

    it('allows a single-layer stack — one layer is geometrically the plain wall', () => {
        expect(rakeAuthorability({ rakeAngleDeg: 80, layers: [{}] }).ok).toBe(true);
    });

    it('REFUSES rake × hosted openings — the carve is a vertical band (C15 §2)', () => {
        const a = rakeAuthorability({ rakeAngleDeg: 80, openings: [{ id: 'o1' }] });
        expect(a.ok).toBe(false);
        expect(a.code).toBe('hosted-openings');
    });

    it('every refusal carries a reason a UI can show — never a bare false', () => {
        for (const s of [
            { rakeAngleDeg: 400 },
            { rakeAngleDeg: 80, curve: {} },
            { rakeAngleDeg: 80, layers: [{}, {}] },
            { rakeAngleDeg: 80, openings: [{}] },
        ]) {
            const a = rakeAuthorability(s);
            expect(a.ok).toBe(false);
            expect(typeof a.reason).toBe('string');
            expect(a.reason!.length).toBeGreaterThan(20);
        }
    });
});
