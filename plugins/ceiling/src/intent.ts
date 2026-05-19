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

export function validateCeilingBoundary(b: readonly { x: number; y: number; z: number }[]): CeilingValidation {
  if (b.length < 3) return { ok: false, reason: 'boundary requires ≥ 3 points' };
  for (const p of b) if (!isFiniteVec3(p)) return { ok: false, reason: 'boundary points must be finite Vec3' };
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
