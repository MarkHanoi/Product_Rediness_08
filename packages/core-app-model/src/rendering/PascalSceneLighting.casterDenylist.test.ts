/**
 * §FIX-SHADOW-CASTER-DENYLIST (L-205) — the shadow-caster set must exclude anything that exists to
 * RECEIVE a shadow, and anything of implausible (non-BIM) size.
 *
 * Why this test exists: `_enableShadowsOnScene()` used to set `castShadow = true` on EVERY mesh in
 * the scene, filtered only by whether its name contained `edge`/`grid`/`collision`. The L0 ground
 * shadow-catcher was kept out of the caster set purely by an incidental
 * `transparent && opacity < 0.5` check — and that check only `return`s, so it never CLEARED a
 * `castShadow` an earlier pass had already set.
 *
 * A ground-level plane that casts a shadow shadows the ENTIRE catcher. The catcher then composites
 * `opacity × (1 − shadowMask)` uniformly, producing a solid grey rectangle bounded exactly by the
 * shadow camera's footprint — a ~100 m square at ±50 m, the whole horizon at ±113 km. That is the
 * L-205 grey rectangle, and it is why resizing the shadow camera only ever changed the grey's SIZE.
 *
 * These tests pin the invariant: receivers never cast, oversized infrastructure never casts, and
 * ordinary BIM geometry still does.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { pascalSceneLighting } from './PascalSceneLighting';

/** Invoke the private scene sweep the same way `onGeometryAdded` does. */
function sweep(scene: THREE.Scene): void {
    (pascalSceneLighting as unknown as { _enableShadowsOnScene(s: THREE.Scene): void })
        ._enableShadowsOnScene(scene);
}

function mesh(name: string, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    return m;
}

describe('PascalSceneLighting §FIX-SHADOW-CASTER-DENYLIST (L-205)', () => {
    let scene: THREE.Scene;

    beforeEach(() => {
        scene = new THREE.Scene();
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('a ShadowMaterial receiver plane NEVER casts — and an already-set castShadow is CLEARED', () => {
        // The exact shape of the bug: something else flagged the catcher as a caster first.
        const catcher = mesh('ground-catcher', new THREE.PlaneGeometry(4000, 4000),
            new THREE.ShadowMaterial({ opacity: 0.32 }));
        catcher.userData.role = 'ground-shadow-catcher';
        catcher.castShadow = true;          // pre-poisoned
        scene.add(catcher);

        sweep(scene);

        expect(catcher.castShadow).toBe(false);   // demoted, not merely skipped
        expect(catcher.receiveShadow).toBe(true); // still receives — that is its purpose
    });

    it('an implausibly large ground plane (> 500 m radius) never casts, even with an opaque material', () => {
        // Stands in for the OBC ShadowedScene plane: 2 meshes exist at boot, 0 BIM elements,
        // yet one was being flagged as a shadow caster.
        const plane = mesh('obc-scene-plane', new THREE.PlaneGeometry(4000, 4000),
            new THREE.MeshStandardMaterial());
        plane.castShadow = true;
        scene.add(plane);

        sweep(scene);

        expect(plane.castShadow).toBe(false);
    });

    it('ordinary BIM geometry still casts and receives (the feature must keep working)', () => {
        const wall = mesh('wall_01', new THREE.BoxGeometry(5, 3, 0.2), new THREE.MeshStandardMaterial());
        scene.add(wall);

        sweep(scene);

        expect(wall.castShadow).toBe(true);
        expect(wall.receiveShadow).toBe(true);
    });

    it('a 40-storey tower stays UNDER the radius cap — the denylist must not eat real buildings', () => {
        // ~44 m footprint, ~140 m tall => bounding radius ~75 m, well inside the 500 m cap.
        const tower = mesh('tower', new THREE.BoxGeometry(44, 140, 44), new THREE.MeshStandardMaterial());
        scene.add(tower);

        sweep(scene);

        expect(tower.castShadow).toBe(true);
    });

    it('scale is honoured: a unit plane scaled to 4 km is still demoted', () => {
        const scaled = mesh('scaled-plane', new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
        scaled.scale.set(4000, 1, 4000);
        scaled.castShadow = true;
        scene.add(scaled);

        sweep(scene);

        expect(scaled.castShadow).toBe(false);
    });
});
