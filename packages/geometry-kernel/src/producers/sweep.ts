// produceSweep — pure function that sweeps a 2D profile along a 3D
// polyline path with parallel-transport frames (S53 D2 per
// `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §7.3).
//
// FROZEN signature: `produceSweep(profile, path, opts) => Descriptor`.
// L4 PURE — no THREE, no DOM, no Node primitives.
//
// PROFILE
//   • Closed 2D polyline `{u, v}` in metres, defined in the local
//     cross-section plane. Implicitly closed (last vert connects to
//     first); CCW winding for outward-facing normals.
//
// PATH
//   • Open polyline of `{x, y, z}` points in metres. ≥ 2 points.
//
// OPTIONS
//   • `material` — defaults to `'sweep|default'`.
//   • `closed` — when true, the path is treated as a loop; the first
//     section frame matches the last so caps are NOT emitted.
//
// FRAMES
//   • Initial frame: tangent = path[1] - path[0]; up =
//     dominant-axis-perpendicular (avoids gimbal lock); right =
//     up × tangent. Subsequent frames are computed by rotation
//     minimising twist (parallel transport — Bishop frames).
//
// OUTPUT
//   • Side surface: profile.length × path.length verts (one ring per
//     path station), with sharp per-station normals computed from
//     the local frame. Quads stitched between consecutive rings.
//   • Two end caps when `closed === false`.
//   • Single-material descriptor with deterministic hash.

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import type { MaterialKey } from '../types/MaterialKey.js';
import { asMaterialKey } from '../types/MaterialKey.js';
import type { Point3D } from '../types/Point3D.js';

const HASH_SCHEMA_VERSION = 'sweep:1' as const;

export interface SweepProfilePoint { readonly u: number; readonly v: number }

export interface SweepOptions {
  readonly material?: MaterialKey;
  readonly closed?: boolean;
}

export type SweepProducer = (
  profile: readonly SweepProfilePoint[],
  path: readonly Point3D[],
  options?: SweepOptions,
) => BufferGeometryDescriptor;

export const produceSweep: SweepProducer = (profile, path, options = {}) => {
  if (profile.length < 3) {
    throw new DescriptorInvariantError(
      `produceSweep: profile must have ≥ 3 points (got ${profile.length}).`,
    );
  }
  if (path.length < 2) {
    throw new DescriptorInvariantError(
      `produceSweep: path must have ≥ 2 points (got ${path.length}).`,
    );
  }
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      throw new DescriptorInvariantError(`produceSweep: path[${i}] non-finite.`);
    }
  }
  const closed = options.closed === true;
  const material = options.material ?? asMaterialKey('sweep|default');
  const N = profile.length;
  const M = path.length;

  const frames = buildParallelTransportFrames(path, closed);

  const sideVerts = N * M;
  const capVerts = closed ? 0 : 2 * N;
  const totalVerts = sideVerts + capVerts;
  const position = new Float32Array(3 * totalVerts);
  const normal = new Float32Array(3 * totalVerts);
  const uv = new Float32Array(2 * totalVerts);

  // Side ring vertices.
  for (let s = 0; s < M; s++) {
    const f = frames[s]!;
    const o = path[s]!;
    for (let p = 0; p < N; p++) {
      const pp = profile[p]!;
      const v = s * N + p;
      position[3 * v + 0] = o.x + f.right.x * pp.u + f.up.x * pp.v;
      position[3 * v + 1] = o.y + f.right.y * pp.u + f.up.y * pp.v;
      position[3 * v + 2] = o.z + f.right.z * pp.u + f.up.z * pp.v;
      // Outward 2D normal (in profile plane) — perpendicular to local
      // edge: rotate edge tangent by +90° (CCW).
      const t = profileTangent2D(profile, p);
      const nU = t.dv;
      const nV = -t.du;
      const len = Math.hypot(nU, nV) || 1;
      const nUu = nU / len;
      const nVv = nV / len;
      normal[3 * v + 0] = f.right.x * nUu + f.up.x * nVv;
      normal[3 * v + 1] = f.right.y * nUu + f.up.y * nVv;
      normal[3 * v + 2] = f.right.z * nUu + f.up.z * nVv;
      uv[2 * v + 0] = s / Math.max(1, M - 1);
      uv[2 * v + 1] = p / N;
    }
  }
  // End-cap vertices (with axial normals).
  if (!closed) {
    const startBase = sideVerts;
    const endBase = sideVerts + N;
    const f0 = frames[0]!;
    const fN = frames[M - 1]!;
    const o0 = path[0]!;
    const oN = path[M - 1]!;
    for (let p = 0; p < N; p++) {
      const pp = profile[p]!;
      const sIdx = startBase + p;
      const eIdx = endBase + p;
      position[3 * sIdx + 0] = o0.x + f0.right.x * pp.u + f0.up.x * pp.v;
      position[3 * sIdx + 1] = o0.y + f0.right.y * pp.u + f0.up.y * pp.v;
      position[3 * sIdx + 2] = o0.z + f0.right.z * pp.u + f0.up.z * pp.v;
      position[3 * eIdx + 0] = oN.x + fN.right.x * pp.u + fN.up.x * pp.v;
      position[3 * eIdx + 1] = oN.y + fN.right.y * pp.u + fN.up.y * pp.v;
      position[3 * eIdx + 2] = oN.z + fN.right.z * pp.u + fN.up.z * pp.v;
      normal[3 * sIdx + 0] = -f0.tangent.x;
      normal[3 * sIdx + 1] = -f0.tangent.y;
      normal[3 * sIdx + 2] = -f0.tangent.z;
      normal[3 * eIdx + 0] = fN.tangent.x;
      normal[3 * eIdx + 1] = fN.tangent.y;
      normal[3 * eIdx + 2] = fN.tangent.z;
      uv[2 * sIdx + 0] = pp.u;
      uv[2 * sIdx + 1] = pp.v;
      uv[2 * eIdx + 0] = pp.u;
      uv[2 * eIdx + 1] = pp.v;
    }
  }

  // Indices: side stitch + cap fans.
  const stations = closed ? M : M - 1;
  const sideIndexCount = stations * N * 6;
  const capIndexCount = closed ? 0 : 2 * (N - 2) * 3;
  const totalIndices = sideIndexCount + capIndexCount;
  const useUint16 = totalVerts < 65536;
  const index = useUint16 ? new Uint16Array(totalIndices) : new Uint32Array(totalIndices);

  let cursor = 0;
  for (let s = 0; s < stations; s++) {
    const r0 = s;
    const r1 = closed ? (s + 1) % M : s + 1;
    for (let p = 0; p < N; p++) {
      const pNext = (p + 1) % N;
      const a = r0 * N + p;
      const b = r0 * N + pNext;
      const c = r1 * N + pNext;
      const d = r1 * N + p;
      index[cursor++] = a;
      index[cursor++] = b;
      index[cursor++] = c;
      index[cursor++] = a;
      index[cursor++] = c;
      index[cursor++] = d;
    }
  }
  if (!closed) {
    const startBase = sideVerts;
    const endBase = sideVerts + N;
    for (let p = 1; p < N - 1; p++) {
      // Start cap (fan from vert 0, wound to face -tangent).
      index[cursor++] = startBase;
      index[cursor++] = startBase + p + 1;
      index[cursor++] = startBase + p;
      // End cap.
      index[cursor++] = endBase;
      index[cursor++] = endBase + p;
      index[cursor++] = endBase + p + 1;
    }
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i]!, y = position[i + 1]!, z = position[i + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
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
    groups: [{ start: 0, count: totalIndices, materialIndex: 0 }],
    materialKeys: [material],
    hash: composeSweepHash(profile, path, closed, material),
  };
  return Object.freeze(descriptor);
};

