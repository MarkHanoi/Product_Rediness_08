// Op #4: change-parameter-type (S57 §19.6).
//
// Changes a parameter's `dataType` (e.g. `length` ↔ `number`).  The
// caller supplies a `valueConverter` that lifts each per-type value
// (in `document.types[*].values[parameterId]`) and the manifest
// `defaultValue` from the old shape to the new one.  When the
// converter omits a value, the original is left in place — useful for
// no-op widenings.

import type { FamilyParameterDataTypeSchema } from '../../family-schema.js';
import type { z } from 'zod';
import type { Migrator, RawFamily } from '../types.js';

export type FamilyParameterDataType = z.infer<
  typeof FamilyParameterDataTypeSchema
>;

export interface ChangeParameterTypeParams {
  readonly parameterId: string;
  readonly newDataType: FamilyParameterDataType;
  /** Pure value converter.  Receives the old typed value, returns the
   *  new one.  Throw to abort the migration. */
  readonly valueConverter: (
    oldValue: number | string | boolean | null,
  ) => number | string | boolean | null;
}

export function makeChangeParameterTypeMigrator(
  from: string,
  to: string,
  params: ChangeParameterTypeParams,
): Migrator {
  return {
    id: `change-parameter-type:${params.parameterId}`,
    from,
    to,
    description: `change parameter ${params.parameterId} dataType → ${params.newDataType}`,
    apply(input: RawFamily): RawFamily {
      const target = input.document.parameters.find(
        (p) => p.id === params.parameterId,
      );
      if (!target) throw new Error(`parameter ${params.parameterId} not found`);
      if (target.dataType === params.newDataType) {
        throw new Error(
          `parameter ${params.parameterId} already has dataType ${params.newDataType}`,
        );
      }

      const parameters = input.document.parameters.map((p) =>
        p.id === params.parameterId
          ? {
              ...p,
              dataType: params.newDataType,
              // Schema (`family-schema.ts` FamilyParameterDataTypeSchema.defaultValue)
              // accepts only `number | string | null`.  `valueConverter` is typed
              // wider (legacy boolean inputs/outputs) — coerce booleans here so
              // the migration output remains schema-conformant.
              defaultValue: coerceDefaultValue(params.valueConverter(p.defaultValue)),
            }
          : p,
      );

      const types = input.document.types.map((t) => {
        if (!(params.parameterId in t.values)) return t;
        const old = t.values[params.parameterId];
        const next = params.valueConverter(old ?? null);
        if (next === null) {
          const { [params.parameterId]: _r, ...rest } = t.values;
          return { ...t, values: rest };
        }
        return { ...t, values: { ...t.values, [params.parameterId]: next } };
      });

      const defaults = (params.parameterId in input.document.defaults)
        ? {
            ...input.document.defaults,
            [params.parameterId]: params.valueConverter(
              input.document.defaults[params.parameterId] ?? null,
            ),
          }
        : input.document.defaults;

      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to as '1.0',
          parameters,
          types,
          defaults,
        },
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}

/** Schema-conformant projection: schema rejects booleans for `defaultValue`. */
function coerceDefaultValue(
  v: number | string | boolean | null,
): number | string | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
