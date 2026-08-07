// @vitest-environment happy-dom
/**
 * §GPU-RESOURCE-LIFETIME (ADR-0281) — ViewportCrashGuard suppression must be
 * ACCOUNTED, not silent.
 *
 * WHY THIS EXISTS. `§I3-USEDTIMES-SUPPRESS` swallows every error whose message
 * contains `usedTimes`, calls `preventDefault()` so the browser does not even log
 * it, and never escalates. That reasoning is correct for ONE stale-session
 * teardown after a project switch. It is wrong at volume: `usedTimes` is the
 * dispose-time symptom of the SAME defect family as the founder's
 * `setIndexBuffer … not of type 'GPUBuffer'` hard stop — a GPU resource released
 * while the renderer still referenced it.
 *
 * A second founder session made the cost explicit: a flood of the WebGL2 sibling
 * (`bindTexture: attempt to use a deleted object`, ×251) ended with
 * "WebGL: too many errors, no more errors will be reported to the console for
 * this context" — the diagnostic channel switched ITSELF off mid-incident. A
 * guard that also suppresses is a second blindfold on the same eye.
 *
 * Contract: keep the overlay hidden for isolated occurrences (a single teardown
 * throw must not bounce the user), but count them and escalate a burst.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewportCrashGuard } from '../src/ui/primitives/ViewportCrashGuard';

/** Fire a window 'error' event carrying `message`, returning whether it was suppressed. */
function fireError(message: string): boolean {
    const evt = new (globalThis as any).ErrorEvent('error', { message, error: new Error(message), cancelable: true });
    window.dispatchEvent(evt);
    return evt.defaultPrevented;
}

const USED_TIMES = "Cannot read properties of undefined (reading 'usedTimes')";

describe('ViewportCrashGuard — §I3 suppression is accounted (ADR-0281)', () => {
    let guard: ViewportCrashGuard;

    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        guard = new ViewportCrashGuard();
        guard.activate();
    });

    afterEach(() => {
        guard.deactivate();
        vi.restoreAllMocks();
    });

    it('still suppresses an ISOLATED usedTimes throw (no overlay, no console noise)', () => {
        expect(fireError(USED_TIMES)).toBe(true);
        expect(guard.suppressedNonFatalCount).toBe(1);
    });

    it('COUNTS suppressions instead of discarding them silently', () => {
        for (let i = 0; i < 5; i++) fireError(USED_TIMES);
        expect(guard.suppressedNonFatalCount).toBe(5);
    });

    it('ESCALATES a burst — a flood is a live lifetime fault, not teardown noise', () => {
        // 12 is the threshold; the 13th crosses it and must reach the render-failure
        // path (which logs the real error + stack rather than swallowing it).
        for (let i = 0; i < 13; i++) fireError(USED_TIMES);

        expect(guard.suppressedNonFatalCount).toBe(13);
        const escalated = (console.error as any).mock.calls.some(
            (args: unknown[]) =>
                typeof args[0] === 'string' && args[0].includes('§GPU-RESOURCE-LIFETIME'),
        );
        expect(escalated).toBe(true);
    });

    it('deactivate() clears the suppression accounting', () => {
        for (let i = 0; i < 3; i++) fireError(USED_TIMES);
        expect(guard.suppressedNonFatalCount).toBe(3);
        guard.deactivate();
        expect(guard.suppressedNonFatalCount).toBe(0);
        guard.activate(); // so afterEach's deactivate is symmetric
    });
});
