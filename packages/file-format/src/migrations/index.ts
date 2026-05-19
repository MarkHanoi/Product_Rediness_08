// .pryzm migration framework.
//
// Spec source: phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md §S20
// (lines 528-575).
//
// **Invariant — append-only**: once a `MigrationStep` has shipped in a
// release, it is NEVER removed.  Removing a step would break the
// upgrade path for any project that skipped intermediate versions.
// New steps are always appended; the registry is in version order.
//
// **Invariant — semantic version monotonicity**: each step's
// `toVersion` MUST equal `fromVersion + 1`.  Multi-version jumps are
// expressed as a sequence of single-version steps so that future
// schema changes can interleave without touching shipped migrations.

import type { Manifest } from '@pryzm/persistence-client';
import type JSZip from 'jszip';

import { PRYZM_FORMAT_SCHEMA_VERSION } from '../types.js';

/**
 * One migration step.  `migrate` MUST return a manifest whose
 * `schemaVersion` equals `toVersion`.  The migration MAY also rewrite
 * the ZIP contents (e.g. to repack events into a new batch format).
 */
export interface MigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (
    rawManifest: unknown,
    zip: JSZip,
  ) => Promise<{ manifest: unknown; zip: JSZip }>;
}

/**
 * The append-only migration registry.  v0 represents PRYZM 1's
 * `project.json` Postgres blob — the migration is intentionally a stub
 * in Phase 1.  The full PRYZM 1 importer plugin lands in Phase 3D.
 */
export const MIGRATIONS: readonly MigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: async () => {
      throw new MigrationStubError(
        'PRYZM 1 → v1 migration: not yet implemented in Phase 1.  Use the PRYZM 1 importer plugin (Phase 3D).',
      );
    },
  },
];

/**
 * Error raised by the v0→v1 stub.  Caller code can `instanceof`-check
 * this to surface a friendlier UX (`"Use the PRYZM 1 importer"`)
 * versus a generic migration failure.
 */
export class MigrationStubError extends Error {
  readonly code = 'migration-stub';
  constructor(message: string) {
    super(message);
    this.name = 'MigrationStubError';
  }
}

/**
 * Raised when the file is on a schema version newer than this build
 * supports.  Caller should ask the user to update PRYZM.
 */
export class FutureVersionError extends Error {
  readonly code = 'future-version';
  constructor(
    readonly fileVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `Cannot open: project is schema v${fileVersion}, this PRYZM build supports up to v${supportedVersion}.  Update PRYZM.`,
    );
    this.name = 'FutureVersionError';
  }
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
export async function migrate(
  rawManifest: unknown,
  zip: JSZip,
): Promise<{ manifest: Manifest; zip: JSZip; migratedFromVersion: number | null }> {
  const startVersion = readSchemaVersion(rawManifest);
  if (startVersion === PRYZM_FORMAT_SCHEMA_VERSION) {
    // Caller still needs Zod validation upstream — we return the raw
    // manifest cast to `Manifest` and rely on `unpack()` calling
    // `parseManifest()` after this function.
    return {
      manifest: rawManifest as Manifest,
      zip,
      migratedFromVersion: null,
    };
  }
  if (startVersion > PRYZM_FORMAT_SCHEMA_VERSION) {
    throw new FutureVersionError(startVersion, PRYZM_FORMAT_SCHEMA_VERSION);
  }

  let currentManifest: unknown = rawManifest;
  let currentZip = zip;
  let currentVersion = startVersion;
  for (const step of MIGRATIONS) {
    if (step.fromVersion < currentVersion) continue;
    if (step.fromVersion > currentVersion) {
      throw new Error(
        `[file-format] Missing migration step from v${currentVersion} to v${step.fromVersion} — registry has a gap.  This is a build error, not a file error.`,
      );
    }
    const result = await step.migrate(currentManifest, currentZip);
    currentManifest = result.manifest;
    currentZip = result.zip;
    currentVersion = readSchemaVersion(currentManifest);
    if (currentVersion !== step.toVersion) {
      throw new Error(
        `[file-format] Migration step ${step.fromVersion}→${step.toVersion} returned schemaVersion=${currentVersion}.  This is a step-implementation bug.`,
      );
    }
    if (currentVersion >= PRYZM_FORMAT_SCHEMA_VERSION) break;
  }

  if (currentVersion !== PRYZM_FORMAT_SCHEMA_VERSION) {
    throw new Error(
      `[file-format] Migration ended at v${currentVersion}, expected v${PRYZM_FORMAT_SCHEMA_VERSION}.  Registry is incomplete.`,
    );
  }

  return {
    manifest: currentManifest as Manifest,
    zip: currentZip,
    migratedFromVersion: startVersion,
  };
}

function readSchemaVersion(rawManifest: unknown): number {
  if (
    typeof rawManifest !== 'object' ||
    rawManifest === null ||
    !('schemaVersion' in rawManifest)
  ) {
    throw new Error(
      '[file-format] manifest.json is missing the required `schemaVersion` field.',
    );
  }
  const v = (rawManifest as { schemaVersion: unknown }).schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(
      `[file-format] manifest.json has invalid schemaVersion=${String(v)} (must be a non-negative integer).`,
    );
  }
  return v;
}
