/**
 * `IfcPropertySet` writers.
 *
 * For every IFCMetaStore Pset registered against an element we emit:
 *   - one or more `IfcPropertySingleValue`s
 *   - one `IfcPropertySet` referencing them
 *   - one `IfcRelDefinesByProperties` linking the Pset back to the element
 *
 * Each Pset write is wrapped in a `pryzm.ifc.export-pset` span (sprint exit
 * criterion).
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

import {
  identifier,
  label,
  valueFromScalar,
  writeEntity,
  type EntityRef,
} from './api/webifc-helpers.js';
import { mintGlobalId, type GuidProvider } from './guid-provider.js';
import { withSpan } from './otel.js';
import type { IFCElementMeta, Pset } from './types.js';
import type { OwnerHistoryRefs } from './owner-history.js';

export interface PsetExportArgs {
  api: IfcAPI;
  modelId: number;
  ownerRefs: OwnerHistoryRefs;
  element: EntityRef;
  meta: IFCElementMeta;
  guid: GuidProvider;
}

export function writeAllPsets(args: PsetExportArgs): { psetCount: number; propertyCount: number } {
  const { meta } = args;
  let psetCount = 0;
  let propertyCount = 0;
  for (const [psetName, pset] of Object.entries(meta.psets)) {
    const written = writeSinglePset(args, psetName, pset);
    if (written > 0) {
      psetCount += 1;
      propertyCount += written;
    }
  }
  return { psetCount, propertyCount };
}

function writeSinglePset(args: PsetExportArgs, psetName: string, pset: Pset): number {
  const { api, modelId, ownerRefs, element, guid, meta } = args;
  return withSpan(
    'pryzm.ifc.export-pset',
    () => {
      const properties: EntityRef[] = [];
      for (const [propName, propValue] of Object.entries(pset)) {
        if (propValue === null || propValue === undefined) continue;
        const valueRef = valueFromScalar(api, modelId, propValue as string | number | boolean);
        const property = writeEntity(
          api,
          modelId,
          WebIFC.IFCPROPERTYSINGLEVALUE,
          identifier(api, modelId, propName), // Name (IfcIdentifier)
          null, // Description
          valueRef, // NominalValue (IfcValue)
          null, // Unit (IfcUnit)
        );
        properties.push(property);
      }
      if (properties.length === 0) return 0;

      const propertySet = writeEntity(
        api,
        modelId,
        WebIFC.IFCPROPERTYSET,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        label(api, modelId, psetName),
        null, // Description
        properties,
      );

      writeEntity(
        api,
        modelId,
        WebIFC.IFCRELDEFINESBYPROPERTIES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null, null,
        [element],
        propertySet,
      );

      return properties.length;
    },
    {
      'pryzm.ifc.element_id': meta.pryzmElementId,
      'pryzm.ifc.pset_name': psetName,
      'pryzm.ifc.property_count': Object.keys(pset).length,
    },
  );
}
