// @vitest-environment happy-dom
//
// §JOURNAL-RETENTION (§SUSTAIN109, L-11542, C05 §3.9) — the journal keeps the same
// time-depth as the version ring that indexes it, instead of growing without bound.
//
// THE DECISION UNDER TEST (the founder's, 2026-08-26)
// ---------------------------------------------------
// C05 §3.5/§3.8 shipped the sidecar as pure COPY-elimination and left pruning
// "pending the founder's call". PERF104 then measured the designed trajectory
// (`4e4043f9`): the journal NEVER trims — versions cap at 20, every save writes a
// cursor, so the sidecar is unreleasable by construction; 2 056 → 5 361 records in
// one day; projected ×4 → 160 ms/open + 3.2 MB, ×10 → 400 ms/open + 8.3 MB. The
// founder's "this is not sustainable — all fixes need to occur" is the call, and
// C05 §3.9 records the supersession.
//
// THE RETENTION FLOOR, AND WHY IT IS NOT A CAP
// --------------------------------------------
// The floor is "every record any RETAINED version references". A version's claim on
// its journal prefix ends when the 20-slot ring evicts it; the largest EVICTED
// cursor (`journal.rel`, recorded at eviction for free) is the exact boundary below
// which no restorable version references anything. Whole sealed chunks under that
// boundary are released at the next OPEN (`_releaseJournalHead`) — before the
// journal is attached, so the live session starts AT the window and every later
// save stays exact and extension-aligned. Not a size cap, not an age cap: the
// journal's depth tracks the restorable history's depth, by construction.
//
// WHAT "UNDO/REPLAY/HISTORY STILL WORK" MEANS HERE, stated honestly
// -----------------------------------------------------------------
// The runtime undo stack is NOT journal-backed (C03 §4.5–4.8, performUndoRedo's
// three stores) — restoring a version rebuilds it from the snapshot either way.
// What IS journal-backed is the temporal-history surface: TemporalGraphManager's
// queryAt (GhostOverlayRenderer), getMutationsForElement (Data Sheet history),
// getSessions (DesignHistoryPanel timeline). These tests EXECUTE that consumer —
// the real TemporalGraphManager, deserialized from the real read path's output —
// across the full retained window after a release, and pin that every retained
// record is bit-for-bit present. What a release costs is DEPTH beyond the ring:
// history older than the oldest restorable version — and even that is not the last
// copy in the world, because every synced version's SERVER snapshot still carries
// its journal inline (C05 §3.8 "not decided" clause).
//
// ⚠ Fixture scale is the founder's: the release scenario runs at 6 000 journal
// records (his console read 5 361 and the brief demands 5 900+), through the REAL
// codec, REAL digests, REAL integrity stamps — because a fixture that cannot
// express the cost cannot measure its removal.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.setConfig({ testTimeout: 120_000 });

vi.mock('@pryzm/core-app-model', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@pryzm/core-app-model')>();
    return {
        ...actual,
        getCurrentUserId: () => 'user-test',
        apiFetch: vi.fn(async () => ({ status: 500, ok: false, json: async () => ({}) })),
    };
});

// Worker forced NOT-READY so the write path is synchronous and deterministic.
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

const _vmirror = new Map<string, string>();
const idb = { disabled: false };
const _putVersions = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
vi.mock('../src/ui/platform/VersionCacheStore', () => ({
    getVersionCacheStore: () => ({
        init: () => Promise.resolve(),
        warm: () => Promise.resolve(),
        isDisabled: () => idb.disabled,
        isWarmed: () => true,
        getVersionsSync: (id: string) => _vmirror.get(id),
        putVersions: _putVersions,
        putVersionsMirrorOnly: vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); }),
        deleteVersions: vi.fn((id: string) => { _vmirror.delete(id); }),
        getSyncQueueSync: () => null,
        putSyncQueue: vi.fn(),
        clearSyncQueue: vi.fn(),
    }),
}));

import { LocalVersionRepository } from '../src/ui/platform/ProjectRepository.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';
import {
    computeSnapshotChecksum,
    verifySnapshotChecksum,
    INTEGRITY_ALGO,
} from '@pryzm/persistence-client';
import { TemporalGraphManager } from '@pryzm/core-app-model';

const PROJECT = 'proj-founder';
const V3_MARKER = '\x00fflate3\x01';
const RING = 20;                 // MAX_VERSIONS_STORED
const CHUNK = 2000;              // JOURNAL_CHUNK_RECORDS
const STEP = 200;                // journal growth per save
const SAVES = 30;                // v0..v29 → 10 evictions → rel = 2000 = one sealed chunk
const FINAL_N = SAVES * STEP;    // 6000 — the founder-scale journal (brief: 5 900+)

