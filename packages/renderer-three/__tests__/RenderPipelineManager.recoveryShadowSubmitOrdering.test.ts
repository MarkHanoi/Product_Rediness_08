/**
 * §L930-DETACH-BEFORE-FREE — the repair that exists to survive a render failure
 * was the thing that killed the viewport.
 *
 * FOUNDER EVIDENCE (app.pryzm.so, WebGPU, phase4, 2026-08-16 — ISSUE-LOG L-930),
 * in the order the console printed it:
 *
 *   1  [PlatformSaveController] Version saved: "Auto-save" (27 elements)
 *   2  §GPU-RESOURCE-LIFETIME recoverFromRenderFailure — reconciling size and
 *      rebuilding the render pipeline
 *   3  §RECOVERY-MUST-REFUSE companion — signalled 1 shadow-casting light(s) to
 *      RE-OWN FRESH SHADOW MAPS before the pipeline rebuild
 *   4  §L-819 compiled node states reset (4/4 caches)
 *   5  §FIX-DISPOSE-USEDTIMES — old pipeline dispose error (non-fatal):
 *      Cannot read properties of undefined (reading 'usedTimes')
 *   6  Phase: phase4 | WebGPU: true            ← the rebuild SUCCEEDED
 *   7  §RECOVERY-MUST-REFUSE a SHADOW depth resource was destroyed while still
 *      referenced by an in-flight submit … REFUSING the pipeline reconstruction
 *   8  Phase: error   → ViewportCrashGuard: retries exhausted
 *   ×4 Destroyed texture [Texture "ShadowDepthTexture"] used in a submit
 *      (renderContext_4, renderContext_1, renderContext_4, renderContext_1)
 *
 * ── THE ORDERING, MEASURED ──────────────────────────────────────────────────
 *
 * ONE inverted teardown order produced BOTH the fatal step 7 and the "non-fatal"
 * step 5:
 *
 *  (a) THE SUBMIT GATE WAS OPEN AT THE INSTANT THE TEXTURE WAS FREED.
 *      `_recreateLightOwnedShadowMaps()` dispatches `'dispose'` on each shadow
 *      light; three r183's `AnalyticLightNode._shadowDisposeListener` disposes the
 *      ShadowNode → `_reset()` → `this.shadowMap.dispose()` — a GPU free, on the
 *      crash-guard's arbitrary tick. `_rebuildPipeline()` then clears
 *      `_hasPipelineError` SYNCHRONOUSLY while `_renderPipeline` still points at
 *      the OLD pipeline, whose bind groups sample exactly that texture, and
 *      installs the new one only at the very end of its async build. Every rAF
 *      tick inside that window encodes and submits against the corpse: two render
 *      contexts (shadow depth pass + main pass) × two frames before the NO-FLOOD
 *      latch caught up = the founder's ×4.
 *
 *  (b) THE OLD PIPELINE WAS TORN DOWN AFTER ITS NODE CACHES WERE WIPED.
 *      `_resetCompiledNodeStates()` empties the NodeManager DataMap;
 *      `_buildPipeline()`'s `_safeDisposeRenderPipeline()` runs LATER and fans out
 *      to `NodeManager.delete(renderObject)`, which reads
 *      `this.get(renderObject).nodeBuilderState` — `undefined` on a wiped map, so
 *      `undefined.usedTimes` throws (step 5). Logged non-fatal; not harmless. The
 *      teardown ABORTS half-done, leaving precisely the stale render-object /
 *      bind-group records that then submit the dead texture.
 *
 * The fix is ORDER, not tolerance: CLOSE THE GATE → TEAR DOWN → FREE → WIPE →
 * REBUILD → reopen. Nothing here touches §RECOVERY-MUST-REFUSE; the refusal is
 * correct and must stay loud. The point is that it should never be REACHED.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ─────────────────────────────
 *
 * An earlier draft of this file asserted that the recovery must leave the
 * light-owned target UNDESTROYED and waiting on `scheduleGpuRelease`'s queue.
 * That is the WRONG fix and the repo already says so in prose —
 * `safeDispose.ts:218-227`: "a LIGHT-OWNED shadow map (`LightShadow.map`) must
 * NOT be routed here — the WebGPU ShadowNode keeps its own live reference and
 * would keep submitting the destroyed texture forever. Use
 * scheduleShadowMapRealloc() for those." It is also unreachable: the disposer is
 * three's own listener, so the free is not ours to defer. What IS ours is the
 * GATE — whether a frame can be submitted at the instant the free lands.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A GPU-side texture handle, as the founder's error names it. */
