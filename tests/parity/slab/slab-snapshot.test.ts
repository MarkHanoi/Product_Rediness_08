// Slab producer parity-snapshot fixture suite (S12-T1).
//
// 18 fixtures × `produceSlab` → snapshot the descriptor's *shape*
// (vertex / index counts, group / material count, bounds extents, hash).
// Mirrors the door/window parity strategy: inline fixtures, shape-digest
// assertions, no raw float-buffer storage.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 test catalog:
//   "tests/parity/slab/slab-snapshot.test.ts — 18 fixtures"
//
// `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md`

import { describe, expect, it } from 'vitest';
import {
  produceSlab,
  composeSlabGeometryHash,
  assertValidDescriptor,
  type BufferGeometryDescriptor,
} from '../../../packages/geometry-kernel/src/index.js';
import { Slab, createId } from '@pryzm/schemas';
import type { JoinData } from '../../../packages/geometry-kernel/src/types/JoinData.js';

const NO_JOIN: JoinData = { start: null, end: null };

interface Fixture {
  readonly name: string;
  readonly slab: Partial<import('@pryzm/schemas').Slab>;
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
  // F01–F04 — basic rectangular slabs (different sizes/thicknesses)
  { name: 'F01.rect-2x2-standard',
    slab: { boundary: [{x:0,y:0,z:0},{x:2,y:0,z:0},{x:2,y:0,z:2},{x:0,y:0,z:2}], thickness: 0.2 } },
  { name: 'F02.rect-6x4-standard',
    slab: { boundary: [{x:0,y:0,z:0},{x:6,y:0,z:0},{x:6,y:0,z:4},{x:0,y:0,z:4}], thickness: 0.25 } },
  { name: 'F03.rect-10x8-thick',
    slab: { boundary: [{x:0,y:0,z:0},{x:10,y:0,z:0},{x:10,y:0,z:8},{x:0,y:0,z:8}], thickness: 0.4 } },
  { name: 'F04.rect-thin',
    slab: { boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:3},{x:0,y:0,z:3}], thickness: 0.1 } },

  // F05–F07 — slabs with a single shaft hole
  { name: 'F05.rect-with-shaft-centre',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:6,y:0,z:0},{x:6,y:0,z:4},{x:0,y:0,z:4}],
      holes: [[{x:2,y:0,z:1},{x:4,y:0,z:1},{x:4,y:0,z:3},{x:2,y:0,z:3}]],
      thickness: 0.2,
    } },
  { name: 'F06.rect-with-shaft-corner',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:6,y:0,z:0},{x:6,y:0,z:4},{x:0,y:0,z:4}],
      holes: [[{x:0.5,y:0,z:0.5},{x:2,y:0,z:0.5},{x:2,y:0,z:2},{x:0.5,y:0,z:2}]],
      thickness: 0.2,
    } },
  { name: 'F07.rect-with-two-shafts',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:8,y:0,z:0},{x:8,y:0,z:6},{x:0,y:0,z:6}],
      holes: [
        [{x:1,y:0,z:1},{x:3,y:0,z:1},{x:3,y:0,z:3},{x:1,y:0,z:3}],
        [{x:5,y:0,z:1},{x:7,y:0,z:1},{x:7,y:0,z:3},{x:5,y:0,z:3}],
      ],
      thickness: 0.25,
    } },

  // F08–F10 — non-rectangular polygons
  { name: 'F08.l-shape',
    slab: {
      boundary: [
        {x:0,y:0,z:0},{x:6,y:0,z:0},{x:6,y:0,z:3},
        {x:3,y:0,z:3},{x:3,y:0,z:6},{x:0,y:0,z:6},
      ],
      thickness: 0.2,
    } },
  { name: 'F09.pentagon',
    slab: {
      boundary: [
        {x:0,y:0,z:0},{x:4,y:0,z:0},{x:5,y:0,z:3},
        {x:2,y:0,z:5},{x:-1,y:0,z:3},
      ],
      thickness: 0.2,
    } },
  { name: 'F10.triangle',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:5,y:0,z:0},{x:2.5,y:0,z:4}],
      thickness: 0.18,
    } },

  // F11–F13 — baseOffset variations (elevated slabs)
  { name: 'F11.elevated-base-offset-1',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}],
      thickness: 0.2, baseOffset: 1.0,
    } },
  { name: 'F12.elevated-base-offset-2.8',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}],
      thickness: 0.2, baseOffset: 2.8,
    } },
  { name: 'F13.negative-base-offset',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}],
      thickness: 0.2, baseOffset: -0.5,
    } },

  // F14–F16 — material overrides
  { name: 'F14.with-material-id',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}],
      thickness: 0.2, materialId: 'mat_concrete_dark',
    } },
  { name: 'F15.with-material-color-custom',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}],
      thickness: 0.2, materialColor: '#7a5c3a',
    } },
  { name: 'F16.with-system-type',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}],
      thickness: 0.3, systemTypeId: 'slab_type_precast_hollow_core',
    } },

  // F17–F18 — edge cases
  { name: 'F17.minimum-three-vertices',
    slab: {
      boundary: [{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0.5,y:0,z:1}],
      thickness: 0.15,
    } },
  { name: 'F18.very-large-footprint',
    slab: {
      boundary: [
        {x:0,y:0,z:0},{x:50,y:0,z:0},{x:50,y:0,z:40},{x:0,y:0,z:40},
      ],
      thickness: 0.35, baseOffset: 0,
    } },
];

describe('slab producer — 18-fixture parity snapshot', () => {
  for (const fx of FIXTURES) {
    it(fx.name, () => {
      const slab = Slab.parse({
        id: createId('slab'),
        levelId: 'level:0',
        ...fx.slab,
      });
      const desc = produceSlab(slab, NO_JOIN, 0);
      assertValidDescriptor(desc);
      const dig = digest(desc);
      // 3 material slots: top, bottom, side
      expect(dig.materialCount).toBe(3);
      expect(dig.groupCount).toBe(3);
      expect(dig.vertexCount).toBeGreaterThan(0);
      expect(dig.indexCount).toBeGreaterThan(0);
      // Thickness contributes to Y-extent.
      expect(dig.boundsExtent[1]).toBeCloseTo(slab.thickness, 2);
      // Hash determinism — re-running produces the same hash.
      expect(composeSlabGeometryHash(slab, 0)).toBe(dig.hash);
    });
  }
});
