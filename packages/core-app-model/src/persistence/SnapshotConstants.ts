/**
 * @pryzm/core-app-model — SnapshotConstants
 *
 * Project-snapshot schema version constant extracted to this package so that
 * @pryzm/geometry-wall (and other packages) can reference it without depending
 * on the full ProjectSerializer implementation in src/.
 *
 * This value MUST stay in sync with ProjectSerializer.SNAPSHOT_SCHEMA_VERSION.
 * Update both simultaneously when bumping the schema.
 *
 * Sprint E P9-W10 (2026-05-10)
 */

/** Current project-snapshot serialisation schema version. */
export const SNAPSHOT_SCHEMA_VERSION = 5;
