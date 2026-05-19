/**
 * @file PlanarTopologyEngine.ts
 * @description Phase E (PDF_TO_BIM_DEEP_AUDIT §14 Phase E) — Basic Topological Layer.
 *
 * Builds the planar graph required for room detection and slab derivation from the
 * Phase D WallGraph. Four deliverables:
 *
 *   E.1 — Face detection: DFS-style half-edge traversal identifies all closed loops.
 *   E.2 — Room derivation: interior faces (area > MIN_ROOM_AREA_M2) become DetectedRoom
 *          records with boundary wall IDs, area, and centroid.
 *   E.3 — Slab from outer face: the mathematically computed outer boundary of the planar
 *          graph replaces the AI-detected slab polygon. Expanded by EXTERIOR_HALF_THICKNESS
 *          (half a standard exterior wall) to capture wall mass.
 *   E.4 — Opening-to-wall assignment: purely spatial, deterministic. No hostWallId needed.
 *          Each opening centre is matched to the nearest wall graph edge within a distance
 *          threshold.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §1.2 Phase 2 / 04-BIM §3.1):
 *  - Pure computation: no store mutations, no Command creation, no side effects.
 *  - Input WallGraph is READ-ONLY — this module does not modify it.
 *  - storeEventBus subscription (live topology update on user wall edits) is Phase F scope.
 *    For Phase E, computeTopology() is called once per PDF import after all walls land.
 *  - All queries on TopologyResult are read-only.
 */

import { WallGraph } from './WallIntersectionResolver';

// ── Configuration ──────────────────────────────────────────────────────────────

/**
 * Minimum interior face area to be classified as a room (m²).
 * Smaller faces are corridor segments, dimension-line artefacts, or dead-end stubs.
 *
 * §AREA-THRESHOLD-2026-04 — Lowered from 2.0 m² to 0.5 m² to keep parity with
 * the production room detector (`RoomPolygonUtils.MIN_ROOM_AREA_M2`). Allows
 * the AI / PDF→BIM pipeline to surface small utility rooms (WCs, closets,
 * riser shafts) that were previously discarded.
 */
const MIN_ROOM_AREA_M2 = 0.5;

/**
 * Minimum absolute area for ANY face to be kept (m²).
 * Faces with area below this are degenerate (spikes, dead-end loops with zero net area).
 *
 * §AREA-THRESHOLD-2026-04 — Lowered from 0.5 m² to 0.1 m² so the face-keep
 * filter remains strictly weaker than the room-promotion filter; otherwise
 * the new MIN_ROOM_AREA_M2 of 0.5 m² could not surface ≥ 0.5 m² faces.
 */
const MIN_FACE_AREA_M2 = 0.1;

/**
 * Outward expansion of the outer face polygon for the slab boundary (m).
 * Approximates half the thickness of a standard 0.2 m exterior wall so the slab
 * covers wall mass rather than stopping at the wall's inner face.
 */
const EXTERIOR_HALF_THICKNESS = 0.10;

/**
 * Maximum distance (m) from an opening centre to a wall edge centreline for
 * the deterministic opening-to-wall assignment (Phase E Step 4).
 * Reduced from 0.5 m to 0.2 m to prevent openings from snapping to the wrong
 * wall when two walls are close (e.g. spine wall vs. adjacent partition).
 */
const MAX_OPENING_WALL_DIST_M = 0.2;

/**
 * Guard limit for face tracing: maximum half-edge steps before aborting.
 * Prevents infinite loops on malformed graphs. Set to 4× edge count + safety margin.
 */
const FACE_TRACE_MAX_ITER_MULTIPLIER = 4;

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * A room derived from a closed interior face of the planar wall graph.
 * Per PDF_TO_BIM_DEEP_AUDIT §14 Phase E data contract.
 */
export interface DetectedRoom {
    id: string;
    boundaryWallIds: string[];
    areaM2: number;
    labelFromPDF?: string;
    centroid: { x: number; z: number };
    /** Ordered XZ polygon vertices from the face traversal — use these for room boundary. */
    polygonVertices: { x: number; z: number }[];
}

