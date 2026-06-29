// §SPINE-FIRST P2 (ADR-0073 HAG, 2026-06-21) — pack rooms into the residual BANDS either side of a
// derived corridor spine, so the spine-first invariants hold BY CONSTRUCTION:
//   (I1) every placed room shares the corridor (spine) wall   → no sealed/served-through room.
//   (I2) every window-needing room touches the shell exterior → no "buried, no façade" (window) fail.
// These are exactly the two dominant defects the §CIRCULATION-ROBUSTNESS-SWEEP measured (circulation
// + window). Driving the spine — not area packing — guarantees them.
//
// PURE + deterministic (ADR-0061). Metres, world XZ. This P2 core handles the STRAIGHT primary run
// (double-loaded corridor) on a RECTANGULAR shell — the highest-value common case. Legs (L/T) and
// skewed-shell residuals are P3. Consumes a SpinePath from deriveCorridorSpine (P1).

import type { Pt, Rect } from './rectDecomposition.js';
import { rectArea, subtractRectsFromRects, decomposeToRects } from './rectDecomposition.js';
import { clipToConvexShell } from './polySubdivide.js';
import type { SpinePath, SpineSegment } from './deriveCorridorSpine.js';

const DOOR_W = 0.8;
const SNAP = 0.05;

/** A rect's CCW boundary ring (matches the cell vertex order used across tgl). */
function rectRing(r: Rect): Pt[] {
    return [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];
}

export interface SpineRoom {
    readonly id: string;
    readonly targetAreaM2: number;
    readonly needsWindow: boolean;
    readonly minShortSideM: number;
}

export interface PackedRoom { readonly roomId: string; readonly rect: Rect }

export interface SpinePackResult {
    /** The primary run rect (the straight corridor strip). */
    readonly corridor: Rect;
    /** ALL corridor cells = the run + any stair legs (each a rect of the corridor width). Their
     *  union is the realised corridor footprint (an L/T when a leg reaches an edge stair). */
    readonly corridorCells: readonly Rect[];
    readonly rooms: readonly PackedRoom[];
    readonly dropped: readonly string[];
    /** Diagnostic: which side ('A' high / 'B' low) each room landed on. */
    readonly side: Readonly<Record<string, 'A' | 'B'>>;
    /** §18 slice 3 — per-room cell POLYGON clipped to the real shell (only when opts.shellPolygon is
     *  given). The room `rect` stays the bbox-frame rect (gates/scoring); these polygons drive emission
     *  on a sheared shell (façade edges follow the slant, interior edges unchanged ⇒ adjacency kept).
     *  Absent ⇒ the caller lifts each rect to a cell (rectangular shell, byte-identical). */
    readonly cellPolygonById?: ReadonlyMap<string, readonly Pt[]>;
}

/** Build the corridor cells (run rect + a rect per leg segment of the spine). */
function corridorCellsOf(run: Rect, spine: SpinePath): Rect[] {
    const cells: Rect[] = [run];
    const half = spine.widthM / 2;
    for (let i = 1; i < spine.segments.length; i++) {
        const s = spine.segments[i]!;
        if (Math.abs(s.a.x - s.b.x) < EPS) {                 // vertical leg
            cells.push({ x0: s.a.x - half, x1: s.a.x + half, z0: Math.min(s.a.z, s.b.z), z1: Math.max(s.a.z, s.b.z) });
        } else {                                              // horizontal leg
            cells.push({ z0: s.a.z - half, z1: s.a.z + half, x0: Math.min(s.a.x, s.b.x), x1: Math.max(s.a.x, s.b.x) });
        }
    }
    return cells;
}

/** §SPINE-CONCAVE-ARMS — a corridor-width rect for ONE centre-line segment (orthogonal). Unlike
 *  `corridorCellsOf` this does NOT span the shell bbox for segment 0 — it follows the segment's own
 *  extent, so a branching arm-spine on an L/T/U shell never pokes its primary cell into the notch. */
function segCell(s: SpineSegment, half: number): Rect {
    if (Math.abs(s.a.x - s.b.x) < EPS) {                     // vertical segment
        return { x0: s.a.x - half, x1: s.a.x + half, z0: Math.min(s.a.z, s.b.z), z1: Math.max(s.a.z, s.b.z) };
    }
    return { z0: s.a.z - half, z1: s.a.z + half, x0: Math.min(s.a.x, s.b.x), x1: Math.max(s.a.x, s.b.x) };
}

/** Every corridor cell built purely from the spine segments (each = its segment's strip). For a
 *  branching arm-spine this is the realised corridor footprint — no bbox-spanning segment-0 strip.
 *  Only AXIS-ALIGNED segments contribute a cell (a branching spine is orthogonal by construction). */
