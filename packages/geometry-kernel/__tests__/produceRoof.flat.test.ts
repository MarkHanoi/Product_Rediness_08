// produceRoof — flat shape unit tests (S10-T7 §1).
// Validates kernel invariants and slot/material structure for the
// FLAT roof builder.

import { describe, expect, it } from 'vitest';
import { produceRoof } from '../src/producers/roof.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { ROOF_FIXTURES, getRoofFixture } from './__configs__/roof-index.js';
import type { JoinData } from '../src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

describe('produceRoof — flat', () => {
  const flatFixtures = ROOF_FIXTURES.filter((f) => f.roof.shape === 'flat');

  it('catalog has ≥1 flat fixture', () => {
    expect(flatFixtures.length).toBeGreaterThanOrEqual(1);
  });

  for (const f of flatFixtures) {
    it(`${f.id} produces a valid descriptor`, () => {
      const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
      assertValidDescriptor(desc);
      expect(desc.position.length % 3).toBe(0);
      expect(desc.index.length % 3).toBe(0);
    });
  }

  it('emits 3 distinct material slots (shingle / deck / trim)', () => {
    const f = getRoofFixture('flat-square-no-overhang');
    const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
    expect(desc.materialKeys.length).toBe(3);
    const keys = desc.materialKeys.map(String);
    expect(keys.some((k) => k.startsWith('roof|shingle|'))).toBe(true);
    expect(keys.some((k) => k.startsWith('roof|deck|'))).toBe(true);
    expect(keys.some((k) => k.startsWith('roof|trim|'))).toBe(true);
  });

  it('hash is deterministic (same input → same hash)', () => {
    const f = getRoofFixture('flat-square-no-overhang');
    const a = produceRoof(f.roof, NO_JOIN, f.worldY);
    const b = produceRoof(f.roof, NO_JOIN, f.worldY);
    expect(a.hash).toBe(b.hash);
  });

  it('overhang expands the bounds outward', () => {
    const noOh = produceRoof(getRoofFixture('flat-square-no-overhang').roof, NO_JOIN, 0);
    const withOh = produceRoof(getRoofFixture('flat-square-with-overhang').roof, NO_JOIN, 2.5);
    const noOhSpanX = noOh.bounds.max.x - noOh.bounds.min.x;
    const withOhSpanX = withOh.bounds.max.x - withOh.bounds.min.x;
    expect(withOhSpanX).toBeGreaterThan(noOhSpanX);
  });

  it('thickness controls the Y span', () => {
    const a = produceRoof(getRoofFixture('flat-square-no-overhang').roof, NO_JOIN, 0); // 0.2
    const b = produceRoof(getRoofFixture('flat-rect-thick').roof, NO_JOIN, 0);          // 0.4
    const aH = a.bounds.max.y - a.bounds.min.y;
    const bH = b.bounds.max.y - b.bounds.min.y;
    expect(bH).toBeGreaterThan(aH);
  });

  it('worldY shifts the entire bbox by the same amount', () => {
    const f = getRoofFixture('flat-square-no-overhang');
    const a = produceRoof(f.roof, NO_JOIN, 0);
    const b = produceRoof(f.roof, NO_JOIN, 5);
    expect(b.bounds.min.y - a.bounds.min.y).toBeCloseTo(5, 6);
    expect(b.bounds.max.y - a.bounds.max.y).toBeCloseTo(5, 6);
  });
});
