// §STARTUP-MOVE-THE-GATE (lane PERF-OPEN, L-13277) — the gate's contract.
//
// What these specs are FOR: the change they guard moved the onboarding location step off
// `pryzm-project-loaded` (the full engine boot + project hydrate) and onto "the globe surface is
// live". The three properties that make that safe rather than a race are all invisible at a
// glance, and each has a matching failure this repo has paid for before:
//
//   1. The two signals are INDEPENDENT. If setting one accidentally settled the other, the
//      commit gate would open early and author into a half-built model — a silent ordering bug.
//   2. A LATE subscriber still resolves. A latch implemented as a fire-once event would strand
//      any consumer that subscribed after the fact (`null-at-mount-runtime-event-race`).
//   3. The gate NEVER opens on its own. No timeout, no poll — a location card over no globe is
//      the dishonest-state failure the design explicitly refuses.

import { beforeEach, describe, expect, it } from 'vitest';
import {
    markGlobeSurfaceLive,
    markEngineReadyForSite,
    whenGlobeSurfaceLive,
    whenEngineReadyForSite,
    isGlobeSurfaceLive,
    isEngineReadyForSite,
    __resetGlobeSurfaceGate,
} from '../globeSurfaceGate';

/** Resolve to 'settled' if the promise settles within a macrotask, else 'pending'. */
async function settleState(p: Promise<void>): Promise<'settled' | 'pending'> {
    return Promise.race([
        p.then(() => 'settled' as const),
        new Promise<'pending'>((r) => setTimeout(() => r('pending'), 25)),
    ]);
}

describe('§STARTUP-MOVE-THE-GATE — globeSurfaceGate', () => {
    beforeEach(() => { __resetGlobeSurfaceGate(); });

    it('starts CLOSED — neither signal opens on its own (no timeout, no poll)', async () => {
        expect(isGlobeSurfaceLive()).toBe(false);
        expect(isEngineReadyForSite()).toBe(false);
        // ⛔ If this ever reads 'settled', someone added a timeout fallback. A location card over
        // no globe is worse than none — that is the whole reason this gate exists.
        expect(await settleState(whenGlobeSurfaceLive())).toBe('pending');
        expect(await settleState(whenEngineReadyForSite())).toBe('pending');
    });

    it('the two signals are INDEPENDENT — the globe going live must not open the commit gate', async () => {
        markGlobeSurfaceLive();
        expect(await settleState(whenGlobeSurfaceLive())).toBe('settled');
        // THE important assertion of this file. The location step may open; authoring a site
        // may NOT, because the engine has not booted. Coupling these is the bug.
        expect(isEngineReadyForSite()).toBe(false);
        expect(await settleState(whenEngineReadyForSite())).toBe('pending');
    });

    it('the commit gate opens independently, and does not retro-open the globe gate', async () => {
        markEngineReadyForSite();
        expect(await settleState(whenEngineReadyForSite())).toBe('settled');
        expect(isGlobeSurfaceLive()).toBe(false);
        expect(await settleState(whenGlobeSurfaceLive())).toBe('pending');
    });

    it('a LATE subscriber still resolves — a latch, not a fire-once event', async () => {
        markGlobeSurfaceLive();
        markEngineReadyForSite();
        // Subscribing strictly AFTER both marks. A naive event-emitter implementation would
        // hang here forever, which is `null-at-mount-runtime-event-race` in a new costume.
        expect(await settleState(whenGlobeSurfaceLive())).toBe('settled');
        expect(await settleState(whenEngineReadyForSite())).toBe('settled');
    });

    it('an EARLY subscriber resolves when the mark later arrives', async () => {
        const early = whenGlobeSurfaceLive();
        expect(await settleState(early)).toBe('pending');
        markGlobeSurfaceLive();
        expect(await settleState(early)).toBe('settled');
    });

    it('marking twice is idempotent and does not throw', async () => {
        markGlobeSurfaceLive();
        markGlobeSurfaceLive();
        markEngineReadyForSite();
        markEngineReadyForSite();
        expect(isGlobeSurfaceLive()).toBe(true);
        expect(isEngineReadyForSite()).toBe(true);
        expect(await settleState(whenGlobeSurfaceLive())).toBe('settled');
    });

    it('hands the SAME promise to repeat callers (no per-call allocation that could diverge)', () => {
        expect(whenGlobeSurfaceLive()).toBe(whenGlobeSurfaceLive());
        expect(whenEngineReadyForSite()).toBe(whenEngineReadyForSite());
    });
});
