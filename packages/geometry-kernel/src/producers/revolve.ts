// produceRevolve — pure revolve of a 2D profile around the world Y
// axis (S53 D2 per `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md`
// §7.3).
//
// FROZEN signature: `produceRevolve(profile, opts) => Descriptor`.
// L4 PURE — no THREE, no DOM, no Node primitives.
//
// PROFILE
//   • Open polyline of `{r, y}` points. `r` is the distance from the
//     axis (≥ 0); `y` is the height along the axis. Both in metres.
//   • Vertices ordered along the silhouette (top→bottom or bottom→top
//     — direction is preserved through to the output).
//
// OPTIONS
//   • `segments` (≥ 3, default 24) — angular slices.
//   • `startAngle` / `endAngle` — partial sweep in radians (defaults
//     to a full 2π revolution). End caps are emitted only when the
//     sweep is partial so a full revolve stays watertight without a
//     duplicated seam.
//   • `material` (defaults to `'revolve|default'`).
//   • `worldY` (m) added to every output Y.
//
// OUTPUT
//   • Side surface: profile.length × ringCount vertices with sharp
//     per-segment normals (no cross-edge averaging) so silhouette
//     creases stay crisp.
//   • Two end-cap fans for partial sweeps only.
//   • Single-material descriptor with deterministic hash.

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import type { MaterialKey } from '../types/MaterialKey.js';
import { asMaterialKey } from '../types/MaterialKey.js';

const HASH_SCHEMA_VERSION = 'revolve:1' as const;
const TWO_PI = Math.PI * 2;
const MIN_SEGMENTS = 3;

export interface RevolveProfilePoint {
  /** Distance from axis in metres (must be ≥ 0). */
  readonly r: number;
  /** Height along axis in metres. */
  readonly y: number;
}

export interface RevolveOptions {
  readonly segments?: number;
  readonly startAngle?: number;
  readonly endAngle?: number;
  readonly material?: MaterialKey;
  readonly worldY?: number;
}

export type RevolveProducer = (
  profile: readonly RevolveProfilePoint[],
  options?: RevolveOptions,
) => BufferGeometryDescriptor;

