// A.21.D6 — climate-driven window orientation (pure scoring).
//
// The demo differentiator: windows should prefer the SUN-FACING (equator-facing)
// façade for daylight + passive solar gain, not just the longest wall. This is the
// first slice of the [APARTMENT-COGNITION-STACK] Environmental-Intelligence layer.
//
// Pure + deterministic — no I/O, no THREE, no DOM. Works entirely in the window
// emit frame: plan millimetres where x = world-East and y = world-z. Per the
// LTP-ENU convention (scene −z = North), +y in this frame is SOUTH. So a Northern-
// hemisphere building faces the sun (the equator) toward +y; a Southern one toward
// −y. The bias is applied as a multiplier on wall length, so a much longer
// wrong-facing wall can still win — orientation tunes, it doesn't override.

import type { Vec2mm } from '../types.js';

/** Per-room solar bias passed to the window placer. All vectors/points are in the
 *  SAME emit frame as the room's ExternalWallSegments (plan mm, x=East, y=South). */
export interface SolarBias {
    /** Unit direction the façade should preferentially FACE (the equator/sun side),
     *  already expressed in the emit frame. */
    readonly sunDir: { readonly x: number; readonly y: number };
    /** Room centroid (mm) — orients each wall's OUTWARD normal (away from centre). */
    readonly roomCentroidMm: Vec2mm;
    /** 0..1 strength of the orientation bias vs wall length. Default 0.6. */
    readonly weight?: number;
    /** A.21.D6.3 — site latitude (decimal degrees) for climate-driven window SIZING
     *  (passive solar). Absent → no size change. */
    readonly latDeg?: number;
}

/** Below this absolute latitude the sun crosses both north and south of zenith
 *  through the year, so there's no single equator-facing preference → no bias. */
const EQUATORIAL_BAND_DEG = 10;

/**
 * The equator-facing unit direction in the emit frame (x=East, y=South), or null
 * near the equator where there's no clear preference. Northern hemisphere → South
 * (+y); Southern → North (−y).
 */
export function equatorFacingDir(latDeg: number): { x: number; y: number } | null {
    if (!Number.isFinite(latDeg) || Math.abs(latDeg) < EQUATORIAL_BAND_DEG) return null;
    return latDeg >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

/**
 * Outward unit normal of the segment a→b, pointing AWAY from `ref` (the room
 * centroid). Returns {x:0,y:0} for a degenerate (zero-length) segment.
 */
export function outwardNormal(a: Vec2mm, b: Vec2mm, ref: Vec2mm): { x: number; y: number } {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return { x: 0, y: 0 };
    // Two unit normals to the segment.
    let nx = -dy / len, ny = dx / len;
    // Flip so it points away from the room centroid (from the segment midpoint).
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if ((mx - ref.x) * nx + (my - ref.y) * ny < 0) { nx = -nx; ny = -ny; }
    return { x: nx, y: ny };
}

/**
 * Orientation fit in [0,1]: how well a wall's outward normal aligns with the sun
 * direction. 1 = faces straight at the sun, 0 = faces side-on OR away. Walls that
 * face away from the sun get NO bonus (max(0, dot)) so they never beat a sun-facing
 * wall on orientation alone.
 */
export function orientationFit(
    outNormal: { x: number; y: number }, sunDir: { x: number; y: number },
): number {
    const dot = outNormal.x * sunDir.x + outNormal.y * sunDir.y;
    return dot > 0 ? Math.min(1, dot) : 0;
}

/**
 * The climate-bias multiplier for a candidate wall: `1 + weight·fit` ∈ [1, 1+weight].
 * Multiply the wall's length by this so the placer prefers the sun-facing façade
 * while still letting a substantially longer wall win. `solar == null` → 1 (no-op).
 */
export function solarLengthMultiplier(
    a: Vec2mm, b: Vec2mm, solar: SolarBias | null | undefined,
): number {
    if (!solar) return 1;
    const w = solar.weight ?? 0.6;
    const n = outwardNormal(a, b, solar.roomCentroidMm);
    return 1 + w * orientationFit(n, solar.sunDir);
}

/**
 * A.21.D6.3 — passive-solar GLAZING-SIZE factor for a window on a wall whose
 * sun-orientation is `fit` ∈ [0,1], at site latitude `latDeg`. Multiply the window's
 * width + height by this.
 *   • COLD climates (high |lat|): ENLARGE sun-facing glazing for winter solar gain
 *     (up to +25% at fit 1); non-sun windows stay ~neutral (kept for daylight).
 *   • HOT climates (low |lat|): SHRINK glazing to limit overheating (down to −15%,
 *     strongest on sun-facing walls).
 *   • Temperate pivot ≈ 37.5° (coldness 0). Clamped to [0.85, 1.25].
 * `latDeg` undefined → 1 (no change).
 */
export function climateGlazingFactor(latDeg: number | undefined, fit: number): number {
    if (latDeg === undefined || !Number.isFinite(latDeg)) return 1;
    const f = Math.max(0, Math.min(1, fit));
    // coldness ∈ [−1,+1]: +1 at |lat| 60°, 0 at 37.5°, −1 at 15°.
    const coldness = Math.max(-1, Math.min(1, (Math.abs(latDeg) - 37.5) / 22.5));
    const factor = coldness >= 0
        ? 1 + 0.25 * coldness * f                       // cold → bigger sun glazing
        : 1 + 0.15 * coldness * (0.4 + 0.6 * f);        // hot → smaller (more on sun side)
    return Math.max(0.85, Math.min(1.25, factor));
}
