/**
 * Slab exporter — emits `IfcSlab` with a swept box body sized to the slab's
 * AABB. Round-trips Pset metadata via the side-car `IFCMetaStore`.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { Slab } from '@pryzm/plugin-sdk';

import { label, writeEntity } from '../api/webifc-helpers.js';
import { buildBoxRepresentation, buildLocalPlacement } from '../geometry.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { IFCMetaStoreLike } from '../types.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';
import { resolveStorey } from '../hierarchy.js';
import type { ExportedElement } from './wall.js';

export interface SlabExportArgs {
  api: IfcAPI;
  modelId: number;
  hierarchy: HierarchyRefs;
  ownerRefs: OwnerHistoryRefs;
  metaStore: IFCMetaStoreLike;
  slab: Slab;
  guid: GuidProvider;
}

export function exportSlab(args: SlabExportArgs): ExportedElement {
  const { api, modelId, hierarchy, ownerRefs, metaStore, slab, guid } = args;
  return withSpan(
    'pryzm.ifc.export-slab',
    () => {
      const meta = metaStore.get(slab.id);
      const storey = resolveStorey(hierarchy, slab.levelId || null);

      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let yElev = 0;
      for (const v of slab.boundary) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
        yElev = v.y;
      }
      const width = Math.max(maxX - minX, 1e-3);
      const depth = Math.max(maxZ - minZ, 1e-3);
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const elevation = yElev + slab.baseOffset;

      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: cx, y: cz, z: elevation },
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width, depth, height: slab.thickness },
      );

      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Slab ${slab.id.slice(0, 8)}`;

      // IFCSLAB(GlobalId, OwnerHistory, Name, Description, ObjectType,
      //          ObjectPlacement, Representation, Tag, PredefinedType)
      const entity = writeEntity(
        api,
        modelId,
        WebIFC.IFCSLAB,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, slab.id),
        'FLOOR',
      );

      return { entity, storey, pryzmId: slab.id };
    },
    {
      'pryzm.ifc.element_id': slab.id,
      'pryzm.ifc.element_type': 'slab',
    },
  );
}