export const produceRevolve: RevolveProducer = (profile, options = {}) => {
  if (profile.length < 2) {
    throw new DescriptorInvariantError(
      `produceRevolve: profile must have ≥ 2 points (got ${profile.length}).`,
    );
  }
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!;
    if (!Number.isFinite(p.r) || !Number.isFinite(p.y)) {
      throw new DescriptorInvariantError(
        `produceRevolve: profile[${i}] non-finite (r=${p.r}, y=${p.y}).`,
      );
    }
    if (p.r < -1e-12) {
      throw new DescriptorInvariantError(
        `produceRevolve: profile[${i}].r must be ≥ 0 (got ${p.r}).`,
      );
    }
  }
  const segments = Math.max(MIN_SEGMENTS, Math.floor(options.segments ?? 24));
  const start = options.startAngle ?? 0;
  const end = options.endAngle ?? TWO_PI;
  const sweep = end - start;
  if (!Number.isFinite(sweep) || Math.abs(sweep) < 1e-9) {
    throw new DescriptorInvariantError('produceRevolve: sweep must be non-zero.');
  }
  const isFull = Math.abs(Math.abs(sweep) - TWO_PI) < 1e-6;
  const ringCount = isFull ? segments : segments + 1;
  const worldY = options.worldY ?? 0;
  const material = options.material ?? asMaterialKey('revolve|default');
  const N = profile.length;

  const sideVerts = N * ringCount;
  const capVerts = isFull ? 0 : 2 * N;
  const totalVerts = sideVerts + capVerts;

  const position = new Float32Array(3 * totalVerts);
  const normal = new Float32Array(3 * totalVerts);
  const uv = new Float32Array(2 * totalVerts);

  for (let r = 0; r < ringCount; r++) {
    const a = start + (sweep * r) / segments;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let p = 0; p < N; p++) {
      const v = r * N + p;
      const pp = profile[p]!;
      position[3 * v + 0] = pp.r * cos;
      position[3 * v + 1] = pp.y + worldY;
      position[3 * v + 2] = pp.r * sin;
      const t = profileTangent(profile, p);
      // Outward 2D normal of profile = (dy, -dr); spin by ring angle.
      const rNx = t.dy;
      const rNy = -t.dr;
      const len = Math.hypot(rNx, rNy) || 1;
      const radialN = rNx / len;
      const verticalN = rNy / len;
      normal[3 * v + 0] = radialN * cos;
      normal[3 * v + 1] = verticalN;
      normal[3 * v + 2] = radialN * sin;
      uv[2 * v + 0] = r / segments;
      uv[2 * v + 1] = p / Math.max(1, N - 1);
    }
  }
  // Cap verts (start ring + end ring) with axial normals if partial.
  if (!isFull) {
    const startCos = Math.cos(start), startSin = Math.sin(start);
    const endCos = Math.cos(end), endSin = Math.sin(end);
    const capStartBase = sideVerts;
    const capEndBase = sideVerts + N;
    for (let p = 0; p < N; p++) {
      const pp = profile[p]!;
      const sIdx = capStartBase + p;
      const eIdx = capEndBase + p;
      position[3 * sIdx + 0] = pp.r * startCos;
      position[3 * sIdx + 1] = pp.y + worldY;
      position[3 * sIdx + 2] = pp.r * startSin;
      position[3 * eIdx + 0] = pp.r * endCos;
      position[3 * eIdx + 1] = pp.y + worldY;
      position[3 * eIdx + 2] = pp.r * endSin;
      // Cap normals: perpendicular to the half-plane = ±(-sin, 0, cos).
      normal[3 * sIdx + 0] = startSin;
      normal[3 * sIdx + 1] = 0;
      normal[3 * sIdx + 2] = -startCos;
      normal[3 * eIdx + 0] = -endSin;
      normal[3 * eIdx + 1] = 0;
      normal[3 * eIdx + 2] = endCos;
      uv[2 * sIdx + 0] = pp.r;
      uv[2 * sIdx + 1] = pp.y;
      uv[2 * eIdx + 0] = pp.r;
      uv[2 * eIdx + 1] = pp.y;
    }
  }

  // Indices.
  const sideIndexCount = (N - 1) * segments * 6;
  const capIndexCount = isFull ? 0 : 2 * (N - 1) * 3;
  const totalIndices = sideIndexCount + capIndexCount;
  const useUint16 = totalVerts < 65536;
  const index = useUint16 ? new Uint16Array(totalIndices) : new Uint32Array(totalIndices);

  let cursor = 0;
  for (let s = 0; s < segments; s++) {
    const r0 = s;
    const r1 = isFull ? (s + 1) % ringCount : s + 1;
    for (let p = 0; p < N - 1; p++) {
      const a = r0 * N + p;
      const b = r0 * N + (p + 1);
      const c = r1 * N + (p + 1);
      const d = r1 * N + p;
      index[cursor++] = a;
      index[cursor++] = b;
      index[cursor++] = c;
      index[cursor++] = a;
      index[cursor++] = c;
      index[cursor++] = d;
    }
  }
  if (!isFull) {
    const capStartBase = sideVerts;
    const capEndBase = sideVerts + N;
    for (let p = 0; p < N - 1; p++) {
      // Start cap (faces -sweep direction).
      index[cursor++] = capStartBase;
      index[cursor++] = capStartBase + p + 1;
      index[cursor++] = capStartBase + p;
      // End cap.
      index[cursor++] = capEndBase;
      index[cursor++] = capEndBase + p;
      index[cursor++] = capEndBase + p + 1;
    }
  }

  // Bounds.
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
    hash: composeRevolveHash(profile, segments, start, end, worldY, material),
  };
  return Object.freeze(descriptor);
};

export function composeRevolveHash(
  profile: readonly RevolveProfilePoint[],
  segments: number,
  start: number,
  end: number,
  worldY: number,
  material: MaterialKey,
): string {
  const verts = profile.map((p) => `${p.r.toFixed(6)},${p.y.toFixed(6)}`).join('|');
  return `${HASH_SCHEMA_VERSION}|s=${segments}|a=${start.toFixed(6)}|b=${end.toFixed(6)}|y=${worldY.toFixed(6)}|m=${material}|v=${verts}`;
}

function profileTangent(profile: readonly RevolveProfilePoint[], i: number): {
  readonly dr: number; readonly dy: number;
} {
  const prev = profile[Math.max(0, i - 1)]!;
  const next = profile[Math.min(profile.length - 1, i + 1)]!;
  return { dr: next.r - prev.r, dy: next.y - prev.y };
}
