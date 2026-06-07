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
import { occupancyOf } from '../rules/programRules.js';
import { emitWindowsForRoom } from '../windowEmission/emitWindows.js';
import type { ExternalWallSegment, OccupiedSpan, PartitionJunction } from '../windowEmission/types.js';

export interface EmittedLayout {
    readonly option: LayoutOption;
    /** Wall GUID per option.walls index. */
    readonly wallGuids: readonly string[];
    /** Door GUID per option.doors index (C15: becomes the created door elementId). */
    readonly doorGuids: readonly string[];
    /** Space GUID per option.rooms index. */
    readonly spaceGuids: readonly string[];
}


const MM = 1000;
const mm = (m: number): number => Math.round(m * MM * 1e6) / 1e6;

// D-TGL RoomType → editor RoomOccupancyType comes from the single-source-of-truth
// rules database (occupancyOf), so detected rooms are coloured/tagged by use.
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

/** Optional emit-time context. A.21.D6 — `solar.sunDir` is the equator/sun-facing
 *  unit direction IN THE EMIT FRAME (x=world-x, y=world-z; already rotated into the
 *  principal-axis frame by the caller), used to bias window placement toward the
 *  sun-facing façade. Absent → pure-length placement (no behaviour change). */
export interface EmitGeometryOpts {
    readonly solar?: {
        readonly sunDir: { readonly x: number; readonly y: number };
        readonly weight?: number;
        /** A.21.D6.3 — site latitude for climate-driven glazing SIZE. */
        readonly latDeg?: number;
    };
}

/** Project a LayoutGraph to a LayoutOption (+ aligned GUIDs).
 *  ALL walls are emitted (perimeter walls flagged `isExternal`) so the preview
 *  shows the complete plan; the build step skips exterior walls (the shell already
 *  exists) — see buildLayoutPlan({ skipExteriorWalls }). */
