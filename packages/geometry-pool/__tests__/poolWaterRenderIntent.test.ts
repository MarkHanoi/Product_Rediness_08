// §POOL95 — THE WATER'S RENDER INTENT IS AUTHORED, AND IT RESOLVES THROUGH THE
// SAME THREE-TIER CHAIN AS EVERY POOL DIMENSION.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S ASK, AND THE ONE WORD IN IT THAT IS A TRAP
// ═══════════════════════════════════════════════════════════════════════════════
// *"can you add in the swimming pool a box with 70% transparency in blue looking
//  like water within the walls and the slab"*
//
// "A BOX" IS THE LOOK, NOT THE MODEL. ADR-0124 §4 already refused the literal
// reading — water is its own family precisely because a blue slab couples the
// water SURFACE to the pool FLOOR and cannot represent "the water sits below the
// coping". That decision stands and this suite does not reopen it.
//
// What the founder is owed is the APPEARANCE: blue, ~70% transparent, and — this
// is the part that was missing — EDITABLE, like any other finish. Before this
// lane the water's colour and opacity resolved through only TWO of the chain's
// three tiers:
//
//     resolvePoolDimensions():
//       waterColor:   pick(undefined, systemType?.waterColor, DEFAULT)
//                          ^^^^^^^^^ TIER 1 WAS HARD-WIRED TO `undefined`
//
// `Pool` carried no `waterColor` / `waterOpacity` field at all, so tier 1 — the
// architect's own override, the strongest tier — was STRUCTURALLY DEAD. Not
// "unimplemented": unreachable. An architect could not author the water's
// appearance on their own pool by any route, and nothing said so.
//
// ⚠ WHAT WOULD THE BUG SCORE? A suite that only asserted `water.color` is a blue
// string would PASS against the dead tier — the DEFAULT is blue. Every assertion
// below therefore authors a value that is NOT the default and demands to see it
// arrive, which is the only shape of the question the dead tier fails.

import { describe, it, expect } from 'vitest';
import { Pool } from '@pryzm/schemas';
import {
  buildPoolAssembly,
  resolvePoolDimensions,
  POOL_DIMENSION_DEFAULTS,
  type PoolPartIds,
  type PoolSystemType,
} from '../src/index.js';

/** A 4 × 2 m pool on a level whose datum is y = 0. Mirrors `poolAssembly.test.ts`. */
function makePool(overrides: Record<string, unknown> = {}): Pool {
  return Pool.parse({
    levelId: 'level-1',
    hostSlabId: 'slab_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 2 },
      { x: 0, y: 0, z: 2 },
    ],
    ...overrides,
  });
}

const IDS: PoolPartIds = {
  wallIds: ['wall-a', 'wall-b', 'wall-c', 'wall-d'],
  floorSlabId: 'slab-floor',
  waterId: 'water-1',
};

/** Values chosen to be UNLIKE the defaults, so a dead tier cannot fake a pass. */
const AUTHORED_COLOR = '#00FF7F';   // spring green — nobody's default pool water
const AUTHORED_OPACITY = 0.9;       // nearly solid — the opposite of the default

