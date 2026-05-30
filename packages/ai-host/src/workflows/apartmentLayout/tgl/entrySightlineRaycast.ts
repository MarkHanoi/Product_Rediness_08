// L2-β-2b — Ray-cast variant of entrySightline (Cognition L2 Spatial Hierarchy).
//
// The L2-β-2 axis is "how much does the entrance hall visually reveal?". The
// SCORING version (already in objectives.ts) uses GRAPH DISTANCE: count spaces
// the entry is door-connected to. That's cheap but coarse — a room with a
// door to the entry but visually behind a corner (door swings inward, sight
// line blocked by an interior wall) still counts.
//
// This module ships the RAY-CAST variant. For each OTHER space, trace a
// straight segment from the entry centroid to the target centroid and check
// whether ANY closed-wall portion crosses that segment. A crossing inside an
// OPENING (door or window) does NOT block; a crossing on a solid wall
// section DOES. The visible-space count is the number of targets whose
// segment is unblocked.
//
// Pure + deterministic — ai-host unit-tests in plain Node. No I/O, no THREE,
// no DOM.

import type { GraphNode, LayoutGraph, Pt } from './semanticGraph.js';

/** Architectural scoring buckets — IDENTICAL to L2-β-2 graph-distance form so
 *  swapping ray-cast for graph-distance preserves the band semantics. */
export function scoreVisibleSpaceCount(n: number): number {
    if (n === 1 || n === 2) return 1.0;
    if (n === 0)            return 0.3;
    if (n === 3)            return 0.7;
    /* n ≥ 4 */             return 0.3;
}

/** Polygon centroid (signed-area weighted; falls back to first vertex on
 *  degenerate polygons). All METRES. */
export function polygonCentroid(polygon: readonly Pt[]): Pt {
    if (polygon.length === 0) return { x: 0, z: 0 };
    if (polygon.length < 3)   return polygon[0]!;
    let area2 = 0, cx = 0, cz = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i]!.x, zi = polygon[i]!.z;
        const xj = polygon[j]!.x, zj = polygon[j]!.z;
        const cross = xj * zi - xi * zj;
        area2 += cross;
        cx += (xj + xi) * cross;
        cz += (zj + zi) * cross;
    }
    if (Math.abs(area2) < 1e-12) return polygon[0]!;
    const denom = 3 * area2;
    return { x: cx / denom, z: cz / denom };
}

/**
 * Segment-segment intersection in 2D. Returns the parametric (t, u) pair
 * where t ∈ [0,1] along (a1→a2) and u ∈ [0,1] along (b1→b2), or null when
 * the segments do NOT properly intersect (parallel, collinear, or end-only
 * touch within EPS). Touch-at-endpoint counts as no-intersect to keep the
 * raycaster from spuriously blocking on wall meet-points the sight-line
 * just grazes.
 */
const EPS = 1e-9;
export function segmentIntersect(
    a1: Pt, a2: Pt, b1: Pt, b2: Pt,
): { t: number; u: number } | null {
    const r1 = a2.x - a1.x;
    const r2 = a2.z - a1.z;
    const s1 = b2.x - b1.x;
    const s2 = b2.z - b1.z;
    const den = r1 * s2 - r2 * s1;
    if (Math.abs(den) < EPS) return null;       // parallel / collinear
    const dx = b1.x - a1.x;
    const dz = b1.z - a1.z;
    const t = (dx * s2 - dz * s1) / den;
    const u = (dx * r2 - dz * r1) / den;
    if (t <= EPS || t >= 1 - EPS) return null;  // touch-at-endpoint → not a block
    if (u <= EPS || u >= 1 - EPS) return null;
    return { t, u };
}

/**
 * Returns the closed-wall sections of a host wall as parametric ranges
 * [u0, u1] (along the wall's baseLine[0]→baseLine[1] direction). Any
 * intersection at u inside an OPENING (door or window) is NON-BLOCKING.
 *
 * `openings` carries the per-wall opening offsetM + widthM (already in the
 * wall's local frame from emitGeometry). Returns one [0,1] range when the
 * wall has no openings.
 */
export function closedWallRanges(
    wallLenM: number,
    openings: readonly { offsetM: number; widthM: number }[],
): ReadonlyArray<{ u0: number; u1: number }> {
    if (wallLenM <= 0) return [];
    if (openings.length === 0) return [{ u0: 0, u1: 1 }];
    const sorted = [...openings]
        .map(o => ({ a: o.offsetM / wallLenM, b: (o.offsetM + o.widthM) / wallLenM }))
        .filter(r => r.b > 0 && r.a < 1)
        .map(r => ({ a: Math.max(0, r.a), b: Math.min(1, r.b) }))
        .sort((a, b) => a.a - b.a);
    const out: { u0: number; u1: number }[] = [];
    let cursor = 0;
    for (const o of sorted) {
        if (o.a > cursor + EPS) out.push({ u0: cursor, u1: o.a });
        cursor = Math.max(cursor, o.b);
    }
    if (cursor < 1 - EPS) out.push({ u0: cursor, u1: 1 });
    return out;
}

