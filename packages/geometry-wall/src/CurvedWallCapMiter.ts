/**
 * CurvedWallCapMiter.ts
 *
 * CONTRACT §05-WALL-JOIN-RESOLUTION §6 + §02-WALL-GEOMETRY-ENGINE §4.3
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helper for applying miter-plane projections to curved wall end caps.
 *
 * BACKGROUND
 * When a curved wall meets another wall at its endpoint, WallJoinResolver
 * produces a miter-plane normal (MN) that defines the shared cut plane.
 * For straight walls, buildMiterPrism() projects all cap vertices onto this
 * plane along the wall direction.  For curved walls the same projection must
 * be applied to the start / end cap vertices, but along the arc's tangent
 * direction at that endpoint — not the chord direction.
 *
 * PROJECTION FORMULA (same as buildMiterPrism):
 *   t = MN · (miterOrigin − V) / (MN · tangentDir)
 *   V′ = V + t × tangentDir
 *
 * LAYER RULES
 *   - No store access.  No scene access.  Pure XZ computation.
 *   - Consumed only by WallFragmentBuilder and CurvedWallLayerBuilder.
 *   - No imports from WallTypes, WallStore, or any command/service.
 */

export interface CapMiterNormal { nx: number; nz: number; }

/**
 * Project a single XZ point onto a miter plane, moving it along the arc
 * tangent direction.
 *
 * All coordinates are in the wall group's LOCAL coordinate space
 * (wallGroup origin = baseLine[0]).
 *
 * @param vx            Vertex x before projection (local).
 * @param vz            Vertex z before projection (local).
 * @param originX       Miter plane anchor x — the (adjusted) wall endpoint (local).
 * @param originZ       Miter plane anchor z.
 * @param tanX          Unit arc-tangent x (forward along wall at this endpoint).
 * @param tanZ          Unit arc-tangent z.
 * @param mn            Miter plane normal from WallJoinResolver.
 * @returns             [projectedX, projectedZ] after miter projection.
 */
export function projectCapVertex(
    vx: number, vz: number,
    originX: number, originZ: number,
    tanX: number, tanZ: number,
    mn: CapMiterNormal,
): [number, number] {
    const mnDotTan = mn.nx * tanX + mn.nz * tanZ;
    if (Math.abs(mnDotTan) < 1e-9) return [vx, vz]; // tangent parallel to miter plane — no shift
    const t = (mn.nx * (originX - vx) + mn.nz * (originZ - vz)) / mnDotTan;
    return [vx + t * tanX, vz + t * tanZ];
}
