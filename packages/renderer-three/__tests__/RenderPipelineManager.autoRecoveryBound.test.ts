// §L-966-BOUNDED-AUTO-RECOVERY — the founder's dead viewport, at the layer the
// founder experiences it: `onStateChange({ phase: 'error' })`.
//
// FOUNDER EVIDENCE (live deploy, 2026-08-18):
//
//   Error: Render pipeline retries exhausted — phase=error
//     at handlePipelineError     (engineLauncher…:1877)
//     at onStateChange           (engineLauncher…:1884)
//     at _emitState              (domain-engine…:147)
//     at _onDestroyedGpuResource (domain-engine…:147)
//     at GPUDevice.t             (domain-engine…:147)   ← the uncapturederror listener
//
// ⭐ THE MESSAGE IS A FABRICATION. Read the stack bottom-up: the escalation came
// from `_onDestroyedGpuResource`, which sets `phase='error'` DIRECTLY. It never
// touches `_retryCount` and the retry ladder in `render()`'s catch never ran. The
// string "retries exhausted" is `ViewportCrashGuard.handlePipelineError()`'s default
// argument, minted because `initScene.ts` calls it with NO argument. So the report
// names a mechanism that did not execute, and discards the one that did.
//
// THE REAL SHAPE (the L-716 question — "can this loop's condition EVER be true?"):
// there is no loop. `_onDestroyedGpuResource` has two escalation branches that reach
// `phase='error'` with ZERO recovery attempts:
//
//   (a) §RECOVERY-MUST-REFUSE — a light-owned ShadowDepthTexture is structurally
//       unreachable from `_rebuildPipeline()`, so the blind rebuild is refused. The
//       refusal is CORRECT and must not be weakened.
//   (b) the recurrence branch, after the one non-shadow reconstruction.
//
// `recoverFromRenderFailure()` CAN repair (a) — re-owning light shadow maps and
// resetting compiled node states is exactly what it was built to do, and L-908
// records it succeeding — but it is reachable ONLY from a human click on "Reload
// viewport" (ViewportCrashGuard.ts:346). The automatic path refuses the repair that
// cannot help and never attempts the one that can.
//
// WHAT THESE TESTS PIN (all four were RED before the fix):
//   1. the automatic path ATTEMPTS `recoverFromRenderFailure()` before declaring
//      `phase='error'`;
//   2. the attempts are BOUNDED by MAX_AUTO_RECOVERY_ATTEMPTS — a recovery that
//      itself fails must not spin, because that pins the GPU;
//   3. the bound survives `onProjectSwitch()` (L-663 defect 1: recovery/lifecycle
//      erasing the counter that bounds it);
//   4. when the bound IS exhausted, `PipelineStatus.lastError` carries WHAT DIED,
//      so the crash guard can tell the user instead of showing a synthetic string.
//
// See docs/04-reference/ISSUE-LOG.md L-966, C04 §RECOVERY, ADR-0297, ADR-0299.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** The founder's exact validation message (shadow class → §RECOVERY-MUST-REFUSE). */
const SHADOW_FAULT =
    'Destroyed texture [Texture "ShadowDepthTexture"] used in a submit. ' +
    '- While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])';

/** A NON-shadow destroyed-resource fault (→ the one-reconstruction/recurrence branch). */
const BUFFER_FAULT =
    "setIndexBuffer: parameter 1 is not of type 'GPUBuffer'.";

/**
 * A GPUDevice-shaped EventTarget so the fault arrives on the SAME channel the
 * founder's stack names (`GPUDevice.t` = the uncapturederror listener), not by
 * poking a private method.
 */
function makeDevice(): EventTarget {
    return new EventTarget();
}

function dispatchGpuError(device: EventTarget, message: string): void {
    const ev = new Event('uncapturederror') as Event & { error?: { message: string } };
    ev.error = { message };
    device.dispatchEvent(ev);
}

/**
 * A WebGPU-shaped RPM wired to a real EventTarget device, with the async rebuild
 * stubbed so the test observes the DECISION (was recovery driven? how many times?)
 * rather than a GPU it does not have.
 */
