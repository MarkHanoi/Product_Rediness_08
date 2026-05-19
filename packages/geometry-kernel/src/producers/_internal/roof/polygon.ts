// polygon — pure 2D polygon helpers used by every roof shape builder
// (S10-T7).  Lifted (and de-THREE'd) from PRYZM 1's
// `src/core/geometry/RoofGeometryBuilder.ts` `_applyOverhang`,
// `_shrinkPolygon`, `_bbox`, `_computeInradius`, `_distPointToSeg`,
// `_nearestIdx`.
//
// All inputs are `Pt = [x, z]` 2-tuples in level-local space.  The
// caller is responsible for ensuring polygon vertices are listed in
// CCW order (the schema validator does this upstream by inverting the
// signed area).
//
// THREE-FREE: zero THREE imports per K1B-1 (real-enforced by
// `pryzm/no-three-in-kernel`).

export type Pt = readonly [number, number];

export interface BBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Axis-aligned bounding box of a polygon. */
export function bbox(pts: readonly Pt[]): BBox {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Arithmetic centroid of a polygon (average of vertices). */
export function centroid(pts: readonly Pt[]): Pt {
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  return [cx / n, cz / n];
}

/** Signed area of a polygon — positive when CCW, negative when CW. */
export function signedArea(pts: readonly Pt[]): number {
  const n = pts.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = pts[i]!;
    const [x2, z2] = pts[(i + 1) % n]!;
    s += x1 * z2 - x2 * z1;
  }
  return s * 0.5;
}

/** Force CCW winding by reversing if signedArea is negative. */
export function ensureCCW(pts: readonly Pt[]): Pt[] {
  return signedArea(pts) >= 0 ? pts.slice() : pts.slice().reverse();
}

/** Squared distance from point `(px, pz)` to the line segment `(ax,az) → (bx,bz)`. */
function distSqPointToSeg(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-20) {
    const ex = px - ax, ez = pz - az;
    return ex * ex + ez * ez;
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cz = az + t * dz;
  const ex = px - cx, ez = pz - cz;
  return ex * ex + ez * ez;
}

/** Distance from point `(px, pz)` to the line segment `(ax,az) → (bx,bz)`. */
export function distPointToSeg(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  return Math.sqrt(distSqPointToSeg(px, pz, ax, az, bx, bz));
}

/** Inradius — minimum distance from the centroid to any polygon edge.
 *  PRYZM 1 `_computeInradius` (RoofGeometryBuilder.ts:818-832). */
export function inradius(pts: readonly Pt[]): number {
  const [cx, cz] = centroid(pts);
  const n = pts.length;
  let minDist = Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const d = distPointToSeg(cx, cz, a[0], a[1], b[0], b[1]);
    if (d < minDist) minDist = d;
  }
  return Number.isFinite(minDist) ? minDist : 0;
}

/** Index of the polygon vertex closest to `(x, z)`. */
export function nearestIdx(pts: readonly Pt[], x: number, z: number): number {
  let best = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i]![0] - x;
    const dz = pts[i]![1] - z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) { bestDistSq = dSq; best = i; }
  }
  return best;
}

/** Expand polygon outward from its centroid by distance d.
 *  Centroid-based — works correctly for convex polygons; for concave
 *  polygons it approximates the offset.  Mirrors PRYZM 1's
 *  `_applyOverhang` (RoofGeometryBuilder.ts:750-759). */
export function applyOverhang(pts: readonly Pt[], d: number): Pt[] {
  if (d <= 0) return pts.slice();
  const [cx, cz] = centroid(pts);
  return pts.map(([x, z]): Pt => {
    const dx = x - cx, dz = z - cz;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    return [x + (dx / len) * d, z + (dz / len) * d];
  });
}

/** Shrink polygon inward by distance d using edge-shifting (straight-
 *  skeleton step).  Inward normal of each CCW polygon edge is shifted
 *  by d, then adjacent shifted lines are intersected to find new
 *  vertex positions.  Mirrors PRYZM 1's `_shrinkPolygon`
 *  (RoofGeometryBuilder.ts:768-812).  Returns `[]` if fully degenerate. */
export function shrinkPolygon(pts: readonly Pt[], d: number): Pt[] {
  if (d <= 0) return pts.slice();
  const ccw = ensureCCW(pts);
  const n = ccw.length;
  if (n < 3) return [];

  // Inward-shifted line for each edge: a·x + b·z = c
  const lines: { a: number; b: number; c: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [x1, z1] = ccw[i]!;
    const [x2, z2] = ccw[(i + 1) % n]!;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-10) { lines.push({ a: 0, b: 0, c: 0 }); continue; }
    // Inward normal for CCW polygon: (-dz, dx) / len
    const nx = -dz / len, nz = dx / len;
    lines.push({ a: nx, b: nz, c: nx * x1 + nz * z1 + d });
  }

  // Intersect adjacent shifted lines to find new vertex positions.
  const newPts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[i]!;
    const l2 = lines[(i + 1) % n]!;
    const det = l1.a * l2.b - l2.a * l1.b;
    if (Math.abs(det) < 1e-8) continue; // parallel edges → vertex collapsed
    const x = (l1.c * l2.b - l2.c * l1.b) / det;
    const z = (l1.a * l2.c - l2.a * l1.c) / det;
    newPts.push([x, z]);
  }

  if (newPts.length < 2) return [];

  // Sanity filter — keep only points reasonably inside the original.
  const [cx, cz] = centroid(ccw);
  const maxOrigDistSq = ccw.reduce((m, [x, z]) => {
    const e = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    return e > m ? e : m;
  }, 0);
  const filtered = newPts.filter(([x, z]) => {
    const dist2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    return dist2 <= maxOrigDistSq * 1.1; // 10% slack matches PRYZM 1
  });

  return filtered.length >= 2 ? filtered : [];
}

/** Deduplicate consecutive coincident vertices (within 1e-6).  Used by
 *  builders that may collapse vertices after a clamp. */
export function deduplicate(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  const eps = 1e-6;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]!;
    if (out.length === 0) { out.push([x, z]); continue; }
    const [px, pz] = out[out.length - 1]!;
    if (Math.abs(x - px) > eps || Math.abs(z - pz) > eps) out.push([x, z]);
  }
  // Also dedupe wrap-around.
  if (out.length > 1) {
    const [fx, fz] = out[0]!;
    const [lx, lz] = out[out.length - 1]!;
    if (Math.abs(fx - lx) <= eps && Math.abs(fz - lz) <= eps) out.pop();
  }
  return out;
}
