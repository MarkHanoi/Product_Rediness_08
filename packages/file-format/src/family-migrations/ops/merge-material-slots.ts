// Op #7: merge-material-slots (S57 §19.6).
//
// Replaces every reference to `removeSlotId` with `keepSlotId` and
// removes the redundant slot from `document.materialSlots`.  Errors
// when the slots are the same.

import type { Migrator, RawFamily } from '../types.js';

export interface MergeMaterialSlotsParams {
  readonly keepSlotId: string;
  readonly removeSlotId: string;
}

export function makeMergeMaterialSlotsMigrator(
  from: string,
  to: string,
  params: MergeMaterialSlotsParams,
): Migrator {
  return {
    id: `merge-material-slots:${params.removeSlotId}->${params.keepSlotId}`,
    from,
    to,
    description: `merge material slot ${params.removeSlotId} into ${params.keepSlotId}`,
    apply(input: RawFamily): RawFamily {
      if (params.keepSlotId === params.removeSlotId) {
        throw new Error('keepSlotId and removeSlotId must differ');
      }
      const keep = input.document.materialSlots.find(
        (s) => s.id === params.keepSlotId,
      );
      const remove = input.document.materialSlots.find(
        (s) => s.id === params.removeSlotId,
      );
      if (!keep) throw new Error(`keep slot ${params.keepSlotId} not found`);
      if (!remove)
        throw new Error(`remove slot ${params.removeSlotId} not found`);

      const materialSlots = input.document.materialSlots.filter(
        (s) => s.id !== params.removeSlotId,
      );
      const solids = input.document.solids.map((s) =>
        s.materialSlotId === params.removeSlotId
          ? { ...s, materialSlotId: params.keepSlotId }
          : s,
      );

      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to as '1.0',
          materialSlots,
          solids,
        },
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
