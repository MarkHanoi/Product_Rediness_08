/**
 * IFC-export handler set (Wave 11 recipe completion).
 *
 * Wraps exportProjectToIFC + InMemoryIFCMetaStore into commandBus handlers
 * so ifc-export can be registered as a compliant L7 plugin.
 *
 * Architecture note: L7 plugins must not import @pryzm/command-bus (L1)
 * directly. We declare a minimal BusLike interface that accepts a simple
 * on(type, fn) registration surface — the host wires the real CommandBus
 * via the plugin-sdk adapter layer.
 *
 * Spec: PHASE-3B §S56 IFC Tier 1 Export + Pset Round-Trip.
 * Recipe status: [S H . . .] — handlers now wired.
 */

import { exportProjectToIFC } from '../orchestrator.js';
import { InMemoryIFCMetaStore } from '../meta-store.js';
import { IFC_EXPORT_COMMANDS } from '../intent.js';
import type { IFCExportPayload, IFCMetaUpsertPayload } from '../intent.js';
import type { PsetValue } from '../types.js';

export type { IFCExportCommandId } from '../intent.js';
export { IFC_EXPORT_COMMANDS };

/**
 * Minimal command-bus surface required by this plugin.
 * L7 plugins bind via @pryzm/plugin-sdk once it ships (Wave 20);
 * until then the host passes any object that satisfies this interface.
 */
export interface BusLike {
  on(type: string, handler: (payload: unknown) => Promise<unknown>): void;
}

export interface IFCExportHandlerDeps {
  /** Shared meta-store instance. If not supplied, a new one is created per export. */
  readonly metaStore?: InMemoryIFCMetaStore;
  /**
   * Called when export completes.
   * Host triggers a file download or hands bytes to a bake-worker.
   */
  onExported?(bytes: Uint8Array, filename: string): void;
}

export const IFC_EXPORT_HANDLER_TYPES = [
  IFC_EXPORT_COMMANDS.EXPORT,
  IFC_EXPORT_COMMANDS.META_STORE_UPSERT,
  IFC_EXPORT_COMMANDS.META_STORE_CLEAR,
] as const;

export type IFCExportHandlerType = typeof IFC_EXPORT_HANDLER_TYPES[number];

export function registerIFCExportHandlers(
  bus: BusLike,
  deps: IFCExportHandlerDeps = {},
): void {
  const metaStore = deps.metaStore ?? new InMemoryIFCMetaStore();

  bus.on(IFC_EXPORT_COMMANDS.EXPORT, async (raw) => {
    const payload = raw as IFCExportPayload;
    const result = await exportProjectToIFC(
      payload.snapshot,
      metaStore,
      payload.projectMeta,
    );
    const filename = payload.filename ?? 'export.ifc';
    deps.onExported?.(result.bytes, filename);
    return result;
  });

  /**
   * Upsert IFC metadata for a PRYZM element.
   *
   * Strategy: if the element already exists in the store, update its psets
   * property-by-property (preserving the original globalId, typeName, tier).
   * If it is a new entry, create it with safe defaults — typeName and tier
   * will be enriched by the importer on the next import→export round-trip.
   */
  bus.on(IFC_EXPORT_COMMANDS.META_STORE_UPSERT, async (raw) => {
    const payload = raw as IFCMetaUpsertPayload;
    const existing = metaStore.get(payload.elementId);

    if (existing) {
      for (const [psetName, pset] of Object.entries(payload.psets ?? {})) {
        for (const [propName, value] of Object.entries(pset)) {
          metaStore.updatePset(payload.elementId, psetName, propName, value as PsetValue);
        }
      }
    } else {
      metaStore.add({
        pryzmElementId: payload.elementId,
        globalId: payload.ifcGuid,
        typeName: 'IFCELEMENT', // safe default; enriched by importer on round-trip
        psets: payload.psets ?? {},
        tier: 1,
      });
    }
  });

  bus.on(IFC_EXPORT_COMMANDS.META_STORE_CLEAR, async (raw) => {
    const payload = raw as { elementId: string };
    metaStore.delete(payload.elementId);
  });
}
