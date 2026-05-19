// Stair intent / validation helpers (S14-T1).
//
// Pure functions used by handlers + the (future) tool layer.  No
// dependency on Zod or THREE.

import type { StairData } from './store.js';

export interface StairValidation {
  readonly ok: boolean;
  readonly reason?: string;
}

export function isFiniteVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    Number.isFinite(r.x as number) &&
    Number.isFinite(r.y as number) &&
    Number.isFinite(r.z as number)
  );
}

/** Total stair height = numRisers × riserHeight. */
export function totalStairHeight(s: Pick<StairData, 'numRisers' | 'riserHeight'>): number {
  return s.numRisers * s.riserHeight;
}

/** Total stair run length = (numRisers − 1) × treadDepth (last riser
 *  has no tread — landing is on the upper level). */
export function totalStairRun(s: Pick<StairData, 'numRisers' | 'treadDepth'>): number {
  return Math.max(0, s.numRisers - 1) * s.treadDepth;
}

/** Validate the dimensional parameters are physically plausible. */
export function validateStairDims(
  dims: Partial<Pick<StairData, 'treadDepth' | 'riserHeight' | 'width' | 'numRisers'>>,
): StairValidation {
  if (dims.treadDepth !== undefined && (!Number.isFinite(dims.treadDepth) || dims.treadDepth <= 0)) {
    return { ok: false, reason: 'treadDepth must be > 0' };
  }
  if (dims.riserHeight !== undefined && (!Number.isFinite(dims.riserHeight) || dims.riserHeight <= 0)) {
    return { ok: false, reason: 'riserHeight must be > 0' };
  }
  if (dims.width !== undefined && (!Number.isFinite(dims.width) || dims.width <= 0)) {
    return { ok: false, reason: 'width must be > 0' };
  }
  if (dims.numRisers !== undefined) {
    if (!Number.isInteger(dims.numRisers)) return { ok: false, reason: 'numRisers must be an integer' };
    if (dims.numRisers < 2) return { ok: false, reason: 'numRisers must be ≥ 2' };
  }
  return { ok: true };
}
