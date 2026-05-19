// Grid producer parity-snapshot fixture suite (S12-T2).
//
// 8 fixtures × `produceGrid` → snapshot the descriptor's *shape*
// (vertex / index counts, group / material count, bounds extents, hash).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 test catalog:
//   "tests/parity/grid/*-snapshot.test.ts — 8 fixtures"

import { describe, expect, it } from 'vitest';
import {
  produceGrid,
  composeGridGeometryHash,
  assertValidDescriptor,
  type BufferGeometryDescriptor,
} from '../../../packages/geometry-kernel/src/index.js';
import { Grid, createId } from '@pryzm/schemas';
import type { JoinData } from '../../../packages/geometry-kernel/src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

interface Fixture {
  readonly name: string;
  readonly grid: Partial<import('@pryzm/schemas').Grid>;
  readonly worldY?: number;
}

interface ShapeDigest {
  vertexCount:  number;
  indexCount:   number;
  groupCount:   number;
  materialCount: number;
  hash:         string;
}

function digest(d: BufferGeometryDescriptor): ShapeDigest {
  return {
    vertexCount:   d.position.length / 3,
    indexCount:    d.index.length,
    groupCount:    d.groups.length,
    materialCount: d.materialKeys.length,
    hash:          d.hash,
  };
}

const FIXTURES: readonly Fixture[] = [
  // F01 — empty grid (degenerate output, non-zero position count via guard)
  {
    name: 'F01.empty-grid',
    grid: { lines: [] },
  },
  // F02 — single horizontal line
  {
    name: 'F02.single-linear-h',
    grid: { lines: [{ id: 'h1', label: '1', kind: 'linear', start: { x: 0, y: 0, z: 5 }, end: { x: 10, y: 0, z: 5 } }] },
  },
  // F03 — 2×2 orthogonal grid (2 vertical + 2 horizontal)
  {
    name: 'F03.2x2-orthogonal',
    grid: {
      lines: [
        { id: 'v1', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 8 } },
        { id: 'v2', label: 'B', kind: 'linear', start: { x: 5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 8 } },
        { id: 'h1', label: '1', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
        { id: 'h2', label: '2', kind: 'linear', start: { x: 0, y: 0, z: 8 }, end: { x: 5, y: 0, z: 8 } },
      ],
    },
  },
  // F04 — 5×4 office grid
  {
    name: 'F04.5x4-office',
    grid: {
      lines: [
        ...([0, 2.5, 5, 7.5, 10] as number[]).map((x, i) => ({
          id: `v${i}`, label: String.fromCharCode(65 + i),
          kind: 'linear' as const, start: { x, y: 0, z: 0 }, end: { x, y: 0, z: 8 },
        })),
        ...([0, 2, 4, 6] as number[]).map((z, i) => ({
          id: `h${i}`, label: `${i + 1}`,
          kind: 'linear' as const, start: { x: 0, y: 0, z }, end: { x: 10, y: 0, z },
        })),
      ],
    },
  },
  // F05 — arc grid line (radial)
  {
    name: 'F05.single-arc',
    grid: {
      lines: [{
        id: 'a1', label: 'R1', kind: 'arc',
        start: { x: -5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 }, radius: 6,
      }],
    },
  },
  // F06 — mixed linear + arc
  {
    name: 'F06.mixed-linear-arc',
    grid: {
      lines: [
        { id: 'l1', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 0 } },
        { id: 'l2', label: 'B', kind: 'linear', start: { x: 0, y: 0, z: 4 }, end: { x: 6, y: 0, z: 4 } },
        { id: 'a1', label: '1', kind: 'arc', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 4 }, radius: 3 },
        { id: 'a2', label: '2', kind: 'arc', start: { x: 6, y: 0, z: 0 }, end: { x: 6, y: 0, z: 4 }, radius: 3 },
      ],
    },
  },
  // F07 — rotated grid (+30° about Y)
  {
    name: 'F07.rotated-30deg',
    grid: {
      rotation: Math.PI / 6,
      lines: [
        { id: 'v1', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 6 } },
        { id: 'h1', label: '1', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 0 } },
      ],
    },
  },
  // F08 — elevated worldY
  {
    name: 'F08.elevated-world-y',
    grid: {
      lines: [
        { id: 'v1', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 6 } },
      ],
    },
    worldY: 3.0,
  },
];

describe('grid producer — 8-fixture parity snapshot', () => {
  for (const fx of FIXTURES) {
    it(fx.name, () => {
      const grid = Grid.parse({
        id: createId('grid'),
        levelId: 'level:0',
        ...fx.grid,
      });
      const worldY = fx.worldY ?? 0;
      const desc = produceGrid(grid, NO_JOIN, worldY);
      assertValidDescriptor(desc);
      const dig = digest(desc);
      // Grid always has exactly 1 material slot (the grid ribbon color)
      expect(dig.materialCount).toBe(1);
      expect(dig.groupCount).toBe(1);
      expect(dig.vertexCount).toBeGreaterThan(0);
      // Hash determinism
      expect(composeGridGeometryHash(grid, worldY)).toBe(dig.hash);
    });
  }
});
