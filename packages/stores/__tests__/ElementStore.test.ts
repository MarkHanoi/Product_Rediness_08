// ElementStore.test.ts — ADR-048 · Task 4.3
//
// Integration tests for ElementStore: LRU eviction → IDB write → getAsync cache-miss restore.
//
// Coverage:
//   • applyPatch: root add / replace / remove
//   • applyPatch: nested field update (Immer path)
//   • DirtyDiff emission to subscribers
//   • Capacity enforcement: eviction fires; evicted element written to IDB mock
//   • getAsync: hot path (LRU hit) and cold path (IDB miss restore)
//   • Zod-compatible validator: validates on write, throws on invalid
//   • dispose(): closes IDB, clears listeners
//   • clear(): emits DirtyDiff with all ids as removed
//   • flushDirty(): returns dirty ids, clears dirty set

import { describe, expect, it, vi } from 'vitest';
import type { Patch } from 'immer';
import { ElementStore }          from '../src/ElementStore.js';
import type { ElementStoreOptions } from '../src/ElementStore.js';
import type {
    IDBFactoryLike,
    IDBOpenDBRequestLike,
    IDBDatabaseLike,
    IDBTransactionLike,
    IDBObjectStoreLike,
    IDBRequestLike,
} from '../src/IndexedDBStore.js';

// ---------------------------------------------------------------------------
// In-memory IDB mock (same as IndexedDBStore.test.ts)
// ---------------------------------------------------------------------------

class MemObjectStore implements IDBObjectStoreLike {
    constructor(private readonly _data: Map<string, unknown>) {}
    put(v: unknown, k: string): IDBRequestLike<void> {
        this._data.set(k, v);
        return fire<void>(undefined);
    }
    get(k: string): IDBRequestLike<unknown> { return fire(this._data.get(k)); }
    delete(k: string): IDBRequestLike<void> { this._data.delete(k); return fire<void>(undefined); }
}

class MemDb implements IDBDatabaseLike {
    readonly _stores = new Map<string, Map<string, unknown>>();
    createObjectStore(name: string) { if (!this._stores.has(name)) this._stores.set(name, new Map()); }
    transaction(s: string): IDBTransactionLike {
        return { objectStore: () => new MemObjectStore(this._getStore(s)) };
    }
    close() {}
    private _getStore(name: string) {
        let s = this._stores.get(name);
        if (!s) { s = new Map(); this._stores.set(name, s); }
        return s;
    }
}

function fire<T>(result: T): IDBRequestLike<T> {
    const r: IDBRequestLike<T> = { result, error: null, onsuccess: null, onerror: null };
    Promise.resolve().then(() => r.onsuccess?.call(r as unknown as IDBRequest));
    return r;
}

function memFactory(): { factory: IDBFactoryLike; db: MemDb } {
    const db = new MemDb();
    const factory: IDBFactoryLike = {
        open(): IDBOpenDBRequestLike {
            const r: IDBOpenDBRequestLike = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
            Promise.resolve().then(() => {
                r.onupgradeneeded?.call(r as unknown as IDBOpenDBRequest, {} as IDBVersionChangeEvent);
                r.onsuccess?.call(r as unknown as IDBRequest<IDBDatabase>);
            });
            return r;
        },
    };
    return { factory, db };
}

// ---------------------------------------------------------------------------
// Test element type
// ---------------------------------------------------------------------------

interface WallDto {
    name: string;
    x: number;
    z: number;
    tag?: string;
}

function makeStore(opts: Partial<ElementStoreOptions<WallDto>> = {}) {
    const { factory } = memFactory();
    return new ElementStore<WallDto>({
        storeKey:    'wall',
        idbFactory:  factory,
        ...opts,
    });
}

const ADD     = (id: string, v: WallDto): Patch   => ({ op: 'add',     path: [id],          value: v });
const REPLACE = (id: string, v: WallDto): Patch   => ({ op: 'replace', path: [id],          value: v });
const REMOVE  = (id: string):             Patch   => ({ op: 'remove',  path: [id] });
const NESTED  = (id: string, field: string, v: unknown): Patch => ({ op: 'replace', path: [id, field], value: v });

