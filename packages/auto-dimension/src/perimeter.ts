// @pryzm/auto-dimension — Stage 1: connectivity graph, perimeter extraction, runs.
//
// Reuse map (§SPIKE §4):
//   • endpoint clustering  → pure port of JunctionResolverV2.clusterEndpoints (:315).
//   • perimeter outer face → pure port of PlanarTopologyEngine.computeTopology (:98)
//     outer-face half-edge trace (angular sort + next-clockwise walk + most-negative
//     signed-area face). Ported (not imported) because room-topology's barrel pulls
//     THREE — see geometry.ts header. Same algorithm, pure `{x,z}`.
//   • run splitting        → collinear grouping ALONG the ordered perimeter ring
//     (§SPIKE §6 collinear-runs), split at direction changes (15° gate).

import type { AutoDimWall } from './types.js';
import type { DimNode, WallRun, TickRef } from './types.js';
import {
  type PtXZ,
  sub, len, unit, dot, canonicalDir, station,
} from './geometry.js';

const COLLINEAR_COS = Math.cos((15 * Math.PI) / 180); // 15° run gate (§SPIKE §6)

interface EndpointRef {
  readonly wallId: string;
  readonly isStart: boolean;
  readonly point: PtXZ;
}

export interface DimGraph {
  readonly nodes: readonly DimNode[];
  /** wallId → { startNodeId, endNodeId }. Degenerate walls (same node) excluded. */
  readonly wallNodes: ReadonlyMap<string, { startNodeId: string; endNodeId: string }>;
}

