/**
 * §FIX-SHADOW-CATCHER-RESTORE (L-112) + §L-205 caster-visibility gate.
 *
 * The ground shadow-catcher must be ATTACHED UP FRONT (at enable()) so it is in the
 * renderer's shadow-sampling set from the first frame and RECEIVES the real sun-cast
 * building shadow (L-112). Its VISIBILITY is gated on caster presence (§L-205): a
 * `ShadowMaterial` plane with NO caster composites as fully-shadowed → an opaque grey
 * fill on WebGPU (the empty-project grey square), so it is hidden with 0 casters and
 * shown the moment the first caster lands. The receiver is NEVER dropped from the graph
 * (that late-attach is what broke shadow receive on WebGPU in L-107); only `mesh.visible`
 * flips — a pure scene-graph boolean with no GPU work.
 *
 * §REVERT-SHADOW-TO-KNOWN-GOOD (L-205): the fitted shadow frustum, the light re-home, the
 * first-caster ScenePass rebuild hook, and the forced shadow refresh (onKeyLightDriven)
 * were reverted to the last-known-good 72e34915. This suite pins the ONLY behaviour kept
 * from the reverted stack — the caster-visibility gate — and does NOT assert any of the
 * removed seams.
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
    light.castShadow = true;
    return { get keyLight() { return light; } };
}

/** A shadow-casting box, standing in for a building. */
function addCaster(scene: THREE.Scene): THREE.Mesh {
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 4), new THREE.MeshStandardMaterial());
    box.castShadow = true;
    box.receiveShadow = true;
    box.position.set(0, 5, 0);
    scene.add(box);
    return box;
}

describe('RealEnvironmentService §FIX-SHADOW-CATCHER-RESTORE (L-112) + §L-205 caster gate', () => {
    let scene: THREE.Scene;
    let svc: RealEnvironmentService;

    beforeEach(() => {
        scene = new THREE.Scene();
        svc = new RealEnvironmentService();
        svc.bind(scene, makeKeyLightHost(), () => null, () => 0);
    });

    it('enable() attaches the receiver UP FRONT (L-112 receive) but keeps it INVISIBLE on an empty scene (no grey)', () => {
        svc.enable();
        // Attached from enable() — NOT deferred until a caster exists (that late-attach
        // is what broke shadow receive on WebGPU in L-107). Graph membership is stable.
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(scene.children).toContain(svc.ground.mesh);
        // Configured as a receiver: receives shadows, never casts (adds zero casters).
        expect(svc.ground.mesh.receiveShadow).toBe(true);
        expect(svc.ground.mesh.castShadow).toBe(false);
        expect(svc.ground.mesh.material).toBeInstanceOf(THREE.ShadowMaterial);
        // §L-205 — 0 casters ⇒ HIDDEN, so a brand-new empty project shows NO grey square.
        expect(svc.ground.mesh.visible).toBe(false);
        expect(svc.sceneHasCasters).toBe(false);
    });

    it('§L-205: 0 casters → catcher.visible=false; ≥1 caster → catcher.visible=true (and receiving)', () => {
        svc.enable();
        expect(svc.ground.mesh.visible).toBe(false);

        // Add a real shadow caster (a building) and re-run the caster gate.
        addCaster(scene);
        svc.updateGroundCatcherVisibility();

        // ≥1 caster → shown, still attached, still a receiver → the real ground shadow lands.
        expect(svc.sceneHasCasters).toBe(true);
        expect(svc.ground.mesh.visible).toBe(true);
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(svc.ground.mesh.receiveShadow).toBe(true);
    });

    it('§L-205: non-caster helper meshes (grid / datum) do NOT flip the gate', () => {
        svc.enable();
        const grid = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        grid.name = 'grid';
        const datum = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial());
        datum.castShadow = false;
        scene.add(grid, datum);
        svc.updateGroundCatcherVisibility();

        expect(svc.sceneHasCasters).toBe(false);
        expect(svc.ground.mesh.visible).toBe(false); // still no grey plane
    });

    it('receiver stays attached when a caster (building) is added — real shadow lands, catcher visible', () => {
        svc.enable();
        addCaster(scene);
        svc.updateGroundCatcherVisibility();
        // The receiver is (and remains) in the scene graph → in the shadow pass →
        // it receives the caster's real sun shadow, and is now visible (caster present).
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(svc.ground.mesh.receiveShadow).toBe(true);
        expect(svc.ground.mesh.visible).toBe(true);
    });

    it('moving the sun keeps the receiver attached and re-drives the key light', () => {
        svc.enable();
        addCaster(scene);
        const before = svc.sun.lastPosition?.altitude;
        svc.setSunTime(6);   // dawn
        const after = svc.sun.lastPosition?.altitude;
        // Receiver never leaves the scene; the sun angle changed (shadow moves).
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(after).not.toBe(before);
    });

    it('ground-shadows OFF hides the receiver; ON re-attaches it (visible because a caster is present)', () => {
        svc.enable();
        addCaster(scene);
        svc.updateGroundCatcherVisibility();
        expect(svc.ground.mesh.visible).toBe(true);

        svc.setGroundShadows(false);
        expect(svc.ground.mesh.visible).toBe(false);
        svc.setGroundShadows(true);
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(svc.ground.mesh.visible).toBe(true);
        expect(svc.ground.mesh.receiveShadow).toBe(true);
    });

    it('§L-205: toggling ground-shadows ON with an EMPTY scene shows NO grey plane (still hidden)', () => {
        svc.enable();
        svc.setGroundShadows(false);
        svc.setGroundShadows(true); // ON, but no caster → must stay hidden
        expect(svc.isGroundCatcherAttached()).toBe(true); // attached (in the shadow pass)
        expect(svc.ground.mesh.visible).toBe(false);       // but invisible → no grey
    });

    it('no synchronous GPU dispose on toggle (ADR-0111 safe) — material/geometry kept', () => {
        svc.enable();
        svc.setGroundShadows(false);
        svc.setGroundShadows(true);
        expect(svc.ground.mesh.material).toBeTruthy();
        expect(svc.ground.mesh.geometry).toBeTruthy();
    });
});
