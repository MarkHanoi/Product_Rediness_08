/**
 * §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) + §CATCHER-GATED-ON-A-LIVE-CASTING-LIGHT (L-1941).
 *
 * THE DEFECT. The founder has reported "the 3D viewport background is grey, it should be
 * white" six times. Five fixes targeted `scene.background` / the renderer clear colour.
 * On his backend both of those measure #ffffff by construction
 * (`RenderPipelineManager._applyViewportBackground`, §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME),
 * so none of them could ever have closed it: **the grey is DRAWN**.
 *
 * What draws it is this class's ground shadow-catcher — a `THREE.ShadowMaterial` plane
 * 4 km across. On three r183's node renderer (used by BOTH the 'webgpu' and the
 * 'webgl-fallback' backends) that material compiles to `ShadowNodeMaterial` ->
 * `ShadowMaskModel`, whose whole body is `diffuseColor.a *= shadowMask.oneMinus()` with
 * `shadowMask` the product of every shadow-casting light's mask
 * (`three/src/nodes/functions/ShadowMaskModel.js`). `ShadowNode.setupShadowFilter()`
 * returns 1 (lit -> transparent) only OUTSIDE the shadow camera frustum; inside it the
 * mask is a depth-texture compare, and EVERY failure of that compare — a map never
 * rendered, one allocated by a rival renderer, a mismatched compare function — produces
 * 0, which is bit-identical to "fully shadowed". The plane then paints a flat 32 % black
 * wash, ~#adadad over white.
 *
 * WHAT THESE TESTS DO AND DO NOT ESTABLISH. Nothing here runs a GPU, so nothing here can
 * say WHICH of those failures fires in the founder's session — that is measured by
 * `window.pryzmViewportGreyPixelProbe()` (§VIEWPORT-GREY-PIXEL-PROBE, L-1942), which
 * reads the real framebuffer with the catcher shown and hidden. This suite pins the two
 * CONTAINMENTS that hold regardless of the answer:
 *
 *   L-1940 — the painted surface follows the casters and is sized to their extent plus
 *            the sun's real shadow throw, so its worst case is the ground the model
 *            stands on, never the viewport. (It also fixes a second, independent defect:
 *            the plane was hard-centred on the world origin and never followed an
 *            off-origin model.)
 *   L-1941 — the catcher is hidden while the scene's sole shadow-CASTING LIGHT is not
 *            casting. §L-205 gated on mesh casters and never on the light, so
 *            §PERF-HEAVY-SHADOW-OFF could clear `keyLight.castShadow` on a heavy scene
 *            while the plane stayed visible, painting a mask that no shadow pass wrote.
 *
 * Neither is "turn ground shadows off" — real shadows still land, which the throw is
 * what guarantees.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RealEnvironmentService } from './RealEnvironmentService';
import type { KeyLightHost } from './RealSunService';

/** A key-light host whose light can be re-posed / un-cast by the test. */
function makeKeyLightHost(): { host: KeyLightHost; light: THREE.DirectionalLight } {
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(10, 10, 10);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    return { host: { get keyLight() { return light; } }, light };
}

/** A shadow-casting box standing in for a building. */
function addCaster(scene: THREE.Scene, x: number, z: number, w = 4, h = 10): THREE.Mesh {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial());
    box.castShadow = true;
    box.receiveShadow = true;
    box.position.set(x, h / 2, z);
    box.updateMatrixWorld(true);
    return scene.add(box), box;
}

