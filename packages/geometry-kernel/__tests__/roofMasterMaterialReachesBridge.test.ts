/**
 * C100 §9.6.c step 3 / S16 — a roof's `materialId` reaches the SHINGLE colour.
 *
 * ⚠ THE INTERESTING HALF OF THIS FILE IS THE SLOTS THAT MUST *NOT* MOVE.
 * `composeRoofMaterialKey` resolves the master only on `shingle`; deck, trim and
 * interior keep canonical colours, which C100 §9.6.b explicitly protects ("a
 * family's slot count, order and extra slots stay its own"). Resolving the roof's
 * roofing material onto its trim would repaint every roof edge in the product —
 * the visible regression §9.6.b says would rightly get the convergence reverted.
 * So the pins below are half assertion that the fix works and half assertion that
 * it did not overreach.
 *
 * ⚠ The bridge's colour parser is mirrored rather than imported: every plugin's
 * `committer/material-bridge` file loads `@pryzm/renderer-three/three` at module
 * scope, which `geometry-kernel` is P2-forbidden from pulling in. The mirrored
 * function is byte-equivalent and pinned by the legacy case.
 */

import { describe, it, expect } from 'vitest';
import { materialHex } from '@pryzm/schemas/materials';
import { composeRoofMaterialKey } from '../src/producers/_internal/roof/composeRoofMaterialKey.js';

const FALLBACK_COLOURS: Readonly<Record<string, string>> = {
  shingle: '#7a4a2a',
  deck: '#a37b58',
  trim: '#3a3a3a',
  interior: '#cccccc',
};

/** Mirrors `plugins/roof` — see header for why it is not imported. */
function colorOfRoofKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOURS.shingle!;
  const col = parts[3];
  if (col && col.length > 0) return col;
  const slot = parts[1] ?? 'shingle';
  return FALLBACK_COLOURS[slot] ?? FALLBACK_COLOURS.shingle!;
}

describe('C100 §9.6.c — roof', () => {
  it('resolves a master id on the SHINGLE slot instead of the default brown', () => {
    const expected = materialHex('roof-clay-tile') ?? materialHex('concrete-precast');
    expect(expected, 'the probe id must exist in the master').toBeDefined();
    const id = materialHex('roof-clay-tile') ? 'roof-clay-tile' : 'concrete-precast';

    const key = composeRoofMaterialKey({ slot: 'shingle', materialId: id });
    expect(colorOfRoofKey(key)).toBe(expected!.toLowerCase());
    // The pre-S16 answer.
    expect(colorOfRoofKey(key)).not.toBe('#c8a46e');
  });

  it('honours an explicit materialColor OVERRIDE over the id (§2.1 step 1)', () => {
    const key = composeRoofMaterialKey({
      slot: 'shingle',
      materialId: 'concrete-precast',
      materialColor: '#0f0f0f',
    });
    expect(colorOfRoofKey(key)).toBe('#0f0f0f');
  });

  it('surfaces an UNKNOWN id as a NAMED failure, never as a plausible tile (§5)', () => {
    const key = composeRoofMaterialKey({ slot: 'shingle', materialId: 'ghost-material' });
    expect(key).toContain('unresolved:ghost-material');
  });

  it('does NOT repaint deck, trim or interior — they stay canonical (§9.6.b)', () => {
    for (const slot of ['deck', 'trim', 'interior'] as const) {
      const withId = composeRoofMaterialKey({ slot, materialId: 'concrete-precast' });
      const without = composeRoofMaterialKey({ slot });
      expect(colorOfRoofKey(withId)).toBe(colorOfRoofKey(without));
    }
    expect(colorOfRoofKey(composeRoofMaterialKey({ slot: 'deck' }))).toBe('#e5e5e5');
    expect(colorOfRoofKey(composeRoofMaterialKey({ slot: 'trim' }))).toBe('#ffffff');
    expect(colorOfRoofKey(composeRoofMaterialKey({ slot: 'interior' }))).toBe('#f0f0f0');
  });

  it('an unmaterialled roof shingle looks EXACTLY as it did before S16', () => {
    expect(colorOfRoofKey(composeRoofMaterialKey({ slot: 'shingle' }))).toBe('#c8a46e');
  });

  it('the key LAYOUT is unchanged — the bridge needs no edit', () => {
    const key = composeRoofMaterialKey({ slot: 'shingle', materialId: 'concrete-precast' });
    const parts = key.split('|');
    expect(parts[0]).toBe('roof');
    expect(parts[1]).toBe('shingle');
    expect(parts[2]).toBe('concrete-precast');
    expect(parts).toHaveLength(4);
  });
});
