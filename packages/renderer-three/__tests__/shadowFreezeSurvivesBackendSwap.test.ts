// §SHADOW-PER-LIGHT-FREEZE-IS-SCENE-STATE (L-1480) / §SHADOW-CASTER-DECLARED-BUT-
// UNSATISFIABLE (L-1482) — the separating test for the founder's
// "I open the project and I see just LINES OF PROFILES of walls / slabs on 3D view".
//
// ── WHAT WENT WRONG (all of it measured, none of it inferred) ────────────────────
// `RenderPipelineManager._applyShadowFreezeState()` wrote the PER-LIGHT
// `LightShadow.autoUpdate` / `.needsUpdate` flags inside `if (this._webGpuActive)`.
// Its comment justified that as *"WebGL2 fallback owns its own shadowMap and honours the
// renderer-level flag"*. The installed three r183 source says otherwise:
//
//   node_modules/.pnpm/three@0.183.2/…/renderers/webgl/WebGLShadowMap.js
//     :95   if ( scope.autoUpdate === false && scope.needsUpdate === false ) return;      ← renderer-level
//     :170  if ( shadow.autoUpdate === false && shadow.needsUpdate === false ) continue;  ← PER-LIGHT
//
// The classic `WebGLShadowMap` honours BOTH. So a freeze taken on the WebGPU path wrote
// `light.shadow.autoUpdate = false`, the `§AUTO-WEBGL-HEAVY` live swap then disposed the
// manager (zeroing the freeze COUNTERS but never applying the thaw) and re-bound it to a
// classic `THREE.WebGLRenderer` with `_webGpuActive === false` — so the per-light restore
// was skipped and the LIGHTS, which the swap deliberately keeps, stayed frozen forever.
//
// Downstream, that is not "no shadows". `WebGLLights.setup()` counts a caster by
// `castShadow`, never by whether its map exists (`WebGLLights.js:243-259`, `:459-465`), so
// `numDirLightShadows` is still 1, `USE_SHADOWMAP` is still defined, every LIT program
// still declares `uniform sampler2DShadow directionalShadowMap[1]`
// (`shadowmap_pars_fragment.glsl.js:18-20`), and three can only satisfy it with
// `emptyShadowTexture` — which has `version === 0` so it is never uploaded
// (`WebGLTextures.js:518`) and resolves to a 1×1 **RGBA8** with `TEXTURE_COMPARE_MODE =
// NONE` (`WebGLState.js:951`). A `sampler2DShadow` bound to a non-comparison colour
// texture is incomplete for that sampler, so the driver raises `INVALID_OPERATION` and
// DROPS THE DRAW — every lit mesh, every frame.
//
// ⭐ And that is the whole mesh-vs-line split the founder photographed: `LineBasicMaterial`
// compiles `ShaderLib.basic` → `meshbasic.glsl.js`, which includes **no `shadowmap_*` chunk
// at all**. Lines declare no shadow sampler, so lines draw. Solids do not.
//
// ── WHAT THIS TEST PROVES, AND WHAT IT DOES NOT ─────────────────────────────────
// ⭐ It drives the REAL `RenderPipelineManager` through the REAL swap sequence
// (bind WebGPU → freeze → dispose → bind classic) against REAL `THREE.DirectionalLight` /
// `THREE.LightShadow` / `THREE.Scene` objects. The SUBJECT of every assertion — the light's
// shadow flags — is genuine three state, and the PREDICATE is copied verbatim from
// `WebGLShadowMap.js:170`, cited above. So this is not "a function was called": it asserts
// the exact condition that decides whether `shadow.map` is ever allocated, which is the
// condition that decides whether a solid is drawn.
//
// ⛔ HONESTLY STATED, so nobody reads more into a green bar than it earns: the RENDERER is a
// structural fake. There is no GL context in vitest, so this file cannot count real draw
// calls or observe the `INVALID_OPERATION`. The link from "stranded per-light flag" to
// "dropped draw" is established by the three-source citations above, not by this test.
// What this test makes impossible is the STRANDING — the one link that lives in our code.
// A fake renderer must never be allowed to answer a question about our own code; it is used
// here only as the thing our code writes flags ONTO.

import { describe, expect, it } from 'vitest';
import * as THREE from '../src/three-re-export.js';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

// ── Fakes: ONLY the renderer, and only the fields this manager reads ─────────────

/** A native-WebGPU renderer: `backend.isWebGPUBackend === true` is the sole signal. */
function fakeWebGpuRenderer(): any {
    return {
        isWebGPURenderer: true,
        backend: { isWebGPUBackend: true },
        shadowMap: { enabled: true, type: null, autoUpdate: true, needsUpdate: false },
        setClearColor() { /* no-op */ },
    };
}

