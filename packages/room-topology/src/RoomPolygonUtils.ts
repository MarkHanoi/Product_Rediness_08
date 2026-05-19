/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Utility / Pure Math
 * File:             src/elements/rooms/RoomPolygonUtils.ts
 * Contract:         docs/01_ELEMENTS/09_Rooms_Contract/01-ROOM-DATA-MODEL-CONTRACT.md §6.2
 *                   docs/01_ELEMENTS/09_Rooms_Contract/ROOM-IMPLEMENTATION-PLAN.md §1.3
 *
 * Pure-function polygon utilities. No THREE.js imports. No store access.
 * All math operates in the XZ plane (x = world X, z = world Z).
 */

import { RoomVertex, RoomBoundary, RoomComputedMetrics } from './RoomTypes';

export const MAX_POLYGON_VERTICES = 256;
/**
 * Minimum interior face area (m²) below which an enclosed region is NOT
 * promoted to a Room by the auto-detection pipeline.
 *
 * §AREA-THRESHOLD-2026-04 — Lowered from 2.0 m² to 0.5 m² to support small
 * residential / utility rooms (broom cupboards, en-suite WCs, riser shafts,
 * pantries, plant cupboards, niches). 0.5 m² ≈ a 0.7 m × 0.7 m enclosure,
 * which is the smallest space a person can occupy and the smallest unit
 * commonly drawn in residential plans.
 *
 * Per-occupancy minimum-area compliance (§ROOM-VALIDATION) is independent
 * of this constant — it is enforced by `RoomValidationService` against the
 * occupancy's `RoomSystemType.minArea` AFTER the room has been detected.
 *
 * Auditing references:
 *   - `docs/00_AUDITS/ROOM-SYSTEM-AUDIT-2026.md` §28
 *   - `docs/01_ELEMENTS/09_Rooms_Contract/01-ROOM-DATA-MODEL-CONTRACT.md` §6.2
 *   - `docs/01_ELEMENTS/09_Rooms_Contract/10-ROOM-COMPLIANCE-AUDIT.md`
 */
export const MIN_ROOM_AREA_M2 = 0.5;

export interface BoundingBox2D {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Shoelace formula for signed area.
 * Positive result = CCW winding (right-hand XZ system, Y-up).
 * Negative result = CW winding.
 */
export function computeSignedArea(polygon: RoomVertex[]): number {
  const n = polygon.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].z;
    area -= polygon[j].x * polygon[i].z;
  }
  return area / 2;
}

/**
 * Unsigned area in m² via the shoelace formula.
 */
export function polygonAreaM2(polygon: RoomVertex[]): number {
  return Math.abs(computeSignedArea(polygon));
}

/**
 * Perimeter length in metres.
 */
export function polygonPerimeterM(polygon: RoomVertex[]): number {
  const n = polygon.length;
  if (n < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = polygon[j].x - polygon[i].x;
    const dz = polygon[j].z - polygon[i].z;
    perimeter += Math.sqrt(dx * dx + dz * dz);
  }
  return perimeter;
}

/**
 * Weighted polygon centroid (not simple average).
 * Uses the standard signed-area decomposition for accurate placement in non-convex rooms.
 */
export function polygonCentroid(polygon: RoomVertex[]): RoomVertex {
  const n = polygon.length;
  if (n === 0) return { x: 0, z: 0 };
  if (n === 1) return { x: polygon[0].x, z: polygon[0].z };
  if (n === 2) return { x: (polygon[0].x + polygon[1].x) / 2, z: (polygon[0].z + polygon[1].z) / 2 };

  let cx = 0;
  let cz = 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = polygon[i].x * polygon[j].z - polygon[j].x * polygon[i].z;
    area += cross;
    cx += (polygon[i].x + polygon[j].x) * cross;
    cz += (polygon[i].z + polygon[j].z) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    // Degenerate — fall back to simple average
    let sx = 0, sz = 0;
    for (const v of polygon) { sx += v.x; sz += v.z; }
    return { x: sx / n, z: sz / n };
  }
  const factor = 1 / (6 * area);
  return { x: cx * factor, z: cz * factor };
}

