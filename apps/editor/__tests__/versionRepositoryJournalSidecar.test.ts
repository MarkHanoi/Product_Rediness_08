// @vitest-environment happy-dom
//
// §JOURNAL-SIDECAR (L-9980 … L-9984) — the temporal journal is stored ONCE per
// project; each version holds a cursor into it.
//
// THE MEASUREMENT THAT PRODUCED THIS (ISSUE-LOG L-8704, C05 §3.5, re-measured
// 2026-08-23 from the founder's own console):
//
//     281 elements · 7 levels · temporalGraph 30 432 mutations
//     integrity suffix 0x8639ce = 8 796 110 canonical chars
//     ~36.8 MB (38 630 482 chars) stored across 20 versions
//
// The MODEL is ~0.1 MB. The journal is ~99 % of the payload, and it is embedded
// WHOLE in each of the twenty — because a journal is append-only, so version n
// is version n−1 plus a handful of records. Twenty near-identical copies of one
// growing log.
//
// ⛔ THE FIX IS NEVER DELETION, AND THESE TESTS ASSERT THAT DIRECTLY. Every
// before/after pair below asserts the RECORD COUNT IS UNCHANGED alongside the
// byte reduction. A test that only asserted "smaller" would pass against a
// retention cap, which C05 §3.5 and ISSUE-LOG L-5823 rule out by name.
//
// ⭐ AND THE TWO FIXTURES THE BRIEF NAMED. `both formats open` is the whole
// migration story and it is proven with a fixture of each, written through the
// REAL write path, decoded through the REAL read path:
//   • a v2 container written before this change → journal inline;
//   • a v3 container written after it            → journal shared + cursor.
// Neither is hand-rolled JSON: the v2 fixture is produced by flipping the
// documented revert switch, so it is the bytes the previous build wrote.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as realCodec from '../src/workers/compressCodec.js';

// Each case seeds a real 20-version history through the real codec, which is
// ~1.5 s of genuine DEFLATE. The default 5 s budget is a coin-flip on a loaded
// machine, and a flaky proof is not a proof.
vi.setConfig({ testTimeout: 60_000 });

vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
    apiFetch: vi.fn(async () => ({ status: 500, ok: false, json: async () => ({}) })),
}));

// ── Codec spy: the REAL implementation, wrapped in counters ──────────────────
// ⭐ Counting DEFLATEs as well as inflates, because the save-side half of this
// change is "re-compress the tail chunk, not the whole log" — an assertion about
// the answer would pass identically against the implementation that re-deflates
// 8.7 MB every autosave.
const decodeCalls = { n: 0 };
const encodeCalls = { n: 0, chars: 0 };
vi.mock('../src/workers/compressCodec.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/workers/compressCodec.js')>();
    return {
        ...actual,
        encodeCompressed: (json: string) => { encodeCalls.n++; encodeCalls.chars += json.length; return actual.encodeCompressed(json); },
        decodeCompressed: (data: string) => {
            if (typeof data === 'string' && data.startsWith(actual.COMPRESSED_MARKER)) decodeCalls.n++;
            return actual.decodeCompressed(data);
        },
    };
});

// Worker forced NOT-READY so the write path is synchronous and deterministic.
// That is the production fallback branch, not a fiction: `isReady()` is false for
// the first save of every session.
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
import {
    computeSnapshotChecksum,
    verifySnapshotChecksum,
    INTEGRITY_ALGO,
} from '@pryzm/persistence-client';

const PROJECT = 'proj-founder';
const V2_MARKER = '\x00fflate2\x01';
const V3_MARKER = '\x00fflate3\x01';
const HISTORY_LENGTH = 20;

/**
 * Journal scale. ⚠ 3000 rather than the founder's 30 432 so the suite stays
 * fast; the SHAPE is what is under test and the ratio is reported by
 * `tools/perf/bench-journal-sidecar.mjs` at his real scale. 3000 spans two
 * sealed chunks (k = 2000) plus a tail, which is the only property these tests
 * actually need from the number.
 */
const JOURNAL_RECORDS = 3000;

interface Mutation { id: string; elementId: string; elementType: string; mutationType: string; mutatedAt: number; mutatedBy: string; commandId: string; sessionId: string }

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

