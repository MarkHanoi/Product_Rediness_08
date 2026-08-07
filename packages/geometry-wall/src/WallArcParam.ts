/**
 * WallArcParam — §FEAT-HOSTED-ON-CURVED-WALL
 *
 * ARC-LENGTH PARAMETERISATION OF A WALL CENTRELINE.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * C15 §2 defines a hosted element's world position as
 *
 *     worldCentre = baseLine[0] + offset × wallDir + (width/2) × wallDir
 *
 * i.e. a 1-D offset along a STRAIGHT direction vector. That formula is a
 * SPECIAL CASE of the general rule: `offset` is a distance measured **along the
 * wall centreline**, and for a straight wall the centreline is the chord, so
 * "distance along the chord" and "distance along the centreline" coincide.
 *
 * For a CURVED wall (`WallData.curve` — a quadratic Bézier, Contract §03-1.2)
 * they do not coincide. Measuring an opening along the chord instead of the arc
 * produces every failure mode the founder would see: doors that drift away from
 * the click point, occupancy intervals that overlap-check against the wrong
 * span, and openings that fall off the end of a wall whose arc is longer than
 * its chord.
 *
 * This module is the single source of truth for that conversion. It is PURE:
 * no THREE, no DOM, no I/O — so it is safe to import from stores, commands,
 * tools, builders and tests alike.
 *
 * ── The authoritative curve ──────────────────────────────────────────────────
 * The parameterisation samples the SAME quadratic Bézier at the SAME
 * `curve.segments` resolution that `WallFragmentBuilder` / `computeStations`
 * use to build the solid. This is deliberate and load-bearing: the arc length
 * reported here is the length of the polyline the wall solid is actually made
 * of, so an opening at arc length `s` lands EXACTLY on the built face, with no
 * accumulating tessellation drift between the placement maths and the geometry.
 * (Sampling a denser "true" Bézier here would be more accurate in the abstract
 * and WRONG in practice — the opening would no longer coincide with the wall.)
 *
 * ── Measurement datum (C15 amendment §2.1) ───────────────────────────────────
 * `offset` and `width` are measured along the **CENTRELINE** arc, and the jambs
 * are **RADIAL** — i.e. each jamb lies in the plane containing the local
 * centreline normal. Consequences, which are the physically correct behaviour
 * of a real opening cut through a curved wall and are asserted in the tests:
 *   • the void measured on the OUTER face is slightly WIDER than `width`
 *   • the void measured on the INNER face is slightly NARROWER than `width`
 *   • the void measured on the CENTRELINE is EXACTLY `width`
 * This matches the BIM convention (Revit measures a hosted opening along the
 * wall's location line) and is why a straight box subtraction is wrong: a box
 * has PARALLEL jambs, so it over-cuts one face into a wedge and under-cuts the
 * other. See CurvedWallOpeningBuilder for the radial-band carve.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal planar point. `y` is ignored by every function here (all maths is XZ). */
export interface ArcPointXZ {
    x: number;
    y?: number;
    z: number;
}

/**
 * The subset of `WallData` this module needs. Declared structurally so that
 * tests, tools and stores can pass a plain literal without constructing a full
 * WallData, and so this module stays free of a WallTypes import cycle.
 */
export interface ArcHostWall {
    readonly baseLine: readonly [ArcPointXZ, ArcPointXZ];
    readonly curve?: { control: ArcPointXZ; segments: number } | null;
}

/** A local frame on the wall centreline at a given arc length. */
export interface WallArcFrame {
    /** Clamped arc length this frame was evaluated at (metres from baseLine[0]). */
    s: number;
    /** World X of the centreline point. */
    x: number;
    /** World Z of the centreline point. */
    z: number;
    /** Unit tangent (direction of increasing `s`), XZ. */
    tx: number;
    tz: number;
    /** Unit outward normal = tangent rotated +90° CCW in XZ, i.e. (−tz, tx). */
    nx: number;
    nz: number;
    /**
     * Heading of the tangent: `atan2(tz, tx)`.
     * NOTE the sign convention used by every consumer in this codebase:
     * a Three.js group aligned to the wall sets `rotation.y = -angleY`.
     */
    angleY: number;
}

