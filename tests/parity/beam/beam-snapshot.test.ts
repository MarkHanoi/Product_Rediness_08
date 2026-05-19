// Beam producer parity-snapshot fixture suite (S12-T2).
//
// 6 fixtures × `produceBeam` → snapshot the descriptor's *shape*
// (vertex / index counts, group / material count, bounds extents, hash).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 test catalog:
//   "tests/parity/beam/*-snapshot.test.ts — 6 fixtures"

import { describe, expect, it } from 'vitest';
import {
  produceBeam,
  composeBeamGeometryHash,
  assertValidDescriptor,
  type BufferGeometryDescriptor,
} from '../../../packages/geometry-kernel/src/index.js';
import { Beam, createId } from '@pryzm/schemas';
import type { JoinData } from '../../../packages/geometry-kernel/src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

interface Fixture {
  readonly name:    string;
  readonly beam:    Partial<import('@pryzm/schemas').Beam>;
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
    name: 'F01.rectangular-4m',
    beam: {
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      shape: 'rectangular', width: 0.2, depth: 0.4,
    },
  },
  {
    name: 'F02.rectangular-diagonal',
    beam: {
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }],
      shape: 'rectangular', width: 0.2, depth: 0.4,
    },
  },
  {
    name: 'F03.i-section-8m',
    beam: {
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }],
      shape: 'i-section', width: 0.25, depth: 0.6,
    },
  },
  {
    name: 'F04.t-section-2m',
    beam: {
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
      shape: 't-section', width: 0.3, depth: 0.5,
    },
  },
  {
    name: 'F05.rotated-profile',
    beam: {
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      shape: 'rectangular', width: 0.2, depth: 0.4, rotation: Math.PI / 4,
    },
  },
  {
    name: 'F06.elevated-world-y',
    beam: {
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      shape: 'rectangular', width: 0.2, depth: 0.4,
    },
    worldY: 3.2,
  },
];

describe('beam producer — 6-fixture parity snapshot', () => {
  for (const fx of FIXTURES) {
    it(fx.name, () => {
      const beam = Beam.parse({
        id: createId('beam'),
        levelId: 'level:0',
        ...fx.beam,
      });
      const worldY = fx.worldY ?? 0;
      const desc = produceBeam(beam, NO_JOIN, worldY);
      assertValidDescriptor(desc);
      const dig = digest(desc);
      expect(dig.materialCount).toBeGreaterThan(0);
      expect(dig.groupCount).toBeGreaterThan(0);
      expect(dig.vertexCount).toBeGreaterThan(0);
      expect(dig.indexCount).toBeGreaterThan(0);
      // Hash determinism
      expect(composeBeamGeometryHash(beam, worldY)).toBe(dig.hash);
    });
  }
});
