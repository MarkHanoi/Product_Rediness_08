// §WALL-RAKE-JOINT (ADR-0312) — the twin-solve loft: joints between raked walls.
//
// What is pinned here and nowhere else:
//   1. CLOSURE. At an L-joint the two walls' TOP corners coincide — for equal
//      rakes, DIFFERENT rakes, and raked-meets-VERTICAL — because every mitred
//      corner is lofted along the true 3-D mitre line (the intersection of the
//      two sheared face planes).
//   2. EXACTNESS. The lofted corner matches the closed-form edge-line
//      intersection at the top elevation, not merely "the gap got smaller".
//   3. LINEARITY. The mitre line is straight: a wall of height h drifts exactly
//      (h/h') of a wall of height h' at the same joint.
//   4. THE OLD GAP. With the loft suppressed (explicit uniform topOffset — the
//      ADR-0310 behaviour) the same joint measurably OPENS at the top. This test
//      is the proof the feature does something.
//   5. HONEST DEGRADATION. Invalid per-vertex input to the extruder is IGNORED
//      (uniform fallback), never a throw. A vertical-only level skips the probe
//      solve and produces bit-identical buffers.
//   6. INVALIDATION. `rakeJointSignature` is empty on an unraked level, moves
//      when any wall's rake moves, and is order-independent — the fragment
//      cache-key ingredient for the L-813 bug class.

import { describe, it, expect } from 'vitest';
import {
    WallPipelineV2Cache,
    buildWallV2Geometry,
    type LevelWallSpec,
} from '../src/WallPipelineV2';
import { buildWallFootprint } from '../src/WallFootprint2D';
import { buildWallExtrusion } from '../src/WallPolygonExtruder';
import { rakeShearPerMetre } from '../src/WallRake';
import type { WallInput } from '../src/JunctionResolverV2';

const T = 0.2;          // thickness
const H = 3;            // default height
const COT80 = rakeShearPerMetre(80);   // ≈ +0.17633 — pinned by WallRake.test.ts

/** Wall A along +X from the origin; Wall B along +Z from the origin (a plain L). */
function lPair(rakeA?: number, rakeB?: number): LevelWallSpec[] {
    return [
        { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 4, z: 0 }, thickness: T, rakeAngleDeg: rakeA },
        { id: 'B', startXZ: { x: 0, z: 0 }, endXZ: { x: 0, z: 4 }, thickness: T, rakeAngleDeg: rakeB },
    ];
}

function cacheOf(walls: readonly LevelWallSpec[]): WallPipelineV2Cache {
    const c = new WallPipelineV2Cache();
    c.refresh(walls);
    return c;
}

/** Unique top-ring plan positions of an extruded wall (vertices at y ≈ yTop). */
function topRing(geometry: { getAttribute(n: string): { array: ArrayLike<number> } }, yTop: number): Array<{ x: number; z: number }> {
    const pos = geometry.getAttribute('position').array;
    const out: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < pos.length; i += 3) {
        if (Math.abs((pos[i + 1] as number) - yTop) > 1e-9) continue;
        const x = pos[i] as number, z = pos[i + 2] as number;
        if (!out.some(p => Math.hypot(p.x - x, p.z - z) < 1e-9)) out.push({ x, z });
    }
    return out;
}

function hasPoint(ring: ReadonlyArray<{ x: number; z: number }>, x: number, z: number, tol = 1e-6): boolean {
    return ring.some(p => Math.hypot(p.x - x, p.z - z) <= tol);
}

/** Smallest distance from each of `a`'s points to `b` — 0-ish everywhere means the rings share those corners. */
function minDist(ring: ReadonlyArray<{ x: number; z: number }>, x: number, z: number): number {
    return Math.min(...ring.map(p => Math.hypot(p.x - x, p.z - z)));
}

// ─── 1+2. Closure and exactness ───────────────────────────────────────────────

