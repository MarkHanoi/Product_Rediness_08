/**
 * Side-car `IFCMetaStore` population from the import side.
 *
 * Phase 3-B Sprint S57 — closes the round-trip with `@pryzm/plugin-ifc-export`.
 * On import, every entity (Tier 1 native + Tier 2 proxy) becomes one
 * `IFCElementMeta` row in the metaStore so the next export reuses the
 * original GlobalId and Pset state.
 */

import type { IFCElementMeta, IFCElementTier, IFCProxyDTO, Pset } from './types.js';

/**
 * Minimal meta-store contract — same structural type used by the exporter.
 * Importer-side adds `add()` so the exporter can simply call `get()`.
 */
export interface IFCMetaStoreSink {
  add(meta: IFCElementMeta): void;
  size(): number;
}

/**
 * Populate the meta-store from an `IFCProxyDTO`. The proxy's geometry hash
 * is preserved on the meta as `objectType` so the bake-worker cache key
 * is recoverable on re-export.
 */
export function metaFromProxy(
  proxy: IFCProxyDTO,
  pryzmElementId?: string,
): IFCElementMeta {
  return {
    pryzmElementId: pryzmElementId ?? proxy.id,
    globalId: proxy.globalId,
    typeName: proxy.ifcTypeName,
    name: proxy.name,
    objectType: proxy.geometryHash,
    psets: proxy.psets,
    tier: 2,
  };
}

/**
 * Populate the meta-store from a Tier 1 record. Used when the S55 import
 * pipeline lands; called per element after the wall/slab/door/window/
 * column/beam DTO is built.
 */
export function metaFromTier1(args: {
  pryzmElementId: string;
  globalId: string;
  ifcTypeName: string;
  name?: string;
  description?: string;
  objectType?: string;
  psets: Record<string, Pset>;
}): IFCElementMeta {
  return {
    pryzmElementId: args.pryzmElementId,
    globalId: args.globalId,
    typeName: args.ifcTypeName,
    name: args.name,
    description: args.description,
    objectType: args.objectType,
    psets: args.psets,
    tier: 1 as IFCElementTier,
  };
}

/**
 * Bulk-populate a sink from a mix of proxies and tier-1 metas.
 */
export function populateSink(
  sink: IFCMetaStoreSink,
  args: {
    proxies?: ReadonlyArray<IFCProxyDTO>;
    tier1?: ReadonlyArray<IFCElementMeta>;
  },
): { added: number } {
  let added = 0;
  for (const proxy of args.proxies ?? []) {
    sink.add(metaFromProxy(proxy));
    added++;
  }
  for (const meta of args.tier1 ?? []) {
    sink.add(meta);
    added++;
  }
  return { added };
}
