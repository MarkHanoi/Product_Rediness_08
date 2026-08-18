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
