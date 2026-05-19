// Column intent helpers — S12-T3.
//
// Columns are placed by a single insertion point + height; there is no
// host-resolution required (unlike doors which live on a wall).  This
// file currently exposes a single helper used by both the placement
// tool and the create handler.

interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }

/** Returns true when `p` is a finite Vec3. */
export function isFiniteVec3(p: Vec3Like | undefined | null): p is Vec3Like {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
