/**
 * WallJunctionInfill — pure computation module.
 *
 * For every multi-wall junction cluster (3+ wall endpoints meeting at one point),
 * the square-cap approach used by WallJoinResolver leaves a void polygon between
 * the wall end faces.  This module computes the exact 2-D outline of that void
 * polygon so it can be filled with a prism mesh by WallJunctionInfillManager.
 *
 * Algorithm (per cluster):
 *   1. For each wall in the cluster, compute the unit direction D_i from the
 *      consensus point toward the wall's free end.
 *   2. Sort walls angularly CCW in XZ (ascending atan2(D.z, D.x)).
 *   3. For each adjacent pair (Wi, W_{i+1}):
 *        • Wi's left-edge line  : through (P + outward_i  * T_i/2) in direction D_i
 *        • W_{i+1}'s right-edge line: through (P - outward_{i+1} * T_{i+1}/2) in direction D_{i+1}
 *        • Void vertex Vᵢ = 2-D intersection of these two edge lines.
 *          Fallback = midpoint when edge lines are parallel.
 *   4. The void polygon {V0, V1, ..., Vn-1} is the exact outline of the gap
 *      that no wall end face covers.
 *
 * Contract:
 *   Pure computation — no store writes, no scene access.
 *   Called only by EngineBootstrap (or tests).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { WallData }              from './WallTypes';
import { detectJunctionClusters } from './WallJunctionClustering';

// Must stay in sync with WallJoinResolver.SNAP_RADIUS.
const SNAP_RADIUS = 0.5;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface JunctionInfillData {
    /** Stable key: sorted wall IDs joined with '|'. */
    clusterKey: string;
    /** 2-D void polygon vertices (XZ), in CCW angular order. */
    vertices:   { x: number; z: number }[];
    /** Floor Y (level elevation). */
    elevation:  number;
    /** Extrusion height (average of wall heights in cluster). */
    height:     number;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Computes junction infill polygons for all multi-wall clusters on this level.
 *
 * @param walls  All walls on the level (frozen WallData records from the store).
 * @returns      One JunctionInfillData per cluster that needs an infill patch.
 */
