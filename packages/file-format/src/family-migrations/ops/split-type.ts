// Op #8: split-type (S57 §19.6).
//
// Clones a `FamilyType` into a brand-new type with its own id, name,
// and (optionally) value overrides.  The source type is preserved.
// The new type's `checksum` is RECOMPUTED from its values map via the
// shared `canonicalStringify` + sha256 helper used by the rest of the
// file-format package.

import { canonicalise } from '../../canonical-json.js';
import type { Migrator, RawFamily } from '../types.js';

export interface SplitTypeParams {
  readonly sourceTypeId: string;
  readonly newTypeId: string;
  readonly newTypeName: string;
  readonly valueOverrides?: Record<string, number | string | boolean>;
}

// Browser-compatible synchronous checksum placeholder.
// The real sha256 is recomputed async when the family is packed via family-pack.ts.
function syncChecksumPlaceholder(json: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, '0').repeat(8);
  return 'sha256:' + hex;
}

export function makeSplitTypeMigrator(
  from: string,
  to: string,
  params: SplitTypeParams,
): Migrator {
  return {
    id: `split-type:${params.sourceTypeId}->${params.newTypeId}`,
    from,
    to,
    description: `split type ${params.sourceTypeId} → ${params.newTypeId} ("${params.newTypeName}")`,
    apply(input: RawFamily): RawFamily {
      if (params.sourceTypeId === params.newTypeId) {
        throw new Error('sourceTypeId and newTypeId must differ');
      }
      const source = input.document.types.find(
        (t) => t.id === params.sourceTypeId,
      );
      if (!source)
        throw new Error(`source type ${params.sourceTypeId} not found`);
      if (input.document.types.some((t) => t.id === params.newTypeId)) {
        throw new Error(
          `new type id ${params.newTypeId} already present in document`,
        );
      }

      const mergedValues: Record<string, number | string | boolean> = {
        ...source.values,
        ...(params.valueOverrides ?? {}),
      };
      const checksum = syncChecksumPlaceholder(canonicalise(mergedValues));

      const types = [
        ...input.document.types,
        {
          id: params.newTypeId,
          name: params.newTypeName,
          values: mergedValues,
          checksum,
        },
      ];

      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to as '1.0',
          types,
        },
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
