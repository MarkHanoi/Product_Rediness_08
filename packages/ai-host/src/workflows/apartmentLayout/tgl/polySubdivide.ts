// TGL P3b (Phase 3, doc §13.3/§13.4) — POLYGON-NATIVE subdivision for the sheared
// convex quad.
//
// THE PROBLEM (doc §13.2): the legacy `rectifyConvexQuad` replaces a sheared convex
// quad with its bounding BOX, tiles rooms in the bbox frame, then projects partition
// endpoints back to the real ring (§RECTIFY-SHELL-PROJECT). Because the rooms are tiled
// in the (larger) bbox, their footprints REACH PAST the real sheared façade — the
// overflow defect (the gate's parallelogram coverage ≈ 1.139, cells poke beyond the
// diagonal shell edges).
//
// THE FIX (recursive polygon binary-split, the doc's RECOMMENDED algorithm (a)): tile
// the REAL quad. We rotate the polygon into its PRINCIPAL-AXIS frame (so interior split
// lines run parallel to the dominant edge family → interior walls stay AXIS-PARALLEL;
// only the perimeter edges are diagonal), then recursively split it by axis-aligned
// half-planes to satisfy the program TREE:
//   1. split off the CORRIDOR band (a strip of corridor width spanning the plate),
//   2. recurse the PUBLIC vs PRIVATE zones (area-proportional),
//   3. comb each zone into per-room sub-polygons (area-proportional slices PERPENDICULAR
//      to the corridor face → every room shares its short edge with the corridor),
//   4. carve the ensuite out of the master sub-polygon (master-only access).
// Every split is a Sutherland–Hodgman half-plane clip; the split coordinate is found by
// a deterministic bisection on the clipped area so each sub-polygon hits its area target.
// Cells are rotated BACK to the world frame and `round6`-rounded.
//
// SCOPE (Phase 3): convex quad only — `enumerate.ts` routes here ONLY when the shell is a
// sheared convex quad with NO stair keep-out (the apartment + the convex-quad apartment-
// style storey). The stair keep-out stays a subtracted hole on the legacy rect path
// (doc §13.6 — generalised to a polygon hole only in Phase 4). All other shells
// (axis-aligned rect, rotated rect that rectifies to an axis rect, L/U/T/concave,
// stair-carved) keep the UNCHANGED rect path.
//
// DETERMINISM: fixed iteration order from the shared allocation/adjacency-sort helpers
// (`allocationOrder` / `adjacencySortForZone`); no Math.random, no Date. Pure: imports
// only sibling TGL types + the rotation helpers. Coordinates METRES, plan frame {x,z}.

import type { BubbleGraph, ProgramRoom } from './bubbleGraph.js';
import { principalAxisAngle, rotatePt, polygonBBox, type Pt } from './rectDecomposition.js';
import { roomRule } from '../rules/programRules.js';
import { allocationOrder, adjacencySortForZone, cellAreaM2, type RoomCell } from './subdivide.js';

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Corridor strip clear-width (m) — mirrors subdivide.ts CORRIDOR_STRIP_WIDTH_M. */
const CORRIDOR_STRIP_WIDTH_M = 1.2;

export interface PolySubdivideOptions {
    /** A.25.3 — corridor strip clear-width (m). Absent ⇒ the built-in 1.2 m. */
    readonly corridorWidthM?: number;
}

// ── Sutherland–Hodgman half-plane clip ──────────────────────────────────────

/** Signed twice-area (shoelace); >0 ⇒ CCW in the {x→right, z→up} frame. */
function signedArea2(poly: readonly Pt[]): number {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a;
}

/** Polygon area (m²) — shoelace, sign-agnostic. */
function polyArea(poly: readonly Pt[]): number {
    return Math.abs(signedArea2(poly)) / 2;
}

/**
 * Clip a convex/simple polygon against the half-plane `keep`. `axis` selects x or z;
 * `side` is 'le' (keep coord ≤ value) or 'ge' (keep coord ≥ value). Sutherland–Hodgman:
 * walk the ring, keep inside vertices, and insert an intersection wherever an edge
 * crosses the clip line. Returns the clipped ring (possibly empty / degenerate). Pure.
 */
function clipHalfPlane(poly: readonly Pt[], axis: 'x' | 'z', value: number, side: 'le' | 'ge'): Pt[] {
    if (poly.length < 3) return [];
    const coord = (p: Pt): number => (axis === 'x' ? p.x : p.z);
    const inside = (p: Pt): boolean => (side === 'le' ? coord(p) <= value + EPS : coord(p) >= value - EPS);
    const lerp = (a: Pt, b: Pt): Pt => {
        const ca = coord(a), cb = coord(b);
        const t = Math.abs(cb - ca) < EPS ? 0 : (value - ca) / (cb - ca);
        return { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
    };
    const out: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
        const cur = poly[i]!, prev = poly[(i - 1 + poly.length) % poly.length]!;
        const curIn = inside(cur), prevIn = inside(prev);
        if (curIn) {
            if (!prevIn) out.push(lerp(prev, cur));
            out.push(cur);
        } else if (prevIn) {
            out.push(lerp(prev, cur));
        }
    }
    return out;
}