function corridorCellsFromSegments(spine: SpinePath): Rect[] {
    const half = spine.widthM / 2;
    return spine.segments
        .filter(s => Math.abs(s.a.x - s.b.x) < EPS || Math.abs(s.a.z - s.b.z) < EPS)
        .map(s => segCell(s, half))
        .filter(c => c.x1 - c.x0 > EPS && c.z1 - c.z0 > EPS);
}

/** True iff `poly` is a concave axis-rectilinear shell (an L/T/U/cross) — the case where the band
 *  region must be the arm rects (not the bbox) so no room lands in the notch. */
function isConcaveAxisRectilinear(poly: readonly Pt[]): boolean {
    if (poly.length < 5) return false;                       // a rect has 4 vertices ⇒ never concave
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.z - b.z) > 1e-6) return false;   // diagonal ⇒ not axis-rectilinear
    }
    let area2 = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i]!, q = poly[(i + 1) % poly.length]!; area2 += p.x * q.z - q.x * p.z; }
    const ccw = area2 >= 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[(i - 1 + poly.length) % poly.length]!, b = poly[i]!, c = poly[(i + 1) % poly.length]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (Math.abs(cross) < EPS) continue;
        if (ccw ? cross < 0 : cross > 0) return true;
    }
    return false;
}

const EPS = 1e-6;

/** Greedy longest-processing-time split into two area-balanced cohorts (stable, deterministic). */
function balanceTwo(rooms: readonly SpineRoom[]): readonly [SpineRoom[], SpineRoom[]] {
    const byArea = [...rooms].sort((a, b) => b.targetAreaM2 - a.targetAreaM2 || a.id.localeCompare(b.id));
    const A: SpineRoom[] = [], B: SpineRoom[] = [];
    let aArea = 0, bArea = 0;
    for (const r of byArea) {
        if (aArea <= bArea) { A.push(r); aArea += Math.max(EPS, r.targetAreaM2); }
        else { B.push(r); bArea += Math.max(EPS, r.targetAreaM2); }
    }
    return [A, B];
}

/** §HABITABLE-NOT-CORRIDOR (§19.3 / §20.1, founder "a study cannot have the shape of a corridor") —
 *  the max long:short ratio a HABITABLE combed cell may have before it reads as a corridor. A room
 *  longer than this relative to its short side is widened/merged-out rather than emitted as a thin
 *  sliver. Only enforced in single-loaded mode (where the aspect is meaningful — the band depth is
 *  the room depth); the legacy double-loaded path is unaffected (default `combBandAspectCap`
 *  undefined ⇒ no cap ⇒ byte-identical). */
const HABITABLE_MAX_ASPECT = 3.0;

/** Comb a cohort along the band's LONG axis; each room spans the FULL band depth (touches the spine
 *  edge AND the outer/façade edge) and takes a share of the band length PROPORTIONAL to its target
 *  area, so the cohort exactly TILES the residual band (no drops — the corridor strip has already
 *  been removed, so rooms fill what remains, like squarify fills a zone). A room is only reported
 *  dropped when the band is so short it can't host the cohort above the per-room minimum.
 *
 *  When `aspectCap` is given (single-loaded mode), a habitable room slice whose along-extent would
 *  fall below bandDepth/aspectCap is widened — and rooms are dropped (lowest priority first, never a
 *  silent under-min sliver) until every kept slice both clears its `minShortSideM` AND respects the
 *  aspect cap. The band tiles exactly across the KEPT rooms. */