function makeRig(opts: { recoveryHeals?: boolean } = {}) {
    const rpm = new RenderPipelineManager() as any;
    const device = makeDevice();

    rpm._webGpuActive = true;
    rpm._renderer = {
        isWebGPURenderer: true,
        backend: { isWebGPUBackend: true, device },
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        getSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        setSize: () => { /* noop */ },
    };
    // A real pipeline object so `recoverFromRenderFailure()`'s `_webGpuActive` gate
    // and the teardown path have something to act on.
    rpm._renderPipeline = { render: () => {}, dispose: () => {} };
    rpm._scene  = { traverse: () => {}, children: [] };
    rpm._camera = {};

    // Count the load-bearing rebuild WITHOUT running it (no GPU in vitest).
    const rebuilds: number[] = [];
    rpm._rebuildPipeline = vi.fn(async () => { rebuilds.push(Date.now()); });
    // The two repairs a pipeline rebuild cannot do — stubbed, counted.
    const reowns: string[] = [];
    rpm._recreateLightOwnedShadowMaps = vi.fn(() => { reowns.push('reown'); });
    rpm._resetCompiledNodeStates      = vi.fn(() => { /* noop */ });
    rpm._safeDisposeRenderPipeline    = vi.fn(() => { /* noop */ });
    rpm._reconcileRenderSize          = vi.fn(() => { /* noop */ });

    // Every state the crash guard would see — this IS the user-facing layer.
    const emitted: Array<{ phase: string; lastError?: Error | null }> = [];
    rpm.onStateChange = (s: any) => { emitted.push({ phase: s.phase, lastError: s.lastError }); };

    // Attach the real uncapturederror listener to our device.
    rpm._attachUncapturedGpuErrorListener();

    if (opts.recoveryHeals === false) {
        // A recovery that does NOT heal: the very next frame re-reports the fault.
        // This is the case that must NOT spin.
    }

    return {
        rpm,
        device,
        rebuilds,
        reowns,
        emitted,
        get phase(): string { return rpm.status.phase as string; },
        get lastError(): Error | null | undefined { return rpm.status.lastError; },
        /** Fault reports that reached a terminal `phase='error'` emission. */
        get errorEmissions() { return emitted.filter(e => e.phase === 'error'); },
        /**
         * The uncapturederror channel COALESCES per DESTROYED_RESOURCE_WINDOW_MS,
         * so a test that wants N distinct fault reports must open N windows.
         * Reproduces "the next frame faulted again", not "the same frame flooded".
         */
        faultOnANewFrame(message: string): void {
            rpm._destroyedResourceWindowStart = 0;
            rpm._destroyedResourceReports     = 0;
            dispatchGpuError(device, message);
        },
    };
}

