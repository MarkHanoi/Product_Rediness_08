// produceStair — robustness / property test (S14-T3).

import { describe, expect, it } from 'vitest';
import { produceStair } from '../src/producers/stair.js';
import { NO_JOINS } from '../src/types/JoinData.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { STAIR_FIXTURES } from './__configs__/stair-index.js';

describe('produceStair — fixture invariants', () => {
  for (const f of STAIR_FIXTURES) {
    it(`${f.id}: produces a valid descriptor`, () => {
      const desc = produceStair(f.stair, NO_JOINS, f.worldY);
      assertValidDescriptor(desc);
      expect(desc.position.length % 3).toBe(0);
      expect(desc.normal.length).toBe(desc.position.length);
      expect(desc.uv.length).toBe((desc.position.length / 3) * 2);
      for (const v of desc.position) expect(Number.isFinite(v)).toBe(true);
      for (const v of desc.normal)   expect(Number.isFinite(v)).toBe(true);
      for (const v of desc.uv)       expect(Number.isFinite(v)).toBe(true);
    });

    it(`${f.id}: materialKeys deduplicated within descriptor`, () => {
      const desc = produceStair(f.stair, NO_JOINS, f.worldY);
      const set = new Set(desc.materialKeys);
      expect(set.size).toBe(desc.materialKeys.length);
    });

    it(`${f.id}: groups cover every triangle exactly once`, () => {
      const desc = produceStair(f.stair, NO_JOINS, f.worldY);
      const total = desc.groups.reduce((acc, g) => acc + g.count, 0);
      expect(total).toBe(desc.index.length);
    });

    it(`${f.id}: hash is deterministic across two invocations`, () => {
      const a = produceStair(f.stair, NO_JOINS, f.worldY);
      const b = produceStair(f.stair, NO_JOINS, f.worldY);
      expect(a.hash).toBe(b.hash);
    });
  }
});

describe('produceStair — property sweep (30 cases)', () => {
  let seed = 0xfa11;
  function rnd(): number {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  }
  function r(min: number, max: number): number { return min + rnd() * (max - min); }
  const SHAPES = ['straight', 'l-shape', 'u-shape', 'spiral'] as const;

  for (let i = 0; i < 30; i++) {
    const shape = SHAPES[Math.floor(rnd() * SHAPES.length)]!;
    const numRisers = Math.max(2, Math.floor(r(2, 28)));
    const treadDepth = r(0.18, 0.35);
    const riserHeight = r(0.10, 0.22);
    const width = r(0.7, 1.6);

    it(`case ${i}: shape=${shape} risers=${numRisers}`, () => {
      const stair = {
        id: `stair_01HZS00000000000000PROP${String(i).padStart(2, '0')}`,
        type: 'stair' as const,
        childrenIds: [],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 },
        levelId: 'level:0',
        topLevelId: 'level:1',
        shape,
        origin: { x: 0, y: 0, z: 0 },
        rotation: 0,
        treadDepth,
        riserHeight,
        width,
        numRisers,
      } as Parameters<typeof produceStair>[0];

      const desc = produceStair(stair, NO_JOINS, 0);
      assertValidDescriptor(desc);
      for (const v of desc.position) expect(Number.isFinite(v)).toBe(true);
      expect(desc.materialKeys.length).toBeGreaterThan(0);
    });
  }
});
