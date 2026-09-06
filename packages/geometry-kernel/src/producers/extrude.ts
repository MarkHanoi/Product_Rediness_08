// produceExtrude — pure function `(profile, height, options) => BufferGeometryDescriptor`.
//
// First 3D producer of the Family Creator rewrite (S52 D1 per
// `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §7.3).  Sweep / loft /
// revolve land later in S52–S53 alongside their snapshot suites.
//
// FROZEN signature: `produceExtrude(profile, height, options?) => Descriptor`.
// The producer is L4 PURE — no THREE, no DOM, no Node primitives — so it
// runs byte-identically in the browser worker, the bake worker, the
// AI worker, and the snapshot tests.
//
// PROFILE CONVENTION
//   • The profile is a closed polyline in the XZ plane.
//   • Vertices are 2D `{x, z}` points; the producer interprets them in
//     metres (consistent with the rest of the kernel — wall, slab, etc.
//     all use metres in `Point3D`).
//   • The polyline is implicitly closed: the last edge connects
//     `profile[n-1]` to `profile[0]`.  Callers MUST NOT repeat the
//     first vertex at the end.
//   • Counter-clockwise (CCW) winding when viewed from +Y is the
//     convention.  CW input is auto-reversed; the wind direction is
//     reported back via `appliedReversal` for tests.
//
// OUTPUT
//   • Bottom cap (n verts, normal -Y) + top cap (n verts, normal +Y)
//     + side walls (4n verts with sharp per-edge normals).  Total
//     vertex count is 6n; total triangle count is 4n − 4.
//   • Single material group (the producer is single-material at S52 D1;
//     the §8 commands surface lets the family author bind one material
//     per face later in the sprint).
//
// CAP TRIANGULATION
//   • §C73-TRIANGULATION-CANONICAL — the cap delegates to THE polygon
//     triangulation (`pure/triangulatePolygon.ts`), correct on convex
//     AND concave simple profiles.  Self-intersecting profiles are
//     refused via an area-deviation check (see `triangulateCap`).

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import type { MaterialKey } from '../types/MaterialKey.js';
import { asMaterialKey } from '../types/MaterialKey.js';
import { polygonSignedAreaOrdinates } from '../pure/polygonOffset.js';
import {
  triangulateRingOrdinates,
  triangulationAreaDeviation,
} from '../pure/triangulatePolygon.js';

const HASH_SCHEMA_VERSION = 'extrude:1' as const;

/** A 2D point in the profile plane (XZ). */
export interface ProfilePoint {
  readonly x: number;
  readonly z: number;
}

