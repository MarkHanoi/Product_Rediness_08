// produceGrid — pure-TS structural-grid producer (S12).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 line 1410.
// Grid is a 2D layout aid: a collection of named axes drawn at a
// chosen worldY plane.  It is rendered as a thin ribbon per line so
// the result can be displayed as a regular `THREE.Mesh` (no
// `LineSegments` runtime branch in the committer host).

import type { Grid as GridData } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { asMaterialKey, type MaterialKey } from '../types/MaterialKey.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';

export type GridProducer = (
  grid: Readonly<GridData>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

/** Half-width of each grid ribbon in metres (visual only). */
const RIBBON_HALF_WIDTH = 0.02;
const ARC_SEGMENTS = 24;

function composeGridMaterialKey(): MaterialKey {
  return asMaterialKey('grid|||#888888|line');
}

export function composeGridGeometryHash(g: GridData, worldY: number): string {
  const f = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : '_');
  const lines = g.lines
    .map(
      (l) =>
        `${l.id}:${l.label}:${l.kind}:${f(l.start.x)},${f(l.start.y)},${f(l.start.z)}:${f(l.end.x)},${f(l.end.y)},${f(l.end.z)}:${f(l.radius ?? 0)}`,
    )
    .join('|');
  return ['grid:v1', g.id, lines, f(g.rotation), g.levelId, f(worldY)].join('|');
}

interface Vec3 { x: number; y: number; z: number }

function emitRibbon(
  positions: number[],
  normals: number[],
  uvs: number[],
  pts: readonly Vec3[],
  worldY: number,
): void {
  // Ribbon expansion: at every interior vertex extrude perpendicular
  // to the segment direction.  Caps are square.  All in the XZ plane.
  if (pts.length < 2) return;
  const n = pts.length;
  const left: Vec3[] = new Array(n);
  const right: Vec3[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    left[i] = { x: pts[i]!.x + nx * RIBBON_HALF_WIDTH, y: worldY, z: pts[i]!.z + nz * RIBBON_HALF_WIDTH };
    right[i] = { x: pts[i]!.x - nx * RIBBON_HALF_WIDTH, y: worldY, z: pts[i]!.z - nz * RIBBON_HALF_WIDTH };
  }
  for (let i = 0; i < n - 1; i++) {
    const lA = left[i]!, lB = left[i + 1]!;
    const rA = right[i]!, rB = right[i + 1]!;
    // Two triangles, +Y normal.
    positions.push(lA.x, lA.y, lA.z, rA.x, rA.y, rA.z, rB.x, rB.y, rB.z);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(0, 0, 0, 1, 1, 1);
    positions.push(lA.x, lA.y, lA.z, rB.x, rB.y, rB.z, lB.x, lB.y, lB.z);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(0, 0, 1, 1, 1, 0);
  }
}

function rotateXZ(p: Vec3, theta: number): Vec3 {
  if (theta === 0) return p;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: p.x * c - p.z * s, y: p.y, z: p.x * s + p.z * c };
}

function sampleArc(
  start: Vec3,
  end: Vec3,
  radius: number,
): Vec3[] {
  // Build a circular arc through `start` and `end` with the given
  // radius.  Centre = midpoint perpendicular offset such that
  // |centre−start| = radius.  If radius is too small, fall back to
  // straight chord.
  const cx = (start.x + end.x) / 2;
  const cz = (start.z + end.z) / 2;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const half = Math.hypot(dx, dz) / 2;
  if (radius <= half) {
    return [start, end];
  }
  const offset = Math.sqrt(radius * radius - half * half);
  // Perpendicular (always pick the +offset side; arbitrary choice).
  const nx = -dz / (half * 2);
  const nz = dx / (half * 2);
  const cxArc = cx + nx * offset;
  const czArc = cz + nz * offset;

  const a0 = Math.atan2(start.z - czArc, start.x - cxArc);
  let a1 = Math.atan2(end.z - czArc, end.x - cxArc);
  // Take the short arc through +offset side.
  if (a1 < a0) a1 += Math.PI * 2;

  const pts: Vec3[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const a = a0 + (a1 - a0) * t;
    pts.push({
      x: cxArc + Math.cos(a) * radius,
      y: start.y,
      z: czArc + Math.sin(a) * radius,
    });
  }
  return pts;
}

export const produceGrid: GridProducer = (grid, _joinData, worldY) => {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const line of grid.lines) {
    const start = rotateXZ({ x: line.start.x, y: 0, z: line.start.z }, grid.rotation);
    const end = rotateXZ({ x: line.end.x, y: 0, z: line.end.z }, grid.rotation);
    let pts: Vec3[];
    if (line.kind === 'arc' && typeof line.radius === 'number') {
      pts = sampleArc(start, end, line.radius);
    } else {
      pts = [start, end];
    }
    emitRibbon(positions, normals, uvs, pts, worldY);
  }

  // Always emit at least one degenerate triangle so the descriptor is
  // non-empty (committer can detect emptiness via groups[0].count === 0).
  if (positions.length === 0) {
    positions.push(0, worldY, 0, 0, worldY, 0, 0, worldY, 0);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(0, 0, 0, 0, 0, 0);
  }

  const parts: RawGroup[] = [
    {
      geometry: { positions, normals, uvs },
      materialKey: composeGridMaterialKey(),
    },
  ];
  const concat = concatRaw(parts);
  return serializeDescriptor(concat, composeGridGeometryHash(grid, worldY));
};
