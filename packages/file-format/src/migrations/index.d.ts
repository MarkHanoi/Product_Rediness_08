import type { Manifest } from '@pryzm/persistence-client';
import type JSZip from 'jszip';
/**
 * One migration step.  `migrate` MUST return a manifest whose
 * `schemaVersion` equals `toVersion`.  The migration MAY also rewrite
 * the ZIP contents (e.g. to repack events into a new batch format).
 */
export interface MigrationStep {
    readonly fromVersion: number;
    readonly toVersion: number;
    readonly migrate: (rawManifest: unknown, zip: JSZip) => Promise<{
        manifest: unknown;
        zip: JSZip;
    }>;
}
/**
 * The append-only migration registry.  v0 represents PRYZM 1's
 * `project.json` Postgres blob — the migration is intentionally a stub
 * in Phase 1.  The full PRYZM 1 importer plugin lands in Phase 3D.
 */
export declare const MIGRATIONS: readonly MigrationStep[];
/**
 * Error raised by the v0→v1 stub.  Caller code can `instanceof`-check
 * this to surface a friendlier UX (`"Use the PRYZM 1 importer"`)
 * versus a generic migration failure.
 */
export declare class MigrationStubError extends Error {
    readonly code = "migration-stub";
    constructor(message: string);
}
/**
 * Raised when the file is on a schema version newer than this build
 * supports.  Caller should ask the user to update PRYZM.
 */
export declare class FutureVersionError extends Error {
    readonly fileVersion: number;
    readonly supportedVersion: number;
    readonly code = "future-version";
    constructor(fileVersion: number, supportedVersion: number);
}
/**
 * Apply migrations from `manifest.schemaVersion` up to the current
 * build's `PRYZM_FORMAT_SCHEMA_VERSION`.
 *
 * Returns the migrated manifest + zip on success.  Throws
 * `FutureVersionError` if the file is from a newer build, or
 * `MigrationStubError` (or any other error from a step's `migrate`)
 * if the migration itself fails.
 *
 * No-op (returns the inputs as-is) when `schemaVersion` already equals
 * the current version.
 */
export declare function migrate(rawManifest: unknown, zip: JSZip): Promise<{
    manifest: Manifest;
    zip: JSZip;
    migratedFromVersion: number | null;
}>;
//# sourceMappingURL=index.d.ts.map