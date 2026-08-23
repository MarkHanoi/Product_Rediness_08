// loader/SnapshotIntegrity.test.ts — L-334 / L-360 save-reload content checksum.
//
// The load-bearing proof set: THE test that a faithfully-saved project always
// re-verifies (never a false "corrupt" that bricks it), that genuine corruption
// IS detected, and that legacy (no-checksum) snapshots load clean.

import { describe, expect, it } from 'vitest';

import {
  INTEGRITY_ALGO,
  INTEGRITY_ALGO_V1,
  computeSnapshotChecksum,
  computeSnapshotChecksumV1,
  computeSnapshotChecksumWithReport,
  decodeCanonicalLength,
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

// -----------------------------------------------------------------------------
// SS-L-8700 -- THE THIRD MEMBER OF THE FAMILY.
//
// The founder opened two production projects and both reported
//   `stored 5b6140fb-50432, computed f14e68b4-5041d`
// i.e. canonical length 328_242 at SAVE and 328_221 at LOAD: the LOAD side 21
// characters SMALLER. Content counted by the save-side walk was absent from the
// stored bytes.
//
// WARNING: every determinism test ABOVE was green throughout, because
// `sampleSnapshot()` is pure JSON -- it cannot contain the defect, so it cannot
// fail on it. A test whose fixture cannot express the failure is not evidence of
// its absence. The fixtures below are adversarial by construction: each one is a
// live-object shape the v1 canonicaliser hashed DIFFERENTLY from the way
// JSON.stringify writes it.
// -----------------------------------------------------------------------------

/** Every live-object shape whose JSON representation differs from a naive walk. */
function adversarialSnapshots(): Array<{ name: string; make: () => Record<string, unknown> }> {
  return [
    // The three LOAD-SMALLER shapes -- the sign of the founder's delta.
    { name: 'function-valued property', make: () => ({ levels: [], onCommit: () => {} }) },
    { name: 'symbol-valued property', make: () => ({ levels: [], marker: Symbol('live') }) },
    {
      name: 'toJSON() returning undefined',
      make: () => ({ levels: [], probe: { toJSON: () => undefined } }),
    },
    {
      name: 'function nested deep inside an element',
      make: () => ({ walls: [{ id: 'w1', height: 3, dispose: () => {} }] }),
    },
    // The LOAD-LARGER shape.
    {
      name: 'sparse array (hole)',
      make: () => {
        const holed: unknown[] = [1];
        holed[2] = 3; // index 1 is a HOLE, not undefined
        return { levels: [], series: holed };
      },
    },
    // Shapes that must stay stable -- regression cover for the earlier v1 fixes.
    { name: 'Date (toJSON honoured)', make: () => ({ levels: [], when: new Date(0) }) },
    { name: 'NaN and +/-Infinity', make: () => ({ levels: [], a: NaN, b: Infinity, c: -Infinity }) },
    { name: 'negative zero', make: () => ({ levels: [], a: -0 }) },
    {
      name: 'Map and Set (both stringify to {})',
      make: () => ({ levels: [], m: new Map([['k', 'v']]), s: new Set([1]) }),
    },
    {
      name: 'class instance with a prototype method',
      make: () => ({ levels: [], o: new (class { x = 1; m() { /* proto, not own */ } })() }),
    },
    { name: 'undefined inside an array', make: () => ({ levels: [], a: [1, undefined, 3] }) },
    { name: 'extreme floats', make: () => ({ levels: [], a: 0.1 + 0.2, b: 1e21, c: 1e-7 }) },
  ];
}

describe('computeSnapshotChecksum -- L-8700 JSON.stringify equivalence', () => {
  for (const { name, make } of adversarialSnapshots()) {
    it(`round-trips a snapshot carrying a ${name}`, () => {
      const live = make();
      expect(computeSnapshotChecksum(roundTrip(live))).toBe(computeSnapshotChecksum(live));
    });
  }

  it('verifies end-to-end through stamp -> stringify -> parse for every adversarial shape', () => {
    for (const { name, make } of adversarialSnapshots()) {
      const stored = roundTrip(stamp(make()));
      expect(verifySnapshotChecksum(stored), name).toMatchObject({ present: true, ok: true });
    }
  });

  it('reproduces the production SIGN: a function-valued key made the LOAD side SHORTER under v1', () => {
    // The defect EXHIBITED, not asserted-absent. Under v1 an object-position
    // function rendered as `"key":null` at SAVE and vanished at LOAD, so the
    // canonical length shrank by name.length + 8 (quotes + colon + "null" + comma)
    // -- a 13-character property name is exactly the -21 the founder observed.
    const live = { levels: [], recomputeShell: () => {} };
    const saveV1 = computeSnapshotChecksumV1(live);
    const loadV1 = computeSnapshotChecksumV1(roundTrip(live));
    expect(loadV1).not.toBe(saveV1); // v1 IS asymmetric -- this is the production bug
    const bytes = (c: string) => decodeCanonicalLength(c)!;
    expect(bytes(loadV1)).toBeLessThan(bytes(saveV1)); // and it SHRINKS, as observed
    // v2 closes it.
    expect(computeSnapshotChecksum(roundTrip(live))).toBe(computeSnapshotChecksum(live));
  });

  it('v1 diverges on exactly the documented shapes and v2 on none of them', () => {
    const divergentUnderV1: string[] = [];
    const divergentUnderV2: string[] = [];
    for (const { name, make } of adversarialSnapshots()) {
      const live = make();
      if (computeSnapshotChecksumV1(roundTrip(live)) !== computeSnapshotChecksumV1(live)) {
        divergentUnderV1.push(name);
      }
      if (computeSnapshotChecksum(roundTrip(live)) !== computeSnapshotChecksum(live)) {
        divergentUnderV2.push(name);
      }
    }
    expect(divergentUnderV1.sort()).toEqual([
      'function nested deep inside an element',
      'function-valued property',
      'sparse array (hole)',
      'symbol-valued property',
      'toJSON() returning undefined',
    ]);
    expect(divergentUnderV2).toEqual([]);
  });
});

describe('computeSnapshotChecksumWithReport -- L-8701 the save-side probe', () => {
  it('names every member JSON.stringify cannot persist, with its path and kind', () => {
    const live = {
      levels: [],
      onCommit: () => {},
      site: { parcel: { marker: Symbol('x') } },
      walls: [{ id: 'w1', dispose: () => {} }],
    };
    const report = computeSnapshotChecksumWithReport(live);
    expect(report.jsonInvisibleCount).toBe(3);
    expect(report.jsonInvisible.map((m) => m.path).sort()).toEqual([
      'onCommit',
      'site.parcel.marker',
      'walls[0].dispose',
    ]);
    expect(report.jsonInvisible.map((m) => m.kind).sort()).toEqual(['function', 'function', 'symbol']);
  });

  it('reports ZERO for a clean snapshot and returns the same digest as the plain call', () => {
    const snap = sampleSnapshot();
    const report = computeSnapshotChecksumWithReport(snap);
    expect(report.jsonInvisibleCount).toBe(0);
    expect(report.jsonInvisible).toEqual([]);
    expect(report.checksum).toBe(computeSnapshotChecksum(snap));
  });

  it('does NOT flag a deliberately-undefined optional key (the serializer omits those on purpose)', () => {
    // ProjectSerializer writes `provenance: undefined` / `site: undefined` to mean
    // "absent", which is a DIFFERENT VALUE from an empty slice. That idiom must not
    // be reported as content loss, or the probe is noise.
    const report = computeSnapshotChecksumWithReport({ levels: [], provenance: undefined, site: undefined });
    expect(report.jsonInvisibleCount).toBe(0);
  });
});

describe('verifySnapshotChecksum -- L-8700 algorithm drift is NOT a mismatch', () => {
  it('reports a v1-stamped snapshot as present, ok, and NOT comparable', () => {
    const snap = sampleSnapshot();
    const v1Stamped = roundTrip({
      ...snap,
      integrity: { algo: INTEGRITY_ALGO_V1, checksum: computeSnapshotChecksumV1(snap), schemaVersion: 5 },
    });
    const v = verifySnapshotChecksum(v1Stamped);
    expect(v).toMatchObject({ present: true, ok: true, comparable: false, algo: INTEGRITY_ALGO_V1 });
    expect(v.note).toContain(INTEGRITY_ALGO);
    // ...and it must not quietly claim the content verified.
    expect(v.actual).toBeUndefined();
  });

  it('still HARD-DETECTS corruption in a snapshot stamped by the CURRENT algorithm', () => {
    // The drift rule must not become a blanket amnesty: a current-algo snapshot
    // whose bytes changed is still reported as a mismatch.
    const stored = roundTrip(stamp(sampleSnapshot())) as Record<string, any>;
    stored.walls[0].height = 999;
    const v = verifySnapshotChecksum(stored);
    expect(v).toMatchObject({ present: true, ok: false, comparable: true });
    expect(typeof v.expectedBytes).toBe('number');
    expect(typeof v.actualBytes).toBe('number');
  });

  it('decodes the canonical length the digest carries in its suffix', () => {
    const c = computeSnapshotChecksum({ a: 1 }); // canonical '{"a":1}' -> 7 chars
    expect(decodeCanonicalLength(c)).toBe(7);
    expect(c.endsWith('-7')).toBe(true);
    expect(decodeCanonicalLength(undefined)).toBeUndefined();
  });

  it('marks a migrated snapshot NOT comparable rather than silently ok', () => {
    const migrated = stamp(sampleSnapshot()) as Record<string, any>;
    migrated.schemaVersion = 6;
    const v = verifySnapshotChecksum(migrated);
    expect(v).toMatchObject({ present: true, ok: true, comparable: false });
    expect(v.note).toContain('schemaVersion');
  });
});
