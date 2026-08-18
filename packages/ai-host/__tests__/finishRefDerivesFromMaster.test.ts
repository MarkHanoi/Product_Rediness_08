// C85 C-6 — finishRef DERIVES from the master; it no longer transcribes it.
//
// The file used to carry a hand-copied hex and label per finish, under a header
// instructing authors: "If the library recolours a finish, update the hex here in the
// same commit." That is a maintenance obligation written in a comment — the weakest
// possible gate, and drift with a due date. These tests are what replaces it.

import { describe, it, expect } from 'vitest';
import { findMaterialRecord } from '@pryzm/schemas/materials';
import { resolveFinishRef, exampleFinishNames, finishRefIntegrityErrors } from '../src/intents/finishRef.js';

describe('finishRef derives its values from the master catalogue', () => {
  it('every alias maps to a real master id — no dangling references', () => {
    // RED equivalent: an id here that names nothing used to resolve to a transcribed
    // hex anyway, so a drifted id was invisible. Now it is reported by name.
    expect(finishRefIntegrityErrors()).toEqual([]);
  });

  it('resolves each canonical alias to the MASTER row, not a local copy', () => {
    const names = exampleFinishNames();
    expect(names.length).toBeGreaterThan(0);

    for (const alias of names) {
      const finish = resolveFinishRef(alias);
      expect(finish, `alias "${alias}" resolved to nothing`).not.toBeNull();

      const record = findMaterialRecord(finish!.materialId);
      expect(record, `finish "${alias}" names a material absent from the master`).toBeDefined();

      // The load-bearing assertion: the value the chat hands the command IS the
      // master's value, byte for byte. If someone re-introduces a local table, this
      // is what catches it.
      expect(finish!.materialColor).toBe(record!.color);
      expect(finish!.name).toBe(record!.label);
    }
  });

  it('still refuses an unknown finish rather than guessing', () => {
    // The resolver's honesty behaviour is unchanged by the derivation.
    expect(resolveFinishRef('unobtainium cladding')).toBeNull();
    expect(resolveFinishRef('')).toBeNull();
  });

  it('keeps the ALIASES local — language belongs to the resolver (C68 §5.d)', () => {
    // 'skim coat' is not a master label; it is a word a person says. Deriving the
    // VALUES must not have cost us the LANGUAGE.
    const byAlias = resolveFinishRef('skim coat');
    expect(byAlias).not.toBeNull();
    expect(byAlias!.materialId).toBe('gypsum-skim');
  });
});

// ─── L-960 DEFECT 2 — "wood" resolved to Insulation · Wood Fibre Board ─────────
//
// Founder-reported: *"make all inner finishes walls on the ground floor to wood"* was
// answered *"Set the interior finish of all 10 walls on Ground to Insulation · Wood
// Fibre Board."* The mechanism was not ambiguity — it was ABSENCE. 'wood' matched no
// alias, fell to the substring arm, and the only aliases containing it belonged to
// `insulation-wood-fibre`, so `partial.length === 1` made a buried product look like
// an unambiguous hit.
//
// ⛔ These assertions are worthless on their own and were never shipped on their own:
// a finish that resolves correctly and still does not render is the same false success
// with better wording. `L960WallSideFinishRenders.test.ts` is the other half.

describe('L-960 §L960-WOOD-IS-A-SURFACE — a bare finish word resolves to a VISIBLE surface', () => {
  it('"wood" is a wood SURFACE, not an insulation product', () => {
    const f = resolveFinishRef('wood');
    expect(f, '"wood" resolves at all').not.toBeNull();
    expect(f!.materialId).not.toBe('insulation-wood-fibre');
    const record = findMaterialRecord(f!.materialId);
    expect(record!.category, `"wood" resolved to ${f!.name}`).toBe('Wood');
  });

  it('the words a person actually says for a wood wall all land in Wood or Timber Engineered', () => {
    for (const word of ['wood', 'timber', 'oak', 'walnut', 'pine', 'plywood', 'bamboo', 'veneer', 'glulam']) {
      const f = resolveFinishRef(word);
      expect(f, `"${word}" resolved to nothing`).not.toBeNull();
      const record = findMaterialRecord(f!.materialId);
      expect(['Wood', 'Timber Engineered'], `"${word}" → ${f!.name}`).toContain(record!.category);
    }
  });

  it('asking for the insulation BY NAME still gets the insulation — vocabulary was added, not removed', () => {
    // The guard filters loose CANDIDATES; an exact alias is a request by name and is
    // never overruled. Narrowing the matcher instead of adding the surfaces would
    // have cost this.
    for (const word of ['wood fibre', 'wood fibre insulation', 'wood fiber insulation']) {
      expect(resolveFinishRef(word)!.materialId, word).toBe('insulation-wood-fibre');
    }
    expect(resolveFinishRef('cellulose insulation')!.materialId).toBe('insulation-cellulose');
  });

  it('the pre-L-960 finishes are unmoved', () => {
    expect(resolveFinishRef('plaster')!.materialId).toBe('gypsum-skim');
    expect(resolveFinishRef('limewash')!.materialId).toBe('paint-limewash-cream');
    expect(resolveFinishRef('microcement')!.materialId).toBe('paint-microcement-warm-grey');
    expect(resolveFinishRef('drywall')!.materialId).toBe('gypsum-plasterboard');
    expect(resolveFinishRef('paint')!.materialId).toBe('paint-matte-white');
  });

  it('DISCLOSED CONSEQUENCE — "white" is now genuinely ambiguous and refuses', () => {
    // It matches white paint AND whitewashed oak. C85's rule is "ambiguity ⇒ null,
    // never a coin-flip", so a refusal that lists real options is the correct answer
    // and not a regression to paper over. Recorded here so the change is visible
    // rather than discovered.
    expect(resolveFinishRef('white')).toBeNull();
    expect(resolveFinishRef('white paint')!.materialId).toBe('paint-matte-white');
    expect(resolveFinishRef('whitewashed oak')!.materialId).toBe('wood-oak-whitewashed');
  });
});
