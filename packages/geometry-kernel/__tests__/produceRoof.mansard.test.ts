// produceRoof — mansard (skirt + cap two-tier) unit tests (S10-T7 §5).

import { describe, expect, it } from 'vitest';
import { produceRoof } from '../src/producers/roof.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { ROOF_FIXTURES, getRoofFixture } from './__configs__/roof-index.js';
import type { JoinData } from '../src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

describe('produceRoof — mansard', () => {
  const mansards = ROOF_FIXTURES.filter((f) => f.roof.shape === 'mansard');

  it('catalog has ≥1 mansard fixture', () => {
    expect(mansards.length).toBeGreaterThanOrEqual(1);
  });

  for (const f of mansards) {
    it(`${f.id} produces a valid descriptor`, () => {
      const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
      assertValidDescriptor(desc);
    });
  }

  it('mansard cap height = inradius * tan(pitch) on a 6×6 square', () => {
    const f = getRoofFixture('mansard-square-mid-pitch'); // 6×6 → inradius = 3
    const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
    const expected = f.worldY + f.roof.thickness + 3 * Math.tan(25 * Math.PI / 180);
    expect(desc.bounds.max.y).toBeCloseTo(expected, 4);
  });

  it('higher pitch → taller cap on the same footprint', () => {
    const lo = produceRoof(getRoofFixture('mansard-square-mid-pitch').roof, NO_JOIN, 0);
    const hi = produceRoof(getRoofFixture('mansard-square-tall-pitch').roof, NO_JOIN, 0);
    const loH = lo.bounds.max.y - lo.bounds.min.y;
    const hiH = hi.bounds.max.y - hi.bounds.min.y;
    expect(hiH).toBeGreaterThan(loH);
  });

  it('overhang widens the eave footprint', () => {
    const noOh = produceRoof(getRoofFixture('mansard-square-mid-pitch').roof, NO_JOIN, 0);
    const withOh = produceRoof(getRoofFixture('mansard-square-with-overhang').roof, NO_JOIN, 0);
    const noOhSpanX = noOh.bounds.max.x - noOh.bounds.min.x;
    const withOhSpanX = withOh.bounds.max.x - withOh.bounds.min.x;
    expect(withOhSpanX).toBeGreaterThan(noOhSpanX);
  });

  it('hash deterministic', () => {
    const f = getRoofFixture('mansard-rect-mid-pitch');
    const a = produceRoof(f.roof, NO_JOIN, f.worldY);
    const b = produceRoof(f.roof, NO_JOIN, f.worldY);
    expect(a.hash).toBe(b.hash);
  });
});
