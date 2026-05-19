// buildMullions — emit thin vertical bars at every column boundary
// (curtain-wall split, S12).

import type { RawGroup } from '../rawGeometry.js';
import { asMaterialKey, type MaterialKey } from '../../../types/MaterialKey.js';

interface Vec3 { x: number; y: number; z: number }
interface CurtainBasis { axis: Vec3; normal: Vec3; origin: Vec3 }

const FALLBACK_COLOR = '#7a7a7e';

export function composeMullionMaterialKey(materialId: string | undefined): MaterialKey {
  return asMaterialKey(`curtainwall|mullion|${materialId ?? ''}|${FALLBACK_COLOR}|body`);
}

/** A single vertical mullion at offset `t` along the baseline,
 *  spanning [yBottom, yTop] above the basis origin.  Drawn as a thin
 *  rectangular extrusion (depth = thickness, width = thickness) so
 *  the result is a recognisable bar from any angle. */
export function appendMullion(
  buf: { positions: number[]; normals: number[]; uvs: number[] },
  basis: CurtainBasis,
  t: number,
  yBottom: number,
  yTop: number,
  thickness: number,
): void {
  const half = thickness / 2;
  const { axis, normal, origin } = basis;

  function project(dt: number, dn: number, h: number): [number, number, number] {
    return [
      origin.x + axis.x * (t + dt) + normal.x * dn,
      origin.y + h,
      origin.z + axis.z * (t + dt) + normal.z * dn,
    ];
  }

  // 8 corners of the rectangular bar.
  const c000 = project(-half, -half, yBottom);
  const c100 = project(half, -half, yBottom);
  const c110 = project(half, half, yBottom);
  const c010 = project(-half, half, yBottom);
  const c001 = project(-half, -half, yTop);
  const c101 = project(half, -half, yTop);
  const c111 = project(half, half, yTop);
  const c011 = project(-half, half, yTop);

  // Outward face directions in axis/normal space.
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

  // +axis side
  face([ax, 0, az], c100, c101, c111, c110);
  // -axis side
  face([-ax, 0, -az], c000, c010, c011, c001);
  // +normal side
  face([nx, 0, nz], c010, c110, c111, c011);
  // -normal side
  face([-nx, 0, -nz], c000, c001, c101, c100);
  // top
  face([0, 1, 0], c001, c011, c111, c101);
  // bottom (rare to be visible — but emitted for invariants)
  face([0, -1, 0], c000, c100, c110, c010);
}

export function buildMullionsRawGroup(
  basis: CurtainBasis,
  offsets: readonly number[],
  yBottom: number,
  yTop: number,
  thickness: number,
  materialId: string | undefined,
): RawGroup {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const t of offsets) {
    appendMullion({ positions, normals, uvs }, basis, t, yBottom, yTop, thickness);
  }
  return {
    geometry: { positions, normals, uvs },
    materialKey: composeMullionMaterialKey(materialId),
  };
}