function combBand(
    band: Rect, axis: 'x' | 'z', cohort: readonly SpineRoom[],
    aspectCap?: number,
): { placements: PackedRoom[]; dropped: string[] } {
    const placements: PackedRoom[] = [];
    const dropped: string[] = [];
    if (cohort.length === 0) return { placements, dropped };
    const along0 = axis === 'x' ? band.x0 : band.z0;
    const along1 = axis === 'x' ? band.x1 : band.z1;
    const bandLen = along1 - along0;
    // The band's DEPTH (perpendicular to the comb axis) = each slice's long-ish span to the façade.
    const bandDepth = axis === 'x' ? (band.z1 - band.z0) : (band.x1 - band.x0);
    // §HABITABLE-NOT-CORRIDOR — a slice's along-extent must be ≥ this so its long:short ratio against
    // the band depth never exceeds the cap (the deeper edge is the band depth, so the floor is
    // depth/cap; a shallow band has no floor). Undefined cap ⇒ 0 floor (byte-identical legacy path).
    const aspectFloor = aspectCap !== undefined && bandDepth > EPS ? bandDepth / aspectCap : 0;
    /** Each kept room needs at least max(its min short side, the aspect floor) of band length. */
    const slotFloor = (r: SpineRoom): number => Math.max(r.minShortSideM, aspectFloor);
    // Drop the lowest-priority (smallest-target) rooms until the rest can each clear their slot floor.
    const ordered = [...cohort].sort((a, b) => b.targetAreaM2 - a.targetAreaM2 || a.id.localeCompare(b.id));
    let kept = ordered;
    while (kept.length > 0 && kept.reduce((s, r) => s + slotFloor(r), 0) > bandLen + EPS) {
        dropped.push(kept[kept.length - 1]!.id);
        kept = kept.slice(0, -1);
    }
    if (kept.length === 0) return { placements, dropped };
    // Proportional fill: each kept room's along-extent = bandLen × target / Σtarget, but never below
    // its slot floor (clamp, then renormalise the slack so the band still tiles exactly).
    const totalTarget = kept.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0);
    let widths = kept.map(r => bandLen * Math.max(EPS, r.targetAreaM2) / totalTarget);
    widths = widths.map((w, i) => Math.max(w, slotFloor(kept[i]!)));
    const sumW = widths.reduce((s, w) => s + w, 0);
    widths = widths.map(w => w * bandLen / sumW);                 // renormalise back to exactly bandLen
    // Preserve the input order for determinism of placement positions.
    const orderById = new Map(cohort.map((r, i) => [r.id, i]));
    const seq = kept.map((r, i) => ({ r, w: widths[i]! }))
        .sort((p, q) => (orderById.get(p.r.id) ?? 0) - (orderById.get(q.r.id) ?? 0));
    let cursor = along0;
    for (const { r, w } of seq) {
        const a = cursor, b = Math.min(cursor + w, along1);
        placements.push({
            roomId: r.id,
            rect: axis === 'x'
                ? { x0: a, z0: band.z0, x1: b, z1: band.z1 }
                : { x0: band.x0, z0: a, x1: band.x1, z1: b },
        });
        cursor = b;
    }
    return { placements, dropped };
}

/**
 * Pack `rooms` into the two bands either side of the spine's straight primary run.
 * Rectangular-shell core (P2). Returns null when the spine is not a straight primary run on a usable
 * shell (caller falls back to the legacy carve / P3 handles the residual cases).
 */
export function packRoomsAlongSpine(
    shellBbox: Rect,
    spine: SpinePath,
    rooms: readonly SpineRoom[],
): SpinePackResult | null {
    const run = spine.segments[0];
    if (!run) return null;
    const half = spine.widthM / 2;

    if (spine.primaryAxis === 'x') {
        const zc = run.a.z;
        const bandA: Rect = { x0: shellBbox.x0, z0: zc + half, x1: shellBbox.x1, z1: shellBbox.z1 };  // high side (façade z1)
        const bandB: Rect = { x0: shellBbox.x0, z0: shellBbox.z0, x1: shellBbox.x1, z1: zc - half };  // low side (façade z0)
        if (bandA.z1 - bandA.z0 < EPS || bandB.z1 - bandB.z0 < EPS) return null;
        const [cohortA, cohortB] = balanceTwo(rooms);
        const a = combBand(bandA, 'x', cohortA);
        const b = combBand(bandB, 'x', cohortB);
        const corridor: Rect = { x0: shellBbox.x0, z0: zc - half, x1: shellBbox.x1, z1: zc + half };
        const side: Record<string, 'A' | 'B'> = {};
        for (const r of cohortA) side[r.id] = 'A';
        for (const r of cohortB) side[r.id] = 'B';
        return { corridor, corridorCells: corridorCellsOf(corridor, spine), rooms: [...a.placements, ...b.placements], dropped: [...a.dropped, ...b.dropped], side };
    }

    // primaryAxis 'z' — run vertical; bands left/right.
    const xc = run.a.x;
    const bandA: Rect = { x0: xc + half, z0: shellBbox.z0, x1: shellBbox.x1, z1: shellBbox.z1 };       // right (façade x1)
    const bandB: Rect = { x0: shellBbox.x0, z0: shellBbox.z0, x1: xc - half, z1: shellBbox.z1 };       // left (façade x0)
    if (bandA.x1 - bandA.x0 < EPS || bandB.x1 - bandB.x0 < EPS) return null;
    const [cohortA, cohortB] = balanceTwo(rooms);
    const a = combBand(bandA, 'z', cohortA);
    const b = combBand(bandB, 'z', cohortB);
    const corridor: Rect = { x0: xc - half, z0: shellBbox.z0, x1: xc + half, z1: shellBbox.z1 };
    const side: Record<string, 'A' | 'B'> = {};
    for (const r of cohortA) side[r.id] = 'A';
    for (const r of cohortB) side[r.id] = 'B';
    return { corridor, corridorCells: corridorCellsOf(corridor, spine), rooms: [...a.placements, ...b.placements], dropped: [...a.dropped, ...b.dropped], side };
}

