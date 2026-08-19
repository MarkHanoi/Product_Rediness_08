/**
 * ⭐ C100 §2.1 / §9.6.c step 3 / L-1127 S16 — A PLUMBING RUN'S `materialId` REACHES
 * THE BRIDGE, WITHOUT DESTROYING THE SERVICE-COLOUR CONVENTION.
 *
 * ⚠ ITS OWN TEST, NOT A SHARED HARNESS (L-1127's standing instruction; C100 §9.3
 * retracted a slice for proving coverage with a test that never constructed its
 * subject). It drives `producePlumbing` — the real producer — into
 * `colorOfPlumbingMaterialKey` — the real bridge — and reads every expected hex OUT
 * of `MATERIAL_CATALOG` rather than typing it.
 *
 * ─── ⛔ THE DEFECT ──────────────────────────────────────────────────────────
 *
 * `materialId` has sat in slot 4 of the plumbing key since the key was written and
 * nothing has ever read it. `colorOfPlumbingMaterialKey` returns slot 3, and slot 3
 * was always `SYSTEM_COLORS[p.systemTag]`. So a COPPER run and a CAST IRON run on
 * the same service painted IDENTICALLY — the only thing consulted was the tag.
 *
 * ⚠ THE SERVICE COLOUR IS NOT THE BUG, and case 3 exists to stop a later editor
 * "finishing the job" by deleting it. Blue for cold water and red for hot is a real
 * engineering convention and it is the correct answer for a run that names no
 * material. It is a FAMILY DEFAULT — derived from the tag, never authored — and
 * C100 §2.1 ranks an explicit `materialId` above a default. Both survive; only
 * their order is now stated.
 *
 * RED-FIRST, EXECUTED NOT ASSUMED — see the commit body for the run and its split.
 *
 * ⚠ WHAT THIS DOES NOT PROVE: that a pipe was drawn, or that the material survives
 * save/load. `PlumbingTypes.ts` (the RUNTIME record) declares no `materialId` — the
 * gate's ARM F — and `serializePlumbing` writes none — ARM D. So a material chosen
 * at runtime still does not persist. Different defects, different fixes, NOT closed
 * here.
 */

import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { Plumbing, createId } from '@pryzm/schemas';
import { producePlumbing, NO_JOINS } from '@pryzm/geometry-kernel';
import {
  colorOfPlumbingMaterialKey,
  isUnresolvedPlumbingMaterialKey,
  unresolvedPlumbingMaterialId,
} from '../src/committer/material-bridge';

const dto = (partial: Partial<Plumbing>): Plumbing =>
  Plumbing.parse({
    id: createId('plumbing'),
    levelId: 'L1',
    kind: 'straight',
    ...partial,
  });

const keyOf = (partial: Partial<Plumbing>): string => {
  const d = producePlumbing(dto(partial), NO_JOINS, 0);
  const keys = d.materialKeys as unknown as string[];
  expect(keys.length, 'the producer must emit a material key').toBeGreaterThan(0);
  return String(keys[0]);
};

const painted = (partial: Partial<Plumbing>): string =>
  colorOfPlumbingMaterialKey(keyOf(partial));

/** Read from the master, NEVER transcribed. */
const masterHex = (id: string): string => {
  const rec = MATERIAL_CATALOG.find((m) => m.id === id);
  expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
  return rec!.color.toLowerCase();
};

/** The producer's service-colour table — the pre-fix answer, and still the default. */
const COLD_WATER = '#4a9bd1';
const HOT_WATER = '#d14a4a';

describe('C100 §2.1 — a plumbing materialId outranks the service colour, and only that', () => {
  it('⭐ 1. a named material wins over the service tag', () => {
    const p = painted({ systemTag: 'cold-water', materialId: 'copper-new' });
    expect(p).toBe(masterHex('copper-new'));

    // NEGATIVE — the pre-fix answer was the service blue, whatever the pipe was.
    expect(p).not.toBe(COLD_WATER);
  });

  it('⭐ 2. COPPER and CAST IRON on the SAME service are different colours', () => {
    // THE LOAD-BEARING CASE. Before the fix both were the service colour, so the
    // material was invisible. An assertion on one material alone cannot see a
    // resolver that ignores its argument — the failure mode that made every
    // handrail in the product one brown (L-1127 S16) and collapsed furniture's oak
    // and walnut onto one grey-teal.
    const copper = painted({ systemTag: 'cold-water', materialId: 'copper-new' });
    const iron = painted({ systemTag: 'cold-water', materialId: 'cast-iron' });

    expect(copper).toBe(masterHex('copper-new'));
    expect(iron).toBe(masterHex('cast-iron'));
    expect(copper, 'copper and cast iron must not paint the same colour').not.toBe(iron);
  });

  it('⭐ 3. CONTROL — the SERVICE COLOUR still governs a run that names no material', () => {
    // C100 §9.6.b, and a guard against the wrong "cleanup". Blue-for-cold and
    // red-for-hot is a real engineering convention, not a placeholder to be
    // removed once a material ladder exists. It is a DEFAULT, and defaults keep
    // working — this is the answer for every plumbing run in every existing
    // project, because nothing has ever written a plumbing materialId.
    expect(painted({ systemTag: 'cold-water' })).toBe(COLD_WATER);
    expect(painted({ systemTag: 'hot-water' })).toBe(HOT_WATER);
    expect(painted({ systemTag: 'cold-water' })).not.toBe(painted({ systemTag: 'hot-water' }));
  });

  it('4. an UNKNOWN id paints MAGENTA — and NOT a confident engineering blue (§5)', () => {
    const key = keyOf({ systemTag: 'cold-water', materialId: 'not-a-real-material' });

    expect(isUnresolvedPlumbingMaterialKey(key)).toBe(true);
    expect(unresolvedPlumbingMaterialId(key)).toBe('not-a-real-material');
    expect(colorOfPlumbingMaterialKey(key)).toBe('#ff00ff');

    // ⭐ Falling back to the service colour here would be the WORST available
    // answer, and worse than furniture's hash: a confident blue is not merely a
    // wrong colour, it is a CLAIM ABOUT THE BUILDING — "this pipe carries cold
    // water" — asserted because a catalogue row went missing.
    expect(colorOfPlumbingMaterialKey(key)).not.toBe(COLD_WATER);
  });

  it('5. CONTROL — the KEY SHAPE is unchanged: six slots, same indices', () => {
    // Unlike furniture (no colour slot at all) and lighting (a colour slot holding a
    // different quantity), plumbing already had the right slot in the right place,
    // filled from the wrong source. Converge the VALUE, not the FORMAT (§9.6.b).
    const parts = keyOf({ systemTag: 'hot-water', materialId: 'copper-new' }).split('|');
    expect(parts.length).toBe(6);
    expect(parts[0]).toBe('plumbing');
    expect(parts[1]).toBe('straight');
    expect(parts[2]).toBe('hot-water');
    expect(parts[3]).toBe(masterHex('copper-new'));
    expect(parts[4]).toBe('copper-new');
    expect(parts[5]).toBe('body');
  });

  it('6. the ids this test names all resolve in the master (S14 guard)', () => {
    for (const id of ['copper-new', 'cast-iron']) {
      expect(materialHex(id), `${id} must resolve in the master`).toBeTruthy();
    }
  });
});
