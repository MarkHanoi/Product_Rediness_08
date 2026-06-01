// produceRoom — pure-TS room geometry producer (S25-T4).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S25.
// Algorithm: topological half-edge graph flood-fill from a user-supplied
// seed point.  Decision recorded in
// `code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md`.
//
// Producer signature: `(room, ctx, worldY)` — deviates from ADR-009's
// frozen `(dto, joinData, worldY)` because room is the first family
// that must read sibling element state.  The deviation is bounded to
// this single producer; the second positional argument is a
// structural type the rest of the kernel does not depend on.
//
// THREE-FREE.  All maths uses plain ECMAScript (`Math.hypot`, `+`, etc.)
// and a centroid-fan triangulation (rooms are mostly convex; full
// ear-clipping lands with the drawing-primitives roll-up at S30).

import type { Room, Wall } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { asMaterialKey, type MaterialKey } from '../types/MaterialKey.js';
import { DescriptorInvariantError } from '../types/assertValidDescriptor.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import { composeRoomGeometryHash } from './_internal/composeRoomGeometryHash.js';

const FILL_FALLBACK_COLOR = '#b3d8ff';
const NODE_EPSILON_DEFAULT = 1e-3; // 1 mm — wall endpoint snap

/** Read-only view of every wall on the room's level.  The room
 *  producer does not mutate any wall and never writes back. */
export interface RoomBoundaryContext {
  readonly walls: readonly Readonly<Wall>[];
  /** Snap tolerance for collapsing near-coincident graph nodes (m).
   *  Defaults to 1 mm — matches PRYZM 1's `RoomDetectionService.ts`
   *  `EPSILON_NODE` constant. */
  readonly nodeEpsilon?: number;
}

export type RoomProducer = (
  room: Readonly<Room>,
  ctx: Readonly<RoomBoundaryContext>,
  worldY: number,
) => BufferGeometryDescriptor;

/** Analytic representation that the producer also exposes for
 *  consumers that don't need the buffer geometry (schedules,
 *  IFC export, AI reasoning per SPEC-01 §2). */
export interface RoomAnalytic {
  /** Outer boundary polygon (XZ plane), CCW from above. */
  readonly polygon: readonly { readonly x: number; readonly z: number }[];
  /** m². */
  readonly area: number;
  /** m. */
  readonly perimeter: number;
  /** Centroid of the polygon, used by the room label committer. */
  readonly centroid: { readonly x: number; readonly z: number };
  /** Wall ids whose centerline edge contributed to the boundary. */
  readonly boundingWallIds: readonly string[];
}

// ──────────────────────────────────────────────────────────────────
// 1. Half-edge graph from wall centerlines
// ──────────────────────────────────────────────────────────────────

interface Node2 {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** Outgoing half-edges sorted CCW by polar angle.  Filled at the
   *  end of `buildGraph` once every wall has been registered. */
  readonly out: HalfEdge[];
}

interface HalfEdge {
  /** Stable index for hashing the visited-set during face walk. */
  readonly id: number;
  readonly from: Node2;
  readonly to: Node2;
  /** The opposite half-edge (always defined; we add both at once). */
  twin: HalfEdge | undefined;
  /** Pre-computed polar angle from `from` to `to` in (-π, π]. */
  readonly angle: number;
  /** Source wall id — written into the analytic boundingWallIds. */
  readonly wallId: string;
}

interface Graph {
  readonly nodes: readonly Node2[];
  readonly halfEdges: readonly HalfEdge[];
}

function nearlyEqual(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

function findOrAddNode(
  nodes: Node2[],
  x: number,
  z: number,
  eps: number,
): Node2 {
  for (const n of nodes) {
    if (nearlyEqual(n.x, x, eps) && nearlyEqual(n.z, z, eps)) return n;
  }
  const fresh: Node2 = { id: nodes.length, x, z, out: [] };
  nodes.push(fresh);
  return fresh;
}

function buildGraph(
  walls: readonly Readonly<Wall>[],
  eps: number,
): Graph {
  const nodes: Node2[] = [];
  const edges: HalfEdge[] = [];

  let nextEdgeId = 0;
  for (const w of walls) {
    const [a, b] = w.baseLine;
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.hypot(dx, dz) < eps) continue;

    const na = findOrAddNode(nodes, a.x, a.z, eps);
    const nb = findOrAddNode(nodes, b.x, b.z, eps);

    const fwd: HalfEdge = {
      id: nextEdgeId++,
      from: na,
      to: nb,
      twin: undefined,
      angle: Math.atan2(nb.z - na.z, nb.x - na.x),
      wallId: w.id,
    };
    const rev: HalfEdge = {
      id: nextEdgeId++,
      from: nb,
      to: na,
      twin: fwd,
      angle: Math.atan2(na.z - nb.z, na.x - nb.x),
      wallId: w.id,
    };
    fwd.twin = rev;
    na.out.push(fwd);
    nb.out.push(rev);
    edges.push(fwd, rev);
  }

  // Sort each node's outgoing edges CCW by angle so the face walk
  // can pick the "next CCW" edge in O(1).
  for (const n of nodes) {
    n.out.sort((p, q) => p.angle - q.angle);
  }

  return { nodes, halfEdges: edges };
}

