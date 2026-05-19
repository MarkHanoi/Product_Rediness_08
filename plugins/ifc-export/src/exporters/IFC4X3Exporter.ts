/**
 * IFC4X3 exporter — exports PRYZM Tier 1 elements to the IFC4X3 schema.
 *
 * CONTRACT (C05 §3): IFC4X3 is the primary schema for infrastructure
 * (rail, road, bridge) projects. Key differences from the IFC4 path:
 *
 *   • `api.CreateModel({ schema: WebIFC.Schemas.IFC4X3 })` — the serialised
 *     STEP file gets `FILE_SCHEMA(('IFC4X3'))` in the header, which is
 *     required by OpenBIM infrastructure tools (e.g. Tekla, Bentley).
 *   • Walls are emitted as `IFCWALL` (PredefinedType: 'STANDARD') because
 *     `IFCWALLSTANDARDCASE` is deprecated (but not removed) in IFC4X3.
 *     All other Tier 1 entity types (IFCSLAB, IFCDOOR, IFCWINDOW, IFCCOLUMN,
 *     IFCBEAM) are identical between IFC4 and IFC4X3 schemas.
 *
 * Wave A17-T4 — Sprint S126.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { Wall } from '@pryzm/plugin-sdk';

import { writeEntity, label } from '../api/webifc-helpers.js';
import { buildBoxRepresentation, buildLocalPlacement } from '../geometry.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import { buildOwnerHistory } from '../owner-history.js';
import { buildHierarchy, resolveStorey } from '../hierarchy.js';
import { writeAllPsets } from '../psets.js';
import { exportSlab } from './slab.js';
import { exportDoor } from './door.js';
import { exportWindow } from './window.js';
import { exportColumn } from './column.js';
import { exportBeam } from './beam.js';
import type { ExportedElement } from './wall.js';
import type {
  ExportOptions,
  IFCMetaStoreLike,
  ProjectMeta,
  ProjectSnapshot,
} from '../types.js';
import type { ExportResult } from '../orchestrator.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';

// ---------------------------------------------------------------------------
// IFC4X3 wall exporter — IFCWALL (not IFCWALLSTANDARDCASE)
// ---------------------------------------------------------------------------

interface WallIFC4X3ExportArgs {
  api: IfcAPI;
  modelId: number;
  hierarchy: HierarchyRefs;
  ownerRefs: OwnerHistoryRefs;
  metaStore: IFCMetaStoreLike;
  wall: Wall;
  guid: GuidProvider;
}

function exportWallIFC4X3(args: WallIFC4X3ExportArgs): ExportedElement {
  const { api, modelId, hierarchy, ownerRefs, metaStore, wall, guid } = args;
  return withSpan(
    'pryzm.ifc.export4x3-wall',
    () => {
      const meta = metaStore.get(wall.id);
      const storey = resolveStorey(hierarchy, wall.levelId || null);

      const [a, b] = wall.baseLine;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const yaw = Math.atan2(dz, dx);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const elevation = a.y + wall.baseOffset;

      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: cx, y: cz, z: elevation },
        rotationZ: yaw,
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: length, depth: wall.thickness, height: wall.height },
      );

      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Wall ${wall.id.slice(0, 8)}`;

      // IFC4X3 uses IFCWALL with PredefinedType (IFCWALLSTANDARDCASE deprecated).
      const entity = writeEntity(
        api,
        modelId,
        WebIFC.IFCWALL,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, wall.id),
        'STANDARD',
      );

      return { entity, storey, pryzmId: wall.id };
    },
    {
      'pryzm.ifc.element_id': wall.id,
      'pryzm.ifc.element_type': 'wall-ifc4x3',
    },
  );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Export a PRYZM project snapshot to an IFC4X3 STEP file.
 *
 * Mirrors `exportProjectToIFC` from `orchestrator.ts` but serialises with
 * `WebIFC.Schemas.IFC4X3` so the output carries `FILE_SCHEMA(('IFC4X3'))`.
 */
export async function exportProjectToIFC4X3(
  snapshot: ProjectSnapshot,
  metaStore: IFCMetaStoreLike,
  projectMeta: ProjectMeta,
  options: ExportOptions = {},
): Promise<ExportResult> {
  return withSpan('pryzm.ifc.export4x3', async (span) => {
    const api = new WebIFC.IfcAPI();
    await api.Init();

    // IFC4X3 schema — this controls the FILE_SCHEMA header in the STEP output.
    const modelId = api.CreateModel({ schema: WebIFC.Schemas.IFC4X3 });
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
        const el = exportWallIFC4X3({ api, modelId, hierarchy, ownerRefs, metaStore, wall, guid });
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

      // Group by storey → one IfcRelContainedInSpatialStructure per storey.
      const byStorey = new Map<number, { storey: ExportedElement['storey']; elements: ExportedElement['entity'][] }>();
      for (const el of exported) {
        const key = el.storey.expressID;
        const bucket = byStorey.get(key);
        if (bucket) bucket.elements.push(el.entity);
        else byStorey.set(key, { storey: el.storey, elements: [el.entity] });
      }
      for (const { storey, elements } of byStorey.values()) {
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
      span.setAttribute('pryzm.ifc.export4x3.element_count', exported.length);
      span.setAttribute('pryzm.ifc.export4x3.pset_count', psetCount);

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
