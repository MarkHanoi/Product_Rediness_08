// Furniture intent helpers — S27 / ADR-0027.

interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }

export function isFiniteVec3(p: Vec3Like | undefined | null): p is Vec3Like {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** ADR-0027 §1 — the five canonical LOD levels. */
export const FURNITURE_LODS = [0, 1, 2, 3, 4] as const;
export type FurnitureLodLiteral = (typeof FURNITURE_LODS)[number];

export function isValidLod(v: unknown): v is FurnitureLodLiteral {
  return typeof v === 'number' && (v === 0 || v === 1 || v === 2 || v === 3 || v === 4);
}

export function isValidScale(s: unknown): s is number {
  return typeof s === 'number' && Number.isFinite(s) && s > 0;
}
