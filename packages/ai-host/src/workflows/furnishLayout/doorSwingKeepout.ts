// §DOOR-SWING-KEEPOUT (founder 2026-06-21, "doors clashing with furniture") — pure
// geometry to keep furniture out of a door's swing arc.
//
// The furnish engine places furniture against the room polygon but never subtracts
// the area a door leaf sweeps. This computes a door's swing sector and a conservative
// rect-vs-sector clash test so the placement pass can REJECT any furniture footprint
// that intrudes into a doorway. Conservative by design — for a keep-out it is safer to
// over-exclude (leave a doorway clear) than to admit a blocking piece.
//
// PURE L2: no DOM, no THREE, no I/O. Plain 2D maths (plan frame, metres) → unit-testable
// with no browser. Mirrors the §WALL-SETOUT split: pure core here, engine wiring follows.

export interface PtXZ {
    readonly x: number;
    readonly z: number;
}

/** A door's swing as a circular sector: hinge centre, leaf radius, and the angular
 *  sweep [startRad, startRad+sweepRad]. Angles are measured from +X, CCW, in radians. */
export interface SwingSector {
    readonly hinge: PtXZ;
    readonly radiusM: number;
    readonly startRad: number;
    /** Signed sweep (rad). +90° (π/2) for a standard door; sign sets swing direction. */
    readonly sweepRad: number;
}

/** An axis-aligned furniture footprint (plan metres). */
export interface RectXZ {
    readonly minX: number;
    readonly minZ: number;
    readonly maxX: number;
    readonly maxZ: number;
}

/**
 * Build a swing sector from a door's hinge, the direction toward its latch (closed
 * leaf), the leaf width (= radius), and the open direction (+1 = CCW, −1 = CW).
 * `hingeToLatch` need not be unit length; its angle is what matters.
 */
export function makeSwingSector(
    hinge: PtXZ,
    hingeToLatch: PtXZ,
    leafWidthM: number,
    openSign: 1 | -1 = 1,
): SwingSector {
    const startRad = Math.atan2(hingeToLatch.z, hingeToLatch.x);
    return { hinge, radiusM: Math.max(0, leafWidthM), startRad, sweepRad: openSign * (Math.PI / 2) };
}

const TWO_PI = Math.PI * 2;
/** Normalise an angle to [0, 2π). */
function norm(a: number): number {
    let r = a % TWO_PI;
    if (r < 0) r += TWO_PI;
    return r;
}

/** Is bearing `a` within the sector's angular sweep (inclusive, direction-aware)? */
function angleInSweep(a: number, startRad: number, sweepRad: number): boolean {
    const lo = sweepRad >= 0 ? startRad : startRad + sweepRad;
    const span = Math.abs(sweepRad);
    const delta = norm(a - lo);
    // tiny epsilon so the exact boundary bearings count as inside
    return delta <= span + 1e-9;
}

/** Is point `p` inside the swing sector (within radius AND within the sweep)? */
export function pointInSwing(p: PtXZ, s: SwingSector): boolean {
    const dx = p.x - s.hinge.x;
    const dz = p.z - s.hinge.z;
    const dist = Math.hypot(dx, dz);
    if (dist > s.radiusM + 1e-9) return false;
    if (dist <= 1e-9) return true;                 // the hinge itself
    return angleInSweep(Math.atan2(dz, dx), s.startRad, s.sweepRad);
}

function pointInRect(p: PtXZ, r: RectXZ): boolean {
    return p.x >= r.minX - 1e-9 && p.x <= r.maxX + 1e-9 && p.z >= r.minZ - 1e-9 && p.z <= r.maxZ + 1e-9;
}

/**
 * Conservative clash test: does the furniture rect intrude into the door swing?
 *
 * True when ANY of: a rect corner lies in the sector; the hinge lies in the rect; or a
 * sampled leaf-tip (closed / mid-open / fully-open, plus a few interior arc samples)
 * lies in the rect. Sampling the arc catches the common case where the rect sits in the
 * middle of the swing with no corner inside the sector. Conservative (samples, not exact
 * sector-polygon intersection) — acceptable + intended for a keep-out pre-filter.
 */
export function rectIntersectsSwing(r: RectXZ, s: SwingSector, arcSamples = 7): boolean {
    if (s.radiusM <= 1e-9) return false;
    // 1. any rect corner inside the sector
    const corners: PtXZ[] = [
        { x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ },
        { x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ },
    ];
    for (const c of corners) if (pointInSwing(c, s)) return true;
    // 2. hinge inside the rect
    if (pointInRect(s.hinge, r)) return true;
    // 3. sampled leaf tips along the arc inside the rect
    const n = Math.max(2, arcSamples);
    for (let i = 0; i < n; i++) {
        const a = s.startRad + s.sweepRad * (i / (n - 1));
        const tip = { x: s.hinge.x + s.radiusM * Math.cos(a), z: s.hinge.z + s.radiusM * Math.sin(a) };
        if (pointInRect(tip, r)) return true;
    }
    return false;
}

/** Filter furniture rects, dropping any that clash with ANY door swing. Returns the
 *  kept rects (the engine then places only these) — pure, order-preserving. */
export function rejectFurnitureClashingDoors<T extends RectXZ>(
    items: readonly T[],
    swings: readonly SwingSector[],
): T[] {
    if (swings.length === 0) return [...items];
    return items.filter((it) => !swings.some((s) => rectIntersectsSwing(it, s)));
}
