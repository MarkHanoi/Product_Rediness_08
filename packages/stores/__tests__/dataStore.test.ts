// @vitest-environment happy-dom
//
// C28 DAT-α-2 (Data Panel & Automation) — DataStore tests.
//
// Verifies the L3 state container wrapping the L0 data-panel substrate
// from `@pryzm/schemas/data`. Covers the public surface declared in the
// DAT-α-2 contract:
//   • Initial state matches the documented default.
//   • setFilter / setSort / setGroupBy / setSelectedRows replace state
//     and fire subscribers.
//   • Invalid inputs throw via the underlying Zod schemas (the L0
//     substrate is the truth — P5).
//   • Snapshot returned by get() is frozen and isolated from external
//     mutation.
//   • clearSelection / reset round-trip + subscriber accounting.
//   • subscribe() returns an unsubscribe disposer; multiple listeners
//     all fire; throwing listeners do not starve siblings.
//   • dispose() teardown semantics.
//
// `happy-dom` matches the convention used by sibling store tests.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
    DataStore,
    createDataStore,
    type DataStoreState,
} from '../src/DataStore.js';
import type {
    DataFilter,
    DataSort,
    DataGroupBy,
} from '@pryzm/schemas';

describe('DataStore (C28 DAT-α-2)', () => {
    let store: DataStore;

    beforeEach(() => { store = createDataStore(); });
    afterEach(() => { vi.restoreAllMocks(); });

    // ── initial state ───────────────────────────────────────────────────

    it('initial state matches the documented default', () => {
        const s = store.get();
        expect(s.filter).toEqual({});
        expect(s.sort).toEqual([]);
        expect(s.groupBy).toBeUndefined();
        expect(s.selectedRowIds).toEqual([]);
    });

    it('createDataStore() returns a DataStore instance', () => {
        expect(store).toBeInstanceOf(DataStore);
    });

    // ── setFilter ───────────────────────────────────────────────────────

    it('setFilter replaces the filter and notifies subscribers', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        const filter: DataFilter = {
            type: ['wall', 'door'],
            level: ['L1'],
            parameterFilters: [{ paramName: 'height', op: 'gte', value: 2.4 }],
        };
        store.setFilter(filter);
        expect(store.get().filter).toEqual(filter);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('setFilter with invalid parameter-filter operator throws (Zod)', () => {
        const bad = {
            parameterFilters: [{ paramName: 'height', op: 'bogus', value: 1 }],
        } as unknown as DataFilter;
        expect(() => store.setFilter(bad)).toThrow();
        // Mutation did NOT happen.
        expect(store.get().filter).toEqual({});
    });

    it('setFilter with empty paramName throws (Zod min(1))', () => {
        const bad = {
            parameterFilters: [{ paramName: '', op: 'eq', value: 1 }],
        } as unknown as DataFilter;
        expect(() => store.setFilter(bad)).toThrow();
    });

    it('setFilter snapshot is frozen — external mutation cannot leak in', () => {
        const filter: DataFilter = { type: ['wall'] };
        store.setFilter(filter);
        const snap = store.get();
        // Attempting to mutate the frozen snapshot fails silently in
        // sloppy mode and throws in strict mode (vitest runs strict).
        expect(() => {
            (snap as { filter: DataFilter }).filter = { type: ['door'] };
        }).toThrow();
        expect(store.get().filter).toEqual({ type: ['wall'] });
    });

    // ── setSort ─────────────────────────────────────────────────────────

    it('setSort accepts an empty array', () => {
        store.setSort([]);
        expect(store.get().sort).toEqual([]);
    });

    it('setSort accepts a multi-column spec', () => {
        const sort: DataSort = [
            { column: 'type', direction: 'asc' },
            { column: 'level', direction: 'desc' },
            { column: 'name', direction: 'asc' },
        ];
        store.setSort(sort);
        expect(store.get().sort).toEqual(sort);
    });

    it('setSort rejects an unknown direction', () => {
        const bad = [{ column: 'type', direction: 'sideways' }] as unknown as DataSort;
        expect(() => store.setSort(bad)).toThrow();
        expect(store.get().sort).toEqual([]);
    });

    // ── setGroupBy ──────────────────────────────────────────────────────

    it('setGroupBy accepts each documented enum value', () => {
        const values: DataGroupBy[] = ['type', 'level', 'apartment', 'room', 'custom-field'];
        for (const v of values) {
            store.setGroupBy(v);
            expect(store.get().groupBy).toBe(v);
        }
    });

    it('setGroupBy(undefined) clears the group-by', () => {
        store.setGroupBy('type');
        expect(store.get().groupBy).toBe('type');
        store.setGroupBy(undefined);
        expect(store.get().groupBy).toBeUndefined();
    });

    it('setGroupBy rejects unknown values', () => {
        expect(() => store.setGroupBy('bogus' as DataGroupBy)).toThrow();
        expect(store.get().groupBy).toBeUndefined();
    });

    // ── setSelectedRows / clearSelection ────────────────────────────────

    it('setSelectedRows replaces the selection', () => {
        store.setSelectedRows(['e-1', 'e-2', 'e-3']);
        expect(store.get().selectedRowIds).toEqual(['e-1', 'e-2', 'e-3']);
        store.setSelectedRows(['e-9']);
        expect(store.get().selectedRowIds).toEqual(['e-9']);
    });

    it('setSelectedRows defensively clones the input array', () => {
        const ids = ['e-1', 'e-2'];
        store.setSelectedRows(ids);
        // Mutating the caller's array MUST NOT leak into the store.
        ids.push('e-3');
        expect(store.get().selectedRowIds).toEqual(['e-1', 'e-2']);
    });

    it('clearSelection empties the selection + fires subscribers', () => {
        store.setSelectedRows(['e-1']);
        const fn = vi.fn();
        store.subscribe(fn);
        store.clearSelection();
        expect(store.get().selectedRowIds).toEqual([]);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('clearSelection on already-empty selection is a no-op', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        store.clearSelection();
        expect(fn).not.toHaveBeenCalled();
    });

    // ── reset ───────────────────────────────────────────────────────────

    it('reset() returns to the initial state', () => {
        store.setFilter({ type: ['wall'] });
        store.setSort([{ column: 'name', direction: 'asc' }]);
        store.setGroupBy('level');
        store.setSelectedRows(['e-1']);
        store.reset();
        const s = store.get();
        expect(s.filter).toEqual({});
        expect(s.sort).toEqual([]);
        expect(s.groupBy).toBeUndefined();
        expect(s.selectedRowIds).toEqual([]);
    });

    // ── subscribe / lifecycle ───────────────────────────────────────────

    it('subscribe() returns an unsubscribe function that stops callbacks', () => {
        const fn = vi.fn();
        const unsub = store.subscribe(fn);
        store.setFilter({ type: ['wall'] });
        expect(fn).toHaveBeenCalledTimes(1);
        unsub();
        store.setFilter({ type: ['door'] });
        expect(fn).toHaveBeenCalledTimes(1); // unchanged after unsubscribe
    });

    it('multiple subscribers all fire on a single setFilter', () => {
        const a = vi.fn();
        const b = vi.fn();
        const c = vi.fn();
        store.subscribe(a);
        store.subscribe(b);
        store.subscribe(c);
        store.setFilter({ type: ['wall'] });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        expect(c).toHaveBeenCalledTimes(1);
    });

    it('subscriber receives the fresh snapshot as its argument', () => {
        let received: DataStoreState | undefined;
        store.subscribe((s) => { received = s; });
        store.setGroupBy('apartment');
        expect(received?.groupBy).toBe('apartment');
    });

    it('a throwing listener does not starve the others', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const a = vi.fn(() => { throw new Error('boom'); });
        const b = vi.fn();
        store.subscribe(a);
        store.subscribe(b);
        store.setFilter({ type: ['wall'] });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        expect(errSpy).toHaveBeenCalled();
    });

    // ── round-trip ──────────────────────────────────────────────────────

    it('round-trip: set / read / set / read each field', () => {
        store.setFilter({ type: ['wall'] });
        expect(store.get().filter).toEqual({ type: ['wall'] });
        store.setSort([{ column: 'level', direction: 'desc' }]);
        expect(store.get().sort).toEqual([{ column: 'level', direction: 'desc' }]);
        store.setGroupBy('room');
        expect(store.get().groupBy).toBe('room');
        store.setSelectedRows(['e-1', 'e-2']);
        expect(store.get().selectedRowIds).toEqual(['e-1', 'e-2']);
        // Now overwrite each field and re-read.
        store.setFilter({ type: ['door'] });
        expect(store.get().filter).toEqual({ type: ['door'] });
        store.setSort([]);
        expect(store.get().sort).toEqual([]);
        store.setGroupBy(undefined);
        expect(store.get().groupBy).toBeUndefined();
        store.setSelectedRows([]);
        expect(store.get().selectedRowIds).toEqual([]);
    });

    // ── dispose ─────────────────────────────────────────────────────────

    it('setters after dispose() warn and are no-ops', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        store.dispose();
        store.setFilter({ type: ['wall'] });
        store.setSort([{ column: 'name', direction: 'asc' }]);
        store.setGroupBy('type');
        store.setSelectedRows(['e-1']);
        store.reset();
        // All five setters warned; state stays empty (dispose reset it).
        expect(warnSpy).toHaveBeenCalled();
        const s = store.get();
        expect(s.filter).toEqual({});
        expect(s.sort).toEqual([]);
        expect(s.groupBy).toBeUndefined();
        expect(s.selectedRowIds).toEqual([]);
    });

    it('subscribe() after dispose returns a no-op disposer', () => {
        store.dispose();
        const unsub = store.subscribe(() => {});
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
    });

    it('dispose() is idempotent', () => {
        store.dispose();
        expect(() => store.dispose()).not.toThrow();
    });
});
