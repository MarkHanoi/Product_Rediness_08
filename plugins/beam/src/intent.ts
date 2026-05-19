// Beam intent helpers — S12-T3.

interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }

export function isFiniteVec3(p: Vec3Like | undefined | null): p is Vec3Like {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** Returns true when the two endpoints are not coincident. */
export function isNonZeroBaseLine(a: Vec3Like, b: Vec3Like): boolean {
  return a.x !== b.x || a.y !== b.y || a.z !== b.z;
}
