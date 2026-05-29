// TGL P7 — the 5-axis objective vector (SPEC §4).
//
// Scores a finished LayoutGraph on five orthogonal architectural axes, each in
// [0,1], higher = better. P8 ranks candidates by a weighted sum of these; keeping
// the axes RAW (un-weighted) here lets P8 apply user weights + exact Pareto
// dominance without re-deriving anything.
//
//   efficiency   1 − corridorArea/totalArea            (less circulation = better)
//   adjacency    satisfied bubble edges / required     (graph vs BubbleGraph)
//   daylight     habitable area fronting the façade / habitable area
//   circulation  Space-Syntax gradient: public shallow, private deep  (← P6)
//   regularity   mean room aspect (→1) blended with axis alignment (always 1 here)
//
// Pure + deterministic. No geometry mutation, no RNG.

import type { BubbleGraph } from './bubbleGraph.js';
import type { LayoutGraph, GraphNode } from './semanticGraph.js';
import type { SyntaxMetrics } from './spaceSyntax.js';
import { preferenceBetween } from '../rules/programRules.js';

export interface ObjectiveVector {
    readonly efficiency: number;
    readonly adjacency: number;
    readonly daylight: number;
    readonly circulation: number;
    readonly regularity: number;
    /**
     * §PRIVACY-DEPTH (L2-β-1, 2026-05-29) — discrete-tier privacy-depth gradient,
     * COMPLEMENTING the existing `circulation` axis (which is area-weighted +
     * smooth). `hierarchy` rewards layouts where:
     *   • PRIVATE rooms (bedroom / master / bathroom / ensuite / wc) sit at
     *     graph depth ≥ 3 from the entry (deep, intimate).
     *   • PUBLIC rooms (living / dining / kitchen / hall) sit at depth ≤ 2
     *     (shallow, social).
     *   • Circulation rooms (corridor) are exempt — they bridge tiers.
     * Computed as `(area in correct tier) / (total scored area)`. Returns 1 when
     * every room is in its correct tier, 0 when every room is inverted. Pareto-
     * rank now distinguishes "private rooms genuinely deep" from "private rooms
     * one door from the entry" — the first emotionally-convincing-architecture
     * slice of the cognition stack Layer 2 (`APARTMENT-LAYOUT-STATUS §5.5`).
     */
    readonly hierarchy: number;
    /**
     * §SHAPE-QUALITY (D3.4, 2026-05-29) — fed by `validateRoomShape` soft
     * findings. Hard findings drop the candidate from the pool BEFORE Pareto;
     * soft findings (room area / width / aspect outside the comfortable bands)
     * accumulate as a fractional penalty here. Computed as
     *   1 − sum(softFindings.delta) / numRooms
     * clamped to [0, 1]. A layout with every room exactly in the comfortable
     * band scores 1; a layout with multiple borderline rooms scores lower.
     * Pareto-ranks "all-rooms-comfortable" above "rooms-fit-but-pinch".
     */
    readonly shapeQuality: number;
}

export const OBJECTIVE_AXES: readonly (keyof ObjectiveVector)[] =
    ['efficiency', 'adjacency', 'daylight', 'circulation', 'regularity', 'hierarchy', 'shapeQuality'] as const;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const polyWH = (n: GraphNode): { w: number; h: number } => {
    const p = n.geometry?.polygon ?? [];
    if (p.length < 3) return { w: 0, h: 0 };
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const pt of p) { if (pt.x < x0) x0 = pt.x; if (pt.x > x1) x1 = pt.x; if (pt.z < z0) z0 = pt.z; if (pt.z > z1) z1 = pt.z; }
    return { w: x1 - x0, h: z1 - z0 };
};

/**
 * Compute the raw 7-axis objective vector for a layout.
 *
 * `shapeQuality` is OPTIONAL and INJECTED by the caller — enumerate.ts knows the
 * per-room shapes + can run `validateRoomShape` against them. Default = 1
 * (no penalty) preserves every existing caller's behaviour. The default also
 * matches the "all rooms comfortable" outcome, so layouts without a shape
 * check ship at the optimistic upper bound rather than the pessimistic lower.
 */
