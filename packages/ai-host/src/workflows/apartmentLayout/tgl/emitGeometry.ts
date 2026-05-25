// TGL P9 — geometry emission: LayoutGraph → LayoutOption.
//
// Projects the persistent semantic graph (P5) into the plain LayoutOption the
// EXISTING editor pipeline consumes (buildLayoutCommands → wall.batch.create +
// wall.createOpening + door.batch.create). The graph stays the source of truth;
// this is a structure-preserving projection:
//   Space → LayoutRoom, Wall → LayoutWall, Door → LayoutDoor (wallRef + offset).
// Units: graph is METRES {x,z}; LayoutOption is MILLIMETRES {x,y} with plan-y = z
// (matches executePlan.defaultPlanToWorld: x/1000, z=y/1000). Conversion is ×1000.
//
// Returns the option PLUS index-aligned node GUIDs so the wiring can mint the real
// element ids FROM the deterministic GUIDs (door elementId === door GUID — C15).
// Pure + deterministic (graph nodes are already sorted).

import type { LayoutOption, LayoutRoom, RoomType } from '../types.js';
import type { GraphNode, LayoutGraph } from './semanticGraph.js';

export interface EmittedLayout {
    readonly option: LayoutOption;
    /** Wall GUID per option.walls index. */
    readonly wallGuids: readonly string[];
    /** Door GUID per option.doors index (C15: becomes the created door elementId). */
    readonly doorGuids: readonly string[];
    /** Space GUID per option.rooms index. */
    readonly spaceGuids: readonly string[];
}

export interface EmitGeometryOpts {
    /** Emit only INTERIOR partition walls (drop perimeter/exterior walls). Use when
     *  building into an EXISTING shell so D-TGL never duplicates the shell's
     *  perimeter walls — duplicate coincident walls break room detection. Doors are
     *  hosted on interior walls only, so dropping exterior walls orphans none. */
    readonly interiorWallsOnly?: boolean;
}

const MM = 1000;
const mm = (m: number): number => Math.round(m * MM * 1e6) / 1e6;
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

