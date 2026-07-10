// @vitest-environment happy-dom
//
// L-148 §FIX-PROJECT-INDEX-INDEXEDDB — one-time MIGRATION gate for the two
// warm() paths that relocate EXISTING (legacy) localStorage payloads into
// IndexedDB, reclaiming the bloat that produced the founder's per-project
// "localStorage quota exceeded — project index not saved (eviction exhausted)"
// spam without waiting for each project to be re-saved.
//
// Two migrations are covered:
//   • warmThumbnailCache — legacy inline `ProjectMeta.thumbnail` bytes still in the
//     `bim-projects-index` blob are pushed to the thumbnail IDB cache and STRIPPED
//     out of the index (the index shrinks back under budget).
//   • warmVersionCache   — legacy `bim-project-<id>-versions` payloads still in
//     localStorage are copied VERBATIM (compression preserved) into the version
//     IDB store and REMOVED from localStorage.
//
// Both must be idempotent, never throw, and — critically — must MOVE the blob
// (read-through + write to IDB, then delete/strip from localStorage), not merely
// copy it, so the quota pressure is actually relieved.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
}));

// ── Mock thumbnail IDB cache: Map mirror + spyable put/getSync/warm ───────────
const _thumbMirror = new Map<string, string>();
const _thumbPut = vi.fn((id: string, url: string | null | undefined) => { if (url) _thumbMirror.set(id, url); });
const _thumbGetSync = vi.fn((id: string) => _thumbMirror.get(id));
const _thumbWarm = vi.fn(() => Promise.resolve());
vi.mock('../src/ui/platform/ThumbnailCacheStore.js', () => ({
    getThumbnailCacheStore: () => ({
        put: _thumbPut,
        getSync: _thumbGetSync,
        delete: vi.fn(),
        warm: _thumbWarm,
        init: () => Promise.resolve(),
    }),
}));

// ── Mock version IDB store: Map mirror + spyable putVersions/getVersionsSync ───
const _verMirror = new Map<string, string>();
let _verDisabled = false;
const _verWarm = vi.fn(() => Promise.resolve());
const _verPutVersions = vi.fn((id: string, payload: string) => { _verMirror.set(id, payload); });
const _verGetVersionsSync = vi.fn((id: string) => _verMirror.get(id));
vi.mock('../src/ui/platform/VersionCacheStore.js', () => ({
    getVersionCacheStore: () => ({
        init: () => Promise.resolve(),
        warm: _verWarm,
        isDisabled: () => _verDisabled,
        isWarmed: () => true,
        getVersionsSync: _verGetVersionsSync,
        putVersions: _verPutVersions,
        deleteVersions: vi.fn(),
        getSyncQueueSync: () => null,
        putSyncQueue: vi.fn(),
        clearSyncQueue: vi.fn(),
    }),
}));

import {
    warmThumbnailCache,
    warmVersionCache,
    type ProjectMeta,
} from '../src/ui/platform/ProjectRepository.js';

const INDEX_KEY = 'bim-projects-index';

