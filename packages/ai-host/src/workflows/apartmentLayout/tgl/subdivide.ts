// TGL P3b — subdivision: rooms → footprints.
//
// Packs the bubble-graph rooms into the shell's decomposition rects (P1) and
// squarifies (P3a) each rect's share, so every room gets exactly one axis-aligned
// footprint that lies inside the real shell — never a thin full-depth strip and
// never floating through an L-shape notch.
//
// Allocation is deterministic and public-first: rects are taken largest-first and
// rooms are streamed in bubble-graph order (hall/living/kitchen → corridor →
// private), so public space lands in the biggest rect near the entrance and the
// private zone flows into the smaller rects. squarify scales each rect's room set
// to fill that rect EXACTLY, so the footprints tile the shell (total area ≈ shell
// area) with no gaps or overlaps. Pure: imports only sibling TGL types.
//
// §SINGLE-RECT-CARVE (2026-05-28, architect feedback) — when the shell is a
// single rectangle AND the program has a corridor + ≥1 private room, the
// shell is PRE-CARVED into [public-zone | corridor strip 1.2 m | private-zone]
// before squarify runs. The corridor is forced to its real-architectural shape
// (a 1.0–1.4 m wide strip running the long axis of the shell) and every
// private room ends up sharing a wall with it. PLUS, when the program also
// has a master + ensuite, the ensuite is CARVED FROM INSIDE the master's
// squarified rect after subdivision, so the master/ensuite door (the only
// permitted access to the ensuite) ALWAYS lands on a real shared wall.
//
// Coordinates: metres, plan frame { x, z }. Rounded to 1e-6 at the boundary (§6).

import type { BubbleGraph, ProgramRoom } from './bubbleGraph.js';
import type { RoomType } from '../types.js';
import { rectArea, subtractRectsFromRects, mergeHorizontally, clampRectToConvexShell, type Rect, type Pt } from './rectDecomposition.js';
import { squarify } from './squarify.js';
import { roomRule, preferenceBetween } from '../rules/programRules.js';
import { dimensionsFor } from '../dimensions/roomDimensions.js';
import { subdivideViaSpine } from './subdivideViaSpine.js';   // §SPINE-FIRST P4 (flag-gated)
import type { SpinePackResult } from './packRoomsAlongSpine.js';   // §SINGLE-LOAD-PERIPHERAL guard typing

/** A room's realised footprint inside the shell. */
export interface RoomPlacement {
    readonly roomId: string;
    readonly rect: Rect;
}

/**
 * §POLYGON-NATIVE-SEAM (Phase 1, doc §13.4) — a room's realised footprint as an
 * arbitrary simple polygon. A strict superset of {@link RoomPlacement}: today every
 * cell is a lifted rect (its polygon is exactly `rectPolygon(rect)`), so the rect path
 * and the cell path produce byte-identical geometry. Phase 3+ will mint non-rect
 * polygons here for sheared / concave plates. The polygon vertex order is the SAME as
 * the legacy `rectPolygon` in `semanticGraph.ts` so areas/centroids are unchanged. */
export interface RoomCell {
    readonly roomId: string;
    readonly polygon: readonly Pt[];
}

/**
 * Rectangle → CCW-from-origin polygon, vertex order
 * `[(x0,z0), (x1,z0), (x1,z1), (x0,z1)]` — IDENTICAL to the legacy `rectPolygon`
 * helper in `semanticGraph.ts`, so a lifted cell's polygon/area/centroid match the
 * pre-seam rect output bit-for-bit (doc §13.5 invariant 8). Single source of truth
 * for the rect→polygon lift. */
export function rectPolygon(r: Rect): Pt[] {
    return [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];
}

/**
 * §POLYGON-NATIVE-SEAM (Phase 1) — lift a rect {@link RoomPlacement} to a
 * {@link RoomCell} using the canonical {@link rectPolygon} order. Pure; no rounding
 * (the rect coords are already `round6`-clean from `roundRect`). The cell is a strict
 * superset of the placement, so downstream code that reads `polygon` gets the exact
 * polygon the legacy `rectPolygon(p.rect)` produced. */
export function cellFromRect(p: RoomPlacement): RoomCell {
    return { roomId: p.roomId, polygon: rectPolygon(p.rect) };
}

/**
 * §POLYGON-NATIVE-SEAM (Phase 1) — area (m²) of a cell polygon. For the lifted-rect
 * case (every cell today) this returns EXACTLY `rectArea(rect)`: it is the product of
 * the polygon's bbox extents, which for an axis-aligned rectangle equals `(x1−x0)·(z1−z0)`
 * to the last bit — UNLIKE a raw shoelace accumulation, whose differing operation order
 * drifts by ~1e-6 on some coordinates and would break the byte-identity gate. A genuine
 * non-axis-aligned polygon (Phase 3+) falls back to the shoelace value. Pure.
 *
 * §POLYGON-CORRIDOR-LEG (2026-06-17) — the bbox-extent fast path is taken ONLY for a 4-vertex
 * polygon (a true axis-aligned RECTANGLE: bbox area == filled area to the last bit, which is the
 * byte-identity guarantee the lifted-rect path needs). An axis-aligned polygon with MORE than 4
 * vertices may be CONCAVE — e.g. the L-shaped corridor cell `legUnionLRing` emits — whose bbox
 * OVERSTATES its filled area; those fall through to the shoelace, which is exact for any simple
 * polygon. The 4-vertex rect path is unchanged, so every lifted-rect cell is still byte-identical. */
export function cellAreaM2(poly: readonly Pt[]): number {
    if (poly.length === 0) return 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let axisAligned = true;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    // Axis-aligned iff every edge is horizontal or vertical.
    for (let i = 0; i < poly.length && axisAligned; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        if (Math.abs(a.x - b.x) > 1e-9 && Math.abs(a.z - b.z) > 1e-9) axisAligned = false;
    }
    // ONLY a 4-vertex axis-aligned polygon is guaranteed CONVEX (a rectangle) ⇒ bbox == filled area.
    // A concave axis-aligned L (≥6 vtx, the corridor-leg cell) must use the shoelace, which is exact.
    if (axisAligned && poly.length === 4) return Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
    // General simple polygon — shoelace (Phase 3+ non-rect cells + the L-shaped corridor leg).
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/**
 * §FEASIBILITY-ALLOC (A.21.D5, 2026-06-06) — a room the subdivider could NOT
 * place at or above its per-type minimum short side, even after the area-
 * rebalance retry stole slack from over-allocated neighbours. Surfaced
 * structurally so the engine NEVER silently drops a requested room — the
 * trigger/modal can report "you asked for N bedrooms, M fit on this plot".
 */
export interface DroppedRoom {
    readonly roomId: string;
    readonly type: RoomType;
    /** The short side (m) the room WOULD have had at its squarified rect. */
    readonly shortSideM: number;
    /** The per-type architectural floor (m) it failed to clear. */
    readonly minShortSideM: number;
}

/** §FEASIBILITY-ALLOC — subdivide result with the structured drop report. */
export interface SubdivideResult {
    readonly placements: readonly RoomPlacement[];
    /** Rooms that could not be placed at their min short side (empty in the
     *  common case). Deterministic — in drop order (lowest priority first). */
    readonly droppedRooms: readonly DroppedRoom[];
    /** §POLYGON-CARVE (founder §CIRCULATION-GRAPH polygon-native rework, phase 1, 2026-06-17) —
     *  OPTIONAL per-room non-rectangular cell polygons (plate-local frame, same as `placements`).
     *  A carve that needs a room to be NON-rectangular — e.g. an L-shaped corridor that threads a
     *  fragmented plate to reach the stair AND serve rooms in two arms — supplies the room's real
     *  polygon here while still emitting a representative rect in `placements` (so the area/min/
     *  overlap gates keep working). Absent ⇒ every cell is its lifted rect (byte-identical to the
     *  pre-rework path). enumerate folds this into `cellPolygonById`, which wallsAndDoors +
     *  semanticGraph already consume for the wall sweep + room geometry. */
    readonly cellPolygonById?: ReadonlyMap<string, readonly Pt[]>;
    /** §SPINE-FIRST P4/P6 — true when this result came from the circulation-first spine path (so
     *  enumerate skips the §POLYGON-NATIVE-ROUTE re-tiling and renders THESE shell-clamped cells). */
    readonly spineFirstApplied?: boolean;
}

/**
 * §L4-δ-1b — CONSTRUCTIVE AlignmentField pre-subdivide axis-line snap.
 *
 * Opt-in (default ON) post-pass that runs after the squarified subdivision
 * converges. Collects every room-rect edge on each axis, clusters edges that
 * are within ALIGNMENT_SNAP_EPS_M of one another, and snaps every member of a
 * cluster to the cluster's MEAN coord. The result: layouts ARRIVE pre-aligned
 * (room edges share axis lines by construction) instead of being scored by the
 * existing SCORING-form `alignmentField` axis after the fact.
 *
 * The 50 mm tolerance mirrors `objectives.ts`'s alignmentField bucket width
 * so a layout that passes the snap is guaranteed to maximise the scoring axis.
 *
 * Pure — no I/O, no THREE, no DOM. Metres throughout.
 */
export interface SubdivideOptions {
    /** Default true. Set false to preserve raw squarified output (scoring-form
     *  alignmentField will then evaluate the un-snapped layout, as before). */
    readonly alignmentSnap?: boolean;
    /** A.25.3 — corridor strip clear-width (metres) for the §SINGLE-RECT-CARVE
     *  flow. Absent ⇒ the built-in `CORRIDOR_STRIP_WIDTH_M` (1.2 m). The
     *  accessibility slider raises it (wider, step-free corridors). Clamped to a
     *  sane band. Neutral 1.2 m is byte-identical to the legacy carve. */
    readonly corridorWidthM?: number;
    /**
     * §STAIR-OBSTACLE-CARVE (2026-06-08) — set true by `enumerate.ts` when the rect
     * set is the result of carving a stair-core keep-out out of the plate (a multi-
     * storey HOUSE). A keep-out turns the single plate into a FRAME / L of 2–4 sub-
     * rects, which the generic multi-rect path packs INDEPENDENTLY per rect — so no
     * corridor spine links the rooms across the hole and the plan ships as a merged
     * blob with a §CIRCULATION-REROUTE compromise (the founder's central-stair
     * defect). When this flag is set AND one sub-rect dominates the plate, the
     * subdivider runs the §SINGLE-RECT corridor carve on that DOMINANT rect with the
     * whole programme, so a real corridor encloses + links every room and the tiny
     * stair-clearance slivers are left empty (correct — they ARE the landing zone).
     * Absent / false ⇒ the generic multi-rect path (apartment + L/U/T shells
     * unchanged). */
    readonly stairCarved?: boolean;
    /**
     * §STAIR-CIRC-FACE (founder defect, 2026-06-11) — the stair-core keep-out rect(s)
     * in the SAME frame as `rects` (the strategy frame `enumerate.ts` subdivides in,
     * already inflated by KEEPOUT_MARGIN_M). Used ONLY to orient the carve so the
     * minted corridor/landing SHARES A WALL with the stair keep-out: a multi-storey
     * UPPER storey carves its corridor against one face of the buildable plate, but the
     * stair sits OUTSIDE that plate on whichever edge the keep-out was subtracted from —
     * if that is the OPPOSITE edge the corridor never reaches the stair, so the stair's
     * only door lands on the bedroom that wraps it (the founder's "stair served through
     * Bedroom 3"). The §STAIR-CIRC-FACE post-pass reflects the carved placements within
     * their own bbox to bring the corridor face to the keep-out edge — area/shape-
     * preserving, so no room changes size and nothing is dropped. Absent / empty ⇒ the
     * pass is a no-op (apartment + every keep-out-free path byte-identical, ADR-0061). */
    readonly keepOutRects?: readonly Rect[];
    /**
     * §ENTRANCE-HALL-ON-SHELL (tracker §57.4, 2026-06-11) — set true by `enumerate.ts`
     * when the shell was RECTIFIED (a sheared/skewed convex quad tiled in its bounding
     * box, then projected back to the real ring). On such a plate the §ENTRANCE-HALL-ON-
     * SHELL hall-slice is SUPPRESSED: the slice reshapes the public-zone squarify, and on
     * a sheared ring the re-squarified `others` partition can leave an interior endpoint a
     * few cm shy of the projected perimeter (the §RECTIFY-SHELL-PROJECT invariant only
     * snaps bbox-EDGE endpoints). The founder's hall-centred defect is a RECTILINEAR-plate
     * case (rectangle / L / U / T — never rectified), where the slice's outer endpoint
     * lands EXACTLY on the perimeter, so suppressing it on rectified quads loses nothing.
     * Absent / false ⇒ the hall-slice runs (the common axis-aligned case). */
    readonly shellRectified?: boolean;
    /**
     * §POLYGON-CORRIDOR-REACH-GATE (regression-stabilise, 2026-06-18) — opt-in
     * (default FALSE). When true, the §POLYGON-CORRIDOR-LEG / §POLYGON-CORRIDOR-ARM
     * post-passes may union the corridor into an L/T/U polygon that threads empty
     * space to the stair / far-arm rooms. Those non-rect cells route through the
     * polygon wall sweep and were observed to emit OVERLAPPING / duplicate interior
     * walls where the corridor polygon shares an edge with an adjacent room rect
     * (the founder's "interior walls overlapping — way cleaner before" regression).
     * Until the polygon sweep de-dupes shared corridor↔room edges, the reach passes
     * are gated OFF so the corridor stays a clean RECT (the proven pre-2026-06-17
     * path) and the wall sweep keeps its axis-aligned fast path. Absent / false ⇒
     * byte-identical to the rect corridor. */
    readonly polygonCorridorReach?: boolean;
    /**
     * §SPINE-FIRST P4 (ADR-0073 HAG, founder "must work for ANY layout", 2026-06-21) — opt-in
     * (default FALSE = byte-identical). When true AND the storey has NO public rooms (an upper /
     * all-private floor, per the locked "hall for public, spine for private" doctrine), the carve is
     * REPLACED by the circulation-FIRST path: derive the corridor spine from the footprint
     * (`deriveCorridorSpine`) and pack the private rooms off it (`packRoomsAlongSpine`) so every room
     * AND the stair sit on a central corridor BY CONSTRUCTION. Proven 100% I1+I2-sound vs the area-
     * first 53% on the robustness sweep. Falls through to the legacy carve on any miss (public rooms
     * present, degenerate shell, or a drop), so it is strictly additive. The browser sets this from
     * `window.__pryzmSpineFirst` at the house-generate call site for opt-in testing. */
    readonly spineFirst?: boolean;
    /**
     * §SPINE-FIRST P6 (skew-clip, 2026-06-21) — the REAL shell polygon in THIS strategy's frame
     * (the same `polyT` enumerate tiles). When `spineFirst` produces a layout, its axis-aligned bands
     * are CLAMPED to this polygon (`clampRectToConvexShell`) so the cells follow a sheared/convex
     * façade instead of overflowing the bbox — making spine-first render-correct on the skewed
     * GIS-boundary plates the founder draws. Absent ⇒ no clamp (axis-aligned plate = bbox = shell). */
    readonly shellPolygon?: readonly Pt[];
    /**
     * §18 slice 4 (L/T/U corridor spine, 2026-06-22) — opt-in (default false). When true AND spineFirst,
     * the §SPINE-TREE path runs FIRST (before the rect-gated spine-first + legacy carve): it packs rooms
     * off EVERY corridor segment (run + legs) via `packRoomsAlongSpineTree`, clips room cells to the real
     * shell (sheared GIS quads OK — no rect gate), and zones PUBLIC/PRIVATE across the run on a mixed
     * (ground) floor. The browser sets it from `window.__pryzmSpineTree` (via enumerate). Any miss (no
     * corridor / a drop) falls through to the existing paths ⇒ strictly additive (ADR-0061). */
    readonly spineTree?: boolean;
}

/** Axis-line snap tolerance (m). Matches the EPS_M used by the SCORING
 *  alignmentField axis in `objectives.ts` so the constructive form lands every
 *  edge inside a scoring bucket. */
const ALIGNMENT_SNAP_EPS_M = 0.05;

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const roundRect = (r: Rect): Rect => ({ x0: round6(r.x0), z0: round6(r.z0), x1: round6(r.x1), z1: round6(r.z1) });

/** Largest-first, with a stable tie-break by position (no Map/Set order — §6). */
function byAreaDesc(a: Rect, b: Rect): number {
    return rectArea(b) - rectArea(a) || a.x0 - b.x0 || a.z0 - b.z0;
}

/** §HARD-MIN-SIDE-PER-ROOM (2026-05-28, updated): no D-TGL room may be created
 *  with a SHORT-SIDE smaller than its own architectural minimum
 *  (`minShortSideM` in programRules.ts — e.g. kitchen-galley 1.8 m, corridor
 *  1.0 m, bedroom 2.6 m). The previous uniform 2 m floor was too aggressive
 *  for narrow service rooms — it dropped the kitchen entirely when the
 *  squarified rect came in just under 2 m, and made a real-corridor strip
 *  (1.0–1.4 m × longer) impossible. Rooms below their own floor are dropped
 *  (their bubble-graph node remains but has no rect — downstream walls/doors
 *  skip cleanly via `sharedWallByPair.get(...)` returning undefined). */

const ABSOLUTE_MIN_SHORT_SIDE_M = 0.9;  // sanity floor: a room narrower than this is unusable.

/** §SINGLE-RECT-CARVE: the corridor strip's width when carved as a dedicated
 *  zone. 1.2 m sits in the centre of the architect-mandated 1.0–1.4 m range
 *  (corridor.minShortSideM = 1.0 m; UK HQI recommends 1.2 m). */
const CORRIDOR_STRIP_WIDTH_M = 1.2;

/** §MASTER-SURPLUS (2026-06-08, layout-quality fix-pass F3) — the master bedroom
 *  must read as visibly larger than every other bedroom. The squarifier biases the
 *  master via its 1.3 areaWeight, but the §AREA-FRACTIONS clamps (master ≤ 20 %,
 *  bedroom ≤ 16 %) let a master come out the SAME size as a secondary bedroom on a
 *  small plate (the founder's "master is no bigger than the spare room" defect). This
 *  is the minimum AREA (m²) the master must exceed the largest non-master bedroom by.
 *  Enforced by transferring area target from the largest bedroom to the master before
 *  squarify (donor = lowest-priority bedroom, beneficiary = master — never a drop). */
const MIN_MASTER_SURPLUS_M2 = 2.0;

/** §COMB-DEPTH-GATE (A.21.D61, 2026-06-09) — max private-zone DEPTH (m) for the
 *  §EVERY-ROOM-ACCESS-COMB. A single-loaded comb slices rooms full-depth; past this
 *  depth a small wet room's full-depth slice over-sizes it (bathroom > its 28 m²
 *  no-blob cap on a large house plate). 6.8 m keeps a normal apartment / typical-
 *  house private zone (depth ≈ 4–6 m) on the comb while large deep plates fall back
 *  to the squarified treemap. */
const MAX_COMB_DEPTH_M = 6.8;

function shortSideM(r: Rect): number {
    return Math.min(r.x1 - r.x0, r.z1 - r.z0);
}

/** Per-type architectural short-side floor (m), clamped to the absolute floor. */
function floorFor(type: RoomType): number {
    return Math.max(ABSOLUTE_MIN_SHORT_SIDE_M, roomRule(type).minShortSideM || ABSOLUTE_MIN_SHORT_SIDE_M);
}

/** §FEASIBILITY-ALLOC — the area below which a room's own architectural minimum
 *  area floor must not fall. Used by the rebalance pass as the lower bound when
 *  stealing slack from an over-allocated neighbour. */
function minAreaFor(type: RoomType): number {
    const rule = roomRule(type);
    // The room must at minimum afford a square at its short-side floor; also
    // respect its declared minAreaM2. Never below the absolute square.
    const floor = floorFor(type);
    return Math.max(rule.minAreaM2 || 0, floor * floor);
}

/**
 * §FEASIBILITY-FIRST (A.21.D36, 2026-06-07) — drop-priority RANK for a room type.
 * When the SUM of every room's minimum area genuinely exceeds the rect (real
 * over-program), the LOWEST-priority room is dropped first. Lower rank = dropped
 * SOONER; higher rank = protected. We never drop a bathroom/bedroom before a
 * lower-value service/secondary room.
 *
 * The order encodes architectural importance (founder rule: "drop the lowest-
 * priority room, NOT a bathroom"):
 *   living / kitchen / master / bathroom  — core programme, protected (high rank)
 *   bedroom                               — habitable, protected
 *   corridor / hall                       — circulation (cut only with the
 *                                           private rooms it serves)
 *   dining / study                        — desirable but optional
 *   ensuite / wc / utility                — the first to go on a tight plate
 *
 * Pure data lookup — deterministic. */
const DROP_PRIORITY_RANK: Readonly<Record<RoomType, number>> = {
    // §STAIR-ROOM-TYPE (ADR-0063) — the stair is a FIXED keep-out obstacle, never a
    // subdividable room, so it is never in the pool this rank drops from. It still
    // needs a value for the exhaustive Record; rank it ABOVE everything (it is the
    // single non-negotiable element — a multi-storey house without its stair is
    // unbuildable) so even a hypothetical drop pass would protect it first.
    stair: 110,
    living: 100,
    // §NEW-ROOM-TYPES (2026-06-12, queue #1) — the fused great room ranks with the
    // social cluster it subsumes (protected — never the first to drop on a tight plate).
    open_plan: 100,
    kitchen: 95,
    master: 90,
    bathroom: 85,
    bedroom: 80,
    corridor: 70,
    hall: 65,
    dining: 50,
    study: 45,
    ensuite: 30,
    wc: 25,
    utility: 20,
    // Balcony + storage are the lowest-priority OPT-IN extras — the first to go
    // when the plate can't hold every requested room at its minimum.
    balcony: 15,
    storage: 10,
};
function dropRankFor(type: RoomType): number {
    return DROP_PRIORITY_RANK[type] ?? 40;
}

/**
 * §FEASIBILITY-ALLOC (A.21.D5, 2026-06-06) — squarify a room set into one rect →
 * footprints (rounded). The previous behaviour DROPPED the lowest-priority room
 * the instant any placement came in below its per-type short-side floor — which
 * silently lost a USER-REQUESTED bedroom on a tight plot. The new behaviour is
 * feasibility-aware:
 *
 *   1. Squarify the current pool at proportional area targets.
 *   2. If every placement clears its floor → done.
 *   3. Otherwise REBALANCE: grow each too-narrow room's area target (so the
 *      squarifier gives it a wider cell) by stealing slack from rooms that sit
 *      ABOVE their own minimum area, then re-squarify. This honours the
 *      requested room COUNT by shrinking over-allocated rooms instead of
 *      dropping anyone. Bounded iterations (no RNG — deterministic).
 *   4. Only when rebalancing genuinely cannot make a room fit (the rect can't
 *      hold every room at its minimum) do we drop the LOWEST-PRIORITY room (the
 *      last entry — allocationOrder is public-first/private-last) and record it
 *      in `droppedRooms` so the caller can REPORT it. Never a silent drop.
 *
 * Empty `rooms[]` → empty result.
 */
function placeInRectReported(rect: Rect, rooms: readonly ProgramRoom[]): SubdivideResult {
    const rectArea_ = Math.max(EPS, rectArea(rect));
    const droppedRooms: DroppedRoom[] = [];

    const squarifyPool = (
        cur: ReadonlyArray<{ room: ProgramRoom; area: number }>,
    ): { placements: RoomPlacement[]; byId: Map<string, RoomPlacement> } => {
        const placements = squarify(rect, cur.map(e => ({ id: e.room.id, area: e.area })))
            .map(p => ({ roomId: p.id, rect: roundRect(p.rect) }));
        return { placements, byId: new Map(placements.map(p => [p.roomId, p])) };
    };

    /**
     * §FEASIBILITY-FIRST (A.21.D36) — try to place EVERY room in `current` at or
     * above its per-type minimum short side by re-allocating area (no drop). The
     * area allocation is seeded so each room gets AT LEAST its minimum area and
     * the leftover (`rectArea − Σ minArea`) is distributed proportionally to the
     * rooms' original targets. Then a bounded rebalance loop grows any room whose
     * squarified CELL still comes in under its floor — financed by shrinking
     * rooms that sit above their own minimum. Returns the placement set when ALL
     * rooms clear their floor, or `null` when the rebalance cannot make them fit
     * (the caller then drops the lowest-priority room and retries).
     */
    const runRebalance = (
        seed: ReadonlyArray<{ room: ProgramRoom; area: number }>,
        current: readonly ProgramRoom[],
    ): { placements: RoomPlacement[]; byId: Map<string, RoomPlacement> } | null => {
        const pool = seed.map(e => ({ room: e.room, area: e.area }));
        const MAX_REBALANCE = current.length * 3 + 4;       // deterministic upper bound
        let placements: RoomPlacement[] = [];
        let byId = new Map<string, RoomPlacement>();
        for (let iter = 0; iter <= MAX_REBALANCE; iter++) {
            ({ placements, byId } = squarifyPool(pool));
            const needers = pool.filter(e => {
                const p = byId.get(e.room.id);
                return p && shortSideM(p.rect) < floorFor(e.room.type) - EPS;
            });
            if (needers.length === 0) return { placements, byId };   // all clear → done
            if (iter === MAX_REBALANCE) return null;                  // can't fit → drop

            // Required extra area for a needer so its scaled cell clears its
            // floor short side. A square (floor²) UNDER-estimates the area when
            // the rect is shallow: squarify may lay the room as a full-depth
            // strip whose depth = the rect's SHORT dimension, so a floor² square
            // still comes out too thin. Target instead the area of a cell that is
            // `floor` wide × the rect's short dimension deep — the worst-case
            // strip orientation — so the room clears its floor however squarify
            // slices it. The squarifier scales area→rect by the rect/pool ratio,
            // so convert that scaled target back to pool units.
            const poolAreaSum = pool.reduce((s, e) => s + e.area, 0) || EPS;
            const scale = rectArea_ / poolAreaSum;
            const rectShortDim = Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0);
            let deficitTotal = 0;
            const wantById = new Map<string, number>();
            for (const e of needers) {
                const f = floorFor(e.room.type);
                // floor × min(rectShortDim, larger-of-floor-and-current-depth): a
                // strip `f` wide spanning the rect's short axis clears `f`. Clamp
                // the depth to ≥ f so we never ask for LESS than the square.
                const depth = Math.max(f, rectShortDim);
                const wantScaled = f * depth;                        // m² in the rect
                const wantUnscaled = wantScaled / scale;             // pool units
                const extra = Math.max(0, wantUnscaled - e.area);
                if (extra > EPS) { wantById.set(e.room.id, extra); deficitTotal += extra; }
            }
            if (deficitTotal <= EPS) return null;                    // nothing actionable

            // Donors: rooms above their own min area (in pool units).
            const donors = pool
                .filter(e => !wantById.has(e.room.id))
                .map(e => {
                    const minA = minAreaFor(e.room.type) / scale;
                    return { e, surplus: Math.max(0, e.area - minA) };
                })
                .filter(d => d.surplus > EPS);
            const surplusTotal = donors.reduce((s, d) => s + d.surplus, 0);
            if (surplusTotal <= EPS) return null;                    // no slack → drop

            const take = Math.min(deficitTotal, surplusTotal);
            for (const d of donors) d.e.area -= take * (d.surplus / surplusTotal);
            for (const e of needers) {
                const extra = wantById.get(e.room.id) ?? 0;
                if (extra > EPS) e.area += take * (extra / deficitTotal);
            }
        }
        return null;
    };

    /**
     * §FEASIBILITY-FIRST (A.21.D36) — try to place EVERY room at or above its
     * per-type minimum short side by re-allocating area (no drop). Returns the
     * placement set when all rooms clear their floor, or null when no seeding +
     * rebalance can make them fit (caller drops the lowest-priority room).
     *
     * Two deterministic seedings are tried in order, taking the first that fully
     * fits:
     *   1. PROPORTIONAL — each room's bubble-graph target area. This is the
     *      original allocation; on a comfortable plot it both fits AND gives the
     *      best squarify geometry, so the no-drop common case is preserved
     *      bit-for-bit.
     *   2. MIN-FIRST — each room seeded at its minimum area plus a proportional
     *      share of the rect's leftover. This min-respecting start lets a small-
     *      SHARE room keep its floor on a tight plate the proportional split would
     *      have starved — the founder's "stop dropping rooms" case.
     * The rebalance loop runs on each seeding; only when BOTH fail to fit every
     * room does the caller treat it as genuine over-program and drop.
     */
    const tryFitAll = (
        current: readonly ProgramRoom[],
    ): { placements: RoomPlacement[]; byId: Map<string, RoomPlacement> } | null => {
        const proportional = current.map(r => ({ room: r, area: Math.max(EPS, r.targetAreaM2) }));
        const fitProp = runRebalance(proportional, current);
        if (fitProp) return fitProp;

        const minTotal = current.reduce((s, r) => s + minAreaFor(r.type), 0);
        const targetTotal = current.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0) || EPS;
        const leftover = Math.max(0, rectArea_ - minTotal);
        const minFirst = current.map(r => ({
            room: r,
            area: minAreaFor(r.type) + leftover * (Math.max(EPS, r.targetAreaM2) / targetTotal),
        }));
        return runRebalance(minFirst, current);
    };

    // ── Feasibility-first allocation loop. Drop ONLY as a last resort. ────────
    // Working set in allocation order (public-first / private-last). On each
    // pass we try to fit EVERY remaining room; if we can't, we drop the single
    // lowest-priority room (by drop-rank, then allocation order as a tie-break)
    // and retry — so a normal plot keeps its full programme and only a genuine
    // over-program loses the least-important room (never a bathroom/bedroom
    // before a wc/utility/ensuite).
    let working = rooms.slice();
    while (working.length > 0) {
        const fit = tryFitAll(working);
        if (fit) return { placements: fit.placements, droppedRooms };

        // Could not fit every room at its minimum — REAL over-program for this
        // rect. Drop the lowest-priority room: lowest drop-rank wins, ties broken
        // by LATER allocation order (private-last) so the choice is deterministic.
        let dropIdx = 0;
        for (let i = 1; i < working.length; i++) {
            const a = working[i]!, b = working[dropIdx]!;
            const ra = dropRankFor(a.type), rb = dropRankFor(b.type);
            if (ra < rb || (ra === rb && i > dropIdx)) dropIdx = i;
        }
        const dropped = working[dropIdx]!;
        droppedRooms.push({
            roomId: dropped.id,
            type: dropped.type,
            shortSideM: 0,
            minShortSideM: floorFor(dropped.type),
        });
        const minTotal = working.reduce((s, r) => s + minAreaFor(r.type), 0);
        console.warn(
            `[D-TGL subdivide] §FEASIBILITY-ALLOC: rect area ${rectArea_.toFixed(2)} m² ` +
            `< Σ per-type minimum areas ${minTotal.toFixed(2)} m² for ${working.length} room(s) — ` +
            `genuine over-program. Dropping the LOWEST-PRIORITY room "${dropped.id}" ` +
            `(${dropped.type}, drop-rank ${dropRankFor(dropped.type)}) and re-fitting the rest ` +
            `(reported via droppedRooms — NOT silent; never a bathroom/bedroom before a ` +
            `lower-priority service room).`,
        );
        working = working.filter((_, i) => i !== dropIdx);
    }
    return { placements: [], droppedRooms };
}

/**
 * Reorder rooms for rect allocation so the **two largest rooms** (Living + Master)
 * land at the front and get the best aspect from squarify, then other public rooms
 * before the private ones. Without hoisting Master the squarifier leaves it a thin
 * leftover strip when there are many small rooms — the user's "Master Bedroom is a
 * corridor-shape strip" defect. Within each privacy class the input order is
 * preserved (stable), so the P8 enumerate `rev` strategy still produces secondary
 * variety. Privacy is read from the rules database (SPEC-ARCHITECTURAL-PROGRAM-RULES).
 */
export function allocationOrder(rooms: readonly ProgramRoom[]): ProgramRoom[] {
    const living = rooms.find(r => r.type === 'living');
    const master = rooms.find(r => r.type === 'master');
    const hoisted = [living, master].filter((r): r is ProgramRoom => r !== undefined);
    const hoistedSet = new Set(hoisted);
    const rest = rooms.filter(r => !hoistedSet.has(r));
    const rank = (r: ProgramRoom): number => {
        const p = roomRule(r.type).privacy;
        return p === 'public' ? 0 : p === 'circulation' ? 1 : p === 'private' ? 2 : 3;
    };
    // Stable sort by privacy rank.
    const tagged = rest.map((r, i) => ({ r, i }));
    tagged.sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i);
    const sorted = tagged.map(t => t.r);
    return [...hoisted, ...sorted];
}

/**
 * §ADJACENCY-SORT (2026-06-08, Phase 4) — reorder `rooms` within a zone so rooms
 * connected by HIGH-preference adjacencies land consecutively. squarify packs
 * consecutive rooms into the same strip/row, so adjacency-sorted rooms tend to land
 * spatially adjacent (kitchen next to dining, master next to the wall its en-suite is
 * carved from, bedrooms clustered off the corridor face). This converts the type-level
 * adjacency PREFERENCE (programRules) from a post-hoc SCORING input into a pre-hoc
 * PLACEMENT constraint — the missing link the A.27 spec's Cause-1 analysis identifies.
 *
 * Algorithm (greedy nearest-neighbour by adjacency weight):
 *   1. weight w(a,b) = preferenceBetween(a.type, b.type) — type-based (programRules);
 *      no bubble-edge object is needed, so the function stays a pure list transform.
 *   2. Seed with the room of highest TOTAL weight to all others in the zone.
 *   3. Greedily append the unplaced room with the highest weight to the LAST placed.
 *   4. Ties broken by lowest INPUT INDEX (stable) — NOT room id. The A.27 spec wrote
 *      "lowest room id", but the zone lists arrive from `allocationOrder` (which hoists
 *      living/master), so they are NOT id-sorted; an index tie-break is the only rule
 *      that satisfies the spec's §4c INVARIANT below.
 *
 * INVARIANT (§4c, unit-tested): when every pair-weight in the zone is equal (e.g. a
 * zone whose rooms declare no preferences → all 1.0, or all 0.0), the seed and every
 * greedy pick are decided purely by the input-index tie-break, so the output EQUALS the
 * input order → byte-identical to the pre-Phase-4 `allocationOrder` placement.
 *
 * Pure + deterministic; does not mutate inputs.
 */
export function adjacencySortForZone(rooms: readonly ProgramRoom[]): ProgramRoom[] {
    if (rooms.length <= 2) return rooms.slice();
    const w = (a: ProgramRoom, b: ProgramRoom): number => preferenceBetween(a.type, b.type);
    const remaining = rooms.map((room, idx) => ({ room, idx }));
    // Seed: highest total adjacency weight to all others; tie → lowest input index.
    let seedPos = 0, seedScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
        let tot = 0;
        for (let j = 0; j < remaining.length; j++) if (i !== j) tot += w(remaining[i]!.room, remaining[j]!.room);
        if (tot > seedScore + EPS || (Math.abs(tot - seedScore) <= EPS && remaining[i]!.idx < remaining[seedPos]!.idx)) {
            seedScore = tot; seedPos = i;
        }
    }
    const out = [remaining.splice(seedPos, 1)[0]!];
    while (remaining.length > 0) {
        const last = out[out.length - 1]!.room;
        let bestPos = 0, bestW = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const wi = w(last, remaining[i]!.room);
            if (wi > bestW + EPS || (Math.abs(wi - bestW) <= EPS && remaining[i]!.idx < remaining[bestPos]!.idx)) {
                bestW = wi; bestPos = i;
            }
        }
        out.push(remaining.splice(bestPos, 1)[0]!);
    }
    return out.map(t => t.room);
}

// ── §SINGLE-RECT-CARVE: corridor strip + ensuite-from-master ─────────────────

interface CorridorCarve {
    readonly publicRect: Rect;
    readonly corridorRect: Rect;
    readonly privateRect: Rect;
    /** Orientation of the corridor strip. 'horizontal' ⇒ the strip runs the full
     *  WIDTH (x) and the public/private zones stack on z; the private zone abuts the
     *  corridor along its full x-edge, so a §EVERY-ROOM-ACCESS-COMB slices the private
     *  rooms along 'x'. 'vertical' ⇒ the strip runs the full HEIGHT (z); comb slices
     *  along 'z'. */
    readonly orientation: 'horizontal' | 'vertical';
}

/** Slice the shell into [public | 1.2 m corridor | private] along its LONGER
 *  axis. The corridor runs the full length of that axis so every private room
 *  can share a wall with it. Returns null when the short axis is too narrow
 *  for the strip + two usable zones either side (≥ 2 m each). */
function tryCarveCorridor(
    shell: Rect,
    publicAreaTarget: number,
    privateAreaTarget: number,
    // A.25.3 — corridor strip width (m). Defaults to the architect-mandated 1.2 m
    // so an absent/neutral accessibility slider is byte-identical to the legacy carve.
    corridorWidthM: number = CORRIDOR_STRIP_WIDTH_M,
): CorridorCarve | null {
    const W = shell.x1 - shell.x0;
    const H = shell.z1 - shell.z0;
    const orientation: 'horizontal' | 'vertical' = W >= H ? 'horizontal' : 'vertical';
    const shortDim = orientation === 'horizontal' ? H : W;
    const MIN_ZONE_DEPTH = 2.0;
    if (shortDim < corridorWidthM + 2 * MIN_ZONE_DEPTH - EPS) return null;

    const usable = shortDim - corridorWidthM;
    const denom = Math.max(EPS, publicAreaTarget + privateAreaTarget);
    let publicDepth = usable * (publicAreaTarget / denom);
    // Clamp so both zones keep a usable depth.
    publicDepth = Math.min(Math.max(publicDepth, MIN_ZONE_DEPTH), usable - MIN_ZONE_DEPTH);

    if (orientation === 'horizontal') {
        const zPubBottom = shell.z0 + publicDepth;
        const zCorBottom = zPubBottom + corridorWidthM;
        return {
            publicRect:   { x0: shell.x0, z0: shell.z0,    x1: shell.x1, z1: zPubBottom },
            corridorRect: { x0: shell.x0, z0: zPubBottom,  x1: shell.x1, z1: zCorBottom },
            privateRect:  { x0: shell.x0, z0: zCorBottom,  x1: shell.x1, z1: shell.z1 },
            orientation,
        };
    } else {
        const xPubRight = shell.x0 + publicDepth;
        const xCorRight = xPubRight + corridorWidthM;
        return {
            publicRect:   { x0: shell.x0,   z0: shell.z0, x1: xPubRight, z1: shell.z1 },
            corridorRect: { x0: xPubRight,  z0: shell.z0, x1: xCorRight, z1: shell.z1 },
            privateRect:  { x0: xCorRight,  z0: shell.z0, x1: shell.x1,  z1: shell.z1 },
            orientation,
        };
    }
}

/** §NO-PUBLIC-CARVE (founder defect, 2026-06-10) — a DOUBLE-LOADED corridor carve
 *  for a plate whose programme has a corridor + private rooms but NO public room
 *  (the canonical UPPER HOUSE STOREY: bedrooms + baths + a landing/corridor, no
 *  living/kitchen/dining). The 3-zone {@link tryCarveCorridor} hard-requires a
 *  public zone to sit opposite the private zone, so it never fired upstairs and the
 *  corridor was squarified as a treemap cell touching only the front-row master —
 *  every other bedroom/bath SEALED. This split runs the corridor strip down the
 *  MIDDLE of the plate (along its longer axis) with a private zone on EITHER side,
 *  so the private rooms can be combed off BOTH faces and EVERY one shares a wall
 *  with the corridor — and each side's depth is roughly HALVED, keeping the comb
 *  feasible on a deep upper plate (the §COMB-DEPTH-GATE). Returns null when the
 *  short axis can't host the strip + one usable zone each side. Pure + deterministic. */
interface DoubleLoadedCarve {
    readonly corridorRect: Rect;
    readonly sideARect: Rect;
    readonly sideBRect: Rect;
    /** Same meaning as CorridorCarve.orientation: 'horizontal' ⇒ the strip runs the
     *  full WIDTH (x), the two private zones stack on z and comb-slice along 'x'. */
    readonly orientation: 'horizontal' | 'vertical';
}

function tryCarveDoubleLoadedCorridor(
    shell: Rect,
    corridorWidthM: number = CORRIDOR_STRIP_WIDTH_M,
): DoubleLoadedCarve | null {
    const W = shell.x1 - shell.x0;
    const H = shell.z1 - shell.z0;
    // Run the corridor along the LONGER axis (a longer spine borders more rooms);
    // the SHORT axis is then split [private | corridor | private].
    const orientation: 'horizontal' | 'vertical' = W >= H ? 'horizontal' : 'vertical';
    const shortDim = orientation === 'horizontal' ? H : W;
    const MIN_ZONE_DEPTH = 2.0;
    // Need the strip + a usable private zone on BOTH sides.
    if (shortDim < corridorWidthM + 2 * MIN_ZONE_DEPTH - EPS) return null;
    const usable = shortDim - corridorWidthM;
    // Centre the strip so each side gets an equal (halved) depth — this keeps the
    // §EVERY-ROOM-ACCESS-COMB feasible on a deep plate.
    const sideADepth = usable / 2;

    if (orientation === 'horizontal') {
        const zA = shell.z0 + sideADepth;
        const zCor = zA + corridorWidthM;
        return {
            sideARect:    { x0: shell.x0, z0: shell.z0, x1: shell.x1, z1: zA },
            corridorRect: { x0: shell.x0, z0: zA,       x1: shell.x1, z1: zCor },
            sideBRect:    { x0: shell.x0, z0: zCor,     x1: shell.x1, z1: shell.z1 },
            orientation,
        };
    }
    const xA = shell.x0 + sideADepth;
    const xCor = xA + corridorWidthM;
    return {
        sideARect:    { x0: shell.x0, z0: shell.z0, x1: xA,        z1: shell.z1 },
        corridorRect: { x0: xA,       z0: shell.z0, x1: xCor,      z1: shell.z1 },
        sideBRect:    { x0: xCor,     z0: shell.z0, x1: shell.x1,  z1: shell.z1 },
        orientation,
    };
}

/** §NO-SEAL-SINGLE-LOAD (tracker §55, 2026-06-11) — a SINGLE-LOADED corridor carve:
 *  a corridor strip laid along ONE FACE of the plate (against the LONG edge) with the
 *  ENTIRE private zone on the other side, combed off the one corridor face as a single
 *  row. Used as the LAST-RESORT no-seal fallback when the preferred double-loaded carve
 *  (or the 3-zone comb) is infeasible: it needs only ONE usable private zone (not two
 *  halved ones), so it fits on a SHALLOW or stair-fragmented plate where the double-
 *  loaded split starves both sides. EVERY private room shares its short edge with the
 *  corridor strip → a guaranteed corridor-adjacent wall for its door → never sealed.
 *
 *  The strip runs along the LONGER axis (a longer spine borders more rooms); the
 *  corridor sits on the z0 (or x0) edge and the private zone fills the remaining depth.
 *  Returns null when the short axis can't host the strip + one usable zone. Pure. */
interface SingleLoadedCarve {
    readonly corridorRect: Rect;
    readonly privateRect: Rect;
    /** 'horizontal' ⇒ the strip runs the full WIDTH (x); the private zone stacks on z
     *  and the comb slices along 'x'. 'vertical' ⇒ strip full HEIGHT, slice along 'z'. */
    readonly orientation: 'horizontal' | 'vertical';
}

function tryCarveSingleLoadedCorridor(
    shell: Rect,
    corridorWidthM: number = CORRIDOR_STRIP_WIDTH_M,
): SingleLoadedCarve | null {
    const W = shell.x1 - shell.x0;
    const H = shell.z1 - shell.z0;
    const orientation: 'horizontal' | 'vertical' = W >= H ? 'horizontal' : 'vertical';
    const shortDim = orientation === 'horizontal' ? H : W;
    const MIN_ZONE_DEPTH = 2.0;
    // Need the strip + ONE usable private zone (vs the double-loaded TWO).
    if (shortDim < corridorWidthM + MIN_ZONE_DEPTH - EPS) return null;

    if (orientation === 'horizontal') {
        const zCor = shell.z0 + corridorWidthM;
        return {
            corridorRect: { x0: shell.x0, z0: shell.z0, x1: shell.x1, z1: zCor },
            privateRect:  { x0: shell.x0, z0: zCor,     x1: shell.x1, z1: shell.z1 },
            orientation,
        };
    }
    const xCor = shell.x0 + corridorWidthM;
    return {
        corridorRect: { x0: shell.x0, z0: shell.z0, x1: xCor,      z1: shell.z1 },
        privateRect:  { x0: xCor,     z0: shell.z0, x1: shell.x1,  z1: shell.z1 },
        orientation,
    };
}

/**
 * §STAIR-FACE-AXIS (founder upper-floor fix, 2026-06-17) — keep-out-AWARE single-loaded carve.
 * `tryCarveSingleLoadedCorridor` picks the corridor orientation from the shell long axis and puts
 * the strip on the LOW edge; the `orientCorridorToKeepOut` post-pass can flip the SIDE but cannot
 * ROTATE the axis — so when the stair keep-out abuts a wall PERPENDICULAR to the chosen strip, the
 * corridor never reaches it (`contiguous=0/8`, then a synthetic stub bridges). This variant lays the
 * corridor strip DIRECTLY on the shell edge the stair keep-out abuts: the corridor's far face becomes
 * coincident with the keep-out's near face, so the corridor SHARES A WALL with the stair (a real
 * landing) and the private rooms comb off it toward the opposite side. Pure; returns null when the
 * keep-out doesn't clearly abut one edge or the private zone would be too shallow.
 */
function tryCarveSingleLoadedCorridorToKeepOut(
    shell: Rect,
    keepOut: Rect,
    corridorWidthM: number = CORRIDOR_STRIP_WIDTH_M,
): SingleLoadedCarve | null {
    const W = shell.x1 - shell.x0;
    const H = shell.z1 - shell.z0;
    const MIN_ZONE_DEPTH = 2.0;
    const cw = corridorWidthM;
    // Which shell edge does the keep-out abut? Use the ABSOLUTE distance from the keep-out's centre
    // to each edge LINE — robust whether the keep-out sits inside, on, or just OUTSIDE the shell
    // (the stair is subtracted from the shell, so it commonly abuts an edge from outside).
    const kcx = (keepOut.x0 + keepOut.x1) / 2;
    const kcz = (keepOut.z0 + keepOut.z1) / 2;
    const dRight = Math.abs(shell.x1 - kcx), dLeft = Math.abs(kcx - shell.x0);
    const dTop = Math.abs(shell.z1 - kcz), dBottom = Math.abs(kcz - shell.z0);
    const minD = Math.min(dRight, dLeft, dTop, dBottom);
    // Lay the corridor strip on the nearest edge; need cw + a usable private zone on the far side.
    let corridorRect: Rect;
    let orientation: 'horizontal' | 'vertical';
    if (minD === dRight) {           // stair on the RIGHT wall → vertical strip flush to x1
        if (W < cw + MIN_ZONE_DEPTH - EPS) return null;
        corridorRect = { x0: shell.x1 - cw, z0: shell.z0, x1: shell.x1, z1: shell.z1 };
        orientation = 'vertical';
    } else if (minD === dLeft) {     // stair on the LEFT wall → vertical strip flush to x0
        if (W < cw + MIN_ZONE_DEPTH - EPS) return null;
        corridorRect = { x0: shell.x0, z0: shell.z0, x1: shell.x0 + cw, z1: shell.z1 };
        orientation = 'vertical';
    } else if (minD === dTop) {      // stair on the BACK (high-z) wall → horizontal strip flush to z1
        if (H < cw + MIN_ZONE_DEPTH - EPS) return null;
        corridorRect = { x0: shell.x0, z0: shell.z1 - cw, x1: shell.x1, z1: shell.z1 };
        orientation = 'horizontal';
    } else {                         // stair on the FRONT (low-z) wall → horizontal strip flush to z0
        if (H < cw + MIN_ZONE_DEPTH - EPS) return null;
        corridorRect = { x0: shell.x0, z0: shell.z0, x1: shell.x1, z1: shell.z0 + cw };
        orientation = 'horizontal';
    }
    const privateRect: Rect = orientation === 'vertical'
        ? (corridorRect.x0 <= shell.x0 + EPS
            ? { x0: corridorRect.x1, z0: shell.z0, x1: shell.x1, z1: shell.z1 }   // corridor on left → private right
            : { x0: shell.x0, z0: shell.z0, x1: corridorRect.x0, z1: shell.z1 })  // corridor on right → private left
        : (corridorRect.z0 <= shell.z0 + EPS
            ? { x0: shell.x0, z0: corridorRect.z1, x1: shell.x1, z1: shell.z1 }   // corridor on bottom → private top
            : { x0: shell.x0, z0: shell.z0, x1: shell.x1, z1: corridorRect.z0 }); // corridor on top → private bottom
    return { corridorRect, privateRect, orientation };
}

// ── §EVERY-ROOM-ACCESS-COMB (A.21.D61, 2026-06-09) ────────────────────────────
//
// THE accessibility keystone (founder rule: "EVERY room … connected by doors …
// which rooms are connected by doors to which rooms"). The §SINGLE-RECT carve
// builds a corridor strip running the WHOLE long axis between the public + private
// zones, then SQUARIFIES the private zone into a treemap. squarify lays rooms in
// ROWS: only the FIRST row abuts the corridor face — every deeper row is buried
// behind another private room with NO shared wall to the corridor. `wallsAndDoors`
// can only host a door on a SHARED wall, so a buried bedroom has no corridor-
// adjacent wall → no door → it ships §SEALED / unrouted (the prod evidence:
// upper storey rooms=8 doors=2, circulation=0.00, §CIRCULATION-REROUTE fired).
// bedroom↔bedroom is forbidden so even the multihop reroute can't rescue it.
//
// The COMB layout is the architectural cure: lay the private rooms as a single
// row of slices PERPENDICULAR to the corridor face, each spanning the full DEPTH
// of the private rect, so EVERY private room shares its short edge with the
// corridor strip — a guaranteed corridor-adjacent wall for a door. This is the
// canonical residential "rooms off a corridor" plan.
//
// Pure + deterministic. Returns null when a comb slice can't keep every room above
// its short-side floor (the caller then keeps the squarified placement — the comb
// is best-effort and NEVER drops a room or seals it worse than squarify would).
//
// `faceAxis` is the axis ALONG which the corridor face runs (the slicing axis):
//   • corridor horizontal (full-width strip) ⇒ private rooms slice along 'x'
//     (each room is a full-depth vertical column abutting the corridor's long edge).
//   • corridor vertical   (full-height strip) ⇒ private rooms slice along 'z'.
// The caller derives it from the carve orientation.
function sliceZoneAlongFace(
    zone: Rect,
    rooms: readonly ProgramRoom[],
    faceAxis: 'x' | 'z',
    // §COMB-MIN-ALONG (A.21.D61) — optional per-room MINIMUM width ALONG the face
    // (m). The caller widens a room's slot beyond its short-side floor when the
    // room must host an inner carve: the MASTER carrying an ensuite needs enough
    // along-face width that `tryCarveEnsuiteFromMaster` can slice the ensuite out
    // AND leave the master above its own minShortSide (otherwise the comb's narrow
    // master slice forces the ensuite to be dropped — the §DIAG `master rect too
    // tight to carve ensuite` regression). Returns the floor for any room not in
    // the map. Absent ⇒ every room uses its plain short-side floor (no change).
    minAlongFor?: (room: ProgramRoom) => number,
): SubdivideResult | null {
    if (rooms.length === 0) return { placements: [], droppedRooms: [] };
    const along = faceAxis === 'x' ? zone.x1 - zone.x0 : zone.z1 - zone.z0;   // the corridor-face run
    const depth = faceAxis === 'x' ? zone.z1 - zone.z0 : zone.x1 - zone.x0;   // perpendicular (into the zone)
    if (along <= EPS || depth <= EPS) return null;

    // §COMB-DEPTH-GATE (A.21.D61) — a single-loaded comb slices every room FULL-DEPTH,
    // which is right for a normal residential private zone (apartment / typical house:
    // depth ≈ 4–6 m → a bedroom is a comfortable near-square, a wet room a sensible
    // small cell). On a DEEP private zone (a large house plate, depth ≳ 7 m) a full-
    // depth slice over-sizes the SMALL rooms — a 2.8 m-wide bathroom × 10 m depth is a
    // 28 m² wet-room blob (NO_BLOB_MAX bathroom = 28 m²). Past this depth the right
    // architecture is a double-loaded corridor (rooms both sides), not a deeper comb —
    // so we defer to the squarified treemap (its area-rebalance keeps wet rooms small),
    // accepting that some back-row rooms reach circulation via the multihop reroute.
    // The founder's reported case (146 m² apartment, 500 m² stair-fragmented house
    // dominant rect → moderate depth) is BELOW this gate → the comb fires.
    if (depth > MAX_COMB_DEPTH_M + EPS) return null;

    // Every sliced room spans the FULL depth, so its SHORT side is min(slot, depth).
    // The slot WIDTH each room earns is proportional to its target area, but clamped
    // up to its own MIN-ALONG (≥ short-side floor; wider for a master carrying an
    // ensuite); if the mins don't fit on the run we bail to squarify.
    const total = rooms.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0) || EPS;
    const minAlong = (r: ProgramRoom): number => Math.max(floorFor(r.type), minAlongFor?.(r) ?? 0);
    const floorSum = rooms.reduce((s, r) => s + minAlong(r), 0);
    if (floorSum > along + EPS) return null;            // can't give every room its min width → squarify
    // A room sliced full-depth is only sane when the DEPTH itself clears its floor
    // (otherwise the slice is a thin tunnel) — if depth is below the largest room's
    // floor the comb would produce tunnels, so defer to squarify's rebalance.
    const maxFloor = rooms.reduce((m, r) => Math.max(m, floorFor(r.type)), 0);
    if (depth < maxFloor - EPS) return null;

    // Width per room = min-along + proportional share of the leftover run.
    const leftover = Math.max(0, along - floorSum);
    const widths = rooms.map(r => minAlong(r) + leftover * (Math.max(EPS, r.targetAreaM2) / total));
    // Re-normalise to fill the run EXACTLY (float drift after the floor+share split).
    const wSum = widths.reduce((s, w) => s + w, 0) || EPS;
    const norm = widths.map(w => (w / wSum) * along);

    const placements: RoomPlacement[] = [];
    let cursor = faceAxis === 'x' ? zone.x0 : zone.z0;
    for (let i = 0; i < rooms.length; i++) {
        const w = norm[i]!;
        const rect: Rect = faceAxis === 'x'
            ? { x0: cursor, z0: zone.z0, x1: cursor + w, z1: zone.z1 }
            : { x0: zone.x0, z0: cursor, x1: zone.x1, z1: cursor + w };
        // Belt-and-braces: never emit a slice below the absolute floor on EITHER
        // axis (defends the determinism + the §HARD-MIN-SIDE guarantee).
        if (shortSideM(rect) < ABSOLUTE_MIN_SHORT_SIDE_M - EPS) return null;
        placements.push({ roomId: rooms[i]!.id, rect: roundRect(rect) });
        cursor += w;
    }
    return { placements, droppedRooms: [] };
}

/**
 * §LU-CORRIDOR (founder 2026-06-21 — "circulation must be first-class … allow sound L and U
 * corridors") — when a single STRAIGHT comb ({@link sliceZoneAlongFace}) cannot fit every private
 * room on ONE corridor run (the upper-floor 4-bed case: `floorSum > along`), lay the rooms along an
 * **L of TWO perpendicular corridor legs** so EVERY room keeps a corridor-adjacent wall. The corridor
 * becomes the L ring (for `cellPolygonById`); each room is a straight slice off whichever leg it hangs
 * from — so this composes the EXISTING `sliceZoneAlongFace` (twice) + `rectUnionRing` (the ring), no
 * new slice/polygon maths. Returns `null` when no feasible 2-leg split exists → caller falls back to
 * squarify EXACTLY as today (byte-identical on every plate that doesn't take this branch, ADR-0061 I2).
 *
 * Tiling (zone `[x0,x1]×[z0,z1]`, corridor width `cw`):
 * ```
 *   band A  z∈[z1−dA, z1]            full width, sliced along x   (rooms abut leg A's top edge)
 *   leg  A  z∈[z1−dA−cw, z1−dA]      full width                   (horizontal corridor)
 *   leg  B  x∈[x0, x0+cw]            z∈[z0, z1−dA−cw]             (vertical corridor, joins leg A)
 *   band B  x∈[x0+cw, x1]           z∈[z0, z1−dA−cw], sliced z    (rooms abut leg B's right edge)
 * ```
 * The four tile the zone exactly with no overlap; `legA ∪ legB` is a simple L ring.
 */
export function planLCorridorComb(
    zone: Rect,
    rooms: readonly ProgramRoom[],
    corridorWidthM: number,
    minAlongFor?: (room: ProgramRoom) => number,
    // §LU-CORRIDOR Step 1 (2026-06-21) — when a `corridorId` is supplied the L-comb also
    // emits the corridor itself: a representative axis-aligned `corridorPlacement` (the bbox
    // of the two legs, for the area/min/overlap gates) PLUS the real L ring in
    // `cellPolygonById` (what wallsAndDoors + semanticGraph read). This lets the L-comb slot
    // into a carve result as a COMPLETE corridor+rooms output (the §EVERY-ROOM-ACCESS-COMB
    // wiring). Absent ⇒ rooms-only result (backward-compatible).
    corridorId?: string,
    // §LU-CORRIDOR Step 2 (2026-06-21, SPEC-0074 Fix C) — when the stair keep-out centroid is
    // supplied, the L is re-oriented (one of 4 reflections) so a corridor leg runs along the
    // zone edge NEAREST the stair → the L ring shares a wall with the stair keep-out →
    // §STAIR-SPINE-TOUCH stairsBridgedToCorridor=1/1. Absent ⇒ the canonical (top+left) L
    // (byte-identical to before — the existing tests pass no anchor).
    stairAnchor?: Pt,
): {
    placements: RoomPlacement[];
    corridorRing: readonly Pt[];
    legs: readonly [Rect, Rect];
    corridorPlacement?: RoomPlacement;
    cellPolygonById?: ReadonlyMap<string, readonly Pt[]>;
} | null {
    const cw = corridorWidthM;
    if (rooms.length < 2 || cw <= EPS) return null;          // an L only helps for ≥2 rooms
    const zoneW = zone.x1 - zone.x0;
    const zoneD = zone.z1 - zone.z0;
    if (zoneW <= cw + ABSOLUTE_MIN_SHORT_SIDE_M || zoneD <= cw + ABSOLUTE_MIN_SHORT_SIDE_M) return null;

    const minAlong = (r: ProgramRoom): number => Math.max(floorFor(r.type), minAlongFor?.(r) ?? 0);

    // The canonical (top+left) L from the first feasible split; orientation + corridor
    // emission happen AFTER the loop so the stair-reflection applies uniformly.
    let chosen: { roomPlacements: RoomPlacement[]; legA: Rect; legB: Rect } | null = null;
    // Try each contiguous split rooms[0..k) → band A (off leg A) / rooms[k..n) → band B (off leg B).
    // Rooms arrive in allocation order; the first feasible split wins (deterministic).
    for (let k = 1; k < rooms.length; k++) {
        const groupA = rooms.slice(0, k);
        const groupB = rooms.slice(k);
        const floorSumB = groupB.reduce((s, r) => s + minAlong(r), 0);
        const maxFloorA = groupA.reduce((m, r) => Math.max(m, floorFor(r.type)), 0);

        // band B run (along z) = zoneD − dA − cw ≥ floorSumB ⇒ dA ≤ zoneD − cw − floorSumB.
        // band A depth dA must clear band A's floors (≥ maxFloorA) and the comb-depth gate.
        const dAHi = Math.min(MAX_COMB_DEPTH_M, zoneD - cw - floorSumB);
        const dALo = maxFloorA;
        if (dALo > dAHi + EPS) continue;                     // no feasible band-A depth for this split
        const dA = dALo;                                     // give band B the longest run (deterministic)

        const legAz0 = zone.z1 - dA - cw;
        const bandA: Rect = { x0: zone.x0,      z0: zone.z1 - dA, x1: zone.x1,      z1: zone.z1 };
        const legA:  Rect = { x0: zone.x0,      z0: legAz0,       x1: zone.x1,      z1: zone.z1 - dA };
        const legB:  Rect = { x0: zone.x0,      z0: zone.z0,      x1: zone.x0 + cw, z1: legAz0 };
        const bandB: Rect = { x0: zone.x0 + cw, z0: zone.z0,      x1: zone.x1,      z1: legAz0 };

        const resA = sliceZoneAlongFace(bandA, groupA, 'x', minAlongFor);
        const resB = sliceZoneAlongFace(bandB, groupB, 'z', minAlongFor);
        if (!resA || !resB || resA.droppedRooms.length > 0 || resB.droppedRooms.length > 0) continue;

        if (!rectUnionRing([roundRect(legA), roundRect(legB)])) continue;   // ring must form
        chosen = {
            roomPlacements: [...resA.placements, ...resB.placements],
            legA: roundRect(legA),
            legB: roundRect(legB),
        };
        break;                                                              // first feasible split wins
    }
    if (!chosen) return null;

    // §LU-CORRIDOR Step 2 — reflect the canonical L about the zone mid-lines (4 orientations)
    // and pick the one whose corridor leg sits NEAREST the stair anchor, so a leg shares the
    // stair wall. No anchor ⇒ canonical (fx=fz=false) → byte-identical.
    const midX = zone.x0 + zone.x1, midZ = zone.z0 + zone.z1;
    const reflRect = (r: Rect, fx: boolean, fz: boolean): Rect => roundRect({
        x0: fx ? midX - r.x1 : r.x0, x1: fx ? midX - r.x0 : r.x1,
        z0: fz ? midZ - r.z1 : r.z0, z1: fz ? midZ - r.z0 : r.z1,
    });
    const distToRect = (p: Pt, r: Rect): number => {
        const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1);
        const dz = Math.max(r.z0 - p.z, 0, p.z - r.z1);
        return Math.hypot(dx, dz);
    };
    const orientations: ReadonlyArray<readonly [boolean, boolean]> = stairAnchor
        ? [[false, false], [true, false], [false, true], [true, true]]
        : [[false, false]];
    let best = { fx: false, fz: false, d: Infinity };
    for (const [fx, fz] of orientations) {
        const lA = reflRect(chosen.legA, fx, fz), lB = reflRect(chosen.legB, fx, fz);
        const d = stairAnchor ? Math.min(distToRect(stairAnchor, lA), distToRect(stairAnchor, lB)) : 0;
        if (d < best.d) best = { fx, fz, d };
    }

    const legA = reflRect(chosen.legA, best.fx, best.fz);
    const legB = reflRect(chosen.legB, best.fx, best.fz);
    const placements = chosen.roomPlacements.map(p => ({ roomId: p.roomId, rect: reflRect(p.rect, best.fx, best.fz) }));
    const ring = rectUnionRing([legA, legB]);
    if (!ring) return null;

    // §LU-CORRIDOR Step 1 — optional corridor emission (representative rect = bbox of the two
    // legs; the gates run on this rect, the real L geometry is the ring).
    let corridorPlacement: RoomPlacement | undefined;
    let cellPolygonById: ReadonlyMap<string, readonly Pt[]> | undefined;
    if (corridorId !== undefined) {
        const bbox: Rect = roundRect({
            x0: Math.min(legA.x0, legB.x0), z0: Math.min(legA.z0, legB.z0),
            x1: Math.max(legA.x1, legB.x1), z1: Math.max(legA.z1, legB.z1),
        });
        corridorPlacement = { roomId: corridorId, rect: bbox };
        cellPolygonById = new Map<string, readonly Pt[]>([[corridorId, ring]]);
    }

    return {
        placements,
        corridorRing: ring,
        legs: [legA, legB],
        ...(corridorPlacement ? { corridorPlacement } : {}),
        ...(cellPolygonById ? { cellPolygonById } : {}),
    };
}

/** Carve the ensuite out of the master's squarified rect along its LONGER
 *  axis so the master + ensuite share an interior wall (the only access to
 *  the ensuite, per programRules.ensuite.accessFrom = ['master']). Returns
 *  null when the master can't afford the carve and stay above its own
 *  minShortSideM — the caller then leaves the ensuite unplaced rather than
 *  emit a door-less room. */
function tryCarveEnsuiteFromMaster(
    masterRect: Rect,
    ensuiteAreaM2: number,
    // §FF-R5 (founder §CIRCULATION-GRAPH PART 4) — the corridor rect, when supplied. The ensuite
    // is then carved on the master face AWAY from the corridor so it shares a wall ONLY with the
    // master (never a door-width corridor wall → no `ensuiteOnCorridor` topology violation). Absent
    // ⇒ BYTE-IDENTICAL to the legacy high-side carve (the apartment single-storey path, which has
    // no FF corridor, is unchanged).
    avoidRect?: Rect,
): { master: Rect; ensuite: Rect } | null {
    const W = masterRect.x1 - masterRect.x0;
    const H = masterRect.z1 - masterRect.z0;
    const ensuiteMin = roomRule('ensuite').minShortSideM;
    const masterMin  = roomRule('master').minShortSideM;

    /** Try a perpendicular cut. `longDim` is the master's axis we cut across;
     *  `shortDim` is the master's other axis (becomes both rooms' span on
     *  that axis after the cut). */
    const tryCut = (longDim: number, shortDim: number): number | null => {
        // Ensuite span on shortDim must clear ensuiteMin.
        if (shortDim < ensuiteMin - EPS) return null;
        // Ensuite span on longDim = max(its minShortSide, target_area / shortDim).
        const cut = Math.max(ensuiteMin, ensuiteAreaM2 / shortDim);
        // Master must keep ≥ masterMin on the cut axis after the slice.
        if (longDim - cut < masterMin - EPS) return null;
        return cut;
    };

    // Build the {master, ensuite} carve for a given axis + side. `axis='x'` cuts across W (ensuite a
    // vertical strip); `axis='z'` cuts across H (ensuite a horizontal strip). `side='high'` puts the
    // ensuite at the max-coordinate end (the legacy position), `side='low'` at the min-coordinate end.
    const buildX = (side: 'low' | 'high'): { master: Rect; ensuite: Rect } | null => {
        const cut = tryCut(W, H);
        if (cut === null) return null;
        if (side === 'high') {
            const split = masterRect.x1 - cut;
            return {
                master:  { x0: masterRect.x0, z0: masterRect.z0, x1: split,         z1: masterRect.z1 },
                ensuite: { x0: split,         z0: masterRect.z0, x1: masterRect.x1, z1: masterRect.z1 },
            };
        }
        const split = masterRect.x0 + cut;
        return {
            master:  { x0: split,         z0: masterRect.z0, x1: masterRect.x1, z1: masterRect.z1 },
            ensuite: { x0: masterRect.x0, z0: masterRect.z0, x1: split,         z1: masterRect.z1 },
        };
    };
    const buildZ = (side: 'low' | 'high'): { master: Rect; ensuite: Rect } | null => {
        const cut = tryCut(H, W);
        if (cut === null) return null;
        if (side === 'high') {
            const split = masterRect.z1 - cut;
            return {
                master:  { x0: masterRect.x0, z0: masterRect.z0, x1: masterRect.x1, z1: split          },
                ensuite: { x0: masterRect.x0, z0: split,         x1: masterRect.x1, z1: masterRect.z1 },
            };
        }
        const split = masterRect.z0 + cut;
        return {
            master:  { x0: masterRect.x0, z0: split,         x1: masterRect.x1, z1: masterRect.z1 },
            ensuite: { x0: masterRect.x0, z0: masterRect.z0, x1: masterRect.x1, z1: split          },
        };
    };

    // §FF-R5 corridor-aware placement. Find which master edge the corridor abuts (needs a real
    // door-width shared run there), then carve the ensuite PERPENDICULAR to that edge on the FAR
    // side, so the ensuite never inherits a door-width corridor wall. Falls back to the legacy
    // carve when there is no corridor adjacency OR the corridor-avoiding cut is infeasible — a
    // placed ensuite (even if it then de-ranks) always beats a DROPPED room.
    if (avoidRect) {
        const TOUCH_MM = 50;       // edges within 50 mm count as abutting
        const DOOR_MM = 900;       // a door-width shared run = genuine adjacency
        const runMM = (axis: 'x' | 'z'): number => {
            const lo = Math.max(axis === 'x' ? masterRect.x0 : masterRect.z0, axis === 'x' ? avoidRect.x0 : avoidRect.z0);
            const hi = Math.min(axis === 'x' ? masterRect.x1 : masterRect.z1, axis === 'x' ? avoidRect.x1 : avoidRect.z1);
            return Math.max(0, hi - lo);
        };
        const onLeft  = Math.abs(avoidRect.x1 - masterRect.x0) <= TOUCH_MM && runMM('z') >= DOOR_MM;
        const onRight = Math.abs(avoidRect.x0 - masterRect.x1) <= TOUCH_MM && runMM('z') >= DOOR_MM;
        const onFront = Math.abs(avoidRect.z1 - masterRect.z0) <= TOUCH_MM && runMM('x') >= DOOR_MM;
        const onBack  = Math.abs(avoidRect.z0 - masterRect.z1) <= TOUCH_MM && runMM('x') >= DOOR_MM;
        let preferred: { master: Rect; ensuite: Rect } | null = null;
        if (onLeft)       preferred = buildX('high');   // corridor on left  → ensuite to the right
        else if (onRight) preferred = buildX('low');    // corridor on right → ensuite to the left
        else if (onFront) preferred = buildZ('high');   // corridor in front → ensuite to the back
        else if (onBack)  preferred = buildZ('low');    // corridor behind   → ensuite to the front
        if (preferred) return preferred;
        // else: no corridor adjacency, or the avoiding cut didn't fit → legacy carve (no regression).
    }

    // Legacy carve (BYTE-IDENTICAL to the pre-FF-R5 behaviour): cut across the LONGER axis first
    // (wider master cross-section), ensuite on the high side.
    if (W >= H) return buildX('high') ?? buildZ('high');
    return buildZ('high') ?? buildX('high');
}

/**
 * §SUITE-WITHIN-PARENT (founder "hotel-style" suites, LAYOUT-GENERATION-ALGORITHM §20.3) —
 * a (host bedroom → ensuite) pair. The OFF / apartment path has exactly ONE suite (the
 * master + its en-suite); the gated house-UPPER suite program mints one PER bedroom. Built
 * in `trySingleRectCarve` from the `ensuiteHostId` stamps the bubble graph already sets.
 */
interface Suite {
    /** The host bedroom/master room id this ensuite is carved out of. */
    readonly hostId: string;
    /** The ensuite ProgramRoom (its `targetAreaM2` is the carve area). */
    readonly ensuite: ProgramRoom;
}

/**
 * §SUITE-WITHIN-PARENT — carve an ensuite from a CORNER of its host's placed rect on the host
 * face AWAY from the corridor, so the ensuite shares a wall ONLY with its host (the host↔ensuite
 * door) and NEVER a door-width corridor wall (no `ensuiteOnCorridor` purity violation). Both
 * stay RECTANGLES (the rect-based gates are unaffected — doctrine §20.3). This is the corrected
 * (metres-unit) corridor-avoiding carve used by the GATED suite path ONLY; the legacy
 * `tryCarveEnsuiteFromMaster` (whose `avoidRect` mm/m mismatch makes its avoidance a no-op) is
 * kept verbatim on the OFF path for byte-identity. Returns null when the host is too small to
 * seat both rooms at their minima on EVERY corridor-avoiding option (the caller falls back). The
 * cut axis is chosen perpendicular to the corridor-facing edge when one is detected; otherwise it
 * cuts across the LONGER axis (matching the legacy preference) but always picks the side that
 * minimises the ensuite's contact with the corridor. Pure + deterministic.
 */
function carveEnsuiteCornerAwayFromCorridor(
    hostRect: Rect,
    ensuiteAreaM2: number,
    corridorRect: Rect,
): { master: Rect; ensuite: Rect } | null {
    const W = hostRect.x1 - hostRect.x0;
    const H = hostRect.z1 - hostRect.z0;
    const ensMin = roomRule('ensuite').minShortSideM;
    const bedMin = roomRule('bedroom').minShortSideM;   // generic host floor (master ≥ bedroom)

    // tryCut across `longDim` keeping `shortDim` as the shared span.
    const tryCut = (longDim: number, shortDim: number): number | null => {
        if (shortDim < ensMin - EPS) return null;
        const cut = Math.max(ensMin, ensuiteAreaM2 / shortDim);
        if (longDim - cut < bedMin - EPS) return null;
        return cut;
    };
    const buildX = (side: 'low' | 'high'): { master: Rect; ensuite: Rect } | null => {
        const cut = tryCut(W, H);
        if (cut === null) return null;
        if (side === 'high') {
            const split = hostRect.x1 - cut;
            return {
                master:  { x0: hostRect.x0, z0: hostRect.z0, x1: split,       z1: hostRect.z1 },
                ensuite: { x0: split,       z0: hostRect.z0, x1: hostRect.x1, z1: hostRect.z1 },
            };
        }
        const split = hostRect.x0 + cut;
        return {
            master:  { x0: split,       z0: hostRect.z0, x1: hostRect.x1, z1: hostRect.z1 },
            ensuite: { x0: hostRect.x0, z0: hostRect.z0, x1: split,       z1: hostRect.z1 },
        };
    };
    const buildZ = (side: 'low' | 'high'): { master: Rect; ensuite: Rect } | null => {
        const cut = tryCut(H, W);
        if (cut === null) return null;
        if (side === 'high') {
            const split = hostRect.z1 - cut;
            return {
                master:  { x0: hostRect.x0, z0: hostRect.z0, x1: hostRect.x1, z1: split       },
                ensuite: { x0: hostRect.x0, z0: split,       x1: hostRect.x1, z1: hostRect.z1 },
            };
        }
        const split = hostRect.z0 + cut;
        return {
            master:  { x0: hostRect.x0, z0: split,       x1: hostRect.x1, z1: hostRect.z1 },
            ensuite: { x0: hostRect.x0, z0: hostRect.z0, x1: hostRect.x1, z1: split       },
        };
    };

    // Detect which host edge the corridor abuts (metres units, ≥ a door-width run = 0.8 m).
    const TOUCH = 0.05, DOOR = 0.8;
    const xOverlap = Math.max(0, Math.min(hostRect.x1, corridorRect.x1) - Math.max(hostRect.x0, corridorRect.x0));
    const zOverlap = Math.max(0, Math.min(hostRect.z1, corridorRect.z1) - Math.max(hostRect.z0, corridorRect.z0));
    const onLeft  = Math.abs(corridorRect.x1 - hostRect.x0) <= TOUCH && zOverlap >= DOOR;
    const onRight = Math.abs(corridorRect.x0 - hostRect.x1) <= TOUCH && zOverlap >= DOOR;
    const onFront = Math.abs(corridorRect.z1 - hostRect.z0) <= TOUCH && xOverlap >= DOOR;
    const onBack  = Math.abs(corridorRect.z0 - hostRect.z1) <= TOUCH && xOverlap >= DOOR;

    // The corridor shares the host's FULL span along the edge it abuts. To keep the ensuite
    // OFF the corridor, cut PERPENDICULAR to that edge and place the ensuite on the FAR band:
    //   • corridor on BACK (host z1) ⇒ ensuite a z-band at the FRONT (z near z0) — buildZ('low').
    //   • corridor on FRONT (host z0) ⇒ ensuite a z-band at the BACK  — buildZ('high').
    //   • corridor on RIGHT (host x1) ⇒ ensuite an x-band on the LEFT — buildX('low').
    //   • corridor on LEFT  (host x0) ⇒ ensuite an x-band on the RIGHT — buildX('high').
    // The host keeps the WHOLE corridor edge (its corridor door + window); the ensuite sits in
    // the far corner (interior / shell walls only). Falls back to the other side if the chosen
    // side doesn't fit, then to the cross-axis carve (still a corner of the host).
    if (onBack)  return buildZ('low')  ?? buildZ('high') ?? buildX('high') ?? buildX('low');
    if (onFront) return buildZ('high') ?? buildZ('low')  ?? buildX('high') ?? buildX('low');
    if (onRight) return buildX('low')  ?? buildX('high') ?? buildZ('high') ?? buildZ('low');
    if (onLeft)  return buildX('high') ?? buildX('low')  ?? buildZ('high') ?? buildZ('low');
    // No corridor adjacency detected (host buried, or a sliver corridor run): keep the legacy
    // longer-axis preference, ensuite on the high side (a corner of the host).
    if (W >= H) return buildX('high') ?? buildZ('high');
    return buildZ('high') ?? buildX('high');
}

/**
 * §SUITE-HOST-ADJACENCY (founder rule, 2026-06-22) — "an en-suite ALWAYS needs to be connected
 * to its master/bedroom". Carve the ensuite from a CORNER of its host's combined footprint with
 * a HARD adjacency GUARANTEE: the ensuite ALWAYS shares the cut wall with its host (by
 * construction — a split of one rect into two abutting rects). It NEVER bands the ensuite as a
 * separate room. The two-tier policy:
 *   1. PREFERRED — the corridor-avoiding corner carve (`carveEnsuiteCornerAwayFromCorridor`), so
 *      the ensuite shares a wall ONLY with the host (no `ensuiteOnCorridor` purity violation).
 *   2. GUARANTEED FALLBACK — when the preferred carve can't fit the ideal minima (the host band
 *      is too shallow — the case that previously DROPPED the ensuite → it re-banded DETACHED in
 *      a separate row), split the host's combined rect along whichever axis yields the largest
 *      host remainder, seating the ensuite at its OWN minShortSide depth. The host may dip toward
 *      a relaxed floor (it still keeps the LARGER part) and the ensuite may end up corridor-side,
 *      but it is ATTACHED to its host with a real (≥ a door's-width) shared wall — the founder's
 *      hard requirement. A door-pipeline pass can re-route a corridor-touch later; a DETACHED
 *      ensuite cannot be rescued at all.
 * Returns null ONLY when the host rect genuinely cannot seat a minimal ensuite + a minimal host
 * (the combined short side < 2·ensuiteMin-ish): the caller then DROPS the ensuite (reports it),
 * never ships it detached. Pure + deterministic (ADR-0061). Metres, world XZ.
 */
export function carveEnsuiteWithinHost(
    hostRect: Rect,
    ensuiteAreaM2: number,
    corridorRect: Rect,
): { master: Rect; ensuite: Rect } | null {
    // Tier 1 — the ideal corridor-avoiding corner carve.
    const ideal = carveEnsuiteCornerAwayFromCorridor(hostRect, ensuiteAreaM2, corridorRect);
    if (ideal) return ideal;

    // Tier 2 — GUARANTEED-adjacency fallback. Split the combined rect so the ensuite sits at its
    // own minShortSide depth on the SHORTER plan span (the host keeps the larger, window-facing
    // part) and BOTH rooms clear an absolute floor. The split line is a shared wall by
    // construction, so the ensuite can never detach.
    const W = hostRect.x1 - hostRect.x0;
    const H = hostRect.z1 - hostRect.z0;
    const ensMin = roomRule('ensuite').minShortSideM;
    // Relaxed host floor: the ensuite minShortSide is the binding host floor in the fallback
    // (we already failed the preferred bedroom-min carve). Never let the host go below the
    // ensuite floor — that would make the "host" the smaller room.
    const hostFloor = ensMin;

    // tryCut across `longDim`, keeping `shortDim` as the shared span. The ensuite depth is the
    // max of its minShortSide and the depth needed to hit its target area on the shared span,
    // but never more than leaves the host its own floor.
    const tryCut = (longDim: number, shortDim: number): number | null => {
        if (shortDim < ensMin - EPS) return null;                  // shared span too narrow for an ensuite
        if (longDim < hostFloor + ensMin - EPS) return null;       // can't seat host + ensuite at all
        const want = Math.max(ensMin, ensuiteAreaM2 / shortDim);
        const cut = Math.min(want, longDim - hostFloor);           // never starve the host below its floor
        if (cut < ensMin - EPS) return null;
        return cut;
    };
    const buildX = (): { master: Rect; ensuite: Rect } | null => {
        const cut = tryCut(W, H);
        if (cut === null) return null;
        const split = hostRect.x1 - cut;                           // ensuite on the high-x corner
        return {
            master:  { x0: hostRect.x0, z0: hostRect.z0, x1: split,         z1: hostRect.z1 },
            ensuite: { x0: split,       z0: hostRect.z0, x1: hostRect.x1,   z1: hostRect.z1 },
        };
    };
    const buildZ = (): { master: Rect; ensuite: Rect } | null => {
        const cut = tryCut(H, W);
        if (cut === null) return null;
        const split = hostRect.z1 - cut;                           // ensuite on the high-z corner
        return {
            master:  { x0: hostRect.x0, z0: hostRect.z0, x1: hostRect.x1, z1: split         },
            ensuite: { x0: hostRect.x0, z0: split,       x1: hostRect.x1, z1: hostRect.z1   },
        };
    };
    // Cut across the LONGER axis first (leaves the host the wider, more usable remainder).
    return W >= H ? (buildX() ?? buildZ()) : (buildZ() ?? buildX());
}

/**
 * §SUITE-WITHIN-PARENT — carve EVERY suite's ensuite out of a CORNER of its host bedroom's
 * placed slice, AFTER the private rooms have been combed/squarified. GENERALISES the single
 * master→ensuite carve to N (host → ensuite) pairs:
 *   • Each carve reuses `tryCarveEnsuiteFromMaster(hostRect, area, corridorRect)`, which puts
 *     the ensuite on the host face AWAY from the corridor → the ensuite shares a wall ONLY
 *     with its host (the host↔ensuite door), never a corridor wall (no `ensuiteOnCorridor`),
 *     and both stay RECTANGLES so the rect-based gates are unaffected (doctrine §20.3).
 *   • FALL-BACK (per suite, never silent): when a host slice is too small to seat both the
 *     bedroom AND the ensuite at their minima, the host is LEFT WHOLE (no carve) and the
 *     ensuite is reported via `droppedRooms` — the engine then bands it normally / de-ranks
 *     it, exactly as the single-master carve already does. No suite is silently dropped.
 * Mutates `privatePlacements` (replaces each carved host + appends its ensuite) and pushes any
 * fall-backs onto `droppedRooms`. Pure + deterministic (ADR-0061). Returns the count carved.
 */
function carveSuiteEnsuites(
    privatePlacements: RoomPlacement[],
    suites: readonly Suite[],
    corridorRect: Rect,
    droppedRooms: DroppedRoom[],
    masterId?: string,
): { carved: number; fellBack: number } {
    let carved = 0, fellBack = 0;
    // §SUITE-WITHIN-PARENT — suite mode iff the (gated) program minted MORE than the lone
    // master suite OR an ensuite hosted by a NON-master bedroom. OFF / apartment: exactly one
    // suite hosted by the master ⇒ suiteMode=false ⇒ the legacy `tryCarveEnsuiteFromMaster` runs
    // verbatim ⇒ BYTE-IDENTICAL. ON ⇒ the corrected (metres-unit) corridor-avoiding corner carve.
    const suiteMode = suites.length > 1 || suites.some(s => s.hostId !== masterId);
    for (const suite of suites) {
        const area = suite.ensuite.targetAreaM2;
        if (area <= EPS) continue;
        const hostIdx = privatePlacements.findIndex(p => p.roomId === suite.hostId);
        if (hostIdx < 0) {
            // Host itself wasn't placed (dropped upstream) — the ensuite cannot host; report it.
            droppedRooms.push({
                roomId: suite.ensuite.id, type: suite.ensuite.type,
                shortSideM: 0, minShortSideM: floorFor(suite.ensuite.type),
            });
            fellBack += 1;
            continue;
        }
        const hostP = privatePlacements[hostIdx]!;
        const ec = suiteMode
            // §SUITE-HOST-ADJACENCY — guaranteed host-adjacency carve (ideal corridor-avoiding
            // corner, else a guaranteed corner split). NEVER bands the ensuite detached.
            ? carveEnsuiteWithinHost(hostP.rect, area, corridorRect)
            : tryCarveEnsuiteFromMaster(hostP.rect, area, corridorRect);
        if (ec) {
            privatePlacements[hostIdx] = { roomId: suite.hostId, rect: roundRect(ec.master) };
            privatePlacements.push({ roomId: suite.ensuite.id, rect: roundRect(ec.ensuite) });
            carved += 1;
        } else {
            // §SUITE-FALLBACK — host too tight: leave the bedroom WHOLE (no carve), report the
            // ensuite so it is NOT silently dropped (it then bands normally / de-ranks).
            droppedRooms.push({
                roomId: suite.ensuite.id, type: suite.ensuite.type,
                shortSideM: 0, minShortSideM: floorFor(suite.ensuite.type),
            });
            fellBack += 1;
        }
    }
    if (suites.length > 0) {
        console.log(
            `[D-TGL subdivide] §DIAG-SUITE carve: suites=${suites.length} carved=${carved} ` +
            `fellBack=${fellBack} (each carved ensuite = a corner of its host, door host↔ensuite, ` +
            `never the corridor; fall-backs left the host whole + reported the ensuite).`,
        );
    }
    return { carved, fellBack };
}

/**
 * §SUITE-WITHIN-PARENT — the `combMinAlong` callback for `sliceZoneAlongFace`: a suite HOST's
 * combed slice must be ≥ hostMin + ensuiteMin along the corridor face so the ensuite carve
 * leaves the host above its own minShortSide. GENERALISES the legacy master-only widen to all
 * suite hosts. BYTE-IDENTITY: the legacy code returned a callback ONLY when `master && ensuite`
 * (widening just the master to masterMin + ensuiteMin, else 0). With exactly one suite hosted by
 * the master this returns the SAME callback (the master widened, every other room 0); with NO
 * suite it returns `undefined` (no widen) exactly as before. Pure + deterministic.
 */
function suiteCombMinAlong(
    suites: readonly Suite[],
    master: ProgramRoom | undefined,
    ensuite: ProgramRoom | undefined,
): ((r: ProgramRoom) => number) | undefined {
    if (suites.length === 0) {
        // Legacy: only the master-with-ensuite path widened. Preserve it verbatim.
        if (!(master && ensuite)) return undefined;
        const widen = roomRule('master').minShortSideM + roomRule('ensuite').minShortSideM;
        return (r: ProgramRoom): number => (r.id === master.id ? widen : 0);
    }
    // Suite mode: widen each host by hostMin + ensuiteMin.
    const ensMin = roomRule('ensuite').minShortSideM;
    const need = new Map<string, number>();
    for (const s of suites) {
        const hostType = s.hostId === master?.id ? 'master' : 'bedroom';
        need.set(s.hostId, roomRule(hostType).minShortSideM + ensMin);
    }
    return (r: ProgramRoom): number => need.get(r.id) ?? 0;
}

/**
 * §MASTER-SURPLUS (2026-06-08, F3) — ensure the master's effective (post-ensuite-carve)
 * area exceeds every non-master bedroom by ≥ `MIN_MASTER_SURPLUS_M2`. Deterministic and
 * NO-DROP: it transfers area TARGET from the LARGEST non-master bedroom (the binding
 * constraint; all bedrooms share a drop-rank so this is the lowest-priority donor by
 * allocation order) to the master, then re-squarifies the private rect. Bounded to 3
 * iterations. The donor is clamped to its own §FEASIBILITY minimum area, so a bedroom
 * never shrinks below its floor — the §FEASIBILITY-ALLOC no-drop guarantee holds. Squarify
 * scales targets to fill the rect; because a transfer preserves the target SUM the
 * scale factor is constant, so a Δ-target shift maps near-linearly to a Δ-area shift and
 * the bounded loop converges. `ensuiteReserveM2` is the area later carved from the master
 * for its en-suite (0 when none) — subtracted so the comparison uses the master's TRUE
 * final area. Pure + deterministic. When the master already leads, or the donor cannot
 * give without dropping below its floor, the input result is returned unchanged.
 */
function applyMasterSurplus(
    rect: Rect,
    ordered: readonly ProgramRoom[],
    result: SubdivideResult,
    masterId: string,
    ensuiteReserveM2: number,
): SubdivideResult {
    if (!ordered.some(r => r.type === 'bedroom') || !ordered.some(r => r.id === masterId)) return result;
    const rectA = Math.max(EPS, rectArea(rect));
    const sumTargets = ordered.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0) || EPS;
    const scale = rectA / sumTargets;     // target→final-area factor (sum is preserved across a transfer)

    let rooms = ordered.map(r => ({ ...r }));
    let cur = result;
    for (let iter = 0; iter < 3; iter++) {
        const byId = new Map(cur.placements.map(p => [p.roomId, p]));
        const mp = byId.get(masterId);
        if (!mp) return cur;
        const masterEff = rectArea(mp.rect) - Math.max(0, ensuiteReserveM2);
        let maxBedArea = -Infinity, maxBedId: string | null = null;
        for (const r of rooms) {
            if (r.type !== 'bedroom') continue;
            const p = byId.get(r.id);
            if (!p) continue;
            const a = rectArea(p.rect);
            if (a > maxBedArea) { maxBedArea = a; maxBedId = r.id; }
        }
        if (maxBedId === null) return cur;
        const deficit = (maxBedArea + MIN_MASTER_SURPLUS_M2) - masterEff;
        if (deficit <= EPS) return cur;                       // master already visibly larger → done
        const donor = rooms.find(r => r.id === maxBedId)!;
        const donorMinTarget = minAreaFor(donor.type) / scale;
        const give = Math.min(deficit / scale, Math.max(0, donor.targetAreaM2 - donorMinTarget));
        if (give <= EPS) return cur;                          // donor at its floor — never drop it below
        rooms = rooms.map(r =>
            r.id === donor.id ? { ...r, targetAreaM2: r.targetAreaM2 - give }
            : r.id === masterId ? { ...r, targetAreaM2: r.targetAreaM2 + give }
            : r);
        cur = placeInRectReported(rect, rooms);
    }
    return cur;
}

// ── §ENTRANCE-HALL-ON-SHELL (tracker §57.4, founder defect, 2026-06-11) ────────
//
// THE DEFECT (founder, emphatic + repeated): "the entrance hall still centered —
// cannot be there — where the entrance door is!!!". The `hall` room is the arrival
// space the FRONT DOOR opens into, so it MUST bound an EXTERIOR/shell (perimeter)
// wall — the editor seam (`reseatEntranceOnHallWall`, §DIAG-ENTRANCE-FIX) places
// the front door on the longest shell wall the hall's polygon fronts. When the
// public zone is SQUARIFIED (`placeInRectReported`), squarify lays rooms in ROWS:
// the hall can land in a DEEPER row buried behind living/kitchen, fronting NO shell
// wall → the editor's strict bounds test fails → §DIAG-EXEC-ENTRANCE logs
// `⚠ NOT-ON-PERIMETER` and the door lands on a neighbour's façade.
//
// THE CURE — the §STAIR-CIRC-FACE model (force a room to share a wall with a target
// via placement): carve the HALL as a dedicated full-DEPTH slice on a SHELL EDGE of
// the public rect, PERPENDICULAR to the corridor face. The public rect's outer edges
// (x0/x1 + the away-from-corridor z) are ALL shell/perimeter walls; the corridor-
// facing edge is the public/private split. A full-depth hall column therefore bounds
//   • a shell wall along its OUTER long edge AND its near shell corner   (door OUT),
//   • the corridor along its SHORT corridor-facing edge                  (door IN),
// i.e. the entry transition outside → hall → corridor/living. We pin it to the END of
// the public rect (the corner) so it gets the LONGEST shell frontage (two shell walls
// meet there → an entry-appropriate wall) and never buries it behind a sibling.
//
// Returns null (caller keeps the plain squarify) when the hall can't be sliced without
// starving it or the remaining public rooms below their floors — so it is byte-
// identical on plates where the carve doesn't apply, and NEVER drops a room to force
// the hall out. Pure + deterministic (no RNG, ADR-0061).
function placePublicWithHallOnShell(
    publicRect: Rect,
    publicRooms: readonly ProgramRoom[],
    // The corridor face of the public rect — the side that abuts the corridor strip.
    // 'horizontal' carve ⇒ corridor is on the +z side (publicRect.z1); the hall slices
    // along x (a full-z-depth column). 'vertical' ⇒ corridor on +x; hall slices along z.
    orientation: 'horizontal' | 'vertical',
): SubdivideResult | null {
    const hall = publicRooms.find(r => r.type === 'hall');
    if (!hall) return null;                       // no ground entrance hall → nothing to force
    if (publicRooms.length < 2) return null;      // hall-only public zone — squarify already perimeter

    // The hall is a full-DEPTH slice perpendicular to the corridor face, so its short
    // side is min(slot-width-along-face, depth). The slice axis is the corridor face's
    // own axis (along which siblings sit), guaranteeing the hall column reaches BOTH the
    // outer shell edge and the corridor edge.
    const faceAxis: 'x' | 'z' = orientation === 'horizontal' ? 'x' : 'z';
    const along = faceAxis === 'x' ? publicRect.x1 - publicRect.x0 : publicRect.z1 - publicRect.z0;
    const depth = faceAxis === 'x' ? publicRect.z1 - publicRect.z0 : publicRect.x1 - publicRect.x0;
    if (along <= EPS || depth <= EPS) return null;

    const hallFloor = floorFor('hall');
    // The depth (perpendicular run, shell-to-corridor) must itself clear the hall floor,
    // else a full-depth slice is a thin tunnel — defer to squarify.
    if (depth < hallFloor - EPS) return null;

    // Hall slot width along the face: its area target ÷ depth, clamped to ≥ its floor.
    // Cap it so the rest of the public rooms keep their own floors on the leftover run.
    const others = publicRooms.filter(r => r.id !== hall.id);
    const othersFloorSum = others.reduce((s, r) => s + floorFor(r.type), 0);
    const hallWantWidth = Math.max(hallFloor, hall.targetAreaM2 / depth);
    const maxHallWidth = along - othersFloorSum;
    if (maxHallWidth < hallFloor - EPS) return null;     // no room for the hall + siblings → squarify
    const hallWidth = Math.min(hallWantWidth, maxHallWidth);
    if (hallWidth < hallFloor - EPS) return null;

    // Pin the hall to the END of the public rect along the face (the corner → longest
    // shell frontage). We choose the x0/z0 end deterministically (the shell-origin corner).
    const out: RoomPlacement[] = [];
    let remainingRect: Rect;
    if (faceAxis === 'x') {
        const split = publicRect.x0 + hallWidth;
        out.push({ roomId: hall.id, rect: roundRect({ x0: publicRect.x0, z0: publicRect.z0, x1: split, z1: publicRect.z1 }) });
        remainingRect = { x0: split, z0: publicRect.z0, x1: publicRect.x1, z1: publicRect.z1 };
    } else {
        const split = publicRect.z0 + hallWidth;
        out.push({ roomId: hall.id, rect: roundRect({ x0: publicRect.x0, z0: publicRect.z0, x1: publicRect.x1, z1: split }) });
        remainingRect = { x0: publicRect.x0, z0: split, x1: publicRect.x1, z1: publicRect.z1 };
    }

    // Squarify the remaining public rooms (living/kitchen/dining) into the leftover rect.
    // If any of them can't clear its floor there, the WHOLE carve is abandoned (caller
    // keeps the plain squarify) — we never drop a public room to seat the hall.
    const restPlaced = placeInRectReported(remainingRect, adjacencySortForZone(allocationOrder(others)));
    if (restPlaced.droppedRooms.length > 0) return null;
    out.push(...restPlaced.placements);
    return { placements: out, droppedRooms: [] };
}

/** Single-rect carve flow: returns the placements (corridor + public + private,
 *  with ensuite carved from master) + the structured drop report. Returns null
 *  when the carve can't fit (caller falls back to the whole-shell squarify). */
/**
 * §HALL-HINGE-CARVE (founder GF spec, 2026-06-17) — the GROUND-FLOOR corridor architecture.
 * The 3-zone `[public | corridor | private]` carve makes the corridor a full-width strip, so
 * a public room (living/kitchen/dining) ALWAYS abuts it (`publicOnCorridor` → least-bad). The
 * opposite (corridor on the private side) SEALS the corridor (it loses its only permitted link
 * to the entry — `hall.accessFrom=['living','corridor']`). The sound architecture is HALL-AS-
 * HINGE: split the shell `[ public-zone(living/kitchen/dining) | private-WING ]`, then carve the
 * WING with the SAME 3-zone machinery using the HALL as the wing's "public" band →
 * `[ hall | corridor-strip | private ]`. Result: the public zone borders the HALL (hall.accessFrom
 * ⊇ living ✓); the corridor borders hall + private only — NEVER a public room (✓ no publicOnCorridor);
 * the corridor keeps its hall link (✓ not sealed). Returns null (→ fall through to the 3-zone carve)
 * when it can't run. Caller gates to the HOUSE keep-out path so apartments stay byte-identical.
 */
function tryHallHingeCarve(
    shell: Rect,
    hall: ProgramRoom,
    publicNonHall: readonly ProgramRoom[],
    privateRooms: readonly ProgramRoom[],
    corridor: ProgramRoom,
    master: ProgramRoom | undefined,
    ensuite: ProgramRoom | undefined,
    ensuiteCarveArea: number,
    corridorWidthM?: number,
    // §SUITE-WITHIN-PARENT — the (host → ensuite) suites to carve from the combed private slices.
    // OFF / apartment: the single master suite ⇒ identical to the legacy master→ensuite carve.
    suites: readonly Suite[] = [],
): SubdivideResult | null {
    const W = shell.x1 - shell.x0;
    const H = shell.z1 - shell.z0;
    const splitAxis: 'x' | 'z' = W >= H ? 'x' : 'z';        // split off the public zone along the LONG axis
    const along = splitAxis === 'x' ? W : H;
    const MIN_ZONE = 2.0;
    const publicArea = publicNonHall.reduce((s, r) => s + r.targetAreaM2, 0);
    const privateArea = privateRooms.reduce((s, r) => s + r.targetAreaM2, 0);
    const wingArea = hall.targetAreaM2 + corridor.targetAreaM2 + privateArea;
    const denom = Math.max(EPS, publicArea + wingArea);
    let pubAlong = along * (publicArea / denom);
    pubAlong = Math.min(Math.max(pubAlong, MIN_ZONE), along - MIN_ZONE);
    if (along < 2 * MIN_ZONE - EPS) {                       // too small to split into two usable zones
        console.log(`[D-TGL subdivide] §HALL-HINGE-CARVE infeasible: shell too small to split (along=${along.toFixed(1)}m < ${(2 * MIN_ZONE).toFixed(1)}m) — falling through to 3-zone.`);
        return null;
    }

    // public zone on the LOW side, wing on the HIGH side of the split axis.
    const publicZone: Rect = splitAxis === 'x'
        ? { x0: shell.x0, z0: shell.z0, x1: shell.x0 + pubAlong, z1: shell.z1 }
        : { x0: shell.x0, z0: shell.z0, x1: shell.x1, z1: shell.z0 + pubAlong };
    const wing: Rect = splitAxis === 'x'
        ? { x0: shell.x0 + pubAlong, z0: shell.z0, x1: shell.x1, z1: shell.z1 }
        : { x0: shell.x0, z0: shell.z0 + pubAlong, x1: shell.x1, z1: shell.z1 };

    // Carve the WING as 3 bands stacked along the SPLIT axis from the public-facing edge inward:
    // [ hall | corridor | private ]. The hall band's DEPTH is sized to its TARGET area over the
    // wing's cross extent (NOT tryCarveCorridor's MIN_ZONE_DEPTH-clamped band, which on a wide
    // wing balloons the hall to ≥2 m × wing-width). So the hall stays correctly sized + shaped,
    // borders the public zone (across the split) AND the corridor; the corridor borders hall +
    // private only; private rooms comb off the corridor. Bands span the wing's CROSS dimension.
    let cw = corridorWidthM ?? CORRIDOR_STRIP_WIDTH_M;
    const wingAlong = splitAxis === 'x' ? wing.x1 - wing.x0 : wing.z1 - wing.z0;   // depth along the split axis
    const wingCross = splitAxis === 'x' ? wing.z1 - wing.z0 : wing.x1 - wing.x0;   // band length (full wing cross)
    let hallDepth = hall.targetAreaM2 / Math.max(EPS, wingCross);
    hallDepth = Math.max(hallDepth, roomRule('hall').minShortSideM);              // never thinner than a hall
    // §HALL-HINGE-CORRIDOR-FIT (2026-06-21) — when the private band falls short ONLY because the
    // fixed corridor strip is eating the wing, NARROW the corridor toward its minimum walkable
    // width instead of abandoning the hall-hinge carve. Abandoning it falls through to squarify,
    // which BURIES the private rooms behind the public zone (the bedroom then doors onto the
    // dining room, not circulation — the §DIAG-TOPO-GATE circulation/privacy failure the founder
    // keeps hitting). A 1.0–1.2 m corridor is equally walkable; trading 0.0–0.2 m of corridor for
    // a corridor-combed bedroom is strictly better. SAFE: when the band already passes with the
    // full strip, cw ≤ maxCwForBand so cw is untouched (existing carves stay byte-identical); this
    // only recovers the marginal cases that used to bail.
    const corridorMinW = roomRule('corridor').minShortSideM;                       // never narrower than a walkable corridor
    const maxCwForBand = wingAlong - hallDepth - MIN_ZONE;                         // widest corridor that still leaves a usable private band
    if (cw > maxCwForBand && maxCwForBand >= corridorMinW - EPS) {
        const narrowed = Math.max(corridorMinW, maxCwForBand);
        console.log(
            `[D-TGL subdivide] §HALL-HINGE-CORRIDOR-FIT narrowing corridor ${cw.toFixed(2)}→${narrowed.toFixed(2)}m ` +
            `to keep the private band ≥ ${MIN_ZONE}m (recovers the hall-hinge carve instead of squarify-burying the private rooms).`,
        );
        cw = narrowed;
    }
    if (wingAlong - hallDepth - cw < MIN_ZONE - EPS) {                             // private band too shallow even at min corridor
        console.log(
            `[D-TGL subdivide] §HALL-HINGE-CARVE infeasible: private band too shallow ` +
            `(wingAlong=${wingAlong.toFixed(1)}m − hall=${hallDepth.toFixed(1)} − corridor=${cw.toFixed(1)} = ${(wingAlong - hallDepth - cw).toFixed(1)}m < ${MIN_ZONE}m) ` +
            `— the dominant rect is too small for the programme; falling through to 3-zone.`,
        );
        return null;
    }
    const crossAxis: 'x' | 'z' = splitAxis === 'x' ? 'z' : 'x';                   // private rooms comb along the cross axis
    const hallRect: Rect = splitAxis === 'x'
        ? { x0: wing.x0, z0: wing.z0, x1: wing.x0 + hallDepth, z1: wing.z1 }
        : { x0: wing.x0, z0: wing.z0, x1: wing.x1, z1: wing.z0 + hallDepth };
    const corridorRect: Rect = splitAxis === 'x'
        ? { x0: wing.x0 + hallDepth, z0: wing.z0, x1: wing.x0 + hallDepth + cw, z1: wing.z1 }
        : { x0: wing.x0, z0: wing.z0 + hallDepth, x1: wing.x1, z1: wing.z0 + hallDepth + cw };
    const privateRect: Rect = splitAxis === 'x'
        ? { x0: wing.x0 + hallDepth + cw, z0: wing.z0, x1: wing.x1, z1: wing.z1 }
        : { x0: wing.x0, z0: wing.z0 + hallDepth + cw, x1: wing.x1, z1: wing.z1 };

    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];

    // Public (non-hall) rooms squarified into the public zone — they touch the hall, never the corridor.
    // §HALL-HINGE-LIVING-ON-HALL DEFERRED to P5 (SPEC-SPINE-FIRST §2.3): a full-cross living strip is
    // inherently cavernous on a wide public zone (living min-depth × wide-cross > the 48 m² no-cavern
    // cap), so the correct fix is a CORNER reservation (partial-cross, target-sized, ≥door-width on the
    // hall) + living de-allocation. Until then the plain squarify runs (today's behaviour).
    const pub = placeInRectReported(publicZone, adjacencySortForZone(allocationOrder(publicNonHall)));
    out.push(...pub.placements);
    droppedRooms.push(...pub.droppedRooms);

    // Hall fills its band (the hinge: borders public zone + corridor).
    const hallPub = placeInRectReported(hallRect, [hall]);
    out.push(...hallPub.placements);
    droppedRooms.push(...hallPub.droppedRooms);

    // Corridor IS the wing strip.
    out.push({ roomId: corridor.id, rect: roundRect(corridorRect) });

    // Private rooms combed off the corridor face (every private room a corridor wall).
    const combFaceAxis: 'x' | 'z' = crossAxis;
    const orderedPrivate = adjacencySortForZone(allocationOrder(privateRooms));
    const combMinAlong = (master && ensuite)
        ? (r: ProgramRoom): number => (r.id === master.id
            ? roomRule('master').minShortSideM + roomRule('ensuite').minShortSideM
            : 0)
        : undefined;
    const comb = sliceZoneAlongFace(privateRect, orderedPrivate, combFaceAxis, combMinAlong);
    const priv = comb ?? placeInRectReported(privateRect, orderedPrivate);
    const privatePlacements = [...priv.placements];
    droppedRooms.push(...priv.droppedRooms);

    // §SUITE-WITHIN-PARENT — carve every suite's ensuite from its host (same as the 3-zone
    // path). OFF / apartment: the single master suite ⇒ byte-identical master→ensuite carve.
    carveSuiteEnsuites(privatePlacements, suites, corridorRect, droppedRooms, master?.id);
    out.push(...privatePlacements);

    // §HALL-HINGE-SOUND — return the hinge layout ONLY when it is provably circulation-sound,
    // else null → fall through to the 3-zone carve (so the hinge is STRICTLY non-regressing: it
    // applies only where it produces a connected plan, never where it would seal a room). The
    // required permitted links (mirrors `wallsAndDoors`): corridor↔hall (≥ door), every private
    // room (≠ ensuite) ↔ corridor (≥ door), ensuite↔master (≥ door), living↔hall (≥ door — the
    // ONLY permitted public→hall link), and every public-non-hall room reachable from living via
    // shared walls (open-plan/doors). A room dropped here that the 3-zone keeps would also be
    // caught by the §STAIR-CARVE-NO-DROP comparison upstream — but failing sound first is cleaner.
    const rectOf = new Map(out.map(p => [p.roomId, p.rect]));
    const typeById = new Map<string, string>([hall, corridor, ...publicNonHall, ...privateRooms].map(r => [r.id, r.type]));
    const door = (a: string, b: string): boolean => {
        const ra = rectOf.get(a), rb = rectOf.get(b);
        return !!ra && !!rb && sharedWallLengthM(ra, rb) >= STAIR_DOOR_MIN_M - EPS;
    };
    const touch = (a: string, b: string): boolean => {
        const ra = rectOf.get(a), rb = rectOf.get(b);
        return !!ra && !!rb && rectsShareWall(ra, rb);
    };
    const livingRoom = publicNonHall.find(r => r.type === 'living');
    const sound = (): string | null => {                                       // null ⇒ sound; string ⇒ the failing check
        if (!door(corridor.id, hall.id)) return 'corridor↔hall not a door-width wall';
        // OUTPUT check (founder Fix 1) — the corridor must NOT abut ANY public room. By construction
        // the hall band sits between the public zone and the corridor, but verify the realised
        // geometry so a squarify edge-case that wraps a public room onto the corridor falls through
        // to the 3-zone instead of shipping the publicOnCorridor contamination.
        for (const r of publicNonHall) {
            if (door(r.id, corridor.id)) return `public room ${r.type} abuts the corridor`;
        }
        for (const r of privateRooms) {                                        // every private room doors onto the corridor
            if (ensuite && r.id === ensuite.id) continue;
            if (!door(r.id, corridor.id)) return `private room ${r.type} not on the corridor (sealed/dropped)`;
        }
        if (master && ensuite && !door(ensuite.id, master.id)) return 'ensuite not on master';
        // The public cluster reaches the entry ONLY via living→hall (hall.accessFrom=['living','corridor']).
        if (publicNonHall.length > 0) {
            if (!livingRoom || !door(livingRoom.id, hall.id)) return 'living↔hall not a door-width wall';
            const reach = new Set<string>([livingRoom.id]);
            for (let changed = true; changed;) {
                changed = false;
                for (const r of publicNonHall) {
                    if (reach.has(r.id)) continue;
                    if ([...reach].some(id => touch(r.id, id))) { reach.add(r.id); changed = true; }
                }
            }
            const stranded = publicNonHall.find(r => !reach.has(r.id));
            if (stranded) return `public room ${stranded.type} can't reach living`;
        }
        // DIMENSIONAL soundness — reusing tryCarveCorridor for the wing gives the hall a full-width
        // MIN_ZONE_DEPTH band (and the squarified public zone can over-grow living), ballooning a
        // room past its §AREA-FRACTIONS target (the house dimensional tests cap hall/living). Reject
        // when ANY room exceeds 1.2× its bubble target so the hinge falls through to the 3-zone's
        // well-tested allocation there — strictly non-regressing. (ensuite carved from master has no
        // own target here → skipped; master's hoisted target already covers it.)
        const targetById = new Map<string, number>(
            [hall, corridor, ...publicNonHall, ...privateRooms].map(r => [r.id, r.targetAreaM2]),
        );
        for (const p of out) {
            const t = targetById.get(p.roomId);
            if (t === undefined) continue;
            const area = (p.rect.x1 - p.rect.x0) * (p.rect.z1 - p.rect.z0);
            // No room may balloon past 1.15× its bubble target — the squarified public zone can
            // over-concentrate excess into the biggest room (a "cavern"). Reject → fall through to
            // the 3-zone's more even fill. Target-relative (the bubble target is sized to the full
            // plate, so this is NOT distorted by the dominant-rect carve shell).
            const ty = typeById.get(p.roomId) ?? '?';
            if (area > t * 1.15 + EPS) return `${ty} ${area.toFixed(1)}m² > 1.15× target ${t.toFixed(1)}m² (cavern)`;
        }
        return null;
    };
    const unsoundReason = sound();
    if (unsoundReason) {
        console.log(`[D-TGL subdivide] §HALL-HINGE-CARVE infeasible: ${unsoundReason} — falling through to the 3-zone carve.`);
        return null;
    }

    console.log(
        `[D-TGL subdivide] §HALL-HINGE-CARVE applied: [public(${publicNonHall.length}) | hall | corridor | private(${privateRooms.length})] ` +
        `(public rooms border the hall, NOT the corridor — publicOnCorridor avoided by construction)`,
    );
    return { placements: out, droppedRooms };
}

function trySingleRectCarve(
    shell: Rect,
    graph: BubbleGraph,
    corridorWidthM?: number,
    // §STAIR-CIRC-FACE (founder defect, 2026-06-11) — when a stair keep-out is present, the
    // corridor MUST be reachable from the stair. The double-loaded (centre-strip) §NO-PUBLIC
    // carve buries the corridor down the MIDDLE of the plate, so it never abuts a keep-out on
    // an EDGE — even after the §STAIR-CIRC-FACE reflection (a centred strip reflects to itself).
    // The single-loaded carve lays the corridor against ONE FACE, which the reflection CAN bring
    // to the keep-out edge. So on a keep-out storey we PREFER single-loaded; double-loaded stays
    // the fallback. False (the default) ⇒ byte-identical (apartment + every keep-out-free path).
    preferSingleLoaded: boolean = false,
    // §ENTRANCE-HALL-ON-SHELL (tracker §57.4) — when the shell was RECTIFIED (sheared quad),
    // suppress the hall-slice (see SubdivideOptions.shellRectified). Default false ⇒ slice runs.
    shellRectified: boolean = false,
    // §STAIR-FACE-AXIS (founder upper-floor fix, 2026-06-17) — the stair keep-out in the SAME frame
    // as `shell`, so the §NO-PUBLIC single-loaded carve can lay the corridor on the stair's edge
    // (the corridor reaches the stair by construction). Undefined ⇒ unchanged (apartment + every
    // keep-out-free path is byte-identical).
    keepOut?: Rect,
): SubdivideResult | null {
    const corridor = graph.rooms.find(r => r.type === 'corridor');
    const master   = graph.rooms.find(r => r.type === 'master');
    const ensuite  = graph.rooms.find(r => r.type === 'ensuite');

    // §SUITE-WITHIN-PARENT (doctrine §20.3) — collect EVERY (host → ensuite) suite from the
    // `ensuiteHostId` stamps the bubble graph set. OFF / apartment: exactly ONE suite (the
    // master + its ensuite) ⇒ this is identical to the legacy single-ensuite handling below
    // (BYTE-IDENTICAL). ON (gated house-upper): one suite PER bedroom — each is hoisted onto
    // its host + excluded from band packing here, then carved from its host's corner after the
    // comb. An ensuite WITHOUT a resolved host stays a normal room (legacy fallback).
    const suites: Suite[] = [];
    for (const r of graph.rooms) {
        if (r.type !== 'ensuite') continue;
        if (!r.ensuiteHostId) continue;
        if (!graph.rooms.some(h => h.id === r.ensuiteHostId)) continue;   // host must exist
        suites.push({ hostId: r.ensuiteHostId, ensuite: r });
    }
    const suiteEnsuiteIds = new Set(suites.map(s => s.ensuite.id));

    // Bucket rooms by privacy class (excluding the corridor + EVERY suite ensuite, which are
    // carved from their hosts below — never band-packed). A lone legacy `ensuite` with no host
    // stamp is also excluded (back-compat with the pre-suite single-ensuite handling).
    const publicRooms: ProgramRoom[] = [];
    const privateRooms: ProgramRoom[] = [];
    for (const r of graph.rooms) {
        if (corridor && r.id === corridor.id) continue;
        if (suiteEnsuiteIds.has(r.id)) continue;
        if (ensuite && r.id === ensuite.id && suites.length === 0) continue;   // legacy host-less ensuite
        const p = roomRule(r.type).privacy;
        if (p === 'public' || p === 'circulation') publicRooms.push(r);
        else privateRooms.push(r);
    }
    // No corridor, or no private rooms ⇒ the carve is pointless; fall back to
    // the existing whole-shell squarify.
    if (!corridor || privateRooms.length === 0) return null;

    // Hoist each suite ensuite's target area onto its HOST so squarify/comb gives the host the
    // COMBINED footprint — we slice the ensuite out of it after. (Done BEFORE the §NO-PUBLIC-CARVE
    // branch so the double-loaded path inherits the same host→ensuite carve.) For the OFF /
    // apartment single-suite case this hoists exactly the master's ensuite area onto the master,
    // identical to the legacy code (BYTE-IDENTICAL). `ensuiteCarveArea` is retained as the MASTER
    // suite's area (the existing `combMinAlong` / §MASTER-SURPLUS logic keys off the master only).
    let ensuiteCarveArea = 0;
    for (const suite of suites) {
        const hostIdx = privateRooms.findIndex(r => r.id === suite.hostId);
        if (hostIdx >= 0) {
            privateRooms[hostIdx] = {
                ...privateRooms[hostIdx]!,
                targetAreaM2: privateRooms[hostIdx]!.targetAreaM2 + suite.ensuite.targetAreaM2,
            };
        }
        if (master && suite.hostId === master.id) ensuiteCarveArea = suite.ensuite.targetAreaM2;
    }

    // §HALL-HINGE-CARVE (founder GF spec, 2026-06-17) — the GROUND FLOOR (a hall + non-hall
    // public rooms + private rooms) zones the HALL between the public zone and the corridor so
    // no public room abuts the corridor while the corridor keeps its hall link. Gated to the
    // HOUSE keep-out path (`preferSingleLoaded`) so apartments + the upper §NO-PUBLIC storeys
    // are byte-identical. Falls through to the 3-zone carve when it can't run (no regression).
    if (preferSingleLoaded) {
        const hall = publicRooms.find(r => r.type === 'hall');
        const publicNonHall = publicRooms.filter(r => r.type !== 'hall');
        if (hall && publicNonHall.length > 0 && privateRooms.length > 0) {
            const hinge = tryHallHingeCarve(
                shell, hall, publicNonHall, privateRooms, corridor, master, ensuite, ensuiteCarveArea, corridorWidthM, suites,
            );
            if (hinge) return hinge;
        }
    }

    // §NO-PUBLIC-CARVE (founder defect, 2026-06-10) — when the programme has a
    // corridor + private rooms but NO public room (the UPPER HOUSE STOREY:
    // bedrooms + baths + a landing/corridor), the 3-zone carve below can't run
    // (it needs a public zone). Without it the corridor was squarified as a
    // treemap cell touching only the front-row master → every other bedroom/bath
    // SEALED (the prod log: 8 rooms / 2 doors, r2/r3/r4/r6/r7 NO DOOR). Run a
    // DOUBLE-LOADED corridor instead: a central strip with private rooms combed
    // off BOTH sides so EVERY private room shares a wall with the corridor. See
    // `tryNoPublicDoubleLoadedCarve`.
    if (publicRooms.length === 0) {
        // §STAIR-CIRC-FACE — on a keep-out storey, try the single-loaded (one-face) corridor
        // FIRST so the §STAIR-CIRC-FACE reflection can bring it to the keep-out edge. Falls
        // through to the double-loaded carve when single-loaded is infeasible (no regression).
        if (preferSingleLoaded) {
            const single = tryNoPublicSingleLoadedCarve(
                shell, corridor, privateRooms, master, ensuite, ensuiteCarveArea, corridorWidthM, keepOut, suites,
            );
            if (single) return single;
        }
        return tryNoPublicDoubleLoadedCarve(
            shell, corridor, privateRooms, master, ensuite, ensuiteCarveArea, corridorWidthM, keepOut, suites,
        );
    }

    const publicAreaTarget  = publicRooms.reduce((s, r) => s + r.targetAreaM2, 0);
    const privateAreaTarget = privateRooms.reduce((s, r) => s + r.targetAreaM2, 0);
    const carve = tryCarveCorridor(shell, publicAreaTarget, privateAreaTarget, corridorWidthM);
    if (!carve) return null;

    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];
    // Corridor IS the strip.
    out.push({ roomId: corridor.id, rect: roundRect(carve.corridorRect) });
    // Public + private rooms squarified into their own sub-rects. §ADJACENCY-SORT
    // (Phase 4) reorders each zone AFTER allocationOrder so high-preference pairs
    // (kitchen↔dining in public; master↔bedrooms off the corridor in private) land in
    // the same squarify strip → spatially adjacent. Uniform-preference zones are
    // identity (byte-identical to the pre-Phase-4 allocationOrder placement).
    // §ENTRANCE-HALL-ON-SHELL (tracker §57.4, 2026-06-11) — FIRST try to seat the hall
    // as a dedicated full-depth shell-edge slice so it bounds a PERIMETER wall (the front
    // door wall) AND the corridor. Falls back to the plain squarify (byte-identical) when
    // there is no hall, the public zone is hall-only, or the carve can't fit every public
    // room — never drops a room to force the hall out.
    const hallCarve = shellRectified
        ? null   // §ENTRANCE-HALL-ON-SHELL suppressed on a rectified/sheared shell (see option doc)
        : placePublicWithHallOnShell(carve.publicRect, publicRooms, carve.orientation);
    const pub = hallCarve ?? placeInRectReported(carve.publicRect, adjacencySortForZone(allocationOrder(publicRooms)));
    out.push(...pub.placements);
    droppedRooms.push(...pub.droppedRooms);
    // §DIAG-ENTRANCE-PERIMETER (tracker §57.4, 2026-06-11) — per-storey engine-side proof
    // that the entrance hall bounds a shell/exterior (perimeter) wall, so the editor's
    // §A.21.D29 / §DIAG-ENTRANCE-FIX resolver can host the front door on it. The publicRect's
    // outer edges (everything except the corridor-facing split) are perimeter walls; a hall
    // footprint that touches one of those edges fronts the perimeter. Logs YES + the shell-
    // wall length so the next console paste turns the editor's `⚠ NOT-ON-PERIMETER` to ✓.
    {
        const hallRoom = publicRooms.find(r => r.type === 'hall');
        const hallP = hallRoom ? pub.placements.find(p => p.roomId === hallRoom.id) : undefined;
        if (hallRoom && hallP) {
            const pr = carve.publicRect;
            // Perimeter edges of the public rect = its outer edges MINUS the corridor-facing
            // one. horizontal ⇒ corridor on +z (publicRect.z1); so perimeter = z0, x0, x1.
            // vertical ⇒ corridor on +x (publicRect.x1); so perimeter = x0, z0, z1.
            const touchesEdge = (a: number, b: number): boolean => Math.abs(a - b) < ALIGNMENT_SNAP_EPS_M;
            const hr = hallP.rect;
            let shellLenM = 0;
            if (carve.orientation === 'horizontal') {
                if (touchesEdge(hr.z0, pr.z0)) shellLenM = Math.max(shellLenM, hr.x1 - hr.x0);   // top shell wall
                if (touchesEdge(hr.x0, pr.x0)) shellLenM = Math.max(shellLenM, hr.z1 - hr.z0);   // left shell wall
                if (touchesEdge(hr.x1, pr.x1)) shellLenM = Math.max(shellLenM, hr.z1 - hr.z0);   // right shell wall
            } else {
                if (touchesEdge(hr.x0, pr.x0)) shellLenM = Math.max(shellLenM, hr.z1 - hr.z0);   // left shell wall
                if (touchesEdge(hr.z0, pr.z0)) shellLenM = Math.max(shellLenM, hr.x1 - hr.x0);   // bottom shell wall
                if (touchesEdge(hr.z1, pr.z1)) shellLenM = Math.max(shellLenM, hr.x1 - hr.x0);   // top shell wall
            }
            const boundsShell = shellLenM >= STAIR_DOOR_MIN_M - EPS;   // ≥ a door width (0.9 m)
            console.log(
                `[D-TGL subdivide] §DIAG-ENTRANCE-PERIMETER hall=${hallRoom.id} carve=${hallCarve ? 'SHELL-SLICE' : 'squarify'} ` +
                `boundsShellWall=${boundsShell ? 'YES' : 'NO'} shellWallLenM=${shellLenM.toFixed(2)} ` +
                `(YES ⇒ the front door can be hosted on the hall's perimeter wall — editor §DIAG-ENTRANCE turns ✓; ` +
                `NO ⇒ hall is interior, front door falls back to a neighbour façade)`,
            );
        }
    }
    const orderedPrivate = adjacencySortForZone(allocationOrder(privateRooms));
    // §EVERY-ROOM-ACCESS-COMB (A.21.D61, 2026-06-09) — FIRST try laying the private
    // rooms as a single row of full-depth slices PERPENDICULAR to the corridor face,
    // so EVERY private room shares a wall with the corridor strip (a guaranteed
    // corridor-adjacent wall for its door). This is the accessibility keystone: the
    // founder's "every room a door onto circulation". The squarified treemap (the
    // fallback below) buries deeper rows behind front-row rooms → no corridor wall →
    // §SEALED (the prod evidence: 8 rooms / 2 doors). The comb is best-effort: it
    // returns null when a slice can't keep every room above its floor, in which case
    // we keep the squarified placement (never worse than before).
    // faceAxis: corridor 'horizontal' ⇒ private abuts along x ⇒ slice along x; etc.
    const combFaceAxis: 'x' | 'z' = carve.orientation === 'horizontal' ? 'x' : 'z';
    // §COMB-MIN-ALONG — the master carrying an ensuite needs enough ALONG-FACE width
    // that `tryCarveEnsuiteFromMaster` can slice the ensuite strip out AND leave the
    // master above its own minShortSide; otherwise the narrow comb master slice forces
    // the ensuite to be dropped. masterMin + ensuiteMin is the safe floor (a width-axis
    // carve keeps the master ≥ masterMin; a depth-axis carve already keeps full width).
    const combMinAlong = (master && ensuite)
        ? (r: ProgramRoom): number => (r.id === master.id
            ? roomRule('master').minShortSideM + roomRule('ensuite').minShortSideM
            : 0)
        : undefined;
    const comb = sliceZoneAlongFace(carve.privateRect, orderedPrivate, combFaceAxis, combMinAlong);
    let priv: SubdivideResult = comb ?? placeInRectReported(carve.privateRect, orderedPrivate);
    console.log(
        `[D-TGL subdivide] §EVERY-ROOM-ACCESS-COMB ${comb ? 'APPLIED' : 'fell back to squarify'} ` +
        `privateRooms=${orderedPrivate.length} faceAxis=${combFaceAxis} ` +
        `(${comb ? 'every private room abuts the corridor face' : 'comb infeasible — floors/depth too tight'})`,
    );
    // §MASTER-SURPLUS (F3) — grow the master past every other bedroom by donating area
    // from the largest bedroom (deterministic, no-drop). `ensuiteCarveArea` is the area
    // later sliced from the master for its en-suite, so the surplus holds AFTER the carve.
    // Only meaningful on the squarified path (the comb already gives the master a full
    // slice; applyMasterSurplus re-squarifies, so skip it when the comb applied to keep
    // every room corridor-adjacent).
    if (master && !comb) priv = applyMasterSurplus(carve.privateRect, orderedPrivate, priv, master.id, ensuiteCarveArea);
    const privatePlacements = [...priv.placements];
    droppedRooms.push(...priv.droppedRooms);

    // §SUITE-WITHIN-PARENT — carve every suite's ensuite from its host's squarified slice. OFF /
    // apartment: exactly the master suite ⇒ identical to the legacy single master→ensuite carve.
    carveSuiteEnsuites(privatePlacements, suites, carve.corridorRect, droppedRooms, master?.id);
    out.push(...privatePlacements);
    return { placements: out, droppedRooms };
}

/**
 * §NO-PUBLIC-CARVE (founder defect, 2026-06-10) — the corridor-spine carve for a
 * NO-PUBLIC programme (an UPPER HOUSE STOREY: corridor + bedrooms + baths, no
 * living/kitchen/dining). Places the corridor as a CENTRAL strip and combs the
 * private rooms off BOTH sides so EVERY private room shares a wall with the
 * corridor — the founder's hard requirement "all bedrooms reachable only via a
 * corridor". The two-sided split roughly HALVES each side's depth, keeping the
 * §EVERY-ROOM-ACCESS-COMB feasible on a deep upper plate.
 *
 * Master+ensuite are kept on the SAME side (the ensuite is carved from the master
 * after combing — `ensuite.accessFrom = ['master']`). Returns null when the
 * double-loaded carve can't fit OR a side's comb is infeasible, so the caller
 * falls back to the whole-shell squarify (never worse than the pre-fix behaviour).
 * Pure + deterministic (greedy LPT split + stable sort — no RNG, ADR-0061).
 */
function tryNoPublicDoubleLoadedCarve(
    shell: Rect,
    corridor: ProgramRoom,
    privateRooms: readonly ProgramRoom[],
    master: ProgramRoom | undefined,
    ensuite: ProgramRoom | undefined,
    ensuiteCarveArea: number,
    corridorWidthM?: number,
    // §LU-CORRIDOR-COMPETE (2026-06-21) — the stair keep-out (if any). When the straight
    // double-loaded corridor does NOT reach it (stair would ship isolated), a stair-anchored
    // L corridor that DOES reach it is preferred.
    keepOut?: Rect,
    // §SUITE-WITHIN-PARENT — the (host → ensuite) suites to carve. OFF / apartment: the single
    // master suite ⇒ byte-identical. ON (house upper): one per bedroom.
    suites: readonly Suite[] = [],
): SubdivideResult | null {
    const carve = tryCarveDoubleLoadedCorridor(shell, corridorWidthM);
    // §NO-SEAL-SINGLE-LOAD (tracker §55) — the SHORT axis can't host the strip + TWO
    // usable private zones (a shallow plate: shortDim < strip + 2·MIN_ZONE_DEPTH). The
    // double-loaded carve never fires, so previously the caller squarified → back-row
    // rooms SEALED. A single-loaded corridor needs only ONE usable zone (strip + ONE
    // MIN_ZONE_DEPTH), so it fits this shallow plate and keeps every room corridor-
    // adjacent. Try it before bailing to the squarify.
    if (!carve) {
        return tryNoPublicSingleLoadedCarve(
            shell, corridor, privateRooms, master, ensuite, ensuiteCarveArea, corridorWidthM,
        );
    }

    const orderedPrivate = adjacencySortForZone(allocationOrder(privateRooms));
    // Split the private rooms into two balanced groups (greedy longest-processing-
    // time on target area) so the two sides of the corridor fill comparably and no
    // side is starved. The MASTER is pinned to side A first so the ensuite carve
    // (master-only access) always has a host; the rest are dealt to whichever side
    // currently holds less area. Stable + deterministic.
    const sideA: ProgramRoom[] = [];
    const sideB: ProgramRoom[] = [];
    let areaA = 0, areaB = 0;
    if (master) {
        const m = orderedPrivate.find(r => r.id === master.id);
        if (m) { sideA.push(m); areaA += Math.max(EPS, m.targetAreaM2); }
    }
    for (const r of orderedPrivate) {
        if (master && r.id === master.id) continue;             // already pinned to side A
        if (areaA <= areaB) { sideA.push(r); areaA += Math.max(EPS, r.targetAreaM2); }
        else { sideB.push(r); areaB += Math.max(EPS, r.targetAreaM2); }
    }

    // Comb each side off its corridor face. The corridor runs along the SAME axis
    // for both sides; 'horizontal' strip ⇒ comb slices along 'x', 'vertical' ⇒ 'z'.
    const combFaceAxis: 'x' | 'z' = carve.orientation === 'horizontal' ? 'x' : 'z';
    // §SUITE-WITHIN-PARENT — EVERY suite HOST (not just the master) needs hostMin + ensuiteMin
    // of along-face width so its ensuite carve leaves the host above its own minShortSide. OFF /
    // apartment: the single suite is the master ⇒ identical to the legacy master-only widen.
    const combMinAlong = suiteCombMinAlong(suites, master, ensuite);
    const combA = sliceZoneAlongFace(carve.sideARect, sideA, combFaceAxis, combMinAlong);
    const combB = sideB.length > 0
        ? sliceZoneAlongFace(carve.sideBRect, sideB, combFaceAxis, combMinAlong)
        : { placements: [], droppedRooms: [] };
    // §NO-SEAL-SINGLE-LOAD (tracker §55) — a side that can't comb every room above its
    // floor previously bailed the whole no-public carve to the squarify (which buries
    // back-row rooms → SEALED). Before giving up, try a SINGLE-LOADED corridor: ONE
    // private zone (full plate depth − strip) combed off ONE corridor face. It needs
    // only one usable zone, not two halved ones, so it fits a shallow / stair-fragmented
    // upper plate where the double-loaded split starves both sides — and EVERY room still
    // shares a wall with the corridor (never sealed). Only the double-loaded path falls
    // through here; the single-loaded carve never seals worse than squarify (it is gated
    // on the same per-room floors), so this is strictly an improvement.
    if (!combA || !combB) {
        const single = tryNoPublicSingleLoadedCarve(
            shell, corridor, privateRooms, master, ensuite, ensuiteCarveArea, corridorWidthM, undefined, suites,
        );
        if (single) {
            console.log(
                `[D-TGL subdivide] §NO-PUBLIC-CARVE comb infeasible ` +
                `(sideA=${combA ? 'ok' : 'FAIL'} sideB=${combB ? 'ok' : 'FAIL'}) — ` +
                `§NO-SEAL-SINGLE-LOAD rescued (single-loaded corridor; every room abuts it)`,
            );
            return single;
        }
        // §LU-CORRIDOR (Step 3, SPEC-0074 Fix A) — before bailing to the whole-shell squarify
        // (which buries back-row rooms behind the front row → SEALED), try an L-CORRIDOR: lay
        // the private rooms along TWO PERPENDICULAR corridor legs so they all fit AND every room
        // keeps a corridor-adjacent wall. Fires ONLY here, after BOTH the double- AND single-
        // loaded straight combs failed → on every plate the straight carve already handled, this
        // is unreached (byte-identical, ADR-0061 I2). Skipped when an ensuite must be carved from
        // the master (the L-comb places rooms as plain slices; the master→ensuite carve is the
        // straight path's job) — that case keeps the existing squarify fallback (no regression).
        // §SUITE-WITHIN-PARENT — also skip the L-comb when ANY suite must be carved (plain slices
        // can't host a corner ensuite); the straight carve owns the suite carve.
        if (suites.length === 0 && (!ensuite || ensuiteCarveArea <= EPS)) {
            const lComb = planLCorridorComb(
                shell, orderedPrivate, corridorWidthM ?? CORRIDOR_STRIP_WIDTH_M, combMinAlong, corridor.id,
            );
            if (lComb && lComb.corridorPlacement) {
                console.log(
                    `[D-TGL subdivide] §LU-CORRIDOR APPLIED L-corridor (straight comb infeasible): ` +
                    `corridor=${corridor.id} rooms=${lComb.placements.length} legs=${lComb.legs.length} ` +
                    `(every private room abuts the L corridor)`,
                );
                return {
                    placements: [lComb.corridorPlacement, ...lComb.placements],
                    droppedRooms: [],
                    cellPolygonById: lComb.cellPolygonById,
                };
            }
        }
        console.log(
            `[D-TGL subdivide] §NO-PUBLIC-CARVE comb infeasible ` +
            `(sideA=${combA ? 'ok' : 'FAIL'} sideB=${combB ? 'ok' : 'FAIL'}) — fell back to squarify`,
        );
        return null;
    }

    // §LU-CORRIDOR-COMPETE — both straight combs succeeded, but if the straight corridor does NOT
    // share a door-width wall with the stair keep-out, the stair ships ISOLATED (the founder's live
    // "stair not connected on the upper floor" defect). Try a STAIR-ANCHORED L corridor (Step 2
    // orients a leg to the stair); if it places every room AND its ring reaches the keep-out, PREFER
    // it. Bounded: fires only when keepOut exists AND the straight corridor misses it AND the L
    // reaches it → plates where the straight corridor already reaches the stair are byte-identical
    // (ADR-0061 I2). Skipped when an ensuite must be carved from the master (the L lays plain slices;
    // the master→ensuite carve is the straight path's job).
    if (keepOut && suites.length === 0 && (!ensuite || ensuiteCarveArea <= EPS)) {
        const DOOR_W = 0.8;
        const straightReachesStair = polyRectSharedWallM(rectPolygon(roundRect(carve.corridorRect)), keepOut) >= DOOR_W;
        if (!straightReachesStair) {
            const anchor: Pt = { x: (keepOut.x0 + keepOut.x1) / 2, z: (keepOut.z0 + keepOut.z1) / 2 };
            const lc = planLCorridorComb(
                shell, orderedPrivate, corridorWidthM ?? CORRIDOR_STRIP_WIDTH_M, combMinAlong, corridor.id, anchor,
            );
            if (lc && lc.corridorPlacement && lc.cellPolygonById) {
                const lRing = lc.cellPolygonById.get(corridor.id) ?? [];
                if (polyRectSharedWallM(lRing, keepOut) >= DOOR_W) {
                    console.log(
                        `[D-TGL subdivide] §LU-CORRIDOR-COMPETE L-corridor PREFERRED — straight corridor ` +
                        `misses the stair keep-out; the stair-anchored L reaches it: corridor=${corridor.id} ` +
                        `rooms=${lc.placements.length}`,
                    );
                    return {
                        placements: [lc.corridorPlacement, ...lc.placements],
                        droppedRooms: [],
                        cellPolygonById: lc.cellPolygonById,
                    };
                }
            }
        }
    }

    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];
    out.push({ roomId: corridor.id, rect: roundRect(carve.corridorRect) });
    const privatePlacements = [...combA.placements, ...combB.placements];
    droppedRooms.push(...combA.droppedRooms, ...combB.droppedRooms);

    // §SUITE-WITHIN-PARENT — carve every suite's ensuite out of its host's combed slice
    // (host-only access). OFF / apartment: the single master suite ⇒ byte-identical.
    carveSuiteEnsuites(privatePlacements, suites, carve.corridorRect, droppedRooms, master?.id);
    out.push(...privatePlacements);
    console.log(
        `[D-TGL subdivide] §NO-PUBLIC-CARVE APPLIED double-loaded corridor: ` +
        `corridor=${corridor.id} sideA=[${sideA.map(r => r.id).join(',')}] ` +
        `sideB=[${sideB.map(r => r.id).join(',')}] orientation=${carve.orientation} ` +
        `(every private room abuts the central corridor)`,
    );
    return { placements: out, droppedRooms };
}

/**
 * §NO-SEAL-SINGLE-LOAD (tracker §55, 2026-06-11) — the SINGLE-LOADED corridor carve for
 * a NO-PUBLIC programme (an upper house storey) when the double-loaded carve / comb is
 * infeasible (a shallow or stair-fragmented plate starves the two halved sides). Lays
 * the corridor as a strip against ONE long face and combs ALL private rooms off it as a
 * single row, so EVERY private room shares a wall with the corridor — never sealed. The
 * single private zone keeps the FULL plate depth (minus the strip), so the comb fits a
 * much wider range of plates than the double-loaded split.
 *
 * Returns null when the single-loaded carve can't fit OR the one-face comb is infeasible
 * (the caller then keeps the squarify — strictly no worse than the pre-fix behaviour).
 * Master+ensuite are combed on the same row (ensuite carved from the master slice,
 * `ensuite.accessFrom = ['master']`). Pure + deterministic.
 */
function tryNoPublicSingleLoadedCarve(
    shell: Rect,
    corridor: ProgramRoom,
    privateRooms: readonly ProgramRoom[],
    master: ProgramRoom | undefined,
    ensuite: ProgramRoom | undefined,
    ensuiteCarveArea: number,
    corridorWidthM?: number,
    // §STAIR-FACE-AXIS (founder upper-floor fix) — the stair keep-out (shell frame). When present,
    // lay the corridor strip on the keep-out's edge so it SHARES A WALL with the stair (the corridor
    // reaches the stair by construction, not via a synthetic stub). Falls through to the shell-axis
    // carve when absent or infeasible.
    keepOut?: Rect,
    // §SUITE-WITHIN-PARENT — the (host → ensuite) suites to carve. OFF / apartment: the single
    // master suite ⇒ byte-identical. ON (house upper): one per bedroom.
    suites: readonly Suite[] = [],
): SubdivideResult | null {
    const keepOutCarve = keepOut ? tryCarveSingleLoadedCorridorToKeepOut(shell, keepOut, corridorWidthM) : null;
    const carve = keepOutCarve ?? tryCarveSingleLoadedCorridor(shell, corridorWidthM);
    if (!carve) return null;

    const orderedPrivate = adjacencySortForZone(allocationOrder(privateRooms));
    // Comb every private room off the single corridor face (one row). 'horizontal'
    // strip ⇒ slice along 'x'; 'vertical' ⇒ slice along 'z' — same convention as the
    // double-loaded path. The master carrying an ensuite needs masterMin+ensuiteMin of
    // along-face width so the ensuite carve leaves the master above its own floor.
    const combFaceAxis: 'x' | 'z' = carve.orientation === 'horizontal' ? 'x' : 'z';
    // §SUITE-WITHIN-PARENT — widen EVERY suite host (not just the master). OFF / apartment: the
    // single master suite ⇒ identical to the legacy master-only widen.
    const combMinAlong = suiteCombMinAlong(suites, master, ensuite);
    const comb = sliceZoneAlongFace(carve.privateRect, orderedPrivate, combFaceAxis, combMinAlong);
    if (!comb) return null;                               // one-face comb still infeasible → squarify

    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];
    out.push({ roomId: corridor.id, rect: roundRect(carve.corridorRect) });
    const privatePlacements = [...comb.placements];
    droppedRooms.push(...comb.droppedRooms);

    // §SUITE-WITHIN-PARENT — carve every suite's ensuite out of its host's combed slice
    // (host-only access). OFF / apartment: the single master suite ⇒ byte-identical.
    carveSuiteEnsuites(privatePlacements, suites, carve.corridorRect, droppedRooms, master?.id);
    out.push(...privatePlacements);
    console.log(
        `[D-TGL subdivide] §NO-SEAL-SINGLE-LOAD APPLIED single-loaded corridor: ` +
        `corridor=${corridor.id} private=[${orderedPrivate.map(r => r.id).join(',')}] ` +
        `orientation=${carve.orientation} face=${keepOutCarve ? 'STAIR-EDGE (§STAIR-FACE-AXIS — corridor laid on the stair wall)' : 'shell-axis'} ` +
        `(every private room abuts the corridor)`,
    );
    return { placements: out, droppedRooms };
}

// ── §L4-δ-1b: constructive AlignmentField pre-Pareto snap ────────────────────

/**
 * Cluster a list of 1-D coordinates so that any two coords within
 * `ALIGNMENT_SNAP_EPS_M` of each other land in the same cluster. Sort + sweep:
 * O(n log n). Returns an array of arrays of ORIGINAL coords (NOT indices) per
 * cluster, preserving the sort order — callers compute the mean to drive the
 * snap.
 */
function clusterCoords(coords: readonly number[]): number[][] {
    if (coords.length === 0) return [];
    const sorted = coords.slice().sort((a, b) => a - b);
    const clusters: number[][] = [];
    let current: number[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i++) {
        const v = sorted[i]!;
        // Compare against the LAST member of the current cluster — pairwise
        // proximity is sufficient because the input is sorted (transitivity
        // within the cluster's diameter is acceptable: the mean still lies
        // within ε of every member for the cluster sizes the subdivider
        // produces, and the SCORING axis uses the same neighbour-only test).
        if (v - current[current.length - 1]! <= ALIGNMENT_SNAP_EPS_M) {
            current.push(v);
        } else {
            clusters.push(current);
            current = [v];
        }
    }
    clusters.push(current);
    return clusters;
}

/**
 * Build a `coord → snapped coord` lookup for every coord in `coords`. Clusters
 * of ≤ 1 element are passed through unchanged (defensive: nothing to snap to).
 * Clusters of ≥ 2 elements are snapped to the cluster mean.
 */
function buildSnapMap(coords: readonly number[]): Map<number, number> {
    const map = new Map<number, number>();
    for (const cluster of clusterCoords(coords)) {
        if (cluster.length <= 1) {
            // Singleton: leave it alone.
            for (const c of cluster) map.set(c, c);
            continue;
        }
        const mean = cluster.reduce((s, c) => s + c, 0) / cluster.length;
        for (const c of cluster) map.set(c, round6(mean));
    }
    return map;
}

/**
 * Post-pass axis-line snap. Collects every placement rect's X-edges + Z-edges,
 * clusters each axis independently inside `ALIGNMENT_SNAP_EPS_M`, and snaps
 * each rect's edges to the cluster means.
 *
 * Defensive: any snap that would invert a rect (`left ≥ right` OR
 * `bottom ≥ top` post-snap) is dropped for THAT rect — the rect keeps its
 * original edges on the offending axis. This preserves the subdivider's
 * non-overlap + ≥-floor guarantees even when an edge cluster's mean lies
 * outside one of its members' opposite edge.
 */
export function snapAxisLines(placements: readonly RoomPlacement[]): RoomPlacement[] {
    if (placements.length < 2) return placements.slice();
    const xEdges: number[] = [];
    const zEdges: number[] = [];
    for (const p of placements) {
        xEdges.push(p.rect.x0, p.rect.x1);
        zEdges.push(p.rect.z0, p.rect.z1);
    }
    const xSnap = buildSnapMap(xEdges);
    const zSnap = buildSnapMap(zEdges);
    const out: RoomPlacement[] = [];
    for (const p of placements) {
        const x0n = xSnap.get(p.rect.x0) ?? p.rect.x0;
        const x1n = xSnap.get(p.rect.x1) ?? p.rect.x1;
        const z0n = zSnap.get(p.rect.z0) ?? p.rect.z0;
        const z1n = zSnap.get(p.rect.z1) ?? p.rect.z1;
        // Defensive: an inverted/degenerate snap on an axis means we keep that
        // axis's original edges. Apply per-axis so a bad X snap doesn't undo
        // a good Z snap (and vice versa).
        const xOk = x1n - x0n > EPS;
        const zOk = z1n - z0n > EPS;
        out.push({
            roomId: p.roomId,
            rect: roundRect({
                x0: xOk ? x0n : p.rect.x0,
                x1: xOk ? x1n : p.rect.x1,
                z0: zOk ? z0n : p.rect.z0,
                z1: zOk ? z1n : p.rect.z1,
            }),
        });
    }
    return out;
}

// ── §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08, re-done with the sealing fix) ──

/** Two rects SHARE A WALL (a common axis-aligned edge of non-zero extent) when
 *  they abut on one axis and OVERLAP on the other. This is the geometric
 *  precondition for `wallsAndDoors` to host a door between two rooms — so it is
 *  exactly the relation the sealing-safety check below must preserve. Pure. */
function rectsShareWall(a: Rect, b: Rect): boolean {
    // Vertical shared face: a.x1 ≈ b.x0 (or vice-versa) with z-overlap.
    const vAbut =
        (Math.abs(a.x1 - b.x0) < ALIGNMENT_SNAP_EPS_M || Math.abs(b.x1 - a.x0) < ALIGNMENT_SNAP_EPS_M);
    const zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    if (vAbut && zOverlap > ALIGNMENT_SNAP_EPS_M) return true;
    // Horizontal shared face: a.z1 ≈ b.z0 (or vice-versa) with x-overlap.
    const hAbut =
        (Math.abs(a.z1 - b.z0) < ALIGNMENT_SNAP_EPS_M || Math.abs(b.z1 - a.z0) < ALIGNMENT_SNAP_EPS_M);
    const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    if (hAbut && xOverlap > ALIGNMENT_SNAP_EPS_M) return true;
    return false;
}

/** The set of room ids that share at least one wall with some OTHER placed room.
 *  A room NOT in this set is an island — `wallsAndDoors` can hand it no door, so
 *  it would be reported §SEALED. Used to validate that a corridor reshape never
 *  turns a previously-connected room into an island. Pure + deterministic. */
function roomsWithAnySharedWall(placements: readonly RoomPlacement[]): Set<string> {
    const connected = new Set<string>();
    for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
            if (rectsShareWall(placements[i]!.rect, placements[j]!.rect)) {
                connected.add(placements[i]!.roomId);
                connected.add(placements[j]!.roomId);
            }
        }
    }
    return connected;
}

// ── §STAIR-CIRC-FACE (founder defect, 2026-06-11) ──────────────────────────────

/** Length (m) of the SHARED axis-aligned edge between two rects — 0 when they do not
 *  abut, or abut only at a corner. This is exactly the wall length `wallsAndDoors`
 *  has to host a door on, so it is the right metric for "does the corridor reach the
 *  stair with enough run for a door". Pure + deterministic. */
function sharedWallLengthM(a: Rect, b: Rect): number {
    const vAbut = Math.abs(a.x1 - b.x0) < ALIGNMENT_SNAP_EPS_M || Math.abs(b.x1 - a.x0) < ALIGNMENT_SNAP_EPS_M;
    if (vAbut) {
        const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (zOv > ALIGNMENT_SNAP_EPS_M) return zOv;
    }
    const hAbut = Math.abs(a.z1 - b.z0) < ALIGNMENT_SNAP_EPS_M || Math.abs(b.z1 - a.z0) < ALIGNMENT_SNAP_EPS_M;
    if (hAbut) {
        const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (xOv > ALIGNMENT_SNAP_EPS_M) return xOv;
    }
    return 0;
}

/** A door width (m) — the minimum corridor↔stair shared-wall run that lets the door
 *  pipeline place the stair's circulation door. Mirrors the test's DOOR_W. */
const STAIR_DOOR_MIN_M = 0.9;

/** Interior-floor overlap AREA (m²) between two rects (0 ⇒ they share at most an edge). */
function overlapAreaM2(a: Rect, b: Rect): number {
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    return ox > EPS && oz > EPS ? ox * oz : 0;
}

/**
 * §STAIR-OVERLAP-CLIP (founder defect §65.1, 2026-06-11) — a HARD invariant guard: NO habitable
 * room rect may overlap the stair keep-out. The keep-out is subtracted from the buildable plate
 * BEFORE subdivide (enumerate.ts §STAIR-KEEPOUT), so on the handled axis-aligned plates no room
 * tiles across it — but the founder observed a "Kitchen" (~41 m²) drawn straight ACROSS the stair
 * on a dense plate (the kitchen absorbed the stair area, also blowing the kitchen plate-cap). This
 * post-pass is the BY-CONSTRUCTION net: every non-stair room rect that intersects a keep-out is
 * CLIPPED back to the largest axis-aligned sub-rectangle clear of it (shrunk on the axis where the
 * keep-out bites least, so the room keeps the most area). A room fully inside a keep-out (should
 * never happen) is left as-is for the caller's drop logic. The `stair` room placement, added by
 * enumerate.ts AT the keep-out, is exempt — it is the ONLY room allowed to occupy the keep-out.
 *
 * Idempotent + pure. No keep-out ⇒ identity (apartment + every keep-out-free plate byte-identical).
 */
function clipRoomsOutOfKeepOut(
    placements: readonly RoomPlacement[],
    keepOuts: readonly Rect[],
    typeById: ReadonlyMap<string, RoomType>,
): readonly RoomPlacement[] {
    if (keepOuts.length === 0) return placements;
    let changed = false;
    const out = placements.map(p => {
        if ((typeById.get(p.roomId) ?? '') === 'stair') return p;   // the stair OWNS the keep-out
        let r = p.rect;
        for (const ko of keepOuts) {
            if (overlapAreaM2(r, ko) <= EPS) continue;
            // The four candidate clips that remove the overlap by pushing ONE edge to the keep-out
            // boundary. Keep the one that preserves the most area AND stays non-degenerate.
            const cands: Rect[] = [
                { ...r, x1: Math.min(r.x1, ko.x0) },   // cut the right part (keep left of the keep-out)
                { ...r, x0: Math.max(r.x0, ko.x1) },   // cut the left part  (keep right)
                { ...r, z1: Math.min(r.z1, ko.z0) },   // cut the top part   (keep below)
                { ...r, z0: Math.max(r.z0, ko.z1) },   // cut the bottom part(keep above)
            ].filter(c => c.x1 - c.x0 > EPS && c.z1 - c.z0 > EPS);
            if (cands.length === 0) continue;          // room fully inside the keep-out — leave for drop logic
            r = roundRect(cands.reduce((best, c) => (rectArea(c) > rectArea(best) ? c : best)));
        }
        if (r !== p.rect && (r.x0 !== p.rect.x0 || r.z0 !== p.rect.z0 || r.x1 !== p.rect.x1 || r.z1 !== p.rect.z1)) {
            changed = true;
            return { roomId: p.roomId, rect: r };
        }
        return p;
    });
    return changed ? out : placements;
}

/** §DIAG-OVERLAP / §ROOM-OVERLAP-NET (founder defect §65.1 "NO ROOMS OVERLAPPING — extremely
 *  forbidden!!", 2026-06-12) — the result of the FINAL overlap-resolution net. */
export interface OverlapResolution {
    readonly placements: readonly RoomPlacement[];
    /** Room ids fully consumed by a higher-priority neighbour (no clear sub-rect left) and
     *  dropped. Empty in the common case. Deterministic — in resolution (drop) order. */
    readonly dropped: readonly string[];
    /** Worst residual overlap area (m²) AFTER the net — must be ≤ the hairline tolerance.
     *  A non-zero value here would be a §DIAG-OVERLAP assertion failure (never shipped). */
    readonly worstResidualM2: number;
    /** Overlap pairs RESOLVED by the net (display via roomId), with the pre-clip overlap area. */
    readonly resolved: ReadonlyArray<{ readonly a: string; readonly b: string; readonly areaM2: number }>;
}

/** Overlap-net hairline DETECTION tolerance (m²). Matches `validateNoRoomOverlap`'s default epsilon
 *  so the net and the gate agree: an overlap above this is reported. */
const OVERLAP_NET_EPS_M2 = 1e-3;

/** Overlap-net CLIP-ACTION floor (m²). The net only CLIPS/DROPS a room when its overlap exceeds
 *  this — a real architectural collision (the founder's multi-m² "Room 01-002 across another
 *  room"). Sub-floor overlaps are SNAP DUST: `snapAxisLines` snaps two near-coincident edges to a
 *  cluster mean and can leave a ≤ few-cm² interior sliver between two rects whose shared wall the
 *  editor's 20 mm node grid + weld collapses to nothing anyway. Clipping that dust would move a
 *  partition off a projected (rotated/sheared-back) ring and re-open a §53-style seam, so dust is
 *  REPORTED (the §DIAG-OVERLAP line) but not clipped. 0.05 m² = 500 cm²: far below any habitable
 *  room yet far above the cm² snap sliver, so every REAL room-over-room collision is clipped while
 *  the snap dust (and the apartment/rotated-plate geometry) is byte-identical. */
const OVERLAP_NET_CLIP_M2 = 0.05;

/**
 * §ROOM-OVERLAP-NET (founder defect §65.1, 2026-06-12) — THE HARD INVARIANT: after EVERY placement /
 * residual-fill / reflection pass, NO two emitted room rects may overlap by more than a hairline.
 *
 * The squarified treemap tiles EXACTLY, but the independent post-passes (snapAxisLines, the
 * §EVERY-ROOM-ACCESS comb, the §STAIR-CIRC-FACE reflection, windowEmission's snap, and — the most
 * likely late source — the §DIAG-FILL-RESIDUAL grow/mint which extends/mints rects WITHOUT a
 * cross-placement overlap check) can leave two rects overlapping on a tight/dense plate. The
 * founder observed a generic "Room 01-002" cell drawn ACROSS the stair / another room on the first
 * floor — the bug this net closes BY CONSTRUCTION.
 *
 * The net is a deterministic detect-and-clip:
 *   1. Find the worst-overlapping ordered pair (largest overlap area; ties → lower roomId pair).
 *   2. The HIGHER-priority room (by `dropRankFor`, ties → lower roomId) is kept intact; the LOWER-
 *      priority room is CLIPPED to the largest axis-aligned sub-rect clear of the higher one
 *      (the same 4-candidate edge-push `clipRoomsOutOfKeepOut` uses).
 *   3. If the lower room has no clear sub-rect (fully covered), it is DROPPED — never left
 *      overlapping (the founder rule is absolute: "extremely forbidden!!").
 *   4. Repeat to a fixed point (bounded — every step strictly shrinks/removes a rect).
 *
 * The `stair` room is NEVER clipped or dropped (it is the fixed vertical core); a room overlapping
 * the stair is clipped/dropped instead (the §STAIR-OVERLAP-CLIP guard already handles keep-outs,
 * but a residual grow could re-introduce a stair overlap, so the stair is protected here too).
 *
 * Pure + deterministic. An already-non-overlapping set (the apartment + every clean plate) is a
 * strict identity → byte-identical (ADR-0061): the worst pair is below epsilon, the loop never
 * enters, `dropped` is empty.
 */
export function resolveRoomOverlaps(
    placements: readonly RoomPlacement[],
    typeById: ReadonlyMap<string, RoomType>,
    // The CLIP-ACTION floor (m²): a pair is clipped/dropped only when its overlap exceeds this.
    // Defaults to OVERLAP_NET_CLIP_M2 (0.05 m²) so cm²-scale snap dust is reported but not clipped
    // (preserving rotated/sheared-projected geometry). Pass OVERLAP_NET_EPS_M2 to clip every
    // above-hairline overlap (the strictest form — used where the geometry is the final emit).
    clipFloorM2: number = OVERLAP_NET_CLIP_M2,
): OverlapResolution {
    // Priority of a room: the stair is supreme (never clipped); otherwise the drop-rank, so a
    // lower-priority room yields to a higher-priority one. Ties broken by lower roomId (stable).
    const rankOf = (id: string): number =>
        (typeById.get(id) ?? '') === 'stair' ? Number.POSITIVE_INFINITY : dropRankFor(typeById.get(id) ?? ('corridor' as RoomType));
    const isStair = (id: string): boolean => (typeById.get(id) ?? '') === 'stair';

    const work: RoomPlacement[] = placements.map(p => ({ roomId: p.roomId, rect: p.rect }));
    const dropped: string[] = [];
    const resolved: Array<{ a: string; b: string; areaM2: number }> = [];

    // Clip `loser` out of `winner` → the largest axis-aligned sub-rect clear of the winner, or null
    // when fully covered (loser is then dropped).
    const clipOut = (loser: Rect, winner: Rect): Rect | null => {
        const cands: Rect[] = [
            { ...loser, x1: Math.min(loser.x1, winner.x0) },
            { ...loser, x0: Math.max(loser.x0, winner.x1) },
            { ...loser, z1: Math.min(loser.z1, winner.z0) },
            { ...loser, z0: Math.max(loser.z0, winner.z1) },
        ].filter(c => c.x1 - c.x0 > EPS && c.z1 - c.z0 > EPS && overlapAreaM2(c, winner) <= OVERLAP_NET_EPS_M2);
        if (cands.length === 0) return null;
        return roundRect(cands.reduce((best, c) => (rectArea(c) > rectArea(best) ? c : best)));
    };

    // Bounded fixed-point: each iteration resolves the single worst pair (shrink or drop the loser).
    // The bound is generous — every step removes ≥ OVERLAP_NET_EPS_M2 of overlap or a whole room.
    const MAX_ITERS = placements.length * placements.length + 8;
    for (let iter = 0; iter < MAX_ITERS; iter++) {
        // Find the worst remaining overlapping pair ABOVE the clip-action floor (sub-floor snap
        // dust is left in place — reported via worstResidual, never clipped).
        let worst: { i: number; j: number; area: number } | null = null;
        for (let i = 0; i < work.length; i++) {
            for (let j = i + 1; j < work.length; j++) {
                const area = overlapAreaM2(work[i]!.rect, work[j]!.rect);
                if (area <= clipFloorM2) continue;
                const better = !worst
                    || area > worst.area + EPS
                    || (Math.abs(area - worst.area) <= EPS
                        && (work[i]!.roomId < work[worst.i]!.roomId
                            || (work[i]!.roomId === work[worst.i]!.roomId && work[j]!.roomId < work[worst.j]!.roomId)));
                if (better) worst = { i, j, area };
            }
        }
        if (!worst) break;                                  // no overlaps left → done

        const A = work[worst.i]!, B = work[worst.j]!;
        // The LOSER is the lower-priority room; ties → higher roomId (so the lower id is kept).
        let loserIdx: number, winnerIdx: number;
        const ra = rankOf(A.roomId), rb = rankOf(B.roomId);
        if (ra < rb || (ra === rb && A.roomId > B.roomId)) { loserIdx = worst.i; winnerIdx = worst.j; }
        else { loserIdx = worst.j; winnerIdx = worst.i; }
        // Two stairs overlapping (degenerate) — both supreme; clip the higher-id one defensively.
        const loser = work[loserIdx]!, winner = work[winnerIdx]!;
        resolved.push({ a: winner.roomId, b: loser.roomId, areaM2: round6(worst.area) });

        if (isStair(loser.roomId) && isStair(winner.roomId)) {
            // Never happens on the handled plates; clip the loser anyway to honour the invariant.
        }
        const clipped = clipOut(loser.rect, winner.rect);
        if (clipped === null) {
            dropped.push(loser.roomId);
            work.splice(loserIdx, 1);
        } else {
            work[loserIdx] = { roomId: loser.roomId, rect: clipped };
        }
    }

    // Worst residual overlap AFTER the net (the §DIAG-OVERLAP assertion value — must be ≤ eps).
    let worstResidualM2 = 0;
    for (let i = 0; i < work.length; i++) {
        for (let j = i + 1; j < work.length; j++) {
            const a = overlapAreaM2(work[i]!.rect, work[j]!.rect);
            if (a > worstResidualM2) worstResidualM2 = a;
        }
    }
    return { placements: work, dropped, worstResidualM2: round6(worstResidualM2), resolved };
}

/** The axis-aligned bounding box of a placement set. */
function placementsBBox(placements: readonly RoomPlacement[]): Rect {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of placements) {
        x0 = Math.min(x0, p.rect.x0); z0 = Math.min(z0, p.rect.z0);
        x1 = Math.max(x1, p.rect.x1); z1 = Math.max(z1, p.rect.z1);
    }
    return { x0, z0, x1, z1 };
}

/** Reflect a rect about a bbox on the chosen axes (area- + shape-preserving; the
 *  whole set stays inside the SAME bbox and stays non-overlapping). */
function reflectRect(r: Rect, bb: Rect, flipX: boolean, flipZ: boolean): Rect {
    let { x0, x1, z0, z1 } = r;
    if (flipX) { const nx0 = bb.x0 + (bb.x1 - x1); const nx1 = bb.x0 + (bb.x1 - x0); x0 = nx0; x1 = nx1; }
    if (flipZ) { const nz0 = bb.z0 + (bb.z1 - z1); const nz1 = bb.z0 + (bb.z1 - z0); z0 = nz0; z1 = nz1; }
    return roundRect({ x0, z0, x1, z1 });
}

/**
 * §STAIR-CIRC-FACE (founder defect, 2026-06-11) — guarantee the minted corridor /
 * landing SHARES A WALL with the stair keep-out on EVERY storey, so the door pipeline
 * (`wallsAndDoors` §STAIR-ROOM-DOOR) can place the stair's door onto CIRCULATION rather
 * than onto a habitable room.
 *
 * THE DEFECT: a multi-storey UPPER storey carves its corridor against ONE face of the
 * buildable plate (e.g. the centre, for the double-loaded `§NO-PUBLIC-CARVE`, or one
 * long edge, for `§NO-SEAL-SINGLE-LOAD`). The stair keep-out was SUBTRACTED from the
 * plate on whichever edge the stair core sits — frequently the OPPOSITE edge from the
 * corridor face. The corridor then never reaches the stair, so the stair's only legal
 * door lands on the bedroom that wraps it (the founder's node inspector: "stair … Not on
 * circulation ✗ — served through Bedroom 3").
 *
 * THE FIX: the carve fills its dominant rect EXACTLY, so reflecting the entire placement
 * set within its own bbox is area-, shape- and tiling-preserving — it only swaps WHICH
 * edge each zone lands on. Try the 4 axis-flips (identity, flip-x, flip-z, flip-both) and
 * keep the one that gives the corridor the LONGEST shared wall with the keep-out (≥ a door
 * width). Identity wins ties (so a layout whose corridor already abuts the stair is
 * byte-identical). Returns the placements UNCHANGED when no keep-out is supplied, no
 * corridor was placed, or no flip can bring the corridor to a keep-out edge (then the
 * enumerate-side §STAIR-SPINE-TOUCH bridge / the door pipeline's reroute handle it).
 *
 * Pure + deterministic. House-only: the apartment passes no keep-out (`keepOutRects`
 * empty) → identity → byte-identical (ADR-0061).
 */
function orientCorridorToKeepOut(
    placements: readonly RoomPlacement[],
    corridorId: string | null,
    keepOuts: readonly Rect[],
): readonly RoomPlacement[] {
    if (!corridorId || keepOuts.length === 0 || placements.length === 0) return placements;
    const corrIdx = placements.findIndex(p => p.roomId === corridorId);
    if (corrIdx < 0) return placements;
    const bb = placementsBBox(placements);

    // Best corridor↔keep-out shared-wall run over ALL keep-outs for a candidate flip.
    const corridorReach = (corr: Rect): number =>
        keepOuts.reduce((best, ko) => Math.max(best, sharedWallLengthM(corr, ko)), 0);

    const FLIPS: ReadonlyArray<readonly [boolean, boolean]> = [
        [false, false], [true, false], [false, true], [true, true],
    ];
    let bestReach = corridorReach(placements[corrIdx]!.rect);
    let bestFlip: readonly [boolean, boolean] = [false, false];
    for (const [fx, fz] of FLIPS) {
        if (!fx && !fz) continue;                       // identity already measured (ties → identity)
        const corr = reflectRect(placements[corrIdx]!.rect, bb, fx, fz);
        const reach = corridorReach(corr);
        if (reach > bestReach + EPS) { bestReach = reach; bestFlip = [fx, fz]; }
    }
    if (bestFlip[0] === false && bestFlip[1] === false) return placements;   // identity wins
    return placements.map(p => ({ roomId: p.roomId, rect: reflectRect(p.rect, bb, bestFlip[0], bestFlip[1]) }));
}

/**
 * §STAIR-CIRC-STUB (founder defect §65.3, 2026-06-11) — the FRAGMENTED-DENSE fallback for
 * `orientCorridorToKeepOut`. On a dense GROUND plate the corridor is a full-width strip on
 * one z-band and the stair keep-out sits on the OPPOSITE z-edge, with the private comb in
 * between. A bbox reflection only swaps WHICH face the strip lands on — it can never bring a
 * strip whose LONG axis is PARALLEL to the keep-out edge across the comb to that edge — so the
 * corridor never reaches the stair (`§DIAG-STAIR-CIRC sharesStairWall=NO`) and the stair ships
 * served through a bedroom (the founder's bug).
 *
 * THE FIX: when no reflection brought the corridor to a door-width of a keep-out, find a STUB —
 * a narrow (corridor-width) channel running PERPENDICULAR from the corridor's face to the keep-out
 * edge, THROUGH EMPTY SPACE ONLY (the carved keep-out clearance slivers + the genuinely-empty
 * bands beside the keep-out; never carving through a habitable room, which the post-subdivide
 * snap could turn into an overlap). Returns the stub RECT (or null); `enumerate.ts` mints it as a
 * dedicated circulation room (`corridorStubN`) in the bubble graph — ONE rect per room — wired
 * `stub↔corridor` + `stub↔stair`, so the stair doors onto circulation. When no empty channel
 * reaches the keep-out the stub bails and the door pipeline's reroute handles the stair (the
 * §65.3 compromise the brief permits).
 *
 * Pure + deterministic. `shellBB` is the true shell bbox (the empty band beside a keep-out is
 * roomless, so the placements bbox under-states it); absent ⇒ the placements bbox (conservative).
 */
/**
 * §STAIR-STUB-IN-PERIMETER (founder out-of-boundary screenshot, 2026-06-18) — is an axis-aligned
 * rect FULLY inside a simple shell polygon? The bbox clamp in {@link findCorridorStubToKeepOut}
 * keeps the stub inside the shell's BOUNDING BOX, but on a ROTATED / SHEARED / L-shaped / stepped
 * footprint the bbox over-covers the real shell, so a bbox-clamped stub can still poke past a
 * slanted or re-entrant perimeter edge (the founder's "Stair Corridor poking out of the bottom-
 * right" defect). This is the polygon-true guard: a rect is inside iff (a) all four corners are
 * inside-or-on the polygon AND (b) no polygon edge crosses the rect interior (catches a re-entrant
 * notch that bites into the rect without any corner falling outside). Tolerant by EPS so a stub
 * flush to a perimeter edge (the legitimate apartment/rectilinear case) is NOT rejected.
 */
function rectInsidePolygon(rect: Rect, poly: readonly Pt[]): boolean {
    if (poly.length < 3) return true;                 // no real polygon constraint → accept (bbox path)
    const inside = (x: number, z: number): boolean => {
        // Ray-cast; treat on-boundary (within EPS of any edge) as inside.
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i]!, b = poly[j]!;
            // on-edge test
            const dx = b.x - a.x, dz = b.z - a.z;
            const t = (dx * dx + dz * dz) > 1e-12
                ? ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz) : -1;
            if (t >= -1e-6 && t <= 1 + 1e-6) {
                const px = a.x + t * dx, pz = a.z + t * dz;
                if (Math.hypot(x - px, z - pz) <= EPS) return true;
            }
        }
        let win = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i]!, b = poly[j]!;
            const intersect = ((a.z > z) !== (b.z > z)) &&
                (x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || 1e-30) + a.x);
            if (intersect) win = !win;
        }
        return win;
    };
    // (a) all four corners inside-or-on (sample a hair inside so a corner flush to a slanted edge
    // — which the ray-cast may classify either way — is judged by its true interior side).
    const ix = (rect.x1 - rect.x0) * 1e-4, iz = (rect.z1 - rect.z0) * 1e-4;
    const corners: Array<[number, number]> = [
        [rect.x0 + ix, rect.z0 + iz], [rect.x1 - ix, rect.z0 + iz],
        [rect.x1 - ix, rect.z1 - iz], [rect.x0 + ix, rect.z1 - iz],
    ];
    for (const [cx, cz] of corners) if (!inside(cx, cz)) return false;
    // (b) no polygon VERTEX sits strictly inside the rect (a re-entrant notch tip biting in with
    // no rect corner outside). Cheap + sufficient for the simple shells the engine produces.
    for (const v of poly) {
        if (v.x > rect.x0 + EPS && v.x < rect.x1 - EPS && v.z > rect.z0 + EPS && v.z < rect.z1 - EPS) {
            return false;
        }
    }
    return true;
}

export function findCorridorStubToKeepOut(
    placements: readonly RoomPlacement[],
    corridorId: string | null,
    keepOuts: readonly Rect[],
    typeById: ReadonlyMap<string, RoomType>,
    corridorWidthM: number,
    shellBB?: Rect,
    // §STUB-GAP-CAP (founder §CIRCULATION-GRAPH PART 6, 2026-06-17) — the MAX corridor→stair gap (m)
    // a stub may bridge. The upper floor passes a small cap (≈0.5 m): a LARGE gap means the corridor
    // was laid on the WRONG axis (§STAIR-FACE-AXIS should have brought it to the stair edge), so a
    // long ugly cross-plate stub is suppressed → the candidate stays circulation-de-ranked and a
    // better-axis strategy wins, instead of shipping a long synthetic spur. Undefined (the ground
    // floor's dense-plate fallback) ⇒ no cap (byte-identical — the GF stub legitimately spans a band).
    maxGapM?: number,
    // §STAIR-STUB-IN-PERIMETER (founder out-of-boundary screenshot, 2026-06-18) — the REAL shell
    // polygon (world frame). The bbox clamp above only keeps the stub inside the shell's bounding
    // BOX; on a rotated / sheared / L-shaped / stepped footprint the bbox over-covers the real
    // shell, so a bbox-clamped stub strip can still poke PAST a slanted or re-entrant perimeter
    // edge (the founder's "Stair Corridor poking out of the bottom-right" defect). When supplied,
    // the chosen stub is clamped to (convex shells) and then re-verified strictly INSIDE the
    // polygon; a stub that cannot reach the keep-out while staying inside is REJECTED (better no
    // stub than an out-of-bounds one — the stair then serves through a room, the existing
    // fallback). Absent ⇒ unchanged (bbox-only) behaviour → byte-identical for every caller that
    // passes no polygon (every non-house path; ADR-0061).
    shellPolygon?: readonly Pt[],
): Rect | null {
    if (!corridorId || keepOuts.length === 0 || placements.length === 0) return null;
    const corrIdx = placements.findIndex(p => p.roomId === corridorId);
    if (corrIdx < 0) return null;
    const corr = placements[corrIdx]!.rect;

    // Already within a door-width of SOME keep-out? Nothing to route (the reflection won).
    const reaches = (r: Rect): boolean =>
        keepOuts.some(ko => sharedWallLengthM(r, ko) >= STAIR_DOOR_MIN_M - EPS);
    if (reaches(corr)) return null;

    const W = Math.max(roomRule('corridor').minShortSideM, Math.min(corridorWidthM, corr.x1 - corr.x0, corr.z1 - corr.z0, 1.2));

    // §STAIR-STUB-SHELL-CLAMP — the keep-out arrives INFLATED by KEEPOUT_MARGIN_M (enumerate.ts),
    // so a keep-out abutting the façade extends ~0.05 m OUTSIDE the shell. A stub routed flush to
    // that inflated edge would emit a wall beyond the perimeter (§STAIR-SHELL-CLAMP regression).
    // Clamp every stub coordinate to the buildable extent. The SHELL bbox (passed in) is the
    // correct bound — the empty band beside a keep-out is roomless, so the placements' bbox would
    // under-state the buildable extent there and wrongly decline a valid empty stub. Fall back to
    // the placements bbox when no shell bbox was supplied (conservative — never protrudes).
    const buildBB = shellBB ?? placementsBBox(placements);
    const clampX = (v: number): number => Math.max(buildBB.x0, Math.min(buildBB.x1, v));
    const clampZ = (v: number): number => Math.max(buildBB.z0, Math.min(buildBB.z1, v));

    // Build the stub toward ONE keep-out along ONE axis. `axis` is the travel axis (the stub
    // runs ALONG it from the corridor to the keep-out); `lane` (perp) is the stub's narrow span.
    type Stub = { rect: Rect; reach: number };
    const overlapArea = (a: Rect, b: Rect): number => {
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        return ox > EPS && oz > EPS ? ox * oz : 0;
    };

    // Candidate lane positions (the stub's perpendicular [lo,hi]) for travel axis `axis`:
    // flush to each crossed room edge that lies inside the keep-out's perp span, so the stub
    // SHAVES (never splits). We evaluate a candidate by shrinking every crossed room out of the
    // stub lane and measuring keep-out reach + how many rooms fall below their type-min.
    const tryStub = (axis: 'x' | 'z', dir: 1 | -1, ko: Rect): Stub | null => {
        // Travel span: from the corridor face toward the keep-out, ending at the keep-out's near edge.
        // Both ends clamped to the buildable extent (the inflated keep-out can sit outside the shell).
        const clampT = axis === 'z' ? clampZ : clampX;
        const corrFar = axis === 'z' ? (dir > 0 ? corr.z1 : corr.z0) : (dir > 0 ? corr.x1 : corr.x0);
        const koNear  = axis === 'z' ? (dir > 0 ? ko.z1   : ko.z0)   : (dir > 0 ? ko.x1   : ko.x0);
        const t0 = clampT(Math.min(corrFar, koNear)), t1 = clampT(Math.max(corrFar, koNear));
        if (t1 - t0 < EPS) return null;
        // §STUB-GAP-CAP (PART 6) — a stub bridging a gap larger than the cap signals a wrong-axis
        // corridor; suppress it so a naturally-reaching strategy wins instead of a long synthetic spur.
        if (maxGapM !== undefined && t1 - t0 > maxGapM + EPS) return null;
        // The lane axis (perpendicular). The lane must overlap the keep-out's perp span by ≥ W
        // and align (flush) to a crossed-room edge. Perp span of the keep-out (clamped to the shell):
        const clampL = axis === 'z' ? clampX : clampZ;
        const koLo = clampL(axis === 'z' ? ko.x0 : ko.z0);
        const koHi = clampL(axis === 'z' ? ko.x1 : ko.z1);
        if (koHi - koLo < STAIR_DOOR_MIN_M - EPS) return null;   // keep-out too narrow to door onto

        // Candidate lane low-edges: flush-left of the keep-out (koLo), flush-right (koHi − W), and
        // flush to any room edge inside [koLo, koHi − W] that the corridor already abuts. We keep
        // the stub fully inside the keep-out's perp span so its keep-out shared wall is maximal.
        const laneLos = new Set<number>();
        laneLos.add(koLo);
        laneLos.add(koHi - W);
        for (const p of placements) {
            if (p.roomId === corridorId) continue;
            const e0 = axis === 'z' ? p.rect.x0 : p.rect.z0;
            const e1 = axis === 'z' ? p.rect.x1 : p.rect.z1;
            for (const e of [e0, e1 - W, e1, e0 - W]) {
                if (e >= koLo - EPS && e + W <= koHi + EPS) laneLos.add(round6(e));
            }
        }

        let best: Stub | null = null;
        for (const laneLo of laneLos) {
            const lo = Math.max(laneLo, koLo);
            const hi = Math.min(lo + W, koHi);
            if (hi - lo < STAIR_DOOR_MIN_M - EPS) continue;
            let stubRect: Rect = axis === 'z'
                ? roundRect({ x0: lo, z0: t0, x1: hi, z1: t1 })
                : roundRect({ x0: t0, z0: lo, x1: t1, z1: hi });

            // §STAIR-STUB-IN-PERIMETER (founder out-of-boundary screenshot, 2026-06-18) — the
            // bbox clamp above only keeps the stub inside the shell's bounding BOX. On a rotated /
            // sheared / L-shaped / stepped footprint the bbox over-covers the real shell, so this
            // strip can still poke PAST a slanted or re-entrant perimeter edge. Pull the strip back
            // INSIDE the real polygon (convex shells: clamp the perimeter edge inward; concave/
            // re-entrant: the verify below rejects an out-of-bounds strip outright). A stub that no
            // longer reaches the keep-out after clamping is dropped here — better NO stub than an
            // out-of-bounds one (the stair then serves through a room, the existing fallback). When
            // no polygon was supplied (every non-house caller) this whole block is skipped → the
            // function is byte-identical (ADR-0061).
            if (shellPolygon && shellPolygon.length >= 3) {
                const clamped = clampRectToConvexShell(stubRect, shellPolygon);
                if (!clamped) continue;                        // clamped away entirely → no stub here
                stubRect = clamped;
                if (stubRect.x1 - stubRect.x0 < EPS || stubRect.z1 - stubRect.z0 < EPS) continue;
                if (!rectInsidePolygon(stubRect, shellPolygon)) continue;   // still out of bounds → reject
            }

            // §STUB-EMPTY-ONLY — the stub may run ONLY through space NOT occupied by a habitable
            // room (the carved keep-out clearance slivers + genuinely-empty bands beside the
            // keep-out). A lane that crosses ANY non-stair room is REJECTED: shaving a crossed
            // room is unsafe — the post-subdivide passes (snap / window-snap) move rects
            // independently and a shave can leave two rects OVERLAPPING (the founder §65.1
            // `overlap` hard-fail). When NO empty channel reaches the keep-out the stub bails and
            // the door pipeline's reroute / §STAIR-SPINE-TOUCH bridge handle the stair (or it
            // ships the logged compromise — never an overlap).
            let blockedByRoom = false;
            for (let i = 0; i < placements.length; i++) {
                const p = placements[i]!;
                if (p.roomId === corridorId) continue;
                if ((typeById.get(p.roomId) ?? '') === 'stair') continue;
                if (overlapArea(p.rect, stubRect) > EPS) { blockedByRoom = true; break; }
            }
            if (blockedByRoom) continue;
            const reach = sharedWallLengthM(stubRect, ko);
            if (reach < STAIR_DOOR_MIN_M - EPS) continue;
            const cand: Stub = { rect: stubRect, reach };
            // Prefer the LONGEST keep-out shared wall (most robust door host); the corridor area
            // added is identical (W × travel), so reach is the only quality axis.
            if (!best || cand.reach > best.reach + EPS) best = cand;
        }
        return best;
    };

    // Evaluate every (keep-out × axis × direction); keep the stub with the longest keep-out reach.
    let chosen: Stub | null = null;
    for (const ko of keepOuts) {
        if (sharedWallLengthM(corr, ko) >= STAIR_DOOR_MIN_M - EPS) continue;   // this one already reached
        for (const axis of ['z', 'x'] as const) {
            for (const dir of [1, -1] as const) {
                const s = tryStub(axis, dir, ko);
                if (!s) continue;
                if (!chosen || s.reach > chosen.reach + EPS) chosen = s;
            }
        }
    }
    return chosen ? chosen.rect : null;
}

/**
 * §POLYGON-CORRIDOR-LEG (founder §CIRCULATION-GRAPH polygon-native rework PART 4 / FF-R1, 2026-06-17)
 * — union two AXIS-ALIGNED rects that share (or abut along) one edge into a single CCW L-shaped ring.
 *
 * `spine` is the corridor's rect; `leg` is the narrow empty channel found by
 * {@link findCorridorStubToKeepOut} running PERPENDICULAR from one corridor edge to the stair keep-out.
 * The two rects abut along the spine edge the leg grows from, so their union is a (possibly degenerate)
 * L / T-free hexagon. We classify by which side of the spine the leg sits on (+x / −x / +z / −z) and
 * emit the 6-vertex boundary in CCW order (same winding as {@link rectPolygon}). When the leg lane
 * spans the FULL spine edge (so the union is itself a rectangle) we still emit a valid 6-pt ring (two
 * vertices are collinear) — `wallsAndDoors` and `cellAreaM2` both tolerate a collinear vertex, and the
 * polygon area then equals the rect union exactly.
 *
 * Pure + deterministic. Coordinates are `round6`-clean (both inputs come from `roundRect`).
 * Returns null when the leg does not actually abut the spine (defensive — never ships a self-
 * intersecting ring; the caller then leaves the corridor a plain rect).
 */
export function legUnionLRing(spine: Rect, leg: Rect): readonly Pt[] | null {
    const A = roundRect(spine), L = roundRect(leg);
    // Degenerate leg ⇒ nothing to union (return the spine ring so the caller is a no-op upstream).
    if (L.x1 - L.x0 < EPS || L.z1 - L.z0 < EPS) return rectPolygon(A);

    // +x: leg grows from the spine's RIGHT (x1) edge.  Its z-span lies WITHIN the spine's z-span; the
    // leg may attach anywhere along that edge, so the union is a general (up-to-8-vtx) rectilinear ring.
    // CCW: bottom edge → up the right edge to the leg's low z → out & around the leg → back to the
    // right edge at the leg's high z → up to the top-right → top edge. Collinear vertices (leg flush to
    // a spine corner) are kept — `cellAreaM2` / `wallsAndDoors` tolerate them and the area is exact.
    if (Math.abs(L.x0 - A.x1) < ALIGNMENT_SNAP_EPS_M && L.z0 >= A.z0 - EPS && L.z1 <= A.z1 + EPS) {
        return [
            { x: A.x0, z: A.z0 }, { x: A.x1, z: A.z0 },
            { x: A.x1, z: L.z0 }, { x: L.x1, z: L.z0 }, { x: L.x1, z: L.z1 }, { x: A.x1, z: L.z1 },
            { x: A.x1, z: A.z1 }, { x: A.x0, z: A.z1 },
        ];
    }
    // −x: leg grows from the spine's LEFT (x0) edge.  CCW: bottom → right → top → down the left edge
    // to the leg's high z → out & around the leg → back to the left edge at the leg's low z → close.
    if (Math.abs(L.x1 - A.x0) < ALIGNMENT_SNAP_EPS_M && L.z0 >= A.z0 - EPS && L.z1 <= A.z1 + EPS) {
        return [
            { x: A.x0, z: A.z0 }, { x: A.x1, z: A.z0 }, { x: A.x1, z: A.z1 }, { x: A.x0, z: A.z1 },
            { x: A.x0, z: L.z1 }, { x: L.x0, z: L.z1 }, { x: L.x0, z: L.z0 }, { x: A.x0, z: L.z0 },
        ];
    }
    // +z: leg grows from the spine's TOP (z1) edge.  Its x-span lies WITHIN the spine's x-span.  CCW:
    // bottom → right → up to the top-right → along the top edge to the leg's high x → up & around the
    // leg → back to the top edge at the leg's low x → along the top to the top-left → close.
    if (Math.abs(L.z0 - A.z1) < ALIGNMENT_SNAP_EPS_M && L.x0 >= A.x0 - EPS && L.x1 <= A.x1 + EPS) {
        return [
            { x: A.x0, z: A.z0 }, { x: A.x1, z: A.z0 }, { x: A.x1, z: A.z1 },
            { x: L.x1, z: A.z1 }, { x: L.x1, z: L.z1 }, { x: L.x0, z: L.z1 }, { x: L.x0, z: A.z1 },
            { x: A.x0, z: A.z1 },
        ];
    }
    // −z: leg grows from the spine's BOTTOM (z0) edge.  CCW: along the bottom edge to the leg's low x →
    // down & around the leg → back to the bottom edge at the leg's high x → along the bottom to the
    // bottom-right → up the right → top → close.
    if (Math.abs(L.z1 - A.z0) < ALIGNMENT_SNAP_EPS_M && L.x0 >= A.x0 - EPS && L.x1 <= A.x1 + EPS) {
        return [
            { x: A.x0, z: A.z0 }, { x: L.x0, z: A.z0 }, { x: L.x0, z: L.z0 }, { x: L.x1, z: L.z0 },
            { x: L.x1, z: A.z0 }, { x: A.x1, z: A.z0 }, { x: A.x1, z: A.z1 }, { x: A.x0, z: A.z1 },
        ];
    }
    return null;   // leg does not cleanly abut the spine on any axis — defensive bail
}

/**
 * §POLYGON-CORRIDOR-LEG (founder §CIRCULATION-GRAPH polygon-native rework PART 4 / FF-R1, 2026-06-17)
 * — the FINAL post-pass of `subdivideWithReport`'s stair-keep-out branch: when the corridor's RECT does
 * NOT share a door-width (≥0.9 m) wall with the stair keep-out, emit the corridor as an L-POLYGON whose
 * narrow leg threads EMPTY SPACE to reach the keep-out, so `wallsAndDoors` can host the stair↔corridor
 * door and the stair never ships SEALED (the founder's "stair sealed" defect, §DIAG-STAIR-CIRC
 * `corridorReachM=0.00 sharesStairWall=NO`).
 *
 * The leg is found by reusing {@link findCorridorStubToKeepOut} (the existing §STUB-EMPTY-ONLY
 * empty-channel router — it returns the leg RECT or null, and is already self-validating: an
 * unreachable keep-out yields null). The leg ∪ corridor-spine is then lifted to a single CCW ring by
 * {@link legUnionLRing}. The corridor's `placements` RECT is left untouched (the spine), so the area /
 * min-short-side / overlap gates are evaluated on the rect exactly as before — only `cellPolygonById`
 * gains the corridor → L-ring entry, which enumerate folds into the world cell map the wall sweep reads.
 *
 * SELF-VALIDATING / no-regression: returns the result UNCHANGED (and emits nothing) when there is no
 * keep-out, no corridor placement, the corridor already reaches the stair, no empty leg can reach it, or
 * the union does not form a clean ring. Pure + deterministic — no keep-out ⇒ byte-identical (the
 * apartment + every keep-out-free plate never reaches this pass).
 */
function emitPolygonCorridorLeg(
    result: SubdivideResult,
    corridorId: string | null,
    keepOuts: readonly Rect[],
    typeById: ReadonlyMap<string, RoomType>,
    corridorWidthM: number,
): SubdivideResult {
    if (!corridorId || keepOuts.length === 0) return result;
    const corrP = result.placements.find(p => p.roomId === corridorId);
    if (!corrP) return result;

    // §3 — already shares ≥0.9 m wall with SOME keep-out? Nothing to do (no override; byte-identical).
    const reachM = keepOuts.reduce((b, ko) => Math.max(b, sharedWallLengthM(corrP.rect, ko)), 0);
    if (reachM >= STAIR_DOOR_MIN_M - EPS) return result;

    // §4 — find the narrow empty leg from the corridor face to the keep-out near edge. The buildable
    // extent is the placements bbox UNIONED with the keep-out rects (the empty stair-clearance band is
    // roomless, so the bare placements bbox under-states it where the leg must reach). Deterministic.
    const bb = placementsBBox(result.placements);
    const shellBB: Rect = {
        x0: keepOuts.reduce((m, ko) => Math.min(m, ko.x0), bb.x0),
        z0: keepOuts.reduce((m, ko) => Math.min(m, ko.z0), bb.z0),
        x1: keepOuts.reduce((m, ko) => Math.max(m, ko.x1), bb.x1),
        z1: keepOuts.reduce((m, ko) => Math.max(m, ko.z1), bb.z1),
    };
    const leg = findCorridorStubToKeepOut(result.placements, corridorId, keepOuts, typeById, corridorWidthM, shellBB);
    if (leg === null) return result;   // §5 — no empty leg reaches the keep-out → emit NOTHING.

    const ring = legUnionLRing(corrP.rect, leg);
    if (ring === null) return result;  // defensive — leg did not cleanly abut the spine.

    // §6 — set the corridor's cell polygon (spine ∪ leg). The spine RECT stays in `placements`.
    const legReachM = keepOuts.reduce((b, ko) => Math.max(b, sharedWallLengthM(leg, ko)), 0);
    console.log(`[D-TGL subdivide] §POLYGON-CORRIDOR-LEG corridor=${corridorId} reachM=${legReachM.toFixed(2)}`);
    const merged = new Map<string, readonly Pt[]>(result.cellPolygonById ?? []);
    merged.set(corridorId, ring);
    return { ...result, cellPolygonById: merged };
}

/**
 * §POLYGON-CORRIDOR-ARM (founder §CIRCULATION-GRAPH polygon-native rework PART 4 / FF-R1, 2026-06-17)
 * — the longest shared axis-aligned WALL run (m) between an arbitrary simple polygon's edges and a
 * rect's edges. The corridor cell is a POLYGON (the `legUnionLRing` / multi-leg ring), so the rect-vs-
 * rect {@link sharedWallLengthM} cannot answer "does this private room abut the corridor". This walks
 * every polygon edge and measures its collinear-and-touching overlap with each of the rect's four
 * edges (the same ALIGNMENT_SNAP_EPS_M / EPS tolerances `sharedWallLengthM` uses), returning the MAX.
 * For a rectangle polygon this returns EXACTLY `sharedWallLengthM(polyBBoxRect, rect)`. Pure. */
export function polyRectSharedWallM(poly: readonly Pt[], rect: Rect): number {
    let best = 0;
    const rEdges: ReadonlyArray<readonly [Pt, Pt]> = [
        [{ x: rect.x0, z: rect.z0 }, { x: rect.x1, z: rect.z0 }],   // bottom (z = z0)
        [{ x: rect.x1, z: rect.z0 }, { x: rect.x1, z: rect.z1 }],   // right  (x = x1)
        [{ x: rect.x1, z: rect.z1 }, { x: rect.x0, z: rect.z1 }],   // top    (z = z1)
        [{ x: rect.x0, z: rect.z1 }, { x: rect.x0, z: rect.z0 }],   // left   (x = x0)
    ];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const pVert = Math.abs(a.x - b.x) < EPS;   // polygon edge is vertical (constant x)
        const pHorz = Math.abs(a.z - b.z) < EPS;   // polygon edge is horizontal (constant z)
        if (!pVert && !pHorz) continue;            // non-axis-aligned edge — no axis-aligned shared wall
        for (const [c, d] of rEdges) {
            const rVert = Math.abs(c.x - d.x) < EPS;
            const rHorz = Math.abs(c.z - d.z) < EPS;
            if (pVert && rVert && Math.abs(a.x - c.x) < ALIGNMENT_SNAP_EPS_M) {
                // both vertical, (near-)collinear in x → overlap along z
                const lo = Math.max(Math.min(a.z, b.z), Math.min(c.z, d.z));
                const hi = Math.min(Math.max(a.z, b.z), Math.max(c.z, d.z));
                if (hi - lo > best) best = hi - lo;
            } else if (pHorz && rHorz && Math.abs(a.z - c.z) < ALIGNMENT_SNAP_EPS_M) {
                // both horizontal, (near-)collinear in z → overlap along x.
                // §HORZ-SHARED-WALL-FIX (2026-06-21) — `hi` previously used Math.min(c.x,d.x)
                // (a copy-paste typo; the vertical branch above correctly uses Math.max), so a
                // room abutting a corridor on a HORIZONTAL edge always measured ~0 shared wall →
                // no door → sealed. Mirror the vertical branch: hi = min(max(a),max(c)).
                const lo = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
                const hi = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
                if (hi - lo > best) best = hi - lo;
            }
        }
    }
    return best > ALIGNMENT_SNAP_EPS_M ? best : 0;
}

/**
 * §POLYGON-CORRIDOR-ARM (PART 4 / FF-R1, 2026-06-17) — trace the union BOUNDARY of a set of axis-
 * aligned rects (the corridor spine + its legs) into a SINGLE CCW simple rectilinear polygon, so a
 * spine-with-MULTIPLE-legs (an L with 2 legs = a T / U / +) lifts to one valid ring.
 *
 * `legUnionLRing` only composes spine + ONE leg; a T/U needs a general union. The rects are collected
 * onto a uniform coordinate grid (every distinct rect edge becomes a grid line), each grid cell is
 * tagged FILLED iff its centre lies inside some rect, and the outer boundary of the filled region is
 * walked counter-clockwise. Collinear vertices are collapsed so the ring is minimal. The rects MUST
 * form a single CONNECTED region whose union is simply-connected (no hole) — the spine + legs always
 * do (each leg abuts the spine) — otherwise the trace returns null (defensive; caller skips the union).
 *
 * Pure + deterministic. Coordinates stay `round6`-clean (inputs come from `roundRect`). */
export function rectUnionRing(rects: readonly Rect[]): readonly Pt[] | null {
    if (rects.length === 0) return null;
    if (rects.length === 1) return rectPolygon(roundRect(rects[0]!));

    // Coordinate grids: every distinct rect edge → a grid line (deterministic ascending order).
    const xsSet = new Set<number>(), zsSet = new Set<number>();
    for (const r of rects) { xsSet.add(round6(r.x0)); xsSet.add(round6(r.x1)); zsSet.add(round6(r.z0)); zsSet.add(round6(r.z1)); }
    const xs = [...xsSet].sort((a, b) => a - b);
    const zs = [...zsSet].sort((a, b) => a - b);
    const nx = xs.length - 1, nz = zs.length - 1;
    if (nx < 1 || nz < 1) return null;

    // FILLED[zi][xi] — true iff the cell centre lies inside some rect.
    const filled: boolean[][] = [];
    for (let zi = 0; zi < nz; zi++) {
        filled[zi] = [];
        const cz = (zs[zi]! + zs[zi + 1]!) / 2;
        for (let xi = 0; xi < nx; xi++) {
            const cx = (xs[xi]! + xs[xi + 1]!) / 2;
            let inside = false;
            for (const r of rects) {
                if (cx > r.x0 + EPS && cx < r.x1 - EPS && cz > r.z0 + EPS && cz < r.z1 - EPS) { inside = true; break; }
            }
            filled[zi]![xi] = inside;
        }
    }

    // cell(zi,xi): false for out-of-range (so the region's complement is the unbounded exterior).
    const cell = (zi: number, xi: number): boolean =>
        zi >= 0 && zi < nz && xi >= 0 && xi < nx && filled[zi]![xi] === true;

    // Find the lowest-then-leftmost filled cell; start at its bottom-left grid corner and walk the
    // boundary keeping FILLED on the LEFT (→ CCW outer ring). Move along grid lines between corners.
    let startXi = -1, startZi = -1;
    outer: for (let zi = 0; zi < nz; zi++) for (let xi = 0; xi < nx; xi++) if (filled[zi]![xi]) { startZi = zi; startXi = xi; break outer; }
    if (startXi < 0) return null;

    // Boundary walk on the corner lattice (xs × zs). State: current corner (cxi,czi) + direction.
    // Directions: 0 = +x, 1 = +z, 2 = -x, 3 = -z. Start heading +x along the bottom edge of the
    // start cell, with the filled start cell above-left → filled stays on the left for CCW.
    const cornerX = (xi: number) => xs[xi]!;
    const cornerZ = (zi: number) => zs[zi]!;
    const start = { xi: startXi, zi: startZi };
    let cxi = start.xi, czi = start.zi;   // bottom-left corner of the start cell
    let dir = 0;                          // +x
    const ringIdx: Array<{ xi: number; zi: number }> = [];
    const MAX_STEPS = 4 * (nx + 1) * (nz + 1) + 8;   // generous cap; bails (null) if exceeded
    let steps = 0;
    do {
        ringIdx.push({ xi: cxi, zi: czi });
        // At corner (cxi,czi) we just arrived heading `dir`. Decide the next direction by the
        // fill of the two cells flanking the EDGE we'd traverse, preferring a LEFT turn (CCW)
        // then straight then right, so we hug the outer boundary keeping fill on the left.
        // Cells around corner (cxi,czi): below-left (czi-1,cxi-1), below-right (czi-1,cxi),
        // above-left (czi,cxi-1), above-right (czi,cxi).
        const aboveLeft = cell(czi, cxi - 1), aboveRight = cell(czi, cxi);
        const belowLeft = cell(czi - 1, cxi - 1), belowRight = cell(czi - 1, cxi);
        // Candidate moves (in CCW turn-preference order relative to incoming dir): left, straight, right.
        // For each direction, it's a valid boundary edge iff exactly one flanking cell is filled (the
        // one that keeps fill on the LEFT of travel).
        const canGo = (d: number): boolean => {
            switch (d) {
                case 0: return aboveRight && !belowRight;   // +x (east):  left=N=aboveRight filled,  right=S=belowRight empty
                case 1: return aboveLeft && !aboveRight;    // +z (north):  left=W=aboveLeft filled,   right=E=aboveRight empty
                case 2: return belowLeft && !aboveLeft;     // -x (west):   left=S=belowLeft filled,   right=N=aboveLeft empty
                case 3: return belowRight && !belowLeft;    // -z (south):  left=E=belowRight filled,   right=W=belowLeft empty
                default: return false;
            }
        };
        const left = (dir + 1) % 4, straight = dir, right = (dir + 3) % 4;
        let nd = -1;
        for (const d of [left, straight, right]) { if (canGo(d)) { nd = d; break; } }
        if (nd < 0) return null;   // dead end — region not simply-connected as expected (defensive)
        dir = nd;
        if (dir === 0) cxi += 1; else if (dir === 2) cxi -= 1; else if (dir === 1) czi += 1; else czi -= 1;
        if (cxi < 0 || cxi > nx || czi < 0 || czi > nz) return null;   // ran off lattice (defensive)
        if (++steps > MAX_STEPS) return null;
        // Terminate on RETURN TO THE START CORNER. The start is the bottom-then-left-most filled
        // cell's bottom-left corner — a unique CONVEX vertex of the outer ring, so the CCW walk
        // revisits it exactly once, at closure (the incoming direction there may be any of the four,
        // so we must NOT also gate on `dir`).
    } while (!(cxi === start.xi && czi === start.zi));

    // Collapse collinear corners → minimal ring; map lattice indices → world coords.
    const raw: Pt[] = ringIdx.map(c => ({ x: cornerX(c.xi), z: cornerZ(c.zi) }));
    const ring: Pt[] = [];
    for (let i = 0; i < raw.length; i++) {
        const prev = raw[(i - 1 + raw.length) % raw.length]!, cur = raw[i]!, next = raw[(i + 1) % raw.length]!;
        const coll = (Math.abs(prev.x - cur.x) < EPS && Math.abs(cur.x - next.x) < EPS) ||
                     (Math.abs(prev.z - cur.z) < EPS && Math.abs(cur.z - next.z) < EPS);
        if (!coll) ring.push({ x: round6(cur.x), z: round6(cur.z) });
    }
    if (ring.length < 4) return null;   // not a real polygon (defensive)

    // §UNION-CONNECTED — the walk traces ONLY the boundary of the component containing the start cell.
    // If the input rects are NOT a single connected region (or the union has a hole), the traced ring's
    // area is LESS than the total filled-cell area; bail null so the caller never ships a polygon that
    // omits part of the union. For the spine + abutting legs (the only production caller) the area
    // matches exactly, so this is a strict identity there. Areas come from the same grid → exact.
    let totalFilledArea = 0;
    for (let zi = 0; zi < nz; zi++) for (let xi = 0; xi < nx; xi++) {
        if (filled[zi]![xi]) totalFilledArea += (xs[xi + 1]! - xs[xi]!) * (zs[zi + 1]! - zs[zi]!);
    }
    if (cellAreaM2(ring) < totalFilledArea - 1e-6) return null;   // ring omits part of the union
    return ring;
}

/**
 * §POLYGON-CORRIDOR-ARM (founder §CIRCULATION-GRAPH polygon-native rework PART 4 / FF-R1, 2026-06-17)
 * — extend the corridor's cell POLYGON into a SECOND (third, …) arm so EVERY private room abuts it.
 *
 * THE DEFECT (Phase 4 fixes): on a fragmented plate the corridor threads only ONE arm, so a private
 * room (bedroom / bathroom / master) in the OTHER arm is not on the corridor — it ships "served
 * through" a public room (`§DIAG-ADJACENCY r5(bedroom)→dining✓` instead of →corridor;
 * `unroutedToCirculation=[r5]`; the gate fails `circulation`; on the upper floor far-arm bedrooms
 * SEAL). This pass turns the corridor's L (one leg) into a T / U / + (multiple legs).
 *
 * For every PRIVATE / SERVICE room (privacy 'private'/'service', plus 'bedroom'/'bathroom'/'master',
 * EXCLUDING the master-served 'ensuite') whose RECT does NOT already share a ≥0.9 m wall with the
 * corridor POLYGON, it tries to grow an additional corridor LEG (width = corridor short side) through
 * EMPTY space from the corridor spine to that room's nearest edge — reusing {@link findCorridorStubToKeepOut}
 * with the TARGET ROOM's rect as the keep-out to route toward (its §STUB-EMPTY-ONLY discipline rejects
 * any lane crossing a habitable room, and stops the leg at the room's near edge so it never overlaps).
 * Every successful leg is UNIONED (with the spine + the stair-leg) into a single CCW ring by
 * {@link rectUnionRing}, so the corridor's `cellPolygonById` entry becomes the multi-arm ring the wall
 * sweep reads. The corridor's `placements` RECT is UNTOUCHED (the area / min / overlap gates unchanged).
 *
 * SELF-VALIDATING / NON-REGRESSING: every leg is OPTIONAL — a room unreachable through empty space is
 * left (no-op for that room). A leg never overlaps a habitable room (§STUB-EMPTY-ONLY). When NO arm is
 * reachable the result is returned UNCHANGED (so the pass is byte-identical to the Phase 2 output, and
 * — absent a keep-out — to the whole pre-rework path). When a leg's union fails to form a clean ring
 * that leg is skipped (never a corrupted polygon). Pure + deterministic. */
function emitPolygonCorridorArm(
    result: SubdivideResult,
    corridorId: string | null,
    keepOuts: readonly Rect[],
    typeById: ReadonlyMap<string, RoomType>,
    corridorWidthM: number,
): SubdivideResult {
    if (!corridorId || keepOuts.length === 0) return result;
    const corrP = result.placements.find(p => p.roomId === corridorId);
    if (!corrP) return result;
    const spine = corrP.rect;

    // The corridor cell polygon as it stands after §POLYGON-CORRIDOR-LEG (spine, or spine ∪ stair-leg).
    const baseRing = result.cellPolygonById?.get(corridorId) ?? rectPolygon(spine);

    // §1 — the unreached private rooms: privacy private/service (plus bedroom/bathroom/master),
    // EXCLUDING the corridor/stair and the master-served ensuite, whose RECT does not already share a
    // door-width wall with the corridor polygon. Deterministic order (placements order).
    const isArmTarget = (id: string): boolean => {
        if (id === corridorId) return false;
        const t = typeById.get(id);
        if (t === undefined) return false;
        if (t === 'stair' || t === 'corridor' || t === 'hall' || t === 'ensuite') return false;
        const priv = roomRule(t).privacy;
        return priv === 'private' || priv === 'service' || t === 'bedroom' || t === 'bathroom' || t === 'master';
    };
    const buildBB = placementsBBox(result.placements);
    const shellBB: Rect = {
        x0: keepOuts.reduce((m, ko) => Math.min(m, ko.x0), buildBB.x0),
        z0: keepOuts.reduce((m, ko) => Math.min(m, ko.z0), buildBB.z0),
        x1: keepOuts.reduce((m, ko) => Math.max(m, ko.x1), buildBB.x1),
        z1: keepOuts.reduce((m, ko) => Math.max(m, ko.z1), buildBB.z1),
    };

    // §2 — grow a leg toward each unreached target. We route through EMPTY space using
    // findCorridorStubToKeepOut with the TARGET ROOM as the single keep-out (it stops the leg at the
    // room's near edge, so it shares a wall WITHOUT overlapping). Each leg abuts the spine, so the
    // union of the spine + all legs is one connected, simply-connected rectilinear region.
    const legs: Rect[] = [];
    let reached = 0;
    let workingRing = baseRing;
    for (const p of result.placements) {
        if (!isArmTarget(p.roomId)) continue;
        if (polyRectSharedWallM(workingRing, p.rect) >= STAIR_DOOR_MIN_M - EPS) continue;   // already on corridor
        // Route the leg through empty space toward this room (room rect = the keep-out to reach).
        // §STUB-EMPTY-ONLY rejects any lane crossing a habitable room → the leg is safe by construction.
        const leg = findCorridorStubToKeepOut(result.placements, corridorId, [p.rect], typeById, corridorWidthM, shellBB);
        if (leg === null) continue;
        // §STAIR-KEEPOUT-CLEAR — the empty-channel router exempts the `stair` ROOM (correct, for the
        // stair-leg), so an arm-leg could legally cross the stair KEEP-OUT. The corridor polygon must
        // never overlap the stair core (the §65.1 invariant the houseLayout keep-out test enforces on
        // the cell polygon's bbox). Reject any leg that intersects a keep-out by more than a hairline.
        if (keepOuts.some(ko => overlapAreaM2(leg, ko) > EPS)) continue;
        // Compose spine + every accepted leg so far + this leg into ONE clean ring; only ACCEPT this
        // leg if the union is a valid ring AND the target now shares ≥0.9 m with it (else skip — no
        // corrupted polygon, no false positive).
        const candidateLegs = [...legs, leg];
        const ring = rectUnionRing([spine, ...candidateLegs]);
        if (ring === null) continue;
        if (polyRectSharedWallM(ring, p.rect) < STAIR_DOOR_MIN_M - EPS) continue;
        legs.push(leg);
        workingRing = ring;
        reached += 1;
    }

    if (reached === 0) return result;   // nothing reachable → byte-identical (no arm added).

    console.log(`[D-TGL subdivide] §POLYGON-CORRIDOR-ARM corridor=${corridorId} reachedRooms=${reached}`);
    const merged = new Map<string, readonly Pt[]>(result.cellPolygonById ?? []);
    merged.set(corridorId, workingRing);
    return { ...result, cellPolygonById: merged };
}

/**
 * §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08) — reshape the corridor placement
 * into a NARROW STRIP whenever it came out wider than its rule's `maxShortSideM`.
 * The multi-rect / squarify paths can hand the corridor a NEAR-SQUARE cell (a fat
 * blob, e.g. 3 m × 3.5 m); the §SINGLE-RECT carve already builds a 1.2 m strip, so
 * this is a NO-OP there. The corridor's cell is narrowed along its SHORT axis to
 * `maxShortSideM`; the freed band is DONATED to the neighbour placement(s) that
 * fully TILE the freed region's long edge (so no gap appears and the slack goes to
 * a habitable room). When no neighbour set tiles it cleanly, the corridor keeps its
 * original cell (defensive — never a gap / overlap). Deterministic + pure.
 *
 * CRITICAL (the sealing fix that distinguishes this from the reverted 5b472cfb):
 * this ONLY ever narrows the SHORT axis and ONLY donates to neighbours that ALREADY
 * abut the freed band — it never SHORTENS the corridor's long axis (the reverted
 * attempt's `leftoverRect` length-trim stranded a served room). The caller
 * additionally VALIDATES the result against `roomsWithAnySharedWall` and discards
 * the reshape if it would seal any room, so §EVERY-ROOM-ACCESS is a HARD guarantee.
 *
 * `corridorId` is the corridor room's id (null ⇒ no corridor ⇒ identity).
 */
export function reshapeCorridorStrip(
    placements: readonly RoomPlacement[],
    corridorId: string | null,
): RoomPlacement[] {
    if (!corridorId) return placements.slice();
    const idx = placements.findIndex(p => p.roomId === corridorId);
    if (idx < 0) return placements.slice();
    const cor = placements[idx]!;
    const r = cor.rect;
    const w = r.x1 - r.x0;
    const h = r.z1 - r.z0;
    const maxShort = roomRule('corridor').maxShortSideM;
    if (maxShort === undefined) return placements.slice();
    const short = Math.min(w, h);
    if (short <= maxShort + EPS) return placements.slice();   // already a strip — no-op

    // Narrow the corridor along its SHORT axis to `maxShort`, freeing a band of
    // the rest of the cell. We try freeing toward EITHER side (strip flush to the
    // low edge → free the high band; OR flush to the high edge → free the low band)
    // and take the side whose neighbours can FULLY absorb the freed band with no
    // gap. The freed band is donated by extending each abutting neighbour's edge to
    // swallow its overlap span; the donation is accepted only when the union of
    // those overlaps covers the freed band's full long extent (no hole left).
    const along: 'x' | 'z' = w >= h ? 'x' : 'z';   // long axis of the corridor cell

    const tryNarrow = (flush: 'low' | 'high'): RoomPlacement[] | null => {
        let strip: Rect, freed: Rect;
        if (along === 'x') {
            // short axis is z.
            if (flush === 'low') {
                strip = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0 + maxShort };
                freed = { x0: r.x0, z0: r.z0 + maxShort, x1: r.x1, z1: r.z1 };
            } else {
                strip = { x0: r.x0, z0: r.z1 - maxShort, x1: r.x1, z1: r.z1 };
                freed = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 - maxShort };
            }
        } else {
            // short axis is x.
            if (flush === 'low') {
                strip = { x0: r.x0, z0: r.z0, x1: r.x0 + maxShort, z1: r.z1 };
                freed = { x0: r.x0 + maxShort, z0: r.z0, x1: r.x1, z1: r.z1 };
            } else {
                strip = { x0: r.x1 - maxShort, z0: r.z0, x1: r.x1, z1: r.z1 };
                freed = { x0: r.x0, z0: r.z0, x1: r.x1 - maxShort, z1: r.z1 };
            }
        }
        if (rectArea(freed) <= EPS) return null;

        // Each abutting neighbour extends its edge back across its overlap span.
        // We require the overlaps to TILE the freed band's long extent exactly
        // (sorted, contiguous, covering end-to-end).
        const overlaps: { i: number; lo: number; hi: number; grown: Rect }[] = [];
        const longLo = along === 'x' ? freed.x0 : freed.z0;
        const longHi = along === 'x' ? freed.x1 : freed.z1;
        for (let i = 0; i < placements.length; i++) {
            if (i === idx) continue;
            const n = placements[i]!.rect;
            let abuts = false;
            let grown: Rect = n;
            if (along === 'x') {
                const oLo = Math.max(n.x0, freed.x0), oHi = Math.min(n.x1, freed.x1);
                if (oHi - oLo <= EPS) continue;          // no long-extent overlap
                if (flush === 'low' && Math.abs(n.z0 - freed.z1) < ALIGNMENT_SNAP_EPS_M) {
                    abuts = true; grown = { ...n, z0: freed.z0 };
                } else if (flush === 'high' && Math.abs(n.z1 - freed.z0) < ALIGNMENT_SNAP_EPS_M) {
                    abuts = true; grown = { ...n, z1: freed.z1 };
                }
                if (abuts) overlaps.push({ i, lo: oLo, hi: oHi, grown });
            } else {
                const oLo = Math.max(n.z0, freed.z0), oHi = Math.min(n.z1, freed.z1);
                if (oHi - oLo <= EPS) continue;
                if (flush === 'low' && Math.abs(n.x0 - freed.x1) < ALIGNMENT_SNAP_EPS_M) {
                    abuts = true; grown = { ...n, x0: freed.x0 };
                } else if (flush === 'high' && Math.abs(n.x1 - freed.x0) < ALIGNMENT_SNAP_EPS_M) {
                    abuts = true; grown = { ...n, x1: freed.x1 };
                }
                if (abuts) overlaps.push({ i, lo: oLo, hi: oHi, grown });
            }
        }
        if (overlaps.length === 0) return null;
        overlaps.sort((a, b) => a.lo - b.lo);
        let cursor = longLo;
        for (const o of overlaps) {
            if (o.lo > cursor + ALIGNMENT_SNAP_EPS_M) return null;   // gap before this span
            cursor = Math.max(cursor, o.hi);
        }
        if (cursor < longHi - ALIGNMENT_SNAP_EPS_M) return null;     // uncovered tail

        const grownById = new Map(overlaps.map(o => [o.i, o.grown]));
        return placements.map((p, i) =>
            i === idx ? { roomId: cor.roomId, rect: roundRect(strip) }
            : grownById.has(i) ? { roomId: p.roomId, rect: roundRect(grownById.get(i)!) }
            : p,
        );
    };

    // Prefer freeing the band whose neighbours fully absorb it; try low then high
    // (deterministic). If NEITHER side tiles cleanly, keep the original cell.
    return tryNarrow('low') ?? tryNarrow('high') ?? placements.slice();
}

// ── §CORRIDOR-END-TRIM (A.21.D57, 2026-06-08) ────────────────────────────────

/**
 * §CORRIDOR-END-TRIM (A.21.D57) — a corridor only needs to SPAN from the entrance
 * to the LAST room-door it serves. The §SINGLE-RECT carve builds the corridor strip
 * running the FULL length of the shell's long axis (perimeter to perimeter), so when
 * the served rooms do not reach the far end the corridor OVERSHOOTS into a dead stub
 * against the perimeter wall — wasting the best wall (the exterior frontage) on
 * circulation instead of a habitable room. This pass TRIMS the corridor's LONG axis
 * back to the served-room extent (+ a small end clearance) and DONATES the freed
 * perimeter end-band to the adjacent habitable room that fully tiles it — extending
 * that room TO the perimeter so it gains exterior frontage (→ windows → daylight,
 * the founder's stated goal).
 *
 * CRITICAL (the sealing-safety doctrine, distinguishing this from the reverted
 * 5b472cfb): the required extent is the union of the shared-wall spans of the rooms
 * that DEPEND on the corridor for access — every private / service room (bedroom,
 * bathroom, ensuite, wc, study, master), PLUS the entrance/hall connection so the
 * spine still reaches the front door. A public room (living / kitchen / dining) that
 * abuts the corridor only PAST that extent has its own façade frontage and other
 * access, so its corridor stub may be reclaimed: the freed band is donated to it,
 * extending it to the corridor's far short-face (the EXTERIOR perimeter → windows).
 * The caller ADDITIONALLY runs the result through the `roomsWithAnySharedWall`
 * sealing-safety gate and DISCARDS the trim if it would strand ANY room (leave it
 * with no shared wall at all) — so §EVERY-ROOM-ACCESS is a HARD guarantee and a
 * corridor that genuinely must span the full shell is left UNCHANGED.
 *
 * `dependsOnCorridor` maps a room id → true when that room NEEDS the corridor (the
 * caller passes the private/service + entry set from the program rules). Absent ⇒
 * every neighbour is treated as corridor-dependent (the conservative identity-leaning
 * default — the union then equals the full abutter span and nothing is freed).
 *
 * Pure + deterministic. `corridorId` null ⇒ identity.
 */

export function trimCorridorToLastDoor(
    placements: readonly RoomPlacement[],
    corridorId: string | null,
    dependsOnCorridor?: ReadonlySet<string>,
): RoomPlacement[] {
    if (!corridorId) return placements.slice();
    const idx = placements.findIndex(p => p.roomId === corridorId);
    if (idx < 0) return placements.slice();
    const cor = placements[idx]!.rect;
    const w = cor.x1 - cor.x0;
    const h = cor.z1 - cor.z0;
    const along: 'x' | 'z' = w >= h ? 'x' : 'z';     // the corridor's LONG (spine) axis
    const corLo = along === 'x' ? cor.x0 : cor.z0;
    const corHi = along === 'x' ? cor.x1 : cor.z1;
    const corShort0 = along === 'x' ? cor.z0 : cor.x0;
    const corShort1 = along === 'x' ? cor.z1 : cor.x1;

    // Required span = the union of the shared-wall extents (on the corridor's long
    // axis) of the rooms that DEPEND on the corridor for access. A neighbour shares a
    // wall on one of the corridor's two LONG faces (a short-face abutment): it abuts
    // at corShort0 or corShort1 and overlaps the corridor on the long axis; its
    // overlap interval is exactly that shared wall. A corridor-dependent room must
    // stay inside the trimmed corridor; a non-dependent (public, own-façade) room may
    // be trimmed past + donated to.
    const dependent = (id: string): boolean => dependsOnCorridor ? dependsOnCorridor.has(id) : true;
    let needLo = Number.POSITIVE_INFINITY;
    let needHi = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < placements.length; i++) {
        if (i === idx) continue;
        if (!dependent(placements[i]!.roomId)) continue;
        const n = placements[i]!.rect;
        const nShort0 = along === 'x' ? n.z0 : n.x0;
        const nShort1 = along === 'x' ? n.z1 : n.x1;
        const abutsLongFace =
            Math.abs(nShort1 - corShort0) < ALIGNMENT_SNAP_EPS_M ||
            Math.abs(nShort0 - corShort1) < ALIGNMENT_SNAP_EPS_M;
        if (!abutsLongFace) continue;
        const nLong0 = along === 'x' ? n.x0 : n.z0;
        const nLong1 = along === 'x' ? n.x1 : n.z1;
        const oLo = Math.max(nLong0, corLo);
        const oHi = Math.min(nLong1, corHi);
        if (oHi - oLo <= ALIGNMENT_SNAP_EPS_M) continue;   // touches the end only — not a shared wall
        if (oLo < needLo) needLo = oLo;
        if (oHi > needHi) needHi = oHi;
    }
    if (!Number.isFinite(needLo) || !Number.isFinite(needHi)) return placements.slice();

    // Trim to EXACTLY the served extent at each end (the far edge of the first/last
    // dependent room), clamped to the original corridor span (never extend outward).
    // The trim point coincides with a real subdivision boundary so the freed band
    // aligns with the donee room's edge and the donation stays RECTANGULAR (no
    // L-shaped room). Any door reveal-clearance is a downstream door-placement
    // concern, not a room-rect concern. The trimmed corridor must still clear the
    // corridor's own minLongSideM floor (the spine must read as a real corridor).
    const trimmedLo = Math.max(corLo, needLo);
    const trimmedHi = Math.min(corHi, needHi);
    if (trimmedHi - trimmedLo <= EPS) return placements.slice();
    const minLong = roomRule('corridor').minLongSideM;
    if (minLong !== undefined && trimmedHi - trimmedLo < minLong - EPS) return placements.slice();

    // Nothing to free? (the dependent rooms already reach both ends) → identity.
    const freesLow = trimmedLo > corLo + ALIGNMENT_SNAP_EPS_M;
    const freesHigh = trimmedHi < corHi - ALIGNMENT_SNAP_EPS_M;
    if (!freesLow && !freesHigh) return placements.slice();

    const makeRect = (lo: number, hi: number): Rect =>
        along === 'x'
            ? { x0: lo, z0: corShort0, x1: hi, z1: corShort1 }
            : { x0: corShort0, z0: lo, x1: corShort1, z1: hi };

    // Donate ONE freed end-band to a single neighbour that abuts it (on either long
    // face) AND exactly matches its long extent — extending that neighbour across the
    // corridor's short width to swallow the band, so the room reaches the corridor's
    // far short-face (and, since the corridor strip runs perimeter-to-perimeter, the
    // EXTERIOR wall → frontage → windows). When BOTH a low-face and a high-face room
    // tile the band, the band has two abutters across the corridor width; we pick the
    // stable-LOWEST room id (deterministic). Returns the donee index + grown rect, or
    // null when no neighbour tiles the band cleanly (then we DON'T trim that end —
    // never leave a gap).
    const donateBand = (bandLo: number, bandHi: number): { donee: number; grown: Rect } | null => {
        type Cand = { i: number; grown: Rect; id: string };
        const cands: Cand[] = [];
        for (let i = 0; i < placements.length; i++) {
            if (i === idx) continue;
            const n = placements[i]!.rect;
            const nShort0 = along === 'x' ? n.z0 : n.x0;
            const nShort1 = along === 'x' ? n.z1 : n.x1;
            const nLong0 = along === 'x' ? n.x0 : n.z0;
            const nLong1 = along === 'x' ? n.x1 : n.z1;
            // Must EXACTLY match the band's long extent so the donation stays a clean
            // RECTANGLE — a wider room would become L-shaped if it absorbed only a
            // sub-range of the band.
            if (Math.abs(nLong0 - bandLo) > ALIGNMENT_SNAP_EPS_M ||
                Math.abs(nLong1 - bandHi) > ALIGNMENT_SNAP_EPS_M) continue;
            let grown: Rect | null = null;
            if (Math.abs(nShort1 - corShort0) < ALIGNMENT_SNAP_EPS_M) {
                // Neighbour sits on the LOW short-face → grow its high short-edge across the band.
                grown = along === 'x'
                    ? { x0: bandLo, z0: n.z0, x1: bandHi, z1: corShort1 }
                    : { x0: n.x0, z0: bandLo, x1: corShort1, z1: bandHi };
            } else if (Math.abs(nShort0 - corShort1) < ALIGNMENT_SNAP_EPS_M) {
                // Neighbour sits on the HIGH short-face → grow its low short-edge across the band.
                grown = along === 'x'
                    ? { x0: bandLo, z0: corShort0, x1: bandHi, z1: n.z1 }
                    : { x0: corShort0, z0: bandLo, x1: n.x1, z1: bandHi };
            }
            if (!grown) continue;
            cands.push({ i, grown, id: placements[i]!.roomId });
        }
        if (cands.length === 0) return null;
        cands.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));   // deterministic
        const c = cands[0]!;
        return { donee: c.i, grown: c.grown };
    };

    // Try trimming each freed end; only ACCEPT an end when its band is fully donated
    // (no gap). We mutate a working copy of the corridor span + a donations map.
    let lo = corLo, hi = corHi;
    const grownById = new Map<number, Rect>();
    if (freesLow) {
        const d = donateBand(corLo, trimmedLo);
        if (d) { grownById.set(d.donee, d.grown); lo = trimmedLo; }
    }
    if (freesHigh) {
        const d = donateBand(trimmedHi, corHi);
        // Don't let a second donation overwrite the same donee's first grown rect
        // (a single room tiling BOTH ends is degenerate — keep the low-end trim only).
        if (d && !grownById.has(d.donee)) { grownById.set(d.donee, d.grown); hi = trimmedHi; }
    }
    if (lo === corLo && hi === corHi) return placements.slice();   // nothing donated → no trim

    return placements.map((p, i) =>
        i === idx ? { roomId: p.roomId, rect: roundRect(makeRect(lo, hi)) }
        : grownById.has(i) ? { roomId: p.roomId, rect: roundRect(grownById.get(i)!) }
        : p,
    );
}

/**
 * §FEASIBILITY-ALLOC (A.21.D5, 2026-06-06) — subdivide the shell `rects` among
 * the program rooms AND report any room that could not be placed at its per-type
 * minimum short side. Returns one footprint per PLACED room (footprints lie
 * inside the shell rects, do not overlap, and tile the shell) plus a structured
 * `droppedRooms` list (empty in the common case). The drop list is how the
 * engine HONOURS the requested room count when feasible and REPORTS the shortfall
 * when it genuinely is not — never a silent loss.
 *
 * §L4-δ-1b — by default the output is run through `snapAxisLines` so room-rect
 * edges within 50 mm of each other are snapped to the shared mean.
 */
/**
 * §52.6 P3c-a (ADR-0072) — coalesce sub-rects that share a FULL edge into their bounding
 * rectangle. A stair keep-out carve fractures the buildable plate into collinear BANDS
 * (e.g. the rectilinear decomposition splits one contiguous arm into two stacked rects that
 * together form a rectangle); the dominant-rect corridor carve then runs on ONE band only
 * and orphans the rooms allocated to the others → the §52.6 land-lock (bathroom.accessFrom =
 * ['corridor'] only, no chain rescues it). Re-joining full-edge-adjacent bands first hands the
 * carve a single large rect that can spine the WHOLE programme.
 *
 * Merges two rects ONLY when they are edge-adjacent AND have identical extent on the
 * perpendicular axis — i.e. their union is EXACTLY the bounding rectangle, so it never covers
 * empty space or a keep-out notch (a band split off BY a keep-out does not share a full edge
 * with its neighbour, so it is left alone). Greedy to a fixpoint. Pure + deterministic; a
 * decomposition with no mergeable bands returns an equivalent set (no behaviour change).
 */
function coalesceFullEdgeRects(rects: readonly Rect[]): Rect[] {
    const out: Rect[] = rects.map(r => ({ ...r }));
    for (let pass = true; pass;) {
        pass = false;
        search:
        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) {
                const a = out[i]!, b = out[j]!;
                const sameZ = Math.abs(a.z0 - b.z0) < EPS && Math.abs(a.z1 - b.z1) < EPS;
                const sameX = Math.abs(a.x0 - b.x0) < EPS && Math.abs(a.x1 - b.x1) < EPS;
                const adjX = Math.abs(a.x1 - b.x0) < EPS || Math.abs(b.x1 - a.x0) < EPS;
                const adjZ = Math.abs(a.z1 - b.z0) < EPS || Math.abs(b.z1 - a.z0) < EPS;
                if (sameZ && adjX) {            // side-by-side, same z-span → one wide rect
                    out[i] = { x0: Math.min(a.x0, b.x0), z0: a.z0, x1: Math.max(a.x1, b.x1), z1: a.z1 };
                    out.splice(j, 1); pass = true; break search;
                }
                if (sameX && adjZ) {            // stacked, same x-span → one tall rect
                    out[i] = { x0: a.x0, z0: Math.min(a.z0, b.z0), x1: a.x1, z1: Math.max(a.z1, b.z1) };
                    out.splice(j, 1); pass = true; break search;
                }
            }
        }
    }
    return out;
}

/**
 * §SPINE-FIRST P8 (2026-06-22) — true iff `poly` is (within `eps`) a 4-vertex AXIS-ALIGNED
 * rectangle. Spine-first packs rooms into bands derived from the shell's BBOX; those bands only
 * coincide with the real perimeter on a rectangle. In THIS principal-axis layout frame a rotated
 * rectangle IS axis-aligned (its rotation was removed upstream), so it passes; a genuinely SHEARED
 * convex quad / trapezoid / concave shell (GIS boundary) keeps diagonal edges → returns false. The
 * spine path must NOT run on the latter — its bbox bands overflow the slanted façade ("rooms out of
 * the boundary") and the per-cell clamp only leaves white slivers — those shells take the polygon-
 * native carve (subdividePolygon) the ground floor already proves correct. Mirrors the pure logic of
 * `wallsAndDoors.isAxisAlignedBox` but inlined to avoid the subdivide↔wallsAndDoors import cycle.
 */
function isAxisAlignedRect4(poly: readonly Pt[], eps = 1e-3): boolean {
    if (poly.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
        const a = poly[i]!, b = poly[(i + 1) % 4]!;
        const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
        const horizontal = dz <= eps && dx > eps;
        const vertical = dx <= eps && dz > eps;
        if (!horizontal && !vertical) return false;
    }
    return true;
}

export function subdivideWithReport(
    rects: readonly Rect[],
    graph: BubbleGraph,
    options: SubdivideOptions = {},
): SubdivideResult {
    const alignmentSnap = options.alignmentSnap ?? true;
    // A.25.3 — corridor strip width override (accessibility slider). Clamp to a
    // sane band; absent ⇒ undefined ⇒ the carve uses its built-in 1.2 m default
    // (byte-identical to the legacy behaviour).
    const corridorWidthM = typeof options.corridorWidthM === 'number' && Number.isFinite(options.corridorWidthM)
        ? Math.max(1.0, Math.min(2.0, options.corridorWidthM))
        : undefined;
    // §STAIR-CIRC-FACE — the stair keep-out rect(s) (strategy frame), used by `finalise` to
    // orient the carve so the corridor abuts the stair. Absent ⇒ [] ⇒ the pass is a no-op.
    const keepOutRects = (options.keepOutRects ?? []).filter(r => rectArea(r) > EPS);
    // §ENTRANCE-HALL-ON-SHELL (tracker §57.4) — suppress the hall-slice on a rectified
    // (sheared) shell (the §RECTIFY-SHELL-PROJECT invariant; see SubdivideOptions doc).
    const shellRectified = options.shellRectified === true;
    const valid = rects.filter(r => rectArea(r) > EPS).sort(byAreaDesc);
    if (valid.length === 0 || graph.rooms.length === 0) return { placements: [], droppedRooms: [] };

    // §SPINE-FIRST P4 (flag-gated) / P8 (2026-06-22 rectangular-shell gate) — for an all-private
    // (upper) storey, REPLACE the area-first carve with the circulation-first path: derive the
    // corridor spine from the shell + pack the private rooms off it so every room AND the stair sit
    // on a central corridor by construction. Gated on options.spineFirst AND no public rooms ("hall
    // for public, spine for private" doctrine — the ground floor keeps the hall-hinge) AND a
    // RECTANGULAR shell. The rectangle gate (P8) is the fix for the founder's "rooms out of the
    // boundary" on the upper floor: spine-first tiles BBOX bands, which only fit a rectangle; a
    // sheared/convex/concave shell would overflow the slanted façade, so it MUST fall through to the
    // polygon-native carve (subdividePolygon) the ground floor proves correct. In this principal-axis
    // frame a rotated rectangle passes; a GIS trapezoid/parallelogram does not. Any miss (public
    // present / non-rect shell / no corridor / a drop / no ring) → legacy carve (ADR-0061 additive).
    // §18 slice 4 — §SPINE-TREE: the multi-leg, polygon-native, public/private-zoned spine. Runs FIRST
    // (opt-in via options.spineTree) on ANY shell with a corridor — no rectangle gate, no no-public gate
    // — because the tree pack clips cells to the real shell and zones public/private across the run. Any
    // miss (no corridor / a drop) falls through to the rect spine-first + legacy carve. Strictly additive.
    if (options.spineFirst && options.spineTree && graph.corridorId) {
        const bx0 = Math.min(...valid.map(r => r.x0)), bz0 = Math.min(...valid.map(r => r.z0));
        const bx1 = Math.max(...valid.map(r => r.x1)), bz1 = Math.max(...valid.map(r => r.z1));
        const bboxPoly: Pt[] = [
            { x: bx0, z: bz0 }, { x: bx1, z: bz0 }, { x: bx1, z: bz1 }, { x: bx0, z: bz1 },
        ];
        const shellForSpine = options.shellPolygon && options.shellPolygon.length >= 3 ? options.shellPolygon : bboxPoly;
        const clampPoly = options.shellPolygon && options.shellPolygon.length >= 3 ? options.shellPolygon : undefined;
        const clampRect = (rc: Rect): Rect => {
            if (!clampPoly) return roundRect(rc);
            const c = clampRectToConvexShell(roundRect(rc), clampPoly);
            return c ? roundRect(c) : roundRect(rc);
        };
        const typeByRoomId = new Map(graph.rooms.map(r => [r.id, r.type]));
        const overlapsKeepOut = (rc: Rect): boolean =>
            keepOutRects.some(ko => {
                const ox = Math.min(rc.x1, ko.x1) - Math.max(rc.x0, ko.x0);
                const oz = Math.min(rc.z1, ko.z1) - Math.max(rc.z0, ko.z0);
                return ox > 0.05 && oz > 0.05;   // > a hairline ⇒ a real room-over-stair overlap
            });
        const underMinArea = (id: string, rc: Rect): boolean => {
            const t = typeByRoomId.get(id);
            if (t === undefined) return false;
            return rectArea(rc) < roomRule(t).minAreaM2 - 0.01;
        };
        // §SINGLE-LOAD-PERIPHERAL (§19.3 / §20.1) — on a COMPACT (non-fragmented) plate the corridor
        // hugs the core/stair edge and ALL rooms sit in ONE band against the far façade, so every room
        // gets BOTH a corridor wall (circulation) AND a façade (window). A plate is "fragmented" when
        // the stair keep-out sits INTERIOR (away from every shell edge) and splits the plate — there
        // the multi-leg double-loaded tree is the right pattern (§20.1). Gated to the spine-tree path.
        const stairKo = keepOutRects[0];
        const stairTouchesEdge = stairKo
            ? (Math.abs(stairKo.x0 - bx0) < 0.2 || Math.abs(stairKo.x1 - bx1) < 0.2 ||
               Math.abs(stairKo.z0 - bz0) < 0.2 || Math.abs(stairKo.z1 - bz1) < 0.2)
            : true;   // no stair ⇒ trivially non-fragmented
        const wantSingleLoaded = stairTouchesEdge;

        // §18 slice 5a — STRICTLY-ADDITIVE GUARD: apply a tree result ONLY when it is clean — NO room
        // overlaps the stair keep-out, NO room is below its type's min area, and NO room was dropped.
        // On ANY violation the candidate is rejected (return null) and we fall through to the next
        // attempt (single-loaded → double-loaded → rect spine-first → legacy). Never worse than legacy.
        const tryTreeRes = (treeRes: SpinePackResult | null, label: string): SubdivideResult | null => {
            if (!treeRes || treeRes.dropped.length > 0) {
                console.log(`[D-TGL subdivide] §SPINE-TREE ${label} skipped (no corridor / a drop) — falling through.`);
                return null;
            }
            const placements: RoomPlacement[] = [
                { roomId: graph.corridorId!, rect: clampRect(treeRes.corridor) },
                ...treeRes.rooms.map(p => ({ roomId: p.roomId, rect: clampRect(p.rect) })),
            ];
            const treeBad = placements.some(p =>
                p.roomId !== graph.corridorId && (overlapsKeepOut(p.rect) || underMinArea(p.roomId, p.rect)));
            if (treeBad) {
                console.log(`[D-TGL subdivide] §SPINE-TREE ${label} rejected (room↔stair overlap or under-min-area) — falling through.`);
                return null;
            }
            const cellPolygonById = new Map<string, readonly Pt[]>();
            if (treeRes.cellPolygonById) for (const [id, poly] of treeRes.cellPolygonById) cellPolygonById.set(id, poly);
            const ring = rectUnionRing(treeRes.corridorCells.map(clampRect));
            if (ring) cellPolygonById.set(graph.corridorId!, ring);
            // §DIAG-SPINE-SINGLELOAD — one debuggable line: mode, rooms-one-band, corridor-edge, stair y/n.
            const stairBridged = stairKo
                ? treeRes.corridorCells.some(c => {
                    const a = { x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1 };
                    const vAbut = Math.abs(a.x1 - stairKo.x0) < 0.05 || Math.abs(stairKo.x1 - a.x0) < 0.05;
                    const zOv = Math.min(a.z1, stairKo.z1) - Math.max(a.z0, stairKo.z0);
                    const hAbut = Math.abs(a.z1 - stairKo.z0) < 0.05 || Math.abs(stairKo.z1 - a.z0) < 0.05;
                    const xOv = Math.min(a.x1, stairKo.x1) - Math.max(a.x0, stairKo.x0);
                    return (vAbut && zOv >= 0.9) || (hAbut && xOv >= 0.9);
                })
                : false;
            console.log(
                `[D-TGL subdivide] §DIAG-SPINE-SINGLELOAD mode=${label} rooms=${treeRes.rooms.length} ` +
                `band=${label === 'single-loaded' ? 'one' : 'multi'} corridorCells=${treeRes.corridorCells.length} ` +
                `stairBridged=${stairKo ? (stairBridged ? 'YES' : 'no') : 'n/a'}`,
            );
            console.log(
                `[D-TGL subdivide] §SPINE-TREE applied (${label}): corridor + ${treeRes.rooms.length} rooms off the ` +
                `${label === 'single-loaded' ? 'SINGLE-LOADED peripheral' : 'MULTI-LEG'} spine (every room on the corridor; ` +
                `cells clipped to the real shell; no stair overlap; corridorCells=${treeRes.corridorCells.length})`,
            );
            return { placements, droppedRooms: [], ...(cellPolygonById.size ? { cellPolygonById } : {}), spineFirstApplied: true };
        };

        // Attempt 1 — SINGLE-LOADED peripheral on a compact plate (the §19.3 cure). On any miss fall
        // through to the double-loaded multi-leg tree (Attempt 2), then the legacy paths below.
        const spineOpts = {
            ...(keepOutRects[0] ? { stairKeepOut: keepOutRects[0] } : {}),
            ...(corridorWidthM !== undefined ? { corridorWidthM } : {}),
            spineTree: true as const,
        };
        if (wantSingleLoaded) {
            const sl = subdivideViaSpine(shellForSpine, graph, { ...spineOpts, singleLoaded: true });
            const shipped = tryTreeRes(sl, 'single-loaded');
            if (shipped) return shipped;
        }
        // Attempt 2 — the double-loaded multi-leg tree (fragmented plates, or single-loaded infeasible).
        const treeRes = subdivideViaSpine(shellForSpine, graph, spineOpts);
        const shipped2 = tryTreeRes(treeRes, 'multi-leg');
        if (shipped2) return shipped2;
    }

    const spineShellPoly = options.shellPolygon;
    const spineShellIsRect = !spineShellPoly || spineShellPoly.length < 3
        ? true                                          // absent ⇒ the bbox is used ⇒ a rectangle
        : isAxisAlignedRect4(spineShellPoly);
    if (options.spineFirst && graph.corridorId && spineShellIsRect &&
        !graph.rooms.some(r => roomRule(r.type).privacy === 'public')) {
        const bx0 = Math.min(...valid.map(r => r.x0)), bz0 = Math.min(...valid.map(r => r.z0));
        const bx1 = Math.max(...valid.map(r => r.x1)), bz1 = Math.max(...valid.map(r => r.z1));
        const bboxPoly: Pt[] = [
            { x: bx0, z: bz0 }, { x: bx1, z: bz0 }, { x: bx1, z: bz1 }, { x: bx0, z: bz1 },
        ];
        // Derive the spine on the REAL shell polygon when supplied (skewed plate), else its bbox.
        const shellForSpine = options.shellPolygon && options.shellPolygon.length >= 3 ? options.shellPolygon : bboxPoly;
        const spineRes = subdivideViaSpine(shellForSpine, graph, {
            stairKeepOut: keepOutRects[0], corridorWidthM,
        });
        if (spineRes && spineRes.dropped.length === 0) {
            // §SPINE-FIRST P6/P8 — with the P8 rectangular-shell gate above, the shell is an axis-
            // aligned rectangle, so this clamp is a NO-OP (each cell clamps to itself); it is kept
            // only as a defensive guard. (P6's skew-clip ambition — running spine-first on sheared
            // shells via this clamp — is retired: the clamp left white slivers + overflowed on null,
            // so sheared shells now take the polygon-native carve instead. See isAxisAlignedRect4.)
            const clampPoly = options.shellPolygon && options.shellPolygon.length >= 3 ? options.shellPolygon : undefined;
            const clampRect = (rc: Rect): Rect => {
                if (!clampPoly) return roundRect(rc);
                const c = clampRectToConvexShell(roundRect(rc), clampPoly);
                return c ? roundRect(c) : roundRect(rc);
            };
            const placements: RoomPlacement[] = [
                { roomId: graph.corridorId, rect: clampRect(spineRes.corridor) },
                ...spineRes.rooms.map(p => ({ roomId: p.roomId, rect: clampRect(p.rect) })),
            ];
            const cellPolygonById = new Map<string, readonly Pt[]>();
            if (spineRes.corridorCells.length > 1) {
                const ring = rectUnionRing(spineRes.corridorCells.map(clampRect));
                if (ring) cellPolygonById.set(graph.corridorId, ring);   // L/T corridor (run + stair leg)
            }
            console.log(
                `[D-TGL subdivide] §SPINE-FIRST applied (all-private, RECTANGULAR shell): corridor + ${spineRes.rooms.length} ` +
                `rooms off the derived spine; corridorCells=${spineRes.corridorCells.length} clamped=${clampPoly ? 'yes(no-op)' : 'no'} ` +
                `(every private room + the stair on the central corridor by construction)`,
            );
            return { placements, droppedRooms: [], ...(cellPolygonById.size ? { cellPolygonById } : {}), spineFirstApplied: true };
        }
        console.log('[D-TGL subdivide] §SPINE-FIRST skipped (infeasible on this plate) — legacy carve.');
    }

    const finalise = (res: SubdivideResult): SubdivideResult => {
        // §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08, re-done with the sealing fix)
        // — narrow a fat (near-square, squarified) corridor cell into a strip BEFORE
        // the alignment snap. No-op when the carve already produced a strip (short
        // side ≤ maxShortSideM) — idempotent. The §SINGLE-RECT carve corridor is
        // already a 1.2 m strip, so this only ever fires on the multi-rect / squarify
        // paths.
        //
        // SEALING-SAFETY GATE (the fix that distinguishes this re-do from the
        // reverted 5b472cfb): the reverted attempt narrowed/shortened the corridor
        // and donated a freed band, which could strip a room of its only shared wall
        // with circulation → §EVERY-ROOM-ACCESS flagged it SEALED (the dining room in
        // doorMinimums.test.ts). Here we ACCEPT the reshape ONLY when it does not turn
        // any previously-wall-connected room into an island; otherwise we keep the
        // unreshaped placements. Physiognomy is best-effort; never seals a room.
        const reshaped = reshapeCorridorStrip(res.placements, graph.corridorId);
        const before = roomsWithAnySharedWall(res.placements);
        const after = roomsWithAnySharedWall(reshaped);
        const sealsARoom = [...before].some(id => !after.has(id));
        const physiognomised = sealsARoom ? res.placements : reshaped;

        // §CORRIDOR-END-TRIM (A.21.D57, 2026-06-08) — trim the corridor's LONG axis
        // back to the LAST served (corridor-dependent) room and donate the freed
        // perimeter end-band to the adjacent habitable room (→ exterior frontage →
        // daylight). Runs AFTER the physiognomy reshape so it operates on the final
        // strip. The dependent set = every private/service/circulation room (those
        // that NEED the corridor for access); public rooms (living/kitchen/dining,
        // which have their own façade frontage) are reclaimable past the last
        // dependent room. Gated by the SAME `roomsWithAnySharedWall` sealing-safety
        // check (the D46-redo doctrine): a trim that would strand any previously-
        // connected room is DISCARDED, so a corridor that must span the full shell is
        // left unchanged and §EVERY-ROOM-ACCESS stays a HARD guarantee.
        const dependsOnCorridor = new Set(
            graph.rooms
                .filter(r => {
                    const p = roomRule(r.type).privacy;
                    return p === 'private' || p === 'service' || p === 'circulation';
                })
                .map(r => r.id),
        );
        const trimmed = trimCorridorToLastDoor(physiognomised, graph.corridorId, dependsOnCorridor);
        const afterTrim = roomsWithAnySharedWall(trimmed);
        const trimSealsARoom = [...roomsWithAnySharedWall(physiognomised)].some(id => !afterTrim.has(id));
        const chosen = trimSealsARoom ? physiognomised : trimmed;

        // §STAIR-CIRC-FACE (founder defect, 2026-06-11) — orient the carve so the corridor /
        // landing shares a wall with the stair keep-out (the door pipeline can then place the
        // stair door onto circulation, not the bedroom that wraps it). No-op without a keep-out
        // (apartment + every keep-out-free path byte-identical). Reflection is area/shape/tiling-
        // preserving, so it can never seal a room or change drop count.
        const reflected = keepOutRects.length > 0
            ? orientCorridorToKeepOut(chosen, graph.corridorId, keepOutRects)
            : chosen;

        // §STAIR-OVERLAP-CLIP (founder defect §65.1, 2026-06-11) — the HARD invariant net: clip ANY
        // non-stair room rect that intersects a keep-out back clear of it, so no habitable room is
        // ever drawn across the stair (the founder's "Kitchen across the stair" defect). Runs after
        // the reflection so it also covers a reflection that grazed a keep-out. No-op when no room
        // overlaps (the common case on the handled plates) → byte-identical.
        // (The §65.3 corridor-STUB to a fragmented-dense keep-out is routed in enumerate.ts's
        // §STAIR-SPINE-TOUCH, where a new circulation room can be minted in the bubble graph —
        // one rect per room — rather than as a second corridor placement here.)
        const typeByRoomId: ReadonlyMap<string, RoomType> = new Map(graph.rooms.map(r => [r.id, r.type]));
        const oriented = keepOutRects.length > 0
            ? clipRoomsOutOfKeepOut(reflected, keepOutRects, typeByRoomId)
            : reflected;

        // §DIAG-STAIR-OVERLAP (founder defect §65.1, 2026-06-11) — per-storey engine-side proof
        // that NO habitable room rect intersects the stair keep-out (only the `stair` room may).
        // YES here is the founder's bug surface (a room flooded across the stair); after the clip
        // it must always read NO.
        if (keepOutRects.length > 0) {
            let worst: { id: string; type: string; ov: number } | null = null;
            for (const p of oriented) {
                if ((typeByRoomId.get(p.roomId) ?? '') === 'stair') continue;
                const ov = keepOutRects.reduce((m, ko) => Math.max(m, overlapAreaM2(p.rect, ko)), 0);
                if (ov > 1e-3 && (!worst || ov > worst.ov)) worst = { id: p.roomId, type: typeByRoomId.get(p.roomId) ?? '?', ov };
            }
            console.log(
                `[D-TGL subdivide] §DIAG-STAIR-OVERLAP roomOverlapsKeepOut=${worst ? 'YES' : 'NO'}` +
                `${worst ? ` offending=${worst.id}(${worst.type}) overlapM2=${worst.ov.toFixed(2)}` : ''} ` +
                `(YES ⇒ a habitable room is drawn across the stair keep-out — the §65.1 defect; NO ⇒ only the stair occupies it)`,
            );
        }

        // §DIAG-STAIR-CIRC (founder defect, 2026-06-11) — per-storey engine-side proof that the
        // corridor/landing reaches the stair keep-out. The next storey whose `corridorReachM` is
        // 0 ships the stair served through a habitable room (the founder's bug); a value ≥ 0.9 m
        // means a stair↔corridor door CAN be hosted. House-only (apartment passes no keep-out).
        if (keepOutRects.length > 0 && graph.corridorId) {
            const corrP = oriented.find(p => p.roomId === graph.corridorId);
            const reachM = corrP
                ? keepOutRects.reduce((b, ko) => Math.max(b, sharedWallLengthM(corrP.rect, ko)), 0)
                : 0;
            console.log(
                `[D-TGL subdivide] §DIAG-STAIR-CIRC corridor=${graph.corridorId} keepOuts=${keepOutRects.length} ` +
                `corridorReachM=${reachM.toFixed(2)} sharesStairWall=${reachM >= STAIR_DOOR_MIN_M - EPS ? 'YES' : 'NO'} ` +
                `(YES ⇒ stair can door onto circulation; NO ⇒ enumerate §STAIR-SPINE-TOUCH must bridge or the stair is served through a room)`,
            );
        }

        const snapped = alignmentSnap ? snapAxisLines(oriented) : oriented.slice();

        // §ROOM-OVERLAP-NET (founder defect §65.1, 2026-06-12) — THE HARD INVARIANT net: after
        // every placement / reflection / alignment-snap pass, clip (or, only if fully covered,
        // drop) any room rect that still overlaps another by more than a hairline, so NO two
        // emitted rooms ever share interior floor ("extremely forbidden!!"). snapAxisLines moves
        // rects independently — the documented late overlap source — so the net runs LAST here.
        // A clean (already-tiling) set is a strict identity → byte-identical (apartment + every
        // non-overlapping plate, ADR-0061). The §DIAG-OVERLAP assertion below proves NO overlap
        // ever ships (it must always read worstResidual ≈ 0).
        //
        // The CLIP-ACTION floor (OVERLAP_NET_CLIP_M2 = 0.05 m²) protects the rotated/sheared-plate
        // case: the placements live in the principal-axis (bbox) frame and are projected back to the
        // real ring downstream, where a cm²-scale snapAxisLines sliver is not a real world collision;
        // clipping it would move a partition off the projected ring (re-opening a §53 seam). Sub-floor
        // dust is therefore REPORTED but not clipped; only architecturally-real (≥ 0.05 m²) overlaps —
        // the founder's "Room 01-002 across another room" — are clipped/dropped.
        const typeByRoomIdNet: ReadonlyMap<string, RoomType> = new Map(graph.rooms.map(r => [r.id, r.type]));
        const net = resolveRoomOverlaps(snapped, typeByRoomIdNet);
        if (net.resolved.length > 0 || net.dropped.length > 0) {
            console.warn(
                `[D-TGL subdivide] §DIAG-OVERLAP resolved ${net.resolved.length} room-room overlap(s) ` +
                `(clipped/dropped the lower-priority room) — dropped=[${net.dropped.join(',') || 'none'}] ` +
                `worstClippedM2=${(net.resolved[0]?.areaM2 ?? 0).toFixed(4)} worstResidualM2=${net.worstResidualM2.toFixed(4)} ` +
                `(an overlap reached the net — a placement post-pass left two rooms overlapping; ` +
                `harden the upstream pass so this is a no-op)`,
            );
        }
        // §DIAG-OVERLAP HARD assertion (never ships): after the net NO architecturally-meaningful
        // overlap (above the clip-action floor) may remain. Sub-floor snap dust is allowed (and
        // collapses in the editor's node grid anyway). A breach here is a logic error in the net.
        console.assert(
            net.worstResidualM2 <= OVERLAP_NET_CLIP_M2 + EPS,
            `[D-TGL subdivide] §DIAG-OVERLAP INVARIANT VIOLATED — ${net.worstResidualM2.toFixed(4)} m² residual room overlap after the net`,
        );
        // Drops from the overlap net are reported through `droppedRooms` (NOT silent) so the
        // trigger/modal can surface them, exactly like the §FEASIBILITY-ALLOC drops.
        const netDropReports: DroppedRoom[] = net.dropped.map(id => ({
            roomId: id,
            type: typeByRoomIdNet.get(id) ?? ('corridor' as RoomType),
            shortSideM: 0,
            minShortSideM: floorFor(typeByRoomIdNet.get(id) ?? ('corridor' as RoomType)),
        }));
        const baseResult: SubdivideResult = {
            placements: net.placements,
            droppedRooms: [...res.droppedRooms, ...netDropReports],
            // §POLYGON-CARVE (phase 1) — pass the carve's non-rect cell polygons through the overlap
            // net unchanged (the net clips only OVERLAPPING habitable rects; a carve that emits a
            // polygon corridor keeps it clear of rooms by construction). Absent ⇒ omitted.
            ...(res.cellPolygonById ? { cellPolygonById: res.cellPolygonById } : {}),
        };
        // §POLYGON-CORRIDOR-LEG (PART 4 / FF-R1, 2026-06-17) — FINAL post-pass: when a stair keep-out
        // exists and the corridor's RECT still does not reach it with a door-width wall, emit the
        // corridor as an L-POLYGON whose narrow leg threads EMPTY SPACE to the stair, so wallsAndDoors
        // can host the stair↔corridor door (no SEALED stair). Self-validating + gated: no keep-out, no
        // corridor, an already-reaching corridor, or no empty leg ⇒ the result is returned UNCHANGED
        // (byte-identical — the corridor stays a plain rect; no regression). The corridor's RECT in
        // `placements` is untouched (the spine), so the area / min / overlap gates are unchanged.
        // §POLYGON-CORRIDOR-REACH-GATE (2026-06-18) — the L/T/U corridor reach is opt-in
        // (default OFF) until the polygon wall sweep de-dupes corridor↔room shared edges;
        // see SubdivideOptions.polygonCorridorReach. Off ⇒ clean rect corridor (no
        // overlapping interior walls), byte-identical to the proven pre-rework path.
        if (keepOutRects.length === 0 || options.polygonCorridorReach !== true) return baseResult;
        const withLeg = emitPolygonCorridorLeg(
            baseResult,
            graph.corridorId,
            keepOutRects,
            typeByRoomIdNet,
            corridorWidthM ?? CORRIDOR_STRIP_WIDTH_M,
        );
        // §POLYGON-CORRIDOR-ARM (PART 4 / FF-R1, 2026-06-17) — extend the corridor polygon into a
        // SECOND (third, …) arm so every PRIVATE room abuts it (L → T / U): on a fragmented plate the
        // §POLYGON-CORRIDOR-LEG threads only ONE arm, leaving far-arm bedrooms served-through-a-public-
        // room (gate `circulation` fail; upper-floor seal). Self-validating + gated: no keep-out, no
        // corridor, every private room already on the corridor, or no empty leg reachable ⇒ UNCHANGED
        // (byte-identical to the §POLYGON-CORRIDOR-LEG output). The corridor's RECT is untouched.
        return emitPolygonCorridorArm(
            withLeg,
            graph.corridorId,
            keepOutRects,
            typeByRoomIdNet,
            corridorWidthM ?? CORRIDOR_STRIP_WIDTH_M,
        );
    };

    // §SINGLE-RECT-CARVE — single-rect shell with corridor + private rooms.
    if (valid.length === 1) {
        const carved = trySingleRectCarve(valid[0]!, graph, corridorWidthM, false, shellRectified);
        if (carved !== null) return finalise(carved);
    }

    // §STAIR-OBSTACLE-CARVE (2026-06-08) — a stair keep-out fractured the plate into
    // a frame/L of sub-rects (multi-storey house). The generic multi-rect path below
    // would pack each sub-rect independently → no corridor spine → merged blob +
    // §CIRCULATION-REROUTE (the founder's central-stair defect). Instead, when one
    // sub-rect DOMINATES the plate, carve the corridor in that dominant rect with the
    // WHOLE programme so a real corridor encloses + links every room. The tiny stair-
    // clearance slivers are left empty — they are the landing zone around the stair,
    // not habitable space. Only fires when the carve actually succeeds; otherwise we
    // fall through to the unchanged generic multi-rect path (no regression).
    if (options.stairCarved && valid.length >= 2) {
        // §52.6 P3c-a (ADR-0072) — re-join collinear stair-fragment BANDS into their bounding
        // rectangles so the dominant rect is the WHOLE contiguous arm, not one band of it.
        // Without this the carve spines one band and orphans the rooms in the others (the
        // §52.6 land-lock). No-op when the decomposition has no full-edge-adjacent bands.
        const frag = coalesceFullEdgeRects(valid).sort(byAreaDesc);
        const totalArea = frag.reduce((s, r) => s + rectArea(r), 0);
        const dominant = frag[0]!;             // frag is sorted byAreaDesc
        // "Dominant" = holds the clear majority of the buildable area. Below this the
        // plate is genuinely split (e.g. a mid-edge stair leaving two comparable
        // wings) and the generic per-rect path is the right tool.
        // §STAIR-FRAGMENT (G12, 2026-06-08) — LOWERED 0.55 → 0.45. The stair keep-out
        // fragments the plate (e.g. 51.67/34.22/31.42 m²); at 0.55 a 0.44-dominant plate
        // fell through to packMultiRect, which crams the WHOLE program into one fragment
        // and drops rooms (the generic "Room 00-00x" voids + missing windows). At 0.45 the
        // dominant-rect corridor carve fires for these plates too; it runs BOTH carve and
        // packMultiRect and keeps whichever drops FEWER rooms, so this is never worse on
        // drop count and adds a corridor spine when it helps. (The real cure is keeping the
        // stair from fragmenting the plate — tracked separately.)
        //
        // §STAIR-FRAGMENT (Fix 4, 2026-06-09, defence-in-depth) — LOWERED 0.45 → 0.40.
        // Fix 1 forces the stair to a CORNER so the dominant rect is now ~75-80 % (the
        // gate is easily cleared); this lower floor is a SAFETY NET for plates the
        // corner carve fragments slightly harder (e.g. a small notch + the stair sliver
        // leave the dominant rect at ~0.42) so the corridor carve still fires instead of
        // falling through to packMultiRect's merge-prone per-rect packing. Never worse:
        // the branch still runs BOTH carve and packMultiRect and keeps whichever drops
        // FEWER rooms (§STAIR-CARVE-NO-DROP), so a lower gate can only ADD a corridor
        // spine, never remove rooms. Gated on `options.stairCarved` (set true ONLY when a
        // stair keep-out was carved — the multi-storey HOUSE path); the APARTMENT path
        // passes no keep-out → `stairCarved=false` → this whole branch is skipped →
        // apartment byte-identical.
        const DOMINANT_FRACTION = 0.40;
        const dominantFrac = rectArea(dominant) / Math.max(EPS, totalArea);
        console.log(`[D-TGL subdivide] §DIAG-RECTS stairCarved=true rects=${frag.length} areas=[${frag.map(r => rectArea(r).toFixed(1)).join(', ')}] total=${totalArea.toFixed(1)} dominantFrac=${dominantFrac.toFixed(2)} rooms=${graph.rooms.length} gate=${DOMINANT_FRACTION}`);
        // §DIAG-BRANCH (Part 8, 2026-06-09) — deterministic branch line for the next prod
        // run: WHICH path the stair-carved plate took. `path=carve` ⇒ the dominant gate
        // fired → the corridor spine runs in the dominant rect (the founder's fix); the
        // detailed carve-vs-generic pick line below refines it. `path=generic` ⇒ no
        // dominant rect → packMultiRect (the merge-prone path the Fix 1 corner stair +
        // Fix 4 lower gate are meant to AVOID). Read this against §DIAG-STAIR-RESERVE's
        // `kind`: a CORNER reserve should always land here as `path=carve`.
        const branchPath = dominantFrac >= DOMINANT_FRACTION ? 'carve' : 'generic';
        console.log(`[D-TGL subdivide] §DIAG-BRANCH stairCarved dominantFrac=${dominantFrac.toFixed(2)} path=${branchPath}`);
        if (rectArea(dominant) >= DOMINANT_FRACTION * totalArea) {
            // §STAIR-CIRC-FACE — when a stair keep-out is supplied, prefer the single-loaded
            // (one-face) corridor so the §STAIR-CIRC-FACE reflection in `finalise` can bring it
            // to the keep-out edge (a centred double-loaded strip can't reach an edge keep-out).
            // §STAIR-FACE-AXIS — the stair keep-out (largest, same frame as `dominant`) so the
            // §NO-PUBLIC single-loaded carve can lay the corridor on the stair's edge → the corridor
            // reaches the stair by construction (no synthetic stub on a perpendicular-stair upper floor).
            const stairKeepOut = keepOutRects.length > 0
                ? keepOutRects.reduce((a, b) => (rectArea(b) > rectArea(a) ? b : a))
                : undefined;
            const carved = trySingleRectCarve(dominant, graph, corridorWidthM, keepOutRects.length > 0, shellRectified, stairKeepOut);
            // §STAIR-CARVE-NO-DROP (2026-06-08) — the dominant-rect carve gives every
            // room a corridor spine (the founder's central-blob fix), but squeezing the
            // WHOLE programme into the dominant rect (which is smaller than the full
            // plate by the stair sliver) can force it to DROP a room — e.g. on a
            // perimeter back-corner stair the dominant rect is ~75% of the plate and the
            // master en-suite no longer fits. The generic multi-rect path uses ALL the
            // sub-rects (incl. the sliver) so it usually keeps every room — but with no
            // corridor spine (the merged-blob risk). So we run BOTH and prefer whichever
            // drops FEWER programme rooms; on a tie we keep the CARVE (its corridor spine
            // is what fixes the central-stair merged blob). This preserves the vertical
            // programme (master + en-suite stay placed) without abandoning the spine.
            if (carved !== null && carved.droppedRooms.length === 0) {
                // The whole-programme carve fits with ZERO drops — keep it exactly as before
                // (byte-identical). The original code ran packMultiRect and picked
                // `genericDrops < carvedDrops`; with carvedDrops=0 that is always false, so
                // the carve always wins — we short-circuit to the identical result.
                const generic = packMultiRect(frag, graph);
                const genericDrops = generic.droppedRooms.length;
                console.log(`[D-TGL subdivide] §DIAG-BRANCH dominant-carve eligible: carveDrops=0 genericDrops=${genericDrops} → picked carve`);
                return finalise(carved);
            }
            // §STAIR-SPANNING-CORRIDOR (tracker §52.3 / §52.6, 2026-06-11) — the
            // whole-programme dominant carve is INFEASIBLE (null: the dominant band is too
            // shallow for the 3-zone strip) OR it DROPS a room. The old code then either
            // squarified the dominant rect (dropping + sealing) or fell to the generic
            // per-fragment pack (no corridor across fragment boundaries → the room in a
            // non-corridor fragment SEALS — the last §52.6 land-lock; bathroom.accessFrom =
            // ['corridor'] ONLY, no chain rescues it). BEFORE that, try the SPANNING corridor:
            // carve only the circulation-DEPENDENT cluster (corridor + private/service rooms)
            // in the dominant rect and relocate the PUBLIC rooms (which chain to the entry,
            // never need the corridor) into the other fragments — so EVERY habitable room
            // reaches the corridor WITHOUT dropping one. Only fires with 0 drops + a real
            // corridor; otherwise null ⇒ we keep the original behaviour below (no regression).
            const spanning = tryStairSpanningCorridor(frag, graph, corridorWidthM);
            if (spanning !== null) {
                console.log(`[D-TGL subdivide] §DIAG-BRANCH whole-programme carve ${carved === null ? 'infeasible' : `would drop ${carved.droppedRooms.map(d => d.type).join(',')}`} → §STAIR-SPANNING-CORRIDOR rescued (0 drops, every dependent abuts the corridor)`);
                return finalise(spanning);
            }
            if (carved !== null) {
                const generic = packMultiRect(frag, graph);
                const carvedDrops = carved.droppedRooms.length;
                const genericDrops = generic.droppedRooms.length;
                const pick = genericDrops < carvedDrops ? 'generic' : 'carve';
                console.log(`[D-TGL subdivide] §DIAG-BRANCH dominant-carve eligible: carveDrops=${carvedDrops} genericDrops=${genericDrops} → picked ${pick}${(pick === 'carve' ? carved : generic).droppedRooms.length > 0 ? ` (DROPPED ${(pick === 'carve' ? carved : generic).droppedRooms.map(d => d.type).join(',')})` : ''}`);
                return finalise(genericDrops < carvedDrops ? generic : carved);
            }
            // No corridor/private split (e.g. studio brief): squarify the whole
            // programme into the dominant rect so it still reads as one enclosed,
            // detectable set rather than scattered per-sliver fragments.
            const packed = placeInRectReported(dominant, allocationOrder(graph.rooms));
            if (packed.placements.length > 0) return finalise(packed);
        }
        // §STAIR-SPANNING-CORRIDOR (tracker §52.3 / §52.6, 2026-06-11) — the dominant
        // rect did NOT clear the DOMINANT_FRACTION gate (the plate is genuinely split into
        // comparable bands by a mid-edge stair), so the dominant-rect carve never ran and we
        // are about to fall through to the generic per-fragment pack — which seals any
        // private/service room outside the corridor fragment (the §52.6 land-lock). Try the
        // spanning corridor FIRST: carve the circulation-dependent cluster in the LARGEST
        // band and relocate the public rooms to the others. Only fires with 0 drops + a real
        // corridor; otherwise null ⇒ the unchanged generic pack below (no regression).
        const spanning = tryStairSpanningCorridor(frag, graph, corridorWidthM);
        if (spanning !== null) {
            console.log(`[D-TGL subdivide] §STAIR-SPANNING-CORRIDOR fired on the sub-dominant (generic) path (dominantFrac < gate) — every dependent abuts the corridor, 0 drops`);
            return finalise(spanning);
        }
    }

    return finalise(packMultiRect(valid, graph));
}

/**
 * §SPAN-SPINE-CARVE (tracker §52.3 / §52.6, 2026-06-11) — carve a SHALLOW full-span band
 * (a stair-fragment, e.g. 10 m × 3.95 m) as [public-zone | corridor-strip | private-zone]
 * with the corridor running along the band's SHORT axis (the corridor is a FULL-DEPTH strip
 * splitting the LONG axis). This is the key the existing carves miss: `tryCarveCorridor`
 * always splits the SHORT axis (needs short ≥ strip + 2·2 m = 5.2 m), which a shallow band
 * fails — but a wide band has ample run on its LONG axis, so a corridor laid ACROSS the long
 * axis fits, and every private room combed off the corridor face spans the band's FULL depth
 * (so a 2.6 m bedroom is never depth-starved on a 3.15–3.95 m band).
 *
 * Layout (band wider than tall ⇒ corridor is a vertical strip):
 *   [ public columns | corridor (full-depth) | private columns combed off the corridor ]
 * The corridor's strip spans the band's full depth, so its far edge sits ON the keep-out cut
 * line → the side bands abut it too (a private room overflowed into a side band still reaches
 * the corridor). Public rooms are squarified into the public zone (they only need to be
 * non-sealed); private/service rooms are COMBED (each shares the corridor wall → a door).
 *
 * Returns null when: the band can't host the strip + a usable public + private zone, OR the
 * private comb is infeasible, OR a room would drop. Pure + deterministic. No ensuite handling
 * (the ground guest-suite has no ensuite; a spine carrying a master+ensuite falls through to
 * the caller, which keeps the existing pick — never a regression).
 */
function trySpineBandCarve(
    spine: Rect,
    spineGraph: BubbleGraph,
    corridorWidthM: number = CORRIDOR_STRIP_WIDTH_M,
    // §SPAN-CUT-EDGE — which v-edge of the band faces the keep-out / the other fragments. The
    // corridor strip is laid on THAT edge so it abuts the side fragments (a leftover public room
    // in a side band then shares the corridor wall). For a bottom band the cut edge is v-MAX
    // (toward the keep-out above it); for a top band it is v-MIN. Undefined ⇒ v-MAX (legacy).
    cutAtVMax: boolean = true,
): SubdivideResult | null {
    const corridor = spineGraph.rooms.find(r => r.type === 'corridor');
    if (!corridor) return null;
    const publicRooms: ProgramRoom[] = [];
    const privateRooms: ProgramRoom[] = [];
    for (const r of spineGraph.rooms) {
        if (r.id === corridor.id) continue;
        const p = roomRule(r.type).privacy;
        if (p === 'public' || p === 'circulation') publicRooms.push(r);
        else privateRooms.push(r);
    }
    if (privateRooms.length === 0) return null;             // nothing to comb → not our case

    const W = spine.x1 - spine.x0;
    const H = spine.z1 - spine.z0;
    // Work in a NORMALISED frame where `u` = the band's LONG axis (ample run) and `v` = its
    // SHORT axis (the shallow depth). A wide band (W ≥ H) ⇒ u=x, v=z; a tall band ⇒ u=z, v=x.
    // The corridor is laid as a strip running ALONG `u` (so it splits the SHORT `v` axis just
    // ONCE, leaving a private comb zone), and the private rooms are combed along `u` off that
    // strip — each private room keeps its full short-side along `u` (ample) and a slice of the
    // remaining v-depth. The DEEP-needing public rooms (those whose floor exceeds the comb
    // depth) take a FULL-DEPTH end column so they keep the band's whole short side `v`.
    const wide = W >= H;
    const uLen = wide ? W : H;      // long axis run
    const vLen = wide ? H : W;      // short axis depth
    const MIN_ZONE_DEPTH = 2.0;

    // The private comb sits below the corridor strip ⇒ its depth = vLen − stripW. §SPAN-CORRIDOR-
    // FIT — on a SHALLOW band the default 1.2 m strip can starve the comb below a private floor
    // (e.g. a 3.75 m band − 1.2 = 2.55 < bedroom 2.6); narrow the strip toward the corridor's own
    // architectural minimum (1.0 m) so the comb keeps the floor rather than failing. Never below
    // a real corridor width. (A room that STILL exceeds combDepth becomes a full-depth column —
    // see §SPAN-DEEP-PRIVATE / §SPAN-DEEP-PUBLIC below — so the strip never has to swallow it.)
    const corridorMin = floorFor('corridor');               // 1.0 m
    const stripW = Math.max(corridorMin, Math.min(corridorWidthM, vLen - corridorMin));
    const combDepth = vLen - stripW;
    if (combDepth < MIN_ZONE_DEPTH - EPS) return null;       // no usable comb depth at all

    // A room whose floor exceeds the comb depth can ONLY sit at the band's FULL short-side
    // depth (e.g. `living` needs 3.2 m, or a `bedroom` 2.6 m, on a band whose comb depth is
    // 2.45 m). Such rooms take a full-`v`-depth end COLUMN. The rest are COMBED off the corridor
    // (they keep a slice of the comb depth). Split each privacy class by depth need.
    const isDeep = (r: ProgramRoom): boolean => floorFor(r.type) > combDepth + EPS;
    const deepPrivate = privateRooms.filter(isDeep);
    const combPrivate = privateRooms.filter(r => !isDeep(r));
    const deepPublic = publicRooms.filter(isDeep);
    const combPublic = publicRooms.filter(r => !isDeep(r));

    // §SPAN-DEEP-PRIVATE — a deep PRIVATE room must still reach the corridor. It is placed as a
    // full-depth column IMMEDIATELY past the corridor's u-end, so it abuts the corridor along
    // the corridor's end edge (length = stripW ≥ a door width). Only the FIRST such column
    // touches the corridor, so we can host AT MOST ONE deep private room this way; more than one
    // would seal the rest → bail to the caller (no regression). Deep public rooms have no
    // corridor requirement, so any number sit further along the column.
    if (deepPrivate.length > 1) return null;
    if (stripW < floorFor('corridor') - EPS) return null;   // corridor end edge too short for a door

    // Run budget along `u`: corridor + combed rooms occupy [0, combRunU]; the deep columns
    // (deep private FIRST so it abuts the corridor end, then deep public) occupy [combRunU, uLen]
    // at full depth.
    const deepRooms = [...deepPrivate, ...deepPublic];       // deep private first → abuts corridor end
    const deepColRun = deepRooms.length > 0
        ? Math.max(
            deepRooms.reduce((s, r) => s + floorFor(r.type), 0),
            Math.min(
                deepRooms.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0),
                deepRooms.reduce((s, r) => s + minAreaFor(r.type), 0),
            ) / Math.max(EPS, vLen),
          )
        : 0;
    const combRooms = [...combPrivate, ...combPublic];
    const combRunMin = combRooms.reduce((s, r) => s + floorFor(r.type), 0);
    // Need the comb run (≥ its floors) AND the deep column run on the long axis. The corridor
    // strip sits over the comb run only; the deep column needs ≥ a door's worth of the corridor
    // edge, already guaranteed by combRunMin > 0 (≥1 combed room) OR deepPrivate abutting.
    if (combRooms.length === 0 && deepPrivate.length === 0) return null;   // nothing to comb/abut
    if (deepColRun + Math.max(combRunMin, deepPrivate.length > 0 ? stripW : 0) > uLen + EPS) return null;

    // Helper to build a Rect from normalised (u0,u1,v0,v1) coords.
    const mk = (u0: number, u1: number, v0: number, v1: number): Rect => wide
        ? { x0: spine.x0 + u0, z0: spine.z0 + v0, x1: spine.x0 + u1, z1: spine.z0 + v1 }
        : { x0: spine.x0 + v0, z0: spine.z0 + u0, x1: spine.x0 + v1, z1: spine.z0 + u1 };

    const combRunU = uLen - deepColRun;
    // The corridor strip sits on the CUT edge (toward the keep-out) so it abuts the side
    // fragments; the comb fills the rest of the v-depth on the perimeter side.
    const corStripV0 = cutAtVMax ? vLen - stripW : 0;
    const corStripV1 = cutAtVMax ? vLen : stripW;
    const combV0 = cutAtVMax ? 0 : stripW;
    const combV1 = cutAtVMax ? vLen - stripW : vLen;
    const corridorRect = mk(0, combRunU, corStripV0, corStripV1);
    const combZone = combRooms.length > 0 ? mk(0, combRunU, combV0, combV1) : null;
    const deepZone = deepRooms.length > 0 ? mk(combRunU, uLen, 0, vLen) : null;

    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];
    out.push({ roomId: corridor.id, rect: roundRect(corridorRect) });

    // Comb the {comb-private + comb-public} rooms off the corridor strip along `u`. §SPAN-COMB-
    // ORDER — PRIVATE rooms sit at the corridor-START end, PUBLIC comb rooms (hall) at the
    // DEEP-COLUMN end, so a deep PUBLIC room (living) abuts the comb's public tail (hall) — a
    // permitted living↔hall threshold — as well as its short corridor-end edge. Each combed
    // room shares the corridor's long edge → a corridor-adjacent wall → a door.
    if (combZone && combRooms.length > 0) {
        const combFaceAxis: 'x' | 'z' = wide ? 'x' : 'z';
        const combPriv = adjacencySortForZone(allocationOrder(combPrivate));
        const combPub = adjacencySortForZone(allocationOrder(combPublic));
        const orderedComb = [...combPriv, ...combPub];      // private near corridor start, public near deep column
        const comb = sliceZoneAlongFace(combZone, orderedComb, combFaceAxis);
        if (!comb || comb.droppedRooms.length > 0) return null;
        out.push(...comb.placements);
    }

    // Deep columns into the full-depth end column. §SPAN-DEEP-ORDER — deep PRIVATE first
    // (adjacent to the corridor end so it abuts the corridor over the stripW edge), then deep
    // public. A single deep public room (living) lands against the comb's public tail (hall),
    // giving it a permitted threshold even when its corridor-end edge is short.
    if (deepZone && deepRooms.length > 0) {
        const dp = placeInRectReported(deepZone, deepRooms);    // order preserved: deep private first
        if (dp.droppedRooms.length > 0) return null;
        out.push(...dp.placements);
    }
    return { placements: out, droppedRooms };
}

/**
 * §STAIR-SPANNING-CORRIDOR (tracker §52.3 / §52.6, 2026-06-11) — the last sealed-room
 * case: a STAIR-FRAGMENTED multi-storey GROUND plate. The stair keep-out guillotines
 * the plate into a frame of sub-rects (e.g. a full-width bottom band + a full-width top
 * band + two side bands) where NO single fragment fits the whole ground programme. The
 * §STAIR-CARVE-NO-DROP decision then picks the generic `packMultiRect` (which would drop
 * fewer rooms than squeezing everything into the dominant rect) — but generic packs each
 * fragment INDEPENDENTLY with no corridor crossing fragment boundaries, so the rooms that
 * land in a non-corridor fragment share no wall with the corridor → SEALED +
 * §TOPO-HARD-REJECT [circulation] (bathroom.accessFrom = ['corridor'] ONLY — no chain can
 * rescue it).
 *
 * THE FIX — DO NOT cram the whole programme into one fragment (drops rooms / blobs). Split
 * the programme by circulation NEED:
 *   • DEPENDENTS = the corridor + every private/service room (bedroom/bathroom/wc/study/
 *     utility/master/ensuite) — the rooms that need a corridor-adjacent wall for their door.
 *   • OTHERS = the public rooms (living/kitchen/dining) + the hall — which reach the entry
 *     by a PERMITTED door chain (public↔public↔hall) and never need the corridor directly,
 *     so they are NEVER in `unroutedToCirculationRoomIds` (they only must not be SEALED).
 * Choose a SPINE BAND (`§SPAN-SPINE-SEARCH`, deepest-first) and carve the corridor + the
 * circulation-DEPENDENT cluster there via `§SPAN-SPINE-CARVE` (corridor along the band's LONG
 * axis — the only carve that fits a shallow full-span band; private rooms combed off it, a
 * deep-needing public room like `living` as a full-depth end column). Any public room that can
 * ONLY fit the deepest band's depth is PINNED into the spine; the rest fill the OTHER fragments
 * (they chain to the entry, never need the corridor). The corridor strip sits on the keep-out
 * CUT edge so the side fragments abut it too.
 *
 * Gated to fire ONLY when EVERY fragment is too shallow for the standard whole-programme carve
 * (`§SPAN-SHALLOW-ONLY`) — the corner-stair deep-dominant case keeps the existing
 * §STAIR-CARVE-NO-DROP path (byte-identical). Returns null (caller keeps the existing pick)
 * when there is no corridor, no dependents, no OTHERS, a deep band exists, the spine carve
 * drops a room, OR the leftover pack drops a room — i.e. it only ever fires when it connects
 * EVERY dependent to the corridor with ZERO drops. Pure + deterministic. `stairCarved`-gated
 * (HOUSE path only; the apartment passes no keep-out → this whole branch is skipped).
 */
function tryStairSpanningCorridor(
    valid: readonly Rect[],
    graph: BubbleGraph,
    corridorWidthM?: number,
): SubdivideResult | null {
    const corridor = graph.rooms.find(r => r.type === 'corridor');
    if (!corridor || valid.length < 2) return null;

    // DEPENDENTS = corridor + every room that needs a circulation door (private/service) +
    // the HALL (a circulation room whose only permitted neighbours are living/corridor, so it
    // SEALS if packed into a leftover fragment touching only kitchen/bedroom — it belongs on
    // the corridor spine, where it is also the natural front-door entrance).
    // OTHERS = the remaining public rooms (living/kitchen/dining) — which chain to the entry
    // and never need the corridor directly.
    const dependents: ProgramRoom[] = [];
    const others: ProgramRoom[] = [];
    for (const r of graph.rooms) {
        if (r.id === corridor.id) { dependents.push(r); continue; }
        const p = roomRule(r.type).privacy;
        if (p === 'private' || p === 'service' || r.type === 'hall') dependents.push(r);
        else others.push(r);                              // public (living/kitchen/dining)
    }
    // Needs at least one dependent room (else there is nothing to land-lock) AND at least
    // one OTHER to relocate (else the plain whole-programme dominant carve is already the
    // right tool — relocating nothing changes nothing; keep the existing pick).
    if (dependents.length <= 1 || others.length === 0) return null;

    // §SPAN-SHALLOW-ONLY — only intervene when EVERY fragment is too SHALLOW for the standard
    // whole-programme 3-zone carve (short side < strip + 2·2 m = 5.2 m). That is exactly the
    // §52.6 stair-fragmented case (≥2 comparable wide-shallow bands). When some fragment IS
    // deep enough (the corner-stair deep-DOMINANT case), the existing §STAIR-CARVE-NO-DROP
    // path already carves the whole programme there with its real bubble-edge doors — leave it
    // untouched (byte-identical, no regression on the corner-stair plates).
    const depthOfRect = (r: Rect): number => Math.min(r.x1 - r.x0, r.z1 - r.z0);
    const STD_CARVE_MIN_SHORT = CORRIDOR_STRIP_WIDTH_M + 2 * 2.0;   // tryCarveCorridor's gate (5.2 m)
    const deepestDepth = Math.max(...valid.map(depthOfRect));
    if (deepestDepth >= STD_CARVE_MIN_SHORT - EPS) return null;

    // §SPAN-SPINE-SEARCH — choose the SPINE BAND that hosts the corridor + private/service
    // cluster, and let the PUBLIC rooms fill the rest. The hard constraint a naive split
    // misses: a wide-SHALLOW full-span band (e.g. 10 m × 3.15 m) is too shallow for a
    // single-loaded corridor + a bedroom combed FULL-DEPTH (bedroom minShort 2.6 + corridor
    // 1.2 = 3.8 m > the band depth), AND `living` (minShort 3.2 m) only fits the DEEPEST
    // band — so the private cluster and the bulky living room can COMPETE for the one deep
    // band. The cure: run the spine corridor along the band's SHORT axis (a full-DEPTH strip
    // splitting the LONG axis), so the private rooms are combed as columns spanning the full
    // band depth (no depth starvation), and co-locate ANY public room that needs that depth
    // (living) in the same spine band; the remaining public rooms fill the other fragments.
    //
    // Concretely: for each candidate spine band (deepest first — it must clear the private
    // rooms' + corridor's depth), build the spine sub-programme = {corridor + all private/
    // service rooms + every public room whose minShortSide exceeds the SHALLOWER fragments'
    // depth (so it can ONLY live in this deep band)}, carve it via the single-rect corridor
    // (corridor + comb), then pack the LEFTOVER public rooms into the other fragments. The
    // corridor's strip touches the keep-out cut line, so the side bands abut it too. Accept
    // the first spine with 0 drops in BOTH the carve and the leftover pack. Deterministic
    // (deepest-first, stable byAreaDesc tie-break).
    const privateServiceIds = new Set(dependents.filter(r => r.id !== corridor.id).map(r => r.id));
    // Candidate spine bands: full-span bands (the two ends of the guillotine), deepest first.
    const spineCandidates = valid
        .map((r, i) => ({ r, i }))
        .sort((a, b) => depthOfRect(b.r) - depthOfRect(a.r) || rectArea(b.r) - rectArea(a.r) || a.i - b.i);

    for (const { r: spine, i: spineIdx } of spineCandidates) {
        const otherRects = valid.filter((_, i) => i !== spineIdx);
        const shallowestOtherDepth = otherRects.length > 0
            ? Math.max(...otherRects.map(depthOfRect))
            : 0;
        // Public rooms that can ONLY live in this (deepest) spine band — their minShortSide
        // exceeds every OTHER fragment's depth — are pinned into the spine sub-programme so
        // they are not orphaned in a too-shallow fragment. The rest stay as `others`.
        const pinnedPublic = others.filter(r => floorFor(r.type) > shallowestOtherDepth + EPS);
        const leftoverPublic = others.filter(r => floorFor(r.type) <= shallowestOtherDepth + EPS);

        // Spine sub-programme = corridor + private/service + pinned public. Carved as a
        // single-rect corridor (public-zone | corridor | private comb) so every private/
        // service room shares the corridor wall.
        const spineRooms = graph.rooms.filter(r =>
            r.id === corridor.id || privateServiceIds.has(r.id) || pinnedPublic.some(p => p.id === r.id));
        const spineIds = new Set(spineRooms.map(r => r.id));
        const spineGraph: BubbleGraph = {
            ...graph,
            rooms: spineRooms,
            edges: graph.edges.filter(e => spineIds.has(e.a) && spineIds.has(e.b)),
            corridorId: corridor.id,
            // Keep the entry only if it is actually in the spine (else null so the carve
            // treats it as a no-public/normal carve correctly).
            entryId: graph.entryId !== null && spineIds.has(graph.entryId) ? graph.entryId : null,
        };
        // §SPAN-CUT-EDGE — find which v-edge of the spine faces the OTHER fragments (the
        // keep-out side) so the corridor strip is laid there and abuts the side bands. For a
        // wide band v=z: count other rects on the z>spine.z1 side vs the z<spine.z0 side.
        const wideSpine = (spine.x1 - spine.x0) >= (spine.z1 - spine.z0);
        const spineVMax = wideSpine ? spine.z1 : spine.x1;
        const spineVMin = wideSpine ? spine.z0 : spine.x0;
        const coord = (r: Rect): { lo: number; hi: number } => wideSpine
            ? { lo: r.z0, hi: r.z1 } : { lo: r.x0, hi: r.x1 };
        let onMax = 0, onMin = 0;
        for (const r of otherRects) {
            const c = coord(r);
            if (c.lo >= spineVMax - EPS) onMax++;
            else if (c.hi <= spineVMin + EPS) onMin++;
        }
        const cutAtVMax = onMax >= onMin;

        // §SPAN-HALL-HINGE (founder §CIRCULATION-GRAPH GF-R7, 2026-06-17) — when the spine sub-
        // programme carries a HALL plus a PINNED public room (e.g. a large `living` that only fits
        // the deep dominant band, so it could not be relocated to a shallower fragment), the plain
        // §SPAN-SPINE-CARVE combs that public room directly off the corridor → publicOnCorridor (the
        // founder's "living on the corridor" defect). Carve the spine with the HALL-HINGE instead so
        // the public room borders the HALL, never the corridor. The hall-hinge self-validates
        // (sound() → null when it can't produce a connected plan) so this only ever ADDS a sound
        // candidate and otherwise falls through to the existing carves (strictly non-regressing).
        const spineHasHall = spineRooms.some(r => r.type === 'hall');
        const spineHasPublic = spineRooms.some(r => r.type !== 'hall' && roomRule(r.type).privacy === 'public');
        const hingeSpine = (spineHasHall && spineHasPublic)
            ? trySingleRectCarve(spine, spineGraph, corridorWidthM, true, true)
            : null;
        // Carve the spine band with §SPAN-SPINE-CARVE (corridor along the band's LONG axis —
        // the only carve that fits a shallow full-span band; we are here only because EVERY
        // fragment is shallower than the standard carve's 5.2 m gate, per §SPAN-SHALLOW-ONLY).
        // Fall back to the standard single-rect carve defensively (e.g. a near-5.2 m band).
        const spineRes = (hingeSpine && hingeSpine.droppedRooms.length === 0 ? hingeSpine : null)
            ?? trySpineBandCarve(spine, spineGraph, corridorWidthM, cutAtVMax)
            // §ENTRANCE-HALL-ON-SHELL suppressed (last arg true) — a shallow spine-band
            // fallback is a degenerate fragment; the hall-slice's full-depth column is for the
            // normal public-zone carve, not a sliver band.
            ?? trySingleRectCarve(spine, spineGraph, corridorWidthM, false, true);
        if (!spineRes || spineRes.droppedRooms.length > 0) continue;

        // Pack the leftover public rooms into the OTHER fragments (they chain to the entry —
        // no corridor wall needed; any non-sealed tiling is legal). Empty leftover ⇒ trivially
        // fine (every room is in the spine). §SPAN-SLIVER-SKIP — drop UNUSABLE sliver fragments
        // (too small/shallow to hold the smallest leftover room) from the pack; they are the
        // stair landing/clearance space and are correctly left empty (per §STAIR-OBSTACLE-CARVE
        // "the tiny stair-clearance slivers are left empty"). Without this a 0.55 m-deep sliver
        // would force a phantom drop and defeat the whole spanning carve.
        const minLeftoverArea = leftoverPublic.reduce((m, r) => Math.min(m, minAreaFor(r.type)), Infinity);
        const minLeftoverFloor = leftoverPublic.reduce((m, r) => Math.min(m, floorFor(r.type)), Infinity);
        const usableOtherRects = otherRects.filter(r =>
            rectArea(r) >= minLeftoverArea - EPS && depthOfRect(r) >= minLeftoverFloor - EPS);
        const leftoverGraph: BubbleGraph = {
            ...graph,
            rooms: leftoverPublic,
            edges: graph.edges.filter(e =>
                leftoverPublic.some(r => r.id === e.a) && leftoverPublic.some(r => r.id === e.b)),
        };
        const leftoverRes = leftoverPublic.length > 0
            ? packMultiRect(usableOtherRects, leftoverGraph)
            : { placements: [] as RoomPlacement[], droppedRooms: [] as DroppedRoom[] };
        if (leftoverRes.droppedRooms.length > 0) continue;   // a public room would drop — try another spine

        console.log(
            `[D-TGL subdivide] §STAIR-SPANNING-CORRIDOR APPLIED: spine fragment #${spineIdx} ` +
            `(area ${rectArea(spine).toFixed(1)} m², depth ${depthOfRect(spine).toFixed(2)} m) carves ` +
            `[${spineRooms.map(r => r.type).join(',')}] (corridor reaches every private/service room); ` +
            `leftover public [${leftoverPublic.map(r => r.type).join(',')}] packed into ${otherRects.length} ` +
            `other fragment(s) — 0 drops, 0 sealed habitable rooms across the stair-fragmented plate.`,
        );
        return {
            placements: [...spineRes.placements, ...leftoverRes.placements],
            droppedRooms: [],
        };
    }
    return null;
}

/**
 * Generic multi-rect packing (L / T / U shells, and the fall-through for a
 * stair-carved plate). Allocates rooms to rects ∝ area, public-first, reserving
 * ≥1 room for every later rect so each rect is actually filled. Extracted so the
 * §STAIR-OBSTACLE-CARVE branch can evaluate it as an ALTERNATIVE to the dominant-
 * rect corridor carve and pick whichever drops fewer programme rooms. Pure.
 */
function packMultiRect(valid: readonly Rect[], graph: BubbleGraph): SubdivideResult {
    const rooms = allocationOrder(graph.rooms);

    // Common case — a rectangular (single-rect) shell, no carve (no corridor,
    // no private rooms, or the carve can't fit): one squarified treemap.
    // Degenerate case — more rects than rooms: pack everything into the largest
    // rect (can't fill N rects with <N one-footprint rooms without splitting a
    // room). Real programs always have rooms ≥ rects, so this is a safety net.
    if (valid.length === 1 || rooms.length < valid.length) {
        return placeInRectReported(valid[0]!, rooms);
    }

    // Multi-rect shell (L / T / U): allocate rooms to rects ∝ area, public-first,
    // reserving ≥1 room for every later rect so each rect is actually filled.
    const shellArea = valid.reduce((s, r) => s + rectArea(r), 0);
    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];
    let cursor = 0;
    for (let k = 0; k < valid.length; k++) {
        const rect = valid[k]!;
        const roomsLeft = rooms.length - cursor;
        const laterRects = valid.length - k - 1;
        let take: number;
        if (k === valid.length - 1) {
            take = roomsLeft;                                   // last rect absorbs the rest
        } else {
            const ideal = Math.round((rooms.length * rectArea(rect)) / shellArea);
            const maxForThis = roomsLeft - laterRects;          // keep ≥1 for each later rect
            take = Math.max(1, Math.min(Math.max(1, ideal), maxForThis));
        }
        const r = placeInRectReported(rect, rooms.slice(cursor, cursor + take));
        out.push(...r.placements);
        droppedRooms.push(...r.droppedRooms);
        cursor += take;
    }
    return { placements: out, droppedRooms };
}

/** §DIAG-FILL-RESIDUAL (founder defect §65.2, 2026-06-11) — a leftover buildable
 *  fragment claimed by {@link claimResidualPlacements}: either GROWN into an
 *  eligible neighbour (no new room) or MINTED as a fresh named circulation/store
 *  room. The diagnostic + the enumerate fold both read this. */
export interface ClaimedResidual {
    /** A newly-minted room (grow → null; mint → the room to add to the graph). */
    readonly mint: {
        readonly id: string;
        readonly type: RoomType;
        readonly name: string;
        readonly rect: Rect;
        readonly targetAreaM2: number;
        /** The placed room this fragment was adjacent to (→ an `open` edge so the
         *  minted cell joins the circulation it abuts; never sealed). */
        readonly neighbourId: string | null;
    } | null;
}

/** §DIAG-FILL-RESIDUAL — one claimed fragment's telemetry (per-fragment audit trail the
 *  caller logs: area, how it was claimed, and which neighbour it bonded to). */
export interface ResidualClaimDetail {
    /** Fragment area (m²) at the moment it was claimed. */
    readonly areaM2: number;
    /** GROWN into an adjacent room (its rect was extended) vs MINTED as a new named cell. */
    readonly how: 'grown' | 'minted';
    /** The room the fragment bonded to — the grown room (grow) or the abutting neighbour the
     *  minted Store wired `open` to (mint); null when a minted cell found no neighbour. */
    readonly neighbourId: string | null;
    /** For a mint: the minted room's name ("Store"); for a grow: the grown room's id. */
    readonly label: string;
}

/** §DIAG-FILL-RESIDUAL result: the (possibly grown) placement set + the rooms to
 *  mint into the bubble graph + the residual telemetry the caller logs. */
export interface ResidualClaimResult {
    readonly placements: readonly RoomPlacement[];
    readonly mints: readonly NonNullable<ClaimedResidual['mint']>[];
    /** Per-fragment claim audit (§65.2-MODERATE — area, grown-into vs minted-as, neighbour). */
    readonly claims: readonly ResidualClaimDetail[];
    /** Largest single unclaimed (still-blank) fragment AFTER the pass (m²). ~0 is the goal. */
    readonly largestBlankM2: number;
    /** Total still-unclaimed area AFTER the pass (m²). ~0 is the goal. */
    readonly totalBlankM2: number;
    /** Largest blank BEFORE the pass (m²) — the §65.2 defect surface. */
    readonly largestBlankBeforeM2: number;
    readonly totalBlankBeforeM2: number;
}

/** Room types whose rect MAY be grown to absorb an adjacent leftover fragment.
 *  HABITABLE + CIRCULATION — a leftover band beside one of these reads naturally as
 *  that room being a little larger (a bigger living/bedroom, a wider landing). Wet
 *  rooms (bathroom/ensuite/wc) and the stair are EXCLUDED — they are fixture-sized
 *  and must never grow. CRUCIALLY the grow is capped at the room's own dimensional
 *  HARD-MAX (`areaHardMax`, well under every per-type sanity cap), so it can NEVER
 *  recreate the "master over-allocated / 44 m² bedroom" oversize defect — a room at
 *  its hard-max is skipped and the slack is minted instead. */
const RESIDUAL_GROW_ELIGIBLE: ReadonlySet<RoomType> = new Set<RoomType>([
    'corridor', 'hall', 'living', 'dining', 'study', 'bedroom', 'master',
]);

/** §65.2 — a residual fragment below this area is genuine wall/clearance slack
 *  (the stair clearance ring, alignment slivers); never worth a room. Above it is
 *  the founder's blank "Room NN". 2 m² is well under any habitable minimum. */
export const RESIDUAL_EPS_M2 = 2.0;

/** §65.2 — the LEGACY "cavern gate". Originally the claim pass fired ONLY when the
 *  plate's LARGEST blank reached this area (a 50–68 m² undivided cell). Retained as the
 *  threshold above which the FULL residual worklist is seeded (every blank claimed,
 *  including remainders below the moderate floor that abut a grown room). Below it the
 *  moderate-blank / stair-adjacent triggers govern instead (see §65.2-MODERATE). */
export const RESIDUAL_MIN_LARGEST_BLANK_M2 = 48.0;

/** §65.2-MODERATE (founder defect, 2026-06-12 — "empty space on the top floor"): the
 *  upper-floor cell the founder reported (19.8 / 28.9 m² "Room 01-NNN") is a NON-stair,
 *  NON-cavern blank — BELOW the 48 m² cavern gate, so the legacy gate never claimed it →
 *  it shipped as a generic undivided "Room NN". This is the MODERATE-blank floor: ANY
 *  leftover fragment ≥ this (a genuinely usable cell, ~the §D3.1 smallest mintable room)
 *  is claimed — GROWN into an adjacent habitable/circulation room (capped at its
 *  dimensional hard-max → never an oversize), else MINTED as a NAMED room. Below it the
 *  fragment is GENUINE wall/clearance slack (a <6 m² alignment sliver, the stair-
 *  clearance ring) and is correctly left blank. Sits just above the smallest mintable
 *  Store-cell floor (utility areaHardMax ~8 m²) and the §STAIR-LANDING-SEAL band size so
 *  the founder's 15–30 m² blanks are all caught while real slack is preserved.
 *
 *  §65.2-TIGHT (founder 2026-06-12, "really bad — always white spaces without being used"):
 *  the floor was 6 m², so a 3–6 m² cell shipped as a generic blank. The founder's target is
 *  NO unprogrammed cell above ~3 m² (pack the plot like the apartment). Lowered to 3 m² so a
 *  ≥3 m² leftover is ALWAYS grown into a neighbour (≤ its hard-max → never oversize) or minted
 *  as a named Store; only genuine sub-3 m² wall/clearance slivers may remain blank. A grow/mint
 *  still needs a ≥1 m short side, so a thin 3 m² sliver (e.g. 0.4×7) is left as true clearance.
 *
 *  BYTE-IDENTITY: a plate whose largest blank is < this floor is UNCHANGED (the trigger
 *  doesn't fire). Apartment (no keep-out) never reaches the claim at all. */
export const RESIDUAL_MODERATE_BLANK_M2 = 3.0;

/** The min short side a MINTED residual room may have (a real, usable cell — not a
 *  tunnel). Below this the fragment is left as clearance (never a 0.3 m × 8 m sliver). */
const RESIDUAL_MINT_MIN_SHORT_M = 1.0;

/** A grown room may never exceed its type's own dimensional HARD-MAX (less a hair, so
 *  the §D3.1 shape gate stays admissible). This is the architectural ceiling per room
 *  type (living 45, bedroom 22, master 35, study 20, dining 28, corridor 12, hall 10
 *  m²) — far below any plate fraction, so a grow can never blob a room. */
function growCapForType(type: RoomType): number {
    return Math.max(0, dimensionsFor(type).areaHardMax - 0.25);
}

/** §RESIDUAL-REAL-ROOMS (founder defect, 2026-06-15 — "the top floor mints 6 small
 *  Stores instead of real rooms"): the area ceiling a grow-eligible room may reach when
 *  it is ABSORBING leftover that would otherwise mint a SURPLUS Store (one beyond the
 *  per-storey {@link RESIDUAL_MAX_MINTED_STORES} cap). This is GENEROUSLY above the
 *  comfortable `areaHardMax` so an under-programmed upper plate fills with a slightly
 *  larger REAL room (a roomy bedroom / generous landing) rather than a swarm of tiny
 *  Stores — exactly the founder's ask. The length + aspect HARD-MAX still bind (see
 *  {@link withinAbsorptionEnvelope}), so the absorbed room can never become a tunnel; it
 *  just reads as a comfortably-large room of its type. Only the SURPLUS-store retry uses
 *  this ceiling — the primary grow pass keeps the strict {@link growCapForType}, so a
 *  well-tiled plate (≤1 store) is BYTE-IDENTICAL (ADR-0061). The factor is MODEST (1.2)
 *  so an absorbed room stays inside the apartment-grade coherence band the founder also
 *  asked for (a living room reaches ~54 m², not a 72 m² blob; a bedroom ~26 m²) — the
 *  `houseProgramSizerConvergence` MEDIUM band is preserved. */
const RESIDUAL_ABSORPTION_AREA_FACTOR = 1.2;
function absorptionCapForType(type: RoomType): number {
    // Bedrooms/master/study/living are the rooms a founder reads as "a real, larger room";
    // a circulation strip (corridor/hall) absorbs only modestly (a landing, not a hall blob).
    const d = dimensionsFor(type);
    const circulation = type === 'corridor' || type === 'hall';
    const factor = circulation ? 1.15 : RESIDUAL_ABSORPTION_AREA_FACTOR;
    return Math.max(0, d.areaHardMax * factor - 0.25);
}

/** §RESIDUAL-REAL-ROOMS — the SURPLUS-store absorption envelope. Same as
 *  {@link withinShapeEnvelope} but the AREA ceiling is the relaxed
 *  {@link absorptionCapForType} (the founder prefers one comfortably-large real room to a
 *  swarm of Stores). Length + aspect HARD-MAX are UNCHANGED — strict — so the absorbed
 *  room stays a sane rectangle (never a tunnel), it is just allowed to be larger in area. */
function withinAbsorptionEnvelope(type: RoomType, r: Rect): boolean {
    const d = dimensionsFor(type);
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    if (w <= EPS || h <= EPS) return false;
    if (rectArea(r) > absorptionCapForType(type) + 1e-6) return false;
    const long = Math.max(w, h), short = Math.min(w, h);
    if (long > d.lengthHardMax + 1e-6) return false;
    if (long / short > d.aspectHardMax + 1e-6) return false;
    return true;
}

/** Would extending a room to `r` keep it within its type's shape envelope (so the
 *  §D3.1 gate stays admissible): area ≤ hard-max, long side ≤ lengthHardMax, aspect ≤
 *  aspectHardMax. A grow that would breach any of these is rejected (slack is minted). */
function withinShapeEnvelope(type: RoomType, r: Rect): boolean {
    const d = dimensionsFor(type);
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    if (w <= EPS || h <= EPS) return false;
    if (rectArea(r) > d.areaHardMax + 1e-6) return false;
    const long = Math.max(w, h), short = Math.min(w, h);
    if (long > d.lengthHardMax + 1e-6) return false;
    if (long / short > d.aspectHardMax + 1e-6) return false;
    return true;
}

/** §RESIDUAL-REAL-ROOMS (founder defect, 2026-06-15) — the MAX number of `utility`
 *  "Store" cells the residual fill may MINT per claim pass. The founder's under-
 *  programmed upper plate minted SIX ~4–7 m² Stores to fill the leftover; the ask is
 *  "fill with REAL rooms, at most ONE store". Capped at 1: the first leftover that can't
 *  be grown into a real room is minted as a single Store (a genuine utility cupboard is
 *  legitimate); every FURTHER leftover is instead ABSORBED into the largest adjacent
 *  real room via the relaxed {@link absorptionCapForType} (a roomier bedroom / landing),
 *  and only TRUE clearance slack (nothing eligible to absorb it) is left blank. A plate
 *  that never needed more than one Store is BYTE-IDENTICAL (the cap doesn't bite). */
export const RESIDUAL_MAX_MINTED_STORES = 1;

/** Does `union(a, b)` form a single axis-aligned rectangle (the two rects abut on a
 *  full shared edge)? Only then can a neighbour absorb a fragment by extending its
 *  rect without leaving a re-entrant (non-rectangular) room. */
function unionIsRect(a: Rect, b: Rect): Rect | null {
    const xMatch = Math.abs(a.x0 - b.x0) < 1e-3 && Math.abs(a.x1 - b.x1) < 1e-3;
    const zMatch = Math.abs(a.z0 - b.z0) < 1e-3 && Math.abs(a.z1 - b.z1) < 1e-3;
    // Vertically stacked: same x-span, touching on z.
    if (xMatch && (Math.abs(a.z1 - b.z0) < 1e-3 || Math.abs(b.z1 - a.z0) < 1e-3)) {
        return roundRect({ x0: a.x0, z0: Math.min(a.z0, b.z0), x1: a.x1, z1: Math.max(a.z1, b.z1) });
    }
    // Horizontally adjacent: same z-span, touching on x.
    if (zMatch && (Math.abs(a.x1 - b.x0) < 1e-3 || Math.abs(b.x1 - a.x0) < 1e-3)) {
        return roundRect({ x0: Math.min(a.x0, b.x0), z0: a.z0, x1: Math.max(a.x1, b.x1), z1: a.z1 });
    }
    return null;
}

/** §65.2 — the largest area a MINTED residual cell may have. A minted cell is typed
 *  `utility` (a "Store"; the only type with no widthHardMax, so a habitable-shaped band
 *  fits it), whose dimensional hard-max is 8 m². A bigger leftover is SPLIT into cells
 *  ≤ this so every minted Store passes the §D3.1 shape gate AND stays well under the
 *  per-type sanity caps — and so no minted cell is itself a cavernous undivided
 *  rectangle (the founder's complaint applies to a 50 m² Store as much as to a blank). */
const RESIDUAL_MINT_MAX_M2 = dimensionsFor('utility').areaHardMax - 0.5;   // ~7.5 m²

/**
 * GROW a neighbour into AS MUCH of `frag` as its cap allows when the full union would
 * overflow: slice `frag` perpendicular to the shared edge so the neighbour reaches
 * (but never exceeds) its cap, returning the grown rect + the un-absorbed remainder
 * (null when none). Returns null when nothing can be absorbed (cap already reached, or
 * the rects don't form a rectangle). Pure.
 */
function growPartial(nb: Rect, frag: Rect, capM2: number): { grown: Rect; remainder: Rect | null } | null {
    const full = unionIsRect(nb, frag);
    if (!full) return null;
    if (rectArea(full) <= capM2 + 1e-6) return { grown: full, remainder: null };
    const headroom = capM2 - rectArea(nb);
    if (headroom <= EPS) return null;                          // neighbour already at its cap
    // Absorb a slab of `frag` along the shared-edge axis worth `headroom` of area.
    const sameX = Math.abs(nb.x0 - frag.x0) < 1e-3 && Math.abs(nb.x1 - frag.x1) < 1e-3;
    if (sameX) {
        // Stacked on z; the shared edge has width (x1-x0). Take a z-slab of `frag`.
        const width = nb.x1 - nb.x0;
        const slab = headroom / Math.max(EPS, width);
        if (slab < RESIDUAL_MINT_MIN_SHORT_M) return null;     // can't absorb a usable slab
        if (Math.abs(nb.z1 - frag.z0) < 1e-3) {                // frag is ABOVE nb
            const cut = Math.min(frag.z1, frag.z0 + slab);
            const grown = roundRect({ x0: nb.x0, z0: nb.z0, x1: nb.x1, z1: cut });
            const rem = frag.z1 - cut > RESIDUAL_MINT_MIN_SHORT_M ? roundRect({ x0: frag.x0, z0: cut, x1: frag.x1, z1: frag.z1 }) : null;
            return { grown, remainder: rem };
        }
        // frag is BELOW nb.
        const cut = Math.max(frag.z0, frag.z1 - slab);
        const grown = roundRect({ x0: nb.x0, z0: cut, x1: nb.x1, z1: nb.z1 });
        const rem = cut - frag.z0 > RESIDUAL_MINT_MIN_SHORT_M ? roundRect({ x0: frag.x0, z0: frag.z0, x1: frag.x1, z1: cut }) : null;
        return { grown, remainder: rem };
    }
    // Adjacent on x; the shared edge has height (z1-z0). Take an x-slab of `frag`.
    const height = nb.z1 - nb.z0;
    const slab = headroom / Math.max(EPS, height);
    if (slab < RESIDUAL_MINT_MIN_SHORT_M) return null;
    if (Math.abs(nb.x1 - frag.x0) < 1e-3) {                    // frag is RIGHT of nb
        const cut = Math.min(frag.x1, frag.x0 + slab);
        const grown = roundRect({ x0: nb.x0, z0: nb.z0, x1: cut, z1: nb.z1 });
        const rem = frag.x1 - cut > RESIDUAL_MINT_MIN_SHORT_M ? roundRect({ x0: cut, z0: frag.z0, x1: frag.x1, z1: frag.z1 }) : null;
        return { grown, remainder: rem };
    }
    // frag is LEFT of nb.
    const cut = Math.max(frag.x0, frag.x1 - slab);
    const grown = roundRect({ x0: cut, z0: nb.z0, x1: nb.x1, z1: nb.z1 });
    const rem = cut - frag.x0 > RESIDUAL_MINT_MIN_SHORT_M ? roundRect({ x0: frag.x0, z0: frag.z0, x1: cut, z1: frag.z1 }) : null;
    return { grown, remainder: rem };
}

/** Split a large leftover `frag` into a GRID of cells, each ≤ `maxCellM2`, within
 *  `aspectMax`, and with NO side longer than `lengthMax`. Splits BOTH axes as needed
 *  (a deep wide band → a grid), so even a band deeper than `lengthMax` (e.g. a 6 m strip
 *  vs the storage 5 m length cap) tiles into valid cells instead of leaving the band
 *  unmintable → blank. Deterministic. Generalised from the utility-only splitter so the
 *  residual mint can choose a REAL room envelope and produce sane cells (§RESIDUAL-REAL-ROOMS). */
function splitFragmentToCells(frag: Rect, maxCellM2: number, aspectMax: number, lengthMax = Infinity): Rect[] {
    const w = frag.x1 - frag.x0, h = frag.z1 - frag.z0;
    // Per-axis division count: enough that each cell is ≤ maxCellM2 (area), ≤ aspectMax
    // (proportion), AND ≤ lengthMax (each side). Compute nx, nz independently then grid.
    const cellMaxSide = Math.max(EPS, Math.sqrt(maxCellM2 * aspectMax));   // longest side a max-area, max-aspect cell can have
    const sideCap = Math.min(cellMaxSide, lengthMax);
    const nx = Math.max(1, Math.ceil(w / Math.max(EPS, sideCap)));
    const nz = Math.max(1, Math.ceil(h / Math.max(EPS, sideCap)));
    // Refine so cell AREA ≤ maxCellM2 too (a near-square sideCap can still over-area).
    let gx = nx, gz = nz;
    while ((w / gx) * (h / gz) > maxCellM2 + 1e-6) { if (w / gx >= h / gz) gx++; else gz++; }
    if (gx === 1 && gz === 1) return [roundRect(frag)];
    const out: Rect[] = [];
    const sx = w / gx, sz = h / gz;
    for (let i = 0; i < gx; i++) for (let k = 0; k < gz; k++) {
        out.push(roundRect({ x0: frag.x0 + i * sx, z0: frag.z0 + k * sz, x1: frag.x0 + (i + 1) * sx, z1: frag.z0 + (k + 1) * sz }));
    }
    return out;
}

/** Split a large leftover `frag` into ≤ {@link RESIDUAL_MINT_MAX_M2} `utility`-Store cells
 *  (legacy behaviour — the single-Store path). */
function splitFragmentForMint(frag: Rect): Rect[] {
    return splitFragmentToCells(frag, RESIDUAL_MINT_MAX_M2, 3.5, dimensionsFor('utility').lengthHardMax);
}

/** §RESIDUAL-REAL-ROOMS (founder defect, 2026-06-15) — the candidate REAL room TYPES a
 *  residual cell may be MINTED as (walked in order; the first whose dimensional envelope the
 *  cell fits wins). The founder's complaint was that the residual fill minted a SWARM of
 *  GENERIC `utility` "Store" cells (undifferentiated fillers) to tile an under-programmed,
 *  stair-fragmented plate. Instead we mint NAMED REAL `storage` rooms — a real service room
 *  with its own occupancy + furniture programme (shelving), so the cells read as real rooms
 *  on the schedule / IFC export rather than generic blanks — and CAP the generic `utility`
 *  "Store" mint at RESIDUAL_MAX_MINTED_STORES (≤ 1).
 *
 *  §RESIDUAL-DETECT-CLEAN — `storage` (like the legacy `utility` store) is WINDOWLESS and
 *  small (areaHardMax 8 m²), so the residual tiles into the same SMALL detection-clean cell
 *  grid the proven §65.2 store-fill used: room detection separates them reliably even on a
 *  dense stair-fragmented plate. (A larger windowed habitable fill type — e.g. `study` —
 *  reads "nicer" but, on a dense plate, its larger cells / window openings make room
 *  detection LEAK between the fill room and a neighbour, merging them: detected < emitted, a
 *  flood. Eliminating that to allow FEWER, LARGER habitable fill rooms needs a follow-up
 *  RoomDetectionEngine tolerance fix; until then `storage` is the detection-safe choice.)
 *  The relaxed-absorption GROW (absorbIntoRealRoom) still enlarges adjacent REAL rooms
 *  (bedrooms / living) into non-stair fragments first, so fewer storage cells are minted than
 *  the old store swarm where the geometry permits. Deterministic. */
const RESIDUAL_MINT_REAL_TYPES: readonly RoomType[] = ['storage'];

/** The display name a minted residual room of `type` carries (room-detection shows this). */
function residualMintName(type: RoomType): string {
    if (type === 'study') return 'Study';
    if (type === 'storage') return 'Storage';
    return 'Store';
}

/** Shared-wall run (m) between two abutting rects (0 if they don't touch). */
function sharedEdgeM(a: Rect, b: Rect): number {
    const vAbut = Math.abs(a.x1 - b.x0) < 0.05 || Math.abs(b.x1 - a.x0) < 0.05;
    if (vAbut) return Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
    const hAbut = Math.abs(a.z1 - b.z0) < 0.05 || Math.abs(b.z1 - a.z0) < 0.05;
    if (hAbut) return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
    return 0;
}

/**
 * §DIAG-FILL-RESIDUAL (founder defect §65.2, 2026-06-11) — guarantee EVERY plate is
 * fully tiled by NAMED rooms: no blank cell larger than {@link RESIDUAL_EPS_M2}.
 *
 * THE DEFECT (the bail): on a large/dense house plate the stair keep-out fractures the
 * plate into a dominant rect + side fragments; the §STAIR-CARVE-NO-DROP short-circuit
 * (subdivideWithReport) places the WHOLE programme in the dominant rect and returns —
 * leaving the side fragments (e.g. a 51 m² band) completely EMPTY. Room detection then
 * ships those as generic "Room 00-001 63.9 m²" blanks (and on upper floors the sparser
 * private programme under-fills the plate the same way). squarify always fills the rect
 * it is GIVEN, so the blank is never a squarify gap — it is a rect that received NO room.
 *
 * THE FILL (smallest lever first, never oversize):
 *   1. GROW — if the fragment abuts a single grow-eligible room (circulation / habitable,
 *      never a wet room or the stair) on a FULL shared edge so the union stays a rectangle
 *      AND the grown area stays ≤ that room's own max-area cap → extend the room's rect to
 *      swallow the fragment. Cap-bounded, so it can NEVER recreate the "master over-
 *      allocated" oversize defect (a room at its cap is skipped → the fragment is minted).
 *   2. MINT — otherwise mint a fresh NAMED room sized to the fragment: typed `corridor`
 *      (named "Landing" upstairs / "Hall" downstairs) when it abuts circulation, else
 *      `utility` (named "Store"). The minted cell is wired `open` to the neighbour it abuts
 *      so it is never sealed. A fragment narrower than {@link RESIDUAL_MINT_MIN_SHORT_M} or
 *      below {@link RESIDUAL_EPS_M2} is left as clearance (true wall/landing slack).
 *
 * Pure + deterministic. The stair keep-out is honoured by construction: `buildableRects`
 * is the plate with the stair ALREADY subtracted (the caller passes the post-keep-out
 * rects), and every stair PLACEMENT is subtracted as occupied area — so a grown or minted
 * room can never tile across the stair (v149 keep-out invariant preserved).
 */
export function claimResidualPlacements(
    placements: readonly RoomPlacement[],
    buildableRects: readonly Rect[],
    roomById: ReadonlyMap<string, { type: RoomType; maxAreaM2: number }>,
    seed: string,
    // §STAIR-LANDING-SEAL (founder §68.6, 2026-06-11) — OPTIONAL stair keep-out rect(s)
    // (engine/strategy frame, INFLATED, same as the residual `stairExclusions`). When a
    // blank band SHARES A WALL with the stair keep-out it is the unwalled "landing slack"
    // that room-detection FLOODS into the stair cell — the founder's ~30 m² / 2.8×
    // oversized stair room. Such a band MUST be claimed (grown into a neighbour or minted
    // as a "Landing"/"Store") EVEN BELOW the §65.2 cavern gate, so a real room borders the
    // stair on its open side and `buildWallsAndDoors` seals the stair tight (no flood). On
    // a plate with NO stair-adjacent blank this is a strict no-op below the gate (every
    // non-stair plate byte-identical). Absent / empty ⇒ legacy behaviour (apartment + every
    // keep-out-free path byte-identical, ADR-0061). */
    stairKeepOuts: readonly Rect[] = [],
): ResidualClaimResult {
    const occupied = placements.map(p => p.rect);
    // The still-blank region = buildable minus every placed room. Slivers < 0.5 m are
    // dropped by the subtractor; we then greedy-merge to coalesce a band the guillotine
    // split, and apply the real RESIDUAL_EPS_M2 / min-short floors below.
    const rawResidual = mergeHorizontally(subtractRectsFromRects(buildableRects, occupied))
        .filter(r => rectArea(r) > EPS)
        .sort(byAreaDesc);
    const blankBefore = rawResidual.filter(r => rectArea(r) >= RESIDUAL_EPS_M2);
    const largestBlankBeforeM2 = blankBefore.length > 0 ? rectArea(blankBefore[0]!) : 0;
    const totalBlankBeforeM2 = blankBefore.reduce((s, r) => s + rectArea(r), 0);

    // §STAIR-LANDING-SEAL — does this blank fragment abut a stair keep-out (the unwalled
    // landing band that floods the stair at detection)? Such a band must be sealed off
    // even if the plate is otherwise well-tiled (below the §65.2 cavern gate).
    const touchesStair = (r: Rect): boolean =>
        stairKeepOuts.some(ko => sharedEdgeM(r, ko) > 0.05);
    const hasStairAdjacentBlank = blankBefore.some(touchesStair);

    // §65.2-MODERATE — a blank fragment ≥ the MODERATE-blank floor is a genuinely usable
    // cell (the founder's 19.8 / 28.9 m² upper-floor "Room NN") and MUST be claimed, even
    // below the cavern gate. A fragment below the floor is real wall/clearance slack and
    // stays blank. This is what catches the founder's UPPER-floor case (the sparser private
    // programme under-fills the plate with a 15–30 m² blank that never reached 48 m²).
    const isModerate = (r: Rect): boolean => rectArea(r) >= RESIDUAL_MODERATE_BLANK_M2;
    const hasModerateBlank = blankBefore.some(isModerate);

    // §65.2 GATE (three tiers, ALL paths honour no-oversize + no-cross-stair-keepout +
    // rank-neutrality — the claim only ever touches emitted geometry, never the score):
    //   • CAVERN  (largest blank ≥ 48 m²): seed the FULL residual (legacy founder cavern).
    //   • MODERATE (any blank ≥ 6 m²): seed the moderate fragments — the founder's top-floor
    //     defect. A previously-blank-free plate (largest blank < 6 m²) is UNCHANGED.
    //   • STAIR-LANDING-SEAL (§68.6): a band sharing a wall with the stair keep-out is always
    //     claimed (it would otherwise flood the stair room) even below 6 m².
    // A plate with no blank ≥ 6 m² and no stair-adjacent blank is a strict NO-OP → unchanged
    // (apartment never reaches here; an already blank-free plate is byte-identical). ADR-0061.
    const cavern = largestBlankBeforeM2 >= RESIDUAL_MIN_LARGEST_BLANK_M2;
    if (!cavern && !hasModerateBlank && !hasStairAdjacentBlank) {
        return {
            placements, mints: [], claims: [],
            largestBlankM2: largestBlankBeforeM2, totalBlankM2: totalBlankBeforeM2,
            largestBlankBeforeM2, totalBlankBeforeM2,
        };
    }

    // Mutable working copy of placements (grow rewrites a neighbour's rect in place).
    const work: RoomPlacement[] = placements.map(p => ({ roomId: p.roomId, rect: p.rect }));
    const mints: NonNullable<ClaimedResidual['mint']>[] = [];
    const claims: ResidualClaimDetail[] = [];
    let mintCounter = 0;
    // §RESIDUAL-REAL-ROOMS — how many "Store" cells have been MINTED so far this pass. Once
    // it reaches RESIDUAL_MAX_MINTED_STORES, every further leftover is ABSORBED into a real
    // room (relaxed cap) instead of minting a surplus Store — the founder's "real rooms, not
    // a swarm of stores" fix.
    let mintedStores = 0;

    // §RESIDUAL-REAL-ROOMS — absorb `frag` into the largest adjacent grow-eligible REAL room
    // under the RELAXED absorption envelope (area up to absorptionCapForType, length/aspect
    // still strict). Returns true when it absorbed something (re-queuing any remainder), false
    // when no eligible neighbour could take it (→ leave as true clearance, NOT a surplus Store).
    const absorbIntoRealRoom = (fragment: Rect): boolean => {
        // The absorption ceiling is the TYPE's RELAXED dimensional cap (absorptionCapForType),
        // NOT the bubble's SOFT comfortable target (`maxAreaM2`) — a relaxed grow deliberately
        // takes the real room comfortably ABOVE its soft target so the leftover reads as one
        // larger real room (a roomy bedroom) instead of a minted study/store. `withinAbsorption-
        // Envelope` still binds length + aspect HARD-MAX strictly, so the room never tunnels.
        //
        // §RESIDUAL-DETECT-CLEAN (founder defect, 2026-06-15) — a PARTIAL grow leaves the
        // neighbour's new edge mid-fragment (a fresh interior partition line). Near the STAIR
        // keep-out that edge need not align with the stair-fragmented grid, so it can leave a thin
        // gap room-detection LEAKS through (detected < emitted, a flood). The CALLER therefore
        // only invokes this for fragments that do NOT abut the stair keep-out (the regular part of
        // the plate, where a partial grow is detection-safe); the stair-adjacent residual is left
        // to the grid-aligned mint below. Within those safe fragments a partial grow is allowed so
        // an adjacent REAL room (bedroom / living) genuinely ENLARGES to swallow the leftover
        // (the founder's "larger rooms") instead of minting a fill cell.
        let aIdx = -1, aShared = 0;
        for (let i = 0; i < work.length; i++) {
            const meta = roomById.get(work[i]!.roomId);
            if (!meta || !RESIDUAL_GROW_ELIGIBLE.has(meta.type)) continue;
            const cap = absorptionCapForType(meta.type);
            if (rectArea(work[i]!.rect) >= cap - 1e-6) continue;
            const res = growPartial(work[i]!.rect, fragment, cap);
            if (!res || !withinAbsorptionEnvelope(meta.type, res.grown)) continue;
            const shared = sharedEdgeM(work[i]!.rect, fragment);
            if (shared > aShared + 1e-9) { aShared = shared; aIdx = i; }
        }
        if (aIdx < 0 || aShared <= 0.05) return false;
        const nb = work[aIdx]!;
        const meta = roomById.get(nb.roomId)!;
        const cap = absorptionCapForType(meta.type);
        const res = growPartial(nb.rect, fragment, cap);
        if (!res || !withinAbsorptionEnvelope(meta.type, res.grown)) return false;
        if (res.remainder) worklist.push(res.remainder);
        claims.push({
            areaM2: round6(rectArea(res.grown) - rectArea(nb.rect)),
            how: 'grown', neighbourId: nb.roomId, label: nb.roomId,
        });
        work[aIdx] = { roomId: nb.roomId, rect: res.grown };
        return true;
    };

    // Worklist so a partially-absorbed fragment's REMAINDER is re-examined (it may abut a
    // DIFFERENT eligible neighbour) before it is finally minted. Bounded: every iteration
    // either consumes the fragment or shrinks it past a grow-eligible neighbour, and the
    // mint path always terminates (a fragment with no further grow is minted, never re-queued).
    // Seeding (below the cavern gate, restrict to the fragments the triggers selected so an
    // already blank-free plate stays byte-identical):
    //   • CAVERN: the FULL residual (legacy — every blank + every remainder claimed).
    //   • else: the MODERATE fragments (≥ 6 m² — the founder's top-floor cells) ∪ the
    //     STAIR-ADJACENT fragments (the landing bands that flood the stair). A fragment that
    //     is neither (genuine sub-6 m² wall slack that doesn't touch the stair) is left blank.
    const worklist: Rect[] = cavern
        ? [...rawResidual]
        : rawResidual.filter(r => isModerate(r) || touchesStair(r));
    let guard = rawResidual.length * 8 + 16;                    // deterministic safety bound
    while (worklist.length > 0 && guard-- > 0) {
        const frag = worklist.shift()!;
        if (rectArea(frag) < RESIDUAL_EPS_M2) continue;
        const shortSide = Math.min(frag.x1 - frag.x0, frag.z1 - frag.z0);
        if (shortSide < RESIDUAL_MINT_MIN_SHORT_M) continue;   // clearance sliver — leave blank

        // The grow-eligible placed room sharing the LONGEST FULL (rectangular-union) wall with
        // this fragment, with headroom under its HARD-MAX cap, where the grown rect STILL fits
        // its shape envelope — its natural owner to grow into.
        let bestIdx = -1, bestShared = 0;
        for (let i = 0; i < work.length; i++) {
            const meta = roomById.get(work[i]!.roomId);
            if (!meta || !RESIDUAL_GROW_ELIGIBLE.has(meta.type)) continue;
            const cap = Math.min(meta.maxAreaM2, growCapForType(meta.type));
            if (rectArea(work[i]!.rect) >= cap - 1e-6) continue;            // already at its ceiling
            const res = growPartial(work[i]!.rect, frag, cap);
            if (!res) continue;                                            // union not rectangular / no slab
            if (!withinShapeEnvelope(meta.type, res.grown)) continue;      // would breach the shape gate
            const shared = sharedEdgeM(work[i]!.rect, frag);
            if (shared > bestShared + 1e-9) { bestShared = shared; bestIdx = i; }
        }

        // 1. GROW — absorb as much of the fragment as the neighbour's hard-max allows; re-queue
        //    any remainder. Hard-max + shape-envelope bounded → can NEVER recreate the "master
        //    over-allocated" oversize defect (a room at its ceiling is skipped, slack is minted).
        if (bestIdx >= 0 && bestShared > 0.05) {
            const nb = work[bestIdx]!;
            const meta = roomById.get(nb.roomId)!;
            const cap = Math.min(meta.maxAreaM2, growCapForType(meta.type));
            const res = growPartial(nb.rect, frag, cap);
            if (res && withinShapeEnvelope(meta.type, res.grown)) {
                claims.push({
                    areaM2: round6(rectArea(res.grown) - rectArea(nb.rect)),
                    how: 'grown', neighbourId: nb.roomId, label: nb.roomId,
                });
                work[bestIdx] = { roomId: nb.roomId, rect: res.grown };
                if (res.remainder) worklist.push(res.remainder);
                continue;
            }
        }

        // 1b. §RESIDUAL-REAL-ROOMS (founder defect, 2026-06-15 — "the top floor mints 6 small
        //     Stores instead of real rooms") — PREFER FILLING WITH A REAL ROOM over minting a
        //     Store. The strict grow above (1) caps every room at its COMFORTABLE hard-max, so a
        //     large under-programmed band beside a bedroom/living/master could only be filled by
        //     a SWARM of minted Stores (the founder's defect). Before minting, retry the grow with
        //     the RELAXED absorption envelope (area up to absorptionCapForType ≈ 1.6× the comfort
        //     hard-max; length + aspect STILL strict so no tunnel): the band reads as one
        //     comfortably-larger real room (a roomy bedroom, a generous landing) instead of a
        //     store swarm. Absorbs as much as the relaxed cap allows + re-queues the remainder;
        //     only the residue that NO real room can take falls through to the bounded mint below.
        //     This NEVER lowers a count and is deterministic. (On a well-tiled plate the strict
        //     grow already handled the fragment, so this never fires (byte-identical, ADR-0061).
        //
        // §RESIDUAL-DETECT-CLEAN (founder defect, 2026-06-15) — the RELAXED absorb is GATED to
        // fragments that DON'T abut the stair keep-out. A relaxed grow extends a real room's rect
        // by a partial slab whose new edge need NOT align with the stair-fragmented grid; near the
        // stair that misaligned edge leaves a thin gap room-detection LEAKS through (detected <
        // emitted). Away from the stair the grid is regular, so a relaxed grow there is detection-
        // safe AND fills with a larger real room (the founder's "larger bedrooms"). Stair-adjacent
        // residual is left to the GRID-ALIGNED mint below (proven detection-clean), so no leak.
        const fragTouchesStair = stairKeepOuts.some(ko => sharedEdgeM(frag, ko) > 0.05);
        if (!fragTouchesStair && absorbIntoRealRoom(frag)) continue;

        // 2. MINT — the leftover that no real room could grow into is FILLED with NAMED rooms.
        //    §RESIDUAL-REAL-ROOMS (founder defect, 2026-06-15): a back-strip / stair-fragmented
        //    leftover the subdivider couldn't program used to be split into a SWARM of tiny ≤7.5 m²
        //    `utility` "Store" cells (the founder's "6 small Stores on the top floor"). Instead we
        //    mint it as FEWER, LARGER REAL rooms — a room-sized cell becomes ONE `study` (a
        //    windowless box room / home office, the most defensible interior room), capping genuine
        //    `utility` STORES at RESIDUAL_MAX_MINTED_STORES (≤1) so the founder sees "a few real
        //    rooms + at most one store", never a swarm. Each cell is wired `open` to the room it
        //    abuts so it is never a sealed island.
        //
        // Choose the mint TYPE per cell: a cell that fits a REAL room envelope (study) is minted as
        // that room; only a cell too small/awkward for any real type — AND while under the store cap
        // — becomes the single permitted utility Store. We size the split by the chosen real type's
        // envelope (study areaHardMax 20 → far fewer cells than the 7.5 m² utility grid).
        const mintCellsForType = (t: RoomType): Rect[] => {
            const d = dimensionsFor(t);
            return splitFragmentToCells(frag, Math.max(0, d.areaHardMax - 0.5), d.aspectHardMax, d.lengthHardMax);
        };
        // Does the WHOLE fragment, split into study-sized cells, fit the study shape envelope?
        const realType = RESIDUAL_MINT_REAL_TYPES.find(t =>
            mintCellsForType(t).every(c => rectArea(c) >= dimensionsFor(t).areaMin - 1e-6 && withinShapeEnvelope(t, c)),
        );
        const useStore = realType === undefined;
        // A store-typed mint is gated by the per-pass cap; a real-room mint is not (real rooms ARE
        // the desired fill). If we'd need a store but the cap is reached, absorb (relaxed, only
        // when detection-safe — see §RESIDUAL-DETECT-CLEAN) or leave as clearance.
        if (useStore && mintedStores >= RESIDUAL_MAX_MINTED_STORES) {
            if (!fragTouchesStair) absorbIntoRealRoom(frag);
            continue;
        }
        const mintType: RoomType = realType ?? 'utility';
        const cells = useStore ? splitFragmentForMint(frag) : mintCellsForType(mintType);
        let storeMintedThisFrag = false;
        for (const cell of cells) {
            if (rectArea(cell) < RESIDUAL_EPS_M2) continue;
            const cs = Math.min(cell.x1 - cell.x0, cell.z1 - cell.z0);
            if (cs < RESIDUAL_MINT_MIN_SHORT_M) continue;                  // sliver — leave clearance
            // A multi-cell STORE split may only mint ONE Store; further store cells are absorbed
            // (relaxed, detection-safe only) or left as clearance — never a swarm. Real-room
            // cells are all minted.
            if (useStore && (storeMintedThisFrag || mintedStores >= RESIDUAL_MAX_MINTED_STORES)) {
                if (!fragTouchesStair) absorbIntoRealRoom(cell);
                continue;
            }
            const mintRect = cell;
            let nbIdx = -1, nbShared = 0;
            for (let i = 0; i < work.length; i++) {
                const shared = sharedEdgeM(work[i]!.rect, mintRect);
                if (shared > nbShared + 1e-9) { nbShared = shared; nbIdx = i; }
            }
            const neighbourId = nbIdx >= 0 && nbShared > 0.05 ? work[nbIdx]!.roomId : null;
            const id = `residual_${seed}_${mintCounter++}`;
            mints.push({
                id, type: mintType, name: residualMintName(mintType), rect: mintRect,
                targetAreaM2: round6(rectArea(mintRect)), neighbourId,
            });
            claims.push({
                areaM2: round6(rectArea(mintRect)),
                how: 'minted', neighbourId, label: residualMintName(mintType),
            });
            work.push({ roomId: id, rect: mintRect });
            if (useStore) { mintedStores++; storeMintedThisFrag = true; }
        }
    }

    // After-pass blank: re-subtract the (now grown + minted) placements.
    const afterResidual = mergeHorizontally(subtractRectsFromRects(buildableRects, work.map(p => p.rect)))
        .filter(r => rectArea(r) >= RESIDUAL_EPS_M2)
        .sort(byAreaDesc);
    const largestBlankM2 = afterResidual.length > 0 ? rectArea(afterResidual[0]!) : 0;
    const totalBlankM2 = afterResidual.reduce((s, r) => s + rectArea(r), 0);

    return {
        placements: work,
        mints,
        claims,
        largestBlankM2,
        totalBlankM2,
        largestBlankBeforeM2,
        totalBlankBeforeM2,
    };
}

/**
 * Subdivide the shell `rects` among the program rooms. Returns exactly one
 * footprint per placed room. Back-compat array-returning facade over
 * `subdivideWithReport` (which also exposes the §FEASIBILITY-ALLOC drop report).
 * Degenerate input (no rects / no rooms) → [].
 */
export function subdivide(
    rects: readonly Rect[],
    graph: BubbleGraph,
    options: SubdivideOptions = {},
): RoomPlacement[] {
    return subdivideWithReport(rects, graph, options).placements as RoomPlacement[];
}
