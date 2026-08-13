// §FURNISH-DROP-SURFACING (editor half) — the furnish→lighting cascade CARRIES
// the furnish outcome, and the §CHAIN-TIMEOUT fallback can no longer DOUBLE-FIRE.
//
// Two defects under test (L-SURFACE root-cause findings, 2026-08-12):
//   A. The fired `lighting.layout-execute` payload was always `{}` — the
//      executor downstream had no way to know whether furnish completed,
//      completed empty, or was dropped. The payload must carry
//      `furnishOutcome` (completed{placedCount,roomCount} | dropped{reason}).
//   B. DOUBLE-FIRE: when furnish is merely SLOW (>12 s), the fallback fires
//      lighting, then the late `furnish.layout-executed` resets `state.fired`
//      (§FURNISH-ALWAYS-LIGHTS) and fires lighting AGAIN — double fixtures.
//      Once the fallback has fired for a run, the late event must NOT re-fire —
//      while a genuinely NEW furnish run (direct click) must still light
//      (§FURNISH-ALWAYS-LIGHTS preserved).
//
// Written RED-FIRST (C70 §5.6). Each test gets a FRESH module instance
// (vi.resetModules + dynamic import) because the trigger holds module-level
// `_cascadeWired` state.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./LightingLayoutExecutor.js', () => ({
    LightingLayoutExecutor: class {
        attach(): void { /* stub */ }
        detach(): void { /* stub */ }
    },
}));

vi.mock('../house-layout/houseFanoutGuard.js', () => ({
    isHouseFanoutActive: () => false,
}));

interface FurnishOutcome {
    state?: 'completed' | 'dropped';
    placedCount?: number;
    roomCount?: number;
    reason?: string;
}

function makeRuntime() {
    const handlers = new Map<string, Set<(p: unknown) => void>>();
    const fired: Array<{ furnishOutcome?: FurnishOutcome }> = [];
    const events = {
        on(k: string, fn: (p: unknown) => void): () => void {
            if (!handlers.has(k)) handlers.set(k, new Set());
            handlers.get(k)!.add(fn);
            return () => handlers.get(k)?.delete(fn);
        },
        emit(k: string, payload: unknown): void {
            if (k === 'lighting.layout-execute') fired.push((payload ?? {}) as { furnishOutcome?: FurnishOutcome });
            for (const fn of [...(handlers.get(k) ?? [])]) fn(payload);
        },
    };
    const runtime = { events, bus: { executeCommand: () => undefined } } as unknown as
        import('@pryzm/runtime-composer').PryzmRuntime;
    return { runtime, fired };
}

async function freshInstall() {
    vi.resetModules();
    const mod = await import('./lightingLayoutTrigger.js');
    const { runtime, fired } = makeRuntime();
    mod.installLightingLayoutTrigger(runtime);
    return { runtime, fired };
}

const FALLBACK_MS = 12_000;