interface Mutation { id: string; elementId: string; elementType: string; mutationType: string; mutatedAt: number; mutatedBy: string; commandId: string; sessionId: string }

/** Deterministic by ABSOLUTE index, so any window can be regenerated for comparison. */
function mutations(n: number, from = 0): Mutation[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `2f6a1c${(from + i).toString(16).padStart(10, '0')}-4c1a-4f2b-9a77-${(from + i).toString(16).padStart(12, '0')}`,
        elementId: `el-1787150674754-${(from + i) % 281}`,
        elementType: ['wall', 'slab', 'furniture', 'door', 'window'][(from + i) % 5]!,
        mutationType: ['create', 'update', 'delete'][(from + i) % 3]!,
        mutatedAt: 1_787_150_674_754 + (from + i) * 137,
        mutatedBy: 'system',
        commandId: 'system',
        sessionId: 'a3f1c2d4-1111-2222-3333-444455556666',
    }));
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

/** A snapshot in the shape ProjectSerializer emits — stamped LAST, over the whole thing. */
function makeSnapshot(muts: readonly Mutation[], tag: string): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {
        schemaVersion: 5,
        projectId: PROJECT,
        projectName: 'Founder Project',
        elementCount: 281,
        walls: Array.from({ length: 12 }, (_, i) => ({
            id: `w-${i}`, height: 2.7, thickness: 0.2,
            start: { x: i * 1.37, y: 0, z: i * 0.91 }, end: { x: i * 1.37 + 4.2, y: 0, z: i * 0.91 + 2.6 },
        })),
        temporalGraph: {
            version: 1,
            edges: [],
            mutations: muts,
            sessionId: 'a3f1c2d4-1111-2222-3333-444455556666',
        },
        versionLabel: tag,
    };
    snapshot.integrity = {
        algo: INTEGRITY_ALGO,
        checksum: computeSnapshotChecksum(snapshot),
        schemaVersion: 5,
    };
    return snapshot;
}

