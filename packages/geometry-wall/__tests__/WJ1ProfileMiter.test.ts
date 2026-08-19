/**
 * WJ1 — §FEAT-WALL-PROFILE-MITRE (L-1071): a PROFILED wall gets a mitred end.
 *
 * RK1 shipped the profile body and named its own first blank: *"⛔ NO MITRE. The end faces
 * are cut perpendicular at `u = 0` and `u = length`. `buildWallHoleBodyGeometry` carries
 * the identical limitation for the identical reason: an `ExtrudeGeometry` outline has no
 * per-end plane to project onto. **This is the first thing to fix if profiles are wanted
 * on joined walls.**"*
 *
 * ── THE REASON IT WAS NOT A REAL CONSTRAINT ────────────────────────────────────────
 *
 * A wall mitre plane is VERTICAL. `MiterPrismBuilder.project()` solves in XZ and returns
 * `base[1]` untouched; `CurvedWallCapMiter.projectCapVertex` likewise. In the profile
 * builder's own local frame — local-x along the wall, local-z across it — such a plane is
 *
 *     x = x0 − (n·leftPerp(dir) / n·dir) · z
 *
 * with **no `y` in it**. So the mitre is a displacement in local x that is a function of
 * local z ALONE, which is exactly what an extruded outline can absorb: every vertex of the
 * end edge takes the same rule whatever height the profile put it at. The blank was a
 * statement about the wrong FRAME, not about the geometry.
 *
 * ── HOW THIS FILE AVOIDS RK1'S TWO INSTRUMENT FAILURES ─────────────────────────────
 *
 * ⭐ RK1 lost a draft to a metric that came back BIT-IDENTICAL because `projectCapVertex`
 *   re-solved the along-axis coordinate and overwrote the displacement. **Exact
 *   non-movement is evidence of a discarded write, not of a small effect.** So no
 *   assertion here is of the form "it changed" or "it got closer": every one compares the
 *   produced x against the CLOSED FORM of the plane, computed independently in the test
 *   from the normal and the direction. A predicate that matched no vertices produces
 *   `x = uMax` where the closed form says `uMax ± halfT·tan`, and that is a hard fail.
 *
 * ⭐ RK1 also found a control that measured its own precondition. The control here is the
 *   SAME builder with the SAME ring and NO normals — one variable, and it is asserted to
 *   still be perpendicular, so "mitred" and "unmitred" are distinguishable by this file's
 *   own instrument before either is claimed.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildWallProfileBodyGeometry } from '../src/WallProfileBodyBuilder';

const L = 6;
const H = 3;
const T = 0.2;

/** The founder-shaped ring: the far end steps down to 1 m. */
const STEPPED = [
    { u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: 1 }, { u: 0, v: H },
];
const RECTANGLE = [
    { u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: H }, { u: 0, v: H },
];

interface P3 { x: number; y: number; z: number }

function verts(g: THREE.BufferGeometry): P3[] {
    const pos = g.getAttribute('position');
    const out: P3[] = [];
    for (let i = 0; i < pos.count; i++) out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    return out;
}

/** Every distinct x found at local-z ≈ `z`, rounded so the extruder's duplicates collapse. */
function xsAtZ(vs: readonly P3[], z: number, tol = 1e-6): number[] {
    const set = new Set<number>();
    for (const v of vs) if (Math.abs(v.z - z) <= tol) set.add(Number(v.x.toFixed(9)));
    return [...set].sort((a, b) => a - b);
}

/**
 * The CLOSED FORM this file measures against, derived in the test rather than imported
 * from the builder — an assertion against the code's own arithmetic would pass for any
 * arithmetic. `dir` is the wall's unit plan direction; `mn` the world-XZ plane normal.
 */
function expectedX(
    x0: number, z: number,
    mn: { nx: number; nz: number },
    dir: { x: number; z: number },
): number {
    const nAxial = mn.nx * dir.x + mn.nz * dir.z;
    const nLat = mn.nx * -dir.z + mn.nz * dir.x;
    return x0 + (-nLat / nAxial) * z;
}

/**
 * The canonical L-corner: a wall running +X meeting a wall running +Z. `WallJoinResolver`
 * emits the bisector normal for that corner; at 90° between +X and +Z the mitre plane is
 * the 45° plane, whose unit normal is (√½, −√½) — the same number `buildMiterPrism` is fed
 * and the same one the existing corner suites use.
 */
const DIR_X = { x: 1, z: 0 };
const MN_45 = { nx: Math.SQRT1_2, nz: -Math.SQRT1_2 };

