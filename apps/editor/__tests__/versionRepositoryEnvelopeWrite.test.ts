// @vitest-environment happy-dom
//
// §PERF-VERSION-ENVELOPE-WRITE (L-5801..L-5805) — the version-history WRITE path did
// O(history) work to change ONE version.
//
// THE DEFECT
// ----------
// §PERF-VERSION-INCREMENTAL-COMPRESS (L-131 P4b) made the DEFLATE O(1): unchanged
// versions reuse their cached blobs. But `_persistVersionsIncremental` took
// `VersionRecord[]`, so every caller had to HAVE the decoded records — and the only
// way to have them was `getVersions()`, a full inflate + `JSON.parse` of every
// stored snapshot. The incremental compress was O(1) while the read that fed it
// stayed O(history), and BOTH call sites that pay it run on every autosave:
//
//     saveVersionWithMeta()  — decode 20, push 1, slice(-20), re-assemble
//     updateSyncStatus()     — decode 20, patch one field, re-assemble
//
// so one autosave paid the whole-history decode TWICE. The records were never read:
// `saveVersionWithMeta` used the array only for `findIndex` / `push` / `slice`, all
// of which the v2 envelope already answers from the version IDs it stores.
//
// MEASURED (lane LOAD30, 2026-08-22, `node --expose-gc
// tools/perf/bench-version-container.mjs`, 20 versions / 37.5 MB container):
//     append a version    2623 ms -> 223 ms   (11.8x)
//     flip a syncStatus   2640 ms -> 324 ms   ( 8.1x)
//
// ⭐ WHY THESE TESTS COUNT DECODES RATHER THAN ASSERT RETURN VALUES
// -----------------------------------------------------------------
// A test that only checks the stored history is correct passes just as happily
// against the old implementation — it asserts the ANSWER while proving nothing
// about the WORK, which is the entire point. So, following the sibling suite
// `versionRepositoryNarrowRead.test.ts`, these tests wrap the REAL codec in a call
// counter and assert on the number of inflates:
//
//     saveVersionWithMeta()  → 0 decodes   ⭐ separating (was 20)
//     updateSyncStatus()     → 1 decode    ⭐ separating (was 20)
//
// ⛔ Nothing under test is stubbed. The counter observes the codec; it does not
// replace it — every assertion is made against genuinely round-tripped bytes.
//
// ⭐ AND THE HALF THAT IS NOT ABOUT SPEED
// ---------------------------------------
// §FIX-ENVELOPE-APPEND-BYPASSED-THE-FALLBACK (L-5805). The envelope branch was
// entered on `slots !== null` alone, without the `_saveWorkerOffloadEnabled()` /
// `store.isDisabled()` guard that BOTH of its siblings carry. With IndexedDB
// unavailable — Safari private mode, blocked site data, an `indexedDB.open` error —
// `_persistSlots` still terminated in `putVersions()`, which on a disabled store
// updates only the in-memory mirror and returns. The localStorage TRIM_TARGETS
// ladder and the §QUOTA-EVICT valve inside `saveVersionsWithQuota` were never
// reached, so every autosave was lost on reload with no error at all. The last two
// tests are that arm, and they are about DATA, not milliseconds.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as realCodec from '../src/workers/compressCodec.js';

vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
    apiFetch: vi.fn(async () => ({ status: 500, ok: false, json: async () => ({}) })),
}));

// ── Codec spy: the REAL implementation, wrapped in a counter ─────────────────
const decodeCalls = { n: 0 };
vi.mock('../src/workers/compressCodec.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/workers/compressCodec.js')>();
    return {
        ...actual,
        encodeCompressed: actual.encodeCompressed,
        decodeCompressed: (data: string) => {
            if (typeof data === 'string' && data.startsWith(actual.COMPRESSED_MARKER)) decodeCalls.n++;
            return actual.decodeCompressed(data);
        },
    };
});

