/**
 * RK1 — §FEAT-WALL-PROFILE-BODY (L-1067): the profile now DRAWS.
 *
 * The founder has asked for Edit Profile three times. The measured state before this was
 * not "profile × rake is unverified" — it was that **a profile drew nothing on any wall
 * shape**. `wallProfile` was consumed by the schema, the store, the delta classifier, the
 * geometry hash and an instanced-arm exclusion, and by NO body builder. Authoring one
 * rebuilt the wall, dropped it off the instanced path, and rendered the identical
 * rectangle. Worse than a refusal, because a refusal says why nothing happened.
 *
 * ── WHAT IS MEASURED, AND WHY IT IS THE SILHOUETTE ─────────────────────────────────
 *
 * Every assertion reads the BufferGeometry the builder actually produced. The profile's
 * whole visible content is its ELEVATION OUTLINE, so the test is the outline: a ring that
 * cuts the far end down to `v = 1` must produce a body with no material above `y = 1` at
 * that end, and a full-height body at the other. "It built something" is not the claim.
 *
 * The control comes first and it can fail: the SAME wall with no profile is the full
 * rectangle, so any assertion that passes on both is measuring nothing.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import { buildWallProfileBodyGeometry } from '../src/WallProfileBodyBuilder';


const L = 6;
const H = 3;
const T = 0.2;

/** The founder-shaped case: a wall whose far end steps down to 1 m — a gable-ish cut. */
const STEPPED = [
    { u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: 1 }, { u: 0, v: H },
];

interface P3 { x: number; y: number; z: number }

function verts(g: THREE.BufferGeometry): P3[] {
    const pos = g.getAttribute('position');
    const out: P3[] = [];
    for (let i = 0; i < pos.count; i++) out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    return out;
}

/** The greatest world-Y of any vertex within `tol` of plan-x = `u`. */
function topAt(vs: readonly P3[], u: number, tol = 0.05): number {
    let best = -Infinity;
    for (const v of vs) if (Math.abs(v.x - u) <= tol) best = Math.max(best, v.y);
    return best;
}

/** The implicit rectangle every un-profiled wall already is — `[0,L] x [0,H]`. */
const RECTANGLE = [
    { u: 0, v: 0 }, { u: L, v: 0 }, { u: L, v: H }, { u: 0, v: H },
];

describe('§FEAT-WALL-PROFILE-BODY — CONTROL: the rectangle ring is the un-profiled wall', () => {
    // ⚠ THE FIRST CONTROL WAS THE WRONG INSTRUMENT and is recorded rather than replaced
    //   silently. It called `buildWallHoleBodyGeometry` with `openings: []`, which returns
    //   NULL — that builder exists to punch holes and declines a wall with none. The test
    //   failed on "expected null to be truthy", i.e. it was measuring the control's own
    //   precondition, not the profile.
    //
    //   Feeding the RECTANGLE ring through the SAME builder is the stronger control
    //   anyway: it isolates the one variable that matters — the ring — instead of
    //   comparing across two builders that could differ for unrelated reasons.
    it('a rectangular ring reaches full height at BOTH ends', () => {
        const g = buildWallProfileBodyGeometry({ ring: RECTANGLE, thickness: T, baseOffset: 0 });
        expect(g, 'the control body built').toBeTruthy();
        const vs = verts(g!);
        expect(topAt(vs, 0)).toBeCloseTo(H, 6);
        expect(topAt(vs, L)).toBeCloseTo(H, 6);
    });

    it('CONTROL CAN FAIL — the stepped ring does NOT reach full height at the far end', () => {
        // Without this, "reaches H at both ends" could be true of every ring and the
        // discriminator below would be measuring nothing.
        const vs = verts(buildWallProfileBodyGeometry({ ring: STEPPED, thickness: T, baseOffset: 0 })!);
        expect(topAt(vs, L)).not.toBeCloseTo(H, 6);
    });
});