describe('§WALL-RAKE-JOINT — an L-joint closes at the TOP, not only at the floor', () => {
    it('raked (80°) meets VERTICAL: the vertical wall\'s shared corners travel to meet the leaning wall', () => {
        const walls = lPair(80, undefined);
        const cache = cacheOf(walls);
        const A = buildWallV2Geometry(walls[0]!, cache, { height: H });
        const B = buildWallV2Geometry(walls[1]!, cache, { height: H });

        const ringA = topRing(A.geometry, H);
        const ringB = topRing(B.geometry, H);

        // Closed form. A's edge lines at elevation y: z = ±T/2 + y·cot80 (its shear is
        // +Z·cot80). B's edge lines are vertical planes x = ±T/2. Shared corners at y=3:
        const d = H * COT80;                       // ≈ 0.52898 — the ADR-0310 worked example
        expect(hasPoint(ringA,  T / 2,  T / 2 + d)).toBe(true);   // outer corner (0.1, 0.1+d)
        expect(hasPoint(ringA, -T / 2, -T / 2 + d)).toBe(true);   // inner corner (−0.1, −0.1+d)
        expect(hasPoint(ringB,  T / 2,  T / 2 + d)).toBe(true);   // the SAME points on the VERTICAL wall
        expect(hasPoint(ringB, -T / 2, -T / 2 + d)).toBe(true);

        // And the loft actually reports its drift for the spike-guard budget.
        expect(A.maxTopDriftM).toBeGreaterThan(d - 1e-6);
        expect(B.maxTopDriftM).toBeGreaterThan(0.4);   // the vertical wall REALLY moved
    });

    it('EQUAL rakes (80°/80°): both walls shear differently in plan (different left normals) and still share corners', () => {
        const walls = lPair(80, 80);
        const cache = cacheOf(walls);
        const ringA = topRing(buildWallV2Geometry(walls[0]!, cache, { height: H }).geometry, H);
        const ringB = topRing(buildWallV2Geometry(walls[1]!, cache, { height: H }).geometry, H);

        // A shears +Z·cot80; B (dir +Z, left = −X) shears −X·cot80. Edge lines at y:
        //   A: z = ±T/2 + y·cot80        B: x = ∓T/2 − y·cot80
        const d = H * COT80;
        expect(hasPoint(ringA,  T / 2 - d,  T / 2 + d)).toBe(true);
        expect(hasPoint(ringA, -T / 2 - d, -T / 2 + d)).toBe(true);
        expect(hasPoint(ringB,  T / 2 - d,  T / 2 + d)).toBe(true);
        expect(hasPoint(ringB, -T / 2 - d, -T / 2 + d)).toBe(true);
    });

    it('DIFFERENT rakes (80°/100°): the shared corners still coincide within 1e-6', () => {
        const walls = lPair(80, 100);
        const cache = cacheOf(walls);
        const ringA = topRing(buildWallV2Geometry(walls[0]!, cache, { height: H }).geometry, H);
        const ringB = topRing(buildWallV2Geometry(walls[1]!, cache, { height: H }).geometry, H);

        // A: z = ±T/2 + y·cot80.  B at 100°: shear = cot(100°)·leftPerp(0,1) =
        // (−cot80)·(−1,0) = +X·cot80 ⇒ x = ±T/2 + y·cot80.
        const d = H * COT80;
        expect(hasPoint(ringA,  T / 2 + d,  T / 2 + d)).toBe(true);
        expect(hasPoint(ringB,  T / 2 + d,  T / 2 + d)).toBe(true);
        expect(hasPoint(ringA, -T / 2 + d, -T / 2 + d)).toBe(true);
        expect(hasPoint(ringB, -T / 2 + d, -T / 2 + d)).toBe(true);
    });
});

// ─── 3. Linearity — the mitre line is straight ────────────────────────────────