interface FakeTexture { label: string; destroyed: boolean }

interface Rig {
    rpm: any;
    /** Ordered trace of the recovery's teardown steps, as they actually happened. */
    order: () => readonly string[];
    /** Manager state captured AT THE INSTANT the light-owned texture was freed. */
    gateAtFree: () => { paused: boolean; pipelineInstalled: boolean } | null;
    /** Frames whose submit referenced a DESTROYED ShadowDepthTexture. */
    badSubmits: () => number;
    /** Every frame the rig submitted. */
    submits: () => number;
    /** true if the OLD pipeline's dispose() ran to completion (no usedTimes throw). */
    oldPipelineTornDownCleanly: () => boolean;
    /** Land the async rebuild's tail (models `_buildPipeline` :2448-2452). */
    finishRebuild: () => Promise<void>;
    light: any;
}

/**
 * A rig that models three r183's real objects closely enough that the ORDERING is
 * the only thing under test. Nothing on the crash path is mocked — the
 * `uncapturederror` listener, the classifier, the §RECOVERY-MUST-REFUSE refusal
 * and the phase machine are all production code.
 *
 *  • the light's 'dispose' listener is AnalyticLightNode's (dispose the ShadowNode's
 *    target, null the node's reference) — AnalyticLightNode.js:101-135,
 *    ShadowNode.js:756-778;
 *  • the render target's dispose() frees the GPU texture, as
 *    Textures.onRenderTargetDispose → backend.destroyTexture does;
 *  • a pipeline SAMPLES the texture its bind groups were built against — so the
 *    OLD pipeline keeps sampling the freed one, and a pipeline built AFTER the
 *    node-state reset samples the FRESH one three mints in `setupShadowNode`.
 *    (Without this distinction a rig scores every post-recovery frame as a fault
 *    and can never observe a surviving viewport.);
 *  • a submit that references a freed texture raises a WebGPU VALIDATION error on
 *    the device's `uncapturederror` channel — it does NOT throw (ADR-0297
 *    amendment 2). The manager's REAL listener classifies it;
 *  • `_nodes.dispose()` wipes the NodeManager DataMap, after which the old
 *    pipeline's dispose() throws the `usedTimes` TypeError, as
 *    NodeManager.delete() does on a wiped map.
 */