/**
 * Check whether the segment (sight) crosses any CLOSED portion of the given
 * walls. Each wall carries its baseLine + the openings hosted on it. The
 * sight is blocked when ANY wall's closed range contains an intersection.
 */
export function isSightBlocked(
    sightA: Pt, sightB: Pt,
    walls: readonly { baseLine: readonly [Pt, Pt]; openings: readonly { offsetM: number; widthM: number }[] }[],
): boolean {
    for (const w of walls) {
        const wa = w.baseLine[0], wb = w.baseLine[1];
        const hit = segmentIntersect(sightA, sightB, wa, wb);
        if (!hit) continue;
        // Hit's `u` is the parametric along (wa→wb); check it's outside every opening.
        const wallLen = Math.hypot(wb.x - wa.x, wb.z - wa.z);
        const ranges = closedWallRanges(wallLen, w.openings);
        for (const r of ranges) {
            if (hit.u > r.u0 + EPS && hit.u < r.u1 - EPS) return true;
        }
    }
    return false;
}

// ── High-level scorer ──────────────────────────────────────────────────────

/** Bundles per-wall geometry + openings for the raycaster. Built once per
 *  candidate via `gatherSightcastWalls(graph)` and reused across rooms. */
export interface SightcastWall {
    readonly baseLine: readonly [Pt, Pt];
    readonly openings: readonly { offsetM: number; widthM: number }[];
}

/** Collect every wall + its hosted openings from the semantic graph. Pure
 *  data — keys off HOSTED_BY edges (Opening --HOSTED_BY--> Wall). */
export function gatherSightcastWalls(graph: LayoutGraph): readonly SightcastWall[] {
    const walls = graph.nodes.filter(n => n.kind === 'Wall');
    const openingNodes = new Map<string, GraphNode>(
        graph.nodes.filter(n => n.kind === 'Opening').map(n => [n.guid, n]),
    );
    const openingsByWall = new Map<string, { offsetM: number; widthM: number }[]>();
    for (const e of graph.edges) {
        if (e.kind !== 'HOSTED_BY') continue;
        const op = openingNodes.get(e.from);
        if (!op) continue;
        const offsetM = typeof op.attrs.offsetM === 'number' ? op.attrs.offsetM : 0;
        const widthM  = typeof op.attrs.widthM  === 'number' ? op.attrs.widthM  : 0;
        if (widthM <= 0) continue;
        (openingsByWall.get(e.to) ?? openingsByWall.set(e.to, []).get(e.to)!).push({ offsetM, widthM });
    }
    const out: SightcastWall[] = [];
    for (const w of walls) {
        const bl = w.geometry?.baseLine;
        if (!bl || !bl[0] || !bl[1]) continue;
        out.push({
            baseLine: [bl[0], bl[1]],
            openings: openingsByWall.get(w.guid) ?? [],
        });
    }
    return out;
}

/**
 * Count the spaces directly visible from the entry via a centroid-to-centroid
 * ray-cast. A sight is "blocked" when a SOLID wall section crosses the line;
 * a crossing inside an opening (door or window) does NOT block.
 *
 * Returns 0 when entry has no polygon centroid (degenerate input). The
 * `scoreVisibleSpaceCount` companion turns the count into the 0..1 band.
 */
export function countVisibleSpacesByRaycast(
    graph: LayoutGraph,
    entryGuid: string,
): number {
    const spaces = graph.nodes.filter(n => n.kind === 'Space');
    const entry = spaces.find(n => n.guid === entryGuid);
    const entryPoly = entry?.geometry?.polygon;
    if (!entry || !entryPoly || entryPoly.length < 3) return 0;
    const entryC = polygonCentroid(entryPoly);

    const walls = gatherSightcastWalls(graph);

    let visible = 0;
    for (const s of spaces) {
        if (s.guid === entryGuid) continue;
        const poly = s.geometry?.polygon;
        if (!poly || poly.length < 3) continue;
        const targetC = polygonCentroid(poly);
        if (!isSightBlocked(entryC, targetC, walls)) visible++;
    }
    return visible;
}

/**
 * Combined helper — find the entry guid the same way computeObjectives does
 * (prefer hall-type space; fall back to depth-0 space) and return both the
 * visible count and the score band. Exposed so the wiring layer can pick
 * either the raycast band OR a graph-distance fallback when polygons are
 * missing.
 */
export function entrySightlineRaycastScore(
    graph: LayoutGraph,
    perSpaceDepth: Readonly<Record<string, number>>,
): { visibleCount: number; score: number; entryGuid: string | null } {
    const spaces = graph.nodes.filter(n => n.kind === 'Space');
    let entryGuid: string | null = null;
    for (const n of spaces) {
        if (n.attrs.spaceType === 'hall') { entryGuid = n.guid; break; }
    }
    if (entryGuid === null) {
        for (const n of spaces) {
            const d = perSpaceDepth[n.guid];
            if (d === 0) { entryGuid = n.guid; break; }
        }
    }
    if (entryGuid === null) {
        return { visibleCount: 0, score: 1.0, entryGuid: null };
    }
    const visibleCount = countVisibleSpacesByRaycast(graph, entryGuid);
    return { visibleCount, score: scoreVisibleSpaceCount(visibleCount), entryGuid };
}