/**
 * §SPINE-TREE (§18 slice 1) — pack rooms off EVERY corridor segment (the straight primary run AND
 * its legs), not just `segments[0]`, so an L/T/U corridor connects rooms in the fragments a straight
 * run never reaches (the founder's fragmented-plate defect). The shell bbox MINUS the corridor cells
 * (`subtractRectsFromRects`) is the set of residual BANDS, each abutting a corridor cell BY
 * CONSTRUCTION; rooms are distributed across the bands (greedy largest-target → emptiest band, LPT)
 * and combed along each band's corridor-shared edge so every placed room shares a corridor wall (I1)
 * and spans to the façade (I2). Rect-based + pure; clipping the bands to the REAL sheared shell is
 * §18 slice 3 (today the caller still gates to a rectangular shell, P8). Returns null on a degenerate
 * spine / no residual band.
 */
export interface PackTreeOptions {
    /** §18 slice 2 — PRE-SPLIT cohorts [sideA, sideB]. When given, sideA packs into the bands on ONE
     *  side of the primary run and sideB into the bands on the OTHER — so a MIXED (ground) floor puts
     *  PUBLIC on one side and PRIVATE on the other (the corridor sits between the social + sleeping
     *  zones). Absent ⇒ all rooms balanced across every band (the all-private upper floor). Falls back
     *  to unzoned if either side has no band (never forces a drop). */
    readonly cohorts?: readonly [readonly SpineRoom[], readonly SpineRoom[]];
    /** §18 slice 3 — the REAL shell polygon (convex; e.g. a sheared GIS quad). When given, each packed
     *  room cell is clipped to it (`cellPolygonById`) so the pack is polygon-native: no bbox overflow,
     *  façade edges follow the slant, interior/corridor-shared edges unchanged. Absent ⇒ rect cells. */
    readonly shellPolygon?: readonly Pt[];
    /** §18 slice 5a — the stair keep-out rect. SUBTRACTED from the room bands (alongside the corridor
     *  cells) so NO room ever tiles over the stair (the P5/regression defect: rooms overlapping the
     *  stair). Absent ⇒ no keep-out (apartment / no-stair plate). */
    readonly keepOut?: Rect;
    /** §SINGLE-LOAD-PERIPHERAL (§19.3 / §20.1, default OFF — gated by window.__pryzmSpineTree upstream)
     *  — on a COMPACT plate, run the corridor AGAINST the core/stair edge and pack ALL rooms in ONE
     *  band between the corridor and the FAR façade, so every room gets BOTH a corridor wall
     *  (circulation) AND an exterior façade (window). This is the escape from the windows-vs-
     *  circulation trap (§19.2) that the double-loaded balanceTwo/cohort pack falls into. Absent /
     *  false ⇒ the double-loaded pack (byte-identical). */
    readonly singleLoaded?: boolean;
}

