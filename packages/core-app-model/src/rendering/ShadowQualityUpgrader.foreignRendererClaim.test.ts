/**
 * §SHADOW-ENABLE-IS-NOT-OURS (L-1000, founder P0 2026-08-18 / L-981) — the
 * shadow-map destroy that is STILL not ordered against submission, eight days
 * after §SHADOW-MAP-REALLOC-AT-BOUNDARY closed the one THIS package owned.
 *
 * ── WHY THE EXISTING BOUNDARY QUEUE CANNOT SEE IT ────────────────────────────
 * `scheduleShadowMapRealloc` / `drainShadowMapReallocQueue` order the LIVE
 * renderer's realloc against the LIVE renderer's submit. The destroy in the
 * founder's log comes from a DIFFERENT RENDERER. PRYZM runs two over ONE scene:
 * the live PRYZM WebGPU renderer, and OBC's `PostproductionRenderer` (a plain
 * `WebGLRenderer`). A THREE light has exactly ONE `LightShadow.map` slot, and
 * both renderers claim it.
 *
 * three r183 `WebGLShadowMap.render()`, the only branches that matter:
 *     line  93:  if ( scope.enabled === false ) return;        ← THE gate
 *     line 203:  if ( shadow.map === null || typeChanged === true ) {
 *     line 209:      shadow.map.depthTexture.dispose();
 *     line 214:      shadow.map.dispose();     ← frees the WebGPU-owned target
 *     line 227:      shadow.map = new WebGLRenderTarget( … );  ← claims the slot
 * That free happens on an OBC frame — outside `RenderPipelineManager.render()`,
 * outside every freeze latch, outside BOTH boundary queues. It is unreachable
 * from `_rebuildPipeline()`, which is exactly why §RECOVERY-MUST-REFUSE refuses
 * and why L-981's ladder spends 2/2 and still dies.
 *
 * ── THE INVARIANT THIS PINS, AND WHO ELSE ALREADY DECLARES IT ────────────────
 *   • `BimWorld.ts:117` — `world.renderer.three.shadowMap.enabled = false`,
 *     §FIX-SHADOWMAP-DUAL-RENDERER-CLAIM (L-205): "MUST stay false".
 *   • `initScene.ts:1948/1979/2057` — asserts it false three times on the
 *     Phase-5 hand-over.
 *   • `ViewController.ts:2486` — "BUG-FIX (bug 1): shadowMap.enabled MUST
 *     remain false" on every 3D-view restore.
 *   • `RenderPipelineManager._applyShadowEnabledState()` (renderer-three, the
 *     L1 THREE owner — P2) — "THE ONLY writer of `renderer.shadowMap.enabled`".
 *
 * ⚠ `ShadowQualityUpgrader` wrote that flag anyway — in `apply()` and in
 * `setShadowsEnabled()` — on the renderer `RenderingPipelineCoordinator.bind()`
 * hands it, which `initScene.ts:2310` makes `postproductionRenderer.three`: the
 * OBC WebGL renderer. One L4 module re-armed the exact flag four other modules'
 * invariant forbids, and it is the gate on every line quoted above. The tier
 * escalation on PROJECT OPEN is what runs `apply()`, which is why the founder's
 * crash is deterministic on open.
 *
 * ⛔ NOT a timing fix and NOT a feature removal. Nothing here delays or disables
 * the tier change: the quality change still happens, at the same moment, through
 * the same boundary queue (see the non-regression block at the bottom). What
 * changes is OWNERSHIP — the upgrader stops handing a second renderer permission
 * to free a resource the first one is still submitting with.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    drainGpuReleaseQueue,
    drainShadowMapReallocQueue,
} from '@pryzm/renderer-three';
import { ShadowQualityUpgrader } from './ShadowQualityUpgrader';

interface ClaimableTarget {
    isRenderTarget: true;
    name: string;
    width: number;
    height: number;
    // Explicitly parameterised: a bare `ReturnType<typeof vi.fn>` is
    // `Mock<Procedure | Constructable>`, which TS refuses to call directly — and
    // this harness must CALL these, not merely assert on them.
    depthTexture: { dispose: Mock<() => void> } | null;
    texture: { name: string; dispose: Mock<() => void> };
    setSize: Mock<(w: number, h: number) => void>;
    dispose: Mock<() => void>;
}

function makeTarget(name: string, w = 1024, h = 1024): ClaimableTarget {
    const t: ClaimableTarget = {
        isRenderTarget: true,
        name,
        width: w,
        height: h,
        depthTexture: { dispose: vi.fn() },
        texture: { name: 'ShadowDepthTexture', dispose: vi.fn() },
        setSize: vi.fn((nw: number, nh: number) => { t.width = nw; t.height = nh; }),
        dispose: vi.fn(),
    };
    return t;
}

interface ObcShadowMapState {
    type: unknown;
    enabled: boolean;
    autoUpdate: boolean;
    needsUpdate: boolean;
}

/**
 * The OBC `PostproductionRenderer` as the app really configures it: a
 * WebGLRenderer whose `shadowMap.enabled` is FALSE (BimWorld.ts:117) and whose
 * `shadowMap.type` already matches the live renderer's (both adapters land on
 * `PCFShadowMap`), so `typeChanged` is false until somebody moves one of them.
 */
