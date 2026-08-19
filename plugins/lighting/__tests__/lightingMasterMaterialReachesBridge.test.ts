/**
 * ⭐ C100 §2.1 / §9.6.c step 3 / L-1127 S16 — A LIGHT FIXTURE'S `materialId` REACHES
 * THE BRIDGE, AND ITS BODY STOPS BEING PAINTED THE COLOUR OF ITS OWN BEAM.
 *
 * ⚠ ITS OWN TEST, NOT A SHARED HARNESS (L-1127's standing instruction; C100 §9.3
 * retracted a slice for proving coverage with a test that never constructed its
 * subject). It drives `produceLighting` — the real producer — into
 * `makeLightingMaterialFactory` — the real bridge — and reads every expected hex
 * OUT of `MATERIAL_CATALOG` rather than typing it.
 *
 * ─── ⛔ THE DEFECT, and why it is not the furniture one ─────────────────────
 *
 * `materialId` has sat in slot 2 of the lighting material key since the key was
 * written and NOTHING HAS EVER READ IT. `colorOfLightingMaterialKey` returns slot
 * 3 — and slot 3 is `rgbToHex(l.color)`, **the colour of the light the fixture
 * EMITS**. The bridge then applied that one value to the material's `color` AND its
 * `emissive`.
 *
 * ⭐ So a luminaire's BODY was painted the colour of its own beam. A blackened-steel
 * downlight emitting 2700 K warm white rendered as a WARM WHITE OBJECT, and naming
 * `steel-blackened` on it changed nothing at all.
 *
 * ⚠ This is NOT furniture's defect wearing a different hat, and the distinction is
 * the whole design of the fix. Furniture's key had a colour slot filled by a HASH —
 * one quantity, computed wrongly. Lighting's key had a colour slot filled CORRECTLY
 * with a DIFFERENT QUANTITY. What the fixture is MADE OF and what comes OUT of it
 * are two physical properties, and the key had room for one. So slot 3 keeps its
 * meaning and a body colour is APPENDED at slot 7 — indices 0–6 byte-identical,
 * because this key's own header records that its slot indices are a contract.
 *
 * RED-FIRST, EXECUTED NOT ASSUMED — see the commit body for the run and its split.
 *
 * ⚠ WHAT THIS DOES NOT PROVE: that a fixture mesh was drawn, or that the material
 * survives save/load. `LightingTypes.ts` (the RUNTIME record) still declares no
 * `materialId` — the gate's ARM F — so a material chosen at runtime does not yet
 * persist. Different defect, different fix, NOT closed here.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { Lighting, createId } from '@pryzm/schemas';
import { produceLighting, NO_JOINS } from '@pryzm/geometry-kernel';
import {
  makeLightingMaterialFactory,
  colorOfLightingMaterialKey,
  bodyColorOfLightingMaterialKey,
  unresolvedLightingMaterialId,
} from '../src/committer/material-bridge';

const dto = (partial: Partial<Lighting>): Lighting =>
  Lighting.parse({
    id: createId('lighting'),
    levelId: 'L1',
    kind: 'downlight',
    ...partial,
  });

const keyOf = (partial: Partial<Lighting>): string => {
  const d = produceLighting(dto(partial), NO_JOINS, 0);
  const keys = d.materialKeys as unknown as string[];
  expect(keys.length, 'the producer must emit a material key').toBeGreaterThan(0);
  return String(keys[0]);
};

const hex = (c: THREE.Color): string => '#' + c.getHexString().toLowerCase();

/** The material the committer would actually attach to the fixture mesh. */
const built = (partial: Partial<Lighting>) =>
  makeLightingMaterialFactory(keyOf(partial))();

/** Read from the master, NEVER transcribed. */
const masterHex = (id: string): string => {
  const rec = MATERIAL_CATALOG.find((m) => m.id === id);
  expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
  return rec!.color.toLowerCase();
};

/** A deliberately non-white emitted colour, so "body" and "beam" cannot be confused. */
const WARM: [number, number, number] = [1, 0.72, 0.42];
const WARM_HEX = '#ffb86b';

