/**
 * §BATH102 / §PLUMBFRAME — WHAT EACH READER ACTUALLY BELIEVES ABOUT A FIXTURE'S
 * LOCAL FRAME. A MEASUREMENT, NOT A READING OF THE HEADERS.
 *
 * (founder, 2026-08-26 · L-11487..L-11489 · C84 EI-1 / EI-9 · C86 §10.1 PR-1's rule,
 * one family over.)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER, TWICE:
 *   "check the toilet family — in plan view it shows correctly the PREVIEW — but then
 *    in 3D it creates it 180° ROTATED, and the plan-view SYMBOL is 90° rotated!!"
 *   "The shower element is also not completely correct — the preview of the shower
 *    plate is CENTRED on the shower itself — whereas it should not [be]."
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ THE HEADERS DISAGREE WITH EACH OTHER, IN WRITING, AND HAVE FOR MONTHS:
 *
 *   `ToiletGeometry.ts:21-23`   — *"+Z points away from the back wall (front of the
 *                                  bowl). Origin sits on the floor at the bowl's
 *                                  back-centre."*
 *   `PlumbingTool.ts:332-334`   — *"Toilet & sink: their FRONT is at local −Z
 *                                  (D-shape / basin extrude to −Z, wall plate at +Z),
 *                                  so we flip 180° to seat their back against the
 *                                  wall."*
 *
 * Both cannot be true, and `[[probe-can-be-wrong-three-ways]]` says the way to settle
 * it is an INDEPENDENT source — the geometry itself. **This file asks the meshes.**
 * It asserts nothing about which convention is RIGHT; it records what each producer
 * BUILDS, so the fix is applied to the reader that is actually wrong rather than to
 * whichever one a comment accused.
 *
 * ⛔ NO ASSERTION HERE MAY BE "SOFTENED" TO GO GREEN. If one of these changes, the
 * frame changed, and every reader that consumes it has to be re-checked.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { createToiletGeometry, TOILET_FOOTPRINTS, DEFAULT_TOILET_VARIANT } from '../src/ToiletGeometry';
import { createShowerGeometry, SHOWER_FOOTPRINTS, SHOWER_VARIANTS, DEFAULT_SHOWER_VARIANT } from '../src/ShowerGeometry';
import {
    plumbingFixtureYawForWallNormal,
    plumbingFixtureLocalFootprintRing,
    plumbingFixtureWorldFootprintRing,
} from '../src/PlumbingFixtureFrame';
import { buildPlanLinework, resolveFixtureFootprint } from '../src/PlumbingSymbolGeometry';

/** The z-extent of a built group, in its own local frame. */
function zSpan(g: THREE.Object3D): { min: number; max: number } {
    const box = new THREE.Box3().setFromObject(g);
    return { min: box.min.z, max: box.max.z };
}

/** The z-extent of a flat [x,y,z, …] linework buffer. */
function zSpanOfLinework(buf: readonly number[]): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 2; i < buf.length; i += 3) {
        const z = buf[i]!;
        if (z < min) min = z;
        if (z > max) max = z;
    }
    return { min, max };
}