// The compression worker is forced NOT-READY so the write path is fully
// synchronous and every assertion below is deterministic. That is the production
// fallback branch, not a fiction: `isReady()` is false for the first save of every
// session (the worker is constructed lazily and handshakes afterwards).
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
/** Flipped per-test to model an origin where IndexedDB is unavailable. */
const idb = { disabled: false };
const _putVersions = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
const _putVersionsMirrorOnly = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
const _getVersionsSync = vi.fn((id: string) => _vmirror.get(id));
vi.mock('../src/ui/platform/VersionCacheStore', () => ({
    getVersionCacheStore: () => ({
        init: () => Promise.resolve(),
        warm: () => Promise.resolve(),
        isDisabled: () => idb.disabled,
        isWarmed: () => true,
        getVersionsSync: _getVersionsSync,
        putVersions: _putVersions,
        putVersionsMirrorOnly: _putVersionsMirrorOnly,
        deleteVersions: vi.fn(),
        getSyncQueueSync: () => null,
        putSyncQueue: vi.fn(),
        clearSyncQueue: vi.fn(),
    }),
}));

import { LocalVersionRepository } from '../src/ui/platform/ProjectRepository.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

const PROJECT = 'proj-founder';
const V2_MARKER = '\x00fflate2\x01';
const VERSIONS_KEY = `bim-project-${PROJECT}-versions`;
const HISTORY_LENGTH = 20;

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

/** A version record with a payload big enough that the codec really compresses. */
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

/** Persist a real 20-version history through the real write path, then reset counters. */
function seedHistory(repo: LocalVersionRepository): VersionRecord[] {
    const versions = Array.from({ length: HISTORY_LENGTH }, (_, i) => makeVersion(i));
    repo.saveVersions(PROJECT, versions);
    decodeCalls.n = 0;
    _putVersions.mockClear();
    return versions;
}

