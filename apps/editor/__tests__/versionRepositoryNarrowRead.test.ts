// @vitest-environment happy-dom
//
// §PERF-VERSION-NARROW-READ (L-1300) — the version-history read path did O(history)
// work to answer O(1) questions.
//
// THE DEFECT
// ----------
// `getVersions()` was the ONLY read API on `IVersionRepository`. Every caller that
// wanted a COUNT, an EXISTENCE CHECK, or THE LATEST RECORD therefore paid a full
// history decode: one `inflateSync` + one `JSON.parse` of a multi-MB snapshot PER
// STORED VERSION, all but one of which was thrown away immediately.
//
// On the founder's live project (204 elements / 7 levels / 145 handrails; 20 stored
// versions ≈ 13.2 MB compressed) that decode measured **~503 ms of synchronous
// main-thread work**, and it was paid:
//   • twice per autosave (the `versionCount` meta field, and `saveVersionWithMeta`),
//   • once per Save-modal open (the plan-limit check + the default label),
//   • once per project open (which then uses only `versions[length - 1]`),
//   • and once PER LOCAL PROJECT inside the project hub's stale-project purge loop.
//
// §PERF-VERSION-INCREMENTAL-COMPRESS (L-131 P4b) had already made the WRITE-side
// deflate O(1). The read side, and the mirror stringify beside it, kept paying
// O(history) — which is why the saving it bought was smaller than expected.
//
// ⭐ WHY THESE TESTS COUNT DECODES RATHER THAN ASSERT RETURN VALUES
// -----------------------------------------------------------------
// A test that only checks `countVersions() === 20` passes just as happily against
// the old `getVersions().length` implementation — it would assert the ANSWER while
// proving nothing about the WORK, which is the entire point of the change. So these
// tests wrap the REAL codec (`encodeCompressed` / `decodeCompressed` still run, and
// the payloads really do round-trip) in a call counter, and assert on the number of
// inflates. That is the separating observation:
//
//     getVersions()      → 20 decodes   (unchanged, and must stay correct)
//     countVersions()    →  0 decodes   ⭐ separating
//     getLatestVersion() →  1 decode    ⭐ separating
//
// ⛔ Nothing under test is stubbed. The counter observes the codec; it does not
// replace it — every assertion below is made against genuinely round-tripped bytes.

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
        // Real deflate — untouched.
        encodeCompressed: actual.encodeCompressed,
        // Real inflate, counted. `decodeCompressed` is a passthrough for unmarked
        // strings, so we count only calls that actually had bytes to inflate —
        // that is the work this change exists to avoid.
        decodeCompressed: (data: string) => {
            if (typeof data === 'string' && data.startsWith(actual.COMPRESSED_MARKER)) decodeCalls.n++;
            return actual.decodeCompressed(data);
        },
    };
});

// ── Map-backed synchronous mirror standing in for IndexedDB ─────────────────
const _vmirror = new Map<string, string>();
const _putVersions = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
const _putVersionsMirrorOnly = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
const _getVersionsSync = vi.fn((id: string) => _vmirror.get(id));
vi.mock('../src/ui/platform/VersionCacheStore.js', () => ({
    getVersionCacheStore: () => ({
        init: () => Promise.resolve(),
        warm: () => Promise.resolve(),
        isDisabled: () => false,
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
        timestamp: 1_700_000_000_000 + i, elementCount: 204,
        snapshot: { projectName: 'Founder Project', elementCount: 204, blob: s },
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}

const HISTORY_LENGTH = 20;

/** Persist a real 20-version history through the real write path, then reset counters. */
function seedHistory(repo: LocalVersionRepository): VersionRecord[] {
    const versions = Array.from({ length: HISTORY_LENGTH }, (_, i) => makeVersion(i));
    repo.saveVersions(PROJECT, versions);
    decodeCalls.n = 0;
    return versions;
}

beforeEach(() => {
    installLocalStorage();
    _vmirror.clear();
    decodeCalls.n = 0;
    _putVersions.mockClear();
    _putVersionsMirrorOnly.mockClear();
    _getVersionsSync.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§PERF-VERSION-NARROW-READ (L-1300) — narrow reads do not decode the whole history', () => {
    it('the stored payload really is a v2 container of 20 compressed blobs (premise check)', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);
        const raw = _vmirror.get(PROJECT)!;
        expect(raw.startsWith(V2_MARKER)).toBe(true);
        const entries = JSON.parse(raw.slice(V2_MARKER.length)) as { i: string; b: string }[];
        expect(entries).toHaveLength(HISTORY_LENGTH);
        // Every stored blob is genuinely compressed — if this ever fails, the
        // decode counts below would be measuring nothing.
        expect(entries.every(e => e.b.startsWith(realCodec.COMPRESSED_MARKER))).toBe(true);
    });

    it('BASELINE — getVersions() decodes every stored version (this is the cost)', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);

        const got = repo.getVersions(PROJECT);

        expect(got).toHaveLength(HISTORY_LENGTH);
        expect(got.map(v => v.id)).toEqual(seeded.map(v => v.id));
        // ⭐ The number this change exists to avoid paying for a count.
        expect(decodeCalls.n).toBe(HISTORY_LENGTH);
    });

    it('⭐ countVersions() returns the same number while decoding NOTHING', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);

        const n = repo.countVersions(PROJECT);

        expect(n).toBe(HISTORY_LENGTH);
        expect(n).toBe(repo.getVersions(PROJECT).length); // same answer as the slow path
        // The `getVersions` call on the line above is what makes this non-zero;
        // countVersions itself must contribute nothing.
        expect(decodeCalls.n).toBe(HISTORY_LENGTH);
    });

    it('⭐ countVersions() in isolation performs ZERO inflates', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);

        expect(repo.countVersions(PROJECT)).toBe(HISTORY_LENGTH);
        expect(decodeCalls.n).toBe(0); // ⭐ the separating assertion
    });

    it('⭐ getLatestVersion() returns the newest record while inflating exactly ONE', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);

        const latest = repo.getLatestVersion(PROJECT);

        expect(latest).not.toBeNull();
        // Identical to what every caller computed by hand from the full decode.
        expect(latest).toEqual(seeded[HISTORY_LENGTH - 1]);
        expect(decodeCalls.n).toBe(1); // ⭐ the separating assertion (was 20)
    });

    it('countVersions() is 0 and getLatestVersion() is null for an unknown project', () => {
        const repo = new LocalVersionRepository();
        seedHistory(repo);
        expect(repo.countVersions('no-such-project')).toBe(0);
        expect(repo.getLatestVersion('no-such-project')).toBeNull();
        expect(decodeCalls.n).toBe(0);
    });

    it('legacy v1 whole-array payloads still read correctly (never wrong, merely not faster)', () => {
        const repo = new LocalVersionRepository();
        const versions = Array.from({ length: 3 }, (_, i) => makeVersion(i));
        // A v1 payload is the whole array compressed jointly, with no envelope.
        _vmirror.set(PROJECT, realCodec.encodeCompressed(JSON.stringify(versions)));
        decodeCalls.n = 0;

        expect(repo.countVersions(PROJECT)).toBe(3);
        expect(repo.getLatestVersion(PROJECT)).toEqual(versions[2]);
        // No envelope exists to read, so both fall back to the full decode. The
        // point of this test is CORRECTNESS on the legacy format, not speed.
        expect(decodeCalls.n).toBeGreaterThan(0);
    });
});

