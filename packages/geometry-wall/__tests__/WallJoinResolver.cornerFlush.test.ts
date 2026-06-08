/**
 * §PASS-THROUGH-FLUSH + corner-flush regression (A.21.D40 — WALL-JOINS mitre quality)
 *
 * Field report: wall corners "not cleanly joined" (gaps / overlaps) in plan AND 3D,
 * intermittent, with `[WallJoinResolver] §MULTI-CLUSTER cluster: 3 endpoints @ (x,y)
 * [primary=2 t-into=1 …]` during generation.
 *
 * Root cause: a 3-endpoint cluster that is really a T-JUNCTION — two near-collinear
 * walls pass straight through and a third (stem) attaches — was being resolved as an
 * L-corner: the most-perpendicular pinned pair got a 45° bisector miter while the
 * stem was T-attached (square). The bisector pulls the through-wall's OUTER cap back
 * off the junction line, opening a triangular gap on the outside of the T (and an
 * overlap inside). A bisector miter is only valid when EXACTLY two walls bound the
 * corner sector; a collinear pass-through invalidates it.
 *
 * Fix (WallJoinResolver.ts §PASS-THROUGH-FLUSH): when a cluster contains a
 * near-collinear pass-through pair (|tangent·tangent| ≥ cos(~10°)), resolve the WHOLE
 * cluster with SQUARE (perpendicular) end caps trimmed to the consensus point — the
 * file's stated watertight doctrine for 3+ junctions. The through-walls then meet
 * flush along ONE plane and the stem butts cleanly against their bodies. Square caps
 * (null MN) are stable + cacheable, so the §rebuildWallBodies cached-miter path
 * (ground-walls-stay-put) is unaffected.
 *
 * These tests assert the CAP-CORNER geometry (the actual outer/inner cap vertices the
 * MiterPrismBuilder will emit) so they catch gaps/overruns numerically — not just the
 * baseline/MN bookkeeping.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(
    start: [number, number],
    end: [number, number],
    thickness: number,
    createdAt?: number,
): WallData {
    const id = `wall_cf_${_seq++}`;
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: createdAt != null ? { createdAt } : undefined,
    } as any;
}

/**
 * Replicate the MiterPrismBuilder cap projection to obtain the two cap-corner
 * points (outer / inner) at one side of a wall, in world XZ. This is what actually
 * renders, so it is the right thing to assert against for gap/overrun detection.
 */
function capCorners(
    jd: any, side: 'start' | 'end', thickness: number,
): { outer: THREE.Vector3; inner: THREE.Vector3 } {
    const [s, e] = jd.baseLine as [THREE.Vector3, THREE.Vector3];
    const wallDir = new THREE.Vector3(e.x - s.x, 0, e.z - s.z).normalize();
    const outward = new THREE.Vector3(-wallDir.z, 0, wallDir.x);
    const half = thickness / 2;
    const P = side === 'start' ? s : e;
    const mn = side === 'start' ? jd.startMN : jd.endMN;
    const proj = (sign: number): THREE.Vector3 => {
        const base = new THREE.Vector3(
            P.x + outward.x * sign * half, 0, P.z + outward.z * sign * half,
        );
        if (!mn) return base;
        const mnDotDir = mn.nx * wallDir.x + mn.nz * wallDir.z;
        if (Math.abs(mnDotDir) < 1e-9) return base;
        const dx = P.x - base.x, dz = P.z - base.z;
        const t = (mn.nx * dx + mn.nz * dz) / mnDotDir;
        return new THREE.Vector3(base.x + t * wallDir.x, 0, base.z + t * wallDir.z);
    };
    return { outer: proj(+1), inner: proj(-1) };
}

const EPS = 5e-3; // 5 mm tolerance (the design uses a 1 mm butt epsilon)

function near(a: THREE.Vector3, b: THREE.Vector3, eps = EPS): boolean {
    return Math.hypot(a.x - b.x, a.z - b.z) <= eps;
}

