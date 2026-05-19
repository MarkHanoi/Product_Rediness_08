// ElementStore — ADR-048 · Task 4.3
//
// A capacity-bounded element store that:
//   • Uses `LRUElementMap` (camera-distance eviction, 50 000 cap) instead of
//     an unbounded `Map<string, T>`.
//   • Persists evicted elements to `IndexedDBStore` for async retrieval on
//     cache miss.
//   • Processes Immer `Patch[]` WITHOUT building a full Record<Id, T> view of
//     the entire store — each patch is applied directly to the affected element,
//     giving O(patches) complexity instead of O(store_size).
//   • Emits `DirtyDiff` notifications compatible with the existing `Store<T>`
//     subscriber contract so scene-committers need no changes.
//
// Design invariants:
//   P2 — No import from 'three' or '@pryzm/renderer-three/three'.
//   P3 — No requestAnimationFrame usage.
//   C03 §3 — no builder calls from the store; the store does NOT trigger
//             geometry builds.  Scene-committer subscribes and schedules.
//
// Immer usage:
//   Immer `applyPatches` is still used for NESTED patches (sub-field updates)
//   but ONLY on the single affected element — not on the entire store Map.
//   Root-level add/replace/remove patches bypass Immer entirely.
//
// Validation:
//   An optional `ElementValidator<T>` (Zod-compatible: { parse(v): T }) can
//   be passed in options.  It is called synchronously on root add/replace,
//   before the value is written into the LRU map.

import { applyPatches, enableMapSet, enablePatches, freeze } from 'immer';
import type { Patch }           from 'immer';
import type { DirtyDiff, DirtyListener, Disposer, Id } from './types.js';
import { LRUElementMap }         from './LRUElementMap.js';
import type { LRUElementMapOptions } from './LRUElementMap.js';
import { IndexedDBStore }        from './IndexedDBStore.js';
import type { IDBFactoryLike }   from './IndexedDBStore.js';

// Enable Immer plugins once at module load (idempotent).
enablePatches();
enableMapSet();

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Zod-compatible validator interface.
 * `parse(value)` must throw if the value does not conform to the schema.
 */
export interface ElementValidator<T> {
    parse(value: unknown): T;
}

export interface ElementStoreOptions<T> {
    /**
     * Stable name for this store (e.g. `'wall'`, `'slab'`).
     * Used as the IndexedDB database name prefix.
     */
    storeKey: string;
    /**
     * Maximum number of entries retained in the in-memory LRU cache.
     * Defaults to 50 000.
     */
    capacity?: number;
    /**
     * IndexedDB factory (injectable for tests).  Defaults to `globalThis.indexedDB`.
     * Pass `null` to disable IndexedDB persistence (useful for pure-memory
     * stores or environments without IndexedDB support).
     */
    idbFactory?: IDBFactoryLike | null;
    /**
     * Zod-compatible schema for validating element values on write.
     * If omitted, values are accepted as-is (no runtime validation).
     */
    validator?: ElementValidator<T>;
    /**
     * Extracts a world-space position from an element for spatial LRU eviction.
     * Return `null` for elements that do not have a meaningful position.
     */
    positionExtractor?: LRUElementMapOptions<T>['positionExtractor'];
    /**
     * Camera position provider for spatial eviction scoring.
     * Typically supplied by `CameraPositionService.getPosition.bind(service)`.
     */
    cameraPosition?: LRUElementMapOptions<T>['cameraPosition'];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_SET: ReadonlySet<Id> = Object.freeze(new Set<Id>());
const EMPTY_DIFF: DirtyDiff = Object.freeze({
    added:   EMPTY_SET,
    updated: EMPTY_SET,
    removed: EMPTY_SET,
});

// ---------------------------------------------------------------------------
// ElementStore
// ---------------------------------------------------------------------------

/**
 * Capacity-bounded element store with LRU-spatial eviction and IndexedDB
 * overflow persistence.  Implements the same subscriber contract as `Store<T>`
 * (`subscribeDirty`, `getState`, `applyPatch`, `size`, `clear`) so existing
 * scene-committers and selectors require no changes.
 *
 * Usage:
 * ```ts
 * const wallStore = new ElementStore<WallData>({
 *   storeKey: 'wall',
 *   capacity: 50_000,
 *   positionExtractor: (w) => ({ x: w.x, y: 0, z: w.y }),
 *   cameraPosition: () => cameraPositionService.getPosition(),
 * });
 * ```
 */
export class ElementStore<T extends object> {
    readonly storeKey: string;

