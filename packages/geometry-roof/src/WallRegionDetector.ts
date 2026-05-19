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

type Pt = [number, number];
type Seg = [Pt, Pt];

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

    private _extractSegments(walls: any[]): Seg[] {
        const segs: Seg[] = [];
        for (const w of walls) {
            if (!w.baseLine || w.baseLine.length < 2) continue;
            const a: Pt = [w.baseLine[0].x, w.baseLine[0].z];
            const b: Pt = [w.baseLine[1].x, w.baseLine[1].z];
            segs.push([a, b]);
        }
        return segs;
    }

    private _buildClosedLoops(segments: Seg[]): Pt[][] {
        const points: Pt[]     = [];
        const adj              = new Map<number, number[]>();
        const tolerance        = 0.05;

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

            if (loopIdxs.length > 50) return null;
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