/**
 * Axis-aligned bounding box of a polygon.
 */
export function polygonAABB(polygon: RoomVertex[]): BoundingBox2D {
  if (polygon.length === 0) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  let minX = polygon[0].x, maxX = polygon[0].x;
  let minZ = polygon[0].z, maxZ = polygon[0].z;
  for (const v of polygon) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, minZ, maxX, maxZ };
}

/**
 * Ensures the polygon is wound CCW.
 * If the signed area is negative (CW), reverses the array in-place.
 * Returns the same array reference.
 */
export function ensureCCW(polygon: RoomVertex[]): RoomVertex[] {
  if (computeSignedArea(polygon) < 0) {
    polygon.reverse();
  }
  return polygon;
}

/**
 * Segment-segment intersection test (exclusive of endpoints).
 * Returns true if segments (p1→p2) and (p3→p4) properly intersect.
 */
function segmentsIntersect(
  p1: RoomVertex, p2: RoomVertex,
  p3: RoomVertex, p4: RoomVertex
): boolean {
  const d1x = p2.x - p1.x, d1z = p2.z - p1.z;
  const d2x = p4.x - p3.x, d2z = p4.z - p3.z;

  const cross = d1x * d2z - d1z * d2x;
  if (Math.abs(cross) < 1e-10) return false; // parallel

  const dx = p3.x - p1.x, dz = p3.z - p1.z;
  const t = (dx * d2z - dz * d2x) / cross;
  const u = (dx * d1z - dz * d1x) / cross;

  // Exclusive (0,1) to avoid flagging shared endpoints
  return t > 1e-10 && t < 1 - 1e-10 && u > 1e-10 && u < 1 - 1e-10;
}

/**
 * Returns true if the polygon has no self-intersections.
 * O(n²) — acceptable for n < 200 vertices.
 */
export function isSimple(polygon: RoomVertex[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      if (j === n - 1 && i === 0) continue; // skip closing edge vs opening edge
      const j2 = (j + 1) % n;
      if (segmentsIntersect(polygon[i], polygon[i2], polygon[j], polygon[j2])) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Ray-casting algorithm: true if point (px, pz) is inside the polygon.
 */
export function pointInPolygon(px: number, pz: number, polygon: RoomVertex[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    const intersect = ((zi > pz) !== (zj > pz)) &&
      (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Computes all RoomComputedMetrics from a boundary.
 */
export function computeRoomMetrics(boundary: RoomBoundary): RoomComputedMetrics {
  const { polygon, height } = boundary;
  const area = polygonAreaM2(polygon);
  const perimeter = polygonPerimeterM(polygon);
  const centroid = polygonCentroid(polygon);
  const bb = polygonAABB(polygon);
  return {
    area,
    grossArea: area,   // Phase 1: grossArea = area; wall-thickness offset in Phase 2
    perimeter,
    volume: area * height,
    centroid,
    boundingBox: bb,
  };
}

/**
 * Sanitises an external input polygon:
 * - Filters out non-finite vertices
 * - Removes consecutive duplicate vertices
 * - Clamps to MAX_POLYGON_VERTICES
 * Returns null if the polygon is degenerate (< 3 vertices or near-zero area).
 */
export function sanitisePolygon(vertices: unknown[]): RoomVertex[] | null {
  if (!Array.isArray(vertices)) return null;

  const valid: RoomVertex[] = [];
  for (const v of vertices) {
    if (typeof v !== 'object' || v === null) continue;
    const vv = v as Record<string, unknown>;
    const x = Number(vv['x']);
    const z = Number(vv['z']);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    // Remove consecutive duplicates
    if (valid.length > 0) {
      const last = valid[valid.length - 1];
      if (Math.abs(last.x - x) < 1e-10 && Math.abs(last.z - z) < 1e-10) continue;
    }
    valid.push({ x, z });
    if (valid.length >= MAX_POLYGON_VERTICES) break;
  }

  if (valid.length < 3) return null;
  if (polygonAreaM2(valid) < 0.01) return null;

  return valid;
}