describe('§FEAT-WALL-PROFILE-BODY — the ring is DRAWN', () => {
    it('a stepped profile cuts the far end down to its authored v, and leaves the near end full', () => {
        const g = buildWallProfileBodyGeometry({ ring: STEPPED, thickness: T, baseOffset: 0 });
        expect(g, 'the profiled body built').toBeTruthy();
        const vs = verts(g!);
        // THE DISCRIMINATOR. The control above reaches H at BOTH ends; this must not.
        expect(topAt(vs, L), 'the far end stops at the authored v = 1').toBeCloseTo(1, 6);
        expect(topAt(vs, 0), 'the near end is still full height').toBeCloseTo(H, 6);
        // And nothing anywhere exceeds the ring's own maximum.
        expect(Math.max(...vs.map(v => v.y))).toBeCloseTo(H, 6);
    });

    it('it is a SOLID of the wall\'s thickness, centred on the baseline', () => {
        const vs = verts(buildWallProfileBodyGeometry({ ring: STEPPED, thickness: T, baseOffset: 0 })!);
        const zs = vs.map(v => v.z);
        expect(Math.min(...zs)).toBeCloseTo(-T / 2, 6);
        expect(Math.max(...zs)).toBeCloseTo(+T / 2, 6);
    });

    it('the BASE datum is honoured — a plinth wall lifts the whole ring', () => {
        // §WALL-Y-DATUM: `v` is measured above the wall's BASE plane, so a baseOffset
        // shifts every vertex and nothing else. Getting this wrong would put a profiled
        // wall on a different datum from every other body path.
        const vs = verts(buildWallProfileBodyGeometry({ ring: STEPPED, thickness: T, baseOffset: 0.15 })!);
        expect(Math.min(...vs.map(v => v.y))).toBeCloseTo(0.15, 6);
        expect(topAt(vs, L)).toBeCloseTo(1.15, 6);
    });

    it('winding does not matter — a ring authored CW draws the same solid as CCW', () => {
        // A draughtsman does not think about winding, so the builder normalises it.
        const cw = verts(buildWallProfileBodyGeometry({ ring: [...STEPPED].reverse(), thickness: T, baseOffset: 0 })!);
        const ccw = verts(buildWallProfileBodyGeometry({ ring: STEPPED, thickness: T, baseOffset: 0 })!);
        expect(cw.length).toBe(ccw.length);
        expect(topAt(cw, L)).toBeCloseTo(topAt(ccw, L), 9);
        expect(topAt(cw, 0)).toBeCloseTo(topAt(ccw, 0), 9);
    });
});

describe('§FEAT-WALL-PROFILE-BODY — it REFUSES rather than drawing nothing', () => {
    // SPEC §4: never an empty wall. A null lets the caller keep the rectangular body,
    // which is wrong-but-visible; returning a degenerate geometry would be invisible.
    it('null on a ring that cannot be a solid, and never a throw', () => {
        for (const bad of [
            [],
            [{ u: 0, v: 0 }, { u: 1, v: 0 }],                                  // < 3 vertices
            [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 2, v: 0 }],                  // zero area
            [{ u: 0, v: 0 }, { u: Number.NaN, v: 0 }, { u: 1, v: 1 }],         // non-finite
        ]) {
            let g: THREE.BufferGeometry | null = null;
            expect(() => { g = buildWallProfileBodyGeometry({ ring: bad as never, thickness: T, baseOffset: 0 }); })
                .not.toThrow();
            expect(g, JSON.stringify(bad)).toBeNull();
        }
        expect(buildWallProfileBodyGeometry({ ring: STEPPED, thickness: 0, baseOffset: 0 })).toBeNull();
    });

    it('the VALID ring still builds — the refusals above are not swallowing everything', () => {
        expect(buildWallProfileBodyGeometry({ ring: STEPPED, thickness: T, baseOffset: 0 })).toBeTruthy();
    });
});

/**
 * §RK1-PROFILE-BODY-BLANKS — declared, not discovered.
 *
 *  1. **NO MITRE.** The end faces are cut perpendicular at `u = 0` and `u = length`, the
 *     same limitation `buildWallHoleBodyGeometry` has and for the same reason: an
 *     `ExtrudeGeometry` outline has no per-end plane to project onto. A profiled wall at a
 *     mitred junction shows the pre-mitre end. **This is the first thing to fix if
 *     profiles are wanted on joined walls**, and it is why L-1067 stays OPEN.
 *  2. **PROFILE × RAKE is not measured HERE.** The ring is authored in the un-sheared
 *     frame and the caller shears the built group, so they compose by construction — but
 *     that composition is asserted in the matrix, not in this file.
 *  3. **Curved / layered / opening-bearing profiles are refused**, and two of those three
 *     refusals are argued UNBUILT rather than impossible (L-1067). Nothing here changes
 *     that argument.
 */
