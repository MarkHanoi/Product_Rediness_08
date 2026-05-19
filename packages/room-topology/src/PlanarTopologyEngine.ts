/**
 * @file PlanarTopologyEngine.ts
 * @description Phase E (PDF_TO_BIM_DEEP_AUDIT §14 Phase E) — Basic Topological Layer.
 *
 * Migrated to @pryzm/room-topology (Sprint H, 2026-05-10).
 * Original: src/engine/subsystems/ai/PlanarTopologyEngine.ts
 */

import { WallGraph } from './WallIntersectionResolver';

const MIN_ROOM_AREA_M2 = 0.5;
const MIN_FACE_AREA_M2 = 0.1;
const EXTERIOR_HALF_THICKNESS = 0.10;
const MAX_OPENING_WALL_DIST_M = 0.2;
const FACE_TRACE_MAX_ITER_MULTIPLIER = 4;

export interface DetectedRoom {
    id: string;
    boundaryWallIds: string[];
    areaM2: number;
    labelFromPDF?: string;
    centroid: { x: number; z: number };
    polygonVertices: { x: number; z: number }[];
}

export interface TopologyResult {
    rooms: DetectedRoom[];
    outerFacePolygon: { x: number; z: number }[] | null;
    hasValidTopology: boolean;
}

function signedAreaXZ(nodeIds: string[], positions: Map<string, { x: number; z: number }>): number {
    let area = 0;
    const n = nodeIds.length;
    for (let i = 0; i < n; i++) {
        const a = positions.get(nodeIds[i]);
        const b = positions.get(nodeIds[(i + 1) % n]);
        if (!a || !b) continue;
        area += a.x * b.z - b.x * a.z;
    }
    return area / 2;
}

function centroidXZ(nodeIds: string[], positions: Map<string, { x: number; z: number }>): { x: number; z: number } {
    let sx = 0; let sz = 0; let count = 0;
    for (const id of nodeIds) {
        const p = positions.get(id);
        if (!p) continue;
        sx += p.x; sz += p.z; count++;
    }
    return count > 0 ? { x: sx / count, z: sz / count } : { x: 0, z: 0 };
}

function expandPolygonFromCentroid(polygon: { x: number; z: number }[], amount: number): { x: number; z: number }[] {
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

function pointToSegDistXZ(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
    const dx = bx - ax; const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) { const ex = px - ax; const ez = pz - az; return Math.sqrt(ex * ex + ez * ez); }
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    const cx = ax + t * dx; const cz = az + t * dz;
    const ex = px - cx; const ez = pz - cz;
    return Math.sqrt(ex * ex + ez * ez);
}

function nextHalfEdge(
    uId: string, vId: string,
    adjSorted: Map<string, Array<{ neighborId: string; wallId: string }>>,
    _positions: Map<string, { x: number; z: number }>,
): { nextU: string; nextV: string; wallId: string } | null {
    const neighbors = adjSorted.get(vId) ?? [];
    const n = neighbors.length;
    if (n === 0) return null;
    if (n === 1) {
        const only = neighbors[0]!;
        return only.neighborId === uId ? { nextU: vId, nextV: uId, wallId: only.wallId } : null;
    }
    const uIdx = neighbors.findIndex(nb => nb.neighborId === uId);
    if (uIdx === -1) {
        const fallback = neighbors.find(nb => nb.neighborId !== uId);
        return fallback ? { nextU: vId, nextV: fallback.neighborId, wallId: fallback.wallId } : null;
    }
    const prevIdx = (uIdx - 1 + n) % n;
    const chosen = neighbors[prevIdx]!;
    return { nextU: vId, nextV: chosen.neighborId, wallId: chosen.wallId };
}

