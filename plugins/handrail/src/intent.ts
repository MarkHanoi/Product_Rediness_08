// Handrail intent helpers (S14-T4).

import type { HandrailData } from './store.js';

export interface HandrailValidation { readonly ok: boolean; readonly reason?: string }

export function isFiniteVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return Number.isFinite(r.x as number) && Number.isFinite(r.y as number) && Number.isFinite(r.z as number);
}

export function pathTotalLength(path: HandrailData['path']): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

export function validateHandrailPath(path: readonly { x: number; y: number; z: number }[]): HandrailValidation {
  if (path.length < 2) return { ok: false, reason: 'path must have ≥ 2 points' };
  for (const p of path) if (!isFiniteVec3(p)) return { ok: false, reason: 'path points must be finite Vec3' };
  const a = path[0]!;
  const b = path[path.length - 1]!;
  if (a.x === b.x && a.y === b.y && a.z === b.z) {
    return { ok: false, reason: 'first / last path points must differ (zero-length rail)' };
  }
  return { ok: true };
}