    private readonly _lru:  LRUElementMap<T>;
    private readonly _idb:  IndexedDBStore<T> | null;
    private readonly _listeners: Set<DirtyListener<T>> = new Set();
    private readonly _validator: ElementValidator<T> | null;

    constructor(options: ElementStoreOptions<T>) {
        this.storeKey = options.storeKey;
        this._validator = options.validator ?? null;

        // Wire eviction callback → IndexedDB write.
        this._idb = options.idbFactory !== null
            ? new IndexedDBStore<T>(
                `pryzm-element-store-${options.storeKey}`,
                'elements',
                options.idbFactory,
            )
            : null;

        this._lru = new LRUElementMap<T>({
            capacity: options.capacity ?? 50_000,
            ...(options.positionExtractor !== undefined
                ? { positionExtractor: options.positionExtractor }
                : {}),
            ...(options.cameraPosition !== undefined
                ? { cameraPosition: options.cameraPosition }
                : {}),
            ...(this._idb !== null
                ? { onEvict: (key: string, value: T) => this._idb!.write(key, value) }
                : {}),
        });
    }

    // ── Store<T>-compatible interface ───────────────────────────────────

    /**
     * Returns a `ReadonlyMap` view of the IN-MEMORY (LRU-resident) elements.
     * Elements evicted to IndexedDB are NOT present here.
     * Use `getAsync(id)` for a cache-miss–tolerant lookup.
     *
     * The returned object reflects live state — do NOT cache across mutations.
     */
    getState(): ReadonlyMap<Id, T> {
        return this._lru.asReadonlyMap();
    }

    /** Number of elements currently resident in the LRU cache. */
    size(): number {
        return this._lru.size;
    }

