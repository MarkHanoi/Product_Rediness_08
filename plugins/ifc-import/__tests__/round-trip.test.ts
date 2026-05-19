/**
 * Round-trip test (Phase 3-B Sprint S57).
 *
 * Validates that exporter-side `IFCElementMeta` rows survive when re-bound
 * through the importer-side `populateSink()` helper. The shape parity
 * between the export plugin's `IFCElementMeta` and the importer's
 * `IFCMetaStoreSink` is what closes the round-trip.
 */

import { describe, expect, it } from 'vitest';
import { InMemoryIFCMetaStore } from '@pryzm/plugin-ifc-export';
import {
  metaFromProxy,
  metaFromTier1,
  populateSink,
  type IFCMetaStoreSink,
  type IFCProxyDTO,
} from '../src/index.js';

function adaptStore(store: InMemoryIFCMetaStore): IFCMetaStoreSink {
  return {
    add: (meta) => store.add(meta),
    size: () => store.size(),
  };
}

const PROXY: IFCProxyDTO = {
  id: 'proxy-FURN-1',
  globalId: '1aBcD3fGhIjKlMnOpQrStU',
  ifcTypeName: 'IFCFURNITURE',
  name: 'Conference Chair',
  transform: new Float32Array(16),
  geometryHash: 'sha256-deadbeef',
  psets: {
    Pset_FurnitureCommon: { Reference: 'CHAIR-01', IsExternal: false },
    Pset_Custom: { Vendor: 'Acme' },
  },
  tier: 2,
};

describe('round-trip via populateSink', () => {
  it('preserves Tier 2 proxy GlobalId + psets in the meta store', () => {
    const store = new InMemoryIFCMetaStore();
    const { added } = populateSink(adaptStore(store), { proxies: [PROXY] });
    expect(added).toBe(1);

    const back = store.get('proxy-FURN-1');
    expect(back).toBeDefined();
    expect(back!.globalId).toBe(PROXY.globalId);
    expect(back!.tier).toBe(2);
    expect(back!.typeName).toBe('IFCFURNITURE');
    expect(back!.psets.Pset_FurnitureCommon.Reference).toBe('CHAIR-01');
    expect(back!.psets.Pset_Custom.Vendor).toBe('Acme');
    // geometryHash piggy-backs on objectType for re-export
    expect(back!.objectType).toBe('sha256-deadbeef');
  });

  it('preserves Tier 1 metadata so subsequent re-export reuses GlobalId', () => {
    const store = new InMemoryIFCMetaStore();
    const tier1 = metaFromTier1({
      pryzmElementId: 'wall-7',
      globalId: '2xYzAbCdEfGhIjKlMnOpQr',
      ifcTypeName: 'IFCWALLSTANDARDCASE',
      name: 'Exterior Wall',
      psets: { Pset_WallCommon: { IsExternal: true, FireRating: '60' } },
    });
    populateSink(adaptStore(store), { tier1: [tier1] });

    const back = store.get('wall-7')!;
    expect(back?.globalId).toBe('2xYzAbCdEfGhIjKlMnOpQr');
    expect(back?.tier).toBe(1);
    expect(back?.psets.Pset_WallCommon.FireRating).toBe('60');
  });

  it('counts both proxies and tier1 in a single populate call', () => {
    const store = new InMemoryIFCMetaStore();
    const tier1 = metaFromTier1({
      pryzmElementId: 'door-1',
      globalId: '3qrstuvwxyzABCDEFGHIJK',
      ifcTypeName: 'IFCDOOR',
      psets: {},
    });
    const { added } = populateSink(adaptStore(store), { proxies: [PROXY], tier1: [tier1] });
    expect(added).toBe(2);
    expect(store.size()).toBe(2);
  });
});

describe('metaFromProxy', () => {
  it('uses pryzmElementId override when supplied', () => {
    const meta = metaFromProxy(PROXY, 'override-1');
    expect(meta.pryzmElementId).toBe('override-1');
  });

  it('defaults pryzmElementId to proxy.id', () => {
    const meta = metaFromProxy(PROXY);
    expect(meta.pryzmElementId).toBe(PROXY.id);
  });
});
