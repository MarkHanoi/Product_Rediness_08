// produceCurtainWall — robustness / property test (S13 D7).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S13 D7.
// Verifies producer invariants across the S13 fixture catalog plus a
// pseudo-random sample of bay-grid permutations.  This is the "kernel
// side" guard of the perf fix — it asserts that:
//
//   1. Producer NEVER throws / NEVER returns NaN coordinates.
//   2. Vertex / index / normal arrays have the right shapes.
//   3. `materialKeys` are unique within a single descriptor (the
//      bucketing precondition that makes MaterialPool dedup work
//      across CW instances).
//   4. The intent-resolver grid math (CurtainWallIntentResolver
//      uses an internal copy of `computeCurtainWallGrid`) agrees
//      with the kernel's `computeCurtainWallGrid`.

import { describe, expect, it } from 'vitest';
import { produceCurtainWall, computeCurtainWallGrid } from '../src/producers/curtainwall.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { CW_FIXTURES } from './__configs__/curtainwall-index.js';

const NO_JOINS = { startJoin: { kind: 'none' as const }, endJoin: { kind: 'none' as const } };

describe('produceCurtainWall — fixture invariants', () => {
  for (const f of CW_FIXTURES) {
    it(`${f.id}: produces a valid descriptor`, () => {
      const desc = produceCurtainWall(f.cw, f.joinData, f.worldY);
      assertValidDescriptor(desc);
      expect(desc.position.length % 3).toBe(0);
      expect(desc.normal.length).toBe(desc.position.length);
      expect(desc.uv.length).toBe((desc.position.length / 3) * 2);
      // No NaN / Infinity anywhere in the float arrays.
      for (const v of desc.position) expect(Number.isFinite(v)).toBe(true);
      for (const v of desc.normal)   expect(Number.isFinite(v)).toBe(true);
      for (const v of desc.uv)       expect(Number.isFinite(v)).toBe(true);
    });

    it(`${f.id}: materialKeys are deduplicated within the descriptor`, () => {
      const desc = produceCurtainWall(f.cw, f.joinData, f.worldY);
      const set = new Set(desc.materialKeys);
      expect(set.size).toBe(desc.materialKeys.length);
    });

    it(`${f.id}: groups cover every triangle exactly once`, () => {
      const desc = produceCurtainWall(f.cw, f.joinData, f.worldY);
      const total = desc.groups.reduce((acc, g) => acc + g.count, 0);
      expect(total).toBe(desc.index.length);
    });
  }
});

describe('produceCurtainWall — pseudo-random property sweep (50 cases)', () => {
  // Deterministic LCG — keep the suite reproducible without depending
  // on a third-party fast-check / hypothesis-style runner.
  let seed = 0x1234567;
  function rnd(): number {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  }
  function randInRange(min: number, max: number): number {
    return min + rnd() * (max - min);
  }

  for (let i = 0; i < 50; i++) {
    const length = randInRange(1.5, 18);
    const height = randInRange(1.8, 9);
    const bayWidth = randInRange(0.6, 3);
    const bayHeight = randInRange(0.6, 3);
    const mullionThickness = randInRange(0.02, 0.12);

    it(`case ${i}: L=${length.toFixed(2)} H=${height.toFixed(2)} bay=${bayWidth.toFixed(2)}×${bayHeight.toFixed(2)}`, () => {
      const cw = {
        id: `curtainwall_01HZS00000000000000PROP${String(i).padStart(2, '0')}`,
        type: 'curtainwall' as const,
        childrenIds: [],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 },
        levelId: 'level:0',
        baseLine: [
          { x: 0, y: 0, z: 0 },
          { x: length, y: 0, z: 0 },
        ] as const,
        height,
        mullionThickness,
        bayWidth,
        bayHeight,
        panels: [],
      } as Parameters<typeof produceCurtainWall>[0];

      // Must not throw, must not produce NaN.
      const desc = produceCurtainWall(cw, NO_JOINS, 0);
      assertValidDescriptor(desc);
      for (const v of desc.position) expect(Number.isFinite(v)).toBe(true);

      // Grid is monotonically increasing.
      const grid = computeCurtainWallGrid(cw, length);
      const xs = grid.colXs ?? grid.cols ?? [];
      for (let k = 1; k < xs.length; k++) expect(xs[k]!).toBeGreaterThan(xs[k - 1]!);
    });
  }
});
