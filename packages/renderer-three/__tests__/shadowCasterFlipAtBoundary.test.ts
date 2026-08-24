/**
 * §SHADOW-CASTER-FLIP-AT-BOUNDARY (founder P0, L-10380) — the FREE half of the
 * light-owned-shadow lifetime, and the one every previous guard in this family
 * missed.
 *
 * FOUNDER EVIDENCE (2026-08-24, production, "this is happening often — and can
 * not [be] in production"):
 *
 *   Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
 *    - While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])
 *   → "The viewport failed to render." → 120 consecutive frames declined at
 *     gate `pipelineError`, §L-966 recovery budget exhausted (2/2).
 *
 * ── WHAT THESE TESTS ESTABLISH, AND IN WHICH ORDER ──────────────────────────
 * ARM A is the MECHANISM, asserted against the INSTALLED three r183.2 — real
 * `LightsNode`, real `DirectionalLightNode`, real event plumbing. It is a
 * CHARACTERISATION of three, not of our fix: it is green before and after, and
 * its job is to make the premise falsifiable rather than asserted in a comment.
 * ARM B pins the opt-in funnel. ARM C is the REGRESSION: it drives a real
 * `RenderPipelineManager` frame boundary with a BARE `castShadow` write — the
 * shape no call site announces — and was RED before the derived arm landed.
 *
 * ⚠ WHY THE PRE-EXISTING GUARD DID NOT COVER THIS. `runShadowCasterMutation()`
 * pauses submits AROUND THE WRITE. But three does not free the map when the flag
 * is written: `RenderObjects.get` only re-reads the render object's cache key
 * when `material.version` bumped or `needsUpdate` is set (RenderObjects.js:127-129),
 * so the flip sits LATENT and detonates on a LATER, unrelated event — inside that
 * frame's open command encoder. ARM A(4) pins exactly that latency.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from '../src/three-re-export';
import { DirectionalLightNode, LightsNode } from 'three/webgpu';
import {
    scheduleShadowCasterFlip,
    pendingShadowCasterFlipCount,
    drainShadowCasterFlipQueue,
    releaseLightOwnedShadowNow,
    lightOwnsLiveShadowMap,
    lightsWithPendingCasterRelease,
    type ShadowOwningLight,
} from '../src/safeDispose.js';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A live shadow render target double — stands in for the GPU-backed one. */
function makeLiveShadowMap() {
    return { dispose: vi.fn(), width: 2048, height: 2048, setSize: vi.fn() };
}

/**
 * A REAL shadow-casting DirectionalLight with a REAL `DirectionalLightNode`
 * attached, so the `'dispose'` listener under test is three's own
 * (AnalyticLightNode.js:99-107) and not something this file invented.
 */
function makeCasterWithNode() {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    (light.shadow as unknown as { map: unknown }).map = makeLiveShadowMap();
    const node = new (DirectionalLightNode as unknown as new (l: unknown) => {
        shadowNode: { dispose: () => void } | null;
        shadowColorNode: unknown;
        setup(builder: unknown): unknown;
    })(light);
    const shadowNodeDispose = vi.fn();
    node.shadowNode = { dispose: shadowNodeDispose };
    return { light, node, shadowNodeDispose };
}

describe('§SHADOW-CASTER-FLIP-AT-BOUNDARY — ARM A: the mechanism, against real three r183.2', () => {
    it('(1) AnalyticLightNode.setup() FREES the ShadowNode synchronously once castShadow is false', () => {
        const { light, node, shadowNodeDispose } = makeCasterWithNode();

        light.castShadow = false;
        try {
            // A bare builder double: the else-branch under test runs BEFORE
            // setupDirect(), so a later throw does not weaken the assertion.
            node.setup({ object: { receiveShadow: true }, renderer: { shadowMap: { enabled: true, type: 1 } } });
        } catch { /* expected — the rest of setup() needs a real NodeBuilder */ }

        // ShadowNode.dispose() → _reset() (ShadowNode.js:769) → shadowMap.dispose().
        // That target's depth texture is named "ShadowDepthTexture" at ShadowNode.js:396.
        expect(shadowNodeDispose).toHaveBeenCalledTimes(1);
        expect(node.shadowNode).toBeNull();
    });

    it('(2) the light\'s own `dispose` EVENT reaches disposeShadow() synchronously — the boundary-orderable signal', () => {
        const { light, node, shadowNodeDispose } = makeCasterWithNode();

        light.dispatchEvent({ type: 'dispose' } as never);

        expect(shadowNodeDispose).toHaveBeenCalledTimes(1);
        expect(node.shadowNode).toBeNull();
        // NOT light.dispose(): the light itself survives, only its shadow node goes.
        expect(light.parent).toBeNull();
        expect(light.isLight).toBe(true);
    });

    it('(3) LightsNode.customCacheKey() MOVES when a castShadow=false fixture light joins — the detonator', () => {
        const key = new THREE.DirectionalLight();
        key.castShadow = true;
        const fixture = new THREE.PointLight();
        fixture.castShadow = false; // LightingFragmentBuilder.ts:1525 — fixtures never cast

        const node = new LightsNode().setLights([key]);
        const before = node.customCacheKey();
        node.setLights([key, fixture]);
        const after = node.customCacheKey();

        // A light that owns NO shadow resource still invalidates the node cache key
        // (LightsNode.js:117-141 hashes every light's id), which is what makes a
        // LIGHTING PLACEMENT the event that executes someone else's latent free.
        expect(after).not.toBe(before);
    });

    it('(4) the caster flag ALONE moves the fingerprint — so the free is LATENT, not co-temporal with the write', () => {
        const key = new THREE.DirectionalLight();
        key.castShadow = true;
        const node = new LightsNode().setLights([key]);
        const casting = node.customCacheKey();

        key.castShadow = false;
        const notCasting = node.customCacheKey();

        // The fingerprint moved the instant the flag was written…
        expect(notCasting).not.toBe(casting);
        // …but three has freed NOTHING yet. The free waits for the next node build,
        // which happens inside the next open command encoder. THAT is the window a
        // guard wrapped around the write cannot cover.
        expect((key.shadow as unknown as { map: unknown }).map).toBeNull();
    });
});

