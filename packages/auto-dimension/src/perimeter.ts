// @pryzm/auto-dimension — Stage 1: connectivity graph, perimeter extraction, runs.
//
// Reuse map (§SPIKE §4):
//   • endpoint clustering  → pure port of JunctionResolverV2.clusterEndpoints (:315).
//   • perimeter outer face → IMPORTED from `@pryzm/geometry-kernel/pure/planarFaceWalk`
//     (§C73-PTE-CANONICAL, GE-12). See the note below — this used to be a PORT.
//   • run splitting        → collinear grouping ALONG the ordered perimeter ring
//     (§SPIKE §6 collinear-runs), split at direction changes (15° gate).
//
// ── GE-12 / C73 §3.7 — THE PORT IS GONE; THIS IS NOW AN ADAPTER ────────────────
// The half-edge face walk here was a hand PORT of `PlanarTopologyEngine.computeTopology`
// rather than an import, and the header used to say why: room-topology's barrel pulls
// THREE through eight files, and this package depended on `@pryzm/schemas` ALONE, so it
// COULD NOT import the owner. A port that cannot be imported is a copy that will drift,
// and it did — six axes apart by the time GE-12 measured it (face-area filter, angular
// tiebreak, seed order, missing-position handling, outer-face policy, and only the
// next-edge rule and iteration ceiling still identical).
//
// The founder's ruling (C73 §3.7) removes the blocker rather than the symptom: the walk
// now lives THREE-free in the geometry kernel, so both callers import the same body.
// What stays here is the auto-dimension DOMAIN layer — `DimGraph` in, `Ring` out — plus
// the one semantic this package must keep and `room-topology` must not:
//
//   §PTE-OUTER-FACE — POLICY B, one outer face PER CONNECTED COMPONENT. That is L-268:
//   the founder had two buildings, the singular "most-negative face of the whole graph"
//   rule kept the larger, and the smaller was dimensioned nowhere and reported nowhere.
//   The two policies are genuinely different ANSWERS, so the kernel refuses to pick one
//   and each caller names the question it is asking.
//
// UNCHANGED BY THE EXTRACTION (measured, not assumed): this package already seeded the
// walk in sorted wall-id order and already applied NO face-area filter, which are the
// two settled axes that could have moved its output. `minAbsFaceAreaM2` defaults to 0 —
// the degeneracy guard stays where it always was, at `buildings.ts:142`
// (MIN_BUILDING_AREA_M2 = 1e-6), where "a BUILDING must enclose area" is the domain
// statement being made.

import {
  tracePlanarFacesXZ,
  selectOuterFaceXZ,
  selectOuterFacePerComponentXZ,
  planarComponentsXZ,
  type PlanarEdgeXZ,
  type PlanarFaceXZ,
  type PlanarGraphXZ,
} from '@pryzm/geometry-kernel/pure/planarFaceWalk';

import { withAutoDimSpan } from './tracing.js';
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

/**
 * ADAPTER BOUNDARY: `DimGraph` (this package's domain type) → the kernel's
 * `PlanarGraphXZ`. Wall ids are the edge identity carried onto the traced rings.
 */
function toPlanarGraph(graph: DimGraph): PlanarGraphXZ {
  const positions = new Map<string, PtXZ>(graph.nodes.map((n) => [n.id, n.point]));
  const edges: PlanarEdgeXZ[] = [...graph.wallNodes.entries()].map(
    ([wallId, { startNodeId, endNodeId }]) => ({ id: wallId, startNodeId, endNodeId }),
  );
  return { positions, edges };
}

/** The kernel's face → this package's `Ring`. Field rename only; same arrays. */
function toRing(face: PlanarFaceXZ): Ring {
  return { nodeIds: face.nodeIds, wallIds: face.edgeIds };
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
  const planar = toPlanarGraph(graph);
  // §PTE-FILTERED — no face-area filter here, deliberately (the kernel default is 0):
  // "small enough not to be a building" is a judgement `buildings.ts` makes downstream
  // at 1e-6, where the domain word BUILDING is in scope. See this file's header.
  const faces = tracePlanarFacesXZ(planar);
  // §PTE-OUTER-FACE — POLICY B, one per component. The partition happens ALWAYS: a
  // single building is N = 1 down the same path, because a branch is a thing a future
  // author can forget (L-268).
  return selectOuterFacePerComponentXZ(planar, faces).map(toRing);
}

/**
 * Connected components of a `DimGraph` as `nodeId → componentKey` (the component's
 * lexicographically smallest node id). Re-exported through this module so that
 * `buildings.ts` and {@link tracePerimeters} cannot disagree about what a component IS —
 * the building id in `BuildingFootprint.id` is exactly this key.
 */
