// produceWall — simple (no openings, no curve, no layered).
// 4 tests per spec line 676.

import { describe, expect, it } from 'vitest';
import { produceWall } from '../src/producers/wall.js';
import {
  assertValidDescriptor,
  DescriptorInvariantError,
} from '../src/types/assertValidDescriptor.js';
import { getFixture } from './__configs__/index.js';
import type { Wall } from '@pryzm/protocol';

describe('produceWall — simple', () => {
  it('straight single-layer no openings produces a valid descriptor', () => {
    const f = getFixture('straight-single-no-op');
    const desc = produceWall(f.wall, f.joinData, f.worldY);
    assertValidDescriptor(desc);
    expect(desc.position.length).toBeGreaterThan(0);
    expect(desc.groups).toHaveLength(1);
    // Simple miter prism: 6 faces × 2 tris × 3 verts = 36.
    expect(desc.index.length).toBe(36);
    expect(desc.materialKeys).toHaveLength(1);
  });

  it('90deg L-junction miter changes geometry vs no-join', () => {
    const f0 = getFixture('straight-single-no-op');
    const f1 = getFixture('miter-both-90deg');
    const a = produceWall(f0.wall, f0.joinData, 0);
    const b = produceWall(f1.wall, f1.joinData, 0);
    expect(a.position.length).toBe(b.position.length);
    let differs = false;
    for (let i = 0; i < a.position.length; i++) {
      if (a.position[i] !== b.position[i]) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('45deg miter projects start cap', () => {
    const f = getFixture('miter-start-only');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.hash).toContain('|sq');         // end is square
    expect(desc.hash).toContain('@wall:');      // start has neighbour
  });

  it('degenerate zero-length wall throws DescriptorInvariantError', () => {
    const wall: Wall = {
      ...getFixture('straight-single-no-op').wall,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
    };
    expect(() => produceWall(wall, {}, 0)).toThrow(DescriptorInvariantError);
  });
});