function makeRecoveryRig(): Rig {
    const device = new EventTarget();
    const order: string[] = [];

    let texSeq = 0;
    const mintShadowTexture = (): FakeTexture =>
        ({ label: `ShadowDepthTexture#${++texSeq}`, destroyed: false });

    /** The texture the light-owned target currently holds. */
    let liveShadowTexture = mintShadowTexture();

    let gateAtFree: { paused: boolean; pipelineInstalled: boolean } | null = null;

    // LightShadow.map — a THREE render target. ShadowNode assigns the SAME object
    // to `this.shadowMap` and `shadow.map` (ShadowNode.js:563-564).
    const shadowTarget = {
        isRenderTarget: true as const,
        width: 2048,
        height: 2048,
        dispose(): void {
            order.push('shadow-free');
            // THE MEASUREMENT: what was the submit gate doing at the instant of the free?
            gateAtFree = {
                paused:            Boolean(rpm._shadowRebuildPaused),
                pipelineInstalled: rpm._renderPipeline !== null,
            };
            liveShadowTexture.destroyed = true;
        },
    };

    // The AnalyticLightNode that holds its OWN reference to the target.
    const analyticLightNode: { shadowMap: typeof shadowTarget | null } = { shadowMap: shadowTarget };

    const light = {
        isLight: true,
        castShadow: true,
        shadow: { map: shadowTarget as unknown, mapSize: { width: 2048, height: 2048 } },
        // AnalyticLightNode._shadowDisposeListener → disposeShadow() →
        // shadowNode.dispose() → _reset() → this.shadowMap.dispose().
        dispatchEvent(ev: { type: string }): void {
            if (ev.type !== 'dispose') return;
            if (analyticLightNode.shadowMap) {
                analyticLightNode.shadowMap.dispose();
                analyticLightNode.shadowMap = null;
            }
        },
    };

    let submits = 0;
    let badSubmits = 0;
    /** A pipeline samples the texture its bind groups were compiled against. */
    const makePipeline = (boundTexture: FakeTexture, onDispose: () => void) => ({
        render(): void {
            submits++;
            if (!boundTexture.destroyed) return;
            badSubmits++;
            // The WebGPU driver's answer to a command buffer that references a freed
            // texture. Delivered on the device channel; never thrown.
            device.dispatchEvent(
                Object.assign(new Event('uncapturederror'), {
                    error: {
                        message:
                            `Destroyed texture [Texture "ShadowDepthTexture"] used in a submit. ` +
                            `- While calling [Queue].Submit([[CommandBuffer from CommandEncoder ` +
                            `"renderContext_1"]]).`,
                    },
                }),
            );
        },
        dispose: onDispose,
    });

    // NodeManager-shaped cache. dispose() wipes the DataMap; after that the old
    // pipeline's teardown reads `undefined.usedTimes`.
    let nodeCacheWiped = false;
    let oldPipelineTornDownCleanly = false;

    const oldPipeline = makePipeline(liveShadowTexture, () => {
        order.push('pipeline-dispose');
        if (nodeCacheWiped) {
            throw new TypeError("Cannot read properties of undefined (reading 'usedTimes')");
        }
        oldPipelineTornDownCleanly = true;
    });

    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer = {
        backend: { isWebGPUBackend: true, device },
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        getSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        setSize: () => { /* noop */ },
        setClearAlpha: () => { /* noop */ },
        shadowMap: { autoUpdate: true, needsUpdate: false },
        _objects:   { dispose: () => { /* noop */ } },
        _pipelines: { dispose: () => { /* noop */ } },
        _nodes:     { dispose: () => { order.push('node-cache-wipe'); nodeCacheWiped = true; } },
        _bindings:  { dispose: () => { /* noop */ } },
    };
    rpm._scene  = { traverse: (cb: (o: unknown) => void) => { cb(light); } };
    rpm._camera = {};
    rpm._renderPipeline = oldPipeline;
    rpm._renderPipelineDevice = device;
    rpm._phase = 'phase4';

    // The REAL uncapturederror subscription — classifier, refusal and phase machine
    // are production code from here on.
    rpm._attachUncapturedGpuErrorListener();

    // The state the crash guard hands us: the viewport has already failed.
    rpm._hasPipelineError = true;

    // Model `_buildPipeline()`'s async tail (:2448-2452) — the node graph is
    // recompiled (fresh ShadowNode + fresh ShadowDepthTexture, since the node caches
    // were wiped), the old pipeline is disposed, the new one installed, the error
    // latch cleared, phase4 emitted.
    let land: (() => void) | null = null;
    rpm._rebuildPipelineWithCurrentState = vi.fn(
        () => new Promise<void>((res) => {
            land = () => {
                order.push('rebuild-land');
                // AnalyticLightNode.setup → shadowNode === null → setupShadowNode:
                // a fresh target + fresh depth texture at the light's current mapSize.
                liveShadowTexture = mintShadowTexture();
                analyticLightNode.shadowMap = shadowTarget;
                (light.shadow as { map?: unknown }).map = shadowTarget;
                rpm._safeDisposeRenderPipeline();
                rpm._renderPipeline       = makePipeline(liveShadowTexture, () => { /* noop */ });
                rpm._renderPipelineDevice = device;
                rpm._hasPipelineError     = false;
                rpm._phase                = 'phase4';
                rpm._emitState();
                res();
            };
        }),
    );

    return {
        rpm,
        light,
        order: () => order,
        gateAtFree: () => gateAtFree,
        badSubmits: () => badSubmits,
        submits: () => submits,
        oldPipelineTornDownCleanly: () => oldPipelineTornDownCleanly,
        finishRebuild: async () => {
            land?.();
            // Let the production release chain settle: `_rebuildPipeline`'s own
            // `.finally` pops the inner guard, then `recoverFromRenderFailure`'s pops
            // the outer one. Bounded, and NOT tolerant of a stranded pause — if the
            // guard never releases, `submits()` stays 0 and the assertions fail.
            for (let i = 0; i < 16 && rpm._shadowRebuildPaused; i++) {
                await new Promise<void>((r) => { setTimeout(r, 0); });
            }
        },
    };
}

