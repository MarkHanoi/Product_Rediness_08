/**
 * ⭐ C100 §2.1 / §9.6.c step 3 / L-1127 S16 — A STRUCTURAL MEMBER'S `materialId`
 * REACHES THE BRIDGE.
 *
 * ⚠ ITS OWN TEST, NOT A SHARED HARNESS (L-1127's standing instruction; C100 §9.3
 * retracted a slice for proving coverage with a test that never constructed its
 * subject). It drives `produceStructural` — the real producer — into
 * `colorOfStructuralMaterialKey` — the real bridge — and reads every expected hex
 * OUT of `MATERIAL_CATALOG` rather than typing it.
 *
 * ─── ⛔ THE DEFECT ──────────────────────────────────────────────────────────
 *
 * `matKey()` took `materialId` AS A PARAMETER, wrote it into slot 2, and then
 * ignored it when computing slot 3 — the slot the bridge actually reads. Slot 3 was
 * always `FALLBACK_COLORS[kind]`, a colour derived from the element's KIND.
 *
 * ⭐ So a steel brace and a timber brace were the same colour, and a reinforced-
 * concrete footing and a precast one were the same colour. For STRUCTURE — where
 * "what is this made of" is close to the whole point of the element — the model
 * answered with a shape category, while the id sat one slot over having been passed
 * in deliberately.
 *
 * ⚠ The KIND colours survive as the family default (§9.6.b) — they are the right
 * answer for a member naming no material, which is every structural element in
 * every existing project. Only their RANK is now stated.
 *
 * RED-FIRST, EXECUTED NOT ASSUMED — see the commit body for the run and its split.
 *
 * ⚠ WHAT THIS DOES NOT PROVE: that a member was drawn, or that the material
 * survives save/load.
 */

import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { Structural, createId } from '@pryzm/schemas';
import { produceStructural, NO_JOINS } from '@pryzm/geometry-kernel';
import {
  colorOfStructuralMaterialKey,
  isUnresolvedStructuralMaterialKey,
  unresolvedStructuralMaterialId,
} from '../src/committer/material-bridge';

const dto = (partial: Partial<Structural>): Structural =>
  Structural.parse({
    id: createId('structural'),
    levelId: 'L1',
    kind: 'brace',
    // `brace` refuses a zero endOffset — the schema's own refine.
    endOffset: { x: 1, y: 1, z: 0 },
    ...partial,
  });

const keyOf = (partial: Partial<Structural>): string => {
  const d = produceStructural(dto(partial), NO_JOINS, 0);
  const keys = d.materialKeys as unknown as string[];
  expect(keys.length, 'the producer must emit a material key').toBeGreaterThan(0);
  return String(keys[0]);
};

const painted = (partial: Partial<Structural>): string =>
  colorOfStructuralMaterialKey(keyOf(partial));

/** Read from the master, NEVER transcribed. */
const masterHex = (id: string): string => {
  const rec = MATERIAL_CATALOG.find((m) => m.id === id);
  expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
  return rec!.color.toLowerCase();
};

/** The producer's kind-based defaults — the pre-fix answer, and still the default. */
const BRACE_DEFAULT = '#5a6470';
const FOOTING_DEFAULT = '#8a8276';

describe('C100 §2.1 — a structural materialId outranks the KIND colour', () => {
  it('⭐ 1. a named material wins over the member kind', () => {
    const p = painted({ kind: 'brace', materialId: 'steel-structural' });
    expect(p).toBe(masterHex('steel-structural'));
    expect(p).not.toBe(BRACE_DEFAULT);
  });

  it('⭐ 2. STEEL and CONCRETE braces are different colours', () => {
    // THE LOAD-BEARING CASE. Before the fix both were `#5a6470`, so the material
    // was invisible on the element type whose defining property it is. An
    // assertion on ONE material cannot see a resolver that ignores its argument —
    // the failure that made every handrail one brown (L-1127 S16) and collapsed
    // furniture's oak and walnut onto one grey-teal.
    const steel = painted({ kind: 'brace', materialId: 'steel-structural' });
    const concrete = painted({ kind: 'brace', materialId: 'concrete-reinforced' });

    expect(steel).toBe(masterHex('steel-structural'));
    expect(concrete).toBe(masterHex('concrete-reinforced'));
    expect(steel, 'a steel brace and a concrete brace must differ').not.toBe(concrete);
  });

  it('3. the material outranks the kind ACROSS kinds — one id, one colour', () => {
    // The mirror of case 2: same material on different kinds must now agree,
    // where before the KIND decided everything and the material decided nothing.
    const braceSteel = painted({ kind: 'brace', materialId: 'steel-structural' });
    const footingSteel = painted({
      kind: 'footing', materialId: 'steel-structural', endOffset: { x: 1, y: 1, z: 0 },
    });
    expect(braceSteel).toBe(footingSteel);
    expect(braceSteel).toBe(masterHex('steel-structural'));
  });

  it('4. CONTROL — the KIND colours still govern a member naming no material (§9.6.b)', () => {
    // Repainting the product is the thing that would rightly get this convergence
    // reverted. Nothing has ever written a structural materialId, so this is the
    // answer for every structural element that exists today.
    expect(painted({ kind: 'brace' })).toBe(BRACE_DEFAULT);
    expect(painted({ kind: 'footing', endOffset: { x: 1, y: 1, z: 0 } })).toBe(FOOTING_DEFAULT);
    expect(painted({ kind: 'brace' })).not.toBe(painted({ kind: 'footing', endOffset: { x: 1, y: 1, z: 0 } }));
  });

  it('5. an UNKNOWN id paints MAGENTA — never a plausible structural grey (§5)', () => {
    const key = keyOf({ kind: 'brace', materialId: 'not-a-real-material' });
    expect(isUnresolvedStructuralMaterialKey(key)).toBe(true);
    expect(unresolvedStructuralMaterialId(key)).toBe('not-a-real-material');
    expect(colorOfStructuralMaterialKey(key)).toBe('#ff00ff');
    // ⭐ The kind default is the MOST dangerous fallback here: `#5a6470` is a
    // perfectly believable steel grey, so "your material was deleted" would have
    // rendered as "this brace is steel" (§CONTEXT-DATA-HONESTY).
    expect(colorOfStructuralMaterialKey(key)).not.toBe(BRACE_DEFAULT);
  });

  it('6. CONTROL — the KEY SHAPE is unchanged: five slots, same indices', () => {
    // Converge the VALUE, not the FORMAT (§9.6.b). Structural already had the right
    // slot in the right place, filled from the wrong source.
    const parts = keyOf({ kind: 'brace', materialId: 'steel-structural' }).split('|');
    expect(parts.length).toBe(5);
    expect(parts[0]).toBe('structural');
    expect(parts[1]).toBe('brace');
    expect(parts[2]).toBe('steel-structural');
    expect(parts[3]).toBe(masterHex('steel-structural'));
    expect(parts[4]).toBe('body');
  });

  it('7. the ids this test names all resolve in the master (S14 guard)', () => {
    for (const id of ['steel-structural', 'concrete-reinforced']) {
      expect(materialHex(id), `${id} must resolve in the master`).toBeTruthy();
    }
  });
});
