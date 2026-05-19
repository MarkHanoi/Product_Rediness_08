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
                0,
                y1 + t * (y2 - y1)
            );
        }
        return null;
    }

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
            return {
                distance: pointVec.length(),
                closestPoint: lineStart.clone(),
                t: 0
            };
        }

        let t = pointVec.dot(lineVec) / lineLenSq;
        t = Math.max(0, Math.min(1, t));

        const closestPoint = new THREE.Vector3()
            .copy(lineStart)
            .add(lineVec.clone().multiplyScalar(t));
        closestPoint.y = 0;

        const distance = new THREE.Vector3()
            .subVectors(point, closestPoint)
            .length();

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