// ---------------------------------------------------------------------------
// applyPatch — root operations
// ---------------------------------------------------------------------------

describe('ElementStore.applyPatch — root add/replace/remove', () => {
    it('add emits diff.added; element is in getState()', () => {
        const s    = makeStore();
        const diff = s.applyPatch([ADD('w1', { name: 'W1', x: 1, z: 2 })]);
        expect([...diff.added]).toEqual(['w1']);
        expect(diff.updated.size).toBe(0);
        expect(diff.removed.size).toBe(0);
        expect(s.getState().get('w1')).toMatchObject({ name: 'W1', x: 1 });
    });

    it('replace emits diff.updated', () => {
        const s = makeStore();
        s.applyPatch([ADD('w1', { name: 'W1', x: 1, z: 2 })]);
        const diff = s.applyPatch([REPLACE('w1', { name: 'W1-b', x: 9, z: 2 })]);
        expect([...diff.updated]).toEqual(['w1']);
        expect(s.getState().get('w1')!.x).toBe(9);
    });

    it('remove emits diff.removed; element absent from getState()', () => {
        const s = makeStore();
        s.applyPatch([ADD('w1', { name: 'W1', x: 0, z: 0 })]);
        const diff = s.applyPatch([REMOVE('w1')]);
        expect([...diff.removed]).toEqual(['w1']);
        expect(s.getState().has('w1')).toBe(false);
    });

    it('empty patch list returns EMPTY_DIFF and fires no listeners', () => {
        const s = makeStore();
        const cb = vi.fn();
        s.subscribeDirty(cb);
        const diff = s.applyPatch([]);
        expect(diff.added.size + diff.updated.size + diff.removed.size).toBe(0);
        expect(cb).not.toHaveBeenCalled();
    });

    it('non-string root path throws', () => {
        const s = makeStore();
        expect(() =>
            s.applyPatch([{ op: 'add', path: [42], value: {} } as unknown as Patch]),
        ).toThrow();
    });
});

// ---------------------------------------------------------------------------
// applyPatch — nested update
// ---------------------------------------------------------------------------

describe('ElementStore.applyPatch — nested field update', () => {
    it('nested replace updates a sub-field via Immer and emits diff.updated', () => {
        const s = makeStore();
        s.applyPatch([ADD('w1', { name: 'Wall', x: 0, z: 0, tag: 'old' })]);
        const diff = s.applyPatch([NESTED('w1', 'tag', 'new')]);
        expect([...diff.updated]).toEqual(['w1']);
        expect(s.getState().get('w1')!.tag).toBe('new');
    });
});

// ---------------------------------------------------------------------------
// DirtyDiff subscriber notification
// ---------------------------------------------------------------------------

