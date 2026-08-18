// C85 controls — the master material database, proved where the value is DECIDED.
//
// §COMMITTED-IS-NOT-REACHABLE: every assertion below lands on the colour slot that
// the committer's `material-bridge.ts` files actually parse to build the
// `THREE.Material`. Asserting `materialHex()` returns a hex would prove only that a
// pure function works; it would not prove any element ever renders that colour.

import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG, findMaterialRecord, materialHex } from '@pryzm/schemas/materials';
import {
  composeMaterialKey,
  isUnresolvedColorSlot,
  unresolvedIdOf,
  UNRESOLVED_PREFIX,
} from '../src/producers/_internal/composeMaterialKey.js';

/** What every bridge does: split on '|' and take slot 3. */
const colorSlot = (key: string): string => key.split('|')[3]!;

describe('C85 C-1 — a family that read NO library resolves a master material end to end', () => {
  // DOOR. Per the census, door read neither material library: its bridge inferred a
  // colour from keywords, or fell back to a wood tint. Its producer composes the key
  // through `composeMaterialKey`, so this is the whole chain from a stored id to the
  // value the bridge turns into a THREE.Color.
  //
  // RED before the fix: the slot was '#d4c5b0' for EVERY id, because the id was
  // carried through the key and never resolved by anyone.
  it('resolves an id-only door to that material colour, not the beige default', () => {
    const oak = findMaterialRecord('wood-oak') ?? MATERIAL_CATALOG.find((m) => m.category === 'Wood')!;
    const key = composeMaterialKey({ materialId: oak.id, layerName: 'leaf' });

    expect(colorSlot(key)).toBe(oak.color);
    expect(colorSlot(key)).not.toBe('#d4c5b0');
  });

  it('gives two different materials two different slots (one brown for everything is the bug)', () => {
    const [a, b] = MATERIAL_CATALOG.filter((m) => m.color !== MATERIAL_CATALOG[0]!.color).slice(0, 2);
    const ka = colorSlot(composeMaterialKey({ materialId: a!.id }));
    const kb = colorSlot(composeMaterialKey({ materialId: b!.id }));
    expect(ka).not.toBe(kb);
  });
});

describe('C85 C-2 — REFERENCE, not copy: the master is the single source of the value', () => {
  // The reference model's whole point (C85 §2.2). If this ever fails, some consumer
  // has started carrying its own copy again.
  it('every catalogue id resolves through the key to exactly that row colour', () => {
    const mismatches = MATERIAL_CATALOG.filter(
      (m) => colorSlot(composeMaterialKey({ materialId: m.id })) !== m.color,
    ).map((m) => m.id);
    expect(mismatches).toEqual([]);
  });

  it('an explicit override WINS over the reference — and that is the documented cost', () => {
    const m = MATERIAL_CATALOG[0]!;
    const key = composeMaterialKey({ materialId: m.id, materialColor: '#123456' });
    // C85 §2.2: a library edit deliberately does NOT reach an element with an override.
    expect(colorSlot(key)).toBe('#123456');
    expect(colorSlot(key)).not.toBe(m.color);
  });
});

describe('C85 C-3 — an unresolved material is NAMED, never silently plausible', () => {
  // RED before: this returned '#d4c5b0', so a drifted id and a deliberate beige were
  // the same value (§NO-EMPTY-MEANS-UNKNOWN).
  it('marks a broken reference and carries the id that failed', () => {
    const slot = colorSlot(composeMaterialKey({ materialId: 'no-such-material-xyz' }));

    expect(slot).toBe(`${UNRESOLVED_PREFIX}no-such-material-xyz`);
    expect(isUnresolvedColorSlot(slot)).toBe(true);
    expect(unresolvedIdOf(slot)).toBe('no-such-material-xyz');
    expect(slot).not.toBe('#d4c5b0');
  });

  it('does NOT mark "no material chosen" as unresolved — the two states stay apart', () => {
    // A legitimate state, not a failure. Repainting every unmaterialled element a
    // warning colour would be a regression dressed as honesty.
    const slot = colorSlot(composeMaterialKey({ systemTypeId: 'wall-generic' }));
    expect(isUnresolvedColorSlot(slot)).toBe(false);
    expect(slot).toBe('#d4c5b0');
  });

  it('never throws on a broken reference — the element still renders, visibly wrong', () => {
    expect(() => composeMaterialKey({ materialId: 'ghost' })).not.toThrow();
  });
});

describe('C85 C-5 — the move preserved the catalogue', () => {
  it('carries 204 rows with unique ids and no empty fields', () => {
    expect(MATERIAL_CATALOG).toHaveLength(204);
    expect(new Set(MATERIAL_CATALOG.map((m) => m.id)).size).toBe(204);
    const malformed = MATERIAL_CATALOG.filter(
      (m) => !/^#[0-9a-f]{6}$/.test(m.color) || !m.label || !m.category || m.source !== 'builtin',
    );
    expect(malformed).toEqual([]);
  });

  it('keeps the scalars inside their valid ranges', () => {
    const bad = MATERIAL_CATALOG.filter(
      (m) =>
        m.metalness < 0 || m.metalness > 1 ||
        m.roughness < 0 || m.roughness > 1 ||
        m.opacity < 0 || m.opacity > 1,
    );
    expect(bad).toEqual([]);
  });

  it('materialHex agrees with the row it came from, and misses return undefined', () => {
    expect(materialHex(MATERIAL_CATALOG[0]!.id)).toBe(MATERIAL_CATALOG[0]!.color);
    // A miss MUST be undefined, never a substitute — that is what lets callers
    // surface a named failure instead of rendering a lie.
    expect(materialHex('definitely-not-a-material')).toBeUndefined();
    expect(findMaterialRecord('definitely-not-a-material')).toBeUndefined();
  });
});
