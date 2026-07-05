/**
 * §FIX-GROUND-CATCHER-INVISIBLE-WHEN-EMPTY (L-107) — RealEnvironmentService gates
 * the ground shadow-catcher's SCENE PRESENCE on there being a shadow caster.
 *
 * Regression: on a brand-new EMPTY project the invisible ShadowMaterial plane
 * rendered as a GREY fill (WebGPU reads an absent shadow map as "fully shadowed"
 * → opaque). Fix: the catcher is in the scene only while the scene has something
 * to catch a shadow from — so an empty scene contributes no visible pixels, and a
 * scene with a caster still receives the ground shadow.
 *
 * Imports the module directly (not via the rendering barrel) to keep the node
 * vitest env free of window-touching siblings.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RealEnvironmentService } from './RealEnvironmentService';
import type { KeyLightHost } from './RealSunService';

function makeKeyLightHost(): KeyLightHost {
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(10, 10, 10);
    return { get keyLight() { return light; } };
}

describe('RealEnvironmentService §FIX-GROUND-CATCHER-INVISIBLE-WHEN-EMPTY (L-107)', () => {
    let scene: THREE.Scene;
    let svc: RealEnvironmentService;

    beforeEach(() => {
        scene = new THREE.Scene();
        svc = new RealEnvironmentService();
        svc.bind(scene, makeKeyLightHost(), () => null, () => 0);
    });

    it('EMPTY scene → catcher is NOT in the scene (no grey plane, no visible pixels)', () => {
        svc.enable();
        expect(svc.groundShadowsEnabled).toBe(true); // ground shadows default ON …
        expect(svc.isGroundCatcherAttached()).toBe(false); // … but nothing to catch → not attached
        expect(scene.children).not.toContain(svc.ground.mesh);
    });

    it('first caster → catcher attaches and RECEIVES (not casts) the ground shadow', () => {
        svc.enable();
        svc.setSceneHasCasters(true);
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(scene.children).toContain(svc.ground.mesh);
        // The plane receives shadows and never casts (adds zero casters).
        expect(svc.ground.mesh.receiveShadow).toBe(true);
        expect(svc.ground.mesh.castShadow).toBe(false);
    });

    it('scene goes empty again → catcher is removed (no GPU dispose, ADR-0111 safe)', () => {
        svc.enable();
        svc.setSceneHasCasters(true);
        expect(svc.isGroundCatcherAttached()).toBe(true);

        svc.setSceneHasCasters(false);
        expect(svc.isGroundCatcherAttached()).toBe(false);
        // Material + geometry retained (not disposed) — instant re-attach possible.
        expect(svc.ground.mesh.material).toBeTruthy();
        expect(svc.ground.mesh.geometry).toBeTruthy();

        // Re-adding a caster re-attaches the SAME mesh.
        svc.setSceneHasCasters(true);
        expect(svc.isGroundCatcherAttached()).toBe(true);
    });

    it('toggling ground shadows ON with an empty scene must NOT show the plane', () => {
        svc.enable();
        svc.setGroundShadows(false);
        svc.setGroundShadows(true); // user turns it on, but scene is still empty
        expect(svc.isGroundCatcherAttached()).toBe(false);
    });

    it('ground-shadows OFF removes the catcher even when casters exist', () => {
        svc.enable();
        svc.setSceneHasCasters(true);
        expect(svc.isGroundCatcherAttached()).toBe(true);
        svc.setGroundShadows(false);
        expect(svc.isGroundCatcherAttached()).toBe(false);
    });
});
