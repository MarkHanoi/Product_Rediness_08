/**
 * singleVolumeWallProducer — #96 (WALL-SINGLE-VOLUME-CSG) phase 3 injection.
 *
 * The kernel-backed CSG producer that `WallFragmentBuilder` calls (via its
 * `setSingleVolumeProducer` DI seam) when `window.__wallSingleVolume` is on. It
 * assembles the wall solid + per-opening cutter boxes in the wall's LOCAL frame
 * and runs the boolean (`produceWallWithVoids`), returning one manifold
 * descriptor with clean voids instead of abutting box segments.
 *
 * Lives in apps/editor (the composition layer) so geometry-wall stays THREE-only:
 * apps/editor owns the `@pryzm/geometry-kernel` dependency and injects this
 * function at boot (initTools). Default-off — only invoked behind the flag.
 *
 * Local frame (matches WallFragmentBuilder's segment convention, verified):
 *   x ∈ [0, length] along the wall, y ∈ [baseOffset, baseOffset+height],
 *   z ∈ [−thickness/2, +thickness/2]. The builder places the resulting mesh with
 *   rotation.y = −angle so local-x maps to the wall direction.
 *
 * SPEC §4: opening cutters are INSET past the wall faces (never coplanar) for a
 * clean manifold cut.
 */

import {
    produceExtrude,
    produceWallWithVoids,
    asMaterialKey,
    type ProfilePoint,
} from '@pryzm/geometry-kernel';
import type {
    SingleVolumeWallParams,
    SingleVolumeWallDescriptor,
} from '@pryzm/geometry-wall';

/** Inset (m) so opening cutters poke past the wall faces — avoids coplanar CSG. */
const INSET = 0.01;

function rect(x0: number, x1: number, z0: number, z1: number): ProfilePoint[] {
    // Same winding as the kernel's proven box test fixture.
    return [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
    ];
}

export async function singleVolumeWallProducer(
    p: SingleVolumeWallParams,
): Promise<SingleVolumeWallDescriptor | null> {
    if (!p.openings || p.openings.length === 0) return null;
    if (p.length <= 0 || p.thickness <= 0 || p.height <= 0) return null;

    const hz = p.thickness / 2;

    // Wall solid — full extruded box in the wall-local frame.
    const wallSolid = produceExtrude(
        rect(0, p.length, -hz, hz),
        p.height,
        { worldY: p.baseOffset, material: asMaterialKey('wall|csg-body') },
    );

    // One inset cutter box per opening (past both faces; sill inset below).
    const cutters = p.openings
        .filter((o) => o.width > 0 && o.height > 0)
        .map((o) =>
            produceExtrude(
                rect(o.offset - o.width / 2, o.offset + o.width / 2, -hz - INSET, hz + INSET),
                o.height + 2 * INSET,
                { worldY: o.sillHeight - INSET, material: asMaterialKey('wall|csg-void') },
            ),
        );

    if (cutters.length === 0) return null;

    const result = await produceWallWithVoids(wallSolid, cutters);
    if (!result || result.index.length === 0) return null;
    return result;
}
