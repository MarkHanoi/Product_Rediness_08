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
    isShadowResourceError,
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

// ─────────────────────────────────────────────────────────────────────────────
// §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY (L-819) — the mapSize WRITE itself is
// deferred to the drain.
//
// PRODUCTION EVIDENCE (app.pryzm.so, saved-project open, 2026-08-10): the first
// revision of this queue had callers write `shadow.mapSize` on the mutation tick
// and deferred only the resize. During the load-window freeze the drain is held,
// so mapSize (2048) and the allocated map (512) DISAGREED across many frames —
// and `needsUpdate = true` from any freeze-bypassing writer (live offender:
// RenderPerformanceService.setQualityLevel's per-light poke) made three's
// ShadowNode run its OWN `shadowMap.setSize(shadow.mapSize…)` MID-PASS
// (updateBefore runs after backend.beginRender has opened the frame's command
// encoder), destroying the ShadowDepthTexture that encoder's earlier draws
// referenced → "Destroyed texture [ShadowDepthTexture] used in a submit …
// CommandEncoder renderContext_1" → §RECOVERY-MUST-REFUSE → crash modal.
// ─────────────────────────────────────────────────────────────────────────────
describe('§SHADOW-MAPSIZE-WRITE-AT-BOUNDARY — mapSize and the allocated map can never disagree across a frame', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        drainShadowMapReallocQueue();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('scheduling a resolution change does NOT write mapSize on the mutation tick', () => {
        const sh = makeShadow(1024, 1024, 1024, 1024);
        scheduleShadowMapRealloc(sh, 4096, 4096);

        // TOOTH: the old contract had the caller write mapSize first. That opened
        // the divergence window three's ShadowNode turns into a mid-encode destroy.
        expect(sh.mapSize.width).toBe(1024);
        expect(sh.map.setSize).not.toHaveBeenCalled();

        drainShadowMapReallocQueue();
        // The drain lands BOTH, atomically, at the boundary.
        expect(sh.mapSize.width).toBe(4096);
        expect(sh.map.setSize).toHaveBeenCalledWith(4096, 4096);
        expect(sh.needsUpdate).toBe(true);
    });

    it('a not-yet-allocated shadow still receives its mapSize at the boundary (mint path)', () => {
        const sh: ReallocatableLightShadow = { map: null, mapSize: { width: 512, height: 512 } };
        scheduleShadowMapRealloc(sh, 2048, 2048);
        expect(sh.mapSize.width).toBe(512); // unchanged until the boundary

        expect(drainShadowMapReallocQueue()).toBe(0); // no live map — nothing realloc'd
        expect(sh.mapSize.width).toBe(2048);          // …but THREE will mint at 2048
    });

    it('a burst of requests coalesces to the LAST requested size', () => {
        const sh = makeShadow(512, 512, 512, 512);
        scheduleShadowMapRealloc(sh, 2048, 2048); // tier → high
        scheduleShadowMapRealloc(sh, 4096, 4096); // tier → ultra before the boundary

        expect(pendingShadowMapReallocCount()).toBe(1);
        drainShadowMapReallocQueue();
        expect(sh.map.setSize).toHaveBeenCalledTimes(1);
        expect(sh.map.setSize).toHaveBeenCalledWith(4096, 4096);
        expect(sh.mapSize.width).toBe(4096);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §L-819 — the dangling-shadow-node TypeError is a SHADOW-lifetime fault, and
// the recovery lever must actually heal it.
// ─────────────────────────────────────────────────────────────────────────────
const DANGLING_SHADOW_NODE_TYPEERROR =
    "Cannot read properties of null (reading 'depthTexture')";

describe('§L-819 — dangling-shadow-node TypeError classification + non-retry routing', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

    it('isShadowResourceError matches the ShadowNode.updateShadow null-map TypeError', () => {
        expect(isShadowResourceError(new TypeError(DANGLING_SHADOW_NODE_TYPEERROR))).toBe(true);
        // The original signatures still match…
        expect(isShadowResourceError('Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.')).toBe(true);
        // …and unrelated failures still do not.
        expect(isShadowResourceError(new Error('some transient pass failure'))).toBe(false);
    });

    it('a render() throw of the TypeError REFUSES the retry ladder and drives the REAL repair', () => {
        // Production burned "rebuild attempt 1/3" against a fault a pipeline rebuild
        // provably cannot fix (the cached node states are not recompiled), then hit
        // the SAME destroyed-texture error and exhausted into the modal. The ladder
        // refusal below is that fix, unchanged.
        //
        // §L-966 — but "not the ladder" was never a reason to do NOTHING, and this
        // test used to assert exactly that (`phase === 'error'` on the FIRST report,
        // no rebuild at all) — i.e. it pinned the founder's dead viewport as correct.
        // The repair that DOES heal this fault class is the one this very file's
        // §L-819 block proves works: re-own the light maps, reset the compiled node
        // states, then rebuild. It is now driven automatically, within a bound.
        const rpm = makeRpm();
        rpm._scene = { traverse: () => {} };
        rpm._camera = {};
        rpm._renderer.setClearAlpha = () => {};
        rpm._renderPipeline = { render: () => { throw new TypeError(DANGLING_SHADOW_NODE_TYPEERROR); }, dispose: () => {} };
        rpm._rebuildPipeline = vi.fn(async () => {});
        rpm._recreateLightOwnedShadowMaps = vi.fn();
        rpm._resetCompiledNodeStates      = vi.fn();
        rpm._safeDisposeRenderPipeline    = vi.fn();

        rpm.render(0.016);

        // The ladder is still refused — that invariant is untouched.
        expect(rpm.status.retryCount).toBe(0);        // never entered the ladder
        expect(vi.getTimerCount()).toBe(0);           // no 500ms backoff armed

        // …and the real repair ran instead of the viewport simply dying.
        expect(rpm._recreateLightOwnedShadowMaps).toHaveBeenCalledTimes(1);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
        expect(rpm.status.phase).not.toBe('error');
    });
});

describe('§L-819 — recoverFromRenderFailure heals the whole shadow fault class', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('nulls the LightShadow.map corpse after the re-own signal', () => {
        // ShadowNode._reset() (via the light's 'dispose' listener) nulls only the
        // NODE's reference; `shadow.map` kept pointing at the DISPOSED target.
        const rpm = makeRpm();
        rpm._rebuildPipeline = vi.fn(async () => {});
        const disposedTarget = { dispose: vi.fn() };
        const caster = {
            isLight: true, castShadow: true,
            shadow: { map: disposedTarget } as { map: unknown },
            dispatchEvent: vi.fn(),
        };
        rpm._scene = { traverse: (cb: (o: unknown) => void) => cb(caster) };

        expect(rpm.recoverFromRenderFailure()).toBe(true);

        expect(caster.dispatchEvent).toHaveBeenCalledWith({ type: 'dispose' });
        expect(caster.shadow.map).toBeNull();
    });

    it('resets the compiled node states (three teardown order) BEFORE the pipeline rebuild', () => {
        // LightsNode reuses AnalyticLightNode by light.id and NodeManager serves
        // cached nodeBuilderStates — a pipeline rebuild invalidates neither, so the
        // disposed ShadowNode's updateBefore kept firing (the null-depthTexture
        // TypeError) and its sampler kept referencing the destroyed texture
        // (renderContext_6/7 recurrence). Only a node-state reset mints the fresh
        // ShadowNode at the next build.
        const calls: string[] = [];
        const rpm = makeRpm();
        rpm._renderer._objects   = { dispose: vi.fn(() => calls.push('_objects')) };
        rpm._renderer._pipelines = { dispose: vi.fn(() => calls.push('_pipelines')) };
        rpm._renderer._nodes     = { dispose: vi.fn(() => calls.push('_nodes')) };
        rpm._renderer._bindings  = { dispose: vi.fn(() => calls.push('_bindings')) };
        rpm._rebuildPipeline = vi.fn(async () => { calls.push('rebuild'); });
        rpm._scene = { traverse: () => {} };

        expect(rpm.recoverFromRenderFailure()).toBe(true);

        // three r183 Renderer.dispose() order, then the rebuild LAST.
        expect(calls).toEqual(['_objects', '_pipelines', '_nodes', '_bindings', 'rebuild']);
    });

    it('a renderer without the internal caches still recovers (structural access is optional)', () => {
        const rpm = makeRpm(); // fake renderer has none of _objects/_pipelines/_nodes/_bindings
        rpm._rebuildPipeline = vi.fn(async () => {});
        rpm._scene = { traverse: () => {} };
        expect(rpm.recoverFromRenderFailure()).toBe(true);
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });

    it('a throwing internal dispose does not abort the recovery', () => {
        const rpm = makeRpm();
        rpm._renderer._nodes = { dispose: vi.fn(() => { throw new Error("Cannot read properties of undefined (reading 'usedTimes')"); }) };
        rpm._renderer._bindings = { dispose: vi.fn() };
        rpm._rebuildPipeline = vi.fn(async () => {});
        rpm._scene = { traverse: () => {} };

        expect(rpm.recoverFromRenderFailure()).toBe(true);
        expect(rpm._renderer._bindings.dispose).toHaveBeenCalled(); // later caches still reset
        expect(rpm._rebuildPipeline).toHaveBeenCalledTimes(1);
    });
});
