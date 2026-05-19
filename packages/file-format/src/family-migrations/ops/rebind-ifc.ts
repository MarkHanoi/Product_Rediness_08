// Op #6: rebind-ifc (S57 §19.6).
//
// Re-points a parameter's IFC mapping to a different (Pset, Property)
// pair.  Updates BOTH `document.parameters[*].ifcMapping` (the
// in-document hint) AND `ifcMapping.parameters[*]` (the side-car).
//
// `pset === null` clears the binding entirely — also removes the
// side-car entry.

import type { Migrator, RawFamily } from '../types.js';

export interface RebindIfcParams {
  readonly parameterId: string;
  readonly newPset: string | null;
  readonly newProperty: string | null;
}

export function makeRebindIfcMigrator(
  from: string,
  to: string,
  params: RebindIfcParams,
): Migrator {
  return {
    id: `rebind-ifc:${params.parameterId}`,
    from,
    to,
    description:
      params.newPset === null
        ? `clear IFC binding on parameter ${params.parameterId}`
        : `rebind parameter ${params.parameterId} → ${params.newPset}.${params.newProperty}`,
    apply(input: RawFamily): RawFamily {
      const target = input.document.parameters.find(
        (p) => p.id === params.parameterId,
      );
      if (!target) throw new Error(`parameter ${params.parameterId} not found`);

      const newInDoc =
        params.newPset === null || params.newProperty === null
          ? null
          : { psetName: params.newPset, propertyName: params.newProperty };

      const parameters = input.document.parameters.map((p) =>
        p.id === params.parameterId ? { ...p, ifcMapping: newInDoc } : p,
      );

      let ifcMapping = input.ifcMapping;
      if (ifcMapping) {
        const filtered = ifcMapping.parameters.filter(
          (m) => m.parameterId !== params.parameterId,
        );
        const next =
          newInDoc === null
            ? filtered
            : [
                ...filtered,
                {
                  parameterId: params.parameterId,
                  psetName: newInDoc.psetName,
                  propertyName: newInDoc.propertyName,
                },
              ];
        ifcMapping = { ...ifcMapping, parameters: next };
      }

      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to as '1.0',
          parameters,
        },
        ifcMapping,
        events: input.events,
      };
    },
  };
}