export function emitGeometry(graph: LayoutGraph, opts?: EmitGeometryOpts): EmittedLayout {
    const spaceNodes = graph.nodes.filter(n => n.kind === 'Space');
    const allWallNodes = graph.nodes.filter(n => n.kind === 'Wall');
    const wallNodes = allWallNodes;
    const doorNodes = graph.nodes.filter(n => n.kind === 'Door');
    const openingByGuid = new Map(graph.nodes.filter(n => n.kind === 'Opening').map(n => [n.guid, n]));
    const nameByGuidAll = new Map(spaceNodes.map(n => [n.guid, str(n.attrs.name, n.sourceId)]));
    // Door → the two spaces it connects (CONNECTS_THROUGH carries via = door guid).
    const doorConnects = new Map<string, [string, string]>();
    for (const e of graph.edges) if (e.kind === 'CONNECTS_THROUGH' && e.via) doorConnects.set(e.via, [e.from, e.to]);

    const wallIndex = new Map(wallNodes.map((n, i) => [n.guid, i]));
    const nameByGuid = new Map(spaceNodes.map(n => [n.guid, str(n.attrs.name, n.sourceId)]));
    // T1.D (2026-05-30) — spaceType (= RoomType) per space guid; used to populate
    // LayoutDoor.roomTypeA/B so executePlan can call defaultDoorSystemTypeId
    // for the per-pair finish (privacy / glazed / solid-timber).
    const typeByGuid = new Map<string, RoomType>(
        spaceNodes.map(n => [n.guid, (str(n.attrs.spaceType, 'utility') as RoomType)]),
    );

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
        const { cx, cz } = polyCentroid(n);
        const spaceType = str(n.attrs.spaceType, 'utility');
        const polyM = n.geometry?.polygon ?? [];
        // mm-projected polygon (plan-y = world-z). Empty when the space has no
        // geometry (shouldn't happen in production but keeps the type honest).
        const polygonMm = polyM.map(p => ({ x: mm(p.x), y: mm(p.z) }));
        rooms.push({
            name: str(n.attrs.name, n.sourceId),
            type: (spaceType as RoomType),
            area: num(n.attrs.netAreaM2),
            windowCount: needsWindow && frontsFacade.has(n.guid) ? 1 : 0,
            hasDirectAccess: (permeable.get(n.guid)?.size ?? 0) > 0,
            adjacentTo: [...(neighbours.get(n.guid) ?? [])].map(g => nameByGuid.get(g) ?? g).sort(),
            centroid: { x: mm(cx), y: mm(cz) },
            ...(polygonMm.length >= 3 ? { polygon: polygonMm } : {}),
            occupancy: occupancyOf(spaceType),
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
        const conn = doorConnects.get(d.guid);
        const name = conn ? `${nameByGuidAll.get(conn[0]) ?? '?'} – ${nameByGuidAll.get(conn[1]) ?? '?'} Door` : 'Door';
        // T1.D (2026-05-30) — when the door connects two known spaces, carry
        // their RoomType through so executePlan can resolve a per-pair finish.
        const roomTypeA = conn ? typeByGuid.get(conn[0]) : undefined;
        const roomTypeB = conn ? typeByGuid.get(conn[1]) : undefined;
        doors.push({
            wallRef,
            offset: mm(num(opening.attrs.offsetM)),
            width:  mm(num(opening.attrs.widthM)),
            name,
            ...(roomTypeA ? { roomTypeA } : {}),
            ...(roomTypeB ? { roomTypeB } : {}),
        });
        doorGuids.push(d.guid);
    }

    // ── Windows (T1.W-B 2026-05-30 — D-TGL → window emission engine) ────────────
    // For every space that BOUNDS an external wall AND wants a window, run the
    // pure placement engine. Per-space external walls come from the BOUNDS
    // edges (wall.from → space.to) filtered by the externalWalls set the
    // façade-fronting pass already computed.
    const externalWallsBySpace = new Map<string, ExternalWallSegment[]>();
    for (const e of graph.edges) {
        if (e.kind !== 'BOUNDS' || !externalWalls.has(e.from)) continue;
        const wallNode = allWallNodes.find(w => w.guid === e.from);
        const wRef = wallIndex.get(e.from);
        if (!wallNode || wRef === undefined) continue;
        const bl = wallNode.geometry?.baseLine;
        if (!bl || !bl[0] || !bl[1]) continue;
        const seg: ExternalWallSegment = {
            start:     { x: mm(bl[0].x), y: mm(bl[0].z) },
            end:       { x: mm(bl[1].x), y: mm(bl[1].z) },
            wallIndex: wRef,
        };
        (externalWallsBySpace.get(e.to) ?? externalWallsBySpace.set(e.to, []).get(e.to)!).push(seg);
    }

    // T1.W-B-2 (door avoidance) — door footprints per wall index, so an emitted
    // window is never carved over a door on the SAME wall. Each door is a
    // Door --FILLS--> Opening --HOSTED_BY--> Wall cascade; the Opening carries
    // offsetM + widthM. Project to mm-along-wall spans keyed by wall index.
    const doorSpansByWall: OccupiedSpan[] = [];
    for (const d of doorNodes) {
        const openGuid = fillsOpening.get(d.guid);
        const wallGuid = openGuid ? hostWall.get(openGuid) : undefined;
        const wRef = wallGuid !== undefined ? wallIndex.get(wallGuid) : undefined;
        const opening = openGuid ? openingByGuid.get(openGuid) : undefined;
        if (wRef === undefined || !opening) continue;
        const offMm = mm(num(opening.attrs.offsetM));
        const wMm = mm(num(opening.attrs.widthM));
        doorSpansByWall.push({ wallIndex: wRef, startMm: offMm, endMm: offMm + wMm });
    }

    // A.21.D33(d) — interior-partition junctions on the SHELL walls. An INTERIOR
    // (non-external) partition wall's endpoint can land exactly on an external shell
    // wall where two rooms' boundary meets the perimeter — and a window emitted on
    // that shell wall could then sit on the partition/shell junction (architecturally
    // wrong: the partition must meet solid wall, the window must lie within one room's
    // façade). For each external wall we record the along-wall offset of every
    // interior-wall endpoint that touches it (within a tolerance), carrying the
    // partition's thickness so the placer keeps the window clear of that footprint.
    const interiorWallNodes = allWallNodes.filter(n => n.attrs.isExternal !== true);
    const partitionJunctions: PartitionJunction[] = [];
    // Tolerance (mm) for an interior endpoint being judged "on" the shell wall line.
    const ON_WALL_TOL_MM = 60;
    for (const e of graph.edges) {
        if (e.kind !== 'BOUNDS' || !externalWalls.has(e.from)) continue;
        const shellNode = allWallNodes.find(w => w.guid === e.from);
        const wRef = wallIndex.get(e.from);
        if (!shellNode || wRef === undefined) continue;
        const bl = shellNode.geometry?.baseLine;
        if (!bl || !bl[0] || !bl[1]) continue;
        const sa = { x: mm(bl[0].x), y: mm(bl[0].z) };
        const sb = { x: mm(bl[1].x), y: mm(bl[1].z) };
        const dx = sb.x - sa.x, dy = sb.y - sa.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const ux = dx / len, uy = dy / len;
        for (const iw of interiorWallNodes) {
            const ibl = iw.geometry?.baseLine;
            if (!ibl || !ibl[0] || !ibl[1]) continue;
            const thicknessMm = mm(num(iw.attrs.thickness, 0.1));
            // Each endpoint of the interior wall: project onto the shell line; keep it
            // when it is ON the segment (perp within tol, param within [0,len]).
            for (const ep of [ibl[0], ibl[1]] as const) {
                const px = mm(ep.x), py = mm(ep.z);
                const rx = px - sa.x, ry = py - sa.y;
                const along = rx * ux + ry * uy;                 // mm from shell start
                const perp = Math.abs(rx * uy - ry * ux);        // mm off the line
                if (perp > ON_WALL_TOL_MM) continue;
                if (along < -ON_WALL_TOL_MM || along > len + ON_WALL_TOL_MM) continue;
                partitionJunctions.push({
                    wallIndex: wRef,
                    atMm: Math.min(Math.max(along, 0), len),
                    thicknessMm,
                });
            }
        }
    }

    const windows: LayoutOption['windows'] = [];
    for (const n of spaceNodes) {
        if (n.attrs.needsWindow !== true) continue;
        const externals = externalWallsBySpace.get(n.guid) ?? [];
        if (externals.length === 0) continue;
        const rt = (str(n.attrs.spaceType, 'utility') as RoomType);
        const roomName = str(n.attrs.name, n.sourceId);
        // A.21.D6 — per-room climate bias: the room centroid (emit-frame mm) orients
        // each wall's outward normal; the caller-supplied sunDir tilts the choice
        // toward the sun-facing façade. Only when a solar context is present.
        const solar = opts?.solar
            ? (() => { const c = polyCentroid(n); return { sunDir: opts.solar!.sunDir, roomCentroidMm: { x: mm(c.cx), y: mm(c.cz) }, ...(opts.solar!.weight !== undefined ? { weight: opts.solar!.weight } : {}), ...(opts.solar!.latDeg !== undefined ? { latDeg: opts.solar!.latDeg } : {}) }; })()
            : null;
        const placements = emitWindowsForRoom(rt, externals, roomName, doorSpansByWall, solar, partitionJunctions);
        for (const p of placements) {
            windows.push({
                wallRef:    p.wallIndex,
                offset:     p.offsetMm,
                width:      p.widthMm,
                height:     p.heightMm,
                sillHeight: p.sillMm,
                ...(p.name ? { name: p.name } : {}),
                roomType:   rt,
            });
        }
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
        summary: `D-TGL layout — ${rooms.length} rooms, ${walls.length} walls, ${doors.length} doors, ${windows.length} windows`,
        rooms, walls, doors, corridorWidthMin,
        ...(windows.length > 0 ? { windows } : {}),
    };
    return { option, wallGuids, doorGuids, spaceGuids };
}

function wallToLayout(n: GraphNode): LayoutOption['walls'][number] {
    const bl = n.geometry?.baseLine;
    const a = bl?.[0] ?? { x: 0, z: 0 };
    const b = bl?.[1] ?? { x: 0, z: 0 };
    return { start: { x: mm(a.x), y: mm(a.z) }, end: { x: mm(b.x), y: mm(b.z) }, isExternal: n.attrs.isExternal === true };
}

function polyWH(n: GraphNode): { w: number; h: number } {
    const p = n.geometry?.polygon ?? [];
    if (p.length < 3) return { w: 0, h: 0 };
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const pt of p) { if (pt.x < x0) x0 = pt.x; if (pt.x > x1) x1 = pt.x; if (pt.z < z0) z0 = pt.z; if (pt.z > z1) z1 = pt.z; }
    return { w: x1 - x0, h: z1 - z0 };
}

function polyCentroid(n: GraphNode): { cx: number; cz: number } {
    const p = n.geometry?.polygon ?? [];
    if (p.length === 0) return { cx: 0, cz: 0 };
    let sx = 0, sz = 0;
    for (const pt of p) { sx += pt.x; sz += pt.z; }
    return { cx: sx / p.length, cz: sz / p.length };
}
