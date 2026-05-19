/**
 * FloorPolygonUtils — Pure polygon math for the Floor subsystem.
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/02-FLOOR-GEOMETRY-ENGINE-CONTRACT.md §11
 *
 * Rules:
 * - NO Three.js imports.
 * - NO store, command, or window access.
 * - Safely callable from any architectural layer.
 */

import { FloorVertex } from './FloorTypes';

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

export interface BoundingBox2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Compute the signed area of a polygon (positive = CCW, negative = CW).
 * Uses the shoelace formula in XZ space.
 */
export function computeSignedArea(polygon: FloorVertex[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    area += curr.x * next.z;
    area -= next.x * curr.z;
  }
  return area / 2;
}

/** Compute the absolute area (m²) of a floor polygon. */
export function computeArea(polygon: FloorVertex[]): number {
  return Math.abs(computeSignedArea(polygon));
}

/** Compute the perimeter (m) of a floor polygon. */
export function computePerimeter(polygon: FloorVertex[]): number {
  let perimeter = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    const dx = next.x - curr.x;
    const dz = next.z - curr.z;
    perimeter += Math.sqrt(dx * dx + dz * dz);
  }
  return perimeter;
}

/** Compute the centroid (geometric center) of a floor polygon. */
export function computeCentroid(polygon: FloorVertex[]): { x: number; z: number } {
  let cx = 0;
  let cz = 0;
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    const cross = curr.x * next.z - next.x * curr.z;
    area += cross;
    cx += (curr.x + next.x) * cross;
    cz += (curr.z + next.z) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    const sumX = polygon.reduce((s, v) => s + v.x, 0);
    const sumZ = polygon.reduce((s, v) => s + v.z, 0);
    return { x: sumX / n, z: sumZ / n };
  }
  cx /= 6 * area;
  cz /= 6 * area;
  return { x: cx, z: cz };
}

/** Compute the AABB of a floor polygon. */
export function computeBoundingBox(polygon: FloorVertex[]): BoundingBox2D {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of polygon) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Returns true if the polygon vertices are in CCW order (viewed from Y+, above). */
export function isCCW(polygon: FloorVertex[]): boolean {
  return computeSignedArea(polygon) > 0;
}

/**
 * Ensure polygon is CCW (viewed from above, Y+).
 * Returns a new array (does not mutate input).
 * Floor top face normals must point UP (+Y), which requires CCW winding.
 */
export function ensureCCW(polygon: FloorVertex[]): FloorVertex[] {
  if (isCCW(polygon)) return polygon.map(v => ({ ...v }));
  return [...polygon].reverse().map(v => ({ ...v }));
}

/**
 * Validate a floor polygon according to §R-7 and §01 §2.2.
 * Returns { valid: true } or { valid: false, reasons: [...] }.
 */
export function validatePolygon(polygon: FloorVertex[]): ValidationResult {
  const reasons: string[] = [];

  if (!Array.isArray(polygon) || polygon.length < 3) {
    reasons.push('Polygon must have at least 3 vertices.');
    return { valid: false, reasons };
  }

  for (let i = 0; i < polygon.length; i++) {
    const v = polygon[i]!;
    if (!isFinite(v.x) || !isFinite(v.z)) {
      reasons.push(`Vertex ${i} contains non-finite coordinates: (${v.x}, ${v.z})`);
    }
  }

  if (reasons.length > 0) return { valid: false, reasons };

  const area = computeArea(polygon);
  if (area < 0.01) {
    reasons.push(`Polygon area ${area.toFixed(4)} m² is below minimum 0.01 m².`);
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Returns true if the point is inside the polygon (ray casting algorithm).
 */
export function isPointInPolygon(
  point: FloorVertex,
  polygon: FloorVertex[]
): boolean {
  let inside = false;
  const n = polygon.length;
  let j = n - 1;
  for (let i = 0; i < n; j = i++) {
    const vi = polygon[i]!;
    const vj = polygon[j]!;
    if (
      vi.z > point.z !== vj.z > point.z &&
      point.x < ((vj.x - vi.x) * (point.z - vi.z)) / (vj.z - vi.z) + vi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Calculate a snapped point — snaps to 0°/45°/90° from the previous vertex
 * when shift is NOT held. Returns the snapped point.
 */
export function calculateSnapPoint(
  rawPoint: { x: number; z: number },
  previousPoint: { x: number; z: number } | null,
  shiftHeld: boolean
): { x: number; z: number } {
  if (!previousPoint || shiftHeld) return rawPoint;

  const dx = rawPoint.x - previousPoint.x;
  const dz = rawPoint.z - previousPoint.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 1e-6) return rawPoint;

  const angleRad = Math.atan2(dz, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  // Snap to nearest 45°
  const snapAngles = [0, 45, 90, 135, 180, -135, -90, -45];
  let closest = snapAngles[0]!;
  let minDiff = Infinity;
  for (const snap of snapAngles) {
    const diff = Math.abs(angleDeg - snap);
    const wrappedDiff = Math.min(diff, 360 - diff);
    if (wrappedDiff < minDiff) {
      minDiff = wrappedDiff;
      closest = snap;
    }
  }

  const SNAP_THRESHOLD_DEG = 7.5;
  if (minDiff > SNAP_THRESHOLD_DEG) return rawPoint;

  const snappedRad = (closest * Math.PI) / 180;
  return {
    x: previousPoint.x + length * Math.cos(snappedRad),
    z: previousPoint.z + length * Math.sin(snappedRad),
  };
}