/** A snapshot in the shape `ProjectSerializer` emits, journal and all. */
function makeSnapshot(journalLength: number, tag: string): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {
        schemaVersion: 5,
        projectId: PROJECT,
        projectName: 'Founder Project',
        elementCount: 281,
        levels: Array.from({ length: 7 }, (_, i) => ({ id: `lvl-${i}`, name: `L${i}`, elevation: i * 3 })),
        walls: Array.from({ length: 62 }, (_, i) => ({
            id: `w-${i}`, levelId: `lvl-${i % 7}`, height: 2.7, thickness: 0.2,
            start: { x: i * 1.37, y: 0, z: i * 0.91 }, end: { x: i * 1.37 + 4.2, y: 0, z: i * 0.91 + 2.6 },
        })),
        slabs: Array.from({ length: 10 }, (_, i) => ({ id: `s-${i}`, levelId: `lvl-${i % 7}`, thickness: 0.25 })),
        semanticGraph: { version: 1, relationships: [] },
        temporalGraph: {
            version: 1,
            edges: Array.from({ length: 24 }, (_, i) => ({
                id: `edge-${i}`, sourceId: `w-${i}`, targetId: `lvl-${i % 7}`, type: 'hostedBy',
                createdAt: 1_787_150_674_754, createdBy: 'system', validFrom: 1_787_150_674_754,
                validUntil: null, commandId: 'system', sessionId: 'a3f1c2d4-1111-2222-3333-444455556666',
            })),
            mutations: mutations(journalLength),
            sessionId: 'a3f1c2d4-1111-2222-3333-444455556666',
        },
        versionLabel: tag,
    };
    // Stamped exactly as ProjectSerializer does: LAST, over the whole snapshot.
    snapshot.integrity = {
        algo: INTEGRITY_ALGO,
        checksum: computeSnapshotChecksum(snapshot),
        schemaVersion: 5,
    };
    return snapshot;
}

function makeVersion(i: number, journalLength = JOURNAL_RECORDS): VersionRecord {
    return {
        id: `ver-${i}`, projectId: PROJECT, label: `Auto-save ${i}`,
        timestamp: 1_700_000_000_000 + i, elementCount: 281,
        snapshot: makeSnapshot(journalLength, `v${i}`),
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}

const META = {
    id: PROJECT, name: 'Founder Project', updatedAt: 1_700_000_000_000,
    elementCount: 281, versionCount: HISTORY_LENGTH, ownerId: 'user-test',
} as unknown as Parameters<LocalVersionRepository['saveVersionWithMeta']>[2];

type Flags = { __pryzmJournalSidecar?: boolean };
const flags = globalThis as unknown as Flags;

/** Write a full history the way the PREVIOUS build did — journal inline, v2. */
function seedLegacyV2(repo: LocalVersionRepository, count = HISTORY_LENGTH): VersionRecord[] {
    flags.__pryzmJournalSidecar = false;
    try {
        const versions = Array.from({ length: count }, (_, i) => makeVersion(i));
        repo.saveVersions(PROJECT, versions);
        return versions;
    } finally {
        delete flags.__pryzmJournalSidecar;
    }
}

/** Write a full history the way THIS build does — shared journal, v3. */
function seedV3(repo: LocalVersionRepository, count = HISTORY_LENGTH): VersionRecord[] {
    const versions = Array.from({ length: count }, (_, i) => makeVersion(i));
    repo.saveVersions(PROJECT, versions);
    return versions;
}

const containerBytes = (): number => _vmirror.get(PROJECT)!.length;
const journalRecordsIn = (v: VersionRecord): number =>
    ((v.snapshot as unknown as { temporalGraph?: { mutations?: unknown[] } }).temporalGraph?.mutations ?? []).length;

beforeEach(() => {
    installLocalStorage();
    _vmirror.clear();
    idb.disabled = false;
    decodeCalls.n = 0;
    encodeCalls.n = 0; encodeCalls.chars = 0;
    delete flags.__pryzmJournalSidecar;
    _putVersions.mockClear();
    _putVersionsMirrorOnly.mockClear();
    _getVersionsSync.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); delete flags.__pryzmJournalSidecar; });

// ────────────────────────────────────────────────────────────────────────────

