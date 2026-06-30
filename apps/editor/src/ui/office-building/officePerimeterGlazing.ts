// §OFFICE-PERIMETER-GLAZING (founder 2026-06-30) — PURE per-segment curtain-glazing math.
//
// The founder's rule: the circular office tower reads as a GLASS CURTAIN-WALL tower —
// EVERY perimeter wall segment on EVERY storey gets ONE window that fills almost the FULL
// WIDTH of the segment (a small masonry jamb at each end so it never overruns the corner)
// and almost the FULL HEIGHT (sill near the floor, head near the slab soffit). The executor
// (OfficeBuildingExecutor) hosts a real PUNCHED WINDOW (a C15 hosted opening, type 'window')
// in each segment via the command bus; this module owns ONLY the placement geometry so it is
// I/O-free, THREE-free, DOM-free and unit-testable in plain Node (the executor itself drags
// DOM-bound deps via the slab tool, so the math is split out here).

/** Solid jamb (m) reserved at EACH segment end (corner pier) — the window is the segment
 *  length minus 2·jamb. Wall-length-scaled (7.5% of the segment) within a fixed band so a
 *  short segment keeps a survivable pier and a long one isn't over-set. */
export const GLAZING_JAMB_MIN_M = 0.15;
export const GLAZING_JAMB_MAX_M = 0.30;
export const GLAZING_JAMB_FRACTION = 0.075;
/** Below this clear width a segment can't host a sensible curtain pane → skip it. */
export const GLAZING_MIN_WIDTH_M = 0.4;
/** Sill height (m) above the floor — low, so the glazing reads near floor-to-slab. */
export const GLAZING_SILL_M = 0.15;
/** Header (m) reserved below the slab soffit (floor-to-floor − header − sill = pane height). */
export const GLAZING_HEADER_M = 0.30;
/** Built-in commercial glazing window type — anodised aluminium office/retail façade glazing
 *  (low glassOpacity ⇒ transmissive). Renders as real see-through GLASS so the Forma
 *  white-materials pass classifies the façade as glazing, not opaque white. */
export const GLAZING_SYSTEM_TYPE_ID = 'wt-aluminium-commercial';

/** A near-full curtain-window placement on one perimeter wall segment. */
export interface GlazingPlacement {
    /** Along-wall offset (m) from the segment start (centred ⇒ equals the jamb). */
    readonly offset: number;
    /** Pane width (m) ≈ segment length − 2·jamb. */
    readonly width: number;
    /** Sill height (m) above the floor — low. */
    readonly sillHeight: number;
    /** Pane height (m) ≈ floor-to-floor − header − sill (near floor-to-slab). */
    readonly height: number;
}

/** A finite plan point (m, {x,z}). */
export interface PlanPt { readonly x: number; readonly z: number }

/** True for a real, finite plan point — guards against an undefined / NaN polygon vertex
 *  reaching a RoomBoundingLine payload (§RBL-PLACEMENT-AT-SOURCE). */
export function isFinitePlanPt(p: unknown): p is PlanPt {
    return !!p && typeof (p as PlanPt).x === 'number' && Number.isFinite((p as PlanPt).x)
        && typeof (p as PlanPt).z === 'number' && Number.isFinite((p as PlanPt).z);
}

/** §RBL-PLACEMENT-AT-SOURCE (founder 2026-06-30) — convert a closed ring polygon into the
 *  closed bounding-line segments the office executor draws as RoomBoundingLines, DROPPING
 *  any edge with an undefined / NaN vertex or a degenerate (< 10 mm) length. The
 *  RoomBoundingLineBuilder's §RBL-PLACEMENT-GUARD SKIPS (and the collab replay path THROWS
 *  `reading 'x'` on) any CREATE_ROOM_BOUNDING_LINE whose `placement.start/end` is
 *  undefined/non-finite; a zone polygon can carry a bad vertex (a degenerate ring, a clamped
 *  radius that collapsed, a legacy record), which produced a line with an undefined endpoint
 *  → every office zone line was dropped (each floor read as ONE empty room). Returning only
 *  validated, non-degenerate segments at the SOURCE means the guard never skips and the
 *  replay never crashes. Pure + deterministic. */
