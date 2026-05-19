// LRUElementMap.test.ts — ADR-048 · Task 4.3
//
// Tests for the capacity-bounded, camera-distance-eviction LRU map.
//
// Coverage:
//   • Basic get / set / has / delete
//   • Capacity enforcement — eviction fires at cap
//   • LRU order — temporal fallback when no position extractor
//   • Spatial eviction — farthest element evicted first
//   • Dirty-set tracking — mutations land in dirty set; delete clears; flushDirty atomically clears
//   • Eviction callback — fires synchronously with the evicted key/value
//   • asReadonlyMap — live O(1) view of resident entries
//   • clear() — clears map and dirty set without firing eviction callbacks

import { describe, expect, it, vi } from 'vitest';
import { LRUElementMap } from '../src/LRUElementMap.js';
import type { Vec3Like } from '../src/LRUElementMap.js';

interface Elem {
    name: string;
    pos?: Vec3Like;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMap(options?: ConstructorParameters<typeof LRUElementMap<Elem>>[0]) {
    return new LRUElementMap<Elem>(options);
}

const cam  = (x: number, y: number, z: number): (() => Vec3Like) => () => ({ x, y, z });
const pos  = (x: number, y: number, z: number): Vec3Like => ({ x, y, z });

// ---------------------------------------------------------------------------
// Basic API
// ---------------------------------------------------------------------------

describe('LRUElementMap — basic API', () => {
    it('returns undefined for an absent key', () => {
        const m = makeMap();
        expect(m.get('x')).toBeUndefined();
        expect(m.has('x')).toBe(false);
    });

    it('stores and retrieves a value', () => {
        const m = makeMap();
        m.set('a', { name: 'Alice' });
        expect(m.has('a')).toBe(true);
        expect(m.get('a')).toEqual({ name: 'Alice' });
        expect(m.size).toBe(1);
    });

    it('updates a value in place (same key)', () => {
        const m = makeMap();
        m.set('a', { name: 'Alice' });
        m.set('a', { name: 'Bob' });
        expect(m.get('a')).toEqual({ name: 'Bob' });
        expect(m.size).toBe(1);
    });

    it('delete removes the entry and returns true', () => {
        const m = makeMap();
        m.set('a', { name: 'Alice' });
        expect(m.delete('a')).toBe(true);
        expect(m.has('a')).toBe(false);
        expect(m.size).toBe(0);
    });

    it('delete returns false for absent key', () => {
        const m = makeMap();
        expect(m.delete('missing')).toBe(false);
    });

    it('clear removes all entries', () => {
        const m = makeMap();
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        m.clear();
        expect(m.size).toBe(0);
        expect(m.has('a')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Capacity & LRU (temporal) eviction
// ---------------------------------------------------------------------------

describe('LRUElementMap — temporal LRU eviction (no position extractor)', () => {
    it('does not evict when under capacity', () => {
        const evict = vi.fn();
        const m = makeMap({ capacity: 3, onEvict: evict });
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        m.set('c', { name: 'C' });
        expect(m.size).toBe(3);
        expect(evict).not.toHaveBeenCalled();
    });

    it('evicts the LRU entry when capacity is exceeded', () => {
        const evict = vi.fn();
        // Insert a, b, c. Then insert d — 'a' is LRU, should be evicted.
        const m = makeMap({ capacity: 3, onEvict: evict });
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        m.set('c', { name: 'C' });
        m.set('d', { name: 'D' });
        expect(m.size).toBe(3);
        expect(evict).toHaveBeenCalledOnce();
        expect(evict).toHaveBeenCalledWith('a', { name: 'A' });
        expect(m.has('a')).toBe(false);
        expect(m.has('d')).toBe(true);
    });

    it('get() promotes an entry to MRU, preventing its eviction', () => {
        const evict = vi.fn();
        const m = makeMap({ capacity: 3, onEvict: evict });
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        m.set('c', { name: 'C' });
        // Promote 'a' to MRU — 'b' becomes LRU.
        m.get('a');
        m.set('d', { name: 'D' });
        expect(evict).toHaveBeenCalledWith('b', { name: 'B' });
        expect(m.has('a')).toBe(true);
        expect(m.has('b')).toBe(false);
    });

    it('updating an existing key promotes it to MRU', () => {
        const evict = vi.fn();
        const m = makeMap({ capacity: 3, onEvict: evict });
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        m.set('c', { name: 'C' });
        // Re-set 'a' — it becomes MRU; 'b' is now LRU.
        m.set('a', { name: 'A2' });
        m.set('d', { name: 'D' });
        expect(evict).toHaveBeenCalledWith('b', { name: 'B' });
        expect(m.has('a')).toBe(true);
        expect(m.get('a')).toEqual({ name: 'A2' });
    });
});

// ---------------------------------------------------------------------------
// Spatial eviction (camera-distance-first)
// ---------------------------------------------------------------------------

describe('LRUElementMap — spatial eviction (camera-distance-first)', () => {
    it('evicts the element farthest from the camera', () => {
        const evict = vi.fn();
        const m = makeMap({
            capacity: 3,
            onEvict:  evict,
            positionExtractor: v => v.pos ?? null,
            cameraPosition:    cam(0, 0, 0),
        });
        // near at distance=1, mid at distance=5, far at distance=10
        m.set('near', { name: 'near', pos: pos(1, 0, 0) });
        m.set('mid',  { name: 'mid',  pos: pos(5, 0, 0) });
        m.set('far',  { name: 'far',  pos: pos(10, 0, 0) });
        // Insert 4th element — 'far' (dist=10) must be evicted.
        m.set('new',  { name: 'new',  pos: pos(2, 0, 0) });
        expect(evict).toHaveBeenCalledWith('far', expect.objectContaining({ name: 'far' }));
        expect(m.has('far')).toBe(false);
        expect(m.has('near')).toBe(true);
        expect(m.has('mid')).toBe(true);
    });

    it('falls back to LRU eviction for elements without a position', () => {
        const evict = vi.fn();
        const m = makeMap({
            capacity: 3,
            onEvict:  evict,
            positionExtractor: v => v.pos ?? null,
            cameraPosition:    cam(0, 0, 0),
        });
        // All elements lack positions — LRU tail is evicted.
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        m.set('c', { name: 'C' });
        m.set('d', { name: 'D' });
        // 'a' is LRU (oldest), no positions → standard LRU eviction.
        expect(evict).toHaveBeenCalledWith('a', { name: 'A' });
    });

    it('prefers spatial distance over recency for eviction choice', () => {
        // 'recent' was just accessed (MRU) but is very far.
        // 'old' was set first (LRU) but is very close.
        // Spatial policy should evict 'recent'.
        const evict = vi.fn();
        const m = makeMap({
            capacity: 2,
            onEvict:  evict,
            positionExtractor: v => v.pos ?? null,
            cameraPosition:    cam(0, 0, 0),
        });
        m.set('old',    { name: 'old',    pos: pos(1, 0, 0) });
        m.set('recent', { name: 'recent', pos: pos(100, 0, 0) });
        // Accessing 'old' promotes it to MRU — but it's still near.
        m.get('old');
        // Insert 3rd element — 'recent' is far (dist=100), should be evicted.
        m.set('new', { name: 'new', pos: pos(2, 0, 0) });
        expect(evict).toHaveBeenCalledWith('recent', expect.anything());
        expect(m.has('old')).toBe(true);
        expect(m.has('recent')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Dirty-set tracking
// ---------------------------------------------------------------------------

describe('LRUElementMap — dirty-set tracking', () => {
    it('set() marks the key as dirty', () => {
        const m = makeMap();
        m.set('a', { name: 'A' });
        expect(m.dirtyCount).toBe(1);
    });

    it('delete() removes the key from the dirty set', () => {
        const m = makeMap();
        m.set('a', { name: 'A' });
        m.delete('a');
        expect(m.dirtyCount).toBe(0);
    });

    it('flushDirty() returns all dirty keys and resets the set', () => {
        const m = makeMap();
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        const dirty = m.flushDirty();
        expect(dirty).toEqual(new Set(['a', 'b']));
        expect(m.dirtyCount).toBe(0);
    });

    it('evicted entries are removed from the dirty set', () => {
        const m = makeMap({
            capacity: 2,
            positionExtractor: () => null,
        });
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        m.set('c', { name: 'C' }); // evicts 'a'
        // 'a' should no longer be dirty (it was evicted/persisted)
        const dirty = m.flushDirty();
        expect(dirty.has('a')).toBe(false);
        expect(dirty.has('b')).toBe(true);
        expect(dirty.has('c')).toBe(true);
    });

    it('clear() also clears the dirty set', () => {
        const m = makeMap();
        m.set('a', { name: 'A' });
        m.clear();
        expect(m.dirtyCount).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Eviction callback
// ---------------------------------------------------------------------------

describe('LRUElementMap — eviction callback', () => {
    it('fires synchronously with the correct key and value', () => {
        const calls: [string, Elem][] = [];
        const m = makeMap({
            capacity: 1,
            onEvict: (k, v) => calls.push([k, v]),
        });
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual(['a', { name: 'A' }]);
    });

    it('does NOT fire on delete()', () => {
        const evict = vi.fn();
        const m = makeMap({ capacity: 10, onEvict: evict });
        m.set('a', { name: 'A' });
        m.delete('a');
        expect(evict).not.toHaveBeenCalled();
    });

    it('does NOT fire on clear()', () => {
        const evict = vi.fn();
        const m = makeMap({ capacity: 10, onEvict: evict });
        m.set('a', { name: 'A' });
        m.clear();
        expect(evict).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// asReadonlyMap
// ---------------------------------------------------------------------------

describe('LRUElementMap — asReadonlyMap()', () => {
    it('reflects live entries', () => {
        const m = makeMap();
        m.set('x', { name: 'X' });
        const ro = m.asReadonlyMap();
        expect(ro.size).toBe(1);
        expect(ro.get('x')).toEqual({ name: 'X' });
        expect(ro.has('x')).toBe(true);
    });

    it('reflects deletions after the view is obtained', () => {
        const m = makeMap();
        m.set('x', { name: 'X' });
        const ro = m.asReadonlyMap();
        m.delete('x');
        expect(ro.size).toBe(0);
        expect(ro.has('x')).toBe(false);
    });

    it('keys(), values(), entries() iterate all resident elements', () => {
        const m = makeMap();
        m.set('a', { name: 'A' });
        m.set('b', { name: 'B' });
        const ro = m.asReadonlyMap();
        expect([...ro.keys()].sort()).toEqual(['a', 'b']);
        expect([...ro.values()].map(v => v.name).sort()).toEqual(['A', 'B']);
        expect([...ro.entries()].map(([k]) => k).sort()).toEqual(['a', 'b']);
    });
});