/** Project a LayoutGraph to a LayoutOption (+ aligned GUIDs). */
export function emitGeometry(graph: LayoutGraph, opts: EmitGeometryOpts = {}): EmittedLayout {
    const spaceNodes = graph.nodes.filter(n => n.kind === 'Space');
    const allWallNodes = graph.nodes.filter(n => n.kind === 'Wall');
    // Interior-only build drops perimeter walls (the shell already supplies them).
    const wallNodes = opts.interiorWallsOnly ? allWallNodes.filter(n => n.attrs.isExternal !== true) : allWallNodes;
    const doorNodes = graph.nodes.filter(n => n.kind === 'Door');
    const openingByGuid = new Map(graph.nodes.filter(n => n.kind === 'Opening').map(n => [n.guid, n]));

    const wallIndex = new Map(wallNodes.map((n, i) => [n.guid, i]));
    const nameByGuid = new Map(spaceNodes.map(n => [n.guid, str(n.attrs.name, n.sourceId)]));

    // Permeability + adjacency neighbours per space (for adjacentTo / hasDirectAccess).
    const neighbours = new Map<string, Set<string>>();
    const addNb = (a: string, b: string): void => {
        (neighbours.get(a) ?? neighbours.set(a, new Set()).get(a)!).add(b);
        (neighbours.get(b) ?? neighbours.set(b, new Set()).get(b)!).add(a);
    };
    const permeable = new Map<string, Set<string>>();
    const addPerm = (a: string, b: string): void => {
        (permeable.get(a) ?? permeable.set(a, new Set()).get(a)!).add(b);
        (permeable.get(b) ?? permeable.set(b, new Set()).get(b)!).add(a);
    };
    for (const e of graph.edges) {
        if (e.kind === 'ADJACENT_TO') { addNb(e.from, e.to); if (e.props?.permeable === true) addPerm(e.from, e.to); }
        else if (e.kind === 'CONNECTS_THROUGH') { addNb(e.from, e.to); addPerm(e.from, e.to); }
    }

    // External walls bounding a space → window capability. Always computed from the
    // FULL wall set, so window/daylight is correct even in interior-only emit.
    const externalWalls = new Set(allWallNodes.filter(n => n.attrs.isExternal === true).map(n => n.guid));
    const frontsFacade = new Set<string>();
    for (const e of graph.edges) if (e.kind === 'BOUNDS' && externalWalls.has(e.from)) frontsFacade.add(e.to);

    // ── Rooms ────────────────────────────────────────────────────────────────────
    const rooms: LayoutRoom[] = [];
    const spaceGuids: string[] = [];
    for (const n of spaceNodes) {
        spaceGuids.push(n.guid);
        const needsWindow = n.attrs.needsWindow === true;
        rooms.push({
            name: str(n.attrs.name, n.sourceId),
            type: (str(n.attrs.spaceType, 'utility') as RoomType),
            area: num(n.attrs.netAreaM2),
            windowCount: needsWindow && frontsFacade.has(n.guid) ? 1 : 0,
            hasDirectAccess: (permeable.get(n.guid)?.size ?? 0) > 0,
            adjacentTo: [...(neighbours.get(n.guid) ?? [])].map(g => nameByGuid.get(g) ?? g).sort(),
        });
    }

    // ── Walls ────────────────────────────────────────────────────────────────────
    const walls = wallNodes.map(wallToLayout);
    const wallGuids = wallNodes.map(n => n.guid);

    // ── Doors (Door → FILLS → Opening → HOSTED_BY → Wall) ────────────────────────
    const fillsOpening = new Map(graph.edges.filter(e => e.kind === 'FILLS').map(e => [e.from, e.to]));
    const hostWall = new Map(graph.edges.filter(e => e.kind === 'HOSTED_BY').map(e => [e.from, e.to]));
    const doors: LayoutOption['doors'] = [];
    const doorGuids: string[] = [];
    for (const d of doorNodes) {
        const openGuid = fillsOpening.get(d.guid);
        const wallGuid = openGuid ? hostWall.get(openGuid) : undefined;
        const wallRef = wallGuid !== undefined ? wallIndex.get(wallGuid) : undefined;
        const opening = openGuid ? openingByGuid.get(openGuid) : undefined;
        if (wallRef === undefined || !opening) continue;            // broken cascade → skip
        doors.push({ wallRef, offset: mm(num(opening.attrs.offsetM)), width: mm(num(opening.attrs.widthM)) });
        doorGuids.push(d.guid);
    }

    // corridorWidthMin: narrowest corridor dimension (mm), else 0.
    let corridorWidthMin = 0;
    for (const n of spaceNodes) {
        if (n.attrs.spaceType !== 'corridor') continue;
        const { w, h } = polyWH(n);
        const c = mm(Math.min(w, h));
        corridorWidthMin = corridorWidthMin === 0 ? c : Math.min(corridorWidthMin, c);
    }

    const option: LayoutOption = {
        summary: `D-TGL layout — ${rooms.length} rooms, ${walls.length} walls, ${doors.length} doors`,
        rooms, walls, doors, corridorWidthMin,
    };
    return { option, wallGuids, doorGuids, spaceGuids };
}

function wallToLayout(n: GraphNode): LayoutOption['walls'][number] {
    const bl = n.geometry?.baseLine;
    const a = bl?.[0] ?? { x: 0, z: 0 };
    const b = bl?.[1] ?? { x: 0, z: 0 };
    return { start: { x: mm(a.x), y: mm(a.z) }, end: { x: mm(b.x), y: mm(b.z) } };
}

function polyWH(n: GraphNode): { w: number; h: number } {
    const p = n.geometry?.polygon ?? [];
    if (p.length < 3) return { w: 0, h: 0 };
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const pt of p) { if (pt.x < x0) x0 = pt.x; if (pt.x > x1) x1 = pt.x; if (pt.z < z0) z0 = pt.z; if (pt.z > z1) z1 = pt.z; }
    return { w: x1 - x0, h: z1 - z0 };
}
