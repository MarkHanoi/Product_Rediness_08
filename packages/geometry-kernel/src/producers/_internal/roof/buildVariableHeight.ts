// buildVariableHeight — single-slope (mono / shed) roof builder.
// Each polygon vertex carries its own Y height; bottom is flat at
// `worldY`.  Lifted (and de-THREE'd) from
// `RoofGeometryBuilder._buildVariableHeightRoof` (lines 542-573).

import type { MaterialKey } from '../../../types/MaterialKey.js';
import type { RawGroup } from '../rawGeometry.js';
import { triangulate } from './triangulate.js';
import { ensureCCW, type Pt } from './polygon.js';
import { faceNormal, pushTri } from './buildExtruded.js';

export interface BuildVariableHeightInput {
  readonly polygon: readonly Pt[];
  readonly heights: readonly number[]; // per-vertex height ABOVE worldY
  readonly thickness: number;
  readonly worldY: number;
  readonly shingleKey: MaterialKey;
  readonly deckKey: MaterialKey;
  readonly trimKey: MaterialKey;
}

export function buildVariableHeight(input: BuildVariableHeightInput): RawGroup[] {
  const ccwPts = ensureCCW(input.polygon);
  const n = ccwPts.length;
  // ensureCCW may have reversed; re-align heights to the resulting order.
  const heights = input.polygon === ccwPts
    ? input.heights.slice()
    : input.heights.slice().reverse();

  if (heights.length !== n) {
    throw new Error(
      `[buildVariableHeight] heights.length (${heights.length}) must equal polygon.length (${n})`,
    );
  }

  const tris = triangulate(ccwPts);
  const topY = (i: number): number => input.worldY + input.thickness + heights[i]!;
  const botY = input.worldY;

  // Sloped top face — shingle.  Per-triangle normals so the slope
  // shades correctly (no vertex-shared normal blending).
  const topPos: number[] = [];
  const topNorm: number[] = [];
  for (const [i0, i1, i2] of tris) {
    const [ax, az] = ccwPts[i0]!;
    const [bx, bz] = ccwPts[i1]!;
    const [cx, cz] = ccwPts[i2]!;
    const a: [number, number, number] = [ax, topY(i0), az];
    const b: [number, number, number] = [bx, topY(i1), bz];
    const c: [number, number, number] = [cx, topY(i2), cz];
    pushTri(topPos, topNorm, { a, b, c }, faceNormal(a, b, c));
  }

  // Bottom face — deck (reversed winding).
  const botPos: number[] = [];
  const botNorm: number[] = [];
  for (const [i0, i1, i2] of tris) {
    const [ax, az] = ccwPts[i0]!;
    const [bx, bz] = ccwPts[i1]!;
    const [cx, cz] = ccwPts[i2]!;
    const a: [number, number, number] = [ax, botY, az];
    const b: [number, number, number] = [bx, botY, bz];
    const c: [number, number, number] = [cx, botY, cz];
    pushTri(botPos, botNorm, { a, b: c, c: b }, [0, -1, 0]);
  }

  // Side quads — trim.  Each side is a trapezoid (different top
  // heights at the two endpoints).
  const sidePos: number[] = [];
  const sideNorm: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x0, z0] = ccwPts[i]!;
    const [x1, z1] = ccwPts[j]!;
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const normal: [number, number, number] = [dz / len, 0, -dx / len];

    const a: [number, number, number] = [x0, topY(i), z0];
    const b: [number, number, number] = [x0, botY,    z0];
    const c: [number, number, number] = [x1, topY(j), z1];
    const d: [number, number, number] = [x1, botY,    z1];

    pushTri(sidePos, sideNorm, { a, b, c }, normal);
    pushTri(sidePos, sideNorm, { a: b, b: d, c }, normal);
  }

  return [
    { geometry: { positions: topPos, normals: topNorm }, materialKey: input.shingleKey },
    { geometry: { positions: botPos, normals: botNorm }, materialKey: input.deckKey },
    { geometry: { positions: sidePos, normals: sideNorm }, materialKey: input.trimKey },
  ];
}
