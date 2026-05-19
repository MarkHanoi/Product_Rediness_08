// linear-structural — shared extrusion producer for column + beam (S12).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 lines
// 1421-1432.  Column and beam differ only in axis orientation:
// column extrudes a profile vertically along world +Y; beam extrudes
// it along an arbitrary horizontal baseline.  Both share this builder.
//
// Profiles supported:
//   - `rectangular` — solid box section
//   - `circular`    — N-sided polygonal approximation (cylinder)
//   - `i-section`   — wide-flange (top + bottom flange + web)
//   - `t-section`   — tee (top flange + web)
//
// THREE-free.  Output is one `RawGroup[]` per slot (currently a single
// "body" slot — the cross-element MaterialPool de-dupes across columns
// and beams that share systemType + colour).

import type { RawGroup } from '../_internal/rawGeometry.js';
import { asMaterialKey, type MaterialKey } from '../../types/MaterialKey.js';

export type StructuralShape = 'rectangular' | 'circular' | 'i-section' | 't-section';

export interface StructuralProfile {
  readonly shape: StructuralShape;
  /** Section width (m). */
  readonly width: number;
  /** Section depth (m). */
  readonly depth: number;
}

export interface LinearExtrusion {
  /** Start point of the centroid axis (world coordinates). */
  readonly start: { x: number; y: number; z: number };
  /** End point of the centroid axis (world coordinates). */
  readonly end: { x: number; y: number; z: number };
  /** Rotation about the extrusion axis in radians (profile twist). */
  readonly rotation: number;
}

const CIRCULAR_SEGMENTS = 16;
const FLANGE_THICKNESS_RATIO = 0.18;
const WEB_THICKNESS_RATIO = 0.12;

export function composeStructuralMaterialKey(
  family: 'column' | 'beam',
  systemTypeId: string,
  materialId: string,
  color: string,
): MaterialKey {
  return asMaterialKey(`${family}|${systemTypeId}|${materialId}|${color}|body`);
}

interface Vec3 { x: number; y: number; z: number }
interface Pt2 { x: number; y: number }

/** Build an orthonormal basis around an axis direction (start→end).
 *  Returns (u, v, w) where w is the unit axis, and (u, v) span the
 *  cross-section plane. */
function makeBasis(start: Vec3, end: Vec3, rotation: number): {
  u: Vec3;
  v: Vec3;
  w: Vec3;
  length: number;
} {
  const wx = end.x - start.x;
  const wy = end.y - start.y;
  const wz = end.z - start.z;
  const length = Math.hypot(wx, wy, wz) || 1;
  const w: Vec3 = { x: wx / length, y: wy / length, z: wz / length };

  // Pick a reference vector that is not parallel to w.
  const refIsY = Math.abs(w.y) < 0.99;
  const ref: Vec3 = refIsY ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };

  // u = normalize(ref × w); v = w × u.  This gives a right-handed
  // (u, v, w) basis with u "horizontal-ish" for typical columns.
  let ux = ref.y * w.z - ref.z * w.y;
  let uy = ref.z * w.x - ref.x * w.z;
  let uz = ref.x * w.y - ref.y * w.x;
  let ulen = Math.hypot(ux, uy, uz) || 1;
  ux /= ulen; uy /= ulen; uz /= ulen;

  const vx = w.y * uz - w.z * uy;
  const vy = w.z * ux - w.x * uz;
  const vz = w.x * uy - w.y * ux;

  let u: Vec3 = { x: ux, y: uy, z: uz };
  let v: Vec3 = { x: vx, y: vy, z: vz };

  // Apply twist rotation around w.
  if (rotation !== 0) {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    const u2: Vec3 = { x: u.x * c + v.x * s, y: u.y * c + v.y * s, z: u.z * c + v.z * s };
    const v2: Vec3 = { x: -u.x * s + v.x * c, y: -u.y * s + v.y * c, z: -u.z * s + v.z * c };
    u = u2;
    v = v2;
  }

  return { u, v, w, length };
}

