// treadPrism — emit a single rectangular box (width × depth × height)
// at a given world-space position as a non-indexed RawGroup.
//
// Used by `produceStair` to emit one box per tread + one box per
// riser.  Box is centred on (cx, cy, cz), half-extents in BOX-LOCAL
// (hx, hy, hz), then rotated about world Y by `rotY`.

import type { MaterialKey } from '../../../types/MaterialKey.js';
import type { RawGroup } from '../rawGeometry.js';

export interface BoxArgs {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  readonly rotY: number;
  readonly materialKey: MaterialKey;
}

interface Face {
  /** Indices into the 8-corner array (CCW seen from outside). */
  readonly a: number; readonly b: number; readonly c: number; readonly d: number;
  /** Local-space face normal. */
  readonly nx: number; readonly ny: number; readonly nz: number;
}

const FACES: readonly Face[] = [
  { a: 4, b: 5, c: 6, d: 7, nx: 0, ny: 0, nz: 1 },   // +Z
  { a: 1, b: 0, c: 3, d: 2, nx: 0, ny: 0, nz: -1 },  // -Z
  { a: 5, b: 1, c: 2, d: 6, nx: 1, ny: 0, nz: 0 },   // +X
  { a: 0, b: 4, c: 7, d: 3, nx: -1, ny: 0, nz: 0 },  // -X
  { a: 3, b: 7, c: 6, d: 2, nx: 0, ny: 1, nz: 0 },   // +Y
  { a: 4, b: 0, c: 1, d: 5, nx: 0, ny: -1, nz: 0 },  // -Y
];

/** Emit a 6-face axis-aligned box (rotated about Y) as a non-indexed RawGroup. */
export function makeBoxGroup(args: BoxArgs): RawGroup {
  const { cx, cy, cz, hx, hy, hz, rotY, materialKey } = args;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [-hx, -hy, -hz], [+hx, -hy, -hz], [+hx, +hy, -hz], [-hx, +hy, -hz],
    [-hx, -hy, +hz], [+hx, -hy, +hz], [+hx, +hy, +hz], [-hx, +hy, +hz],
  ];
  const v = corners.map(([x, y, z]) => {
    const rx = x * cos + z * sin;
    const rz = -x * sin + z * cos;
    return [cx + rx, cy + y, cz + rz] as const;
  });

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const f of FACES) {
    const wnx = f.nx * cos + f.nz * sin;
    const wnz = -f.nx * sin + f.nz * cos;
    const wny = f.ny;
    const A = v[f.a]!, B = v[f.b]!, C = v[f.c]!, D = v[f.d]!;
    // Triangle 1: A B C
    positions.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    normals.push(wnx, wny, wnz, wnx, wny, wnz, wnx, wny, wnz);
    uvs.push(0, 0, 1, 0, 1, 1);
    // Triangle 2: A C D
    positions.push(A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
    normals.push(wnx, wny, wnz, wnx, wny, wnz, wnx, wny, wnz);
    uvs.push(0, 0, 1, 1, 0, 1);
  }

  return {
    geometry: { positions, normals, uvs },
    materialKey,
  };
}
