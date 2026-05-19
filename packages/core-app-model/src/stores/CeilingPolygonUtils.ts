/**
 * CeilingPolygonUtils — Pure polygon math, no Three.js, no store, no commands.
 * Safe to call from any layer including unit tests without a renderer.
 */

import { CeilingVertex } from './CeilingTypes';

export interface BoundingBox2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PolygonValidationResult {
  valid: boolean;
  reasons: string[];
}

/** Signed area via shoelace (positive = CCW). */
function signedArea(polygon: CeilingVertex[]): number {
  let sum = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** Area in m² (always positive). */
export function computeArea(polygon: CeilingVertex[]): number {
  return Math.abs(signedArea(polygon));
}

/** Perimeter in m. */
export function computePerimeter(polygon: CeilingVertex[]): number {
  let total = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    total += Math.sqrt(dx * dx + dz * dz);
  }
  return total;
}

/** Weighted polygon centroid. */
export function computeCentroid(polygon: CeilingVertex[]): { x: number; z: number } {
  if (polygon.length === 0) return { x: 0, z: 0 };
  const area = signedArea(polygon);
  if (Math.abs(area) < 1e-10) {
    // Degenerate — fall back to simple average
    const cx = polygon.reduce((s, v) => s + v.x, 0) / polygon.length;
    const cz = polygon.reduce((s, v) => s + v.z, 0) / polygon.length;
    return { x: cx, z: cz };
  }
  let cx = 0;
  let cz = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    const cross = a.x * b.z - b.x * a.z;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }
  const factor = 1 / (6 * area);
  return { x: cx * factor, z: cz * factor };
}

/** Axis-aligned bounding box in XZ plane. */
export function computeBoundingBox(polygon: CeilingVertex[]): BoundingBox2D {
  if (polygon.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  let minX = polygon[0]!.x;
  let maxX = polygon[0]!.x;
  let minZ = polygon[0]!.z;
  let maxZ = polygon[0]!.z;
  for (const v of polygon) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** True if polygon is counter-clockwise (positive signed area in XZ right-hand). */
export function isCCW(polygon: CeilingVertex[]): boolean {
  return signedArea(polygon) > 0;
}

/** Returns a copy of the polygon guaranteed to be CCW. Reverses if CW. */
export function ensureCCW(polygon: CeilingVertex[]): CeilingVertex[] {
  if (isCCW(polygon)) return polygon.slice();
  return polygon.slice().reverse();
}

/** Ray-casting point-in-polygon (XZ plane). */
export function isPointInPolygon(
  point: CeilingVertex,
  polygon: CeilingVertex[]
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersect =
      pi.z > point.z !== pj.z > point.z &&
      point.x < ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if two line segments intersect (excluding shared endpoints). */
function segmentsIntersect(
  a1: CeilingVertex,
  a2: CeilingVertex,
  b1: CeilingVertex,
  b2: CeilingVertex
): boolean {
  const dax = a2.x - a1.x;
  const daz = a2.z - a1.z;
  const dbx = b2.x - b1.x;
  const dbz = b2.z - b1.z;
  const denom = dax * dbz - daz * dbx;
  if (Math.abs(denom) < 1e-12) return false; // parallel
  const dx = b1.x - a1.x;
  const dz = b1.z - a1.z;
  const t = (dx * dbz - dz * dbx) / denom;
  const u = (dx * daz - dz * dax) / denom;
  const eps = 1e-8;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/** O(n²) self-intersection check. */
export function isSimplePolygon(polygon: CeilingVertex[]): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i]!;
    const a2 = polygon[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // shared endpoint
      const b1 = polygon[j]!;
      const b2 = polygon[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/** True if all hole vertices are inside the outer polygon and no edges cross. */
export function isHoleContainedInPolygon(
  hole: CeilingVertex[],
  polygon: CeilingVertex[]
): boolean {
  for (const v of hole) {
    if (!isPointInPolygon(v, polygon)) return false;
  }
  const hn = hole.length;
  const pn = polygon.length;
  for (let i = 0; i < hn; i++) {
    const h1 = hole[i]!;
    const h2 = hole[(i + 1) % hn]!;
    for (let j = 0; j < pn; j++) {
      const p1 = polygon[j]!;
      const p2 = polygon[(j + 1) % pn]!;
      if (segmentsIntersect(h1, h2, p1, p2)) return false;
    }
  }
  return true;
}

/** Comprehensive polygon validation for CeilingStore boundary check. */
export function validatePolygon(polygon: CeilingVertex[]): PolygonValidationResult {
  const reasons: string[] = [];

  if (!Array.isArray(polygon) || polygon.length < 3) {
    reasons.push('Polygon must have at least 3 vertices.');
    return { valid: false, reasons };
  }

  for (const v of polygon) {
    if (!isFinite(v.x) || !isFinite(v.z)) {
      reasons.push('All vertices must be finite numbers.');
      return { valid: false, reasons };
    }
  }

  const area = computeArea(polygon);
  if (area < 0.01) {
    reasons.push(`Polygon area ${area.toFixed(4)} m² is below minimum 0.01 m² (degenerate).`);
  }

  if (!isSimplePolygon(polygon)) {
    reasons.push('Polygon is self-intersecting.');
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Axis/diagonal snap — mirrors Pascal calculateSnapPoint logic.
 * Returns the snapped position given the last placed vertex and the current cursor.
 */
export function calculateSnapPoint(
  lastPoint: CeilingVertex,
  currentPoint: CeilingVertex
): CeilingVertex {
  const dx = currentPoint.x - lastPoint.x;
  const dz = currentPoint.z - lastPoint.z;
  const absDx = Math.abs(dx);
  const absDz = Math.abs(dz);

  const horizontalDist = absDz;
  const verticalDist = absDx;
  const diagonalDist = Math.abs(absDx - absDz);

  const minDist = Math.min(horizontalDist, verticalDist, diagonalDist);

  if (minDist === diagonalDist) {
    const diagonalLength = Math.min(absDx, absDz);
    return {
      x: lastPoint.x + Math.sign(dx) * diagonalLength,
      z: lastPoint.z + Math.sign(dz) * diagonalLength,
    };
  }
  if (minDist === horizontalDist) {
    return { x: currentPoint.x, z: lastPoint.z };
  }
  return { x: lastPoint.x, z: currentPoint.z };
}