export function packRoomsAlongSpineTree(
    shellBbox: Rect,
    spine: SpinePath,
    rooms: readonly SpineRoom[],
    opts: PackTreeOptions = {},
): SpinePackResult | null {
    const run = spine.segments[0];
    if (!run) return null;
    const half = spine.widthM / 2;

    // §SINGLE-LOAD-PERIPHERAL (§19.3 / §20.1) — run the corridor AGAINST the core/stair edge and pack
    // ALL rooms in ONE band between the corridor and the FAR façade. Handled by a dedicated builder
    // (its own corridor strip + single band), so the double-loaded path below stays byte-identical.
    if (opts.singleLoaded) {
        return packSingleLoaded(shellBbox, spine, rooms, opts);
    }

    // §SPINE-CONCAVE-ARMS — on a concave axis-rectilinear (L/T/U/cross) shell the band region MUST be
    // the shell's ARM rects, not the bbox: a bbox band would spill into the notch (outside the
    // building) and the rooms placed there would clip away → SEALED / unreachable (the founder's red
    // graph). The corridor is the BRANCHING arm-spine's own cells (every segment a strip, no
    // bbox-spanning primary), so a corridor cell abuts each arm's rooms by construction. A convex /
    // rectangular shell (or no shellPolygon) keeps the bbox path ⇒ byte-identical.
    const concaveArms = opts.shellPolygon && isConcaveAxisRectilinear(opts.shellPolygon)
        ? decomposeToRects(opts.shellPolygon).filter(r => rectArea(r) > EPS)
        : null;

    // The primary run as a full-width corridor strip (same as packRoomsAlongSpine's corridor rect) —
    // EXCEPT on a concave arm shell, where every corridor cell follows its segment (never the bbox).
    const bboxCorridor: Rect = spine.primaryAxis === 'x'
        ? { x0: shellBbox.x0, z0: run.a.z - half, x1: shellBbox.x1, z1: run.a.z + half }
        : { x0: run.a.x - half, z0: shellBbox.z0, x1: run.a.x + half, z1: shellBbox.z1 };
    const corridorCells = concaveArms ? corridorCellsFromSegments(spine) : corridorCellsOf(bboxCorridor, spine);
    // §SPINE-CONCAVE-ARMS — the representative corridor rect drives wall/door adjacency + the clamp in
    // the §SPINE-TREE consumer. On a concave shell the bbox strip would clamp to a degenerate sliver
    // (it spans the notch), so use the LARGEST real corridor cell (a genuine segment strip inside the
    // shell). The full L/T ring still rides on the consumer's `rectUnionRing(corridorCells)`.
    const corridor: Rect = concaveArms && corridorCells.length > 0
        ? corridorCells.slice().sort((p, q) => rectArea(q) - rectArea(p))[0]!
        : bboxCorridor;

    // Residual bands = (arm rects on a concave shell, else the bbox) − every corridor strip − the
    // stair keep-out; each abuts a corridor cell by construction, and NO band covers the stair.
    const bandBase = concaveArms ?? [shellBbox];
    const obstacles = opts.keepOut ? [...corridorCells, opts.keepOut] : corridorCells;
    const bands = subtractRectsFromRects(bandBase, obstacles)
        .filter(r => rectArea(r) > EPS)
        .sort((p, q) => rectArea(q) - rectArea(p) || p.x0 - q.x0 || p.z0 - q.z0);
    if (bands.length === 0) return null;

    // The axis to comb a band along = the direction of its SHARED edge with a corridor cell, so each
    // slice spans the band depth and TOUCHES the corridor. Horizontal shared edge (band above/below a
    // cell) ⇒ comb along x; vertical shared edge (band beside a cell) ⇒ comb along z. Fallback: the
    // band's longer axis.
    const combAxisFor = (band: Rect): 'x' | 'z' => {
        for (const c of corridorCells) {
            const xOv = Math.min(band.x1, c.x1) - Math.max(band.x0, c.x0);
            const zOv = Math.min(band.z1, c.z1) - Math.max(band.z0, c.z0);
            if (xOv > DOOR_W && (Math.abs(band.z1 - c.z0) < SNAP || Math.abs(band.z0 - c.z1) < SNAP)) return 'x';
            if (zOv > DOOR_W && (Math.abs(band.x1 - c.x0) < SNAP || Math.abs(band.x0 - c.x1) < SNAP)) return 'z';
        }
        return (band.x1 - band.x0) >= (band.z1 - band.z0) ? 'x' : 'z';
    };

    // Comb a room set across a band set: LPT assign (largest target → emptiest band; deterministic),
    // then comb each band along its corridor-shared edge. A room set with no band drops (reported).
    const packInto = (bandSet: readonly Rect[], roomSet: readonly SpineRoom[]): { placements: PackedRoom[]; dropped: string[] } => {
        const placements: PackedRoom[] = [];
        const dropped: string[] = [];
        if (roomSet.length === 0) return { placements, dropped };
        if (bandSet.length === 0) return { placements, dropped: roomSet.map(r => r.id) };
        const remaining = bandSet.map(b => rectArea(b));
        const cohorts: SpineRoom[][] = bandSet.map(() => []);
        for (const r of [...roomSet].sort((p, q) => q.targetAreaM2 - p.targetAreaM2 || p.id.localeCompare(q.id))) {
            let best = 0;
            for (let i = 1; i < bandSet.length; i++) if (remaining[i]! > remaining[best]!) best = i;
            cohorts[best]!.push(r);
            remaining[best]! -= Math.max(EPS, r.targetAreaM2);
        }
        bandSet.forEach((band, i) => {
            const ordered = cohorts[i]!.slice().sort((p, q) => roomSet.indexOf(p) - roomSet.indexOf(q));
            const res = combBand(band, combAxisFor(band), ordered);
            placements.push(...res.placements);
            dropped.push(...res.dropped);
        });
        return { placements, dropped };
    };

    const side: Record<string, 'A' | 'B'> = {};
    // Which side of the primary run a band sits on (A = high side of the run's perpendicular axis).
    const sideOf = (band: Rect): 'A' | 'B' => spine.primaryAxis === 'x'
        ? ((band.z0 + band.z1) / 2 > run.a.z ? 'A' : 'B')
        : ((band.x0 + band.x1) / 2 > run.a.x ? 'A' : 'B');

    // §18 slice 3 — assemble the result; when a real shell polygon is given, clip every room cell to
    // it (polygon-native: façade edges follow the slant, interior/corridor-shared edges unchanged).
    const finish = (placements: PackedRoom[], dropped: string[]): SpinePackResult => {
        let cellPolygonById: Map<string, readonly Pt[]> | undefined;
        if (opts.shellPolygon && opts.shellPolygon.length >= 3) {
            cellPolygonById = new Map();
            for (const p of placements) {
                const clipped = clipToConvexShell(rectRing(p.rect), opts.shellPolygon);
                cellPolygonById.set(p.roomId, clipped.length >= 3 ? clipped : rectRing(p.rect));
            }
        }
        return { corridor, corridorCells, rooms: placements, dropped, side, ...(cellPolygonById ? { cellPolygonById } : {}) };
    };

    // §18 slice 2 — public/private zoning: cohort[0] → side-A bands, cohort[1] → side-B bands.
    // §SPINE-CONCAVE-ARMS — the "two sides of the primary run" split is meaningless on a BRANCHING
    // arm-spine (bands come from several arms, not two sides of one run), and forcing public rooms to
    // one side strands a public room in a band with no façade (a `window` fail). On a concave shell let
    // the rooms BALANCE freely across every arm band (each band reaches the façade by construction), so
    // every window-room keeps an exterior wall. Rectangular shells keep the public/private zoning.
    if (opts.cohorts && !concaveArms) {
        const bandsA = bands.filter(b => sideOf(b) === 'A');
        const bandsB = bands.filter(b => sideOf(b) === 'B');
        if (bandsA.length > 0 && bandsB.length > 0) {
            const a = packInto(bandsA, opts.cohorts[0]);
            const b = packInto(bandsB, opts.cohorts[1]);
            for (const r of opts.cohorts[0]) side[r.id] = 'A';
            for (const r of opts.cohorts[1]) side[r.id] = 'B';
            return finish([...a.placements, ...b.placements], [...a.dropped, ...b.dropped]);
        }
        // One side has no band ⇒ fall through to the unzoned pack (never force a drop for zoning).
    }

    const all = packInto(bands, rooms);
    // Diagnostic side label = which side of the run each placed room landed on (from its own rect).
    for (const p of all.placements) side[p.roomId] = sideOf(p.rect);
    return finish(all.placements, all.dropped);
}

