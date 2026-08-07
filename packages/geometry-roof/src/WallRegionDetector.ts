/**
 * WallRegionDetector
 *
 * Extracts closed wall-boundary regions from the wall store and finds
 * which region (if any) contains a given hit-point.
 *
 * Contract compliance:
 *  - §05-ROOF-INTEGRATION-CONTRACT §9 — must be an injectable class
 *  - Zero window global reads; wall store injected at call time
 *  - Single responsibility: topology loop detection only
 *
 * @file packages/geometry-roof/src/WallRegionDetector.ts
 */

import * as THREE from '@pryzm/renderer-three/three';
import { sampleWallChords } from './pure/wallCentreline.js';

type Pt = [number, number];
type Seg = [Pt, Pt];

/**
 * §FIX-ROOF-REGION-FOLLOWS-ARC (L-699) — a tessellated curved wall contributes
 * `curve.segments` (default 16) chords instead of one, so a region bounded by a
 * few curved walls easily exceeds the old hard cap of 50 loop vertices. The cap
 * exists only to stop a pathological trace running away; it must scale with the
 * tessellation, not with the wall COUNT.
 *
 * ⚠ The old value silently returned `null` — i.e. "no closed region here" —
 * which is indistinguishable to the user from "you clicked outside a room". An
 * absence produced by a limit is not an absence (§CONTEXT-DATA-HONESTY), so the
 * detector now logs when it aborts on the cap.
 */
const MAX_LOOP_VERTICES = 2048;

export class WallRegionDetector {

