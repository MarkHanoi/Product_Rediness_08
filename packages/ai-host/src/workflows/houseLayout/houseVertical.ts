// Casa Unifamiliar — vertical-geometry decisions (founder v45/v46 + D38).
//
// PURE + DETERMINISTIC L2. The single source of truth for THREE vertical-geometry
// decisions the multi-storey house pipeline makes, so the editor executor only
// PLACES what these functions DECIDE (testable without the editor):
//
//  1. §ROOF-CAP-ELEVATION (founder v45) — the roof base world-Y is a function of
//     (storey count × floor-to-floor) + base elevation, so an N-storey house caps
//     at the right height EVERY time: the roof sits on top of the TOPMOST storey's
//     walls (top-storey floor elevation + wall height), capping the building — not
//     one storey too low and not floating.
//
//  2. §DOOR-IN-WALL-SPAN (founder v46) — a door opening (offset + width along its
//     host wall) must lie WITHIN the wall span, clear of each end, so the door is
//     genuinely HOSTED in the wall (aligned to the wall plane) — never floating off
//     the wall or overrunning a corner. Mirrors the A.21.D28 #5 / shell-window
//     clamp discipline used by `executePlan` + `entranceDoor`.
//
//  3. §WALL-SLAB-CONTINUITY (D38) — the exterior shell shows a dark exposed-slab
//     band at each floor junction because a level's walls stop at its own
//     ceiling and the next level's walls start at the next floor, leaving the slab
//     edge bare between them. FIX: extend a level's walls UP to the MID-HEIGHT of
//     the next level's slab, and START the next level's walls from that slab
//     mid-height, so the wall faces overlap the slab band by slab/2 on each side and
//     the shell reads continuous from outside.
//
// No OTel span: pure helpers, like the apartment/house validators — spans live at
// the AiPlane boundary (P8 §C09 §2.4). No I/O, no THREE, no DOM, no Math.random.

const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

// ───────────────────────────── 1. §ROOF-CAP-ELEVATION ─────────────────────────

/**
 * The world-Y (metres) the roof base sits at so it caps the TOPMOST storey's walls.
 *
 *   roofBaseY = baseElevationM + (storeyCount − 1) × floorToFloorM   ← top-storey floor
 *             + wallHeightM                                          ← wall head
 *             = baseElevationM + storeyCount × floorToFloorM         (when wallHeightM === floorToFloorM)
 *
 * The general form keeps wallHeightM explicit (it usually equals floorToFloorM, but
 * the D38 continuity pass below extends shell walls slightly past the slab — the
 * roof still caps at the storey's nominal wall head, not the extended top). For a
 * 1-storey house the roof caps at `baseElevationM + wallHeightM`; for N storeys it
 * caps N×ftf above the base — never one storey too low, never floating.
 *
 * `storeyCount` is clamped ≥1; non-finite inputs degrade to sensible defaults so the
 * caller never produces a NaN elevation.
 */
export function roofBaseElevationM(
    storeyCount: number,
    floorToFloorM: number,
    baseElevationM = 0,
    wallHeightM?: number,
): number {
    const storeys = Number.isFinite(storeyCount) ? Math.max(1, Math.floor(storeyCount)) : 1;
    const ftf = Number.isFinite(floorToFloorM) && floorToFloorM > 0 ? floorToFloorM : 3;
    const base = Number.isFinite(baseElevationM) ? baseElevationM : 0;
    const wh = Number.isFinite(wallHeightM as number) && (wallHeightM as number) > 0 ? (wallHeightM as number) : ftf;
    const topStoreyFloorY = base + (storeys - 1) * ftf;
    return r6(topStoreyFloorY + wh);
}

/** The `baseOffset` (metres above the TOP storey's own floor elevation) the roof
 *  command needs so RoofFragmentBuilder resolves the same world-Y as
 *  `roofBaseElevationM`. Since the roof targets the top storey's level, its base
 *  offset is simply the wall head height above that floor. Kept as its own function
 *  so the executor's `baseOffset` is the SAME decision the elevation test pins. */