export function composeSweepHash(
  profile: readonly SweepProfilePoint[],
  path: readonly Point3D[],
  closed: boolean,
  material: MaterialKey,
): string {
  const pf = profile.map((p) => `${p.u.toFixed(6)},${p.v.toFixed(6)}`).join('|');
  const pa = path.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`).join('|');
  return `${HASH_SCHEMA_VERSION}|c=${closed ? 1 : 0}|m=${material}|pf=${pf}|pa=${pa}`;
}

interface Frame {
  readonly tangent: Point3D;
  readonly up: Point3D;
  readonly right: Point3D;
}

function profileTangent2D(profile: readonly SweepProfilePoint[], i: number): {
  readonly du: number; readonly dv: number;
} {
  const next = profile[(i + 1) % profile.length]!;
  const prev = profile[(i - 1 + profile.length) % profile.length]!;
  return { du: next.u - prev.u, dv: next.v - prev.v };
}

function buildParallelTransportFrames(path: readonly Point3D[], closed: boolean): Frame[] {
  const frames: Frame[] = [];
  const tangents: Point3D[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = closed
      ? path[(i - 1 + path.length) % path.length]!
      : path[Math.max(0, i - 1)]!;
    const b = closed
      ? path[(i + 1) % path.length]!
      : path[Math.min(path.length - 1, i + 1)]!;
    tangents.push(normalize({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }));
  }
  // Initial frame — pick reference vector as the world axis least
  // aligned with t0 to dodge degeneracy.
  const t0 = tangents[0]!;
  const ref = pickReference(t0);
  let up = normalize(cross(t0, ref));
  let right = normalize(cross(up, t0));
  frames.push({ tangent: t0, up, right });
  for (let i = 1; i < tangents.length; i++) {
    const prevT = tangents[i - 1]!;
    const t = tangents[i]!;
    const axis = cross(prevT, t);
    const axisLen = Math.hypot(axis.x, axis.y, axis.z);
    if (axisLen < 1e-9) {
      frames.push({ tangent: t, up, right });
      continue;
    }
    const dotTT = clamp(prevT.x * t.x + prevT.y * t.y + prevT.z * t.z, -1, 1);
    const angle = Math.acos(dotTT);
    const k = { x: axis.x / axisLen, y: axis.y / axisLen, z: axis.z / axisLen };
    up = normalize(rotateAroundAxis(up, k, angle));
    right = normalize(cross(up, t));
    frames.push({ tangent: t, up, right });
  }
  return frames;
}

function pickReference(t: Point3D): Point3D {
  const ax = Math.abs(t.x), ay = Math.abs(t.y), az = Math.abs(t.z);
  if (ax <= ay && ax <= az) return { x: 1, y: 0, z: 0 };
  if (ay <= ax && ay <= az) return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}

function normalize(v: Point3D): Point3D {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function cross(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function rotateAroundAxis(v: Point3D, k: Point3D, angle: number): Point3D {
  // Rodrigues' rotation formula.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = k.x * v.x + k.y * v.y + k.z * v.z;
  const cr = cross(k, v);
  return {
    x: v.x * cos + cr.x * sin + k.x * dot * (1 - cos),
    y: v.y * cos + cr.y * sin + k.y * dot * (1 - cos),
    z: v.z * cos + cr.z * sin + k.z * dot * (1 - cos),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
