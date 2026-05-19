import * as THREE from '@pryzm/renderer-three/three';

export type WallPath =
  | { kind: "Line"; start: THREE.Vector3; end: THREE.Vector3 }
  | { kind: "Arc"; start: THREE.Vector3; end: THREE.Vector3; control: THREE.Vector3 };

export class PathResolver {
  static toPolyline(path: WallPath, segments = 16): THREE.Vector3[] {
    if (path.kind === "Line") {
      return [path.start.clone(), path.end.clone()];
    }

    if (path.kind === "Arc") {
      return this.arcToPoints(path.start, path.control, path.end, segments);
    }
    return [];
  }

  /**
   * Given a polyline (from toPolyline), compute cumulative arc-length
   * distances for each vertex.  lengths[0] = 0, lengths[n] = total length.
   */
  static computeArcLengths(points: THREE.Vector3[]): number[] {
    const lengths: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      lengths.push(lengths[i - 1] + points[i - 1].distanceTo(points[i]));
    }
    return lengths;
  }

  /**
   * Map a world-space distance along a polyline back to a 0-1 parameter
   * representing position along the full arc.  Used for opening placement.
   */
  static distanceToT(lengths: number[], targetDist: number): number {
    const total = lengths[lengths.length - 1];
    if (total <= 0) return 0;
    const clamped = Math.max(0, Math.min(targetDist, total));
    for (let i = 1; i < lengths.length; i++) {
      if (lengths[i] >= clamped) {
        const seg = lengths[i] - lengths[i - 1];
        const frac = seg > 0 ? (clamped - lengths[i - 1]) / seg : 0;
        return ((i - 1 + frac) / (lengths.length - 1));
      }
    }
    return 1;
  }

  /**
   * Find the closest point on a polyline to a world-space query point.
   * Returns { point, t, segmentIndex } where t is 0-1 along the full arc.
   */
  static closestPointOnPolyline(
    points: THREE.Vector3[],
    query: THREE.Vector3
  ): { point: THREE.Vector3; t: number; segmentIndex: number } {
    let bestDist = Infinity;
    let bestPoint = points[0].clone();
    let bestT = 0;
    let bestSeg = 0;
    const n = points.length;

    for (let i = 0; i < n - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const ab = new THREE.Vector3().subVectors(b, a);
      const aq = new THREE.Vector3().subVectors(query, a);
      const len2 = ab.lengthSq();
      let u = len2 > 0 ? aq.dot(ab) / len2 : 0;
      u = Math.max(0, Math.min(1, u));
      const proj = new THREE.Vector3().addVectors(a, ab.clone().multiplyScalar(u));
      const dist = query.distanceTo(proj);
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = proj;
        bestT = (i + u) / (n - 1);
        bestSeg = i;
      }
    }

    return { point: bestPoint, t: bestT, segmentIndex: bestSeg };
  }

  private static arcToPoints(start: THREE.Vector3, control: THREE.Vector3, end: THREE.Vector3, segments: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);

    for (let i = 0; i <= segments; i++) {
      points.push(curve.getPoint(i / segments));
    }

    return points;
  }
}
