/**
 * Door exporter — emits `IfcDoor` with overall width/height attributes plus a
 * swept-solid box body so the door is visible in viewers that ignore openings.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { Door } from '@pryzm/plugin-sdk';

import { label, real, writeEntity } from '../api/webifc-helpers.js';
import { buildBoxRepresentation, buildLocalPlacement } from '../geometry.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { IFCMetaStoreLike } from '../types.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';
import { resolveStorey } from '../hierarchy.js';
import type { ExportedElement } from './wall.js';

export interface DoorExportArgs {
  api: IfcAPI;
  modelId: number;
  hierarchy: HierarchyRefs;
  ownerRefs: OwnerHistoryRefs;
  metaStore: IFCMetaStoreLike;
  door: Door;
  guid: GuidProvider;
}

const DOOR_THICKNESS = 0.05;

export function exportDoor(args: DoorExportArgs): ExportedElement {
  const { api, modelId, hierarchy, ownerRefs, metaStore, door, guid } = args;
  return withSpan(
    'pryzm.ifc.export-door',
    () => {
      const meta = metaStore.get(door.id);
      const storey = resolveStorey(hierarchy, null);

      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: door.offset, y: 0, z: door.sillHeight },
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: door.width, depth: DOOR_THICKNESS, height: door.height },
      );

      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Door ${door.id.slice(0, 8)}`;

      // IFCDOOR(GlobalId, OwnerHistory, Name, Description, ObjectType,
      //         ObjectPlacement, Representation, Tag, OverallHeight, OverallWidth,
      //         PredefinedType, OperationType, UserDefinedOperationType)
      const entity = writeEntity(
        api,
        modelId,
        WebIFC.IFCDOOR,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, door.id),
        real(api, modelId, door.height),
        real(api, modelId, door.width),
        'DOOR',
        door.doorType === 'double' ? 'DOUBLE_SWING_LEFT' : 'SINGLE_SWING_LEFT',
        null,
      );

      return { entity, storey, pryzmId: door.id };
    },
    {
      'pryzm.ifc.element_id': door.id,
      'pryzm.ifc.element_type': 'door',
    },
  );
}