/**
 * §SINGLE-LOAD-PERIPHERAL (§19.3 / §20.1) — pack ALL rooms into ONE band against the FAR façade, with
 * the corridor hugging the CORE/STAIR edge. Each room therefore spans corridor-edge → façade-edge ⇒
 * touches BOTH the corridor (circulation) AND the exterior (window) BY CONSTRUCTION — the geometric
 * escape from the windows-vs-circulation trap (§19.2). A perpendicular leg bridges the corridor to an
 * off-run stair (the corridor reaches the stair keep-out by construction). PURE + deterministic.
 *
 * The "core side" (the side the corridor hugs) is the side of the centred run NEAREST the stair when a
 * keep-out is given (so the stair shares the corridor edge), else the LOW side (deterministic default).
 * Falls back (drops, never a silent under-min sliver) when the single band cannot seat every room at
 * its min short side AND aspect cap; the caller (§SPINE-TREE in subdivide) then falls through to legacy.
 */
function packSingleLoaded(
    shellBbox: Rect,
    spine: SpinePath,
    rooms: readonly SpineRoom[],
    opts: PackTreeOptions,
): SpinePackResult | null {
    const width = spine.widthM;
    const ko = opts.keepOut;

    // The corridor is a full-length strip hugging the CORE side. On the x-axis run it is horizontal
    // (z-thick); on the z-axis run it is vertical (x-thick). The far band fills the rest to the façade.
    let corridor: Rect;
    let band: Rect;
    let combAxis: 'x' | 'z';

    if (spine.primaryAxis === 'x') {
        // Core side = the z-side nearest the stair (else the low side, z0).
        const stairCz = ko ? (ko.z0 + ko.z1) / 2 : shellBbox.z0;
        const midZ = (shellBbox.z0 + shellBbox.z1) / 2;
        const coreLow = stairCz <= midZ;   // stair toward z0 ⇒ corridor hugs z0
        // The corridor/band split line. When the stair is deeper than the corridor width on the core
        // side, push the split to the stair's FAR edge so the corridor and the band share ONE clean
        // line (no gap where the stair intrudes past the strip → every room reaches the corridor edge).
        const splitZ = coreLow
            ? Math.max(shellBbox.z0 + width, ko ? ko.z1 : shellBbox.z0 + width)
            : Math.min(shellBbox.z1 - width, ko ? ko.z0 : shellBbox.z1 - width);
        corridor = coreLow
            ? { x0: shellBbox.x0, z0: shellBbox.z0, x1: shellBbox.x1, z1: splitZ }
            : { x0: shellBbox.x0, z0: splitZ, x1: shellBbox.x1, z1: shellBbox.z1 };
        band = coreLow
            ? { x0: shellBbox.x0, z0: splitZ, x1: shellBbox.x1, z1: shellBbox.z1 }
            : { x0: shellBbox.x0, z0: shellBbox.z0, x1: shellBbox.x1, z1: splitZ };
        combAxis = 'x';
    } else {
        const stairCx = ko ? (ko.x0 + ko.x1) / 2 : shellBbox.x0;
        const midX = (shellBbox.x0 + shellBbox.x1) / 2;
        const coreLow = stairCx <= midX;
        const splitX = coreLow
            ? Math.max(shellBbox.x0 + width, ko ? ko.x1 : shellBbox.x0 + width)
            : Math.min(shellBbox.x1 - width, ko ? ko.x0 : shellBbox.x1 - width);
        corridor = coreLow
            ? { x0: shellBbox.x0, z0: shellBbox.z0, x1: splitX, z1: shellBbox.z1 }
            : { x0: splitX, z0: shellBbox.z0, x1: shellBbox.x1, z1: shellBbox.z1 };
        band = coreLow
            ? { x0: splitX, z0: shellBbox.z0, x1: shellBbox.x1, z1: shellBbox.z1 }
            : { x0: shellBbox.x0, z0: shellBbox.z0, x1: splitX, z1: shellBbox.z1 };
        combAxis = 'z';
    }
    if (band.x1 - band.x0 < EPS || band.z1 - band.z0 < EPS) return null;

    // §STAIR-ON-RUN — the stair keep-out may lie ON the core edge (overlapping the corridor strip) OR
    // be a separate corner. SUBTRACT it from the corridor strip so the corridor routes ALONGSIDE the
    // stair (never through it); the remaining corridor pieces share a wall with the stair BY
    // CONSTRUCTION (the cut edge). Then SUBTRACT it from the room band too (no room tiles over it).
    let corridorCells: Rect[];
    if (ko) {
        corridorCells = subtractRectsFromRects([corridor], [ko])
            .filter(r => rectArea(r) > EPS)
            .sort((p, q) => rectArea(q) - rectArea(p) || p.x0 - q.x0 || p.z0 - q.z0);
        if (corridorCells.length === 0) return null;
        // If after the cut NO corridor piece shares a ≥door-width wall with the stair, add a bridge leg
        // (a corner stair offset from the core edge). Else the cut edge already bridges.
        const bridged = corridorCells.some(c => sharedWallMRect(c, ko) >= DOOR_W);
        if (!bridged) {
            const leg = bridgeLegToStair(corridorCells[0]!, ko, width, combAxis);
            if (leg) corridorCells.push(leg);
        }
        // Trim the band clear of the stair AND any bridge leg; keep the LARGEST remaining run-span as
        // the single room band (deterministic) so no room ever tiles over the stair or the leg.
        const bridgeLeg = corridorCells.find(c => c !== corridor && c.x0 !== corridor.x0);
        const bandObstacles = bridgeLeg ? [ko, bridgeLeg] : [ko];
        const remaining = subtractRectsFromRects([band], bandObstacles).filter(r => rectArea(r) > EPS);
        remaining.sort((p, q) => rectArea(q) - rectArea(p) || p.x0 - q.x0 || p.z0 - q.z0);
        if (remaining.length === 0) return null;
        band = remaining[0]!;
        // §CIRCULATION-BY-CONSTRUCTION — restrict the band to the run-span that has corridor frontage
        // (the union extent of the corridor cells along the run axis), so EVERY placed room abuts the
        // corridor. The sub-region behind the stair (no corridor frontage) is left unused rather than
        // seating a room reachable only through the stair (a sealed room — the founder defect).
        if (combAxis === 'x') {
            const cLo = Math.min(...corridorCells.map(c => c.x0));
            const cHi = Math.max(...corridorCells.map(c => c.x1));
            band = { ...band, x0: Math.max(band.x0, cLo), x1: Math.min(band.x1, cHi) };
        } else {
            const cLo = Math.min(...corridorCells.map(c => c.z0));
            const cHi = Math.max(...corridorCells.map(c => c.z1));
            band = { ...band, z0: Math.max(band.z0, cLo), z1: Math.min(band.z1, cHi) };
        }
        if (band.x1 - band.x0 < EPS || band.z1 - band.z0 < EPS) return null;
    } else {
        corridorCells = [corridor];
    }

    // §HABITABLE-NOT-CORRIDOR (depth guard) — in single-loaded the band DEPTH is each room's short
    // side. A room whose `minShortSideM` exceeds the band depth can never be seated above its minimum
    // here, so DROP it (reported — never a silent under-min sliver); the caller falls through to legacy.
    const bandDepth = combAxis === 'x' ? (band.z1 - band.z0) : (band.x1 - band.x0);
    const ordered = [...rooms].sort((a, b) => b.targetAreaM2 - a.targetAreaM2 || a.id.localeCompare(b.id));
    const tooDeep = ordered.filter(r => r.minShortSideM > bandDepth + 0.01);
    const fits = ordered.filter(r => r.minShortSideM <= bandDepth + 0.01);
    if (fits.length === 0) return null;   // nothing fits the band depth ⇒ single-loaded infeasible
    // Pack the fitting rooms into the single band, combing along the run axis, with the aspect cap so
    // no habitable slice reads as a corridor (widen/drop, never a thin sliver).
    const combed = combBand(band, combAxis, fits, HABITABLE_MAX_ASPECT);
    const placements = combed.placements;
    const dropped = [...tooDeep.map(r => r.id), ...combed.dropped];

    const side: Record<string, 'A' | 'B'> = {};
    for (const p of placements) side[p.roomId] = 'A';   // single-loaded ⇒ every room on one side

    let cellPolygonById: Map<string, readonly Pt[]> | undefined;
    if (opts.shellPolygon && opts.shellPolygon.length >= 3) {
        cellPolygonById = new Map();
        for (const p of placements) {
            const clipped = clipToConvexShell(rectRing(p.rect), opts.shellPolygon);
            cellPolygonById.set(p.roomId, clipped.length >= 3 ? clipped : rectRing(p.rect));
        }
    }
    return { corridor, corridorCells, rooms: placements, dropped, side, ...(cellPolygonById ? { cellPolygonById } : {}) };
}