describe('§FEAT-WALL-PROFILE-MITRE — CONTROL: no normals ⇒ the ends stay perpendicular', () => {
    it('every end vertex sits at exactly u=0 / u=L on BOTH faces of the wall', () => {
        const g = buildWallProfileBodyGeometry({ ring: STEPPED, thickness: T, baseOffset: 0 })!;
        expect(g, 'the control body built').toBeTruthy();
        const vs = verts(g);
        // The extruder centres the solid on the baseline, so the two faces are ±T/2.
        for (const z of [-T / 2, T / 2]) {
            const xs = xsAtZ(vs, z);
            expect(xs[0], `min x at z=${z}`).toBeCloseTo(0, 6);
            expect(xs[xs.length - 1], `max x at z=${z}`).toBeCloseTo(L, 6);
        }
    });

    it('CONTROL CAN FAIL — passing a direction with NO normals is still perpendicular', () => {
        // Guards the reverse mistake: a builder that mitred on `direction` alone would
        // move the ends of every wall in the model, joined or not.
        const vs = verts(buildWallProfileBodyGeometry({
            ring: STEPPED, thickness: T, baseOffset: 0, direction: DIR_X,
        })!);
        expect(xsAtZ(vs, T / 2)[xsAtZ(vs, T / 2).length - 1]).toBeCloseTo(L, 6);
    });
});

describe('§FEAT-WALL-PROFILE-MITRE — the end edge lands ON the plane, at the CLOSED FORM', () => {
    it('the far end is mitred: +T/2 and −T/2 differ by the full mitre reach', () => {
        const g = buildWallProfileBodyGeometry({
            ring: STEPPED, thickness: T, baseOffset: 0, endMN: MN_45, direction: DIR_X,
        })!;
        const vs = verts(g);
        const xPos = Math.max(...xsAtZ(vs, T / 2));
        const xNeg = Math.max(...xsAtZ(vs, -T / 2));
        expect(xPos, 'far end at +T/2').toBeCloseTo(expectedX(L, T / 2, MN_45, DIR_X), 6);
        expect(xNeg, 'far end at −T/2').toBeCloseTo(expectedX(L, -T / 2, MN_45, DIR_X), 6);
        // ⭐ NOT "it moved" — the SEPARATION is the mitre, and at 45° it is exactly the
        //   thickness. A predicate that matched nothing gives 0 here, not a small number.
        expect(xPos - xNeg, 'mitre reach across the wall').toBeCloseTo(T, 6);
    });

    it('the near end is mitred INDEPENDENTLY — start and end do not contaminate', () => {
        const g = buildWallProfileBodyGeometry({
            ring: STEPPED, thickness: T, baseOffset: 0, startMN: MN_45, direction: DIR_X,
        })!;
        const vs = verts(g);
        expect(Math.min(...xsAtZ(vs, T / 2))).toBeCloseTo(expectedX(0, T / 2, MN_45, DIR_X), 6);
        expect(Math.min(...xsAtZ(vs, -T / 2))).toBeCloseTo(expectedX(0, -T / 2, MN_45, DIR_X), 6);
        // …and the FAR end is untouched, which is the half that catches a shear applied
        // to the whole body instead of to one end edge.
        expect(Math.max(...xsAtZ(vs, T / 2))).toBeCloseTo(L, 6);
        expect(Math.max(...xsAtZ(vs, -T / 2))).toBeCloseTo(L, 6);
    });

    it('THE PROFILE SURVIVES THE MITRE — the far end is still cut down to v = 1', () => {
        // The whole point of the feature is that the elevation outline and the plan mitre
        // are INDEPENDENT. A mitre implemented as anything y-dependent would break this.
        const g = buildWallProfileBodyGeometry({
            ring: STEPPED, thickness: T, baseOffset: 0, endMN: MN_45, direction: DIR_X,
        })!;
        const vs = verts(g);
        let topFar = -Infinity, topNear = -Infinity;
        for (const v of vs) {
            if (v.x > L - 0.5) topFar = Math.max(topFar, v.y);
            if (v.x < 0.5) topNear = Math.max(topNear, v.y);
        }
        expect(topFar, 'the stepped end is still 1 m tall').toBeCloseTo(1, 6);
        expect(topNear, 'the full-height end is still H').toBeCloseTo(H, 6);
    });

    it('THE MITRE IS Y-INDEPENDENT — a STEPPED end edge mitres at BOTH its heights', () => {
        // ⭐ This is the assertion that distinguishes "the mitre works" from "the mitre
        //   works on a rectangle". A ring with two vertices sharing the extreme u at
        //   DIFFERENT v must have BOTH displaced by the same rule; a builder that grabbed
        //   only the top or only the bottom corner passes every test above and fails here.
        const NOTCHED = [
            { u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: 1 },
            { u: L - 1, v: 1 }, { u: L - 1, v: 2 }, { u: L, v: 2 },
            { u: L, v: H }, { u: 0, v: H },
        ];
        const g = buildWallProfileBodyGeometry({
            ring: NOTCHED, thickness: T, baseOffset: 0, endMN: MN_45, direction: DIR_X,
        })!;
        const vs = verts(g);
        const want = expectedX(L, T / 2, MN_45, DIR_X);
        // Four distinct v values sit on the extreme-u edge (0, 1, 2, H); all four must
        // have moved to the same x, because the plane is vertical.
        const heights = vs
            .filter(v => Math.abs(v.z - T / 2) <= 1e-6 && Math.abs(v.x - want) <= 1e-5)
            .map(v => Number(v.y.toFixed(6)));
        const distinct = [...new Set(heights)].sort((a, b) => a - b);
        expect(distinct, 'every height on the extreme-u edge was projected').toEqual([0, 1, 2, H]);
        // And the NOTCH interior — u = L−1, which is NOT the extreme — did NOT move.
        const notchXs = vs.filter(v => Math.abs(v.z - T / 2) <= 1e-6
            && Math.abs(v.x - (L - 1)) <= 1e-5);
        expect(notchXs.length, 'the interior step is untouched').toBeGreaterThan(0);
    });

    it('BOTH ends at once, on a wall running at 45° — the frame rotation is exercised', () => {
        // Every case above runs the wall along +X, where local and world XZ coincide and a
        // builder that FORGOT to rotate the normal would still pass. This one does not.
        const dir = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
        const mn = { nx: 1, nz: 0 };
        const g = buildWallProfileBodyGeometry({
            ring: RECTANGLE, thickness: T, baseOffset: 0, startMN: mn, endMN: mn, direction: dir,
        })!;
        const vs = verts(g);
        expect(Math.max(...xsAtZ(vs, T / 2))).toBeCloseTo(expectedX(L, T / 2, mn, dir), 6);
        expect(Math.min(...xsAtZ(vs, T / 2))).toBeCloseTo(expectedX(0, T / 2, mn, dir), 6);
        expect(Math.max(...xsAtZ(vs, -T / 2))).toBeCloseTo(expectedX(L, -T / 2, mn, dir), 6);
        expect(Math.min(...xsAtZ(vs, -T / 2))).toBeCloseTo(expectedX(0, -T / 2, mn, dir), 6);
    });
});

