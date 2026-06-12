// T1.W — Window emission engine — pure types (P1 of the sub-engine).
//
// Architecturally the SISTER of the door pipeline + the D-LE / D-FLE / D-CE
// engines: a pure, deterministic projection from "room + bounding walls" to
// "window placements". Wiring into the apartment-layout pipeline (T1.W-B)
// lands as a follow-on commit.
//
// Today the apartment generator builds walls + doors but emits ZERO windows —
// the rooms ship `windowCount: 0/1` in the modal (a flag, not a placement),
// and at build time NO `wall.createOpening` of type 'window' is dispatched.
// This file lays the data foundation for the placement engine; T1.W-B will
// call into it from emitGeometry / executePlan.
//
// Pure data + types only — ZERO imports beyond the RoomType union. The
// engine unit-tests in plain Node.

import type { RoomType, Vec2mm } from '../types.js';

/**
 * Rooms that CAN take an emitted window. Set is closed-world — corridor /
 * hall / utility are intentionally excluded (no light requirement; future
 * variants may add corridor light wells via a separate path).
 */
export type WindowableRoomType =
    | 'living' | 'kitchen' | 'dining'
    | 'master' | 'bedroom'
    | 'study'
    | 'bathroom' | 'ensuite' | 'wc';

/** Whether a given RoomType is in the windowable set. */
export function isWindowable(t: RoomType): t is WindowableRoomType {
    return t === 'living' || t === 'kitchen' || t === 'dining'
        || t === 'master' || t === 'bedroom'
        || t === 'study'
        || t === 'bathroom' || t === 'ensuite' || t === 'wc';
}

/**
 * Per-room window dimensions. All mm. Source: UK residential typical sizes
 * + Approved Doc M / NHBC ranges for the wet rooms, RAISED to generous-but-
 * realistic daylight-first defaults (§68.16, founder 2026-06-11 — "we need
 * BIGGER windows and windows in ALL rooms").
 *
 * §WINDOW-HEAD-FIT — the HEAD height (sillMm + heightMm) of EVERY spec sits at
 * or below `MAX_WINDOW_HEAD_MM` (2300 mm). The house/apartment generator builds
 * ~3.0 m floor-to-floor partitions and a typical ~2.4–2.7 m CLEAR interior
 * height; keeping the head ≤ 2300 mm guarantees the opening sits UNDER the
 * lintel within the wall head height (a window can never poke above the wall).
 * The living sliding-door head reaches the founder's 2200 mm; every other spec
 * tops out at 2200 mm too, so all sizes are buildable under the storey.
 *
 * The sill height tracks the use:
 *   • living                  :   10 mm — a full-height glazed SLIDING/PATIO door
 *                                         (§68.11 "as much daylight as possible";
 *                                         founder's 0.01 m sill, 2.19 m tall →
 *                                         head 2200 mm); reads as a glazed wall.
 *   • dining                  :  400 mm (full view from the table)
 *   • master / bedroom        :  700 mm (generous, still above a low headboard)
 *   • study                   :  750 mm (above a desk)
 *   • kitchen                 :  900 mm (above a 900 mm worktop — sill = worktop)
 *   • bathroom / ensuite / wc : 1400 mm (above eye-level for privacy; pairs with
 *                                       the privacy uPVC casement from T1.D's
 *                                       window resolver) — bigger but still private.
 *
 * Width tracks the daylight-first target:
 *   living ≈ 2.4 m (patio span, 2–3 m), dining ≈ 2.1 m, bedroom/master ≈ 1.8 m,
 *   kitchen ≈ 1.5 m, study ≈ 1.5 m, wet rooms ≈ 0.7–0.8 m. The `minWallLengthMm`
 *   is the architectural floor for the PREFERRED width: a wall shorter than this
 *   is rejected as a preferred host even if it's external, and the engine falls
 *   back to `minWidthMm` (a smaller variant), then — via the §WINDOW-EVERY-FRONTAGE
 *   last-resort tier — to the largest opening the wall can physically host down to
 *   MIN_WINDOW_MM, so a real frontage room never ships windowless.
 *
 * §WINDOW-SPAN-FIT — the bigger widths are CLAMPED to fit the host wall run by the
 * placer (a window wider than its wall is shrunk to fit between the corner piers,
 * never overflowing the shell), so a generous spec on a short wall stays in-bounds.
 */
