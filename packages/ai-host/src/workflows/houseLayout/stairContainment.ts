// Casa Unifamiliar — stair full-footprint CONTAINMENT (2026-06-09).
//
// THE DEFECT (founder-confirmed, systematic): on a strongly-rotated plate the generated
// house stair pokes OUT of the shell — §DIAG-STAIR logs `cornersInShell=1/4` every time.
// Root (see docs/04-reference/STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md §2): the stair
// body is ANCHORED at a start corner and GROWN in a fixed direction; only the anchor is
// positioned, the FULL footprint is never validated against the (rotated) shell. So the
// axis-aligned core rect, once rotated, swings its far corners outside the perimeter.
//
// THE CURE (doc §3 step 2): after the stair flights are built, validate the FULL world-frame
// footprint (all flights + landings, via computeStairFootprintRect) against the shell polygon
// and, if any corner is outside, NUDGE THE WHOLE BODY INWARD (along the interior direction)
// until every corner is contained. This PURE helper computes that inward translation; the
// editor's _createStair applies it to startPosition + every flight startOverride before
// dispatching CreateStairCommand.
//
// PURE + DETERMINISTIC L2 — no stores, no DOM, no THREE, no RNG. World-XZ metres.

export interface XZ2 { readonly x: number; readonly z: number }

/** Ray-cast point-in-polygon (world XZ). A point on/within `tol` of an edge counts as inside. */
function pointInPoly(p: XZ2, poly: readonly XZ2[], tol = 1e-6): boolean {
    const n = poly.length;
    if (n < 3) return false;
    // On-boundary (within tol) → inside (a footprint corner flush to the wall is fine).
    for (let i = 0; i < n; i++) {
        const a = poly[i]!, b = poly[(i + 1) % n]!;
        const ex = b.x - a.x, ez = b.z - a.z;
        const L2 = ex * ex + ez * ez;
        if (L2 < 1e-18) continue;
        let t = ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a.x + t * ex, qz = a.z + t * ez;
        if (Math.hypot(p.x - qx, p.z - qz) <= tol) return true;
    }
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const zi = poly[i]!.z, zj = poly[j]!.z, xi = poly[i]!.x, xj = poly[j]!.x;
        if (((zi > p.z) !== (zj > p.z)) && (p.x < (xj - xi) * (p.z - zi) / ((zj - zi) || 1e-30) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/** True when every corner of `corners` is inside (or on) `poly`. */
export function allCornersInside(corners: readonly XZ2[], poly: readonly XZ2[], tol = 1e-3): boolean {
    if (poly.length < 3 || corners.length === 0) return true;   // nothing to contain against
    return corners.every(c => pointInPoly(c, poly, tol));
}

/**
 * §STAIR-CONTAIN — the inward translation that brings ALL footprint corners inside the shell.
 *
 * Steps the footprint along `inwardDir` (a world-XZ direction toward the plate interior) in
 * `stepM` increments, up to `maxM`, and returns the FIRST offset at which every corner is
 * inside `shellPoly`. Returns {dx:0,dz:0} when the footprint is ALREADY contained (→ the
 * common axis-aligned case is a no-op: byte-identical) OR when no offset within `maxM`
 * contains it (best-effort; never throws — the editor logs and proceeds, no worse than today).
 *
 * `inwardDir` need not be unit length; it is normalised here. A zero/degenerate inwardDir or
 * a degenerate shell (< 3 pts) yields {0,0}.
 */
export function computeInwardContainmentOffset(
    footprintCornersWorld: readonly XZ2[],
    shellPolyWorld: readonly XZ2[],
    inwardDirWorld: XZ2,
    stepM = 0.1,
    maxM = 3.0,
): { dx: number; dz: number } {
    if (shellPolyWorld.length < 3 || footprintCornersWorld.length === 0) return { dx: 0, dz: 0 };
    if (allCornersInside(footprintCornersWorld, shellPolyWorld)) return { dx: 0, dz: 0 };

    const len = Math.hypot(inwardDirWorld.x, inwardDirWorld.z);
    if (len < 1e-9) return { dx: 0, dz: 0 };
    const ux = inwardDirWorld.x / len, uz = inwardDirWorld.z / len;
    const step = stepM > 1e-6 ? stepM : 0.1;

    for (let d = step; d <= maxM + 1e-9; d += step) {
        const dx = ux * d, dz = uz * d;
        const shifted = footprintCornersWorld.map(c => ({ x: c.x + dx, z: c.z + dz }));
        if (allCornersInside(shifted, shellPolyWorld)) return { dx, dz };
    }
    return { dx: 0, dz: 0 };   // couldn't contain within maxM — leave as-is (best-effort)
}
