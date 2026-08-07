/**
 * §GPU-RESOURCE-LIFETIME (ADR-0281) — resource-lifetime invariants.
 *
 * These assert ORDERING and OWNERSHIP, not pixels. The founder's hard stop
 *
 *   PIPELINE_FAILURE reason="Failed to execute 'setIndexBuffer' on
 *     'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'."
 *
 * is a draw call reaching for an index buffer that an element mutation had
 * already destroyed. The two rules that make it impossible are:
 *
 *   L1 OWNERSHIP — a cache-owned resource is never released by element teardown.
 *   L2 ORDERING  — a mutated element leaves the render graph BEFORE its GPU
 *                  resources are released, and the release happens at a frame
 *                  boundary, never on the mutation tick.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    markSharedGpuResource,
    isSharedGpuResource,
    safeDisposeMaterial,
    safeDisposeGeometry,
    safeDisposeTexture,
    scheduleGpuRelease,
    pendingGpuReleaseCount,
    drainGpuReleaseQueue,
    detachAndReleaseChildren,
    isDestroyedGpuResourceError,
    isShadowResourceError,
} from '../src/safeDispose';

// ── Minimal THREE-shaped doubles (no GPU, no THREE import needed) ────────────

function makeGeometry(name = 'geo') {
    return { name, isBufferGeometry: true as const, dispose: vi.fn() };
}
function makeMaterial(name = 'mat') {
    return { name, isMaterial: true as const, dispose: vi.fn() };
}
function makeTexture(name = 'tex') {
    return { name, isTexture: true as const, dispose: vi.fn() };
}

/** An Object3D-shaped node with a working `traverse`, `clear` and `children`. */
function makeObject3D(opts: { geometry?: unknown; material?: unknown } = {}) {
    const node: any = {
        children: [] as any[],
        parent: null as any,
        geometry: opts.geometry,
        material: opts.material,
        add(child: any) { child.parent = this; this.children.push(child); return this; },
        clear() { for (const c of this.children) c.parent = null; this.children.length = 0; return this; },
        traverse(cb: (o: any) => void) { cb(this); for (const c of this.children) c.traverse(cb); },
    };
    return node;
}

beforeEach(() => {
    // Never let a queue leak across tests.
    drainGpuReleaseQueue();
});

// ── INVARIANT L1 — OWNERSHIP ────────────────────────────────────────────────

describe('§GPU-RESOURCE-LIFETIME L1 — cache-owned resources are never released by element teardown', () => {
    it('marks and reports a shared material', () => {
        const mat = makeMaterial();
        expect(isSharedGpuResource(mat)).toBe(false);
        expect(markSharedGpuResource(mat)).toBe(mat); // returns the resource
        expect(isSharedGpuResource(mat)).toBe(true);
    });

    it('safeDisposeMaterial NO-OPS on a cache-owned material', () => {
        const shared = markSharedGpuResource(makeMaterial('kitchen-cache'));
        safeDisposeMaterial(shared as any);
        expect(shared.dispose).not.toHaveBeenCalled();
    });

    it('safeDisposeGeometry NO-OPS on a cache-owned geometry', () => {
        const shared = markSharedGpuResource(makeGeometry('shared-geo'));
        safeDisposeGeometry(shared as any);
        expect(shared.dispose).not.toHaveBeenCalled();
    });

    it('safeDisposeTexture NO-OPS on a cache-owned texture (foliage/env maps)', () => {
        const shared = markSharedGpuResource(makeTexture('leaf-atlas'));
        safeDisposeTexture(shared as any);
        expect(shared.dispose).not.toHaveBeenCalled();
    });

    it('still disposes element-owned resources (the guard is not a blanket leak)', () => {
        const owned = makeMaterial('per-element');
        safeDisposeMaterial(owned as any);
        expect(owned.dispose).toHaveBeenCalledTimes(1);
    });

    it('a shared material survives a full subtree release — the sibling-kill regression', () => {
        const shared = markSharedGpuResource(makeMaterial('shared-across-elements'));
        const ownGeo = makeGeometry('own');
        const root = makeObject3D();
        root.add(makeObject3D({ geometry: ownGeo, material: shared }));

        detachAndReleaseChildren(root);
        drainGpuReleaseQueue();

        expect(ownGeo.dispose).toHaveBeenCalledTimes(1); // element owns it
        expect(shared.dispose).not.toHaveBeenCalled();   // cache owns it
    });
});