beforeEach(() => {
    installLocalStorage();
    _vmirror.clear();
    idb.disabled = false;
    decodeCalls.n = 0;
    _putVersions.mockClear();
    _putVersionsMirrorOnly.mockClear();
    _getVersionsSync.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§PERF-VERSION-ENVELOPE-WRITE (L-5801) — a save carries the unchanged versions as BYTES', () => {
    it('premise: the seeded payload really is a v2 container of 20 genuinely compressed blobs', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);
        const raw = _vmirror.get(PROJECT)!;
        expect(raw.startsWith(V2_MARKER)).toBe(true);
        const entries = JSON.parse(raw.slice(V2_MARKER.length)) as { i: string; b: string }[];
        expect(entries).toHaveLength(HISTORY_LENGTH);
        // If this ever fails the decode counts below would be measuring nothing.
        expect(entries.every(e => e.b.startsWith(realCodec.COMPRESSED_MARKER))).toBe(true);
    });

    it('⭐ saveVersionWithMeta() appends a version while inflating NOTHING', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);

        const fresh = makeVersion(999);
        const outcome = repo.saveVersionWithMeta(PROJECT, fresh, META);

        expect(outcome.ok).toBe(true);
        expect(decodeCalls.n).toBe(0); // ⭐ the separating assertion (was 20)

        // …and the history is exactly right: oldest trimmed, newest last.
        const stored = repo.getVersions(PROJECT);
        expect(stored).toHaveLength(HISTORY_LENGTH);
        expect(stored.map(v => v.id))
            .toEqual([...seeded.slice(1).map(v => v.id), fresh.id]);
        expect(stored[HISTORY_LENGTH - 1]).toEqual(fresh);
    });

    it('⭐ saveVersionWithMeta() REPLACES an existing id in place, still inflating nothing', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);

        const edited = { ...seeded[5]!, label: 'Renamed', syncStatus: 'synced' } as VersionRecord;
        repo.saveVersionWithMeta(PROJECT, edited, META);

        expect(decodeCalls.n).toBe(0);
        const stored = repo.getVersions(PROJECT);
        // Same length, same order — a replace, never an append-plus-trim that would
        // silently evict the OLDEST version to make room for a duplicate.
        expect(stored).toHaveLength(HISTORY_LENGTH);
        expect(stored.map(v => v.id)).toEqual(seeded.map(v => v.id));
        expect(stored[5]!.label).toBe('Renamed');
    });

    it('⭐ updateSyncStatus() inflates NOTHING and never rewrites the container (L-11545)', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);
        _putVersions.mockClear();

        repo.updateSyncStatus(PROJECT, seeded[12]!.id, 'synced');

        // §SUSTAIN109 (L-11545) — was `toBe(1)` (inflate one, patch, re-put the whole
        // container). The durable status now lives in its own sidecar record
        // (§SYNCSTATUS-SIDECAR), so a flip decodes zero snapshots and the only put is
        // the tiny `syncstatus::` record — NEVER the container.
        expect(decodeCalls.n).toBe(0);
        expect(_putVersions).toHaveBeenCalledTimes(1);
        expect(_putVersions.mock.calls[0]![0]).toBe(`syncstatus::${PROJECT}`);
        decodeCalls.n = 0;
        const stored = repo.getVersions(PROJECT);
        expect(stored.map(v => v.id)).toEqual(seeded.map(v => v.id));
        expect(stored[12]!.syncStatus).toBe('synced');
        // Every OTHER record is byte-identical to what was seeded — carrying blobs
        // forward must not perturb them.
        expect(stored.filter((_, i) => i !== 12)).toEqual(seeded.filter((_, i) => i !== 12));
    });

    it('updateSyncStatus() is a no-op when the status is already the stored one', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);
        _putVersions.mockClear();

        repo.updateSyncStatus(PROJECT, seeded[3]!.id, 'local-only'); // already local-only

        // §SUSTAIN109 (L-11545) — was one inflate to read the stored enum. Now ZERO:
        // `'local-only'` is the save-time inline floor, so with no prior sidecar entry
        // there is nothing to record and nothing at all is written.
        expect(decodeCalls.n).toBe(0);
        expect(_putVersions).not.toHaveBeenCalled();
    });

    it('an unknown version id is a no-op, exactly as before', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);
        _putVersions.mockClear();

        repo.updateSyncStatus(PROJECT, 'ver-does-not-exist', 'synced');

        expect(_putVersions).not.toHaveBeenCalled();
        expect(repo.getVersions(PROJECT).map(v => v.id)).toEqual(seeded.map(v => v.id));
    });

    it('⛔ saveVersions() re-writing an id with NEW content is not silently discarded', () => {
        // §FIX-BULK-SAVE-TRUSTED-A-STALE-BLOB (L-5807). The per-version blob cache
        // rests on "content is immutable per id"; every path that CHANGES a record
        // invalidates that id at its call site. The wholesale writer never did, so a
        // caller handing it an edited record under an unchanged id had the edit
        // silently DISCARDED — the stale blob was carried forward and the stored
        // bytes kept describing the previous content for ever.
        //
        // ⛔ This was found by a TEST leaking state between cases, not by a report,
        // and today's three product callers are safe by accident rather than by
        // construction (see the comment on `saveVersions`). It is pinned here so the
        // next caller does not have to rediscover it.
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);

        const edited = seeded.map((v, i) => (i === 5 ? { ...v, label: 'Edited in bulk' } : v));
        repo.saveVersions(PROJECT, edited);

        expect(repo.getVersions(PROJECT)[5]!.label).toBe('Edited in bulk');
    });

    it('a LEGACY v1 whole-array payload still saves, and keeps its history', () => {
        // Projects written before the v2 container have no envelope to edit. The
        // append must fall through to the decoding path rather than treat "no
        // envelope" as "no history" — collapsing those two would DESTROY the
        // project's history on its very next save.
        const repo = new LocalVersionRepository();
        const legacy = Array.from({ length: 3 }, (_, i) => makeVersion(i));
        _vmirror.set(PROJECT, realCodec.encodeCompressed(JSON.stringify(legacy)));
        decodeCalls.n = 0;

        const fresh = makeVersion(77);
        repo.saveVersionWithMeta(PROJECT, fresh, META);

        const stored = repo.getVersions(PROJECT);
        expect(stored.map(v => v.id)).toEqual([...legacy.map(v => v.id), fresh.id]);
    });
});

