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
// (double furniture). Those locks are below and they still hold.
//
// ⚠ THIS HEADER USED TO SAY THE OPPOSITE OF WHAT THE FILE NOW LOCKS, AND THE
// CORRECTION IS THE POINT — recorded, not quietly rewritten.
//
// It read: *"the pre-existing `state.fired` dedup (which the ceiling handler,
// unlike lighting's furnish handler, never resets) already prevents it — these
// tests LOCK that invariant so a future '§CEILING-ALWAYS-FURNISHES'-style reset
// cannot silently reintroduce the hazard the lighting cascade had."*
//
// That sentence was RIGHT about the hazard and WRONG about the remedy, and the
// cost was measured (L-10770): because the ceiling handler never reset `fired`,
// and because **the residential pipeline never emits `apartment.layout-executed`**
// (`ResidentialBuildingExecutor.ts:851`, `:3073` — it drives `triggerCeilingLayout`
// directly, once per level), a 5-storey residential building furnished exactly
// ONE storey, and a second build in the same session furnished NONE. The founder
// asked for five floors and would have got furniture on one.
//
// The remedy is not to withhold the reset — withholding it is what starved every
// level after the first. It is to take the reset TOGETHER WITH the one-shot
// `fallbackFired` guard that made the identical shape safe in
// `lightingLayoutTrigger` (§FURNISH-ALWAYS-LIGHTS). Half the sibling's pattern had
// been copied; §CEILING-ALWAYS-FURNISHES restores the other half. Reset and guard
// are ONE mechanism — a future edit that keeps one and drops the other reopens
// either this defect or the double-fire it was guarding against.
//
// So this file now locks BOTH halves: the double-fire locks (unchanged, and they
// pass because a late event carries no NEW level) and the per-level fan-out counts.
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
    const fired: Array<{ ceilingOutcome?: CeilingOutcome; levelId?: string }> = [];
    const events = {
        on(k: string, fn: (p: unknown) => void): () => void {
            if (!handlers.has(k)) handlers.set(k, new Set());
            handlers.get(k)!.add(fn);
            return () => handlers.get(k)?.delete(fn);
        },
        emit(k: string, payload: unknown): void {
            if (k === 'furnish.layout-execute') fired.push((payload ?? {}) as { ceilingOutcome?: CeilingOutcome; levelId?: string });
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

// ─── §CEILING-ALWAYS-FURNISHES (L-10770) — the RESIDENTIAL fan-out ───────────
//
// These reproduce the residential pipeline's ACTUAL event shape, which is the
// only shape that exposed the defect:
//   • it NEVER emits `apartment.layout-executed` (the executor says so twice);
//   • it emits ONE `ceiling.layout-executed` PER LEVEL, each stamped with its
//     own `levelId`, from a serialised queue that advances on the real commit.
//
// Written RED-FIRST (C70 §5.6). On the pre-fix HEAD the first assertion below
// reads 1, not 3 — furniture on one storey of a five-storey building.
describe('§CEILING-ALWAYS-FURNISHES — a multi-storey residential build furnishes EVERY storey', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    /** One level's ceilings committing, exactly as the residential queue emits it. */
    const ceilLevel = (events: { emit(k: string, p: unknown): void }, levelId: string, placed: number): void => {
        events.emit('ceiling.layout-executed', {
            levelId, placedCount: placed, roomCount: placed,
            outcome: { state: 'completed', placedCount: placed, roomCount: placed },
        });
        vi.advanceTimersByTime(1);
    };

    it('THREE per-level ceiling commits furnish THREE times — not once (the L-10770 defect)', async () => {
        const { events, fired } = await freshInstall();

        // NO apartment.layout-executed — the residential pipeline never emits it.
        ceilLevel(events, 'L0', 4);
        ceilLevel(events, 'L1', 7);
        ceilLevel(events, 'L2', 7);

        // THE MEASURED QUANTITY: one furnish run per storey whose ceilings landed.
        // Pre-fix this is 1 — levels L1 and L2 were silently never furnished.
        expect(fired.length).toBe(3);
    });

    it('each furnish run carries the levelId of the storey that was just ceiled (§LEVEL-IS-EXPLICIT)', async () => {
        const { events, fired } = await freshInstall();

        ceilLevel(events, 'L0', 4);
        ceilLevel(events, 'L1', 7);
        ceilLevel(events, 'L2', 7);

        // Not merely "three fired" — three fired FOR THE RIGHT STOREYS, in order.
        // Without the forwarded id the executor falls back to the active level and
        // every run would target whichever storey the queue last made active.
        expect(fired.map((f) => f.levelId)).toEqual(['L0', 'L1', 'L2']);
    });

    it('each run carries its OWN storey ceiling outcome, not the first storey\'s', async () => {
        const { events, fired } = await freshInstall();

        ceilLevel(events, 'L0', 4);
        ceilLevel(events, 'L1', 9);

        expect(fired.length).toBe(2);
        expect(fired[0]!.ceilingOutcome).toEqual({ state: 'completed', placedCount: 4, roomCount: 4 });
        expect(fired[1]!.ceilingOutcome).toEqual({ state: 'completed', placedCount: 9, roomCount: 9 });
    });

    it('a SECOND residential build in the same session still furnishes (the stuck-flag half)', async () => {
        const { events, fired } = await freshInstall();

        // First build — three storeys.
        ceilLevel(events, 'L0', 4);
        ceilLevel(events, 'L1', 7);
        ceilLevel(events, 'L2', 7);
        expect(fired.length).toBe(3);

        // Second build, same session, new levels. Pre-fix `state.fired` was stuck
        // true with nothing able to reset it (no apartment event is ever emitted),
        // so this furnished ZERO storeys.
        ceilLevel(events, 'L3', 5);
        ceilLevel(events, 'L4', 5);

        expect(fired.length).toBe(5);
        expect(fired.map((f) => f.levelId)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
    });

    it('the double-fire lock still holds ACROSS the new reset: late ceiling after a fallback does not re-furnish', async () => {
        const { events, fired } = await freshInstall();

        // An apartment run that times out — the fallback furnishes once.
        events.emit('apartment.layout-executed', {});
        vi.advanceTimersByTime(FALLBACK_MS);
        vi.advanceTimersByTime(1);
        expect(fired.length).toBe(1);

        // The slow ceiling stage finally announces. The new per-event reset must NOT
        // turn this into a second furnish — the one-shot `fallbackFired` guard eats it.
        ceilLevel(events, 'L0', 12);
        expect(fired.length).toBe(1);

        // …but the guard is ONE-SHOT: the NEXT storey's ceilings must still furnish,
        // or the fix would have traded the old defect for a subtler one.
        ceilLevel(events, 'L1', 6);
        expect(fired.length).toBe(2);
        expect(fired[1]!.levelId).toBe('L1');
    });
});
