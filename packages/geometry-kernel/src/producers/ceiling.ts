// produceCeiling — pure-TS ceiling geometry producer (S14-T8).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14.
// Ceiling = a horizontal slab-like element bounded by a planar polygon
// in the XZ plane at world Y = `worldY + ceilingHeight - thickness/2`
// (i.e. the SLAB sits at the top; the bottom face is what occupants see).
// Geometry: top + bottom + edge skirts.  Triangulation uses the same
// fan-around-centroid scheme as `produceSlab` for convex / mildly
// concave boundaries (full ear-clipping deferred to S15+, see plugin
// README).
//
// Producer signature follows ADR-009: `(dto, joinData, worldY)`.

import type { Ceiling as CeilingData } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { asMaterialKey, type MaterialKey } from '../types/MaterialKey.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import { polygonSignedAreaOrdinates } from '../pure/polygonOffset.js';
import { triangulateRingOrdinates } from '../pure/triangulatePolygon.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import { composeCeilingGeometryHash } from './_internal/ceiling/composeCeilingGeometryHash.js';

export type CeilingProducer = (
  ceiling: Readonly<CeilingData>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

function composeCeilingMaterialKey(c: CeilingData, slot: 'top' | 'bottom' | 'edge'): MaterialKey {
  return asMaterialKey(`ceiling|${c.materialId ?? 'default'}|${c.materialColor ?? ''}|${slot}`);
}

interface Pt2 { readonly x: number; readonly z: number }

// §C73-AREA-CANONICAL — delegates to the kernel's ONE shoelace accumulation
// (bit-identical arithmetic; winding stays the sign of the same computation).
function signedArea(pts: readonly Pt2[]): number {
  return polygonSignedAreaOrdinates(pts.length, (i) => pts[i]!.x, (i) => pts[i]!.z);
}

export const produceCeiling: CeilingProducer = (ceiling, _joinData, worldY) => {
  if (ceiling.boundary.length < 3) {
    throw new DescriptorInvariantError(
      `[produceCeiling] boundary requires ≥3 points; got ${ceiling.boundary.length}`,
    );
  }
  if (ceiling.thickness >= ceiling.ceilingHeight) {
    throw new DescriptorInvariantError(
      `[produceCeiling] thickness (${ceiling.thickness}) must be < ceilingHeight (${ceiling.ceilingHeight})`,
    );
  }

  const pts: Pt2[] = ceiling.boundary.map((p): Pt2 => ({ x: p.x, z: p.z }));
  // Force CCW (signed area > 0 in our XZ → +Y convention).
  const ccw = signedArea(pts) >= 0 ? pts : [...pts].reverse();

  const topY = worldY + ceiling.ceilingHeight;
  const bottomY = topY - ceiling.thickness;

  const topKey = composeCeilingMaterialKey(ceiling, 'top');
  const bottomKey = composeCeilingMaterialKey(ceiling, 'bottom');
  const edgeKey = composeCeilingMaterialKey(ceiling, 'edge');

  const groups: RawGroup[] = [];

  // §C73-TRIANGULATION-CANONICAL (GE-12) — top/bottom faces triangulate via
  // THE canonical body instead of the old centroid fan, which was silently
  // wrong on concave boundaries (an L-shaped ceiling's fill leaked outside
  // its own boundary; this file's header used to defer "full ear-clipping"
  // to S15+). §3.7: UVs are now planar world-XZ for every cap vertex — the
  // fan's centroid vertex carried a magic (0.5, 0.5) UV that disappears with
  // the centroid vertex itself; slab already ships planar-XZ cap UVs.
  const capTris = triangulateRingOrdinates(
    ccw.length,
    (i) => ccw[i]!.x,
    (i) => ccw[i]!.z,
  );

  // Top face (CCW seen from +Y → normal +Y).
  {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (let t = 0; t < capTris.length; t += 3) {
      const a = ccw[capTris[t]!]!;
      const b = ccw[capTris[t + 1]!]!;
      const c = ccw[capTris[t + 2]!]!;
      positions.push(a.x, topY, a.z, b.x, topY, b.z, c.x, topY, c.z);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      uvs.push(a.x, a.z, b.x, b.z, c.x, c.z);
    }
    groups.push({ geometry: { positions, normals, uvs }, materialKey: topKey });
  }

  // Bottom face: REVERSED winding so normal = -Y.
  {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (let t = 0; t < capTris.length; t += 3) {
      const a = ccw[capTris[t]!]!;
      const b = ccw[capTris[t + 2]!]!;
      const c = ccw[capTris[t + 1]!]!;
      positions.push(a.x, bottomY, a.z, b.x, bottomY, b.z, c.x, bottomY, c.z);
      normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
      uvs.push(a.x, a.z, b.x, b.z, c.x, c.z);
    }
    groups.push({ geometry: { positions, normals, uvs }, materialKey: bottomKey });
  }

  // Edge skirts: one quad per boundary segment, outward-pointing normal.
  {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i < ccw.length; i++) {
      const a = ccw[i]!;
      const b = ccw[(i + 1) % ccw.length]!;
      // Edge tangent in XZ.
      const tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-9) continue;
      // Outward normal (rotate tangent +90° CW about Y for CCW polygon → outward).
      const nx = tz / tl;
      const nz = -tx / tl;
      // Quad corners: a-bottom, b-bottom, b-top, a-top
      const aB = [a.x, bottomY, a.z];
      const bB = [b.x, bottomY, b.z];
      const bT = [b.x, topY, b.z];
      const aT = [a.x, topY, a.z];
      // tri 1: aB → bB → bT
      positions.push(aB[0]!, aB[1]!, aB[2]!, bB[0]!, bB[1]!, bB[2]!, bT[0]!, bT[1]!, bT[2]!);
      normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
      uvs.push(0, 0, 1, 0, 1, 1);
      // tri 2: aB → bT → aT
      positions.push(aB[0]!, aB[1]!, aB[2]!, bT[0]!, bT[1]!, bT[2]!, aT[0]!, aT[1]!, aT[2]!);
      normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
      uvs.push(0, 0, 1, 1, 0, 1);
    }
    groups.push({ geometry: { positions, normals, uvs }, materialKey: edgeKey });
  }

  const concat = concatRaw(groups);
  return serializeDescriptor(concat, composeCeilingGeometryHash(ceiling));
};
