// §RESI-OPENING-IN-WALL (founder 2026-06-26: "1 element failed — Opening [15.827, 16.727] >
// 16.665") — a window opening punched on a generated residential-building wall ran ~62 mm PAST
// the host wall end, so the opening was REJECTED by the wall occupancy validator (offset+width >
// wall length) and the element failed to build.
//
// ROOT CAUSE (emit-side, not the placement engine): the residential executor computes window
// offsets/widths against the GENERATION-time edge length, then punches them VERBATIM once the
// wall has landed in the store. But the committed wall is MITRED at its corners by the
// WallJoinResolver (the §RESI-EXTERIOR-WALL-MITER-FIX pass), which TRIMS the baseline endpoints
// — so the stored wall is a few centimetres SHORTER than the generation-time length. A window
// computed at `len − margin − width` then overruns the now-shorter stored wall. The DOOR path
// already re-reads the stored wall length and re-centres (`§RESI-DOOR-CENTRE-ALL`); the WINDOW
// path did not — this pure helper is the matching emit-stage clamp for windows (and any opening).
//
// Given the STORED host-wall length, it returns the offset/width clamped so the opening span
// [offset, offset+width] lies entirely within [0, storedLen] (shrinking an over-wide width to
// fit, then pulling the offset into [0, storedLen−width]), or `null` when even a minimal opening
// can't fit (so the caller DROPS it rather than emitting it out of bounds). An opening already
// in-bounds is returned byte-identical. Pure + deterministic (no THREE / DOM / store / RNG).

/** Below this an opening isn't a usable window/door (mirrors the engine's MIN_WINDOW_MM = 0.4 m). */
const MIN_OPENING_M = 0.4;
/** Float tolerance (m) for "already in-bounds" + degenerate-length checks. */
const EPS_M = 1e-4;

export interface ClampedOpening {
    /** Along-wall offset (m) of the opening's leading edge, ⊆ [0, storedLen − width]. */
    readonly offset: number;
    /** Opening width (m), ⊆ [MIN_OPENING_M, storedLen]. */
    readonly width: number;
    /** True when the input span overran the wall and was corrected (offset and/or width changed). */
    readonly clamped: boolean;
}

/**
 * Clamp an opening span to its STORED host-wall length so it never exceeds the wall end.
 *
 * @param offset   the requested along-wall offset (m, leading edge).
 * @param width    the requested opening width (m).
 * @param storedLen the host wall's ACTUAL committed length (m) — read from the store at punch time.
 * @returns the clamped {offset,width,clamped}, or `null` when the wall is too short to host even a
 *          minimal opening (caller drops it). An already in-bounds opening returns `clamped:false`
 *          with the inputs unchanged.
 */
export function clampOpeningToWall(
    offset: number,
    width: number,
    storedLen: number,
): ClampedOpening | null {
    if (!Number.isFinite(storedLen) || storedLen <= EPS_M) return null;
    if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0) return null;
    // A wall too short for even a minimal opening can't host one → drop.
    if (storedLen < MIN_OPENING_M - EPS_M) return null;
    // Shrink an over-wide span to fit the wall (never below a minimal opening — gated above).
    const w = Math.max(MIN_OPENING_M, Math.min(width, storedLen));
    // Pull the offset into the hard in-bounds range [0, storedLen − w].
    const off = Math.min(Math.max(offset, 0), storedLen - w);
    const clamped = Math.abs(off - offset) > EPS_M || Math.abs(w - width) > EPS_M;
    return { offset: off, width: w, clamped };
}
