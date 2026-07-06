// @vitest-environment happy-dom
//
// §FIX-DB-SATURATION-RESILIENCE (L-137, 2026-07-06) — unit gate for the
// ServerSyncQueue circuit breaker. The 2026-07-06 DB-saturation cascade was
// amplified by this queue retrying failed autosaves against an already-saturated
// pooler. The breaker must:
//   • open after N consecutive server-health failures (5xx / timeout / network);
//   • while open, STOP touching the network (no amplification);
//   • probe with a single item once the cooldown elapses (half-open);
//   • close and resume normally once the server responds.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Controllable apiFetch: `state.status` drives success vs 5xx.
const state = vi.hoisted(() => ({ status: 500 }));
vi.mock('@pryzm/core-app-model', () => ({
    apiFetch: vi.fn(async () => ({
        status: state.status,
        ok: state.status >= 200 && state.status < 300,
        json: async () => ({}),
    })),
}));

import { apiFetch } from '@pryzm/core-app-model';
import { ServerSyncQueue } from '../src/ui/platform/ServerSyncQueue.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

function makeItem(id: string) {
    const version = {
        id,
        projectId: 'proj-1',
        label: `v-${id}`,
        timestamp: Date.now(),
        elementCount: 1,
        snapshot: { projectName: 'P', elementCount: 1, blob: 'x' } as unknown,
        syncStatus: 'sync-pending' as const,
    } as unknown as VersionRecord;
    return { version, projectId: 'proj-1', attemptCount: 0, nextAttemptAt: Date.now() };
}

describe('ServerSyncQueue circuit breaker (L-137)', () => {
    beforeEach(() => {
        state.status = 500;
        (apiFetch as any).mockClear();
        const s: Record<string, string> = {};
        const ls = {
            getItem: (k: string) => (k in s ? s[k] : null),
            setItem: (k: string, v: string) => { s[k] = v; },
            removeItem: (k: string) => { delete s[k]; },
            clear: () => { for (const k of Object.keys(s)) delete s[k]; },
        };
        Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('opens the breaker after N consecutive 5xx failures and stops hammering', async () => {
        const q = new ServerSyncQueue();
        // Silence persistence side-effects — we are testing the breaker, not I/O.
        (q as any).persistQueue = () => {};
        // Prevent the auto-scheduled follow-up flush from racing our assertions.
        (q as any).scheduleFlush = () => {};

        // Six ready items; the breaker threshold is 5.
        (q as any).queue = [makeItem('a'), makeItem('b'), makeItem('c'), makeItem('d'), makeItem('e'), makeItem('f')];

        await (q as any).flush();

        // Breaker opened at the 5th failure and the loop broke BEFORE the 6th item —
        // so only 5 network calls were made, not 6.
        expect(q.getConsecutiveFailures()).toBe(5);
        expect(q.isCircuitOpen()).toBe(true);
        expect((apiFetch as any).mock.calls.length).toBe(5);

        // A flush while the breaker is OPEN makes NO further network calls.
        await (q as any).flush();
        expect((apiFetch as any).mock.calls.length).toBe(5);

        q.dispose();
    });

    it('half-open probe: a single success closes the breaker and resets the failure count', async () => {
        const q = new ServerSyncQueue();
        (q as any).persistQueue = () => {};
        (q as any).scheduleFlush = () => {};
        (q as any).queue = [makeItem('a'), makeItem('b'), makeItem('c'), makeItem('d'), makeItem('e'), makeItem('f')];

        await (q as any).flush();
        expect(q.isCircuitOpen()).toBe(true);
        const callsAfterOpen = (apiFetch as any).mock.calls.length; // 5

        // Server recovers; force the cooldown to have elapsed.
        state.status = 201;
        (q as any)._breakerOpenUntil = Date.now() - 1;

        await (q as any).flush();

        // Half-open sent exactly ONE probe, it succeeded, and the breaker closed.
        expect((apiFetch as any).mock.calls.length).toBe(callsAfterOpen + 1);
        expect(q.isCircuitOpen()).toBe(false);
        expect(q.getConsecutiveFailures()).toBe(0);

        q.dispose();
    });
});
