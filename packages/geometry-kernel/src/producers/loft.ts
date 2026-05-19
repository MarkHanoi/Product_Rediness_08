// produceLoft — pure function that lofts between two or more 2D
// profiles in parallel planes (S53 D2 per
// `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §7.3).
//
// FROZEN signature: `produceLoft(sections, opts) => Descriptor`.
// L4 PURE — no THREE, no DOM, no Node primitives.
//
// SECTIONS
//   • An ordered array of cross sections; each has:
//       - `profile`  : closed 2D polyline `{u, v}` in metres,
//       - `worldOrigin` : {x, y, z} placement of the (u=0, v=0) point,
//       - `right`    : 3D unit vector for the local +U axis,
//       - `up`       : 3D unit vector for the local +V axis.
//   • All profiles MUST have the same vertex count (vertex i in
//     section k connects to vertex i in section k+1).
//
// OPTIONS
//   • `material` — defaults to `'loft|default'`.
//   • `closed`   — when true, the last section connects back to the
//                  first and end caps are skipped.
//
// OUTPUT
//   • Single-material descriptor stitching consecutive sections with
//     two triangles per quad. End caps for open lofts.

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import type { MaterialKey } from '../types/MaterialKey.js';
import { asMaterialKey } from '../types/MaterialKey.js';
import type { Point3D } from '../types/Point3D.js';

const HASH_SCHEMA_VERSION = 'loft:1' as const;

export interface LoftProfilePoint { readonly u: number; readonly v: number }

export interface LoftSection {
  readonly profile: readonly LoftProfilePoint[];
  readonly worldOrigin: Point3D;
  readonly right: Point3D;
  readonly up: Point3D;
}

export interface LoftOptions {
  readonly material?: MaterialKey;
  readonly closed?: boolean;
}

export type LoftProducer = (
  sections: readonly LoftSection[],
  options?: LoftOptions,
) => BufferGeometryDescriptor;

