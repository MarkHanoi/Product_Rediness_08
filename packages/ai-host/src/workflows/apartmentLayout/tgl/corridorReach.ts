// §CORRIDOR-REACH P1 (founder "the corridor is the SPINE — it connects the stair + every room",
// 2026-06-22) — POLYGON-ROUTE corridor-reach. On a SHEARED plate enumerate takes the polygon route
// (subdividePolygon re-tiles every room into polygon cells), so the rect-frame stair-bridge
// (§STAIR-SPINE-TOUCH / §STAIR-ROOM-GROW-TO-CORRIDOR in enumerate) is computed against the corridor
// RECT and then DISCARDED — the emitted corridor is the polygon cell, which the rect-grow never
// touched, so the stair ships SEALED. This module grows each stair's enclosing rect cell through
// EMPTY space until it abuts the corridor POLYGON cell by a door width — realising the founder's
// model "the stair stays located, its enclosing space grows until it touches the corridor". Pure +
// deterministic; the caller gates it (default OFF) so walls are browser-validated before default-on.

import type { Pt, Rect } from './rectDecomposition.js';
import { polygonBBox } from './rectDecomposition.js';
import { polyRectSharedWallM, rectPolygon } from './subdivide.js';
import { subtractRectFromCell } from './polySubdivide.js';

const EPS = 1e-6;
const DEFAULT_DOOR_W = 0.9;

/** Absolute polygon area (shoelace). Pure. */
function polygonAreaAbs(poly: readonly Pt[]): number {
    if (poly.length < 3) return 0;
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return Math.abs(s) / 2;
}

/** Overlap area (m²) between an axis-aligned rect and a simple polygon = area(poly) − area(poly ∖ rect). */
export function rectPolyOverlapArea(rect: Rect, poly: readonly Pt[]): number {
    if (poly.length < 3) return 0;
    const before = polygonAreaAbs(poly);
    const after = subtractRectFromCell(poly, rect);
    return Math.max(0, before - polygonAreaAbs(after));
}

export interface StairReachInput {
    /** The corridor's emitted cell (polygon ring; pass `rectPolygon(corridorRect)` on the rect path). */
    readonly corridorCell: readonly Pt[];
    /** Stair id → its current rect cell (the enclosing landing the stair core sits in). */
    readonly stairRects: ReadonlyMap<string, Rect>;
    /** Every OTHER room's emitted cell polygon (NOT the corridor, NOT any stair) — the grow may
     *  only cross EMPTY space, never clip a habitable room. */
    readonly obstacleCells: readonly (readonly Pt[])[];
    /** The buildable bbox — a grown cell may not leave it. */
    readonly shellBBox: Rect;
    /** Door-width threshold for "abuts" (m). Default 0.9. */
    readonly doorWidthM?: number;
    /** Max overlap (m²) tolerated against an obstacle before a candidate is rejected. Default 1e-3. */
    readonly overlapEpsM2?: number;
    /** §STAIR-ROOM-FILL-POCKET (founder "green arrow", 2026-06-23) — when true, AFTER the corridor
     *  grow each stair cell is GREEDILY expanded in all four directions to absorb the adjacent EMPTY
     *  (untracked) space — the white pocket around the stair — so the stair room borders its neighbours
     *  cleanly instead of leaving a sliver. The expansion never overlaps an obstacle cell (a habitable
     *  room) and never leaves the shell bbox, so it only ever claims genuinely-empty space. Default
     *  OFF ⇒ byte-identical to the corridor-grow-only behaviour (the existing reach tests). */
    readonly fillPocket?: boolean;
}

/**
 * Grow each stair cell toward the corridor cell through empty space until it shares a door-width
 * wall with the corridor. Returns a NEW map id→rect (the grown rect, or the original where the
 * stair already abuts the corridor / no empty path reaches it). Never overlaps an obstacle cell,
 * never leaves the shell bbox. Pure + deterministic (the 4 grow directions are tried in a fixed
 * order: +x, −x, +z, −z).
 */