export function roofBaseOffsetM(floorToFloorM: number, wallHeightM?: number): number {
    const ftf = Number.isFinite(floorToFloorM) && floorToFloorM > 0 ? floorToFloorM : 3;
    const wh = Number.isFinite(wallHeightM as number) && (wallHeightM as number) > 0 ? (wallHeightM as number) : ftf;
    return r6(wh);
}

// ───────────────────────────── 2. §DOOR-IN-WALL-SPAN ──────────────────────────

/** Minimum clearance (m) the door leaf must keep from each wall end / corner join,
 *  matching the A.21.D28 #5 / entrance-door discipline (END_CLEAR_M). */
export const DOOR_END_CLEAR_M = 0.15;
/** Below this an opening isn't a usable door (matches the entrance-door MIN_DOOR_M). */
export const MIN_DOOR_WIDTH_M = 0.7;
/** Fit tolerance (m) — a hair of slack so float round-off doesn't drop a flush door. */
const FIT_EPS_M = 1e-3;

/**
 * Is a door opening genuinely hosted WITHIN its wall span?
 *
 * True iff the whole leaf [offset, offset+width] lies inside the wall length with
 * (optionally) the end clearance kept clear of both ends. Used as the testable
 * predicate behind the executor's door-vs-wall guard: a door that fails this is
 * floating off / overrunning the wall and must be clamped or dropped.
 */
export function isDoorWithinWallSpan(
    offsetM: number,
    widthM: number,
    wallLengthM: number,
    clearM: number = DOOR_END_CLEAR_M,
): boolean {
    if (!Number.isFinite(offsetM) || !Number.isFinite(widthM) || !Number.isFinite(wallLengthM)) return false;
    if (widthM <= 0 || wallLengthM <= 0) return false;
    const clear = Math.max(0, clearM);
    return offsetM >= clear - FIT_EPS_M
        && offsetM + widthM <= wallLengthM - clear + FIT_EPS_M;
}

/** A clamped door span (m) or null when the wall is too short to host any door. */
export interface ClampedDoorSpan {
    readonly offsetM: number;
    readonly widthM: number;
}

/**
 * Clamp a desired door opening to fit inside its host wall span, keeping the end
 * clearance clear of both ends (A.21.D28 #5 discipline). Narrows the leaf when the
 * wall is short, then slides the offset so the whole leaf stays strictly inside.
 * Returns null when the wall can't host even a `MIN_DOOR_WIDTH_M` door — the caller
 * then DROPS the door rather than emit an off-wall slot.
 *
 * Deterministic: a door already inside the span is returned unchanged.
 */
export function clampDoorToWallSpan(
    offsetM: number,
    widthM: number,
    wallLengthM: number,
    clearM: number = DOOR_END_CLEAR_M,
): ClampedDoorSpan | null {
    if (!Number.isFinite(wallLengthM) || wallLengthM <= 0) return null;
    const clear = Math.max(0, clearM);
    const maxWidth = wallLengthM - 2 * clear;
    if (maxWidth < MIN_DOOR_WIDTH_M) return null;                 // too short for any door
    const w = Math.min(Math.max(MIN_DOOR_WIDTH_M, Number.isFinite(widthM) && widthM > 0 ? widthM : maxWidth), maxWidth);
    const minOff = clear;
    const maxOff = wallLengthM - w - clear;
    const desired = Number.isFinite(offsetM) ? offsetM : (wallLengthM - w) / 2;
    const off = Math.min(Math.max(minOff, desired), Math.max(minOff, maxOff));
    return { offsetM: r6(off), widthM: r6(w) };
}

// ───────────────────────────── 3. §WALL-SLAB-CONTINUITY ───────────────────────