export function computeObjectives(
    graph: LayoutGraph, metrics: SyntaxMetrics, bubble: BubbleGraph,
    shapeQuality: number = 1,
): ObjectiveVector {
    const spaces = graph.nodes.filter(n => n.kind === 'Space');
    const totalArea = spaces.reduce((s, n) => s + num(n.attrs.netAreaM2), 0);
    if (spaces.length === 0 || totalArea <= 0) {
        return { efficiency: 0, adjacency: 0, daylight: 0, circulation: 0, regularity: 0, hierarchy: 0, shapeQuality: clamp01(shapeQuality) };
    }

    // ── efficiency: how little of the floor is circulation. ──────────────────────
    const corridorArea = spaces.filter(n => n.attrs.spaceType === 'corridor' || n.attrs.spaceType === 'hall')
        .reduce((s, n) => s + num(n.attrs.netAreaM2), 0);
    const efficiency = clamp01(1 - corridorArea / totalArea);

    // ── adjacency: how many required bubble edges the placement actually realised,
    //    weighted by §ADJACENCY-PREFERENCE (queue #6). A missed kitchen↔dining edge
    //    (preference 1.0) costs more than a missed kitchen↔corridor edge (0.3).
    //    Missing preference → 1.0 weight, so rules without the field keep the old
    //    binary satisfied/required ratio.
    const guidOf = new Map(spaces.map(n => [n.sourceId, n.guid]));
    const typeBySource = new Map(bubble.rooms.map(r => [r.id, r.type]));
    const connectsThrough = new Set(graph.edges.filter(e => e.kind === 'CONNECTS_THROUGH').map(e => pairKey(e.from, e.to)));
    const permeableOpen = new Set(graph.edges.filter(e => e.kind === 'ADJACENT_TO' && e.props?.permeable === true).map(e => pairKey(e.from, e.to)));
    let requiredW = 0, satisfiedW = 0;
    for (const e of bubble.edges) {
        const ga = guidOf.get(e.a), gb = guidOf.get(e.b);
        if (!ga || !gb) continue;
        const tA = typeBySource.get(e.a), tB = typeBySource.get(e.b);
        const w = (tA && tB) ? preferenceBetween(tA, tB) : 1.0;
        requiredW += w;
        const key = pairKey(ga, gb);
        if (e.via === 'door' ? connectsThrough.has(key) : permeableOpen.has(key)) satisfiedW += w;
    }
    const adjacency = requiredW > 0 ? satisfiedW / requiredW : 1;

    // ── daylight: habitable rooms that can actually front the façade. ────────────
    const externalWalls = new Set(graph.nodes.filter(n => n.kind === 'Wall' && n.attrs.isExternal === true).map(n => n.guid));
    const frontsFacade = new Set<string>();
    for (const e of graph.edges) if (e.kind === 'BOUNDS' && externalWalls.has(e.from)) frontsFacade.add(e.to);
    let habArea = 0, litArea = 0;
    for (const n of spaces) {
        if (n.attrs.needsWindow !== true) continue;
        const a = num(n.attrs.netAreaM2);
        habArea += a;
        if (frontsFacade.has(n.guid)) litArea += a;
    }
    const daylight = habArea > 0 ? clamp01(litArea / habArea) : 1;

    // ── circulation: Space-Syntax gradient (public shallow, private deep). ────────
    let maxDepth = 0;
    for (const n of spaces) { const d = metrics.perSpaceDepth[n.guid]; if (Number.isFinite(d) && d! > maxDepth) maxDepth = d!; }
    let circWeighted = 0, circArea = 0;
    for (const n of spaces) {
        const a = num(n.attrs.netAreaM2);
        const d = metrics.perSpaceDepth[n.guid];
        const reward = !Number.isFinite(d) ? 0
            : maxDepth <= 0 ? (n.attrs.isPrivate === true ? 0 : 1)
                : n.attrs.isPrivate === true ? d! / maxDepth : 1 - d! / maxDepth;
        circWeighted += reward * a;
        circArea += a;
    }
    const circulation = circArea > 0 ? clamp01(circWeighted / circArea) : 0;

    // ── regularity: room aspect (→1) blended with axis alignment (1 here). ───────
    let aspectSum = 0, aspectN = 0;
    for (const n of spaces) {
        const { w, h } = polyWH(n);
        if (w > 0 && h > 0) { aspectSum += Math.min(w, h) / Math.max(w, h); aspectN++; }
    }
    const aspectMean = aspectN > 0 ? aspectSum / aspectN : 0;
    const regularity = clamp01(0.5 * aspectMean + 0.5 * 1);          // walls are axis-aligned ⇒ alignment = 1

    // ── §PRIVACY-DEPTH (L2-β-1): discrete-tier hierarchy gradient. ───────────────
    //   Public rooms should sit shallow (depth ≤ PUBLIC_MAX_DEPTH from entry);
    //   private rooms should sit deep (depth ≥ PRIVATE_MIN_DEPTH).
    //   Corridor / hall exempt — they BRIDGE tiers, not occupy them.
    //   Score = area in correct tier / total scored area.
    const PUBLIC_MAX_DEPTH = 2;
    const PRIVATE_MIN_DEPTH = 3;
    let hierWeighted = 0, hierArea = 0;
    for (const n of spaces) {
        const t = n.attrs.spaceType;
        // Skip exempt circulation tiers.
        if (t === 'corridor' || t === 'hall') continue;
        const a = num(n.attrs.netAreaM2);
        if (a <= 0) continue;
        const d = metrics.perSpaceDepth[n.guid];
        if (!Number.isFinite(d)) continue;
        hierArea += a;
        const isPriv = n.attrs.isPrivate === true;
        const inCorrectTier = isPriv
            ? d! >= PRIVATE_MIN_DEPTH
            : d! <= PUBLIC_MAX_DEPTH;
        if (inCorrectTier) hierWeighted += a;
    }
    const hierarchy = hierArea > 0 ? clamp01(hierWeighted / hierArea) : 1;

    return { efficiency, adjacency, daylight, circulation, regularity, hierarchy, shapeQuality: clamp01(shapeQuality) };
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
