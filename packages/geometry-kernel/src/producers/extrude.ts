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
//   • The cap is triangulated with an O(n²) ear-clipping that
//     handles arbitrary simple polygons — convex AND concave.  For
//     the S52 D1 use case (profiles up to ~50 vertices, per the
//     perf budget at plan §15) this is well within the < 1 ms target.

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import type { MaterialKey } from '../types/MaterialKey.js';
import { asMaterialKey } from '../types/MaterialKey.js';

const HASH_SCHEMA_VERSION = 'extrude:1' as const;

/** A 2D point in the profile plane (XZ). */
export interface ProfilePoint {
  readonly x: number;
  readonly z: number;
}

export interface ExtrudeOptions {
  /** Material key for the entire extrusion. Defaults to `'extrude|default'`. */
  readonly material?: MaterialKey;
  /**
   * World-Y origin of the bottom cap, in metres. Defaults to 0.
   * Useful when the family wants to position the descriptor at a
   * specific level elevation without a separate transform step.
   */
  readonly worldY?: number;
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

  // ── 4. Indices. ───────────────────────────────────────────────────
  const capTriangles = triangulateEarClipping(ccw); // n-2 triangles, indices into ccw
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
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of ccw) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const descriptor: BufferGeometryDescriptor = {
    position,
    normal,
    uv,
    index,
    bounds: {
      min: { x: minX, y: worldY, z: minZ },
      max: { x: maxX, y: topY, z: maxZ },
    },
    groups: [
      { start: 0, count: totalIndices, materialIndex: 0 },
    ],
    materialKeys: [material],
    hash: composeExtrudeHash(ccw, heightM, worldY, material),
  };

  return Object.freeze({ ...descriptor, appliedReversal });
};

/** Deterministic content-addressed key for the extrusion. */
export function composeExtrudeHash(
  profileCcw: readonly ProfilePoint[],
  heightM: number,
  worldY: number,
  material: MaterialKey,
): string {
  const verts = profileCcw
    .map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`)
    .join('|');
  return `${HASH_SCHEMA_VERSION}|h=${heightM.toFixed(6)}|y=${worldY.toFixed(6)}|m=${material}|v=${verts}`;
}

/** Signed area of the closed polyline (positive when CCW in XZ from +Y). */
function computeSignedArea(profile: readonly ProfilePoint[]): number {
  let acc = 0;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    acc += a.x * b.z - b.x * a.z;
  }
  return 0.5 * acc;
}

/**
 * Ear-clipping triangulation.  Returns flat array of indices into the
 * input polygon — every group of three indices is one CCW triangle.
 *
 * Assumes the polygon is simple (non-self-intersecting) and CCW.
 * Handles both convex and concave profiles.  O(n²) worst case; for
 * S52 D1 profile sizes (≤ 50 vertices per the perf budget at plan
 * §15) this completes in well under 1 ms.
 */
function triangulateEarClipping(polygon: readonly ProfilePoint[]): number[] {
  const n = polygon.length;
  if (n === 3) return [0, 1, 2];

  // Working list of remaining vertex indices.
  const remaining: number[] = [];
  for (let i = 0; i < n; i++) remaining.push(i);

  const out: number[] = [];
  let guard = remaining.length * 4; // hard upper bound; refuses to spin forever on malformed input

  while (remaining.length > 3 && guard-- > 0) {
    let earFound = false;
    for (let k = 0; k < remaining.length; k++) {
      const iPrev = remaining[(k - 1 + remaining.length) % remaining.length]!;
      const iCurr = remaining[k]!;
      const iNext = remaining[(k + 1) % remaining.length]!;
      const a = polygon[iPrev]!;
      const b = polygon[iCurr]!;
      const c = polygon[iNext]!;
      if (!isConvex(a, b, c)) continue;
      // Check that no other vertex lies inside triangle (a, b, c).
      let containsOther = false;
      for (const m of remaining) {
        if (m === iPrev || m === iCurr || m === iNext) continue;
        if (pointInTriangle(polygon[m]!, a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;
      out.push(iPrev, iCurr, iNext);
      remaining.splice(k, 1);
      earFound = true;
      break;
    }
    if (!earFound) {
      throw new DescriptorInvariantError(
        'produceExtrude: ear-clipping failed; profile may be self-intersecting.',
      );
    }
  }
  if (remaining.length === 3) {
    out.push(remaining[0]!, remaining[1]!, remaining[2]!);
  }
  return out;
}

function isConvex(a: ProfilePoint, b: ProfilePoint, c: ProfilePoint): boolean {
  // Cross product of (b-a) × (c-b); positive = left turn = convex for CCW.
  return (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x) > 0;
}

function pointInTriangle(p: ProfilePoint, a: ProfilePoint, b: ProfilePoint, c: ProfilePoint): boolean {
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function sign(p: ProfilePoint, a: ProfilePoint, b: ProfilePoint): number {
  return (p.x - b.x) * (a.z - b.z) - (a.x - b.x) * (p.z - b.z);
}
