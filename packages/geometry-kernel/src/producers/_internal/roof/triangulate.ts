// triangulate — ear-clipping triangulator for simple 2D polygons.
//
// Produces an array of `[i0, i1, i2]` triangles indexed into the
// input polygon.  CCW input → CCW triangle output.  Mirrors what
// PRYZM 1 calls `THREE.ShapeUtils.triangulateShape(...)`, but
// THREE-free per K1B-1.
//
// Algorithm: classic O(n²) ear-clipping (Meisters, 1975).  Sufficient
// for roof footprints (small n, well-formed simple polygons).

import { signedArea, type Pt } from './polygon.js';

/** Returns triangle index list `[[i0, i1, i2], …]` indexed into `pts`. */
export function triangulate(pts: readonly Pt[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  // Force CCW so cross-product >0 means convex vertex.
  const ccw = signedArea(pts) >= 0;
  const indices: number[] = ccw
    ? Array.from({ length: n }, (_, i) => i)
    : Array.from({ length: n }, (_, i) => n - 1 - i);

  const out: [number, number, number][] = [];
  let remaining = indices.slice();
  let guard = remaining.length * 2;

  while (remaining.length > 3 && guard-- > 0) {
    let earFound = false;
    for (let i = 0; i < remaining.length; i++) {
      const i0 = remaining[(i - 1 + remaining.length) % remaining.length]!;
      const i1 = remaining[i]!;
      const i2 = remaining[(i + 1) % remaining.length]!;
      const a = pts[i0]!;
      const b = pts[i1]!;
      const c = pts[i2]!;

      // Convex test (CCW).
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 0) continue;

      // No other remaining vertex inside the candidate triangle.
      let containsOther = false;
      for (const j of remaining) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (pointInTri(pts[j]!, a, b, c)) { containsOther = true; break; }
      }
      if (containsOther) continue;

      out.push([i0, i1, i2]);
      remaining = remaining.filter((_, k) => k !== i);
      earFound = true;
      break;
    }
    if (!earFound) break; // bail on degenerate / non-simple polygon
  }

  if (remaining.length === 3) {
    out.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  }
  return out;
}

function pointInTri(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const denom =
    (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denom) < 1e-20) return false;
  const u =
    ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / denom;
  const v =
    ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / denom;
  const w = 1 - u - v;
  // Strictly-inside test (epsilon).
  const eps = 1e-9;
  return u > eps && v > eps && w > eps;
}
