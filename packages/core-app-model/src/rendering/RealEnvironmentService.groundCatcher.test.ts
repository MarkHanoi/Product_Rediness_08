/**
 * §FIX-SHADOW-CATCHER-RESTORE (L-112) — the ground shadow-catcher must be attached
 * UP FRONT (at enable()) so it is in the renderer's shadow-sampling set from the
 * first frame and RECEIVES the real sun-cast building shadow.
 *
 * Regression post-mortem: L-107 deferred the attach until the first shadow caster
 * arrived (a debounced scene sweep) to hide the empty-project grey rectangle. On
 * the live WebGPU/TSL renderer that late-attach dropped the receiver out of the
 * shadow pass — the plane stopped receiving the real building shadow (the founder's
 * "amazing" ground shadows disappeared). This test locks in the restored behaviour:
 * the receiver is present + shadow-receiving whenever ground shadows are on,
 * regardless of caster count, and is only shown/hidden by the user toggle — the
 * receive path is never gated on caster presence.
 *
 * Imports the module directly (not via the rendering barrel) to keep the node
 * vitest env free of window-touching siblings.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('RealEnvironmentService §FIX-SHADOW-CATCHER-RESTORE (L-112)', () => {
    let scene: THREE.Scene;
    let svc: RealEnvironmentService;

    beforeEach(() => {
        scene = new THREE.Scene();
        svc = new RealEnvironmentService();
        svc.bind(scene, makeKeyLightHost(), () => null, () => 0);
    });

    it('enable() attaches the receiver UP FRONT (L-112 receive) but keeps it INVISIBLE on an empty scene (L-107 no grey)', () => {
        svc.enable();
        // Attached from enable() — NOT deferred until a caster exists (that late-attach
        // is what broke shadow receive on WebGPU in L-107). Graph membership is stable.
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(scene.children).toContain(svc.ground.mesh);
        // Configured as a receiver: receives shadows, never casts (adds zero casters).
        expect(svc.ground.mesh.receiveShadow).toBe(true);
        expect(svc.ground.mesh.castShadow).toBe(false);
        expect(svc.ground.mesh.material).toBeInstanceOf(THREE.ShadowMaterial);
        // §FIX-WEBGPU-SHADOW-TIER-DESTROY-AND-GREY-CATCHER (L-200) — 0 casters ⇒ HIDDEN,
        // so a brand-new empty project shows NO opaque grey square. (L-112 restored the
        // grey as a tradeoff; L-200 reconciles: attached-up-front AND caster-gated.)
        expect(svc.ground.mesh.visible).toBe(false);
        expect(svc.sceneHasCasters).toBe(false);
    });

    it('§L-200: 0 casters → catcher.visible=false; ≥1 caster → catcher.visible=true (and receiving)', () => {
        svc.enable();
        // Empty scene → hidden.
        expect(svc.ground.mesh.visible).toBe(false);

        // Add a real shadow caster (a building) and re-run the caster gate.
        addCaster(scene);
        svc.refitShadowToScene();

        // ≥1 caster → shown, still attached, still a receiver → the real ground shadow lands.
        expect(svc.sceneHasCasters).toBe(true);
        expect(svc.ground.mesh.visible).toBe(true);
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(svc.ground.mesh.receiveShadow).toBe(true);
    });

    it('§L-202: refit with a caster REQUESTS a shadow refresh (onKeyLightDriven) so the WebGPU depth pass re-renders', () => {
        svc.enable();
        // Wire the receive-refresh seam (in production initScene routes this to
        // RenderPipelineManager.requestShadowRefresh — which restores autoUpdate + needsUpdate).
        const refresh = vi.fn();
        svc.sun.onKeyLightDriven = refresh;

        addCaster(scene);
        refresh.mockClear(); // ignore any drive during setup
        svc.refitShadowToScene();

        // The refit fitted the frustum to the caster AND drove the key light → a shadow
        // refresh was requested. Without this the map never re-renders → solid grey catcher.
        expect(refresh).toHaveBeenCalled();
        expect(svc.sceneHasCasters).toBe(true);
        expect(svc.ground.mesh.visible).toBe(true);
    });

    it('receiver stays attached when a caster (building) is added — real shadow lands', () => {
        svc.enable();
        addCaster(scene);
        svc.refitShadowToScene();
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
        // A caster is present, so the ground toggle governs visibility.
        addCaster(scene);
        svc.refitShadowToScene();
        expect(svc.ground.mesh.visible).toBe(true);

        svc.setGroundShadows(false);
        expect(svc.ground.mesh.visible).toBe(false);
        svc.setGroundShadows(true);
        expect(svc.isGroundCatcherAttached()).toBe(true);
        expect(svc.ground.mesh.visible).toBe(true);
        expect(svc.ground.mesh.receiveShadow).toBe(true);
    });

    it('§L-200: toggling ground-shadows ON with an EMPTY scene shows NO grey plane (still hidden)', () => {
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

/**
 * §FIX-WEBGPU-SCENEPASS-FIRST-CASTER — the WebGPU TSL ScenePass is composed against the
 * scene ONCE at boot (no caster present) and never rebuilt when one appears, so the shadow
 * graph never learns about the caster and the catcher composites as fully-shadowed (opaque
 * grey) with no projected shadow. The app wires `setFirstCasterHook` →
 * `RenderPipelineManager.scheduleShadowRebuild()`.
 *
 * The hook MUST fire on the 0→≥1 CASTER transition — not on "any new mesh". A brand-new
 * empty project already carries ~29 non-caster meshes (grid, datum sphere, helpers); an
 * earlier mesh-count gate let those consume the one-shot at project load, so the user's
 * first wall never triggered the rebuild and the grey plane persisted. These tests pin that.
 */