/** A wall centreline sampled to a polyline, with cumulative arc lengths. */
export interface WallCentreline {
    /** Sampled points, XZ only. `pts[0]` = baseLine[0], last = baseLine[1]. */
    readonly pts: ReadonlyArray<{ x: number; z: number }>;
    /** `cum[i]` = arc length from `pts[0]` to `pts[i]`. `cum[0] === 0`. */
    readonly cum: ReadonlyArray<number>;
    /** Total polyline length = `cum[cum.length - 1]`. */
    readonly length: number;
    /** true when the wall carries a `curve` descriptor. */
    readonly curved: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum tessellation honoured, mirroring `WallDataSchema` (`segments ≥ 4`). */
const MIN_SEGMENTS = 4;

/** Sub-millimetre tolerance for "same station" / degenerate-span comparisons. */
export const ARC_EPSILON_M = 1e-6;

// ─── Escape hatch (§FEAT-HOSTED-ON-CURVED-WALL) ───────────────────────────────

/**
 * Default-ON, per local convention (see `JunctionResolverV2`
 * `__pryzmWallV2ExistingCornerImmutable`). Set
 * `globalThis.__pryzmHostedOnCurvedWall = false` to restore the pre-feature
 * behaviour in which doors/windows are refused on curved walls and every
 * offset is measured along the CHORD.
 *
 * Straight walls are unaffected in either mode — for a straight wall the arc
 * IS the chord, so all maths below is bit-identical to the legacy formula.
 */
export function hostedOnCurvedWallEnabled(): boolean {
    return (globalThis as { __pryzmHostedOnCurvedWall?: boolean })
        .__pryzmHostedOnCurvedWall !== false;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * True when `wall` must be treated as a curved host — i.e. it carries a valid
 * curve descriptor AND the feature is enabled. Every call site that needs to
 * branch "arc vs chord" should ask THIS, not `!!wall.curve`, so the escape
 * hatch is honoured uniformly.
 */
export function isArcHost(wall: ArcHostWall | null | undefined): boolean {
    if (!wall?.curve?.control) return false;
    const c = wall.curve.control;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) return false;
    return hostedOnCurvedWallEnabled();
}

/**
 * Sample the wall centreline to a polyline with cumulative arc lengths.
 *
 * Straight wall (or feature disabled) → the 2-point chord, so `length` is the
 * chord length and every downstream result is identical to the legacy maths.
 *
 * Curved wall → the quadratic Bézier `baseLine[0] → curve.control → baseLine[1]`
 * sampled at `curve.segments` intervals (`segments + 1` points), matching
 * `PathResolver.toPolyline` / `computeStations` exactly.
 */
export function wallCentreline(wall: ArcHostWall): WallCentreline {
    const a = wall.baseLine[0];
    const b = wall.baseLine[1];

    if (!isArcHost(wall)) {
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        return {
            pts: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }],
            cum: [0, len],
            length: len,
            curved: false,
        };
    }

    const c = wall.curve!.control;
    const rawSeg = wall.curve!.segments;
    const segments = Number.isFinite(rawSeg) ? Math.max(MIN_SEGMENTS, Math.floor(rawSeg)) : 16;

    const pts: Array<{ x: number; z: number }> = [];
    const cum: number[] = [];
    let acc = 0;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const u = 1 - t;
        // Quadratic Bézier: B(t) = u²·P0 + 2ut·C + t²·P1
        const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
        const z = u * u * a.z + 2 * u * t * c.z + t * t * b.z;
        if (i > 0) {
            const prev = pts[i - 1]!;
            acc += Math.hypot(x - prev.x, z - prev.z);
        }
        pts.push({ x, z });
        cum.push(acc);
    }

    return { pts, cum, length: acc, curved: true };
}

/**
 * Total length of the wall centreline in metres — the arc length for a curved
 * wall, the chord length for a straight one.
 *
 * THIS is the value every occupancy / clamp / bounds check must use in place of
 * `Math.hypot(baseLine)`. For a straight wall the two are equal, so substituting
 * it is a no-op regression-wise.
 */
export function wallCentrelineLength(wall: ArcHostWall): number {
    return wallCentreline(wall).length;
}

/**
 * Evaluate the local frame (position + tangent + normal) at arc length `s`.
 *
 * `s` is clamped to `[0, length]`. For a straight wall this reduces exactly to
 * `baseLine[0] + s × wallDir` with a constant tangent — the C15 §2 formula.
 *
 * @param cl optional pre-computed centreline, to avoid re-sampling in loops.
 */
