// Window producer parity-snapshot fixture suite (S11-T2).
//
// 12 fixtures × `produceWindow` → snapshot the descriptor's *shape*
// (vertex / index counts, group/material count, bounds extents, hash).

import { describe, expect, it } from 'vitest';
import {
  produceWindow,
  composeWindowGeometryHash,
  assertValidDescriptor,
  type WindowWorldPlacement,
  type BufferGeometryDescriptor,
} from '@pryzm/geometry-kernel';
import { Window, createId } from '@pryzm/schemas';

interface Fixture {
  readonly name: string;
  readonly window: Partial<import('@pryzm/schemas').Window>;
  readonly placement: WindowWorldPlacement;
}

const STD_AXIS_X: WindowWorldPlacement = {
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
};
const STD_AXIS_Z: WindowWorldPlacement = {
  axis: { x: 0, y: 0, z: 1 },
  normal: { x: -1, y: 0, z: 0 },
  origin: { x: 5, y: 0, z: 5 },
  wallThickness: 0.2,
};
const GRID_2x1: WindowWorldPlacement = {
  ...STD_AXIS_X,
  grid: { columns: 2, rows: 1, mullionThickness: 0.05 },
};
const GRID_3x2: WindowWorldPlacement = {
  ...STD_AXIS_X,
  grid: { columns: 3, rows: 2, mullionThickness: 0.04 },
};

const FIXTURES: readonly Fixture[] = [
  { name: 'F01.standard-fixed-1x1', window: {}, placement: STD_AXIS_X },
  { name: 'F02.picture-window', window: { width: 2.4, height: 1.5, sillHeight: 0.6, frameWidth: 0.06 }, placement: STD_AXIS_X },
  { name: 'F03.casement-double-2x2', window: { width: 1.6, height: 1.2, windowType: 'double' }, placement: { ...STD_AXIS_X, grid: { columns: 2, rows: 2, mullionThickness: 0.04 } } },
  { name: 'F04.tall-narrow', window: { width: 0.6, height: 1.8 }, placement: STD_AXIS_X },
  { name: 'F05.thick-wall-grid', window: { width: 1.8, height: 1.2 }, placement: { ...GRID_2x1, wallThickness: 0.4 } },
  { name: 'F06.thin-wall-default', window: {}, placement: { ...STD_AXIS_X, wallThickness: 0.05 } },
  { name: 'F07.translated-origin', window: {}, placement: { ...STD_AXIS_X, origin: { x: 3, y: 1, z: -2 } } },
  { name: 'F08.rotated-axis-z', window: {}, placement: STD_AXIS_Z },
  { name: 'F09.high-sill-awning', window: { width: 0.9, height: 0.6, sillHeight: 1.6 }, placement: STD_AXIS_X },
  { name: 'F10.fire-rated', window: { fireRating: 'FR60', frameColor: '#444444', frameThickness: 0.07, frameWidth: 0.06 }, placement: STD_AXIS_X },
  { name: 'F11.sliding-3x1-grid', window: { width: 2.7, height: 1.2 }, placement: { ...STD_AXIS_X, grid: { columns: 3, rows: 1, mullionThickness: 0.06 } } },
  { name: 'F12.tilted-axis-diagonal-grid-3x2', window: { width: 1.8 }, placement: {
      axis: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
      normal: { x: -Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
      origin: { x: 0, y: 0, z: 0 },
      wallThickness: 0.1,
      grid: GRID_3x2.grid,
    } },
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

describe('window producer — 12-fixture parity snapshot', () => {
  for (const fx of FIXTURES) {
    it(fx.name, () => {
      const win = Window.parse({
        id: createId('window'),
        wallId: createId('wall'),
        openingId: 'op_1',
        offset: 0,
        ...fx.window,
      });
      const desc = produceWindow(win, fx.placement);
      assertValidDescriptor(desc);
      const dig = digest(desc);
      expect(dig.materialCount).toBe(2);
      expect(dig.groupCount).toBe(2);
      expect(dig.vertexCount).toBeGreaterThan(0);
      expect(dig.indexCount).toBeGreaterThan(0);
      expect(composeWindowGeometryHash(win, fx.placement)).toBe(dig.hash);
      // Window height contributes to bounds along the vertical axis.
      expect(dig.boundsExtent[1]).toBeGreaterThanOrEqual(win.height - 0.001);
    });
  }
});
