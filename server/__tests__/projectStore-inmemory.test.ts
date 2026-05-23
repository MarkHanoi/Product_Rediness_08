/**
 * projectStore-inmemory.test.ts — §STORE-UNIFY (2026-05-23)
 *
 * Locks in the in-memory PROJECT accessors that made `_inMemoryProjects` the
 * single in-memory project authority (server.js's `_projects` map was removed
 * and its v0 routes now delegate here). These accessors are the unverifiable-by-
 * hand core of the store unification, so they get a real unit test:
 *   - the v0 shape translation ({id,name,updatedAt:<ms>,versionCount,ownerId})
 *   - owner-scoped listing
 *   - create-or-update semantics
 *   - idempotent delete
 *   - version-save bookkeeping (mutates the real row, not a copy)
 *   - the canUserAccessProject Map-like adapter
 *
 * Runs in the no-pool path (no DATABASE_URL in the test env), which is exactly
 * the in-memory authority these accessors own.
 */

import { describe, it, expect } from 'vitest';
import {
    imGetProject,
    imListProjects,
    imUpsertProject,
    imDeleteProject,
    imRecordVersionSave,
    imProjectsMapAdapter,
} from '../projectStore.js';

// Unique ids per test so the module-global map never cross-contaminates.
let _seq = 0;
const uid = (p: string) => `${p}-${Date.now()}-${(_seq++).toString(36)}`;

describe('§STORE-UNIFY in-memory project accessors', () => {
    it('imUpsertProject creates a row and imGetProject returns the v0 shape', () => {
        const id = uid('proj');
        const owner = uid('user');
        const created = imUpsertProject(id, 'My Project', owner);

        // Returned shape == v0 shape the unversioned routes expect.
        expect(created).toEqual({
            id,
            name: 'My Project',
            updatedAt: expect.any(Number),
            versionCount: 0,
            ownerId: owner,
        });

        const got = imGetProject(id);
        expect(got).not.toBeNull();
        expect(got!.id).toBe(id);
        expect(got!.ownerId).toBe(owner);
        expect(got!.versionCount).toBe(0);
        expect(typeof got!.updatedAt).toBe('number');
    });

    it('imGetProject returns null for an unknown id', () => {
        expect(imGetProject(uid('proj'))).toBeNull();
    });

    it('imUpsertProject on an existing id updates the name and keeps identity', () => {
        const id = uid('proj');
        const owner = uid('user');
        imUpsertProject(id, 'First', owner);
        const updated = imUpsertProject(id, 'Renamed', owner);
        expect(updated!.id).toBe(id);
        expect(updated!.name).toBe('Renamed');
        expect(updated!.ownerId).toBe(owner);
        expect(imGetProject(id)!.name).toBe('Renamed');
    });

    it('imGetProject returns an independent copy (mutating it does not corrupt the store)', () => {
        const id = uid('proj');
        const owner = uid('user');
        imUpsertProject(id, 'Snapshot', owner);
        const a = imGetProject(id)!;
        a.name = 'mutated-copy';
        a.versionCount = 999;
        expect(imGetProject(id)!.name).toBe('Snapshot');
        expect(imGetProject(id)!.versionCount).toBe(0);
    });

    it('imListProjects is owner-scoped and excludes other owners', () => {
        const ownerA = uid('userA');
        const ownerB = uid('userB');
        const a1 = uid('proj'); const a2 = uid('proj'); const b1 = uid('proj');
        imUpsertProject(a1, 'A1', ownerA);
        imUpsertProject(a2, 'A2', ownerA);
        imUpsertProject(b1, 'B1', ownerB);

        const listA = imListProjects(ownerA).map(p => p.id);
        expect(listA).toContain(a1);
        expect(listA).toContain(a2);
        expect(listA).not.toContain(b1);
        expect(imListProjects(ownerA).every(p => p.ownerId === ownerA)).toBe(true);
    });

    it('imDeleteProject removes the row and is idempotent', () => {
        const id = uid('proj');
        const owner = uid('user');
        imUpsertProject(id, 'ToDelete', owner);
        expect(imDeleteProject(id)).toBe(true);   // removed
        expect(imGetProject(id)).toBeNull();
        expect(imDeleteProject(id)).toBe(false);  // already absent — harmless no-op
    });

    it('imRecordVersionSave bumps versionCount on the real row (not a copy)', () => {
        const id = uid('proj');
        const owner = uid('user');
        imUpsertProject(id, 'Saver', owner);
        imRecordVersionSave(id, 3, 42);
        const got = imGetProject(id)!;
        expect(got.versionCount).toBe(3);
        // a second save advances it again
        imRecordVersionSave(id, 4, 50);
        expect(imGetProject(id)!.versionCount).toBe(4);
    });

    it('imRecordVersionSave on an unknown id is a harmless no-op', () => {
        expect(() => imRecordVersionSave(uid('proj'), 1, 1)).not.toThrow();
    });

    it('imProjectsMapAdapter.get exposes .ownerId for canUserAccessProject', () => {
        const id = uid('proj');
        const owner = uid('user');
        imUpsertProject(id, 'Access', owner);
        const row = imProjectsMapAdapter.get(id);
        expect(row).not.toBeNull();
        expect(row!.ownerId).toBe(owner);
        expect(imProjectsMapAdapter.get(uid('proj'))).toBeNull();
    });
});
