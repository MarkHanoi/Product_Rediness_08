// A.21.D60 — relative right-angle (orthogonal-to-previous-edge) draw aid (PURE).
//
// WHAT THIS IS
// ------------
// The founder's spec: "when drawing perimeter walls on the 2D maps plan view, the
// FIRST line is an arbitrary site rotation (fine), but the SECOND+ lines are
// normally orthogonal to the FIRST." This is a RELATIVE right-angle lock: once the
// user has committed >=1 edge, the NEXT vertex direction is snapped to the nearest
// 90 degree step (0 / 90 / 180 / 270) RELATIVE to the PREVIOUS edge's direction —
// NOT true north — so the user draws a clean rectilinear plot at ANY base rotation.
//
// WHY SCREEN-PIXEL SPACE
// ----------------------
// The boundary-draw tool resolves its corner snap in SCREEN PIXELS (constant feel
// at any zoom). This helper mirrors that: it takes the last two committed vertices'
// projected screen points (the previous edge), plus the raw cursor screen point,
// and returns the cursor PROJECTED onto the nearest right-angle ray off the
// previous edge. The caller then `unproject`s the result back to lng/lat. Working
// in pixels keeps the math projection-independent and lets it compose 1:1 with the
// existing pixel-space corner snap (which always wins when it's in range).
//
// PURE + DETERMINISTIC + NEVER THROWS
// -----------------------------------
// No DOM / maplibre / THREE import. Pure 2D vector math on plain {x,y} points.
// Degenerate inputs (zero-length previous edge, zero-length cursor offset,
// non-finite coords) return null = "no ortho snap" so the caller falls back to the
// raw cursor. The tolerance is an ANGLE (degrees) off the nearest 90 degree step.

/** A 2D screen point in CSS pixels. */
export interface PixelPoint {
    readonly x: number;
    readonly y: number;
}

/** The resolved ortho snap: the cursor projected onto the right-angle ray. */
export interface OrthoSnapResult {
    /** Snapped screen point (the cursor projected onto the nearest 90 degree ray). */
    readonly x: number;
    readonly y: number;
    /** Which relative step was chosen (0/90/180/270), for logging/debug. */
    readonly stepDeg: 0 | 90 | 180 | 270;
}

/** Default angular tolerance (degrees) off the nearest 90 degree step to engage. */
export const ORTHO_SNAP_TOLERANCE_DEG = 8;

const RAD2DEG = 180 / Math.PI;

function isFinitePt(p: PixelPoint | undefined | null): p is PixelPoint {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** Smallest signed difference a-b folded into (-180, 180]. */
function angleDiffDeg(a: number, b: number): number {
    let d = (a - b) % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
}

/**
 * Resolve the relative right-angle snap for the NEXT vertex.
 *
 * @param prevStart  Screen point of the previous edge's START vertex (vertex n-2).
 * @param prevEnd    Screen point of the previous edge's END   vertex (vertex n-1) —
 *                   this is the anchor the new edge grows FROM.
 * @param cursor     Raw cursor screen point.
 * @param toleranceDeg  Max angle (deg) off the nearest 90 degree step to engage.
 *
 * @returns the cursor projected onto the nearest 0/90/180/270 ray off the previous
 *          edge direction (reach preserved = the cursor's projected reach along that
 *          ray), or `null` when no snap applies (out of tolerance, or degenerate
 *          input). NEVER throws.
 *
 * The FIRST edge is the caller's responsibility — call this only when >=1 edge is
 * already committed (i.e. `prevStart`/`prevEnd` are real placed vertices). The first
 * edge is therefore always free (the caller passes the raw cursor through).
 */
export function resolveOrthoSnap(
    prevStart: PixelPoint,
    prevEnd: PixelPoint,
    cursor: PixelPoint,
    toleranceDeg: number = ORTHO_SNAP_TOLERANCE_DEG,
): OrthoSnapResult | null {
    if (!isFinitePt(prevStart) || !isFinitePt(prevEnd) || !isFinitePt(cursor)) {
        return null;
    }

    // Previous edge direction (the reference axis).
    const pdx = prevEnd.x - prevStart.x;
    const pdy = prevEnd.y - prevStart.y;
    const prevLen = Math.hypot(pdx, pdy);
    if (prevLen < 1e-6) return null; // degenerate previous edge → no reference.

    // Cursor offset from the anchor (vertex n-1) — the new edge candidate.
    const cdx = cursor.x - prevEnd.x;
    const cdy = cursor.y - prevEnd.y;
    const curLen = Math.hypot(cdx, cdy);
    if (curLen < 1e-6) return null; // cursor on the anchor → nothing to project.

    // Angle of the previous edge and of the cursor offset (screen degrees).
    const prevAng = Math.atan2(pdy, pdx) * RAD2DEG;
    const curAng = Math.atan2(cdy, cdx) * RAD2DEG;

    // Cursor angle RELATIVE to the previous edge, folded into (-180,180].
    const rel = angleDiffDeg(curAng, prevAng);

    // Nearest 90 degree step of that relative angle.
    const stepIndex = Math.round(rel / 90); // … -2,-1,0,1,2 …
    const snappedRel = stepIndex * 90;
    const offBy = Math.abs(angleDiffDeg(rel, snappedRel));
    if (offBy > toleranceDeg) return null; // outside the lock band → free cursor.

    // Absolute target angle of the snapped ray (screen space).
    const targetAng = (prevAng + snappedRel) * (Math.PI / 180);
    const ux = Math.cos(targetAng);
    const uy = Math.sin(targetAng);

    // Project the cursor offset onto the ray; keep the projected REACH (not the raw
    // length) so the snapped point sits exactly under the cursor's perpendicular
    // foot — feels like sliding along the locked axis. Clamp to >=0 so the edge never
    // flips behind the anchor when the cursor is just past 90 degrees.
    const reach = Math.max(0, cdx * ux + cdy * uy);

    // Normalise the chosen step to 0/90/180/270 for the debug label.
    const norm = (((snappedRel % 360) + 360) % 360) as 0 | 90 | 180 | 270;

    return {
        x: prevEnd.x + ux * reach,
        y: prevEnd.y + uy * reach,
        stepDeg: norm,
    };
}