describe('§WALL-RAKE-JOINT — different heights sample the SAME straight mitre line', () => {
    it('a 2 m vertical wall drifts exactly 2/3 of a 3 m one at the same joint', () => {
        const walls = lPair(80, undefined);
        const cache = cacheOf(walls);
        const fpB = buildWallFootprint(
            { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 4 }, thickness: T } as WallInput,
            cache.getMiter('B'),
        );
        const off3 = cache.rakedTopOffsets('B', fpB, 3)!;
        const off2 = cache.rakedTopOffsets('B', fpB, 2)!;
        expect(off3).not.toBeNull();
        expect(off2).not.toBeNull();
        expect(off2.length).toBe(off3.length);
        for (let i = 0; i < off3.length; i++) {
            expect(off2[i]!.x).toBeCloseTo(off3[i]!.x * (2 / 3), 9);
            expect(off2[i]!.z).toBeCloseTo(off3[i]!.z * (2 / 3), 9);
        }
    });

    it('an ISOLATED raked wall lofts identically to the ADR-0310 uniform shear (no joint ⇒ no difference)', () => {
        const solo: LevelWallSpec[] = [
            { id: 'S', startXZ: { x: 0, z: 0 }, endXZ: { x: 4, z: 0 }, thickness: T, rakeAngleDeg: 80 },
        ];
        const cache = cacheOf(solo);
        const fp = buildWallFootprint(
            { id: 'S', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T } as WallInput,
            cache.getMiter('S'),
        );
        const offs = cache.rakedTopOffsets('S', fp, H)!;
        expect(offs).not.toBeNull();
        const d = H * COT80;
        for (const o of offs) {
            expect(o.x).toBeCloseTo(0, 9);
            expect(o.z).toBeCloseTo(d, 9);
        }
    });
});

// ─── 4. The pre-ADR-0312 gap, demonstrated ────────────────────────────────────

describe('§WALL-RAKE-JOINT — the ADR-0310 uniform shear provably left this joint OPEN', () => {
    it('with the loft suppressed, the vertical wall misses the raked wall\'s top corner by ~0.5 m', () => {
        const walls = lPair(80, undefined);
        const cache = cacheOf(walls);
        // Old behaviour for B: explicit topOffset (null = stay vertical) suppresses the loft.
        const oldB = buildWallV2Geometry(walls[1]!, cache, { height: H, topOffset: null });
        const ringOldB = topRing(oldB.geometry, H);
        const d = H * COT80;
        const gap = minDist(ringOldB, T / 2, T / 2 + d);   // where A's top corner actually is
        expect(gap).toBeGreaterThan(0.4);                  // the founder's wedge, measured

        // And the loft closes the same measurement to ~0.
        const newB = buildWallV2Geometry(walls[1]!, cache, { height: H });
        expect(minDist(topRing(newB.geometry, H), T / 2, T / 2 + d)).toBeLessThan(1e-6);
    });
});

// ─── 5. Honest degradation ────────────────────────────────────────────────────

describe('§WALL-RAKE-JOINT — degradation is graceful and vertical levels are untouched', () => {
    it('a vertical-only level: no probe solve, null offsets, bit-identical buffers', () => {
        const walls = lPair(undefined, undefined);
        const cache = cacheOf(walls);
        expect(cache.hasRake).toBe(false);
        const fpA = buildWallFootprint(
            { id: 'A', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T } as WallInput,
            cache.getMiter('A'),
        );
        expect(cache.rakedTopOffsets('A', fpA, H)).toBeNull();

        const viaPipeline = buildWallV2Geometry(walls[0]!, cache, { height: H });
        const direct = buildWallExtrusion(fpA, { height: H });
        expect(Array.from(viaPipeline.geometry.getAttribute('position').array as Float32Array))
            .toEqual(Array.from(direct.getAttribute('position').array as Float32Array));
        expect(viaPipeline.maxTopDriftM).toBe(0);
    });

    it('the extruder IGNORES a mis-sized topOffsets array (uniform fallback, never a throw)', () => {
        const fp = buildWallFootprint(
            { id: 'w', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T } as WallInput,
            null,
        );
        const uniform = buildWallExtrusion(fp, { height: H, topOffset: { x: 0, z: 0.5 } });
        const badLen = buildWallExtrusion(fp, {
            height: H,
            topOffset: { x: 0, z: 0.5 },
            topOffsets: [{ x: 0, z: 0.5 }],                        // wrong length (1 ≠ 4)
        });
        const badNaN = buildWallExtrusion(fp, {
            height: H,
            topOffset: { x: 0, z: 0.5 },
            topOffsets: [
                { x: 0, z: 0.5 }, { x: 0, z: 0.5 }, { x: Number.NaN, z: 0.5 }, { x: 0, z: 0.5 },
            ],
        });
        const u = Array.from(uniform.getAttribute('position').array as Float32Array);
        expect(Array.from(badLen.getAttribute('position').array as Float32Array)).toEqual(u);
        expect(Array.from(badNaN.getAttribute('position').array as Float32Array)).toEqual(u);
    });

    it('valid per-vertex offsets equal to the uniform shear reproduce the uniform build exactly', () => {
        const fp = buildWallFootprint(
            { id: 'w', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: T } as WallInput,
            null,
        );
        const uniform = buildWallExtrusion(fp, { height: H, topOffset: { x: 0, z: 0.5 } });
        const perVertex = buildWallExtrusion(fp, {
            height: H,
            topOffsets: fp.polygon.map(() => ({ x: 0, z: 0.5 })),
        });
        expect(Array.from(perVertex.getAttribute('position').array as Float32Array))
            .toEqual(Array.from(uniform.getAttribute('position').array as Float32Array));
    });
});

