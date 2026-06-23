// Residential-building (multi-family) — Slice B / §4.2 acceptance test.
//
// Proves the NEW `verticalCirculation` (lift) L0 schema is:
//   1. registered in SCHEMA_REGISTRY (so round-trip + projection see it),
//   2. P5-pure parseable with sane defaults + branded id,
//   3. enforcing its domain refinements (shaft width ≥ door width).
//
// Tracker: docs/03-execution/plans/RESIDENTIAL-BUILDING-IMPLEMENTATION-TRACKER.md (P1.B)

import { describe, it, expect } from 'vitest';
import { VerticalCirculation, LiftKind } from '../src/elements/VerticalCirculation.js';
import { SCHEMA_REGISTRY } from '../src/registry.js';

describe('VerticalCirculation (lift) L0 schema', () => {
  it('is registered in SCHEMA_REGISTRY under `verticalCirculation`', () => {
    expect(SCHEMA_REGISTRY.verticalCirculation).toBe(VerticalCirculation);
  });

  it('parse({}) yields fully-typed defaults + a branded id + discriminator', () => {
    const lift = VerticalCirculation.parse({});
    expect(lift.type).toBe('verticalCirculation');
    expect(lift.id).toMatch(/^verticalCirculation_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(lift.kind).toBe('passenger');
    expect(lift.shaftWidth).toBe(1.8);
    expect(lift.shaftDepth).toBe(1.8);
    expect(lift.carCapacityPersons).toBe(8);
    expect(lift.doorWidth).toBe(0.9);
    expect(lift.origin).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('parse({}) → JSON → parse is byte-identical (round-trip stability)', () => {
    const first = VerticalCirculation.parse({});
    const json1 = JSON.stringify(first);
    const second = VerticalCirculation.parse(JSON.parse(json1));
    expect(JSON.stringify(second)).toBe(json1);
  });

  it('accepts all three lift kinds', () => {
    for (const kind of LiftKind.options) {
      expect(VerticalCirculation.parse({ kind }).kind).toBe(kind);
    }
  });

  it('rejects a non-positive shaft dimension (Zod .positive)', () => {
    expect(() => VerticalCirculation.parse({ shaftWidth: 0 })).toThrow();
    expect(() => VerticalCirculation.parse({ shaftDepth: -1 })).toThrow();
  });

  it('rejects a shaft narrower than its landing door (.refine)', () => {
    expect(() =>
      VerticalCirculation.parse({ shaftWidth: 0.8, doorWidth: 0.9 }),
    ).toThrow(/at least the landing-door width/);
  });

  it('accepts base/top level spans', () => {
    const lift = VerticalCirculation.parse({
      levelId: 'level_00000000000000000000000000',
      topLevelId: 'level_00000000000000000000000001',
    });
    expect(lift.levelId).not.toBe(lift.topLevelId);
  });
});
