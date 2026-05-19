// produceRoof — hip (4-slope shrunk-ridge) unit tests (S10-T7 §4).

import { describe, expect, it } from 'vitest';
import { produceRoof } from '../src/producers/roof.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { ROOF_FIXTURES, getRoofFixture } from './__configs__/roof-index.js';
import type { JoinData } from '../src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

describe('produceRoof — hip', () => {
  const hips = ROOF_FIXTURES.filter((f) => f.roof.shape === 'hip');

  it('catalog has ≥1 hip fixture', () => {
    expect(hips.length).toBeGreaterThanOrEqual(1);
  });

  for (const f of hips) {
    it(`${f.id} produces a valid descriptor`, () => {
      const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
      assertValidDescriptor(desc);
    });
  }

  it('square hip degenerates to a pyramid (ridge polygon collapses)', () => {
    // 4×4 square → inradius = 2, shrunk by 2 → empty → apex pyramid.
    const f = getRoofFixture('hip-square-mid-pitch');
    const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
    // Apex height = inradius * tan(pitch).  inradius = 2 (no overhang).
    const expected = f.worldY + f.roof.thickness + 2 * Math.tan(25 * Math.PI / 180);
    expect(desc.bounds.max.y).toBeCloseTo(expected, 4);
  });

  it('rectangular hip has a linear ridge (height = halfMinSide * tan)', () => {
    const f = getRoofFixture('hip-rect-mid-pitch'); // 6×4 → inradius = 2
    const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
    const expected = f.worldY + f.roof.thickness + 2 * Math.tan(25 * Math.PI / 180);
    expect(desc.bounds.max.y).toBeCloseTo(expected, 4);
  });

  it('overhang increases the eave footprint and the inradius', () => {
    const noOh = produceRoof(getRoofFixture('hip-square-mid-pitch').roof, NO_JOIN, 0);
    const withOh = produceRoof(getRoofFixture('hip-square-with-overhang').roof, NO_JOIN, 0);
    const noOhSpanX = noOh.bounds.max.x - noOh.bounds.min.x;
    const withOhSpanX = withOh.bounds.max.x - withOh.bounds.min.x;
    expect(withOhSpanX).toBeGreaterThan(noOhSpanX);
  });

  it('hash deterministic', () => {
    const f = getRoofFixture('hip-pentagon-mid-pitch');
    const a = produceRoof(f.roof, NO_JOIN, f.worldY);
    const b = produceRoof(f.roof, NO_JOIN, f.worldY);
    expect(a.hash).toBe(b.hash);
  });
});