export const produceLoft: LoftProducer = (sections, options = {}) => {
  if (sections.length < 2) {
    throw new DescriptorInvariantError(
      `produceLoft: need ≥ 2 sections (got ${sections.length}).`,
    );
  }
  const N = sections[0]!.profile.length;
  if (N < 3) {
    throw new DescriptorInvariantError(`produceLoft: profile must have ≥ 3 points (got ${N}).`);
  }
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    if (s.profile.length !== N) {
      throw new DescriptorInvariantError(
        `produceLoft: section ${i} has ${s.profile.length} verts; expected ${N}.`,
      );
    }
  }
  const closed = options.closed === true;
  const material = options.material ?? asMaterialKey('loft|default');
  const M = sections.length;

  const sideVerts = N * M;
  const capVerts = closed ? 0 : 2 * N;
  const totalVerts = sideVerts + capVerts;
  const position = new Float32Array(3 * totalVerts);
  const normal = new Float32Array(3 * totalVerts);
  const uv = new Float32Array(2 * totalVerts);

  // Side ring vertices.
  for (let s = 0; s < M; s++) {
    const sec = sections[s]!;
    const o = sec.worldOrigin;
    for (let p = 0; p < N; p++) {
      const v = s * N + p;
      const pp = sec.profile[p]!;
      position[3 * v + 0] = o.x + sec.right.x * pp.u + sec.up.x * pp.v;
      position[3 * v + 1] = o.y + sec.right.y * pp.u + sec.up.y * pp.v;
      position[3 * v + 2] = o.z + sec.right.z * pp.u + sec.up.z * pp.v;
      uv[2 * v + 0] = s / Math.max(1, M - 1);
      uv[2 * v + 1] = p / N;
    }
  }
  // Compute per-vertex normals as average of adjacent face normals.
  for (let s = 0; s < M; s++) {
    const sNext = closed ? (s + 1) % M : Math.min(M - 1, s + 1);
    const sPrev = closed ? (s - 1 + M) % M : Math.max(0, s - 1);
    for (let p = 0; p < N; p++) {
      const pNext = (p + 1) % N;
      const pPrev = (p - 1 + N) % N;
      const here = vec(position, s * N + p);
      const right = vec(position, s * N + pNext);
      const left = vec(position, s * N + pPrev);
      const fwd = vec(position, sNext * N + p);
      const back = vec(position, sPrev * N + p);
      // Tangent along profile (right - left), tangent along section (fwd - back).
      const tU = sub(right, left);
      const tS = sub(fwd, back);
      let n = cross(tS, tU);
      if (Math.hypot(n.x, n.y, n.z) < 1e-12) {
        n = cross(sub(right, here), sub(fwd, here));
      }
      n = normalize(n);
      const v = s * N + p;
      normal[3 * v + 0] = n.x;
      normal[3 * v + 1] = n.y;
      normal[3 * v + 2] = n.z;
    }
  }
  // End caps (axial normals).
  if (!closed) {
    const startBase = sideVerts;
    const endBase = sideVerts + N;
    const startN = sectionNormal(sections[0]!);
    const endN = sectionNormal(sections[M - 1]!);
    const sec0 = sections[0]!;
    const secN = sections[M - 1]!;
    for (let p = 0; p < N; p++) {
      const sIdx = startBase + p;
      const eIdx = endBase + p;
      const pp0 = sec0.profile[p]!;
      const ppN = secN.profile[p]!;
      position[3 * sIdx + 0] = sec0.worldOrigin.x + sec0.right.x * pp0.u + sec0.up.x * pp0.v;
      position[3 * sIdx + 1] = sec0.worldOrigin.y + sec0.right.y * pp0.u + sec0.up.y * pp0.v;
      position[3 * sIdx + 2] = sec0.worldOrigin.z + sec0.right.z * pp0.u + sec0.up.z * pp0.v;
      position[3 * eIdx + 0] = secN.worldOrigin.x + secN.right.x * ppN.u + secN.up.x * ppN.v;
      position[3 * eIdx + 1] = secN.worldOrigin.y + secN.right.y * ppN.u + secN.up.y * ppN.v;
      position[3 * eIdx + 2] = secN.worldOrigin.z + secN.right.z * ppN.u + secN.up.z * ppN.v;
      normal[3 * sIdx + 0] = -startN.x;
      normal[3 * sIdx + 1] = -startN.y;
      normal[3 * sIdx + 2] = -startN.z;
      normal[3 * eIdx + 0] = endN.x;
      normal[3 * eIdx + 1] = endN.y;
      normal[3 * eIdx + 2] = endN.z;
      uv[2 * sIdx + 0] = pp0.u;
      uv[2 * sIdx + 1] = pp0.v;
      uv[2 * eIdx + 0] = ppN.u;
      uv[2 * eIdx + 1] = ppN.v;
    }
  }

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
      index[cursor++] = startBase;
      index[cursor++] = startBase + p + 1;
      index[cursor++] = startBase + p;
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
    hash: composeLoftHash(sections, closed, material),
  };
  return Object.freeze(descriptor);
};

export function composeLoftHash(
  sections: readonly LoftSection[],
  closed: boolean,
  material: MaterialKey,
): string {
  const parts = sections.map((s) => {
    const pf = s.profile.map((p) => `${p.u.toFixed(6)},${p.v.toFixed(6)}`).join(',');
    const o = `${s.worldOrigin.x.toFixed(6)},${s.worldOrigin.y.toFixed(6)},${s.worldOrigin.z.toFixed(6)}`;
    const r = `${s.right.x.toFixed(6)},${s.right.y.toFixed(6)},${s.right.z.toFixed(6)}`;
    const u = `${s.up.x.toFixed(6)},${s.up.y.toFixed(6)},${s.up.z.toFixed(6)}`;
    return `${o}|${r}|${u}|${pf}`;
  });
  return `${HASH_SCHEMA_VERSION}|c=${closed ? 1 : 0}|m=${material}|s=${parts.join('||')}`;
}

function sectionNormal(s: LoftSection): Point3D {
  return normalize(cross(s.right, s.up));
}

function vec(arr: Float32Array, idx: number): Point3D {
  return { x: arr[3 * idx]!, y: arr[3 * idx + 1]!, z: arr[3 * idx + 2]! };
}

function sub(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
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
