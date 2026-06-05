// D-FLE F-Sprint-5 — post-furnish circulation gate (SPEC-FURNITURE-LAYOUT-ENGINE §5).
//
// Pure, deterministic validator: given a room input + the placed furniture,
// check that the layout still HONOURS circulation. Soft-fail: returns warnings
// rather than rejecting, so the editor can surface diagnostics without blocking
// the build. The editor (or a future ranked-arrangement quality pass) can then
// re-run the solver with a different archetype order if `ok === false`.
//
// Checks performed:
//   1. Every placed item's footprint rect lies inside the room polygon.
//   2. No two items' footprints overlap.
//   3. Every door has a clear STRAIGHT-LINE path from its inside-the-room
//      entry point to the room centroid (no furniture rect intersects the
//      segment). This catches the obvious "furniture dumped in the middle of
//      the room" case the original SPEC's `findAccessiblePath` gate targets.
//      It is conservative — a real person could navigate around furniture
//      where a straight line cannot — so a warning is a SOFT signal.
//
// Uses the §FURNISH-OBB ORIENTED primitives (`footprintCorners`, `quadsOverlap`,
// `pointInPolygon`) — the SAME ones the placement solver collision-tests with —
// so the diagnostics match the placement exactly. (The old version used the AABB
// `footprintRect`/`rectsOverlap`, which over-reported overlaps on rotated rooms.)

import { pointInPolygon, footprintCorners, quadsOverlap, type Quad } from './collision.js';
import type { FurnishRoomInput, PlacedFurniture, Pt } from './types.js';
import { validateKitchenFromFurniture } from '../apartmentLayout/dimensions/validateKitchenFromFurniture.js';

export interface FurnishValidation {
    /** The room these results are about. */
    readonly roomId: string;
    /** True when EVERY check passed (no warnings). */
    readonly ok: boolean;
    /** Soft warnings — each describes one violation; never empty when ok=false. */
    readonly warnings: readonly string[];
}

const EPS = 1e-6;

/** §FURNISH-OBB-VALIDATE (2026-06-05) — the TRUE oriented footprint of a placed
 *  item, IDENTICAL to what the placement solver collision-tests. The old
 *  validator used `footprintRect` (AABB, yaw snapped to 0/90/180/270), so on a
 *  ROTATED room a bed's bounding box was much larger than its real footprint and
 *  the validator reported phantom "OVERLAPS" / "path BLOCKED" against a bedside
 *  the solver had legally placed beside it. Oriented quads make the diagnostics
 *  match the placement (exact at the four cardinal yaws → orthogonal rooms
 *  unchanged). */
function quadFor(p: PlacedFurniture): Quad {
    return footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);
}

/** CCW sign of the triangle (a,b,c). */
function ccw(a: Pt, b: Pt, c: Pt): number {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

/** Proper (non-collinear) segment–segment intersection, strict. */
function segSeg(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
    const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2);
    const d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4);
    return (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
            ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS)));
}

/**
 * TRUE when the open segment p1→p2 enters or crosses the convex `quad`. An
 * endpoint strictly inside the quad counts; merely grazing an edge does not.
 * Oriented-aware replacement for the old `segIntersectsRect` (AABB).
 */
function segCrossesQuad(p1: Pt, p2: Pt, quad: Quad): boolean {
    if (pointInPolygon(p1, quad) || pointInPolygon(p2, quad)) return true;
    for (let i = 0; i < 4; i++) {
        if (segSeg(p1, p2, quad[i]!, quad[(i + 1) & 3]!)) return true;
    }
    return false;
}

/**
 * Soft-fail validator. NO side effects; never throws. Use as a gate AFTER
 * `furnishRoom` / `furnishRoomCompound` — the editor surfaces warnings; the
 * pure orchestrator can prefer warnings-free arrangements when a ranked
 * quality pass is added later.
 */
export function validateFurnishedRoom(
    input: FurnishRoomInput, placed: readonly PlacedFurniture[],
): FurnishValidation {
    const warnings: string[] = [];
    const quads: Quad[] = placed.map(quadFor);

    // 1. Every item inside the polygon (defensive — the solver enforces this,
    //    but a polygon shift between solve and render must not be silent).
    for (let i = 0; i < placed.length; i++) {
        const p = placed[i]!;
        if (!pointInPolygon({ x: p.position.x, z: p.position.z }, input.polygon)) {
            warnings.push(`${p.kind}[${i}] centre (${p.position.x.toFixed(2)}, ${p.position.z.toFixed(2)}) lies OUTSIDE the room polygon`);
        }
    }

    // 2. Pairwise non-overlap (oriented — matches the solver's collision test).
    for (let i = 0; i < quads.length; i++) {
        for (let j = i + 1; j < quads.length; j++) {
            if (quadsOverlap(quads[i]!, quads[j]!)) {
                warnings.push(`${placed[i]!.kind}[${i}] OVERLAPS ${placed[j]!.kind}[${j}]`);
            }
        }
    }

    // 3. Every door has a clear straight line from its entry point (0.5 m into
    //    the room from the door centre, along the inward normal) to the room
    //    centroid. A blocked line warns; a real-world person could navigate
    //    around it but a straight line catches "furniture in the middle".
    for (let di = 0; di < input.doors.length; di++) {
        const d = input.doors[di]!;
        const entry: Pt = {
            x: d.center.x + d.normal.x * 0.5,
            z: d.center.z + d.normal.z * 0.5,
        };
        // Skip when the entry point lies outside the polygon (door normal
        // wrong way round). The solver doesn't care about door orientation
        // for placement; this check is opt-in.
        if (!pointInPolygon(entry, input.polygon)) continue;
        for (let ri = 0; ri < quads.length; ri++) {
            if (segCrossesQuad(entry, input.centroid, quads[ri]!)) {
                warnings.push(`door[${di}] → centroid path BLOCKED by ${placed[ri]!.kind}[${ri}]`);
                break;     // one warning per door is enough
            }
        }
    }

    // 4. §D2.3 (2026-05-30) — G10 NKBA kitchen work-triangle.
    //    For kitchen rooms with placed kitchen_straight runs (and optional
    //    island), run validateKitchenFromFurniture and surface any
    //    triangle violations as warnings. The validator distinguishes:
    //      • HARD failures (legMin / legMax / sumMin / sumMax) → warnings
    //        flagged "kitchen-triangle (HARD)"
    //      • SOFT failures (legTight / legLoose / sumLoose) → warnings
    //        flagged "kitchen-triangle"
    //    Soft-fail rather than hard-reject — the editor surfaces these as
    //    diagnostics; future ranked-arrangement quality pass can prefer
    //    triangle-clean layouts. Kitchens without enough runs (heuristic
    //    can't form a triangle) silently skip.
    if (input.occupancy === 'kitchen') {
        const tri = validateKitchenFromFurniture(input.roomId, placed);
        if (tri !== null) {
            for (const f of tri.hardFindings) {
                warnings.push(`kitchen-triangle (HARD): ${f.reason}`);
            }
            for (const f of tri.softFindings) {
                warnings.push(`kitchen-triangle: ${f.reason}`);
            }
        }
    }

    return { roomId: input.roomId, ok: warnings.length === 0, warnings };
}
