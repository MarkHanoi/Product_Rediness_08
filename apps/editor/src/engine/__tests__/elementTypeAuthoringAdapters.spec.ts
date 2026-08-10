// @vitest-environment happy-dom
//
// §FEAT-HOSTED-TYPE-AUTHORING (C65) — the elementType.* command machinery behind
// "Duplicate Type… / New Type…" for door and window, exercised against the REAL
// geometry-door / geometry-window singleton stores (the ones persistence and the
// builders read), not mocks — reachability is the thing under test.

import { describe, it, expect, afterEach } from 'vitest';
import { doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowSystemTypeStore } from '@pryzm/geometry-window';
import {
    resolveTypeStoreAdapter,
    validateElementTypeCommand,
    performElementTypeAuthoring,
} from '../elementTypeAuthoringAdapters';

afterEach(() => {
    // The stores are module singletons; leave only factory built-ins behind.
    doorSystemTypeStore.clearCustomTypes();
    windowSystemTypeStore.clearCustomTypes();
});

/** A draft as the UI builds it: whole source record minus identity. */
function draftFrom(record: Record<string, any>, name: string): Record<string, any> {
    const { id: _i, isBuiltIn: _b, metadata: _m, ...rest } = structuredClone(record);
    return { ...rest, name };
}

describe('resolveTypeStoreAdapter', () => {
    it('resolves door and window; refuses undeclared families', () => {
        expect(resolveTypeStoreAdapter('door')).not.toBeNull();
        expect(resolveTypeStoreAdapter('window')).not.toBeNull();
        expect(resolveTypeStoreAdapter('WINDOW')).not.toBeNull(); // normalised
        expect(resolveTypeStoreAdapter('stair')).toBeNull();
        expect(resolveTypeStoreAdapter(undefined)).toBeNull();
    });

    it('normalises isBuiltIn (a FIELD on hosted stores) to the method shape', () => {
        const door = resolveTypeStoreAdapter('door')!;
        expect(door.isBuiltIn('dt-solid-timber')).toBe(true);
        expect(door.isBuiltIn('nonexistent')).toBe(false);
    });
});

describe('validateElementTypeCommand (CA-3 — validate before mutate)', () => {
    it('rejects an undeclared family with a sentence, not a silent no-op', () => {
        const err = validateElementTypeCommand({ family: 'roof', draft: { name: 'x' } }, 'create');
        expect(err).toMatch(/cannot be authored/);
    });

    it('rejects a door draft missing a required finish slot', () => {
        const base = doorSystemTypeStore.getById('dt-solid-timber')!;
        const draft = draftFrom(base, 'No Leaf');
        delete draft.leafFinish;
        expect(validateElementTypeCommand({ family: 'door', draft }, 'create'))
            .toMatch(/leafFinish/);
    });

    it('rejects a window draft whose glazingOpacity is out of range', () => {
        const base = windowSystemTypeStore.getById('wt-single-pane')!;
        const draft = { ...draftFrom(base, 'Bad Glazing'), glazingOpacity: 2 };
        expect(validateElementTypeCommand({ family: 'window', draft }, 'create'))
            .toMatch(/glazingOpacity/);
    });

    it('refuses to update OR delete a built-in — duplicate is the offered path', () => {
        for (const mode of ['update', 'delete'] as const) {
            const err = validateElementTypeCommand(
                { family: 'door', typeId: 'dt-solid-timber', draft: draftFrom(doorSystemTypeStore.getById('dt-solid-timber')!, 'x') },
                mode,
            );
            expect(err, mode).toMatch(/built-in types cannot be edited or deleted/);
        }
    });

    it('accepts a valid duplicate draft', () => {
        const base = doorSystemTypeStore.getById('dt-solid-timber')!;
        expect(validateElementTypeCommand(
            { family: 'door', draft: draftFrom(base, 'Solid Timber (Copy)') }, 'duplicate',
        )).toBeNull();
    });
});

describe('performElementTypeAuthoring — duplicate (C65 §3.7)', () => {
    it('mints a FRESH id — a duplicate never aliases its source', () => {
        const source = doorSystemTypeStore.getById('dt-solid-timber')!;
        const { created } = performElementTypeAuthoring('duplicate', {
            family: 'door', draft: draftFrom(source, 'Solid Timber (Copy)'),
        })!;
        expect(created.id).toBeTruthy();
        expect(created.id).not.toBe(source.id);
        expect(created.id.startsWith('dt-custom')).toBe(true);
        expect(created.isBuiltIn).toBe(false);
        expect(created.metadata.createdBy).toBe('user');
        // Reachability: the record is IN the real store the builders read.
        expect(doorSystemTypeStore.getById(created.id)?.name).toBe('Solid Timber (Copy)');
    });

    it('is a DEEP copy — mutable structure is not shared with the source', () => {
        const source = doorSystemTypeStore.getById('dt-glazed-timber')!;
        const { created } = performElementTypeAuthoring('duplicate', {
            family: 'door', draft: draftFrom(source, 'Glazed (Copy)'),
        })!;
        expect(created.frameFinish).not.toBe(source.frameFinish);
        expect(created.defaultSegments).not.toBe(source.defaultSegments);
        // Ride-along fields survive the copy verbatim (no lossy re-entry form).
        expect(created.defaultSegments).toEqual(source.defaultSegments);
        expect(created.glazingOpacity).toBe(source.glazingOpacity);
        expect(created.dimensions).toEqual(source.dimensions);
    });

    it('duplicates a WINDOW type through the same machinery (no second code path)', () => {
        const source = windowSystemTypeStore.getById('wt-single-pane')!;
        const { created } = performElementTypeAuthoring('duplicate', {
            family: 'window', draft: draftFrom(source, 'Single Pane (Copy)'),
        })!;
        expect(created.id.startsWith('wt-custom')).toBe(true);
        expect(created.sillFinish).toEqual(source.sillFinish);
        expect(windowSystemTypeStore.getById(created.id)?.isBuiltIn).toBe(false);
    });
});

describe('performElementTypeAuthoring — create / undo material (CA-11)', () => {
    it('creates a new door type from a minimal draft', () => {
        const { created } = performElementTypeAuthoring('create', {
            family: 'door',
            draft: {
                name: 'Custom Door Type',
                frameFinish: { name: 'Frame', materialColor: '#112233' },
                leafFinish:  { name: 'Leaf',  materialColor: '#445566' },
                glazingOpacity: 1,
            },
        })!;
        expect(created.category).toBe('custom');
        expect(doorSystemTypeStore.getById(created.id)?.frameFinish.materialColor).toBe('#112233');
    });

    it('undo of create is remove; undo of delete restores the SAME id (no dangling refs)', () => {
        const source = doorSystemTypeStore.getById('dt-solid-timber')!;
        const { adapter, created } = performElementTypeAuthoring('duplicate', {
            family: 'door', draft: draftFrom(source, 'To Be Undone'),
        })!;
        // Undo of create.
        adapter.remove(created.id);
        expect(doorSystemTypeStore.getById(created.id)).toBeUndefined();

        // Delete of a custom type, then undo → SAME id resolves again (C65 §3.4).
        const { created: again } = performElementTypeAuthoring('duplicate', {
            family: 'door', draft: draftFrom(source, 'Deleted Then Restored'),
        })!;
        const { previous } = performElementTypeAuthoring('delete', {
            family: 'door', typeId: again.id,
        })!;
        expect(doorSystemTypeStore.getById(again.id)).toBeUndefined();
        adapter.restore(previous);
        expect(doorSystemTypeStore.getById(again.id)?.name).toBe('Deleted Then Restored');
    });
});
