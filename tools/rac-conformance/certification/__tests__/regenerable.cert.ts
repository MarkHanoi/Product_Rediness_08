// ─── HARNESS 3 — DERIVED-vs-DESTROYED (feeds check-derived-regenerable) ──────
//
// The question this harness exists to answer, and which no amount of reading can
// settle: when a field diverges across a save/reload, is it DERIVED STATE that a
// rebuild-from-authoritative legitimately regenerates, or is it AUTHORED DATA
// that the round-trip DESTROYED?
//
// Harness 1 refuses to guess. Its documented-tolerance list ships EMPTY and its
// F-1 finding says so explicitly: "whether `metadata` / `_renderVersion` are
// legitimate derived state is a CONTRACT question ... not a harness question."
// That is the right call for a comparator. But it leaves the persist-or-lose set
// UNNAMED — and an unnamed set is a surprise, which is exactly what Wave 3 says
// it must stop being.
//
// THE MEASUREMENT — a THIRD state, which is what makes this mechanical:
//
//   A1  authored model      (seed through real commands, mutate through live verbs)
//   A2  serialize(A1) → JSON → load                        ← "restored snapshot"
//   A3  serialize(A2) → JSON → load                        ← "rebuild from authoritative"
//
//   * A field that differs A1→A2 but is IDENTICAL A2→A3 is REGENERABLE: the
//     restore recomputes it deterministically from what the snapshot does carry.
//     It reaches a fixed point. Nothing was destroyed — the wire format simply
//     does not need to carry it.
//   * A field that differs A1→A2 AND AGAIN A2→A3 is PERSIST-OR-LOSE: every cycle
//     produces a NEW value, so the authored one is gone and no rebuild will ever
//     bring it back. This is the set that must be persisted, and the set the
//     ledger names.
//
// Field paths are compared with the element id ELIDED (`wall.<*>.height`), because
// the id itself is one of the things that moves (F-2: stair and beam come back
// under fresh uuids). Keying on the raw path would make every field of those two
// kinds look like a fresh field rather than a moved one.
//
// This harness makes NO judgement about whether a regenerable field SHOULD be
// derived — C13 §2 still asks for byte-compatible snapshots, and that argument is
// Harness 1's to have. It reports which side of the line each field is on.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { World } from '../world';
import { captureState, diffState, type StateCapture, type Divergence } from '../capture';
import { writeResults } from '../report';
import { seedWorld } from '../seed';

let world: World;
let A1: StateCapture, A2: StateCapture, A3: StateCapture;
let roundTripErrors: string[] = [];
let seedOutcomes: Record<string, string> = {};
const ROOM_ID = crypto.randomUUID();

/** `wall.abc-123.openings.0.frameColor` → `wall.<*>.openings.0.frameColor` */
const fieldPath = (p: string): string => {
  const i = p.indexOf('.');
  if (i < 0) return p;
  const j = p.indexOf('.', i + 1);
  return j < 0 ? `${p.slice(0, i)}.<*>` : `${p.slice(0, i)}.<*>${p.slice(j)}`;
};

async function roundTrip(label: string): Promise<void> {
  try {
    const modS = await import('../../../../apps/editor/src/engine/persistence/ProjectSerializer');
    const snapshot = modS.ProjectSerializer.serialize(
      world.stores as never, world.bimManager as never, { projectName: 'bim20-cert-regen' });
    const wire = JSON.parse(JSON.stringify(snapshot));
    const modL = await import('../../../../apps/editor/src/engine/persistence/ProjectLoader');
    const loader = new modL.ProjectLoader(world.cm as never);
    await loader.load(wire);
  } catch (e) {
    roundTripErrors.push(`${label}: ${String(e).slice(0, 300)}`);
  }
}

