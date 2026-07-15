// §FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — the projection-toggle fast path must
// NEVER compile a RenderPipeline against a camera whose live projection contradicts the
// authority uniform (`_uIsOrthographic`).
//
// ROOT (see the block comment in `_rebuildPipelineGraphOnly`): `notifyProjectionToggle`
// writes the authority uniform synchronously, but OBC flips `world.camera.three` to the
// new projection ASYNCHRONOUSLY. So on elevation/plan → 3D the window 'view-activated'
// event runs `updateCamera` while the live camera is STILL orthographic; compiling the
// pipeline against that mid-transition camera makes three's WGSL program assembly resolve
// a camera-type-dependent node to `undefined` and throw `.replace(undefined)` on the first
// `rp.render()` (the founder's demo-critical `PIPELINE_FAILURE ... reading 'replace'`).
//
// THE ASSERTION WITH TEETH against the stale-camera read is:
//   "when the pipeline-bound camera's projection contradicts the authority, the graph is
//    NOT compiled (no `_safeDisposeRenderPipeline` → no pipeline swap); it is DEFERRED."
// A test that only asserts "the graph rebuilt" is NOT a guard. Removing the guard early-
// return in `_rebuildPipelineGraphOnly` makes the RED-proof cases below fail: the compile
// seam (`_safeDisposeRenderPipeline`) fires against the orthographic camera and the defer
// seam never runs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

// Fake `three/webgpu` so the graph-only compile path can run without a real GPU/device.
vi.mock('three/webgpu', () => ({
    RenderPipeline: class {
        outputNode: unknown = null;
        constructor(_renderer: unknown) { /* no-op */ }
        render(): void { /* no-op */ }
        dispose(): void { /* no-op */ }
    },
}));

/** A chainable TSL-node stub: every property access / call returns another node stub,
 *  so the phase-2 graph (`.a`, `.rgb`, `.max`, `mix`, `vec4`, `step`, `float`, …) builds
 *  without the real TSL runtime. */
function node(): any {
    return new Proxy(() => node(), {
        get: (_t, prop) => (prop === 'then' ? undefined : node()),
        apply: () => node(),
    });
}

type AnyRpm = Record<string, any>;

/** Put the manager into the exact fast-path state `updateCamera` Guard 2 leaves behind:
 *  WebGPU active, TSL loaded, passes present, and an authority uniform. */
function primeFastPath(rpm: RenderPipelineManager): AnyRpm {
    const anyRpm = rpm as unknown as AnyRpm;
    anyRpm._webGpuActive = true;
    anyRpm._scene     = {};            // non-null so _rebuildPipelineGraphOnly passes its guard
    anyRpm._camera    = {};            // overridden per test (projection flags decide the guard)
    anyRpm._scenePass = { getTextureNode: vi.fn(() => node()), camera: null };
    anyRpm._zonePass  = node();
    anyRpm._backgroundUniform = null; // graph falls back to vec4(...) stub
    anyRpm._renderer  = {};           // _currentBackendDevice() → null (try/catch)
    return anyRpm;
}

beforeEach(() => {
    (globalThis as any).__PRYZM_TSL__ = {
        vec4:  () => node(),
        mix:   () => node(),
        step:  () => node(),
        float: () => node(),
    };
});

