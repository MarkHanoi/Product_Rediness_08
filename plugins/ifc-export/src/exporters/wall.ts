/**
 * Wall exporter — emits `IfcWallStandardCase` with a swept-solid box body.
 *
 * Wrapped in a `pryzm.ifc.export-wall` span (sprint exit criterion).
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { Wall } from '@pryzm/plugin-sdk';

import { label, writeEntity, type EntityRef } from '../api/webifc-helpers.js';
import { buildBoxRepresentation, buildLocalPlacement } from '../geometry.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { IFCMetaStoreLike } from '../types.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';
import { resolveStorey } from '../hierarchy.js';

export interface WallExportArgs {
  api: IfcAPI;
  modelId: number;
  hierarchy: HierarchyRefs;
  ownerRefs: OwnerHistoryRefs;
  metaStore: IFCMetaStoreLike;
  wall: Wall;
  guid: GuidProvider;
}

export interface ExportedElement {
  entity: EntityRef;
  storey: EntityRef;
  pryzmId: string;
}

export function exportWall(args: WallExportArgs): ExportedElement {
  const { api, modelId, hierarchy, ownerRefs, metaStore, wall, guid } = args;
  return withSpan(
    'pryzm.ifc.export-wall',
    () => {
      const meta = metaStore.get(wall.id);
      const storey = resolveStorey(hierarchy, wall.levelId || null);

      // Geometry: midpoint placement, length-aligned X axis.
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

      // IFCWALLSTANDARDCASE(GlobalId, OwnerHistory, Name, Description, ObjectType,
      //                      ObjectPlacement, Representation, Tag, PredefinedType)
      const entity = writeEntity(
        api,
        modelId,
        WebIFC.IFCWALLSTANDARDCASE,
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
      'pryzm.ifc.element_type': 'wall',
    },
  );
}
