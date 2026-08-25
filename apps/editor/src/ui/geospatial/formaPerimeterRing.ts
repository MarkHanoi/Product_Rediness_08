/**
 * formaPerimeterRing — the massing's EXTERIOR PERIMETER RING tracer, hoisted out of
 * `CesiumViewport.reconstructPerimeterRing` (§A.21.D30 / §A.21.D50) so it can be proven.
 *
 * WHY IT MOVED (§MASSING-FOLLOWS-THE-ARC, L-11172, lane MASSCURVE71). The ring this
 * function returns IS the storey prism the globe extrudes and the envelope the façade
 * study samples — it is the layer the user experiences. `CesiumViewport` cannot be
 * collected under the unit config (Cesium at module scope — the same reason
 * `formaMassingExtent.ts`, `sceneEnuFrame.ts` and `facadeStudySubject.ts` live beside it),
 * so a defect in this ring could only ever be argued, not measured. The body below is the
 * viewport's, MOVED VERBATIM — comments, tolerances and the C73 containment composition
 * included — with exactly ONE addition at the top: curved walls are expanded into the
 * repo's chord run (`expandFormaWallsToChords`) before the node graph is built, so the
 * traced ring follows the Bézier instead of its chord. For a straight-only wall set that
 * expansion returns the input array itself, so the trace is byte-identical to before.
 *
 * The viewport's private `reconstructPerimeterRing` is now a one-line delegate to this;
 * every call site (the storey prism, the façade study) is untouched.
 */

import { pointInPolygonXZ } from '@pryzm/geometry-kernel';
import { expandFormaWallsToChords, type FormaMassingWallLike, type FormaXZ } from './formaWallCurve';

/**
 * The node-identity grid: wall endpoints closer than this are ONE perimeter node.
 * 5 cm — well below wall thickness, above float noise. Exported so the chord-survival
 * bound in `formaWallCurve.ts` can be asserted against it.
 */
export const PERIMETER_NODE_SNAP_M = 0.05;

/**
 * §A.21.D30 — reconstruct the ORDERED EXTERIOR PERIMETER RING from a set of
 * shell wall segments, so a storey with no drawn parcel boundary can be
 * extruded as ONE watertight closed polygon (NO corner gaps/overlaps) instead
 * of N independent wall boxes.
 *
 * The shell (perimeter) walls share endpoints by construction (D25
 * §PERIMETER-CLOSE made the perimeter a closed loop of vertex-chained walls),
 * so we can chain segments end-to-end into a single loop. Robust to:
 *   • rectilinear / L / U shells (any orthogonal or non-orthogonal corners);
 *   • principal-axis-rotated (skewed) plots (works on raw XZ — no axis
 *     assumption; corner snapping is a metric tolerance, not a grid);
 *   • interior partition walls present alongside the shell (they branch off
 *     a perimeter node with degree ≠ 2 and are simply not followed — we only
 *     traverse the degree-2 boundary chain);
 *   • §MASSING-FOLLOWS-THE-ARC — CURVED shell walls (`curve` present): each is
 *     expanded into its chord run first, so the arc's chord vertices are ordinary
 *     degree-2 perimeter nodes and the ring follows the Bézier.
 *
 * Algorithm: snap endpoints to a tolerance grid → build an adjacency map of
 * node → connected nodes. Start from the node with the smallest (x,z) (always
 * on the convex hull, hence on the outer ring) and walk, at each step turning
 * as far CLOCKWISE as possible from the incoming direction (the standard
 * "wall-follower" that traces the OUTER boundary of a planar graph). Stop when
 * we return to the start. Returns the ordered scene-XZ ring (≥3 pts) or null
 * when the walls don't form a usable closed outer loop (→ caller falls back to
 * per-wall boxes; never throws, never renders nothing).
 */