/** Clip to the SLAB value0 ≤ coord ≤ value1 on `axis`. */
function clipSlab(poly: readonly Pt[], axis: 'x' | 'z', value0: number, value1: number): Pt[] {
    return clipHalfPlane(clipHalfPlane(poly, axis, value0, 'ge'), axis, value1, 'le');
}

/**
 * Find the coordinate `c` on `axis` (within [lo, hi]) such that the sub-polygon of `poly`
 * with coord ≤ `c` has area ≈ `targetArea`. Deterministic bisection (40 iterations →
 * ~1e-12 relative). Monotone (area grows with c on a simple polygon), so bisection is
 * exact. Returns the split coordinate.
 */
function findAreaSplit(poly: readonly Pt[], axis: 'x' | 'z', lo: number, hi: number, targetArea: number): number {
    let a = lo, b = hi;
    for (let iter = 0; iter < 40; iter++) {
        const mid = (a + b) / 2;
        const left = polyArea(clipHalfPlane(poly, axis, mid, 'le'));
        if (left < targetArea) a = mid; else b = mid;
    }
    return (a + b) / 2;
}

/** Round every vertex to 1e-6 (determinism + clean emit). */
function roundPoly(poly: readonly Pt[]): Pt[] {
    return poly.map(p => ({ x: round6(p.x), z: round6(p.z) }));
}

/** A polygon is usable when it has ≥3 vertices and a non-trivial area. */
function usable(poly: readonly Pt[]): boolean {
    return poly.length >= 3 && polyArea(poly) > 1e-4;
}

// ── Concavity (Phase 4, doc §13.4 step 4) ────────────────────────────────────

/**
 * Indices of the REFLEX (concave, interior-angle > 180°) vertices of a simple polygon,
 * in ring order. A convex polygon returns []. Determines the turn sign from the polygon's
 * own winding (CCW ⇒ interior on the left ⇒ a left turn at a vertex is convex). Collinear
 * vertices (cross ≈ 0) are NOT reflex. Pure + deterministic.
 */
function reflexVertexIndices(poly: readonly Pt[]): number[] {
    const n = poly.length;
    if (n < 4) return [];
    const ccw = signedArea2(poly) >= 0;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
        const a = poly[(i - 1 + n) % n]!, b = poly[i]!, c = poly[(i + 1) % n]!;
        // cross of (b−a)×(c−b): >0 ⇒ left turn. For a CCW ring the interior is on the
        // left, so a RIGHT turn (cross < 0) is a reflex (concave) vertex; mirror for CW.
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (Math.abs(cross) < EPS) continue;          // collinear — straight, not reflex
        const reflex = ccw ? cross < 0 : cross > 0;
        if (reflex) out.push(i);
    }
    return out;
}

/** True iff the simple polygon has ≥1 reflex vertex (a genuine concavity — L/U/T/notch). */
export function isConcavePolygon(poly: readonly Pt[]): boolean {
    return reflexVertexIndices(poly).length > 0;
}

/** True iff every edge of `poly` is horizontal or vertical (an axis-aligned rectilinear
 *  shell — an axis L/U/T). Such a shell is tiled EXACTLY + completely by the legacy
 *  notch-aware slab decomposition (`decomposeToRects`), so it KEEPS the rect path (the
 *  polygon route is reserved for genuinely off-axis / arbitrary concave boundaries). Pure. */
export function isAxisAlignedRectilinear(poly: readonly Pt[]): boolean {
    if (poly.length < 3) return false;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.z - b.z) > 1e-6) return false;   // diagonal edge
    }
    return true;
}

/**
 * §POLYGON-NATIVE-CONCAVE routing predicate (Phase 4) — true iff `poly` should take the
 * polygon-native concave subdivider. That is: it is CONCAVE (≥1 reflex vertex) AND it is
 * NOT an axis-aligned rectilinear L/U/T (those are tiled exactly + completely by the legacy
 * notch-aware `decomposeToRects` rect path, so they stay byte-identical on it). Only a
 * genuinely OFF-AXIS / sheared / arbitrary concave drawn boundary needs the polygon route
 * (the rect path would stair-step its slanted edges into slivers, the doc §13.2 defect). Pure.
 */
export function shouldUsePolygonConcaveRoute(poly: readonly Pt[]): boolean {
    return isConcavePolygon(poly) && !isAxisAlignedRectilinear(poly);
}

// ── Zone bucketing (ported from subdivide.ts trySingleRectCarve) ─────────────

interface ZoneSplit {
    readonly corridor: ProgramRoom | undefined;
    readonly master: ProgramRoom | undefined;
    readonly ensuite: ProgramRoom | undefined;
    readonly publicRooms: ProgramRoom[];
    readonly privateRooms: ProgramRoom[];
}

/** Bucket the bubble rooms into public / private (+ corridor / master / ensuite),
 *  mirroring trySingleRectCarve's classification. */
function bucketRooms(graph: BubbleGraph): ZoneSplit {
    const corridor = graph.rooms.find(r => r.type === 'corridor');
    const master = graph.rooms.find(r => r.type === 'master');
    const ensuite = graph.rooms.find(r => r.type === 'ensuite');
    const publicRooms: ProgramRoom[] = [];
    const privateRooms: ProgramRoom[] = [];
    for (const r of graph.rooms) {
        if (corridor && r.id === corridor.id) continue;
        if (ensuite && r.id === ensuite.id) continue;
        const p = roomRule(r.type).privacy;
        if (p === 'public' || p === 'circulation') publicRooms.push(r);
        else privateRooms.push(r);
    }
    return { corridor, master, ensuite, publicRooms, privateRooms };
}

