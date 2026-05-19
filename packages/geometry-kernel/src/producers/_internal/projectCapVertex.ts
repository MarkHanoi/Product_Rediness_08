// projectCapVertex — lifted verbatim from
// `src/elements/walls/CurvedWallCapMiter.ts` (54 LOC, already
// THREE-free).  Used by the curved-wall builder to project end-cap
// vertices onto a shared miter plane along the arc tangent.

export interface CapMiterNormal {
  readonly nx: number;
  readonly nz: number;
}

/**
 * Project a single XZ point onto a miter plane along the arc
 * tangent.  All coordinates are in the wall group's local space
 * (origin = baseLine[0]).
 *
 *   t = MN · (origin − V) / (MN · tangent)
 *   V′ = V + t × tangent
 */
export function projectCapVertex(
  vx: number, vz: number,
  originX: number, originZ: number,
  tanX: number, tanZ: number,
  mn: CapMiterNormal,
): [number, number] {
  const mnDotTan = mn.nx * tanX + mn.nz * tanZ;
  if (Math.abs(mnDotTan) < 1e-9) return [vx, vz];
  const t = (mn.nx * (originX - vx) + mn.nz * (originZ - vz)) / mnDotTan;
  return [vx + t * tanX, vz + t * tanZ];
}
