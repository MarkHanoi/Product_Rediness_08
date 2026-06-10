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

describe('WallJoinResolver — §A.21.D61 perimeter corner stays flush when one wall has an opening', () => {
    // The no-window-side perimeter gap (A.21.D61): after window/door EXECUTION the
    // editor rebuilds ONLY the windowed wall's BODY from its cached JoinData
    // (WallRebuildCoordinator §rebuildWallBodies, D40), leaving its corner neighbour
    // untouched. That is correct ONLY if the resolver's miter for the windowed wall
    // is INVARIANT under adding an opening AND is the SAME plane its neighbour
    // already caches. This test pins both invariants at the resolver level — the
    // contract the editor's cached-miter body rebuild relies on. (The editor wiring
    // itself, _rebuildWallBodies, is verified in-browser per the A.21.D61 checklist.)
    function mkWithOpening(
        start: [number, number], end: [number, number], thickness: number, createdAt: number,
    ): WallData {
        const w = mk(start, end, thickness, createdAt);
        // A centred 0.9 m window — opening VALUES never feed the resolver, so the
        // resolved JoinData (trimmed baseline + miter normals) must be identical to
        // the no-opening wall's. resolveLevel does not read wall.openings at all.
        (w as any).openings = [{ id: 'op_d61', elementId: 'win_d61', type: 'window', offset: 2, width: 0.9, height: 1.2, sillHeight: 0.9 }];
        return w;
    }

    it('windowed wall + no-window neighbour resolve to the SAME shared miter plane (caps coincide)', () => {
        // Same-thickness L corner: horizontal wall carries a window, vertical does not.
        const windowed = mkWithOpening([0, 0], [4, 0], 0.2, 1);  // has a window, joins at end (4,0)
        const neighbour = mk([4, 0], [4, 3], 0.2, 2);            // NO opening, joins at start (4,0)
        const res = WallJoinResolver.resolveLevel([windowed, neighbour]);

        const jw = res.get(windowed.id)!;
        const jn = res.get(neighbour.id)!;
        expect(jw.invalid).toBeFalsy();
        expect(jn.invalid).toBeFalsy();
        // Both ends mitred (non-square) — the windowed wall is NOT left with a square cap.
        expect(jw.endMN).toBeTruthy();
        expect(jn.startMN).toBeTruthy();

        // The two cap planes are the SAME plane → cap corners coincide pairwise.
        // This is precisely what keeps the corner flush when the editor rebuilds only
        // the windowed wall's body (from jw) and leaves the neighbour rendered from jn.
        const wEnd = capCorners(jw, 'end', windowed.thickness);
        const nStart = capCorners(jn, 'start', neighbour.thickness);
        for (const wc of [wEnd.outer, wEnd.inner]) {
            expect([nStart.outer, nStart.inner].some(nc => near(wc, nc))).toBe(true);
        }
    });

    it('adding the opening does NOT change the resolved JoinData vs the plain wall', () => {
        // Resolve the SAME geometry twice — once with an opening on the horizontal
        // wall, once without — and assert the resolver output is identical for BOTH
        // walls. Proves the cached miter the editor reuses for the body-only rebuild
        // is the exact one a full rebuild would produce (no drift, no gap).
        const plainH = mk([0, 0], [4, 0], 0.2, 1);
        const plainV = mk([4, 0], [4, 3], 0.2, 2);
        const resPlain = WallJoinResolver.resolveLevel([plainH, plainV]);

        const openH = mkWithOpening([0, 0], [4, 0], 0.2, 1);
        const openV = mk([4, 0], [4, 3], 0.2, 2);
        const resOpen = WallJoinResolver.resolveLevel([openH, openV]);

        for (const [plain, open] of [[plainH, openH], [plainV, openV]] as const) {
            const jp = resPlain.get(plain.id)!;
            const jo = resOpen.get(open.id)!;
            // Trimmed baseline identical.
            expect(near(jp.baseLine[0] as any, jo.baseLine[0] as any)).toBe(true);
            expect(near(jp.baseLine[1] as any, jo.baseLine[1] as any)).toBe(true);
            // Miter normals identical (or both null).
            expect(!!jp.startMN).toBe(!!jo.startMN);
            expect(!!jp.endMN).toBe(!!jo.endMN);
            if (jp.endMN && jo.endMN) {
                expect(jp.endMN.nx).toBeCloseTo(jo.endMN.nx, 6);
                expect(jp.endMN.nz).toBeCloseTo(jo.endMN.nz, 6);
            }
            if (jp.startMN && jo.startMN) {
                expect(jp.startMN.nx).toBeCloseTo(jo.startMN.nx, 6);
                expect(jp.startMN.nz).toBeCloseTo(jo.startMN.nz, 6);
            }
        }
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

/**
 * §CONSENSUS-ON-CENTRELINE (2026-06-08 — THE keystone room-merge fix)
 *
 * At a 3+ wall interior junction where NO endpoint is pinned, the non-pinned
 * consensus-trim branch (WallJoinResolver.ts ~line 823) used to trim each joining
 * endpoint to the RAW averaged consensus — the centroid of the triangle of distinct
 * pairwise crossings. For walls whose endpoints are 0.05–0.45 m apart and not
 * mutually collinear, that consensus sits 25–40 mm OFF each wall's centreline, so
 * trimming to it ROTATES every wall about its fixed free end. The rotated baseLine
 * chord no longer lies on the room's true perimeter and RoomDetectionEngine leaks the
 * separate rooms together (the founder's merged Living/Kitchen/Dining/Hall blob).
 *
 * The fix trims to the perpendicular FOOT of the consensus on THAT wall's own
 * centreline instead — zero rotation, every wall stays exactly on-axis. The projected
 * joining ends still land close enough that _snapNearbyCorners(0.30) fuses them, so the
 * junction still seals. For a TRUE star (all centrelines crossing at one point) the
 * projection of consensus onto each centreline equals consensus → byte-identical to the
 * old behaviour, so genuine crossings are not regressed.
 *
 * These tests pin: (1) every trimmed joining end lies on its wall's ORIGINAL centreline
 * (the on-axis invariant — FAILS on the old raw-consensus code, 26–38 mm off); (2) the
 * trimmed ends stay within the _snapNearbyCorners fuse radius (the junction still seals);
 * (3) a genuine star is byte-identical to the true crossing (no regression).
 */
describe('WallJoinResolver — §CONSENSUS-ON-CENTRELINE', () => {
    // Perpendicular distance from `pt` to the infinite line through p0→p1, in XZ.
    // dist = |(pt - p0) × axisHat| (2D cross magnitude), axisHat = (p1-p0) normalized.
    function distToAxis(
        pt: THREE.Vector3, p0: [number, number], p1: [number, number],
    ): number {
        let ax = p1[0] - p0[0], az = p1[1] - p0[1];
        const len = Math.hypot(ax, az);
        ax /= len; az /= len;
        const dx = pt.x - p0[0], dz = pt.z - p0[1];
        return Math.abs(dx * az - dz * ax);   // |cross| with unit axis
    }

    it('on-axis: every trimmed joining end stays on its own wall centreline (no rotation)', () => {
        // Three same-thickness interior partition walls whose joining endpoints are
        // ~0.10 m apart, mutually NON-collinear and NOT pinned. Free ends are far from
        // the junction; join ends cluster near (-5.34, 14.0). This is the §MULTI-CLUSTER
        // primary=0 trimmed=3 case the keystone fix targets.
        // A: horizontal, join end at (-5.38, 14.05)   free end (-8, 14.05)
        // B: vertical,   join end at (-5.30, 14.12)   free end (-5.30, 11)
        // D: diagonal,   join end at (-5.34, 13.98)   free end (-4.0, 12.5)
        const A_FREE: [number, number] = [-8, 14.05],   A_JOIN: [number, number] = [-5.38, 14.05];
        const B_FREE: [number, number] = [-5.30, 11],   B_JOIN: [number, number] = [-5.30, 14.12];
        const D_FREE: [number, number] = [-4.0, 12.5],  D_JOIN: [number, number] = [-5.34, 13.98];

        const a = mk(A_FREE, A_JOIN, 0.2, 1);   // joins at END
        const b = mk(B_FREE, B_JOIN, 0.2, 2);   // joins at END
        const d = mk(D_FREE, D_JOIN, 0.2, 3);   // joins at END
        const res = WallJoinResolver.resolveLevel([a, b, d]);

        const ja = res.get(a.id)!, jb = res.get(b.id)!, jd = res.get(d.id)!;
        // (a) None invalid.
        for (const j of [ja, jb, jd]) expect(j.invalid).toBeFalsy();

        // (b) Each wall joins at its END (baseLine[1]); assert that resolved joining
        // endpoint lies on the wall's ORIGINAL (free→join) centreline.
        const aJoin = ja.baseLine[1] as THREE.Vector3;
        const bJoin = jb.baseLine[1] as THREE.Vector3;
        const dJoin = jd.baseLine[1] as THREE.Vector3;
        expect(distToAxis(aJoin, A_FREE, A_JOIN)).toBeLessThanOrEqual(1e-3);
        expect(distToAxis(bJoin, B_FREE, B_JOIN)).toBeLessThanOrEqual(1e-3);
        expect(distToAxis(dJoin, D_FREE, D_JOIN)).toBeLessThanOrEqual(1e-3);
    });

    it('seal: the three trimmed joining ends stay within _snapNearbyCorners(0.30) fuse radius', () => {
        const A_FREE: [number, number] = [-8, 14.05],   A_JOIN: [number, number] = [-5.38, 14.05];
        const B_FREE: [number, number] = [-5.30, 11],   B_JOIN: [number, number] = [-5.30, 14.12];
        const D_FREE: [number, number] = [-4.0, 12.5],  D_JOIN: [number, number] = [-5.34, 13.98];

        const a = mk(A_FREE, A_JOIN, 0.2, 1);
        const b = mk(B_FREE, B_JOIN, 0.2, 2);
        const d = mk(D_FREE, D_JOIN, 0.2, 3);
        const res = WallJoinResolver.resolveLevel([a, b, d]);

        const aJoin = res.get(a.id)!.baseLine[1] as THREE.Vector3;
        const bJoin = res.get(b.id)!.baseLine[1] as THREE.Vector3;
        const dJoin = res.get(d.id)!.baseLine[1] as THREE.Vector3;

        // All three mutually within 0.30 m → RoomDetectionEngine fuses them to one node.
        for (const [p, q] of [[aJoin, bJoin], [aJoin, dJoin], [bJoin, dJoin]] as const) {
            expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThanOrEqual(0.30);
        }
    });

    it('no-regression: a star whose centrelines all cross one point is byte-identical (consensus-trim path)', () => {
        // Three walls whose centrelines ALL pass through the crossing X=(0,10), with
        // join ends pulled a little (~0.10 m) back ALONG each centreline so they are
        // distinct, non-collinear and not pinned → they take the same §MULTI-CLUSTER
        // primary=0 trimmed=3 consensus-trim path as the on-axis test. Because every
        // centreline already passes through the crossing, the averaged consensus lies on
        // all three centrelines, so the on-centreline projection is the IDENTITY of the
        // raw consensus — the resolved joining ends equal the true crossing within 1e-3 m,
        // byte-identical to the old raw-consensus behaviour. (No primary/T-into pair is
        // chosen here, unlike the perfectly-coincident Y, so the trim branch is exercised.)
        const X: [number, number] = [0, 10];
        // Unit directions from X out to each free end; join end = X + 0.10*dir.
        const dirs: [number, number][] = [
            [-1, 0],                                   // due -x
            [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)],   // +60°
            [Math.cos(-Math.PI / 3), Math.sin(-Math.PI / 3)], // -60°
        ];
        const walls = dirs.map((d, i) => {
            const free: [number, number] = [X[0] + 3 * d[0], X[1] + 3 * d[1]];
            const join: [number, number] = [X[0] + 0.10 * d[0], X[1] + 0.10 * d[1]];
            return mk(free, join, 0.2, i + 1);   // joins at END
        });
        const res = WallJoinResolver.resolveLevel(walls);

        const cross = new THREE.Vector3(X[0], 0, X[1]);
        for (const w of walls) {
            const j = res.get(w.id)!;
            expect(j.invalid).toBeFalsy();
            expect(near(j.baseLine[1] as THREE.Vector3, cross, 1e-3)).toBe(true);
        }
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

        // §PERIMETER-CORNER-FILL (A.21.D53): at an L-corner the thick (dominant)
        // wall is EXTENDED along its own axis past the centreline crossing by
        // subordinateT/2 (= 0.1/2 = 0.05 → x = 4.05) so its square end cap reaches
        // the thin wall's far lateral face and backs the overhang — closing the
        // open outer-corner notch. (Pre-D53 it stopped square at x=4, leaving the
        // notch.) It is NOT pushed further: this is corner-fill, not wrap-around.
        expect(ja.baseLine[1].x).toBeCloseTo(4.05, 3);
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

        // §PERIMETER-CORNER-FILL: the convex OUTER corner must be CLOSED — the
        // thick wall's extended end cap (its outer corner) must coincide with the
        // thin wall's far outer cap corner. Thin t=0.1 → extension 0.05 → x=4.05;
        // thick t=0.3 → outer face z=0.15 → building outer corner (4.05, +0.15).
        const aEnd = capCorners(ja, 'end', a.thickness);   // thick wall end cap
        const buildingOuter = new THREE.Vector3(4.05, 0, 0.15);
        expect([aEnd.outer, aEnd.inner].some(c => near(c, buildingOuter))).toBe(true);
        expect([bCap.outer, bCap.inner].some(c => near(c, buildingOuter))).toBe(true);
    });

    it('reversed (thin horizontal + thick vertical): thin wall ends just inside the thick face', () => {
        const a = mk([0, 0], [4, 0], 0.1, 1);   // thin (0.1), end (4,0)
        const b = mk([4, 0], [4, 3], 0.3, 2);   // thick (0.3), start (4,0)
        const res = WallJoinResolver.resolveLevel([a, b]);

        const ja = res.get(a.id)!, jb = res.get(b.id)!;
        expect(ja.invalid).toBeFalsy();
        expect(jb.invalid).toBeFalsy();

        // §PERIMETER-CORNER-FILL (A.21.D53): the thick (dominant) wall extends its
        // joining endpoint past the corner along its own axis by subordinateT/2
        // (= 0.1/2 = 0.05 → z = -0.05) so its square cap backs the thin wall's
        // overhang and the south outer face is flush. (Pre-D53 it stayed at z=0.)
        expect(jb.baseLine[0].x).toBeCloseTo(4, 3);
        expect(jb.baseLine[0].z).toBeCloseTo(-0.05, 3);
        // Thin wall's end is pulled back to just inside the thick wall's near (-x) face
        // at x = 4 - 0.15 = 3.85 (with 1 mm overlap → ~3.851).
        expect(ja.baseLine[1].x).toBeGreaterThan(3.84);
        expect(ja.baseLine[1].x).toBeLessThan(3.86);
        expect(ja.baseLine[0].distanceTo(ja.baseLine[1])).toBeGreaterThan(3.5);
    });
});

/**
 * §PERIMETER-CORNER-FILL (A.21.D53 — residual perimeter-corner defect)
 *
 * The shell/perimeter corner where a thicker shell wall meets a thinner welded
 * partition (or a thinner shell segment) is a DIFF-THICKNESS L-CORNER. Before
 * D53 the dominant (thicker) wall stopped its square cap at the centreline
 * crossing (sharedPt), but the subordinate butts the dominant's NEAR lateral
 * face and so its body overhangs the dominant's end by subordinateT/2. That left
 * the convex OUTER quadrant of the corner filled by NEITHER wall — an open notch
 * (the "perimeter corners not always well done" field report).
 *
 * Fix: extend ONLY the dominant wall along its own axis past sharedPt by
 * subordinateT/2 so its square end cap reaches the subordinate's far lateral
 * face. The subordinate is unchanged (still butts the near face — no wrap-around).
 *
 * These tests assert the building OUTER corner is closed: the dominant's extended
 * outer cap corner coincides with the subordinate's far outer cap corner, for
 * BOTH thickness orderings and BOTH lateral approach sides of the partition.
 */
describe('WallJoinResolver — §PERIMETER-CORNER-FILL (diff-thickness L-corner)', () => {
    // Find the dominant cap corner nearest `pt`; assert it is within EPS — i.e.
    // the outer notch is closed (the dominant body reaches the building corner).
    function expectCornerClosed(
        domCap: { outer: THREE.Vector3; inner: THREE.Vector3 },
        subCap: { outer: THREE.Vector3; inner: THREE.Vector3 },
    ) {
        // Every sub cap corner that lies OUTSIDE the dominant's pre-extension end
        // plane must be matched by a dominant cap corner → no open notch.
        for (const sc of [subCap.outer, subCap.inner]) {
            const matched =
                near(sc, domCap.outer) || near(sc, domCap.inner);
            // At least the building-outer corner (the overhang tip) must match.
            if (matched) return;
        }
        // If neither sub corner matched a dominant corner, the notch is open.
        throw new Error(
            `outer-corner notch OPEN: dom=[${domCap.outer.x.toFixed(3)},${domCap.outer.z.toFixed(3)} | ` +
            `${domCap.inner.x.toFixed(3)},${domCap.inner.z.toFixed(3)}] ` +
            `sub=[${subCap.outer.x.toFixed(3)},${subCap.outer.z.toFixed(3)} | ` +
            `${subCap.inner.x.toFixed(3)},${subCap.inner.z.toFixed(3)}]`,
        );
    }

    it('thick shell (end) + thin partition (start, +z side): outer corner closed', () => {
        const shell = mk([0, 0], [4, 0], 0.3, 1);     // thick, joins at end (4,0)
        const part  = mk([4, 0], [4, 3], 0.2, 2);     // thin, goes +z, joins at start (4,0)
        const res = WallJoinResolver.resolveLevel([shell, part]);
        const js = res.get(shell.id)!, jp = res.get(part.id)!;
        expect(js.invalid).toBeFalsy();
        expect(jp.invalid).toBeFalsy();
        // Dominant extended to x = 4 + 0.2/2 = 4.1.
        expect(js.baseLine[1].x).toBeCloseTo(4.1, 3);
        const domCap = capCorners(js, 'end',   shell.thickness);
        const subCap = capCorners(jp, 'start', part.thickness);
        expectCornerClosed(domCap, subCap);
        // Concretely: the building outer corner is (4.1, +0.15) — both walls reach it.
        const outer = new THREE.Vector3(4.1, 0, 0.15);
        expect([domCap.outer, domCap.inner].some(c => near(c, outer))).toBe(true);
        expect([subCap.outer, subCap.inner].some(c => near(c, outer))).toBe(true);
    });

    it('thick shell (end) + thin partition (start, -z side): outer corner closed', () => {
        // Same shell, but the partition descends (-z) — exercises the OTHER lateral
        // approach side so the signFree + extension signs are independently covered.
        const shell = mk([0, 0], [4, 0], 0.3, 1);     // thick, joins at end (4,0)
        const part  = mk([4, 0], [4, -3], 0.2, 2);    // thin, goes -z, joins at start (4,0)
        const res = WallJoinResolver.resolveLevel([shell, part]);
        const js = res.get(shell.id)!, jp = res.get(part.id)!;
        expect(js.invalid).toBeFalsy();
        expect(jp.invalid).toBeFalsy();
        expect(js.baseLine[1].x).toBeCloseTo(4.1, 3);
        const domCap = capCorners(js, 'end',   shell.thickness);
        const subCap = capCorners(jp, 'start', part.thickness);
        expectCornerClosed(domCap, subCap);
        const outer = new THREE.Vector3(4.1, 0, -0.15);
        expect([domCap.outer, domCap.inner].some(c => near(c, outer))).toBe(true);
        expect([subCap.outer, subCap.inner].some(c => near(c, outer))).toBe(true);
    });

    it('same-thickness perimeter corner is UNAFFECTED (still bisector miter)', () => {
        // Regression guard: the fill path is diff-thickness-only. A same-thickness
        // shell corner must still produce the shared bisector miter (non-null MN),
        // NOT an extended square cap.
        const a = mk([0, 0], [4, 0], 0.2, 1);
        const b = mk([4, 0], [4, 3], 0.2, 2);
        const res = WallJoinResolver.resolveLevel([a, b]);
        const ja = res.get(a.id)!, jb = res.get(b.id)!;
        expect(ja.endMN).toBeTruthy();
        expect(jb.startMN).toBeTruthy();
        // Bisector path does NOT extend the wall — its end stays at the corner x=4.
        expect(ja.baseLine[1].x).toBeCloseTo(4, 3);
    });

    it('extending the dominant never collapses or NaNs a wall', () => {
        const shell = mk([0, 0], [4, 0], 0.3, 1);
        const part  = mk([4, 0], [4, 3], 0.2, 2);
        const res = WallJoinResolver.resolveLevel([shell, part]);
        for (const [, jd] of res) {
            expect(jd.invalid).toBeFalsy();
            const [s, e] = jd.baseLine;
            expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true);
            expect(Number.isFinite(e.x) && Number.isFinite(e.z)).toBe(true);
            expect(s.distanceTo(e)).toBeGreaterThan(0.5);
        }
    });
});

/**
 * §SHELL-ANCHOR-PRESERVE (2026-06-09 — founder room-merge fix)
 *
 * THE founder defect: the house-layout generator's OWN room detection reports 7
 * sealed ground-floor rooms, but after the walls are created in the editor the
 * EXECUTED model merges most of them into ONE 82.4 m² blob. The smoking gun:
 * every interior junction cluster logs `primary=0 t-into=0 pinned=0 trimmed=3`.
 *
 * Mechanism: weldPartitionsToShell snaps interior partition endpoints ONTO the
 * BODY (mid-span) of a long perimeter (shell) wall. The shell wall's OWN endpoints
 * are at its far corners, so the shell is NOT a member of the resolver cluster —
 * the cluster contains only the nearby PARTITION endpoints, none coincident (the
 * §WJ-SKEW-4 weld guard deliberately leaves short-room partitions unfused), so
 * pinned=0 → primary=0 → all members trim to the partition-only consensus. That
 * consensus is INTERIOR, so the trim drags the shell-anchored partition endpoint
 * OFF the perimeter → the room stops sealing → RoomDetectionEngine floods the gap.
 *
 * Fix: if a clustered endpoint sits on the BODY of a NON-cluster wall (the shell),
 * do NOT consensus-trim it — defer to the pair-wise T-join so it stays on the
 * perimeter. These tests assert the shell-anchored partition ends stay on the
 * shell line (z ≈ 0) instead of being pulled inward to the interior consensus.
 */
describe('WallJoinResolver — §SHELL-ANCHOR-PRESERVE (partition welded onto shell body)', () => {
    it('two partitions welded onto a long shell body, clustered but unfused, STAY on the shell', () => {
        // Long horizontal shell wall along z=0 (its endpoints at x=-10 and x=10 are
        // FAR from the interior junction → not cluster members).
        const shell = mk([-10, 0], [10, 0], 0.2, 1);
        // Two interior partitions rising from the shell BODY near x≈0. Their join
        // (start) endpoints were shell-snapped onto z=0 by the weld but left ~0.20 m
        // apart (unfused — within the resolver's snapRadius, so they CLUSTER, but
        // > 1 mm so they are NOT pinned). A third partition end nearby completes the
        // 3-way cluster signature.
        const pA = mk([-0.10, 3], [-0.10, 0.0], 0.2, 2);   // joins at end (-0.10, 0)
        const pB = mk([ 0.10, 3], [ 0.10, 0.0], 0.2, 3);   // joins at end ( 0.10, 0)
        const pC = mk([ 0.00, 4], [ 0.00, 0.05], 0.2, 4);  // joins at end ( 0.00, 0.05)

        const res = WallJoinResolver.resolveLevel([shell, pA, pB, pC], { snapRadius: 0.5 });

        // Shell is the perimeter — never moved, never invalidated. As the unchanged
        // HOST of a pure T-join it may carry NO result entry at all (host walls are
        // left untouched by _applyT); if it DOES carry one it must be valid + full-span.
        const jShell = res.get(shell.id);
        if (jShell) {
            expect(jShell.invalid).toBeFalsy();
            expect(jShell.baseLine[0].x).toBeCloseTo(-10, 3);
            expect(jShell.baseLine[1].x).toBeCloseTo(10, 3);
        }

        // Each partition's joining (end) endpoint must reach the shell — the
        // pair-wise T-join trims it to the shell's LATERAL FACE (z = ±halfThickness =
        // ±0.10 for the 0.2 m shell), NOT pulled INWARD to the interior consensus
        // (which sits at z ≈ 0.017 → after the cluster trim the partition would stop
        // at z ≈ 0.05+ short of the shell, opening the gap that merges the rooms).
        // Reaching the shell face (|z| ≤ halfThickness + ε) is exactly what seals
        // the room — the partition body overlaps the shell body.
        const shellHalfT = 0.2 / 2;
        for (const p of [pA, pB, pC]) {
            const jp = res.get(p.id)!;
            expect(jp.invalid).toBeFalsy();
            const joinEnd = jp.baseLine[1] as THREE.Vector3;   // all join at 'end'
            // The endpoint reaches the shell body (face), not stranded inside the room.
            expect(Math.abs(joinEnd.z)).toBeLessThanOrEqual(shellHalfT + 0.01);
            // And it is NOT collapsed / inverted.
            expect(jp.baseLine[0].distanceTo(jp.baseLine[1])).toBeGreaterThan(2.5);
        }
    });

    it('regression: a pure interior Y-junction (no shell under it) still consensus-trims', () => {
        // No long body under the junction → bodyHost is null for every endpoint →
        // the consensus-trim path is taken exactly as before (ends fuse within 0.30 m).
        const a = mk([-3, 10], [-0.05, 10.00], 0.2, 1);
        const b = mk([ 2, 11], [ 0.02, 10.04], 0.2, 2);
        const c = mk([ 2,  9], [ 0.02,  9.96], 0.2, 3);
        const res = WallJoinResolver.resolveLevel([a, b, c], { snapRadius: 0.5 });
        const ja = res.get(a.id)!.baseLine[1] as THREE.Vector3;
        const jb = res.get(b.id)!.baseLine[1] as THREE.Vector3;
        const jc = res.get(c.id)!.baseLine[1] as THREE.Vector3;
        for (const [p, q] of [[ja, jb], [ja, jc], [jb, jc]] as const) {
            expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThanOrEqual(0.30);
        }
    });
});

/**
 * §PARTITION-SHELL-INNER-FACE (founder invariant, 2026-06-10)
 *
 * THE founder defect (3D screenshot + 2D plan, red arrows): interior PARTITION
 * walls PROTRUDE THROUGH the exterior perimeter (shell) wall — partition stubs poke
 * OUT past the outside face of the façade; in plan the partition ends cross the
 * (diagonal) exterior wall line.
 *
 * Required invariant: a partition that terminates on a shell wall must butt the
 * shell's INNER (room-side) face — never the centreline, never through to the outer
 * face. The pair-wise _applyT already lands a clean body-T on the inner face, but the
 * MULTI-CLUSTER consensus-trim branch (3+ unpinned partition endpoints welded onto a
 * shell body) leaves each end on the shell CENTRELINE with a square cap, so its body
 * crosses the shell and pokes out the outer façade. The §PARTITION-SHELL-INNER-FACE
 * final clamp pulls any such endpoint back to the host's inner face.
 *
 * These tests pin: (1) a partition welded onto a shell BODY at the centreline lands
 * on the INNER face (distance from centreline === shellThickness/2 on the room side),
 * NOT the centreline, NOT the outer face; (2) the diagonal/rotated shell case has no
 * protrusion past the outer face; (3) a clean axis-aligned L-corner (shell↔shell) is
 * byte-unchanged (still bisector miter, end NOT clamped).
 */
describe('WallJoinResolver — §PARTITION-SHELL-INNER-FACE (partition butts shell inner face, never through)', () => {
    it('3-way consensus partitions welded onto a shell body land on the INNER face, not the centreline', () => {
        // Long horizontal shell along z=0 (half-thickness 0.10 → inner face z=+0.10 on
        // the room side, where the partitions rise). Three interior partitions welded
        // onto the shell centreline (z=0) near x=0, mutually unfused/un-pinned → the
        // MULTI-CLUSTER consensus-trim would leave them on the centreline (the founder
        // protrusion). The clamp must move each joining end out to the inner face.
        const shell = mk([-10, 0], [10, 0], 0.2, 1);
        const pA = mk([-0.10, 3], [-0.10, 0.0], 0.2, 2);   // free end z=+3 → room side +z
        const pB = mk([ 0.10, 3], [ 0.10, 0.0], 0.2, 3);
        const pC = mk([ 0.00, 4], [ 0.00, 0.0], 0.2, 4);
        const res = WallJoinResolver.resolveLevel([shell, pA, pB, pC], { snapRadius: 0.5 });

        const shellHalfT = 0.2 / 2;   // 0.10 m
        for (const p of [pA, pB, pC]) {
            const jp = res.get(p.id)!;
            expect(jp.invalid).toBeFalsy();
            const joinEnd = jp.baseLine[1] as THREE.Vector3;   // all join at 'end'
            // INNER face: z === +shellHalfT (room side), within 1 mm. NOT the centreline
            // (z=0) and NOT the outer face (z=-shellHalfT).
            expect(joinEnd.z).toBeCloseTo(shellHalfT, 2);
            expect(joinEnd.z).toBeGreaterThan(0.05);   // off the centreline, on the room side
            // Not collapsed / inverted.
            expect(jp.baseLine[0].distanceTo(jp.baseLine[1])).toBeGreaterThan(2.5);
        }
        // Shell (the host) is never moved — full span preserved.
        const jShell = res.get(shell.id);
        if (jShell) {
            expect(jShell.baseLine[0].x).toBeCloseTo(-10, 3);
            expect(jShell.baseLine[1].x).toBeCloseTo(10, 3);
        }
    });

    it('diagonal/rotated shell: partition butts the inner face — no protrusion past the outer face', () => {
        // 45° exterior shell from (0,0) to (10,10), half-thickness 0.10. A partition
        // welded onto the shell centreline at its midpoint (5,5), running inward. The
        // partition end must land on the shell's inner face — exactly halfThickness off
        // the centreline on the room side — so its body never crosses to the outer face.
        const shell = mk([0, 0], [10, 10], 0.2, 1);
        const part = mk([8, 2], [5, 5], 0.2, 2);   // join end on the shell centreline (5,5)
        const res = WallJoinResolver.resolveLevel([shell, part], { snapRadius: 0.5 });
        const jp = res.get(part.id)!;
        expect(jp.invalid).toBeFalsy();
        const join = jp.baseLine[1] as THREE.Vector3;
        // Distance from the shell centreline === halfThickness (on the inner face).
        const distCentre = Math.hypot(join.x - 5, join.z - 5);
        expect(distCentre).toBeCloseTo(0.10, 2);
        // And the endpoint is on the ROOM side (toward the free end (8,2)): the shell
        // outward normal is (-1,1)/√2; the inner face is the −normal side, where the
        // free end sits. Verify the join is on the same lateral side as the free end.
        const nx = -1 / Math.SQRT2, nz = 1 / Math.SQRT2;   // shell left normal
        const joinLat = (join.x - 5) * nx + (join.z - 5) * nz;
        const freeLat = (8 - 5) * nx + (2 - 5) * nz;
        expect(Math.sign(joinLat)).toBe(Math.sign(freeLat));   // same (room) side, not through
    });

    it('regression: a clean axis-aligned shell↔shell L-corner is UNCHANGED (no clamp)', () => {
        // Two comparable-length shell walls forming the building corner. Endpoint↔
        // endpoint (not a body-T) → the clamp must NOT fire: bisector miter, ends stay
        // exactly at the centreline crossing (4,0).
        const a = mk([0, 0], [4, 0], 0.2, 1);
        const b = mk([4, 0], [4, 3], 0.2, 2);
        const res = WallJoinResolver.resolveLevel([a, b]);
        const ja = res.get(a.id)!, jb = res.get(b.id)!;
        expect(ja.baseLine[1].x).toBeCloseTo(4, 3);
        expect(ja.baseLine[1].z).toBeCloseTo(0, 3);
        expect(jb.baseLine[0].x).toBeCloseTo(4, 3);
        expect(jb.baseLine[0].z).toBeCloseTo(0, 3);
        expect(ja.endMN).toBeTruthy();   // still a bisector miter, not a face clamp
        expect(jb.startMN).toBeTruthy();
    });

    it('regression: a clean perpendicular body-T (already on the inner face via _applyT) is unchanged', () => {
        // A single partition welded onto a shell body. _applyT already lands it on the
        // inner face; the clamp sees curLateral ≥ inner-face target and is a no-op.
        const shell = mk([-10, 0], [10, 0], 0.2, 1);
        const part = mk([0, 3], [0, 0], 0.2, 2);
        const res = WallJoinResolver.resolveLevel([shell, part], { snapRadius: 0.5 });
        const join = res.get(part.id)!.baseLine[1] as THREE.Vector3;
        expect(join.z).toBeCloseTo(0.10, 2);   // inner face, idempotent
    });
});
