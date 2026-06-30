// Residential building (multi-family) — the per-floor CIRCULATION CELL-GRAPH for the setup-modal
// preview (the resi sibling of the HOUSE modal's side-by-side "Living Graph" bubble graph).
//
// §RESI-CIRC-GRAPH (founder 2026-06-29: "the residential-house modal shows a Living-Graph
// circulation bubble graph; the resi-building setup modal does NOT — add it below the plan").
//
// CONSUME-ONLY of `apartment-layout/layoutBubbleGraph.ts` (Agent-1 is concurrently editing that
// renderer's INTERNALS — door-nodes — so we treat it as READ-ONLY and only call its PUBLIC
// `buildLayoutBubbleGraphSvg`). We do NOT fork or reimplement the SVG renderer. This thin adapter
// SYNTHESISES a `LayoutOption`-shaped graph for ONE residential FLOOR — each apartment CELL is a
// node, the central CORE (stair + lift) is the hub, and every apartment is connected to the core
// (its door fronts the public corridor → the core) — then hands it to the shared bubble renderer.
//
// PURE: no DOM, no THREE — returns an SVG STRING. Type-only ai-host import (erased at compile).
// Node positions are the apartment cell centroids (deterministic), so the graph mirrors the plan.

import type { ResidentialBuildingOk, PlacedApartment } from '@pryzm/ai-host';
import { buildLayoutBubbleGraphSvg, type BubbleGraphOptions } from '../apartment-layout/layoutBubbleGraph.js';

interface Rectish { x0: number; z0: number; x1: number; z1: number }

/** Resolve the level to graph: an explicit valid `levelIndex` (a Views-rail chip), else the first
 *  upper level carrying apartments, else any level with apartments, else the last. Mirrors the plan
 *  preview's `resolveLevelIndex` so the graph + plan always show the SAME floor. */
function resolveGraphLevel(result: ResidentialBuildingOk, requested?: number): number {
    const per = result.perLevelApartments;
    if (
        typeof requested === 'number' && Number.isInteger(requested) &&
        requested >= 0 && requested < result.levels.length &&
        (per[requested]?.apartments.length ?? 0) > 0
    ) {
        return requested;
    }
    let firstWithApts = -1;
    for (let i = 0; i < per.length; i++) {
        const p = per[i];
        if (!p || p.apartments.length === 0) continue;
        if (p.role === 'upper') return i;
        if (firstWithApts < 0) firstWithApts = i;
    }
    return firstWithApts >= 0 ? firstWithApts : Math.max(0, per.length - 1);
}

/** Minimal LayoutRoom-shaped node (only the fields `buildLayoutBubbleGraphSvg` reads: name, type,
 *  area, adjacentTo, centroid, occupancy). Typed loosely to avoid importing the full ai-host type
 *  surface; the bubble renderer treats unknown extra fields harmlessly. */
interface GraphNode {
    name: string;
    type: string;
    area: number;
    windowCount: number;
    hasDirectAccess: boolean;
    adjacentTo: string[];
    centroid: { x: number; y: number };
    occupancy: string;
}

/** Map a typology to an occupancy string the bubble palette colours (graduate bedroom→living so the
 *  larger units read warmer); the core/corridor map to circulation tones. */
const TYPO_OCCUPANCY: Record<string, string> = {
    T1: 'bedroom', T2: 'living-room', T3: 'living-room', T4: 'living-room',
};

/**
 * Build the residential floor's CIRCULATION bubble-graph SVG (string) for one level: the central
 * CORE as the hub node + one node per placed apartment, each apartment edged to the core (it fronts
 * the public corridor → the core), so the graph reads "stair/lift in the middle, apartments ringing
 * it" — the same Living-Graph language as the house modal. Returns '' when the level has no
 * apartments (the caller then renders no graph panel). Pure + deterministic.
 *
 * §RESI-CIRC-GRAPH — `opts.levelIndex` selects the floor (the Views-rail chip the user clicked);
 * omit it for the representative floor (kept in lock-step with the plan preview).
 */
export function buildResidentialCirculationGraphSvg(
    result: ResidentialBuildingOk,
    opts: { levelIndex?: number; width?: number; height?: number } = {},
): { svg: string; nodeCount: number } {
    const idx = resolveGraphLevel(result, opts.levelIndex);
    const per = result.perLevelApartments[idx];
    const apts = (per?.apartments ?? []) as readonly PlacedApartment[];
    const placed = apts.filter((a) => a.status === 'ok');
    if (placed.length === 0) return { svg: '', nodeCount: 0 };

    const core = result.core as Rectish;
    const coreCentre = { x: ((core.x0 + core.x1) / 2) * 1000, y: ((core.z0 + core.z1) / 2) * 1000 };

    const nodes: GraphNode[] = [];
    // The CORE hub — every apartment connects to it (the circulation spine reaches the stair/lift).
    const CORE_NAME = 'Core';
    nodes.push({
        name: CORE_NAME, type: 'corridor', area: 0, windowCount: 0, hasDirectAccess: true,
        adjacentTo: [], centroid: coreCentre, occupancy: 'corridor',
    });

    placed.forEach((a, i) => {
        const r = a.cell.rect as Rectish;
        const name = `${a.typology} ${i + 1}`;
        nodes.push({
            name,
            type: TYPO_OCCUPANCY[a.typology] === 'bedroom' ? 'bedroom' : 'living',
            area: Math.round(a.targetAreaM2),
            windowCount: 0,
            hasDirectAccess: true,
            // Each apartment fronts the public corridor → the core. Edge to the core hub.
            adjacentTo: [CORE_NAME],
            centroid: { x: ((r.x0 + r.x1) / 2) * 1000, y: ((r.z0 + r.z1) / 2) * 1000 },
            occupancy: TYPO_OCCUPANCY[a.typology] ?? 'living-room',
        });
        // Make the adjacency symmetric so the core node also lists this apartment (the bubble
        // renderer dedupes symmetric edges, so this only ensures the edge survives if a future
        // renderer reads one direction only).
        nodes[0]!.adjacentTo.push(name);
    });

    const bubbleOpts: BubbleGraphOptions = {
        width: opts.width ?? 460,
        height: opts.height ?? 180,
        background: 'none',
        showLabels: true,
    };
    // CONSUME the shared renderer. The synthetic option only needs `rooms`; the other LayoutOption
    // fields are unused by `buildLayoutBubbleGraphSvg`. Cast through unknown to satisfy its param type
    // without importing the full LayoutOption surface (we supply exactly the fields it reads).
    const option = { summary: 'residential floor circulation', rooms: nodes } as unknown as Parameters<typeof buildLayoutBubbleGraphSvg>[0];
    const svg = buildLayoutBubbleGraphSvg(option, bubbleOpts);
    return { svg, nodeCount: placed.length };
}