/** A 3D vector in the producer's own (dimensionless) component spelling. */
export interface ExtrudeDirection {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ExtrudeOptions {
  /** Material key for the entire extrusion. Defaults to `'extrude|default'`. */
  readonly material?: MaterialKey;
  /**
   * World-Y origin of the bottom cap, in metres. Defaults to 0.
   * Useful when the family wants to position the descriptor at a
   * specific level elevation without a separate transform step.
   *
   * ⚠ With `direction` set, this offsets the bottom cap along the EXTRUSION
   *   AXIS before the axis is rotated into place — it stays "how far up the
   *   sweep the solid starts", which is what every existing caller means by it.
   */
  readonly worldY?: number;
  /**
   * ⭐ §82.4-DIRECTED-EXTRUDE (STR-UCE-MASTER-SPEC §82.4 — *"extrusion on ANY
   * work plane, not +Y only"*). The direction the profile is swept along, as a
   * vector this producer normalises. Defaults to `+Y`, which is what every
   * caller before this option got and still gets **byte-identically**: the
   * default path is not merely equivalent, it is the same code with no rotation
   * applied and no extra term in the hash.
   *
   * ─── THE GEOMETRIC CONTRACT, EXACTLY ────────────────────────────────────────
   * The profile is authored in the plane PERPENDICULAR to the sweep, in the
   * producer's own XZ ordinates, and the finished solid is the +Y build rotated
   * by the MINIMAL rotation carrying `+Y` to the unit `direction` (Rodrigues
   * about `+Y × d̂`). Minimal, and named as such, because it is the only choice
   * that needs no second field: a general work-plane placement also fixes the
   * SPIN about the axis, and this producer is deliberately NOT given one —
   * `ReferencePlaneSchema` persists no in-plane basis (see §4D-SCHEMA-DELTA in
   * `bakeFamilyInstance`), so accepting a spin here would invent an orientation
   * the document cannot state. A caller needing a spin must persist a basis
   * first.
   *
   * ⛔ It REFUSES rather than substitutes (spec §75): a non-finite or
   *    zero-length vector throws `DescriptorInvariantError` — it never silently
   *    falls back to +Y, which is exactly the defect the bake's own
   *    §4D-DIRECTION-IS-NOT-READ refusal was written against.
   *
   * ⭐ Antiparallel (`-Y`) is handled explicitly, not left to a degenerate
   *    cross product: the rotation is π about `+X`. A rotation matrix built
   *    from a zero-length axis would be all-NaN, and NaN geometry is the shape
   *    of bug that reaches the screen as "nothing drawn, no reason".
   */
  readonly direction?: ExtrudeDirection;
}

export interface ExtrudeResult extends BufferGeometryDescriptor {
  /** True if the producer reversed the input winding to make it CCW. */
  readonly appliedReversal: boolean;
}

const MIN_PROFILE_VERTS = 3;
const MIN_HEIGHT_M = 1e-6;
const DEGENERATE_AREA_M2 = 1e-9;

export type ExtrudeProducer = (
  profile: readonly ProfilePoint[],
  heightM: number,
  options?: ExtrudeOptions,
) => ExtrudeResult;

/**
 * Produce a single-material extrusion descriptor from a closed 2D
 * profile and a positive height (in metres).
 */
export const produceExtrude: ExtrudeProducer = (profile, heightM, options) => {
  if (profile.length < MIN_PROFILE_VERTS) {
    throw new DescriptorInvariantError(
      `produceExtrude: profile needs at least ${MIN_PROFILE_VERTS} vertices, got ${profile.length}.`,
    );
  }
  if (!Number.isFinite(heightM) || heightM <= MIN_HEIGHT_M) {
    throw new DescriptorInvariantError(
      `produceExtrude: heightM must be a finite positive number > ${MIN_HEIGHT_M}, got ${heightM}.`,
    );
  }

  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
      throw new DescriptorInvariantError(
        `produceExtrude: profile[${i}] has non-finite coords (x=${p.x}, z=${p.z}).`,
      );
    }
  }

  const signedArea = computeSignedArea(profile);
  if (Math.abs(signedArea) < DEGENERATE_AREA_M2) {
    throw new DescriptorInvariantError(
      `produceExtrude: profile area is degenerate (|A|=${Math.abs(signedArea).toExponential(3)} m²).`,
    );
  }

  // Normalise to CCW (positive signed area in XZ when viewed from +Y).
  const ccw = signedArea > 0 ? profile.slice() : [...profile].reverse();
  const appliedReversal = signedArea < 0;

  const worldY = options?.worldY ?? 0;
  const topY = worldY + heightM;
  const material = options?.material ?? asMaterialKey('extrude|default');
  // §82.4-DIRECTED-EXTRUDE — resolved BEFORE any array is filled, so a refused
  // direction costs nothing and, more importantly, cannot half-build a solid.
  // `null` = the +Y default = the untouched pre-existing path.
  const rotation = resolveExtrudeRotation(options?.direction);

  const n = ccw.length;
  const totalVerts = 6 * n;

  const position = new Float32Array(3 * totalVerts);
  const normal = new Float32Array(3 * totalVerts);
  const uv = new Float32Array(2 * totalVerts);

  // ── 1. Bottom cap (verts [0, n)) — normal (0, -1, 0). ─────────────
  for (let i = 0; i < n; i++) {
    const p = ccw[i]!;
    position[3 * i + 0] = p.x;
    position[3 * i + 1] = worldY;
    position[3 * i + 2] = p.z;
    normal[3 * i + 0] = 0;
    normal[3 * i + 1] = -1;
    normal[3 * i + 2] = 0;
    uv[2 * i + 0] = p.x;
    uv[2 * i + 1] = p.z;
  }

  // ── 2. Top cap (verts [n, 2n)) — normal (0, 1, 0). ────────────────
  for (let i = 0; i < n; i++) {
    const p = ccw[i]!;
    const base = n + i;
    position[3 * base + 0] = p.x;
    position[3 * base + 1] = topY;
    position[3 * base + 2] = p.z;
    normal[3 * base + 0] = 0;
    normal[3 * base + 1] = 1;
    normal[3 * base + 2] = 0;
    uv[2 * base + 0] = p.x;
    uv[2 * base + 1] = p.z;
  }

  // ── 3. Side walls (verts [2n, 6n)) — sharp per-edge normals. ──────
  // For edge i (i → i+1 mod n) we emit four verts in this order:
  //    bottom-current (BC), bottom-next (BN), top-next (TN), top-current (TC)
  for (let i = 0; i < n; i++) {
    const a = ccw[i]!;
    const b = ccw[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez);
    // For CCW polygon viewed from +Y, the OUTWARD normal of edge (a→b)
    // is (ez, 0, -ex) / len.
    const nx = len > 0 ? ez / len : 0;
    const nz = len > 0 ? -ex / len : 0;
    const sideBase = 2 * n + 4 * i;

    // BC
    position[3 * (sideBase + 0) + 0] = a.x;
    position[3 * (sideBase + 0) + 1] = worldY;
    position[3 * (sideBase + 0) + 2] = a.z;
    // BN
    position[3 * (sideBase + 1) + 0] = b.x;
    position[3 * (sideBase + 1) + 1] = worldY;
    position[3 * (sideBase + 1) + 2] = b.z;
    // TN
    position[3 * (sideBase + 2) + 0] = b.x;
    position[3 * (sideBase + 2) + 1] = topY;
    position[3 * (sideBase + 2) + 2] = b.z;
    // TC
    position[3 * (sideBase + 3) + 0] = a.x;
    position[3 * (sideBase + 3) + 1] = topY;
    position[3 * (sideBase + 3) + 2] = a.z;

    for (let k = 0; k < 4; k++) {
      normal[3 * (sideBase + k) + 0] = nx;
      normal[3 * (sideBase + k) + 1] = 0;
      normal[3 * (sideBase + k) + 2] = nz;
    }

    // UVs: U along the edge, V along the height.
    uv[2 * (sideBase + 0) + 0] = 0;
    uv[2 * (sideBase + 0) + 1] = 0;
    uv[2 * (sideBase + 1) + 0] = len;
    uv[2 * (sideBase + 1) + 1] = 0;
    uv[2 * (sideBase + 2) + 0] = len;
    uv[2 * (sideBase + 2) + 1] = heightM;
    uv[2 * (sideBase + 3) + 0] = 0;
    uv[2 * (sideBase + 3) + 1] = heightM;
  }

  // ── 3b. §82.4-DIRECTED-EXTRUDE — rotate the finished build into place. ──
  // ⭐ AFTER the arrays are written and BEFORE the indices, deliberately: the
  //    rotation is a RIGID motion, so winding, triangulation and the index
  //    buffer below are invariant under it (det R = +1). Rotating the vertices
  //    rather than re-deriving the whole build along an arbitrary axis is what
  //    keeps ONE body of extrusion arithmetic in this file — a second,
  //    axis-general fill would be the rival producer §76 gate B forbids.
  //    UVs are untouched: they are surface parameters, not world coordinates.
  if (rotation !== null) {
    rotateTriples(position, rotation);
    rotateTriples(normal, rotation);
  }

  // ── 4. Indices. ───────────────────────────────────────────────────
  const capTriangles = triangulateCap(ccw); // n-2 triangles, indices into ccw
  const sideTriCount = 2 * n;
  const totalTris = 2 * capTriangles.length / 3 + sideTriCount;
  const totalIndices = 3 * totalTris;
  const useUint16 = totalVerts < 65536;
  const index = useUint16 ? new Uint16Array(totalIndices) : new Uint32Array(totalIndices);

  let cursor = 0;
  // Bottom cap — wind reversed so normal faces -Y.
  for (let t = 0; t < capTriangles.length; t += 3) {
    index[cursor++] = capTriangles[t + 0]!;
    index[cursor++] = capTriangles[t + 2]!;
    index[cursor++] = capTriangles[t + 1]!;
  }
  // Top cap — original CCW winding, indices offset by +n.
  for (let t = 0; t < capTriangles.length; t += 3) {
    index[cursor++] = capTriangles[t + 0]! + n;
    index[cursor++] = capTriangles[t + 1]! + n;
    index[cursor++] = capTriangles[t + 2]! + n;
  }
  // Side walls — two triangles per edge: (BC, BN, TN), (BC, TN, TC).
  for (let i = 0; i < n; i++) {
    const sideBase = 2 * n + 4 * i;
    index[cursor++] = sideBase + 0;
    index[cursor++] = sideBase + 1;
    index[cursor++] = sideBase + 2;
    index[cursor++] = sideBase + 0;
    index[cursor++] = sideBase + 2;
    index[cursor++] = sideBase + 3;
  }

  // ── 5. Bounds + groups + hash. ────────────────────────────────────
  // ⛔ TWO PATHS, AND THE SPLIT IS DELIBERATE. The +Y path keeps measuring the
  //    DOUBLE-precision profile ordinates exactly as before — replacing it with
  //    a scan of the Float32 position buffer would shift every existing
  //    descriptor's bounds by a float32 rounding step and quietly rewrite
  //    snapshots that have nothing to do with this change. The directed path
  //    MUST scan the written vertices: the rotated extent is not derivable from
  //    the profile's XZ box, and a bounds box that disagreed with the geometry
  //    it describes reaches the user as a wrongly culled or wrongly framed solid.
  let minX = Infinity;
  let minY = worldY;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = topY;
  let maxZ = -Infinity;
  if (rotation === null) {
    for (const p of ccw) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
  } else {
    minY = Infinity;
    maxY = -Infinity;
    for (let i = 0; i < position.length; i += 3) {
      const px = position[i]!;
      const py = position[i + 1]!;
      const pz = position[i + 2]!;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
  }

  const descriptor: BufferGeometryDescriptor = {
    position,
    normal,
    uv,
    index,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
    groups: [
      { start: 0, count: totalIndices, materialIndex: 0 },
    ],
    materialKeys: [material],
    hash: composeExtrudeHash(ccw, heightM, worldY, material, rotation?.unit),
  };

  return Object.freeze({ ...descriptor, appliedReversal });
};

