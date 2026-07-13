// @pryzm/auto-dimension — BUILDING PARTITION (L2, PURE).
//
// §FIX-AUTODIM-MULTI-BUILDING (L-268) — "a BUILDING" as a first-class domain concept.
//
// THE DEFECT THIS EXISTS TO KILL. Auto-dimension covered only ONE of the founder's two
// buildings. The tempting reading is "the two-building branch is missing". It is the
// wrong reading, and fixing it that way guarantees the bug comes back in the next
// consumer. The truth was structural: **the documentation layer had no notion of a
// BUILDING at all.** `tracePerimeter` returned THE most-negative-area face of the whole
// wall graph — singular by construction — so a level with two disjoint footprints could
// only ever be understood as one, and the smaller was discarded in silence.
//
// WHY THIS MODULE, AND WHY HERE. The partition is a property of the MODEL (which walls
// form one connected footprint), not of dimensioning. It therefore lives in the pure L2
// engine as its own module with its own public type, NOT inside the L5
// `applyAutoDimensions` executor, so that every documentation consumer resolves the SAME
// buildings from the SAME code:
//
//   • plan auto-dimension      (`planAutoDimensions`)         — consumes it today;
//   • elevation auto-dimension (L-263)                         — per-building elevations;
//   • auto-tag / room tags     (L-265)                         — tag inside the right hull;
//   • interior elevations, schedules (C28), sheet composition (C24).
//
// C19 already contemplates a SITE holding N buildings; this is that concept arriving in
// the documentation layer, which is where it was missing.
//
// THE INVARIANT THAT STOPS THE RECURRENCE. The level is partitioned ALWAYS. A single
// building is simply N = 1 travelling the exact same path — there is no "if more than one
// building" branch anywhere, because a branch is a thing a future author can forget.
// The N = 1 case and the N = 2 case are the same code.
//
// PURE: no THREE/DOM/I/O/RNG. Deterministic — the same walls always yield the same
// buildings, in the same order (P5, ADR-0061).

import { withAutoDimSpan } from './tracing.js';
import type { AutoDimWall, WallRun, DimNode } from './types.js';
import type { PtXZ } from './geometry.js';
import { buildGraph, tracePerimeters, splitRuns, type DimGraph } from './perimeter.js';

/**
 * ONE building on a level: a connected footprint of walls with its own closed perimeter.
 *
 * Every field is per-BUILDING, never per-level. That is the whole point: a consumer that
 * reaches for `perimPolygon` gets *this* building's hull, so it cannot accidentally
 * average two separate buildings into one meaningless shape. (Placement, for instance,
 * pushes dimension lines outward from the centroid — a centroid averaged across two
 * buildings sits in the GAP between them and would push building A's dimensions straight
 * into building B.)
 */
export interface BuildingFootprint {
  /**
   * Deterministic identity: the lexicographically-smallest graph-node id in the
   * component. Stable across runs for the same input, so a drawing regenerates
   * identically (ADR-0061). NOT a persisted element id — this is a derived, in-memory
   * grouping, and it must not be mistaken for one.
   */
  readonly id: string;
  /** Every wall in this connected component (including interior partitions). */
  readonly wallIds: readonly string[];
  /** The perimeter split into straight façade runs (collinear walls merged). */
  readonly runs: readonly WallRun[];
  /** The graph nodes lying ON this building's outer face. */
  readonly perimNodes: readonly DimNode[];
  /** This building's outer-face polygon, in order. `>= 3` points when closed. */
  readonly perimPolygon: readonly PtXZ[];
}

/** The result of partitioning one level's walls into buildings. */
export interface BuildingPartition {
  /**
   * One entry per building with a closed perimeter, in deterministic order.
   * EMPTY when no closed face exists anywhere (an open run of walls) — the caller then
   * falls back to per-wall handling, exactly as before.
   */
  readonly buildings: readonly BuildingFootprint[];
  /** `false` when no building has a closed perimeter (open footprint → caller falls back). */
  readonly hasPerimeter: boolean;
  /** The shared connectivity graph, so callers need not rebuild it. */
  readonly graph: DimGraph;
}

/**
 * Partition a level's walls into BUILDINGS — connected wall footprints, each with its own
 * outer perimeter, runs and hull.
 *
 * This is the canonical entry point for "how many buildings are on this level, and which
 * walls belong to each". Consume THIS rather than re-deriving a perimeter, so that plan
 * dimensions, elevation dimensions, tags and schedules can never disagree about what a
 * building is.
 *
 * @param walls   every wall on the level (interior partitions included — they join their
 *                building's component and are covered by `wallIds`).
 * @param snapEps endpoint-coincidence tolerance, in metres.
 *
 * P8: opens the `pryzm.autodim.graph` span (this IS pipeline stage 1).
 */
