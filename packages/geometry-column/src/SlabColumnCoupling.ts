// ─── MODIFICATION DECLARATION ───────────────────────────────────────────────
// §SLAB-BASE — Slab-aware column base elevation (Contract 02 §2.5 / §41 / §16)
//
// Layer:          Element Builder support utility (pure read-only side function)
// Phase:          Phase I — Semantic Model & Core Engine
// Files:          src/elements/columns/SlabColumnCoupling.ts  (new)
// Classification: C — Behavioural enhancement; no schema changes; fully backward
//                 compatible (returns 0 when no slab covers the column).
// Impact:         Columns sitting on slabs automatically derive their base
//                 elevation from the slab top-face offset above the level datum,
//                 instead of always starting at level.elevation. Mirrors
//                 SlabWallCoupling.ts so Wall + Column behaviour stay symmetric.
// Risk:           LOW. Pure query — no store mutations, no schema changes.
// Rationale:      Without this coupling, a column placed on a level that has a
//                 slab renders with its base at the level datum (i.e. UNDER the
//                 slab top), so the visible portion of a Steel UC/UB looks like
//                 it dropped to the floor below. Walls already solve this via
//                 SlabWallCoupling; columns must do the same to keep §02 spatial
//                 projection consistent across element families.
// ─────────────────────────────────────────────────────────────────────────────

import { ColumnData } from './ColumnTypes';
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
 * Resolves the slab baseOffset that governs the vertical base position of a
 * column at world (x, z) on the given level.
 *
 * Returned value is the offset (in metres) of the slab TOP face above the
 * level datum. Callers use it as:
 *
 *   worldY = level.elevation + slabBaseOffset + (column.baseOffset ?? 0)
 *
 * Returns 0 when no slab polygon covers the column footprint.
 */
export function resolveSlabBaseOffsetForPoint(
    levelId:   string,
    x:         number,
    z:         number,
    slabStore: SlabStore,
): number {
    const candidates = slabStore.getAll().filter(
        (s) => s.levelId === levelId && s.polygon && s.polygon.length >= 3,
    );
    if (candidates.length === 0) return 0;

    for (const slab of candidates) {
        // Convert slab polygon from local XZ → world XZ.
        // slab.polygon[i].y encodes the Z axis (SlabData convention — XZ plane).
        const worldPoly = slab.polygon!.map((p) => ({
            x: p.x + slab.position.x,
            y: p.y + slab.position.z,
        }));

        if (_pointInPolygon(x, z, worldPoly)) {
            return slab.baseOffset ?? 0;
        }
    }

    return 0;
}

/**
 * Convenience wrapper that resolves the slab base offset for a fully-formed
 * ColumnData. Useful at render time for any slab-aware re-resolution path.
 */
export function resolveSlabBaseOffsetForColumn(
    column:    ColumnData,
    slabStore: SlabStore,
): number {
    return resolveSlabBaseOffsetForPoint(
        column.levelId,
        column.position.x,
        column.position.z,
        slabStore,
    );
}
