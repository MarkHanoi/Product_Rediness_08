import { describe, it, expect } from 'vitest';
import { Roof } from '../src/elements/Roof.js';

/**
 * §ROOF-BOUNDING-WALLS — closing the L0 half of the C79 §6.3 named storage gap
 * (owner @pryzm/geometry-roof).
 *
 * THE MEASURED CLAIM, tested red-first before the field was added:
 * `RoofRegionTrace.traceRoofRegionAtPoint` ALREADY attributes a traced ring to
 * the walls that produced it and already RETURNS `attribution.hostWallIds`
 * (`SlabRegionTracer.ts` — "distinct wall ids the resulting sketch depends on").
 * The reference was never missing. It was DISCARDED, because
 * `packages/schemas/src/elements/Roof.ts` declared no field it could occupy and
 * Zod's default `strip` unknown-key mode deleted it in transit — silently, with
 * `parse()` reporting success. A roof could not follow its walls for want of a
 * FIELD, not for want of a wire.
 *
 * SHAPE — mirrored from the ONE proven L0 precedent, `Room.ts:140`
 * (`boundingWallIds: z.array(z.string()).default([])` + a uniqueness `.refine`),
 * with exactly one deliberate deviation: `.optional()` rather than
 * `.default([])`. See the `absent ≠ empty` arm below for why that deviation is
 * required rather than stylistic.
 */
describe('§ROOF-BOUNDING-WALLS — the L0 schema can carry a boundary reference', () => {
  const RING = [
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 3 },
    { x: 0, y: 0, z: 3 },
  ];

  /**
   * THE RED-FIRST ARM — the measurement this whole change is justified by.
   * Before `boundingWallIds` existed this FAILED: the ids went in and came out
   * `undefined`, with no error raised. Retained as the regression guard — if
   * anyone re-narrows the schema, this arm goes red first.
   */
  it('carries host wall ids through parse instead of stripping them', () => {
    const parsed = Roof.parse({
      levelId: 'level-0',
      boundary: RING,
      boundingWallIds: ['wall-north', 'wall-east', 'wall-south'],
    });

    expect(parsed.boundingWallIds).toBeDefined();
    expect(parsed.boundingWallIds).toEqual(['wall-north', 'wall-east', 'wall-south']);
  });

  /**
   * The load-bearing constraint on the entire change: `packages/schemas` is L0
   * and snapshot v3 compatibility must not break. Additive-OPTIONAL is what buys
   * that. A required field — or a widened/retyped `boundary` that rejected the
   * existing `Vec3[]` — would be a regression for every saved project.
   */
  it('SNAPSHOT COMPATIBILITY — a roof written before the field existed still parses', () => {
    const legacy = {
      levelId: 'level-0',
      boundary: RING,
      shape: 'gable',
      pitch: 0.5,
      thickness: 0.2,
      overhang: 0.4,
    };

    const parsed = Roof.parse(legacy);

    expect(parsed.boundary).toHaveLength(4);
    expect(parsed.shape).toBe('gable');
    expect(parsed.pitch).toBeCloseTo(0.5);
    expect(parsed.overhang).toBeCloseTo(0.4);
    expect(parsed.boundingWallIds).toBeUndefined();
  });

  it('SNAPSHOT COMPATIBILITY — the bare-defaults roof is unchanged', () => {
    const parsed = Roof.parse({});
    expect(parsed.boundary).toHaveLength(4);
    expect(parsed.shape).toBe('flat');
    expect(parsed.pitch).toBe(0);
    expect(parsed.thickness).toBe(0.2);
    expect(parsed.boundingWallIds).toBeUndefined();
  });

  /**
   * WHY `.optional()` AND NOT Room's `.default([])` — the one deviation from the
   * precedent, and it is forced by two citations, not by taste:
   *
   *  • C79 §7.1, quoted at `RoofRegionTrace.ts:44`, names an unpopulated
   *    `boundingWallIds: []` on a roof as the anti-pattern BY NAME — "writing a
   *    field the model cannot honour".
   *  • ADR-0299 / §CONTEXT-DATA-HONESTY, which `SlabRegionTracer.ts` cites over
   *    this very attribution: "a refusal and an empty result must not be the
   *    same value".
   *
   * `Room` can safely default to `[]` because a producer repopulates it on every
   * rebuild. A roof cannot: most roofs are drawn by rectangle or polyline and are
   * NEVER region-traced, so a default `[]` would assert of every such roof that
   * it was traced and bounded nothing. Absent = "never attributed"; `[]` =
   * "traced, attributed nothing". Those are different facts and must stay
   * different values.
   */
  it('distinguishes an explicit empty attribution from an absent one', () => {
    const tracedBoundedNothing = Roof.parse({ boundingWallIds: [] });
    const neverTraced = Roof.parse({});

    expect(tracedBoundedNothing.boundingWallIds).toEqual([]);
    expect(neverTraced.boundingWallIds).toBeUndefined();
    expect(tracedBoundedNothing.boundingWallIds).not.toEqual(neverTraced.boundingWallIds);
  });

  /** Mirrors the `Room.ts:147-150` uniqueness refinement exactly. */
  it('rejects a duplicated wall id rather than storing a double-counted host set', () => {
    expect(() =>
      Roof.parse({ boundingWallIds: ['wall-north', 'wall-north'] }),
    ).toThrow();
  });

  it('rejects a malformed reference rather than silently dropping it', () => {
    expect(() => Roof.parse({ boundingWallIds: [''] })).toThrow();
    expect(() => Roof.parse({ boundingWallIds: 'wall-north' })).toThrow();
    expect(() => Roof.parse({ boundingWallIds: [42] })).toThrow();
  });

  it('round-trips byte-identically through a second parse', () => {
    const once = Roof.parse({
      boundary: RING,
      boundingWallIds: ['wall-north', 'wall-east'],
    });
    const twice = Roof.parse(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('preserves the flat/pitch refinement alongside the new field', () => {
    expect(() =>
      Roof.parse({ shape: 'flat', pitch: 0.4, boundingWallIds: ['w1'] }),
    ).toThrow();
    expect(() =>
      Roof.parse({ shape: 'gable', pitch: 0.4, boundingWallIds: ['w1'] }),
    ).not.toThrow();
  });
});