// ─── 6. Invalidation — the L-813 bug class ────────────────────────────────────

describe('§WALL-RAKE-JOINT — rakeJointSignature (the neighbour-rake cache-key fragment)', () => {
    it('is EMPTY on an unraked level (keys stay byte-identical to the pre-ADR-0312 build)', () => {
        expect(cacheOf(lPair(undefined, undefined)).rakeJointSignature).toBe('');
        expect(cacheOf(lPair(90, 90)).rakeJointSignature).toBe('');
    });

    it('moves when ANY wall\'s rake moves — including a NEIGHBOUR\'s', () => {
        const a = cacheOf(lPair(80, undefined)).rakeJointSignature;
        const b = cacheOf(lPair(70, undefined)).rakeJointSignature;
        const c = cacheOf(lPair(80, 80)).rakeJointSignature;
        expect(a).not.toBe('');
        expect(b).not.toBe(a);
        expect(c).not.toBe(a);
    });

    it('is order-independent across refresh input order', () => {
        const walls = lPair(80, 100);
        const fwd = cacheOf(walls).rakeJointSignature;
        const rev = cacheOf([walls[1]!, walls[0]!]).rakeJointSignature;
        expect(fwd).toBe(rev);
    });
});

// ─── T-junction sanity — the loft holds beyond the L ──────────────────────────

describe('§WALL-RAKE-JOINT — a raked guest teeing into a vertical host stays attached at the top', () => {
    it('the guest\'s butt corners land on the host\'s face at EVERY elevation', () => {
        // Host along +X through the origin; raked guest arrives from +Z onto the host's body.
        const walls: LevelWallSpec[] = [
            { id: 'H', startXZ: { x: -3, z: 0 }, endXZ: { x: 3, z: 0 }, thickness: T },
            { id: 'G', startXZ: { x: 0, z: 3 }, endXZ: { x: 0, z: T / 2 }, thickness: T, rakeAngleDeg: 80 },
        ];
        const cache = cacheOf(walls);
        const G = buildWallV2Geometry(walls[1]!, cache, { height: H });
        // The guest's shear: dir (0,−1) ⇒ leftPerp (1,0) ⇒ top drifts +X·cot80. Its butt
        // corners sit on the host's near face z = +T/2 (a VERTICAL plane, host unraked) —
        // and must STAY on it at the top: same z, only x drifts.
        const ring = topRing(G.geometry, H);
        const onFace = ring.filter(p => Math.abs(p.z - T / 2) < 1e-6);
        expect(onFace.length).toBeGreaterThanOrEqual(2);
        const d = H * COT80;
        expect(onFace.some(p => Math.abs(p.x - ( T / 2 + d)) < 1e-6)).toBe(true);
        expect(onFace.some(p => Math.abs(p.x - (-T / 2 + d)) < 1e-6)).toBe(true);
    });
});