export function arcFrameAt(wall: ArcHostWall, s: number, cl?: WallCentreline): WallArcFrame {
    const line = cl ?? wallCentreline(wall);
    const { pts, cum, length } = line;
    const n = pts.length;

    // Degenerate wall — return a stable, finite frame rather than NaN.
    if (n < 2 || !(length > 0)) {
        const p0d = pts[0] ?? { x: 0, z: 0 };
        return { s: 0, x: p0d.x, z: p0d.z, tx: 1, tz: 0, nx: 0, nz: 1, angleY: 0 };
    }

    const sc = Math.min(Math.max(Number.isFinite(s) ? s : 0, 0), length);

    // Locate the polyline segment containing `sc`.
    let i = 0;
    for (let k = 1; k < n; k++) {
        if (cum[k]! >= sc - ARC_EPSILON_M) { i = k - 1; break; }
        i = k - 1;
    }
    if (i > n - 2) i = n - 2;

    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const segLen = cum[i + 1]! - cum[i]!;
    const u = segLen > ARC_EPSILON_M ? (sc - cum[i]!) / segLen : 0;

    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const dl = Math.hypot(dx, dz) || 1;
    const tx = dx / dl;
    const tz = dz / dl;

    return {
        s: sc,
        x: p0.x + dx * u,
        z: p0.z + dz * u,
        tx,
        tz,
        // Outward normal = tangent rotated +90° CCW in XZ — the SAME convention
        // `computeStations` uses (`nx = -tz, nz = tx`), so a frame produced here
        // and a station produced there agree on which face is "outer".
        nx: -tz,
        nz: tx,
        angleY: Math.atan2(tz, tx),
    };
}

/**
 * INVERSE mapping: given a world XZ point (a cursor hit, a drag position),
 * return the arc length of the closest point on the wall centreline.
 *
 * This replaces the straight-wall projection `dot(p − baseLine[0], wallDir)`
 * at every placement / drag call site. For a straight wall it returns exactly
 * that dot product, clamped to `[0, length]`.
 *
 * @returns `s` (arc length), the closest centreline point, and the planar
 *          distance from the query point to it.
 */
export function arcLengthAtPointXZ(
    wall: ArcHostWall,
    px: number,
    pz: number,
    cl?: WallCentreline,
): { s: number; x: number; z: number; distance: number } {
    const line = cl ?? wallCentreline(wall);
    const { pts, cum, length } = line;
    const n = pts.length;

    if (n < 2 || !(length > 0)) {
        const pd = pts[0] ?? { x: 0, z: 0 };
        return { s: 0, x: pd.x, z: pd.z, distance: Math.hypot(px - pd.x, pz - pd.z) };
    }

    let bestD2 = Infinity;
    let bestS = 0;
    let bestX = pts[0]!.x;
    let bestZ = pts[0]!.z;

    for (let i = 0; i < n - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        let u = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const qx = a.x + dx * u;
        const qz = a.z + dz * u;
        const d2 = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
        if (d2 < bestD2) {
            bestD2 = d2;
            bestS = cum[i]! + u * (cum[i + 1]! - cum[i]!);
            bestX = qx;
            bestZ = qz;
        }
    }

    return { s: bestS, x: bestX, z: bestZ, distance: Math.sqrt(bestD2) };
}

/**
 * Convenience for the two builders: the world position + Three.js Y-rotation of
 * a hosted element whose stored LEFT-EDGE offset is `offset` and whose width is
 * `width`, i.e. whose centre sits at arc length `offset + width/2`.
 *
 * Encodes the C15 §2 `worldCentre` rule in its arc-generalised form, and the
 * sign convention (`rotationY = -angleY`) that DoorBuilder / WindowBuilder /
 * `createWindowFrame` all already use.
 */
export function hostedElementFrame(
    wall: ArcHostWall,
    offset: number,
    width: number,
    cl?: WallCentreline,
): { x: number; z: number; rotationY: number; frame: WallArcFrame } {
    const f = arcFrameAt(wall, offset + width / 2, cl);
    return { x: f.x, z: f.z, rotationY: -f.angleY, frame: f };
}
