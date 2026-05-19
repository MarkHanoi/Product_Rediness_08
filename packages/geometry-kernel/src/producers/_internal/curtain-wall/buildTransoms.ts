// buildTransoms — emit thin horizontal bars between rows (S12).

import type { RawGroup } from '../rawGeometry.js';
import { asMaterialKey, type MaterialKey } from '../../../types/MaterialKey.js';

interface Vec3 { x: number; y: number; z: number }
interface CurtainBasis { axis: Vec3; normal: Vec3; origin: Vec3 }

const FALLBACK_COLOR = '#7a7a7e';

export function composeTransomMaterialKey(materialId: string | undefined): MaterialKey {
  return asMaterialKey(`curtainwall|transom|${materialId ?? ''}|${FALLBACK_COLOR}|body`);
}

/** A single horizontal transom at height `y` running the full length
 *  [xLeft, xRight] of the curtain wall, with the given thickness. */
export function appendTransom(
  buf: { positions: number[]; normals: number[]; uvs: number[] },
  basis: CurtainBasis,
  xLeft: number,
  xRight: number,
  y: number,
  thickness: number,
): void {
  const half = thickness / 2;
  const { axis, normal, origin } = basis;

  function project(t: number, dn: number, h: number): [number, number, number] {
    return [
      origin.x + axis.x * t + normal.x * dn,
      origin.y + h,
      origin.z + axis.z * t + normal.z * dn,
    ];
  }

  const yBot = y - half;
  const yTop = y + half;
  const c000 = project(xLeft, -half, yBot);
  const c100 = project(xRight, -half, yBot);
  const c110 = project(xRight, half, yBot);
  const c010 = project(xLeft, half, yBot);
  const c001 = project(xLeft, -half, yTop);
  const c101 = project(xRight, -half, yTop);
  const c111 = project(xRight, half, yTop);
  const c011 = project(xLeft, half, yTop);

  const ax = axis.x, az = axis.z;
  const nx = normal.x, nz = normal.z;

  function face(
    n: [number, number, number],
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ): void {
    buf.positions.push(...a, ...b, ...c);
    buf.normals.push(...n, ...n, ...n);
    buf.uvs.push(0, 0, 1, 0, 1, 1);
    buf.positions.push(...a, ...c, ...d);
    buf.normals.push(...n, ...n, ...n);
    buf.uvs.push(0, 0, 1, 1, 0, 1);
  }

  face([ax, 0, az], c100, c101, c111, c110);
  face([-ax, 0, -az], c000, c010, c011, c001);
  face([nx, 0, nz], c010, c110, c111, c011);
  face([-nx, 0, -nz], c000, c001, c101, c100);
  face([0, 1, 0], c001, c011, c111, c101);
  face([0, -1, 0], c000, c100, c110, c010);
}

export function buildTransomsRawGroup(
  basis: CurtainBasis,
  xLeft: number,
  xRight: number,
  heights: readonly number[],
  thickness: number,
  materialId: string | undefined,
): RawGroup {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const y of heights) {
    appendTransom({ positions, normals, uvs }, basis, xLeft, xRight, y, thickness);
  }
  return {
    geometry: { positions, normals, uvs },
    materialKey: composeTransomMaterialKey(materialId),
  };
}