/** Greedy endpoint clustering (pure port of clusterEndpoints, order-stable). */
function clusterEndpoints(walls: readonly AutoDimWall[], eps: number): EndpointRef[][] {
  const refs: EndpointRef[] = [];
  for (const w of walls) {
    refs.push({ wallId: w.id, isStart: true, point: w.a });
    refs.push({ wallId: w.id, isStart: false, point: w.b });
  }
  const used = new Array<boolean>(refs.length).fill(false);
  const clusters: EndpointRef[][] = [];
  for (let i = 0; i < refs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const cluster: EndpointRef[] = [refs[i]!];
    for (let j = i + 1; j < refs.length; j++) {
      if (used[j]) continue;
      if (len(sub(refs[i]!.point, refs[j]!.point)) <= eps) {
        used[j] = true;
        cluster.push(refs[j]!);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function centroid(pts: readonly PtXZ[]): PtXZ {
  let sx = 0, sz = 0;
  for (const p of pts) { sx += p.x; sz += p.z; }
  const n = pts.length || 1;
  return { x: sx / n, z: sz / n };
}

/**
 * Build the connectivity graph: cluster endpoints into nodes, map each wall to
 * its {startNode,endNode}. Node ids are assigned in (x,z) sorted order so the
 * graph is byte-stable regardless of wall input order (§SPIKE §14.3).
 */
export function buildGraph(walls: readonly AutoDimWall[], snapEps: number): DimGraph {
  const clusters = clusterEndpoints(walls, snapEps);

  // Provisional node per cluster with its centroid + representative ref.
  interface Prov { point: PtXZ; members: EndpointRef[] }
  const prov: Prov[] = clusters.map((c) => ({
    point: centroid(c.map((r) => r.point)),
    members: c,
  }));

  // Deterministic node ids: sort clusters by (x, z), tiebreak by min member wall id.
  const order = prov
    .map((p, i) => ({ i, p }))
    .sort((A, B) => {
      if (A.p.point.x !== B.p.point.x) return A.p.point.x - B.p.point.x;
      if (A.p.point.z !== B.p.point.z) return A.p.point.z - B.p.point.z;
      const aId = [...A.p.members].map((m) => m.wallId).sort()[0] ?? '';
      const bId = [...B.p.members].map((m) => m.wallId).sort()[0] ?? '';
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });

  const nodes: DimNode[] = [];
  const provIdxToNodeId = new Map<number, string>();
  order.forEach((entry, rank) => {
    const nodeId = `n${rank}`;
    provIdxToNodeId.set(entry.i, nodeId);
    // Representative ref = the lowest-id member's endpoint anchor (stable corner ref).
    const rep = [...entry.p.members].sort((a, b) =>
      a.wallId < b.wallId ? -1 : a.wallId > b.wallId ? 1 : (a.isStart === b.isStart ? 0 : a.isStart ? -1 : 1),
    )[0]!;
    const ref: TickRef = { elementId: rep.wallId, anchor: rep.isStart ? 'start' : 'end', station: 0 };
    nodes.push({ id: nodeId, point: entry.p.point, ref });
  });

  // Map each endpoint to its node id.
  const endpointNode = new Map<string, string>(); // `${wallId}:${isStart}` → nodeId
  prov.forEach((p, i) => {
    const nodeId = provIdxToNodeId.get(i)!;
    for (const m of p.members) endpointNode.set(`${m.wallId}:${m.isStart}`, nodeId);
  });

  const wallNodes = new Map<string, { startNodeId: string; endNodeId: string }>();
  for (const w of walls) {
    const s = endpointNode.get(`${w.id}:true`);
    const e = endpointNode.get(`${w.id}:false`);
    if (!s || !e || s === e) continue; // degenerate — excluded from graph
    wallNodes.set(w.id, { startNodeId: s, endNodeId: e });
  }

  return { nodes, wallNodes };
}

// ── Perimeter outer-face trace (pure port of computeTopology) ────────────────

export interface Ring {
  /** Ordered node ids around the outer face (cyclic). */
  readonly nodeIds: readonly string[];
  /** wallIds[i] connects nodeIds[i] → nodeIds[(i+1)%n]. */
  readonly wallIds: readonly string[];
}

function signedArea(nodeIds: readonly string[], pos: ReadonlyMap<string, PtXZ>): number {
  let area = 0;
  const n = nodeIds.length;
  for (let i = 0; i < n; i++) {
    const a = pos.get(nodeIds[i]!);
    const b = pos.get(nodeIds[(i + 1) % n]!);
    if (!a || !b) continue;
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

/**
 * §FIX-AUTODIM-MULTI-BUILDING (L-268) — trace the outer face of EVERY building on
 * the level, not just the biggest one.
 *
 * THE BUG THIS REPLACES. `tracePerimeter` (below, kept) traces the faces of the whole
 * wall graph and then returns **the single most-negative signed-area face**. On a level
 * with two disjoint footprints that is the LARGER building — and the smaller one is
 * discarded in silence. The founder had two buildings; one came back dimensioned and
 * nothing told him the other had been skipped. It was never a "two buildings" branch
 * that was missing: **there was no notion of a BUILDING in the documentation layer at
 * all.** The perimeter was, by construction, singular.
 *
 * THE FIX, AND WHY IT IS SHAPED THIS WAY. The walls are partitioned into connected
 * components **always** — a single building is simply N = 1 and goes down the exact same
 * path. There is no special case to forget, which is the only way this stops recurring.
 * Each component contributes its own outer face (its most-negative-area face), so each
 * building is dimensioned on its own perimeter. An "overall" dimension spanning two
 * buildings would measure across the gap between them, which is not a number anyone
 * wants on a drawing.
 *
 * Deterministic: components are keyed by their lexicographically-smallest node id and
 * returned in sorted order, so the same level always yields the same drawing.
 *
 * Returns one Ring per building that has a closed perimeter. A component with no closed
 * face (an open run of walls) contributes nothing here — the caller falls back to
 * per-wall handling for it, exactly as before.
 */
export function tracePerimeters(graph: DimGraph): Ring[] {
  const pos = new Map<string, PtXZ>(graph.nodes.map((n) => [n.id, n.point]));
  const faces = traceFaces(graph, pos);
  if (faces.length === 0) return [];

  // ── Connected components over the wall graph (union-find, order-stable) ──────
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // Path compression.
    let c = a;
    while (parent.get(c) !== r) { const nxt = parent.get(c)!; parent.set(c, r); c = nxt; }
    return r;
  };
  for (const n of graph.nodes) parent.set(n.id, n.id);
  for (const { startNodeId: s, endNodeId: e } of graph.wallNodes.values()) {
    const rs = find(s), re = find(e);
    if (rs !== re) parent.set(rs < re ? re : rs, rs < re ? rs : re); // smaller id wins → stable
  }

  // ── One outer face per component: the most-negative signed area within it ────
  const bestByComponent = new Map<string, { ring: Ring; area: number }>();
  for (const f of faces) {
    const anchor = f.nodeIds[0];
    if (anchor === undefined) continue;
    const comp = find(anchor);
    const area = signedArea(f.nodeIds, pos);
    const cur = bestByComponent.get(comp);
    if (!cur || area < cur.area) bestByComponent.set(comp, { ring: f, area });
  }

  return [...bestByComponent.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, v]) => v.ring);
}

/**
 * Trace the building perimeter (outer face) via the angular-sorted half-edge
 * walk of computeTopology. Returns the most-negative signed-area face, or null
 * when no closed face exists (open perimeter → caller falls back to per-wall).
 *
 * §FIX-AUTODIM-MULTI-BUILDING (L-268) — RETAINED, but it is SINGULAR BY DESIGN and
 * therefore only correct on a single-building level. New callers want
 * {@link tracePerimeters}. This one is kept because its "largest face wins" semantics
 * are exactly what the multi-building reproduction test pins down.
 */
export function tracePerimeter(graph: DimGraph): Ring | null {
  const pos = new Map<string, PtXZ>(graph.nodes.map((n) => [n.id, n.point]));
  if (pos.size === 0 || graph.wallNodes.size === 0) return null;
  const faces = traceFaces(graph, pos);
  if (faces.length === 0) return null;

  let outer: Ring | null = null;
  let outerArea = Infinity;
  for (const f of faces) {
    const a = signedArea(f.nodeIds, pos);
    if (a < outerArea) { outerArea = a; outer = f; }
  }
  return outer;
}

/**
 * The shared half-edge face walk — extracted so the singular `tracePerimeter` and the
 * partitioning `tracePerimeters` cannot drift apart. Returns EVERY closed face in the
 * graph (of every component); selecting among them is the caller's job.
 */
function traceFaces(graph: DimGraph, pos: ReadonlyMap<string, PtXZ>): Ring[] {
  if (pos.size === 0 || graph.wallNodes.size === 0) return [];

  // Adjacency: node → [{neighborId, wallId}]. Half-edge wall lookup.
  const adj = new Map<string, { neighborId: string; wallId: string }[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  const halfEdgeWall = new Map<string, string>();
  for (const [wallId, { startNodeId: s, endNodeId: e }] of graph.wallNodes) {
    adj.get(s)?.push({ neighborId: e, wallId });
    adj.get(e)?.push({ neighborId: s, wallId });
    halfEdgeWall.set(`${s}→${e}`, wallId);
    halfEdgeWall.set(`${e}→${s}`, wallId);
  }

  // Angular sort each node's neighbours (atan2, id tiebreak — deterministic).
  const adjSorted = new Map<string, { neighborId: string; wallId: string }[]>();
  for (const [nId, neighbors] of adj) {
    const v = pos.get(nId)!;
    const sorted = [...neighbors].sort((a, b) => {
      const ap = pos.get(a.neighborId)!;
      const bp = pos.get(b.neighborId)!;
      const aA = Math.atan2(ap.z - v.z, ap.x - v.x);
      const bA = Math.atan2(bp.z - v.z, bp.x - v.x);
      return aA !== bA ? aA - bA : (a.neighborId < b.neighborId ? -1 : a.neighborId > b.neighborId ? 1 : 0);
    });
    adjSorted.set(nId, sorted);
  }

  function nextHalfEdge(uId: string, vId: string): { nextU: string; nextV: string; wallId: string } | null {
    const neighbors = adjSorted.get(vId) ?? [];
    const n = neighbors.length;
    if (n === 0) return null;
    if (n === 1) {
      const only = neighbors[0]!;
      return only.neighborId === uId ? { nextU: vId, nextV: uId, wallId: only.wallId } : null;
    }
    const uIdx = neighbors.findIndex((nb) => nb.neighborId === uId);
    if (uIdx === -1) {
      const fb = neighbors.find((nb) => nb.neighborId !== uId);
      return fb ? { nextU: vId, nextV: fb.neighborId, wallId: fb.wallId } : null;
    }
    const chosen = neighbors[(uIdx - 1 + n) % n]!;
    return { nextU: vId, nextV: chosen.neighborId, wallId: chosen.wallId };
  }

  const visited = new Set<string>();
  const maxIter = graph.wallNodes.size * 4 + 16;
  const faces: Ring[] = [];
  // Iterate half-edges in a deterministic order (sorted wall ids).
  const wallIdsSorted = [...graph.wallNodes.keys()].sort();
  for (const wid of wallIdsSorted) {
    const { startNodeId, endNodeId } = graph.wallNodes.get(wid)!;
    for (const [sId, eId] of [
      [startNodeId, endNodeId],
      [endNodeId, startNodeId],
    ] as [string, string][]) {
      if (visited.has(`${sId}→${eId}`)) continue;
      const nodeIds: string[] = [];
      const wallIds: string[] = [];
      let curU = sId, curV = eId, iter = 0;
      while (iter < maxIter) {
        const key = `${curU}→${curV}`;
        if (visited.has(key)) break;
        visited.add(key);
        nodeIds.push(curU);
        wallIds.push(halfEdgeWall.get(key) ?? '');
        const next = nextHalfEdge(curU, curV);
        if (!next) break;
        curU = next.nextU; curV = next.nextV; iter++;
      }
      if (nodeIds.length >= 3) faces.push({ nodeIds, wallIds });
    }
  }
  return faces;
}

// ── Run splitting (collinear grouping along the perimeter ring) ──────────────

/**
 * Split the ordered perimeter ring into runs — maximal sequences of collinear,
 * end-to-end edges (one run per façade side). Deterministic: the ring is rotated
 * to start at a corner following the lexicographically-smallest node so the run
 * boundaries never depend on the trace's arbitrary start edge.
 */
export function splitRuns(ring: Ring, graph: DimGraph): WallRun[] {
  const pos = new Map<string, PtXZ>(graph.nodes.map((n) => [n.id, n.point]));
  const nodeById = new Map<string, DimNode>(graph.nodes.map((n) => [n.id, n]));
  const n = ring.nodeIds.length;
  if (n < 2) return [];

  const edgeDir = (i: number): PtXZ => {
    const a = pos.get(ring.nodeIds[i]!)!;
    const b = pos.get(ring.nodeIds[(i + 1) % n]!)!;
    return unit(sub(b, a));
  };
  const isCorner = (i: number): boolean => {
    const prev = edgeDir((i - 1 + n) % n);
    const cur = edgeDir(i);
    return dot(prev, cur) < COLLINEAR_COS; // direction change ≥ 15°
  };

  // Rotate to a deterministic corner start: the corner whose node id is smallest.
  let startEdge = 0;
  let bestNode: string | null = null;
  for (let i = 0; i < n; i++) {
    if (!isCorner(i)) continue;
    const nodeId = ring.nodeIds[i]!;
    if (bestNode === null || nodeId < bestNode) { bestNode = nodeId; startEdge = i; }
  }

  const runs: WallRun[] = [];
  let idx = 0;
  while (idx < n) {
    const e0 = (startEdge + idx) % n;
    const members: string[] = [ring.wallIds[e0]!];
    const nodeSeq: string[] = [ring.nodeIds[e0]!]; // run start node
    let count = 1;
    // Extend while the next edge continues collinearly (not a corner).
    while (count < n) {
      const eNext = (startEdge + idx + count) % n;
      if (isCorner(eNext)) break;
      members.push(ring.wallIds[eNext]!);
      nodeSeq.push(ring.nodeIds[eNext]!);
      count++;
    }
    nodeSeq.push(ring.nodeIds[(startEdge + idx + count) % n]!); // run end node
    idx += count;

    const startPt = pos.get(nodeSeq[0]!)!;
    const endPt = pos.get(nodeSeq[nodeSeq.length - 1]!)!;
    const raw = sub(endPt, startPt);
    const length = len(raw);
    if (length < 1e-6) continue; // degenerate run — skip
    const axisDir = canonicalDir(raw);
    const origin = startPt;

    // Node ticks along the run, projected to canonical stations, sorted.
    const nodeRefs: TickRef[] = nodeSeq
      .map((id) => {
        const node = nodeById.get(id)!;
        return { elementId: node.ref.elementId, anchor: node.ref.anchor, station: station(node.point, origin, axisDir) };
      })
      .sort((a, b) => a.station - b.station);

    const orientation = classifyOrientation(axisDir);
    runs.push({
      id: `run:${[...members].sort().join('+')}`,
      axisDir, origin, members, nodeRefs, length,
      isExterior: true,
      orientation,
    });
  }

  // Deterministic run order: by orientation, then first node station origin (x,z), then id.
  runs.sort((a, b) => {
    if (a.orientation !== b.orientation) return a.orientation < b.orientation ? -1 : 1;
    if (a.origin.x !== b.origin.x) return a.origin.x - b.origin.x;
    if (a.origin.z !== b.origin.z) return a.origin.z - b.origin.z;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return runs;
}

/** Axis-aligned within 15° → horizontal/vertical; else true-length 'aligned'. */
function classifyOrientation(axisDir: PtXZ): WallRun['orientation'] {
  const ax = Math.abs(axisDir.x);
  const az = Math.abs(axisDir.z);
  if (ax >= COLLINEAR_COS) return 'horizontal'; // runs along world X
  if (az >= COLLINEAR_COS) return 'vertical';   // runs along world Z
  return 'aligned';
}
