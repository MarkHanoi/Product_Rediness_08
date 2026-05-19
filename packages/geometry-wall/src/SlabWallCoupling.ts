// ─── MODIFICATION DECLARATION ───────────────────────────────────────────────
// §SLAB-BASE — Slab-aware wall base elevation (Priority 3 / PascalWins.md §Area4)
//
// Layer:          Element Builder support utility (pure read-only side function)
// Phase:          Phase I — Semantic Model & Core Engine
// Files:          src/elements/walls/SlabWallCoupling.ts  (new)
// Classification: C — Behavioural enhancement; no schema changes; fully backward
//                 compatible (returns 0 when no slab covers the wall).
// Impact:         Walls sitting on slabs automatically derive their base elevation
//                 from the slab top-face offset above the level datum, instead of
//                 always starting at level.elevation + wall.baseOffset.
//                 When no slab is present the return value is 0, so the call site
//                 formula  worldY = level.elevation + slabOff + wall.baseOffset
//                 reduces to the existing formula with zero delta.
// Risk:           LOW.  Pure query — no store mutations, no schema changes, no
//                 effect on join resolution.  3-probe strategy (midpoint + start
//                 + end) covers edge cases where a wall straddles a slab polygon
//                 boundary.
// Rationale:      Pascal Pattern Area 4 (PascalWins.md §Area 4).  In a real
//                 building workflow walls grow from the finished floor surface,
//                 not the abstract level datum.  Pascal uses
//                 SpatialGridManager.getSlabElevationForWall() for this coupling;
//                 PRYZM adopts the pattern as a pure utility function to respect
//                 existing layer rules (BimManager must not import SlabStore).
// ─────────────────────────────────────────────────────────────────────────────

import { WallData } from './WallTypes';
import { SlabStore } from '@pryzm/geometry-slab';

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test for a 2-D polygon in the XZ plane.
 *
 * @param px   World X of the probe point
 * @param pz   World Z of the probe point
 * @param poly World-space polygon vertices — each entry is { x: worldX, y: worldZ }
 *             (the `y` field carries the Z coordinate to match SlabData.polygon
 *             conventions, where `y` encodes the Z axis).
 */
function _pointInPolygon(
    px:   number,
    pz:   number,
    poly: { x: number; y: number }[],
): boolean {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if (((yi > pz) !== (yj > pz)) &&
            (px < (xj - xi) * (pz - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves the slab baseOffset that governs the vertical base position of `wall`.
 *
 * The returned value is the offset (in metres) of the slab TOP face above the
 * level elevation datum.  Callers use it as:
 *
 *   worldY = level.elevation + slabBaseOffset + (wall.baseOffset ?? 0)
 *
 * When `wall.baseOffset` is set by the user it acts as an additive correction
 * on top of the slab surface (e.g. a plinth raise or a deliberate gap).
 *
 * Algorithm
 * ---------
 * 1. Collect all slabs on the same level as `wall` that carry a polygon.
 * 2. Convert each polygon from slab-local XZ → world XZ by adding the slab's
 *    own `position.x / position.z` offsets (matching SlabFragmentBuilder and
 *    SlabTool conventions — see SlabTool.ts line 1012).
 * 3. Test three probe points in order: wall midpoint, then wall start, then
 *    wall end.  The first probe that falls inside a slab polygon wins.
 * 4. Return the winning slab's `baseOffset ?? 0`.
 * 5. Return 0 if no slab covers the wall (backward-compatible).
 *
 * Contract rules
 * --------------
 * - PURE READ: reads `slabStore.getAll()` and `wall.baseLine` only.
 *   No store mutations; no side effects.
 * - Called exclusively by EngineBootstrap._flushWallRebuild() BEFORE the
 *   builder call so the builder remains a pure projection function (§02-§10).
 * - Builders must NOT call this function — that would violate the No-Store-Read
 *   invariant (§02-§10 "No Store Reads").
 * - BimManager does NOT import SlabStore — this utility owns that coupling
 *   so the core kernel stays free of element-type dependencies (§06-§3.4).
 *
 * @param wall      Frozen WallData from WallStore.
 * @param slabStore The singleton SlabStore instance (injected by EngineBootstrap).
 * @returns         Metres above level datum of the slab top face under the wall,
 *                  or 0 if no slab polygon covers the wall baseline.
 */
export function resolveSlabBaseOffsetForWall(
    wall:      WallData,
    slabStore: SlabStore,
): number {
    const candidates = slabStore.getAll().filter(
        (s) => s.levelId === wall.levelId && s.polygon && s.polygon.length >= 3,
    );
    if (candidates.length === 0) return 0;

    const bl  = wall.baseLine;
    const probes: { x: number; z: number }[] = [
        // Midpoint first — covers the vast majority of cases.
        { x: (bl[0].x + bl[1].x) * 0.5, z: (bl[0].z + bl[1].z) * 0.5 },
        // Start/end as fallback for walls that straddle a slab boundary.
        { x: bl[0].x, z: bl[0].z },
        { x: bl[1].x, z: bl[1].z },
    ];

    for (const slab of candidates) {
        // Convert slab polygon from local XZ → world XZ.
        // slab.polygon[i].y encodes the Z axis (SlabData convention — XZ plane).
        const worldPoly = slab.polygon!.map((p) => ({
            x: p.x + slab.position.x,
            y: p.y + slab.position.z,
        }));

        for (const probe of probes) {
            if (_pointInPolygon(probe.x, probe.z, worldPoly)) {
                return slab.baseOffset ?? 0;
            }
        }
    }

    return 0;
}
