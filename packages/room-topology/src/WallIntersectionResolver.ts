/**
 * @file WallIntersectionResolver.ts
 * @description Phase D (PDF_TO_BIM_DEEP_AUDIT §14 Phase D) — Deterministic wall junction
 * resolution. Replaces the O(n²) proximity endpoint snap with a mathematically correct
 * junction type classifier:
 *
 *   - T-junction:  Wall endpoint is near the INTERIOR of another wall's centreline.
 *                  The endpoint is snapped to the closest point on that wall.
 *   - Corner junction: Two wall endpoints are close AND the walls form a valid angle
 *                      (20°–160°). Both endpoints are snapped to their midpoint.
 *                      Endpoints within threshold but on NEARLY-PARALLEL walls (< 20°)
 *                      are left alone — they are distinct parallel walls, not corners.
 *   - True crossing: Two wall centrelines cross each other's interiors.
 *                    Detected and logged in Phase D. Segment splitting deferred to Phase E.
 *
 * After junction resolution, `buildWallGraph` constructs the node-edge adjacency structure
 * required by Phase E (room detection, slab derivation). Nodes are quantized to a 10 mm
 * grid so that endpoints that resolve to the same position share a single node.
 *
 * CONTRACT (04-BIM §3.1 / 01-BIM-ENGINE-CORE-CONTRACT §1.2):
 *  - Pure deterministic algorithm: no store mutations, no command creation, no side effects.
 *  - Wall start/end Vector3 objects are modified IN-PLACE by resolveWallJunctions().
 *  - buildWallGraph() is read-only — it does not modify its input.
 *  - Callers are responsible for filtering degenerate walls before calling buildWallGraph.
 *
 * Migrated to @pryzm/room-topology (Sprint H, 2026-05-10).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { v4 as uuid } from 'uuid';

export const DEFAULT_CORNER_THRESHOLD_M = 0.10;
export const DEFAULT_T_JUNCTION_THRESHOLD_M = 0.25;

const MIN_JUNCTION_ANGLE_DEG = 20;
const T_INTERIOR_MARGIN = 0.05;
const NODE_GRID_MM = 20;

export interface WallNode {
    id: string;
    position: { x: number; z: number };
    connectedWallIds: string[];
}

export interface WallGraph {
    nodes: Map<string, WallNode>;
    edges: Map<string, { startNodeId: string; endNodeId: string; wallId: string }>;
}

function closestOnSegmentXZ(
    point: THREE.Vector3,
    segStart: THREE.Vector3,
    segEnd: THREE.Vector3,
): { t: number; closest: THREE.Vector3; distanceSq: number } {
    const dx = segEnd.x - segStart.x;
    const dz = segEnd.z - segStart.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) {
        const ex = point.x - segStart.x;
        const ez = point.z - segStart.z;
        return { t: 0, closest: segStart.clone(), distanceSq: ex * ex + ez * ez };
    }
    const t = Math.max(0, Math.min(1,
        ((point.x - segStart.x) * dx + (point.z - segStart.z) * dz) / len2,
    ));
    const cx = segStart.x + t * dx;
    const cz = segStart.z + t * dz;
    const ex = point.x - cx;
    const ez = point.z - cz;
    return { t, closest: new THREE.Vector3(cx, 0, cz), distanceSq: ex * ex + ez * ez };
}

function wallAngleDeg(
    aStart: THREE.Vector3, aEnd: THREE.Vector3,
    bStart: THREE.Vector3, bEnd: THREE.Vector3,
): number {
    const ax = aEnd.x - aStart.x; const az = aEnd.z - aStart.z;
    const bx = bEnd.x - bStart.x; const bz = bEnd.z - bStart.z;
    const aLen = Math.sqrt(ax * ax + az * az);
    const bLen = Math.sqrt(bx * bx + bz * bz);
    if (aLen < 1e-8 || bLen < 1e-8) return 90;
    const dot = (ax / aLen) * (bx / bLen) + (az / aLen) * (bz / bLen);
    return (Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
}

function segSegIntersectXZ(
    aStart: THREE.Vector3, aEnd: THREE.Vector3,
    bStart: THREE.Vector3, bEnd: THREE.Vector3,
): { tA: number; tB: number; point: THREE.Vector3 } | null {
    const dax = aEnd.x - aStart.x; const daz = aEnd.z - aStart.z;
    const dbx = bEnd.x - bStart.x; const dbz = bEnd.z - bStart.z;
    const denom = dax * dbz - daz * dbx;
    if (Math.abs(denom) < 1e-10) return null;
    const dx = bStart.x - aStart.x;
    const dz = bStart.z - aStart.z;
    const tA = (dx * dbz - dz * dbx) / denom;
    const tB = (dx * daz - dz * dax) / denom;
    if (tA < 0 || tA > 1 || tB < 0 || tB > 1) return null;
    return { tA, tB, point: new THREE.Vector3(aStart.x + tA * dax, 0, aStart.z + tA * daz) };
}

function nodeId(x: number, z: number): string {
    const qx = Math.round(x * 1000 / NODE_GRID_MM);
    const qz = Math.round(z * 1000 / NODE_GRID_MM);
    return `n_${qx}_${qz}`;
}

export function resolveWallJunctions(
    walls: Array<{ start: THREE.Vector3; end: THREE.Vector3 }>,
    cornerThreshold = DEFAULT_CORNER_THRESHOLD_M,
    tJunctionThreshold = DEFAULT_T_JUNCTION_THRESHOLD_M,
): { tSnaps: number; cornerSnaps: number } {
    let tSnaps = 0;
    let cornerSnaps = 0;

    for (let i = 0; i < walls.length; i++) {
        for (const key of ['start', 'end'] as const) {
            const ep = walls[i][key];
            const threshSq = tJunctionThreshold * tJunctionThreshold;
            let bestDistSq = threshSq;
            let bestClosest: THREE.Vector3 | null = null;

            for (let j = 0; j < walls.length; j++) {
                if (j === i) continue;
                const { t, closest, distanceSq } = closestOnSegmentXZ(ep, walls[j].start, walls[j].end);
                if (distanceSq < bestDistSq && t > T_INTERIOR_MARGIN && t < 1 - T_INTERIOR_MARGIN) {
                    bestDistSq = distanceSq;
                    bestClosest = closest;
                }
            }

            if (bestClosest) { ep.copy(bestClosest); tSnaps++; }
        }
    }

    interface EpRef { vec: THREE.Vector3; wallIdx: number; }
    const eps: EpRef[] = [];
    for (let i = 0; i < walls.length; i++) {
        eps.push({ vec: walls[i].start, wallIdx: i });
        eps.push({ vec: walls[i].end,   wallIdx: i });
    }

    const threshSq = cornerThreshold * cornerThreshold;
    for (let i = 0; i < eps.length; i++) {
        for (let j = i + 1; j < eps.length; j++) {
            const a = eps[i]; const b = eps[j];
            if (a.wallIdx === b.wallIdx) continue;
            const dx = a.vec.x - b.vec.x; const dz = a.vec.z - b.vec.z;
            if (dx * dx + dz * dz >= threshSq) continue;
            const angle = wallAngleDeg(
                walls[a.wallIdx].start, walls[a.wallIdx].end,
                walls[b.wallIdx].start, walls[b.wallIdx].end,
            );
            if (angle < MIN_JUNCTION_ANGLE_DEG) continue;
            const midX = (a.vec.x + b.vec.x) / 2;
            const midZ = (a.vec.z + b.vec.z) / 2;
            a.vec.set(midX, 0, midZ); b.vec.set(midX, 0, midZ);
            cornerSnaps++;
        }
    }

    const extendedThreshSq = (tJunctionThreshold * 2) * (tJunctionThreshold * 2);
    const connectedThreshSq = tJunctionThreshold * tJunctionThreshold;

    for (let i = 0; i < walls.length; i++) {
        for (const key of ['start', 'end'] as const) {
            const ep = walls[i][key];
            let alreadyConnected = false;
            for (let k = 0; k < walls.length; k++) {
                if (k === i) continue;
                for (const pt of [walls[k].start, walls[k].end]) {
                    const ddx = ep.x - pt.x; const ddz = ep.z - pt.z;
                    if (ddx * ddx + ddz * ddz < connectedThreshSq) { alreadyConnected = true; break; }
                }
                if (alreadyConnected) break;
            }
            if (alreadyConnected) continue;

            let bestDistSq = extendedThreshSq;
            let bestClosest: THREE.Vector3 | null = null;
            for (let j = 0; j < walls.length; j++) {
                if (j === i) continue;
                const { t, closest, distanceSq } = closestOnSegmentXZ(ep, walls[j].start, walls[j].end);
                if (distanceSq < bestDistSq && t > T_INTERIOR_MARGIN && t < 1 - T_INTERIOR_MARGIN) {
                    bestDistSq = distanceSq; bestClosest = closest;
                }
            }
            if (bestClosest) { ep.copy(bestClosest); tSnaps++; }
        }
    }

    return { tSnaps, cornerSnaps };
}

export function detectAndLogCrossings(
    walls: Array<{ start: THREE.Vector3; end: THREE.Vector3 }>,
): number {
    let crossingCount = 0;
    for (let i = 0; i < walls.length; i++) {
        for (let j = i + 1; j < walls.length; j++) {
            const ix = segSegIntersectXZ(walls[i].start, walls[i].end, walls[j].start, walls[j].end);
            if (!ix) continue;
            if (ix.tA > T_INTERIOR_MARGIN && ix.tA < 1 - T_INTERIOR_MARGIN &&
                ix.tB > T_INTERIOR_MARGIN && ix.tB < 1 - T_INTERIOR_MARGIN) {
                crossingCount++;
            }
        }
    }
    return crossingCount;
}

export interface SplitWallEntry {
    start: THREE.Vector3;
    end: THREE.Vector3;
    parentIdx: number;
}

export function splitWallsAtCrossings(
    walls: Array<{ start: THREE.Vector3; end: THREE.Vector3 }>,
): { result: SplitWallEntry[]; splitCount: number } {
    const splitPoints = new Map<number, Array<{ t: number; point: THREE.Vector3 }>>();
    let splitCount = 0;

    for (let i = 0; i < walls.length; i++) {
        for (let j = i + 1; j < walls.length; j++) {
            const ix = segSegIntersectXZ(walls[i].start, walls[i].end, walls[j].start, walls[j].end);
            if (!ix) continue;
            if (ix.tA > T_INTERIOR_MARGIN && ix.tA < 1 - T_INTERIOR_MARGIN &&
                ix.tB > T_INTERIOR_MARGIN && ix.tB < 1 - T_INTERIOR_MARGIN) {
                if (!splitPoints.has(i)) splitPoints.set(i, []);
                if (!splitPoints.has(j)) splitPoints.set(j, []);
                splitPoints.get(i)!.push({ t: ix.tA, point: ix.point.clone() });
                splitPoints.get(j)!.push({ t: ix.tB, point: ix.point.clone() });
                splitCount++;
            }
        }
    }

    if (splitCount === 0) {
        return { result: walls.map((w, i) => ({ start: w.start, end: w.end, parentIdx: i })), splitCount: 0 };
    }

    const result: SplitWallEntry[] = [];
    for (let i = 0; i < walls.length; i++) {
        const points = splitPoints.get(i);
        if (!points || points.length === 0) {
            result.push({ start: walls[i].start.clone(), end: walls[i].end.clone(), parentIdx: i });
            continue;
        }
        points.sort((a, b) => a.t - b.t);
        let prev = walls[i].start.clone();
        for (const sp of points) { result.push({ start: prev, end: sp.point.clone(), parentIdx: i }); prev = sp.point.clone(); }
        result.push({ start: prev, end: walls[i].end.clone(), parentIdx: i });
    }

    return { result, splitCount };
}

export function buildWallGraph(
    walls: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }>,
): WallGraph {
    const nodes = new Map<string, WallNode>();
    const edges = new Map<string, { startNodeId: string; endNodeId: string; wallId: string }>();

    function getOrCreate(x: number, z: number): string {
        const id = nodeId(x, z);
        if (!nodes.has(id)) nodes.set(id, { id, position: { x, z }, connectedWallIds: [] });
        return id;
    }

    for (const wall of walls) {
        const snId = getOrCreate(wall.start.x, wall.start.z);
        const enId = getOrCreate(wall.end.x, wall.end.z);
        if (snId === enId) continue;
        nodes.get(snId)!.connectedWallIds.push(wall.wallUUID);
        nodes.get(enId)!.connectedWallIds.push(wall.wallUUID);
        edges.set(uuid(), { startNodeId: snId, endNodeId: enId, wallId: wall.wallUUID });
    }

    return { nodes, edges };
}
