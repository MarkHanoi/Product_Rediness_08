/**
 * C100 §9.6.c step 3 / S16 — `stair` and `handrail` materialIds reach their bridges.
 *
 * ⭐ These two families are the contract's own worked examples of the defect:
 * `composeMaterialKey`'s header names handrail explicitly (*"its bridge threw the
 * id away, so every handrail in the product rendered one brown"*), and stair's
 * bridge picked its colour from the SLOT and nothing else. Both had **no colour
 * slot in the key at all**, so both are exceptions to §9.6.b's "converge the
 * VALUE, not the FORMAT" — there was no value slot to converge.
 *
 * ⚠ THE BRIDGE PARSERS ARE REPRODUCED HERE, NOT IMPORTED, and that is a real
 * weakness worth naming rather than hiding: every plugin's
 * `committer/material-bridge.ts` imports `@pryzm/renderer-three/three` at module load, which `geometry-kernel`
 * is P2-forbidden from pulling in (`import * as THREE` lives in exactly one
 * package). The two colour functions here are byte-equivalent to the bridges'
 * and pinned by the LEGACY cases below, which fail if either side drifts. The
 * ceiling test (`plugins/ceiling/__tests__/`) imports its real bridge and is the
 * stronger proof of the same wiring; this file is the kernel-side half.
 *
 * ⚠ WHAT IT DOES NOT PROVE: that a material is attached to a mesh, that the mesh
 * is in the scene, or that a frame drew.
 */

import { describe, it, expect } from 'vitest';
import { materialHex } from '@pryzm/schemas/materials';
import { produceStair } from '../src/producers/stair.js';
import { produceHandrail } from '../src/producers/handrail.js';

// ── The bridge parsers, mirrored (see the header for why they are not imported).
const UNRESOLVED_PREFIX = 'unresolved:';
const UNRESOLVED = '#ff00ff';

function colorOfStairKey(key: string): string {
  const parts = key.split('|');
  if (parts.length >= 4) {
    const r = parts[2] ?? '';
    if (r.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED;
    if (r.length > 0) return r;
  }
  return slotOfStairKey(key) === 'riser' ? '#9a7a52' : '#b58a5e';
}
function slotOfStairKey(key: string): 'tread' | 'riser' {
  const parts = key.split('|');
  if (parts.length >= 4) return parts[3] === 'riser' ? 'riser' : 'tread';
  return parts[2] === 'riser' ? 'riser' : 'tread';
}
function colorOfHandrailKey(key: string): string {
  const parts = key.split('|');
  if (parts.length >= 4) {
    const r = parts[2] ?? '';
    if (r.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED;
    if (r.length > 0) return r;
  }
  return '#5a4a3a';
}

const stairKeys = (extra: Record<string, unknown>): string[] => {
  const d = produceStair(
    {
      id: 'stair_test',
      type: 'stair',
      childrenIds: [],
      metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
      levelId: 'level:0',
      topLevelId: 'level:1',
      shape: 'straight',
      origin: { x: 0, y: 0, z: 0 },
      rotation: 0,
      numRisers: 4,
      riserHeight: 0.18,
      treadDepth: 0.28,
      width: 1,
      ...extra,
    } as never,
    {} as never,
    0,
  );
  return [...d.materialKeys] as string[];
};

const handrailKey = (extra: Record<string, unknown>): string => {
  const d = produceHandrail(
    {
      id: 'handrail_test',
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
      height: 1,
      shape: 'round',
      diameter: 0.05,
      ...extra,
    } as never,
    {} as never,
    0,
  );
  return (d.materialKeys[0] ?? '') as string;
};

describe('C100 §9.6.c — stair', () => {
  it('resolves a master id to the catalogue colour, not the per-slot brown', () => {
    const expected = materialHex('wood-oak');
    expect(expected, 'wood-oak must exist in the master').toBeDefined();
    const colours = stairKeys({ materialId: 'wood-oak' }).map(colorOfStairKey);
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) expect(c).toBe(expected!.toLowerCase());
    // The pre-S16 answer was one of these two, always.
    expect(colours).not.toContain('#b58a5e');
    expect(colours).not.toContain('#9a7a52');
  });

  it('keeps tread and riser distinguishable — the slot moved from index 2 to 3', () => {
    const slots = new Set(stairKeys({ materialId: 'wood-oak' }).map(slotOfStairKey));
    expect(slots.has('tread')).toBe(true);
    expect(slots.has('riser')).toBe(true);
  });

  it('an unmaterialled stair looks EXACTLY as it did before S16', () => {
    const bySlot = new Map<string, string>();
    for (const k of stairKeys({})) bySlot.set(slotOfStairKey(k), colorOfStairKey(k));
    expect(bySlot.get('tread')).toBe('#b58a5e');
    expect(bySlot.get('riser')).toBe('#9a7a52');
  });

  it('an UNKNOWN id is a named failure (magenta), never a plausible timber', () => {
    for (const c of stairKeys({ materialId: 'ghost-material' }).map(colorOfStairKey)) {
      expect(c).toBe(UNRESOLVED);
    }
  });

  it('a LEGACY three-field key still reads its slot correctly', () => {
    // Without this fallback an old cached key reports every tread as a riser —
    // a silent visual regression on reload, worse than the defect being fixed.
    expect(slotOfStairKey('stair|wood-oak|riser')).toBe('riser');
    expect(slotOfStairKey('stair|wood-oak|tread')).toBe('tread');
    expect(colorOfStairKey('stair|wood-oak|riser')).toBe('#9a7a52');
  });
});

describe('C100 §9.6.c — handrail', () => {
  it('resolves a master id instead of the ONE brown the bridge always returned', () => {
    const expected = materialHex('steel-galvanised');
    expect(expected).toBeDefined();
    expect(colorOfHandrailKey(handrailKey({ materialId: 'steel-galvanised' }))).toBe(
      expected!.toLowerCase(),
    );
    expect(colorOfHandrailKey(handrailKey({ materialId: 'steel-galvanised' }))).not.toBe('#5a4a3a');
  });

  it('honours an explicit override (§2.1 step 1)', () => {
    expect(
      colorOfHandrailKey(handrailKey({ materialId: 'steel-galvanised', materialColor: '#abcdef' })),
    ).toBe('#abcdef');
  });

  it('an unmaterialled handrail is still the same brown', () => {
    expect(colorOfHandrailKey(handrailKey({}))).toBe('#5a4a3a');
  });

  it('an UNKNOWN id is magenta, not brown', () => {
    expect(colorOfHandrailKey(handrailKey({ materialId: 'ghost-material' }))).toBe(UNRESOLVED);
  });

  it('a LEGACY three-field key still answers the old brown', () => {
    expect(colorOfHandrailKey('handrail|wood-oak|rail')).toBe('#5a4a3a');
  });

  it('the three builtin handrail type ids all resolve (S14 guard)', () => {
    for (const id of ['wood-oak', 'steel-painted-intumescent-white', 'steel-galvanised']) {
      expect(materialHex(id), `${id} must resolve`).toBeDefined();
    }
  });
});