export interface WindowSpec {
    readonly widthMm:         number;
    readonly heightMm:        number;
    readonly sillMm:          number;
    readonly minWallLengthMm: number;
    /** Fallback width when the chosen host wall is shorter than the
     *  preferred. Set to 0 to skip emission instead of shrinking. */
    readonly minWidthMm:      number;
}

/** §WINDOW-HEAD-FIT — the maximum window HEAD height (sill + height, mm). Keeps
 *  every emitted opening under the lintel of a ~2.4 m clear storey (the generator
 *  builds ~3.0 m floor-to-floor / ~2.4–2.7 m clear). NO spec's head may exceed this. */
export const MAX_WINDOW_HEAD_MM = 2300;

export const WINDOW_SPECS: Readonly<Record<WindowableRoomType, WindowSpec>> = {
    // §68.11 — living = full-height glazed SLIDING/PATIO door. sill 10 mm, height 2190
    // mm → head 2200 mm; preferred 2.4 m span (2–3 m), min 2.0 m so it stays a patio
    // door, never a small window. Applied to ALL living rooms (see §WINDOW-LIVING-PATIO
    // note in emitWindows.ts re: storey-awareness).
    //
    // §WINDOW-SIZE-BY-TYPE (#8, founder full-house 2026-06-12) — the founder's daylight
    // rule: "bedrooms should have LARGE windows, as well as kitchen, living and dining;
    // SMALL windows only for corridors, hall and bathrooms/ensuite". The size class is
    // pinned in WINDOW_SIZE_CLASS below; the spec widths realise it: the LARGE habitable
    // rooms (living/dining/kitchen/master/bedroom/study) all sit ≥ 1500 mm wide with a
    // generous head, the SMALL wet rooms (bathroom/ensuite/wc) ≤ 800 mm with a raised
    // privacy sill. Kitchen is RAISED 1500 → 1800 so it reads as a LARGE window (founder
    // ranked it with living/dining), matching the bedroom span. Corridor/hall are not in
    // the windowable set at all (no window) — there is no "small corridor window".
    living:   { widthMm: 2400, heightMm: 2190, sillMm:   10, minWallLengthMm: 2400, minWidthMm: 2000 },
    kitchen:  { widthMm: 1800, heightMm: 1400, sillMm:  900, minWallLengthMm: 2000, minWidthMm: 1200 },
    dining:   { widthMm: 2100, heightMm: 1700, sillMm:  400, minWallLengthMm: 2400, minWidthMm: 1400 },
    master:   { widthMm: 1800, heightMm: 1500, sillMm:  700, minWallLengthMm: 2100, minWidthMm: 1200 },
    bedroom:  { widthMm: 1800, heightMm: 1500, sillMm:  700, minWallLengthMm: 2100, minWidthMm: 1200 },
    study:    { widthMm: 1500, heightMm: 1400, sillMm:  750, minWallLengthMm: 1800, minWidthMm: 1000 },
    bathroom: { widthMm:  800, heightMm:  800, sillMm: 1400, minWallLengthMm: 1100, minWidthMm:  600 },
    ensuite:  { widthMm:  800, heightMm:  800, sillMm: 1400, minWallLengthMm: 1100, minWidthMm:  600 },
    wc:       { widthMm:  700, heightMm:  800, sillMm: 1400, minWallLengthMm: 1000, minWidthMm:  600 },
};

