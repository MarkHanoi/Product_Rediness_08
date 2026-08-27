/**
 * §PLUMBSYM161 (founder, 2026-08-27 · L-12680..) — the plan/elevation SYMBOL's
 * rotation, pinned at the layer the founder actually looks at.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER, TESTING PRODUCTION `f384db56`, AFTER §PLUMBFRAME HAD ALREADY SHIPPED:
 *   "look the toilet preview is good - 3d location is good - but the symbol is
 *    mirrored 180 degrees still - why? shower too / and sink 90 degrees - i
 *    thought this was already solved!!!"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * §PLUMBFRAME (082d2225, L-11487..L-11491) fixed WHICH WAY every fixture's
 * GEOMETRY faces (mesh + symbol linework, both now origin-at-wall-edge,
 * body-on-+Z). It never touched `PlumbingPlanSymbolBuilder` /
 * `PlumbingElevationSymbolBuilder` at all — `git log` on both files shows
 * their only commit is the original §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS feature
 * landing. This file is about a SEPARATE, orthogonal defect one layer further
 * down, in how the SYMBOL builders read the fixture's STORED rotation.
 *
 * ⛔ THE ACTUAL BUG. `PlumbingStore.add()` / `.update()` call
 * `structuredClone(data)` on a DTO whose `rotation` field is a live
 * `THREE.Euler` instance (`CreatePlumbingFixtureCommand` constructs one).
 * `structuredClone` clones OWN properties only, never a prototype. `Euler`
 * stores its angle in `_x`/`_y`/`_z`/`_order` (real own properties) and exposes
 * `x`/`y`/`z`/`order` as GETTERS on `Euler.prototype` — so the clone keeps the
 * former and loses the latter. `PlumbingFragmentBuilder` (the 3-D mesh) reads
 * `_x`/`_y`/`_z` internally via `Quaternion.setFromEuler` and keeps working by
 * accident — which is exactly why the founder says 3-D is fine. The plan and
 * elevation symbol builders read the PUBLIC getters (`Number(r.x) || 0`, …),
 * which are `undefined` on the clone, so `Number(undefined) || 0` → `0` for
 * every field: EVERY plumbing plan/elevation symbol was drawn at yaw ZERO,
 * full stop. "180° for toilet/shower, 90° for sink" is not three different
 * bugs — it is one bug (draw at yaw 0) meeting three different TRUE wall
 * yaws in the founder's test layout.
 *
 * MIRROR OR ROTATION? A rotation. `readFixtureRotationEuler` feeds a proper
 * `THREE.Euler` → `Quaternion` → rotation matrix (determinant +1) through the
 * SAME `plumbingFixtureYawForWallNormal` convention the mesh, the plan-tool
 * preview and `PlumbingFixtureFrame`'s own footprint-ring helpers already use.
 * Nothing here negates an axis. "Mirrored" was the founder's word for what a
 * symmetric-looking symbol pinned at yaw 0 looks like when the wall it should
 * be facing is 180° from world zero — indistinguishable BY EYE from a true
 * mirror, but a `Euler(0,0,0)` bug, not a determinant flip. `C-M` below proves
 * the fixed transform is a rotation, not a reflection.
 *
 * ⛔ NO ASSERTION HERE MAY BE "SOFTENED" TO GO GREEN (C109 R-10 spirit, carried
 * over from `plumbingFixtureFrame.measure.test.ts`).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { PlumbingPlanSymbolBuilder } from '../src/PlumbingPlanSymbolBuilder';
import { PlumbingElevationSymbolBuilder } from '../src/PlumbingElevationSymbolBuilder';
import { PlumbingFragmentBuilder } from '../src/PlumbingFragmentBuilder';
import {
    plumbingFixtureYawForWallNormal,
    plumbingFixtureWorldFootprintRing,
    readFixtureRotationEuler,
} from '../src/PlumbingFixtureFrame';
import { DEFAULT_TOILET_VARIANT } from '../src/ToiletGeometry';
import { DEFAULT_SHOWER_VARIANT } from '../src/ShowerGeometry';
import type { PlumbingFixtureData, PlumbingFixtureType } from '../src/PlumbingTypes';

/**
 * Builds a fixture record EXACTLY the way `CreatePlumbingFixtureCommand`
 * does — `rotation` is a real, live `THREE.Euler` — then puts it through
 * `structuredClone`, exactly as `PlumbingStore.add()` / `.update()` do on
 * every write. This is the realistic runtime shape a symbol builder actually
 * receives from `storeRegistry.getStoreForType('plumbing').getAll()`.
 */
function storedFixture(fixtureType: PlumbingFixtureType, yaw: number): PlumbingFixtureData {
    const raw: PlumbingFixtureData = {
        id: `f-${fixtureType}`,
        type: 'plumbing_fixture',
        fixtureType,
        toiletVariant: fixtureType === 'toilet' ? DEFAULT_TOILET_VARIANT : undefined,
        showerVariant: fixtureType === 'shower' ? DEFAULT_SHOWER_VARIANT : undefined,
        position: new THREE.Vector3(5, 0, 2),
        rotation: new THREE.Euler(0, yaw, 0),
        levelId: 'L0',
        levelName: 'Ground',
        levelElevation: 0,
        baseOffset: 0.2,
        properties: {},
    };
    return structuredClone(raw);
}

