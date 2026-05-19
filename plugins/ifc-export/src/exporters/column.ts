/**
 * Column exporter — emits `IfcColumn` extruded along its height.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { Column } from '@pryzm/plugin-sdk';

import { label, writeEntity } from '../api/webifc-helpers.js';
import { buildBoxRepresentation, buildLocalPlacement } from '../geometry.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { IFCMetaStoreLike } from '../types.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';
import { resolveStorey } from '../hierarchy.js';
import type { ExportedElement } from './wall.js';

export interface ColumnExportArgs {
  api: IfcAPI;
  modelId: number;
  hierarchy: HierarchyRefs;
  ownerRefs: OwnerHistoryRefs;
  metaStore: IFCMetaStoreLike;
  column: Column;
  guid: GuidProvider;
}

export function exportColumn(args: ColumnExportArgs): ExportedElement {
  const { api, modelId, hierarchy, ownerRefs, metaStore, column, guid } = args;
  return withSpan(
    'pryzm.ifc.export-column',
    () => {
      const meta = metaStore.get(column.id);
      const storey = resolveStorey(hierarchy, column.levelId || null);

      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: column.origin.x, y: column.origin.z, z: column.origin.y + column.baseOffset },
        rotationZ: column.rotation,
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: column.width, depth: column.depth, height: column.height },
      );

      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Column ${column.id.slice(0, 8)}`;

      // IFCCOLUMN(GlobalId, OwnerHistory, Name, Description, ObjectType,
      //           ObjectPlacement, Representation, Tag, PredefinedType)
      const entity = writeEntity(
        api,
        modelId,
        WebIFC.IFCCOLUMN,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, column.id),
        'COLUMN',
      );

      return { entity, storey, pryzmId: column.id };
    },
    {
      'pryzm.ifc.element_id': column.id,
      'pryzm.ifc.element_type': 'column',
    },
  );
}