describe('lightingLayoutTrigger — outcome carrying + §CHAIN-TIMEOUT double-fire guard', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('furnish-event path: the fired payload carries the completed outcome from the furnish payload', async () => {
        const { runtime, fired } = await freshInstall();
        runtime.events.emit('ceiling.layout-executed', {});
        runtime.events.emit('furnish.layout-executed', {
            placedCount: 24, roomCount: 6, levelId: 'L1',
            outcome: { state: 'completed', placedCount: 24, roomCount: 6 },
        });
        vi.advanceTimersByTime(1);

        expect(fired.length).toBe(1);
        expect(fired[0]!.furnishOutcome).toEqual({ state: 'completed', placedCount: 24, roomCount: 6 });
    });

    it('legacy furnish payload (counts, no outcome field) still yields a completed outcome', async () => {
        const { runtime, fired } = await freshInstall();
        runtime.events.emit('furnish.layout-executed', { placedCount: 7, roomCount: 3, levelId: 'L1' });
        vi.advanceTimersByTime(1);

        expect(fired.length).toBe(1);
        expect(fired[0]!.furnishOutcome?.state).toBe('completed');
        expect(fired[0]!.furnishOutcome?.placedCount).toBe(7);
        expect(fired[0]!.furnishOutcome?.roomCount).toBe(3);
    });

    it('a DROPPED furnish outcome (executor failure path) is forwarded verbatim', async () => {
        const { runtime, fired } = await freshInstall();
        runtime.events.emit('furnish.layout-executed', {
            placedCount: 0, roomCount: 4, levelId: 'L1',
            outcome: { state: 'dropped', reason: 'furniture.batch.create runBatch threw: batch exploded' },
        });
        vi.advanceTimersByTime(1);

        expect(fired.length).toBe(1);
        expect(fired[0]!.furnishOutcome).toEqual({
            state: 'dropped', reason: 'furniture.batch.create runBatch threw: batch exploded',
        });
    });

    it('fallback-timeout path: the fired payload carries dropped + the §CHAIN-TIMEOUT reason', async () => {
        const { runtime, fired } = await freshInstall();
        runtime.events.emit('ceiling.layout-executed', {});
        vi.advanceTimersByTime(FALLBACK_MS); // fallback fires
        vi.advanceTimersByTime(1);           // emit macrotask

        expect(fired.length).toBe(1);
        expect(fired[0]!.furnishOutcome).toEqual({
            state: 'dropped',
            reason: 'no furnish.layout-executed within 12000 ms (§CHAIN-TIMEOUT fallback fired)',
        });
    });

    it('DOUBLE-FIRE guard: slow furnish (late event AFTER the fallback fired) lights EXACTLY once', async () => {
        const { runtime, fired } = await freshInstall();
        runtime.events.emit('ceiling.layout-executed', {});
        vi.advanceTimersByTime(FALLBACK_MS);
        vi.advanceTimersByTime(1);
        expect(fired.length).toBe(1); // the fallback firing

        // Furnish finally completes at ~20 s — must NOT re-fire lighting.
        runtime.events.emit('furnish.layout-executed', {
            placedCount: 24, roomCount: 6, levelId: 'L1',
            outcome: { state: 'completed', placedCount: 24, roomCount: 6 },
        });
        vi.advanceTimersByTime(1000);

        expect(fired.length).toBe(1); // STILL exactly one
    });

    it('§FURNISH-ALWAYS-LIGHTS preserved: a genuinely NEW furnish run after the swallowed late event still lights', async () => {
        const { runtime, fired } = await freshInstall();
        runtime.events.emit('ceiling.layout-executed', {});
        vi.advanceTimersByTime(FALLBACK_MS);
        vi.advanceTimersByTime(1);
        runtime.events.emit('furnish.layout-executed', { placedCount: 24, roomCount: 6 }); // late — swallowed
        vi.advanceTimersByTime(1);
        expect(fired.length).toBe(1);

        // User clicks "Furnish all rooms (AI)" again — a NEW run: must light.
        runtime.events.emit('furnish.layout-executed', { placedCount: 24, roomCount: 6 });
        vi.advanceTimersByTime(1);
        expect(fired.length).toBe(2);
    });

    it('§FURNISH-ALWAYS-LIGHTS preserved: two direct furnish runs (no ceiling, no timeout) light twice', async () => {
        const { runtime, fired } = await freshInstall();
        runtime.events.emit('furnish.layout-executed', { placedCount: 5, roomCount: 2 });
        vi.advanceTimersByTime(1);
        runtime.events.emit('furnish.layout-executed', { placedCount: 5, roomCount: 2 });
        vi.advanceTimersByTime(1);
        expect(fired.length).toBe(2);
    });

    it('fast furnish before the fallback: exactly one firing, completed outcome, timer cancelled', async () => {
        const { runtime, fired } = await freshInstall();
        runtime.events.emit('ceiling.layout-executed', {});
        vi.advanceTimersByTime(3000);
        runtime.events.emit('furnish.layout-executed', {
            placedCount: 10, roomCount: 4,
            outcome: { state: 'completed', placedCount: 10, roomCount: 4 },
        });
        vi.advanceTimersByTime(FALLBACK_MS + 1000); // well past where the fallback would fire

        expect(fired.length).toBe(1);
        expect(fired[0]!.furnishOutcome?.state).toBe('completed');
    });
});
