// loader/JournalSidecar.test.ts — §JOURNAL-SIDECAR (L-9980 … L-9984).
//
// ⭐ WHAT THIS SUITE IS ACTUALLY FOR, stated first so nobody reads it as a
// round-trip test with extra steps.
//
// `SnapshotIntegrity.ts` records TWO shipped incidents in which the content
// digest was computed at SAVE over one representation and recomputed at LOAD
// over another, producing a FALSE accusation of corruption — the second bricked
// a real 1009-element project (L-334 → L-360 → L-8700). This change alters what
// a STORED snapshot contains: the temporal journal moves out of every version
// and into one shared sidecar, with each version holding a cursor. That is
// precisely the ignition condition for a third.
//
// So the load-bearing assertions here are not "the records come back". They are:
//
//   1. A snapshot whose journal was detached and re-attached hashes IDENTICALLY
//      to the one that was stamped — so a faithful reassembly is compared at
//      FULL strength and can never read as "corrupt".
//   2. A snapshot whose journal could NOT be fully supplied is reported
//      `comparable:false` with a reason — never `ok:false`, which is the
//      false-accusation verdict.
//   3. The mechanism that carries (2) is invisible to `JSON.stringify`,
//      `Object.keys` and the canonicaliser, so it cannot itself perturb a digest
//      or reach disk.
//
// ⛔ AND ONE ASSERTION ABOUT WHAT WAS NOT DONE: the exclusion set is still
// exactly two members. C05 §3.7 req 4 forbids adding a MODEL member to silence a
// mismatch, and `temporalGraph` is the largest model member there is. The test
// exhibits that the digest still MOVES when the journal changes — i.e. the
// journal is genuinely still covered, and this change bought its size reduction
// without buying it out of the digest.

import { describe, expect, it } from 'vitest';

import {
  attachJournalMutations,
  detachJournalMutations,
  hashJournalChunk,
  isJournalExtension,
  markJournalRehydration,
  readJournalRehydration,
  JOURNAL_SIDECAR_VERSION,
} from '../../src/loader/JournalSidecar.js';
import {
  INTEGRITY_ALGO,
  computeSnapshotChecksum,
  verifySnapshotChecksum,
} from '../../src/loader/SnapshotIntegrity.js';

interface Mutation { id: string; elementId: string; mutationType: string; mutatedAt: number }

function mutations(n: number, from = 0): Mutation[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `mut-${from + i}`,
    elementId: `el-${(from + i) % 37}`,
    mutationType: ['create', 'update', 'delete'][(from + i) % 3]!,
    mutatedAt: 1_787_150_674_754 + (from + i) * 137,
  }));
}

/** A snapshot in the shape the serializer actually emits (subset). */
function snapshotWithJournal(mutationCount: number): Record<string, unknown> {
  return {
    schemaVersion: 5,
    projectId: 'proj-1787150674754-fe43bbbc18c5',
    projectName: 'Casa Demo',
    levels: [{ id: 'L0', name: 'Ground', elevation: 0 }],
    walls: [{ id: 'w1', height: 2.7, thickness: 0.2 }],
    semanticGraph: { version: 1, relationships: [] },
    temporalGraph: {
      version: 1,
      // Edges stay INLINE by design — `expireEdge()` mutates `validUntil` in
      // place, so a shared edge store with a per-version cursor would hand an old
      // version an edge written after it was stamped. See the module header.
      edges: [{ id: 'e1', sourceId: 'w1', targetId: 'L0', type: 'hostedBy', validUntil: null }],
      mutations: mutations(mutationCount),
      sessionId: 'sess-abc',
    },
  };
}

/** Stamp a snapshot exactly as `ProjectSerializer` does. */
function stamp(snapshot: Record<string, unknown>): Record<string, unknown> {
  snapshot.integrity = {
    algo: INTEGRITY_ALGO,
    checksum: computeSnapshotChecksum(snapshot),
    schemaVersion: snapshot.schemaVersion,
  };
  return snapshot;
}

/** The storage round-trip, without a storage engine: detach → JSON → parse → attach. */
function roundTrip(stamped: Record<string, unknown>): { record: Record<string, unknown>; stored: string } {
  const det = detachJournalMutations(stamped);
  expect(det.detached).toBe(true);
  const stored = JSON.stringify(det.snapshot);
  const record = JSON.parse(stored) as Record<string, unknown>;
  attachJournalMutations(record, det.mutations);
  return { record, stored };
}

