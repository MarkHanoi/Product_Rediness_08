// Op #2: add-parameter (S57 §19.6).
//
// Appends a brand-new parameter to `document.parameters`.  Validates
// that the id is unique.
//
// ⛔ §C111-TWO-DEFAULT-CHANNELS (C111 §5.3-b, delta D-5) — v1.1.
//   This op used to ALSO seed `document.defaults[parameterId]` from a
//   `seedDefault` param.  Both are GONE.  `document.defaults` was a
//   second answer to "what is this parameter's default?" that NO
//   RESOLVER READ — `resolveParameter` takes {parameters, type,
//   instanceOverrides} and never sees the document — while this op and
//   two siblings kept it faithfully up to date, WHICH IS WHAT MADE IT
//   LOOK ALIVE.  §5.3-a: `FamilyParameter.defaultValue` is the SOLE
//   definition-default authority, and `params.parameter` already
//   carries it.  ⛔ §5.3-c: adding a reader is the FORBIDDEN fix.
//   Removing `seedDefault` is deliberate: a caller still passing it now
//   fails to COMPILE, which is the refusal we want at the one moment
//   someone tries to re-open the second channel.

import type { FamilyParameter } from '../../family-schema.js';
import type { Migrator, RawFamily } from '../types.js';

export interface AddParameterParams {
  readonly parameter: FamilyParameter;
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
      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to,
          parameters,
        },
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
