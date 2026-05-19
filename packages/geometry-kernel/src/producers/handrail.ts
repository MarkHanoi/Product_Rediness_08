// produceHandrail — extrude a profile (round / square / flat) along
// the handrail path (S14-T5).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14.
// The path is treated as a polyline in world coordinates; each
// segment is extruded as a tube with N profile points (N depends on
// shape).  The path Y is offset by `height` (rail sits ABOVE its
// host; the path itself encodes the host edge).
//
// Producer signature follows ADR-009: `(dto, joinData, worldY)`.

import type { Handrail as HandrailData } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { asMaterialKey, type MaterialKey } from '../types/MaterialKey.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import { composeHandrailGeometryHash } from './_internal/handrail/composeHandrailGeometryHash.js';

export type HandrailProducer = (
  handrail: Readonly<HandrailData>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

const ROUND_SEGMENTS = 8;

interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

/** Build the cross-section profile in the rail's LOCAL plane (X right,
 *  Y up).  Returns `[x, y]` pairs.  Profile is centred on origin. */
function profilePoints(shape: HandrailData['shape'], diameter: number): readonly [number, number][] {
  const r = diameter / 2;
  if (shape === 'round') {
    const out: [number, number][] = [];
    for (let i = 0; i < ROUND_SEGMENTS; i++) {
      const t = (i / ROUND_SEGMENTS) * Math.PI * 2;
      out.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
    return out;
  }
  if (shape === 'square') {
    return [[-r, -r], [r, -r], [r, r], [-r, r]];
  }
  // flat: thin horizontal bar (wider than tall)
  const w = r * 1.5;
  const t = r * 0.4;
  return [[-w, -t], [w, -t], [w, t], [-w, t]];
}

/** Length of a 3D vector. */
function len(v: Vec3): number { return Math.hypot(v.x, v.y, v.z); }
/** Normalise (returns zero-vector when input is zero). */
function norm(v: Vec3): Vec3 {
  const L = len(v);
  if (L < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / L, y: v.y / L, z: v.z / L };
}
/** Cross product. */
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Compute a stable per-vertex frame `(tangent, side, up)` for a path
 * sample.  `up` defaults to world Y; if the tangent is parallel to Y,
 * we fall back to world Z so the side vector is always non-zero.
 */
function frameAt(tangent: Vec3): { side: Vec3; up: Vec3 } {
  let world: Vec3 = { x: 0, y: 1, z: 0 };
  if (Math.abs(tangent.y) > 0.9999) world = { x: 0, y: 0, z: 1 };
  const side = norm(cross(tangent, world));
  const up = norm(cross(side, tangent));
  return { side, up };
}

export const produceHandrail: HandrailProducer = (handrail, _joinData, worldY) => {
  if (handrail.path.length < 2) {
    throw new DescriptorInvariantError(
      `[produceHandrail] path requires ≥2 points; got ${handrail.path.length}`,
    );
  }

  const materialKey: MaterialKey = asMaterialKey(`handrail|${handrail.materialId ?? 'default'}|rail`);
  const profile = profilePoints(handrail.shape, handrail.diameter);
  const N = profile.length;

  // Lift the path by handrail.height (rail rides ABOVE the host edge),
  // and apply the worldY level offset.
  const lifted: Vec3[] = handrail.path.map((p) => ({
    x: p.x, y: p.y + handrail.height + worldY, z: p.z,
  }));

  // Build per-sample frames.  For sharp corners we use the average of
  // incoming + outgoing tangents.
  const tangents: Vec3[] = [];
  for (let i = 0; i < lifted.length; i++) {
    let t: Vec3;
    if (i === 0) {
      const a = lifted[0]!, b = lifted[1]!;
      t = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    } else if (i === lifted.length - 1) {
      const a = lifted[i - 1]!, b = lifted[i]!;
      t = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    } else {
      const a = lifted[i - 1]!, b = lifted[i]!, c = lifted[i + 1]!;
      const t1 = norm({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
      const t2 = norm({ x: c.x - b.x, y: c.y - b.y, z: c.z - b.z });
      t = { x: t1.x + t2.x, y: t1.y + t2.y, z: t1.z + t2.z };
    }
    tangents.push(norm(t));
  }

  // Generate ring positions per sample.
  const rings: Vec3[][] = lifted.map((p, i) => {
    const { side, up } = frameAt(tangents[i]!);
    return profile.map(([px, py]) => ({
      x: p.x + side.x * px + up.x * py,
      y: p.y + side.y * px + up.y * py,
      z: p.z + side.z * px + up.z * py,
    }));
  });

  // Stitch quads between consecutive rings.  Non-indexed (each tri
  // gets its own verts so the serialiser stores them inline).
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i]!, r1 = rings[i + 1]!;
    for (let j = 0; j < N; j++) {
      const a = r0[j]!;
      const b = r0[(j + 1) % N]!;
      const c = r1[(j + 1) % N]!;
      const d = r1[j]!;
      // Quad normal — average of (b-a)×(d-a) and (c-b)×(d-b).
      const n1 = norm(cross(
        { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
        { x: d.x - a.x, y: d.y - a.y, z: d.z - a.z },
      ));
      // tri 1: a b c
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      normals.push(n1.x, n1.y, n1.z, n1.x, n1.y, n1.z, n1.x, n1.y, n1.z);
      uvs.push(0, 0, 1, 0, 1, 1);
      // tri 2: a c d
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      normals.push(n1.x, n1.y, n1.z, n1.x, n1.y, n1.z, n1.x, n1.y, n1.z);
      uvs.push(0, 0, 1, 1, 0, 1);
    }
  }

  const group: RawGroup = {
    geometry: { positions, normals, uvs },
    materialKey,
  };

  const concat = concatRaw([group]);
  return serializeDescriptor(concat, composeHandrailGeometryHash(handrail));
};