/**
 * Deterministic content-addressed key for the extrusion.
 *
 * ⚠ `direction` is APPENDED and only when the extrusion is directed, so every
 *   +Y descriptor keeps the exact key it had before §82.4 — a hash that moved
 *   for unchanged geometry would invalidate every cached descriptor in the
 *   repository to announce a feature none of them use.
 */
export function composeExtrudeHash(
  profileCcw: readonly ProfilePoint[],
  heightM: number,
  worldY: number,
  material: MaterialKey,
  direction?: ExtrudeDirection,
): string {
  const verts = profileCcw
    .map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`)
    .join('|');
  const base = `${HASH_SCHEMA_VERSION}|h=${heightM.toFixed(6)}|y=${worldY.toFixed(6)}|m=${material}|v=${verts}`;
  if (direction === undefined) return base;
  return `${base}|d=${direction.x.toFixed(6)},${direction.y.toFixed(6)},${direction.z.toFixed(6)}`;
}

/* ------------------------------------------------------------------ */
/* §82.4-DIRECTED-EXTRUDE — the rotation                                */
/* ------------------------------------------------------------------ */

/** Row-major 3×3 rotation, plus the unit direction it was built from. */
interface ExtrudeRotation {
  /** `[m00,m01,m02, m10,m11,m12, m20,m21,m22]`. */
  readonly m: readonly number[];
  readonly unit: ExtrudeDirection;
}

/**
 * Below this the sweep axis is treated as parallel (or antiparallel) to +Y.
 * Chosen as the producer's existing dimensionless-zero scale rather than a new
 * tolerance: it is a component of a UNIT vector, so it is an angle in disguise
 * (≈ 1e-9 rad), far below any angular tolerance a caller could care about.
 */
const AXIS_PARALLEL_EPS = 1e-9;

/**
 * The minimal rotation carrying `+Y` to `d̂`, or `null` when `d` is absent or
 * already `+Y` (the identity — and the pre-§82.4 code path, untouched).
 *
 * ⛔ Throws on a non-finite or zero-length vector: this producer refuses rather
 *    than substituting +Y (spec §75).
 */
function resolveExtrudeRotation(direction: ExtrudeDirection | undefined): ExtrudeRotation | null {
  if (direction === undefined) return null;
  const { x, y, z } = direction;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new DescriptorInvariantError(
      `produceExtrude: direction has non-finite components (${x}, ${y}, ${z}); refused rather than ` +
        'substituting the +Y default.',
    );
  }
  const len = Math.hypot(x, y, z);
  if (len < AXIS_PARALLEL_EPS) {
    throw new DescriptorInvariantError(
      `produceExtrude: direction (${x}, ${y}, ${z}) has zero length, so it names no sweep axis; ` +
        'refused rather than substituting the +Y default.',
    );
  }
  const ux = x / len;
  const uy = y / len;
  const uz = z / len;

  // a = +Y, b = û.  a × b = (uz, 0, -ux);  |a × b| = hypot(ux, uz);  a·b = uy.
  const s = Math.hypot(ux, uz);
  if (s < AXIS_PARALLEL_EPS) {
    if (uy > 0) return null; // already +Y — identity, and the default path.
    // Antiparallel: π about +X.  (x, y, z) → (x, −y, −z).  det = +1.
    return { m: [1, 0, 0, 0, -1, 0, 0, 0, -1], unit: { x: ux, y: uy, z: uz } };
  }
  const kx = uz / s;
  const ky = 0;
  const kz = -ux / s;
  const c = uy;      // cos θ
  const sn = s;      // sin θ  (θ ∈ (0, π), so sin θ = |a × b| ≥ 0)
  const t = 1 - c;

  // R = I·c + [k]ₓ·sin θ + k kᵀ·(1 − c)   — Rodrigues, row-major.
  return {
    m: [
      t * kx * kx + c,        t * kx * ky - sn * kz,  t * kx * kz + sn * ky,
      t * kx * ky + sn * kz,  t * ky * ky + c,        t * ky * kz - sn * kx,
      t * kx * kz - sn * ky,  t * ky * kz + sn * kx,  t * kz * kz + c,
    ],
    unit: { x: ux, y: uy, z: uz },
  };
}

/** Apply the rotation in place to every (x, y, z) triple of a flat array. */
function rotateTriples(arr: Float32Array, rot: ExtrudeRotation): void {
  const m = rot.m;
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i]!;
    const y = arr[i + 1]!;
    const z = arr[i + 2]!;
    arr[i] = m[0]! * x + m[1]! * y + m[2]! * z;
    arr[i + 1] = m[3]! * x + m[4]! * y + m[5]! * z;
    arr[i + 2] = m[6]! * x + m[7]! * y + m[8]! * z;
  }
}

/**
 * Signed area of the closed polyline (positive when CCW in XZ from +Y).
 * §C73-AREA-CANONICAL — delegates to the kernel's ONE shoelace accumulation
 * (bit-identical arithmetic; winding stays the sign of the same computation).
 */
function computeSignedArea(profile: readonly ProfilePoint[]): number {
  return polygonSignedAreaOrdinates(profile.length, (i) => profile[i]!.x, (i) => profile[i]!.z);
}

/**
 * Maximum tolerated relative deviation between the profile's shoelace area and
 * the area covered by its cap triangulation. A faithful triangulation of a
 * simple polygon reads ≈0 (floating-point noise only); a self-intersecting
 * profile cannot be covered and reads large.
 */
const TRIANGULATION_AREA_DEVIATION_TOL = 1e-6;

/**
 * Cap triangulation — §C73-TRIANGULATION-CANONICAL (GE-12). Returns a flat
 * array of indices into the input polygon; every group of three indices is one
 * CCW triangle (positively oriented in XZ, facing +Y for the CCW profile the
 * caller has already normalised).
 *
 * This used to be a second O(n²) ear clip — a near-verbatim rival of the roof
 * one, counted by `tools/ga-gate/check-triangulation-canonical.ts`. It now
 * delegates to the ONE body in `pure/triangulatePolygon.ts`. §3.7: the old
 * body THREW when its ear search got stuck; that refusal is kept — but keyed
 * on the honest observable (the triangulation measurably failing to cover the
 * profile's own area) rather than on the algorithm's internal progress.
 */
function triangulateCap(polygon: readonly ProfilePoint[]): number[] {
  const n = polygon.length;
  if (n === 3) return [0, 1, 2];
  const xAt = (i: number): number => polygon[i]!.x;
  const yAt = (i: number): number => polygon[i]!.z;
  const tris = triangulateRingOrdinates(n, xAt, yAt);
  const deviation = triangulationAreaDeviation(n, xAt, yAt, tris);
  if (deviation > TRIANGULATION_AREA_DEVIATION_TOL) {
    throw new DescriptorInvariantError(
      `produceExtrude: cap triangulation covers the wrong area (relative deviation ${deviation.toExponential(3)}); profile may be self-intersecting.`,
    );
  }
  return tris;
}
