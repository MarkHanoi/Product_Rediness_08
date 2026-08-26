// @vitest-environment happy-dom
//
// §SYNCSTATUS-SIDECAR (§SUSTAIN109, L-11545) — ONE save tick is ONE container write.
//
// THE DEFECT THIS PINS SHUT
// -------------------------
// The founder's console showed, after EVERY autosave tick, TWO identical lines:
//     [VersionRepository] 20 version(s) persisted to IndexedDB (~2.0 MB …)
// PERF104 (`3eec0465`) proved it was a REAL double write: `save-version` (the autosave
// proper) followed moments later by `sync-status-patch` — `updateSyncStatus(…,'synced')`
// re-serializing and re-putting the ENTIRE ~2 MB container to flip ONE enum on ONE
// record. C05 §3.6 req 6 named the floor honestly ("TWO writes, not one — reaching one
// requires syncStatus to leave the container for a sidecar id→status map") and named
// the trap that stopped the fix landing earlier: naive coalescing can lose a 'synced'
// marker on tab close and overstate unsynced work.
//
// THE FIX UNDER TEST
// ------------------
// The durable status now lives in its own tiny record (`syncstatus::<projectId>`, same
// IndexedDB object store, no schema bump) and is overlaid onto every read. The
// container is never touched by a status flip. The tab-close guard needs no
// beforeunload flush because the failure direction is conservative BY CONSTRUCTION —
// and that construction is what the second half of this file EXECUTES rather than
// asserts from prose:
//   • unsyncedWorkGuard counts from the ServerSyncQueue's own queue, which the queue
//     persists independently — a lost status put adds no queue item;
//   • a lost 'synced' put leaves the stored record reading 'local-only', the
//     conservative badge, and the queue's 2xx bookkeeping still prevents re-upload.
//
// ⭐ C05 §3.6 req 6 is explicit about the SHAPE of this test: "a test for this
// requirement MUST COUNT WRITES, not assert the stored history is correct" — a
// correctness-only assertion passes identically against the unbounded implementation.
// Every test below counts container puts by KEY, distinguishing the ~2 MB container
// write from the few-hundred-byte sidecar write the fix replaces it with.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
    apiFetch: vi.fn(async () => ({ status: 500, ok: false, json: async () => ({}) })),
}));

// Worker forced NOT-READY so the write path is synchronous and deterministic (the
// production first-save-of-a-session branch, not a fiction).
vi.mock('../src/workers/CompressWorkerPool', () => ({
    getCompressWorkerPool: () => ({ isReady: () => false, compress: vi.fn() }),
}));

vi.mock('../src/ui/platform/ThumbnailCacheStore', () => ({
    getThumbnailCacheStore: () => ({
        getThumbnailSync: () => undefined,
        putThumbnail: vi.fn(),
        deleteThumbnail: vi.fn(),
        warm: () => Promise.resolve(),
        isDisabled: () => true,
    }),
}));

// ── Map-backed synchronous mirror standing in for IndexedDB ─────────────────
const _vmirror = new Map<string, string>();
const idb = { disabled: false };
const _putVersions = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
const _putVersionsMirrorOnly = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
const _deleteVersions = vi.fn((id: string) => { _vmirror.delete(id); });
vi.mock('../src/ui/platform/VersionCacheStore', () => ({
    getVersionCacheStore: () => ({
        init: () => Promise.resolve(),
        warm: () => Promise.resolve(),
        isDisabled: () => idb.disabled,
        isWarmed: () => true,
        getVersionsSync: (id: string) => _vmirror.get(id),
        putVersions: _putVersions,
        putVersionsMirrorOnly: _putVersionsMirrorOnly,
        deleteVersions: _deleteVersions,
        getSyncQueueSync: () => null,
        putSyncQueue: vi.fn(),
        clearSyncQueue: vi.fn(),
    }),
}));

import { LocalVersionRepository } from '../src/ui/platform/ProjectRepository.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';
import { assessSignOutRisk } from '../src/ui/platform/unsyncedWorkGuard.js';

const PROJECT = 'proj-founder';
const STATUS_KEY = `syncstatus::${PROJECT}`;
const HISTORY_LENGTH = 20;

/** Container puts vs sidecar puts, told apart by KEY — the load-bearing counter. */
function containerPuts(): number {
    return _putVersions.mock.calls.filter(c => c[0] === PROJECT).length;
}
function sidecarPuts(): number {
    return _putVersions.mock.calls.filter(c => c[0] === STATUS_KEY).length;
}