afterEach(() => {
    delete (globalThis as any).__PRYZM_TSL__;
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('§FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — compile-camera vs authority predicate', () => {
    // The predicate is the single source of truth: does the camera we would compile against
    // present the SAME projection the authority uniform declares?
    const cases: Array<{ name: string; uniform: number | null; cam: any; expected: boolean }> = [
        // THE bug: authority says perspective (0.0) but the live camera is still orthographic.
        { name: 'authority=perspective, camera=orthographic (the L-301 stale read)', uniform: 0.0, cam: { isOrthographicCamera: true },  expected: false },
        // Mid-flip: neither flag set yet — also contradicts (not yet the authority's projection).
        { name: 'authority=perspective, camera=neither (mid-transition)',            uniform: 0.0, cam: {},                              expected: false },
        { name: 'authority=perspective, camera=perspective (settled)',               uniform: 0.0, cam: { isPerspectiveCamera: true },  expected: true  },
        { name: 'authority=orthographic, camera=perspective (stale, other dir)',     uniform: 1.0, cam: { isPerspectiveCamera: true },  expected: false },
        { name: 'authority=orthographic, camera=orthographic (settled)',             uniform: 1.0, cam: { isOrthographicCamera: true }, expected: true  },
        // No authority (TSL not loaded) — nothing to contradict, proceed.
        { name: 'authority=null (TSL not loaded)',                                   uniform: null, cam: { isOrthographicCamera: true }, expected: true  },
    ];

    for (const c of cases) {
        it(`returns ${c.expected} for ${c.name}`, () => {
            const rpm = new RenderPipelineManager();
            const anyRpm = rpm as unknown as AnyRpm;
            anyRpm._uIsOrthographic = c.uniform === null ? null : { value: c.uniform };
            anyRpm._camera = c.cam;
            expect(anyRpm._compileCameraMatchesProjectionAuthority()).toBe(c.expected);
        });
    }
});

describe('§FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — fast path never compiles against a contradicting camera', () => {
    it('DEFERS instead of compiling when the bound camera is still orthographic (TEETH)', async () => {
        const rpm = new RenderPipelineManager();
        const anyRpm = primeFastPath(rpm);
        anyRpm._uIsOrthographic = { value: 0.0 }; // authority: perspective
        anyRpm._camera = { isOrthographicCamera: true }; // stale: still orthographic

        const deferSpy   = vi.spyOn(rpm as any, '_deferGraphRebuildUntilCameraSettles').mockImplementation(() => {});
        const disposeSpy = vi.spyOn(rpm as any, '_safeDisposeRenderPipeline');

        await (rpm as any)._rebuildPipelineGraphOnly(false);

        // Teeth: the compile seam is NEVER reached (no pipeline swap against the ortho camera)…
        expect(disposeSpy).not.toHaveBeenCalled();
        // …and the rebuild is deferred until the camera settles.
        expect(deferSpy).toHaveBeenCalledTimes(1);
    });

    it('drives the founder repro: notifyProjectionToggle(false) → updateCamera(orthoCamera) defers, does not compile', async () => {
        const rpm = new RenderPipelineManager();
        const anyRpm = primeFastPath(rpm);
        anyRpm._uIsOrthographic = { value: 1.0 }; // pre-toggle state (was orthographic)

        // Arm the fast path exactly as ViewController._activate3DView does.
        rpm.notifyProjectionToggle(false); // authority → perspective, fast path armed

        const deferSpy   = vi.spyOn(rpm as any, '_deferGraphRebuildUntilCameraSettles').mockImplementation(() => {});
        const disposeSpy = vi.spyOn(rpm as any, '_safeDisposeRenderPipeline');

        // 'view-activated' fires while OBC's flip has NOT propagated: camera still orthographic.
        await rpm.updateCamera({ isOrthographicCamera: true } as any);

        expect(disposeSpy).not.toHaveBeenCalled();
        expect(deferSpy).toHaveBeenCalledTimes(1);
    });

    it('COMPILES (no defer) once the bound camera matches the authority', async () => {
        const rpm = new RenderPipelineManager();
        const anyRpm = primeFastPath(rpm);
        anyRpm._uIsOrthographic = { value: 0.0 }; // authority: perspective
        anyRpm._camera = { isPerspectiveCamera: true }; // settled: perspective

        const deferSpy   = vi.spyOn(rpm as any, '_deferGraphRebuildUntilCameraSettles').mockImplementation(() => {});
        const disposeSpy = vi.spyOn(rpm as any, '_safeDisposeRenderPipeline');

        await (rpm as any)._rebuildPipelineGraphOnly(false);

        // Guard passes → graph compiled → pipeline swapped in; never deferred.
        expect(deferSpy).not.toHaveBeenCalled();
        expect(disposeSpy).toHaveBeenCalledTimes(1);
        expect((rpm as any)._renderPipeline).not.toBeNull();
    });

    it('reconciles: a deferred rebuild compiles once the camera catches up', async () => {
        const rpm = new RenderPipelineManager();
        const anyRpm = primeFastPath(rpm);
        anyRpm._uIsOrthographic = { value: 0.0 }; // authority: perspective
        anyRpm._camera = { isOrthographicCamera: true }; // stale at first

        const deferSpy   = vi.spyOn(rpm as any, '_deferGraphRebuildUntilCameraSettles').mockImplementation(() => {});
        const disposeSpy = vi.spyOn(rpm as any, '_safeDisposeRenderPipeline');

        // Attempt 0 — camera still orthographic → deferred, NOT compiled.
        await (rpm as any)._rebuildPipelineGraphOnly(false, 0);
        expect(deferSpy).toHaveBeenCalledTimes(1);
        expect(disposeSpy).not.toHaveBeenCalled();

        // OBC's in-place flip lands: the same camera object is now perspective. The deferred
        // retry (invoked by the real defer's setTimeout) re-checks the guard and compiles.
        anyRpm._camera = { isPerspectiveCamera: true };
        await (rpm as any)._rebuildPipelineGraphOnly(false, 1);
        expect(deferSpy).toHaveBeenCalledTimes(1); // no further deferral
        expect(disposeSpy).toHaveBeenCalledTimes(1); // compiled this time
    });

    it('never loops forever: exhausting the settle budget falls back to a full rebuild', () => {
        const rpm = new RenderPipelineManager();
        const anyRpm = primeFastPath(rpm);
        anyRpm._uIsOrthographic = { value: 0.0 }; // authority: perspective
        anyRpm._camera = { isOrthographicCamera: true }; // never catches up

        const fullRebuildSpy = vi.spyOn(rpm as any, '_fullRebuild').mockResolvedValue(undefined);

        // At the deferral budget, the defer path stops retrying and reconstructs the passes
        // against the live camera instead of spinning.
        const max = (RenderPipelineManager as any)._MAX_PROJECTION_SETTLE_DEFERS as number;
        (rpm as any)._deferGraphRebuildUntilCameraSettles(false, max);

        expect(fullRebuildSpy).toHaveBeenCalledTimes(1);
    });
});