// ── Comb a zone polygon into per-room sub-polygons ───────────────────────────

/**
 * Slice `zone` into one sub-polygon per room, area-proportional, by axis-aligned cuts
 * along `faceAxis` (the axis ALONG which the corridor face runs — so every slice spans
 * the full perpendicular depth and shares its short edge with the corridor, the
 * §EVERY-ROOM-ACCESS-COMB shape). Rooms are taken in the given order. Returns the cells
 * (real polygons in the principal-axis frame); a room whose slice clips away is skipped
 * (its bubble node carries no cell, exactly like the rect drop-report). Pure.
 */
function combZone(
    zone: readonly Pt[],
    rooms: readonly ProgramRoom[],
    faceAxis: 'x' | 'z',
): { roomId: string; polygon: Pt[] }[] {
    const out: { roomId: string; polygon: Pt[] }[] = [];
    if (!usable(zone) || rooms.length === 0) return out;
    const bb = polygonBBox(zone);
    const lo = faceAxis === 'x' ? bb.x0 : bb.z0;
    const hi = faceAxis === 'x' ? bb.x1 : bb.z1;
    const totalArea = polyArea(zone);
    const totalTarget = rooms.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0) || EPS;

    let remaining = zone.slice();
    let cursor = lo;
    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i]!;
        if (i === rooms.length - 1) {
            // Last room takes everything that remains.
            if (usable(remaining)) out.push({ roomId: room.id, polygon: roundPoly(remaining) });
            break;
        }
        const frac = Math.max(EPS, room.targetAreaM2) / totalTarget;
        const slotArea = totalArea * frac;
        // Find the cut so the slab [cursor .. cut] of the ORIGINAL zone has area ≈ slotArea.
        const cut = findAreaSplit(remaining, faceAxis, cursor, hi, slotArea);
        const slice = clipSlab(remaining, faceAxis, cursor, cut);
        const rest = clipHalfPlane(remaining, faceAxis, cut, 'ge');
        if (usable(slice)) out.push({ roomId: room.id, polygon: roundPoly(slice) });
        remaining = rest;
        cursor = cut;
    }
    return out;
}

/**
 * Carve the ensuite out of the master's cell along the master's LONGER bbox axis so they
 * share an interior wall (the only permitted ensuite access). Returns the master + ensuite
 * cells, or null when the carve can't fit (caller leaves the ensuite unplaced). Pure.
 */
function carveEnsuiteFromMasterCell(
    masterPoly: readonly Pt[],
    ensuiteAreaM2: number,
): { master: Pt[]; ensuite: Pt[] } | null {
    if (!usable(masterPoly)) return null;
    const bb = polygonBBox(masterPoly);
    const W = bb.x1 - bb.x0, H = bb.z1 - bb.z0;
    const masterArea = polyArea(masterPoly);
    if (ensuiteAreaM2 >= masterArea - EPS) return null;
    const ensuiteMin = roomRule('ensuite').minShortSideM;
    const masterMin = roomRule('master').minShortSideM;
    // Cut across the longer axis (gives the master a wider cross-section). The ensuite
    // takes the FAR end of that axis.
    const axis: 'x' | 'z' = W >= H ? 'x' : 'z';
    const span = axis === 'x' ? W : H;
    const cross = axis === 'x' ? H : W;
    if (cross < ensuiteMin - EPS || cross < masterMin - EPS) return null;
    const lo = axis === 'x' ? bb.x0 : bb.z0;
    const hi = axis === 'x' ? bb.x1 : bb.z1;
    // Ensuite occupies area ensuiteAreaM2 at the FAR end; master keeps the rest.
    const cut = findAreaSplit(masterPoly, axis, lo, hi, masterArea - ensuiteAreaM2);
    // Guard the per-room minimum spans on the cut axis.
    if (cut - lo < masterMin - EPS || hi - cut < ensuiteMin - EPS) {
        // Try with span check the other way (ensuite at near end is symmetric — skip).
        if (span < masterMin + ensuiteMin - EPS) return null;
    }
    const master = clipHalfPlane(masterPoly, axis, cut, 'le');
    const ensuite = clipHalfPlane(masterPoly, axis, cut, 'ge');
    if (!usable(master) || !usable(ensuite)) return null;
    return { master: roundPoly(master), ensuite: roundPoly(ensuite) };
}

// ── Public entry ─────────────────────────────────────────────────────────────

/**
 * §POLYGON-NATIVE-SUBDIVIDE (Phase 3) — tile the REAL convex-quad shell into program-
 * driven room CELLS (arbitrary simple polygons in the WORLD frame). Recursive principal-
 * axis-biased binary split (corridor band → public/private zones → per-room comb →
 * ensuite-from-master), each split a half-plane clip at an area-proportional coordinate.
 *
 * The cells cover the real shell (no bbox overflow), keep interior walls axis-parallel in
 * the principal-axis frame, and reduce to the legacy 2-zone split on an axis-aligned shell.
 * Returns `RoomCell[]`; a room that the program can't fit is simply absent (no silent
 * geometry — its bubble node has no cell, exactly like the rect drop-report). Pure +
 * deterministic.
 *
 * @param shellPolygon  the real shell polygon (metres, plan {x,z}); typically a convex quad
 *                      already in the strategy frame `enumerate.ts` subdivides in.
 * @param bubble        the program tree (rooms + corridorId).
 * @param options       corridor width override.
 */