describe('§JOURNAL-SIDECAR — detach', () => {
  it('⛔ NEVER MUTATES THE CALLER\'S SNAPSHOT — the live record is still being POSTed', () => {
    const live = snapshotWithJournal(120);
    const before = JSON.stringify(live);
    const det = detachJournalMutations(live);

    expect(det.detached).toBe(true);
    // The input is untouched: the sync queue's POST body and PlatformShell's live
    // record must not lose their journal because the STORAGE layer moved bytes.
    expect(JSON.stringify(live)).toBe(before);
    expect((live.temporalGraph as { mutations: unknown[] }).mutations).toHaveLength(120);
  });

  it('replaces the records with a cursor and nothing else', () => {
    const det = detachJournalMutations(snapshotWithJournal(120));
    const tg = (det.snapshot as { temporalGraph: Record<string, unknown> }).temporalGraph;

    expect(tg.mutations).toBeUndefined();
    expect(tg.mutationsRef).toEqual({ v: JOURNAL_SIDECAR_VERSION, n: 120 });
    expect(det.mutations).toHaveLength(120);
    // Everything else survives verbatim, edges very much included.
    expect(tg.edges).toHaveLength(1);
    expect(tg.sessionId).toBe('sess-abc');
  });

  it('declines every shape it does not positively recognise, leaving the input alone', () => {
    for (const s of [
      {},
      { temporalGraph: {} },
      { temporalGraph: { mutations: 'not-an-array' } },
      { temporalGraph: { mutations: [] } },                       // nothing to gain
      { temporalGraph: { mutationsRef: { v: 1, n: 3 } } },         // already detached
    ]) {
      const det = detachJournalMutations(s);
      expect(det.detached).toBe(false);
      expect(det.snapshot).toBe(s);
      expect(det.mutations).toBeNull();
      expect(typeof det.reason).toBe('string');
    }
  });
});

describe('§JOURNAL-SIDECAR — the digest, which is what this is really about', () => {
  it('⭐ A FAITHFUL REASSEMBLY REPRODUCES THE STAMP EXACTLY — no false "corrupt"', () => {
    const stamped = stamp(snapshotWithJournal(500));
    const expected = (stamped.integrity as { checksum: string }).checksum;

    const { record } = roundTrip(stamped);

    // The digest is recomputed over the REASSEMBLED snapshot, which is what
    // ProjectLoader does. Not "close"; identical.
    expect(computeSnapshotChecksum(record)).toBe(expected);

    const verdict = verifySnapshotChecksum(record);
    expect(verdict).toMatchObject({ present: true, ok: true, comparable: true });
  });

  it('⭐ key ORDER cannot matter, because the canonical form sorts — proven, not assumed', () => {
    const stamped = stamp(snapshotWithJournal(50));
    const det = detachJournalMutations(stamped);
    const parsed = JSON.parse(JSON.stringify(det.snapshot)) as { temporalGraph: Record<string, unknown> };

    // Re-attach by hand in the WORST possible order: mutations last, after the
    // keys that were already there. The re-attach helper does it differently.
    const tg = parsed.temporalGraph;
    delete tg.mutationsRef;
    tg.mutations = det.mutations;

    expect(computeSnapshotChecksum(parsed)).toBe((stamped.integrity as { checksum: string }).checksum);
  });

  it('⛔ THE JOURNAL IS STILL COVERED — the exclusion set was NOT widened (C05 §3.7 req 4)', () => {
    // If `temporalGraph` had been excluded to make this change easy, this test
    // would pass with the two digests EQUAL. A digest that excludes the largest
    // member of the snapshot is not a digest.
    const a = computeSnapshotChecksum(snapshotWithJournal(100));
    const b = computeSnapshotChecksum(snapshotWithJournal(101));
    expect(a).not.toBe(b);
  });

  it('⭐ AN INEXACT REASSEMBLY IS *NOT COMPARABLE*, NEVER A MISMATCH (the third-incident guard)', () => {
    const stamped = stamp(snapshotWithJournal(500));
    const det = detachJournalMutations(stamped);
    const record = JSON.parse(JSON.stringify(det.snapshot)) as Record<string, unknown>;

    // The sidecar can only supply 400 of the 500 the cursor names — the shape a
    // rotted chunk produces. The bytes on disk are fine; PRYZM's own read path
    // could not reassemble them.
    const attach = attachJournalMutations(record, det.mutations!.slice(0, 400));
    expect(attach).toMatchObject({ wasDetached: true, exact: false, expected: 500, actual: 400 });

    const verdict = verifySnapshotChecksum(record);
    expect(verdict.present).toBe(true);
    expect(verdict.ok).toBe(true);              // ⛔ NEVER a mismatch verdict
    expect(verdict.comparable).toBe(false);     // ⭐ the honest answer
    expect(verdict.note).toContain('JOURNAL-SIDECAR');
    // ⛔ And it must not accuse the file or the user.
    expect(verdict.note?.toLowerCase()).not.toContain('corrupt');
    // Every record that could be supplied WAS supplied — nothing is discarded to
    // make the arithmetic tidy.
    expect((record.temporalGraph as { mutations: unknown[] }).mutations).toHaveLength(400);
  });

  it('a GENUINE corruption of a faithfully reassembled snapshot is still detected', () => {
    const stamped = stamp(snapshotWithJournal(300));
    const { record } = roundTrip(stamped);
    // The reassembly was exact; now damage the MODEL, which is what the digest is
    // for. Softening (2) must not have softened this.
    (record.walls as { height: number }[])[0]!.height = 3.9;

    const verdict = verifySnapshotChecksum(record);
    expect(verdict).toMatchObject({ present: true, ok: false, comparable: true });
  });
});

