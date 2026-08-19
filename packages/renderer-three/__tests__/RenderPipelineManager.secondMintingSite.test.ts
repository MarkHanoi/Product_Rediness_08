/**
 * §L-966-SECOND-MINTING-SITE (L-1003) — "Render pipeline retries exhausted —
 * phase=error" came BACK, and it was never only one site.
 *
 * ── L-981'S OPEN QUESTION, ANSWERED ──────────────────────────────────────────
 * L-981 asks: is the deployed bundle older than `551e7131` (the L-966 fix), or is
 * there a SECOND minting site? **Second site — six of them — and the bundle is
 * NEWER, not older.** The proof of the bundle age is in the founder's own console:
 * it prints `§L-966-BOUNDED-AUTO-RECOVERY … 2/2`, and every one of those strings
 * was ADDED BY 551e7131 itself (`git show 551e7131 -- …/RenderPipelineManager.ts`
 * shows them as `+` lines). A build that prints them cannot predate them. So this
 * is not a stale deploy and it is not a regression of the L-966 fix — it is
 * territory the L-966 fix never covered.
 *
 * ── THE MECHANISM ────────────────────────────────────────────────────────────
 * `ViewportCrashGuard.handlePipelineError(error?: Error)` still mints
 * `error ?? new Error('Render pipeline retries exhausted — phase=error')` — which
 * is correct as a last resort. `initScene.ts:3070` passes `status.lastError ??
 * undefined`. So the string appears exactly when `lastError` is null.
 *
 * L-966 routed ONE of the seven `phase='error'` paths (the resource-lifetime
 * escalation) through `_failLoudly()`, which sets `_lastError`. The other SIX set
 * `this._phase = 'error'; this._emitState();` with `_lastError` still null.
 *
 * The founder's is the manual "Reload viewport" path, and it is the worst of the
 * six: `_driveRecoveryRebuild()` deliberately CLEARS `_lastError` on the way in
 * ("drop the stale cause so a LATER, unrelated failure cannot be reported with
 * this one's message" — correct), and the rebuild's own `.catch` then never set a
 * new one. So the slot was guaranteed empty at exactly the moment the escalation
 * was published.
 *
 * ── WHY THIS IS NOT COSMETIC ─────────────────────────────────────────────────
 * `ViewportCrashGuard._diagnose()` keys on the error SIGNATURE to decide whether to
 * tell the user "this is a PRYZM rendering defect" or fall through to the default
 * "probably your graphics driver". An escalation with no identity does not merely
 * under-inform — it MISATTRIBUTES our own defect to the user's hardware, and costs
 * us the bug report. That is L-966's own stated reasoning, applied to the six
 * paths it did not reach.
 *
 * ⛔ No diagnostic is weakened and no behaviour changes: `_failWithCause()`
 * deliberately does NOT latch `_hasPipelineError`, which `_failLoudly()` does. That
 * latch is right for a destroyed-GPU-resource fault and wrong as a blanket change
 * to six unrelated build failures. Only the message changes.
 */

import { describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** The string the crash guard mints when it is handed nothing. */
const FABRICATION = /retries exhausted/i;

/**
 * A WebGPU-shaped RPM with the async rebuild stubbed, so the test observes the
 * ESCALATION (what did the crash guard get told?) rather than a GPU it does not have.
 */
function makeRig() {
    const rpm = new RenderPipelineManager() as any;

    rpm._webGpuActive = true;
    rpm._renderer = {
        isWebGPURenderer: true,
        backend: { isWebGPUBackend: true },
        domElement: { clientWidth: 1200, clientHeight: 900, width: 1200, height: 900 },
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        getSize: (t: any) => { if (t?.set) { t.set(1200, 900); return t; } return { x: 1200, y: 900 }; },
        setSize: () => { /* noop */ },
    };
    rpm._renderPipeline = { render: () => {}, dispose: () => {} };
    rpm._scene  = { traverse: () => {}, children: [] };
    rpm._camera = {};

    rpm._recreateLightOwnedShadowMaps = vi.fn(() => {});
    rpm._resetCompiledNodeStates      = vi.fn(() => {});
    rpm._safeDisposeRenderPipeline    = vi.fn(() => {});
    rpm._reconcileRenderSize          = vi.fn(() => {});

    // Everything the crash guard would see. `initScene` reads `lastError` off these.
    const emitted: Array<{ phase: string; lastError?: Error | null }> = [];
    rpm.onStateChange = (s: any) => { emitted.push({ phase: s.phase, lastError: s.lastError }); };

    return {
        rpm,
        emitted,
        get terminal() { return emitted.filter(e => e.phase === 'error'); },
        /** What `initScene.ts:3070` would hand `handlePipelineError()`. */
        get handedToCrashGuard(): Error | undefined {
            return rpm.status.lastError ?? undefined;
        },
    };
}

describe('§L-966-SECOND-MINTING-SITE (L-1003) — every phase=error escalation carries a cause', () => {
    it('THE FOUNDER\'S PATH: a manual "Reload viewport" whose rebuild throws still names what died', async () => {
        const rig = makeRig();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        // The rebuild the recovery drives fails — with a cause that is NOT a
        // shader-compile error, so it does not take the §RPM-RECOVERY-DOWNGRADE exit.
        rig.rpm._rebuildPipelineWithCurrentState = vi.fn(
            async () => { throw new Error('device is lost and the node cache is stale'); },
        );

        // The user clicks "Reload viewport" (ViewportCrashGuard's recovery lever).
        expect(rig.rpm.recoverFromRenderFailure()).toBe(true);
        await new Promise(r => setTimeout(r, 0));

        expect(rig.rpm.status.phase).toBe('error');

        const handed = rig.handedToCrashGuard;
        // NEGATIVE: the guard must not be left to mint its own message. Before this
        // fix `_driveRecoveryRebuild` had cleared `_lastError` and nothing refilled it,
        // so this was `undefined` and the card said "retries exhausted" — naming a
        // retry ladder that had not run.
        expect(handed).toBeDefined();
        // POSITIVE on the SAME expression: it says what actually failed…
        expect(handed!.message).toMatch(/could not recover/i);
        // …and carries the underlying cause, so `_diagnose()` has a signature to key on.
        expect(handed!.message).toContain('device is lost');
        expect(handed!.message).not.toMatch(FABRICATION);

        // The terminal EMISSION carried it too — a cause the listener never receives
        // is the same as no cause.
        expect(rig.terminal).not.toHaveLength(0);
        expect(rig.terminal[rig.terminal.length - 1]!.lastError).toBeTruthy();
        vi.restoreAllMocks();
    });

    it('a camera/view-change rebuild failure carries its cause too', async () => {
        const rig = makeRig();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});

        rig.rpm._fullRebuild = vi.fn(async () => { throw new Error('scenePass recomposition failed'); });
        await rig.rpm.updateCamera({ isPerspectiveCamera: true });

        expect(rig.rpm.status.phase).toBe('error');
        const handed = rig.handedToCrashGuard;
        expect(handed).toBeDefined();
        expect(handed!.message).not.toMatch(FABRICATION);
        expect(handed!.message).toContain('scenePass recomposition failed');
        vi.restoreAllMocks();
    });

    it('the ONE path where "retries exhausted" was literally true now says WHICH retries', async () => {
        // Post-FX ladder exhaustion is real — this is the `render()` catch block's
        // `else` arm, the only one of the seven escalations where the old string was
        // not a fabrication. It was still WRONG, because it implied the whole viewport
        // had given up. It had not: that branch renders on, without post-FX. Naming
        // the wrong subject is its own defect, and the crash guard's `_diagnose()`
        // cannot key on a signature that describes the wrong subsystem.
        const rig = makeRig();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});

        // Spend the ladder, then make the submit throw a plain (non-shader,
        // non-resource-lifetime) failure so it falls through to the `else`.
        rig.rpm._retryCount = 3; // MAX_RETRIES
        rig.rpm._renderPipeline = { render: () => { throw new Error('post-fx graph failed'); }, dispose: () => {} };
        rig.rpm.render(0.016);

        expect(rig.rpm.status.phase).toBe('error');
        const handed = rig.handedToCrashGuard;
        expect(handed).toBeDefined();
        // It names the SUBSYSTEM that gave up…
        expect(handed!.message).toMatch(/post-processing/i);
        // …and says the viewport is still drawing, which is the fact the old string
        // contradicted.
        expect(handed!.message).toMatch(/without post-FX/i);
        expect(handed!.message).not.toMatch(FABRICATION);
        vi.restoreAllMocks();
    });

    it('NEGATIVE CONTROL: `lastError` is still null while the pipeline is healthy', () => {
        // The whole value of the assertions above is that an empty slot MEANS
        // something. If `lastError` were populated unconditionally they would pass
        // vacuously.
        const rig = makeRig();
        expect(rig.rpm.status.phase).not.toBe('error');
        expect(rig.rpm.status.lastError).toBeNull();
    });
});
