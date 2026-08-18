/**
 * @file PlanarTopologyEngine.ts
 * @description Phase E (PDF_TO_BIM_DEEP_AUDIT §14 Phase E) — Basic Topological Layer.
 *
 * Migrated to @pryzm/room-topology (Sprint H, 2026-05-10).
 * Original: src/engine/subsystems/ai/PlanarTopologyEngine.ts
 *
 * ── GE-12 / C73 §3.7 — THIS FILE IS NOW AN ADAPTER ─────────────────────────────
 * The left-face half-edge walk that used to live here is THE canonical implementation
 * at `@pryzm/geometry-kernel/pure/planarFaceWalk` (§C73-PTE-CANONICAL). What remains
 * here is the room-topology DOMAIN layer on top of it — `WallGraph` in, `TopologyResult`
 * out — and the three thresholds that are this domain's judgement, not the walk's:
 *
 *   • MIN_FACE_AREA_M2 (0.1) — passed to the walk as `minAbsFaceAreaM2`. It was a
 *     hard-coded constant inside the walk before, which is exactly why the
 *     `auto-dimension` port (which wants NO face filter) had to be a hand copy that
 *     then drifted. See §PTE-FILTERED in the canonical file.
 *   • MIN_ROOM_AREA_M2 (0.5) — promotion of a face to a ROOM. Never was the walk's.
 *   • The OUTER-FACE POLICY — this engine asks for ONE outer face over the whole graph
 *     (`selectOuterFaceXZ`). `auto-dimension` asks a different question, one per
 *     connected component, and gets a different answer. Both are named at the call
 *     site now rather than being an unlabelled property of a copied loop; see
 *     §PTE-OUTER-FACE.
 *
 * BEHAVIOUR NOTE (§PTE-TIEBREAK T1/T2). Two incidental behaviours changed here, both
 * deliberately: the angular tiebreak moved from `localeCompare` (locale-dependent) to
 * codepoint, and seeds are now walked in sorted edge order rather than `Map` insertion
 * order — this file's `WallGraph.edges` is keyed by a random `uuid()`, so the previous
 * order rotated with the input. The SET of faces, their areas and their membership are
 * invariant to both (the next-half-edge map is a bijection; faces are its orbits); the
 * ARRAY order of `rooms` and the ROTATION of each ring can differ. Pinned by
 * `__tests__/planarTopologyOracle.test.ts`.
 */

import {
    tracePlanarFacesXZ,
    selectOuterFaceXZ,
    type PlanarEdgeXZ,
    type PlanarFaceXZ,
    type PlanarPointXZ,
} from '@pryzm/geometry-kernel/pure/planarFaceWalk';
import type { WallGraph } from './WallIntersectionResolver'; // GE-12: type-only — keeps THREE out of this pure module

const MIN_ROOM_AREA_M2 = 0.5;
const MIN_FACE_AREA_M2 = 0.1;
const EXTERIOR_HALF_THICKNESS = 0.10;
const MAX_OPENING_WALL_DIST_M = 0.2;

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

function centroidXZ(nodeIds: readonly string[], positions: ReadonlyMap<string, PlanarPointXZ>): { x: number; z: number } {
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

export function computeTopology(wallGraph: WallGraph): TopologyResult {
    const empty: TopologyResult = { rooms: [], outerFacePolygon: null, hasValidTopology: false };
    if (wallGraph.nodes.size === 0 || wallGraph.edges.size === 0) return empty;

    const positions = new Map<string, PlanarPointXZ>(
        [...wallGraph.nodes.entries()].map(([id, node]) => [id, node.position]),
    );

    // ADAPTER BOUNDARY: `WallGraph` (this package's domain type, edge-keyed by uuid) →
    // the kernel's `PlanarGraphXZ`. `wallId` is the edge identity that must land on the
    // traced rings, NOT the uuid map key — several edges legitimately share one wallId
    // when a wall is split at T-junctions, which is why the kernel's ordering key is a
    // tuple over (id, start, end) rather than the id alone.
    const edges: PlanarEdgeXZ[] = [...wallGraph.edges.values()].map((edge) => ({
        id: edge.wallId,
        startNodeId: edge.startNodeId,
        endNodeId: edge.endNodeId,
    }));

    // §PTE-FILTERED — 0.1 m² is THIS domain's face threshold, stated at the call site.
    const rawFaces = tracePlanarFacesXZ({ positions, edges }, { minAbsFaceAreaM2: MIN_FACE_AREA_M2 });
    if (rawFaces.length === 0) return { ...empty };

    // §PTE-OUTER-FACE — POLICY A: ONE outer face for the whole graph. Room detection
    // consumes a single level's wall graph and treats it as one enclosure; a
    // per-component answer (what `auto-dimension` asks for) would be a different
    // question, so the policy is NAMED here rather than inherited from a copied loop.
    const outerFace: PlanarFaceXZ | null = selectOuterFaceXZ(rawFaces);
    const roomFaces = rawFaces.filter(f => f !== outerFace && f.signedAreaM2 > MIN_ROOM_AREA_M2);

    const rooms: DetectedRoom[] = roomFaces.map((face, idx) => {
        const uniqueWalls = [...new Set(face.edgeIds.filter(Boolean))];
        const centroid = centroidXZ(face.nodeIds, positions);
        const rawVerts = face.nodeIds.map(id => positions.get(id)).filter(Boolean) as { x: number; z: number }[];
        const polygonVertices: { x: number; z: number }[] = [];
        for (const v of rawVerts) {
            const prev = polygonVertices.at(-1);
            if (!prev || Math.abs(v.x - prev.x) > 1e-4 || Math.abs(v.z - prev.z) > 1e-4) polygonVertices.push({ x: v.x, z: v.z });
        }
        return { id: `room_${idx}_${Date.now()}`, boundaryWallIds: uniqueWalls, areaM2: Math.abs(face.signedAreaM2), centroid, polygonVertices };
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
