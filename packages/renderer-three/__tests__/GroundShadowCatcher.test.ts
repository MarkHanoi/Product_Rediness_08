/**
 * §FEAT-GROUND-SHADOW-CATCHER (ADR-0106) — GroundShadowCatcher contract.
 *
 * The catcher is an INVISIBLE, receive-only ground plane so every element casts a
 * grounded shadow even with no floor slab. It must never become a shadow CASTER
 * (would regress §PERF-HEAVY-SHADOW-OFF's single-caster assumption) and must be
 * toggleable / disposable with no GPU teardown mid-frame (ADR-0111 safe).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '../src/three-re-export';
import { GroundShadowCatcher, GROUND_SHADOW_CATCHER_NAME } from '../src/GroundShadowCatcher';

describe('GroundShadowCatcher §FEAT-GROUND-SHADOW-CATCHER', () => {
    let scene: THREE.Scene;
    let catcher: GroundShadowCatcher;

    beforeEach(() => {
        scene = new THREE.Scene();
        catcher = new GroundShadowCatcher();
    });

    it('is receive-only — receives shadows, never casts', () => {
        const mesh = catcher.mesh;
        expect(mesh.castShadow).toBe(false);
        expect(mesh.receiveShadow).toBe(true);
        expect(mesh.name).toBe(GROUND_SHADOW_CATCHER_NAME);
    });

    it('uses a transparent ShadowMaterial (invisible except where shadowed)', () => {
        const mat = catcher.mesh.material as THREE.ShadowMaterial;
        expect(mat).toBeInstanceOf(THREE.ShadowMaterial);
        expect(mat.transparent).toBe(true);
        // opacity < 0.5 so PascalSceneLighting's shadow-flag traversal skips it.
        expect(mat.opacity).toBeLessThan(0.5);
    });

    it('is not raycastable — cannot intercept a pick / snap / hover ray', () => {
        const hits: unknown[] = [];
        // Any raycast against the mesh must add nothing.
        catcher.mesh.raycast(new THREE.Raycaster(), hits as never);
        expect(hits).toHaveLength(0);
    });

    it('attach() adds the plane to the scene; detach() removes it', () => {
        catcher.attach(scene);
        expect(scene.children).toContain(catcher.mesh);
        catcher.detach();
        expect(scene.children).not.toContain(catcher.mesh);
    });

    it('setElevation() places the plane at (just below) the ground datum', () => {
        catcher.setElevation(3.5);
        // Sits a hair below so a coincident slab wins the depth test.
        expect(catcher.mesh.position.y).toBeLessThan(3.5);
        expect(catcher.mesh.position.y).toBeGreaterThan(3.4);
    });

    it('setEnabled() toggles visibility with no GPU dispose (ADR-0111 safe)', () => {
        catcher.attach(scene);
        catcher.setEnabled(false);
        expect(catcher.enabled).toBe(false);
        expect(catcher.mesh.visible).toBe(false);
        // Geometry + material still live (not disposed) — reversible.
        expect((catcher.mesh.material as THREE.Material)).toBeTruthy();
        catcher.setEnabled(true);
        expect(catcher.mesh.visible).toBe(true);
    });
});
