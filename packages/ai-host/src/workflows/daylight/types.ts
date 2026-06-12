// §27 / §61 — Per-room OFFLINE daylight analytic pass — shared types.
//
// The numeric core of the SPIKE-DAYLIGHT-SUN-PENETRATION recommendation
// ("ask B"): a pure, deterministic, renderer-INDEPENDENT per-room daylight /
// insolation metric derived from {room polygon · window apertures · sun-path ·
// site latitude}. NOT a renderer shadow-map readback (that is non-deterministic
// + resolution-bound — ADR-0061). This is the data source for the §27
// DAYLIGHT-GRAPH and an input axis for the §59 kitchen "natural-light" scorecard.
//
// ZERO imports by design beyond the apartment-layout geometry vocabulary
// (Vec2mm / RoomType) — the analytic pass unit-tests in plain Node with no
// package barrel, no THREE, no Cesium, no DOM, no Date.now / Math.random.
//
// FRAME + UNITS. All geometry is METRES in the world plan frame { x, z }
// (z = world Z = plan "up"), the SAME frame the furnish / room stores expose
// (FurnishRoomInput, room.boundary.polygon, wall.baseLine). The third
// (vertical) axis is world-Y, metres, used only for the window sill/head and
// the sample-point floor height. Sun directions are unit 3-vectors in this
// {x, y, z} world frame (y = up). This deliberately does NOT reuse the window-
// emission engine's plan-mm { x = East, y = South } frame: the consumer (the
// editor executor) already has everything in world-metres XZ, so we keep the
// analytic pass in that frame and avoid a mm↔m / y-axis-swap conversion.

import type { RoomType } from '../apartmentLayout/types.js';

/** A 2-D point in the world plan frame, METRES (x = world-East, z = world plan
 *  "up"). Distinct from apartmentLayout's `Vec2mm` (plan millimetres) — the
 *  daylight pass works in metres throughout, matching the room/wall stores. */
export interface Pt2 { readonly x: number; readonly z: number }

/**
 * A window aperture on a façade (external) wall, expressed as a horizontal
 * segment `a → b` on the wall centreline (world XZ, metres) plus the vertical
 * sill/head band. The aperture rectangle a sun ray must pass through is:
 *   horizontal extent : along the segment a → b
 *   vertical extent    : [sillM, headM] in world-Y (metres above the floor datum)
 *
 * `outwardNormal` points OUT of the room through the façade (unit, XZ). A sun
 * ray only enters through the aperture when the sun is on the outward side.
 */
export interface WindowAperture {
    /** Aperture left edge on the wall centreline (world XZ, metres). */
    readonly a: Pt2;
    /** Aperture right edge on the wall centreline (world XZ, metres). */
    readonly b: Pt2;
    /** Sill height above the room floor datum (metres). */
    readonly sillM: number;
    /** Head height above the room floor datum (metres) — must be > sillM. */
    readonly headM: number;
    /** Unit outward façade normal (XZ) — points away from the room interior. */
    readonly outwardNormal: Pt2;
    /** Optional label for diagnostics / contribution attribution. */
    readonly label?: string;
}

/** One room's analytic-daylight input. Polygon + apertures live in the same
 *  world-metres XZ frame; the floor datum is `floorY` (world-Y, metres). */
export interface RoomDaylightInput {
    readonly roomId: string;
    /** Optional human name + semantic type for the report / consumers. */
    readonly name?: string;
    readonly roomType?: RoomType;
    /** Closed floor polygon (world XZ, metres) — CW or CCW, ≥ 3 vertices. */
    readonly polygon: ReadonlyArray<Pt2>;
    /** Window apertures opening this room to the sky (may be empty ⇒ windowless). */
    readonly windows: ReadonlyArray<WindowAperture>;
    /** Floor height (world-Y, metres). Sample points sit at floorY + sampleHeightM.
     *  Optional; defaults to 0. */
    readonly floorY?: number;
}