describe('§L930 — the recovery must not free a light-owned shadow map through an open submit gate', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('M1 — the submit gate is CLOSED at the instant the ShadowDepthTexture is freed (ADR-0297 L2)', () => {
        const rig = makeRecoveryRig();

        rig.rpm.recoverFromRenderFailure();

        // DETACH now, RELEASE at the boundary. We cannot defer three's own free —
        // the disposer is AnalyticLightNode's listener — so the invariant we CAN and
        // MUST hold is that no frame can be encoded or submitted while it happens.
        expect(rig.gateAtFree()).toEqual({ paused: true, pipelineInstalled: false });
        // The corpse pointer is cleared so nothing external can read it.
        expect(rig.light.shadow.map).toBeNull();
    });

    it('M4 — the old pipeline is torn down BEFORE the node caches are wiped, and before the free', async () => {
        const rig = makeRecoveryRig();

        rig.rpm.recoverFromRenderFailure();
        await rig.finishRebuild();

        // The founder's step 4 → step 5 inversion, pinned as an ORDER not a tolerance.
        // `NodeManager.delete()` reads `this.get(renderObject).nodeBuilderState`; wipe
        // the DataMap first and that read is `undefined` — the step-5 `usedTimes`
        // TypeError — and the teardown aborts half-done.
        expect(rig.order().slice(0, 3)).toEqual([
            'pipeline-dispose',
            'shadow-free',
            'node-cache-wipe',
        ]);
        expect(rig.oldPipelineTornDownCleanly()).toBe(true);
    });

    it('M2/M3 — no frame submits against the freed texture, and THE VIEWPORT SURVIVES', async () => {
        const rig = makeRecoveryRig();

        // THE EXACT SIGNAL THE CRASH GUARD BRANCHES ON. `initScene.ts:3011-3013`:
        //     if (status.phase === 'error') viewportCrashGuard.handlePipelineError();
        // → "Render pipeline retries exhausted — phase=error" + the dead surface the
        // founder reported. Recording every emission proves the guard is never told,
        // not merely that the phase happened to read 'phase4' when we looked.
        const emitted: string[] = [];
        rig.rpm.onStateChange = (s: { phase: string }) => { emitted.push(s.phase); };

        rig.rpm.recoverFromRenderFailure();

        // The single rAF keeps ticking through the recovery's async rebuild — it is
        // not the frame loop that failed, and P3 forbids stopping it. These are the
        // two frames × two render contexts that produced the founder's ×4.
        rig.rpm.render(0.016);
        rig.rpm.render(0.016);
        await Promise.resolve();
        await rig.finishRebuild();
        // …and it keeps ticking after the rebuild lands.
        rig.rpm.render(0.016);
        rig.rpm.render(0.016);

        // Asserted as ONE object so a regression prints BOTH halves of the founder's
        // report — the bad submit AND the dead viewport — instead of bailing on the
        // first and hiding the consequence. Pre-fix this reads
        // `{ badSubmits: 1, phase: 'error' }`: one frame submitted against the freed
        // texture, §RECOVERY-MUST-REFUSE refused (correctly), and the surface died.
        expect({ badSubmits: rig.badSubmits(), phase: rig.rpm.status.phase }).toEqual({
            badSubmits: 0,
            phase: 'phase4',   // THE LAYER THE USER EXPERIENCES: the surface is alive.
        });
        // The crash guard was never notified, at any instant — not just at the end.
        expect(emitted).not.toContain('error');
        // …and it is RENDERING again, not merely "not erroring": the pause is a
        // window, never a resting state (a stranded pause is a frozen viewport that
        // reports phase4 — the same lie in the opposite direction).
        expect(rig.rpm._shadowRebuildPaused).toBe(false);
        expect(rig.submits()).toBeGreaterThan(0);
    });

    it('the AUTO-SAVE trigger — an off-rAF render() during the recovery window submits nothing', async () => {
        const rig = makeRecoveryRig();

        // The founder's crash follows an auto-save, and the save path is NOT passive
        // toward the render graph: `PlatformSaveController.saveInner()` →
        // `saveAdapter.captureThumbnail()` → `initPersistence.ts:174-176` calls
        // `window.renderPipelineManager.render()` — a SECOND, SYNCHRONOUS, off-rAF
        // frame, driven from the save's own tick, which encodes and submits and
        // performs both ADR-0297 L2 boundary drains at an instant that is not a frame
        // boundary. So a save landing inside a recovery window is a real interleaving,
        // not a hypothetical one.
        //
        // Whatever else that path deserves (it is apps/editor's to fix, and it is a
        // second render driver against P3), the invariant THIS layer owes it is that
        // an extra caller cannot submit through a closed gate.
        rig.rpm.recoverFromRenderFailure();

        rig.rpm.render(0.016);   // the rAF tick
        rig.rpm.render();        // captureThumbnail()'s off-rAF forced render
        rig.rpm.render(0.016);

        expect(rig.badSubmits()).toBe(0);
        expect(rig.rpm.status.phase).toBe('phase4');

        await rig.finishRebuild();
        expect(rig.rpm.status.phase).toBe('phase4');
    });

    it('the refusal is UNWEAKENED — a shadow fault that still reaches it fails loudly', () => {
        const rig = makeRecoveryRig();
        const errSpy = vi.spyOn(console, 'error');

        // Deliver the founder's exact validation error straight down the production
        // channel, with no recovery in progress. §RECOVERY-MUST-REFUSE must still
        // refuse, name the cause, and fail into phase='error' on the FIRST report —
        // no retry, no swallow, no longer backoff.
        rig.rpm._onDestroyedGpuResource(
            'Destroyed texture [Texture "ShadowDepthTexture"] used in a submit. ' +
            '- While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]]).',
            'GPUDevice.uncapturederror',
            true,
        );

        expect(rig.rpm.status.phase).toBe('error');
        expect(errSpy.mock.calls.flat().join(' ')).toContain('§RECOVERY-MUST-REFUSE');
    });

    it('§L930-SUBMIT-PAUSE-DEPTH — nested guards do not let the inner release resume submits', () => {
        const rig = makeRecoveryRig();
        const priv = rig.rpm as {
            _beginShadowRebuildGuard: () => void;
            _endShadowRebuildGuard: () => void;
            _shadowRebuildPaused: boolean;
        };

        // scheduleShadowRebuild() takes a guard, then calls _rebuildPipeline(), which
        // now takes one too. A boolean latch would resume submits on the INNER
        // release, mid-teardown — the exact window this lane exists to close.
        priv._beginShadowRebuildGuard();
        priv._beginShadowRebuildGuard();
        priv._endShadowRebuildGuard();
        expect(priv._shadowRebuildPaused).toBe(true);
        priv._endShadowRebuildGuard();
        expect(priv._shadowRebuildPaused).toBe(false);
    });
});