describe('WallJoinResolver — flush L-corner (2-wall, same thickness)', () => {
    it('two same-thickness walls form a clean shared bisector miter (caps coincide)', () => {
        const a = mk([0, 0], [4, 0], 0.2, 1);   // horiz, joins at end (4,0)
        const b = mk([4, 0], [4, 3], 0.2, 2);   // vert,  joins at start (4,0)
        const res = WallJoinResolver.resolveLevel([a, b]);

        const ja = res.get(a.id)!;
        const jb = res.get(b.id)!;
        expect(ja.invalid).toBeFalsy();
        expect(jb.invalid).toBeFalsy();
        // A mitered (non-square) corner: both ends carry a miter normal.
        expect(ja.endMN).toBeTruthy();
        expect(jb.startMN).toBeTruthy();

        // The two cap planes are the SAME plane → the cap corners coincide pairwise.
        const aEnd = capCorners(ja, 'end', a.thickness);
        const bStart = capCorners(jb, 'start', b.thickness);
        // a.outer (away from b) must meet b.outer; a.inner (the reflex corner) meets b.inner.
        const aCorners = [aEnd.outer, aEnd.inner];
        const bCorners = [bStart.outer, bStart.inner];
        for (const ac of aCorners) {
            expect(bCorners.some(bc => near(ac, bc))).toBe(true);
        }
        // The shared miter corners stay anchored to the junction at (4,0): the OUTER
        // corner is the convex 45° point (4 - half, 0 + half) = (3.9, 0.1) and the
        // INNER corner is the reflex point (4 + half, -half) = (4.1, -0.1). Both lie
        // exactly on the miter plane through (4,0) — i.e. no drift away from the join.
        const outerExpected = new THREE.Vector3(3.9, 0, 0.1);
        const innerExpected = new THREE.Vector3(4.1, 0, -0.1);
        expect(aCorners.some(c => near(c, outerExpected))).toBe(true);
        expect(aCorners.some(c => near(c, innerExpected))).toBe(true);
    });
});

describe('WallJoinResolver — flush T-junction (§PASS-THROUGH-FLUSH)', () => {
    it('collinear pass-through + perpendicular stem → flush square caps, no gap/overrun', () => {
        const a = mk([0, 0], [4, 0], 0.2, 1);   // through-wall left half, end (4,0)
        const b = mk([4, 0], [4, 3], 0.2, 2);   // stem, start (4,0)
        const c = mk([4, 0], [7, 0], 0.2, 3);   // through-wall right half, start (4,0)
        const res = WallJoinResolver.resolveLevel([a, b, c]);

        const ja = res.get(a.id)!, jb = res.get(b.id)!, jc = res.get(c.id)!;
        for (const j of [ja, jb, jc]) expect(j.invalid).toBeFalsy();

        // Through-walls keep their SQUARE caps (no bisector miter pulling them off).
        expect(ja.endMN).toBeNull();
        expect(jc.startMN).toBeNull();
        expect(jb.startMN).toBeNull();

        // The two through-wall caps coincide exactly along the junction plane x=4.
        const aEnd = capCorners(ja, 'end', a.thickness);
        const cStart = capCorners(jc, 'start', c.thickness);
        expect(aEnd.outer.x).toBeCloseTo(4, 3);
        expect(cStart.outer.x).toBeCloseTo(4, 3);
        // a and c outer/inner span the same z-range → through-wall is continuous, no gap.
        expect(near(aEnd.outer, cStart.outer)).toBe(true);
        expect(near(aEnd.inner, cStart.inner)).toBe(true);

        // Stem's cap sits ON the through-wall centre line (z=0) and within its body
        // (x within [4-half, 4+half]) → butts flush, no overhang past the through-wall.
        const bStart = capCorners(jb, 'start', b.thickness);
        for (const c2 of [bStart.outer, bStart.inner]) {
            expect(c2.z).toBeCloseTo(0, 3);
            expect(c2.x).toBeGreaterThanOrEqual(4 - 0.1 - EPS);
            expect(c2.x).toBeLessThanOrEqual(4 + 0.1 + EPS);
        }
    });

    it('a genuine Y-junction (no collinear pair, ~120°) is NOT forced to square caps', () => {
        // Three walls radiating at ~120° — no pass-through, so the existing
        // primary-corner + T-into behaviour is preserved (mitres, not all-square).
        const a = mk([4, 0], [1, 0], 0.2, 1);
        const b = mk([4, 0], [5.5, 2.6], 0.2, 2);
        const c = mk([4, 0], [5.5, -2.6], 0.2, 3);
        const res = WallJoinResolver.resolveLevel([a, b, c]);
        // At least one wall must carry a miter normal at the junction (not all square),
        // proving the pass-through branch did not hijack a true Y.
        const anyMiter =
            !!res.get(a.id)?.endMN || !!res.get(b.id)?.startMN || !!res.get(c.id)?.startMN;
        expect(anyMiter).toBe(true);
        for (const [, j] of res) expect(j.invalid).toBeFalsy();
    });
});

