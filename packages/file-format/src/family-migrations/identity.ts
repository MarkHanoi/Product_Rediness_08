// Identity migrator (S57 deliverable §19.6 item 1: scaffold).
//
// The identity migrator is the canonical fixture for "no breaking
// changes between two versions yet still version-bumped" — used by
// the `family-migration` gate as a sanity floor that the framework
// itself does not corrupt the bundle.

import type { Migrator, RawFamily } from './types.js';

export function identityMigrator(from: string, to: string): Migrator {
  return {
    id: `identity-${from}-to-${to}`,
    from,
    to,
    description: `identity migration ${from} → ${to} (no breaking change)`,
    apply(input: RawFamily): RawFamily {
      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to as '1.0',
        },
        ifcMapping: input.ifcMapping ? { ...input.ifcMapping } : undefined,
        events: input.events,
      };
    },
  };
}