export function computeTopology(wallGraph: WallGraph): TopologyResult {
    const empty: TopologyResult = { rooms: [], outerFacePolygon: null, hasValidTopology: false };
    if (wallGraph.nodes.size === 0 || wallGraph.edges.size === 0) return empty;

    const positions = new Map<string, { x: number; z: number }>(
        [...wallGraph.nodes.entries()].map(([id, node]) => [id, node.position]),
    );

    const adj = new Map<string, Array<{ neighborId: string; wallId: string }>>();
    const halfEdgeWall = new Map<string, string>();
    for (const node of wallGraph.nodes.keys()) adj.set(node, []);
    for (const [, edge] of wallGraph.edges) {
        const { startNodeId: s, endNodeId: e, wallId } = edge;
        adj.get(s)?.push({ neighborId: e, wallId });
        adj.get(e)?.push({ neighborId: s, wallId });
        halfEdgeWall.set(`${s}→${e}`, wallId);
        halfEdgeWall.set(`${e}→${s}`, wallId);
    }

    const adjSorted = new Map<string, Array<{ neighborId: string; wallId: string }>>();
    for (const [nId, neighbors] of adj) {
        const vPos = positions.get(nId)!;
        const sorted = [...neighbors].sort((a, b) => {
            const ap = positions.get(a.neighborId); const bp = positions.get(b.neighborId);
            if (!ap || !bp) return 0;
            const aA = Math.atan2(ap.z - vPos.z, ap.x - vPos.x);
            const bA = Math.atan2(bp.z - vPos.z, bp.x - vPos.x);
            return aA !== bA ? aA - bA : a.neighborId.localeCompare(b.neighborId);
        });
        adjSorted.set(nId, sorted);
    }

    const visitedHalfEdges = new Set<string>();
    const maxIter = wallGraph.edges.size * FACE_TRACE_MAX_ITER_MULTIPLIER + 16;

    interface RawFace { nodeIds: string[]; wallIds: string[]; signedArea: number; }
    const rawFaces: RawFace[] = [];

    for (const [, edge] of wallGraph.edges) {
        for (const [startId, endId] of [
            [edge.startNodeId, edge.endNodeId],
            [edge.endNodeId, edge.startNodeId],
        ] as [string, string][]) {
            const startKey = `${startId}→${endId}`;
            if (visitedHalfEdges.has(startKey)) continue;

            const nodeIds: string[] = []; const wallIds: string[] = [];
            let curU = startId; let curV = endId; let iter = 0;

            while (iter < maxIter) {
                const key = `${curU}→${curV}`;
                if (visitedHalfEdges.has(key)) break;
                visitedHalfEdges.add(key);
                nodeIds.push(curU);
                wallIds.push(halfEdgeWall.get(key) ?? '');
                const next = nextHalfEdge(curU, curV, adjSorted, positions);
                if (!next) break;
                curU = next.nextU; curV = next.nextV; iter++;
            }

            if (nodeIds.length < 3) continue;
            const area = signedAreaXZ(nodeIds, positions);
            if (Math.abs(area) < MIN_FACE_AREA_M2) continue;
            rawFaces.push({ nodeIds, wallIds, signedArea: area });
        }
    }

    if (rawFaces.length === 0) return { ...empty };

    let outerFace: RawFace | null = null;
    for (const face of rawFaces) {
        if (outerFace === null || face.signedArea < outerFace.signedArea) outerFace = face;
    }
    const roomFaces = rawFaces.filter(f => f !== outerFace && f.signedArea > MIN_ROOM_AREA_M2);

    const rooms: DetectedRoom[] = roomFaces.map((face, idx) => {
        const uniqueWalls = [...new Set(face.wallIds.filter(Boolean))];
        const centroid = centroidXZ(face.nodeIds, positions);
        const rawVerts = face.nodeIds.map(id => positions.get(id)).filter(Boolean) as { x: number; z: number }[];
        const polygonVertices: { x: number; z: number }[] = [];
        for (const v of rawVerts) {
            const prev = polygonVertices.at(-1);
            if (!prev || Math.abs(v.x - prev.x) > 1e-4 || Math.abs(v.z - prev.z) > 1e-4) polygonVertices.push({ x: v.x, z: v.z });
        }
        return { id: `room_${idx}_${Date.now()}`, boundaryWallIds: uniqueWalls, areaM2: Math.abs(face.signedArea), centroid, polygonVertices };
    });

    let outerFacePolygon: { x: number; z: number }[] | null = null;
    if (outerFace && outerFace.nodeIds.length >= 3) {
        const rawPolygon = outerFace.nodeIds.map(id => positions.get(id)!).filter(Boolean);
        const deduped: { x: number; z: number }[] = [];
        for (const p of rawPolygon) {
            const prev = deduped.at(-1);
            if (!prev || Math.abs(p.x - prev.x) > 1e-4 || Math.abs(p.z - prev.z) > 1e-4) deduped.push({ x: p.x, z: p.z });
        }
        if (deduped.length >= 3) outerFacePolygon = expandPolygonFromCentroid(deduped, EXTERIOR_HALF_THICKNESS);
    }

    return { rooms, outerFacePolygon, hasValidTopology: rawFaces.length > 0 };
}

export function assignOpeningsToWalls(
    openings: Array<{ id: string; centre: { x: number; z: number } }>,
    wallGraph: WallGraph,
    maxDistanceM: number = MAX_OPENING_WALL_DIST_M,
): Map<string, string> {
    const result = new Map<string, string>();
    if (openings.length === 0 || wallGraph.edges.size === 0) return result;

    for (const opening of openings) {
        const { x: ox, z: oz } = opening.centre;
        let bestDist = maxDistanceM; let bestWallId: string | null = null;
        for (const [, edge] of wallGraph.edges) {
            const sNode = wallGraph.nodes.get(edge.startNodeId);
            const eNode = wallGraph.nodes.get(edge.endNodeId);
            if (!sNode || !eNode) continue;
            const dist = pointToSegDistXZ(ox, oz, sNode.position.x, sNode.position.z, eNode.position.x, eNode.position.z);
            if (dist < bestDist) { bestDist = dist; bestWallId = edge.wallId; }
        }
        if (bestWallId) result.set(opening.id, bestWallId);
    }
    return result;
}
