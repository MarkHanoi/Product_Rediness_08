// @vitest-environment happy-dom
//
// §HUB-THUMBNAIL-STORAGE (2026-06-24) — unit gate for relocating project-card
// thumbnail BYTES out of the localStorage `bim-projects-index` blob and into
// IndexedDB (ThumbnailCacheStore), with synchronous rehydration on read.
//
// The live bug: thumbnails (~5–500 KB WebP data URLs) were stored inline in each
// ProjectMeta inside the single index blob. With ~50 projects the index alone
// blew the ~5 MB localStorage budget; `saveProject`'s setItem threw, and the
// eviction loop (which can only drop OTHER projects' version stores, never the
// index's own thumbnail payload) ran "exhausted" — so the project index failed
// to persist and cards rendered the generic placeholder.
//
// These tests prove against a mocked ThumbnailCacheStore + a byte-budgeted mock
// localStorage that:
//   • saveProject NEVER writes thumbnail bytes into the localStorage index;
//   • the thumbnail is routed to the IDB cache (.put) instead;
//   • reads rehydrate the thumbnail from the IDB mirror (.getSync);
//   • a multi-project index that USED to overflow now fits (no quota error);
//   • a thumbnail-cache failure does NOT abort the project-index save.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
}));

// Mock the IDB cache: a plain Map mirror + a spyable put/getSync/delete.
const _mirror = new Map<string, string>();
const _put = vi.fn((id: string, url: string | null | undefined) => { if (url) _mirror.set(id, url); });
const _getSync = vi.fn((id: string) => _mirror.get(id));
const _delete = vi.fn((id: string) => { _mirror.delete(id); });
vi.mock('../src/ui/platform/ThumbnailCacheStore.js', () => ({
    getThumbnailCacheStore: () => ({
        put: _put,
        getSync: _getSync,
        delete: _delete,
        warm: () => Promise.resolve(),
        init: () => Promise.resolve(),
    }),
}));

import {
    LocalProjectRepository,
    type ProjectMeta,
} from '../src/ui/platform/ProjectRepository.js';

const INDEX_KEY = 'bim-projects-index';

// Byte-budgeted mock localStorage that throws a real QuotaExceededError when a
// setItem would push total stored bytes over `budget`.
function installBudgetedLocalStorage(budget: number): { store: Map<string, string> } {
    const store = new Map<string, string>();
    const usage = () => { let n = 0; for (const [k, v] of store) n += k.length + v.length; return n; };
    const ls = {
        get length() { return store.size; },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
            const prev = store.get(k) ?? '';
            const projected = usage() - (k.length + prev.length) + (k.length + v.length);
            if (projected > budget) {
                throw Object.assign(new Error('quota'), { name: 'QuotaExceededError', code: 22 });
            }
            store.set(k, v);
        },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
    return { store };
}

// A fat fake "thumbnail" — ~120 KB so 50 of them would dwarf any localStorage budget.
const FAT_THUMB = 'data:image/webp;base64,' + 'A'.repeat(120_000);

beforeEach(() => { _mirror.clear(); _put.mockClear(); _getSync.mockClear(); _delete.mockClear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('§HUB-THUMBNAIL-STORAGE — saveProject keeps thumbnail bytes out of the index', () => {
    it('routes the thumbnail to IDB and stores ZERO thumbnail bytes in the index', () => {
        const { store } = installBudgetedLocalStorage(50_000_000);
        const repo = new LocalProjectRepository();

        repo.saveProject({ id: 'p1', name: 'One', updatedAt: 1, versionCount: 0, thumbnail: FAT_THUMB });

        // Thumbnail was routed to the IDB cache…
        expect(_put).toHaveBeenCalledWith('p1', FAT_THUMB);
        // …and the localStorage index blob does NOT contain the fat data URL.
        const raw = store.get(INDEX_KEY)!;
        expect(raw).not.toContain('data:image/webp');
        expect(raw.length).toBeLessThan(1_000); // lean metadata only
        const idx = JSON.parse(raw) as ProjectMeta[];
        expect(idx[0].thumbnail).toBeUndefined();
        expect(idx[0].id).toBe('p1');
    });

    it('rehydrates the thumbnail on read from the IDB mirror', () => {
        installBudgetedLocalStorage(50_000_000);
        const repo = new LocalProjectRepository();
        repo.saveProject({ id: 'p1', name: 'One', updatedAt: 1, versionCount: 0, thumbnail: FAT_THUMB });

        const listed = repo.listProjects().find(p => p.id === 'p1');
        expect(listed?.thumbnail).toBe(FAT_THUMB); // came back from the mirror
        expect(_getSync).toHaveBeenCalledWith('p1');
    });

    it('persists 50 projects with fat thumbnails WITHOUT a quota error (the old failure mode)', () => {
        // 5 MB budget — would have been blown by 50 × 120 KB inline thumbnails.
        const { store } = installBudgetedLocalStorage(5 * 1024 * 1024);
        const repo = new LocalProjectRepository();

        for (let i = 0; i < 50; i++) {
            repo.saveProject({ id: `p${i}`, name: `Project ${i}`, updatedAt: i, versionCount: 0, thumbnail: FAT_THUMB });
        }

        const idx = JSON.parse(store.get(INDEX_KEY)!) as ProjectMeta[];
        // All 50 made it into the index (none dropped by "eviction exhausted").
        expect(idx.length).toBe(50);
        // The whole index blob is tiny — bytes live in IDB, not here.
        expect(store.get(INDEX_KEY)!.length).toBeLessThan(50_000);
        // Every thumbnail was routed to the IDB cache.
        expect(_put).toHaveBeenCalledTimes(50);
    });

    it('a thumbnail-cache failure does NOT abort the project-index save', () => {
        const { store } = installBudgetedLocalStorage(50_000_000);
        _put.mockImplementationOnce(() => { throw new Error('IDB write blew up'); });
        const repo = new LocalProjectRepository();

        expect(() =>
            repo.saveProject({ id: 'p1', name: 'One', updatedAt: 1, versionCount: 0, thumbnail: FAT_THUMB }),
        ).not.toThrow();

        // Index still persisted despite the thumbnail-cache throw.
        const idx = JSON.parse(store.get(INDEX_KEY)!) as ProjectMeta[];
        expect(idx.some(m => m.id === 'p1')).toBe(true);
    });

    it('deleteProject drops the thumbnail from the IDB cache too', () => {
        installBudgetedLocalStorage(50_000_000);
        const repo = new LocalProjectRepository();
        repo.saveProject({ id: 'p1', name: 'One', updatedAt: 1, versionCount: 0, thumbnail: FAT_THUMB });
        repo.deleteProject('p1');
        expect(_delete).toHaveBeenCalledWith('p1');
    });
});
