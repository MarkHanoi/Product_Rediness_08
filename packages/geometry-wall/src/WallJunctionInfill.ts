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
import { EPSILON_ZERO, PARALLEL_RAD } from '@pryzm/geometry-kernel';
import { WallData }              from './WallTypes';
import { detectJunctionClusters } from './WallJunctionClustering';

// Must stay in sync with WallJoinResolver.SNAP_RADIUS.
//
// §SNAP-RADIUS-NOT-THICKNESS-DERIVED (L-920, reported not changed) — 0.5 m is a
// FIXED band applied to every wall regardless of thickness, and it is doing two
// different jobs at once: "these endpoints were meant to be the same corner"
// (an authoring-intent question, where a fixed reach is defensible) and "these
// walls form one junction cluster" (a geometric question, where the right band
// scales with thickness). For a 100 mm partition, 0.5 m is FIVE wall widths —
// it will cluster endpoints the user never joined; for a 500 mm wall it is one
// width and may miss a real junction. Deriving it from thickness would change
// which clusters form, which changes `WallJoinResolver` output too (the two are
// documented as needing to stay in sync), so it is NOT changed here — that is a
// junction-detection decision, not an infill-geometry one. Recorded for the
// successor rather than silently altered.
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

/**
 * Why a cluster produced NO infill patch.
 *
 * §JUNCTION-INFILL-REFUSAL (L-920) — a degenerate cluster must not silently emit
 * geometry, and it must not report itself through a developer trace either: this
 * repo has already ruled that a `console.warn` is not a refusal. Refusing is the
 * CORRECT answer for these clusters, so it is returned as a value alongside the
 * infills rather than logged and dropped.
 */
export type JunctionInfillRefusalReason =
    /** A vertex coordinate came back NaN/Infinity — nothing sound can be built. */
    | 'non-finite-vertex'
    /** Every vertex collapsed onto the junction point — there is no void to fill. */
    | 'collapsed-polygon'
    /** The vertices are spread but enclose no area (collinear) — not a patch. */
    | 'zero-area-polygon';

export interface JunctionInfillRefusal {
    /** Stable key: sorted wall IDs joined with '|'. */
    clusterKey: string;
    reason:     JunctionInfillRefusalReason;
    /** Max RAW (pre-clamp) vertex distance from the consensus point, in metres. */
    maxRawVertexDistance: number;
    /** The §JUNCTION-VERTEX-CLAMP bound that applied to this cluster, in metres. */
    clampBound: number;
}

export interface JunctionInfillResult {
    infills:  JunctionInfillData[];
    refusals: JunctionInfillRefusal[];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Computes junction infill polygons for all multi-wall clusters on this level.
 *
 * @param walls  All walls on the level (frozen WallData records from the store).
 * @returns      One JunctionInfillData per cluster that needs an infill patch.
 */
export function computeJunctionInfills(walls: WallData[]): JunctionInfillData[] {
    return computeJunctionInfillsDetailed(walls).infills;
}

/**
 * The single implementation — `computeJunctionInfills` is the thin
 * infills-only wrapper over it (P1/P6: one path, not two). Callers that need to
 * SEE the refusals (diagnostics, tests, a future user-facing junction warning)
 * take this one.
 */
export function computeJunctionInfillsDetailed(walls: WallData[]): JunctionInfillResult {
    const refusals: JunctionInfillRefusal[] = [];
    if (walls.length < 3) return { infills: [], refusals };

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

        const clusterKey = [...wallIdsInCluster].sort().join('|');

        // §JUNCTION-VERTEX-CLAMP (L-920, founder "in 3D we get a CORRUPTED GEOMETRY —
        // TRIANGLE", raised many times) — the bound on how far an infill vertex may
        // sit from the junction it is patching.
        //
        // MIRRORS §MITER-T-CLAMP in `MiterPrismBuilder.projectCapVertex`, and the
        // mirror is LITERAL, not approximate. That clamp bounds a cap projection at
        // `4 * latOff + 0.05`, where latOff is the vertex's lateral offset from the
        // centreline. The infill's edge-line ANCHORS are exactly the wall's own
        // half-thickness off the centreline, so latOff = thickness/2 here and the
        // same formula reads `4 * (t/2) + 0.05` = `2 * t + 0.05` — which is precisely
        // the "~2x the consensus wall thickness" bound the L-909a successor recipe
        // specifies. One clamping idiom, one bound, derived not invented.
        //
        // The consensus thickness is the THICKEST wall in the cluster: a legitimate
        // mitre reaches furthest for the thickest participant, so bounding on the
        // thinnest would clamp real geometry off a mixed-thickness junction (that is
        // the §MITER-T-CLAMP-LAYER-LAT mistake, and it is not repeated here).
        //
        // WHY A DISTANCE CAP AND NOT A BETTER PARALLEL TEST: measured, the EXACT
        // degeneracy was always safe — `_intersect2D_XZ`'s near-parallel guard fires
        // and the midpoint fallback is sound. It is the NEAR-MISS that is
        // catastrophic: two walls leaving the junction co-directionally 0.1 deg apart
        // put a vertex 214.9 m out (573x thickness) while sailing through any
        // angle-based guard. Only a MODEL-SPACE bound catches that, because the
        // defect is a distance, not an angle.
        //
        // The +0.05 slack term is INHERITED from §MITER-T-CLAMP verbatim rather than
        // minted here (§JUNCTION-INFLATE below adds up to 0.025 m outward, so a
        // legitimate vertex can sit slightly past 2x t). It is a live 0.05 m
        // convention that `@pryzm/geometry-kernel/tolerance.ts` already records as an
        // un-canonised migration hazard — flagged, not silently re-minted.
        const maxThickness = entries.reduce((m, e) => Math.max(m, e.thickness), 0);
        const clampBound   = 4 * (maxThickness / 2) + 0.05;

        // Compute void polygon vertices — one per adjacent wall pair.
        const voidVerts: { x: number; z: number }[] = [];
        const n = entries.length;
        let maxRawDist   = 0;
        let sawNonFinite = false;

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

            let v: { x: number; z: number };

            if (vertex) {
                v = vertex;
            } else {
                // Parallel edges — fallback to midpoint.
                v = {
                    x: (leftCorner.x + rightCorner.x) / 2,
                    z: (leftCorner.z + rightCorner.z) / 2,
                };
            }

            // §JUNCTION-VERTEX-CLAMP — pull a runaway vertex back onto the bound,
            // along its own direction from the junction (so the patch keeps its
            // orientation and merely stops reaching). A legitimate vertex is well
            // inside the bound and passes through byte-identical; this only ever
            // touches the runaway, exactly as §MITER-T-CLAMP does.
            const dx = v.x - consensusPoint.x;
            const dz = v.z - consensusPoint.z;
            const d  = Math.hypot(dx, dz);

            if (!Number.isFinite(d) || !Number.isFinite(v.x) || !Number.isFinite(v.z)) {
                // A non-finite vertex can never be clamped into soundness — it is
                // recorded and the whole cluster refuses below. (Note `!(d > bound)`
                // ordering elsewhere would FAIL OPEN on NaN, the §WALL-NAN-GUARD
                // lesson; this tests finiteness explicitly instead.)
                sawNonFinite = true;
                voidVerts.push(v);
                continue;
            }

            if (d > maxRawDist) maxRawDist = d;

            if (d > clampBound) {
                const k = clampBound / d;
                v = { x: consensusPoint.x + dx * k, z: consensusPoint.z + dz * k };
            }

            voidVerts.push(v);
        }