// ── INVARIANT L2 — ORDERING ─────────────────────────────────────────────────

describe('§GPU-RESOURCE-LIFETIME L2 — detach first, release at the frame boundary', () => {
    it('a geometry swap does NOT dispose anything on the mutation tick', () => {
        const geo = makeGeometry();
        const root = makeObject3D();
        root.add(makeObject3D({ geometry: geo, material: makeMaterial() }));

        detachAndReleaseChildren(root);

        // The mutation tick released NOTHING — the frame in flight is still safe.
        expect(geo.dispose).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBe(1);
    });

    it('the mutated element leaves the draw list BEFORE its resources are released', () => {
        const geo = makeGeometry();
        const child = makeObject3D({ geometry: geo, material: makeMaterial() });
        const root = makeObject3D();
        root.add(child);

        // Order is asserted by capturing the graph state AT the moment of disposal.
        let stillReachableAtDispose: boolean | null = null;
        geo.dispose.mockImplementation(() => {
            stillReachableAtDispose = root.children.includes(child) || child.parent !== null;
        });

        detachAndReleaseChildren(root);
        drainGpuReleaseQueue();

        expect(geo.dispose).toHaveBeenCalledTimes(1);
        expect(stillReachableAtDispose).toBe(false); // detached before released
    });

    it('detach empties the root immediately so it is reusable this tick', () => {
        const root = makeObject3D();
        root.add(makeObject3D({ geometry: makeGeometry() }));
        root.add(makeObject3D({ geometry: makeGeometry() }));

        detachAndReleaseChildren(root);

        expect(root.children).toHaveLength(0);
        expect(pendingGpuReleaseCount()).toBe(2);
    });

    it('drain releases the whole batch and empties the queue', () => {
        const a = makeGeometry('a');
        const b = makeMaterial('b');
        scheduleGpuRelease(a as any);
        scheduleGpuRelease(b as any);
        expect(pendingGpuReleaseCount()).toBe(2);

        expect(drainGpuReleaseQueue()).toBe(2);

        expect(a.dispose).toHaveBeenCalledTimes(1);
        expect(b.dispose).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('a second drain with nothing queued is a no-op (frames stay cheap)', () => {
        expect(drainGpuReleaseQueue()).toBe(0);
    });

    it('a throwing dispose cannot strand the rest of the batch or kill the frame', () => {
        const bad = makeGeometry('bad');
        bad.dispose.mockImplementation(() => { throw new Error('boom (not usedTimes)'); });
        const good = makeGeometry('good');
        scheduleGpuRelease(bad as any);
        scheduleGpuRelease(good as any);

        expect(() => drainGpuReleaseQueue()).not.toThrow();
        expect(good.dispose).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('defers TEXTURE release too — the WebGL2 "bindTexture: deleted object" sibling', () => {
        // Founder slab-batch session: 251× "INVALID_OPERATION: bindTexture: attempt
        // to use a deleted object" — the same defect, different resource kind.
        const tex = makeTexture('env-map');
        scheduleGpuRelease(tex as any);
        expect(tex.dispose).not.toHaveBeenCalled(); // not on the mutation tick
        expect(pendingGpuReleaseCount()).toBe(1);

        drainGpuReleaseQueue();
        expect(tex.dispose).toHaveBeenCalledTimes(1);
    });

    it('refuses an unrecognised handle rather than guessing and destroying the wrong thing', () => {
        scheduleGpuRelease({ notAResource: true } as any);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('an empty root is a no-op (no churn on unchanged elements)', () => {
        detachAndReleaseChildren(makeObject3D());
        expect(pendingGpuReleaseCount()).toBe(0);
    });
});

// ── Failure classification ──────────────────────────────────────────────────

describe('§GPU-RESOURCE-LIFETIME — destroyed-resource classification', () => {
    it("matches the founder's setIndexBuffer failure", () => {
        expect(isDestroyedGpuResourceError(new Error(
            "Failed to execute 'setIndexBuffer' on 'GPURenderPassEncoder': " +
            'parameter 1 is not of type \'GPUBuffer\'.',
        ))).toBe(true);
    });

    it('matches destroyed buffer/texture-used-in-a-submit and deleted-object siblings', () => {
        expect(isDestroyedGpuResourceError(new Error('Destroyed texture [ShadowDepthTexture] used in a submit'))).toBe(true);
        expect(isDestroyedGpuResourceError(new Error('Destroyed buffer used in a submit'))).toBe(true);
        expect(isDestroyedGpuResourceError('WebGL: INVALID_OPERATION: bindTexture: attempt to use a deleted object')).toBe(true);
    });

    it('does NOT match a shader-compile failure (different recovery: downgrade, not reset)', () => {
        expect(isDestroyedGpuResourceError(new Error('Fragment shader failed to compile. Compile log: …'))).toBe(false);
    });

    it('does NOT match the usedTimes dispose throw (handled at the dispose site)', () => {
        expect(isDestroyedGpuResourceError(new Error("Cannot read properties of undefined (reading 'usedTimes')"))).toBe(false);
    });

    it('does not match unrelated errors', () => {
        expect(isDestroyedGpuResourceError(new Error('network timeout'))).toBe(false);
        expect(isDestroyedGpuResourceError(null)).toBe(false);
        expect(isDestroyedGpuResourceError(undefined)).toBe(false);
    });
});

// ── Shadow depth targets — the founder P0 (167 elements / 445 meshes) ───────

describe('§GPU-RESOURCE-LIFETIME — shadow depth targets are released at the frame boundary', () => {
    /** A THREE render-target-shaped double (LightShadow.map is a WebGLRenderTarget). */
    function makeRenderTarget(name = 'ShadowDepthTexture') {
        return { name, isRenderTarget: true as const, texture: makeTexture(name), dispose: vi.fn() };
    }

    it('queues a render target rather than disposing it on the mutation tick', () => {
        // ShadowQualityUpgrader used to dispose this via setTimeout(0) — a GUESS at a
        // frame boundary. A WebGPU Queue.submit() is async and keeps referencing the
        // texture until the GPU retires it, so a macrotask can land mid-submit:
        //   Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
        const rt = makeRenderTarget();
        scheduleGpuRelease(rt as any);

        expect(rt.dispose).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBe(1);

        drainGpuReleaseQueue();
        expect(rt.dispose).toHaveBeenCalledTimes(1);
    });

    it('classifies a render target as a target, NOT as its own .texture', () => {
        // A WebGLRenderTarget carries a `.texture`, so an isTexture-shaped check must
        // not claim it and dispose the wrong handle.
        const rt = makeRenderTarget();
        scheduleGpuRelease(rt as any);
        drainGpuReleaseQueue();

        expect(rt.dispose).toHaveBeenCalledTimes(1);
        expect(rt.texture.dispose).not.toHaveBeenCalled();
    });

    it('honours L1 ownership for render targets too', () => {
        const rt = markSharedGpuResource(makeRenderTarget('shared-rt'));
        scheduleGpuRelease(rt as any);
        drainGpuReleaseQueue();
        expect(rt.dispose).not.toHaveBeenCalled();
    });
});

describe('§RECOVERY-MUST-REFUSE — shadow-resource classification', () => {
    it("matches the founder's ShadowDepthTexture destroyed-in-submit", () => {
        expect(isShadowResourceError(
            'Destroyed texture [Texture "ShadowDepthTexture"] used in a submit. ' +
            '- While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])',
        )).toBe(true);
    });

    it('does NOT match a scene attribute failure (that one IS worth reconstructing)', () => {
        expect(isShadowResourceError(new Error(
            "Failed to execute 'setIndexBuffer' on 'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'.",
        ))).toBe(false);
    });

    it('does not match unrelated errors', () => {
        expect(isShadowResourceError(new Error('network timeout'))).toBe(false);
        expect(isShadowResourceError(null)).toBe(false);
    });
});