describe('ElementStore — subscriber notifications', () => {
    it('subscribeDirty receives the diff on each applyPatch', () => {
        const s  = makeStore();
        const cb = vi.fn();
        s.subscribeDirty(cb);
        s.applyPatch([ADD('w1', { name: 'W1', x: 0, z: 0 })]);
        s.applyPatch([REMOVE('w1')]);
        expect(cb).toHaveBeenCalledTimes(2);
    });

    it('disposer removes subscriber', () => {
        const s       = makeStore();
        const cb      = vi.fn();
        const dispose = s.subscribeDirty(cb);
        dispose();
        s.applyPatch([ADD('w1', { name: 'W1', x: 0, z: 0 })]);
        expect(cb).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// LRU capacity + eviction → IDB write → getAsync restore
// ---------------------------------------------------------------------------

describe('ElementStore — LRU eviction and IDB cache-miss restore', () => {
    it('evicts LRU element when over capacity; getAsync restores from IDB', async () => {
        const { factory } = memFactory();
        const s = new ElementStore<WallDto>({
            storeKey:   'wall',
            capacity:   2,
            idbFactory: factory,
        });

        s.applyPatch([ADD('w1', { name: 'W1', x: 0, z: 0 })]);
        s.applyPatch([ADD('w2', { name: 'W2', x: 1, z: 0 })]);
        // w3 triggers eviction of w1 (LRU, no position extractor → temporal LRU)
        s.applyPatch([ADD('w3', { name: 'W3', x: 2, z: 0 })]);

        expect(s.size()).toBe(2); // w2 and w3 in LRU
        expect(s.getState().has('w1')).toBe(false);

        // Allow IDB writes to settle.
        await new Promise(r => setTimeout(r, 20));

        // getAsync should recover w1 from IDB.
        const restored = await s.getAsync('w1');
        expect(restored).toMatchObject({ name: 'W1' });

        s.dispose();
    });

    it('getAsync returns value directly if element is in LRU cache', async () => {
        const s = makeStore();
        s.applyPatch([ADD('w1', { name: 'W1', x: 0, z: 0 })]);
        const result = await s.getAsync('w1');
        expect(result).toMatchObject({ name: 'W1' });
        s.dispose();
    });

    it('getAsync returns null for an element that was never stored', async () => {
        const s = makeStore();
        const result = await s.getAsync('ghost');
        expect(result).toBeNull();
        s.dispose();
    });
});

// ---------------------------------------------------------------------------
// Optional validator
// ---------------------------------------------------------------------------

describe('ElementStore — Zod-compatible validator', () => {
    it('passes valid elements through', () => {
        const s = makeStore({
            validator: { parse: (v: unknown) => v as WallDto }, // identity validator
        });
        expect(() => {
            s.applyPatch([ADD('w1', { name: 'ok', x: 0, z: 0 })]);
        }).not.toThrow();
    });

    it('throws on invalid element (validator rejects)', () => {
        const s = makeStore({
            validator: {
                parse: (v: unknown): WallDto => {
                    const d = v as WallDto;
                    if (!d.name) throw new Error('name is required');
                    return d;
                },
            },
        });
        expect(() => {
            s.applyPatch([ADD('bad', { name: '', x: 0, z: 0 })]);
        }).toThrow('name is required');
    });
});

// ---------------------------------------------------------------------------
// clear() and dispose()
// ---------------------------------------------------------------------------

describe('ElementStore — clear() and dispose()', () => {
    it('clear() emits diff.removed for all resident elements', () => {
        const s  = makeStore();
        const cb = vi.fn();
        s.subscribeDirty(cb);
        s.applyPatch([ADD('w1', { name: 'W1', x: 0, z: 0 })]);
        s.applyPatch([ADD('w2', { name: 'W2', x: 1, z: 0 })]);
        cb.mockClear();
        s.clear();
        expect(cb).toHaveBeenCalledOnce();
        const diff = cb.mock.calls[0][0];
        expect([...diff.removed].sort()).toEqual(['w1', 'w2']);
        expect(s.size()).toBe(0);
    });

    it('dispose() closes IDB and clears subscribers silently', () => {
        const s  = makeStore();
        const cb = vi.fn();
        s.subscribeDirty(cb);
        s.applyPatch([ADD('w1', { name: 'W1', x: 0, z: 0 })]);
        s.dispose();
        // After dispose, no more patches should notify listeners.
        s.applyPatch([ADD('w2', { name: 'W2', x: 0, z: 0 })]);
        expect(cb).toHaveBeenCalledTimes(1); // only the original add
    });
});

// ---------------------------------------------------------------------------
// flushDirty()
// ---------------------------------------------------------------------------

describe('ElementStore — flushDirty()', () => {
    it('returns keys of all mutated elements and clears the dirty set', () => {
        const s = makeStore();
        s.applyPatch([ADD('w1', { name: 'W1', x: 0, z: 0 })]);
        s.applyPatch([ADD('w2', { name: 'W2', x: 0, z: 0 })]);
        const dirty = s.flushDirty();
        expect(dirty).toEqual(new Set(['w1', 'w2']));
        const dirty2 = s.flushDirty();
        expect(dirty2.size).toBe(0);
        s.dispose();
    });
});