describe('§POOL95 — the water body carries an AUTHORED render intent', () => {
  it('WR-1: the DEFAULT water reads as the founder\'s "70% transparency in blue"', () => {
    const asm = buildPoolAssembly(makePool(), IDS);

    // 70% TRANSPARENT means 30% OPAQUE. The two are complements and conflating them
    // is the whole reason this assertion states the arithmetic instead of asserting
    // a bare number: `opacity: 0.7` would be 30% transparent — the founder's figure
    // read backwards, and it would look like a swimming pool made of jelly.
    expect(asm.water.opacity).toBeCloseTo(0.3, 5);
    expect(1 - (asm.water.opacity ?? 0)).toBeCloseTo(0.7, 5);   // ← "70% transparency"

    // Blue. Asserted as a real colour fact (blue channel dominant), not as a string
    // match, so re-tuning the exact hex does not red this and turning the water
    // GREEN does.
    const hex = asm.water.color ?? '';
    expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(b).toBeGreaterThan(r);   // ← a grey/white water dies here
    expect(b).toBeGreaterThan(g);   // ← a green water dies here
  });

  it('WR-2: TIER 1 — an authored colour/opacity ON THE POOL RECORD reaches the water', () => {
    // ⭐ THIS IS THE ASSERTION THE DEAD TIER FAILS. Before §POOL95 `resolvePoolDimensions`
    // passed a literal `undefined` for tier 1 of both fields, so an authored value on
    // the record was discarded silently and the water came back at the default.
    const asm = buildPoolAssembly(
      makePool({ waterColor: AUTHORED_COLOR, waterOpacity: AUTHORED_OPACITY }),
      IDS,
    );

    expect(asm.water.color).toBe(AUTHORED_COLOR);
    expect(asm.water.opacity).toBe(AUTHORED_OPACITY);

    // And prove the assertion is not vacuous: the authored values really are unlike
    // the defaults, so "the default happened to match" cannot explain a pass.
    expect(AUTHORED_COLOR).not.toBe(POOL_DIMENSION_DEFAULTS.waterColor);
    expect(AUTHORED_OPACITY).not.toBe(POOL_DIMENSION_DEFAULTS.waterOpacity);
  });

  it('WR-3: the chain is RECORD → SYSTEM TYPE → DEFAULT, in that order of strength', () => {
    const systemType: PoolSystemType = {
      id: 'pool-type-lagoon',
      waterColor: '#123456',
      waterOpacity: 0.5,
    };

    // Tier 3 — nothing authored anywhere.
    const bare = resolvePoolDimensions(makePool());
    expect(bare.waterColor).toBe(POOL_DIMENSION_DEFAULTS.waterColor);
    expect(bare.waterOpacity).toBe(POOL_DIMENSION_DEFAULTS.waterOpacity);

    // Tier 2 — the system type beats the default.
    const typed = resolvePoolDimensions(makePool(), systemType);
    expect(typed.waterColor).toBe('#123456');
    expect(typed.waterOpacity).toBe(0.5);

    // Tier 1 — the record beats the system type. A resolver that merely
    // "prefers whatever is defined" in the wrong order passes tiers 2 and 3 and
    // dies exactly here.
    const authored = resolvePoolDimensions(
      makePool({ waterColor: AUTHORED_COLOR, waterOpacity: AUTHORED_OPACITY }),
      systemType,
    );
    expect(authored.waterColor).toBe(AUTHORED_COLOR);
    expect(authored.waterOpacity).toBe(AUTHORED_OPACITY);
  });

  it('WR-4: opacity 0 is AUTHORED, not "unset" — the falsy trap', () => {
    // `??` vs `||` is the entire content of this test. A resolver written with `||`
    // treats an authored, fully-invisible water (opacity 0) as UNSET and silently
    // restores the default — the architect turns the water off and it stays on.
    // 0 is a legitimate authored value and the schema admits it (`z.number().min(0)`).
    const asm = buildPoolAssembly(makePool({ waterOpacity: 0 }), IDS);
    expect(asm.water.opacity).toBe(0);
    expect(asm.water.opacity).not.toBe(POOL_DIMENSION_DEFAULTS.waterOpacity);
  });

  it('WR-5: the BASIN\'s material is NOT the water\'s appearance — the blue-slab conflation, refused', () => {
    // ADR-0124 §4.2 in assertion form. `Pool.materialId` / `materialColor` describe
    // what the pool is BUILT of — the concrete of the walls and the floor. If those
    // ever leaked onto the water record, the water would be "a slab with a blue
    // material" wearing a different type name, which is the exact thing the ADR
    // refused. The two axes must stay separable.
    const asm = buildPoolAssembly(
      makePool({ materialId: 'mat-concrete-c30', materialColor: '#9E9E9E' }),
      IDS,
    );

    // The basin took the finish...
    expect(asm.walls[0]!.materialId).toBe('mat-concrete-c30');
    expect(asm.floorSlab.materialId).toBe('mat-concrete-c30');

    // ...and the water did NOT. It is still blue, still transparent.
    expect(asm.water.color).not.toBe('#9E9E9E');
    expect(asm.water.color).toBe(POOL_DIMENSION_DEFAULTS.waterColor);
    expect((asm.water as { materialColor?: string }).materialColor).toBeUndefined();
  });

  it('WR-6: the water is still INDEPENDENTLY LEVELLED — appearance did not couple it to the floor', () => {
    // The ADR-0124 §4.1 guard, restated here because this lane touched the water
    // record and a regression that re-coupled surface to floor would otherwise only
    // be caught in a different file. Halve the freeboard: the SURFACE moves, the
    // pool floor does not.
    const deep = buildPoolAssembly(makePool({ freeboard: 0.4 }), IDS);
    const shallow = buildPoolAssembly(makePool({ freeboard: 0.2 }), IDS);

    expect(deep.water.surfaceElevation).not.toBe(shallow.water.surfaceElevation);
    expect(deep.floorSlab.baseOffset).toBe(shallow.floorSlab.baseOffset);
    expect(deep.water.bottomElevation).toBe(shallow.water.bottomElevation);
  });
});
