// produceSlab — pure-TS slab geometry producer (S12).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 lines
// 1366-1375.  Slab is the structural floor element: an extruded
// horizontal polygon with optional inner hole loops (shafts, voids).
//
// Design (FROZEN by ADR-0010):
//   • THREE-FREE.  Boundary + holes come from the schema as Vec3 DTOs.
//   • Triangulation: outer ring + holes via the embedded earcut.
//   • Output: 3 material slots — top, bottom, and side — so the
//     committer can paint floor finish vs ceiling vs edge differently.
//   • Producer signature follows ADR-009 — `(dto, joinData, worldY)`.
//     Slabs do not currently consume `joinData`; the slot is preserved
//     so the L4 producer registry dispatches uniformly across families.

import type { Slab as SlabData } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { asMaterialKey, type MaterialKey } from '../types/MaterialKey.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import { composeSlabGeometryHash } from './_internal/composeSlabGeometryHash.js';
import { earcut } from './_internal/earcut.js';

export type SlabProducer = (
  slab: Readonly<SlabData>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

const TOP_FALLBACK_COLOR = '#cfcfcf';
const BOTTOM_FALLBACK_COLOR = '#a8a8a8';
const SIDE_FALLBACK_COLOR = '#9a9a9a';

function composeSlabMaterialKey(
  systemTypeId: string,
  materialId: string,
  color: string,
  slot: 'top' | 'bottom' | 'side',
): MaterialKey {
  return asMaterialKey(`slab|${systemTypeId}|${materialId}|${color}|${slot}`);
}

interface Pt2 { readonly x: number; readonly z: number }

/** Compute the signed XZ area (Y-up convention).  Positive = CCW from above. */
function signedArea(loop: readonly Pt2[]): number {
  let sum = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

function ensureCCW(loop: readonly Pt2[]): Pt2[] {
  return signedArea(loop) >= 0 ? [...loop] : [...loop].reverse();
}

function ensureCW(loop: readonly Pt2[]): Pt2[] {
  return signedArea(loop) <= 0 ? [...loop] : [...loop].reverse();
}

/** Triangulate the polygon (with holes) — returns triangle index triples. */
function triangulate(outer: readonly Pt2[], holes: readonly (readonly Pt2[])[]): {
  vertices: Pt2[];
  triangles: number[];
} {
  const vertices: Pt2[] = [...outer];
  const flat: number[] = [];
  for (const v of outer) flat.push(v.x, v.z);
  const holeIndices: number[] = [];
  for (const hole of holes) {
    holeIndices.push(vertices.length);
    for (const v of hole) {
      vertices.push(v);
      flat.push(v.x, v.z);
    }
  }
  const triangles = earcut(flat, holeIndices);
  return { vertices, triangles };
}

export const produceSlab: SlabProducer = (slab, _joinData, worldY) => {
  if (slab.boundary.length < 3) {
    throw new DescriptorInvariantError(
      `[produceSlab] slab.boundary requires ≥3 points; got ${slab.boundary.length}`,
    );
  }

  const outer: Pt2[] = ensureCCW(
    slab.boundary.map((p) => ({ x: p.x, z: p.z })),
  );
  // Holes are CW relative to outer (earcut convention).
  const holes: Pt2[][] = slab.holes
    .filter((h) => h.length >= 3)
    .map((h) => ensureCW(h.map((p) => ({ x: p.x, z: p.z }))));

  const yTop = worldY + slab.baseOffset;
  const yBot = yTop - slab.thickness;

  const systemTypeId = slab.systemTypeId ?? '';
  const materialId = slab.materialId ?? '';
  const color = slab.materialColor ?? TOP_FALLBACK_COLOR;
  const topKey = composeSlabMaterialKey(systemTypeId, materialId, color, 'top');
  const bottomKey = composeSlabMaterialKey(systemTypeId, materialId, slab.materialColor ?? BOTTOM_FALLBACK_COLOR, 'bottom');
  const sideKey = composeSlabMaterialKey(systemTypeId, materialId, slab.materialColor ?? SIDE_FALLBACK_COLOR, 'side');

  const tri = triangulate(outer, holes);

  // ── Top face ────────────────────────────────────────────────────────
  const topPositions: number[] = [];
  const topNormals: number[] = [];
  const topUvs: number[] = [];
  for (let i = 0; i < tri.triangles.length; i += 3) {
    const ia = tri.triangles[i]!;
    const ib = tri.triangles[i + 1]!;
    const ic = tri.triangles[i + 2]!;
    const a = tri.vertices[ia]!;
    const b = tri.vertices[ib]!;
    const c = tri.vertices[ic]!;
    // CCW from above ⇒ +Y normal.
    topPositions.push(a.x, yTop, a.z, b.x, yTop, b.z, c.x, yTop, c.z);
    topNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    topUvs.push(a.x, a.z, b.x, b.z, c.x, c.z);
  }

  // ── Bottom face (mirror winding so normal points -Y) ────────────────
  const botPositions: number[] = [];
  const botNormals: number[] = [];
  const botUvs: number[] = [];
  for (let i = 0; i < tri.triangles.length; i += 3) {
    const ia = tri.triangles[i]!;
    const ib = tri.triangles[i + 2]!;
    const ic = tri.triangles[i + 1]!;
    const a = tri.vertices[ia]!;
    const b = tri.vertices[ib]!;
    const c = tri.vertices[ic]!;
    botPositions.push(a.x, yBot, a.z, b.x, yBot, b.z, c.x, yBot, c.z);
    botNormals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
    botUvs.push(a.x, a.z, b.x, b.z, c.x, c.z);
  }

  // ── Side faces — outer + holes (extrude every loop edge) ────────────
  const sidePositions: number[] = [];
  const sideNormals: number[] = [];
  const sideUvs: number[] = [];

  function emitSideStrip(loop: readonly Pt2[], outwardSign: number): void {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % n]!;
      // Edge direction along XZ.  Outward normal = perpendicular,
      // sign chosen by `outwardSign` (outer loop = +1, hole = -1).
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len = Math.hypot(ex, ez) || 1;
      const nx = (-ez / len) * outwardSign;
      const nz = (ex / len) * outwardSign;

      // Two triangles forming the side quad.  Winding: viewed from
      // outside, CCW is (a-bot, b-bot, b-top, a-top).
      const aBot: [number, number, number] = [a.x, yBot, a.z];
      const bBot: [number, number, number] = [b.x, yBot, b.z];
      const aTop: [number, number, number] = [a.x, yTop, a.z];
      const bTop: [number, number, number] = [b.x, yTop, b.z];

      // tri 1: aBot, bBot, bTop
      sidePositions.push(...aBot, ...bBot, ...bTop);
      sideNormals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
      sideUvs.push(0, 0, len, 0, len, slab.thickness);
      // tri 2: aBot, bTop, aTop
      sidePositions.push(...aBot, ...bTop, ...aTop);
      sideNormals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
      sideUvs.push(0, 0, len, slab.thickness, 0, slab.thickness);
    }
  }

  emitSideStrip(outer, 1);
  for (const hole of holes) emitSideStrip(hole, -1);

  const parts: RawGroup[] = [
    { geometry: { positions: topPositions, normals: topNormals, uvs: topUvs }, materialKey: topKey },
    { geometry: { positions: botPositions, normals: botNormals, uvs: botUvs }, materialKey: bottomKey },
    { geometry: { positions: sidePositions, normals: sideNormals, uvs: sideUvs }, materialKey: sideKey },
  ];

  const concat = concatRaw(parts);
  const hash = composeSlabGeometryHash(slab, worldY);
  return serializeDescriptor(concat, hash);
};
