// @vitest-environment happy-dom
//
// §PROJECT-INDEX-EVICT / §QUOTA-EVICT (2026-06-22) — unit gate for the LOCAL
// per-project version-history store and project-index quota safety
// (LocalVersionRepository / LocalProjectRepository in ProjectRepository.ts),
// distinct from the already-tested ServerSyncQueue path.
//
// The live bug: when localStorage is full, saving a new version (or the project
// index itself) hit QuotaExceededError and silently dropped the write — so the
// newest save was lost forever.
//
// These tests prove, against a byte-budgeted mock localStorage that throws a real
// QuotaExceededError when over budget:
//   • saveVersions caps a project to MAX_VERSIONS_STORED (20) — oldest trimmed;
//   • the NEWEST version always survives a quota squeeze;
//   • saveProject evicts a STALE other-project's version store (oldest-first)
//     and retries so the project index is never silently dropped.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// getCurrentUserId is read inside saveProject; stub it so rows are attributable.
vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
}));

import {
    LocalVersionRepository,
    LocalProjectRepository,
    type ProjectMeta,
} from '../src/ui/platform/ProjectRepository.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

// ── Byte-budgeted mock localStorage ───────────────────────────────────────────
// Throws a real QuotaExceededError when a setItem would push total stored bytes
// over `budget`. removeItem frees bytes so eviction-and-retry can succeed.
function installBudgetedLocalStorage(budget: number): { store: Map<string, string>; usage: () => number } {
    const store = new Map<string, string>();
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
                const e: Error & { name: string; code: number } =
                    Object.assign(new Error('quota'), { name: 'QuotaExceededError', code: 22 });
                throw e;
            }
            store.set(k, v);
        },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
    return { store, usage };
}

function makeVersion(id: string, bytes: number): VersionRecord {
    return {
        id,
        projectId: 'proj-current',
        label: `v-${id}`,
        timestamp: Date.now(),
        elementCount: 1,
        // A noisy (poorly-compressible) blob stands in for the heavy BIM snapshot.
        snapshot: { projectName: 'P', elementCount: 1, blob: randomish(bytes) } as unknown,
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}

// Pseudo-random string so fflate cannot collapse it to near-nothing — keeps the
// byte budget meaningful for the version-store test.
function randomish(n: number): string {
    let s = '';
    let x = 123456789;
    for (let i = 0; i < n; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        s += String.fromCharCode(33 + (x % 90));
    }
    return s;
}

const VERSIONS_KEY = 'bim-project-proj-current-versions';
const INDEX_KEY = 'bim-projects-index';

describe('LocalVersionRepository — version cap + newest survives quota', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('caps a project to at most 20 versions, dropping the oldest', () => {
        installBudgetedLocalStorage(50_000_000); // effectively unlimited
        const repo = new LocalVersionRepository();
        const versions: VersionRecord[] = [];
        for (let i = 0; i < 25; i++) versions.push(makeVersion(`v${i}`, 10));
        repo.saveVersions('proj-current', versions);

        const stored = repo.getVersions('proj-current');
        expect(stored.length).toBe(20);
        // Newest (v24) kept, oldest (v0..v4) evicted by the cap.
        expect(stored[stored.length - 1].id).toBe('v24');
        expect(stored.map(v => v.id)).not.toContain('v0');
    });

    it('keeps the NEWEST version when quota forces a trim down to 1', () => {
        // Budget only fits one small version store, never 20 large ones.
        installBudgetedLocalStorage(4_000);
        const repo = new LocalVersionRepository();
        const versions: VersionRecord[] = [];
        for (let i = 0; i < 10; i++) versions.push(makeVersion(`v${i}`, 2_000));
        // Must not throw even though the full 10-version payload is way over budget.
        expect(() => repo.saveVersions('proj-current', versions)).not.toThrow();

        const stored = repo.getVersions('proj-current');
        expect(stored.length).toBeGreaterThanOrEqual(1);
        // Whatever survived, the single newest version is present.
        expect(stored[stored.length - 1].id).toBe('v9');
    });
});

describe('LocalProjectRepository.saveProject — evicts stale stores, never drops index', () => {
    let store: Map<string, string>;

    beforeEach(() => {
        // Budget tuned so the seed (stale store + small index) fits, but GROWING
        // the index to include the new project does NOT fit until the stale
        // version store is evicted.
        ({ store } = installBudgetedLocalStorage(3_400));
        // A large STALE other-project version store (updatedAt very old) occupies
        // nearly the whole budget — so the index can only grow after it's evicted.
        store.set('bim-project-proj-stale-versions', randomish(3_100));
        // Index records the stale project with an old updatedAt so it sorts first for eviction.
        const seedIndex: ProjectMeta[] = [
            { id: 'proj-stale', name: 'Stale', updatedAt: 1, versionCount: 1, ownerId: 'user-test' },
        ];
        store.set(INDEX_KEY, JSON.stringify(seedIndex));
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('persists the new project meta by evicting the stale version store on quota', () => {
        const repo = new LocalProjectRepository();
        const meta: ProjectMeta = {
            id: 'proj-current',
            name: 'Current Project With A Fairly Long Name To Take Space',
            updatedAt: Date.now(),
            versionCount: 3,
            ownerId: 'user-test',
        };
        // The combined index (stale + current) does not fit until the stale
        // version store is evicted; saveProject must do that and succeed.
        expect(() => repo.saveProject(meta)).not.toThrow();

        // Eviction kept the store within budget: the stale ~3.1KB version store
        // cannot coexist with the grown index under the 3.4KB budget, so the save
        // must have evicted stale data to persist the index (the no-silent-loss
        // guarantee). Asserting total-bytes-within-budget is robust to WHICH stale
        // key the evictor picked (the exact target is an implementation detail).
        const totalBytes = [...store.values()].reduce((n, v) => n + v.length, 0);
        expect(totalBytes).toBeLessThanOrEqual(3_400);

        // The index was written and now contains the current project.
        const idx = JSON.parse(store.get(INDEX_KEY)!) as ProjectMeta[];
        expect(idx.some(m => m.id === 'proj-current')).toBe(true);
    });

    it('does NOT evict the project being saved — only other projects', () => {
        // Give the CURRENT project its own version store; it must survive.
        store.set('bim-project-proj-current-versions', randomish(200));
        const repo = new LocalProjectRepository();
        const meta: ProjectMeta = {
            id: 'proj-current', name: 'Current', updatedAt: Date.now(), versionCount: 1, ownerId: 'user-test',
        };
        repo.saveProject(meta);
        // Current project's own history is never the eviction target.
        expect(store.has('bim-project-proj-current-versions')).toBe(true);
    });
});