describe('RealEnvironmentService §FIX-WEBGPU-SCENEPASS-FIRST-CASTER — first-caster hook', () => {
    let scene: THREE.Scene;
    let svc: RealEnvironmentService;
    let hook: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        scene = new THREE.Scene();
        svc = new RealEnvironmentService();
        svc.bind(scene, makeKeyLightHost(), () => null, () => 0);
        hook = vi.fn();
        svc.setFirstCasterHook(hook);
    });

    it('does NOT fire on an empty scene, nor for non-caster helper meshes (the grid/datum bug)', () => {
        svc.enable();               // enable() refits: 0 casters
        expect(hook).not.toHaveBeenCalled();

        // Non-casters: a grid + a datum sphere + a plain mesh. None may consume the one-shot.
        const grid = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        grid.name = 'grid';
        const datum = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial());
        datum.castShadow = false;
        scene.add(grid, datum);
        svc.refitShadowToScene();

        expect(hook).not.toHaveBeenCalled();
        expect(svc.sceneHasCasters).toBe(false);
        expect(svc.ground.mesh.visible).toBe(false); // still no grey plane
    });

    it('fires EXACTLY ONCE on the first real caster, and the catcher becomes visible', () => {
        svc.enable();
        addCaster(scene);
        svc.refitShadowToScene();

        expect(hook).toHaveBeenCalledTimes(1);
        expect(svc.sceneHasCasters).toBe(true);
        expect(svc.ground.mesh.visible).toBe(true);

        // Further geometry must NOT re-trigger it (no per-event pipeline churn).
        addCaster(scene);
        svc.refitShadowToScene();
        expect(hook).toHaveBeenCalledTimes(1);
    });

    it('re-arms when the scene is emptied, so the next project rebuilds on ITS first caster', () => {
        svc.enable();
        const caster = addCaster(scene);
        svc.refitShadowToScene();
        expect(hook).toHaveBeenCalledTimes(1);

        scene.remove(caster);       // project switch / clear
        svc.refitShadowToScene();
        expect(svc.sceneHasCasters).toBe(false);

        addCaster(scene);           // new project's first caster
        svc.refitShadowToScene();
        expect(hook).toHaveBeenCalledTimes(2);
    });

    it('a throwing hook is non-fatal — the catcher still flips visible', () => {
        svc.setFirstCasterHook(() => { throw new Error('rpm unavailable'); });
        svc.enable();
        addCaster(scene);
        expect(() => svc.refitShadowToScene()).not.toThrow();
        expect(svc.ground.mesh.visible).toBe(true);
    });
});