/**
 * §WINDOW-SIZE-BY-TYPE (#8, founder full-house 2026-06-12) — the daylight size CLASS of
 * each windowable room type. The founder's rule, made explicit + testable:
 *   • LARGE — living / dining / kitchen / master / bedroom / study. The habitable rooms
 *     the founder wants generously daylit. Every LARGE spec is ≥ `LARGE_MIN_WIDTH_MM`
 *     wide (living/dining the widest, as patio/full-view glazing).
 *   • SMALL — bathroom / ensuite / wc. Wet rooms get a SMALL, privacy-silled obscure
 *     window (≤ `SMALL_MAX_WIDTH_MM`, raised sill). Corridor / hall are NOT windowable
 *     (no entry here — they emit no window at all), so the only "small" windows are wet
 *     rooms, exactly as the founder asked.
 * This drives nothing on its own (the spec widths already realise it); it is the single
 * source of truth the size-by-type invariant test pins, so a future spec edit that
 * breaks the LARGE/SMALL daylight contract fails CI rather than silently shipping. */
export type WindowSizeClass = 'large' | 'small';

/** Lower bound (mm) every LARGE window's preferred width must meet. */
export const LARGE_MIN_WIDTH_MM = 1500;
/** Upper bound (mm) every SMALL (wet-room) window's preferred width must stay under. */
export const SMALL_MAX_WIDTH_MM = 1000;

export const WINDOW_SIZE_CLASS: Readonly<Record<WindowableRoomType, WindowSizeClass>> = {
    living:   'large',
    dining:   'large',
    kitchen:  'large',
    master:   'large',
    bedroom:  'large',
    study:    'large',
    bathroom: 'small',
    ensuite:  'small',
    wc:       'small',
};

/**
 * An external wall segment available as a window host. The wiring layer
 * (T1.W-B) computes these per-room from the bubble graph's BOUNDS edges +
 * the shell perimeter; the engine consumes only the geometry + the wall
 * index for command emission.
 */
export interface ExternalWallSegment {
    readonly start:     Vec2mm;        // plan mm
    readonly end:       Vec2mm;        // plan mm
    /** Index into the LayoutOption.walls (or its post-merge equivalent) so
     *  the emitted command resolves to a real wall id at dispatch. */
    readonly wallIndex: number;
}

/**
 * A span on a host wall already OCCUPIED by another opening — in practice a
 * door footprint (T1.W-B-2 door avoidance). Coordinates are mm ALONG the wall
 * from its `start` endpoint, matching `ExternalWallSegment` / WindowPlacement
 * offsets. The window engine slides each window clear of every occupied span on
 * the SAME `wallIndex` so a window is never carved over a door.
 */
export interface OccupiedSpan {
    readonly wallIndex: number;
    /** Opening start, mm from wall start. */
    readonly startMm:   number;
    /** Opening end, mm from wall start. */
    readonly endMm:     number;
}

/**
 * A.21.D33(d) — an INTERIOR-PARTITION junction on a shell (external) host wall:
 * the point (mm ALONG the wall from its `start` endpoint) where a non-external
 * partition wall terminates AT this shell wall. A window must stay clear of these
 * points so an exterior façade window never sits on an interior-wall/shell junction
 * (architecturally wrong — the partition should meet solid wall, and the window
 * should sit within ONE room's façade, not straddle the partition line).
 *
 * Each junction carries the meeting partition's `thicknessMm` so the engine can
 * keep clear of HALF that thickness (the wall actually occupies that band) plus a
 * small clearance. Coordinates match `ExternalWallSegment` / WindowPlacement.
 */
export interface PartitionJunction {
    readonly wallIndex: number;
    /** Junction position, mm from the shell wall's start endpoint. */
    readonly atMm: number;
    /** Thickness of the meeting interior partition (mm). The engine keeps the
     *  window clear of `atMm ± (thicknessMm/2 + clearance)`. Defaults handled by
     *  the engine when omitted / non-positive. */
    readonly thicknessMm?: number;
}

/**
 * A placed window emitted by the engine. Mirrors the LayoutDoor shape so
 * the wiring layer can re-use the same wall.createOpening / batch-create
 * cascade (LayoutWindow → window.createOpening hosted on wallId).
 */
export interface WindowPlacement {
    readonly wallIndex: number;
    /** Offset along the host wall from its start endpoint (mm). */
    readonly offsetMm:  number;
    readonly widthMm:   number;
    readonly heightMm:  number;
    readonly sillMm:    number;
    readonly roomType:  WindowableRoomType;
    /** Optional name for the modal / element browser (e.g. "Living Window"). */
    readonly name?:     string;
}
