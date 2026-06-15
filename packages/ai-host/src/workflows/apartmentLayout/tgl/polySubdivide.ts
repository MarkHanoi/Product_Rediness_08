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
    const { corridor, master, ensuite, publicRooms, privateRooms } = bucketRooms(bubble);

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

    const cellsFrame: { roomId: string; polygon: Pt[] }[] = [];

    // No corridor, or no private rooms ⇒ no zoned carve; comb the whole plate by the
    // program order along its longer axis (still a real-polygon tiling, no overflow).
    if (!corridor || privateRooms.length === 0) {
        const bb = polygonBBox(polyFrame);
        const faceAxis: 'x' | 'z' = (bb.x1 - bb.x0) >= (bb.z1 - bb.z0) ? 'x' : 'z';
        const order = adjacencySortForZone(allocationOrder(bubble.rooms.slice()));
        cellsFrame.push(...combZone(polyFrame, order, faceAxis));
    } else {
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
    }

    // Rotate every cell BACK to the world (input) frame, CLIP to the real shell (so a
    // float-scale overshoot from the principal-axis round-trip / clip can never poke a vertex
    // past the façade — doc §13.5 "no cell crosses outside the real shell"), and round. The
    // shell is convex (the only shape this route handles), so the per-edge half-plane clip is
    // the exact polygon∩shell intersection. A cell that clips to nothing is dropped.
    const out: RoomCell[] = [];
    for (const c of cellsFrame) {
        if (!usable(c.polygon)) continue;
        let poly = angle === 0 ? c.polygon : c.polygon.map(p => rotatePt(p, angle, about));
        poly = clipToConvexShell(poly, shellPolygon);
        if (usable(poly)) out.push({ roomId: c.roomId, polygon: roundPoly(poly) });
    }
    return out;
}

/** Clip a polygon to the inside of a CONVEX shell ring (exact intersection via successive
 *  half-plane clips, one per shell edge). Determines each edge's inward side from the shell's
 *  winding. Pure. */
function clipToConvexShell(poly: readonly Pt[], shell: readonly Pt[]): Pt[] {
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
 * §POLYGON-NATIVE keep-out (Phase 3, doc §13.6) — subtract an axis-aligned rect `hole`
 * from a convex cell `poly`, returning the largest simple sub-polygon clear of the hole.
 * The hole is the stair keep-out: it stays a SUBTRACTED region (a corner/edge bite) while
 * the polygon subdivider tiles only the habitable partition (the stair itself is emitted
 * as a separate rect cell). For a convex cell a single-rect bite removes one corner band,
 * so the 4-candidate edge-push (push ONE cell edge to the hole boundary, keep the largest
 * clear piece) — the same shape `clipRoomsOutOfKeepOut` uses — yields a simple polygon.
 * Returns the clipped cell, or the original when the hole doesn't overlap. Pure.
 */
export function subtractRectFromCell(poly: readonly Pt[], hole: { x0: number; z0: number; x1: number; z1: number }): Pt[] {
    if (poly.length < 3) return poly.slice();
    const bb = polygonBBox(poly);
    // No real overlap (hole misses the cell) → unchanged.
    const ox = Math.min(bb.x1, hole.x1) - Math.max(bb.x0, hole.x0);
    const oz = Math.min(bb.z1, hole.z1) - Math.max(bb.z0, hole.z0);
    if (ox <= EPS || oz <= EPS) return poly.slice();
    // Four ways to push one cell edge to a hole boundary; keep the largest clear piece.
    const cands: Pt[][] = [
        clipHalfPlane(poly, 'x', hole.x0, 'le'),   // keep left of the hole
        clipHalfPlane(poly, 'x', hole.x1, 'ge'),   // keep right of the hole
        clipHalfPlane(poly, 'z', hole.z0, 'le'),   // keep below the hole
        clipHalfPlane(poly, 'z', hole.z1, 'ge'),   // keep above the hole
    ].filter(usable);
    if (cands.length === 0) return poly.slice();   // cell fully inside the hole — leave for drop logic
    return roundPoly(cands.reduce((best, c) => (polyArea(c) > polyArea(best) ? c : best)));
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