beforeAll(async () => {
  const { buildWorld } = await import('../world');
  world = await buildWorld();
  ({ seedOutcomes } = await seedWorld(world, ROOM_ID));
  A1 = captureState(world);
  await roundTrip('cycle-1');
  A2 = captureState(world);
  await roundTrip('cycle-2');
  A3 = captureState(world);
}, 600_000);

interface Classified { regenerable: string[]; persistOrLose: string[] }

function classify(): Classified {
  const d12 = diffState(A1, A2).divergences;
  const d23 = diffState(A2, A3).divergences;
  const f12 = new Set(d12.map((d: Divergence) => fieldPath(d.path)));
  const f23 = new Set(d23.map((d: Divergence) => fieldPath(d.path)));
  const regenerable: string[] = [];
  const persistOrLose: string[] = [];
  for (const f of [...f12].sort()) (f23.has(f) ? persistOrLose : regenerable).push(f);
  return { regenerable, persistOrLose };
}

describe('HARNESS 3 — derived-vs-destroyed across two round-trips', () => {
  it('the run is not silently empty (MISCONFIGURED guard)', () => {
    const total = Object.values(A1).reduce((n, k) => n + Object.keys(k.records).length, 0);
    console.log('[H3] roundTripErrors=' + JSON.stringify(roundTripErrors));
    console.log('[H3] A1 records=' + total + ' kinds=' + Object.keys(A1).length);
    // Without a subject, "0 persist-or-lose fields" is the emptiest possible lie.
    expect(total, 'A1 capture is EMPTY — MISCONFIGURED, refusing to classify anything').toBeGreaterThan(0);
    expect(roundTripErrors.length, 'a round trip threw — the classification would be over one cycle, not two').toBe(0);
  });

  it('classifies every divergent field as REGENERABLE or PERSIST-OR-LOSE', () => {
    const c = classify();
    console.log('[H3] REGENERABLE (' + c.regenerable.length + '): ' + c.regenerable.join(', '));
    console.log('[H3] PERSIST-OR-LOSE (' + c.persistOrLose.length + '): ' + c.persistOrLose.join(', '));
    expect(c.regenerable.length + c.persistOrLose.length).toBeGreaterThanOrEqual(0);
  });

  it('FALSIFIABILITY — the classifier can tell a fixed point from a moving one', () => {
    // A field that is identical in all three states must appear in NEITHER list.
    // Proven against a synthetic pair rather than by asserting on live data, so
    // the check cannot be satisfied by the model happening to be empty.
    const stable = { reached: true, records: { x: { a: 1 } } };
    const moved1 = { reached: true, records: { x: { a: 2 } } };
    const moved2 = { reached: true, records: { x: { a: 3 } } };
    const d12 = diffState({ k: stable }, { k: moved1 }).divergences.map((d) => fieldPath(d.path));
    const d23 = diffState({ k: moved1 }, { k: moved2 }).divergences.map((d) => fieldPath(d.path));
    const same = diffState({ k: stable }, { k: stable }).divergences;
    console.log('[FALSIFY H3] d12=' + JSON.stringify(d12) + ' d23=' + JSON.stringify(d23) + ' same=' + same.length);
    expect(same.length).toBe(0);                    // a fixed point is not a divergence
    expect(d12).toEqual(['k.<*>.a']);               // a move is named, and id-elided
    expect(d23).toEqual(['k.<*>.a']);               // still moving at cycle 2 → persist-or-lose
  });
});

afterAll(() => {
  const c = A1 ? classify() : { regenerable: [], persistOrLose: [] };
  const recordsA1 = A1 ? Object.values(A1).reduce((n, k) => n + Object.keys(k.records).length, 0) : 0;
  const p = writeResults('regenerable.json', {
    harness: 'H3-regenerable', generatedAt: new Date().toISOString(),
    seedOutcomes, roundTripErrors,
    recordsA1,
    kindsCaptured: A1 ? Object.keys(A1).length : 0,
    regenerable: c.regenerable,
    persistOrLose: c.persistOrLose,
  });
  console.log('[H3] results written: ' + p);
});
