// §FIX-OFFICE-MISSING-PER-STOREY-SLABS (L-322) — a visible FLOOR PLATE on EVERY storey.
//
// ROOT (candidate B, confirmed): the office tower is NOT missing its structural slabs — the executor
// creates one `CreateSlabCommand` per storey inside the SAME batch loop that creates the perimeter
// walls (which render on all 23 storeys), and `AddLevelCommand` registers each level synchronously so
// no slab throws. The gap the founder sees ("no floor plates — you can see straight through it") is
// that a visible, FINISHED floor is laid on ONLY the first detailed level (`_nameAndFinishFloors`
// finishes `firstDetailed` — the `…laid N floor finish(es) on L0` log). Every OTHER storey has only
// the bare structural slab, which does not read as a floor through the glass curtain wall.
//
// FIX (mirror the residential building's per-LEVEL public-floor finish — `_finishPublicFloors`): lay a
// full-disc FLOOR PLATE on every storey that the detailed per-room finish pass does NOT cover, via the
// SAME `CreateFloorCommand` path (the proven floor builder that already renders the L0 finishes). Each
// plate is CUT over that storey's recorded stairwell voids so an open stair is never floored over.
//
// This module is PURE (DOM-free, no THREE, no store access) so it is unit-testable in plain Node: it
// turns the disc footprint + the minted levels + the already-finished (detailed) indices + a
// stair-void lookup into the per-storey floor-plate specs. The executor stamps ids and dispatches.

import { pointInPolygonXZ } from '@pryzm/geometry-kernel';

/** A 2-D plan point (metres, world XZ). */
export interface PlanPt { readonly x: number; readonly z: number }

/** One storey's full-disc floor plate: the outer ring + any stairwell-void holes (CW-wound). */
export interface StoreyFloorPlate {
    readonly levelId: string;
    /** The storey footprint (the office disc), CCW as authored. */
    readonly polygon: PlanPt[];
    /** Stairwell voids to cut (each already CW-wound for a hole contour). */
    readonly holes: PlanPt[][];
}

/** Shoelace signed area (CCW positive). */
function signedArea(poly: readonly PlanPt[]): number {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return s * 0.5;
}

function centroid(poly: readonly PlanPt[]): PlanPt {
    let sx = 0, sz = 0;
    for (const p of poly) { sx += p.x; sz += p.z; }
    const n = poly.length || 1;
    return { x: sx / n, z: sz / n };
}

/** Even-odd point-in-polygon.
 *  §C73-PIP-CANONICAL — delegates to THE kernel ray cast (geometry-kernel). */
function pointInPoly(pt: PlanPt, poly: readonly PlanPt[]): boolean {
    return pointInPolygonXZ(pt.x, pt.z, poly);
}

/**
 * Build the per-storey full-disc floor plates for every minted level EXCEPT the ones the detailed
 * per-room finish pass already covers (`detailedIndices`). A level with a degenerate disc (< 3 pts)
 * is skipped. Each plate carries the stairwell voids (recorded for that level) that fall inside the
 * disc, CW-wound so `CreateFloorCommand` cuts them as holes.
 *
 * PURE: `stairVoidsFor` is injected (the executor passes `getStairVoidsForLevel`) so the void lookup
 * is testable without the store.
 */
export function buildStoreyFloorPlates(args: {
    readonly disc: readonly PlanPt[];
    readonly levelIdByIndex: ReadonlyMap<number, string>;
    readonly detailedIndices: readonly number[];
    readonly stairVoidsFor: (levelId: string) => ReadonlyArray<{ readonly polygon: readonly PlanPt[] }>;
}): StoreyFloorPlate[] {
    const { disc, levelIdByIndex, detailedIndices, stairVoidsFor } = args;
    if (disc.length < 3) return [];
    const detailed = new Set(detailedIndices);
    const ring: PlanPt[] = disc.map((p) => ({ x: p.x, z: p.z }));

    const plates: StoreyFloorPlate[] = [];
    for (const [index, levelId] of levelIdByIndex) {
        // Detailed floors already receive per-room finishes — laying a full-disc plate on top would
        // z-fight with them, so only fill the storeys that have NO visible floor today.
        if (detailed.has(index)) continue;

        const holes: PlanPt[][] = [];
        for (const v of stairVoidsFor(levelId)) {
            if (!v.polygon || v.polygon.length < 3) continue;
            // Only cut a void that actually sits inside this storey's footprint.
            if (!pointInPoly(centroid(v.polygon), ring)) continue;
            // A hole contour must be wound OPPOSITE the outer ring. The disc is CCW (positive area),
            // so wind each void CW (negative area).
            const cw = signedArea(v.polygon) > 0 ? [...v.polygon].reverse() : [...v.polygon];
            holes.push(cw.map((p) => ({ x: p.x, z: p.z })));
        }
        plates.push({ levelId, polygon: ring.map((p) => ({ x: p.x, z: p.z })), holes });
    }
    return plates;
}