describe('§PERF-VERSION-NARROW-READ (L-1300) — the in-session mirror is O(1), and must not poison the blob cache', () => {
    it('a v2 container whose newest entry holds RAW JSON decodes byte-identically', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);

        // Reproduce the mid-flight mirror the incremental save writes: every
        // unchanged version keeps its cached compressed blob, the newest carries
        // raw JSON because the worker's deflate has not landed yet.
        const raw = _vmirror.get(PROJECT)!;
        const entries = JSON.parse(raw.slice(V2_MARKER.length)) as { i: string; b: string }[];
        entries[entries.length - 1] = {
            i: seeded[HISTORY_LENGTH - 1].id,
            b: JSON.stringify(seeded[HISTORY_LENGTH - 1]),
        };
        _vmirror.set(PROJECT, V2_MARKER + JSON.stringify(entries));

        expect(repo.getVersions(PROJECT)).toEqual(seeded);
        expect(repo.getLatestVersion(PROJECT)).toEqual(seeded[HISTORY_LENGTH - 1]);
        expect(repo.countVersions(PROJECT)).toBe(HISTORY_LENGTH);
    });

    it('⛔ REGRESSION — reading that mirror must not cache the RAW entry as if it were compressed', () => {
        const repo = new LocalVersionRepository();
        const seeded = seedHistory(repo);

        const raw = _vmirror.get(PROJECT)!;
        const entries = JSON.parse(raw.slice(V2_MARKER.length)) as { i: string; b: string }[];
        const rawId = seeded[HISTORY_LENGTH - 1].id;
        entries[entries.length - 1] = { i: rawId, b: JSON.stringify(seeded[HISTORY_LENGTH - 1]) };
        _vmirror.set(PROJECT, V2_MARKER + JSON.stringify(entries));

        // Reading populates the per-version blob cache from the container…
        repo.getVersions(PROJECT);
        // …and the next save must still store COMPRESSED bytes for every version.
        // If the raw entry had been cached as a blob, it would be written verbatim
        // and the stored container would silently grow to uncompressed size.
        _putVersions.mockClear();
        repo.saveVersions(PROJECT, seeded);

        expect(_putVersions).toHaveBeenCalledTimes(1);
        const written = _putVersions.mock.calls[0][1] as string;
        expect(written.startsWith(V2_MARKER)).toBe(true);
        const writtenEntries = JSON.parse(written.slice(V2_MARKER.length)) as { i: string; b: string }[];
        expect(writtenEntries).toHaveLength(HISTORY_LENGTH);
        for (const e of writtenEntries) {
            expect(
                e.b.startsWith(realCodec.COMPRESSED_MARKER),
                `entry ${e.i} was stored UNCOMPRESSED — the blob cache was poisoned by a raw mirror entry`,
            ).toBe(true);
        }
        // And the round-trip still holds after that save.
        expect(repo.getVersions(PROJECT)).toEqual(seeded);
    });
});
