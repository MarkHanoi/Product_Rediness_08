// TGL P5 — the persistent BIM3.0 semantic graph (SPEC §3).
//
// This is the engine's PRIMARY output. Geometry (P9) is emitted FROM it; analyses
// (cost/energy/structure) attach TO it without regenerating geometry — the
// digital-twin bridge. It is a typed property graph of Space / Wall / Opening /
// Door / Level nodes and BOUNDS / ADJACENT_TO / CONNECTS_THROUGH / HOSTED_BY /
// FILLS / CONTAINS edges, each node carrying a deterministic IFC GlobalId (§3.4)
// and open Psets for downstream enrichment. The C15 hosted-opening cascade is
// modelled exactly: Door --FILLS--> Opening --HOSTED_BY--> Wall.
//
// Pure + deterministic: stable creation order, sorted output, hashed GUIDs.

import type { BubbleGraph } from './bubbleGraph.js';
import type { Pt } from './rectDecomposition.js';
import type { RoomPlacement } from './subdivide.js';
import type { OpeningSpec, WallSeg } from './wallsAndDoors.js';
import { ifcGuid } from './ifcGuid.js';

// Re-export `Pt` so downstream modules (eg `entrySightlineRaycast.ts`)
// can import it from this aggregate semantic-graph barrel rather than
// reaching into `rectDecomposition.js` directly.
export type { Pt };

export type Primitive = string | number | boolean;
export type NodeKind = 'Space' | 'Wall' | 'Opening' | 'Door' | 'Window' | 'Level';
export type EdgeKind = 'BOUNDS' | 'ADJACENT_TO' | 'CONNECTS_THROUGH' | 'HOSTED_BY' | 'FILLS' | 'CONTAINS';

export interface GraphNode {
    readonly guid: string;
    readonly kind: NodeKind;
    /** Stable source id (roomId / wallId / openingId) this node was built from. */
    readonly sourceId: string;
    readonly attrs: Readonly<Record<string, Primitive>>;
    readonly geometry?: { readonly polygon?: readonly Pt[]; readonly baseLine?: readonly [Pt, Pt] };
    readonly psets: Readonly<Record<string, Readonly<Record<string, Primitive>>>>;
}

export interface GraphEdge {
    readonly kind: EdgeKind;
    readonly from: string;                  // node guid
    readonly to: string;                    // node guid
    readonly via?: string;                  // door guid for CONNECTS_THROUGH
    readonly props?: Readonly<Record<string, Primitive>>;
}

export interface LayoutGraph {
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly meta: { readonly shellAreaM2: number; readonly levelId: string; readonly seed: string };
}

export interface SemanticGraphMeta {
    readonly levelId: string;
    readonly seed: string;
    readonly shellAreaM2: number;
    readonly wallHeightM?: number;          // default 2.7
    readonly elevationM?: number;           // default 0
    readonly levelName?: string;            // default 'Level'
}

const rectPolygon = (r: { x0: number; z0: number; x1: number; z1: number }): Pt[] =>
    [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];
const rectArea = (r: { x0: number; z0: number; x1: number; z1: number }): number =>
    Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Build the persistent LayoutGraph from the realised layout. `placements` (P3b),
 * `segments`/`openings` (P4) and the `graph` (P2, for open-plan thresholds) are
 * woven into one graph with deterministic GUIDs.
 */
