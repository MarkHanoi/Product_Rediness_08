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
 */

import * as THREE from '@pryzm/renderer-three/three';
import { v4 as uuid } from 'uuid';

// ── Configuration ──────────────────────────────────────────────────────────────

/**
 * Default corner junction threshold (metres).
 * Two endpoints within this distance are candidates for corner merging.
 * Matched to the existing CORNER_SNAP_THRESHOLD_M in FloorPlanCommandBatcher.
 */
export const DEFAULT_CORNER_THRESHOLD_M = 0.10;

/**
 * Default T-junction threshold (metres).
 * A wall endpoint within this distance of another wall's INTERIOR is snapped to it.
 * Increased from 0.15 m → 0.25 m to catch walls that Claude reports stopping just short
 * of another wall's centreline (e.g. w10 stopping short of w12 in corridor plans).
 * At 0.25 m this still only fires when the endpoint is genuinely close — it will not
 * cause incorrect snaps between walls that are intentionally separated.
 */
export const DEFAULT_T_JUNCTION_THRESHOLD_M = 0.25;

/**
 * Minimum angle (degrees) between two walls for a corner junction to be valid.
 * Walls within 20° of parallel are NOT merged as corners — they are distinct
 * parallel walls whose endpoints happen to be close.
 * Equivalent to the audit's [20°, 160°] range (using |cos| maps 160° → 20°).
 */
const MIN_JUNCTION_ANGLE_DEG = 20;

/**
 * Minimum parametric position for a point to be considered "interior" to a segment.
 * Points within this margin of a segment endpoint are treated as endpoint-adjacent,
 * not as T-junction targets (those are handled by the corner-junction path).
 */
const T_INTERIOR_MARGIN = 0.05;

/**
 * Quantization grid for WallNode deduplication (millimetres).
 * Two resolved endpoints that round to the same grid cell share one node.
 * Increased from 10 mm → 20 mm: the wider cell absorbs small floating-point
 * residuals that survive the pre-pass snapping in RoomDetectionEngine
 * (e.g. union-find centroid vs. exact split point on a long wall may differ
 * by a few millimetres). 20 mm is still far below any meaningful wall-to-wall
 * separation in architectural practice.
 */
const NODE_GRID_MM = 20;

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * A node in the WallGraph — a unique endpoint position shared by one or more walls.
 * Per PDF_TO_BIM_DEEP_AUDIT §14 Phase D data contract.
 */
export interface WallNode {
    id: string;
    position: { x: number; z: number };
    connectedWallIds: string[];
}

/**
 * Node-edge adjacency graph built from resolved wall segments.
 * Foundation for Phase E topology (room detection, slab derivation).
 * Per PDF_TO_BIM_DEEP_AUDIT §14 Phase D data contract.
 */
export interface WallGraph {
    nodes: Map<string, WallNode>;
    edges: Map<string, { startNodeId: string; endNodeId: string; wallId: string }>;
}

// ── Geometry helpers (internal) ────────────────────────────────────────────────

/**
 * Compute the closest point on segment [segStart → segEnd] to a query point,
 * all in the XZ plane (Y is ignored).
 * Returns the parametric position t ∈ [0, 1], the closest world-space point,
 * and the squared distance for fast comparison.
 */
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
    return {
        t,
        closest: new THREE.Vector3(cx, 0, cz),
        distanceSq: ex * ex + ez * ez,
    };
}

/**
 * Angle between two wall directions in [0°, 90°].
 * Uses |dot product| so the result is independent of which direction each wall is drawn.
 * Returns 0° for parallel walls, 90° for perpendicular walls.
 */
