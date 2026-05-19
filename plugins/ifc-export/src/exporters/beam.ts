/**
 * Beam exporter — emits `IfcBeam` extruded along the centreline length.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { Beam } from '@pryzm/plugin-sdk';

import { label, writeEntity } from '../api/webifc-helpers.js';
import { buildBoxRepresentation, buildLocalPlacement } from '../geometry.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { IFCMetaStoreLike } from '../types.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';
import { resolveStorey } from '../hierarchy.js';
import type { ExportedElement } from './wall.js';

export interface BeamExportArgs {
  api: IfcAPI;
  modelId: number;
  hierarchy: HierarchyRefs;
  ownerRefs: OwnerHistoryRefs;
  metaStore: IFCMetaStoreLike;
  beam: Beam;
  guid: GuidProvider;
}

export function exportBeam(args: BeamExportArgs): ExportedElement {
  const { api, modelId, hierarchy, ownerRefs, metaStore, beam, guid } = args;
  return withSpan(
    'pryzm.ifc.export-beam',
    () => {
      const meta = metaStore.get(beam.id);
      const storey = resolveStorey(hierarchy, beam.levelId || null);

      const [a, b] = beam.baseLine;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.max(Math.hypot(dx, dz), 1e-3);
      const yaw = Math.atan2(dz, dx);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const elevation = (a.y + b.y) / 2;

      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: cx, y: cz, z: elevation },
        rotationZ: yaw,
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: length, depth: beam.width, height: beam.depth },
      );

      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Beam ${beam.id.slice(0, 8)}`;

      // IFCBEAM(GlobalId, OwnerHistory, Name, Description, ObjectType,
      //          ObjectPlacement, Representation, Tag, PredefinedType)
      const entity = writeEntity(
        api,
        modelId,
        WebIFC.IFCBEAM,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, beam.id),
        'BEAM',
      );

      return { entity, storey, pryzmId: beam.id };
    },
    {
      'pryzm.ifc.element_id': beam.id,
      'pryzm.ifc.element_type': 'beam',
    },
  );
}
