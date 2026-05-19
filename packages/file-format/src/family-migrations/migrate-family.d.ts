import type { MigratorRegistry } from './registry.js';
import type { ChainResult, RawFamily } from './types.js';
export declare const PRYZM_FAMILY_MIGRATE_TRACER = "pryzm.family.migrate";
export interface MigrateFamilyOptions {
    /** When true, validate `input.manifest` + `input.document` at chain
     *  entry.  Defaults to `true`.  Disable only for tests that want to
     *  feed a transient frame through a single op. */
    readonly validateEntry?: boolean;
    /** When true, validate the post-chain `manifest` + `document` via
     *  `FamilyDocumentSchema`.  Defaults to `true`. */
    readonly validateExit?: boolean;
}
export type MigrateFamilyResult = ChainResult & {
    readonly entrySchemaErrors?: readonly string[];
    readonly exitSchemaErrors?: readonly string[];
};
export declare function migrateFamily(input: RawFamily, registry: MigratorRegistry, targetVersion: string, opts?: MigrateFamilyOptions): MigrateFamilyResult;
//# sourceMappingURL=migrate-family.d.ts.map