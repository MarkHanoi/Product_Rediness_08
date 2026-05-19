// Migration framework tests.
//
// Asserts:
//   1. Future-version files surface `unsupported-future-version`.
//   2. Append-only invariant on the registry (no duplicate fromVersion,
//      every step's `toVersion === fromVersion + 1`).
//   3. v0 → v1 stub raises `migration-failed` (the PRYZM 1 importer
//      lands in Phase 3D — for now the loader must give a clean
//      "use the importer" message rather than a generic crash).

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

import {
  MIGRATIONS,
  migrate,
  FutureVersionError,
  MigrationStubError,
} from '../src/migrations/index';
import { PRYZM_FORMAT_SCHEMA_VERSION } from '../src/types';
import { unpack } from '../src/unpack';

describe('file-format · migrations', () => {
  it('registry is append-only and version-monotonic', () => {
    const seenFrom = new Set<number>();
    for (const step of MIGRATIONS) {
      expect(step.toVersion).toBe(step.fromVersion + 1);
      expect(seenFrom.has(step.fromVersion)).toBe(false);
      seenFrom.add(step.fromVersion);
    }
    // Coverage: from 0 up to the current schema version, every
    // (n)→(n+1) step must exist.
    for (let v = 0; v < PRYZM_FORMAT_SCHEMA_VERSION; v++) {
      expect(MIGRATIONS.find((s) => s.fromVersion === v)).toBeDefined();
    }
  });

  it('no-op when schemaVersion is already current', async () => {
    const zip = new JSZip();
    const result = await migrate(
      { schemaVersion: PRYZM_FORMAT_SCHEMA_VERSION },
      zip,
    );
    expect(result.migratedFromVersion).toBeNull();
    expect(result.zip).toBe(zip);
  });

  it('throws FutureVersionError on a newer-than-supported file', async () => {
    const future = PRYZM_FORMAT_SCHEMA_VERSION + 1;
    await expect(
      migrate({ schemaVersion: future }, new JSZip()),
    ).rejects.toBeInstanceOf(FutureVersionError);
  });

  it('throws MigrationStubError on the v0 importer stub', async () => {
    await expect(
      migrate({ schemaVersion: 0 }, new JSZip()),
    ).rejects.toBeInstanceOf(MigrationStubError);
  });

  it('unpack surfaces a future-version file as `unsupported-future-version`', async () => {
    const zip = new JSZip();
    const future = PRYZM_FORMAT_SCHEMA_VERSION + 1;
    zip.file(
      'manifest.json',
      JSON.stringify(
        {
          schemaVersion: future,
          projectId: 'proj_future',
          formatVersion: 'pryzm-v999',
          chunks: [],
          levels: [],
          eventLogLength: 0,
          lastEventId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          thumbnailHash: null,
        },
        null,
        2,
      ),
    );
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await unpack({ bytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unsupported-future-version');
    }
  });

  it('unpack surfaces a v0 stub as `migration-failed`', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({ schemaVersion: 0, anything: 'goes' }, null, 2),
    );
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await unpack({ bytes });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('migration-failed');
      expect(result.message).toMatch(/PRYZM 1/);
    }
  });
});
