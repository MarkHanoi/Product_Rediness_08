// §FIX-BATCH-GEN-AUTOFRAME-3D (L-174) — behavioural specs for the coalesced 3D
// auto-frame-on-generation-complete coordinator. Proves: a batch-generation-complete
// signal frames the 3D view once on a scene with no active draw tool; the frame is
// suppressed while a draw tool is active; multiple per-level batches collapse to a
// SINGLE frame; and a new batch opening cancels a pending frame (no mid-generation
// hijack).

import { describe, expect, it, vi } from 'vitest';
import { createBatchAutoFrameCoordinator } from '../views/batchAutoFrame';

/** Deterministic timer seam: capture the pending callback, fire it on demand. */
function fakeScheduler() {
    let pending: (() => void) | null = null;
    return {
        set: (cb: () => void): number => { pending = cb; return 1; },
        clear: (): void => { pending = null; },
        /** Fire the currently-scheduled callback (the deferred frame). */
        flush(): void { const p = pending; pending = null; p?.(); },
        get hasPending(): boolean { return pending !== null; },
    };
}

describe('batchAutoFrame — §FIX-BATCH-GEN-AUTOFRAME-3D', () => {
    it('frames the 3D view once after a batch drains on a non-empty scene with no draw tool', () => {
        const frame = vi.fn();
        const sched = fakeScheduler();
        const c = createBatchAutoFrameCoordinator({
            frame,
            isSuppressed: () => false, // no draw tool active
            scheduler: sched,
        });

        c.onBatchStarted();
        c.onBatchEnded();          // last batch drained → frame scheduled
        expect(frame).not.toHaveBeenCalled(); // deferred, not synchronous
        expect(c.pending).toBe(true);

        sched.flush();             // the deferred frame lands
        expect(frame).toHaveBeenCalledTimes(1);
        expect(c.pending).toBe(false);
    });

    it('SUPPRESSES the frame when a draw tool is active (§AUTOFRAME-NO-HIJACK-WHILE-DRAWING)', () => {
        const frame = vi.fn();
        const sched = fakeScheduler();
        const c = createBatchAutoFrameCoordinator({
            frame,
            isSuppressed: () => true, // a draw tool is active
            scheduler: sched,
        });

        c.onBatchStarted();
        c.onBatchEnded();
        sched.flush();
        expect(frame).not.toHaveBeenCalled();
    });

    it('coalesces sequential per-level batches into a SINGLE frame', () => {
        const frame = vi.fn();
        const sched = fakeScheduler();
        const c = createBatchAutoFrameCoordinator({
            frame,
            isSuppressed: () => false,
            scheduler: sched,
        });

        // furnish-all-floors: one runBatch per level, back-to-back.
        c.onBatchStarted(); c.onBatchEnded();   // level 1 drains → frame scheduled
        expect(c.pending).toBe(true);
        c.onBatchStarted();                     // level 2 opens → pending frame cancelled
        expect(c.pending).toBe(false);
        c.onBatchEnded();                       // level 2 drains → frame re-scheduled
        c.onBatchStarted(); c.onBatchEnded();   // level 3
        sched.flush();

        expect(frame).toHaveBeenCalledTimes(1); // exactly one frame for the whole generation
    });

    it('does not frame until the LAST of nested/overlapping batches drains', () => {
        const frame = vi.fn();
        const sched = fakeScheduler();
        const c = createBatchAutoFrameCoordinator({
            frame,
            isSuppressed: () => false,
            scheduler: sched,
        });

        c.onBatchStarted();  // depth 1
        c.onBatchStarted();  // depth 2 (overlapping)
        c.onBatchEnded();    // depth 1 — not yet drained
        expect(c.pending).toBe(false);
        expect(c.depth).toBe(1);
        c.onBatchEnded();    // depth 0 — last drained → scheduled
        expect(c.pending).toBe(true);

        sched.flush();
        expect(frame).toHaveBeenCalledTimes(1);
    });

    it('invokes onFramed after a successful frame (satisfies the once-per-session flag)', () => {
        const frame = vi.fn();
        const onFramed = vi.fn();
        const sched = fakeScheduler();
        const c = createBatchAutoFrameCoordinator({
            frame,
            onFramed,
            isSuppressed: () => false,
            scheduler: sched,
        });

        c.onBatchStarted(); c.onBatchEnded();
        sched.flush();
        expect(onFramed).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onFramed when the frame is suppressed', () => {
        const frame = vi.fn();
        const onFramed = vi.fn();
        const sched = fakeScheduler();
        const c = createBatchAutoFrameCoordinator({
            frame,
            onFramed,
            isSuppressed: () => true,
            scheduler: sched,
        });

        c.onBatchStarted(); c.onBatchEnded();
        sched.flush();
        expect(frame).not.toHaveBeenCalled();
        expect(onFramed).not.toHaveBeenCalled();
    });

    it('a throwing frame() is non-fatal and still clears the pending timer', () => {
        const frame = vi.fn(() => { throw new Error('zoomToAll boom'); });
        const sched = fakeScheduler();
        const c = createBatchAutoFrameCoordinator({
            frame,
            isSuppressed: () => false,
            scheduler: sched,
        });

        c.onBatchStarted(); c.onBatchEnded();
        expect(() => sched.flush()).not.toThrow();
        expect(c.pending).toBe(false);
    });
});
