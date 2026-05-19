// LRUElementMap — ADR-048 · Task 4.3
//
// A capacity-bounded map whose eviction policy is camera-distance-first:
// when the map is full and a new entry must be inserted, the element
// whose world-space position is FARTHEST from the current camera position
// is evicted.  If no position extractor is configured, or all elements
// lack a position, the LEAST-RECENTLY-USED entry (tail of the doubly-
// linked recency list) is evicted instead.
//
// Design invariants:
//   P2 — No import from 'three' or '@pryzm/renderer-three/three'.
//         Positions are plain { x, y, z } tuples (Vec3Like).
//   P3 — No requestAnimationFrame usage.
//
// Data structures:
//   _nodeMap:  Map<string, LRUNode<V>> — O(1) key lookup; node carries recency links
//   _valueMap: Map<string, V>          — O(1) value access; exposed as ReadonlyMap
//   _head / _tail                      — MRU / LRU sentinels for the doubly-linked list
//
// Complexity:
//   get / has      — O(1) lookup + O(1) promote-to-head
//   set (no evict) — O(1) insert + O(1) promote-to-head
//   set (evict)    — O(1) + O(n) spatial scan (n ≤ capacity, ≤ 50 000)
//   delete         — O(1)
//
// The O(n) spatial eviction scan only fires when the map is full.  At the
// default capacity of 50 000, a scan takes < 1 ms in practice.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Plain XYZ tuple — no THREE dependency. */
export interface Vec3Like {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * Called synchronously when an entry is evicted from the LRU map.
 * The eviction callback is responsible for persisting the entry
 * (e.g., writing it to IndexedDB) before the reference is released.
 */
export type EvictionCallback<K, V> = (key: K, value: V) => void;

/**
 * Optional function that extracts the world-space position of an element.
 * Returning `null` means the element has no meaningful position; it will
 * only be evicted after all positioned elements farther from the camera.
 */
export type PositionExtractor<V> = (value: V) => Vec3Like | null;

/** Provider for the current camera world-space position. */
export type CameraPositionProvider = () => Vec3Like;

// ---------------------------------------------------------------------------
// Doubly-linked list node (internal)
// ---------------------------------------------------------------------------

interface LRUNode<V> {
    key:   string;
    prev:  LRUNode<V> | null;
    next:  LRUNode<V> | null;
}

// ---------------------------------------------------------------------------
// LRUElementMap
// ---------------------------------------------------------------------------

export interface LRUElementMapOptions<V> {
    /**
     * Maximum number of entries before eviction fires.
     * Default: 50_000.
     */
    capacity?: number;
    /**
     * Called synchronously when an entry is evicted from the map.
     * The implementor should persist the entry asynchronously.
     */
    onEvict?: EvictionCallback<string, V>;
    /**
     * Returns the world-space position of an element for spatial eviction.
     * If omitted or returns null, temporal LRU order is used as fallback.
     */
    positionExtractor?: PositionExtractor<V>;
    /**
     * Provides the current camera world-space position for eviction scoring.
     * If omitted, eviction falls back to LRU (temporal) order.
     */
    cameraPosition?: CameraPositionProvider;
}

export class LRUElementMap<V> {
    // ── Core storage ────────────────────────────────────────────────────
    //
    // Two parallel maps:
    //   _nodeMap  — carries the doubly-linked recency links; no value stored here.
    //   _valueMap — plain Map<string, V>; exposed via asReadonlyMap() so
    //               TypeScript's MapIterator requirement is satisfied without a
    //               custom proxy class.
    //
    // Both maps are kept in perfect sync: every set/delete/clear/evict updates
    // both.  Memory overhead: ~48 bytes per entry for the extra Map slot (keys
    // share the same interned string).  At 50 000 entries ≈ 2.4 MB — acceptable.
    private readonly _nodeMap:  Map<string, LRUNode<V>> = new Map();
    private readonly _valueMap: Map<string, V>          = new Map();
    private _head: LRUNode<V> | null = null; // MRU
    private _tail: LRUNode<V> | null = null; // LRU

    // ── Configuration ───────────────────────────────────────────────────
    private readonly _capacity:          number;
    private readonly _onEvict:           EvictionCallback<string, V> | null;
    private readonly _positionExtractor: PositionExtractor<V>  | null;
    private readonly _cameraPosition:    CameraPositionProvider | null;

    // ── Dirty tracking (for autosave flush) ─────────────────────────────
    /**
     * Tracks the ids of entries that have been mutated since the last
     * `flushDirty()` call.  Evicted entries are removed from the dirty
     * set (their persistence was handled by the eviction callback).
     */
    private readonly _dirtySet: Set<string> = new Set();

    constructor(options: LRUElementMapOptions<V> = {}) {
        this._capacity          = Math.max(1, options.capacity ?? 50_000);
        this._onEvict           = options.onEvict           ?? null;
        this._positionExtractor = options.positionExtractor ?? null;
        this._cameraPosition    = options.cameraPosition    ?? null;
    }

    // ── Map-like public API ─────────────────────────────────────────────

    /**
     * Retrieve an entry and promote it to MRU position.
     * Returns `undefined` if the key is not in the map (potential cache miss).
     */
    get(key: string): V | undefined {
        const node = this._nodeMap.get(key);
        if (node === undefined) return undefined;
        this._promoteToHead(node);
        return this._valueMap.get(key);
    }

    /**
     * Test for the presence of a key WITHOUT promoting the entry.
     * Use for containment checks that should not affect recency order.
     */
    has(key: string): boolean {
        return this._nodeMap.has(key);
    }