describe('WallJoinResolver — diff-thickness butt L-corner', () => {
    it('thick horizontal + thin vertical: thin wall butts just inside the thick face', () => {
        const a = mk([0, 0], [4, 0], 0.3, 1);   // thick (0.3), end (4,0)
        const b = mk([4, 0], [4, 3], 0.1, 2);   // thin  (0.1), start (4,0)
        const res = WallJoinResolver.resolveLevel([a, b]);

        const ja = res.get(a.id)!, jb = res.get(b.id)!;
        expect(ja.invalid).toBeFalsy();
        expect(jb.invalid).toBeFalsy();

        // Thick wall is NOT extended past the join — its end stays at x=4 (sharedPt).
        expect(ja.baseLine[1].x).toBeCloseTo(4, 3);
        // Thin wall's joining (start) endpoint is laterally offset so its cap sits
        // just INSIDE the thick wall's +z face (z = 0.15): butt with ~1 mm overlap.
        const subStartZ = jb.baseLine[0].z;
        expect(subStartZ).toBeGreaterThan(0.13);   // moved off the raw corner z=0
        expect(subStartZ).toBeLessThan(0.15);       // but inside the thick face (0.15)
        // Thin wall is only lightly trimmed — not collapsed.
        expect(jb.baseLine[0].distanceTo(jb.baseLine[1])).toBeGreaterThan(2.5);

        // Thin wall's start cap must lie within the thick wall's x-extent (no overrun).
        const bCap = capCorners(jb, 'start', b.thickness);
        for (const c of [bCap.outer, bCap.inner]) {
            expect(c.x).toBeGreaterThanOrEqual(4 - 0.05 - EPS);
            expect(c.x).toBeLessThanOrEqual(4 + 0.05 + EPS);
        }
    });

    it('reversed (thin horizontal + thick vertical): thin wall ends just inside the thick face', () => {
        const a = mk([0, 0], [4, 0], 0.1, 1);   // thin (0.1), end (4,0)
        const b = mk([4, 0], [4, 3], 0.3, 2);   // thick (0.3), start (4,0)
        const res = WallJoinResolver.resolveLevel([a, b]);

        const ja = res.get(a.id)!, jb = res.get(b.id)!;
        expect(ja.invalid).toBeFalsy();
        expect(jb.invalid).toBeFalsy();

        // Thick wall keeps its endpoint at the corner (x=4, z=0), square cap.
        expect(jb.baseLine[0].x).toBeCloseTo(4, 3);
        expect(jb.baseLine[0].z).toBeCloseTo(0, 3);
        // Thin wall's end is pulled back to just inside the thick wall's near (-x) face
        // at x = 4 - 0.15 = 3.85 (with 1 mm overlap → ~3.851).
        expect(ja.baseLine[1].x).toBeGreaterThan(3.84);
        expect(ja.baseLine[1].x).toBeLessThan(3.86);
        expect(ja.baseLine[0].distanceTo(ja.baseLine[1])).toBeGreaterThan(3.5);
    });
});