/** Cast to reach the private `_applyTransform` the same way the door-symbol
 * test suite reaches `_computeSwingGeometry` — the real method under test,
 * not a re-implementation of it. */
type WithApplyTransform = { _applyTransform(obj: THREE.Object3D, fixture: PlumbingFixtureData): void };

const YAWS: Record<string, number> = {
    // A wall on the +X side of the room (outward/room-side normal (1,0)):
    // atan2(1, 0) = +π/2 — the founder's "sink 90°" shape.
    TOILET: Math.PI / 2,
    // A wall behind the fixture with outward normal (0,-1):
    // atan2(0,-1) = π — the founder's "shower mirrored 180°" shape.
    SHOWER: Math.PI,
    SINK: Math.PI / 2,
};

describe('§PLUMBSYM161 — the STORED-then-CLONED fixture is what the symbol builders actually see', () => {
    it('confirms the defect at its source: structuredClone strips Euler\'s public getters, keeps its private fields', () => {
        const live = new THREE.Euler(0, 1.2345, 0, 'XYZ');
        const cloned = structuredClone(live) as unknown as Record<string, unknown>;
        expect(cloned instanceof THREE.Euler).toBe(false);
        expect(cloned['x']).toBeUndefined();
        expect(cloned['_x']).toBe(0);
        expect(cloned['_y']).toBeCloseTo(1.2345, 10);
        expect(cloned['_order']).toBe('XYZ');
    });

    it('confirms Quaternion.setFromEuler (the mesh path) reads the private fields directly, so 3-D survives the clone', () => {
        const live = new THREE.Euler(0, 0.75, 0);
        const cloned = structuredClone(live);
        const qLive = new THREE.Quaternion().setFromEuler(live);
        const qCloned = new THREE.Quaternion().setFromEuler(cloned);
        expect(qCloned.x).toBeCloseTo(qLive.x, 10);
        expect(qCloned.y).toBeCloseTo(qLive.y, 10);
        expect(qCloned.z).toBeCloseTo(qLive.z, 10);
        expect(qCloned.w).toBeCloseTo(qLive.w, 10);
    });
});

describe('§PLUMBSYM161 — readFixtureRotationEuler is robust to every shape the store can hand back', () => {
    it('R-1 a LIVE Euler round-trips exactly', () => {
        const e = readFixtureRotationEuler(new THREE.Euler(0.1, 0.9, 0.3, 'XYZ'));
        expect(e.x).toBeCloseTo(0.1, 10);
        expect(e.y).toBeCloseTo(0.9, 10);
        expect(e.z).toBeCloseTo(0.3, 10);
        expect(e.order).toBe('XYZ');
    });

    it('R-2 a structuredClone-STRIPPED Euler (own _x/_y/_z/_order, no getters) round-trips too — THIS IS THE FIX', () => {
        const stripped = structuredClone(new THREE.Euler(0, Math.PI / 2, 0, 'XYZ'));
        const e = readFixtureRotationEuler(stripped);
        expect(e.y).toBeCloseTo(Math.PI / 2, 10);
        expect(e.order).toBe('XYZ');
    });

    it('R-3 a genuine plain {x,y,z,order} DTO (e.g. from JSON/network) also round-trips', () => {
        const e = readFixtureRotationEuler({ x: 0, y: Math.PI, z: 0, order: 'XYZ' });
        expect(e.y).toBeCloseTo(Math.PI, 10);
    });

    it('R-4 garbage/undefined defaults to identity rather than throwing', () => {
        expect(() => readFixtureRotationEuler(undefined)).not.toThrow();
        expect(readFixtureRotationEuler(undefined).y).toBe(0);
        expect(readFixtureRotationEuler({}).y).toBe(0);
    });
});