describe('§SHADOW-CASTER-FLIP-AT-BOUNDARY — ARM B: the opt-in funnel', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        drainShadowCasterFlipQueue(); // isolate
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('nothing happens on the mutation tick; the flip AND the release land at the drain', () => {
        const { light, node, shadowNodeDispose } = makeCasterWithNode();

        scheduleShadowCasterFlip(light as unknown as ShadowOwningLight, false);
        // TOOTH: the old code wrote `light.castShadow = false` right here.
        expect(light.castShadow).toBe(true);
        expect(shadowNodeDispose).not.toHaveBeenCalled();
        expect(pendingShadowCasterFlipCount()).toBe(1);

        expect(drainShadowCasterFlipQueue()).toBe(1);
        expect(light.castShadow).toBe(false);
        // three's OWN release, performed at an instant we chose.
        expect(shadowNodeDispose).toHaveBeenCalledTimes(1);
        expect(node.shadowNode).toBeNull();
        // §L-819 — ShadowNode._reset() nulls only the NODE's reference; LightShadow.map
        // keeps pointing at the corpse unless we null it too.
        expect((light.shadow as unknown as { map: unknown }).map).toBeNull();
    });

    it('a BARE write leaves the free LATENT — which is exactly what the detector has to catch', () => {
        const { light, shadowNodeDispose } = makeCasterWithNode();

        light.castShadow = false; // the shape every unmigrated call site has

        expect(shadowNodeDispose).not.toHaveBeenCalled();
        expect(lightOwnsLiveShadowMap(light as unknown as ShadowOwningLight)).toBe(true);
        expect(lightsWithPendingCasterRelease([light as unknown as ShadowOwningLight]))
            .toHaveLength(1);
    });

    it('turning shadows back ON never releases anything', () => {
        const { light, shadowNodeDispose } = makeCasterWithNode();
        light.castShadow = false;
        scheduleShadowCasterFlip(light as unknown as ShadowOwningLight, true);
        expect(drainShadowCasterFlipQueue()).toBe(0);
        expect(light.castShadow).toBe(true);
        expect(shadowNodeDispose).not.toHaveBeenCalled();
    });

    it('a burst of flips coalesces to ONE boundary action at the FINAL value', () => {
        const { light } = makeCasterWithNode();
        const l = light as unknown as ShadowOwningLight;
        scheduleShadowCasterFlip(l, false);
        scheduleShadowCasterFlip(l, true);
        scheduleShadowCasterFlip(l, false);
        expect(pendingShadowCasterFlipCount()).toBe(1);
        expect(drainShadowCasterFlipQueue()).toBe(1);
        expect(light.castShadow).toBe(false);
    });

    it('a light with no live map, and a throwing handle, are both non-fatal', () => {
        const bare = new THREE.DirectionalLight();
        expect(releaseLightOwnedShadowNow(bare as unknown as ShadowOwningLight)).toBe(false);

        const { light } = makeCasterWithNode();
        vi.spyOn(light, 'dispatchEvent').mockImplementation(() => { throw new Error('device lost'); });
        expect(() => releaseLightOwnedShadowNow(light as unknown as ShadowOwningLight)).not.toThrow();
    });
});

/**
 * ⭐ THE REGRESSION. Drives a real `RenderPipelineManager.render()` frame boundary
 * against a BARE `castShadow` write — the shape no call site announces and no
 * existing guard covers. RED before the derived arm landed: the light kept its
 * live map, and three would have freed it from inside the next open encoder.
 */