describe('§L-966 — the automatic path must ATTEMPT the repair that works, bounded', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    // ── 1. The refusal must not be the END of the automatic path ────────────
    it('a REFUSED shadow fault drives recoverFromRenderFailure() instead of dying immediately', () => {
        const rig = makeRig();

        // Positive control on the SAME expression: before any fault, nothing has
        // been repaired and the viewport is not in error.
        expect(rig.reowns).toHaveLength(0);
        expect(rig.phase).not.toBe('error');

        rig.faultOnANewFrame(SHADOW_FAULT);

        // §RECOVERY-MUST-REFUSE still refuses the BLIND rebuild — but the repair it
        // can't do (re-owning light shadow maps) is now attempted automatically.
        // This is the assertion that was RED: the old path went straight to error.
        expect(rig.reowns).toHaveLength(1);
        expect(rig.rebuilds).toHaveLength(1);
        expect(rig.phase).not.toBe('error');
        expect(rig.errorEmissions).toHaveLength(0);
    });

    // ── 2. …but the attempts are BOUNDED (a spinning recovery pins the GPU) ──
    it('recovery attempts are bounded — a fault that keeps recurring escalates, it does not spin', () => {
        const rig = makeRig();

        // Ten successive frames each re-report the SAME unhealed fault.
        for (let i = 0; i < 10; i++) rig.faultOnANewFrame(SHADOW_FAULT);

        // Negative: the bound held — this is NOT ten recoveries.
        expect(rig.reowns.length).toBeLessThan(10);
        // Positive on the SAME expression: it is exactly the named bound.
        expect(rig.reowns).toHaveLength(2);
        expect(rig.rebuilds).toHaveLength(2);

        // And once exhausted it escalates ONCE and latches (the user is told, and
        // the render loop stops submitting frames we know will fail).
        expect(rig.phase).toBe('error');
        expect(rig.errorEmissions).toHaveLength(1);
        expect(rig.rpm._hasPipelineError).toBe(true);
    });

    it('the NON-shadow (recurrence) branch is bounded by the same counter', () => {
        const rig = makeRig();

        for (let i = 0; i < 10; i++) rig.faultOnANewFrame(BUFFER_FAULT);

        // Fault 1 spends the ONE §GPU-RESOURCE-LIFETIME reconstruction; faults 2-3
        // spend the two bounded auto-recoveries; fault 4 escalates. Total work is
        // 3 rebuilds and then silence — never 10.
        expect(rig.rebuilds.length).toBeLessThan(10);
        expect(rig.rebuilds).toHaveLength(3);
        expect(rig.phase).toBe('error');
    });

    // ── 3. The bound must survive an unrelated lifecycle event (L-663 defect 1) ──
    it('onProjectSwitch() cannot erase the recovery bound', () => {
        const rig = makeRig();

        rig.faultOnANewFrame(SHADOW_FAULT);   // auto-recovery 1 of 2
        expect(rig.reowns).toHaveLength(1);

        // The exact L-663 shape: an unrelated lifecycle event zeroes the counter
        // that is the only thing bounding a live, unhealed fault.
        rig.rpm.onProjectSwitch();

        rig.faultOnANewFrame(SHADOW_FAULT);   // auto-recovery 2 of 2
        rig.faultOnANewFrame(SHADOW_FAULT);   // must escalate, NOT recover again

        // Negative: the switch did not hand the fault a fresh ladder.
        expect(rig.reowns.length).not.toBe(3);
        // Positive on the SAME expression.
        expect(rig.reowns).toHaveLength(2);
        expect(rig.phase).toBe('error');
    });

    // ── 4. What died must reach the user (defects 2 + 3) ─────────────────────
    it('PipelineStatus.lastError carries WHAT DIED, not a synthetic "retries exhausted"', () => {
        const rig = makeRig();

        for (let i = 0; i < 10; i++) rig.faultOnANewFrame(SHADOW_FAULT);

        expect(rig.phase).toBe('error');
        const err = rig.lastError;
        // Negative: the crash guard must not be left to mint its own message.
        expect(err).not.toBeUndefined();
        expect(err).not.toBeNull();
        // Positive on the SAME expression: it names the resource that died.
        expect(err!.message).toContain('ShadowDepthTexture');
        // …and the terminal emission carried it, so `onStateChange` can pass it on.
        expect(rig.errorEmissions[0]!.lastError!.message).toContain('ShadowDepthTexture');
    });

    it('the recovery window is VISIBLE — recoveringInFlight, not a silent frozen viewport', () => {
        const rig = makeRig();

        // Positive control: nothing in flight before the fault.
        expect(rig.rpm.status.recoveringInFlight).toBe(false);

        rig.faultOnANewFrame(SHADOW_FAULT);

        // Making recovery automatic removed the crash card, which was the only thing
        // that told the user anything. The health badge must therefore say
        // "recovering" during the window — `retryCount` cannot serve here, because
        // this fault class deliberately never enters the retry ladder.
        expect(rig.rpm.status.recoveringInFlight).toBe(true);
        expect(rig.rpm.status.retryCount).toBe(0);
        // …and the state was EMITTED, so the badge is actually driven (a flag no
        // listener is told about is the same as no flag).
        expect(rig.emitted.some(e => (e as any).phase !== 'error')).toBe(true);
    });

    it('a manual recoverFromRenderFailure() (the user clicking "Reload viewport") is NOT bounded away', () => {
        const rig = makeRig();

        for (let i = 0; i < 10; i++) rig.faultOnANewFrame(SHADOW_FAULT);
        expect(rig.phase).toBe('error');
        const rebuiltAutomatically = rig.rebuilds.length;

        // The human lever must still work after the automatic bound is spent — the
        // bound exists to stop an unattended spin, never to disable the user's own
        // retry (which is also their route to a hard reload if it returns false).
        expect(rig.rpm.recoverFromRenderFailure()).toBe(true);
        expect(rig.rebuilds.length).toBe(rebuiltAutomatically + 1);
    });

    it('a genuinely NEW GPU device resets the bound (device-loss is a DIFFERENT failure class)', () => {
        const rig = makeRig();

        for (let i = 0; i < 10; i++) rig.faultOnANewFrame(SHADOW_FAULT);
        expect(rig.rpm._autoRecoveryAttempts).toBe(2);

        // `recoverPipeline()` binds a freshly-recreated renderer — new device, new
        // bookkeeping — so the previous device's exhausted budget is genuinely
        // stale. This is the same reasoning `_gpuResourceResetAttempted` already
        // documents, and it is the ONLY sanctioned reset.
        rig.rpm._resetAutoRecoveryBudgetForNewDevice();
        expect(rig.rpm._autoRecoveryAttempts).toBe(0);
    });
});
