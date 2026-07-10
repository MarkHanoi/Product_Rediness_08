// @vitest-environment happy-dom
//
// §FIX-LOCALSTORAGE-QUOTA-RESIDUAL (L-148) — the residual "localStorage quota
// exceeded — project index not saved (eviction exhausted)" spam the founder saw
// once PER project on every hub load.
//
// Three root causes, three gates proven here against a byte-budgeted mock
// localStorage (throws a real QuotaExceededError over budget) + mocked IDB stores:
//
//   1. The index was rewritten once PER project during a 50-project server sync.
//      `saveProjectsBatch` coalesces the whole reconcile pass into ONE index write
//      (and, on quota, ONE warn) — proven by counting `setItem(bim-projects-index)`.
//   2. Eviction was too narrow: legacy `bim-project-<id>-versions` blobs already
//      migrated into IndexedDB sat in localStorage, unreclaimed, so the index write
//      hit "exhausted". Tier-1 reclamation drops those IDB-backed duplicates with
//      ZERO data loss so the write fits.
//   3. Graceful degrade is preserved: when nothing safe is left to reclaim/evict the
//      batch write fails with EXACTLY ONE warning and the prior index is untouched
//      (no silent data loss).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
}));

// ── Mock thumbnail IDB cache ──────────────────────────────────────────────────
const _thumbMirror = new Map<string, string>();
vi.mock('../src/ui/platform/ThumbnailCacheStore.js', () => ({
    getThumbnailCacheStore: () => ({
        put: vi.fn((id: string, url: string | null | undefined) => { if (url) _thumbMirror.set(id, url); }),
        getSync: vi.fn((id: string) => _thumbMirror.get(id)),
        delete: vi.fn((id: string) => { _thumbMirror.delete(id); }),
        warm: () => Promise.resolve(),
        init: () => Promise.resolve(),
    }),
}));

// ── Mock version IDB store: Map mirror + toggleable disabled ───────────────────
const _verMirror = new Map<string, string>();
let _verDisabled = false;
vi.mock('../src/ui/platform/VersionCacheStore.js', () => ({
    getVersionCacheStore: () => ({
        init: () => Promise.resolve(),
        warm: () => Promise.resolve(),
        isDisabled: () => _verDisabled,
        isWarmed: () => true,
        getVersionsSync: (id: string) => _verMirror.get(id),
        putVersions: vi.fn((id: string, payload: string) => { _verMirror.set(id, payload); }),
        putVersionsMirrorOnly: vi.fn(),
        deleteVersions: vi.fn((id: string) => { _verMirror.delete(id); }),
        getSyncQueueSync: () => null,
        putSyncQueue: vi.fn(),
        clearSyncQueue: vi.fn(),
    }),
}));

import {
    LocalProjectRepository,
    type ProjectMeta,
} from '../src/ui/platform/ProjectRepository.js';

const INDEX_KEY = 'bim-projects-index';