describe('§FEAT-WALL-PROFILE-MITRE — it refuses the plane it cannot project onto', () => {
    it('a normal PARALLEL to the wall axis leaves the end perpendicular, never infinite', () => {
        // `n·dir = 0` ⇒ the projection divides by zero and the cap goes to infinity. A
        // wrong-but-finite end is recoverable; an infinite one erases the wall from the
        // scene and takes the bounding sphere with it.
        const g = buildWallProfileBodyGeometry({
            ring: STEPPED, thickness: T, baseOffset: 0,
            endMN: { nx: 0, nz: 1 }, direction: DIR_X,
        })!;
        const vs = verts(g);
        for (const v of vs) expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
        expect(Math.max(...xsAtZ(vs, T / 2))).toBeCloseTo(L, 6);
    });

    it('a normal with NO direction is SKIPPED rather than applied in the wrong frame', () => {
        const vs = verts(buildWallProfileBodyGeometry({
            ring: STEPPED, thickness: T, baseOffset: 0, endMN: MN_45,
        })!);
        expect(Math.max(...xsAtZ(vs, T / 2))).toBeCloseTo(L, 6);
    });

    it('§PROFILE-MITER-CLAMP — an extreme mitre on a SHORT wall cannot cross the far end', () => {
        // The §MITER-SEGMENT-CLAMP defect in plan: a wall shorter than the mitre reach
        // has its end retreat PAST the opposite cap, producing a negative-area,
        // self-intersecting prism — the spike the founder sees at a door beside a corner.
        const SHORT = 0.05;
        const ring = [
            { u: 0, v: 0 }, { u: SHORT, v: 0 }, { u: SHORT, v: H }, { u: 0, v: H },
        ];
        const g = buildWallProfileBodyGeometry({
            ring, thickness: 2, baseOffset: 0, endMN: MN_45, direction: DIR_X,
        })!;
        const vs = verts(g);
        for (const v of vs) {
            expect(v.x, 'no vertex retreats behind the start').toBeGreaterThanOrEqual(-1e-5);
        }
    });
});

/**
 * §WJ1-PROFILE-MITRE-BLANKS — declared, not discovered.
 *
 *  1. **The mitre plane origin is the RING's extreme `u`, not the wall's length.** They
 *     are the same for every ring the gate admits (a profile spans `u ∈ [0, length]`), and
 *     a ring that stopped short would be a shorter wall, not a wall with a gap — but a
 *     future ring authored with an inset end would mitre at the inset, and that is a
 *     decision this builder is making implicitly.
 *  2. **The neighbour is not measured here.** These assertions are that the profiled end
 *     lands ON the plane the resolver emitted. That the NEIGHBOUR's end lands on the same
 *     plane is `WallJoinResolver`'s contract and is asserted in the corner suites; this
 *     file does not re-derive it.
 *  3. **Profile × mitre × rake** composes by construction (the rake is a shear applied to
 *     the built group afterwards, and the mitre is already in the group's coordinates when
 *     it lands) — but that composition is not asserted in this file.
 */