    /**
     * Returns the polygon coordinates of the closed wall loop containing
     * `hitPoint`, or `null` if none is found.
     *
     * Returned coordinates are in absolute world XZ space, winding CCW
     * (positive area), with at least 3 vertices.
     */
    detect(hitPoint: THREE.Vector3, wallStore: { getAll(): any[] }): Pt[] | null {
        const walls    = wallStore.getAll();
        const segments = this._extractSegments(walls);
        const loops    = this._buildClosedLoops(segments);
        const click: Pt = [hitPoint.x, hitPoint.z];

        for (const loop of loops) {
            if (this._isPointInPolygon(click, loop)) {
                const area = this._signedArea(loop);
                const poly = area < 0 ? [...loop].reverse() : loop;
                return poly;
            }
        }
        return null;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * §FIX-ROOF-REGION-FOLLOWS-ARC (L-699, founder 2026-08-07)
     *
     * ⚠ THE DEFECT THIS REPLACES: this method read ONLY `baseLine[0]` and
     * `baseLine[1]`. For a CURVED wall those are the arc's ENDPOINTS — the CHORD —
     * and `curve.control` was never consulted. So a roof drawn BY REGION over a
     * room bounded by a curved wall was built on a boundary that ran straight
     * across the bow. It did not fail; it produced a confident wrong footprint,
     * which is why the symptom read as "the roof ignores the curved wall".
     *
     * A curved wall now contributes its `curve.segments` (default 16) chords,
     * sampled by the SAME quadratic-Bézier parameterisation the room ring uses
     * (`sampleWallChords` → see its file header on why that agreement matters).
     * A straight wall still contributes exactly one chord, bit-identical to the
     * previous behaviour — so no straight-walled region changes at all.
     */
    private _extractSegments(walls: any[]): Seg[] {
        const segs: Seg[] = [];
        for (const w of walls) {
            for (const [a, b] of sampleWallChords(w)) segs.push([a, b]);
        }
        return segs;
    }

    private _buildClosedLoops(segments: Seg[]): Pt[][] {
        const points: Pt[]     = [];
        const adj              = new Map<number, number[]>();
        // §FIX-ROOF-REGION-FOLLOWS-ARC (L-699) — the node-merge tolerance was a
        // fixed 50 mm, chosen when every segment was a whole wall. A tessellated
        // arc of small radius produces chords SHORTER than that, and two ends of
        // one chord would then merge into a single node (`u === v` → the chord is
        // dropped) and silently break the loop. Scale the tolerance to the
        // shortest chord present so it can never swallow a real segment, while
        // keeping the historic 50 mm whenever the geometry is coarse enough.
        let shortest = Infinity;
        for (const [a, b] of segments) {
            const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (d > 1e-9 && d < shortest) shortest = d;
        }
        const tolerance = Number.isFinite(shortest)
            ? Math.min(0.05, shortest * 0.4)
            : 0.05;

        const getIdx = (p: Pt): number => {
            for (let i = 0; i < points.length; i++) {
                if (Math.hypot(points[i][0] - p[0], points[i][1] - p[1]) < tolerance) return i;
            }
            points.push([p[0], p[1]]);
            return points.length - 1;
        };

        for (const [a, b] of segments) {
            const u = getIdx(a), v = getIdx(b);
            if (u === v) continue;
            if (!adj.has(u)) adj.set(u, []);
            if (!adj.has(v)) adj.set(v, []);
            adj.get(u)!.push(v);
            adj.get(v)!.push(u);
        }

        const loops: Pt[][] = [];
        const visitedEdges  = new Set<string>();

        for (let i = 0; i < points.length; i++) {
            for (const neighbor of adj.get(i) ?? []) {
                if (visitedEdges.has(`${i}-${neighbor}`)) continue;
                const loop = this._traceLoop(i, neighbor, adj, points, visitedEdges);
                if (loop && loop.length >= 3) loops.push(loop);
            }
        }
        return loops;
    }

    private _traceLoop(
        startIdx: number,
        nextIdx:  number,
        adj:          Map<number, number[]>,
        points:       Pt[],
        visitedEdges: Set<string>,
    ): Pt[] | null {
        const loopIdxs = [startIdx, nextIdx];
        visitedEdges.add(`${startIdx}-${nextIdx}`);
        visitedEdges.add(`${nextIdx}-${startIdx}`);

        let currIdx = nextIdx;
        let prevIdx = startIdx;

        while (true) {
            const neighbors = adj.get(currIdx) ?? [];
            if (neighbors.length < 2) return null;

            const pCurr = points[currIdx];
            const pPrev = points[prevIdx];
            const vPrevX = pPrev[0] - pCurr[0];
            const vPrevZ = pPrev[1] - pCurr[1];

            let bestNeighbor = -1;
            let bestAngle    = Infinity;

            for (const n of neighbors) {
                if (n === prevIdx) continue;
                const vNextX = points[n][0] - pCurr[0];
                const vNextZ = points[n][1] - pCurr[1];
                let angle = Math.atan2(vNextZ, vNextX) - Math.atan2(vPrevZ, vPrevX);
                if (angle <= 0) angle += Math.PI * 2;
                if (angle < bestAngle) { bestAngle = angle; bestNeighbor = n; }
            }

            if (bestNeighbor === -1) return null;
            if (bestNeighbor === startIdx) break;
            if (loopIdxs.includes(bestNeighbor)) return null;

            visitedEdges.add(`${currIdx}-${bestNeighbor}`);
            visitedEdges.add(`${bestNeighbor}-${currIdx}`);
            loopIdxs.push(bestNeighbor);
            prevIdx = currIdx;
            currIdx = bestNeighbor;

            if (loopIdxs.length > MAX_LOOP_VERTICES) {
                // Report rather than return a silent "no region here" (L-699).
                console.warn(
                    `[WallRegionDetector] §FIX-ROOF-REGION-FOLLOWS-ARC loop trace aborted at ` +
                    `${MAX_LOOP_VERTICES} vertices — treating as NO region. If this fires on a ` +
                    `real room the cap, not the model, is the limit.`,
                );
                return null;
            }
        }

        return loopIdxs.map(idx => points[idx]);
    }

    private _isPointInPolygon(point: Pt, polygon: Pt[]): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > point[1]) !== (yj > point[1])) &&
                (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    private _signedArea(polygon: Pt[]): number {
        let area = 0;
        for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            area += polygon[i][0] * polygon[j][1];
            area -= polygon[j][0] * polygon[i][1];
        }
        return area / 2;
    }
}