// Byte-budgeted mock localStorage. Returns the raw setItem spy so callers can count
// index writes. Throws a real QuotaExceededError when a setItem would exceed budget.
function installBudgetedLocalStorage(budget: number): {
    store: Map<string, string>;
    setItemSpy: ReturnType<typeof vi.fn>;
} {
    const store = new Map<string, string>();
    const usage = () => { let n = 0; for (const [k, v] of store) n += k.length + v.length; return n; };
    const setItemSpy = vi.fn((k: string, v: string) => {
        const prev = store.get(k) ?? '';
        const projected = usage() - (k.length + prev.length) + (k.length + v.length);
        if (projected > budget) {
            throw Object.assign(new Error('quota'), { name: 'QuotaExceededError', code: 22 });
        }
        store.set(k, v);
    });
    const ls = {
        get length() { return store.size; },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: setItemSpy,
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
    return { store, setItemSpy };
}

function meta(id: string, updatedAt = 1): ProjectMeta {
    return { id, name: `Project ${id}`, updatedAt, versionCount: 0, ownerId: 'user-test' };
}

beforeEach(() => {
    _thumbMirror.clear();
    _verMirror.clear();
    _verDisabled = false;
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§FIX-LOCALSTORAGE-QUOTA-RESIDUAL — saveProjectsBatch writes the index ONCE', () => {
    it('performs exactly ONE bim-projects-index setItem for a 50-project sync', () => {
        const { setItemSpy } = installBudgetedLocalStorage(50_000_000); // generous
        const repo = new LocalProjectRepository();

        const upserts = Array.from({ length: 50 }, (_, i) => meta(`proj-${i}`, i + 1));
        repo.saveProjectsBatch(upserts);

        const indexWrites = setItemSpy.mock.calls.filter(([k]) => k === INDEX_KEY).length;
        expect(indexWrites).toBe(1);
    });

    it('still writes the index ONCE when the pass mixes upserts and deletes', () => {
        const { store, setItemSpy } = installBudgetedLocalStorage(50_000_000);
        // Seed an existing project that the sync will purge.
        store.set(INDEX_KEY, JSON.stringify([meta('proj-stale', 1)]));
        const repo = new LocalProjectRepository();

        repo.saveProjectsBatch(
            [meta('proj-a', 2), meta('proj-b', 3)],
            ['proj-stale'],
        );

        const indexWrites = setItemSpy.mock.calls.filter(([k]) => k === INDEX_KEY).length;
        expect(indexWrites).toBe(1);
        const idx = JSON.parse(store.get(INDEX_KEY)!) as ProjectMeta[];
        expect(idx.map(m => m.id).sort()).toEqual(['proj-a', 'proj-b']);
    });
});

describe('§FIX-LOCALSTORAGE-QUOTA-RESIDUAL — Tier-1 reclaims IDB-backed duplicates (zero loss)', () => {
    it('frees legacy version blobs already in IndexedDB so the batch index write fits', () => {
        // Budget fits the lean index alone but NOT the fat legacy version blobs. The
        // blobs are seeded via the raw Map (bypassing the budget), reproducing a
        // localStorage already over-full of migrated-away duplicates; the batch index
        // write then overflows until Tier-1 reclaims them.
        const { store } = installBudgetedLocalStorage(1_000);
        // Two legacy version blobs still in localStorage AND already durable in IDB.
        const FAT = 'x'.repeat(2_500);
        store.set('bim-project-old1-versions', FAT);
        store.set('bim-project-old2-versions', FAT);
        _verMirror.set('old1', FAT); // authoritative copy lives in IDB
        _verMirror.set('old2', FAT);
        // A small pre-existing index.
        store.set(INDEX_KEY, JSON.stringify([meta('old1', 1), meta('old2', 2)]));

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const repo = new LocalProjectRepository();

        // Sync brings a third project; the grown index cannot fit alongside the fat
        // duplicates — Tier-1 must reclaim them.
        repo.saveProjectsBatch([meta('old1', 10), meta('old2', 11), meta('new3', 12)]);

        // The redundant localStorage duplicates were reclaimed…
        expect(store.has('bim-project-old1-versions')).toBe(false);
        expect(store.has('bim-project-old2-versions')).toBe(false);
        // …with ZERO data loss — the authoritative IDB copies are untouched.
        expect(_verMirror.get('old1')).toBe(FAT);
        expect(_verMirror.get('old2')).toBe(FAT);
        // …and the index write succeeded (all three projects present, no warn).
        const idx = JSON.parse(store.get(INDEX_KEY)!) as ProjectMeta[];
        expect(idx.map(m => m.id).sort()).toEqual(['new3', 'old1', 'old2']);
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('§FIX-LOCALSTORAGE-QUOTA-RESIDUAL — graceful degrade: ONE warn, no data loss', () => {
    it('emits a single warning and preserves prior data when nothing safe is reclaimable', () => {
        // The real founder residual: localStorage is full of bloat ProjectRepository
        // does NOT own and must never delete — a legacy inline underlay RASTER
        // (`pryzm.floorPlanUnderlay.v2.*`, owned by UnderlayPersistence per Contract
        // §06 §7 single-writer). No `bim-project-*-versions` stores exist, so Tier-2
        // has nothing to evict, and the raster is not an IDB duplicate, so Tier-1
        // cannot touch it. The batch write must fail LOUDLY-ONCE, not spam per project.
        const B = 6_000;
        const { store } = installBudgetedLocalStorage(B);
        const priorIndex = JSON.stringify([meta('proj-current', 1)]);
        store.set(INDEX_KEY, priorIndex); // seeding via the raw Map bypasses the budget
        const RASTER = 'z'.repeat(5_700);
        store.set('pryzm.floorPlanUnderlay.v2.proj-current', RASTER); // foreign, un-reclaimable

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const repo = new LocalProjectRepository();

        // Growing the index (a long-id second project) can no longer fit, and no safe
        // reclamation exists.
        repo.saveProjectsBatch([
            meta('proj-current', 2),
            meta('proj-with-a-very-long-identifier-to-force-index-growth-0123456789', 3),
        ]);

        // Exactly ONE quota warning — never a per-project spam loop.
        const quotaWarns = warn.mock.calls.filter(
            ([m]) => typeof m === 'string' && m.includes('project index not saved'),
        );
        expect(quotaWarns.length).toBe(1);
        // No silent data loss: the foreign raster (another module's data) is untouched,
        // and the previously-persisted index is still intact after the failed write.
        expect(store.get('pryzm.floorPlanUnderlay.v2.proj-current')).toBe(RASTER);
        expect(store.get(INDEX_KEY)).toBe(priorIndex);
    });
});
