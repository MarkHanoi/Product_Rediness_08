// buildExtruded — flat-roof builder.  Lifted (and de-THREE'd) from
// `RoofGeometryBuilder._buildExtrudedPolygon` (lines 504-535).
//
// Top → SHINGLE slot, bottom → DECK slot, sides → TRIM slot.

import type { MaterialKey } from '../../../types/MaterialKey.js';
import type { RawGroup } from '../rawGeometry.js';
import { triangulate } from './triangulate.js';
import { ensureCCW, type Pt } from './polygon.js';

export interface BuildExtrudedInput {
  readonly polygon: readonly Pt[];   // CCW or CW; will be normalised
  readonly thickness: number;
  readonly worldY: number;
  readonly shingleKey: MaterialKey;
  readonly deckKey: MaterialKey;
  readonly trimKey: MaterialKey;
}

interface FaceTri {
  readonly a: [number, number, number];
  readonly b: [number, number, number];
  readonly c: [number, number, number];
}

function pushTri(positions: number[], normals: number[], tri: FaceTri, n: [number, number, number]): void {
  positions.push(tri.a[0], tri.a[1], tri.a[2]);
  positions.push(tri.b[0], tri.b[1], tri.b[2]);
  positions.push(tri.c[0], tri.c[1], tri.c[2]);
  for (let i = 0; i < 3; i++) {
    normals.push(n[0], n[1], n[2]);
  }
}

function faceNormal(a: [number, number, number], b: [number, number, number], c: [number, number, number]): [number, number, number] {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export function buildExtruded(input: BuildExtrudedInput): RawGroup[] {
  const ccwPts = ensureCCW(input.polygon);
  const tris = triangulate(ccwPts);

  const topY = input.worldY + input.thickness;
  const botY = input.worldY;

  // Top face — shingle.
  const topPos: number[] = [];
  const topNorm: number[] = [];
  for (const [i0, i1, i2] of tris) {
    const a = ccwPts[i0]!, b = ccwPts[i1]!, c = ccwPts[i2]!;
    const ta: [number, number, number] = [a[0], topY, a[1]];
    const tb: [number, number, number] = [b[0], topY, b[1]];
    const tc: [number, number, number] = [c[0], topY, c[1]];
    pushTri(topPos, topNorm, { a: ta, b: tb, c: tc }, [0, 1, 0]);
  }

  // Bottom face — deck (reversed winding so normal faces -Y).
  const botPos: number[] = [];
  const botNorm: number[] = [];
  for (const [i0, i1, i2] of tris) {
    const a = ccwPts[i0]!, b = ccwPts[i1]!, c = ccwPts[i2]!;
    const ba: [number, number, number] = [a[0], botY, a[1]];
    const bb: [number, number, number] = [b[0], botY, b[1]];
    const bc: [number, number, number] = [c[0], botY, c[1]];
    pushTri(botPos, botNorm, { a: ba, b: bc, c: bb }, [0, -1, 0]);
  }

  // Side faces — trim, one quad (= 2 triangles) per polygon edge.
  const sidePos: number[] = [];
  const sideNorm: number[] = [];
  const n = ccwPts.length;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = ccwPts[i]!;
    const [x1, z1] = ccwPts[(i + 1) % n]!;
    // Outward normal of a CCW polygon edge: (dz, 0, -dx) / len
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const normal: [number, number, number] = [dz / len, 0, -dx / len];

    const a: [number, number, number] = [x0, topY, z0];
    const b: [number, number, number] = [x0, botY, z0];
    const c: [number, number, number] = [x1, topY, z1];
    const d: [number, number, number] = [x1, botY, z1];

    pushTri(sidePos, sideNorm, { a, b, c }, normal);
    pushTri(sidePos, sideNorm, { a: b, b: d, c }, normal);
  }

  return [
    { geometry: { positions: topPos, normals: topNorm }, materialKey: input.shingleKey },
    { geometry: { positions: botPos, normals: botNorm }, materialKey: input.deckKey },
    { geometry: { positions: sidePos, normals: sideNorm }, materialKey: input.trimKey },
  ];
}

// Re-export face-normal helper for builders that need consistent
// normals (gable / hip / mansard).
export { faceNormal, pushTri };
