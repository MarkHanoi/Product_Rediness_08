// Op #3: delete-parameter (S57 §19.6).
//
// Removes a parameter from `document.parameters` and scrubs every
// reference to its id from:
//   - `document.types[*].values[parameterId]`
//   - `document.profiles[*].constraints[*].parameterRef`
//   - `ifcMapping.parameters[*]` entries with matching parameterId
//
// ⛔ §C111-TWO-DEFAULT-CHANNELS (C111 §5.3-b, delta D-5) — v1.1.
//   `document.defaults` is GONE.  It was a SECOND answer to "what is
//   this parameter's default?", maintained by this op and two siblings
//   and READ BY NO RESOLVER — which is exactly what made a dead channel
//   look alive.  §5.3-a: `FamilyParameter.defaultValue` is the sole
//   definition-default authority.  ⛔ §5.3-c: adding a reader back is
//   the FORBIDDEN fix — it mints the second source of truth §76 gate B
//   exists to prevent.
//
// `lengthExpression` strings that mention the deleted parameter's
// NAME are NOT auto-rewritten — that would silently change geometry.
// Instead, the migrator throws if any expression still references the
// name, forcing the author to land a paired `rename-parameter` or
// expression-rewrite migrator first.

import type { Migrator, RawFamily } from '../types.js';

export interface DeleteParameterParams {
  readonly parameterId: string;
}

export function makeDeleteParameterMigrator(
  from: string,
  to: string,
  params: DeleteParameterParams,
): Migrator {
  return {
    id: `delete-parameter:${params.parameterId}`,
    from,
    to,
    description: `delete parameter ${params.parameterId}`,
    apply(input: RawFamily): RawFamily {
      const target = input.document.parameters.find(
        (p) => p.id === params.parameterId,
      );
      if (!target) throw new Error(`parameter ${params.parameterId} not found`);

      const referencingSolid = input.document.solids.find((s) => {
        if (s.kind !== 'extrude') return false;
        const re = new RegExp(`\\b${escapeRegex(target.name)}\\b`);
        return re.test(s.lengthExpression);
      });
      if (referencingSolid) {
        throw new Error(
          `cannot delete parameter ${params.parameterId}: solid ` +
            `${referencingSolid.id}.lengthExpression references ` +
            `"${target.name}"; rewrite or rename it first`,
        );
      }

      // §U8-DELETE-SEES-PROFILES (lane U8) — the same guard, one array over.
      // Expression-valued profile coordinates have been evaluated since lane 4D
      // (spec §67) and every box authored by `add-box-solid` binds two of them;
      // deleting the parameter underneath one left a document whose PROFILE no
      // longer evaluated while this op reported success. Same rule as the
      // solid arm: refuse and name the holder, never silently change geometry.
      for (const profile of input.document.profiles) {
        for (const entity of profile.entities) {
          for (const [key, value] of Object.entries(entity.data)) {
            if (key === 'p1' || key === 'p2' || key === 'center') continue;
            if (typeof value !== 'string') continue;
            if (!new RegExp(`\\b${escapeRegex(target.name)}\\b`).test(value)) continue;
            throw new Error(
              `cannot delete parameter ${params.parameterId}: profile ${profile.id} entity ` +
                `${entity.id} coordinate '${key}' is the expression "${value}", which references ` +
                `"${target.name}"; rewrite the geometry or rename it first`,
            );
          }
        }
      }

      const parameters = input.document.parameters.filter(
        (p) => p.id !== params.parameterId,
      );
      const profiles = input.document.profiles.map((pr) => ({
        ...pr,
        constraints: pr.constraints.map((c) =>
          c.parameterRef === params.parameterId
            ? { ...c, parameterRef: null }
            : c,
        ),
      }));
      const types = input.document.types.map((t) => {
        const { [params.parameterId]: _removed, ...rest } = t.values;
        return { ...t, values: rest };
      });
      const ifcMapping = input.ifcMapping
        ? {
            ...input.ifcMapping,
            parameters: input.ifcMapping.parameters.filter(
              (m) => m.parameterId !== params.parameterId,
            ),
          }
        : undefined;

      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to,
          parameters,
          profiles,
          types,
        },
        ifcMapping,
        events: input.events,
      };
    },
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
