// loader/SnapshotIntegrity.test.ts — L-334 / L-360 save-reload content checksum.
//
// The load-bearing proof set: THE test that a faithfully-saved project always
// re-verifies (never a false "corrupt" that bricks it), that genuine corruption
// IS detected, and that legacy (no-checksum) snapshots load clean.

import { describe, expect, it } from 'vitest';

import {
  INTEGRITY_ALGO,
  computeSnapshotChecksum,
  verifySnapshotChecksum,
  type SnapshotIntegrityMeta,
} from '../../src/loader/SnapshotIntegrity.js';

// A representative, JSON-safe snapshot shape (subset of the real ProjectSnapshot).
function sampleSnapshot(): Record<string, unknown> {
  return {
    schemaVersion: 5,
    timestamp: 1_752_000_000_000,
    projectName: 'Casa Demo',
    projectId: 'proj-01HZ',
    levels: [
      { id: 'L0', name: 'Ground', elevation: 0 },
      { id: 'L1', name: 'First', elevation: 3.2 },
    ],
    walls: [
      { id: 'w1', baseline: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], height: 3, thickness: 0.2 },
      { id: 'w2', baseline: [{ x: 5, y: 0, z: 0 }, { x: 5, y: 4, z: 0 }], height: 3, thickness: 0.2 },
    ],
    grids: [],
    elementCount: 2,
    lighting: undefined, // omitted-by-JSON key — must not affect the digest
  };
}

/** Stamp an integrity block the way ProjectSerializer.serialize() does. */
function stamp(snapshot: Record<string, unknown>): Record<string, unknown> {
  const integrity: SnapshotIntegrityMeta = {
    algo: INTEGRITY_ALGO,
    checksum: computeSnapshotChecksum(snapshot),
    schemaVersion: 5,
  };
  return { ...snapshot, integrity };
}

/** JSON round-trip, exactly as the persistence codec does at SAVE→LOAD. */
function roundTrip<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

describe('computeSnapshotChecksum — determinism (the no-brick guarantee)', () => {
  it('is byte-identical across a JSON serialize/parse round-trip', () => {
    const snap = sampleSnapshot();
    const atSave = computeSnapshotChecksum(snap);
    const atLoad = computeSnapshotChecksum(roundTrip(snap));
    expect(atLoad).toBe(atSave);
  });

  it('is independent of object key insertion order', () => {
    const a = { schemaVersion: 5, projectName: 'X', levels: [], b: 1, a: 2 };
    const b = { a: 2, levels: [], b: 1, projectName: 'X', schemaVersion: 5 };
    expect(computeSnapshotChecksum(a)).toBe(computeSnapshotChecksum(b));
  });

  it('treats an undefined-valued key as identical to an absent key', () => {
    const withUndef = { levels: [], lighting: undefined };
    const without = { levels: [] };
    expect(computeSnapshotChecksum(withUndef)).toBe(computeSnapshotChecksum(without));
  });

  it('honours toJSON (a Date hashes as its ISO string, matching the parsed-back form)', () => {
    const live = { levels: [], when: new Date('2026-07-18T00:00:00.000Z') };
    const parsedBack = roundTrip(live); // Date -> ISO string
    expect(computeSnapshotChecksum(parsedBack)).toBe(computeSnapshotChecksum(live));
  });

  it('excludes the volatile versionLabel — the exact L-360 false-positive', () => {
    // The autosave path stamps the digest BEFORE appending versionLabel to the
    // SAME object. LOAD recomputes WITH the label present. Excluding it makes the
    // two match — the fix that stops a valid project reading back as "corrupt".
    const stamped = stamp(sampleSnapshot());
    const withLabel = { ...stamped, versionLabel: 'Auto-save' };
    expect(verifySnapshotChecksum(withLabel)).toMatchObject({ present: true, ok: true });
  });

  it('excludes its own integrity block from the digest', () => {
    const snap = sampleSnapshot();
    const bare = computeSnapshotChecksum(snap);
    const withBlock = computeSnapshotChecksum(stamp(snap));
    expect(withBlock).toBe(bare);
  });
});

describe('verifySnapshotChecksum — corruption detection', () => {
  it('verifies a faithfully-saved snapshot after a full round-trip', () => {
    const stored = roundTrip(stamp(sampleSnapshot()));
    expect(verifySnapshotChecksum(stored)).toMatchObject({ present: true, ok: true });
  });

  it('detects a mutated field (content corruption)', () => {
    const stored = roundTrip(stamp(sampleSnapshot())) as Record<string, any>;
    stored.walls[0].height = 999; // mutate a byte of content, leave checksum intact
    const v = verifySnapshotChecksum(stored);
    expect(v.present).toBe(true);
    expect(v.ok).toBe(false);
    expect(v.expected).not.toBe(v.actual);
  });

  it('detects a truncated element array', () => {
    const stored = roundTrip(stamp(sampleSnapshot())) as Record<string, any>;
    stored.walls.pop();
    expect(verifySnapshotChecksum(stored).ok).toBe(false);
  });

  it('does NOT throw on a mismatch (it reports, never bricks)', () => {
    const stored = stamp(sampleSnapshot()) as Record<string, any>;
    stored.projectName = 'tampered';
    expect(() => verifySnapshotChecksum(stored)).not.toThrow();
  });
});

describe('verifySnapshotChecksum — backward compatibility (no false alarms)', () => {
  it('treats a legacy snapshot with no integrity block as clean (present:false, ok:true)', () => {
    const legacy = sampleSnapshot(); // never stamped
    expect(verifySnapshotChecksum(legacy)).toEqual({ present: false, ok: true });
  });

  it('treats an empty-string checksum as absent (clean)', () => {
    const snap = { ...sampleSnapshot(), integrity: { algo: INTEGRITY_ALGO, checksum: '' } };
    expect(verifySnapshotChecksum(snap)).toMatchObject({ present: false, ok: true });
  });

  it('soft-passes a MIGRATED snapshot (stored schemaVersion != current) rather than false-alarm', () => {
    // Saved at v5, then upgraded to v6 by MigrationEngine (content changed). The
    // stored v5 checksum no longer matches the v6 content — but that is migration,
    // not corruption, and must NOT warn.
    const migrated = stamp(sampleSnapshot()) as Record<string, any>;
    migrated.schemaVersion = 6;      // MigrationEngine bumped the content forward
    migrated.walls[0].height = 3.5;  // migration legitimately mutated content
    expect(verifySnapshotChecksum(migrated)).toMatchObject({ present: true, ok: true });
  });
});
