// §ADR-051 per-type undo rollout — unit gate for elementUndoStoreAdapter (OI-054 B1+B2).
// Proves undo (remove) + redo (add) drive the legacy store's mutators across the
// duck-typed surface variants (getById vs get, remove vs delete) so Ctrl+Z / Ctrl+Y
// revert both data and geometry for every element type.

import { describe, it, expect } from 'vitest';
import {
  elementUndoStoreAdapter,
  adaptElementStoreMap,
  type LegacyElementStoreLike,
} from '../src/engine/undo/elementUndoStoreAdapter.js';

/** Standard store: add/remove/update/getById (Wall/Slab/Room/Roof/Floor/Ceiling/Handrail). */
function makeStandardStore(): LegacyElementStoreLike & { map: Map<string, any> } {
  const map = new Map<string, any>();
  return {
    map,
    add(e: any) { map.set(e.id, e); },
    remove(id: string) { const e = map.get(id); map.delete(id); return e; },
    update(id: string, u: Record<string, unknown>) { const e = map.get(id); if (e) map.set(id, { ...e, ...u }); return map.get(id); },
    getById(id: string) { return map.get(id) ?? undefined; },
  };
}

/** Variant store: add/delete/update/get (CurtainWall-style — delete + get, no remove/getById). */
function makeVariantStore(): LegacyElementStoreLike & { map: Map<string, any> } {
  const map = new Map<string, any>();
  return {
    map,
    add(e: any) { map.set(e.id, e); },
    delete(id: string) { map.delete(id); },
    update(id: string, u: Record<string, unknown>) { const e = map.get(id); if (e) map.set(id, { ...e, ...u }); },
    get(id: string) { return map.get(id) ?? undefined; },
  };
}

const EL = { id: 'slab_01KSDFZAG717Z3MQPJXR4KAK81', area: 12 };

describe('elementUndoStoreAdapter', () => {
  it('undo of a create removes via remove() (standard store)', () => {
    const s = makeStandardStore();
    s.add(EL);
    elementUndoStoreAdapter(s).applyPatch([{ op: 'remove', path: [EL.id] }]);
    expect(s.map.has(EL.id)).toBe(false);
  });

  it('undo removes via delete()+get() (variant store)', () => {
    const s = makeVariantStore();
    s.add(EL);
    elementUndoStoreAdapter(s).applyPatch([{ op: 'remove', path: [EL.id] }]);
    expect(s.map.has(EL.id)).toBe(false);
  });

  it('redo of a create re-adds via add()', () => {
    const s = makeStandardStore();
    elementUndoStoreAdapter(s).applyPatch([{ op: 'add', path: [EL.id], value: EL }]);
    expect(s.map.get(EL.id)).toEqual(EL);
  });

  it('round-trips create → undo → redo on both store shapes', () => {
    for (const s of [makeStandardStore(), makeVariantStore()]) {
      const a = elementUndoStoreAdapter(s);
      a.applyPatch([{ op: 'add', path: [EL.id], value: EL }]);
      expect(s.map.size).toBe(1);
      a.applyPatch([{ op: 'remove', path: [EL.id] }]);
      expect(s.map.size).toBe(0);
      a.applyPatch([{ op: 'add', path: [EL.id], value: EL }]);
      expect(s.map.get(EL.id)).toEqual(EL);
    }
  });

  it('field-level replace updates a single field', () => {
    const s = makeStandardStore();
    s.add(EL);
    elementUndoStoreAdapter(s).applyPatch([{ op: 'replace', path: [EL.id, 'area'], value: 99 }]);
    expect(s.getById!(EL.id)).toMatchObject({ area: 99 });
  });

  it('is idempotent + never throws (remove-gone, add-present, degenerate, missing methods)', () => {
    const s = makeStandardStore();
    const a = elementUndoStoreAdapter(s);
    expect(() => a.applyPatch([{ op: 'remove', path: [EL.id] }])).not.toThrow();
    s.add(EL);
    expect(() => a.applyPatch([{ op: 'add', path: [EL.id], value: EL }])).not.toThrow();
    expect(s.map.size).toBe(1);
    expect(() => a.applyPatch([])).not.toThrow();
    expect(() => a.applyPatch([{ op: 'remove', path: [] }])).not.toThrow();
    // store with no methods at all → graceful no-op
    expect(() => elementUndoStoreAdapter({}).applyPatch([{ op: 'remove', path: [EL.id] }])).not.toThrow();
  });

  it('adaptElementStoreMap wraps each live store; undefined entries stay undefined', () => {
    const s = makeStandardStore();
    const map = adaptElementStoreMap({ slab: s, slabs: s, roof: undefined });
    expect(typeof map.slab?.applyPatch).toBe('function');
    expect(typeof map.slabs?.applyPatch).toBe('function');
    expect(map.roof).toBeUndefined();
    s.add(EL);
    map.slab!.applyPatch([{ op: 'remove', path: [EL.id] }]);
    expect(s.map.has(EL.id)).toBe(false);
  });
});
