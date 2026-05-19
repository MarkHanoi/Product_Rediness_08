// Op #2: add-parameter (S57 §19.6).
//
// Appends a brand-new parameter to `document.parameters`.  Validates
// that the id is unique.  Optionally seeds `defaults[parameterId]`
// with the supplied default value.

import type { FamilyParameter } from '../../family-schema.js';
import type { Migrator, RawFamily } from '../types.js';

export interface AddParameterParams {
  readonly parameter: FamilyParameter;
  readonly seedDefault?: number | string | boolean | null;
}

export function makeAddParameterMigrator(
  from: string,
  to: string,
  params: AddParameterParams,
): Migrator {
  return {
    id: `add-parameter:${params.parameter.id}`,
    from,
    to,
    description: `add parameter ${params.parameter.name}`,
    apply(input: RawFamily): RawFamily {
      const exists = input.document.parameters.some(
        (p) => p.id === params.parameter.id,
      );
      if (exists)
        throw new Error(`parameter ${params.parameter.id} already present`);
      const parameters = [...input.document.parameters, params.parameter];
      const defaults =
        params.seedDefault === undefined
          ? input.document.defaults
          : {
              ...input.document.defaults,
              [params.parameter.id]: params.seedDefault,
            };
      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to as '1.0',
          parameters,
          defaults,
        },
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
