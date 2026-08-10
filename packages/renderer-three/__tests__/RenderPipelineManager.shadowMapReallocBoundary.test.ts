/**
 * §SHADOW-MAP-REALLOC-AT-BOUNDARY (founder P0, 2026-08-10) — the realloc-vs-submit
 * ordering fix for the light-owned ShadowDepthTexture.
 *
 * FOUNDER EVIDENCE (deploy 7657195d): new project → draw a few walls →
 *
 *   [PascalSceneLighting] Shadow flags set on 41 mesh(es).
 *   [RenderPipelineManager] §RECOVERY-MUST-REFUSE a SHADOW depth resource was
 *     destroyed while still referenced by an in-flight submit … "Destroyed texture
 *     [Texture "ShadowDepthTexture"] used in a submit. — While calling
 *     [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])"
 *   → crash → recovery → SAME error → infinite refuse/recover loop.
 *
 * ROOT CAUSE (three r183 WebGPU node path): `ShadowNode` holds ITS OWN reference
 * to the shadow render target (ShadowNode.js:563-564 assigns `this.shadowMap` AND
 * `shadow.map` to the same object) and never re-reads `shadow.map`.
 * `ShadowQualityUpgrader._deferReleaseShadowMap` nulled `shadow.map` and disposed
 * the old target at the next frame boundary — a WebGL-era recipe that on WebGPU is
 * a use-after-free BY CONSTRUCTION: the node keeps rendering into and sampling the
 * destroyed target every frame, forever (its size still matches `mapSize`, so the
 * node's own `setSize` at ShadowNode.js:662 never re-creates it), and a pipeline
 * rebuild cannot reach a light-owned map (§RECOVERY-MUST-REFUSE — correctly).
 *
 * WHAT THESE TESTS PIN:
 *   1. the realloc queue resizes the light-owned target via its OWN setSize()
 *      (THREE's sanctioned realloc) — it never disposes and never nulls;
 *   2. the drain happens at the FRAME BOUNDARY (top of render(), alongside the GPU
 *      release drain) and NOT while the shadow map is frozen;
 *   3. a burst of tier changes coalesces to ONE realloc at the final size;
 *   4. recoverFromRenderFailure() performs the one repair a pipeline rebuild
 *      cannot: it signals shadow-casting lights to re-own fresh maps (three's
 *      AnalyticLightNode 'dispose' listener) BEFORE rebuilding — so a refused
 *      shadow-class failure can actually heal instead of livelocking.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    scheduleShadowMapRealloc,
    pendingShadowMapReallocCount,
    drainShadowMapReallocQueue,
    type ReallocatableLightShadow,
} from '../src/safeDispose.js';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A LightShadow-shaped double with a live, allocated map. */
function makeShadow(mapW = 1024, mapH = 1024, sizeW = 1024, sizeH = 1024) {
    const map = {
        width: mapW,
        height: mapH,
        setSize: vi.fn((w: number, h: number) => { map.width = w; map.height = h; }),
        dispose: vi.fn(),
    };
    const shadow: ReallocatableLightShadow & { map: typeof map } = {
        map,
        mapSize: { width: sizeW, height: sizeH },
        needsUpdate: false,
    };
    return shadow;
}

/** Minimal RPM whose render() reaches the boundary drains (WebGPU path, no pipeline). */
function makeRpm() {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer = {
        backend: { isWebGPUBackend: true },
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        getSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        setSize: () => { /* noop */ },
    };
    return rpm;
}