describe('§PLUMBSYM161 — the SYMBOL BUILDERS, fed a REALISTIC stored-and-cloned fixture', () => {
    const planBuilder = new PlumbingPlanSymbolBuilder() as unknown as WithApplyTransform;
    const elevBuilder = new PlumbingElevationSymbolBuilder() as unknown as WithApplyTransform;

    for (const fixtureType of ['toilet', 'shower', 'sink'] as PlumbingFixtureType[]) {
        const yaw = YAWS[fixtureType.toUpperCase()]!;

        it(`PLAN — ${fixtureType}: the injected symbol's yaw matches the fixture's stored yaw, not zero`, () => {
            const fixture = storedFixture(fixtureType, yaw);
            const obj = new THREE.Object3D();
            planBuilder._applyTransform(obj, fixture);

            // ⛔ BEFORE THE FIX local +Z stayed at world (0,0,1) regardless of the
            // stored yaw — the clone's `.x/.y/.z` getters are gone, so the old code
            // built `Euler(0,0,0)` every time. Compared as a WORLD DIRECTION rather
            // than raw `.rotation.y`, because a ±π yaw has more than one equivalent
            // Euler-angle decomposition (e.g. `(0,π,0)` and `(-π,~0,-π)` are the SAME
            // rotation) — asserting the angle component directly would be a false
            // negative at exactly the founder's "shower mirrored 180°" case.
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
            expect(forward.x).toBeCloseTo(Math.sin(yaw), 6);
            expect(forward.z).toBeCloseTo(Math.cos(yaw), 6);
            expect(obj.position.x).toBeCloseTo(5, 6);
            expect(obj.position.z).toBeCloseTo(2, 6);
        });

        it(`ELEVATION — ${fixtureType}: the injected symbol's yaw matches the fixture's stored yaw, not zero`, () => {
            const fixture = storedFixture(fixtureType, yaw);
            const obj = new THREE.Object3D();
            elevBuilder._applyTransform(obj, fixture);
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
            expect(forward.x).toBeCloseTo(Math.sin(yaw), 6);
            expect(forward.z).toBeCloseTo(Math.cos(yaw), 6);
        });

        it(`CROSS-CHECK — ${fixtureType}: the PLAN SYMBOL's world facing now matches the 3-D MESH's world facing`, () => {
            // ⭐ THE VERIFICATION BAR: given the SAME stored (cloned) record, the
            // symbol's transform and the mesh's transform must agree — not just
            // each look plausible in isolation.
            const fixture = storedFixture(fixtureType, yaw);

            // 3-D mesh path — PlumbingFragmentBuilder.updateFixture, verbatim.
            const scene = new THREE.Scene();
            const meshBuilder = new PlumbingFragmentBuilder(scene);
            meshBuilder.updateFixture(fixture);
            const meshRoot = meshBuilder.fixtureRoots.get(fixture.id)!;
            expect(meshRoot).toBeDefined();

            // Plan symbol path — PlumbingPlanSymbolBuilder._applyTransform, verbatim.
            const symbolObj = new THREE.Object3D();
            planBuilder._applyTransform(symbolObj, fixture);

            // Same quaternion ⇒ local +Z lands on the same world direction for both.
            const meshForward = new THREE.Vector3(0, 0, 1).applyQuaternion(meshRoot.quaternion);
            const symbolForward = new THREE.Vector3(0, 0, 1).applyQuaternion(symbolObj.quaternion);
            expect(symbolForward.x).toBeCloseTo(meshForward.x, 6);
            expect(symbolForward.z).toBeCloseTo(meshForward.z, 6);

            // …and both agree with the wall-normal convention itself.
            const expectedYaw = plumbingFixtureYawForWallNormal(Math.sin(yaw), Math.cos(yaw));
            expect(expectedYaw).toBeCloseTo(yaw, 6);
        });
    }
});

describe('§PLUMBSYM161 — MIRROR vs ROTATION: the fix is a proper rotation, not a reflection', () => {
    it('C-M the fixed transform preserves handedness (matches plumbingFixtureWorldFootprintRing exactly)', () => {
        // A wall along world X with outward (room-side) normal (0, 1) at (5, 2) —
        // the SAME scenario ARM C in plumbingFixtureFrame.measure.test.ts pins.
        const yaw = plumbingFixtureYawForWallNormal(0, 1);
        const fixture = storedFixture('toilet', yaw);
        fixture.position = structuredClone(new THREE.Vector3(5, 0, 2));

        const planBuilder = new PlumbingPlanSymbolBuilder() as unknown as WithApplyTransform;
        const obj = new THREE.Object3D();
        planBuilder._applyTransform(obj, fixture);

        // Transform the LOCAL footprint corner (hw, 0, length) — i.e. one corner of
        // `plumbingFixtureLocalFootprintRing` — through the symbol's own world
        // matrix, and compare against the independently-derived
        // `plumbingFixtureWorldFootprintRing`. A MIRROR (negated axis / determinant
        // −1) would place this corner at the wrong x; a ROTATION places it exactly
        // where the frame's own authority says it must be.
        const width = 0.42, length = 0.72; // close_coupled_round footprint, ballpark
        const localCorner = new THREE.Vector3(width / 2, 0, length);
        obj.updateMatrix();
        const worldCorner = localCorner.clone().applyMatrix4(obj.matrix);

        const ring = plumbingFixtureWorldFootprintRing({ x: 5, z: 2 }, yaw, width, length);
        const expectedCorner = ring[2]!; // {hw, length} corner in the ring's own ordering
        expect(worldCorner.x).toBeCloseTo(expectedCorner.x, 6);
        expect(worldCorner.z).toBeCloseTo(expectedCorner.z, 6);

        // Determinant of the rotation part is +1 (proper rotation) — a mirror
        // would be −1.
        const m3 = new THREE.Matrix3().setFromMatrix4(obj.matrix);
        expect(m3.determinant()).toBeCloseTo(1, 6);
    });
});