export function growStairCellsToCorridor(input: StairReachInput): Map<string, Rect> {
    const doorW = input.doorWidthM ?? DEFAULT_DOOR_W;
    const overlapEps = input.overlapEpsM2 ?? 1e-3;
    const out = new Map<string, Rect>();
    if (input.corridorCell.length < 3) {
        for (const [id, rect] of input.stairRects) out.set(id, rect);
        return out;
    }
    const corrBB = polygonBBox(input.corridorCell);
    const sb = input.shellBBox;
    const inShell = (r: Rect): boolean =>
        r.x0 >= sb.x0 - EPS && r.z0 >= sb.z0 - EPS && r.x1 <= sb.x1 + EPS && r.z1 <= sb.z1 + EPS;

    // Other stair cells are obstacles for the corridor-grow too: a stair must never grow ACROSS
    // another stair (a multi-stair plate). Single-stair plates have none ⇒ byte-identical.
    const otherStairPolys = (selfId: string): readonly (readonly Pt[])[] =>
        [...input.stairRects].filter(([sid]) => sid !== selfId).map(([, r]) => rectPolygon(r));
    for (const [id, rect] of input.stairRects) {
        if (polyRectSharedWallM(input.corridorCell, rect) >= doorW - EPS) { out.set(id, rect); continue; }
        // Extend ONE side of the stair rect to the corridor's near bbox edge (the clearance sliver
        // between them is empty space). Fixed direction order ⇒ deterministic.
        const candidates: Rect[] = [
            { ...rect, x1: Math.max(rect.x1, corrBB.x0) },   // grow +x toward a corridor on the right
            { ...rect, x0: Math.min(rect.x0, corrBB.x1) },   // grow −x toward a corridor on the left
            { ...rect, z1: Math.max(rect.z1, corrBB.z0) },   // grow +z toward a corridor above
            { ...rect, z0: Math.min(rect.z0, corrBB.z1) },   // grow −z toward a corridor below
        ];
        const others = otherStairPolys(id);
        let grown: Rect | null = null;
        for (const cand of candidates) {
            if (cand.x1 - cand.x0 < EPS || cand.z1 - cand.z0 < EPS) continue;
            if (!inShell(cand)) continue;
            if (input.obstacleCells.some(cell => rectPolyOverlapArea(cand, cell) > overlapEps)) continue;
            if (others.some(cell => rectPolyOverlapArea(cand, cell) > overlapEps)) continue;
            if (polyRectSharedWallM(input.corridorCell, cand) < doorW - EPS) continue;
            grown = cand;
            break;
        }
        out.set(id, grown ?? rect);
    }

    // §STAIR-ROOM-FILL-POCKET (founder "green arrow", 2026-06-23) — absorb the empty pocket around
    // each (already corridor-reached) stair cell so the stair room borders its neighbours cleanly.
    if (input.fillPocket) {
        // The pocket-fill must not eat the corridor or another stair cell, so treat them as obstacles
        // alongside the habitable room cells.
        const otherStairCells = (selfId: string): readonly Pt[][] =>
            [...out.entries()].filter(([sid]) => sid !== selfId).map(([, r]) => rectPolygon(r));
        const blockers = (selfId: string): readonly (readonly Pt[])[] =>
            [input.corridorCell, ...input.obstacleCells, ...otherStairCells(selfId)];
        // A tight geometric eps (not the door-grow's 1e-3 area tolerance) so the absorbed pocket abuts
        // each blocker face cleanly without a measurable overlap sliver.
        for (const [id, rect] of [...out.entries()]) {
            out.set(id, fillPocketAround(rect, blockers(id), sb, 1e-6));
        }
    }
    return out;
}

/**
 * §STAIR-ROOM-FILL-POCKET — greedily expand `rect` outward on each of its four edges (fixed order:
 * +x, −x, +z, −z ⇒ deterministic) as far as the shell bbox allows WITHOUT overlapping any blocker
 * cell, claiming the empty space around it. Each edge is pushed to the shell limit, then pulled back
 * just enough to clear every blocker it would have hit. Pure + deterministic. Re-runs the four-edge
 * sweep to a fixed point (bounded: a later edge can free a neighbour, but only a handful of passes).
 */
function fillPocketAround(
    rect: Rect,
    blockers: readonly (readonly Pt[])[],
    sb: Rect,
    overlapEps: number,
): Rect {
    let cur = { ...rect };
    const clearsAll = (cand: Rect): boolean =>
        blockers.every(cell => rectPolyOverlapArea(cand, cell) <= overlapEps);
    // Expand one edge to the shell limit, then binary-narrow back until it clears all blockers. Because
    // a blocker is axis-aligned, the largest non-overlapping extent equals the nearest blocker face;
    // a coarse-to-fine pull-back (halving) converges deterministically without floating-point search.
    const growEdge = (edge: 'x1' | 'x0' | 'z1' | 'z0'): void => {
        const limit = edge === 'x1' ? sb.x1 : edge === 'x0' ? sb.x0 : edge === 'z1' ? sb.z1 : sb.z0;
        const orig = cur[edge];
        if (Math.abs(limit - orig) < EPS) return;
        const full: Rect = { ...cur, [edge]: limit };
        if (clearsAll(full)) { cur = full; return; }
        // Pull back from the shell limit toward the original edge until the candidate clears blockers.
        let lo = orig, hi = limit;                       // [lo (safe at orig), hi (unsafe at limit)]
        for (let iter = 0; iter < 40; iter++) {
            const mid = (lo + hi) / 2;
            const cand: Rect = { ...cur, [edge]: mid };
            if (clearsAll(cand)) lo = mid; else hi = mid;
        }
        if (Math.abs(lo - orig) > EPS) cur = { ...cur, [edge]: lo };
    };
    // A couple of full sweeps so each edge benefits from the others' expansion (fixed point).
    for (let pass = 0; pass < 2; pass++) {
        growEdge('x1'); growEdge('x0'); growEdge('z1'); growEdge('z0');
    }
    return cur;
}
