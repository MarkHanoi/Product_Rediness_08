// L5-ε-1 — SightlineGraph (Cognition L5 Perceptual Simulation, atom P1).
//
// L5 is "what does the apartment LOOK like to a person standing inside it".
// This first atom is the SUBSTRATE the rest of L5 builds on: for every pair
// of Space nodes (A, B) in a LayoutGraph, find the LONGEST UNOBSTRUCTED
// straight-line sight between A's polygon perimeter and B's polygon
// perimeter. Walls without an opening at the crossing point block sight;
// openings (doors / windows) do not.
//
// Downstream atoms (P2..) will use this graph for "visual cone", "axis-of-
// approach reveal", "borrowed light" and similar perceptual axes; the wire
// into objectives.ts is a SEPARATE slice — this module is pure substrate.
//
// API
//   buildSightlineGraph(graph, opts?) → SightlineGraph
//
// Determinism
//   • Pair iteration is in lexicographic order of (a.guid, b.guid) and the
//     returned edges preserve that order.
//   • Sample points per polygon are generated deterministically from the
//     polygon vertex order (corners + edge midpoints).
//   • No RNG, no I/O.
//
// Performance
//   O(spaces² × samples² × walls). With the default samplesPerEdge = 4 a 7-
//   room apartment yields ~21 pairs × 16 sight tests × ~20 walls ≈ 6700 sight
//   checks — fine for the pre-Pareto pass. If this becomes hot, switch the
//   wall lookup to a k-d tree.

import { gatherSightcastWalls, isSightBlocked, type SightcastWall } from './entrySightlineRaycast.js';
import type { GraphNode, LayoutGraph, Pt } from './semanticGraph.js';

// ── Public types ───────────────────────────────────────────────────────────

export interface SightlineEdge {
    /** Space guid (lexicographically smaller of the pair). */
    readonly a: string;
    /** Space guid (lexicographically larger of the pair). */
    readonly b: string;
    /**
     * Longest unobstructed sight between any sampled perimeter point of A
     * and any sampled perimeter point of B, in metres. `0` when every
     * sampled segment is blocked by a closed wall section. The pair is
     * still emitted (the existence of the pair is informational).
     */
    readonly lengthM: number;
}

export interface SightlineGraph {
    readonly edges: ReadonlyArray<SightlineEdge>;
}

export interface BuildSightlineGraphOptions {
    /**
     * Number of perimeter samples generated per polygon. Default = 4
     * (corners + edge midpoints, capped at 4 corners + 4 edge mids for a
     * rectangle; for an N-gon we generate corners and edge midpoints up to
     * the requested cap). MUST be ≥ 1.
     */
    readonly samplesPerEdge?: number;
}

// ── Implementation ─────────────────────────────────────────────────────────

const DEFAULT_SAMPLES = 4;

/**
 * Build the all-pairs longest-unobstructed-sightline graph from a semantic
 * `LayoutGraph`. Pure + deterministic.
 */
export function buildSightlineGraph(
    graph: LayoutGraph,
    opts?: BuildSightlineGraphOptions,
): SightlineGraph {
    const requested = opts?.samplesPerEdge ?? DEFAULT_SAMPLES;
    const samplesPerEdge = Math.max(1, Math.floor(requested));

    // Collect Space nodes with valid polygons (≥ 3 vertices), then sort
    // lexicographically by guid for deterministic pair iteration.
    const spaces: GraphNode[] = graph.nodes
        .filter(n => n.kind === 'Space')
        .filter(n => {
            const poly = n.geometry?.polygon;
            return !!poly && poly.length >= 3;
        })
        .slice()
        .sort((x, y) => (x.guid < y.guid ? -1 : x.guid > y.guid ? 1 : 0));

    if (spaces.length < 2) {
        return { edges: [] };
    }

    // Pre-sample every space's perimeter once; reused across O(N²) pairs.
    const samplesByGuid = new Map<string, ReadonlyArray<Pt>>();
    for (const s of spaces) {
        samplesByGuid.set(s.guid, samplePerimeter(s.geometry!.polygon!, samplesPerEdge));
    }

    // Walls (with openings) are shared by every pair.
    const walls: readonly SightcastWall[] = gatherSightcastWalls(graph);

    const edges: SightlineEdge[] = [];
    for (let i = 0; i < spaces.length; i++) {
        for (let j = i + 1; j < spaces.length; j++) {
            const a = spaces[i]!;
            const b = spaces[j]!;
            const sa = samplesByGuid.get(a.guid)!;
            const sb = samplesByGuid.get(b.guid)!;
            const lengthM = longestUnobstructed(sa, sb, walls);
            edges.push({ a: a.guid, b: b.guid, lengthM });
        }
    }

    return { edges };
}

/**
 * Sample the polygon perimeter deterministically. With `samples = 4` we
 * emit corners + edge midpoints (capped at the polygon vertex count when
 * smaller). Sampling order mirrors the polygon vertex order so the same
 * polygon always yields the same sample sequence.
 *
 * Strategy
 *   • Always emit every corner (preserves "long-diagonal" sights — the
 *     longest unobstructed sight between two rectangular rooms is almost
 *     always corner-to-corner).
 *   • Additionally emit `extra = max(0, samples - corners)` edge midpoints,
 *     distributed by walking the edges in order and pushing midpoints until
 *     `extra` is exhausted. For samples ≤ vertex-count this collapses to
 *     just corners.
 */
function samplePerimeter(polygon: readonly Pt[], samples: number): ReadonlyArray<Pt> {
    const corners: Pt[] = polygon.map(p => ({ x: p.x, z: p.z }));
    if (samples <= corners.length) {
        return corners;
    }
    const extra = samples - corners.length;
    const mids: Pt[] = [];
    for (let i = 0; i < polygon.length && mids.length < extra; i++) {
        const p = polygon[i]!;
        const q = polygon[(i + 1) % polygon.length]!;
        mids.push({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
    }
    return corners.concat(mids);
}

/**
 * For every (sa, sb) pair, test the segment for wall blockage; return the
 * maximum unblocked length. Returns 0 when every sample pair is blocked.
 */
function longestUnobstructed(
    sa: ReadonlyArray<Pt>,
    sb: ReadonlyArray<Pt>,
    walls: readonly SightcastWall[],
): number {
    let best = 0;
    for (const pa of sa) {
        for (const pb of sb) {
            if (isSightBlocked(pa, pb, walls)) continue;
            const dx = pb.x - pa.x;
            const dz = pb.z - pa.z;
            const len = Math.hypot(dx, dz);
            if (len > best) best = len;
        }
    }
    return best;
}
