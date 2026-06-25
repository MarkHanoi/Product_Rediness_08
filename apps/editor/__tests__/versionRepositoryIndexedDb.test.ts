// @vitest-environment happy-dom
//
// §VERSION-QUOTA-INDEXEDDB (2026-06-25) — unit gate for relocating per-project
// version-history snapshots (and the ServerSyncQueue overflow queue) out of the
// ~5–10 MB localStorage origin cap and into IndexedDB (VersionCacheStore).
//
// The live bug (founder, 785-element building): a 5.4 MB *compressed* version
// snapshot overflowed localStorage →
//   `[VersionRepository] localStorage quota exhausted … Versions NOT saved.`
//   `[ServerSyncQueue] Newest queued version exceeds the persist byte budget`
// so local version history for large projects was dropped and could not survive
// a reload (even though the SERVER copy saved fine).
//
// These tests mock the VersionCacheStore module (a Map-backed synchronous mirror
// with spyable put/get — the same approach the thumbnail-storage test uses for
// ThumbnailCacheStore) and prove:
//   • saveVersions routes the compressed payload to IDB (.putVersions), NOT into
//     localStorage, and emits the success log;
//   • getVersions reads it back through the synchronous mirror;
//   • a 5.4 MB-class payload that USED to overflow localStorage now persists with
//     no quota error and no "NOT saved" message;
//   • deleteVersions drops it from IDB;
//   • when IndexedDB is unavailable (isDisabled), it falls back to the original
//     localStorage path (graceful degrade);
//   • ServerSyncQueue.persistQueue routes the FULL queue to IDB (no byte budget).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
    apiFetch: vi.fn(async () => ({ status: 500, ok: false, json: async () => ({}) })),
}));

// ── Mock VersionCacheStore: Map-backed synchronous mirror + spies ─────────────
const _vmirror = new Map<string, string>();
let _qmirror: string | null = null;
let _disabled = false;
const _putVersions = vi.fn((id: string, payload: string) => { _vmirror.set(id, payload); });
const _getVersionsSync = vi.fn((id: string) => _vmirror.get(id));
const _deleteVersions = vi.fn((id: string) => { _vmirror.delete(id); });
const _putSyncQueue = vi.fn((json: string) => { _qmirror = json; });
const _getSyncQueueSync = vi.fn(() => _qmirror);
const _clearSyncQueue = vi.fn(() => { _qmirror = null; });
vi.mock('../src/ui/platform/VersionCacheStore.js', () => ({
    getVersionCacheStore: () => ({
        init: () => Promise.resolve(),
        warm: () => Promise.resolve(),
        isDisabled: () => _disabled,
        isWarmed: () => true,
        getVersionsSync: _getVersionsSync,
        putVersions: _putVersions,
        deleteVersions: _deleteVersions,
        getSyncQueueSync: _getSyncQueueSync,
        putSyncQueue: _putSyncQueue,
        clearSyncQueue: _clearSyncQueue,
    }),
}));

import {
    LocalVersionRepository,
    type ProjectMeta,
} from '../src/ui/platform/ProjectRepository.js';
import { ServerSyncQueue } from '../src/ui/platform/ServerSyncQueue.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

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

function makeVersion(id: string, bytes: number): VersionRecord {
    return {
        id, projectId: 'proj-big', label: `v-${id}`, timestamp: Date.now(), elementCount: 785,
        snapshot: { projectName: 'P', elementCount: 785, blob: randomish(bytes) } as unknown,
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}
function randomish(n: number): string {
    let s = ''; let x = 123456789;
    for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += String.fromCharCode(33 + (x % 90)); }
    return s;
}

const VERSIONS_KEY = 'bim-project-proj-big-versions';