function installLocalStorage(): void {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true, writable: true,
        value: {
            get length() { return store.size; },
            key: (i: number) => Array.from(store.keys())[i] ?? null,
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => { store.set(k, v); },
            removeItem: (k: string) => { store.delete(k); },
            clear: () => { store.clear(); },
        },
    });
}

function makeVersion(i: number): VersionRecord {
    let s = ''; let x = 1_103_515_245 + i;
    for (let k = 0; k < 800; k++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += String.fromCharCode(33 + (x % 90)); }
    return {
        id: `ver-${i}`, projectId: PROJECT, label: `Auto-save ${i}`,
        timestamp: 1_700_000_000_000 + i, elementCount: 264,
        snapshot: { projectName: 'Founder Project', elementCount: 264, blob: s },
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}

const META = {
    id: PROJECT, name: 'Founder Project', updatedAt: 1_700_000_000_000,
    elementCount: 264, versionCount: HISTORY_LENGTH, ownerId: 'user-test',
} as unknown as Parameters<LocalVersionRepository['saveVersionWithMeta']>[2];

function seedHistory(repo: LocalVersionRepository): VersionRecord[] {
    const versions = Array.from({ length: HISTORY_LENGTH }, (_, i) => makeVersion(i));
    repo.saveVersions(PROJECT, versions);
    _putVersions.mockClear();
    return versions;
}

beforeEach(() => {
    installLocalStorage();
    _vmirror.clear();
    idb.disabled = false;
    _putVersions.mockClear();
    _putVersionsMirrorOnly.mockClear();
    _deleteVersions.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§SYNCSTATUS-SIDECAR — one save tick is ONE container write (the counted proof)', () => {
    it('⭐ the full autosave ladder — save → sync-pending → synced — writes the container ONCE', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);

        // The exact sequence one autosave tick drives through this module:
        //   1. saveVersionWithMeta            (the save — PlatformSaveController)
        //   2. updateSyncStatus 'sync-pending' (ServerSyncQueue.enqueue)
        //   3. updateSyncStatus 'synced'       (ServerSyncQueue.attemptSync 2xx)
        const fresh = makeVersion(900);
        repo.saveVersionWithMeta(PROJECT, fresh, META);
        repo.updateSyncStatus(PROJECT, fresh.id, 'sync-pending');
        repo.updateSyncStatus(PROJECT, fresh.id, 'synced');

        // ⭐ THE FOUNDER'S LINE COUNT, AS AN ASSERTION. Before L-8702 this was three
        // container writes; after L-8702, two; now: ONE. The only other durable write
        // is the sidecar record, and it is three orders of magnitude smaller.
        expect(containerPuts()).toBe(1);
        expect(sidecarPuts()).toBe(1);

        const container = _vmirror.get(PROJECT)!;
        const sidecar = _vmirror.get(STATUS_KEY)!;
        expect(sidecar.length).toBeLessThan(500);
        expect(sidecar.length).toBeLessThan(container.length / 100);

        // …and every reader sees the ladder's result exactly as before.
        const latest = repo.getLatestVersion(PROJECT)!;
        expect(latest.id).toBe(fresh.id);
        expect(latest.syncStatus).toBe('synced');
    });

    it("⛔ C48 §1 — 'synced' is DURABLE: a cold read (fresh repository, mirror only) still sees it", () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);
        repo.updateSyncStatus(PROJECT, seeded[12]!.id, 'synced');

        // A reload keeps IndexedDB (modelled by the mirror) and drops nothing else
        // this test relies on: the overlay is re-read from the stored sidecar record.
        const cold = new LocalVersionRepository();
        const read = cold.getVersions(PROJECT);
        expect(read[12]!.syncStatus).toBe('synced');
        // The container bytes still carry the conservative save-time value — the
        // sidecar, not a container rewrite, is what made the badge durable.
        expect(read.filter((_, i) => i !== 12).every(v => v.syncStatus === 'local-only')).toBe(true);
    });

    it('a content re-save of the same id drops its stale sidecar entry', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);
        repo.updateSyncStatus(PROJECT, seeded[5]!.id, 'synced');

        // The user edits and the same version id is re-saved: new content, not yet
        // uploaded. A stale 'synced' overlay shadowing the fresh 'local-only' would
        // claim the server holds bytes it has never seen.
        const edited = { ...seeded[5]!, label: 'Edited', syncStatus: 'local-only' } as VersionRecord;
        repo.saveVersionWithMeta(PROJECT, edited, META);

        expect(repo.getVersions(PROJECT)[5]!.syncStatus).toBe('local-only');
    });

    it('the sidecar map is PRUNED to the stored ids when versions age out of the ring', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);
        repo.updateSyncStatus(PROJECT, seeded[0]!.id, 'synced');   // the oldest — about to age out
        repo.updateSyncStatus(PROJECT, seeded[19]!.id, 'synced');  // the newest — stays

        // One more save evicts ver-0 from the 20-slot ring; the commit prunes.
        repo.saveVersionWithMeta(PROJECT, makeVersion(900), META);

        const sidecar = JSON.parse(_vmirror.get(STATUS_KEY)!) as { s: Record<string, string> };
        expect(sidecar.s[seeded[0]!.id]).toBeUndefined();
        expect(sidecar.s[seeded[19]!.id]).toBe('synced');
    });

    it('an unknown version id is still a no-op — nothing durable is written for it', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);
        repo.updateSyncStatus(PROJECT, 'ver-does-not-exist', 'synced');
        expect(sidecarPuts()).toBe(0);
        expect(containerPuts()).toBe(0);
    });
});

