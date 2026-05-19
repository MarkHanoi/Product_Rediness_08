// produceWall — curved (4 tests per spec line 679).

import { describe, expect, it } from 'vitest';
import { produceWall } from '../src/producers/wall.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { getFixture } from './__configs__/index.js';

describe('produceWall — curved', () => {
  it('arc baseline (90°)', () => {
    const f = getFixture('curved-single-90deg');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    // 16 segments × 4 faces × 2 tris × 3 verts + 2 caps × 2 tris × 3 verts = 396.
    expect(desc.index.length).toBe(16 * 4 * 6 + 2 * 6);
  });

  it('arc with miter at start', () => {
    const f = getFixture('curved-miter-start');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.hash).toContain('@wall:');
  });

  it('large-radius arc produces more vertices', () => {
    const f = getFixture('curved-single-large');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    // 24 segments × 4 faces × 2 tris × 3 verts + 2 caps × 2 tris × 3 verts.
    expect(desc.index.length).toBe(24 * 4 * 6 + 2 * 6);
  });

  it('curved 2-layer wall has 2 material groups', () => {
    const f = getFixture('curved-2layer');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.groups).toHaveLength(2);
    expect(desc.materialKeys).toHaveLength(2);
  });
});
