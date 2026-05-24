// §ADR-051 wall slice — unit gate for wallUndoStoreAdapter (OI-054 B1+B2).
// Proves a ring-buffer inverse patch removes the wall (undo) and a forward
// patch re-adds it (redo) THROUGH the legacy store's add/remove — which drives
// the mesh — so Ctrl+Z / Ctrl+Y revert both data and geometry.

import { describe, it, expect } from 'vitest';
import { wallUndoStoreAdapter, type LegacyWallStoreLike } from '../src/engine/undo/wallUndoStoreAdapter.js';

/** Fake legacy WallStore: a Map plus the add/remove/update/getById surface. */
function makeFakeStore(): LegacyWallStoreLike & { map: Map<string, any> } {
  const map = new Map<string, any>();
  return {
    map,
    add(wall: any) { map.set(wall.id, wall); },
    remove(id: string) { const w = map.get(id); map.delete(id); return w; },
    update(id: string, updates: Record<string, unknown>) {
      const w = map.get(id); if (w) map.set(id, { ...w, ...updates }); return map.get(id);
    },
    getById(id: string) { return map.get(id) ?? undefined; },
  };
}

const WALL = { id: 'wall_01KSDFZAG717Z3MQPJXR4KAK81', height: 3, thickness: 0.2 };

describe('wallUndoStoreAdapter', () => {
  it('undo of a create removes the wall (inverse {op:remove, path:[id]})', () => {
    const store = makeFakeStore();
    store.add(WALL);
    expect(store.map.has(WALL.id)).toBe(true);

    wallUndoStoreAdapter(store).applyPatch([{ op: 'remove', path: [WALL.id] }]);

    expect(store.map.has(WALL.id)).toBe(false); // mesh-driving store reverted
  });

  it('redo of a create re-adds the wall (forward {op:add, path:[id], value})', () => {
    const store = makeFakeStore();
    expect(store.map.has(WALL.id)).toBe(false);

    wallUndoStoreAdapter(store).applyPatch([{ op: 'add', path: [WALL.id], value: WALL }]);

    expect(store.map.get(WALL.id)).toEqual(WALL); // re-added → mesh rebuilt
  });

  it('round-trips create → undo → redo deterministically', () => {
    const store = makeFakeStore();
    const a = wallUndoStoreAdapter(store);
    a.applyPatch([{ op: 'add', path: [WALL.id], value: WALL }]);   // create/redo
    expect(store.map.size).toBe(1);
    a.applyPatch([{ op: 'remove', path: [WALL.id] }]);             // undo
    expect(store.map.size).toBe(0);
    a.applyPatch([{ op: 'add', path: [WALL.id], value: WALL }]);   // redo
    expect(store.map.get(WALL.id)).toEqual(WALL);
  });

  it('field-level replace updates a single field', () => {
    const store = makeFakeStore();
    store.add(WALL);
    wallUndoStoreAdapter(store).applyPatch([{ op: 'replace', path: [WALL.id, 'height'], value: 4 }]);
    expect(store.getById(WALL.id)).toMatchObject({ height: 4, thickness: 0.2 });
  });

  it('is idempotent + never throws (remove already-gone, add already-present)', () => {
    const store = makeFakeStore();
    const a = wallUndoStoreAdapter(store);
    expect(() => a.applyPatch([{ op: 'remove', path: [WALL.id] }])).not.toThrow(); // already gone
    store.add(WALL);
    expect(() => a.applyPatch([{ op: 'add', path: [WALL.id], value: WALL }])).not.toThrow(); // already present
    expect(store.map.size).toBe(1);
  });

  it('ignores empty/degenerate patches without throwing', () => {
    const store = makeFakeStore();
    const a = wallUndoStoreAdapter(store);
    expect(() => a.applyPatch([])).not.toThrow();
    expect(() => a.applyPatch([{ op: 'remove', path: [] }])).not.toThrow();
  });
});