describe('§JOURNAL-SIDECAR — ⭐ BOTH FORMATS OPEN (the migration, proven with a fixture of each)', () => {
    it('premise: the two fixtures really are different containers', () => {
        const repo = new LocalVersionRepository();
        seedLegacyV2(repo);
        const legacy = _vmirror.get(PROJECT)!;
        expect(legacy.startsWith(V2_MARKER)).toBe(true);
        // The old shape: every entry carries its own journal, no shared sidecar.
        const entries = JSON.parse(legacy.slice(V2_MARKER.length)) as { i: string; b: string; r?: number }[];
        expect(entries).toHaveLength(HISTORY_LENGTH);
        expect(entries.every(e => e.r === undefined)).toBe(true);

        _vmirror.clear();
        seedV3(new LocalVersionRepository());
        const modern = _vmirror.get(PROJECT)!;
        expect(modern.startsWith(V3_MARKER)).toBe(true);
        const c = JSON.parse(modern.slice(V3_MARKER.length)) as { f: number; j: { n: number; c: unknown[] }; v: { r?: number }[] };
        expect(c.f).toBe(3);
        expect(c.j.n).toBe(JOURNAL_RECORDS);
        expect(c.v.filter(e => e.r !== undefined)).toHaveLength(HISTORY_LENGTH);
    });

    it('⭐ a snapshot written BEFORE this change (v2, journal inline) still opens IN FULL', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedLegacyV2(repo);

        const latest = repo.getLatestVersion(PROJECT)!;
        expect(latest.id).toBe(seeded[HISTORY_LENGTH - 1]!.id);
        expect(journalRecordsIn(latest)).toBe(JOURNAL_RECORDS);
        expect(latest).toEqual(seeded[HISTORY_LENGTH - 1]);

        // ⛔ AND ITS INTEGRITY STAMP STILL VERIFIES AT FULL STRENGTH. A legacy
        // snapshot is not "reassembled" and must not be reported as such.
        const verdict = verifySnapshotChecksum(latest.snapshot);
        expect(verdict).toMatchObject({ present: true, ok: true, comparable: true });
    });

    it('⭐ a snapshot written AFTER this change (v3, cursor) opens identically', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedV3(repo);

        const latest = repo.getLatestVersion(PROJECT)!;
        expect(latest.id).toBe(seeded[HISTORY_LENGTH - 1]!.id);
        expect(journalRecordsIn(latest)).toBe(JOURNAL_RECORDS);
        expect(latest).toEqual(seeded[HISTORY_LENGTH - 1]);

        // ⭐ THE ASSERTION THIS WHOLE CHANGE HAD TO EARN: a reassembled snapshot
        // reproduces the digest that was stamped over the inline one, so it is
        // compared at FULL strength and can never read as "corrupt" (the third
        // recurrence of L-334 / L-360 / L-8700, prevented rather than diagnosed).
        const verdict = verifySnapshotChecksum(latest.snapshot);
        expect(verdict).toMatchObject({ present: true, ok: true, comparable: true });
    });

    it('every version of a v3 container round-trips exactly, not just the newest', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedV3(repo);
        const read = repo.getVersions(PROJECT);

        expect(read).toHaveLength(HISTORY_LENGTH);
        expect(read).toEqual(seeded);
        for (const v of read) {
            expect(journalRecordsIn(v)).toBe(JOURNAL_RECORDS);
            expect(verifySnapshotChecksum(v.snapshot)).toMatchObject({ ok: true, comparable: true });
        }
    });

    it('a MIXED container — some entries with cursors, some inline — opens all of them', () => {
        // This is the real migration state, not a contrived one: entries written
        // before the change are never rewritten, they age out of the ring.
        const repo = new LocalVersionRepository();
        seedLegacyV2(repo, 5);
        flags.__pryzmJournalSidecar = true;
        repo.saveVersionWithMeta(PROJECT, makeVersion(900), META);

        const raw = _vmirror.get(PROJECT)!;
        expect(raw.startsWith(V3_MARKER)).toBe(true);
        const c = JSON.parse(raw.slice(V3_MARKER.length)) as { v: { r?: number }[] };
        // The one-time compaction converts what it can prove; whatever remains
        // inline must still read back whole. Both halves are asserted below.
        expect(c.v).toHaveLength(6);

        const read = repo.getVersions(PROJECT);
        expect(read).toHaveLength(6);
        for (const v of read) {
            expect(journalRecordsIn(v)).toBe(JOURNAL_RECORDS);
            expect(verifySnapshotChecksum(v.snapshot)).toMatchObject({ ok: true, comparable: true });
        }
    });
});