export function subdividePolygon(
    shellPolygon: readonly Pt[],
    bubble: BubbleGraph,
    options: PolySubdivideOptions = {},
): RoomCell[] {
    if (shellPolygon.length < 3) return [];

    const corridorWidthM = typeof options.corridorWidthM === 'number' && Number.isFinite(options.corridorWidthM)
        ? Math.max(1.0, Math.min(2.0, options.corridorWidthM))
        : CORRIDOR_STRIP_WIDTH_M;

    // Rotate the shell into the principal-axis frame so split lines run parallel to the
    // dominant edge family (interior walls stay axis-parallel; only the perimeter is
    // diagonal). A perfectly axis-aligned shell rotates by 0 (identity).
    const angle = principalAxisAngle(shellPolygon);
    const pivot = polygonBBox(shellPolygon);
    const about: Pt = { x: (pivot.x0 + pivot.x1) / 2, z: (pivot.z0 + pivot.z1) / 2 };
    const polyFrame = angle === 0 ? shellPolygon.slice() : shellPolygon.map(p => rotatePt(p, -angle, about));

    // §POLYGON-NATIVE-CONCAVE (Phase 4, doc §13.4 step 4) — a polygon with ≥1 reflex
    // vertex (L/U/T or an arbitrary drawn boundary) is split at a reflex vertex FIRST
    // (a cut along the principal axis) into convex-ish sub-polygons; the WHOLE program is
    // distributed across them area-proportionally, then the convex binary-split tiles each.
    // A convex polyFrame skips this and tiles directly (Phase 3 behaviour, byte-identical).
    const concave = isConcavePolygon(polyFrame);
    const cellsFrame: { roomId: string; polygon: Pt[] }[] = concave
        ? tileConcave(polyFrame, bubble, corridorWidthM)
        : tileConvexZones(polyFrame, bubble, corridorWidthM);

    // Rotate every cell BACK to the world (input) frame and round. On the CONVEX route we
    // additionally CLIP to the real shell (so a float-scale overshoot from the principal-
    // axis round-trip / clip can never poke a vertex past the façade — doc §13.5 "no cell
    // crosses outside the real shell"); the convex shell makes the per-edge half-plane clip
    // the exact polygon∩shell intersection. The CONCAVE shell is NOT convex, so that clip is
    // unsound (it would shave the notch arms); concave cells are instead constructed entirely
    // by half-plane clips of the real polyFrame sub-polygons, so they already lie inside the
    // shell by construction — we skip the convex clip and rely on that. A cell that clips/
    // rounds to nothing is dropped.
    const out: RoomCell[] = [];
    for (const c of cellsFrame) {
        if (!usable(c.polygon)) continue;
        let poly = angle === 0 ? c.polygon : c.polygon.map(p => rotatePt(p, angle, about));
        if (!concave) poly = clipToConvexShell(poly, shellPolygon);
        if (usable(poly)) out.push({ roomId: c.roomId, polygon: roundPoly(poly) });
    }
    return out;
}

/**
 * §POLYGON-NATIVE-CONVEX (Phase 3) — tile a CONVEX polygon (in the principal-axis frame)
 * into program-driven cells: corridor band → public/private zones → per-room comb →
 * ensuite-from-master. Reduces to the legacy 2-zone split on an axis-aligned rectangle.
 * Returns cells keyed by roomId IN THE INPUT FRAME. Pure + deterministic.
 */