/** A single sun position. `azimuthDeg` measured CLOCKWISE from world North
 *  (−z) when viewed from above, i.e. N=0°, E=90°, S=180°, W=270° (the
 *  compass convention RealSunService uses). `elevationDeg` is the angle above
 *  the horizon (0 = horizon, 90 = zenith). Samples with elevationDeg ≤ 0 are
 *  below the horizon and contribute nothing (skipped). */
export interface SunSample {
    readonly azimuthDeg: number;
    readonly elevationDeg: number;
    /** Optional relative weight (e.g. seasonal / hourly frequency). Default 1. */
    readonly weight?: number;
    /** Optional label (e.g. "equinox 12:00") for diagnostics. */
    readonly label?: string;
}

/** Per-window contribution within a room result (for attribution + the §59
 *  scorecard "which window lights the kitchen" question). */
export interface WindowContribution {
    /** Index into the room's `windows` array. */
    readonly windowIndex: number;
    readonly label?: string;
    /** Raw insolation this window contributed (same units as the room raw). */
    readonly raw: number;
    /** Fraction of the room's total raw insolation from this window (0..1). */
    readonly fraction: number;
}

/** Per-room analytic-daylight result. */
export interface RoomDaylightResult {
    readonly roomId: string;
    readonly name?: string;
    readonly roomType?: RoomType;
    /** Normalised daylight score in [0, 1]. 0 = windowless / no sun reaches the
     *  floor; ~1 = a fully-glazed, well-oriented, low-sill room. Monotone in
     *  window size, lower sill, and better orientation. */
    readonly score: number;
    /** Raw integrated insolation (Σ over floor points × sun samples of the
     *  weighted contribution). Pre-normalisation; comparable ACROSS rooms in
     *  the same building run. */
    readonly raw: number;
    /** Number of interior floor sample points used (point-in-polygon). */
    readonly sampleCount: number;
    /** Mean fraction of (sample-point × sun-sample) tests that reached the sun
     *  through some aperture — a "sunlit-ness" diagnostic in [0, 1]. */
    readonly sunlitFraction: number;
    /** Per-window contributions, sorted by `raw` descending. */
    readonly windows: ReadonlyArray<WindowContribution>;
}

/** Building-level summary from `computeBuildingDaylight`. */
export interface BuildingDaylightResult {
    /** Per-room results, sorted by `score` DESCENDING (brightest first). */
    readonly rooms: ReadonlyArray<RoomDaylightResult>;
    /** Mean room score (0..1) across all scored rooms. */
    readonly meanScore: number;
    /** The single brightest / darkest room id (undefined when no rooms). */
    readonly brightestRoomId?: string;
    readonly darkestRoomId?: string;
}

/** Tuning knobs for the daylight pass. Every field has a deterministic default
 *  so the pass is reproducible without any opts. */
export interface DaylightOptions {
    /** Floor sample-grid spacing (metres). Smaller = finer + slower. Default 0.5. */
    readonly gridSpacingM?: number;
    /** Height above the floor at which insolation is measured (metres). The
     *  "working plane" — default 0.0 (the floor). A desk plane would be ~0.75. */
    readonly sampleHeightM?: number;
    /** The raw insolation considered "fully daylit" (the score-1.0 datum).
     *  Normalisation divides raw-per-sample by this. Default tuned so a large,
     *  low-sill, sun-facing window saturates near 1.0. */
    readonly fullDaylightRawPerSample?: number;
    /** Hard cap on the number of floor sample points per room (guards a huge
     *  open-plan room from exploding the cost). Default 4000. */
    readonly maxSamplePoints?: number;
    /** Isotropic sky-diffuse weight: the per-(point × aperture) ambient skylight
     *  contribution that lets a NON-sun-facing window beat windowless (a north
     *  window admits diffuse sky even with no direct beam). Relative to the unit
     *  direct-beam luminance; the direct beam still dominates orientation. Set to
     *  0 to score DIRECT-beam only. Default 0.18. */
    readonly diffuseSkyWeight?: number;
}
