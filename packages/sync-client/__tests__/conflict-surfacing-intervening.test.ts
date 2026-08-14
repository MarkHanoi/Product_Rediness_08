// §PENDING-PER-PROP — P8 / C70 K-INV-2: disclosure bookkeeping must survive
// merges that do not touch the pending property.
//
// THE MEASURED DEFECT (check-conflict-surfacing, first honest reading
// 2026-08-14): S2-INTERVENING drove 103 merges and ALL 103 discarded the
// loser's authored value with NO CRDTConflict. Root cause, named to the line:
// `_discloseOverwrittenLocalWrites` ended with
// `this._localPendingWrites.delete(docKey)` — clearing the WHOLE doc's pending
// bookkeeping after ANY merge, including entries for properties the arriving
// merge never touched. When those entries' concurrent rival landed next, there
// was nothing left to compare against, and the user was never told.
//
// This is not exotic: it is what a hub topology does every time ANY other
// collaborator touches ANYTHING while your edit is in flight.
//
// The scenario below reproduces the gate's S2 arm exactly:
//   1. A authors a value for property P (in flight, unexchanged).
//   2. An UNRELATED third peer's merge reaches A first, touching a DIFFERENT
//      property — bookkeeping for P must survive it.
//   3. B's concurrent rival for P arrives → the conflict MUST surface.

import { describe, it, expect } from 'vitest';
import { YjsDocAdapter, type CRDTConflict } from '../src/YjsDocAdapter.js';

/**
 * Y.Map resolves concurrent per-key writes in favour of the HIGHER clientID.
 * Order the pair so `loser` is the adapter whose authored value the CRDT will
 * discard — same discovery the gate does, so the test cannot silently measure
 * the winner and read clean.
 */
function orderedPair(project: string): [loser: YjsDocAdapter, winner: YjsDocAdapter] {
  let loser = new YjsDocAdapter(project);
  let winner = new YjsDocAdapter(project);
  if (loser.doc.clientID > winner.doc.clientID) { const t = loser; loser = winner; winner = t; }
  return [loser, winner];
}

describe('§PENDING-PER-PROP — S2-INTERVENING: an unrelated merge must not erase disclosure eligibility', () => {
  it('local write on prop A survives an intervening merge on prop B; the rival for A then SURFACES', () => {
    const [a, b] = orderedPair('proj-s2-int');
    const third = new YjsDocAdapter('proj-s2-int');

    // Common base — all three peers hold the wall before divergence.
    a.applyCommand('wall.create', { id: 'w', levelId: 'L1', height: 3 });
    const base = a.encodeStateAsUpdate();
    b.applyUpdate(base);
    third.applyUpdate(base);

    const conflicts: CRDTConflict[] = [];
    a.onConflict((c) => conflicts.push(c));

    // 1. A authors height=5 (in flight); B concurrently authors the rival 7.
    a.applyCommand('wall.updateDimensions', { wallId: 'w', height: 5 });
    b.applyCommand('wall.updateDimensions', { wallId: 'w', height: 7 });

    // 2. INTERVENING: the third peer edits a DIFFERENT property of the same
    //    element, and its update reaches A before B's rival does.
    third.applyCommand('wall.updateDimensions', { wallId: 'w', thickness: 0.3 });
    a.applyUpdate(third.encodeStateAsUpdate());

    // The intervening merge touched nothing A had pending — it must be silent.
    expect(conflicts).toEqual([]);

    // 3. The rival lands. A's authored 5 is discarded (B has the higher
    //    clientID) — K-INV-2 demands an artefact naming exactly (w, height).
    a.applyUpdate(b.encodeStateAsUpdate());

    expect(a.readElementProperty('w', 'height')).toBe(7); // CRDT outcome unchanged
    const hit = conflicts.find((c) => c.elementId === 'w' && c.property === 'height');
    expect(hit).toBeDefined();
    expect(hit!.localValue).toBe(5);
    expect(hit!.remoteValue).toBe(7);

    a.destroy(); b.destroy(); third.destroy();
  });

  it('bookkeeping survives SEVERAL unrelated merges in a row, not just one', () => {
    const [a, b] = orderedPair('proj-s2-multi');
    const third = new YjsDocAdapter('proj-s2-multi');

    a.applyCommand('wall.create', { id: 'w', levelId: 'L1', height: 3 });
    const base = a.encodeStateAsUpdate();
    b.applyUpdate(base);
    third.applyUpdate(base);

    const conflicts: CRDTConflict[] = [];
    a.onConflict((c) => conflicts.push(c));

    a.applyCommand('wall.updateDimensions', { wallId: 'w', height: 5 });
    b.applyCommand('wall.updateDimensions', { wallId: 'w', height: 7 });

    // Three successive unrelated merges before the rival arrives.
    for (const [i, prop] of (['thickness', 'flipped', 'finish'] as const).entries()) {
      third.applyCommand('element.updateParameters', {
        elementId: 'w', elementType: 'wall', parameters: { [prop]: `v${i}` },
      });
      a.applyUpdate(third.encodeStateAsUpdate());
    }
    expect(conflicts).toEqual([]);

    a.applyUpdate(b.encodeStateAsUpdate());
    expect(conflicts.some((c) => c.elementId === 'w' && c.property === 'height' && c.localValue === 5)).toBe(true);

    a.destroy(); b.destroy(); third.destroy();
  });

  it('S3 guard: retained bookkeeping does NOT turn agreeing merges into noise conflicts', () => {
    const [a, b] = orderedPair('proj-s3-guard');

    a.applyCommand('wall.create', { id: 'w', levelId: 'L1', height: 3 });
    b.applyUpdate(a.encodeStateAsUpdate());

    const conflicts: CRDTConflict[] = [];
    a.onConflict((c) => conflicts.push(c));

    // Both peers author the SAME value — nothing is discarded.
    a.applyCommand('wall.updateDimensions', { wallId: 'w', height: 6 });
    b.applyCommand('wall.updateDimensions', { wallId: 'w', height: 6 });
    a.applyUpdate(b.encodeStateAsUpdate());
    b.applyUpdate(a.encodeStateAsUpdate());

    // …and repeated re-application of the same agreed state stays silent too:
    // an entry kept alive must never re-fire on merges that change nothing.
    a.applyUpdate(b.encodeStateAsUpdate());

    expect(conflicts).toEqual([]);
    expect(a.readElementProperty('w', 'height')).toBe(6);

    a.destroy(); b.destroy();
  });

  it('S1 guard: the direct two-peer conflict still surfaces exactly once per property', () => {
    const [a, b] = orderedPair('proj-s1-guard');

    a.applyCommand('wall.create', { id: 'w', levelId: 'L1', height: 3 });
    b.applyUpdate(a.encodeStateAsUpdate());

    const conflicts: CRDTConflict[] = [];
    a.onConflict((c) => conflicts.push(c));

    a.applyCommand('wall.updateDimensions', { wallId: 'w', height: 5 });
    b.applyCommand('wall.updateDimensions', { wallId: 'w', height: 7 });
    a.applyUpdate(b.encodeStateAsUpdate());

    const heightConflicts = conflicts.filter((c) => c.property === 'height');
    expect(heightConflicts).toHaveLength(1);
    expect(heightConflicts[0]!.localValue).toBe(5);

    // A DISCLOSED entry has left the books: replaying the winner's state must
    // not disclose the same loss twice.
    a.applyUpdate(b.encodeStateAsUpdate());
    expect(conflicts.filter((c) => c.property === 'height')).toHaveLength(1);

    a.destroy(); b.destroy();
  });
});