export function computeJunctionInfills(walls: WallData[]): JunctionInfillData[] {
    if (walls.length < 3) return [];

    // Build working baselines (pure copies, never mutate frozen store objects).
    const bl = new Map<string, [THREE.Vector3, THREE.Vector3]>();
    for (const w of walls) {
        bl.set(w.id, [
            new THREE.Vector3(w.baseLine[0].x, w.baseLine[0].y, w.baseLine[0].z),
            new THREE.Vector3(w.baseLine[1].x, w.baseLine[1].y, w.baseLine[1].z),
        ]);
    }

    const byId = new Map<string, WallData>();
    for (const w of walls) byId.set(w.id, w);

    const clusters = detectJunctionClusters(walls, bl, SNAP_RADIUS);
    const infills: JunctionInfillData[] = [];

    for (const cluster of clusters) {
        const { endpoints, consensusPoint } = cluster;

        // Unique wall IDs participating in this cluster.
        const wallIdsInCluster = [...new Set(endpoints.map(ep => ep.wallId))];
        if (wallIdsInCluster.length < 3) continue;

        // Build per-wall geometry entries.
        interface WallEntry {
            direction: THREE.Vector3;   // unit D_i: from P toward free end
            outward:   THREE.Vector3;   // (-D_i.z, 0, D_i.x)
            thickness: number;
            height:    number;
            elevation: number;
        }

        const entries: WallEntry[] = [];

        for (const wallId of wallIdsInCluster) {
            const ep = endpoints.find(e => e.wallId === wallId)!;
            const w  = byId.get(wallId)!;
            const [ws, we] = bl.get(wallId)!;

            // Free end = the opposite end from the junction.
            const freeEnd = ep.side === 'start' ? we : ws;

            const rawDir = new THREE.Vector3(
                freeEnd.x - consensusPoint.x,
                0,
                freeEnd.z - consensusPoint.z,
            );
            const len = rawDir.length();
            if (len < 1e-6) continue; // degenerate (zero-length) wall
            rawDir.divideScalar(len);

            const outward = new THREE.Vector3(-rawDir.z, 0, rawDir.x);

            const thickness = (w as any).width ?? (w as any).thickness ?? 0.2;
            const height    = (w as any).height ?? 2.8;

            entries.push({
                direction: rawDir,
                outward,
                thickness,
                height,
                elevation: consensusPoint.y,
            });
        }

        if (entries.length < 3) continue;

        // Sort CCW by direction angle (atan2 in XZ).
        entries.sort((a, b) => {
            const angA = Math.atan2(a.direction.z, a.direction.x);
            const angB = Math.atan2(b.direction.z, b.direction.x);
            return angA - angB;
        });

        // Compute void polygon vertices — one per adjacent wall pair.
        const voidVerts: { x: number; z: number }[] = [];
        const n = entries.length;

        for (let i = 0; i < n; i++) {
            const curr = entries[i];
            const next = entries[(i + 1) % n];

            // curr's left-edge anchor (left = outward side).
            const leftCorner = {
                x: consensusPoint.x + curr.outward.x * curr.thickness / 2,
                z: consensusPoint.z + curr.outward.z * curr.thickness / 2,
            };

            // next's right-edge anchor (right = -outward side).
            const rightCorner = {
                x: consensusPoint.x - next.outward.x * next.thickness / 2,
                z: consensusPoint.z - next.outward.z * next.thickness / 2,
            };

            // Intersection of the two edge lines in XZ.
            const vertex = _intersect2D_XZ(leftCorner, curr.direction, rightCorner, next.direction);

            if (vertex) {
                voidVerts.push(vertex);
            } else {
                // Parallel edges — fallback to midpoint.
                voidVerts.push({
                    x: (leftCorner.x + rightCorner.x) / 2,
                    z: (leftCorner.z + rightCorner.z) / 2,
                });
            }
        }

        if (voidVerts.length < 3) continue;

        // Sanity-check: skip if the polygon is degenerate (all vertices near P).
        const maxDist = voidVerts.reduce((m, v) =>
            Math.max(m, Math.hypot(v.x - consensusPoint.x, v.z - consensusPoint.z)), 0);
        if (maxDist < 1e-4) continue;

        // §JUNCTION-INFLATE (interim mitigation per ADR-0055): inflate each vertex
        // outward from the consensus point so the prism OVERLAPS the surrounding wall
        // caps with slack — without this, T/X junctions at oblique angles leave a
        // dark V-wedge between the cap face and the prism perimeter. Inflation is
        // capped at the smallest wall thickness × 0.25 to stay inside the wall body.
        const minThickness = entries.reduce((m, e) => Math.min(m, e.thickness), Infinity);
        const inflate = Math.min(0.025, isFinite(minThickness) ? minThickness * 0.25 : 0.025);
        const inflatedVerts = voidVerts.map(v => {
            const dx = v.x - consensusPoint.x, dz = v.z - consensusPoint.z;
            const d = Math.hypot(dx, dz);
            if (d < 1e-6) return v;
            const k = (d + inflate) / d;
            return { x: consensusPoint.x + dx * k, z: consensusPoint.z + dz * k };
        });

        const avgHeight   = entries.reduce((s, e) => s + e.height, 0) / entries.length;
        const clusterKey  = [...wallIdsInCluster].sort().join('|');

        infills.push({
            clusterKey,
            vertices:  inflatedVerts,
            elevation: entries[0].elevation,
            height:    avgHeight,
        });
    }

    return infills;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * 2-D (XZ) line-line intersection.
 *
 * Line 1: through point p1 in direction d1.
 * Line 2: through point p2 in direction d2.
 *
 * Returns null when lines are parallel (|denom| < ε).
 */
function _intersect2D_XZ(
    p1: { x: number; z: number }, d1: THREE.Vector3,
    p2: { x: number; z: number }, d2: THREE.Vector3,
): { x: number; z: number } | null {
    const denom = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / denom;
    return {
        x: p1.x + t * d1.x,
        z: p1.z + t * d1.z,
    };
}
