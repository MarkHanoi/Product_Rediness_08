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
 * + Approved Doc M / NHBC ranges for the wet rooms. The sill height tracks
 * the use:
 *   • living / dining        : 400 mm (full view from the sofa)
 *   • master / bedroom / study: 900 mm (above a bed headboard / desk)
 *   • kitchen                 : 1000 mm (above a 900 mm worktop + clearance)
 *   • bathroom / ensuite / wc : 1700 mm (above eye-level for privacy; pairs
 *                                       with the privacy uPVC casement
 *                                       from T1.D's window resolver)
 *
 * Width tracks the spec target — typical UK ranges:
 *   living  ≈ 2.0 m, dining ≈ 1.8 m, bedroom ≈ 1.5 m, kitchen ≈ 1.2 m,
 *   wet rooms ≈ 0.6 m. The `minWallLengthMm` is the architectural floor:
 *   a wall shorter than this is rejected as the host even if it's external,
 *   and the engine falls back to the next-best wall (a smaller variant)
 *   or skips emission for this room.
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

export const WINDOW_SPECS: Readonly<Record<WindowableRoomType, WindowSpec>> = {
    living:   { widthMm: 2000, heightMm: 1500, sillMm:  400, minWallLengthMm: 2400, minWidthMm: 1200 },
    kitchen:  { widthMm: 1200, heightMm: 1200, sillMm: 1000, minWallLengthMm: 1600, minWidthMm:  900 },
    dining:   { widthMm: 1800, heightMm: 1500, sillMm:  400, minWallLengthMm: 2200, minWidthMm: 1200 },
    master:   { widthMm: 1500, heightMm: 1300, sillMm:  900, minWallLengthMm: 1900, minWidthMm: 1000 },
    bedroom:  { widthMm: 1500, heightMm: 1300, sillMm:  900, minWallLengthMm: 1900, minWidthMm: 1000 },
    study:    { widthMm: 1200, heightMm: 1300, sillMm:  900, minWallLengthMm: 1600, minWidthMm:  900 },
    bathroom: { widthMm:  600, heightMm:  600, sillMm: 1700, minWallLengthMm: 1000, minWidthMm:  500 },
    ensuite:  { widthMm:  600, heightMm:  600, sillMm: 1700, minWallLengthMm: 1000, minWidthMm:  500 },
    wc:       { widthMm:  600, heightMm:  600, sillMm: 1700, minWallLengthMm: 1000, minWidthMm:  500 },
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
