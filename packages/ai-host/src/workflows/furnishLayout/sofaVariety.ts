// §67.3 (2026-06-11) — living-room L-SHAPE (corner) sofa selection.
//
// Founder ask: "consider an L-shape sofa". The geometry catalogue has a
// CornerSofaBuilder (routed by the `corner_sofa` FurnitureType). The living-room
// archetype normally places a straight `sofa`; when the room is large enough to
// seat an L in a corner (and the corner-sofa footprint will fit), we swap the
// straight sofa for the L-sofa. Anchored on the longest wall facing into the
// room: the main run lies along that wall and the side run extends into the room
// off the corner — the L opens toward the media wall / room. Below the threshold
// (or a tight room) we keep the straight sofa so small living rooms ship clean.
//
// Deterministic — gated purely on the room area + footprint geometry; no RNG.

import type { FurnitureArchetype, FurnitureItemSpec } from './types.js';
import { footprintOf } from './footprints.js';

/** Living area (m²) at/above which an L-shape sofa is preferred when it fits.
 *  An L-sofa wants a generous lounge: below ~16 m² a straight sofa reads better
 *  and leaves circulation. */
export const L_SOFA_MIN_AREA_M2 = 16;

/**
 * Decide whether a living room of `areaM2` with the given bounding extent
 * (`roomW` × `roomD`, metres) should use the L-shape corner sofa.
 *   • area ≥ L_SOFA_MIN_AREA_M2, AND
 *   • the corner-sofa footprint (main run × side depth) physically fits inside
 *     the room's shorter dimensions with circulation margin.
 * Deterministic.
 */
export function preferCornerSofa(areaM2: number, roomW: number, roomD: number): boolean {
    if (areaM2 < L_SOFA_MIN_AREA_M2) return false;
    const fp = footprintOf('corner_sofa');
    const shorter = Math.min(roomW, roomD);
    const longer = Math.max(roomW, roomD);
    // The main run (w) must fit along the longer side; the side run (l) into the
    // shorter side, each leaving ≥ 0.9 m circulation.
    return longer >= fp.w + 0.9 && shorter >= fp.l + 0.9;
}

/** Axis-aligned bounding extent of a polygon (metres). */
export function polygonExtent(polygon: ReadonlyArray<{ x: number; z: number }>): { w: number; d: number } {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of polygon) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { w: x1 - x0, d: z1 - z0 };
}

/**
 * Swap the living-room archetype's straight `sofa` item for a `corner_sofa` when
 * `preferCornerSofa` says so. The replacement keeps the same anchor/facing/group
 * so the coffee table + rug + media wall all still pair to the 'sofa' group.
 * Pure: returns a NEW items array; the shared archetype data is untouched.
 */
export function applyCornerSofa(archetype: FurnitureArchetype, useCorner: boolean): FurnitureArchetype {
    if (!useCorner) return archetype;
    const items: FurnitureItemSpec[] = archetype.items.map((it) =>
        it.kind === 'sofa' ? { ...it, kind: 'corner_sofa' } : it,
    );
    return { ...archetype, items };
}