function tileConvexZones(
    polyFrame: readonly Pt[],
    bubble: BubbleGraph,
    corridorWidthM: number,
): { roomId: string; polygon: Pt[] }[] {
    const { corridor, master, ensuite, publicRooms, privateRooms } = bucketRooms(bubble);
    const cellsFrame: { roomId: string; polygon: Pt[] }[] = [];

    // No corridor, or no private rooms ⇒ no zoned carve; comb the whole plate by the
    // program order along its longer axis (still a real-polygon tiling, no overflow).
    if (!corridor || privateRooms.length === 0) {
        const bb = polygonBBox(polyFrame);
        const faceAxis: 'x' | 'z' = (bb.x1 - bb.x0) >= (bb.z1 - bb.z0) ? 'x' : 'z';
        const order = adjacencySortForZone(allocationOrder(bubble.rooms.slice()));
        cellsFrame.push(...combZone(polyFrame, order, faceAxis));
        return cellsFrame;
    }

    const bb = polygonBBox(polyFrame);
    const W = bb.x1 - bb.x0, H = bb.z1 - bb.z0;
    // Corridor runs along the LONGER axis; the SHORT axis is split
    // [public | corridor | private]. corridorAxis = the axis PERPENDICULAR to the strip.
    const corridorAlongX = W >= H;
    const splitAxis: 'x' | 'z' = corridorAlongX ? 'z' : 'x';   // the band-stacking axis
    const faceAxis: 'x' | 'z' = corridorAlongX ? 'x' : 'z';    // the comb-slice axis
    const lo = splitAxis === 'x' ? bb.x0 : bb.z0;
    const hi = splitAxis === 'x' ? bb.x1 : bb.z1;
    const totalArea = polyArea(polyFrame);

    // Ensuite area is hoisted onto the master (carved out after the comb).
    const ensuiteCarveArea = (master && ensuite) ? ensuite.targetAreaM2 : 0;
    const privateForComb = (master && ensuite)
        ? privateRooms.map(r => (r.id === master.id ? { ...r, targetAreaM2: r.targetAreaM2 + ensuite.targetAreaM2 } : r))
        : privateRooms;

    const publicArea = publicRooms.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0);
    const privateArea = privateForComb.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0);
    const denom = Math.max(EPS, publicArea + privateArea);

    // Corridor band fraction of the SPAN (a fixed-width strip): corridorWidthM / span.
    const span = hi - lo;
    const corridorFracOfSpan = Math.min(0.5, corridorWidthM / Math.max(EPS, span));
    const corridorArea = totalArea * corridorFracOfSpan;
    const usableArea = totalArea - corridorArea;
    // Public band depth ∝ its area share of the usable (non-corridor) area.
    const publicAreaTarget = Math.max(EPS, usableArea * (publicArea / denom));

    // Split off the PUBLIC band [lo .. cutPub], then the CORRIDOR band [cutPub .. cutCor],
    // then the PRIVATE band [cutCor .. hi].
    const cutPub = findAreaSplit(polyFrame, splitAxis, lo, hi, publicAreaTarget);
    const cutCor = findAreaSplit(polyFrame, splitAxis, cutPub, hi, publicAreaTarget + corridorArea);

    const publicBand = clipHalfPlane(polyFrame, splitAxis, cutPub, 'le');
    const corridorBand = clipSlab(polyFrame, splitAxis, cutPub, cutCor);
    const privateBand = clipHalfPlane(polyFrame, splitAxis, cutCor, 'ge');

    // Corridor IS the band.
    if (usable(corridorBand)) cellsFrame.push({ roomId: corridor.id, polygon: roundPoly(corridorBand) });

    // Public zone: comb the public rooms along the corridor-face axis.
    if (publicRooms.length > 0 && usable(publicBand)) {
        const orderedPublic = adjacencySortForZone(allocationOrder(publicRooms));
        cellsFrame.push(...combZone(publicBand, orderedPublic, faceAxis));
    }

    // Private zone: comb the private rooms (master carries the ensuite area) along the
    // corridor-face axis, then carve the ensuite out of the master cell.
    if (usable(privateBand)) {
        const orderedPrivate = adjacencySortForZone(allocationOrder(privateForComb));
        const privCells = combZone(privateBand, orderedPrivate, faceAxis);
        if (master && ensuite && ensuiteCarveArea > 0) {
            const mIdx = privCells.findIndex(c => c.roomId === master.id);
            if (mIdx >= 0) {
                const carve = carveEnsuiteFromMasterCell(privCells[mIdx]!.polygon, ensuiteCarveArea);
                if (carve) {
                    privCells[mIdx] = { roomId: master.id, polygon: carve.master };
                    privCells.push({ roomId: ensuite.id, polygon: carve.ensuite });
                }
            }
        }
        cellsFrame.push(...privCells);
    }
    return cellsFrame;
}

/**
 * §POLYGON-NATIVE-CONCAVE (Phase 4, doc §13.4 step 4 / §13.3 algorithm (a) "split at the
 * reflex vertex first") — tile a CONCAVE simple polygon (≥1 reflex vertex; L/U/T or an
 * arbitrary drawn boundary) in the principal-axis frame.
 *
 * APPROACH — split at a reflex vertex FIRST, then recurse the convex tiling into each piece:
 *   1. pick the reflex vertex whose AXIS-ALIGNED cut (the cut line through it, parallel to
 *      whichever principal axis yields two non-degenerate pieces) divides the plate most
 *      evenly — a deterministic choice (lowest reflex index breaks ties);
 *   2. cut the polygon by that half-plane into two sub-polygons (each MORE convex — the
 *      reflex notch is resolved by construction; an L splits into two rectangles, a U into
 *      three, a T into three, etc., by recursion);
 *   3. distribute the WHOLE PROGRAM across the sub-polygons AREA-PROPORTIONALLY (the L-shape
 *      fix: the program/sliders drive the WHOLE plate, not a dominant rect + bolted fill).
 *      The corridor is placed in the LARGER sub-polygon (the spine root) and the rooms are
 *      partitioned by cumulative target area so each sub-polygon gets a contiguous slice of
 *      the allocation order;
 *   4. recurse `subdivide` into each sub-polygon (still concave ⇒ split again; convex ⇒
 *      `tileConvexZones`).
 *
 * Every cut is a Sutherland–Hodgman half-plane clip ⇒ interior walls stay axis-parallel in
 * this frame; sub-polygon cells lie inside the real polygon by construction. Pure +
 * deterministic (fixed reflex order, area sort, no RNG/Date). Bounded recursion (each split
 * removes ≥1 reflex vertex; capped by `depth`).
 */
