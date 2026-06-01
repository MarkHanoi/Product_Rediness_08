// @vitest-environment happy-dom
//
// C27 INS-α-8 — buildModelElementLocations unit tests.
//
// Pure store-walker: project → building(s) → level(s) → apartment(s) →
// room(s) → elementInstance(s).  These tests validate the parent-chain
// shape and the defensive fallbacks when intermediate stores are
// missing / partially populated.

import { describe, it, expect } from 'vitest';
import {
    buildModelElementLocations,
    type BuildModelElementLocationsRuntime,
} from '../src/ui/inspect/buildModelElementLocations.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function listStore<T>(items: ReadonlyArray<T>): { list: () => ReadonlyArray<T> } {
    return { list: () => items };
}

function getAllStore<T>(items: ReadonlyArray<T>): { getAll: () => ReadonlyArray<T> } {
    return { getAll: () => items };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildModelElementLocations (C27 INS-α-8)', () => {
    it('empty runtime → only the project root', () => {
        const out = buildModelElementLocations({});
        // Project root + a synthetic building (ModelTree convention).
        // For an empty runtime we still emit project + synthetic building.
        expect(out.length).toBe(2);
        expect(out[0]!.kind).toBe('project');
        expect(out[0]!.elementId).toBe('project-root');
        expect(out[0]!.parentChain).toEqual([]);
        expect(out[1]!.kind).toBe('building');
    });

    it('uses projectContext.projectId when supplied', () => {
        const out = buildModelElementLocations({
            projectContext: { projectId: 'p-42', projectName: 'X' },
        });
        expect(out[0]!.elementId).toBe('p-42');
    });

    it('with levels → project + building + N levels', () => {
        const rt: BuildModelElementLocationsRuntime = {
            levelStore: listStore([
                { id: 'lvl-1', name: 'Ground' },
                { id: 'lvl-2', name: 'L1' },
            ]),
        };
        const out = buildModelElementLocations(rt);
        const kinds = out.map(l => l.kind);
        expect(kinds.filter(k => k === 'project').length).toBe(1);
        expect(kinds.filter(k => k === 'building').length).toBe(1);
        expect(kinds.filter(k => k === 'level').length).toBe(2);

        // Levels point at the building.
        const levels = out.filter(l => l.kind === 'level');
        for (const lv of levels) {
            // parentChain = [project, building]
            expect(lv.parentChain.length).toBe(2);
            expect(lv.parentChain[0]!.kind).toBe('project');
            expect(lv.parentChain[1]!.kind).toBe('building');
        }
    });

    it('with apartments → +N apartments under levels', () => {
        const rt: BuildModelElementLocationsRuntime = {
            levelStore: listStore([{ id: 'lvl-1', name: 'Ground' }]),
            apartmentParametersStore: listStore([
                { id: 'apt-1', levelId: 'lvl-1' },
                { id: 'apt-2', levelId: 'lvl-1' },
            ]),
        };
        const out = buildModelElementLocations(rt);
        const apts = out.filter(l => l.kind === 'apartment');
        expect(apts.length).toBe(2);
        // parentChain = [project, building, level]
        for (const a of apts) {
            expect(a.parentChain.length).toBe(3);
            expect(a.parentChain.map(p => p.kind)).toEqual(['project', 'building', 'level']);
            expect(a.parentChain[2]!.id).toBe('lvl-1');
        }
    });

    it('with rooms → +N rooms under apartments or levels', () => {
        const rt: BuildModelElementLocationsRuntime = {
            levelStore: listStore([{ id: 'lvl-1' }]),
            apartmentParametersStore: listStore([
                { id: 'apt-1', levelId: 'lvl-1' },
            ]),
            roomStore: getAllStore([
                { id: 'room-a', apartmentId: 'apt-1' },   // under apartment
                { id: 'room-b', levelId: 'lvl-1' },        // under level (no apartment)
            ]),
        };
        const out = buildModelElementLocations(rt);
        const rooms = out.filter(l => l.kind === 'room');
        expect(rooms.length).toBe(2);

        const ra = rooms.find(r => r.elementId === 'room-a')!;
        expect(ra.parentChain.map(p => p.kind)).toEqual(['project', 'building', 'level', 'apartment']);

        const rb = rooms.find(r => r.elementId === 'room-b')!;
        expect(rb.parentChain.map(p => p.kind)).toEqual(['project', 'building', 'level']);
    });

    it('parentId chain is project ← building ← level ← apartment ← room ← element', () => {
        const rt: BuildModelElementLocationsRuntime = {
            projectContext: { projectId: 'proj-1' },
            levelStore: listStore([{ id: 'lvl-1' }]),
            apartmentParametersStore: listStore([{ id: 'apt-1', levelId: 'lvl-1' }]),
            roomStore: getAllStore([{ id: 'room-a', apartmentId: 'apt-1' }]),
            elementStore: getAllStore([{ id: 'wall-x', roomId: 'room-a' }]),
        };
        const out = buildModelElementLocations(rt);
        const elem = out.find(l => l.elementId === 'wall-x')!;
        expect(elem.kind).toBe('elementInstance');
        const chainKinds = elem.parentChain.map(p => p.kind);
        const chainIds = elem.parentChain.map(p => p.id);
        expect(chainKinds).toEqual(['project', 'building', 'level', 'apartment', 'room']);
        expect(chainIds[0]).toBe('proj-1');
        expect(chainIds[2]).toBe('lvl-1');
        expect(chainIds[3]).toBe('apt-1');
        expect(chainIds[4]).toBe('room-a');
    });

    it('missing stores do not throw (defensive)', () => {
        expect(() => buildModelElementLocations({
            // Every store missing.  Should still emit project + synthetic building.
        })).not.toThrow();

        // Stores that throw on probe are tolerated.
        const badStore = {
            list: () => { throw new Error('boom'); },
            getAll: () => { throw new Error('boom'); },
        };
        expect(() => buildModelElementLocations({
            levelStore: badStore,
            roomStore: badStore,
            apartmentParametersStore: badStore,
            buildingStore: badStore,
        })).not.toThrow();
    });

    it('explicit buildingStore drives building ids (no synthetic)', () => {
        const rt: BuildModelElementLocationsRuntime = {
            buildingStore: listStore([{ id: 'bld-A' }, { id: 'bld-B' }]),
            levelStore: listStore([{ id: 'lvl-1', buildingId: 'bld-B' }]),
        };
        const out = buildModelElementLocations(rt);
        const buildings = out.filter(l => l.kind === 'building');
        expect(buildings.map(b => b.elementId)).toEqual(['bld-A', 'bld-B']);
        const lvl = out.find(l => l.kind === 'level')!;
        // parentChain[1] = building entry — must be bld-B (matches level.buildingId).
        expect(lvl.parentChain[1]!.id).toBe('bld-B');
    });

    it('apartments without a valid levelId fall under the first level', () => {
        const rt: BuildModelElementLocationsRuntime = {
            levelStore: listStore([{ id: 'lvl-1' }, { id: 'lvl-2' }]),
            apartmentParametersStore: listStore([
                { id: 'apt-1' }, // no levelId
                { id: 'apt-2', levelId: 'lvl-2' },
            ]),
        };
        const out = buildModelElementLocations(rt);
        const apts = out.filter(l => l.kind === 'apartment');
        const a1 = apts.find(a => a.elementId === 'apt-1')!;
        const a2 = apts.find(a => a.elementId === 'apt-2')!;
        expect(a1.parentChain[2]!.id).toBe('lvl-1');
        expect(a2.parentChain[2]!.id).toBe('lvl-2');
    });
});