export function buildSemanticGraph(
    placements: readonly RoomPlacement[],
    segments: readonly WallSeg[],
    openings: readonly OpeningSpec[],
    graph: BubbleGraph,
    meta: SemanticGraphMeta,
): LayoutGraph {
    const seed = meta.seed;
    const wallH = meta.wallHeightM ?? 2.7;
    const roomById = new Map(graph.rooms.map(r => [r.id, r]));

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // ── Level ──────────────────────────────────────────────────────────────────
    const levelGuid = ifcGuid(seed, 'Level', 0, meta.levelId);
    nodes.push({
        guid: levelGuid, kind: 'Level', sourceId: meta.levelId,
        attrs: { name: meta.levelName ?? 'Level', elevationM: meta.elevationM ?? 0 },
        psets: {},
    });

    // ── Spaces ───────────────────────────────────────────────────────────────────
    const spaceGuid = new Map<string, string>();           // roomId → guid
    placements.forEach((p, i) => {
        const r = roomById.get(p.roomId);
        const guid = ifcGuid(seed, 'Space', i, p.roomId);
        spaceGuid.set(p.roomId, guid);
        const netArea = rectArea(p.rect);
        nodes.push({
            guid, kind: 'Space', sourceId: p.roomId,
            attrs: {
                name: r?.name ?? p.roomId, spaceType: r?.type ?? 'utility',
                netAreaM2: round6(netArea), targetAreaM2: r?.targetAreaM2 ?? 0,
                isPrivate: r?.isPrivate ?? false, needsWindow: r?.needsWindow ?? false,
            },
            geometry: { polygon: rectPolygon(p.rect) },
            psets: { Pset_SpaceCommon: { NetFloorArea: round6(netArea), IsExternal: false, PubliclyAccessible: !(r?.isPrivate ?? false) } },
        });
        edges.push({ kind: 'CONTAINS', from: levelGuid, to: guid });
    });

    // ── Walls (+ BOUNDS, + ADJACENT_TO for solid shared walls) ───────────────────
    const wallGuid = new Map<string, string>();            // sourceWallId → guid
    const adjacency = new Map<string, GraphEdge>();        // dedup space-pair → ADJACENT_TO
    segments.forEach((s, i) => {
        const guid = ifcGuid(seed, 'Wall', i, s.id);
        wallGuid.set(s.id, guid);
        const isExternal = s.boundsRoomIds.length === 1;
        nodes.push({
            guid, kind: 'Wall', sourceId: s.id,
            attrs: { thickness: s.thickness, heightM: wallH, isExternal },
            geometry: { baseLine: [s.a, s.b] },
            psets: { Pset_WallCommon: { IsExternal: isExternal, LoadBearing: false, ThermalTransmittance: 0 } },
        });
        for (const rid of s.boundsRoomIds) {
            const sg = spaceGuid.get(rid);
            if (sg) edges.push({ kind: 'BOUNDS', from: guid, to: sg });
        }
        if (s.boundsRoomIds.length === 2) {
            const [a, b] = s.boundsRoomIds as readonly [string, string];
            const ga = spaceGuid.get(a), gb = spaceGuid.get(b);
            if (ga && gb) adjacency.set(pairKey(a, b), { kind: 'ADJACENT_TO', from: ga, to: gb, props: { boundary: 'wall', permeable: false } });
        }
    });

    // Open-plan thresholds (P2 'open' edges): permeable ADJACENT_TO, no wall.
    for (const e of graph.edges) {
        if (e.via !== 'open') continue;
        const ga = spaceGuid.get(e.a), gb = spaceGuid.get(e.b);
        if (ga && gb) adjacency.set(pairKey(e.a, e.b), { kind: 'ADJACENT_TO', from: ga, to: gb, props: { boundary: 'open', permeable: true } });
    }
    for (const a of adjacency.values()) edges.push(a);

    // ── Openings + Doors (C15 cascade: Door --FILLS--> Opening --HOSTED_BY--> Wall)
    openings.forEach((o, i) => {
        const wg = wallGuid.get(o.wallId);
        if (!wg) return;                                    // host wall missing → skip
        const openGuid = ifcGuid(seed, 'Opening', i, o.id);
        nodes.push({
            guid: openGuid, kind: 'Opening', sourceId: o.id,
            attrs: { offsetM: o.offsetM, widthM: o.widthM, heightM: o.heightM, sillM: o.sillM },
            psets: {},
        });
        edges.push({ kind: 'HOSTED_BY', from: openGuid, to: wg });

        const fillKind: NodeKind = o.type === 'window' ? 'Window' : 'Door';
        const fillGuid = ifcGuid(seed, fillKind, i, o.id);
        nodes.push({
            guid: fillGuid, kind: fillKind, sourceId: o.id,
            attrs: fillKind === 'Door'
                ? { widthM: o.widthM, heightM: o.heightM, operation: 'SINGLE_SWING_LEFT' }
                : { widthM: o.widthM, sillM: o.sillM },
            psets: {},
        });
        edges.push({ kind: 'FILLS', from: fillGuid, to: openGuid });

        // CONNECTS_THROUGH (the space-syntax permeability edge), via the door.
        const [a, b] = o.betweenRoomIds;
        const ga = a ? spaceGuid.get(a) : undefined;
        const gb = b ? spaceGuid.get(b) : undefined;
        if (ga && gb) edges.push({ kind: 'CONNECTS_THROUGH', from: ga, to: gb, via: fillGuid });
    });

    return {
        nodes: sortNodes(nodes),
        edges: sortEdges(edges),
        meta: { shellAreaM2: round6(meta.shellAreaM2), levelId: meta.levelId, seed },
    };
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const KIND_ORDER: NodeKind[] = ['Level', 'Space', 'Wall', 'Opening', 'Door', 'Window'];
const EDGE_ORDER: EdgeKind[] = ['CONTAINS', 'BOUNDS', 'ADJACENT_TO', 'CONNECTS_THROUGH', 'HOSTED_BY', 'FILLS'];

function sortNodes(ns: GraphNode[]): GraphNode[] {
    return [...ns].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0));
}
function sortEdges(es: GraphEdge[]): GraphEdge[] {
    return [...es].sort((a, b) =>
        EDGE_ORDER.indexOf(a.kind) - EDGE_ORDER.indexOf(b.kind) ||
        (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) ||
        (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) ||
        ((a.via ?? '') < (b.via ?? '') ? -1 : (a.via ?? '') > (b.via ?? '') ? 1 : 0));
}

/** Convenience selectors used by P6/P7/P9. */
export const nodesOfKind = (g: LayoutGraph, kind: NodeKind): GraphNode[] => g.nodes.filter(n => n.kind === kind);
export const edgesOfKind = (g: LayoutGraph, kind: EdgeKind): GraphEdge[] => g.edges.filter(e => e.kind === kind);
