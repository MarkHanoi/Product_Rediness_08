/**
 * Tests for `InMemoryIFCMetaStore` (the side-car that survives until S55 lands
 * the production store in `@pryzm/stores`).
 */

import { describe, expect, it } from 'vitest';

import { InMemoryIFCMetaStore } from '../src/meta-store.js';
import type { IFCElementMeta } from '../src/types.js';

const sample: IFCElementMeta = {
  pryzmElementId: 'wall_00000000000000000000000WAA',
  globalId: 'A'.repeat(22),
  typeName: 'IFCWALLSTANDARDCASE',
  name: 'Sample Wall',
  psets: {
    Pset_WallCommon: { FireRating: '60min' },
  },
  tier: 1,
};

describe('InMemoryIFCMetaStore', () => {
  it('stores and retrieves element metadata by PRYZM id and GlobalId', () => {
    const store = new InMemoryIFCMetaStore();
    store.add(sample);

    expect(store.size()).toBe(1);
    expect(store.get(sample.pryzmElementId)).toEqual(sample);
    expect(store.getByGlobalId(sample.globalId)).toEqual(sample);
    expect(store.get('missing')).toBeUndefined();
    expect(store.getByGlobalId('missing')).toBeUndefined();
  });

  it('updates Pset properties without touching unrelated state', () => {
    const store = new InMemoryIFCMetaStore();
    store.add(sample);

    store.updatePset(sample.pryzmElementId, 'Pset_WallCommon', 'IsExternal', true);
    store.updatePset(sample.pryzmElementId, 'Pset_Custom', 'Reference', 'W-001');

    const meta = store.get(sample.pryzmElementId);
    expect(meta?.psets.Pset_WallCommon).toEqual({
      FireRating: '60min',
      IsExternal: true,
    });
    expect(meta?.psets.Pset_Custom).toEqual({ Reference: 'W-001' });
  });

  it('updates quantities and lazily creates the holder', () => {
    const store = new InMemoryIFCMetaStore();
    store.add(sample);
    store.updateQuantity(sample.pryzmElementId, 'Qto_WallBaseQuantities', 'Length', 4);
    store.updateQuantity(sample.pryzmElementId, 'Qto_WallBaseQuantities', 'GrossArea', 12);
    expect(store.get(sample.pryzmElementId)?.quantities).toEqual({
      Qto_WallBaseQuantities: { Length: 4, GrossArea: 12 },
    });
  });

  it('round-trips through serialize / deserialize', () => {
    const store = new InMemoryIFCMetaStore();
    store.add(sample);
    store.updatePset(sample.pryzmElementId, 'Pset_WallCommon', 'IsExternal', true);

    const json = store.serialize();
    expect(json.version).toBe(1);

    const restored = InMemoryIFCMetaStore.deserialize(json);
    expect(restored.size()).toBe(1);
    expect(restored.get(sample.pryzmElementId)?.psets.Pset_WallCommon).toEqual({
      FireRating: '60min',
      IsExternal: true,
    });
  });
});
