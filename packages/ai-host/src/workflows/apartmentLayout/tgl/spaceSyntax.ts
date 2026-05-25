// TGL P6 — Space Syntax analysis (Hillier & Hanson 1984).
//
// Treats the LayoutGraph's PERMEABILITY edges as the "justified graph": doors
// (CONNECTS_THROUGH) + open thresholds (ADJACENT_TO where permeable). From the
// entrance space we compute, per space:
//   depth        — connection-step distance from the entrance (circulation gradient)
//   meanDepth MD  — Σ depth / (n−1) with each space as root
//   RA            — 2(MD−1)/(n−2)            (relative asymmetry)
//   integration   — 1 / RRA, RRA = RA / D_n  (Hillier's D_n normalisation)
//
// These feed P7's `circulation` axis: a layout where the living room is shallow
// and bedrooms are deep (public-shallow / private-deep) scores well. Pure +
// deterministic (BFS over sorted adjacency); a disconnected graph is FLAGGED, not
// NaN. No geometry, no RNG.

import type { LayoutGraph } from './semanticGraph.js';

export interface SyntaxMetrics {
    /** Connection-step depth of each space from the entrance (Infinity if unreachable). Keyed by space guid. */
    readonly perSpaceDepth: Readonly<Record<string, number>>;
    /** Mean depth from the entrance (Σ depth / reachable count). */
    readonly meanDepth: number;
    /** Relative asymmetry from the entrance. */
    readonly relativeAsymmetry: number;
    /** Per-space integration value (1/RRA), each space taken as root. Keyed by space guid. */
    readonly integration: Readonly<Record<string, number>>;
    /** Number of spaces (graph order). */
    readonly n: number;
    /** False when some space is unreachable from the entrance (degenerate placement). */
    readonly connected: boolean;
    /** The entrance space guid actually used as root. */
    readonly entryGuid: string | null;
}

/** Hillier's D_n: mean depth of a "diamond"-shaped justified graph of n nodes. */
function diamondValue(n: number): number {
    if (n <= 2) return 1;
    return (2 * (n * (Math.log2((n + 2) / 3) - 1) + 1)) / ((n - 1) * (n - 2));
}

/** Permeability adjacency (doors + open thresholds), as a sorted-key map. */
function permeabilityAdjacency(graph: LayoutGraph): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    const link = (a: string, b: string): void => {
        (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
        (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    };
    for (const e of graph.edges) {
        if (e.kind === 'CONNECTS_THROUGH') link(e.from, e.to);
        else if (e.kind === 'ADJACENT_TO' && e.props?.permeable === true) link(e.from, e.to);
    }
    for (const [, ns] of adj) ns.sort();                  // stable BFS order (§6)
    return adj;
}

/** BFS depths from `root` over `adj`; unreachable nodes are Infinity. */
function bfsDepths(root: string, spaces: readonly string[], adj: Map<string, string[]>): Map<string, number> {
    const depth = new Map<string, number>(spaces.map(s => [s, Infinity]));
    depth.set(root, 0);
    const queue = [root];
    while (queue.length) {
        const cur = queue.shift()!;
        const d = depth.get(cur)!;
        for (const nb of adj.get(cur) ?? []) {
            if (depth.get(nb) === Infinity) { depth.set(nb, d + 1); queue.push(nb); }
        }
    }
    return depth;
}

/** Mean depth from one root over the spaces it can reach (NaN-safe). */
function meanDepthFrom(root: string, spaces: readonly string[], adj: Map<string, string[]>): { md: number; reachedAll: boolean } {
    const depth = bfsDepths(root, spaces, adj);
    let sum = 0, k = 0, unreached = false;
    for (const s of spaces) {
        if (s === root) continue;
        const d = depth.get(s)!;
        if (Number.isFinite(d)) { sum += d; k++; } else unreached = true;
    }
    return { md: k > 0 ? sum / k : 0, reachedAll: !unreached };
}

/**
 * Compute Space-Syntax metrics for the layout, rooting circulation depth at
 * `entrySpaceGuid` (falls back to the first space if absent). Deterministic.
 */
export function computeSpaceSyntax(graph: LayoutGraph, entrySpaceGuid: string | null): SyntaxMetrics {
    const spaces = graph.nodes.filter(n => n.kind === 'Space').map(n => n.guid).sort();
    const n = spaces.length;
    const adj = permeabilityAdjacency(graph);

    if (n === 0) {
        return { perSpaceDepth: {}, meanDepth: 0, relativeAsymmetry: 0, integration: {}, n: 0, connected: true, entryGuid: null };
    }
    const entry = entrySpaceGuid && spaces.includes(entrySpaceGuid) ? entrySpaceGuid : spaces[0]!;

    // Depths + connectivity from the entrance.
    const entryDepths = bfsDepths(entry, spaces, adj);
    const perSpaceDepth: Record<string, number> = {};
    let connected = true;
    for (const s of spaces) {
        const d = entryDepths.get(s)!;
        perSpaceDepth[s] = d;
        if (!Number.isFinite(d)) connected = false;
    }
    const entryMD = meanDepthFrom(entry, spaces, adj).md;
    const Dn = diamondValue(n);
    const raFrom = (md: number): number => (n > 2 ? (2 * (md - 1)) / (n - 2) : 0);
    const relativeAsymmetry = raFrom(entryMD);

    // Per-space integration (each space as root).
    const integration: Record<string, number> = {};
    for (const s of spaces) {
        if (n <= 2) { integration[s] = 1; continue; }
        const { md } = meanDepthFrom(s, spaces, adj);
        const ra = raFrom(md);
        const rra = ra / Dn;
        integration[s] = rra > 1e-9 ? 1 / rra : 0;
    }

    return { perSpaceDepth, meanDepth: entryMD, relativeAsymmetry, integration, n, connected, entryGuid: entry };
}