/** The vertical extents (world-Y, metres) of ONE level's walls after the D38
 *  slab-continuity overlap is applied. */
export interface WallVerticalExtent {
    /** World-Y the wall base starts at. */
    readonly baseY: number;
    /** World-Y the wall top reaches. */
    readonly topY: number;
    /** Wall height (topY − baseY). */
    readonly heightM: number;
}

/**
 * §WALL-SLAB-CONTINUITY (D38) — the per-level wall vertical extents that hide the
 * exposed-slab band at every floor junction.
 *
 * For a level `i` whose floor sits at `floorElevM[i]` carrying walls of nominal
 * height `wallHeightM`, with a structural slab of `slabThicknessM` at each floor:
 *
 *   lower wall top  = floorElev + wallHeight + slabThickness/2   (rise INTO the slab above)
 *   upper wall base = nextFloorElev − slabThickness/2            (drop INTO the slab below)
 *
 * so adjacent levels' walls each penetrate the shared slab by slab/2 → their outer
 * faces overlap the slab band and the shell reads continuous. The GROUND level base
 * is NOT lowered (it sits on the ground slab); the TOP level top is NOT raised past
 * its wall head (the roof caps there — §ROOF-CAP-ELEVATION). Only the SHARED
 * junctions between adjacent storeys get the slab/2 overlap.
 *
 *   level 0 (ground)  : base = floorElev[0]                          , top = floorElev[0] + wallHeight + slab/2
 *   level i (middle)  : base = floorElev[i] − slab/2                 , top = floorElev[i] + wallHeight + slab/2
 *   level n−1 (top)   : base = floorElev[n-1] − slab/2              , top = floorElev[n-1] + wallHeight
 *
 * A single-storey house → one extent, base = floorElev, top = floorElev + wallHeight
 * (NO overlap — there is no junction), so the apartment / single-storey path is
 * unchanged. Returns one extent per supplied floor elevation, index-aligned.
 */
export function wallVerticalExtents(
    floorElevationsM: readonly number[],
    wallHeightM: number,
    slabThicknessM: number,
): WallVerticalExtent[] {
    const n = floorElevationsM.length;
    const wh = Number.isFinite(wallHeightM) && wallHeightM > 0 ? wallHeightM : 3;
    const half = (Number.isFinite(slabThicknessM) && slabThicknessM > 0 ? slabThicknessM : 0) / 2;
    const out: WallVerticalExtent[] = [];
    for (let i = 0; i < n; i++) {
        const floor = floorElevationsM[i]!;
        const isGround = i === 0;
        const isTop = i === n - 1;
        const baseY = isGround ? floor : floor - half;        // drop into the slab below (not the ground)
        const topY = isTop ? floor + wh : floor + wh + half;  // rise into the slab above (not past the roof head)
        out.push({ baseY: r6(baseY), topY: r6(topY), heightM: r6(topY - baseY) });
    }
    return out;
}

/** The D38 overlap applied to ONE level given its floor elevation + neighbours
 *  present. Convenience wrapper for the executor when it builds per-storey walls in
 *  a loop (it knows each storey's index + the count). Same math as
 *  `wallVerticalExtents[i]`. */
export function wallExtentForLevel(
    floorElevationM: number,
    wallHeightM: number,
    slabThicknessM: number,
    hasLevelBelow: boolean,
    hasLevelAbove: boolean,
): WallVerticalExtent {
    const wh = Number.isFinite(wallHeightM) && wallHeightM > 0 ? wallHeightM : 3;
    const half = (Number.isFinite(slabThicknessM) && slabThicknessM > 0 ? slabThicknessM : 0) / 2;
    const baseY = hasLevelBelow ? floorElevationM - half : floorElevationM;
    const topY = hasLevelAbove ? floorElevationM + wh + half : floorElevationM + wh;
    return { baseY: r6(baseY), topY: r6(topY), heightM: r6(topY - baseY) };
}