    /**
     * Insert or update an entry.  If the map is at capacity, the entry
     * farthest from the camera (or the LRU entry if no positions are
     * available) is evicted first.
     *
     * The inserted entry is immediately marked in `_dirtySet`.
     */
    set(key: string, value: V): void {
        const existing = this._nodeMap.get(key);
        if (existing !== undefined) {
            // Update value in place and promote to MRU.
            this._valueMap.set(key, value);
            this._promoteToHead(existing);
            this._dirtySet.add(key);
            return;
        }

        // Evict before inserting so the map never exceeds capacity.
        if (this._nodeMap.size >= this._capacity) {
            this._evict();
        }

        // Insert new node at head (MRU).
        const node: LRUNode<V> = { key, prev: null, next: null };
        this._insertAtHead(node);
        this._nodeMap.set(key, node);
        this._valueMap.set(key, value);
        this._dirtySet.add(key);
    }

    /**
     * Remove an entry from the map.
     * The entry is also removed from `_dirtySet` (no longer needs persistence).
     */
    delete(key: string): boolean {
        const node = this._nodeMap.get(key);
        if (node === undefined) return false;
        this._removeNode(node);
        this._nodeMap.delete(key);
        this._valueMap.delete(key);
        this._dirtySet.delete(key);
        return true;
    }

    /** Current number of entries in the map. */
    get size(): number {
        return this._nodeMap.size;
    }

    /** Remove all entries without firing eviction callbacks. */
    clear(): void {
        this._nodeMap.clear();
        this._valueMap.clear();
        this._head = null;
        this._tail = null;
        this._dirtySet.clear();
    }

    /**
     * Iterate entries in MRU → LRU order (most recently used first).
     * Yields [key, value] pairs.
     */
    *entries(): IterableIterator<[string, V]> {
        let current = this._head;
        while (current !== null) {
            yield [current.key, this._valueMap.get(current.key) as V];
            current = current.next;
        }
    }

    /**
     * Expose the internal value storage as a `ReadonlyMap<string, V>`.
     *
     * Because `_valueMap` is a real `Map<string, V>`, all its iterators
     * return proper `MapIterator<T>` instances — no custom proxy required.
     * The caller receives a live view; it MUST NOT hold it across mutations.
     */
    asReadonlyMap(): ReadonlyMap<string, V> {
        return this._valueMap;
    }

    // ── Dirty-set API ───────────────────────────────────────────────────

    /**
     * Returns all dirty keys and clears the dirty set atomically.
     * Call this from the autosave service to collect pending mutations.
     */
    flushDirty(): Set<string> {
        const snapshot = new Set(this._dirtySet);
        this._dirtySet.clear();
        return snapshot;
    }

    /** Current dirty-set size — useful for monitoring without flushing. */
    get dirtyCount(): number {
        return this._dirtySet.size;
    }

    // ── Eviction ────────────────────────────────────────────────────────

    /**
     * Evict one entry.
     *
     * Strategy (camera-distance-first):
     *   1. If a position extractor AND camera position provider are available,
     *      scan all entries to find the element farthest from the camera.
     *   2. Fall back to the LRU tail if no positioned element is found.
     *
     * After removal, the eviction callback is fired synchronously so the
     * caller (IndexedDBStore) can persist the entry asynchronously.
     */
    private _evict(): void {
        let evictKey: string | null = this._tail?.key ?? null;

        if (this._positionExtractor !== null && this._cameraPosition !== null) {
            const cam = this._cameraPosition();
            let maxDist2 = -1;
            let candidate: string | null = null;

            // Scan from LRU tail toward MRU head — bias toward evicting
            // older entries at equal distance, avoiding thrashing.
            let cur = this._tail;
            while (cur !== null) {
                const val = this._valueMap.get(cur.key);
                if (val !== undefined) {
                    const pos = this._positionExtractor(val);
                    if (pos !== null) {
                        const dx = pos.x - cam.x;
                        const dy = pos.y - cam.y;
                        const dz = pos.z - cam.z;
                        const dist2 = dx * dx + dy * dy + dz * dz;
                        if (dist2 > maxDist2) {
                            maxDist2  = dist2;
                            candidate = cur.key;
                        }
                    }
                }
                cur = cur.prev; // prev = toward MRU in our list
            }

            if (candidate !== null) {
                evictKey = candidate;
            }
        }

        if (evictKey === null) return;

        const evictValue = this._valueMap.get(evictKey);
        const evictNode  = this._nodeMap.get(evictKey);
        if (evictNode === undefined) return;

        this._removeNode(evictNode);
        this._nodeMap.delete(evictKey);
        this._valueMap.delete(evictKey);
        // Evicted entry is being persisted by the callback — clear dirty.
        this._dirtySet.delete(evictKey);
        if (evictValue !== undefined) {
            this._onEvict?.(evictKey, evictValue);
        }
    }

    // ── Doubly-linked list helpers ──────────────────────────────────────

    private _insertAtHead(node: LRUNode<V>): void {
        node.prev = null;
        node.next = this._head;
        if (this._head !== null) this._head.prev = node;
        this._head = node;
        if (this._tail === null) this._tail = node;
    }

    private _removeNode(node: LRUNode<V>): void {
        if (node.prev !== null) node.prev.next = node.next;
        else this._head = node.next; // node was head
        if (node.next !== null) node.next.prev = node.prev;
        else this._tail = node.prev; // node was tail
        node.prev = null;
        node.next = null;
    }

    private _promoteToHead(node: LRUNode<V>): void {
        if (node === this._head) return; // already MRU
        this._removeNode(node);
        this._insertAtHead(node);
    }
}
