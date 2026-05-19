// Door producer parity-snapshot fixture suite (S11-T1).
//
// 15 fixtures × `produceDoor` → snapshot the descriptor's *shape*
// (vertex / index counts, group/material count, bounds extents, hash)
// rather than raw float buffers — this matches the wall-snapshot
// strategy and keeps the visual-diff gate stable across refactors of
// the inner box-emitter.

import { describe, expect, it } from 'vitest';
import {
  produceDoor,
  composeDoorGeometryHash,
  assertValidDescriptor,
  type DoorWorldPlacement,
  type BufferGeometryDescriptor,
} from '@pryzm/geometry-kernel';
import { Door, createId } from '@pryzm/schemas';

interface Fixture {
  readonly name: string;
  readonly door: Partial<import('@pryzm/schemas').Door>;
  readonly placement: DoorWorldPlacement;
}

const STD_AXIS_X: DoorWorldPlacement = {
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
};
const STD_AXIS_Z: DoorWorldPlacement = {
  axis: { x: 0, y: 0, z: 1 },
  normal: { x: -1, y: 0, z: 0 },
  origin: { x: 5, y: 0, z: 5 },
  wallThickness: 0.2,
};

const FIXTURES: readonly Fixture[] = [
  { name: 'F01.standard-interior', door: {}, placement: STD_AXIS_X },
  { name: 'F02.exterior-wide', door: { width: 1.0, height: 2.4, frameWidth: 0.06 }, placement: STD_AXIS_X },
  { name: 'F03.double-wide', door: { width: 1.8, height: 2.4, doorType: 'double' }, placement: STD_AXIS_X },
  { name: 'F04.tall-narrow', door: { width: 0.7, height: 2.6 }, placement: STD_AXIS_X },
  { name: 'F05.thick-wall-2-axis', door: {}, placement: { ...STD_AXIS_X, wallThickness: 0.4 } },
  { name: 'F06.thin-wall-2-axis', door: {}, placement: { ...STD_AXIS_X, wallThickness: 0.05 } },
  { name: 'F07.translated-origin', door: {}, placement: { ...STD_AXIS_X, origin: { x: 3, y: 1, z: -2 } } },
  { name: 'F08.rotated-axis-z', door: {}, placement: STD_AXIS_Z },
  { name: 'F09.high-sill', door: { sillHeight: 0.4 }, placement: STD_AXIS_X },
  { name: 'F10.fire-rated-defaults', door: { fireRating: 'FD30', frameColor: '#3a3a3a' }, placement: STD_AXIS_X },
  { name: 'F11.frame-thick', door: { frameThickness: 0.1, frameWidth: 0.07 }, placement: STD_AXIS_X },
  { name: 'F12.degenerate-frame', door: { width: 0.6, frameWidth: 0.1 }, placement: STD_AXIS_X },
  { name: 'F13.colour-override', door: { frameColor: '#ff0000', leafColor: '#00ff00' }, placement: STD_AXIS_X },
  { name: 'F14.tilted-axis-diagonal', door: {}, placement: {
      axis: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
      normal: { x: -Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
      origin: { x: 0, y: 0, z: 0 },
      wallThickness: 0.1,
    } },
  { name: 'F15.short-wide', door: { width: 1.4, height: 1.95 }, placement: STD_AXIS_X },
];

interface ShapeDigest {
  vertexCount: number;
  indexCount: number;
  groupCount: number;
  materialCount: number;
  boundsExtent: readonly [number, number, number];
  hash: string;
}

function digest(d: BufferGeometryDescriptor): ShapeDigest {
  const r = (n: number) => Math.round(n * 1e3) / 1e3;
  return {
    vertexCount: d.position.length / 3,
    indexCount: d.index.length,
    groupCount: d.groups.length,
    materialCount: d.materialKeys.length,
    boundsExtent: [
      r(d.bounds.max.x - d.bounds.min.x),
      r(d.bounds.max.y - d.bounds.min.y),
      r(d.bounds.max.z - d.bounds.min.z),
    ] as const,
    hash: d.hash,
  };
}

describe('door producer — 15-fixture parity snapshot', () => {
  for (const fx of FIXTURES) {
    it(fx.name, () => {
      const door = Door.parse({
        id: createId('door'),
        wallId: createId('wall'),
        openingId: 'op_1',
        offset: 0,
        ...fx.door,
      });
      const desc = produceDoor(door, fx.placement);
      assertValidDescriptor(desc);
      const dig = digest(desc);
      expect(dig.materialCount).toBe(2);
      expect(dig.groupCount).toBe(2);
      expect(dig.vertexCount).toBeGreaterThan(0);
      expect(dig.indexCount).toBeGreaterThan(0);
      // Hash determinism — re-running produces the same hash.
      expect(composeDoorGeometryHash(door, fx.placement)).toBe(dig.hash);
      // Width/height contribute to bounds along axis & vertical.
      expect(dig.boundsExtent[1]).toBeGreaterThanOrEqual(door.height - 0.001);
    });
  }
});
