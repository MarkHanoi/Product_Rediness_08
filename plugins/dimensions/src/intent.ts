// Dimension intent helpers (S29 / ADR-0028).

interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }

export function isFiniteVec3(p: Vec3Like | undefined | null): p is Vec3Like {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

export function isFiniteVec3Array(arr: readonly Vec3Like[] | undefined | null): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (const v of arr) if (!isFiniteVec3(v)) return false;
  return true;
}

export const DIMENSION_KINDS = [
  'linear', 'angular', 'radial', 'diameter', 'spot-elevation', 'slope',
] as const;
export type DimensionKindLiteral = (typeof DIMENSION_KINDS)[number];

export const DIMENSION_UNITS = ['mm', 'cm', 'm', 'in', 'ft'] as const;
export type DimensionUnitLiteral = (typeof DIMENSION_UNITS)[number];

export function isDimensionUnit(s: unknown): s is DimensionUnitLiteral {
  return typeof s === 'string' && (DIMENSION_UNITS as readonly string[]).includes(s);
}