    /**
     * Register a listener that fires after each `applyPatch` call.
     * Returns a disposer; calling it removes the listener (idempotent).
     */
    subscribeDirty(listener: DirtyListener<T>): Disposer {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    /**
     * Apply a batch of Immer patches WITHOUT building a full Record<Id, T>
     * view of the store.  Each patch is resolved to the affected element id
     * from `patch.path[0]`; only that element is read/written.
     *
     * Patch shapes supported:
     *   { op: 'add',     path: [id],          value: T }  → set element
     *   { op: 'replace', path: [id],          value: T }  → set element
     *   { op: 'remove',  path: [id]           }           → delete element
     *   { op: 'replace', path: [id, field, …] }           → nested update (Immer)
     *   { op: 'add',     path: [id, field, …] }           → nested add    (Immer)
     *   { op: 'remove',  path: [id, field, …] }           → nested remove (Immer)
     */
    applyPatch(patches: readonly Patch[]): DirtyDiff {
        if (patches.length === 0) return EMPTY_DIFF;

        const added   = new Set<Id>();
        const updated = new Set<Id>();
        const removed = new Set<Id>();

        // Group patches by element id so we apply them in a single pass per element.
        const byId = new Map<Id, Patch[]>();
        for (const p of patches) {
            const id = p.path[0];
            if (typeof id !== 'string' || id.length === 0) {
                throw new Error(
                    `[ElementStore:${this.storeKey}] patch with non-string root path: ` +
                    JSON.stringify(p.path),
                );
            }
            if (!byId.has(id)) byId.set(id, []);
            byId.get(id)!.push(p);
        }

        for (const [id, idPatches] of byId) {
            const wasPresent = this._lru.has(id);

            // ── Root remove (highest precedence) ────────────────────────
            const rootRemove = idPatches.find(
                p => p.path.length === 1 && p.op === 'remove',
            );
            if (rootRemove !== undefined) {
                if (wasPresent) {
                    this._lru.delete(id);
                    this._idb?.delete(id);
                    removed.add(id);
                }
                continue;
            }

            // ── Root add or replace ─────────────────────────────────────
            const rootWrite = idPatches.find(
                p => p.path.length === 1 && (p.op === 'add' || p.op === 'replace'),
            );

            let current: T | undefined;

            if (rootWrite !== undefined) {
                // Validate if a schema is provided.
                let value: T;
                if (this._validator !== null) {
                    try {
                        value = this._validator.parse(rootWrite.value);
                    } catch (err) {
                        throw new Error(
                            `[ElementStore:${this.storeKey}] validation failed for id "${id}": ` +
                            String(err),
                        );
                    }
                } else {
                    value = rootWrite.value as T;
                }

                // Freeze the value (mirrors Store<T> contract — entries are read-only).
                current = freeze(value, true) as T;
                this._lru.set(id, current);

                if (wasPresent) updated.add(id);
                else            added.add(id);
            } else {
                // Only nested patches — element must already exist.
                current = this._lru.get(id);
                if (current === undefined) {
                    // Element may have been evicted to IDB.  Nested patches on
                    // an absent element are a logic error in the command layer;
                    // log and skip to avoid silent corruption.
                    console.warn(
                        `[ElementStore:${this.storeKey}] nested patch on absent id "${id}" — ` +
                        'element not in LRU cache (possibly evicted). Patch skipped.',
                    );
                    continue;
                }
            }

            // ── Nested patches ──────────────────────────────────────────
            const nestedPatches = idPatches.filter(p => p.path.length > 1);
            if (nestedPatches.length > 0 && current !== undefined) {
                // Relativise paths: strip the root id segment so Immer operates
                // on the element object alone, not a record keyed by id.
                const relativePatches = nestedPatches.map(p => ({
                    ...p,
                    path: p.path.slice(1),
                }));
                const next = freeze(
                    applyPatches(current, relativePatches as Patch[]),
                    true,
                ) as T;
                this._lru.set(id, next);

                // Promote to updated (may already be in `added` from root write).
                if (!added.has(id)) updated.add(id);
            }
        }

        if (added.size === 0 && updated.size === 0 && removed.size === 0) {
            return EMPTY_DIFF;
        }

        const diff: DirtyDiff = { added, updated, removed };
        for (const listener of [...this._listeners]) {
            listener(diff, this.getState());
        }
        return diff;
    }

    /**
     * Clear all in-memory elements and notify subscribers.
     * Does NOT clear the IndexedDB store (overflow data remains).
     * Call `dispose()` to fully clean up.
     */
    clear(): void {
        if (this._lru.size === 0) return;
        const removedIds = new Set<Id>(this._lru.asReadonlyMap().keys());
        this._lru.clear();
        const diff: DirtyDiff = { added: EMPTY_SET, updated: EMPTY_SET, removed: removedIds };
        for (const listener of [...this._listeners]) {
            listener(diff, this.getState());
        }
    }

    // ── Extended API (not on Store<T>) ──────────────────────────────────

    /**
     * Async element lookup with automatic IndexedDB cache-miss recovery.
     *
     * 1. If the element is in the LRU cache → returns immediately (sync value
     *    wrapped in a resolved Promise).
     * 2. If the element is absent from the cache (evicted) → reads from
     *    IndexedDB, re-inserts into the LRU map, and returns the value.
     * 3. If neither → returns `null`.
     *
     * Target latency: ≤ 2 ms p95 for a warm IndexedDB (NFT).
     */
    async getAsync(id: Id): Promise<T | null> {
        // Fast path: element is in the LRU cache.
        const hot = this._lru.get(id);
        if (hot !== undefined) return hot;

        // Slow path: try IndexedDB.
        if (this._idb === null) return null;
        const persisted = await this._idb.read(id);
        if (persisted === null) return null;

        // Re-insert into LRU cache (this may evict another element).
        const frozen = freeze(persisted, true) as T;
        this._lru.set(id, frozen);
        return frozen;
    }

    /**
     * Returns all element ids that have been mutated since the last flush.
     * Clears the dirty set atomically.  Used by the autosave service.
     */
    flushDirty(): Set<Id> {
        return this._lru.flushDirty();
    }

    /**
     * Close the IndexedDB connection and release resources.
     * Call when the project is closed or the store is no longer needed.
     */
    dispose(): void {
        this._listeners.clear();
        this._lru.clear();
        this._idb?.close();
    }
}
