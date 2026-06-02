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
// Reuses the F6 primitives (`rectsOverlap`, `pointInPolygon`,
// `footprintRect`); no new imports beyond sibling types.

import { rectsOverlap, pointInPolygon, footprintRect } from './collision.js';
import type { FurnishRoomInput, PlacedFurniture, Pt, Rect } from './types.js';
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

/** Rect for a placed item (same convention the solver uses). */
function rectFor(p: PlacedFurniture): Rect {
    return footprintRect(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);
}

/**
 * Liang–Barsky-style segment-vs-AABB intersection. Returns TRUE when the open
 * segment from `p1` to `p2` enters or crosses `rect`. Touching the edge does
 * NOT count (matches the strict `rectsOverlap` semantics — touching items in
 * a tight layout shouldn't be flagged as "blocking"). Pure, axis-aligned.
 */
function segIntersectsRect(p1: Pt, p2: Pt, rect: Rect): boolean {
    const dx = p2.x - p1.x, dz = p2.z - p1.z;
    let t0 = 0, t1 = 1;
    const clip = (p: number, q: number): boolean => {
        if (Math.abs(p) < EPS) return q >= 0;
        const r = q / p;
        if (p < 0) {
            if (r > t1) return false;
            if (r > t0) t0 = r;
        } else {
            if (r < t0) return false;
            if (r < t1) t1 = r;
        }
        return true;
    };
    return clip(-dx, p1.x - rect.x0) && clip(dx, rect.x1 - p1.x)
        && clip(-dz, p1.z - rect.z0) && clip(dz, rect.z1 - p1.z)
        && t1 - t0 > EPS;
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
    const rects: Rect[] = placed.map(rectFor);

    // 1. Every item inside the polygon (defensive — the solver enforces this,
    //    but a polygon shift between solve and render must not be silent).
    for (let i = 0; i < placed.length; i++) {
        const p = placed[i]!;
        if (!pointInPolygon({ x: p.position.x, z: p.position.z }, input.polygon)) {
            warnings.push(`${p.kind}[${i}] centre (${p.position.x.toFixed(2)}, ${p.position.z.toFixed(2)}) lies OUTSIDE the room polygon`);
        }
    }

    // 2. Pairwise non-overlap.
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            if (rectsOverlap(rects[i]!, rects[j]!)) {
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
        for (let ri = 0; ri < rects.length; ri++) {
            if (segIntersectsRect(entry, input.centroid, rects[ri]!)) {
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