export function partitionBuildings(
  walls: readonly AutoDimWall[],
  snapEps: number,
): BuildingPartition {
  return withAutoDimSpan('graph', (span): BuildingPartition => {
    const graph: DimGraph = buildGraph(walls, snapEps);
    const rings = tracePerimeters(graph);

    span.setAttribute('pryzm.autodim.wall_count', walls.length);
    span.setAttribute('pryzm.autodim.building_count', rings.length);

    if (rings.length === 0) {
      return { buildings: [], hasPerimeter: false, graph };
    }

    const posById = new Map<string, PtXZ>(graph.nodes.map((n) => [n.id, n.point]));

    // ONE union-find for the whole level, reused for both the component key and wall
    // membership.
    const componentOf = buildUnionFind(graph);
    const wallIdsByComponent = componentWallIds(graph, componentOf);

    const candidates = rings.map((ring) => {
      const perimNodeSet = new Set(ring.nodeIds);
      // Any node on the ring identifies the component; the union-find representative is
      // already the component's smallest node id, so the key is deterministic.
      const componentKey = componentOf.get(ring.nodeIds[0]!) ?? ring.nodeIds[0]!;
      const perimPolygon = ring.nodeIds.map((id) => posById.get(id)!).filter(Boolean);
      return {
        id: componentKey,
        wallIds: [...(wallIdsByComponent.get(componentKey) ?? [])],
        runs: splitRuns(ring, graph),
        perimNodes: graph.nodes.filter((n) => perimNodeSet.has(n.id)),
        perimPolygon,
        area: Math.abs(polygonArea(perimPolygon)),
      };
    })
      // A BUILDING MUST ENCLOSE AREA. The half-edge walk emits a face for an OPEN run of
      // walls too — it simply walks out along the polyline and back, yielding a
      // DEGENERATE, ZERO-AREA "face". That is not a building. Left in, it would be
      // counted in `buildingCount`, and its centroid (used to push dimension lines
      // outward) is meaningless, so dimension lines would be placed against a hull with
      // no inside. Dropping it is what makes `hasPerimeter === false` for an open
      // footprint, which is precisely the contract `tracePerimeters` already documented
      // and did not keep: the caller then falls back to per-wall handling, as intended.
      .filter((b) => b.area > MIN_BUILDING_AREA_M2);

    if (candidates.length === 0) {
      return { buildings: [], hasPerimeter: false, graph };
    }

    // ── Walls that no RING claimed: assign each to the building that CONTAINS it ───────
    //
    // Union-find joins walls by ENDPOINT coincidence, so an interior partition that meets
    // the shell in a T-junction (its endpoint landing on the MIDDLE of a shell wall, not
    // on a corner node) is its own component and would be reported as belonging to NO
    // building. That is the same silent partial coverage this whole ticket is about, one
    // level down: auto-tag (L-265) asking for "this building's walls" would quietly get
    // the façade only, and every interior room tag would be lost.
    //
    // So containment, not just connectivity, decides membership: a wall whose MIDPOINT
    // lies inside exactly one building's hull belongs to that building.
    const claimed = new Set(candidates.flatMap((b) => b.wallIds));
    for (const wall of walls) {
      if (claimed.has(wall.id)) continue;
      const mid: PtXZ = { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
      const owners = candidates.filter((b) => pointInPolygon(mid, b.perimPolygon));
      // Exactly one owner, or we cannot say — an ambiguous wall is left unassigned rather
      // than guessed into the wrong building.
      if (owners.length === 1) owners[0]!.wallIds.push(wall.id);
    }

    const buildings: BuildingFootprint[] = candidates.map((b) => ({
      id: b.id,
      wallIds: [...b.wallIds].sort(), // deterministic
      runs: b.runs,
      perimNodes: b.perimNodes,
      perimPolygon: b.perimPolygon,
    }));

    span.setAttribute('pryzm.autodim.building_count', buildings.length);
    return { buildings, hasPerimeter: true, graph };
  });
}

/**
 * The smallest enclosed area (m²) that counts as a BUILDING. Anything at or below this is
 * a degenerate, zero-area face produced by walking an OPEN run of walls out and back —
 * not a footprint. Deliberately tiny: this is a degeneracy guard, not a "small building"
 * filter. A real building is never in doubt; a zero-area artefact never survives.
 */
const MIN_BUILDING_AREA_M2 = 1e-6;

/** Shoelace. Sign carries winding; callers take the absolute value. Pure. */
function polygonArea(poly: readonly PtXZ[]): number {
  const n = poly.length;
  if (n < 3) return 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

/**
 * Even-odd ray cast: is `pt` inside `poly`? Pure, winding-agnostic (the outer face comes
 * back clockwise, so a winding-sensitive test would invert). Used to decide which
 * building an interior partition belongs to when connectivity alone cannot say.
 */
function pointInPolygon(pt: PtXZ, poly: readonly PtXZ[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const straddles = a.z > pt.z !== b.z > pt.z;
    if (!straddles) continue;
    const xAtZ = a.x + ((pt.z - a.z) / (b.z - a.z)) * (b.x - a.x);
    if (pt.x < xAtZ) inside = !inside;
  }
  return inside;
}

// ── Connected components (union-find), shared by id-assignment + wall membership ──────
//
// Order-stable: the smaller node id always wins as the representative, so the component
// key is the lexicographically-smallest node id in the component regardless of the order
// the walls arrived in. That is what makes `BuildingFootprint.id` deterministic.

function buildUnionFind(graph: DimGraph): Map<string, string> {
  const parent = new Map<string, string>();
  for (const n of graph.nodes) parent.set(n.id, n.id);
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== r) { const nxt = parent.get(c)!; parent.set(c, r); c = nxt; }
    return r;
  };
  for (const { startNodeId: s, endNodeId: e } of graph.wallNodes.values()) {
    const rs = find(s), re = find(e);
    if (rs !== re) parent.set(rs < re ? re : rs, rs < re ? rs : re);
  }
  // Fully compress so a plain `get` is the representative.
  for (const id of [...parent.keys()]) parent.set(id, find(id));
  return parent;
}

function componentWallIds(graph: DimGraph, parent: ReadonlyMap<string, string>): Map<string, string[]> {
  const byComponent = new Map<string, string[]>();
  for (const [wallId, { startNodeId }] of graph.wallNodes.entries()) {
    const key = parent.get(startNodeId) ?? startNodeId;
    const list = byComponent.get(key);
    if (list) list.push(wallId);
    else byComponent.set(key, [wallId]);
  }
  // Sorted → deterministic output for the same input.
  for (const list of byComponent.values()) list.sort();
  return byComponent;
}
