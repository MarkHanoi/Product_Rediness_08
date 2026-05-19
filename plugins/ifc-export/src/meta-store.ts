/**
 * In-memory `IFCMetaStore` implementation.
 *
 * S55 will move this store into `@pryzm/stores` and wire it to the event log;
 * S56 needs it standing here so the export pipeline can be exercised end-to-end
 * in this sprint without a load-order dependency on the import side.
 *
 * Surface intentionally matches the side-car contract sketched in
 * `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` §1.2.
 */

import type {
  IFCElementMeta,
  IFCMetaStoreLike,
  Pset,
  PsetValue,
  Qset,
} from './types.js';

export class InMemoryIFCMetaStore implements IFCMetaStoreLike {
  private readonly elements = new Map<string, IFCElementMeta>();
  private readonly globalIdIndex = new Map<string, string>();

  /** Register or replace metadata for a PRYZM element. */
  add(meta: IFCElementMeta): void {
    this.elements.set(meta.pryzmElementId, meta);
    this.globalIdIndex.set(meta.globalId, meta.pryzmElementId);
  }

  get(pryzmElementId: string): IFCElementMeta | undefined {
    return this.elements.get(pryzmElementId);
  }

  getByGlobalId(globalId: string): IFCElementMeta | undefined {
    const id = this.globalIdIndex.get(globalId);
    return id ? this.elements.get(id) : undefined;
  }

  /** Number of registered elements (used by tests + observability). */
  size(): number {
    return this.elements.size;
  }

  /** Mutate (or insert) a single Pset property. */
  updatePset(
    pryzmElementId: string,
    psetName: string,
    propertyName: string,
    value: PsetValue,
  ): void {
    const meta = this.elements.get(pryzmElementId);
    if (!meta) return;
    const pset: Pset = meta.psets[psetName] ?? {};
    pset[propertyName] = value;
    meta.psets[psetName] = pset;
  }

  /** Mutate (or insert) a single quantity. */
  updateQuantity(
    pryzmElementId: string,
    qsetName: string,
    quantityName: string,
    value: number,
  ): void {
    const meta = this.elements.get(pryzmElementId);
    if (!meta) return;
    const quantities = meta.quantities ?? {};
    const qset: Qset = quantities[qsetName] ?? {};
    qset[quantityName] = value;
    quantities[qsetName] = qset;
    meta.quantities = quantities;
  }

  /**
   * Stable JSON serialisation suitable for inclusion in `.pryzm` v1.
   * Format mirrors `IFCMetaStore.serialize()` from S55 spec.
   */
  serialize(): { version: 1; elements: Record<string, IFCElementMeta> } {
    return {
      version: 1,
      elements: Object.fromEntries(this.elements),
    };
  }

  /**
   * Remove a single element's metadata entry.
   * Returns true if the element was present and deleted, false if it was not found.
   */
  delete(pryzmElementId: string): boolean {
    const meta = this.elements.get(pryzmElementId);
    if (!meta) return false;
    this.globalIdIndex.delete(meta.globalId);
    this.elements.delete(pryzmElementId);
    return true;
  }

  static deserialize(data: { version?: number; elements?: Record<string, IFCElementMeta> }): InMemoryIFCMetaStore {
    const store = new InMemoryIFCMetaStore();
    for (const meta of Object.values(data.elements ?? {})) {
      store.add(meta);
    }
    return store;
  }
}
