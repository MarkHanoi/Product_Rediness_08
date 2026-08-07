/**
 * §FIX-ROOF-REGION-FOLLOWS-ARC (L-699, founder 2026-08-07) — the canonical
 * wall-centreline sampler for the ROOF subsystem.
 *
 * PURE: no THREE, no DOM, no I/O, no Date, no Math.random. Deterministic, so the
 * same wall always yields byte-identical chords (ADR-0061).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `packages/schemas/src/elements/Wall.ts` models a CURVED wall as ONE record:
 * `baseLine` holds the two arc ENDPOINTS (i.e. the CHORD) and `curve.control`
 * holds the quadratic-Bézier control point. A consumer that reads only
 * `baseLine[0]`/`baseLine[1]` therefore silently substitutes the chord for the
 * arc — it does not "fail", it produces a plausible wrong answer.
 *
 * `WallRegionDetector` did exactly that, which is why a roof drawn BY REGION over
 * a room bounded by a curved wall ignored the curve entirely.
 *
 * ⚠ THE SAMPLING MUST MATCH THE ROOM RING EXACTLY. `RoomDetectionEngine` and
 * `packages/room-topology/src/RoomPolygonUtils.ts` (`_wallCentrelinePolyline`,
 * ~line 829, §FIX-CURVED-ROOM-FINISH-BOUNDARY) sample the SAME Bézier at
 * `segments ?? 16` with the identical parameterisation. If roof and room
 * disagreed on the sampling, a roof and the floor finish under it would follow
 * two different arcs — the exact parity defect L-213/L-240 keeps producing.
 * The formula below is therefore a DELIBERATE CO-OWNED CONSTANT, not a copy of
 * convenience; `__tests__/wallCentreline.test.ts` pins it. Stage 2 of the roof
 * engine plan relocates this to one shared pure home and makes both call it.
 *
 * @file packages/geometry-roof/src/pure/wallCentreline.ts
 */

/** A planar point in world XZ. Matches `Pt` in the roof geometry builders. */
export type Pt2 = [number, number];

/**
 * The read-only slice of a wall this module needs. Mirrors `WallData` /
 * `packages/schemas` `Wall` without importing either, so the module stays pure
 * and dependency-free. `y` is tolerated on every point and ignored (the maths is
 * planar) so a raw `WallData` passes through unchanged.
 */
export interface CentrelineWall {
    readonly baseLine?: ReadonlyArray<{ x: number; z: number; y?: number }>;
    readonly curve?: {
        readonly control: { x: number; z: number; y?: number };
        readonly segments?: number;
    };
}

/** Default tessellation count when `curve.segments` is absent or unusable. */
export const DEFAULT_CURVE_SEGMENTS = 16;
/** Lower bound per `WallCurve` in `packages/schemas/src/elements/Wall.ts`. */
export const MIN_CURVE_SEGMENTS = 4;
/** Upper clamp — mirrors `RoomPolygonUtils`, guards a pathological store value. */
export const MAX_CURVE_SEGMENTS = 256;

/**
 * Resolve the tessellation count for a curve descriptor, applying the same
 * clamp/default ladder as the room-ring sampler.
 */
export function resolveCurveSegments(segments: number | undefined): number {
    if (typeof segments === 'number' && Number.isFinite(segments) && segments >= MIN_CURVE_SEGMENTS) {
        return Math.min(MAX_CURVE_SEGMENTS, Math.floor(segments));
    }
    return DEFAULT_CURVE_SEGMENTS;
}

/**
 * The wall's true centreline as an ordered polyline in world XZ.
 *
 *  - Straight wall (no `curve`) → `[start, end]`, bit-identical to reading
 *    `baseLine[0]`/`baseLine[1]` directly. Existing straight-wall behaviour is
 *    therefore provably unchanged.
 *  - Curved wall → the quadratic Bézier `baseLine[0] → control → baseLine[1]`
 *    sampled at `resolveCurveSegments(curve.segments)` steps, inclusive of both
 *    endpoints (n+1 points), via p(t) = (1−t)²·s + 2(1−t)t·c + t²·e.
 *
 * Returns `[]` when the wall has no usable baseline — callers MUST treat an
 * empty result as "this wall contributes no boundary", never as a zero-length
 * segment (§CONTEXT-DATA-HONESTY: an absence is not a value).
 */
export function sampleWallCentreline(wall: CentrelineWall): Pt2[] {
    const a = wall.baseLine?.[0];
    const b = wall.baseLine?.[1];
    if (!a || !b) return [];
    if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) {
        return [];
    }

    const c = wall.curve?.control;
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) {
        return [[a.x, a.z], [b.x, b.z]];
    }

    const n = resolveCurveSegments(wall.curve?.segments);
    const pts: Pt2[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const w0 = (1 - t) * (1 - t);
        const w1 = 2 * (1 - t) * t;
        const w2 = t * t;
        pts.push([
            w0 * a.x + w1 * c.x + w2 * b.x,
            w0 * a.z + w1 * c.z + w2 * b.z,
        ]);
    }
    return pts;
}

/**
 * The wall's centreline as a list of CHORDS (consecutive point pairs).
 * A straight wall yields exactly one chord; a curved wall yields `n` chords that
 * align 1:1 with the room ring's arc edges.
 */
export function sampleWallChords(wall: CentrelineWall): Array<[Pt2, Pt2]> {
    const pts = sampleWallCentreline(wall);
    const out: Array<[Pt2, Pt2]> = [];
    for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i]!, pts[i + 1]!]);
    return out;
}

/** True iff this wall carries a usable quadratic-Bézier curve descriptor. */
export function isCurvedWall(wall: CentrelineWall): boolean {
    const c = wall.curve?.control;
    return !!c && Number.isFinite(c.x) && Number.isFinite(c.z);
}