// ──────────────────────────────────────────────────────────────────
// 2. Face extraction
// ──────────────────────────────────────────────────────────────────

interface Face {
  readonly halfEdges: readonly HalfEdge[];
  /** Polygon vertices in walk order. */
  readonly polygon: readonly { readonly x: number; readonly z: number }[];
  readonly signedArea: number;
}

/** Pick the next half-edge after arriving at `e.to` along `e`.
 *  Standard half-edge face walk: among the outgoing edges of `e.to`,
 *  pick the one immediately CW from the reverse of `e` in the
 *  CCW-sorted out list — that yields the smallest left turn, which
 *  traces the bounded face on the correct side of the edge. */
function nextFaceEdge(e: HalfEdge): HalfEdge | undefined {
  const v = e.to;
  const twin = e.twin;
  if (!twin) return undefined;
  const idx = v.out.indexOf(twin);
  if (idx === -1) return undefined;
  const nextIdx = (idx - 1 + v.out.length) % v.out.length;
  return v.out[nextIdx];
}

function signedAreaOf(loop: readonly { x: number; z: number }[]): number {
  let sum = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

function extractFaces(graph: Graph): Face[] {
  const visited = new Set<number>();
  const faces: Face[] = [];

  for (const start of graph.halfEdges) {
    if (visited.has(start.id)) continue;
    const halfEdges: HalfEdge[] = [];
    const polygon: { x: number; z: number }[] = [];
    let curr: HalfEdge | undefined = start;
    let safety = 0;
    while (curr !== undefined) {
      if (visited.has(curr.id)) break;
      visited.add(curr.id);
      halfEdges.push(curr);
      polygon.push({ x: curr.from.x, z: curr.from.z });
      curr = nextFaceEdge(curr);
      if (curr === start) break;
      if (++safety > 100_000) {
        throw new DescriptorInvariantError(
          `[produceRoom] face walk exceeded ${safety} steps; half-edge topology is malformed`,
        );
      }
    }
    if (polygon.length < 3) continue;
    faces.push({
      halfEdges,
      polygon,
      signedArea: signedAreaOf(polygon),
    });
  }

  return faces;
}

// ──────────────────────────────────────────────────────────────────
// 3. Point-in-polygon (ray casting in XZ)
// ──────────────────────────────────────────────────────────────────

function pointInPolygon(
  px: number,
  pz: number,
  poly: readonly { x: number; z: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const dz = b.z - a.z;
    if (dz === 0) continue; // horizontal edge — does not contribute
    const intersects =
      a.z > pz !== b.z > pz &&
      px < ((b.x - a.x) * (pz - a.z)) / dz + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

// ──────────────────────────────────────────────────────────────────
// 4. Public producer
// ──────────────────────────────────────────────────────────────────

interface Pt2 {
  readonly x: number;
  readonly z: number;
}

function centroidOf(poly: readonly Pt2[]): Pt2 {
  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p.x;
    cz += p.z;
  }
  return { x: cx / poly.length, z: cz / poly.length };
}

function ensureCCW(poly: readonly Pt2[]): readonly Pt2[] {
  return signedAreaOf(poly) >= 0 ? poly : [...poly].reverse();
}

/** Resolve the polygon for a room (sketched mode → schema polygon;
 *  wallBound mode → half-edge flood-fill).  Pure helper — the
 *  producer wraps it to bake a `BufferGeometryDescriptor`; the
 *  handler / committer call it directly to update `room.area`,
 *  `room.boundingElementIds`, etc. */
export function analyseRoom(
  room: Readonly<Room>,
  ctx: Readonly<RoomBoundaryContext>,
): RoomAnalytic {
  if (room.boundaryMode === 'sketched') {
    const polygon = ensureCCW(room.boundary.map((p) => ({ x: p.x, z: p.z })));
    return {
      polygon,
      area: Math.abs(signedAreaOf(polygon)),
      perimeter: perimeterOf(polygon),
      centroid: centroidOf(polygon),
      boundingWallIds: [],
    };
  }

  const seed = room.seedPoint;
  if (seed === null) {
    throw new DescriptorInvariantError(
      `[produceRoom] room ${room.id} has boundaryMode='wallBound' but no seedPoint; cannot flood-fill`,
    );
  }

  const walls = ctx.walls.filter((w) => w.levelId === room.levelId);
  if (walls.length === 0) {
    throw new DescriptorInvariantError(
      `[produceRoom] room ${room.id} (level ${room.levelId}) has no walls on its level; boundary is undefined`,
    );
  }

  const eps = ctx.nodeEpsilon ?? NODE_EPSILON_DEFAULT;
  const graph = buildGraph(walls, eps);
  const faces = extractFaces(graph);

  let chosen: Face | undefined;
  for (const f of faces) {
    if (f.signedArea <= 0) continue;
    if (pointInPolygon(seed.x, seed.z, f.polygon)) {
      chosen = f;
      break;
    }
  }

  if (!chosen) {
    throw new DescriptorInvariantError(
      `[produceRoom] room ${room.id}: seed point (${seed.x.toFixed(3)}, ${seed.z.toFixed(3)}) is not enclosed by any wall face on level ${room.levelId}; the room is unenclosed`,
    );
  }

  const polygon = ensureCCW(chosen.polygon);

  const wallIds: string[] = [];
  const seenWallIds = new Set<string>();
  for (const he of chosen.halfEdges) {
    if (seenWallIds.has(he.wallId)) continue;
    seenWallIds.add(he.wallId);
    wallIds.push(he.wallId);
  }

  return {
    polygon,
    area: Math.abs(signedAreaOf(polygon)),
    perimeter: perimeterOf(polygon),
    centroid: centroidOf(polygon),
    boundingWallIds: wallIds,
  };
}

function perimeterOf(poly: readonly Pt2[]): number {
  let p = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    p += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return p;
}

export const produceRoom: RoomProducer = (room, ctx, worldY) => {
  const analytic = analyseRoom(room, ctx);
  return bakeDescriptor(room, analytic, worldY);
};

function bakeDescriptor(
  room: Readonly<Room>,
  analytic: RoomAnalytic,
  worldY: number,
): BufferGeometryDescriptor {
  const polygon = analytic.polygon;
  if (polygon.length < 3) {
    throw new DescriptorInvariantError(
      `[produceRoom] resolved polygon has fewer than 3 vertices (${polygon.length}); cannot build a face`,
    );
  }
  if (analytic.area < 1e-9) {
    throw new DescriptorInvariantError(
      `[produceRoom] room ${room.id} resolved polygon has degenerate area (${analytic.area.toExponential(3)} m²)`,
    );
  }

  // Lift the floor-fill mesh slightly above the floor so it does not
  // z-fight with the slab.  Phase 2A v1 uses a 1 mm offset; the
  // committer additionally bumps `renderOrder = -1`.
  const fillY = worldY + (room.heightOffset ?? 0) + 0.001;
  const centroid = analytic.centroid;

  // Centroid fan, NON-INDEXED.  Each triangle has its own three
  // vertices so face-aligned hard-edge normals don't get shared.
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let i = 0, n = polygon.length; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    // Triangle (centroid, a, b).
    positions.push(
      centroid.x, fillY, centroid.z,
      a.x,        fillY, a.z,
      b.x,        fillY, b.z,
    );
    // All three vertices share the up-facing normal.
    normals.push(
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    );
    uvs.push(
      centroid.x, centroid.z,
      a.x,        a.z,
      b.x,        b.z,
    );
  }

  const materialKey: MaterialKey = asMaterialKey(
    `room|${room.materialId ?? 'default'}|${room.materialColor ?? FILL_FALLBACK_COLOR}|fill`,
  );

  const raw: RawGroup = {
    geometry: { positions, normals, uvs },
    materialKey,
  };

  const concat = concatRaw([raw]);
  const hash = composeRoomGeometryHash({
    id: room.id,
    levelId: room.levelId,
    boundaryMode: room.boundaryMode,
    seedPoint: room.seedPoint,
    polygon,
    materialKey,
    fillY,
    boundingWallIds: analytic.boundingWallIds,
  });

  return serializeDescriptor(concat, hash);
}