function tileConcave(
    polyFrame: readonly Pt[],
    bubble: BubbleGraph,
    corridorWidthM: number,
    depth = 0,
): { roomId: string; polygon: Pt[] }[] {
    // Recursion / degeneracy guards: fall back to the convex tiler (which clips to the
    // polyFrame bbox-aligned bands — still inside the real polygon via the comb clips).
    if (depth >= 6 || !usable(polyFrame) || bubble.rooms.length === 0) {
        return tileConvexZones(polyFrame, bubble, corridorWidthM);
    }
    const reflex = reflexVertexIndices(polyFrame);
    if (reflex.length === 0) return tileConvexZones(polyFrame, bubble, corridorWidthM);

    // Choose the reflex vertex + cut axis. For each reflex vertex try BOTH an x-cut and a
    // z-cut through it; keep the candidate whose two pieces are both usable and whose area
    // balance is most even (closest to a 50/50 split → the most "convexifying" cut). The
    // cut is a half-plane at the reflex vertex's coordinate on the chosen axis.
    let best: { axis: 'x' | 'z'; value: number; balance: number } | null = null;
    const total = polyArea(polyFrame);
    for (const idx of reflex) {
        const v = polyFrame[idx]!;
        for (const axis of ['x', 'z'] as const) {
            const value = axis === 'x' ? v.x : v.z;
            const le = clipHalfPlane(polyFrame, axis, value, 'le');
            const ge = clipHalfPlane(polyFrame, axis, value, 'ge');
            if (!usable(le) || !usable(ge)) continue;
            const aLe = polyArea(le);
            const balance = Math.abs(aLe / Math.max(EPS, total) - 0.5);
            if (best === null || balance < best.balance - EPS) best = { axis, value, balance };
        }
    }
    // No usable axis-cut at any reflex vertex (degenerate) → convex tiler fallback.
    if (best === null) return tileConvexZones(polyFrame, bubble, corridorWidthM);

    const lePoly = clipHalfPlane(polyFrame, best.axis, best.value, 'le');
    const gePoly = clipHalfPlane(polyFrame, best.axis, best.value, 'ge');
    const aLe = polyArea(lePoly), aGe = polyArea(gePoly);
    // Larger piece is the spine root (gets the corridor). Order pieces large→small so the
    // allocation order fills the dominant piece first.
    const pieces = aLe >= aGe
        ? [{ poly: lePoly, area: aLe }, { poly: gePoly, area: aGe }]
        : [{ poly: gePoly, area: aGe }, { poly: lePoly, area: aLe }];

    // Distribute the WHOLE program across the two pieces, area-proportionally. The corridor
    // (if any) goes to the FIRST (larger) piece; the remaining rooms are partitioned in
    // allocation order so each piece receives a contiguous run summing to ~its area share.
    const corridor = bubble.rooms.find(r => r.type === 'corridor');
    const nonCorridor = adjacencySortForZone(allocationOrder(
        bubble.rooms.filter(r => !corridor || r.id !== corridor.id),
    ));
    const totalTarget = nonCorridor.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0) || EPS;
    const pieceArea = pieces.map(p => p.area);
    const totalPieceArea = pieceArea.reduce((s, a) => s + a, 0) || EPS;

    // Assign rooms to piece 0 until its area-share target is met, the rest to piece 1.
    const share0 = pieceArea[0]! / totalPieceArea;
    const target0 = totalTarget * share0;
    const roomsByPiece: ProgramRoom[][] = [[], []];
    let acc = 0;
    for (const r of nonCorridor) {
        const a = Math.max(EPS, r.targetAreaM2);
        // Greedy: place in piece 0 while we are below its target (and it's the larger piece);
        // once the cumulative allocation crosses target0, the remainder goes to piece 1.
        if (acc + a / 2 <= target0) roomsByPiece[0]!.push(r);
        else roomsByPiece[1]!.push(r);
        acc += a;
    }
    // Guard: never leave a usable piece empty — if one piece got no rooms but the other got
    // ≥2, move the smallest-target room over so both pieces are tiled (no white space).
    for (let i = 0; i < 2; i++) {
        const j = 1 - i;
        if (roomsByPiece[i]!.length === 0 && roomsByPiece[j]!.length >= 2 && usable(pieces[i]!.poly)) {
            const donor = [...roomsByPiece[j]!].sort((a, b) => a.targetAreaM2 - b.targetAreaM2)[0]!;
            roomsByPiece[j] = roomsByPiece[j]!.filter(r => r.id !== donor.id);
            roomsByPiece[i]!.push(donor);
        }
    }

    const out: { roomId: string; polygon: Pt[] }[] = [];
    for (let i = 0; i < 2; i++) {
        const piece = pieces[i]!;
        if (!usable(piece.poly)) continue;
        const pieceRooms = [...roomsByPiece[i]!];
        if (corridor && i === 0) pieceRooms.unshift(corridor);   // corridor seeds the larger piece
        if (pieceRooms.length === 0) continue;
        // Build a sub-bubble carrying ONLY this piece's rooms (so the recursion's bucketing /
        // corridor logic operates on the local program). corridorId follows the corridor.
        const subBubble: BubbleGraph = {
            ...bubble,
            rooms: pieceRooms,
            corridorId: (corridor && i === 0) ? bubble.corridorId : null,
        };
        // The sub-polygon may itself still be concave (a U/T resolves over several splits);
        // recurse. A convex sub-polygon tiles directly.
        out.push(...(isConcavePolygon(piece.poly)
            ? tileConcave(piece.poly, subBubble, corridorWidthM, depth + 1)
            : tileConvexZones(piece.poly, subBubble, corridorWidthM)));
    }
    return out;
}

