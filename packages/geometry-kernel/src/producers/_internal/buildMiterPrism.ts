// buildMiterPrism — lifted from `src/elements/walls/MiterPrismBuilder.ts`
// per S08-T1 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` line 506).
//
// PRYZM 1 returns a `THREE.BufferGeometry`; the kernel returns a
// `RawGeometry` of plain typed arrays.  The vertex math, normal math,
// and triangulation are byte-for-byte identical to the PRYZM 1
// reference.
//
// Geometry: 6 faces (outer, inner, top, bottom, start cap, end cap).
// Each face uses its own vertices with face-aligned normals → hard
// edges everywhere (matches PRYZM 1).

import type { Point3D } from '../../types/Point3D.js';
import type { RawGeometry } from './rawGeometry.js';

export interface MiterNormal {
  readonly nx: number;
  readonly nz: number;
}

export function buildMiterPrism(
  worldStart: Point3D,
  worldEnd: Point3D,
  centerlineStart: Point3D,
  centerlineEnd: Point3D,
  halfT: number,
  height: number,
  baseOffset: number,
  startMN: MiterNormal | null,
  endMN: MiterNormal | null,
): RawGeometry {
  // Wall direction in XZ, normalised.
  const dx = worldEnd.x - worldStart.x;
  const dz = worldEnd.z - worldStart.z;
  const dlen = Math.sqrt(dx * dx + dz * dz) || 1;
  const wallDirX = dx / dlen;
  const wallDirZ = dz / dlen;
  // Outward = perpendicular in XZ.  Matches PRYZM 1's
  // `outward = (-dir.z, 0, dir.x)`.
  const outwardX = -wallDirZ;
  const outwardZ = wallDirX;

  const Sx = worldStart.x, Sz = worldStart.z;
  const Ex = worldEnd.x, Ez = worldEnd.z;

  const yBot = worldStart.y + baseOffset;
  const yTop = worldStart.y + baseOffset + height;

  type P3 = [number, number, number];

  const startBase = (sign: number, y: number): P3 => [
    Sx + outwardX * sign * halfT,
    y,
    Sz + outwardZ * sign * halfT,
  ];
  const endBase = (sign: number, y: number): P3 => [
    Ex + outwardX * sign * halfT,
    y,
    Ez + outwardZ * sign * halfT,
  ];

  const project = (
    base: P3,
    miterOriginX: number,
    miterOriginZ: number,
    mn: MiterNormal | null,
    dirX: number,
    dirZ: number,
  ): P3 => {
    if (!mn) return base;
    const mnDotDir = mn.nx * dirX + mn.nz * dirZ;
    if (Math.abs(mnDotDir) < 1e-9) return base;
    const dxp = miterOriginX - base[0];
    const dzp = miterOriginZ - base[2];
    const t = (mn.nx * dxp + mn.nz * dzp) / mnDotDir;
    return [base[0] + t * dirX, base[1], base[2] + t * dirZ];
  };

  // Cap-projected start corners (outer/inner × bottom/top).
  const sOB = project(startBase(+1, yBot), centerlineStart.x, centerlineStart.z, startMN, wallDirX, wallDirZ);
  const sOT = project(startBase(+1, yTop), centerlineStart.x, centerlineStart.z, startMN, wallDirX, wallDirZ);
  const sIB = project(startBase(-1, yBot), centerlineStart.x, centerlineStart.z, startMN, wallDirX, wallDirZ);
  const sIT = project(startBase(-1, yTop), centerlineStart.x, centerlineStart.z, startMN, wallDirX, wallDirZ);

  const eOB = project(endBase(+1, yBot), centerlineEnd.x, centerlineEnd.z, endMN, wallDirX, wallDirZ);
  const eOT = project(endBase(+1, yTop), centerlineEnd.x, centerlineEnd.z, endMN, wallDirX, wallDirZ);
  const eIB = project(endBase(-1, yBot), centerlineEnd.x, centerlineEnd.z, endMN, wallDirX, wallDirZ);
  const eIT = project(endBase(-1, yTop), centerlineEnd.x, centerlineEnd.z, endMN, wallDirX, wallDirZ);

  const pos: number[] = [];
  const nrm: number[] = [];

  function tri(a: P3, b: P3, c: P3, nx: number, ny: number, nz: number): void {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  function quad(a: P3, b: P3, c: P3, d: P3, nx: number, ny: number, nz: number): void {
    tri(a, b, c, nx, ny, nz);
    tri(a, c, d, nx, ny, nz);
  }

  // Faces — winding identical to PRYZM 1's `MiterPrismBuilder`.
  quad(sOB, eOB, eOT, sOT, outwardX, 0, outwardZ);          // outer
  quad(sIB, sIT, eIT, eIB, -outwardX, 0, -outwardZ);        // inner
  quad(sOT, eOT, eIT, sIT, 0, 1, 0);                        // top
  quad(sIB, eIB, eOB, sOB, 0, -1, 0);                       // bottom
  quad(sOB, sOT, sIT, sIB, -wallDirX, 0, -wallDirZ);        // start cap
  quad(eOB, eIB, eIT, eOT, wallDirX, 0, wallDirZ);          // end cap

  return { positions: pos, normals: nrm };
}

/**
 * Convert a `JoinData` `miterAngleRad` (canonical contract per
 * ADR-009) to the `(nx, nz)` normal pair that the lifted PRYZM 1 math
 * expects.  The wall's local forward direction is rotated by the
 * miter angle to obtain the cut-plane normal.
 */
export function miterAngleToNormal(
  wallDirX: number,
  wallDirZ: number,
  angleRad: number,
): MiterNormal {
  // Matches WallJoinResolver._wallDirAtJoin output: the miter normal
  // is the wall direction rotated by π/2 + angleRad around Y, then
  // normalised.  See `MiterPrismBuilder.ts:43` for the consumer side.
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const nx = wallDirX * c - wallDirZ * s;
  const nz = wallDirX * s + wallDirZ * c;
  const len = Math.sqrt(nx * nx + nz * nz) || 1;
  return { nx: nx / len, nz: nz / len };
}
