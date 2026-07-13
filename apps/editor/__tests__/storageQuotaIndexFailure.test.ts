// @vitest-environment happy-dom
//
// §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269) — the FALSE-SUCCESS gate.
//
// The live bug (founder's console, on EVERY autosave):
//   [VersionRepository] Quota exceeded — project meta index not updated (eviction exhausted)
//   [PlatformSaveController] Version saved: "Auto-save" (40 elements, id: proj-…)
//   [VersionRepository] 12 version(s) persisted to IndexedDB (~0.6 MB compressed)
//   Uncaught QuotaExceededError: … 'bim-pp-pos' exceeded the quota.
//
// Two distinct defects are proved and guarded here:
//
//  (1) FALSE SUCCESS. The version BODY lands in IndexedDB but the project META
//      INDEX write into localStorage fails. `saveVersionWithMeta` swallowed that
//      with a console.warn and returned void, so PlatformSaveController could not
//      know and logged "Version saved". For a project whose row is not yet in the
//      index this is real data loss: the versions exist in IDB but the project is
//      not listed, so it can never be opened again — an ORPHAN.
//      P8: a persistence failure that loses data must surface to the USER.
//
//  (2) "eviction exhausted" IS A MISNOMER. The eviction valve only ever considered
//      `bim-project-<id>-versions` keys — a key family that §VERSION-QUOTA-INDEXEDDB
//      already MIGRATED OUT of localStorage. When localStorage is full of ANYTHING
//      ELSE the candidate list is EMPTY, so the loop runs zero iterations and
//      reports "exhausted" without having evicted a single byte. The valve was
//      never spent — it was never applicable.
//
//  (3) UI CHROME MUST NEVER THROW. A panel-position preference (`bim-pp-pos`) must
//      be dropped on quota, never propagated into the app.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
    apiFetch: vi.fn(async () => ({ status: 500, ok: false, json: async () => ({}) })),
}));

// ── Mock VersionCacheStore (IndexedDB) — exactly as production: present, healthy,
// and holding the version BODIES. The quota failure under test is localStorage's.
const _vmirror = new Map<string, string>();
const _putVersions = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
const _getVersionsSync = vi.fn((id: string) => _vmirror.get(id));
vi.mock('../src/ui/platform/VersionCacheStore.js', () => ({
    getVersionCacheStore: () => ({
        init: () => Promise.resolve(),
        warm: () => Promise.resolve(),
        isDisabled: () => false,
        isWarmed: () => true,
        getVersionsSync: _getVersionsSync,
        putVersions: _putVersions,
        putVersionsMirrorOnly: (id: string, p: string) => { _vmirror.set(id, p); },
        deleteVersions: (id: string) => { _vmirror.delete(id); },
        getSyncQueueSync: () => null,
        putSyncQueue: vi.fn(),
        clearSyncQueue: vi.fn(),
    }),
}));

import {
    LocalVersionRepository,
    LocalProjectRepository,
    reclaimRedundantLocalStorage,
    type ProjectMeta,
} from '../src/ui/platform/ProjectRepository.js';
import {
    measureLocalStorageUsage,
    isStorageQuotaTerminal,
    resetStorageQuotaTerminal,
} from '../src/ui/platform/StorageQuotaDiagnostics.js';
import { writeUiPreference, readUiPreference } from '../src/ui/uiPrefStorage.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

const INDEX_KEY = 'bim-projects-index';

/**
 * Byte-budgeted mock localStorage that throws a real QuotaExceededError once a
 * setItem would push total stored bytes over `budget`. `removed` records every
 * removeItem so a test can prove that eviction removed NOTHING.
 */
function installBudgetedLocalStorage(budget: number): { store: Map<string, string>; removed: string[] } {
    const store = new Map<string, string>();
    const removed: string[] = [];
    const usage = () => {
        let n = 0;
        for (const [k, v] of store) n += k.length + v.length;
        return n;
    };
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
        removeItem: (k: string) => { removed.push(k); store.delete(k); },
        clear: () => { store.clear(); },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
    return { store, removed };
}

