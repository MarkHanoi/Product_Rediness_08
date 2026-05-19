/**
 * `exportProjectToIFC` — entry point for `@pryzm/plugin-ifc-export`.
 *
 * Pipeline:
 *   1. Initialise `web-ifc` and create an IFC4 model.
 *   2. Build the OwnerHistory chain (Person + Org + Application).
 *   3. Build the spatial hierarchy (Project → Site → Building → Storeys) +
 *      units + geometric representation context.
 *   4. For each Tier 1 element family, walk the snapshot and emit the IFC
 *      entity + Pset relationships (round-tripping IFCMetaStore data).
 *   5. Group elements per storey and emit one
 *      `IfcRelContainedInSpatialStructure` per storey.
 *   6. `SaveModel` → `Uint8Array`.
 *
 * Wrapped in a single root `pryzm.ifc.export` span; per-element work is
 * wrapped in `pryzm.ifc.export-{wall|slab|door|window|column|beam}` spans;
 * Pset writes are wrapped in `pryzm.ifc.export-pset` spans (sprint exit
 * criterion lines 716–723 of the phase doc).
 */

import * as WebIFC from 'web-ifc';

import { writeEntity } from './api/webifc-helpers.js';
import { exportBeam } from './exporters/beam.js';
import { exportColumn } from './exporters/column.js';
import { exportDoor } from './exporters/door.js';
import { exportSlab } from './exporters/slab.js';
import { exportWall, type ExportedElement } from './exporters/wall.js';
import { exportWindow } from './exporters/window.js';
import { buildHierarchy } from './hierarchy.js';
import { mintGlobalId, type GuidProvider } from './guid-provider.js';
import { buildOwnerHistory } from './owner-history.js';
import { withSpan } from './otel.js';
import { writeAllPsets } from './psets.js';
import type {
  ExportOptions,
  IFCMetaStoreLike,
  ProjectMeta,
  ProjectSnapshot,
} from './types.js';

export interface ExportResult {
  /** Serialised IFC4 file ready to write to disk. */
  bytes: Uint8Array;
  /** Per-family export counts (useful for tests + observability). */
  counts: {
    walls: number;
    slabs: number;
    doors: number;
    windows: number;
    columns: number;
    beams: number;
    psets: number;
    properties: number;
  };
}

export async function exportProjectToIFC(
  snapshot: ProjectSnapshot,
  metaStore: IFCMetaStoreLike,
  projectMeta: ProjectMeta,
  options: ExportOptions = {},
): Promise<ExportResult> {
  return withSpan('pryzm.ifc.export', async (span) => {
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const modelId = api.CreateModel({ schema: WebIFC.Schemas.IFC4 });
    const guid: GuidProvider = options.guidProvider;
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);

    try {
      const ownerRefs = buildOwnerHistory(api, modelId, projectMeta, timestamp);
      const hierarchy = buildHierarchy(
        api,
        modelId,
        projectMeta,
        snapshot.levels ?? [],
        ownerRefs,
        guid,
      );

      const exported: ExportedElement[] = [];
      let psetCount = 0;
      let propertyCount = 0;

      const runPsets = (el: ExportedElement) => {
        const meta = metaStore.get(el.pryzmId);
        if (!meta || Object.keys(meta.psets).length === 0) return;
        const r = writeAllPsets({
          api,
          modelId,
          ownerRefs,
          element: el.entity,
          meta,
          guid,
        });
        psetCount += r.psetCount;
        propertyCount += r.propertyCount;
      };

      for (const wall of snapshot.walls ?? []) {
        const el = exportWall({ api, modelId, hierarchy, ownerRefs, metaStore, wall, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const slab of snapshot.slabs ?? []) {
        const el = exportSlab({ api, modelId, hierarchy, ownerRefs, metaStore, slab, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const door of snapshot.doors ?? []) {
        const el = exportDoor({ api, modelId, hierarchy, ownerRefs, metaStore, door, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const window of snapshot.windows ?? []) {
        const el = exportWindow({ api, modelId, hierarchy, ownerRefs, metaStore, window, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const column of snapshot.columns ?? []) {
        const el = exportColumn({ api, modelId, hierarchy, ownerRefs, metaStore, column, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const beam of snapshot.beams ?? []) {
        const el = exportBeam({ api, modelId, hierarchy, ownerRefs, metaStore, beam, guid });
        exported.push(el);
        runPsets(el);
      }

      // Group by storey and emit one IfcRelContainedInSpatialStructure per
      // storey. Without this relation, IFC viewers reject the elements as
      // "unassigned" and exclude them from quantity take-offs.
      const byStorey = new Map<number, { storey: ExportedElement['storey']; elements: ExportedElement['entity'][] }>();
      for (const el of exported) {
        const key = el.storey.expressID;
        const bucket = byStorey.get(key);
        if (bucket) bucket.elements.push(el.entity);
        else byStorey.set(key, { storey: el.storey, elements: [el.entity] });
      }
      for (const { storey, elements } of byStorey.values()) {
        // IFCRELCONTAINEDINSPATIALSTRUCTURE(GlobalId, OwnerHistory, Name,
        //   Description, RelatedElements, RelatingStructure)
        writeEntity(
          api,
          modelId,
          WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
          mintGlobalId(api, modelId, guid),
          ownerRefs.ownerHistory,
          null,
          null,
          elements,
          storey,
        );
      }

      const counts = {
        walls: snapshot.walls?.length ?? 0,
        slabs: snapshot.slabs?.length ?? 0,
        doors: snapshot.doors?.length ?? 0,
        windows: snapshot.windows?.length ?? 0,
        columns: snapshot.columns?.length ?? 0,
        beams: snapshot.beams?.length ?? 0,
        psets: psetCount,
        properties: propertyCount,
      };
      span.setAttribute('pryzm.ifc.export.element_count', exported.length);
      span.setAttribute('pryzm.ifc.export.pset_count', psetCount);
      span.setAttribute('pryzm.ifc.export.property_count', propertyCount);

      const bytes = api.SaveModel(modelId);
      return { bytes, counts };
    } finally {
      try {
        api.CloseModel(modelId);
      } catch {
        // CloseModel can throw if the model was already discarded; ignore.
      }
    }
  });
}
