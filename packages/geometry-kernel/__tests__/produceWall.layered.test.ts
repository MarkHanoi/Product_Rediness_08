// produceWall — layered (4 tests per spec line 677).

import { describe, expect, it } from 'vitest';
import { produceWall } from '../src/producers/wall.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { getFixture } from './__configs__/index.js';

describe('produceWall — layered', () => {
  it('2-layer wall (CMU + drywall) produces 2 material groups', () => {
    const f = getFixture('straight-2layer');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.groups).toHaveLength(2);
    expect(desc.materialKeys).toHaveLength(2);
  });

  it('3-layer wall produces 3 material groups', () => {
    const f = getFixture('straight-3layer');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.groups).toHaveLength(3);
  });

  it('5-layer full assembly produces 5 material groups', () => {
    const f = getFixture('straight-5layer');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.groups).toHaveLength(5);
  });

  it('layer width sum equals wall thickness within 1e-9', () => {
    const f = getFixture('straight-5layer');
    const sum = f.wall.layers!.reduce((s, l) => s + l.thickness, 0);
    expect(Math.abs(sum - f.wall.thickness)).toBeLessThan(1e-9);
  });
});