describe('§JOURNAL-SIDECAR — the rehydration marker', () => {
  it('⛔ IS INVISIBLE TO JSON, Object.keys, spread AND the canonical walk', () => {
    const s = snapshotWithJournal(10);
    const before = JSON.stringify(s);
    const beforeDigest = computeSnapshotChecksum(s);

    markJournalRehydration(s, { exact: false, expected: 9, actual: 4, note: 'probe' });

    expect(JSON.stringify(s)).toBe(before);                 // cannot reach disk
    expect(Object.keys(s)).not.toContain('__pryzmJournalRehydration');
    expect(computeSnapshotChecksum(s)).toBe(beforeDigest);  // cannot move a checksum
    expect(Object.getOwnPropertySymbols({ ...s })).toHaveLength(0); // non-enumerable ⇒ not spread
    expect(readJournalRehydration(s)).toMatchObject({ exact: false, expected: 9, actual: 4 });
  });

  it('⚠ ABSENT means "read whole", which is a DIFFERENT answer from "reassembled exactly"', () => {
    // A snapshot that never carried a cursor gets no marker at all, and
    // `attachJournalMutations` reports `wasDetached:false` rather than claiming
    // an exactness it never established.
    const legacy = snapshotWithJournal(10);
    const outcome = attachJournalMutations(legacy, null);
    expect(outcome.wasDetached).toBe(false);
    expect(readJournalRehydration(legacy)).toBeUndefined();
    // ...and it is untouched: a pre-change snapshot loads exactly as before.
    expect((legacy.temporalGraph as { mutations: unknown[] }).mutations).toHaveLength(10);
  });
});

describe('§JOURNAL-SIDECAR — the append-only proof that makes a cursor sound', () => {
  it('accepts a genuine extension, by reference AND by id', () => {
    const prior = mutations(1000);
    // In-session: the very same objects (serialize() is a shallow copy).
    expect(isJournalExtension([...prior, ...mutations(5, 1000)], prior)).toBe(true);
    // Post-reload: structurally equal objects that came back through JSON.parse.
    const reparsed = JSON.parse(JSON.stringify(prior)) as Mutation[];
    expect(isJournalExtension([...reparsed, ...mutations(5, 1000)], prior)).toBe(true);
  });

  it('⛔ REFUSES a divergent lineage — the restore-an-old-version-and-save shape', () => {
    const prior = mutations(1000);
    const diverged = [...mutations(700), ...mutations(9, 90_000)];
    expect(isJournalExtension(diverged, prior)).toBe(false);
    // ...and refuses anything shorter, which cannot be an extension by definition.
    expect(isJournalExtension(mutations(999), prior)).toBe(false);
  });

  it('an empty or absent prior journal is trivially extendable', () => {
    expect(isJournalExtension(mutations(3), null)).toBe(true);
    expect(isJournalExtension(mutations(3), [])).toBe(true);
  });
});

describe('§JOURNAL-SIDECAR — chunk digests', () => {
  it('are stable, and carry the chunk length so a failure is readable', () => {
    const text = JSON.stringify(mutations(2000));
    const h = hashJournalChunk(text);
    expect(hashJournalChunk(text)).toBe(h);
    // `<hash>-<length in hex>` — the suffix is what made L-8700 diagnosable.
    expect(h).toMatch(/^[0-9a-f]{8}-[0-9a-f]+$/);
    expect(Number.parseInt(h.slice(h.indexOf('-') + 1), 16)).toBe(text.length);
  });

  it('move for a single changed character', () => {
    const a = JSON.stringify(mutations(50));
    const b = a.replace('mut-7', 'mut-8');
    expect(hashJournalChunk(a)).not.toBe(hashJournalChunk(b));
  });
});
