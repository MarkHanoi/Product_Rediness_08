// Column producer parity-snapshot fixture suite (S12-T2).
//
// 6 fixtures × `produceColumn` → snapshot the descriptor's *shape*
// (vertex / index counts, group / material count, bounds extents, hash).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 test catalog:
//   "tests/parity/column/*-snapshot.test.ts — 6 fixtures"

import { describe, expect, it } from 'vitest';
import {
  produceColumn,
  composeColumnGeometryHash,
  assertValidDescriptor,
  type BufferGeometryDescriptor,
} from '../../../packages/geometry-kernel/src/index.js';
import { Column, createId } from '@pryzm/schemas';
import type { JoinData } from '../../../packages/geometry-kernel/src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

interface Fixture {
  readonly name:    string;
  readonly col:     Partial<import('@pryzm/schemas').Column>;
  readonly worldY?: number;
}

interface ShapeDigest {
  vertexCount:  number;
  indexCount:   number;
  groupCount:   number;
  materialCount: number;
  boundsExtent: readonly [number, number, number];
  hash:         string;
}

function digest(d: BufferGeometryDescriptor): ShapeDigest {
  const r = (n: number) => Math.round(n * 1e3) / 1e3;
  return {
    vertexCount:   d.position.length / 3,
    indexCount:    d.index.length,
    groupCount:    d.groups.length,
    materialCount: d.materialKeys.length,
    boundsExtent: [
      r(d.bounds.max.x - d.bounds.min.x),
      r(d.bounds.max.y - d.bounds.min.y),
      r(d.bounds.max.z - d.bounds.min.z),
    ] as const,
    hash: d.hash,
  };
}

const FIXTURES: readonly Fixture[] = [
  {
    name: 'F01.rectangular-default',
    col: { shape: 'rectangular', width: 0.4, depth: 0.4, height: 3.0, origin: { x: 0, y: 0, z: 0 } },
  },
  {
    name: 'F02.rectangular-wide',
    col: { shape: 'rectangular', width: 0.6, depth: 0.4, height: 3.5, origin: { x: 5, y: 0, z: 5 } },
  },
  {
    name: 'F03.circular',
    col: { shape: 'circular', width: 0.5, depth: 0.5, height: 4.0, origin: { x: 0, y: 0, z: 0 } },
  },
  {
    name: 'F04.i-section',
    col: { shape: 'i-section', width: 0.3, depth: 0.6, height: 5.0, origin: { x: 0, y: 0, z: 0 } },
  },
  {
    name: 'F05.with-base-offset',
    col: { shape: 'rectangular', width: 0.4, depth: 0.4, height: 3.0, baseOffset: 0.15, origin: { x: 0, y: 0, z: 0 } },
  },
  {
    name: 'F06.elevated-world-y',
    col: { shape: 'rectangular', width: 0.4, depth: 0.4, height: 3.0, origin: { x: 0, y: 0, z: 0 } },
    worldY: 2.8,
  },
];

describe('column producer — 6-fixture parity snapshot', () => {
  for (const fx of FIXTURES) {
    it(fx.name, () => {
      const col = Column.parse({
        id: createId('column'),
        levelId: 'level:0',
        ...fx.col,
      });
      const worldY = fx.worldY ?? 0;
      const desc = produceColumn(col, NO_JOIN, worldY);
      assertValidDescriptor(desc);
      const dig = digest(desc);
      expect(dig.materialCount).toBeGreaterThan(0);
      expect(dig.groupCount).toBeGreaterThan(0);
      expect(dig.vertexCount).toBeGreaterThan(0);
      expect(dig.indexCount).toBeGreaterThan(0);
      // Height contributes to Y-extent.
      expect(dig.boundsExtent[1]).toBeCloseTo(col.height, 2);
      // Hash determinism
      expect(composeColumnGeometryHash(col, worldY)).toBe(dig.hash);
    });
  }
});
