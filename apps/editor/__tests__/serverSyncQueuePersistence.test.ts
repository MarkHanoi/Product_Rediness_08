// @vitest-environment happy-dom
//
// §SYNC-QUEUE-QUOTA (2026-06-23) — unit gate for the ServerSyncQueue persistence
// path. The live bug: persistQueue() serialised up to 50 FULL VersionRecord
// snapshots (each = the entire BIM scene) into localStorage. A few real-project
// snapshots blow the ~5 MB quota → setItem throws QuotaExceededError → the old
// catch silently dropped the ENTIRE queue → not-yet-synced autosaves were lost
// on reload.
//
// These tests prove:
//   • buildPersistedQueuePayload keeps the NEWEST items that fit and drops the
//     oldest first (data-safe trim);
//   • it returns null only when even the single newest item is over budget;
//   • persistQueue() never throws and never wipes the in-memory queue, even when
//     localStorage.setItem throws QuotaExceededError; it persists the newest
//     items that fit by retrying with fewer items.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// apiFetch is never invoked in these tests (we never let the queue flush while
// online with a real network), but ServerSyncQueue imports it at module load,
// so provide a stub.
vi.mock('@pryzm/core-app-model', () => ({
    apiFetch: vi.fn(async () => ({ status: 500, ok: false, json: async () => ({}) })),
}));

import { ServerSyncQueue, buildPersistedQueuePayload } from '../src/ui/platform/ServerSyncQueue.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

function makeItem(id: string, snapshotBytes: number) {
    const version = {
        id,
        projectId: 'proj-1',
        label: `v-${id}`,
        timestamp: Date.now(),
        elementCount: 1,
        // A big string stands in for the heavy serialised snapshot.
        snapshot: { projectName: 'P', elementCount: 1, blob: 'x'.repeat(snapshotBytes) } as unknown,
        syncStatus: 'sync-pending' as const,
    } as unknown as VersionRecord;
    return { version, projectId: 'proj-1', attemptCount: 0, nextAttemptAt: Date.now() };
}

describe('buildPersistedQueuePayload (pure)', () => {
    it('returns [] for an empty queue', () => {
        expect(buildPersistedQueuePayload([])).toEqual({ json: '[]', dropped: 0 });
    });

    it('keeps everything when it fits the budget', () => {
        const items = [makeItem('a', 100), makeItem('b', 100), makeItem('c', 100)];
        const out = buildPersistedQueuePayload(items, 1_000_000)!;
        expect(out.dropped).toBe(0);
        const parsed = JSON.parse(out.json);
        expect(parsed.map((p: any) => p.version.id)).toEqual(['a', 'b', 'c']);
    });

    it('drops OLDEST items first, keeping the newest suffix that fits', () => {
        // Each item ~2000 chars of snapshot → JSON length×2 well over a tiny budget.
        const items = [makeItem('old', 2000), makeItem('mid', 2000), makeItem('new', 2000)];
        // Budget large enough for ~2 items but not 3.
        const oneJson = JSON.stringify([items[2]]);
        const twoJson = JSON.stringify(items.slice(1));
        const budget = twoJson.length * 2; // fits 2, not 3
        const out = buildPersistedQueuePayload(items, budget)!;
        expect(out.dropped).toBe(1);
        const parsed = JSON.parse(out.json);
        expect(parsed.map((p: any) => p.version.id)).toEqual(['mid', 'new']);
        // sanity: a single item is well under budget
        expect(oneJson.length * 2).toBeLessThan(budget);
    });

    it('returns null when even the single newest item exceeds the budget', () => {
        const items = [makeItem('huge', 5000)];
        expect(buildPersistedQueuePayload(items, 100)).toBeNull();
    });
});

describe('ServerSyncQueue.persistQueue (quota resilience)', () => {
    let store: Record<string, string>;
    let setItemImpl: (k: string, v: string) => void;

    beforeEach(() => {
        store = {};
        setItemImpl = (k, v) => { store[k] = v; };
        const ls = {
            getItem: (k: string) => (k in store ? store[k] : null),
            setItem: (k: string, v: string) => setItemImpl(k, v),
            removeItem: (k: string) => { delete store[k]; },
            clear: () => { store = {}; },
        };
        Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('persists items normally when localStorage has room', () => {
        const q = new ServerSyncQueue();
        // Offline so the scheduled flush never POSTs during the test.
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        q.enqueue(makeItem('a', 50).version, 'proj-1');
        const raw = store['pryzm-sync-queue'];
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw).map((p: any) => p.version.id)).toEqual(['a']);
        q.dispose();
    });

    it('does NOT throw and persists the newest items when setItem throws QuotaExceededError', () => {
        // Throw quota on the first 2 attempts (full + after-one-drop), succeed on
        // the third (fewest items). Proves the drop-oldest-and-retry loop.
        let calls = 0;
        setItemImpl = (k, v) => {
            calls++;
            if (calls <= 2) {
                const e: any = new Error('quota');
                e.name = 'QuotaExceededError';
                throw e;
            }
            store[k] = v;
        };

        const q = new ServerSyncQueue();
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        // Enqueue 3 items directly into the in-memory queue, then persist once.
        // (enqueue persists each time; we want a single multi-item persist, so we
        //  push then call the private persistQueue via a forced re-enqueue.)
        (q as any).queue = [makeItem('old', 30), makeItem('mid', 30), makeItem('new', 30)];
        expect(() => (q as any).persistQueue()).not.toThrow();

        // Something was persisted (not the all-or-nothing wipe of the old bug).
        const raw = store['pryzm-sync-queue'];
        expect(raw).toBeTruthy();
        const ids = JSON.parse(raw).map((p: any) => p.version.id);
        // The newest survived; oldest were dropped to satisfy the (mocked) quota.
        expect(ids).toContain('new');
        expect(ids[ids.length - 1]).toBe('new');

        // In-memory queue is intact (3 items) — server retries still cover all.
        expect((q as any).queue.length).toBe(3);
        q.dispose();
    });

    it('fails safe (no throw, in-memory intact) when setItem always throws a non-quota error', () => {
        setItemImpl = () => { throw new Error('SecurityError: storage disabled'); };
        const q = new ServerSyncQueue();
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        (q as any).queue = [makeItem('a', 30), makeItem('b', 30)];
        expect(() => (q as any).persistQueue()).not.toThrow();
        expect((q as any).queue.length).toBe(2);
        q.dispose();
    });
});
