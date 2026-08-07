// §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR (ADR-0299) — the draw-step idle decision.
//
// The old 60 s watchdog authored a 10 × 8 m parcel the user never asked for and advanced the
// flow to the generate-confirm step. These pin the three things that were wrong with it, and
// the one thing that replaces it.

import { describe, it, expect } from 'vitest';
import { decideDrawIdleAction, DRAW_IDLE_OFFER_MS } from '../src/ui/onboarding/drawIdleWatchdog.js';

const T0 = 1_000_000;
const base = {
    nowMs: T0 + DRAW_IDLE_OFFER_MS + 1,
    lastActivityAtMs: T0,
    drawSurfaceReadyAtMs: T0 as number | null,
    documentHidden: false,
    alreadyOffered: false,
};

describe('§FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR — decideDrawIdleAction', () => {
    it('the only outcome of an expired idle window is an OFFER — authoring is unrepresentable', () => {
        const d = decideDrawIdleAction(base);
        expect(d.action).toBe('offer');
        // The type has no 'commit' member; assert at runtime too so a future widening is caught.
        expect(['wait', 'offer']).toContain(d.action);
    });

    // ── (1) A hidden tab's idleness is not evidence about the user ────────────────
    it('NEVER offers while the tab is hidden — background idleness carries no information', () => {
        const d = decideDrawIdleAction({ ...base, documentHidden: true, nowMs: T0 + 10 * DRAW_IDLE_OFFER_MS });
        expect(d).toEqual({ action: 'wait', because: 'tab-hidden' });
    });

    // ── (2) Never punish the user for our own slowness ────────────────────────────
    it('NEVER offers before the draw surface is ready (the tiles stall must not burn the window)', () => {
        const d = decideDrawIdleAction({ ...base, drawSurfaceReadyAtMs: null, nowMs: T0 + 10 * DRAW_IDLE_OFFER_MS });
        expect(d).toEqual({ action: 'wait', because: 'surface-not-ready' });
    });

    it('starts the clock at surface-ready, not at step-render — a 25 s tile stall does not count against the user', () => {
        // Step rendered at T0; the map only became drawable 25 s later; 40 s have passed since.
        const readyAt = T0 + 25_000;
        const d = decideDrawIdleAction({
            ...base,
            lastActivityAtMs: T0,
            drawSurfaceReadyAtMs: readyAt,
            nowMs: readyAt + 40_000,
        });
        expect(d).toEqual({ action: 'wait', because: 'recent-activity' });
        // …and it does offer once a FULL window has elapsed on the ready surface.
        expect(decideDrawIdleAction({
            ...base,
            lastActivityAtMs: T0,
            drawSurfaceReadyAtMs: readyAt,
            nowMs: readyAt + DRAW_IDLE_OFFER_MS + 1,
        }).action).toBe('offer');
    });

    // ── (3) An engaged user is never interrupted (§L-420, preserved) ──────────────
    it('defers while the user is interacting', () => {
        const d = decideDrawIdleAction({ ...base, lastActivityAtMs: base.nowMs - 5_000 });
        expect(d).toEqual({ action: 'wait', because: 'recent-activity' });
    });

    it('does not fire exactly ON the boundary — strictly greater than the window', () => {
        const d = decideDrawIdleAction({ ...base, nowMs: T0 + DRAW_IDLE_OFFER_MS });
        expect(d.action).toBe('offer');
        expect(decideDrawIdleAction({ ...base, nowMs: T0 + DRAW_IDLE_OFFER_MS - 1 }).action).toBe('wait');
    });

    // ── (4) Offer once, never nag ─────────────────────────────────────────────────
    it('offers at most once', () => {
        expect(decideDrawIdleAction({ ...base, alreadyOffered: true }))
            .toEqual({ action: 'wait', because: 'already-offered' });
    });

    it('a hidden tab wins over every other condition', () => {
        expect(decideDrawIdleAction({
            ...base, documentHidden: true, drawSurfaceReadyAtMs: null, alreadyOffered: true,
        }).because).toBe('tab-hidden');
    });
});
