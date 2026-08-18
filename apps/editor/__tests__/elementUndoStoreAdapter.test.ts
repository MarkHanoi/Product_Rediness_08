// @vitest-environment happy-dom
//
// §ADR-051 per-type undo rollout — unit gate for elementUndoStoreAdapter (OI-054 B1+B2).
// Proves undo (remove) + redo (add) drive the legacy store's mutators across the
// duck-typed surface variants (getById vs get, remove vs delete) so Ctrl+Z / Ctrl+Y
// revert both data and geometry for every element type.
//
// ⚠ WHAT THIS SUITE CANNOT TELL YOU (§L-977, 2026-08-18). `makeStandardStore` and
// `makeVariantStore` below are hand-written Maps whose `update` MERGES and which
// validate nothing. That is not what the real stores do: `SlabStore`,
// `ColumnStore`, `FurnitureStore` and `PlumbingStore` REPLACE the whole record,
// `ColumnStore` and `RoomStore` THROW on some arguments, and `WallStore` branches
// on which keys are PRESENT. These fakes were MORE CAPABLE than their subjects, so
// this file stayed green for three years while Ctrl+Z after a slab move left the
// record as `{holes: []}` — A FAKE BUILT FROM THE HEADER CANNOT FALSIFY THE
// HEADER.
//
// It is kept, deliberately: the duck-typed SURFACE (which accessor, which
// mutator, snapshot/restore ordering) is genuinely what it tests, and a fake is
// the right instrument for that. The SEMANTICS — merge vs replace, refusals, and
// the field write itself — are proved against the REAL stores in
// `LegacyStoreUpdateSemantics.measured.test.ts`. Do not add a semantics case here.

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

// ─────────────────────────────────────────────────────────────────────────────
// §EI-7b (C84 §3) — A PATCH DEEPER THAN THE ADAPTER CAN APPLY MUST NEVER BE
// FLATTENED INTO A TOP-LEVEL WRITE.
//
// THE DEFECT THESE PIN. The field-level arm took `field = p.path[1]` and wrote
// `store.update(id, { [field]: p.value })` for a patch of ANY depth. Immer's
// inverse for an array append is `{op:'replace', path:[id,'panels','length'],
// value: oldLen}` (`generateArrayPatches` — "one inverse patch for the length
// change"), so `curtain-wall.addPanel` + Ctrl+Z executed
// `curtainWallStore.update(cwId, { panels: 3 })` and THE PANELS ARRAY BECAME A
// NUMBER. Live, reachable, non-refusing — `plugins/curtain-wall`
// `AddPanel.ts:97` (`c.panels.push`), `SetCurtainWallPanelType.ts:73,83-85`,
// `AddCurtainGridLine.ts:90`, `RemoveCurtainGridLine.ts:98`.
//
// The second trapdoor: the `openings` arm coerced ANY non-array patch value to
// `[]` before handing it to the hosted reconciler, so a deep `openings` patch
// (`[wallId,'openings','length']`, `[wallId,'openings',0,'width']`) reconciled
// the wall to ZERO openings — stripping every door and window from it.
//
// C84's governing sentence, from `packages/geometry-wall/src/WallRake.ts:50-62`:
// "A refusal is a correct answer; a silently-wrong wall is not." Corrupting is
// strictly worse than refusing — so the fix APPLIES the sub-path where it can,
// and REFUSES LOUDLY (record untouched) where it cannot.
// ─────────────────────────────────────────────────────────────────────────────

/** A curtain wall as the legacy store holds it — `panels` is an ARRAY. */
function seedCurtainWall() {
  return {
    id: 'curtainwall_EI7B',
    type: 'curtain-wall',
    levelId: 'L0',
    panels: [
      { id: 'panel_a', row: 0, col: 0, kind: 'glazed', rotation: 0 },
      { id: 'panel_b', row: 0, col: 1, kind: 'spandrel', rotation: 0 },
      { id: 'panel_c', row: 1, col: 0, kind: 'glazed', rotation: 0 },
    ],
  };
}

