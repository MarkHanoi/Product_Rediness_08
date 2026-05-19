/**
 * Window exporter — emits `IfcWindow` mirroring the door exporter's pattern.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { Window } from '@pryzm/plugin-sdk';

import { label, real, writeEntity } from '../api/webifc-helpers.js';
import { buildBoxRepresentation, buildLocalPlacement } from '../geometry.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { IFCMetaStoreLike } from '../types.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';
import { resolveStorey } from '../hierarchy.js';
import type { ExportedElement } from './wall.js';

export interface WindowExportArgs {
  api: IfcAPI;
  modelId: number;
  hierarchy: HierarchyRefs;
  ownerRefs: OwnerHistoryRefs;
  metaStore: IFCMetaStoreLike;
  window: Window;
  guid: GuidProvider;
}

const WINDOW_THICKNESS = 0.05;

export function exportWindow(args: WindowExportArgs): ExportedElement {
  const { api, modelId, hierarchy, ownerRefs, metaStore, window: win, guid } = args;
  return withSpan(
    'pryzm.ifc.export-window',
    () => {
      const meta = metaStore.get(win.id);
      const storey = resolveStorey(hierarchy, null);

      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: win.offset, y: 0, z: win.sillHeight },
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: win.width, depth: WINDOW_THICKNESS, height: win.height },
      );

      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Window ${win.id.slice(0, 8)}`;

      // IFCWINDOW(GlobalId, OwnerHistory, Name, Description, ObjectType,
      //           ObjectPlacement, Representation, Tag, OverallHeight, OverallWidth,
      //           PredefinedType, PartitioningType, UserDefinedPartitioningType)
      const entity = writeEntity(
        api,
        modelId,
        WebIFC.IFCWINDOW,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, win.id),
        real(api, modelId, win.height),
        real(api, modelId, win.width),
        'WINDOW',
        win.windowType === 'double' ? 'DOUBLE_PANEL_HORIZONTAL' : 'SINGLE_PANEL',
        null,
      );

      return { entity, storey, pryzmId: win.id };
    },
    {
      'pryzm.ifc.element_id': win.id,
      'pryzm.ifc.element_type': 'window',
    },
  );
}