describe('§FIX-ENVELOPE-APPEND-BYPASSED-THE-FALLBACK (L-5805) — the guard is about DATA', () => {
    it('⛔ with IndexedDB UNAVAILABLE the save reaches the localStorage fallback', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);          // seed while IDB is available…
        idb.disabled = true;        // …then the origin loses IndexedDB.
        _putVersions.mockClear();

        const fresh = makeVersion(999);
        repo.saveVersionWithMeta(PROJECT, fresh, META);

        // ⭐ THE SEPARATING ASSERTION. Pre-fix this key was null: the envelope path
        // ran regardless of the store's state and terminated in a `putVersions()`
        // that a disabled store answers from memory only, so the save existed for
        // exactly as long as the tab did.
        const persisted = localStorage.getItem(VERSIONS_KEY);
        expect(persisted).not.toBeNull();
        const roundTripped = JSON.parse(realCodec.decodeCompressed(persisted!)) as VersionRecord[];
        expect(roundTripped[roundTripped.length - 1]!.id).toBe(fresh.id);
    });

    it('⛔ with the offload flag OFF the save reverts to the whole-array format', () => {
        // `__pryzmSaveWorkerOffload === false` is the documented revert switch. It
        // must return the WRITE format to v1 as well as the compression strategy —
        // otherwise "revert" leaves a v2 container on disk that only the new code
        // path knows how to maintain.
        const repo = new LocalVersionRepository();
        seedHistory(repo);
        (globalThis as { __pryzmSaveWorkerOffload?: boolean }).__pryzmSaveWorkerOffload = false;
        try {
            repo.saveVersionWithMeta(PROJECT, makeVersion(999), META);
            const raw = _vmirror.get(PROJECT)!;
            expect(raw.startsWith(V2_MARKER)).toBe(false);
            expect(raw.startsWith(realCodec.COMPRESSED_MARKER)).toBe(true);
            // Reverted format, unbroken history — that is the whole point of a
            // revert switch.
            expect(repo.getVersions(PROJECT)).toHaveLength(HISTORY_LENGTH);
        } finally {
            delete (globalThis as { __pryzmSaveWorkerOffload?: boolean }).__pryzmSaveWorkerOffload;
        }
    });
});


// -----------------------------------------------------------------------------
// SS-PERF-SYNCSTATUS-TRANSIENT-NOT-PERSISTED (L-8702) -- THREE 36.8 MB WRITES PER
// AUTOSAVE, TWO OF THEM TO FLIP ONE ENUM.
//
// The founder's console, live build, one save cycle:
//     [VersionRepository] 20 version(s) ... ~36.8 MB (38,630,482 chars) compressed
//     [VersionRepository] 20 version(s) ... ~36.8 MB (38,630,478 chars) compressed
//     [VersionRepository] 20 version(s) ... ~36.8 MB (38,630,470 chars) compressed
// ~110 MB of IndexedDB traffic to record one autosave of a 281-element model.
//
// The three sizes differ, which was first read as a non-deterministic serialiser.
// It is not. `ServerSyncQueue.ts:14` documents the ladder
// 'local-only' -> 'sync-pending' -> 'synced', and the payloads differ because the
// STRING LENGTH of that one field changes inside the single ~1.84 MB record that
// gets re-deflated. Write 1 IS the save; writes 2 and 3 exist only for the enum.
//
// WHY THIS TEST COUNTS WRITES rather than asserting the stored history is right:
// a correctness-only assertion passes identically against the old implementation.
// The whole finding is about the WORK, so `_putVersions` -- the one call that
// reaches IndexedDB -- is what is counted, exactly as the suite above counts
// decodes. Nothing is stubbed that is under test.
// -----------------------------------------------------------------------------

