// @vitest-environment happy-dom
/**
 * §GPU-RESOURCE-LIFETIME (ADR-0297) — the crash guard must NEVER recover through
 * `onProjectSwitch()`.
 *
 * ADR-0297 Consequences says this in so many words:
 *
 *   "⚠ Recovery for this class MUST use `_rebuildPipeline()`, NEVER
 *    `onProjectSwitch()`. … routing recovery through it prints a confident
 *    recovery message and leaves the viewport permanently dark with no error. It
 *    is the habitual 'soft recovery' lever in this codebase and it does not do
 *    what its callers assume."
 *
 * …and then pinned it with a regression test INSIDE `RenderPipelineManager`,
 * leaving the forbidden call live one layer up, right here in `ViewportCrashGuard`.
 * The founder hit the consequence three times in a single session on build
 * 096e12b4:
 *
 *   [ViewportCrashGuard] Soft recovery initiated via RPM.onProjectSwitch().
 *
 * A documented landmine with no test at the layer that steps on it is not pinned.
 * This suite pins it at that layer, so the next caller cannot reintroduce it.
 *
 * It also pins the HONESTY of the crash copy. The default card says the crash is
 * "usually caused by a GPU driver issue or browser memory pressure" — for this
 * fault class that is false, it is our own resource-lifetime defect, and blaming
 * the user's driver for our bug both misinforms them and costs us the bug report.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shown: Array<Record<string, unknown>> = [];

vi.mock('../src/ui/fallbacks/SceneCrashFallback', () => ({
    showSceneCrashFallback: (opts: Record<string, unknown>) => { shown.push(opts); },
    hideSceneCrashFallback: () => { /* noop */ },
}));

import { ViewportCrashGuard } from '../src/ui/primitives/ViewportCrashGuard';

const SET_INDEX_BUFFER_FAILURE =
    "Failed to execute 'setIndexBuffer' on 'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'.";

function fakeRpm() {
    return {
        onProjectSwitch: vi.fn(),
        recoverFromRenderFailure: vi.fn(() => true),
    };
}

/** Click the "Reload viewport" button of the most recent crash card. */
function clickRetry(): void {
    const opts = shown[shown.length - 1];
    (opts?.onRetry as (() => void) | undefined)?.();
}

describe('ViewportCrashGuard — recovery lever (§GPU-RESOURCE-LIFETIME, ADR-0297)', () => {
    let reload: ReturnType<typeof vi.fn>;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        shown.length = 0;
        reload = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, reload },
        });
        logSpy  = vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        errSpy  = vi.spyOn(console, 'error').mockImplementation(() => { /* quiet */ });
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    });
    afterEach(() => {
        logSpy.mockRestore(); errSpy.mockRestore(); warnSpy.mockRestore();
        delete (window as unknown as Record<string, unknown>).renderPipelineManager;
    });

    it('recovers via recoverFromRenderFailure() and NEVER via onProjectSwitch()', () => {
        const rpm = fakeRpm();
        (window as unknown as Record<string, unknown>).renderPipelineManager = rpm;

        const guard = new ViewportCrashGuard();
        guard.handlePipelineError(new Error('Render pipeline retries exhausted — phase=error'));
        clickRetry();

        expect(rpm.recoverFromRenderFailure).toHaveBeenCalledTimes(1);
        // TOOTH: this is the exact line the founder saw three times, and the reason
        // the viewport stayed dark after every "successful" recovery.
        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it('falls back to a hard reload when the lever reports nothing to rebuild', () => {
        const rpm = fakeRpm();
        rpm.recoverFromRenderFailure = vi.fn(() => false);
        (window as unknown as Record<string, unknown>).renderPipelineManager = rpm;

        const guard = new ViewportCrashGuard();
        guard.handlePipelineError(new Error('Render pipeline retries exhausted — phase=error'));
        clickRetry();

        // Never log a recovery that did not happen; reload instead.
        expect(reload).toHaveBeenCalledTimes(1);
        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
    });

    it('falls back to a hard reload when the pipeline manager is absent', () => {
        const guard = new ViewportCrashGuard();
        guard.handlePipelineError(new Error('Render pipeline retries exhausted — phase=error'));
        clickRetry();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});

describe('ViewportCrashGuard — honest crash copy for a classified defect', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        shown.length = 0;
        logSpy  = vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        errSpy  = vi.spyOn(console, 'error').mockImplementation(() => { /* quiet */ });
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    });
    afterEach(() => { logSpy.mockRestore(); errSpy.mockRestore(); warnSpy.mockRestore(); });

    it('names it as a PRYZM defect, not the user\'s GPU driver', () => {
        const guard = new ViewportCrashGuard();
        guard.handlePipelineError(new Error(SET_INDEX_BUFFER_FAILURE));

        const diagnosis = String(shown[0]?.diagnosis ?? '');
        expect(diagnosis).toMatch(/PRYZM rendering defect/i);
        expect(diagnosis).toMatch(/not a problem with your graphics driver/i);
    });

    it('latches the diagnosis so the signature-free "retries exhausted" escalation is still honest', () => {
        const guard = new ViewportCrashGuard();
        guard.activate();

        // The raw fault is observed first (as a suppressed non-fatal dispose throw)…
        window.dispatchEvent(new ErrorEvent('error', {
            message: "Cannot read properties of undefined (reading 'usedTimes')",
        }));
        // …and the pipeline escalates later with a message carrying no signature.
        guard.handlePipelineError(new Error('Render pipeline retries exhausted — phase=error'));

        expect(String(shown[0]?.diagnosis ?? '')).toMatch(/PRYZM rendering defect/i);
        guard.deactivate();
    });

    it('leaves the generic copy in place when the cause is genuinely unknown', () => {
        const guard = new ViewportCrashGuard();
        guard.handlePipelineError(new Error('WebGPU device lost: driver reset'));
        // No diagnosis → SceneCrashFallback keeps its default body copy. We do not
        // invent a confident explanation we do not have.
        expect(shown[0]?.diagnosis).toBeUndefined();
    });
});