/** Clip a polygon to the inside of a CONVEX shell ring (exact intersection via successive
 *  half-plane clips, one per shell edge). Determines each edge's inward side from the shell's
 *  winding. Pure. Exported for §18 (spine-tree polygon-native pack). */
export function clipToConvexShell(poly: readonly Pt[], shell: readonly Pt[]): Pt[] {
    if (shell.length < 3) return poly.slice();
    // CCW shell ⇒ interior is to the LEFT of each directed edge (cross ≥ 0).
    const ccw = signedArea2(shell) >= 0;
    let cur = poly.slice();
    for (let i = 0; i < shell.length && cur.length >= 3; i++) {
        const a = shell[i]!, b = shell[(i + 1) % shell.length]!;
        const ex = b.x - a.x, ez = b.z - a.z;
        const inside = (p: Pt): boolean => {
            const cross = ex * (p.z - a.z) - ez * (p.x - a.x);   // >0 ⇒ left of a→b
            return ccw ? cross >= -EPS : cross <= EPS;
        };
        const lerp = (p: Pt, q: Pt): Pt => {
            // Intersect segment p→q with the infinite line through a→b.
            const dpx = q.x - p.x, dpz = q.z - p.z;
            const denom = ex * dpz - ez * dpx;
            if (Math.abs(denom) < EPS) return q;
            const t = (ex * (p.z - a.z) - ez * (p.x - a.x)) / -denom;
            return { x: p.x + t * dpx, z: p.z + t * dpz };
        };
        const next: Pt[] = [];
        for (let k = 0; k < cur.length; k++) {
            const c0 = cur[k]!, c1 = cur[(k + 1) % cur.length]!;
            const in0 = inside(c0), in1 = inside(c1);
            if (in0) next.push(c0);
            if (in0 !== in1) next.push(lerp(c0, c1));
        }
        cur = next;
    }
    return cur;
}

/**
 * §POLYGON-NATIVE keep-out HOLE (Phase 4, doc §13.6) — subtract an axis-aligned rect
 * `hole` (the stair keep-out) from a cell `poly`, returning the cell-minus-hole.
 *
 * AXIS-ALIGNED cell (the common case — the stair bites an axis-aligned room, e.g. a
 * habitable cell on a concave/rect plate, or an apartment): build the EXACT rectilinear
 * difference ring `cell \ hole` directly — a proper polygon HOLE (a corner bite → an L,
 * an edge bite → a U). This replaces the Phase-3 4-candidate half-plane edge-push, which
 * shaved off a WHOLE corner band and left a 5-vertex L sliver (the founder's stair-sliver
 * defect, doc §13.6). When the hole splits the cell into two disconnected pieces (a full
 * middle slab) we keep the LARGER guillotine band (the doc's "may be split into two cells";
 * the smaller half falls back to its own rect cell upstream).
 *
 * SHEARED (non-axis) cell: the proper rectilinear ring is unsound (the cell isn't its
 * bbox), so we KEEP the Phase-3 behaviour — the largest of the four half-plane bites — which
 * the sheared-parallelogram coverage gate is calibrated against (§13.5, 0.915 floor). The
 * stair-hole upgrade is therefore exact where it's safe (axis cells) and unchanged where the
 * Phase-3 band is proven (sheared cells).
 *
 * Returns the cell unchanged when the hole misses it; the empty ring (caller drops the cell)
 * when the hole consumes it. Pure + deterministic.
 */
export function subtractRectFromCell(poly: readonly Pt[], hole: { x0: number; z0: number; x1: number; z1: number }): Pt[] {
    if (poly.length < 3) return poly.slice();
    const bb = polygonBBox(poly);
    // No real overlap (hole misses the cell) → unchanged.
    const ox = Math.min(bb.x1, hole.x1) - Math.max(bb.x0, hole.x0);
    const oz = Math.min(bb.z1, hole.z1) - Math.max(bb.z0, hole.z0);
    if (ox <= EPS || oz <= EPS) return poly.slice();

    // AXIS-ALIGNED cell → exact rectilinear `cell \ hole` ring (a proper L / U notch).
    if (isAxisAlignedRect(poly, bb)) {
        const ring = rectMinusRectRing(bb, hole);
        if (ring) return ring.length >= 3 ? roundPoly(ring) : [];
        // ring === null ⇒ the hole splits the cell into two pieces (full middle slab) or
        // consumes it; fall through to the half-plane bands and keep the larger.
    }

    // SHEARED (non-axis) cell, OR an axis cell the hole splits — the Phase-3 behaviour:
    // four ways to push one cell edge to a hole boundary; keep the largest clear piece.
    const cands: Pt[][] = [
        clipHalfPlane(poly, 'x', hole.x0, 'le'),   // keep left of the hole
        clipHalfPlane(poly, 'x', hole.x1, 'ge'),   // keep right of the hole
        clipHalfPlane(poly, 'z', hole.z0, 'le'),   // keep below the hole
        clipHalfPlane(poly, 'z', hole.z1, 'ge'),   // keep above the hole
    ].filter(usable);
    if (cands.length === 0) return [];             // cell fully inside the hole — drop it
    return roundPoly(cands.reduce((best, c) => (polyArea(c) > polyArea(best) ? c : best)));
}