function wallAngleDeg(
    aStart: THREE.Vector3, aEnd: THREE.Vector3,
    bStart: THREE.Vector3, bEnd: THREE.Vector3,
): number {
    const ax = aEnd.x - aStart.x; const az = aEnd.z - aStart.z;
    const bx = bEnd.x - bStart.x; const bz = bEnd.z - bStart.z;
    const aLen = Math.sqrt(ax * ax + az * az);
    const bLen = Math.sqrt(bx * bx + bz * bz);
    if (aLen < 1e-8 || bLen < 1e-8) return 90; // degenerate → treat as valid
    const dot = (ax / aLen) * (bx / bLen) + (az / aLen) * (bz / bLen);
    return (Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
}

/**
 * Parametric segment-segment intersection in the XZ plane.
 * Returns { tA, tB, point } if the segments intersect within [0, 1]×[0, 1],
 * or null if they are parallel or do not intersect within their bounded extents.
 */
function segSegIntersectXZ(
    aStart: THREE.Vector3, aEnd: THREE.Vector3,
    bStart: THREE.Vector3, bEnd: THREE.Vector3,
): { tA: number; tB: number; point: THREE.Vector3 } | null {
    const dax = aEnd.x - aStart.x; const daz = aEnd.z - aStart.z;
    const dbx = bEnd.x - bStart.x; const dbz = bEnd.z - bStart.z;
    const denom = dax * dbz - daz * dbx;
    if (Math.abs(denom) < 1e-10) return null; // parallel
    const dx = bStart.x - aStart.x;
    const dz = bStart.z - aStart.z;
    const tA = (dx * dbz - dz * dbx) / denom;
    const tB = (dx * daz - dz * dax) / denom;
    if (tA < 0 || tA > 1 || tB < 0 || tB > 1) return null;
    return {
        tA,
        tB,
        point: new THREE.Vector3(aStart.x + tA * dax, 0, aStart.z + tA * daz),
    };
}

/**
 * Generate a stable node ID from a world-space XZ position quantized to NODE_GRID_MM.
 * Two endpoints that resolve to the same grid cell share a node.
 */
function nodeId(x: number, z: number): string {
    const qx = Math.round(x * 1000 / NODE_GRID_MM);
    const qz = Math.round(z * 1000 / NODE_GRID_MM);
    return `n_${qx}_${qz}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Phase D.1 + D.2: Resolve wall junctions in-place.
 *
 * Pass 1 — T-junction snap:
 *   For each wall endpoint, search all OTHER walls for a close interior point.
 *   If one is found within `tJunctionThreshold`, snap the endpoint to that point.
 *   Only interior points (parametric t ∈ (0.05, 0.95)) qualify — endpoint-to-endpoint
 *   is handled by the corner-junction pass.
 *
 * Pass 2 — Angle-aware corner junction snap:
 *   For each pair of endpoints from DIFFERENT walls within `cornerThreshold`,
 *   snap both to their midpoint ONLY IF the wall angle is ≥ MIN_JUNCTION_ANGLE_DEG.
 *   This filters out false corners between nearly-parallel walls.
 *
 * @param walls - Wall array. `start` and `end` Vector3 objects are modified IN-PLACE.
 * @param cornerThreshold  - Max distance for corner merge (default 0.10 m).
 * @param tJunctionThreshold - Max distance for T-junction snap (default 0.15 m).
 * @returns Diagnostic counts { tSnaps, cornerSnaps }.
 */
export function resolveWallJunctions(
    walls: Array<{ start: THREE.Vector3; end: THREE.Vector3 }>,
    cornerThreshold = DEFAULT_CORNER_THRESHOLD_M,
    tJunctionThreshold = DEFAULT_T_JUNCTION_THRESHOLD_M,
): { tSnaps: number; cornerSnaps: number } {
    let tSnaps = 0;
    let cornerSnaps = 0;

    // ── Pass 1: T-junction ─────────────────────────────────────────────────────
    // For each endpoint of wall i, find the closest interior point on any other wall j.
    for (let i = 0; i < walls.length; i++) {
        for (const key of ['start', 'end'] as const) {
            const ep = walls[i]![key];
            const threshSq = tJunctionThreshold * tJunctionThreshold;
            let bestDistSq = threshSq;
            let bestClosest: THREE.Vector3 | null = null;

            for (let j = 0; j < walls.length; j++) {
                if (j === i) continue;
                const { t, closest, distanceSq } = closestOnSegmentXZ(ep, walls[j]!.start, walls[j]!.end);
                // Only accept interior points — endpoints handled by corner pass
                if (distanceSq < bestDistSq && t > T_INTERIOR_MARGIN && t < 1 - T_INTERIOR_MARGIN) {
                    bestDistSq = distanceSq;
                    bestClosest = closest;
                }
            }

            if (bestClosest) {
                ep.copy(bestClosest);
                tSnaps++;
            }
        }
    }

    // ── Pass 2: Angle-aware corner junction ────────────────────────────────────
    // Collect all endpoint references with their wall index for angle lookup.
    interface EpRef { vec: THREE.Vector3; wallIdx: number; }
    const eps: EpRef[] = [];
    for (let i = 0; i < walls.length; i++) {
        eps.push({ vec: walls[i]!.start, wallIdx: i });
        eps.push({ vec: walls[i]!.end,   wallIdx: i });
    }

    const threshSq = cornerThreshold * cornerThreshold;
    for (let i = 0; i < eps.length; i++) {
        for (let j = i + 1; j < eps.length; j++) {
            const a = eps[i]!;
            const b = eps[j]!;
            if (a.wallIdx === b.wallIdx) continue; // same wall — skip

            const dx = a.vec.x - b.vec.x;
            const dz = a.vec.z - b.vec.z;
            if (dx * dx + dz * dz >= threshSq) continue;

            // Angle check — reject nearly-parallel walls (false corners)
            const angle = wallAngleDeg(
                walls[a.wallIdx]!.start, walls[a.wallIdx]!.end,
                walls[b.wallIdx]!.start, walls[b.wallIdx]!.end,
            );
            if (angle < MIN_JUNCTION_ANGLE_DEG) continue;

            const midX = (a.vec.x + b.vec.x) / 2;
            const midZ = (a.vec.z + b.vec.z) / 2;
            a.vec.set(midX, 0, midZ);
            b.vec.set(midX, 0, midZ);
            cornerSnaps++;
        }
    }

    // ── Pass 3: Near-miss endpoint-to-segment snap (extended range) ───────────
    // Second T-junction pass at 2× the standard threshold, applied ONLY to
    // endpoints that are still unconnected after Pass 1 (i.e. no wall is within
    // tJunctionThreshold of their position after Pass 1 ran).
    //
    // Purpose: catches walls that Claude reports ending just outside the normal
    // snap radius — e.g. w10 stopping 0.20 m short of w12 in a corridor layout.
    // Without this pass those walls remain disconnected and any door in the gap
    // between them has no valid host wall.
    //
    // Guard: only fires when the candidate host wall interior point is within
    // 2× tJunctionThreshold AND the endpoint has no existing connection within
    // 1× tJunctionThreshold (prevents double-snapping already-resolved endpoints).
    const extendedThreshSq = (tJunctionThreshold * 2) * (tJunctionThreshold * 2);
    const connectedThreshSq = tJunctionThreshold * tJunctionThreshold;

    for (let i = 0; i < walls.length; i++) {
        for (const key of ['start', 'end'] as const) {
            const ep = walls[i]![key];

            // Skip if this endpoint already has a close neighbour (already snapped)
            let alreadyConnected = false;
            for (let k = 0; k < walls.length; k++) {
                if (k === i) continue;
                for (const pt of [walls[k]!.start, walls[k]!.end]) {
                    const ddx = ep.x - pt.x;
                    const ddz = ep.z - pt.z;
                    if (ddx * ddx + ddz * ddz < connectedThreshSq) {
                        alreadyConnected = true;
                        break;
                    }
                }
                if (alreadyConnected) break;
            }
            if (alreadyConnected) continue;

            // Search for a close interior point on any other wall at extended range
            let bestDistSq = extendedThreshSq;
            let bestClosest: THREE.Vector3 | null = null;

            for (let j = 0; j < walls.length; j++) {
                if (j === i) continue;
                const { t, closest, distanceSq } = closestOnSegmentXZ(ep, walls[j]!.start, walls[j]!.end);
                if (distanceSq < bestDistSq && t > T_INTERIOR_MARGIN && t < 1 - T_INTERIOR_MARGIN) {
                    bestDistSq = distanceSq;
                    bestClosest = closest;
                }
            }

            if (bestClosest) {
                ep.copy(bestClosest);
                tSnaps++;
                console.debug(
                    `[WallIntersectionResolver] Pass 3 near-miss snap: ` +
                    `wall[${i}].${key} → (${bestClosest.x.toFixed(3)}, ${bestClosest.z.toFixed(3)}) ` +
                    `dist=${Math.sqrt(bestDistSq).toFixed(3)}m`,
                );
            }
        }
    }

    console.debug(
        `[WallIntersectionResolver] Junction resolution: ` +
        `${tSnaps} T-junction snap${tSnaps !== 1 ? 's' : ''} (passes 1+3), ` +
        `${cornerSnaps} corner merge${cornerSnaps !== 1 ? 's' : ''}`,
    );

    return { tSnaps, cornerSnaps };
}

/**
 * Phase D.3 / Phase E: Detect true wall crossings and log them.
 *
 * A true crossing is when two wall centrelines intersect at strictly interior
 * points of both segments (tA, tB ∈ (0.05, 0.95)) — meaning the walls
 * geometrically pass through each other without a shared endpoint.
 *
 * Phase E implements the actual split via splitWallsAtCrossings(). This function
 * is kept for diagnostic/informational use when the caller only needs a count.
 *
 * @param walls - Wall array (read-only in this function).
 * @returns Number of true crossings detected.
 */
export function detectAndLogCrossings(
    walls: Array<{ start: THREE.Vector3; end: THREE.Vector3 }>,
): number {
    let crossingCount = 0;
    for (let i = 0; i < walls.length; i++) {
        for (let j = i + 1; j < walls.length; j++) {
            const ix = segSegIntersectXZ(walls[i]!.start, walls[i]!.end, walls[j]!.start, walls[j]!.end);
            if (!ix) continue;
            if (
                ix.tA > T_INTERIOR_MARGIN && ix.tA < 1 - T_INTERIOR_MARGIN &&
                ix.tB > T_INTERIOR_MARGIN && ix.tB < 1 - T_INTERIOR_MARGIN
            ) {
                console.debug(
                    `[WallIntersectionResolver] True crossing: wall[${i}] × wall[${j}] ` +
                    `at tA=${ix.tA.toFixed(3)}, tB=${ix.tB.toFixed(3)}`,
                );
                crossingCount++;
            }
        }
    }
    if (crossingCount > 0) {
        console.warn(
            `[WallIntersectionResolver] ${crossingCount} true crossing(s) detected.`,
        );
    }
    return crossingCount;
}

// ── Phase E: Crossing segment split ────────────────────────────────────────────

/**
 * A wall sub-segment produced by splitWallsAtCrossings.
 * `parentIdx` references the index in the original input array so the caller
 * can inherit semantic data (wall type, confidence, thickness, etc.) from the
 * parent wall.
 */
export interface SplitWallEntry {
    start: THREE.Vector3;
    end: THREE.Vector3;
    /** Index into the original walls array this segment was split from. */
    parentIdx: number;
}

/**
 * Phase E: Split walls at true crossing points.
 *
 * For each pair of walls that cross at strictly interior parametric positions
 * (tA, tB ∈ [T_INTERIOR_MARGIN, 1 − T_INTERIOR_MARGIN]), this function splits
 * both walls at the intersection point into two sub-segments.
 *
 * Result: the new wall array where crossing walls are replaced by their split
 * sub-segments and non-crossing walls are carried through unchanged. Each result
 * entry carries a `parentIdx` reference so callers can copy semantic data from
 * the originating wall.
 *
 * A wall that crosses multiple other walls (multiple split points along it) is
 * split at ALL crossing points in parametric order, producing N+1 sub-segments
 * for N crossings.
 *
 * CONTRACT: The input array is read-only — this function never mutates it.
 * All returned Vector3 instances are freshly cloned.
 *
 * @param walls - Resolved wall array after junction resolution (read-only).
 * @returns { result, splitCount } where result is the full expanded wall array
 *          and splitCount is the number of crossing pairs resolved.
 */
export function splitWallsAtCrossings(
    walls: Array<{ start: THREE.Vector3; end: THREE.Vector3 }>,
): { result: SplitWallEntry[]; splitCount: number } {
    // Accumulate per-wall split points: wallIdx → [{t, point}]
    const splitPoints = new Map<number, Array<{ t: number; point: THREE.Vector3 }>>();
    let splitCount = 0;

    for (let i = 0; i < walls.length; i++) {
        for (let j = i + 1; j < walls.length; j++) {
            const ix = segSegIntersectXZ(walls[i]!.start, walls[i]!.end, walls[j]!.start, walls[j]!.end);
            if (!ix) continue;
            if (
                ix.tA > T_INTERIOR_MARGIN && ix.tA < 1 - T_INTERIOR_MARGIN &&
                ix.tB > T_INTERIOR_MARGIN && ix.tB < 1 - T_INTERIOR_MARGIN
            ) {
                if (!splitPoints.has(i)) splitPoints.set(i, []);
                if (!splitPoints.has(j)) splitPoints.set(j, []);
                splitPoints.get(i)!.push({ t: ix.tA, point: ix.point.clone() });
                splitPoints.get(j)!.push({ t: ix.tB, point: ix.point.clone() });
                splitCount++;
            }
        }
    }

    if (splitCount === 0) {
        // Fast path — no crossings: wrap originals with parentIdx, no Vector3 cloning
        return {
            result: walls.map((w, i) => ({ start: w.start, end: w.end, parentIdx: i })),
            splitCount: 0,
        };
    }

    const result: SplitWallEntry[] = [];

    for (let i = 0; i < walls.length; i++) {
        const points = splitPoints.get(i);
        if (!points || points.length === 0) {
            result.push({ start: walls[i]!.start.clone(), end: walls[i]!.end.clone(), parentIdx: i });
            continue;
        }

        // Sort split points by parametric position along wall i
        points.sort((a, b) => a.t - b.t);

        // Build sub-segments: start → p0, p0 → p1, …, pN → end
        let prev = walls[i]!.start.clone();
        for (const sp of points) {
            result.push({ start: prev, end: sp.point.clone(), parentIdx: i });
            prev = sp.point.clone();
        }
        result.push({ start: prev, end: walls[i]!.end.clone(), parentIdx: i });
    }

    console.debug(
        `[WallIntersectionResolver] Phase E crossing split: ${splitCount} crossing(s) resolved, ` +
        `${walls.length} walls → ${result.length} segments`,
    );

    return { result, splitCount };
}

/**
 * Phase D.4: Build a WallGraph node-edge structure from resolved wall segments.
 *
 * Nodes represent unique endpoint positions quantized to a NODE_GRID_MM grid.
 * Two walls that share a resolved endpoint (after junction resolution) produce
 * a single shared node, enabling "which walls are connected here?" queries.
 *
 * This graph is the data foundation required by Phase E (room detection, slab derivation).
 * It is returned as part of BatchResult so Phase E can consume it without API changes.
 *
 * @param walls - Array of accepted wall segments with their final UUIDs and coordinates.
 *                Should only contain walls that passed the min-length and duplicate filters.
 * @returns WallGraph with nodes and edges populated.
 */
export function buildWallGraph(
    walls: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }>,
): WallGraph {
    const nodes = new Map<string, WallNode>();
    const edges = new Map<string, { startNodeId: string; endNodeId: string; wallId: string }>();

    function getOrCreate(x: number, z: number): string {
        const id = nodeId(x, z);
        if (!nodes.has(id)) {
            nodes.set(id, { id, position: { x, z }, connectedWallIds: [] });
        }
        return id;
    }

    for (const wall of walls) {
        const snId = getOrCreate(wall.start.x, wall.start.z);
        const enId = getOrCreate(wall.end.x, wall.end.z);
        if (snId === enId) continue; // degenerate zero-length wall after resolution

        nodes.get(snId)!.connectedWallIds.push(wall.wallUUID);
        nodes.get(enId)!.connectedWallIds.push(wall.wallUUID);

        edges.set(uuid(), { startNodeId: snId, endNodeId: enId, wallId: wall.wallUUID });
    }

    console.debug(
        `[WallIntersectionResolver] WallGraph: ${nodes.size} node${nodes.size !== 1 ? 's' : ''}, ` +
        `${edges.size} edge${edges.size !== 1 ? 's' : ''} (Phase D — foundation for Phase E topology)`,
    );

    return { nodes, edges };
}