describe('C100 §2.1 — a light fixture body takes the MASTER\'s colour, not its own beam\'s', () => {
  it('⭐ 1. the BODY is the master material and the EMISSIVE is still the light', () => {
    // THE LOAD-BEARING CASE. `steel-blackened` is #1d1f20 — near black — against a
    // warm amber beam, so the two values cannot be mistaken for one another and a
    // test that confused them could not pass.
    const m = built({ materialId: 'steel-blackened', color: WARM });

    expect(hex(m.color), 'the BODY is what the fixture is MADE OF')
      .toBe(masterHex('steel-blackened'));
    expect(hex(m.emissive), 'the EMISSIVE is what the fixture EMITS')
      .toBe(WARM_HEX);

    // NEGATIVE — the pre-fix answer was the beam colour on both channels.
    expect(hex(m.color)).not.toBe(WARM_HEX);
    expect(hex(m.color)).not.toBe(hex(m.emissive));
  });

  it('⭐ 2. a black fixture emitting warm light is BLACK AND GLOWS WARM', () => {
    // The physical claim spelled out, because the split is the design decision and
    // "the emissive follows the body" would be an equally plausible-looking fix
    // that is wrong. A blackened downlight does not emit black.
    const m = built({ materialId: 'steel-blackened', color: WARM });
    expect(hex(m.color)).toBe('#1d1f20');
    expect(hex(m.emissive)).toBe(WARM_HEX);
    expect(m.emissiveIntensity).toBe(0.4);
  });

  it('3. two fixtures with DIFFERENT materials and the SAME beam differ', () => {
    // The furniture collision lesson, applied before it can happen here: an
    // assertion on one material cannot see a resolver that ignores its argument —
    // which is exactly how `colorOfHandrailMaterialKey(_key)` returned one brown
    // for every handrail in the product (L-1127 S16).
    const black = built({ materialId: 'steel-blackened', color: WARM });
    const brushed = built({ materialId: 'steel-stainless-brushed', color: WARM });

    expect(hex(black.color)).toBe(masterHex('steel-blackened'));
    expect(hex(brushed.color)).toBe(masterHex('steel-stainless-brushed'));
    expect(hex(black.color)).not.toBe(hex(brushed.color));
    // …and they still emit the same light, because only the body changed.
    expect(hex(black.emissive)).toBe(hex(brushed.emissive));
  });

  it('4. an UNKNOWN id paints the BODY magenta — a named failure (§5)', () => {
    const key = keyOf({ materialId: 'not-a-real-material', color: WARM });
    expect(unresolvedLightingMaterialId(key)).toBe('not-a-real-material');
    expect(bodyColorOfLightingMaterialKey(key)).toBe('#ff00ff');

    const m = makeLightingMaterialFactory(key)();
    expect(hex(m.color)).toBe('#ff00ff');
    // ⚠ The fixture still EMITS correctly. Magenta says "your material was lost",
    // not "your light is broken" — over-reaching into the beam would make the
    // diagnostic lie about a second thing.
    expect(hex(m.emissive)).toBe(WARM_HEX);
  });

  it('5. CONTROL — a fixture naming NO material renders EXACTLY as before (§9.6.b)', () => {
    // Repainting the product is the thing that would rightly get this convergence
    // reverted. With no `materialId` the body slot is EMPTY — deliberately not
    // pre-filled with the light colour "for symmetry" — and the bridge falls back
    // to slot 3, which is byte-identically the old behaviour.
    const m = built({ color: WARM });
    expect(hex(m.color)).toBe(WARM_HEX);
    expect(hex(m.emissive)).toBe(WARM_HEX);
    expect(bodyColorOfLightingMaterialKey(keyOf({ color: WARM }))).toBeNull();
  });

  it('6. CONTROL — a LEGACY key (8 parts, no body slot) is answered exactly as before', () => {
    const legacy = 'lighting|downlight||#ffb86b|800.0@2700|3.0000|0|body';
    expect(bodyColorOfLightingMaterialKey(legacy), 'a legacy key names no body material').toBeNull();
    const m = makeLightingMaterialFactory(legacy)();
    expect(hex(m.color)).toBe(WARM_HEX);
    expect(hex(m.emissive)).toBe(WARM_HEX);
  });

  it('7. slot INDICES 0-6 are unchanged — this key\'s stated contract', () => {
    // §FEAT-FIXTURE-PHOTOMETRY records that the slot indices are a contract, not an
    // accident ("slot indices are unchanged, so colorOfLightingMaterialKey (slot 3)
    // is unaffected"). The body colour is APPENDED for that reason, and this pins
    // it so a later editor cannot quietly insert.
    const key = keyOf({ materialId: 'steel-blackened', color: WARM, isEmergency: true });
    const parts = key.split('|');
    expect(parts[0]).toBe('lighting');
    expect(parts[1]).toBe('downlight');
    expect(parts[2]).toBe('steel-blackened');
    expect(parts[3]).toBe(WARM_HEX);          // still the LIGHT's colour
    expect(parts[6]).toBe('1');               // the emergency flag the parity suite reads
    expect(parts[7]).toBe(masterHex('steel-blackened')); // the new body slot
    expect(key.endsWith('|body')).toBe(true);
    // …and slot 3 still means what every existing reader thinks it means.
    expect(colorOfLightingMaterialKey(key)).toBe(WARM_HEX);
  });

  it('8. the ids this test names all resolve in the master (S14 guard)', () => {
    for (const id of ['steel-blackened', 'steel-stainless-brushed']) {
      expect(materialHex(id), `${id} must resolve in the master`).toBeTruthy();
    }
  });
});