/** True iff `poly` is (within ε) the axis-aligned rectangle `bb` — every vertex on a bbox
 *  corner and every edge horizontal or vertical. The lifted-rect cells (and most habitable
 *  cells on an axis-aligned plate) satisfy this; sheared cells do not. */
function isAxisAlignedRect(poly: readonly Pt[], bb: { x0: number; z0: number; x1: number; z1: number }): boolean {
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        if (Math.abs(a.x - b.x) > EPS && Math.abs(a.z - b.z) > EPS) return false;   // diagonal edge
    }
    // Total area must match the bbox (no notch already) so the simple rect-minus-rect holds.
    return Math.abs(polyArea(poly) - (bb.x1 - bb.x0) * (bb.z1 - bb.z0)) < 1e-4;
}

/**
 * The CCW ring of `rect \ hole` when the hole bites a CORNER (→ L, 6 verts) or an EDGE
 * (→ U, 8 verts) of the axis-aligned rect, clamping the hole to the rect first. Returns
 * null when the hole splits the rect into two disconnected pieces (a full middle slab —
 * the caller falls back to the guillotine bands) or consumes it entirely. Pure.
 */
function rectMinusRectRing(
    rect: { x0: number; z0: number; x1: number; z1: number },
    holeRaw: { x0: number; z0: number; x1: number; z1: number },
): Pt[] | null {
    // Clamp the hole to the rect (the effective bite).
    const hx0 = Math.max(rect.x0, holeRaw.x0), hx1 = Math.min(rect.x1, holeRaw.x1);
    const hz0 = Math.max(rect.z0, holeRaw.z0), hz1 = Math.min(rect.z1, holeRaw.z1);
    if (hx1 - hx0 <= EPS || hz1 - hz0 <= EPS) return rect2poly(rect);          // no bite → full rect
    const touchL = hx0 <= rect.x0 + EPS, touchR = hx1 >= rect.x1 - EPS;
    const touchB = hz0 <= rect.z0 + EPS, touchT = hz1 >= rect.z1 - EPS;
    // Hole consumes the whole rect.
    if (touchL && touchR && touchB && touchT) return null;
    // Hole spans the full width (touchL&touchR) but not full height, or full height
    // (touchB&touchT) but not full width → it SPLITS the rect into two disjoint pieces.
    if ((touchL && touchR) || (touchB && touchT)) return null;
    // The hole touches at most two adjacent edges (a corner) or exactly one edge (an edge
    // bite). Build the rect ring and re-route it around the notch. We walk the rectangle
    // CCW from (x0,z0) and insert the notch where the bitten edge(s) are.
    const x0 = rect.x0, z0 = rect.z0, x1 = rect.x1, z1 = rect.z1;
    // Determine which single corner (if a corner bite) or which single edge the hole sits on.
    // CORNER bites — exactly two adjacent touch flags:
    if (touchL && touchB) return [ {x:hx1,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1},{x:x0,z:hz1},{x:hx1,z:hz1} ];
    if (touchR && touchB) return [ {x:x0,z:z0},{x:hx0,z:z0},{x:hx0,z:hz1},{x:x1,z:hz1},{x:x1,z:z1},{x:x0,z:z1} ];
    if (touchR && touchT) return [ {x:x0,z:z0},{x:x1,z:z0},{x:x1,z:hz0},{x:hx0,z:hz0},{x:hx0,z:z1},{x:x0,z:z1} ];
    if (touchL && touchT) return [ {x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:hx1,z:z1},{x:hx1,z:hz0},{x:x0,z:hz0} ];
    // EDGE bites (the hole sits on one edge, interior on the perpendicular) → U-notch:
    if (touchB) return [ {x:x0,z:z0},{x:hx0,z:z0},{x:hx0,z:hz1},{x:hx1,z:hz1},{x:hx1,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1} ];
    if (touchT) return [ {x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:hx1,z:z1},{x:hx1,z:hz0},{x:hx0,z:hz0},{x:hx0,z:z1},{x:x0,z:z1} ];
    if (touchL) return [ {x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1},{x:x0,z:hz1},{x:hx1,z:hz1},{x:hx1,z:hz0},{x:x0,z:hz0} ];
    if (touchR) return [ {x:x0,z:z0},{x:x1,z:z0},{x:x1,z:hz0},{x:hx0,z:hz0},{x:hx0,z:hz1},{x:x1,z:hz1},{x:x1,z:z1},{x:x0,z:z1} ];
    // Fully INTERIOR hole — a true ring-with-hole, not expressible as ONE simple ring.
    return null;
}

/** Rectangle → CCW ring. */
function rect2poly(r: { x0: number; z0: number; x1: number; z1: number }): Pt[] {
    return [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];
}

/** Cell bbox as an axis-aligned rect, for the rect-consuming gates that still read
 *  `RoomPlacement.rect` (shape / frontage / overlap validators). The wall sweep + the
 *  semantic graph read the REAL `polygon`; this is only the conservative AABB cover. */
export function cellBBoxRect(poly: readonly Pt[]): { x0: number; z0: number; x1: number; z1: number } {
    const bb = polygonBBox(poly);
    return { x0: round6(bb.x0), z0: round6(bb.z0), x1: round6(bb.x1), z1: round6(bb.z1) };
}

/** Re-export for callers that want the cell area helper without importing subdivide. */
export { cellAreaM2 };
