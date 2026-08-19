import * as THREE from '@pryzm/renderer-three/three';

export class GeometryUtils {
    static lineLineIntersection2D(
        p1: THREE.Vector3, p2: THREE.Vector3,
        p3: THREE.Vector3, p4: THREE.Vector3
    ): THREE.Vector3 | null {
        const x1 = p1.x, y1 = p1.z;
        const x2 = p2.x, y2 = p2.z;
        const x3 = p3.x, y3 = p3.z;
        const x4 = p4.x, y4 = p4.z;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return new THREE.Vector3(
                x1 + t * (x2 - x1),
                // §SNAP-LEVEL-SCOPE (L-1108) — WAS a hard-coded `0`. Same defect shape
                // as `pointToLineDistance2D`: the intersection of two Level-3 walls was
                // reported on the ground plane, and `WallSnapProvider` then measured
                // `queryPoint.distanceTo(intersection)` in 3-D — so `dist <= radius`
                // was UNSATISFIABLE above Level 0 and the INTERSECTION snap was dead
                // there. The intersection lies on the plane of the lines that made it;
                // `p1.y` is that plane. Ground floor is unchanged (`p1.y` is 0 there).
                p1.y,
                y1 + t * (y2 - y1)
            );
        }
        return null;
    }

    /**
     * Closest point on a line SEGMENT to `point`, measured in the XZ (plan) plane.
     *
     * §SNAP-LEVEL-SCOPE (L-1108) — ⛔ THIS FUNCTION WAS NOT 2-D, AND THAT IS THE
     * SINGLE ROOT BEHIND THE FOUNDER'S REPORT. Corrected here; do not re-collapse it.
     *
     * It projected in XZ (`lineVec.y = 0; pointVec.y = 0`) — correct — then wrote
     * `closestPoint.y = 0` and measured `|point − closestPoint|` in FULL THREE
     * DIMENSIONS. The reported distance was therefore
     *
     *     sqrt(dxz² + point.y²)
     *
     * i.e. the plan distance INFLATED BY THE CURSOR'S ELEVATION, and the point it
     * returned sat on the WORLD ORIGIN PLANE — the ground floor — whatever storey the
     * caller was on. Two consequences, both of them the reported bug:
     *
     *  1. On the GROUND floor (`point.y = 0`) the elevation term is zero, so this read
     *     as a correct 2-D distance and shipped. On any storey above it, every caller
     *     compares that inflated distance against a snap tolerance clamped to
     *     `MAX_WORLD_TOLERANCE_M = 1.0 m`. At a 3 m storey the test
     *     `result.distance <= radius` is UNSATISFIABLE — so wall CENTERLINE, EDGE and
     *     FACE snapping, and the curtain-wall equivalents, were not merely
     *     mis-prioritised above Level 0. They were DEAD. Five of the snap families the
     *     founder was reaching for could never fire on an upper floor.
     *  2. Where a caller did use `closestPoint` (the wall-join `t` bound check), the
     *     geometry it reasoned about was the ground-plane projection.
     *
     * The fix keeps the projection identical and makes the MEASUREMENT match the name:
     * distance is the XZ distance, and the closest point is reported on the CALLER'S
     * plane rather than on y = 0. Ground-floor behaviour is bit-for-bit unchanged
     * (`point.y = 0` makes both forms equal), which is why this was invisible for so
     * long — and is also why the correction cannot regress the ground floor.
     */
    static pointToLineDistance2D(
        point: THREE.Vector3,
        lineStart: THREE.Vector3,
        lineEnd: THREE.Vector3
    ): { distance: number; closestPoint: THREE.Vector3; t: number } {
        const lineVec = new THREE.Vector3().subVectors(lineEnd, lineStart);
        const pointVec = new THREE.Vector3().subVectors(point, lineStart);

        lineVec.y = 0;
        pointVec.y = 0;

        const lineLenSq = lineVec.lengthSq();
        if (lineLenSq < 1e-10) {
            // Degenerate segment: the whole thing is one point in plan. `pointVec` is
            // already flattened, so its length IS the plan distance.
            const degenerate = lineStart.clone();
            degenerate.y = point.y;
            return {
                distance: pointVec.length(),
                closestPoint: degenerate,
                t: 0
            };
        }

        let t = pointVec.dot(lineVec) / lineLenSq;
        t = Math.max(0, Math.min(1, t));

        const closestPoint = new THREE.Vector3()
            .copy(lineStart)
            .add(lineVec.clone().multiplyScalar(t));
        // Report on the QUERY's plane, not on y = 0. Callers that author on a level
        // (WallTool, CurtainWallTool) re-stamp the elevation anyway; callers that do
        // not (BeamTool returns `res.point` verbatim) were silently getting a
        // ground-floor point.
        closestPoint.y = point.y;

        // XZ only — see the block comment. `lineVec` and `pointVec` are already
        // flattened, so this is the plan distance by construction.
        const dx = point.x - closestPoint.x;
        const dz = point.z - closestPoint.z;
        const distance = Math.hypot(dx, dz);

        return { distance, closestPoint, t };
    }

    static getMidpoint(p1: THREE.Vector3, p2: THREE.Vector3): THREE.Vector3 {
        return new THREE.Vector3()
            .addVectors(p1, p2)
            .multiplyScalar(0.5);
    }

    static getPerpendicularPoint(
        point: THREE.Vector3,
        lineStart: THREE.Vector3,
        lineEnd: THREE.Vector3
    ): THREE.Vector3 | null {
        const result = this.pointToLineDistance2D(point, lineStart, lineEnd);
        if (result.t > 0 && result.t < 1) {
            return result.closestPoint;
        }
        return null;
    }

    static isPerpendicularToLine(
        fromPoint: THREE.Vector3,
        toPoint: THREE.Vector3,
        lineStart: THREE.Vector3,
        lineEnd: THREE.Vector3,
        tolerance: number = 0.01
    ): boolean {
        const lineDir = new THREE.Vector3().subVectors(lineEnd, lineStart).normalize();
        const pointDir = new THREE.Vector3().subVectors(toPoint, fromPoint).normalize();
        
        lineDir.y = 0;
        pointDir.y = 0;
        
        const dot = Math.abs(lineDir.dot(pointDir));
        return dot < tolerance;
    }

    static extendLineToIntersection(
        lineStart: THREE.Vector3,
        lineEnd: THREE.Vector3,
        targetStart: THREE.Vector3,
        targetEnd: THREE.Vector3
    ): THREE.Vector3 | null {
        const x1 = lineStart.x, y1 = lineStart.z;
        const x2 = lineEnd.x, y2 = lineEnd.z;
        const x3 = targetStart.x, y3 = targetStart.z;
        const x4 = targetEnd.x, y4 = targetEnd.z;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        if (u >= 0 && u <= 1) {
            return new THREE.Vector3(
                x1 + t * (x2 - x1),
                0,
                y1 + t * (y2 - y1)
            );
        }
        return null;
    }
}
