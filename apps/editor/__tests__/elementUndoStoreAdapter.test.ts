// @vitest-environment happy-dom
//
// §ADR-051 per-type undo rollout — unit gate for elementUndoStoreAdapter (OI-054 B1+B2).
// Proves undo (remove) + redo (add) drive the legacy store's mutators across the
// duck-typed surface variants (getById vs get, remove vs delete) so Ctrl+Z / Ctrl+Y
// revert both data and geometry for every element type.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  elementUndoStoreAdapter,
  adaptElementStoreMap,
  __resetUndoRestoreSnapshots,
  type LegacyElementStoreLike,
} from '../src/engine/undo/elementUndoStoreAdapter.js';

// Module-level redo-restore stash is shared across adapter instances — reset per
// test so cases that reuse the same element id don't leak snapshots into each other.
beforeEach(() => __resetUndoRestoreSnapshots());

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

  it('redo restores the LEGACY object captured at undo, not the L1 forward value (REDO-SHAPE-FIX)', () => {
    // Simulates the curtain-wall divergence: the legacy store holds bridge-mapped
    // fields (gridXSpacing) that the L1 forward-patch value (bayWidth) lacks.
    const s = makeStandardStore();
    const legacy = { id: 'curtainwall_X', type: 'curtain-wall', levelId: 'L0', gridXSpacing: 1.2, gridYSpacing: 1.5 };
    s.add(legacy);
    const a = elementUndoStoreAdapter(s);
    // undo (remove) → captures the legacy object
    a.applyPatch([{ op: 'remove', path: ['curtainwall_X'] }]);
    expect(s.map.has('curtainwall_X')).toBe(false);
    // redo (add) with the L1-shaped value (bayWidth, NO gridXSpacing) → adapter MUST
    // restore the captured legacy object instead, preserving gridXSpacing.
    a.applyPatch([{ op: 'add', path: ['curtainwall_X'], value: { id: 'curtainwall_X', type: 'curtain-wall', levelId: 'L0', bayWidth: 1.2, bayHeight: 1.5 } }]);
    expect(s.map.get('curtainwall_X')).toEqual(legacy);                 // legacy shape restored
    expect((s.map.get('curtainwall_X') as any).gridXSpacing).toBe(1.2); // grid field preserved → panels regenerate
  });

  it('hosted door undo/redo: removeOpening + doorStore.remove on undo; addOpening + restore on redo (§HOSTED-OPENING-UNDO)', () => {
    const doorMap = new Map<string, any>();
    (window as any).doorStore = {
      add: (r: any) => doorMap.set(r.id, r),
      remove: (id: string) => doorMap.delete(id),
      getById: (id: string) => doorMap.get(id),
      has: (id: string) => doorMap.has(id),
    };
    const door = { id: 'd1', openingId: 'o1', wallId: 'W1', width: 0.9, frameColor: '#abc' };
    doorMap.set('d1', door);
    const opening = { id: 'o1', elementId: 'd1', type: 'door' };
    const wall: any = { id: 'W1', openings: [opening], childrenIds: ['d1'] };
    const removed: string[] = []; const added: any[] = [];
    const wallStore: any = {
      getById: (id: string) => (id === 'W1' ? wall : undefined),
      update: () => { throw new Error('generic update() must NOT be used for openings'); },
      removeOpening: (_w: string, oid: string) => { wall.openings = wall.openings.filter((o: any) => o.id !== oid); removed.push(oid); },
      addOpening: (_w: string, o: any) => { wall.openings = [...wall.openings, o]; added.push(o); },
    };
    const a = elementUndoStoreAdapter(wallStore);

    // UNDO of the placement: openings → [] (childrenIds patch is skipped for wall stores)
    a.applyPatch([{ op: 'replace', path: ['W1', 'openings'], value: [] }]);
    expect(removed).toEqual(['o1']);              // hole closed via removeOpening (not update)
    expect(doorMap.has('d1')).toBe(false);        // hosted door mesh/record removed
    expect(wall.openings.length).toBe(0);

    // REDO: openings → [opening]
    a.applyPatch([{ op: 'replace', path: ['W1', 'openings'], value: [opening] }]);
    expect(added.length).toBe(1);                 // hole re-cut via addOpening
    expect(doorMap.get('d1')).toEqual(door);      // hosted door restored from snapshot
    delete (window as any).doorStore;
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