describe('RealEnvironmentService §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940)', () => {
    let scene: THREE.Scene;
    let svc: RealEnvironmentService;
    let light: THREE.DirectionalLight;

    beforeEach(() => {
        scene = new THREE.Scene();
        svc = new RealEnvironmentService();
        const k = makeKeyLightHost();
        light = k.light;
        svc.bind(scene, k.host, () => null, () => 0);
        svc.enable();
        // enable() drives the real sun, which re-poses the key light. Pin it AFTER, so
        // the shadow-throw arithmetic under test is deterministic (the sun re-solves only
        // on discrete input, never on this path).
        light.position.set(10, 10, 10);
        light.target.position.set(0, 0, 0);
    });

    it('with no caster measured yet, the constructed 4 km plane is left alone (and hidden)', () => {
        expect(svc.ground.footprint.size).toBe(svc.ground.footprint.baseSize);
        expect(svc.ground.mesh.visible).toBe(false);
    });

    it('THE HEADLINE — once a caster exists the plane stops being a 4 km surface', () => {
        addCaster(scene, 0, 0);
        svc.updateGroundCatcherVisibility();

        const fp = svc.ground.footprint;
        expect(fp.baseSize).toBe(4000);
        // A five-storey-ish caster at a 45-degree sun cannot need anything close to 4 km.
        expect(fp.size).toBeLessThan(200);
        // ...but it must still comfortably contain the caster itself.
        expect(fp.size).toBeGreaterThan(12);
        expect(svc.ground.mesh.visible).toBe(true);
    });

    it('the plane FOLLOWS an off-origin model (it used to stay pinned to the world origin)', () => {
        addCaster(scene, 200, -150);
        svc.updateGroundCatcherVisibility();

        const fp = svc.ground.footprint;
        expect(fp.centreX).toBeCloseTo(200, 3);
        expect(fp.centreZ).toBeCloseTo(-150, 3);
        expect(svc.ground.mesh.position.x).toBeCloseTo(200, 3);
        expect(svc.ground.mesh.position.z).toBeCloseTo(-150, 3);
    });

    it('the footprint SPANS every caster, not just the first one the sweep met', () => {
        addCaster(scene, -60, 0);
        addCaster(scene, 60, 0);
        svc.updateGroundCatcherVisibility();

        const fp = svc.ground.footprint;
        // Casters span 120 m centre-to-centre; the plane must cover that plus the throw.
        expect(fp.size).toBeGreaterThan(120);
        expect(fp.centreX).toBeCloseTo(0, 3);
    });

    it('a TALLER caster earns a LARGER plane — the throw is real, not a constant pad', () => {
        addCaster(scene, 0, 0, 4, 10);
        svc.updateGroundCatcherVisibility();
        const shortSize = svc.ground.footprint.size;

        scene.clear();
        addCaster(scene, 0, 0, 4, 40);
        svc.updateGroundCatcherVisibility();
        const tallSize = svc.ground.footprint.size;

        expect(tallSize).toBeGreaterThan(shortSize);
    });

    it('a LOWER sun earns a LARGER plane — the throw follows the light direction', () => {
        addCaster(scene, 0, 0, 4, 10);
        light.position.set(10, 100, 10); // high sun -> short shadow
        svc.updateGroundCatcherVisibility();
        const highSun = svc.ground.footprint.size;

        light.position.set(10, 3, 10);   // low sun -> long shadow
        svc.updateGroundCatcherVisibility();
        const lowSun = svc.ground.footprint.size;

        expect(lowSun).toBeGreaterThan(highSun);
    });

    it('never grows past the constructed size, however extreme the caster set', () => {
        addCaster(scene, -50_000, 0);
        addCaster(scene, 50_000, 0, 4, 5000);
        light.position.set(10, 0.001, 10); // sun on the horizon -> throw clamps
        svc.updateGroundCatcherVisibility();
        expect(svc.ground.footprint.size).toBeLessThanOrEqual(4000);
    });

    it('the catcher is excluded from its own bounds (it must never size itself)', () => {
        // No real caster at all: the only mesh in the scene is the 4 km catcher.
        svc.updateGroundCatcherVisibility();
        expect(svc.sceneHasCasters).toBe(false);
        expect(svc.ground.footprint.size).toBe(4000); // untouched, and hidden
        expect(svc.ground.mesh.visible).toBe(false);
    });
});

describe('RealEnvironmentService §CATCHER-GATED-ON-A-LIVE-CASTING-LIGHT (L-1941)', () => {
    let scene: THREE.Scene;
    let svc: RealEnvironmentService;
    let light: THREE.DirectionalLight;

    beforeEach(() => {
        scene = new THREE.Scene();
        svc = new RealEnvironmentService();
        const k = makeKeyLightHost();
        light = k.light;
        svc.bind(scene, k.host, () => null, () => 0);
        svc.enable();
    });

    it('mesh casters alone are NOT enough — a suppressed key light hides the plane', () => {
        addCaster(scene, 0, 0);
        svc.updateGroundCatcherVisibility();
        expect(svc.ground.mesh.visible).toBe(true);

        // Exactly what PascalSceneLighting.setShadowsSuppressed(true) does on a heavy
        // scene (>= 8000 meshes). Before L-1941 the plane stayed visible right through
        // it, compositing a mask that no shadow pass had written.
        light.castShadow = false;
        svc.updateGroundCatcherVisibility();

        expect(svc.sceneHasCasters).toBe(true);   // the meshes are still there...
        expect(svc.ground.mesh.visible).toBe(false); // ...but nothing can shadow them.
    });

    it('is fully reversible — restoring the light restores the ground shadow', () => {
        addCaster(scene, 0, 0);
        light.castShadow = false;
        svc.updateGroundCatcherVisibility();
        expect(svc.ground.mesh.visible).toBe(false);

        light.castShadow = true;
        svc.updateGroundCatcherVisibility();
        expect(svc.ground.mesh.visible).toBe(true);
        // Never detached — L-112: the receiver stays in the shadow-sampling set.
        expect(svc.isGroundCatcherAttached()).toBe(true);
    });

    it('the receiver is NEVER detached by either gate (L-112 receive path preserved)', () => {
        addCaster(scene, 0, 0);
        light.castShadow = false;
        svc.updateGroundCatcherVisibility();
        expect(scene.children).toContain(svc.ground.mesh);
        svc.setGroundShadows(false);
        expect(scene.children).toContain(svc.ground.mesh);
    });
});