/**
 * Full result of a topology computation pass.
 * Consumed by FloorPlanCommandBatcher for slab derivation and room logging.
 */
export interface TopologyResult {
    /** Rooms derived from interior faces of the planar graph. */
    rooms: DetectedRoom[];
    /**
     * Outer face polygon vertices in world XZ coordinates (CCW or CW order depending on
     * plan geometry; the slab only needs the vertex list, not winding).
     * null if the graph has no valid connected outer boundary (e.g., disconnected / no closed faces).
     */
    outerFacePolygon: { x: number; z: number }[] | null;
    /** Whether any closed faces were detected at all. */
    hasValidTopology: boolean;
}

// ── Internal geometry helpers ──────────────────────────────────────────────────

/** Signed area of a polygon from node ID list (shoelace formula, XZ plane). */
function signedAreaXZ(
    nodeIds: string[],
    positions: Map<string, { x: number; z: number }>,
): number {
    let area = 0;
    const n = nodeIds.length;
    for (let i = 0; i < n; i++) {
        const a = positions.get(nodeIds[i]!);
        const b = positions.get(nodeIds[(i + 1) % n]!);
        if (!a || !b) continue;
        area += a.x * b.z - b.x * a.z;
    }
    return area / 2;
}

/** Centroid of a polygon from node ID list. */
function centroidXZ(
    nodeIds: string[],
    positions: Map<string, { x: number; z: number }>,
): { x: number; z: number } {
    let sx = 0; let sz = 0; let count = 0;
    for (const id of nodeIds) {
        const p = positions.get(id);
        if (!p) continue;
        sx += p.x; sz += p.z; count++;
    }
    return count > 0 ? { x: sx / count, z: sz / count } : { x: 0, z: 0 };
}

/**
 * Expand a polygon outward from its centroid by `amount` metres.
 * Moves each vertex radially away from the centroid — works correctly for
 * convex and near-convex shapes (typical rectangular floor plans).
 */
function expandPolygonFromCentroid(
    polygon: { x: number; z: number }[],
    amount: number,
): { x: number; z: number }[] {
    if (polygon.length === 0) return [];
    const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
    const cz = polygon.reduce((s, p) => s + p.z, 0) / polygon.length;
    return polygon.map(p => {
        const dx = p.x - cx; const dz = p.z - cz;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 1e-8) return { ...p };
        return { x: p.x + (dx / len) * amount, z: p.z + (dz / len) * amount };
    });
}

/**
 * Perpendicular distance from a 2D XZ point to a line segment.
 * Returns the distance or Infinity if the segment is degenerate.
 */
function pointToSegDistXZ(
    px: number, pz: number,
    ax: number, az: number,
    bx: number, bz: number,
): number {
    const dx = bx - ax; const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) {
        const ex = px - ax; const ez = pz - az;
        return Math.sqrt(ex * ex + ez * ez);
    }
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    const cx = ax + t * dx; const cz = az + t * dz;
    const ex = px - cx; const ez = pz - cz;
    return Math.sqrt(ex * ex + ez * ez);
}

// ── Half-edge traversal ────────────────────────────────────────────────────────