function obcWebGlRenderer(): THREE.WebGLRenderer & { shadowMap: ObcShadowMapState } {
    return {
        shadowMap: {
            type: THREE.PCFShadowMap as unknown,
            enabled: false,
            autoUpdate: true,
            needsUpdate: false,
        },
    } as unknown as THREE.WebGLRenderer & { shadowMap: ObcShadowMapState };
}

/**
 * A faithful reduction of three r183 `WebGLShadowMap.render()` — ONLY the
 * branches that touch `shadow.map`, at the line numbers cited in the header.
 * Driving the real branch (rather than asserting on a flag alone) is what makes
 * this a lifetime control and not a style check: if the gate at :93 opens, the
 * free at :214 happens, and the assertion below fails for the RIGHT reason.
 */
function makeObcShadowPass() {
    let previousType: unknown = THREE.PCFShadowMap;
    return function obcShadowPass(
        renderer: THREE.WebGLRenderer & { shadowMap: ObcShadowMapState },
        light: THREE.DirectionalLight,
    ): { ran: boolean; claimed: boolean } {
        const sm = renderer.shadowMap;
        if (sm.enabled === false) return { ran: false, claimed: false };              // :93
        if (sm.autoUpdate === false && sm.needsUpdate === false) {                    // :94
            return { ran: false, claimed: false };
        }
        const shadow = light.shadow as unknown as { map: ClaimableTarget | null };
        const typeChanged = previousType !== sm.type;
        previousType = sm.type;

        let claimed = false;
        if (shadow.map === null || typeChanged === true) {                            // :203
            if (shadow.map !== null) {
                shadow.map.depthTexture?.dispose();                                   // :209
                shadow.map.dispose();                                                 // :214
            }
            shadow.map = makeTarget('webgl-claimed');                                 // :227
            claimed = true;
        }
        return { ran: true, claimed };
    };
}

/**
 * The live viewport state when a tier change lands on project open: the Pascal
 * key light casts, and the WebGPU `ShadowNode` has already allocated the
 * ShadowDepthTexture and published it into the light's single `shadow.map` slot
 * (ShadowNode.js:563-564 assigns both, and the node NEVER re-reads `shadow.map`).
 */
function sceneWithWebGpuOwnedMap() {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.name = 'pascal-key-light';
    light.castShadow = true;
    const webGpuTarget = makeTarget('webgpu-ShadowDepthTexture');
    (light.shadow as unknown as { map: unknown }).map = webGpuTarget;
    scene.add(light);
    return { scene, light, webGpuTarget };
}