        if (voidVerts.length < 3) continue;

        // §JUNCTION-INFILL-REFUSAL — from here on a cluster that cannot produce a
        // sound patch REFUSES BY VALUE. Emitting a spike is strictly worse than
        // emitting nothing: a missing mitre is a cosmetic gap the user can work
        // around, corrupted solid geometry is not.
        if (sawNonFinite) {
            refusals.push({ clusterKey, reason: 'non-finite-vertex', maxRawVertexDistance: maxRawDist, clampBound });
            continue;
        }

        // Degenerate: all vertices collapsed onto the junction — there is no void.
        // (Was a silent `continue` on a locally-minted `1e-4`; now a typed refusal.)
        const maxDist = voidVerts.reduce((m, v) =>
            Math.max(m, Math.hypot(v.x - consensusPoint.x, v.z - consensusPoint.z)), 0);
        if (maxDist < 1e-4) {
            refusals.push({ clusterKey, reason: 'collapsed-polygon', maxRawVertexDistance: maxRawDist, clampBound });
            continue;
        }

        // Degenerate: vertices are spread but enclose no area (collinear) — that is
        // not a patch, it is a sliver, and extruding it is the corrupted-geometry
        // class this whole fix exists to stop.
        if (_polygonArea2D(voidVerts) < EPSILON_ZERO) {
            refusals.push({ clusterKey, reason: 'zero-area-polygon', maxRawVertexDistance: maxRawDist, clampBound });
            continue;
        }

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

        const avgHeight = entries.reduce((s, e) => s + e.height, 0) / entries.length;

        infills.push({
            clusterKey,
            vertices:  inflatedVerts,
            elevation: entries[0].elevation,
            height:    avgHeight,
        });
    }

    return { infills, refusals };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Absolute area of a simple 2-D (XZ) polygon — shoelace formula, in m².
 *
 * Used only to answer "does this polygon enclose ANY area, or is it a collinear
 * sliver?", compared against the kernel's `EPSILON_ZERO` in its declared role as
 * the degenerate-case zero guard.
 */
function _polygonArea2D(pts: { x: number; z: number }[]): number {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        if (!p || !q) continue;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

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
    // §C73-EPSILON-POLICY (L-920) — d1/d2 are UNIT direction vectors, so |denom| is
    // the magnitude of their 2-D cross product = sin(angle between them). "Is there
    // a unique intersection between these two supporting lines, or must we take the
    // collinear branch?" is the PARALLELISM question, so it consumes the kernel's
    // declared `PARALLEL_RAD` (C73 §2.2) rather than the local `1e-9` it replaces.
    // Same value, same role, same strictness — this is a provenance change, NOT a
    // behaviour change, and deliberately so: the measured defect (L-920) is a
    // DISTANCE, and no value of this angular guard fixes it. The fix is
    // §JUNCTION-VERTEX-CLAMP above; tightening or loosening this number here would
    // have been the fifth wrong attempt at the same bug.
    if (Math.abs(denom) < PARALLEL_RAD) return null;
    const t = ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / denom;
    return {
        x: p1.x + t * d1.x,
        z: p1.z + t * d1.z,
    };
}