/**
 * Compute the "next" directed half-edge in the left-face traversal at vertex v
 * given that we arrived from vertex u.
 *
 * Correct planar DCEL convention:
 *   For half-edge (u→v), the face to its LEFT is traced by taking the outgoing
 *   edge from v that is IMMEDIATELY CLOCKWISE of the twin direction (v→u) in
 *   the CCW-sorted adjacency list of v.
 *
 *   Algorithm:
 *     1. Look up the CCW-sorted neighbor list of v (built in computeTopology Step 2).
 *     2. Find the index `uIdx` of neighbour u in that list.
 *     3. Return the neighbour at index (uIdx − 1 + n) % n  — one step backward
 *        in CCW order, i.e. the first neighbour encountered when rotating CW
 *        from the direction v→u.
 *
 *   Why this is correct:
 *     For the face to the LEFT of (u→v), at vertex v we must turn as CW as
 *     possible *but still be to the left of u→v*.  In a CCW-sorted list the
 *     position immediately before v→u (mod n) is exactly that edge.  The
 *     previous "minimum CCW from reverse direction" rule picked the
 *     minimum-CCW neighbour from α = reverse angle, which is identical to
 *     going STRAIGHT or CW — tracing the outermost enclosing face rather than
 *     the interior sub-room.
 *
 *   Dead-end case:
 *     If v has only one neighbour (u), returns (v→u) — "bounce back".
 *
 * Returns null if v has no neighbours at all (isolated node — should not occur
 * in a correctly built WallGraph).
 */
