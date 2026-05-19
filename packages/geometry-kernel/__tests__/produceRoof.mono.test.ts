// produceRoof — mono (single-slope / shed) unit tests (S10-T7 §2).

import { describe, expect, it } from 'vitest';
import { produceRoof } from '../src/producers/roof.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { ROOF_FIXTURES, getRoofFixture } from './__configs__/roof-index.js';
import type { JoinData } from '../src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

describe('produceRoof — mono', () => {
  const monos = ROOF_FIXTURES.filter((f) => f.roof.shape === 'mono');

  it('catalog has ≥1 mono fixture', () => {
    expect(monos.length).toBeGreaterThanOrEqual(1);
  });

  for (const f of monos) {
    it(`${f.id} produces a valid descriptor`, () => {
      const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
      assertValidDescriptor(desc);
    });
  }

  it('higher pitch → taller roof on the same footprint', () => {
    const lo = produceRoof(getRoofFixture('mono-square-low-pitch').roof, NO_JOIN, 0);
    const hi = produceRoof(
      { ...getRoofFixture('mono-square-low-pitch').roof, pitch: 35 * Math.PI / 180 },
      NO_JOIN, 0,
    );
    const loH = lo.bounds.max.y - lo.bounds.min.y;
    const hiH = hi.bounds.max.y - hi.bounds.min.y;
    expect(hiH).toBeGreaterThan(loH);
  });

  it('same input → identical hash', () => {
    const f = getRoofFixture('mono-rect-mid-pitch');
    const a = produceRoof(f.roof, NO_JOIN, f.worldY);
    const b = produceRoof(f.roof, NO_JOIN, f.worldY);
    expect(a.hash).toBe(b.hash);
  });

  it('emits 3 material slots', () => {
    const f = getRoofFixture('mono-rect-mid-pitch');
    const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
    expect(desc.materialKeys.length).toBe(3);
  });

  it('mono with overhang has wider bounds than without', () => {
    const noOh = produceRoof(getRoofFixture('mono-square-low-pitch').roof, NO_JOIN, 0);
    const withOh = produceRoof(getRoofFixture('mono-square-with-overhang').roof, NO_JOIN, 0);
    const noOhSpanX = noOh.bounds.max.x - noOh.bounds.min.x;
    const withOhSpanX = withOh.bounds.max.x - withOh.bounds.min.x;
    expect(withOhSpanX).toBeGreaterThan(noOhSpanX);
  });
});