describe('§SHADOW-ENABLE-IS-NOT-OURS — the upgrader must not arm a second renderer over the shared shadow slot', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        drainGpuReleaseQueue();
        drainShadowMapReallocQueue();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('apply() leaves shadowMap.enabled exactly as it found it (BimWorld §FIX-SHADOWMAP-DUAL-RENDERER-CLAIM, L-205)', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene } = sceneWithWebGpuOwnedMap();
        const obc = obcWebGlRenderer();

        upgrader.apply(obc, scene, 'high');

        // TOOTH: apply() used to write `renderer.shadowMap.enabled = true` here.
        // That single write is the gate on WebGLShadowMap.js:93 — with it, every
        // OBC frame walks the branch that frees the WebGPU-owned target.
        expect(obc.shadowMap.enabled).toBe(false);
    });

    it('ORDERING: a shadow-quality change never lets a foreign renderer free the in-flight map', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light, webGpuTarget } = sceneWithWebGpuOwnedMap();
        const obc = obcWebGlRenderer();
        const obcShadowPass = makeObcShadowPass();

        // Project open: the tier escalates to cinematic, the shadow level to high.
        upgrader.apply(obc, scene, 'high');
        drainShadowMapReallocQueue(); // the frame owner's boundary drain (ordered, ours)

        // …and now an OBC frame ticks. It is NOT our frame boundary and honours
        // none of our freeze latches. (ViewController._forceRendererUpdate and
        // _setupViewListeners both set `world.renderer.needsUpdate = true` with no
        // Phase-5 guard, so this frame is reachable on any view switch or orbit.)
        const pass = obcShadowPass(obc, light);

        // The invariant: while a submitted command buffer still references the
        // target, nothing may destroy it and nothing may swap it out from under
        // the ShadowNode that is still sampling it.
        expect(webGpuTarget.dispose).not.toHaveBeenCalled();
        expect(webGpuTarget.depthTexture?.dispose).not.toHaveBeenCalled();
        expect(pass.claimed).toBe(false);
        expect((light.shadow as unknown as { map: unknown }).map).toBe(webGpuTarget);
    });

    it('ORDERING: the same holds across a live level change (the user drags shadow quality)', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light, webGpuTarget } = sceneWithWebGpuOwnedMap();
        const obc = obcWebGlRenderer();
        const obcShadowPass = makeObcShadowPass();

        upgrader.apply(obc, scene, 'standard');
        drainShadowMapReallocQueue();
        upgrader.setLevel('ultra');
        drainShadowMapReallocQueue();

        const pass = obcShadowPass(obc, light);
        expect(pass.ran).toBe(false);        // the foreign pass never even runs
        expect(webGpuTarget.dispose).not.toHaveBeenCalled();
        expect((light.shadow as unknown as { map: unknown }).map).toBe(webGpuTarget);
    });

    it('restore() does not re-arm the flag on the way out either', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene } = sceneWithWebGpuOwnedMap();
        const obc = obcWebGlRenderer();

        upgrader.apply(obc, scene, 'high');
        upgrader.restore();

        expect(obc.shadowMap.enabled).toBe(false);
    });

    it('setShadowsEnabled() drives castShadow, never the foreign renderer flag', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light } = sceneWithWebGpuOwnedMap();
        const obc = obcWebGlRenderer();

        upgrader.apply(obc, scene, 'high');
        drainShadowMapReallocQueue();

        upgrader.setShadowsEnabled(false);
        expect(light.castShadow).toBe(false);      // the real lever, unchanged
        expect(obc.shadowMap.enabled).toBe(false);

        upgrader.setShadowsEnabled(true);
        expect(light.castShadow).toBe(true);
        expect(obc.shadowMap.enabled).toBe(false); // still not ours to write
    });

    it('an OBC renderer that a legitimate owner HAS armed still frees the map — proving the harness has teeth', () => {
        // The negative control. If this test ever passes with `enabled = true`,
        // the reduction above has stopped modelling WebGLShadowMap and every
        // assertion in this file is worthless.
        const { light, webGpuTarget } = sceneWithWebGpuOwnedMap();
        const obc = obcWebGlRenderer();
        const obcShadowPass = makeObcShadowPass();

        obc.shadowMap.enabled = true;
        obc.shadowMap.type = THREE.VSMShadowMap; // forces typeChanged

        const pass = obcShadowPass(obc, light);
        expect(pass.ran).toBe(true);
        expect(pass.claimed).toBe(true);
        expect(webGpuTarget.dispose).toHaveBeenCalledTimes(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// NON-REGRESSION — shadow quality must still ACTUALLY change. A fix that made
// the crash go away by making the feature inert would be worse than the crash.
// ─────────────────────────────────────────────────────────────────────────────
describe('§SHADOW-ENABLE-IS-NOT-OURS — non-regression: quality still changes', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        drainGpuReleaseQueue();
        drainShadowMapReallocQueue();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('apply("high") still delivers resolution, bias, radius and the PCF parity type', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light, webGpuTarget } = sceneWithWebGpuOwnedMap();
        const obc = obcWebGlRenderer();

        upgrader.apply(obc, scene, 'high');
        drainShadowMapReallocQueue(); // the boundary, where resolution lands

        expect(light.shadow.mapSize.width).toBe(2048);
        expect(webGpuTarget.setSize).toHaveBeenCalledWith(2048, 2048);
        expect(light.shadow.bias).toBeCloseTo(-0.00005);
        expect((light.shadow as unknown as { radius: number }).radius).toBe(4);
        // §FIX-SHADOW-SAMPLER-TYPE-PARITY — the type write is retained (and is a
        // no-op against the PCFShadowMap the renderer already carries, so it can
        // never flip `typeChanged` on a foreign pass either).
        expect(obc.shadowMap.type).toBe(THREE.PCFShadowMap);
        expect(upgrader.applied).toBe(true);
        expect(upgrader.currentLevel).toBe('high');
    });

    it('setLevel("ultra") still steps the resolution up at the boundary', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light, webGpuTarget } = sceneWithWebGpuOwnedMap();

        upgrader.apply(obcWebGlRenderer(), scene, 'high');
        drainShadowMapReallocQueue();
        webGpuTarget.setSize.mockClear();

        upgrader.setLevel('ultra');
        drainShadowMapReallocQueue();

        expect(light.shadow.mapSize.width).toBe(4096);
        expect(webGpuTarget.setSize).toHaveBeenCalledWith(4096, 4096);
        expect(upgrader.currentLevel).toBe('ultra');
    });

    it('restore() still puts the pre-upgrade resolution back at the boundary', () => {
        const upgrader = new ShadowQualityUpgrader();
        const { scene, light } = sceneWithWebGpuOwnedMap();
        const before = light.shadow.mapSize.width;

        upgrader.apply(obcWebGlRenderer(), scene, 'ultra');
        drainShadowMapReallocQueue();
        expect(light.shadow.mapSize.width).toBe(4096);

        upgrader.restore();
        drainShadowMapReallocQueue();
        expect(light.shadow.mapSize.width).toBe(before);
        expect(upgrader.applied).toBe(false);
    });
});