/** Straight shared-wall length (m) between two abutting rects (0 if not edge-abutting). */
function sharedWallMRect(a: Rect, b: Rect): number {
    const vAbut = Math.abs(a.x1 - b.x0) < SNAP || Math.abs(b.x1 - a.x0) < SNAP;
    const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    const hAbut = Math.abs(a.z1 - b.z0) < SNAP || Math.abs(b.z1 - a.z0) < SNAP;
    const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return Math.max(vAbut && zOv > 0 ? zOv : 0, hAbut && xOv > 0 ? xOv : 0);
}

/** Build a corridor-width perpendicular leg from the run strip to the stair's near edge so the
 *  corridor bridges the stair. `combAxis` is the run direction; the leg runs perpendicular to it. */
function bridgeLegToStair(corridor: Rect, stair: Rect, width: number, combAxis: 'x' | 'z'): Rect | null {
    const half = width / 2;
    if (combAxis === 'x') {
        // Run is horizontal; the leg is vertical, at the stair's x-centre, from the corridor to the stair.
        const cx = Math.min(Math.max((stair.x0 + stair.x1) / 2, corridor.x0 + half), corridor.x1 - half);
        const corrCz = (corridor.z0 + corridor.z1) / 2;
        const stairNearZ = (stair.z0 + stair.z1) / 2 > corrCz ? stair.z0 : stair.z1;
        const z0 = Math.min(corrCz, stairNearZ), z1 = Math.max(corrCz, stairNearZ);
        if (z1 - z0 < EPS) return null;
        return { x0: cx - half, x1: cx + half, z0, z1 };
    }
    const cz = Math.min(Math.max((stair.z0 + stair.z1) / 2, corridor.z0 + half), corridor.z1 - half);
    const corrCx = (corridor.x0 + corridor.x1) / 2;
    const stairNearX = (stair.x0 + stair.x1) / 2 > corrCx ? stair.x0 : stair.x1;
    const x0 = Math.min(corrCx, stairNearX), x1 = Math.max(corrCx, stairNearX);
    if (x1 - x0 < EPS) return null;
    return { z0: cz - half, z1: cz + half, x0, x1 };
}