/**
 * A classic `THREE.WebGLRenderer` as `WebGLRendererAdapter` builds it: no
 * `isWebGPURenderer`, no `backend`, and `shadowMap.enabled = true` set in the ctor
 * (`WebGLRendererAdapter.ts:97`).
 */
function fakeClassicWebGlRenderer(): any {
    return {
        isWebGPURenderer: undefined,
        shadowMap: { enabled: true, type: null, autoUpdate: true, needsUpdate: false },
        setClearColor() { /* no-op */ },
        getRenderTarget() { return null; },
        setRenderTarget() { /* no-op */ },
        autoClear: true,
        render() { /* no GL; the frame boundary is what we need, not pixels */ },
    };
}

/** The founder's scene shape: a shadow-casting key light kept across the swap. */
function sceneWithKeyLight(): { scene: THREE.Scene; key: THREE.DirectionalLight } {
    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 1);
    key.name = 'PascalKeyLight';
    key.castShadow = true;
    scene.add(key);
    return { scene, key };
}

/**
 * three r183 `WebGLShadowMap.js:170`, verbatim, inverted into "will this light's depth
 * pass EVER run?". This is the predicate the whole defect turns on.
 */
function depthPassCanRun(shadow: THREE.DirectionalLightShadow): boolean {
    return !(shadow.autoUpdate === false && shadow.needsUpdate === false);
}

const camera = new THREE.PerspectiveCamera();

describe('§SHADOW-PER-LIGHT-FREEZE-IS-SCENE-STATE (L-1480) — a WebGPU freeze must not survive into a classic-WebGL bind', () => {
    it('THE SEPARATING CASE — after freeze-on-WebGPU → dispose → bind(classic), the key light can still render its depth pass', async () => {
        const { scene, key } = sceneWithKeyLight();
        const rpm = new RenderPipelineManager();

        // 1. Boot on native WebGPU. (`bind()` loads TSL, which is absent in Node — it
        //    catches and records a pipeline error. `_webGpuActive` is set BEFORE that, and
        //    that flag is all this defect needs, so the sequence is faithful.)
        await rpm.bind(scene, camera, fakeWebGpuRenderer(), 'light', true);
        expect(rpm.status.webGpuActive).toBe(true);

        // 2. Project OPEN pushes the whole-load / tier-escalation shadow freeze
        //    (§FIX-SHADOW-LOAD-TIER-DESTROY). On WebGPU this writes the PER-LIGHT flag.
        rpm.setShadowReallocFrozen(true);
        expect(key.shadow.autoUpdate).toBe(false);
        expect(depthPassCanRun(key.shadow)).toBe(false); // frozen ON PURPOSE, still on WebGPU

        // 3. `tier:post-load` fires §AUTO-WEBGL-HEAVY, which live-swaps. The swap disposes
        //    the manager FIRST — zeroing the freeze counters WITHOUT applying a thaw. The
        //    scene, and therefore this exact light object, is deliberately kept.
        rpm.dispose();

        // 4. Re-bind to the classic THREE.WebGLRenderer the swap just built.
        await rpm.bind(scene, camera, fakeClassicWebGlRenderer(), 'light', false);

        // ⭐ THE ASSERTION. Before the fix this was `false`: the per-light restore sat
        // inside `if (this._webGpuActive)`, which is now false, so `autoUpdate` stayed
        // stranded at `false` — `WebGLShadowMap.js:170` would `continue` forever,
        // `shadow.map` would never be allocated, and every lit mesh draw would be dropped
        // while `LineBasicMaterial` edges kept drawing.
        expect(depthPassCanRun(key.shadow)).toBe(true);
        expect(key.shadow.autoUpdate).toBe(true);
    });

    it('the per-light freeze is asserted on EVERY backend, not just WebGPU (arm on the CONDITION — L-1350 rule)', async () => {
        const { scene, key } = sceneWithKeyLight();
        const rpm = new RenderPipelineManager();

        // Strand the flag the way a previous session could: set it directly on the light,
        // as three itself would leave it after any frozen pass.
        key.shadow.autoUpdate = false;
        key.shadow.needsUpdate = false;

        // A bind to a NON-WebGPU renderer must re-assert the un-frozen state onto the
        // light. This is the arm that used to be skipped.
        await rpm.bind(scene, camera, fakeClassicWebGlRenderer(), 'light', false);

        expect(key.shadow.autoUpdate).toBe(true);
        expect(depthPassCanRun(key.shadow)).toBe(true);
    });

    it('a DELIBERATE freeze still freezes — the fix must not disarm the device-loss guard it was built for', async () => {
        const { scene, key } = sceneWithKeyLight();
        const rpm = new RenderPipelineManager();
        await rpm.bind(scene, camera, fakeWebGpuRenderer(), 'light', true);

        rpm.setShadowReallocFrozen(true);
        expect(key.shadow.autoUpdate).toBe(false);   // ADR-0111: skip the pass, keep the texture

        rpm.setShadowReallocFrozen(false);
        expect(key.shadow.autoUpdate).toBe(true);
        expect(key.shadow.needsUpdate).toBe(true);   // one refresh against the settled scene
    });
});

