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

// ─────────────────────────────────────────────────────────────────────────────
// §W2A-ONE-OFFSET — `applyOverhang` and `shrinkPolygon` USED TO LIVE HERE.
// They are DELETED, not deprecated. Use `offsetPolygon` /
// `offsetPolygonOrSelf` from `../../../pure/polygonOffset.js`.
//
// WHY, measured against an INDEPENDENT oracle (perpendicular distance at every
// edge midpoint of the result; a centroid scale pulls back in proportion to
// distance from the centre, so the min–max SPREAD is the discriminator):
//
//   `applyOverhang` was a CENTROID RADIAL DILATION sold as a parallel offset.
//   For a requested 300 mm eave it delivered
//       square 10×10     212.13 mm            (spread   0.00 mm)
//       elongated 40×4    29.85 … 298.51 mm   (spread 268.66 mm)
//       L-shape          121.77 … 260.96 mm   (spread 139.19 mm)
//       U-shape          183.24 … 228.13 mm   (spread  44.89 mm)
//       cadastral arc    204.48 … 297.20 mm   (spread  92.71 mm)
//   Quality bar (L-825 floor-finish fix): spread ≤ 0.1 mm. It failed every
//   fixture. THIS was the copy wired into `plugins/roof`'s committer, so this
//   is the geometry users have been getting.
//
//   `shrinkPolygon` looked healthier and was worse in a more dangerous way:
//     • line 164's `if (|det| < 1e-8) continue` DELETED the vertex at every
//       near-parallel corner and still returned success. ⚠ AN EARLIER DRAFT OF
//       THIS BLOCK PUT THAT AT "49% of vertices on real cadastral rings". THAT
//       NUMBER IS WRONG AND IS RETRACTED. It was borrowed from
//       `site-parcel-data/src/geometry/insetPolygon.ts:437`, where 49% is the
//       share of cadastral vertices that turn by less than ONE DEGREE — a
//       statistic about ring SHAPE, not a deletion rate. `|det| < 1e-8` is a
//       turn of ~6e-7 degrees, six orders of magnitude tighter. Re-measured
//       against the HEAD implementation over tessellated-arc fixtures at
//       24/60/120/360/1000/4000 segments: the loss is 1–3 vertices in ABSOLUTE
//       terms (10.0% of a 30-vertex ring, 0.1% of a 1006-vertex one) and it
//       FALLS with density. The defect is real — vertices are silently deleted
//       and the result is still reported as success — but it is a
//       collinear-run defect, not a proportional one. Do not restate 49%;

//     • its only gate was `dist² ≤ maxOrigDistSq · 1.1`, a CENTROID-RADIUS
//       test that is blind to shape, to folds and to winding inversion;
//     • `filtered.length >= 2` was returned as SUCCESS. A 2-vertex "polygon"
//       is not a polygon.
//   Measured at the depth the LIVE hip branch actually calls it
//   (`shrinkPolygon(eave, inradius)`): on a 10×10 square it returned FOUR
//   vertices that had all collapsed onto the centre, as success, so the hip
//   branch never took its `ridgePts.length === 0 → apex pyramid` path; on the
//   U-shape it returned eight vertices whose perpendicular distance ranged
//   over 1000 mm for a 3000 mm request, i.e. the arms had inverted. The
//   replacement REFUSES both ('offset collapsed the ring' / 'offset inverted
//   the ring winding').
//
// DO NOT REINTRODUCE EITHER FUNCTION HERE.
// Gated by `tools/ga-gate/check-offset-implementations.ts`.
// ─────────────────────────────────────────────────────────────────────────────

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