beforeEach(() => {
    _vmirror.clear(); _qmirror = null; _disabled = false;
    _putVersions.mockClear(); _getVersionsSync.mockClear(); _deleteVersions.mockClear();
    _putSyncQueue.mockClear(); _getSyncQueueSync.mockClear(); _clearSyncQueue.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§VERSION-QUOTA-INDEXEDDB — LocalVersionRepository routes versions to IndexedDB', () => {
    it('saveVersions writes the compressed payload to IDB, NOT to localStorage', () => {
        const { store } = installBudgetedLocalStorage(50_000_000);
        const repo = new LocalVersionRepository();
        repo.saveVersions('proj-big', [makeVersion('v1', 1_000)]);

        expect(_putVersions).toHaveBeenCalledTimes(1);
        expect(_putVersions.mock.calls[0][0]).toBe('proj-big');
        // The localStorage version key holds NOTHING — bytes live in IDB.
        expect(store.get(VERSIONS_KEY)).toBeUndefined();
    });

    it('getVersions reads the payload back from the IDB mirror', () => {
        installBudgetedLocalStorage(50_000_000);
        const repo = new LocalVersionRepository();
        repo.saveVersions('proj-big', [makeVersion('v1', 500), makeVersion('v2', 500)]);

        const read = repo.getVersions('proj-big');
        expect(read.map(v => v.id)).toEqual(['v1', 'v2']);
        expect(_getVersionsSync).toHaveBeenCalledWith('proj-big');
    });

    it('persists a 5.4 MB-class snapshot that USED to overflow localStorage — no quota error, no loss', () => {
        // 4 MB budget — far smaller than the payload. The OLD code would have hit
        // QuotaExceededError on every TRIM_TARGET and logged "Versions NOT saved".
        installBudgetedLocalStorage(4 * 1024 * 1024);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const repo = new LocalVersionRepository();

        // ~6 MB of poorly-compressible data stands in for the heavy BIM scene.
        expect(() => repo.saveVersions('proj-big', [makeVersion('big', 3_000_000)])).not.toThrow();

        // Routed to IDB…
        expect(_putVersions).toHaveBeenCalledTimes(1);
        // …never logged the "quota exhausted / Versions NOT saved" error…
        expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('quota exhausted'));
        // …and emitted the founder-visible success log.
        expect(logSpy.mock.calls.some(c => String(c[0]).includes('persisted to IndexedDB'))).toBe(true);

        // Reads back intact.
        expect(repo.getVersions('proj-big')[0].id).toBe('big');
    });

    it('deleteVersions drops the project from the IDB store', () => {
        installBudgetedLocalStorage(50_000_000);
        const repo = new LocalVersionRepository();
        repo.saveVersions('proj-big', [makeVersion('v1', 100)]);
        repo.deleteVersions('proj-big');
        expect(_deleteVersions).toHaveBeenCalledWith('proj-big');
        expect(repo.getVersions('proj-big')).toEqual([]);
    });

    it('falls back to localStorage when IndexedDB is unavailable (graceful degrade)', () => {
        _disabled = true; // simulate no IDB
        const { store } = installBudgetedLocalStorage(50_000_000);
        const repo = new LocalVersionRepository();
        repo.saveVersions('proj-big', [makeVersion('v1', 200)]);

        // IDB never touched…
        expect(_putVersions).not.toHaveBeenCalled();
        // …the legacy localStorage path persisted it instead.
        expect(store.get(VERSIONS_KEY)).toBeTruthy();
        expect(repo.getVersions('proj-big').map(v => v.id)).toEqual(['v1']);
    });
});

describe('§VERSION-QUOTA-INDEXEDDB — saveVersionWithMeta keeps the index lean + version in IDB', () => {
    it('routes the version to IDB and still persists the project index to localStorage', () => {
        const { store } = installBudgetedLocalStorage(50_000_000);
        const repo = new LocalVersionRepository();
        const meta: ProjectMeta = { id: 'proj-big', name: 'Big', updatedAt: 1, versionCount: 1, ownerId: 'user-test' };
        repo.saveVersionWithMeta('proj-big', makeVersion('v1', 1_000), meta);

        // Version bytes → IDB.
        expect(_putVersions).toHaveBeenCalled();
        // Index (lightweight metadata) → localStorage, with the project present.
        const idx = JSON.parse(store.get(INDEX_KEY)!) as ProjectMeta[];
        expect(idx.some(m => m.id === 'proj-big')).toBe(true);
    });
});

describe('§VERSION-QUOTA-INDEXEDDB — ServerSyncQueue persists the queue to IndexedDB', () => {
    it('persistQueue routes the FULL queue to IDB (no byte-budget trim) when IDB is available', () => {
        installBudgetedLocalStorage(50_000_000);
        const q = new ServerSyncQueue();
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        // A single fat snapshot that would have exceeded the ~1.5 MB localStorage budget.
        const fat = {
            version: makeVersion('huge', 2_000_000), projectId: 'proj-big', attemptCount: 0, nextAttemptAt: Date.now(),
        };
        (q as any).queue = [fat];
        expect(() => (q as any).persistQueue()).not.toThrow();

        // Routed to IDB verbatim — the newest (only) item survived (old bug dropped it).
        expect(_putSyncQueue).toHaveBeenCalledTimes(1);
        const persisted = JSON.parse(_putSyncQueue.mock.calls[0][0]);
        expect(persisted[0].version.id).toBe('huge');
        q.dispose();
    });

    it('clears the IDB queue when the in-memory queue drains', () => {
        installBudgetedLocalStorage(50_000_000);
        const q = new ServerSyncQueue();
        (q as any).queue = [];
        (q as any).persistQueue();
        expect(_clearSyncQueue).toHaveBeenCalled();
        q.dispose();
    });
});