export function dimGraphComponents(graph: DimGraph): Map<string, string> {
  return planarComponentsXZ(toPlanarGraph(graph));
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
  const planar = toPlanarGraph(graph);
  if (planar.positions.size === 0 || planar.edges.length === 0) return null;
  // §PTE-OUTER-FACE — POLICY A, the singular one. Named so a reader of THIS call site
  // sees the L-268 defect without opening another file.
  const outer = selectOuterFaceXZ(tracePlanarFacesXZ(planar));
  return outer ? toRing(outer) : null;
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

// ── ROOM FACES (§GA-EDITORIAL-LAYER, L-1620, SPEC-AUTODIMENSION §12.3) ───────
//
// ⭐ THE MEASUREMENT THAT FORCED THIS.
//
// §12.3 caps interior dimensions at "MAXIMUM ONE WIDTH AND ONE LENGTH PER ROOM", so the
// engine must know what a ROOM is. It did not. `tracePerimeters` returns ONE OUTER FACE
// PER CONNECTED COMPONENT and discards everything else — and on a real plate that is not
// a room, it is a BAND: the endpoint clustering band (0.20 m) is wider than the gap a
// generator leaves between adjacent apartment cells (~0.10-0.15 m), so five cells cluster
// into ONE component whose outer face is the outline of all five.
//
// Two consequences, both measured on the GA plate before this was written:
//   • the interior dimensions the engine DID emit were chain segments along that band
//     outline — a dimension on every room edge, which is exactly what §12.3 forbids; and
//   • the dimensions §12.3 REQUIRES — the corridor width, the stair width — were NEVER
//     PLANNED AT ALL. **§12.3's allow-list was not merely over-supplied; it was partly
//     UNSUPPLIED.** A filter cannot keep a dimension that was never proposed, so the
//     editorial layer needs the rooms themselves, not the band they merged into.
//
// The rooms are already computed and thrown away: they are the INTERIOR (positive-area,
// CCW) faces of the same half-edge walk that yields the perimeter. This returns them.

/** One enclosed interior face of the wall graph — a ROOM, in the §12.3 sense. */
export interface RoomFace {
  /** Deterministic identity from the face's wall set (never a persisted element id). */
  readonly id: string;
  readonly wallIds: readonly string[];
  readonly polygon: readonly PtXZ[];
  readonly areaM2: number;
  /** The face's corner nodes, in ring order — carries each corner's live element+anchor. */
  readonly nodes: readonly DimNode[];
}

/**
 * Every enclosed ROOM on the level: the interior faces of the plane graph, minus the
 * faces that ARE a building's own envelope.
 *
 * @param excludeWallSets the ring wall-id sets of the ENVELOPES. A building's interior
 *        face is a positive-area face too — the whole plate — and it is emphatically not
 *        a room. It is excluded by IDENTITY (same wall set), not by an area threshold,
 *        because "the biggest face is the building" is the kind of rule that holds until
 *        someone draws a large atrium.
 * @param minAreaM2 slivers below this are not rooms. A domain judgement, stated at the
 *        call site (§PTE-FILTERED) rather than buried in the walk.
 *
 * Deterministic: faces come back in the walk's own total order and are re-sorted by id.
 */
export function traceRoomFaces(
  graph: DimGraph,
  excludeWallSets: readonly ReadonlySet<string>[],
  minAreaM2: number,
): RoomFace[] {
  // P8 (INV-6) — this IS pipeline stage 1, so it opens the `graph` span.
  return withAutoDimSpan('graph', (span) => {
    const faces = traceRoomFacesImpl(graph, excludeWallSets, minAreaM2);
    span.setAttribute('pryzm.autodim.room_face_count', faces.length);
    return faces;
  });
}

function traceRoomFacesImpl(
  graph: DimGraph,
  excludeWallSets: readonly ReadonlySet<string>[],
  minAreaM2: number,
): RoomFace[] {
  const planar = toPlanarGraph(graph);
  if (planar.positions.size === 0 || planar.edges.length === 0) return [];
  const nodeById = new Map<string, DimNode>(graph.nodes.map((n) => [n.id, n]));

  const sameSet = (a: readonly string[], b: ReadonlySet<string>): boolean => {
    if (a.length !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  };

  const out: RoomFace[] = [];
  for (const face of tracePlanarFacesXZ(planar)) {
    // Interior faces come back COUNTER-CLOCKWISE (positive shoelace); the face that
    // encloses a component from outside is negative. See planarFaceWalk's header.
    if (face.signedAreaM2 <= 0) continue;
    if (face.signedAreaM2 < minAreaM2) continue;
    if (excludeWallSets.some((s) => sameSet(face.edgeIds, s))) continue;
    const nodes = face.nodeIds.map((id) => nodeById.get(id)).filter((n): n is DimNode => !!n);
    if (nodes.length < 3) continue;
    out.push({
      id: `room:${[...face.edgeIds].sort().join('+')}`,
      wallIds: [...face.edgeIds].sort(),
      polygon: nodes.map((n) => n.point),
      areaM2: face.signedAreaM2,
      nodes,
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
