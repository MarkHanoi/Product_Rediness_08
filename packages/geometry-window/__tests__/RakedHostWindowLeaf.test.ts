/**
 * §RAKE-HOSTED-OPENING — THE WINDOW ELEMENT ITSELF SITS IN THE RAKED PLANE.
 *
 * `WallFragmentBuilder` cuts the void and shears the wall's own in-wall frame, and
 * `geometry-wall/__tests__/RakedHostedOpening.test.ts` measures that. But the thing
 * the user actually looks through is built HERE, by `WindowBuilder`, as a separate
 * scene object placed from `hostedElementFrame()` — a world point plus a scalar
 * `rotationY`. ADR-0310 §2.5 named exactly that as the second half of the refusal:
 * *"the vertical axis is not modelled at all … `hostedElementFrame` returns a scalar
 * rotationY."* A window whose VOID leans but whose LEAF stands plumb is the defect,
 * not the fix — so it is measured separately, at the layer that builds it.
 *
 * COMMITTED ≠ REACHABLE: every assertion below reads the built scene graph after a
 * real `rebuild()`, never a pure function's return value.
 *
 * THE DECISION BEING PINNED (stated in full in `WallRake.ts` §RAKE-HOSTED-OPENING):
 *   · the leaf is IN-PLANE — and specifically SHEARED, not rigidly rotated, so its
 *     faces stay parallel to the wall's faces and it fills the sheared void exactly;
 *   · `sillHeight` and `height` stay PLUMB, so the leaf's centre stays at the
 *     elevation the author typed at every rake angle.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { rakeShearPerMetre } from '@pryzm/geometry-wall';

const RAKE_DEG = 75;
const K = rakeShearPerMetre(RAKE_DEG);          // cot(75°) ≈ 0.267949 — the canonical predicate

/** A plain 6 m straight wall along +X ⇒ `leftPerp` is +Z, so the shear shows up in z. */
function wall(rakeAngleDeg?: number) {
    return {
        id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        ...(rakeAngleDeg === undefined ? {} : { rakeAngleDeg }),
    };
}

const WIN = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

const CENTRE_X = WIN.offset + WIN.width / 2;    // 2.6
const CENTRE_Y = WIN.sillHeight + WIN.height / 2;   // 1.6 — PLUMB, at every rake

function buildOn(rakeAngleDeg?: number): THREE.Group {
    const w = wall(rakeAngleDeg);
    const wallStoreStub = {
        getById: () => w,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(x: unknown): void }).rebuild(WIN);
    let group: THREE.Group | null = null;
    scene.traverse(o => { if (o.userData?.id === WIN.id && o !== scene) group = o as THREE.Group; });
    expect(group).toBeTruthy();
    scene.updateMatrixWorld(true);
    return group!;
}

/** World position of the point `localY` metres above the window's own centre. */
function worldAtLocalY(group: THREE.Group, localY: number): THREE.Vector3 {
    return new THREE.Vector3(0, localY, 0).applyMatrix4(group.matrixWorld);
}

describe('§RAKE-HOSTED-OPENING — the window LEAF on a raked host', () => {
    it('the leaf CENTRE keeps its PLUMB elevation and rides the raked face', () => {
        const g = buildOn(RAKE_DEG);
        const c = worldAtLocalY(g, 0);
        expect(c.x).toBeCloseTo(CENTRE_X, 4);
        expect(c.y).toBeCloseTo(CENTRE_Y, 4);          // PLUMB — unchanged by the lean
        expect(c.z).toBeCloseTo(K * CENTRE_Y, 4);      // displaced onto the raked face
    });

    it('THE LEAF IS IN-PLANE: its head sits downstream of its sill by cot(θ)·height', () => {
        // A plumb leaf gives headZ === sillZ. This is the assertion that separates a
        // window standing in a leaning hole from a window that leans with it.
        const g = buildOn(RAKE_DEG);
        const head = worldAtLocalY(g, WIN.height / 2);
        const sill = worldAtLocalY(g, -WIN.height / 2);
        expect(head.y - sill.y).toBeCloseTo(WIN.height, 4);            // plumb rise preserved
        expect(head.z - sill.z).toBeCloseTo(K * WIN.height, 4);        // …and it leans
        expect(head.z - sill.z).toBeGreaterThan(0.3);                  // a real tilt, not noise
    });

    it('the leaf is SHEARED, not rigidly rotated — its depth axis stays horizontal', () => {
        // A rigid rotation into the raked plane would tip the depth axis too, changing
        // the leaf's PLAN thickness. A raked wall's plan footprint is fixed at its base
        // (ADR-0310 §2.3), so a rotated leaf would no longer match its reveal.
        const g = buildOn(RAKE_DEG);
        const o = worldAtLocalY(g, 0);
        const depthAxis = new THREE.Vector3(0, 0, 1).applyMatrix4(g.matrixWorld).sub(o);
        expect(depthAxis.y).toBeCloseTo(0, 6);
        expect(depthAxis.length()).toBeCloseTo(1, 6);   // …and unscaled
        const widthAxis = new THREE.Vector3(1, 0, 0).applyMatrix4(g.matrixWorld).sub(o);
        expect(widthAxis.y).toBeCloseTo(0, 6);          // the width axis runs along the wall
    });

    it('a rake leaning the OTHER way leans the leaf the other way', () => {
        const g = buildOn(180 - RAKE_DEG);              // 105° — top toward the wall's RIGHT
        const head = worldAtLocalY(g, WIN.height / 2);
        const sill = worldAtLocalY(g, -WIN.height / 2);
        expect(head.z - sill.z).toBeCloseTo(-K * WIN.height, 4);
    });

    // ── NON-VACUITY ─────────────────────────────────────────────────────────
    it('on a VERTICAL host the leaf is plumb and un-displaced — unchanged behaviour', () => {
        for (const r of [undefined, 90]) {
            const g = buildOn(r);
            const c = worldAtLocalY(g, 0);
            expect(c.x).toBeCloseTo(CENTRE_X, 6);
            expect(c.y).toBeCloseTo(CENTRE_Y, 6);
            expect(c.z).toBeCloseTo(0, 6);
            const head = worldAtLocalY(g, WIN.height / 2);
            const sill = worldAtLocalY(g, -WIN.height / 2);
            expect(head.z - sill.z).toBeCloseTo(0, 6);
        }
    });

    it('a vertical host keeps TRS placement — nothing is pinned into a manual matrix', () => {
        // The shear can only be carried by writing `matrix` directly and disabling
        // `matrixAutoUpdate`. That must not happen on the overwhelmingly common path:
        // code elsewhere still moves a window by setting `position`, and a silently
        // frozen matrix would make those writes no-ops.
        expect(buildOn(undefined).matrixAutoUpdate).toBe(true);
        expect(buildOn(90).matrixAutoUpdate).toBe(true);
    });
});
