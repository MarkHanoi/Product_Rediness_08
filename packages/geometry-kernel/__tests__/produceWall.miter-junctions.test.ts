// produceWall — miter junctions (5 tests per spec line 680).

import { describe, expect, it } from 'vitest';
import { produceWall } from '../src/producers/wall.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { getFixture } from './__configs__/index.js';

function vertexSet(d: { position: Float32Array }): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < d.position.length; i += 3) {
    s.add(`${d.position[i]!.toFixed(4)},${d.position[i + 1]!.toFixed(4)},${d.position[i + 2]!.toFixed(4)}`);
  }
  return s;
}

describe('produceWall — miter junctions', () => {
  it('T-junction left (start miter only)', () => {
    const f0 = getFixture('straight-single-no-op');
    const f1 = getFixture('miter-acute');
    const a = produceWall(f0.wall, {}, 0);
    const b = produceWall(f1.wall, f1.joinData, 0);
    assertValidDescriptor(b);
    expect(vertexSet(a)).not.toEqual(vertexSet(b));
  });

  it('T-junction right (end miter only)', () => {
    const f = getFixture('miter-tjunction-right');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
  });

  it('L-junction (90° miter both ends)', () => {
    const f = getFixture('miter-both-90deg');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.hash).toContain('@wall:');
  });

  it('45° miter at start changes vertex set', () => {
    const a = produceWall(getFixture('straight-single-no-op').wall, {}, 0);
    const b = produceWall(getFixture('miter-start-only').wall, getFixture('miter-start-only').joinData, 0);
    expect(vertexSet(a)).not.toEqual(vertexSet(b));
  });

  it('miter angle below 1e-9 rad is treated as no miter', () => {
    const f = getFixture('straight-single-no-op');
    const desc = produceWall(f.wall, {
      start: { miterAngleRad: 1e-12, neighbourId: 'wall:tinyangle' as never },
    }, 0);
    assertValidDescriptor(desc);
    // Vertex set should match the no-join case.
    const baseline = produceWall(f.wall, {}, 0);
    expect(vertexSet(desc)).toEqual(vertexSet(baseline));
  });
});