describe('§EI-7b — deep patches must not be flattened into a top-level write', () => {
  it('curtain-wall addPanel undo: {path:[id,"panels","length"], value:2} keeps panels an ARRAY', () => {
    const s = makeStandardStore();
    s.add(seedCurtainWall());
    // The EXACT inverse Immer mints for `c.panels.push(...)` on a 2-panel wall.
    elementUndoStoreAdapter(s).applyPatch([
      { op: 'replace', path: ['curtainwall_EI7B', 'panels', 'length'], value: 2 },
    ]);
    const cw = s.map.get('curtainwall_EI7B');
    // THE ASSERTION THE DEFECT FAILS: pre-fix `panels` is the NUMBER 2.
    expect(Array.isArray(cw.panels)).toBe(true);
    // …and the append is actually reverted: the third panel is gone, the first
    // two survive untouched.
    expect(cw.panels).toHaveLength(2);
    expect(cw.panels.map((p: any) => p.id)).toEqual(['panel_a', 'panel_b']);
  });

  it('setPanelType undo: {path:[id,"panels",1,"kind"], value:"glazed"} edits the PANEL, not the array', () => {
    const s = makeStandardStore();
    s.add(seedCurtainWall());
    elementUndoStoreAdapter(s).applyPatch([
      { op: 'replace', path: ['curtainwall_EI7B', 'panels', 1, 'kind'], value: 'glazed' },
    ]);
    const cw = s.map.get('curtainwall_EI7B');
    // Pre-fix this wrote `{ panels: 'glazed' }` — the array became a STRING.
    expect(Array.isArray(cw.panels)).toBe(true);
    expect(cw.panels).toHaveLength(3);
    expect(cw.panels[1].kind).toBe('glazed');
    expect(cw.panels[0]).toEqual(seedCurtainWall().panels[0]);   // neighbours untouched
    expect(cw.panels[2]).toEqual(seedCurtainWall().panels[2]);
  });

  it('addGridLine undo: a nested object sub-path is applied in place', () => {
    const s = makeStandardStore();
    s.add({ id: 'cw2', type: 'curtain-wall', levelId: 'L0', gridSystem: { uLines: [{ id: 'u0', t: 0 }], vLines: [] } });
    elementUndoStoreAdapter(s).applyPatch([
      { op: 'replace', path: ['cw2', 'gridSystem', 'uLines'], value: [{ id: 'u0', t: 0 }, { id: 'u1', t: 0.5 }] },
    ]);
    const cw = s.map.get('cw2');
    expect(cw.gridSystem.uLines).toHaveLength(2);
    expect(cw.gridSystem.vLines).toEqual([]);   // sibling preserved, not clobbered
  });

  it('REFUSES (leaves the record untouched) when the sub-path has no anchor in the legacy record', () => {
    // The legacy curtain-wall record is bridge-mapped (gridXSpacing…) and may hold
    // NO `panels` array at all — §OI-054 REDO-SHAPE-FIX. A deep patch into a field
    // the record does not have cannot be applied; inventing one is the corruption.
    const s = makeStandardStore();
    const legacy = { id: 'cw3', type: 'curtain-wall', levelId: 'L0', gridXSpacing: 1.2 };
    s.add({ ...legacy });
    elementUndoStoreAdapter(s).applyPatch([
      { op: 'replace', path: ['cw3', 'panels', 'length'], value: 2 },
    ]);
    expect(s.map.get('cw3')).toEqual(legacy);   // byte-identical — nothing invented
    expect(s.map.get('cw3').panels).toBeUndefined();
  });

  it('never lets a deep patch write a non-container over a container (the whole class)', () => {
    for (const value of [3, 'glazed', null, true]) {
      const s = makeStandardStore();
      s.add(seedCurtainWall());
      elementUndoStoreAdapter(s).applyPatch([
        { op: 'replace', path: ['curtainwall_EI7B', 'panels', 'length'], value },
      ]);
      expect(Array.isArray(s.map.get('curtainwall_EI7B').panels), `value=${String(value)}`).toBe(true);
    }
  });
});

describe('§EI-7b — the `openings` trapdoor: a non-array value must never strip every opening', () => {
  /** Host-wall store with the hosted-opening mutators the reconciler drives. */
  function makeWallOpeningStore(wall: any) {
    return {
      wall,
      getById: (id: string) => (id === wall.id ? wall : undefined),
      update: () => { throw new Error('generic update() must NOT be used for openings'); },
      removeOpening: (_w: string, oid: string) => { wall.openings = wall.openings.filter((o: any) => o.id !== oid); },
      addOpening: (_w: string, o: any) => { wall.openings = [...wall.openings, o]; },
    };
  }

  it('{path:[wallId,"openings","length"], value:1} truncates to ONE opening — it does not strip both', () => {
    const wall: any = {
      id: 'W_EI7B',
      openings: [{ id: 'o1', elementId: 'd1', type: 'door' }, { id: 'o2', elementId: 'w1', type: 'window' }],
    };
    const store = makeWallOpeningStore(wall);
    // Immer's inverse for "a second opening was pushed onto a 1-opening wall".
    elementUndoStoreAdapter(store as any).applyPatch([
      { op: 'replace', path: ['W_EI7B', 'openings', 'length'], value: 1 },
    ]);
    // Pre-fix: `Array.isArray(1)` is false → target `[]` → BOTH openings removed.
    expect(wall.openings.map((o: any) => o.id)).toEqual(['o1']);
  });

  it('{path:[wallId,"openings",0,"width"], value:0.9} keeps both openings', () => {
    const wall: any = {
      id: 'W_EI7B',
      openings: [{ id: 'o1', elementId: 'd1', type: 'door', width: 1.2 }, { id: 'o2', elementId: 'w1', type: 'window' }],
    };
    const store = makeWallOpeningStore(wall);
    elementUndoStoreAdapter(store as any).applyPatch([
      { op: 'replace', path: ['W_EI7B', 'openings', 0, 'width'], value: 0.9 },
    ]);
    // Pre-fix: `Array.isArray(0.9)` is false → target `[]` → the wall lost its
    // door AND its window because a door got 30 cm narrower.
    expect(wall.openings.map((o: any) => o.id)).toEqual(['o1', 'o2']);
  });

  it('a depth-2 `openings` replace carrying a NON-array value is REFUSED, not read as []', () => {
    const wall: any = { id: 'W_EI7B', openings: [{ id: 'o1', elementId: 'd1', type: 'door' }] };
    const store = makeWallOpeningStore(wall);
    elementUndoStoreAdapter(store as any).applyPatch([
      { op: 'replace', path: ['W_EI7B', 'openings'], value: 7 as unknown },
    ]);
    expect(wall.openings.map((o: any) => o.id)).toEqual(['o1']);   // untouched
  });

  it('POSITIVE CONTROL — a well-formed depth-2 `openings` array still reconciles to empty', () => {
    // Proves the arms above measure the DEPTH/SHAPE guard and not a blanket
    // "openings are never removed" — the legitimate undo still closes the hole.
    const wall: any = { id: 'W_EI7B', openings: [{ id: 'o1', type: 'door' }] };
    const store = makeWallOpeningStore(wall);
    elementUndoStoreAdapter(store as any).applyPatch([
      { op: 'replace', path: ['W_EI7B', 'openings'], value: [] },
    ]);
    expect(wall.openings).toEqual([]);
  });
});