function makeVersion(id: string, projectId: string): VersionRecord {
    return {
        id,
        projectId,
        label: 'Auto-save',
        timestamp: Date.now(),
        elementCount: 40,
        snapshot: { projectName: 'P', elementCount: 40, elements: [] } as unknown,
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}

beforeEach(() => {
    _vmirror.clear();
    resetStorageQuotaTerminal();
});
afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE — a failed index write must not report success', () => {
    it('reports ok:false / indexPersisted:false when the meta-index write is quota-blocked', () => {
        // localStorage is FULL of a foreign key the version-eviction valve cannot see.
        const { store } = installBudgetedLocalStorage(2_000);
        store.set('some-other-subsystem-blob', 'x'.repeat(1_900));

        const repo = new LocalVersionRepository();
        const meta: ProjectMeta = {
            id: 'proj-new', name: 'Brand New Project', updatedAt: Date.now(), versionCount: 1,
        };
        const outcome = repo.saveVersionWithMeta('proj-new', makeVersion('v1', 'proj-new'), meta);

        // THE FIX: the failure is PROPAGATED, not swallowed.
        expect(outcome.ok).toBe(false);
        expect(outcome.indexPersisted).toBe(false);
        expect(outcome.reason).toBe('quota-index-write-failed');
        // …and the diagnostic names the real hog so we stop guessing.
        expect(outcome.usage?.totalBytes).toBeGreaterThan(1_000);
        expect(outcome.usage?.families[0]?.family).toContain('some-other-subsystem-blob');
    });

    it('PROVES the data loss: version body persists to IDB while the project row never reaches the index (ORPHAN)', () => {
        const { store } = installBudgetedLocalStorage(2_000);
        store.set('some-other-subsystem-blob', 'x'.repeat(1_900));

        const repo = new LocalVersionRepository();
        const meta: ProjectMeta = {
            id: 'proj-new', name: 'Brand New Project', updatedAt: Date.now(), versionCount: 1,
        };
        repo.saveVersionWithMeta('proj-new', makeVersion('v1', 'proj-new'), meta);

        // Body IS durable…
        expect(repo.getVersions('proj-new').map(v => v.id)).toEqual(['v1']);
        // …but the project is NOT listed anywhere. Unfindable ⇒ unrestorable.
        expect(store.get(INDEX_KEY)).toBeUndefined();
        // This is precisely why the outcome above MUST be ok:false.
    });

    it('reports ok:true when the index write succeeds (no false failure)', () => {
        installBudgetedLocalStorage(5_000_000);
        const repo = new LocalVersionRepository();
        const outcome = repo.saveVersionWithMeta('proj-ok', makeVersion('v1', 'proj-ok'), {
            id: 'proj-ok', name: 'Fine', updatedAt: Date.now(), versionCount: 1,
        });
        expect(outcome.ok).toBe(true);
        expect(outcome.indexPersisted).toBe(true);
        expect(isStorageQuotaTerminal()).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE — "eviction exhausted" was never even applicable', () => {
    it('evicts NOTHING when no legacy bim-project-*-versions keys exist — the valve was never spent', () => {
        const { store, removed } = installBudgetedLocalStorage(2_000);
        // The origin is full of a key family the evictor does not own and cannot see.
        store.set('some-other-subsystem-blob', 'x'.repeat(1_900));

        const repo = new LocalProjectRepository();
        const outcome = repo.saveProject({
            id: 'proj-a', name: 'A', updatedAt: Date.now(), versionCount: 0,
        });

        expect(outcome.indexPersisted).toBe(false);
        // ZERO evictions happened. "eviction exhausted" meant "eviction had no candidates".
        expect(removed).toEqual([]);
        expect(store.get('some-other-subsystem-blob')).toBeDefined();
        // The terminal state is LATCHED so autosave stops re-entering the failing loop silently.
        expect(isStorageQuotaTerminal()).toBe(true);
    });

    it('reclaimRedundantLocalStorage() drops only legacy version blobs already durable in IDB', () => {
        const { store } = installBudgetedLocalStorage(50_000);
        _vmirror.set('proj-migrated', 'already-in-idb');           // durable in IDB
        store.set('bim-project-proj-migrated-versions', 'y'.repeat(500)); // redundant duplicate
        store.set('bim-project-proj-orphan-versions', 'z'.repeat(500));   // NOT in IDB — must survive

        const freed = reclaimRedundantLocalStorage();

        expect(freed.keysDropped).toBe(1);
        expect(freed.bytesFreed).toBeGreaterThan(400);
        expect(store.has('bim-project-proj-migrated-versions')).toBe(false);
        expect(store.has('bim-project-proj-orphan-versions')).toBe(true); // zero data loss
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE — storage diagnostics', () => {
    it('measures usage and ranks the families that are actually filling the origin', () => {
        const { store } = installBudgetedLocalStorage(5_000_000);
        store.set('pryzm.scoped.p1.underlay', 'a'.repeat(3_000));
        store.set('pryzm.scoped.p2.underlay', 'a'.repeat(1_000));
        store.set('bim-projects-index', 'a'.repeat(100));

        const report = measureLocalStorageUsage();
        expect(report.totalBytes).toBeGreaterThan(4_000);
        expect(report.families[0].family).toBe('pryzm.scoped');
        expect(report.families[0].keys).toBe(2);
        expect(report.families[0].bytes).toBeGreaterThan(report.families[1].bytes);
        expect(report.topKeys[0].key).toBe('pryzm.scoped.p1.underlay');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE — UI chrome must never throw into the app', () => {
    it('swallows a quota error on a UI preference and drops the preference', () => {
        const { store } = installBudgetedLocalStorage(100);
        store.set('filler', 'x'.repeat(90));

        // This is the exact write that was throwing UNCAUGHT out of the drag handler.
        expect(() => writeUiPreference('bim-pp-pos', JSON.stringify({ x: 120, y: 240 }))).not.toThrow();
        expect(writeUiPreference('bim-pp-pos', JSON.stringify({ x: 120, y: 240 }))).toBe(false);
        expect(readUiPreference('bim-pp-pos')).toBeNull(); // dropped, not half-written
    });

    it('writes the preference normally when there is room', () => {
        installBudgetedLocalStorage(100_000);
        expect(writeUiPreference('bim-pp-pos', '{"x":10,"y":20}')).toBe(true);
        expect(readUiPreference('bim-pp-pos')).toBe('{"x":10,"y":20}');
    });

    it('survives localStorage being entirely unavailable (private mode)', () => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: { setItem: () => { throw new Error('SecurityError'); }, getItem: () => { throw new Error('SecurityError'); } },
            configurable: true, writable: true,
        });
        expect(() => writeUiPreference('bim-pp-pos', '{}')).not.toThrow();
        expect(readUiPreference('bim-pp-pos')).toBeNull();
    });
});