/** Build a 2D cross-section polygon for the requested shape. */
function buildProfilePolygon(profile: StructuralProfile): Pt2[] {
  const w = profile.width;
  const d = profile.depth;
  const hw = w / 2;
  const hd = d / 2;

  switch (profile.shape) {
    case 'rectangular':
      return [
        { x: -hw, y: -hd },
        { x: hw, y: -hd },
        { x: hw, y: hd },
        { x: -hw, y: hd },
      ];
    case 'circular': {
      const r = Math.min(hw, hd);
      const out: Pt2[] = [];
      for (let i = 0; i < CIRCULAR_SEGMENTS; i++) {
        const a = (i / CIRCULAR_SEGMENTS) * Math.PI * 2;
        out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      return out;
    }
    case 'i-section': {
      const ft = d * FLANGE_THICKNESS_RATIO;
      const wt = w * WEB_THICKNESS_RATIO;
      const hwt = wt / 2;
      // Walk CCW: bottom flange → up the right side of web → top flange → back.
      return [
        { x: -hw, y: -hd },
        { x: hw, y: -hd },
        { x: hw, y: -hd + ft },
        { x: hwt, y: -hd + ft },
        { x: hwt, y: hd - ft },
        { x: hw, y: hd - ft },
        { x: hw, y: hd },
        { x: -hw, y: hd },
        { x: -hw, y: hd - ft },
        { x: -hwt, y: hd - ft },
        { x: -hwt, y: -hd + ft },
        { x: -hw, y: -hd + ft },
      ];
    }
    case 't-section': {
      const ft = d * FLANGE_THICKNESS_RATIO;
      const wt = w * WEB_THICKNESS_RATIO;
      const hwt = wt / 2;
      // Top flange (at +y) + web descending to -y.
      return [
        { x: -hwt, y: -hd },
        { x: hwt, y: -hd },
        { x: hwt, y: hd - ft },
        { x: hw, y: hd - ft },
        { x: hw, y: hd },
        { x: -hw, y: hd },
        { x: -hw, y: hd - ft },
        { x: -hwt, y: hd - ft },
      ];
    }
  }
}

/** Triangulate a simple convex-or-near-convex profile polygon by
 *  fan-triangulation from vertex 0.  Sufficient for the shapes above
 *  (rectangle / circle / I / T are all triangulated correctly by a
 *  simple fan IF the polygon is convex.  I and T sections are
 *  *non-convex* — for those we use a small dispatch table). */
function triangulateProfile(profile: StructuralProfile, poly: readonly Pt2[]): number[] {
  if (profile.shape === 'rectangular' || profile.shape === 'circular') {
    const tris: number[] = [];
    for (let i = 1; i < poly.length - 1; i++) tris.push(0, i, i + 1);
    return tris;
  }
  if (profile.shape === 'i-section') {
    // I-section: split into bottom flange (4 verts), top flange (4
    // verts), web (4 verts).  poly indices match buildProfilePolygon.
    return [
      // bottom flange [0,1,2,11]
      0, 1, 2, 0, 2, 11,
      // web [10,3,4,9]
      10, 3, 4, 10, 4, 9,
      // top flange [8,5,6,7]
      8, 5, 6, 8, 6, 7,
    ];
  }
  // t-section
  // top flange [3,4,5,6]; web [0,1,2,7]
  return [
    0, 1, 2, 0, 2, 7,
    3, 4, 5, 3, 5, 6,
  ];
}

/** Build the linear extrusion as raw geometry parts.  Outputs ONE
 *  RawGroup containing top cap + bottom cap + side faces, with the
 *  same materialKey throughout (callers can split slots if they wish). */
export function buildLinearExtrusion(
  profile: StructuralProfile,
  extrusion: LinearExtrusion,
  materialKey: MaterialKey,
): RawGroup[] {
  const poly = buildProfilePolygon(profile);
  const tris = triangulateProfile(profile, poly);
  const { u, v, w } = makeBasis(extrusion.start, extrusion.end, extrusion.rotation);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  function project(p: Pt2, atStart: boolean): [number, number, number] {
    const base = atStart ? extrusion.start : extrusion.end;
    return [
      base.x + u.x * p.x + v.x * p.y,
      base.y + u.y * p.x + v.y * p.y,
      base.z + u.z * p.x + v.z * p.y,
    ];
  }

  // ── Side faces ─────────────────────────────────────────────────────
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    // Edge tangent in 2D (cross-section plane).
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const elen = Math.hypot(ex, ey) || 1;
    // Outward normal in 2D = perpendicular (right-hand rule on (u,v)).
    const nx2 = ey / elen;
    const ny2 = -ex / elen;
    // Normal in 3D = nx2*u + ny2*v.
    const nx = nx2 * u.x + ny2 * v.x;
    const ny = nx2 * u.y + ny2 * v.y;
    const nz = nx2 * u.z + ny2 * v.z;

    const aStart = project(a, true);
    const bStart = project(b, true);
    const aEnd = project(a, false);
    const bEnd = project(b, false);

    // Outward-facing winding (when viewed from outside): a-start, b-start, b-end ; a-start, b-end, a-end.
    positions.push(...aStart, ...bStart, ...bEnd);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0, 0, elen, 0, elen, 1);

    positions.push(...aStart, ...bEnd, ...aEnd);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0, 0, elen, 1, 0, 1);
  }

  // ── End cap: start (normal = -w) ────────────────────────────────────
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i]!;
    const ib = tris[i + 2]!;
    const ic = tris[i + 1]!;
    const a = project(poly[ia]!, true);
    const b = project(poly[ib]!, true);
    const c = project(poly[ic]!, true);
    positions.push(...a, ...b, ...c);
    normals.push(-w.x, -w.y, -w.z, -w.x, -w.y, -w.z, -w.x, -w.y, -w.z);
    uvs.push(0, 0, 1, 0, 1, 1);
  }
  // ── End cap: end (normal = +w) ──────────────────────────────────────
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i]!;
    const ib = tris[i + 1]!;
    const ic = tris[i + 2]!;
    const a = project(poly[ia]!, false);
    const b = project(poly[ib]!, false);
    const c = project(poly[ic]!, false);
    positions.push(...a, ...b, ...c);
    normals.push(w.x, w.y, w.z, w.x, w.y, w.z, w.x, w.y, w.z);
    uvs.push(0, 0, 1, 0, 1, 1);
  }

  return [
    {
      geometry: { positions, normals, uvs },
      materialKey,
    },
  ];
}