describe('§SHADOW-CASTER-DECLARED-BUT-UNSATISFIABLE (L-1482) — the tripwire that makes the silence loud', () => {
    it('counts a caster whose depth pass can never run AND which has no map to reuse', async () => {
        const { scene, key } = sceneWithKeyLight();
        const rpm = new RenderPipelineManager();
        await rpm.bind(scene, camera, fakeClassicWebGlRenderer(), 'light', false);

        // Strand it AFTER the bind, so the bind-time assert cannot mask the tripwire.
        key.shadow.autoUpdate = false;
        key.shadow.needsUpdate = false;
        // `shadow.map` is null — nothing has ever rendered a depth pass for this light.
        expect(key.shadow.map).toBeNull();

        expect(rpm.auditShadowCasters()).toBe(1);
    });

    it('reports 0 for a healthy caster (autoUpdate true ⇒ the pass runs ⇒ the map gets built)', async () => {
        const { scene } = sceneWithKeyLight();
        const rpm = new RenderPipelineManager();
        await rpm.bind(scene, camera, fakeClassicWebGlRenderer(), 'light', false);
        expect(rpm.auditShadowCasters()).toBe(0);
    });

    it('reports 0 when shadows are OFF at the renderer — no lit program declares a shadow sampler at all', async () => {
        const { scene, key } = sceneWithKeyLight();
        const rpm = new RenderPipelineManager();
        const renderer = fakeClassicWebGlRenderer();
        await rpm.bind(scene, camera, renderer, 'light', false);

        key.shadow.autoUpdate = false;
        key.shadow.needsUpdate = false;
        renderer.shadowMap.enabled = false;

        // `shadowMapEnabled` in WebGLPrograms.js:344 is `renderer.shadowMap.enabled &&
        // shadows.length > 0`, so with the renderer flag off there is no sampler2DShadow
        // to be unsatisfiable — a stranded caster cannot invalidate a draw here.
        expect(rpm.auditShadowCasters()).toBe(0);
    });
});

describe("§A-TEARDOWN-RELEASES-THE-RENDERER-NOT-THE-CALLER'S-LATCH (L-1485) — dispose() must not answer on a caller's behalf", () => {
    it("a user's Cast-shadows OFF preference SURVIVES a backend swap (dispose → bind)", async () => {
        const { scene } = sceneWithKeyLight();
        const rpm = new RenderPipelineManager();
        await rpm.bind(scene, camera, fakeWebGpuRenderer(), 'light', true);

        // The user turns shadows off in the render rail. Nothing re-seeds this after a
        // swap — the panel wrote once, at the moment they clicked.
        rpm.setShadowsEnabledPreference('user', false);

        // §AUTO-WEBGL-HEAVY swaps: dispose, then re-bind the SAME singleton.
        rpm.dispose();
        const renderer = fakeClassicWebGlRenderer();
        await rpm.bind(scene, camera, renderer, 'light', false);

        // ⭐ Before L-1485, `dispose()` called `_shadowPrefs.clear()` and their choice was
        // silently reverted to ON by a renderer swap they never asked for.
        expect(renderer.shadowMap.enabled).toBe(false);
    });

    it('an IN-FLIGHT batch suppression survives a mid-generation swap (its owner has not released yet)', async () => {
        const { scene } = sceneWithKeyLight();
        const rpm = new RenderPipelineManager();
        await rpm.bind(scene, camera, fakeWebGpuRenderer(), 'light', true);

        // BatchCoordinator holds 'batch' for the DURATION of a heavy generation and
        // releases it up to 30 s later. §AUTO-WEBGL-HEAVY fires its swap MID-batch.
        rpm.setShadowPassDisabled('batch', true);

        rpm.dispose();
        const renderer = fakeClassicWebGlRenderer();
        await rpm.bind(scene, camera, renderer, 'light', false);

        // ⭐ Before L-1485 this read `true`: the classic renderer then ran a full
        // WebGLShadowMap depth pass over every castShadow mesh, every frame, for the rest
        // of the generation — the exact cost the swap was performed to avoid — and the
        // eventual release deleted a key that was no longer there (a silent no-op).
        expect(renderer.shadowMap.enabled).toBe(false);

        // And the owner's release still lands on the new renderer.
        rpm.setShadowPassDisabled('batch', false);
        expect(renderer.shadowMap.enabled).toBe(true);
    });
});