describe('§SHADOW-CASTER-FLIP-AT-BOUNDARY — ARM C: the DERIVED arm catches a bare write', () => {
    /** RPM whose render() reaches the boundary drains on the WebGPU path. */
    function makeRig(lights: unknown[]) {
        const lightsNode = new LightsNode().setLights(lights as never[]);
        const nodeCaches = {
            _objects:   { dispose: vi.fn() },
            _pipelines: { dispose: vi.fn() },
            _nodes:     { dispose: vi.fn() },
            _bindings:  { dispose: vi.fn() },
        };
        const rpm = new RenderPipelineManager() as unknown as Record<string, unknown> & {
            render(delta?: number): void;
            boundaryCasterReleaseCount: number;
        };
        (rpm as Record<string, unknown>)._webGpuActive = true;
        (rpm as Record<string, unknown>)._scene = new THREE.Scene();
        (rpm as Record<string, unknown>)._renderer = {
            ...nodeCaches,
            lighting: { getNode: () => lightsNode },
            shadowMap: { enabled: true, type: 1, autoUpdate: true },
            backend: { isWebGPUBackend: true },
            domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
            getDrawingBufferSize: (t: { set?: (a: number, b: number) => unknown }) =>
                (t?.set ? (t.set(1200, 900), t) : { x: 1200, y: 900 }),
            getSize: (t: { set?: (a: number, b: number) => unknown }) =>
                (t?.set ? (t.set(1200, 900), t) : { x: 1200, y: 900 }),
            setSize: () => { /* noop */ },
        };
        return { rpm, nodeCaches };
    }

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        drainShadowCasterFlipQueue();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('a BARE castShadow=false is released AT THE FRAME BOUNDARY, with the node caches reset and submits paused', () => {
        const { light, node, shadowNodeDispose } = makeCasterWithNode();
        const { rpm, nodeCaches } = makeRig([light]);

        // Frame 1 — the settled state. Nothing to order.
        rpm.render();
        expect(shadowNodeDispose).not.toHaveBeenCalled();
        expect(rpm.boundaryCasterReleaseCount).toBe(0);

        // The defect, verbatim: a caster flip written from some other tick, with no
        // guard, no announcement and no queue.
        light.castShadow = false;

        // Frame 2 — the boundary sees the fingerprint move and performs three's own
        // release HERE, before any encoder for this frame could exist.
        rpm.render();

        expect(rpm.boundaryCasterReleaseCount).toBe(1);
        expect(shadowNodeDispose).toHaveBeenCalledTimes(1);
        expect(node.shadowNode).toBeNull();
        expect((light.shadow as unknown as { map: unknown }).map).toBeNull();
        // Nothing may still BIND the map we just freed (§L-819 — a pipeline rebuild
        // cannot reach a cached nodeBuilderState; only this reset can).
        expect(nodeCaches._objects.dispose).toHaveBeenCalledTimes(1);
        expect(nodeCaches._pipelines.dispose).toHaveBeenCalledTimes(1);
        expect(nodeCaches._nodes.dispose).toHaveBeenCalledTimes(1);
        expect(nodeCaches._bindings.dispose).toHaveBeenCalledTimes(1);
        // The frame that recompiles is one we do not submit.
        expect((rpm as unknown as Record<string, unknown>)._shadowRebuildPaused).toBe(true);
    });

    it('a steady caster set costs NOTHING — no release, no reset, no pause', () => {
        const { light, shadowNodeDispose } = makeCasterWithNode();
        const { rpm, nodeCaches } = makeRig([light]);

        rpm.render();
        rpm.render();
        rpm.render();

        expect(shadowNodeDispose).not.toHaveBeenCalled();
        expect(rpm.boundaryCasterReleaseCount).toBe(0);
        expect(nodeCaches._objects.dispose).not.toHaveBeenCalled();
        expect((rpm as unknown as Record<string, unknown>)._shadowRebuildPaused).toBe(false);
    });

    it('placing a shadowless fixture light moves the fingerprint but frees NOTHING', () => {
        const { light, shadowNodeDispose } = makeCasterWithNode();
        const fixture = new THREE.PointLight();
        fixture.castShadow = false;
        const lightsNode = new LightsNode().setLights([light] as never[]);
        const { rpm, nodeCaches } = makeRig([]);
        (rpm as unknown as Record<string, unknown>)._renderer = {
            ...(rpm as unknown as { _renderer: Record<string, unknown> })._renderer,
            lighting: { getNode: () => lightsNode },
        };

        rpm.render();
        // The founder's own trigger: LightingFragmentBuilder attaches a live light.
        lightsNode.setLights([light, fixture] as never[]);
        rpm.render();

        // The fingerprint moved (ARM A(3)), so the arm looked — and correctly found
        // nothing to release, because the key light is still casting.
        expect(shadowNodeDispose).not.toHaveBeenCalled();
        expect(rpm.boundaryCasterReleaseCount).toBe(0);
        expect(nodeCaches._objects.dispose).not.toHaveBeenCalled();
    });

    it('is inert on the WebGL2 fallback, which owns its own shadowMap', () => {
        const { light, shadowNodeDispose } = makeCasterWithNode();
        const { rpm } = makeRig([light]);
        (rpm as unknown as Record<string, unknown>)._webGpuActive = false;

        rpm.render();
        light.castShadow = false;
        rpm.render();

        expect(shadowNodeDispose).not.toHaveBeenCalled();
        expect(rpm.boundaryCasterReleaseCount).toBe(0);
    });
});
