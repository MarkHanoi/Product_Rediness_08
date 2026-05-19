// IndexedDBStore.test.ts — ADR-048 · Task 4.3
//
// Tests the IndexedDBStore using a simple in-memory IDB factory mock.
// No external dependencies (e.g. fake-indexeddb) are required.
//
// The mock implements only the subset of the IDB API used by IndexedDBStore:
//   IDBFactory.open()  →  IDBOpenDBRequest
//   IDBDatabase.transaction()  →  IDBTransaction
//   IDBObjectStore.put() / get() / delete()  →  IDBRequest

import { describe, expect, it } from 'vitest';
import { IndexedDBStore }        from '../src/IndexedDBStore.js';
import type {
    IDBFactoryLike,
    IDBOpenDBRequestLike,
    IDBDatabaseLike,
    IDBTransactionLike,
    IDBObjectStoreLike,
    IDBRequestLike,
} from '../src/IndexedDBStore.js';

// ---------------------------------------------------------------------------
// Minimal in-memory IDB mock
// ---------------------------------------------------------------------------

class MemObjectStore implements IDBObjectStoreLike {
    constructor(private readonly _data: Map<string, unknown>) {}

    put(value: unknown, key: string): IDBRequestLike<void> {
        this._data.set(key, value);
        return syncRequest<void>(undefined);
    }

    get(key: string): IDBRequestLike<unknown> {
        return syncRequest(this._data.get(key));
    }

    delete(key: string): IDBRequestLike<void> {
        this._data.delete(key);
        return syncRequest<void>(undefined);
    }
}

class MemTransaction implements IDBTransactionLike {
    constructor(
        private readonly _stores: Map<string, Map<string, unknown>>,
        private readonly _name: string,
    ) {}

    objectStore(): IDBObjectStoreLike {
        let s = this._stores.get(this._name);
        if (!s) { s = new Map(); this._stores.set(this._name, s); }
        return new MemObjectStore(s);
    }
}

class MemDatabase implements IDBDatabaseLike {
    private readonly _stores = new Map<string, Map<string, unknown>>();

    createObjectStore(name: string): void {
        if (!this._stores.has(name)) this._stores.set(name, new Map());
    }

    transaction(storeName: string): IDBTransactionLike {
        return new MemTransaction(this._stores, storeName);
    }

    close(): void { /* no-op */ }
}

/** Synchronous IDB request that fires onsuccess before the call returns. */
function syncRequest<T>(result: T): IDBRequestLike<T> {
    const req: IDBRequestLike<T> = {
        result,
        error: null,
        onsuccess: null,
        onerror:   null,
    };
    // Fire onsuccess asynchronously (microtask) to match real IDB behaviour.
    Promise.resolve().then(() => req.onsuccess?.call(req as unknown as IDBRequest));
    return req;
}

/** Factory that returns a fresh MemDatabase on every open() call. */
function createMemFactory(): IDBFactoryLike {
    const db = new MemDatabase();
    return {
        open(name: string, version: number): IDBOpenDBRequestLike {
            const req: IDBOpenDBRequestLike = {
                result: db,
                error:  null,
                onupgradeneeded: null,
                onsuccess:       null,
                onerror:         null,
            };
            Promise.resolve().then(() => {
                req.onupgradeneeded?.call(req as unknown as IDBOpenDBRequest, {} as IDBVersionChangeEvent);
                req.onsuccess?.call(req as unknown as IDBRequest<IDBDatabase>);
            });
            return req;
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IndexedDBStore — write / read round-trip', () => {
    it('writes a value and reads it back', async () => {
        const store = new IndexedDBStore<{ v: number }>('test-db', 'elements', createMemFactory());
        store.write('k1', { v: 42 });
        await new Promise(r => setTimeout(r, 10)); // allow async write
        const result = await store.read('k1');
        expect(result).toEqual({ v: 42 });
        store.close();
    });

    it('read returns null for absent key', async () => {
        const store = new IndexedDBStore<{ v: number }>('test-db', 'elements', createMemFactory());
        const result = await store.read('absent');
        expect(result).toBeNull();
        store.close();
    });

    it('overwrites a key on second write', async () => {
        const store = new IndexedDBStore<{ v: number }>('test-db', 'elements', createMemFactory());
        store.write('k', { v: 1 });
        await new Promise(r => setTimeout(r, 10));
        store.write('k', { v: 2 });
        await new Promise(r => setTimeout(r, 10));
        const result = await store.read('k');
        expect(result).toEqual({ v: 2 });
        store.close();
    });
});

describe('IndexedDBStore — delete', () => {
    it('delete removes a key so read returns null', async () => {
        const store = new IndexedDBStore<{ v: number }>('test-db', 'elements', createMemFactory());
        store.write('k', { v: 99 });
        await new Promise(r => setTimeout(r, 10));
        store.delete('k');
        await new Promise(r => setTimeout(r, 10));
        const result = await store.read('k');
        expect(result).toBeNull();
        store.close();
    });
});

describe('IndexedDBStore — close / isClosed', () => {
    it('isClosed is false before close()', () => {
        const store = new IndexedDBStore('db', 'store', createMemFactory());
        expect(store.isClosed).toBe(false);
        store.close();
    });

    it('isClosed is true after close()', () => {
        const store = new IndexedDBStore('db', 'store', createMemFactory());
        store.close();
        expect(store.isClosed).toBe(true);
    });

    it('write() after close() is a no-op (does not throw)', () => {
        const store = new IndexedDBStore<{ v: number }>('db', 'store', createMemFactory());
        store.close();
        expect(() => store.write('k', { v: 1 })).not.toThrow();
    });

    it('read() after close() resolves to null', async () => {
        const store = new IndexedDBStore<{ v: number }>('db', 'store', createMemFactory());
        store.close();
        const result = await store.read('k');
        expect(result).toBeNull();
    });
});