// Simple in-memory localStorage — no byte budget needed here; these tests assert
// the MOVE (strip / remove) behaviour, not the quota-eviction path.
function installLocalStorage(): { store: Map<string, string> } {
    const store = new Map<string, string>();
    const ls = {
        get length() { return store.size; },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
    return { store };
}

const FAT_THUMB = 'data:image/webp;base64,' + 'A'.repeat(120_000);

beforeEach(() => {
    _thumbMirror.clear(); _thumbPut.mockClear(); _thumbGetSync.mockClear(); _thumbWarm.mockClear();
    _verMirror.clear(); _verDisabled = false;
    _verWarm.mockClear(); _verPutVersions.mockClear(); _verGetVersionsSync.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('warmThumbnailCache — migrates legacy inline thumbnails out of the index', () => {
    it('moves inline thumbnail bytes into the IDB cache and strips them from localStorage', async () => {
        const { store } = installLocalStorage();
        // Legacy index written before §HUB-THUMBNAIL-STORAGE: fat thumbnails inline.
        const legacy: ProjectMeta[] = [
            { id: 'p1', name: 'One', updatedAt: 1, versionCount: 0, thumbnail: FAT_THUMB },
            { id: 'p2', name: 'Two', updatedAt: 2, versionCount: 0, thumbnail: FAT_THUMB },
        ];
        store.set(INDEX_KEY, JSON.stringify(legacy));
        expect(store.get(INDEX_KEY)!).toContain('data:image/webp'); // precondition: bloated

        await warmThumbnailCache();

        // Bytes were pushed to the IDB cache for BOTH projects…
        expect(_thumbPut).toHaveBeenCalledWith('p1', FAT_THUMB);
        expect(_thumbPut).toHaveBeenCalledWith('p2', FAT_THUMB);
        // …and STRIPPED from the localStorage index (the bloat is gone).
        const raw = store.get(INDEX_KEY)!;
        expect(raw).not.toContain('data:image/webp');
        expect(raw.length).toBeLessThan(1_000);
        const idx = JSON.parse(raw) as ProjectMeta[];
        expect(idx.map(m => m.id)).toEqual(['p1', 'p2']); // metadata preserved
        expect(idx.every(m => m.thumbnail === undefined)).toBe(true);
    });

    it('is a no-op (no rewrite) when the index carries no inline thumbnails', async () => {
        const { store } = installLocalStorage();
        const lean: ProjectMeta[] = [{ id: 'p1', name: 'One', updatedAt: 1, versionCount: 0 }];
        const before = JSON.stringify(lean);
        store.set(INDEX_KEY, before);

        await warmThumbnailCache();

        expect(_thumbPut).not.toHaveBeenCalled();
        expect(store.get(INDEX_KEY)).toBe(before); // untouched
    });

    it('never throws when there is no index at all', async () => {
        installLocalStorage();
        await expect(warmThumbnailCache()).resolves.toBeUndefined();
    });
});

describe('warmVersionCache — migrates legacy localStorage version stores into IDB', () => {
    it('copies each legacy version payload VERBATIM into IDB and removes it from localStorage', async () => {
        const { store } = installLocalStorage();
        // Legacy compressed payloads written before §VERSION-QUOTA-INDEXEDDB.
        store.set('bim-project-alpha-versions', 'COMPRESSED-PAYLOAD-ALPHA');
        store.set('bim-project-beta-versions', 'COMPRESSED-PAYLOAD-BETA');
        // An unrelated key must be left untouched.
        store.set('bim-projects-index', '[]');

        await warmVersionCache();

        // Both payloads copied VERBATIM (compression preserved — no recompress).
        expect(_verPutVersions).toHaveBeenCalledWith('alpha', 'COMPRESSED-PAYLOAD-ALPHA');
        expect(_verPutVersions).toHaveBeenCalledWith('beta', 'COMPRESSED-PAYLOAD-BETA');
        // …and REMOVED from localStorage (the move, not a copy).
        expect(store.has('bim-project-alpha-versions')).toBe(false);
        expect(store.has('bim-project-beta-versions')).toBe(false);
        // Unrelated key survives.
        expect(store.get('bim-projects-index')).toBe('[]');
    });

    it('does NOT clobber a payload already migrated into IDB (mirror wins)', async () => {
        const { store } = installLocalStorage();
        _verMirror.set('alpha', 'ALREADY-IN-IDB');        // mirror already holds it
        store.set('bim-project-alpha-versions', 'STALE-LOCALSTORAGE');

        await warmVersionCache();

        // The stale localStorage copy is dropped WITHOUT overwriting the IDB value.
        expect(_verPutVersions).not.toHaveBeenCalledWith('alpha', 'STALE-LOCALSTORAGE');
        expect(_verMirror.get('alpha')).toBe('ALREADY-IN-IDB');
        expect(store.has('bim-project-alpha-versions')).toBe(false);
    });

    it('leaves legacy localStorage in place when IndexedDB is unavailable (graceful degrade)', async () => {
        _verDisabled = true;
        const { store } = installLocalStorage();
        store.set('bim-project-alpha-versions', 'COMPRESSED-PAYLOAD-ALPHA');

        await warmVersionCache();

        // No migration attempted; the localStorage fallback stays readable.
        expect(_verPutVersions).not.toHaveBeenCalled();
        expect(store.get('bim-project-alpha-versions')).toBe('COMPRESSED-PAYLOAD-ALPHA');
    });
});
