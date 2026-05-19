// produceRoof — gable (ridge-along-longer-axis) unit tests (S10-T7 §3).

import { describe, expect, it } from 'vitest';
import { produceRoof } from '../src/producers/roof.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { ROOF_FIXTURES, getRoofFixture } from './__configs__/roof-index.js';
import type { JoinData } from '../src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

describe('produceRoof — gable', () => {
  const gables = ROOF_FIXTURES.filter((f) => f.roof.shape === 'gable');

  it('catalog has ≥1 gable fixture', () => {
    expect(gables.length).toBeGreaterThanOrEqual(1);
  });

  for (const f of gables) {
    it(`${f.id} produces a valid descriptor`, () => {
      const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
      assertValidDescriptor(desc);
    });
  }

  it('rectangular gable: ridge height = (shortSide / 2) * tan(pitch)', () => {
    const f = getRoofFixture('gable-rect-low-pitch'); // 6×4, pitch=10°
    const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
    const expected = f.worldY + f.roof.thickness + 2 * Math.tan(10 * Math.PI / 180);
    // Top of bounds matches the ridge.
    expect(desc.bounds.max.y).toBeCloseTo(expected, 4);
  });

  it('square gable: ridge along x (spanX === spanZ → ridgeAlongX is true)', () => {
    const f = getRoofFixture('gable-square-mid-pitch');
    const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
    // For a 4×4 square, halfPerp = 2, ridgeH = 2 * tan(25°)
    const expected = f.worldY + f.roof.thickness + 2 * Math.tan(25 * Math.PI / 180);
    expect(desc.bounds.max.y).toBeCloseTo(expected, 4);
  });

  it('overhang expands the eave footprint', () => {
    const noOh = produceRoof(getRoofFixture('gable-rect-low-pitch').roof, NO_JOIN, 0);
    const withOh = produceRoof(getRoofFixture('gable-rect-with-overhang').roof, NO_JOIN, 0);
    const noOhSpanX = noOh.bounds.max.x - noOh.bounds.min.x;
    const withOhSpanX = withOh.bounds.max.x - withOh.bounds.min.x;
    expect(withOhSpanX).toBeGreaterThan(noOhSpanX);
  });

  it('hash deterministic across calls', () => {
    const f = getRoofFixture('gable-rect-tall-pitch');
    const a = produceRoof(f.roof, NO_JOIN, f.worldY);
    const b = produceRoof(f.roof, NO_JOIN, f.worldY);
    expect(a.hash).toBe(b.hash);
  });
});