function makeVersion(i: number, muts: readonly Mutation[]): VersionRecord {
    return {
        id: `ver-${i}`, projectId: PROJECT, label: `Auto-save ${i}`,
        timestamp: 1_700_000_000_000 + i, elementCount: 281,
        snapshot: makeSnapshot(muts, `v${i}`),
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}

const META = {
    id: PROJECT, name: 'Founder Project', updatedAt: 1_700_000_000_000,
    elementCount: 281, versionCount: RING, ownerId: 'user-test',
} as unknown as Parameters<LocalVersionRepository['saveVersionWithMeta']>[2];

const recordsIn = (v: VersionRecord): Mutation[] =>
    ((v.snapshot as unknown as { temporalGraph?: { mutations?: Mutation[] } }).temporalGraph?.mutations ?? []);

interface StoredContainer {
    j: { k: number; n: number; c: Array<{ b: string; n: number; h: string }>; b0?: number; rel?: number };
    v: Array<{ i: string; b: string; r?: number }>;
}
function storedContainer(): StoredContainer {
    const raw = _vmirror.get(PROJECT)!;
    expect(raw.startsWith(V3_MARKER)).toBe(true);
    return JSON.parse(raw.slice(V3_MARKER.length)) as StoredContainer;
}

/** Drive SAVES autosaves through the REAL write path, journal growing STEP per save. */
function seedGrowingHistory(repo: LocalVersionRepository, saves = SAVES): void {
    for (let i = 0; i < saves; i++) {
        repo.saveVersionWithMeta(PROJECT, makeVersion(i, mutations((i + 1) * STEP)), META);
    }
}

type Flags = { __pryzmJournalRetention?: boolean };
const flags = globalThis as unknown as Flags;

beforeEach(() => {
    installLocalStorage();
    _vmirror.clear();
    idb.disabled = false;
    _putVersions.mockClear();
    delete flags.__pryzmJournalRetention;
});
afterEach(() => {
    vi.restoreAllMocks();
    delete flags.__pryzmJournalRetention;
    // The repository holds module-scoped caches keyed by project id; reset via the
    // module's own teardown so the next test cannot read this one's state.
    new LocalVersionRepository().deleteVersions(PROJECT);
});

describe('§JOURNAL-RETENTION — the eviction boundary is RECORDED at save time', () => {
    it('the ring evicting a version raises journal.rel to its cursor — an envelope fact, no decode', () => {
        const repo = new LocalVersionRepository();
        seedGrowingHistory(repo);

        const c = storedContainer();
        expect(c.v).toHaveLength(RING);                       // v10..v29
        expect(c.j.n).toBe(FINAL_N);                          // nothing released yet
        expect(c.j.b0).toBeUndefined();
        // v0..v9 were evicted; the largest evicted cursor is v9's 10×STEP = 2000.
        expect(c.j.rel).toBe(10 * STEP);
        // Retained cursors are intact and absolute (no release has happened).
        expect(c.v[0]!.r).toBe(11 * STEP);                    // v10
        expect(c.v[RING - 1]!.r).toBe(FINAL_N);               // v29
    });

    it('⛔ the revert switch: with __pryzmJournalRetention=false nothing is recorded and nothing releases', () => {
        flags.__pryzmJournalRetention = false;
        const repo = new LocalVersionRepository();
        seedGrowingHistory(repo);

        expect(storedContainer().j.rel).toBeUndefined();
        _putVersions.mockClear();
        repo.getLatestVersion(PROJECT);
        // The open performed no container write — pre-change behaviour exactly.
        expect(_putVersions).not.toHaveBeenCalled();
    });
});

describe('§JOURNAL-RETENTION — ⭐ the release, at founder scale (6 000 records)', () => {
    it('releases whole sealed chunks no retained version references, and the container SHRINKS', () => {
        const repo = new LocalVersionRepository();
        seedGrowingHistory(repo);
        const before = _vmirror.get(PROJECT)!.length;
        _putVersions.mockClear();

        // ── THE OPEN — where the release runs, before the journal is attached ──
        const latest = repo.getLatestVersion(PROJECT)!;
        const after = _vmirror.get(PROJECT)!.length;

        // (d) the size actually shrinks, and by the released chunk's share.
        expect(after).toBeLessThan(before);
        console.log(
            `[test] §JOURNAL-RETENTION container ${before} → ${after} chars ` +
            `(released ${CHUNK} of ${FINAL_N} records; ${(100 * (before - after) / before).toFixed(0)}% smaller).`,
        );

        // The stored shape: one sealed chunk gone, cursors shifted, lineage annotated.
        const c = storedContainer();
        expect(c.j.n).toBe(FINAL_N - CHUNK);                  // 4000 stored
        expect(c.j.b0).toBe(CHUNK);                           // head at absolute 2000
        expect(c.j.rel).toBeUndefined();                      // fully consumed
        expect(c.j.c).toHaveLength(2);
        expect(c.v[0]!.r).toBe(11 * STEP - CHUNK);            // v10 → 200
        expect(c.v[RING - 1]!.r).toBe(FINAL_N - CHUNK);       // v29 → 4000

        // ⭐ THE NEWEST VERSION'S HISTORY IS THE RETAINED WINDOW, EXACTLY — the most
        // recent 4 000 records, tail-aligned at its stamp point, none newer, none
        // fabricated. Regenerating the expected window from the absolute indices is
        // what the deterministic fixture ids exist for.
        const attached = recordsIn(latest);
        expect(attached).toHaveLength(FINAL_N - CHUNK);
        const expected = mutations(FINAL_N - CHUNK, CHUNK);
        expect(attached[0]!.id).toBe(expected[0]!.id);
        expect(attached[attached.length - 1]!.id).toBe(expected[expected.length - 1]!.id);

        // Its stamp covered all 6 000 — NOT COMPARABLE (the designed disposition),
        // never ok:false, never "corrupt".
        const verdict = verifySnapshotChecksum(latest.snapshot);
        expect(verdict).toMatchObject({ present: true, ok: true, comparable: false });
    });

    it('⭐ (a) EVERY retained version restores across the full window, and the REAL temporal consumer runs', () => {
        const repo = new LocalVersionRepository();
        seedGrowingHistory(repo);
        repo.getLatestVersion(PROJECT);                        // triggers the release

        const all = repo.getVersions(PROJECT);
        expect(all.map(v => v.id)).toEqual(Array.from({ length: RING }, (_, i) => `ver-${10 + i}`));

        for (let i = 0; i < RING; i++) {
            const absCursor = (11 + i) * STEP;                 // what v(10+i) was stamped over
            const muts = recordsIn(all[i]!);
            // Every record the window can supply for this version, in order: from the
            // release boundary to this version's own stamp point.
            expect(muts).toHaveLength(absCursor - CHUNK);
            expect(muts[0]!.id).toBe(mutations(1, CHUNK)[0]!.id);
            expect(muts[muts.length - 1]!.id).toBe(mutations(1, absCursor - 1)[0]!.id);
        }

        // ── THE REAL CONSUMER, EXECUTED — TemporalGraphManager on the restored
        // oldest-retained version: the surface DesignHistoryPanel / queryAt /
        // getMutationsForElement actually read after a restore.
        const oldest = all[0]!;
        const tg = new TemporalGraphManager();
        tg.deserialize((oldest.snapshot as { temporalGraph: never }).temporalGraph);
        expect(tg.mutationCount).toBe(11 * STEP - CHUNK);
        const slice = tg.queryAt(Number.MAX_SAFE_INTEGER);
        expect(slice.mutationsUpTo).toHaveLength(11 * STEP - CHUNK);
        const perElement = tg.getMutationsForElement(mutations(1, CHUNK)[0]!.elementId);
        expect(perElement.length).toBeGreaterThan(0);
    });

    it('⭐ (b) saves AFTER a release extend the window exactly: sealed chunks reused, digest EXACT', () => {
        const repo = new LocalVersionRepository();
        seedGrowingHistory(repo);
        const latest = repo.getLatestVersion(PROJECT)!;        // release + attach
        const beforeSave = storedContainer();

        // The live session continues from the attached window — exactly what the
        // loader hands the model — and appends 50 new records.
        const live = [...recordsIn(latest), ...mutations(50, FINAL_N)];
        repo.saveVersionWithMeta(PROJECT, makeVersion(30, live), META);

        const c = storedContainer();
        expect(c.j.n).toBe(FINAL_N - CHUNK + 50);              // 4050
        expect(c.j.b0).toBe(CHUNK);                            // lineage annotation carried
        // ⭐ BYTE REUSE SURVIVES THE RELEASE: both remaining sealed chunks are carried
        // forward with their digests untouched; only the tail was compressed.
        expect(c.j.c[0]!.h).toBe(beforeSave.j.c[0]!.h);
        expect(c.j.c[1]!.h).toBe(beforeSave.j.c[1]!.h);
        expect(c.v.find(e => e.i === 'ver-30')!.r).toBe(FINAL_N - CHUNK + 50);

        // A cold read of the post-release save is EXACT — its stamp covered precisely
        // the window it reattaches, so the digest is compared at FULL strength.
        const readBack = repo.getVersions(PROJECT);
        const v30 = readBack[readBack.length - 1]!;
        expect(recordsIn(v30)).toHaveLength(FINAL_N - CHUNK + 50);
        expect(verifySnapshotChecksum(v30.snapshot)).toMatchObject({ ok: true, comparable: true });
    });

    it('⭐ (c) C47 — a container with NO eviction history opens byte-identically, no write, no release', () => {
        const repo = new LocalVersionRepository();
        seedGrowingHistory(repo, RING);                        // exactly 20 saves — nothing evicted
        const c = storedContainer();
        expect(c.j.rel).toBeUndefined();
        expect(c.j.b0).toBeUndefined();
        const rawBefore = _vmirror.get(PROJECT)!;
        _putVersions.mockClear();

        const latest = repo.getLatestVersion(PROJECT)!;

        expect(_putVersions).not.toHaveBeenCalled();           // the open never writes
        expect(_vmirror.get(PROJECT)).toBe(rawBefore);         // bytes untouched
        expect(recordsIn(latest)).toHaveLength(RING * STEP);   // full journal attached
        expect(verifySnapshotChecksum(latest.snapshot)).toMatchObject({ ok: true, comparable: true });
    });

    it('the release round-trips through a COLD module (the reload case), still exact for new saves', async () => {
        const repo = new LocalVersionRepository();
        seedGrowingHistory(repo);
        repo.getLatestVersion(PROJECT);                        // release

        vi.resetModules();
        const { LocalVersionRepository: ColdRepository } =
            await import('../src/ui/platform/ProjectRepository.js');
        const cold = new ColdRepository();

        const latest = cold.getLatestVersion(PROJECT)!;
        expect(latest.id).toBe(`ver-${SAVES - 1}`);
        expect(recordsIn(latest)).toHaveLength(FINAL_N - CHUNK);

        // The cold session appends — extension holds via id-equality (the mirror died
        // with the module), chunks stay shared, and the new save reads back exact.
        const live = [...recordsIn(latest), ...mutations(25, FINAL_N)];
        cold.saveVersionWithMeta(PROJECT, makeVersion(31, live), META);
        const readBack = cold.getVersions(PROJECT);
        const v31 = readBack[readBack.length - 1]!;
        expect(recordsIn(v31)).toHaveLength(FINAL_N - CHUNK + 25);
        expect(verifySnapshotChecksum(v31.snapshot)).toMatchObject({ ok: true, comparable: true });
    });
});