export function reconstructPerimeterRingFromWalls(
  inputWalls: ReadonlyArray<FormaMassingWallLike>,
): Array<FormaXZ> | null {
  // §MASSING-FOLLOWS-THE-ARC (L-11172) — the ONE addition: a curved wall contributes its
  // chord run, not its chord. Straight-only input comes back as the same array.
  const walls = expandFormaWallsToChords(inputWalls);
  if (walls.length < 3) return null;
  const SNAP_M = PERIMETER_NODE_SNAP_M; // 5 cm — well below wall thickness, above float noise.
  const key = (p: { x: number; z: number }): string =>
    `${Math.round(p.x / SNAP_M)}|${Math.round(p.z / SNAP_M)}`;

  // Node table: key → representative coordinate + neighbour set.
  const coord = new Map<string, { x: number; z: number }>();
  const adj = new Map<string, Set<string>>();
  const addNode = (p: { x: number; z: number }): string => {
    const k = key(p);
    if (!coord.has(k)) {
      coord.set(k, { x: p.x, z: p.z });
      adj.set(k, new Set());
    }
    return k;
  };
  for (const w of walls) {
    if (!Number.isFinite(w.a.x) || !Number.isFinite(w.a.z) || !Number.isFinite(w.b.x) || !Number.isFinite(w.b.z)) continue;
    const ka = addNode(w.a);
    const kb = addNode(w.b);
    if (ka === kb) continue; // degenerate zero-length segment.
    adj.get(ka)!.add(kb);
    adj.get(kb)!.add(ka);
  }
  if (adj.size < 3) return null;

  // Start at the lexicographically smallest node — guaranteed on the outer
  // boundary (it is an extreme point of the vertex set, hence on the hull).
  let startKey: string | null = null;
  let startCoord: { x: number; z: number } | null = null;
  for (const [k, c] of coord) {
    if (!startCoord || c.x < startCoord.x - 1e-9 || (Math.abs(c.x - startCoord.x) < 1e-9 && c.z < startCoord.z)) {
      startKey = k;
      startCoord = c;
    }
  }
  if (!startKey || !startCoord) return null;

  // Boundary trace (standard CLOCKWISE wall-follower). We start at the
  // hull-extreme node (guaranteed on the outer ring) and, at every node, take
  // the smallest clockwise turn from the reversed-incoming heading. This walks
  // the OUTER face of the planar graph and is robust to interior partitions:
  // an interior wall that tees INTO a perimeter node raises that node's degree,
  // but the clockwise rule keeps the trace hugging the outer boundary rather
  // than diving down the interior spur. §A.21.D50 — earlier code assumed
  // interior endpoints always land mid-span (creating no perimeter node); real
  // apartments routinely tee interior partitions AT perimeter corners, so we no
  // longer rely on that. The trace is then VALIDATED by CONTAINMENT (every graph
  // node lies inside/on the ring) — see below — so a wrong interior-face trace
  // self-rejects rather than render garbage.
  const angleOf = (dx: number, dz: number): number => Math.atan2(dz, dx); // (-π, π]
  const cwSweep = (from: number, to: number): number => {
    // Clockwise sweep magnitude from heading `from` to heading `to`, (0, 2π].
    let d = from - to;
    while (d <= 1e-9) d += 2 * Math.PI;
    while (d > 2 * Math.PI + 1e-9) d -= 2 * Math.PI;
    return d;
  };

  const ring: Array<{ x: number; z: number }> = [];
  const visited = new Set<string>();
  let prevKey: string | null = null;
  let curKey: string = startKey;
  const MAX_STEPS = adj.size + 2;

  for (let step = 0; step < MAX_STEPS; step++) {
    const cur = coord.get(curKey)!;
    ring.push({ x: cur.x, z: cur.z });
    visited.add(curKey);
    const all = [...adj.get(curKey)!].filter((nk) => nk !== curKey);
    if (all.length === 0) return null; // dead end — not a closed loop.

    // Prefer non-backtracking neighbours (exclude the immediate previous node)
    // unless that leaves nothing (degree-1 spur forces a backtrack → reject).
    const candidates = all.filter((nk) => nk !== prevKey);
    const pool = candidates.length > 0 ? candidates : all;

    let bestKey: string;
    if (pool.length === 1) {
      bestKey = pool[0]!; // unambiguous degree-2 chain step.
    } else {
      // Junction: take the smallest clockwise turn from reversed-incoming.
      let revInAng: number;
      if (prevKey) {
        const prev = coord.get(prevKey)!;
        revInAng = angleOf(prev.x - cur.x, prev.z - cur.z);
      } else {
        revInAng = angleOf(0, 1); // seed at the hull-extreme start node.
      }
      let chosen: string | null = null;
      let bestSweep = Infinity;
      for (const nk of pool) {
        const n = coord.get(nk)!;
        const sweep = cwSweep(revInAng, angleOf(n.x - cur.x, n.z - cur.z));
        if (sweep < bestSweep) { bestSweep = sweep; chosen = nk; }
      }
      bestKey = chosen ?? pool[0]!;
    }

    if (bestKey === startKey) {
      break; // closed the loop.
    }
    // A revisit that is NOT the start means a self-crossing trace → reject.
    if (visited.has(bestKey)) return null;
    prevKey = curKey;
    curKey = bestKey;
  }

  // ── Validate the candidate ring ──────────────────────────────────────────
  if (ring.length < 3) return null;
  // Must enclose positive area (shoelace) — a collapsed/collinear chain is junk.
  let area2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    area2 += p.x * q.z - q.x * p.z;
  }
  if (Math.abs(area2) < 1e-3) return null;
  // §A.21.D50 — VALIDATE the trace is a genuine OUTER boundary, but DON'T assume
  // it covers most of the graph's nodes.
  //
  // ROOT CAUSE the old gate failed on: `getFormaWalls()` returns the ENTIRE wall
  // set — exterior shell AND every interior partition — so `adj.size` counts all
  // interior nodes too. A correct outer-boundary trace visits ONLY the perimeter
  // nodes, which in a real apartment is a minority of all nodes, so the old
  // `visited.size ≥ 60% of adj.size` gate rejected the (correct) ring and fell
  // back to per-wall boxes — the source of the "perimeter ring unavailable" log
  // and the mitre-less corner gaps.
  //
  // The TRUE invariant of an outer boundary is that it ENCLOSES every other graph
  // node (interior partition endpoints all lie inside the shell). So we validate
  // by containment, not by coverage: every snapped node must lie inside (or on)
  // the candidate ring. A wrong interior-face trace (which would leave some nodes
  // outside it) self-rejects → per-wall-box fallback. This is robust to any number
  // of interior partitions, L/U shells, and skewed plots.
  const RING_EPS_M = SNAP_M * 2; // on-edge tolerance (~10 cm) so perimeter nodes count as inside.
  // §C73-PIP-CANONICAL — this call site needs BOUNDARY-INCLUSIVE containment, which the
  // canonical predicate deliberately does NOT provide (it is half-open even-odd, and the
  // on-boundary question belongs to the point-to-segment-distance family — C73 §3.1/§3.5,
  // a different family that must not be folded into the ray cast). So the composition stays
  // HERE, explicitly, exactly as it was: an on-edge band first, then THE kernel ray cast.
  //
  // The two loops are equivalent to the one interleaved loop this replaces: the on-edge arm
  // returns EARLY with `true`, so the parity accumulated up to that edge is discarded either
  // way, and if no edge is within the band the parity loop runs over the identical edge set.
  // What DID change is the ray cast's divide: this copy ran unguarded while the other two in
  // this same file guarded with `|| 1e-12` and `|| 1e-9`. The kernel body is the unguarded
  // exact interpolation — i.e. THIS copy's behaviour is the one that survived, because it is
  // the correct one (the guards were dead code, never a semantic the other sites relied on).
  const insideOrOn = (px: number, pz: number): boolean => {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i]!.x, zi = ring[i]!.z;
      const xj = ring[j]!.x, zj = ring[j]!.z;
      // On-segment? (distance from point to segment ≤ tolerance) → treat as inside.
      const ex = xj - xi, ez = zj - zi;
      const len2 = ex * ex + ez * ez;
      if (len2 > 1e-12) {
        let t = ((px - xi) * ex + (pz - zi) * ez) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = xi + t * ex, cz = zi + t * ez;
        if ((px - cx) * (px - cx) + (pz - cz) * (pz - cz) <= RING_EPS_M * RING_EPS_M) return true;
      }
    }
    return pointInPolygonXZ(px, pz, ring);
  };
  for (const c of coord.values()) {
    if (!insideOrOn(c.x, c.z)) return null; // a node outside the ring → not the outer boundary.
  }
  return ring;
}