describe('§JOURNAL-SIDECAR — ⭐ the size, and ⛔ that nothing was deleted to get it', () => {
    it('⭐ MEASURED: one shared journal instead of twenty copies', () => {
        const repo = new LocalVersionRepository();
        seedLegacyV2(repo);
        const before = containerBytes();
        const beforeRecords = repo.getVersions(PROJECT).map(journalRecordsIn);

        _vmirror.clear();
        _versionCacheReset(repo);
        seedV3(new LocalVersionRepository());
        const after = containerBytes();
        const afterRecords = new LocalVersionRepository().getVersions(PROJECT).map(journalRecordsIn);

        // ⛔ THE NON-NEGOTIABLE HALF, ASSERTED FIRST. Identical record counts,
        // version for version. A test that checked only the byte reduction would
        // pass against a retention cap — which C05 §3.5 and L-5823 forbid by name.
        expect(afterRecords).toEqual(beforeRecords);
        expect(afterRecords.every(n => n === JOURNAL_RECORDS)).toBe(true);

        // ⭐ …and then the reduction. The floor is deliberately loose (>2×) so the
        // test asserts the SHAPE and not one machine's compression ratio; the real
        // figure at the founder's scale is reported by the bench, not guessed here.
        expect(after).toBeLessThan(before / 2);
        // eslint-disable-next-line no-console
        console.log(`[test] §JOURNAL-SIDECAR container ${before} → ${after} chars ` +
            `(${(before / after).toFixed(1)}×), journal records unchanged at ${JOURNAL_RECORDS} per version.`);
    });

    it('⭐ the container stops growing with history — 20 versions cost barely more than 1', () => {
        const one = (() => { _vmirror.clear(); seedV3(new LocalVersionRepository(), 1); return containerBytes(); })();
        const twenty = (() => { _vmirror.clear(); seedV3(new LocalVersionRepository(), 20); return containerBytes(); })();

        // Before this change the ratio was ~20× (each version carried the log).
        // Now the log is paid once and each extra version adds only its model.
        expect(twenty).toBeLessThan(one * 2);
    });

    it('⭐ an autosave re-compresses the TAIL of the journal, not the whole log', () => {
        const repo = new LocalVersionRepository();
        seedV3(repo);
        // Warm the read caches the way an open does, then measure ONE save.
        repo.getLatestVersion(PROJECT);
        encodeCalls.n = 0; encodeCalls.chars = 0;

        const grown = makeVersion(900, JOURNAL_RECORDS + 40);
        repo.saveVersionWithMeta(PROJECT, grown, META);

        // Sealed chunks (2 × 2000 records) are carried forward as BYTES; only the
        // tail chunk and the one new version record are deflated. The whole log
        // would be ~3040 records — the assertion is that we compressed far less.
        const wholeLog = JSON.stringify(mutations(JOURNAL_RECORDS + 40)).length;
        expect(encodeCalls.chars).toBeLessThan(wholeLog / 2);
    });
});

describe('§JOURNAL-SIDECAR — the envelope still answers without inflating', () => {
    it('countVersions / probeVersions never count the shared journal as a version', () => {
        const repo = new LocalVersionRepository();
        seedV3(repo);
        decodeCalls.n = 0;

        expect(repo.countVersions(PROJECT)).toBe(HISTORY_LENGTH);
        expect(repo.probeVersions(PROJECT)).toEqual({ kind: 'counted', count: HISTORY_LENGTH });
        expect(decodeCalls.n).toBe(0); // ⭐ still envelope-only (C05 §3.6 req 1)
    });

    it('⭐ saveVersionWithMeta still appends without inflating a stored version', () => {
        const repo = new LocalVersionRepository();
        seedV3(repo);
        repo.getLatestVersion(PROJECT);     // the open, which warms the journal
        decodeCalls.n = 0;

        repo.saveVersionWithMeta(PROJECT, makeVersion(901), META);

        // ⛔ Zero decodes of a stored VERSION. The journal is already in memory
        // from the open, so the append pays nothing for it either — which is the
        // whole reason the mirror exists.
        expect(decodeCalls.n).toBe(0);
        expect(repo.getVersions(PROJECT)).toHaveLength(HISTORY_LENGTH);
    });

    it('a syncStatus flip carries the cursor forward and does not touch the journal', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedV3(repo);
        repo.updateSyncStatus(PROJECT, seeded[HISTORY_LENGTH - 1]!.id, 'synced');

        const raw = _vmirror.get(PROJECT)!;
        expect(raw.startsWith(V3_MARKER)).toBe(true);
        const c = JSON.parse(raw.slice(V3_MARKER.length)) as { j: { n: number }; v: { i: string; r?: number }[] };
        expect(c.j.n).toBe(JOURNAL_RECORDS);
        expect(c.v.every(e => e.r === JOURNAL_RECORDS)).toBe(true);

        const latest = repo.getLatestVersion(PROJECT)!;
        expect(latest.syncStatus).toBe('synced');
        expect(journalRecordsIn(latest)).toBe(JOURNAL_RECORDS);
        expect(verifySnapshotChecksum(latest.snapshot)).toMatchObject({ ok: true, comparable: true });
    });
});