describe('§PLUMBFRAME — the LOCAL FRAME each producer actually builds', () => {
    // ── ARM A — the 3-D MESH ────────────────────────────────────────────────
    describe('ARM A — the meshes', () => {
        it('A-1 TOILET: the body lies on +Z, and the origin is at the BACK edge', () => {
            const g = createToiletGeometry(DEFAULT_TOILET_VARIANT);
            const { min, max } = zSpan(g);
            // ⭐ THE MEASUREMENT THAT SETTLES THE CONTRADICTION. `ToiletGeometry`'s
            // header says +Z is the front and the origin is the back-centre. If that
            // is true the whole body is at z ≥ 0 (bar float noise) and extends to
            // roughly the variant's declared length.
            expect(min).toBeGreaterThan(-0.05);
            expect(max).toBeGreaterThan(0.3);
        });

        it('A-2 TOILET: the CISTERN is at the back (small z) and the BOWL at the front', () => {
            const g = createToiletGeometry('close_coupled_round');
            // The cistern is the part nearest z = 0; the seat/lid is the part furthest.
            // Measured as a RELATIONSHIP, never as a pinned literal (C109 R-10): the
            // question is "which end is which", not "is the tank 0.22 m deep".
            let backMostCentre = Infinity;
            let frontMostCentre = -Infinity;
            g.traverse((c) => {
                if (!(c as THREE.Mesh).isMesh) return;
                const b = new THREE.Box3().setFromObject(c);
                const mid = (b.min.z + b.max.z) / 2;
                if (mid < backMostCentre) backMostCentre = mid;
                if (mid > frontMostCentre) frontMostCentre = mid;
            });
            expect(frontMostCentre).toBeGreaterThan(backMostCentre);
            // …and the front-most part is beyond the mid-depth of the footprint, i.e.
            // the body really does reach into the room rather than hugging the wall.
            expect(frontMostCentre).toBeGreaterThan(
                TOILET_FOOTPRINTS['close_coupled_round'].length / 2,
            );
        });

        it('A-3 SHOWER: the tray lies on +Z from the origin, not centred on it', () => {
            const g = createShowerGeometry(DEFAULT_SHOWER_VARIANT);
            const { min, max } = zSpan(g);
            const fp = SHOWER_FOOTPRINTS[DEFAULT_SHOWER_VARIANT];
            // ⭐ THE ANCHOR QUESTION, ASKED OF THE GEOMETRY. If the origin were the
            // CENTRE the span would straddle zero (−L/2 … +L/2). If it is the
            // WALL-CONTACT EDGE the span runs 0 … L.
            expect(
                min,
                'a CENTRED shower would put half its tray behind the origin, i.e. inside the wall',
            ).toBeGreaterThan(-0.05);
            expect(max).toBeGreaterThan(fp.length * 0.5);
        });
    });

    // ── ARM B — the PLAN SYMBOL ─────────────────────────────────────────────
    describe('ARM B — the plan symbol', () => {
        it('B-1 TOILET symbol: origin at the back edge, body on +Z — AGREES with the mesh', () => {
            const buf = buildPlanLinework({ fixtureType: 'toilet', toiletVariant: DEFAULT_TOILET_VARIANT });
            const { min, max } = zSpanOfLinework(buf);
            const fp = resolveFixtureFootprint({ fixtureType: 'toilet', toiletVariant: DEFAULT_TOILET_VARIANT });
            expect(min).toBeGreaterThan(-0.001);
            expect(max).toBeCloseTo(fp.length, 1);
        });

        it('B-2 SHOWER symbol: same frame — origin at the back edge, body on +Z', () => {
            const buf = buildPlanLinework({ fixtureType: 'shower', showerVariant: DEFAULT_SHOWER_VARIANT });
            const { min, max } = zSpanOfLinework(buf);
            const fp = resolveFixtureFootprint({ fixtureType: 'shower', showerVariant: DEFAULT_SHOWER_VARIANT });
            expect(min).toBeGreaterThan(-0.001);
            expect(max).toBeCloseTo(fp.length, 1);
        });

        it('B-3 SINK symbol: same frame — and the MESH now agrees with it (L-11488)', () => {
            // ⚠ THIS WAS THE 180° DISAGREEMENT. `PlumbingFragmentBuilder.createSinkMesh`
            // built its basin at z = −0.225, its rim at −0.25 and its backsplash at
            // −0.025 — the MESH on −Z while its plan SYMBOL ran +Z. That is what
            // `PlumbingTool`'s compensating flip existed for, and the flip is gone.
            const buf = buildPlanLinework({ fixtureType: 'sink' });
            const { min, max } = zSpanOfLinework(buf);
            expect(min).toBeGreaterThan(-0.001);
            expect(max).toBeGreaterThan(0.3);
        });
    });

    // ── ARM C — the CONVENTION itself ───────────────────────────────────────
    describe('ARM C — `PlumbingFixtureFrame` is the ONE authority', () => {
        it('C-1 the yaw seats local +Z on the wall\'s ROOM-SIDE normal', () => {
            // ⭐ THE PROPERTY, ASSERTED AS A RELATIONSHIP RATHER THAN A PINNED ANGLE
            // (C109 R-10). For `Euler(0, yaw, 0)` THREE maps local +Z to
            // `(sin yaw, 0, cos yaw)`, so a correct yaw sends +Z exactly onto the
            // normal it was derived from — for EVERY direction, not just the
            // axis-aligned one a hand-written `atan2` was eyeballed on.
            for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0], [0.6, 0.8], [-0.6, -0.8]] as const) {
                const yaw = plumbingFixtureYawForWallNormal(nx, nz);
                const dir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, yaw, 0));
                expect(dir.x, `+Z must land on the normal (${nx}, ${nz})`).toBeCloseTo(nx, 6);
                expect(dir.z, `+Z must land on the normal (${nx}, ${nz})`).toBeCloseTo(nz, 6);
            }
        });

        it('C-2 the footprint ring is ANCHORED at the wall edge, never centred', () => {
            const ring = plumbingFixtureLocalFootprintRing(0.9, 1.2);
            const zs = ring.map((p) => p.z);
            // ⛔ THE FOUNDER'S SHOWER REPORT, AS AN INVARIANT. A CENTRED ring would run
            // −0.6 … +0.6 and put half the tray inside the wall.
            expect(Math.min(...zs)).toBe(0);
            expect(Math.max(...zs)).toBe(1.2);
            // …and it is symmetric across the wall, which is what "midpoint of the
            // wall-contact edge" means.
            expect(Math.min(...ring.map((p) => p.x))).toBeCloseTo(-0.45, 9);
            expect(Math.max(...ring.map((p) => p.x))).toBeCloseTo(0.45, 9);
        });

        it('C-3 the world ring puts the CONTACT EDGE on the origin and the body in the room', () => {
            // A wall running along world X with its room side at +Z: normal (0, 1).
            const yaw = plumbingFixtureYawForWallNormal(0, 1);
            const ring = plumbingFixtureWorldFootprintRing({ x: 5, z: 2 }, yaw, 0.9, 1.2);
            const zs = ring.map((p) => p.z);
            expect(Math.min(...zs)).toBeCloseTo(2, 6);   // ON the wall, not behind it
            expect(Math.max(...zs)).toBeCloseTo(3.2, 6); // 1.2 m into the room
        });

        it('C-4 every SHOWER variant obeys the anchor — including the walk-ins', () => {
            // ⭐ THE WALK-INS ARE THE STRICT CASE: their glass RETURN has to land on the
            // wall, which is only true if the anchor is the contact edge. A centred
            // origin would leave the return floating half a tray inside the room.
            for (const v of SHOWER_VARIANTS) {
                const g = createShowerGeometry(v);
                const { min, max } = zSpan(g);
                const fp = SHOWER_FOOTPRINTS[v];
                expect(min, `${v} must not extend behind the wall face`).toBeGreaterThan(-0.02);
                expect(max, `${v} must reach into the room`).toBeGreaterThan(fp.length * 0.5);
            }
        });
    });
});
