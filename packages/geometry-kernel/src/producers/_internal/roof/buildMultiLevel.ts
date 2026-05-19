// buildMultiLevel — two-or-three-tier roof builder used by gable, hip,
// and mansard.  Lifted (and de-THREE'd) from
// `RoofGeometryBuilder._buildMultiLevel` + `_connectLevels`
// (lines 588-719).
//
// Vertex ordering is the same as PRYZM 1:
//   level 0 (eave)  at y = worldY + thickness
//   level 1 (mid)   at y = worldY + thickness + midH
//   level 2 (top)   at y = worldY + thickness + topH    (optional)
//   bottom soffit   at y = worldY                       (eave footprint)
//
// Slope faces → SHINGLE; bottom soffit → DECK; outer side walls
// (eave-top → eave-bottom) → TRIM.

import type { MaterialKey } from '../../../types/MaterialKey.js';
import type { RawGroup } from '../rawGeometry.js';
import { triangulate } from './triangulate.js';
import { ensureCCW, nearestIdx, type Pt } from './polygon.js';
import { faceNormal, pushTri } from './buildExtruded.js';

export interface BuildMultiLevelInput {
  readonly eavePts: readonly Pt[];
  readonly midPts: readonly Pt[];
  readonly midH: number;
  readonly topPts: readonly Pt[] | null;
  readonly topH: number;
  readonly thickness: number;
  readonly worldY: number;
  readonly shingleKey: MaterialKey;
  readonly deckKey: MaterialKey;
  readonly trimKey: MaterialKey;
}

interface Pt3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function pt3(p: Pt, y: number): Pt3 { return { x: p[0], y, z: p[1] }; }
const arr = (p: Pt3): [number, number, number] => [p.x, p.y, p.z];

/** Connect lower polygon to upper polygon by per-edge nearest-vertex
 *  mapping (PRYZM 1's `_connectLevels`).  Emits triangles or quads
 *  per edge into the (positions, normals) accumulators. */
function connectLevels(
  lower: readonly Pt[], lowerY: number,
  upper: readonly Pt[], upperY: number,
  positions: number[],
  normals: number[],
): void {
  const nL = lower.length, nU = upper.length;
  if (nL === 0 || nU === 0) return;
  for (let i = 0; i < nL; i++) {
    const j = (i + 1) % nL;
    const li = pt3(lower[i]!, lowerY);
    const lj = pt3(lower[j]!, lowerY);
    const uiIdx = nearestIdx(upper, lower[i]![0], lower[i]![1]);
    const ujIdx = nearestIdx(upper, lower[j]![0], lower[j]![1]);
    const ui = pt3(upper[uiIdx]!, upperY);
    const uj = pt3(upper[ujIdx]!, upperY);

    if (uiIdx === ujIdx) {
      // Triangle.
      const a = arr(li), b = arr(lj), c = arr(ui);
      pushTri(positions, normals, { a, b, c }, faceNormal(a, b, c));
    } else {
      // Quad → 2 triangles (li, lj, uj) + (li, uj, ui).
      const a = arr(li), b = arr(lj), c = arr(uj);
      const d = arr(ui);
      const n1 = faceNormal(a, b, c);
      pushTri(positions, normals, { a, b, c }, n1);
      pushTri(positions, normals, { a, b: c, c: d }, n1);
    }
  }
}

export function buildMultiLevel(input: BuildMultiLevelInput): RawGroup[] {
  const eave = ensureCCW(input.eavePts);
  const mid = input.midPts.length >= 2 ? ensureCCW(input.midPts) : input.midPts.slice();
  const top = input.topPts && input.topPts.length >= 2 ? ensureCCW(input.topPts) : null;

  const eaveY = input.worldY + input.thickness;
  const midY = eaveY + input.midH;
  const topY = eaveY + input.topH;
  const botY = input.worldY;

  const slopePos: number[] = [];
  const slopeNorm: number[] = [];

  // Eave → mid.
  connectLevels(eave, eaveY, mid, midY, slopePos, slopeNorm);

  // Mid → top (when topPts provided).
  if (top !== null) {
    connectLevels(mid, midY, top, topY, slopePos, slopeNorm);
    // Cap top if ≥3 vertices (mansard flat cap).
    if (top.length >= 3) {
      const tris = triangulate(top);
      for (const [i0, i1, i2] of tris) {
        const a: [number, number, number] = [top[i0]![0], topY, top[i0]![1]];
        const b: [number, number, number] = [top[i1]![0], topY, top[i1]![1]];
        const c: [number, number, number] = [top[i2]![0], topY, top[i2]![1]];
        pushTri(slopePos, slopeNorm, { a, b, c }, [0, 1, 0]);
      }
    }
  } else if (mid.length >= 3) {
    // No top → cap mid (hip ridge polygon cap).
    const tris = triangulate(mid);
    for (const [i0, i1, i2] of tris) {
      const a: [number, number, number] = [mid[i0]![0], midY, mid[i0]![1]];
      const b: [number, number, number] = [mid[i1]![0], midY, mid[i1]![1]];
      const c: [number, number, number] = [mid[i2]![0], midY, mid[i2]![1]];
      pushTri(slopePos, slopeNorm, { a, b, c }, [0, 1, 0]);
    }
  }

  // Bottom soffit (reversed winding → -Y).
  const botPos: number[] = [];
  const botNorm: number[] = [];
  const eaveTris = triangulate(eave);
  for (const [i0, i1, i2] of eaveTris) {
    const a: [number, number, number] = [eave[i0]![0], botY, eave[i0]![1]];
    const b: [number, number, number] = [eave[i1]![0], botY, eave[i1]![1]];
    const c: [number, number, number] = [eave[i2]![0], botY, eave[i2]![1]];
    pushTri(botPos, botNorm, { a, b: c, c: b }, [0, -1, 0]);
  }

  // Outer side walls — eave-top → eave-bottom.
  const sidePos: number[] = [];
  const sideNorm: number[] = [];
  const n = eave.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x0, z0] = eave[i]!;
    const [x1, z1] = eave[j]!;
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const normal: [number, number, number] = [dz / len, 0, -dx / len];

    const a: [number, number, number] = [x0, eaveY, z0];
    const b: [number, number, number] = [x0, botY,  z0];
    const c: [number, number, number] = [x1, eaveY, z1];
    const d: [number, number, number] = [x1, botY,  z1];
    pushTri(sidePos, sideNorm, { a, b, c }, normal);
    pushTri(sidePos, sideNorm, { a: b, b: d, c }, normal);
  }

  return [
    { geometry: { positions: slopePos, normals: slopeNorm }, materialKey: input.shingleKey },
    { geometry: { positions: botPos, normals: botNorm }, materialKey: input.deckKey },
    { geometry: { positions: sidePos, normals: sideNorm }, materialKey: input.trimKey },
  ];
}