describe('L-8702 — the syncStatus ladder costs ONE container write, not three', () => {
    it('runs the full local-only -> sync-pending -> synced ladder in 2 writes (was 3)', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);

        // 1. the save itself — writes the container with syncStatus 'local-only'
        const fresh = makeVersion(HISTORY_LENGTH);
        repo.saveVersionWithMeta(PROJECT, fresh, META);
        expect(_putVersions).toHaveBeenCalledTimes(1);

        // 2. upload starts — TRANSIENT. Must not touch storage at all.
        repo.updateSyncStatus(PROJECT, fresh.id, 'sync-pending');
        expect(_putVersions).toHaveBeenCalledTimes(1); // ⭐ separating: was 2
        expect(_putVersionsMirrorOnly).not.toHaveBeenCalled();

        // 3. upload succeeded — DURABLE. Must be written.
        repo.updateSyncStatus(PROJECT, fresh.id, 'synced');
        expect(_putVersions).toHaveBeenCalledTimes(2); // ⭐ was 3
    });

    it('still shows sync-pending to every reader while the upload is in flight', () => {
        // The write was removed; the BADGE must not change. Both the wide read
        // (version panel) and the narrow read (project open) see the overlay.
        const repo = new LocalVersionRepository();
        seedHistory(repo);
        const fresh = makeVersion(HISTORY_LENGTH);
        repo.saveVersionWithMeta(PROJECT, fresh, META);

        repo.updateSyncStatus(PROJECT, fresh.id, 'sync-pending');
        expect(repo.getLatestVersion(PROJECT)?.syncStatus).toBe('sync-pending');
        const wide = repo.getVersions(PROJECT);
        expect(wide[wide.length - 1]!.syncStatus).toBe('sync-pending');
    });

    it('a DURABLE status supersedes the transient one and reaches the stored bytes', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);
        const fresh = makeVersion(HISTORY_LENGTH);
        repo.saveVersionWithMeta(PROJECT, fresh, META);
        repo.updateSyncStatus(PROJECT, fresh.id, 'sync-pending');
        repo.updateSyncStatus(PROJECT, fresh.id, 'synced');

        expect(repo.getLatestVersion(PROJECT)?.syncStatus).toBe('synced');
        // ...and it is in the PAYLOAD, not only in the overlay: a fresh repository
        // reading the same mirror (i.e. a reload) must still see 'synced'.
        expect(new LocalVersionRepository().getLatestVersion(PROJECT)?.syncStatus).toBe('synced');
    });

    it('leaves the CONSERVATIVE local-only in the STORED BYTES while an upload is in flight', () => {
        // The reason sync-pending may live in memory: after a reload no upload IS
        // in flight, so what survives must be the value meaning "not on the
        // server". ⛔ A second `new LocalVersionRepository()` does NOT model that —
        // the overlay is module-scoped, so a same-realm instance still sees it, and
        // a test written that way would be asserting the reload it cannot perform.
        // The checkable claim is about the PERSISTED CONTAINER, so read the bytes.
        const repo = new LocalVersionRepository();
        seedHistory(repo);
        const fresh = makeVersion(HISTORY_LENGTH);
        repo.saveVersionWithMeta(PROJECT, fresh, META);
        repo.updateSyncStatus(PROJECT, fresh.id, 'sync-pending'); // ...then the tab dies

        const payload = _vmirror.get(PROJECT)!;
        expect(payload.startsWith(V2_MARKER)).toBe(true);
        const entries = JSON.parse(payload.slice(V2_MARKER.length)) as { i: string; b: string }[];
        const stored = JSON.parse(realCodec.decodeCompressed(entries[entries.length - 1]!.b)) as VersionRecord;
        expect(stored.id).toBe(fresh.id);
        expect(stored.syncStatus).toBe('local-only');
    });
});
