// §FURNISH-DROP-SURFACING (editor half) — the ceiling→furnish cascade CARRIES
// the ceiling outcome, and the §CHAIN-TIMEOUT fallback cannot double-fire.
//
// Identical pattern to the furnish→lighting fix one stage downstream
// (lightingCascadeOutcome.test.ts): when the ceiling stage is dropped, the
// fallback fires furnish with `ceilingOutcome { state:'dropped', reason }` on
// the `furnish.layout-execute` payload instead of a bare `{}` — the drop fact
// travels with the event (C75 §1.4) rather than dying in a console.warn.
//
// Anti-double-fire: a LATE `ceiling.layout-executed` arriving after the
// fallback already fired furnish for the run must NOT fire furnish again
// (double furniture). Here the pre-existing `state.fired` dedup (which the
// ceiling handler, unlike lighting's furnish handler, never resets) already
// prevents it — these tests LOCK that invariant so a future
// "§CEILING-ALWAYS-FURNISHES"-style reset cannot silently reintroduce the
// hazard the lighting cascade had.
//
// Outcome-carrying tests written RED-FIRST (C70 §5.6); the double-fire locks
// are regression pins.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./FurnishLayoutExecutor.js', () => ({
    FurnishLayoutExecutor: class {
        attach(): void { /* stub */ }
        detach(): void { /* stub */ }
    },
}));

vi.mock('../house-layout/houseFanoutGuard.js', () => ({
    isHouseFanoutActive: () => false,
}));

vi.mock('./furnishScopeModal.js', () => ({
    FurnishScopeModal: class {
        show(): void { /* stub */ }
    },
}));

vi.mock('./furnishAllFloorsDriver.js', () => ({
    driveFurnishAllFloors: async () => [],
    summariseFurnishCoverage: () => ({
        lines: [], floors: 0, totalFurnished: 0, totalSkipped: 0, totalPlaced: 0, timedOutFloors: 0,
    }),
}));

interface CeilingOutcome {
    state?: 'completed' | 'dropped';
    placedCount?: number;
    roomCount?: number;
    reason?: string;
}

function makeRuntime() {
    const handlers = new Map<string, Set<(p: unknown) => void>>();
    const fired: Array<{ ceilingOutcome?: CeilingOutcome }> = [];
    const events = {
        on(k: string, fn: (p: unknown) => void): () => void {
            if (!handlers.has(k)) handlers.set(k, new Set());
            handlers.get(k)!.add(fn);
            return () => handlers.get(k)?.delete(fn);
        },
        emit(k: string, payload: unknown): void {
            if (k === 'furnish.layout-execute') fired.push((payload ?? {}) as { ceilingOutcome?: CeilingOutcome });
            for (const fn of [...(handlers.get(k) ?? [])]) fn(payload);
        },
    };
    const runtime = { events, bus: { executeCommand: () => undefined } } as unknown as
        import('@pryzm/runtime-composer').PryzmRuntime;
    return { runtime, events, fired };
}

async function freshInstall() {
    vi.resetModules();
    const mod = await import('./furnishLayoutTrigger.js');
    const { runtime, events, fired } = makeRuntime();
    mod.installFurnishLayoutTrigger(runtime);
    return { runtime, events, fired };
}

const FALLBACK_MS = 12_000;

describe('furnishLayoutTrigger — ceiling outcome carrying + §CHAIN-TIMEOUT double-fire lock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('ceiling-event path: the fired payload carries the completed ceiling outcome', async () => {
        const { events, fired } = await freshInstall();
        events.emit('apartment.layout-executed', {});
        events.emit('ceiling.layout-executed', {
            placedCount: 12, roomCount: 6, levelId: 'L1',
            outcome: { state: 'completed', placedCount: 12, roomCount: 6 },
        });
        vi.advanceTimersByTime(1);

        expect(fired.length).toBe(1);
        expect(fired[0]!.ceilingOutcome).toEqual({ state: 'completed', placedCount: 12, roomCount: 6 });
    });

    it('legacy ceiling payload (counts, no outcome field) still yields a completed outcome', async () => {
        const { events, fired } = await freshInstall();
        events.emit('apartment.layout-executed', {});
        events.emit('ceiling.layout-executed', { placedCount: 8, roomCount: 4 });
        vi.advanceTimersByTime(1);

        expect(fired.length).toBe(1);
        expect(fired[0]!.ceilingOutcome?.state).toBe('completed');
        expect(fired[0]!.ceilingOutcome?.placedCount).toBe(8);
        expect(fired[0]!.ceilingOutcome?.roomCount).toBe(4);
    });

    it('a ceiling payload that says nothing yields NO fabricated outcome (undefined, not a fake completed)', async () => {
        const { events, fired } = await freshInstall();
        events.emit('apartment.layout-executed', {});
        events.emit('ceiling.layout-executed', {});
        vi.advanceTimersByTime(1);

        expect(fired.length).toBe(1);
        expect(fired[0]!.ceilingOutcome).toBeUndefined();
    });

    it('fallback-timeout path: the fired payload carries dropped + the §CHAIN-TIMEOUT reason', async () => {
        const { events, fired } = await freshInstall();
        events.emit('apartment.layout-executed', {});
        vi.advanceTimersByTime(FALLBACK_MS);
        vi.advanceTimersByTime(1);

        expect(fired.length).toBe(1);
        expect(fired[0]!.ceilingOutcome).toEqual({
            state: 'dropped',
            reason: 'no ceiling.layout-executed within 12000 ms (§CHAIN-TIMEOUT fallback fired)',
        });
    });

    it('DOUBLE-FIRE lock: a slow ceiling (late event AFTER the fallback fired) furnishes EXACTLY once', async () => {
        const { events, fired } = await freshInstall();
        events.emit('apartment.layout-executed', {});
        vi.advanceTimersByTime(FALLBACK_MS);
        vi.advanceTimersByTime(1);
        expect(fired.length).toBe(1); // the fallback firing

        // Ceiling finally completes at ~20 s — must NOT re-fire furnish.
        events.emit('ceiling.layout-executed', {
            placedCount: 12, roomCount: 6,
            outcome: { state: 'completed', placedCount: 12, roomCount: 6 },
        });
        vi.advanceTimersByTime(1000);

        expect(fired.length).toBe(1); // STILL exactly one
    });

    it('a NEW apartment run after a timed-out one re-arms and furnishes again (reset not broken by the lock)', async () => {
        const { events, fired } = await freshInstall();
        events.emit('apartment.layout-executed', {});
        vi.advanceTimersByTime(FALLBACK_MS);
        vi.advanceTimersByTime(1);
        expect(fired.length).toBe(1);

        // Fresh apartment build → fresh chain: ceiling completes normally.
        events.emit('apartment.layout-executed', {});
        events.emit('ceiling.layout-executed', {
            outcome: { state: 'completed', placedCount: 9, roomCount: 5 },
        });
        vi.advanceTimersByTime(1);
        expect(fired.length).toBe(2);
        expect(fired[1]!.ceilingOutcome?.state).toBe('completed');
    });
});
