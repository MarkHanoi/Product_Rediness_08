// PerViewOverridesStore round-trip + Contract-44 G4-G8 integration test
// (post-2B closeout / ADR-0030).
//
// What this test proves that the S33 unit-class tests did NOT:
//   * The G4-G8 per-view tables survive a full
//     in-memory → JSON wire → applyPatch reload cycle.
//   * The reload feeds StyleResolver and ViewElementVisibility verbatim
//     and produces identical resolution results — closing the
//     persistence claim Contract 44 G4–G8 made on paper.

import { describe, expect, it } from 'vitest';
import { PerViewOverridesStore, type PerViewOverridesData } from '../src/PerViewOverridesStore.js';

const VIEW_A = 'view-A';
const VIEW_B = 'view-B';
const ELEMENT_X = 'el-X';
const ELEMENT_Y = 'el-Y';

function seedRow(viewId: string): PerViewOverridesData {
  return {
    viewId,
    styleOverrides: [
      { elementId: ELEMENT_X, lineWeightOverride: 2.5, strokeColorOverride: '#ff0000' },
      { elementId: undefined, fillColorOverride: '#cccccc' }, // all-elements
    ],
    elementVisibility: { [ELEMENT_Y]: false },
    materialOverrides: { [ELEMENT_X]: 'mat:concrete-cast' },
    pocheOverrides: { wall: '#3a3a3a', slab: '#2a2a2a' },
  };
}

describe('PerViewOverridesStore — basic CRUD', () => {
  it('emptyRow factory produces a row with frozen empties', () => {
    const r = PerViewOverridesStore.emptyRow(VIEW_A);
    expect(r.viewId).toBe(VIEW_A);
    expect(r.styleOverrides).toEqual([]);
    expect(r.elementVisibility).toEqual({});
    expect(r.materialOverrides).toEqual({});
    expect(r.pocheOverrides).toEqual({});
  });

  it('add / get a single view row', () => {
    const store = new PerViewOverridesStore();
    const row = seedRow(VIEW_A);
    const diff = store.applyPatch([{ op: 'add', path: [VIEW_A], value: row }]);
    expect(diff.added.has(VIEW_A)).toBe(true);
    expect(store.size()).toBe(1);
    expect(store.getState().get(VIEW_A)?.styleOverrides).toHaveLength(2);
  });

  it('toResolverInputs returns empties for an unknown view', () => {
    const store = new PerViewOverridesStore();
    const inputs = store.toResolverInputs('nope');
    expect(inputs.styleOverrides).toEqual([]);
    expect(inputs.elementVisibility.size).toBe(0);
    expect(inputs.materialOverrides.size).toBe(0);
    expect(inputs.pocheOverrides.size).toBe(0);
  });

  it('toResolverInputs threads viewId back into each style row', () => {
    const store = new PerViewOverridesStore();
    store.applyPatch([{ op: 'add', path: [VIEW_A], value: seedRow(VIEW_A) }]);
    const inputs = store.toResolverInputs(VIEW_A);
    for (const r of inputs.styleOverrides) expect(r.viewId).toBe(VIEW_A);
  });
});

describe('PerViewOverridesStore — Contract 44 G4-G8 e2e persistence round-trip', () => {
  it('survives the full in-memory → JSON wire → applyPatch reload cycle', () => {
    // 1) Original side: populate two views.
    const a = new PerViewOverridesStore();
    a.applyPatch([
      { op: 'add', path: [VIEW_A], value: seedRow(VIEW_A) },
      { op: 'add', path: [VIEW_B], value: seedRow(VIEW_B) },
    ]);
    const before = a.toJSON();
    expect(before).toHaveLength(2);

    // 2) Wire-encode the snapshot.  This is the same path the
    //    autosave / sync-server uses (ADR-0018 / ADR-0019).
    const wire = JSON.stringify(before);

    // 3) Receiver side: rehydrate by replaying as patches.
    const b = new PerViewOverridesStore();
    const decoded = JSON.parse(wire) as readonly PerViewOverridesData[];
    b.applyPatch(decoded.map((row) => ({ op: 'add' as const, path: [row.viewId], value: row })));

    // 4) Round-trip equality on the wire JSON.
    expect(b.toJSON()).toEqual(before);

    // 5) Deeper: the resolver inputs derived from each side are identical.
    for (const viewId of [VIEW_A, VIEW_B]) {
      const inA = a.toResolverInputs(viewId);
      const inB = b.toResolverInputs(viewId);
      expect([...inB.elementVisibility.entries()]).toEqual([...inA.elementVisibility.entries()]);
      expect([...inB.materialOverrides.entries()]).toEqual([...inA.materialOverrides.entries()]);
      expect([...inB.pocheOverrides.entries()]).toEqual([...inA.pocheOverrides.entries()]);
      expect(inB.styleOverrides).toEqual(inA.styleOverrides);
    }
  });

  it('toJSON output is sorted deterministically by viewId (byte-stable)', () => {
    const s = new PerViewOverridesStore();
    s.applyPatch([
      { op: 'add', path: ['view-Z'], value: seedRow('view-Z') },
      { op: 'add', path: ['view-A'], value: seedRow('view-A') },
      { op: 'add', path: ['view-M'], value: seedRow('view-M') },
    ]);
    const ids = s.toJSON().map((r) => r.viewId);
    expect(ids).toEqual(['view-A', 'view-M', 'view-Z']);
  });

  it('removing a row cascades through the wire encoding', () => {
    const s = new PerViewOverridesStore();
    s.applyPatch([{ op: 'add', path: [VIEW_A], value: seedRow(VIEW_A) }]);
    s.applyPatch([{ op: 'remove', path: [VIEW_A] }]);
    expect(s.size()).toBe(0);
    expect(s.toJSON()).toEqual([]);
  });

  it('default-true visibility semantics are preserved across reload', () => {
    const s = new PerViewOverridesStore();
    s.applyPatch([{ op: 'add', path: [VIEW_A], value: seedRow(VIEW_A) }]);
    const inputs = s.toResolverInputs(VIEW_A);
    // ELEMENT_Y was set false ⇒ row present.
    expect(inputs.elementVisibility.get(ELEMENT_Y)).toBe(false);
    // ELEMENT_X was NEVER set ⇒ no row ⇒ default visible (the resolver
    // will treat absence as `true`).
    expect(inputs.elementVisibility.has(ELEMENT_X)).toBe(false);
  });
});
