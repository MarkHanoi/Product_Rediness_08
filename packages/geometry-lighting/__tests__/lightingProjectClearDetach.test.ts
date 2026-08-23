/**
 * §C13-LIGHTING-DETACH-BY-PARENT (L-8820) — a fixture must leave the SCENE, not merely
 * leave the builder's index.
 *
 * ── THE REPORT ──────────────────────────────────────────────────────────────
 *
 * Founder, 2026-08-23, on the live deploy: *"check project isolation — I still saw
 * **lighting fixtures from previous projects** coming."*
 *
 * ── WHAT WAS MEASURED FIRST, AND WHAT IT RULED OUT ──────────────────────────
 *
 * ⛔ NOT a missing store owner: `LightingStore` is scope-registered and IS cleared by
 * `ClearProjectCommand`. ⛔ NOT the ISO45/L-8100 shape either — `clearProjectGeometry()`
 * EXISTS on this builder and IS listed in the `bim-project-cleared` sweep
 * (`initBuilders.ts:1117`, default `via:'clearProjectGeometry'`), and that event really
 * is dispatched (`check-project-isolation.mjs` → RC=0, *"Dead project-lifecycle DOM
 * listeners found: 0"*). The trigger was checked BEFORE the logic, as the ISO45 lesson
 * requires. ⛔ NOT instanced either: `grep -rn 'InstancedElementRenderer|ElementInstanceBridge'
 * packages/geometry-lighting/src` → **0 hits**, so ISO45's instanced-renderer owner
 * cannot cover it and this is a genuinely separate path.
 *
 * ── THE LATENT CLASS THIS SUITE PINS ────────────────────────────────────────
 *
 * `remove()` detached with `this._scene.remove(group)` and then deleted the `_roots`
 * entry unconditionally. `Object3D.remove` is a **silent no-op** when the object is not
 * a direct child of the container — and the whole detach sat behind `if (this._scene)`.
 * So a fixture that was re-parented, or built before `setScene()`, was dropped from the
 * builder's index while staying LIVE in the scene: unreachable thereafter by `remove()`,
 * `clearProjectGeometry()` AND `dispose()`, and therefore **additive across project
 * switches** — which is the shape the founder describes.
 *
 * `RoomBoundaryBuilder.removeRoom` documents this exact hazard and already guards it
 * with `removeFromParent()`. Lighting did not.
 *
 * ⚠ HONESTY — this suite pins a LATENT class, it does not reproduce the founder's
 * session. A repo grep found no production site that re-parents a lighting root, so
 * "this is the founder's root" is NOT claimed. See ISSUE-LOG L-8820 for what stays open
 * and for the measurement that would settle it.
 *
 * CONTRACTS: C13 §3.8 / §3.10 · C48.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';

/** The minimum `LightingData` the builder needs to produce a fixture root. */
function fixture(id: string, levelId = 'L0') {
    return {
        id,
        fixtureType: 'pendant',
        position: { x: 0, y: 2.4, z: 0 },
        levelId,
    } as never;
}

describe('§C13-LIGHTING-DETACH-BY-PARENT — a cleared fixture leaves the scene', () => {
    let scene: THREE.Scene;
    let builder: LightingFragmentBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new LightingFragmentBuilder();
        builder.setScene(scene);
    });

    function fixtureRoots(): THREE.Object3D[] {
        const found: THREE.Object3D[] = [];
        scene.traverse(o => {
            if (o !== scene && o.userData?.elementType === 'Lighting' && o.userData?.id) found.push(o);
        });
        return found;
    }

    it('clearProjectGeometry removes every fixture from the scene graph', () => {
        builder.add(fixture('lamp-a'));
        builder.add(fixture('lamp-b'));
        expect(fixtureRoots()).toHaveLength(2);

        builder.clearProjectGeometry();

        // The assertion is about the SCENE, not about the builder's bookkeeping. An
        // empty `_roots` map with live geometry still parented is the whole defect.
        expect(fixtureRoots()).toHaveLength(0);
    });

    it('⭐ removes a RE-PARENTED fixture — the silent-no-op case', () => {
        // ⭐ FAILS ON THE PRE-FIX TREE. `scene.remove(group)` is a no-op for a group
        // whose parent is an intermediate container, yet `_roots.delete(id)` ran
        // anyway — so the fixture became permanently unreachable while still drawn,
        // and survived every subsequent project switch.
        builder.add(fixture('lamp-reparented'));
        const [root] = fixtureRoots();
        const container = new THREE.Group();
        scene.add(container);
        container.add(root);                       // re-parent, as a level/LOD group would
        expect(fixtureRoots()).toHaveLength(1);

        builder.clearProjectGeometry();

        expect(fixtureRoots()).toHaveLength(0);
        expect(container.children).toHaveLength(0);
    });

    it('does not leave a fixture behind across a simulated project switch', () => {
        // Project A's fixtures, then the C13 clear, then project B's — the founder's
        // "fixtures from previous projects coming" expressed as a count.
        builder.add(fixture('a-1', 'L-A'));
        builder.add(fixture('a-2', 'L-A'));
        builder.clearProjectGeometry();
        builder.add(fixture('b-1', 'L-B'));

        const roots = fixtureRoots();
        expect(roots).toHaveLength(1);
        expect(roots[0].userData.id).toBe('b-1');
    });

    it('is idempotent — a second clear on an empty builder is a no-op', () => {
        builder.add(fixture('lamp-a'));
        builder.clearProjectGeometry();
        expect(() => builder.clearProjectGeometry()).not.toThrow();
        expect(fixtureRoots()).toHaveLength(0);
    });

    it('a rebuild of the SAME id does not accumulate roots', () => {
        // `add()` removes an existing root before rebuilding. If that removal
        // were ever a silent no-op, every re-render would double the fixture.
        builder.add(fixture('lamp-a'));
        builder.add(fixture('lamp-a'));
        builder.add(fixture('lamp-a'));
        expect(fixtureRoots()).toHaveLength(1);
    });
});