function nextHalfEdge(
    uId: string,
    vId: string,
    adjSorted: Map<string, Array<{ neighborId: string; wallId: string }>>,
    _positions: Map<string, { x: number; z: number }>,
): { nextU: string; nextV: string; wallId: string } | null {
    const neighbors = adjSorted.get(vId) ?? [];
    const n = neighbors.length;
    if (n === 0) return null;

    // Dead-end — bounce back to u
    if (n === 1) {
        const only = neighbors[0]!;
        return only.neighborId === uId
            ? { nextU: vId, nextV: uId, wallId: only.wallId }
            : null;
    }

    // Find the position of u in the CCW-sorted list at v.
    const uIdx = neighbors.findIndex(nb => nb.neighborId === uId);
    if (uIdx === -1) {
        // u not found — structural inconsistency; fall back to first neighbour != u
        const fallback = neighbors.find(nb => nb.neighborId !== uId);
        return fallback ? { nextU: vId, nextV: fallback.neighborId, wallId: fallback.wallId } : null;
    }

    // One step backward in CCW order = immediately CW of v→u.
    const prevIdx = (uIdx - 1 + n) % n;
    const chosen = neighbors[prevIdx]!;
    return { nextU: vId, nextV: chosen.neighborId, wallId: chosen.wallId };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Phase E.1–E.3: Compute planar topology from the Phase D WallGraph.
 *
 * Algorithm:
 *   1. Build a directed adjacency list from all WallGraph edges (both directions).
 *   2. At each node, sort outgoing edges by angle (required for correct face traversal).
 *   3. For each unvisited directed half-edge, trace its left face using the
 *      "minimum CCW angle from reverse direction" rule (standard DCEL face traversal).
 *   4. Compute signed area for each face (shoelace formula over XZ coords).
 *   5. The face with the MOST NEGATIVE signed area is the outer face (exterior boundary).
 *   6. Faces with POSITIVE signed area above MIN_ROOM_AREA_M2 are interior rooms.
 *   7. Expand the outer face polygon by EXTERIOR_HALF_THICKNESS for slab derivation.
 *
 * @param wallGraph - Phase D WallGraph (read-only).
 * @returns TopologyResult with rooms, outer face polygon, and validity flag.
 */
export function computeTopology(wallGraph: WallGraph): TopologyResult {
    const empty: TopologyResult = { rooms: [], outerFacePolygon: null, hasValidTopology: false };

    if (wallGraph.nodes.size === 0 || wallGraph.edges.size === 0) {
        console.debug('[PlanarTopologyEngine] Empty WallGraph — skipping topology computation');
        return empty;
    }

    // ── Step 1: Build directed adjacency ──────────────────────────────────────
    const positions = new Map<string, { x: number; z: number }>(
        [...wallGraph.nodes.entries()].map(([id, node]) => [id, node.position]),
    );

    // adj: nodeId → [{neighborId, wallId}] (unsorted)
    const adj = new Map<string, Array<{ neighborId: string; wallId: string }>>();
    const halfEdgeWall = new Map<string, string>(); // "u→v" → wallId

    for (const node of wallGraph.nodes.keys()) {
        adj.set(node, []);
    }

    for (const [, edge] of wallGraph.edges) {
        const { startNodeId: s, endNodeId: e, wallId } = edge;
        adj.get(s)?.push({ neighborId: e, wallId });
        adj.get(e)?.push({ neighborId: s, wallId });
        halfEdgeWall.set(`${s}→${e}`, wallId);
        halfEdgeWall.set(`${e}→${s}`, wallId);
    }

    // ── Step 2: Sort neighbours by angle at each node ──────────────────────────
    const adjSorted = new Map<string, Array<{ neighborId: string; wallId: string }>>();
    for (const [nodeId, neighbors] of adj) {
        const vPos = positions.get(nodeId)!;
        const sorted = [...neighbors].sort((a, b) => {
            const ap = positions.get(a.neighborId);
            const bp = positions.get(b.neighborId);
            if (!ap || !bp) return 0;
            const aA = Math.atan2(ap.z - vPos.z, ap.x - vPos.x);
            const bA = Math.atan2(bp.z - vPos.z, bp.x - vPos.x);
            return aA !== bA ? aA - bA : a.neighborId.localeCompare(b.neighborId);
        });
        adjSorted.set(nodeId, sorted);
    }

    // ── Step 3: Trace all faces via half-edge traversal ────────────────────────
    const visitedHalfEdges = new Set<string>();
    const maxIter = wallGraph.edges.size * FACE_TRACE_MAX_ITER_MULTIPLIER + 16;

    interface RawFace {
        nodeIds: string[];
        wallIds: string[];
        signedArea: number;
    }
    const rawFaces: RawFace[] = [];

    for (const [, edge] of wallGraph.edges) {
        for (const [startId, endId] of [
            [edge.startNodeId, edge.endNodeId],
            [edge.endNodeId, edge.startNodeId],
        ] as [string, string][]) {
            const startKey = `${startId}→${endId}`;
            if (visitedHalfEdges.has(startKey)) continue;

            const nodeIds: string[] = [];
            const wallIds: string[] = [];
            let curU = startId;
            let curV = endId;
            let iter = 0;

            while (iter < maxIter) {
                const key = `${curU}→${curV}`;
                if (visitedHalfEdges.has(key)) break;
                visitedHalfEdges.add(key);
                nodeIds.push(curU);
                wallIds.push(halfEdgeWall.get(key) ?? '');

                const next = nextHalfEdge(curU, curV, adjSorted, positions);
                if (!next) break;
                curU = next.nextU;
                curV = next.nextV;
                iter++;
            }

            if (nodeIds.length < 3) continue;

            const area = signedAreaXZ(nodeIds, positions);
            if (Math.abs(area) < MIN_FACE_AREA_M2) continue;

            rawFaces.push({ nodeIds, wallIds, signedArea: area });
        }
    }

    if (rawFaces.length === 0) {
        console.debug('[PlanarTopologyEngine] No closed faces detected — graph may be fully open (no enclosed rooms)');
        return { ...empty };
    }

    // ── Step 4: Classify faces ─────────────────────────────────────────────────
    // Outer face: most negative signed area (largest clockwise-wound polygon).
    // Room faces: positive signed area above MIN_ROOM_AREA_M2.
    let outerFace: RawFace | null = null;
    for (const face of rawFaces) {
        if (outerFace === null || face.signedArea < outerFace.signedArea) {
            outerFace = face;
        }
    }

    const roomFaces = rawFaces.filter(f => f !== outerFace && f.signedArea > MIN_ROOM_AREA_M2);

    // ── Step 5: Build DetectedRoom records ────────────────────────────────────
    const rooms: DetectedRoom[] = roomFaces.map((face, idx) => {
        const uniqueWalls = [...new Set(face.wallIds.filter(Boolean))];
        const centroid = centroidXZ(face.nodeIds, positions);
        // Deduplicate consecutive identical vertices (dead-end bounce artefacts)
        const rawVerts = face.nodeIds.map(id => positions.get(id)).filter(Boolean) as { x: number; z: number }[];
        const polygonVertices: { x: number; z: number }[] = [];
        for (const v of rawVerts) {
            const prev = polygonVertices.at(-1);
            if (!prev || Math.abs(v.x - prev.x) > 1e-4 || Math.abs(v.z - prev.z) > 1e-4) {
                polygonVertices.push({ x: v.x, z: v.z });
            }
        }
        return {
            id: `room_${idx}_${Date.now()}`,
            boundaryWallIds: uniqueWalls,
            areaM2: Math.abs(face.signedArea),
            centroid,
            polygonVertices,
        };
    });

    // ── Step 6: Outer face polygon for slab ───────────────────────────────────
    let outerFacePolygon: { x: number; z: number }[] | null = null;
    if (outerFace && outerFace.nodeIds.length >= 3) {
        // Deduplicate consecutive identical nodes (dead-end spikes)
        const rawPolygon = outerFace.nodeIds.map(id => positions.get(id)!).filter(Boolean);
        const deduped: { x: number; z: number }[] = [];
        for (const p of rawPolygon) {
            const prev = deduped.at(-1);
            if (!prev || Math.abs(p.x - prev.x) > 1e-4 || Math.abs(p.z - prev.z) > 1e-4) {
                deduped.push({ x: p.x, z: p.z });
            }
        }

        if (deduped.length >= 3) {
            outerFacePolygon = expandPolygonFromCentroid(deduped, EXTERIOR_HALF_THICKNESS);
        }
    }

    console.log(
        `[PlanarTopologyEngine] Topology: ${rooms.length} room(s) detected, ` +
        `outer face ${outerFacePolygon ? `(${outerFacePolygon.length} vertices)` : 'not found'}, ` +
        `${rawFaces.length} total faces`,
    );
    if (rooms.length > 0) {
        rooms.forEach(r =>
            console.debug(
                `  Room ${r.id}: ${r.areaM2.toFixed(1)} m², centroid (${r.centroid.x.toFixed(2)}, ${r.centroid.z.toFixed(2)}), ` +
                `${r.boundaryWallIds.length} bounding wall(s)`,
            ),
        );
    }

    return { rooms, outerFacePolygon, hasValidTopology: rawFaces.length > 0 };
}

/**
 * Phase E.4: Deterministic opening-to-wall assignment using WallGraph edges.
 *
 * For each opening centre, finds the nearest wall graph edge whose centreline
 * passes within maxDistanceM of the opening's world-space XZ position.
 * No AI memory (hostWallId) required.
 *
 * Returns a Map<openingId, wallUUID>. Openings further than maxDistanceM from
 * any wall are absent from the map (caller should fall back or skip them).
 *
 * @param openings - Pre-computed opening world centres with their IDs.
 * @param wallGraph - Phase D WallGraph (read-only).
 * @param maxDistanceM - Maximum allowed distance from opening to wall (default 0.2 m).
 */
export function assignOpeningsToWalls(
    openings: Array<{ id: string; centre: { x: number; z: number } }>,
    wallGraph: WallGraph,
    maxDistanceM: number = MAX_OPENING_WALL_DIST_M,
): Map<string, string> {
    const result = new Map<string, string>();
    if (openings.length === 0 || wallGraph.edges.size === 0) return result;

    for (const opening of openings) {
        const { x: ox, z: oz } = opening.centre;
        let bestDist = maxDistanceM;
        let bestWallId: string | null = null;

        for (const [, edge] of wallGraph.edges) {
            const sNode = wallGraph.nodes.get(edge.startNodeId);
            const eNode = wallGraph.nodes.get(edge.endNodeId);
            if (!sNode || !eNode) continue;

            const dist = pointToSegDistXZ(
                ox, oz,
                sNode.position.x, sNode.position.z,
                eNode.position.x, eNode.position.z,
            );

            if (dist < bestDist) {
                bestDist = dist;
                bestWallId = edge.wallId;
            }
        }

        if (bestWallId) {
            result.set(opening.id, bestWallId);
        }
    }

    return result;
}
