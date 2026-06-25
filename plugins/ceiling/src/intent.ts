// Ceiling intent helpers (S14-T8).

import type { CeilingData } from './store.js';

export interface CeilingValidation { readonly ok: boolean; readonly reason?: string }

export function isFiniteVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return Number.isFinite(r.x as number) && Number.isFinite(r.y as number) && Number.isFinite(r.z as number);
}

/** Signed area of a closed XZ polygon (positive = CCW seen from +Y). */
export function polygonSignedArea(boundary: CeilingData['boundary']): number {
  let s = 0;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]!;
    const b = boundary[(i + 1) % boundary.length]!;
    s += a.x * b.z - b.x * a.z;
  }
  return s * 0.5;
}

/** §RESI-CEILING-DEGENERATE-GUARD-2 (2026-06-25) — the number of NON-COINCIDENT vertices in an
 *  XZ boundary (consecutive points within `eps` collapse to one; first/last wrap is closed). A
 *  boundary with ≥3 raw points but <3 distinct corners is degenerate (a line / a point) and would
 *  load-fail `validatePolygon` ("at least 3 vertices") → the 120-ceiling project-open freeze. */
function distinctCornerCount(b: readonly { readonly x: number; readonly z: number }[], eps = 1e-3): number {
  const pts: Array<{ x: number; z: number }> = [];
  for (const p of b) {
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < eps) continue;
    pts.push({ x: p.x, z: p.z });
  }
  // Close the ring: drop a trailing point coincident with the first.
  if (pts.length >= 2) {
    const a = pts[0]!, z = pts[pts.length - 1]!;
    if (Math.hypot(a.x - z.x, a.z - z.z) < eps) pts.pop();
  }
  return pts.length;
}

/** §RESI-CEILING-DEGENERATE-GUARD-2 — reject a ceiling boundary that is degenerate. Mirrors the
 *  STRONG single-command `validatePolygon` (CeilingPolygonUtils) so the BATCH path can no longer
 *  save a zero-area / collinear / <3-distinct-corner ceiling that then load-fails. Checks: ≥3 raw
 *  points, all finite, ≥3 NON-COINCIDENT corners, and shoelace |area| ≥ MIN_CEILING_AREA_M2. */
export const MIN_CEILING_AREA_M2 = 0.05;
export function validateCeilingBoundary(b: readonly { x: number; y: number; z: number }[]): CeilingValidation {
  if (b.length < 3) return { ok: false, reason: 'boundary requires ≥ 3 points' };
  for (const p of b) if (!isFiniteVec3(p)) return { ok: false, reason: 'boundary points must be finite Vec3' };
  if (distinctCornerCount(b) < 3) return { ok: false, reason: 'boundary has < 3 distinct corners (collinear/coincident → degenerate)' };
  const area = Math.abs(polygonSignedArea(b as CeilingData['boundary']));
  if (area < MIN_CEILING_AREA_M2) return { ok: false, reason: `boundary area ${area.toFixed(4)} m² < ${MIN_CEILING_AREA_M2} m² (degenerate)` };
  return { ok: true };
}

export function validateCeilingDims(
  d: Partial<Pick<CeilingData, 'ceilingHeight' | 'thickness'>>,
): CeilingValidation {
  if (d.ceilingHeight !== undefined && (!Number.isFinite(d.ceilingHeight) || d.ceilingHeight <= 0)) {
    return { ok: false, reason: 'ceilingHeight must be > 0' };
  }
  if (d.thickness !== undefined && (!Number.isFinite(d.thickness) || d.thickness <= 0)) {
    return { ok: false, reason: 'thickness must be > 0' };
  }
  if (d.ceilingHeight !== undefined && d.thickness !== undefined && d.thickness >= d.ceilingHeight) {
    return { ok: false, reason: 'thickness must be < ceilingHeight' };
  }
  return { ok: true };
}
