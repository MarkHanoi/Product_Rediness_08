import { FamilyDocumentSchema, FamilyManifestSchema } from '../family-schema.js';
import type { Migrator, RawFamily } from './types.js';
/** The version this migrator lifts FROM. */
export declare const V1_0 = "1.0";
/** The version this migrator lifts TO — pinned to the schema's own
 *  constant so the two can never drift apart silently. */
export declare const V1_1 = "1.1";
/** Lifts a v1.0 bundle to v1.1.
 *
 *  ⛔ BUMPS **BOTH** VERSION FIELDS, AND THAT IS A REPAIR.  The container
 *  carries `formatVersion` on the manifest AND on the document, and they
 *  are independent strings.  Every pre-existing migrator in this package
 *  — `identityMigrator` and all eight ops — bumps ONLY the document's,
 *  so a bundle that had been migrated by any of them carried manifest
 *  '1.0' beside document '1.1': two answers to "what version is this
 *  file?" inside one ZIP.  `registry.run` keys off the DOCUMENT field
 *  while `unpackFamily` refuses off the MANIFEST field, so the two
 *  disagreeing is not cosmetic — it decides whether the file opens.
 *  `assertVersionCoherent` below is the guard, applied on both sides. */
export declare function makeV1_0ToV1_1Migrator(): Migrator;
/** The registered instance. */
export declare const v1_0ToV1_1Migrator: Migrator;
/** ⛔ Refuses when the manifest and the document disagree about what
 *  version the bundle is.  Both numbers are named, per C16 CA-18 —
 *  a refusal that reports only one of two disagreeing quantities makes
 *  the reader go and find the other one. */
export declare function assertVersionCoherent(input: RawFamily, expected: string): void;
/** Convenience: a registry preloaded with every migrator this build
 *  ships, so a caller does not hand-assemble the chain (and cannot
 *  forget one).  ⛔ Import `MigratorRegistry` lazily via the caller —
 *  this module must not import the registry, because `registry.ts`
 *  does not import migrators and the arrow must stay one-way. */
export declare const ALL_VERSION_MIGRATORS: readonly Migrator[];
/** Re-exported for tests and for the round-trip proof, so an assertion
 *  about "the current schema" cannot silently drift from the schema. */
export { FamilyDocumentSchema, FamilyManifestSchema };
//# sourceMappingURL=v1_0-to-v1_1.d.ts.map