export function ringPlanSegments(poly: readonly unknown[]): Array<{ start: PlanPt; end: PlanPt }> {
    const out: Array<{ start: PlanPt; end: PlanPt }> = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % n];
        if (!isFinitePlanPt(a) || !isFinitePlanPt(b)) continue;     // skip undefined / NaN vertex
        if (Math.hypot(b.x - a.x, b.z - a.z) < 0.01) continue;      // skip degenerate (< 10 mm) edge
        out.push({ start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
    }
    return out;
}

// ── §OFFICE-PERIMETER-COARSEN (founder 2026-06-30: "too many elements — always stuck on
// creation") — the orchestrator's circular footprint is a fine n-gon (≈64 sides). At 40
// storeys that is ≈2560 perimeter wall segments + as many glazing windows — the dominant
// creation cost. The curtain-wall primitive is STRAIGHT-segment only (no closed-loop element),
// so one glass element per segment can't beat one window per segment; the real lever is to
// emit the perimeter at a COARSER segment count. A 20–24-gon still reads as round at building
// scale but cuts the per-storey perimeter element count ~3×. The SAME coarsened ring is used
// for the slab so the slab edge stays aligned to the walls.
/** Max perimeter segments per storey (walls + windows). A 24-gon is visually round at
 *  building scale; capping here is the headline element-count reduction. */
export const MAX_PERIMETER_SEGMENTS = 24;

/** §OFFICE-PERIMETER-COARSEN — resample a closed ring polygon DOWN to at most `maxSegments`
 *  vertices by keeping every `stride`-th vertex (uniform decimation), preserving the closed
 *  loop + winding. A ring already at/under the cap is returned unchanged. Non-finite vertices
 *  are dropped. Pure + deterministic. */
export function resampleRing(poly: readonly unknown[], maxSegments = MAX_PERIMETER_SEGMENTS): PlanPt[] {
    const pts = poly.filter(isFinitePlanPt) as PlanPt[];
    const n = pts.length;
    if (n <= maxSegments || maxSegments < 3) return pts;
    const stride = Math.ceil(n / maxSegments);
    const out: PlanPt[] = [];
    for (let i = 0; i < n; i += stride) out.push(pts[i]!);
    // Guard: decimation must still leave a real polygon.
    return out.length >= 3 ? out : pts;
}

/** §OFFICE-PERIMETER-GLAZING — given a perimeter segment length + the storey floor-to-floor
 *  height, return the near-full-width, near-full-height window placement (centred, with a
 *  corner jamb at each end and a sill near the floor / head near the slab), or `null` when
 *  the segment is too short to host a sensible pane. Pure + deterministic. */
export function perimeterGlazingSpec(
    segLenM: number,
    floorToFloorM: number,
): GlazingPlacement | null {
    if (!Number.isFinite(segLenM) || segLenM <= 0) return null;
    if (!Number.isFinite(floorToFloorM) || floorToFloorM <= 0) return null;
    // Corner jamb: 7.5% of the segment, clamped to [0.15, 0.30] m, but never so large that the
    // clear width collapses below the minimum (shrink the jamb on a short wall).
    const maxAffordableJamb = Math.max(0, (segLenM - GLAZING_MIN_WIDTH_M) / 2);
    const jamb = Math.min(
        maxAffordableJamb,
        Math.min(GLAZING_JAMB_MAX_M, Math.max(GLAZING_JAMB_MIN_M, GLAZING_JAMB_FRACTION * segLenM)),
    );
    const width = segLenM - 2 * jamb;
    if (!(width >= GLAZING_MIN_WIDTH_M)) return null;          // too short for a curtain pane
    const offset = jamb;                                       // centred (equal jamb both ends)
    // Near floor-to-slab height: sill low, head a small header below the slab soffit.
    const sillHeight = GLAZING_SILL_M;
    const height = Math.max(0.5, floorToFloorM - GLAZING_HEADER_M - sillHeight);
    return { offset, width, sillHeight, height };
}