describe('§SYNCSTATUS-SIDECAR — ⛔ the kill-the-tab guard (the trap PERF104 named, executed)', () => {
    it('a tab killed between the container write and the status put NEVER overstates sync', async () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);

        // The kill: the save lands, the upload succeeds server-side, and the tab dies
        // BEFORE updateSyncStatus('synced') runs — the exact window a coalesced
        // container write would have widened and the sidecar keeps identical.
        const fresh = makeVersion(901);
        repo.saveVersionWithMeta(PROJECT, fresh, META);
        repo.updateSyncStatus(PROJECT, fresh.id, 'sync-pending');
        // …tab dies here. No 'synced' write ever happens.

        // Next session — modelled honestly: the MODULE dies with the tab (its
        // transient L-8702 overlay included); only the IndexedDB mirror survives.
        vi.resetModules();
        const { LocalVersionRepository: ColdRepository } =
            await import('../src/ui/platform/ProjectRepository.js');

        // The record reads back CONSERVATIVE — 'local-only', never a false 'synced'
        // ('sync-pending' was transient by design and correctly did not survive).
        const latest = new ColdRepository().getLatestVersion(PROJECT)!;
        expect(latest.id).toBe(fresh.id);
        expect(latest.syncStatus).toBe('local-only');
    });

    it('⭐ unsyncedWorkGuard counts the QUEUE, not this sidecar — a lost status put cannot inflate it', () => {
        // The design's load-bearing claim, executed against the real policy: the
        // guard's input is the ServerSyncQueue's own report (reportUnsyncedWork —
        // blocked/pending QUEUE items). After a server 2xx the queue removed the item
        // and persisted ITSELF; whether the status put then survived the tab is
        // invisible to the guard. Feed it exactly that post-2xx report.
        const afterServerAccepted = [{
            source: 'sync-queue', blockedSaves: 0, pendingSaves: 0, projectIds: [] as string[],
        }];
        expect(assessSignOutRisk(afterServerAccepted)).toEqual({ action: 'proceed', reason: 'no-unsynced-work' });

        // And the converse stays true: work genuinely still queued DOES warn,
        // regardless of any sidecar state — the two mechanisms are independent.
        const uploadNeverAccepted = [{
            source: 'sync-queue', blockedSaves: 0, pendingSaves: 1, projectIds: [PROJECT],
        }];
        expect(assessSignOutRisk(uploadNeverAccepted).action).toBe('warn');
    });
});

describe('§SYNCSTATUS-SIDECAR — the sidecar works for BOTH container formats and dies with the project', () => {
    it('a legacy v1 whole-array payload gets the overlay without any container rewrite', () => {
        // Seed a v1 whole-array blob the way the pre-envelope build wrote it.
        const versions = Array.from({ length: 3 }, (_, i) => makeVersion(i));
        const flags = globalThis as unknown as { __pryzmSaveWorkerOffload?: boolean };
        flags.__pryzmSaveWorkerOffload = false;
        try {
            const repo = new LocalVersionRepository();
            repo.saveVersions(PROJECT, versions);
        } finally {
            delete flags.__pryzmSaveWorkerOffload;
        }
        _putVersions.mockClear();

        const repo = new LocalVersionRepository();
        repo.updateSyncStatus(PROJECT, 'ver-1', 'synced');
        expect(containerPuts()).toBe(0);
        expect(sidecarPuts()).toBe(1);
        expect(repo.getVersions(PROJECT)[1]!.syncStatus).toBe('synced');
    });

    it('deleteVersions removes the sidecar record with the container', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);
        repo.updateSyncStatus(PROJECT, seeded[0]!.id, 'synced');
        expect(_vmirror.has(STATUS_KEY)).toBe(true);

        repo.deleteVersions(PROJECT);
        expect(_vmirror.has(STATUS_KEY)).toBe(false);
    });
});
