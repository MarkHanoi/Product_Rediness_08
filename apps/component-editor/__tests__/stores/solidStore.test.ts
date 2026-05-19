// solidStore tests (S53 D6) — covers §12.2 LOD bitmask wiring.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOD_BITMASK,
  createSolidStore,
  isVisibleAt,
  type LodBitmask,
  type SolidId,
} from '../../src/stores/solidStore.js';

describe('solidStore — basic CRUD', () => {
  it('starts empty', () => {
    const store = createSolidStore();
    expect(store.get().solids).toEqual([]);
    expect(store.get().byId).toEqual({});
    expect(store.get().version).toBe(0);
  });

  it('add returns an id and increments the version', () => {
    const store = createSolidStore();
    const v0 = store.get().version;
    const id = store.add({ name: 'Frame', kind: 'extrude' });
    expect(typeof id).toBe('string');
    expect(store.get().solids).toHaveLength(1);
    expect(store.get().byId[id]!.name).toBe('Frame');
    expect(store.get().version).toBe(v0 + 1);
  });

  it('add without an explicit lod uses DEFAULT_LOD_BITMASK { f, t, t }', () => {
    const store = createSolidStore();
    const id = store.add({ name: 'Frame', kind: 'extrude' });
    const lod = store.get().byId[id]!.lod;
    expect(lod).toEqual(DEFAULT_LOD_BITMASK);
    expect(lod.coarse).toBe(false);
    expect(lod.medium).toBe(true);
    expect(lod.fine).toBe(true);
  });

  it('add with explicit lod respects every flag independently', () => {
    const store = createSolidStore();
    const id = store.add({
      name: 'Trim',
      kind: 'sweep',
      lod: { coarse: true, medium: false, fine: true },
    });
    const lod = store.get().byId[id]!.lod;
    expect(lod.coarse).toBe(true);
    expect(lod.medium).toBe(false);
    expect(lod.fine).toBe(true);
  });

  it('add rejects duplicate ids', () => {
    const store = createSolidStore();
    const id = store.add({ id: 's-1' as SolidId, name: 'A', kind: 'extrude' });
    expect(() => store.add({ id, name: 'B', kind: 'sweep' })).toThrow(/duplicate id/);
  });

  it('add rejects empty names', () => {
    const store = createSolidStore();
    expect(() => store.add({ name: '', kind: 'extrude' })).toThrow(/name must be a non-empty string/);
  });

  it('add rejects malformed lod bitmasks', () => {
    const store = createSolidStore();
    expect(() =>
      store.add({
        name: 'X',
        kind: 'extrude',
        lod: { coarse: 1 as unknown as boolean, medium: true, fine: true },
      }),
    ).toThrow(/lod bitmask must be all booleans/);
  });

  it('remove deletes the solid and bumps the version', () => {
    const store = createSolidStore();
    const id = store.add({ name: 'Frame', kind: 'extrude' });
    const v1 = store.get().version;
    store.remove(id);
    expect(store.get().solids).toHaveLength(0);
    expect(store.get().version).toBe(v1 + 1);
  });

  it('remove of an unknown id is a no-op (no version bump)', () => {
    const store = createSolidStore();
    const v0 = store.get().version;
    store.remove('s-missing' as SolidId);
    expect(store.get().version).toBe(v0);
  });

  it('clear empties the store and bumps the version once', () => {
    const store = createSolidStore();
    store.add({ name: 'Frame', kind: 'extrude' });
    store.add({ name: 'Trim', kind: 'sweep' });
    const v0 = store.get().version;
    store.clear();
    expect(store.get().solids).toHaveLength(0);
    expect(store.get().version).toBe(v0 + 1);
    // Idempotent.
    store.clear();
    expect(store.get().version).toBe(v0 + 1);
  });
});

describe('solidStore — setLodBitmask', () => {
  it('replaces the bitmask and bumps the version', () => {
    const store = createSolidStore();
    const id = store.add({ name: 'Frame', kind: 'extrude' });
    const v0 = store.get().version;
    const next: LodBitmask = { coarse: true, medium: false, fine: true };
    store.setLodBitmask(id, next);
    expect(store.get().byId[id]!.lod).toEqual(next);
    expect(store.get().version).toBeGreaterThan(v0);
  });

  it('rejects unknown ids', () => {
    const store = createSolidStore();
    expect(() =>
      store.setLodBitmask('s-missing' as SolidId, DEFAULT_LOD_BITMASK),
    ).toThrow(/unknown id/);
  });

  it('rejects malformed bitmasks', () => {
    const store = createSolidStore();
    const id = store.add({ name: 'Frame', kind: 'extrude' });
    expect(() =>
      store.setLodBitmask(id, {
        coarse: 'yes' as unknown as boolean,
        medium: true,
        fine: true,
      }),
    ).toThrow(/lod bitmask must be all booleans/);
  });
});

describe('solidStore — setMaterialSlot', () => {
  it('binds and unbinds a material slot', () => {
    const store = createSolidStore();
    const id = store.add({ name: 'Frame', kind: 'extrude' });
    expect(store.get().byId[id]!.materialSlot).toBeNull();
    store.setMaterialSlot(id, 'Frame.Surface');
    expect(store.get().byId[id]!.materialSlot).toBe('Frame.Surface');
    store.setMaterialSlot(id, null);
    expect(store.get().byId[id]!.materialSlot).toBeNull();
  });
});

describe('solidStore — subscribe', () => {
  it('notifies subscribers on every mutation', () => {
    const store = createSolidStore();
    const seen: number[] = [];
    const unsub = store.subscribe((s) => seen.push(s.version));
    const id = store.add({ name: 'Frame', kind: 'extrude' });
    store.setLodBitmask(id, { coarse: true, medium: true, fine: true });
    store.remove(id);
    unsub();
    store.add({ name: 'Trim', kind: 'sweep' });
    expect(seen.length).toBeGreaterThanOrEqual(3);
    // After unsub the next add should NOT have notified.
    expect(seen[seen.length - 1]).not.toBe(store.get().version);
  });
});

describe('isVisibleAt', () => {
  it('reads each LOD level independently', () => {
    const mask: LodBitmask = { coarse: true, medium: false, fine: true };
    expect(isVisibleAt(mask, 'coarse')).toBe(true);
    expect(isVisibleAt(mask, 'medium')).toBe(false);
    expect(isVisibleAt(mask, 'fine')).toBe(true);
  });
});