describe('§SHADOW-MAP-REALLOC-AT-BOUNDARY — queue semantics', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        drainShadowMapReallocQueue(); // isolate
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('resizes a mismatched map via its OWN setSize — never dispose, never nulling', () => {
        const sh = makeShadow(1024, 1024, 2048, 2048);
        scheduleShadowMapRealloc(sh);

        // Nothing happens on the mutation tick (TOOTH: the old code disposed here-ish).
        expect(sh.map.setSize).not.toHaveBeenCalled();
        expect(pendingShadowMapReallocCount()).toBe(1);

        expect(drainShadowMapReallocQueue()).toBe(1);
        expect(sh.map.setSize).toHaveBeenCalledTimes(1);
        expect(sh.map.setSize).toHaveBeenCalledWith(2048, 2048);
        // The invariant this whole fix exists for: the light-owned target is
        // NEVER externally disposed and NEVER detached from the shadow.
        expect(sh.map.dispose).not.toHaveBeenCalled();
        expect(sh.map).not.toBeNull();
        // One depth regen at the new resolution.
        expect(sh.needsUpdate).toBe(true);
    });

    it('a size-consistent map is left completely alone (no churn)', () => {
        const sh = makeShadow(2048, 2048, 2048, 2048);
        scheduleShadowMapRealloc(sh);
        expect(drainShadowMapReallocQueue()).toBe(0);
        expect(sh.map.setSize).not.toHaveBeenCalled();
        expect(sh.needsUpdate).toBe(false);
    });

    it('a shadow with no live map needs nothing — THREE allocates at the live mapSize', () => {
        const sh: ReallocatableLightShadow = { map: null, mapSize: { width: 2048, height: 2048 } };
        scheduleShadowMapRealloc(sh);
        expect(drainShadowMapReallocQueue()).toBe(0); // no throw, nothing to do
    });

    it('a burst of tier changes coalesces to ONE realloc at the FINAL size', () => {
        const sh = makeShadow(512, 512, 2048, 2048);
        scheduleShadowMapRealloc(sh);  // tier → high (2048)
        sh.mapSize.width = 4096;       // tier → ultra before the boundary
        sh.mapSize.height = 4096;
        scheduleShadowMapRealloc(sh);  // Set-deduplicated

        expect(pendingShadowMapReallocCount()).toBe(1);
        drainShadowMapReallocQueue();
        expect(sh.map.setSize).toHaveBeenCalledTimes(1);
        expect(sh.map.setSize).toHaveBeenCalledWith(4096, 4096);
    });

    it('one bad handle does not strand the rest of the batch, and never throws', () => {
        const bad = makeShadow(512, 512, 1024, 1024);
        bad.map.setSize.mockImplementation(() => { throw new Error('device lost'); });
        const good = makeShadow(512, 512, 1024, 1024);
        scheduleShadowMapRealloc(bad);
        scheduleShadowMapRealloc(good);

        expect(() => drainShadowMapReallocQueue()).not.toThrow();
        expect(good.map.setSize).toHaveBeenCalledWith(1024, 1024);
    });

    it('rejects degenerate sizes rather than resizing a target to zero', () => {
        const sh = makeShadow(1024, 1024, 0, 0);
        scheduleShadowMapRealloc(sh);
        drainShadowMapReallocQueue();
        expect(sh.map.setSize).not.toHaveBeenCalled();
    });
});

describe('§SHADOW-MAP-REALLOC-AT-BOUNDARY — the frame owner drains at the boundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        drainShadowMapReallocQueue();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('render() performs the queued realloc at the top of the frame', () => {
        const rpm = makeRpm();
        const sh = makeShadow(1024, 1024, 2048, 2048);
        scheduleShadowMapRealloc(sh);

        rpm.render();

        expect(sh.map.setSize).toHaveBeenCalledWith(2048, 2048);
        expect(pendingShadowMapReallocCount()).toBe(0);
    });

    it('render() HOLDS the realloc while the shadow map is frozen, and performs it on the first unfrozen frame', () => {
        const rpm = makeRpm();
        const sh = makeShadow(1024, 1024, 2048, 2048);
        scheduleShadowMapRealloc(sh);

        // Frozen (the §FIX-SHADOW-LOAD-TIER-DESTROY / rebuild-guard window): the depth
        // pass is suppressed, so destroying-and-not-regenerating would leave the main
        // pass sampling a dead texture. The queue must hold.
        rpm._shadowFrozenState = true;
        rpm.render();
        expect(sh.map.setSize).not.toHaveBeenCalled();
        expect(pendingShadowMapReallocCount()).toBe(1);

        // Thawed: the realloc lands at the boundary and the depth pass regenerates.
        rpm._shadowFrozenState = false;
        rpm.render();
        expect(sh.map.setSize).toHaveBeenCalledWith(2048, 2048);
    });
});

describe('§RECOVERY-MUST-REFUSE companion — recovery re-owns light shadow maps', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    function makeLight(castShadow = true) {
        return {
            isLight: true,
            castShadow,
            shadow: {},
            dispatchEvent: vi.fn(),
        };
    }

    it('recoverFromRenderFailure() signals every shadow-casting light BEFORE rebuilding', () => {
        const rpm = makeRpm();
        rpm._rebuildPipeline = vi.fn(async () => {});
        const caster = makeLight(true);
        const nonCaster = makeLight(false);
        rpm._scene = {
            traverse: (cb: (o: unknown) => void) => { cb(caster); cb(nonCaster); cb({}); },
        };

        expect(rpm.recoverFromRenderFailure()).toBe(true);

        // The one repair a pipeline rebuild cannot perform: three's AnalyticLightNode
        // listens for the light's 'dispose' event and drops its ShadowNode (and the
        // destroyed ShadowDepthTexture) so the rebuild mints a FRESH map. Without
        // this the guard's retry hit the SAME destroyed texture and looped forever.
        expect(caster.dispatchEvent).toHaveBeenCalledWith({ type: 'dispose' });
        expect(nonCaster.dispatchEvent).not.toHaveBeenCalled();
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });

    it('a scene-less manager still recovers (the sweep is best-effort)', () => {
        const rpm = makeRpm();
        rpm._rebuildPipeline = vi.fn(async () => {});
        rpm._scene = null;
        expect(rpm.recoverFromRenderFailure()).toBe(true);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });
});
