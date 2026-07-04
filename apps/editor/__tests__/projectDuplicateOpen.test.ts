// @vitest-environment happy-dom
//
// §FIX-PROJECT-DUPLICATE-OPEN (L-81) — a duplicated project must open with the
// SOURCE's elements, not empty. The live bug: duplicating a project created a new
// id + metadata but copied NO snapshot, so the local-first open path
// (PlatformShell.setProjectContext → versionRepository.getVersions(newId)) found
// nothing and fell through to GET /latest-version, which 404'd / returned empty →
// the duplicate opened broken.
//
// This gate proves the LOCAL half of the fix: LocalVersionRepository.duplicateInto
// deep-copies the source's latest snapshot under the new id so getVersions(newId)
// yields a loadable version carrying the source's elements. (The SERVER half —
// projectStore.duplicateProject copying the version row — is guarded separately in
// server/projectStore.test.js.)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// getCurrentUserId is read by saveProject/listProjects; stub it so the module's
// import graph stays light and rows are attributable.
vi.mock('@pryzm/core-app-model', () => ({
    getCurrentUserId: () => 'user-test',
}));

import { LocalVersionRepository } from '../src/ui/platform/ProjectRepository.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

function installLocalStorage(): Map<string, string> {
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
    return store;
}

function makeSourceVersion(projectId: string): VersionRecord {
    return {
        id: 'ver-src-1',
        projectId,
        label: 'Source v1',
        timestamp: 1_700_000_000_000,
        elementCount: 2,
        snapshot: {
            projectId,
            projectName: 'Source',
            elementCount: 2,
            walls: [{ id: 'wall-a' }, { id: 'wall-b' }],
            slabs: [], furniture: [], levels: [], grids: [], columns: [],
            stairs: [], beams: [], curtainWalls: [], roofs: [], handrails: [],
            plumbing: [], windows: [], doors: [],
            viewDefinitions: [], visibilityRules: [], semanticIndex: {}, vgGovernance: {},
            sheets: [], schedules: [], schemaVersion: 1,
        } as unknown as VersionRecord['snapshot'],
        syncStatus: 'synced',
    };
}

describe('§FIX-PROJECT-DUPLICATE-OPEN — LocalVersionRepository.duplicateInto', () => {
    beforeEach(() => { installLocalStorage(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('copies the source latest snapshot under the new id so the duplicate is loadable', () => {
        const repo = new LocalVersionRepository();
        repo.saveVersions('proj-source', [makeSourceVersion('proj-source')]);

        const copied = repo.duplicateInto('proj-source', 'proj-copy', 'Source (copy)');
        expect(copied).toBe(1);

        // The duplicate has a loadable latest version under its NEW id.
        const dup = repo.getVersions('proj-copy');
        expect(dup.length).toBe(1);
        const latest = dup[dup.length - 1]!;

        // Snapshot carries the SOURCE's elements.
        expect((latest.snapshot as unknown as { walls: { id: string }[] }).walls.map(w => w.id))
            .toEqual(['wall-a', 'wall-b']);
        expect(latest.elementCount).toBe(2);

        // Record + embedded snapshot are re-keyed to the target (not the source).
        expect(latest.projectId).toBe('proj-copy');
        expect(latest.snapshot.projectId).toBe('proj-copy');
        expect(latest.snapshot.projectName).toBe('Source (copy)');
        // New, distinct version id (no collision with the source's version row).
        expect(latest.id).not.toBe('ver-src-1');
    });

    it('does not mutate the source project history', () => {
        const repo = new LocalVersionRepository();
        repo.saveVersions('proj-source', [makeSourceVersion('proj-source')]);
        repo.duplicateInto('proj-source', 'proj-copy', 'Source (copy)');

        const src = repo.getVersions('proj-source');
        expect(src.length).toBe(1);
        expect(src[0]!.projectId).toBe('proj-source');
        expect(src[0]!.snapshot.projectId).toBe('proj-source');
        expect(src[0]!.id).toBe('ver-src-1');
    });

    it('returns 0 and writes nothing when the source has no local history', () => {
        const repo = new LocalVersionRepository();
        const copied = repo.duplicateInto('proj-empty', 'proj-copy', 'Empty (copy)');
        expect(copied).toBe(0);
        expect(repo.getVersions('proj-copy')).toEqual([]);
    });
});