describe('§JOURNAL-SIDECAR — ⛔ the refusals, which are the load-bearing half', () => {
    it('⛔ a DIVERGENT lineage is stored inline and the shared journal is left alone', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedV3(repo);
        repo.getLatestVersion(PROJECT);

        // The restore-an-old-version-and-edit shape: a journal that is NOT an
        // extension of the stored one.
        const diverged = makeVersion(902, 0) as VersionRecord;
        (diverged.snapshot as unknown as { temporalGraph: { mutations: unknown[] } }).temporalGraph.mutations =
            [...mutations(1500), ...mutations(7, 900_000)];
        repo.saveVersionWithMeta(PROJECT, diverged, META);

        const c = JSON.parse(_vmirror.get(PROJECT)!.slice(V3_MARKER.length)) as { j: { n: number }; v: { i: string; r?: number }[] };
        // ⛔ The shared journal is untouched — the 19 versions that index it still
        // mean exactly what they meant.
        expect(c.j.n).toBe(JOURNAL_RECORDS);
        expect(c.v.find(e => e.i === diverged.id)!.r).toBeUndefined();

        const read = repo.getVersions(PROJECT);
        expect(read[read.length - 1]!).toEqual(diverged);
        expect(journalRecordsIn(read[read.length - 1]!)).toBe(1507);
        // …and the versions that were already there are unharmed.
        expect(journalRecordsIn(read[0]!)).toBe(JOURNAL_RECORDS);
        expect(read.slice(0, -1).map(v => v.id)).toEqual(seeded.slice(1).map(v => v.id));
    });

    it('⛔ A ROTTED JOURNAL CHUNK IS "NOT COMPARABLE", NEVER "CORRUPT" (the third-incident guard)', () => {
        const repo = new LocalVersionRepository();
        seedV3(repo);

        // Damage ONE chunk's stored bytes, leaving its digest in place — exactly
        // what byte-rot in IndexedDB looks like: the envelope still describes the
        // journal that was written, the bytes no longer are it.
        const raw = _vmirror.get(PROJECT)!;
        const c = JSON.parse(raw.slice(V3_MARKER.length)) as { f: 3; j: { k: number; n: number; c: { b: string; n: number; h: string }[] }; v: unknown[] };
        c.j.c[0]!.b = realCodec.encodeCompressed(JSON.stringify(mutations(2000, 500_000)));
        const damaged = V3_MARKER + JSON.stringify(c);

        // ⚠ THE IN-MEMORY JOURNAL MIRROR HAS TO GO FIRST, and saying why is the
        // point of this comment. The mirror is keyed by chunk DIGEST, not by
        // bytes, so a session that already read the good journal keeps serving it
        // — which is correct behaviour (the records in RAM are the real ones) and
        // would make this test measure the cache instead of the rot. Modelling a
        // COLD open means dropping the module's per-project state, which is what
        // `deleteVersions` is for.
        repo.deleteVersions(PROJECT);
        _vmirror.set(PROJECT, damaged);

        const latest = new LocalVersionRepository().getLatestVersion(PROJECT)!;
        const verdict = verifySnapshotChecksum(latest.snapshot);

        expect(verdict.present).toBe(true);
        expect(verdict.ok).toBe(true);            // ⛔ never the mismatch verdict
        expect(verdict.comparable).toBe(false);   // ⭐ the honest answer
        expect(verdict.note).toContain('JOURNAL-SIDECAR');
        expect(verdict.note?.toLowerCase()).not.toContain('corrupt');
        // ⛔ And the project still OPENS — the model is intact and every record
        // that verified is attached. A rotted journal chunk is not a dead project.
        expect(latest.id).toBe(`ver-${HISTORY_LENGTH - 1}`);
        expect((latest.snapshot as unknown as { walls: unknown[] }).walls).toHaveLength(62);
        expect(journalRecordsIn(latest)).toBeLessThan(JOURNAL_RECORDS);
    });

    it('⭐ an in-session read is served from the verified journal already in memory', () => {
        // The other half of the case above, stated as its own fact rather than
        // left as a caveat: the mirror is keyed by chunk digest, so a reader that
        // has already verified this journal does not inflate it again.
        const repo = new LocalVersionRepository();
        seedV3(repo);
        repo.getLatestVersion(PROJECT);
        decodeCalls.n = 0;

        const again = repo.getLatestVersion(PROJECT)!;
        expect(journalRecordsIn(again)).toBe(JOURNAL_RECORDS);
        expect(decodeCalls.n).toBe(1);   // the ONE version blob, and not the journal's chunks
    });

    it('⛔ the revert switch reverts the WRITE and never strands a READ', () => {
        const repo = new LocalVersionRepository();
        seedV3(repo);                                   // v3 on disk
        const v3Read = repo.getVersions(PROJECT);

        flags.__pryzmJournalSidecar = false;
        // A v3 container written while the switch is ON must still be READABLE
        // with it OFF — a flag that changed what can be read would strand data.
        const afterFlip = new LocalVersionRepository().getVersions(PROJECT);
        expect(afterFlip).toEqual(v3Read);

        // …and the next write stores its journal INLINE again.
        repo.saveVersionWithMeta(PROJECT, makeVersion(903), META);
        const c = JSON.parse(_vmirror.get(PROJECT)!.slice(V3_MARKER.length)) as { j: { n: number } | null; v: { i: string; r?: number }[] };
        expect(c.v.find(e => e.i === 'ver-903')!.r).toBeUndefined();
        expect(journalRecordsIn(new LocalVersionRepository().getLatestVersion(PROJECT)!)).toBe(JOURNAL_RECORDS);

        // ⛔ BUT THE SIDECAR IS NOT DROPPED WHILE ANYTHING STILL INDEXES IT, and
        // that is the behaviour worth pinning: nineteen stored versions hold a
        // cursor, so the container stays v3 and keeps the journal they name.
        // Reverting how we WRITE must never orphan what is already written.
        expect(_vmirror.get(PROJECT)!.startsWith(V3_MARKER)).toBe(true);
        expect(c.j!.n).toBe(JOURNAL_RECORDS);

        // Once every cursor has aged out of the twenty, the container returns to
        // the previous format on its own — no migration, no rewrite.
        for (let i = 0; i < HISTORY_LENGTH; i++) repo.saveVersionWithMeta(PROJECT, makeVersion(1000 + i), META);
        expect(_vmirror.get(PROJECT)!.startsWith(V2_MARKER)).toBe(true);
        expect(journalRecordsIn(new LocalVersionRepository().getLatestVersion(PROJECT)!)).toBe(JOURNAL_RECORDS);
    });

    it('a project with NO temporal graph keeps writing a byte-identical v2 container', () => {
        const repo = new LocalVersionRepository();
        const plain = Array.from({ length: 3 }, (_, i) => ({
            id: `ver-${i}`, projectId: PROJECT, label: 'x', timestamp: i, elementCount: 1,
            snapshot: { schemaVersion: 5, walls: [{ id: 'w1' }] }, syncStatus: 'local-only',
        } as unknown as VersionRecord));
        repo.saveVersions(PROJECT, plain);

        expect(_vmirror.get(PROJECT)!.startsWith(V2_MARKER)).toBe(true);
        expect(repo.getVersions(PROJECT)).toEqual(plain);
    });

    it('the IndexedDB-unavailable durability fallback is untouched (journals stay inline)', () => {
        idb.disabled = true;
        const repo = new LocalVersionRepository();
        repo.saveVersionWithMeta(PROJECT, makeVersion(0), META);

        // The localStorage trim/evict ladder writes the legacy whole-array blob —
        // the entire offline durability story, unchanged by this format.
        const stored = localStorage.getItem(`bim-project-${PROJECT}-versions`);
        expect(stored).not.toBeNull();
        expect(stored!.startsWith(V3_MARKER)).toBe(false);
        expect(journalRecordsIn(repo.getVersions(PROJECT)[0]!)).toBe(JOURNAL_RECORDS);
    });
});

/**
 * The repository holds module-scoped caches keyed by project id. A test that
 * re-seeds the same id must clear them or it measures the previous test's state
 * — `deleteVersions` is the module's own reset and is used rather than reaching
 * into private maps.
 */
function _versionCacheReset(repo: LocalVersionRepository): void {
    repo.deleteVersions(PROJECT);
    _vmirror.clear();
}
