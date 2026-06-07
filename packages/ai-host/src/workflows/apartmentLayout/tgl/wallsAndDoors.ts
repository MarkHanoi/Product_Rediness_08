// TGL P4 — wall + door extraction from the room partition.
//
// Turns the room footprints (P3b) into the actual building fabric:
//   • every room-rectangle edge becomes a wall segment, with collinear shared
//     boundaries DEDUPLICATED — two rooms that share a face produce ONE interior
//     wall that bounds both (never two stacked walls);
//   • a wall touching the void (only one room) is an exterior wall;
//   • bubble edges (P2) are realised as openings: `via:'door'` → one centred door
//     on the shared wall;
//   • open-plan: rooms transitively linked by `via:'open'` form a ZONE, and every
//     wall WITHIN a zone is omitted (not just directly-linked pairs) — so e.g. a
//     hall|kitchen wall doesn't survive as a stub jutting into the open
//     hall–living–kitchen–dining space (which would break room detection). A wall
//     is kept only where it separates two different zones, or a zone from the void.
//
// The extraction sweeps vertical walls (constant x) then horizontal walls
// (constant z): along each wall line the rooms on the −/+ side of every elementary
// sub-interval are resolved, equal runs merged, so each shared boundary yields
// exactly one segment. Pure + deterministic (sorted sweep, stable ids). Metres,
// plan frame { x, z }; the consumer converts to mm.

import type { BubbleGraph } from './bubbleGraph.js';
import type { Pt, Rect } from './rectDecomposition.js';
import type { RoomPlacement } from './subdivide.js';
import { doorAllowedBetween, isCirculation, maxDoorsFor, roomRule } from '../rules/programRules.js';

export interface WallSeg {
    readonly id: string;
    readonly a: Pt;
    readonly b: Pt;
    readonly thickness: number;            // metres
    /** Rooms this wall bounds: 2 ⇒ interior shared, 1 ⇒ exterior. */
    readonly boundsRoomIds: readonly string[];
}

export interface OpeningSpec {
    readonly id: string;
    readonly wallId: string;
    readonly type: 'door' | 'window';
    readonly offsetM: number;              // distance from wall start (a) to opening start
    readonly widthM: number;
    readonly heightM: number;
    readonly sillM: number;
    readonly betweenRoomIds: readonly [string, string?];
}

/** A virtual room-bounding line on an open-plan threshold (no wall, no door). */
export interface BoundarySeg {
    readonly a: Pt;
    readonly b: Pt;
    readonly betweenRoomIds: readonly [string, string];
}

export interface WallsAndDoors {
    readonly segments: readonly WallSeg[];
    readonly openings: readonly OpeningSpec[];
    /** Virtual room-splitters along intra-zone (open-plan) shared boundaries. The
     *  built scene has no wall there, but the RoomDetectionEngine consumes these
     *  exactly like wall segments and so registers each open-plan room separately. */
    readonly boundaries: readonly BoundarySeg[];
    /**
     * Reconciliation doors that violated the program rules (a forbidden room-type
     * pair or a privacy door-cap) but were placed anyway as a LAST RESORT to avoid
     * sealing a room. 0 ⇒ a fully rule-legal layout. P8 prefers candidates with
     * the fewest compromises (so the user gets a logical plan whenever one exists).
     */
    readonly compromises: number;
    /**
     * §SEALED-ROOMS (2026-05-29, single-apartment-fix-pass-spec #4) — room
     * ids that ended up with ZERO doors after every pass (bubble-requested,
     * permitted-primary, permitted-secondary, over-cap fallback). Empty ⇒
     * full coverage. The enumerate.ts legality gate already filters
     * disconnected candidates so SHIPPED layouts have an empty list, but
     * exposing the diagnostic lets the executor + scorer surface the
     * specific room when a candidate flunks. Deterministic — sorted by id.
     */
    readonly sealedRoomIds: readonly string[];
    /**
     * §CIRCULATION-REROUTE (2026-06-03, A.APT.SA.2 — corridor connectivity) —
     * private/service room ids that, after every pass (including the dedicated
     * circulation re-route pass 2c), still have NO direct door onto a
     * circulation room (hall/corridor) AND have no LEGAL circulation-adjacent
     * wall to route one onto. These rooms are reachable only by passing through
     * another (non-circulation) room — the "bedroom you can only enter through
     * the living room / another bedroom" anti-pattern.
     *
     * An ensuite reached only through its master is EXCLUDED (that is the
     * architectural rule, not a defect). When this list is non-empty the layout
     * has a genuinely land-locked room: the engine emits a LAYOUT-QUALITY
     * WARNING rather than forcing an illegal (forbidden-pair) door, and the
     * enumerate.ts legality gate prefers a candidate where the list is empty.
     * Empty ⇒ every habitable room opens onto the circulation spine.
     * Deterministic — sorted by id.
     */
    readonly unroutedToCirculationRoomIds: readonly string[];
}

export interface WallsAndDoorsOpts {
    readonly wallThicknessM?: number;      // default 0.1 m
    readonly doorWidthM?: number;          // default 0.9 m
    readonly doorHeightM?: number;         // default 2.1 m
    readonly minClearanceM?: number;       // wall left over each side; default 0.1 m
    /** §EXTEND-TO-PERIMETER (2026-05-27, live-fix for non-rectilinear shells):
     *  the original SHELL POLYGON (NOT the bounding box). If supplied, every
     *  axis-aligned exterior-bounding wall (boundsRoomIds.length === 1) whose
     *  endpoint sits STRICTLY INSIDE the polygon is extended along its axis
     *  until it hits the polygon perimeter. Closes the architect-reported gap
     *  between interior walls and a slanted exterior wall (the rectilinear
     *  decomposition emits the wall at the bounding-box edge, which sits
     *  inside the actual shell). When the wall ALREADY ends on the perimeter
     *  (rectilinear shell) the pass is a no-op. */
    readonly shellPolygon?: readonly Pt[];
}

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface Face { readonly coord: number; readonly s0: number; readonly s1: number; readonly roomId: string; readonly side: 'neg' | 'pos' }
interface Run { readonly start: number; readonly end: number; readonly neg: string | null; readonly pos: string | null }

/** Group faces by their (rounded) coordinate; returns coords ascending. */
function groupByCoord(faces: readonly Face[]): Array<{ coord: number; faces: Face[] }> {
    const map = new Map<number, Face[]>();
    for (const f of faces) {
        const c = round6(f.coord);
        (map.get(c) ?? map.set(c, []).get(c)!).push(f);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([coord, fs]) => ({ coord, faces: fs }));
}

/** Resolve the merged wall runs along one wall line (a single coord group). */
function runsForLine(faces: readonly Face[]): Run[] {
    const cuts = Array.from(new Set(faces.flatMap(f => [round6(f.s0), round6(f.s1)]))).sort((a, b) => a - b);
    const covers = (f: Face, m: number): boolean => f.s0 - EPS <= m && m <= f.s1 + EPS;
    const runs: Run[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
        const lo = cuts[i]!, hi = cuts[i + 1]!;
        const mid = (lo + hi) / 2;
        const neg = faces.find(f => f.side === 'neg' && covers(f, mid))?.roomId ?? null;
        const pos = faces.find(f => f.side === 'pos' && covers(f, mid))?.roomId ?? null;
        if (neg === null && pos === null) continue;            // gap in the wall line
        const prev = runs[runs.length - 1];
        if (prev && Math.abs(prev.end - lo) < EPS && prev.neg === neg && prev.pos === pos) {
            runs[runs.length - 1] = { ...prev, end: hi };       // merge contiguous equal run
        } else {
            runs.push({ start: lo, end: hi, neg, pos });
        }
    }
    return runs;
}

// ─── §EXTEND-TO-PERIMETER helpers (2026-05-27) ───────────────────────────────
// For non-rectilinear shell polygons, the rect-decomposition uses axis-aligned
// rectangles, so interior wall endpoints land on the BOUNDING-BOX edges — not
// the actual perimeter. Where the perimeter slants, this leaves a visible gap
// between the interior wall and the exterior wall (architect's red-arrow
// screenshot 2026-05-27).
//
// The fix is purely geometric: for each axis-aligned wall, walk along its
// AXIS direction in the OUTWARD direction (away from the wall's room) and
// find the first intersection with the shell polygon. Move the endpoint
// there. Walls already ending on the polygon perimeter (rectilinear case)
// hit at distance ≈ 0 → no-op.

const POLY_EPS = 1e-4;

/** True if `p` lies on (within POLY_EPS of) any polygon edge. */
function pointOnPolygonBoundary(p: Pt, poly: readonly Pt[]): boolean {
    if (poly.length < 2) return false;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const ex = b.x - a.x, ez = b.z - a.z;
        const L2 = ex * ex + ez * ez;
        if (L2 < 1e-20) continue;
        const wx = p.x - a.x, wz = p.z - a.z;
        const t = (wx * ex + wz * ez) / L2;
        if (t < -POLY_EPS || t > 1 + POLY_EPS) continue;
        const projx = a.x + t * ex, projz = a.z + t * ez;
        const dx = p.x - projx, dz = p.z - projz;
        if (dx * dx + dz * dz <= POLY_EPS * POLY_EPS) return true;
    }
    return false;
}

/** Standard point-in-polygon (ray-cast). True if `p` is STRICTLY inside `poly`.
 *  Points ON the polygon boundary return FALSE (so an exterior wall whose
 *  endpoint already sits on the perimeter is not "inside" — no extension). */
function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
    if (poly.length < 3) return false;
    if (pointOnPolygonBoundary(p, poly)) return false;     // on the edge ⇒ NOT inside
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        const yi = a.z, yj = b.z, xi = a.x, xj = b.x;
        const intersect = ((yi > p.z) !== (yj > p.z)) &&
            (p.x < (xj - xi) * (p.z - yi) / ((yj - yi) || 1e-30) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Cast a ray from `from` along (dx, dz) (unit) and return the t parameter to
 *  the FIRST polygon edge it crosses. Returns Infinity if no hit.
 *
 *  Solve: from + t·D = a + u·(b−a),  with t > 0 and 0 ≤ u ≤ 1.
 *  In matrix form [D | -(b−a)] · [t, u]ᵀ = a − from.
 *  det = Dx·(−ez) − (−ex)·Dz = ex·Dz − Dx·ez. */
function rayHitPolygon(from: Pt, dx: number, dz: number, poly: readonly Pt[]): number {
    let best = Number.POSITIVE_INFINITY;
    if (poly.length < 2) return best;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const det = ex * dz - dx * ez;
        if (Math.abs(det) < 1e-12) continue;                  // parallel
        const wx = a.x - from.x;
        const wz = a.z - from.z;
        // Cramer's rule on  [Dx  -ex] [t]   [wx]
        //                   [Dz  -ez] [u] = [wz]
        const t = (wx * (-ez) - wz * (-ex)) / det;
        const u = (dx * wz - dz * wx) / det;
        if (t > POLY_EPS && u >= -POLY_EPS && u <= 1 + POLY_EPS && t < best) {
            best = t;
        }
    }
    return best;
}

/** §EXTEND-CAP-2026-05-28: a wall endpoint should only need a tiny nudge to
 *  reach a slanted perimeter (≈ halfThickness for typical 0.1 m walls — say,
 *  up to 0.5 m for steeply slanted shells). If the rayHitPolygon returns
 *  much further than that, the wall is being extended THROUGH an interior
 *  void (e.g. a dropped-room strip from §HARD-MIN-SIDE-2M), and pushing it
 *  to the far perimeter would connect adjacent rooms — the apartment
 *  collapses to a single room on detection (architect screenshot
 *  2026-05-28, modal showed 8 rooms / real result showed 1).
 *  The cap PRESERVES the slanted-perimeter fix and BLOCKS the shoot-through. */
const EXTEND_CAP_M = 0.5;

/** Extend the endpoint `from` along (dx, dz) (unit) up to the first polygon
 *  perimeter hit (if any) and return the new endpoint. `from` MUST be strictly
 *  inside the polygon (or this is a no-op). Capped at EXTEND_CAP_M. */
function extendToPolygon(from: Pt, dx: number, dz: number, poly: readonly Pt[]): Pt {
    const t = rayHitPolygon(from, dx, dz, poly);
    if (!Number.isFinite(t) || t < POLY_EPS) return from;
    if (t > EXTEND_CAP_M) return from;                     // §EXTEND-CAP — leave unchanged
    return { x: from.x + dx * t, z: from.z + dz * t };
}

/** §CLAMP-OVERRUN (A.21.D11, 2026-06-05) — pull an OUTSIDE endpoint back to the
 *  shell.
 *
 *  On a SKEWED shell the axis-aligned rect decomposition (and the §RECTIFY-QUAD
 *  bounding-box rectification) emit interior partition endpoints at the BOUNDING
 *  BOX edge, which on the outward side of a slanted perimeter sits OUTSIDE the
 *  real shell polygon. The partition then renders THROUGH the façade (architect
 *  report A.21.D11). `extendToPolygon` only handles the opposite case (endpoint
 *  strictly INSIDE → push out), so an outside endpoint is left poking through.
 *
 *  This helper clamps such an endpoint back to the shell: it intersects the
 *  wall's LINE (through `from` along ±(dx,dz)) with every shell EDGE and keeps
 *  the intersection nearest to `from` that lies in the INWARD direction (toward
 *  the wall body, i.e. toward `toward`). The endpoint is set exactly there, plus
 *  a tiny outward epsilon so the partition still meets the inner face cleanly
 *  (no visible gap). If no forward edge intersection exists (degenerate — the
 *  wall's line misses the shell), the endpoint is left UNCHANGED rather than
 *  over-corrected.
 *
 *  Pure; metres; runs in the SAME frame as `extendWallsToShell` (principal-axis-
 *  rotated when the shell is skewed — `enumerate.ts`/`runDeterministicLayout.ts`
 *  pass the rotated `shellPolygon` and rotated placements). (dx,dz) is the unit
 *  wall axis; `toward` is the OTHER endpoint (the inward reference). */
function clampOutsideEndpointToShell(
    from: Pt, dx: number, dz: number, toward: Pt, poly: readonly Pt[],
): Pt {
    if (poly.length < 3) return from;
    // Inward sign: +1 if moving along +(dx,dz) heads toward the wall body.
    const inwardDot = (toward.x - from.x) * dx + (toward.z - from.z) * dz;
    const sign = inwardDot >= 0 ? 1 : -1;
    const idx = dx * sign, idz = dz * sign;                // inward unit direction

    // Nearest forward (inward) intersection of the wall LINE with a shell edge.
    let bestT = Number.POSITIVE_INFINITY;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const ex = b.x - a.x, ez = b.z - a.z;
        const det = ex * idz - idx * ez;
        if (Math.abs(det) < 1e-12) continue;               // wall line ∥ edge
        const wx = a.x - from.x, wz = a.z - from.z;
        // [idx -ex][t]   [wx]
        // [idz -ez][u] = [wz]
        const t = (wx * (-ez) - wz * (-ex)) / det;         // along the wall line (inward)
        const u = (idx * wz - idz * wx) / det;             // along the shell edge
        if (t > POLY_EPS && u >= -POLY_EPS && u <= 1 + POLY_EPS && t < bestT) bestT = t;
    }
    if (!Number.isFinite(bestT)) return from;              // line misses the shell — leave as-is
    // Tiny outward epsilon (move just shy of the inner face so the partition
    // overlaps the shell wall, leaving no visible gap) — but never past `from`.
    const tClamp = Math.max(0, bestT - POLY_EPS);
    return { x: from.x + idx * tClamp, z: from.z + idz * tClamp };
}

/** For EVERY axis-aligned wall whose endpoint is strictly INSIDE the
 *  shell polygon, extend that endpoint along the wall's axis (outward) to
 *  the polygon perimeter. Capped at EXTEND_CAP_M (0.5 m) so the extension
 *  cannot shoot through interior junctions (which are typically several
 *  metres from the perimeter).
 *
 *  §EXTEND-INTERIOR (2026-05-29): originally restricted to walls bounding
 *  ONE room (the exterior-facing partition), this also caught the architect-
 *  reported gap on slanted shells. But interior partitions whose endpoint
 *  lands a few cm inside the polygon (where the rectilinear bbox meets the
 *  slanted perimeter) suffered the same gap. The EXTEND_CAP keeps the change
 *  safe for shared walls — endpoints at deep interior junctions (≥ 0.5 m
 *  from any perimeter edge) are left unchanged.
 *
 *  §CLAMP-OVERRUN (A.21.D11, 2026-06-05): the inverse case — an endpoint that
 *  lands OUTSIDE the (slanted) shell, where the axis-aligned bbox / §RECTIFY-
 *  QUAD rectification poked the partition past the real perimeter → it renders
 *  THROUGH the façade. Such an endpoint is pulled BACK along the wall axis to
 *  the nearest shell-edge intersection (no cap — overrun must always be
 *  removed). If the wall's line misses the shell entirely the endpoint is left
 *  unchanged. Rectilinear shells have every endpoint ON the perimeter, so
 *  NEITHER branch fires → bit-identical no-op.
 *
 *  Returns a NEW segments array (immutable swap). */
function extendWallsToShell(
    segments: readonly WallSeg[],
    poly: readonly Pt[],
): WallSeg[] {
    if (poly.length < 3) return [...segments];
    const out: WallSeg[] = [];
    for (const s of segments) {
        const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z;
        const L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L;

        // For axis-aligned walls only — the engine emits axis-aligned segments
        // so this is always true; the guard keeps the helper robust if that
        // ever changes.
        const isV = Math.abs(ux) < POLY_EPS;
        const isH = Math.abs(uz) < POLY_EPS;
        if (!isV && !isH) { out.push(s); continue; }

        let newA = s.a, newB = s.b;
        // For each endpoint, extend OUTWARD along the wall axis if it's
        // strictly inside the polygon. The EXTEND_CAP_M short-circuit inside
        // extendToPolygon protects against pushing past interior junctions.
        // §CLAMP-OVERRUN (A.21.D11): if the endpoint is instead OUTSIDE the
        // shell (the bbox/rectified decomposition put it past a slanted
        // perimeter → renders through the façade), pull it back ALONG the wall
        // axis to the nearest shell edge. On a rectilinear shell every endpoint
        // is ON the perimeter (neither inside nor outside) → both branches skip
        // → bit-identical no-op (no regression).
        if (pointInPolygon(s.a, poly)) {
            // Outward from a = AWAY from b = direction −u.
            newA = extendToPolygon(s.a, -ux, -uz, poly);
        } else if (!pointOnPolygonBoundary(s.a, poly)) {
            // a is strictly OUTSIDE — clamp back toward b (the wall body).
            newA = clampOutsideEndpointToShell(s.a, ux, uz, s.b, poly);
        }
        if (pointInPolygon(s.b, poly)) {
            // Outward from b = AWAY from a = direction +u.
            newB = extendToPolygon(s.b, +ux, +uz, poly);
        } else if (!pointOnPolygonBoundary(s.b, poly)) {
            // b is strictly OUTSIDE — clamp back toward a (the wall body).
            newB = clampOutsideEndpointToShell(s.b, ux, uz, s.a, poly);
        }
        out.push({ ...s, a: newA, b: newB });
    }
    return out;
}

// ─── §JUNCTION-REPAIR (A.21.D14, 2026-06-07) ─────────────────────────────────
//
// The editor's RoomDetectionEngine closes a room only when the walls around it
// form a CLOSED LOOP in its planar wall graph. That graph quantises every wall
// endpoint to a 20 mm node grid (`NODE_GRID_MM` in WallIntersectionResolver):
// two endpoints that SHOULD meet at a junction collapse to the same graph node
// only if they round to the same 20 mm cell. The detection engine has snap
// pre-passes, but it is far more robust to emit geometry whose junctions are
// EXACT to begin with — then every enclosed area closes deterministically.
//
// Two upstream sources introduce sub-grid endpoint drift AFTER the run-sweep
// produced perfectly-shared endpoints:
//   • `extendWallsToShell` (§EXTEND-TO-PERIMETER / §EXTEND-INTERIOR / §CLAMP-
//     OVERRUN) moves a partition endpoint along its axis to a floating-point
//     ray/edge intersection on a slanted shell — landing a few mm off the
//     perpendicular wall's endpoint it used to share.
//   • `snapAxisLines` (subdivide) snaps rect EDGES to a cluster mean per axis,
//     but a wall endpoint pair straddling the 20 mm grid (e.g. 19 mm vs 21 mm,
//     only 2 mm apart) still lands in two different detection nodes.
//
// This pass is a deterministic VALIDATE-AND-REPAIR over the final segment set:
//   1. DROP degenerate / zero-length segments (a clamp can collapse a stub to
//      ~0 m — it renders as a phantom and pollutes the graph).
//   2. SNAP coincident endpoints to EXACTLY equal coordinates: union-find
//      clusters all endpoints within `JUNCTION_WELD_TOL_M`, then sets every
//      member of a cluster to the cluster's mean. After this, walls meeting at
//      a junction share byte-identical endpoints → identical detection nodes →
//      the loop closes.
//   3. SNAP every coordinate to a fine `JUNCTION_GRID_M` grid so the welded
//      coordinates are stable and reproducible (no float dust), well below the
//      detection grid so a weld never straddles a 20 mm cell boundary.
//
// Pure, deterministic (sorted union-find over rounded coords), metres. On a
// clean rectilinear layout (no shellPolygon → no extend pass, endpoints already
// exactly shared) the weld is a no-op (every cluster is a single coincident
// group whose mean equals its members) → bit-identical output, no regression.

/** Endpoints within this distance (m) are the SAME junction and welded to one
 *  point. 10 mm: larger than float dust + the few-mm drift `extendWallsToShell`
 *  introduces, but FAR below any real room dimension so distinct junctions are
 *  never fused (the nearest distinct interior corners are ≥ a wall thickness,
 *  typically ≥ 100 mm, apart). Half the 20 mm detection node grid, so a welded
 *  cluster always lands inside ONE detection cell. */
const JUNCTION_WELD_TOL_M = 0.01;

/** Final coordinate grid (m). 1 mm — fine enough to be visually exact, coarse
 *  enough to kill float dust so repeated runs are bit-identical. */
const JUNCTION_GRID_M = 0.001;

const snapToGrid = (n: number): number => Math.round(n / JUNCTION_GRID_M) * JUNCTION_GRID_M;

/** A.21.D34(h) — minimum POST-WELD wall length (m). A wall shorter than this is
 *  degenerate by the EDITOR's own standard (`DEFAULT_MIN_WALL_LENGTH` in
 *  geometry-wall's WallJoinResolver === 0.05 m): the resolver clusters endpoints
 *  within a 0.5 m snap radius, so on a SKEWED plate a partition the clamp
 *  (`clampOutsideEndpointToShell`) has shortened to a few cm has BOTH endpoints fall
 *  into ONE junction cluster → §SELF-CLUSTER-GUARD flags it §WJR-INVALID and the mesh
 *  builder skips it → a MISSING wall + a room that fails to close. The 10 mm
 *  JUNCTION_WELD_TOL_M drop above is too small to catch these near-zero stubs. We drop
 *  them HERE, at the ai-host emission stage, so no degenerate wall ever reaches the
 *  resolver and no wall goes silently missing. Equals the editor's degeneracy floor so
 *  a wall we KEEP is one the editor can validly join. Real partitions are always
 *  ≥ a wall thickness (~0.1 m) → never dropped; axis-aligned room edges are metres
 *  long → this is a no-op on the apartment + rectilinear paths (no regression). */
const WJR_SAFE_MIN_LEN_M = 0.05;

/**
 * §JUNCTION-REPAIR — drop degenerate segments + weld coincident endpoints so the
 * emitted wall set is a clean, junction-exact graph the RoomDetectionEngine can
 * close every enclosed area from. See the block comment above for the why.
 *
 * Returns a NEW segments array. Door `wallId`s reference segment `id`s, which are
 * PRESERVED (we only move endpoints / drop zero-length walls); a door whose host
 * wall was degenerate-dropped is reconciled by the caller (the build step skips a
 * door whose wall is gone — same path as an unrealised door).
 */
function repairSegments(segments: readonly WallSeg[]): WallSeg[] {
    // 1. Drop degenerate / zero-length segments (a clamp can collapse a stub).
    const live = segments.filter(s => Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) >= JUNCTION_WELD_TOL_M - EPS);
    if (live.length === 0) return [];

    // 2. Union-find weld of coincident endpoints. Each endpoint is a node; join
    //    any two (from DIFFERENT walls — never collapse a wall onto itself) that
    //    are within the weld tolerance. Deterministic: iterate in array order.
    type Side = 'a' | 'b';
    interface Ep { readonly segIdx: number; readonly side: Side; x: number; z: number }
    const eps: Ep[] = [];
    for (let i = 0; i < live.length; i++) {
        eps.push({ segIdx: i, side: 'a', x: live[i]!.a.x, z: live[i]!.a.z });
        eps.push({ segIdx: i, side: 'b', x: live[i]!.b.x, z: live[i]!.b.z });
    }
    const n = eps.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    const union = (i: number, j: number): void => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; };
    const tolSq = JUNCTION_WELD_TOL_M * JUNCTION_WELD_TOL_M;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (eps[i]!.segIdx === eps[j]!.segIdx) continue;       // never weld a wall to itself
            const dx = eps[i]!.x - eps[j]!.x, dz = eps[i]!.z - eps[j]!.z;
            if (dx * dx + dz * dz <= tolSq) union(i, j);
        }
    }

    // Cluster → mean position → grid-snapped weld point (one per cluster).
    const clusters = new Map<number, number[]>();
    for (let i = 0; i < n; i++) (clusters.get(find(i)) ?? clusters.set(find(i), []).get(find(i))!).push(i);
    const weld = new Array<{ x: number; z: number }>(n);
    for (const members of clusters.values()) {
        let sx = 0, sz = 0;
        for (const m of members) { sx += eps[m]!.x; sz += eps[m]!.z; }
        const px = snapToGrid(sx / members.length), pz = snapToGrid(sz / members.length);
        for (const m of members) weld[m] = { x: px, z: pz };
    }

    // 3. Rebuild segments with welded endpoints; drop any that the weld
    //    collapsed to zero length (two endpoints welded to the same point) OR that the
    //    clamp/weld left below the editor's degeneracy floor (A.21.D34(h)) — such a
    //    near-zero stub self-clusters in WallJoinResolver and goes silently missing.
    const out: WallSeg[] = [];
    for (let i = 0; i < live.length; i++) {
        const a = weld[i * 2]!;            // 'a' endpoint of seg i
        const b = weld[i * 2 + 1]!;        // 'b' endpoint of seg i
        if (Math.abs(a.x - b.x) < EPS && Math.abs(a.z - b.z) < EPS) continue;   // collapsed → drop
        // A.21.D34(h) — drop near-zero stubs the resolver would self-cluster + skip.
        if (Math.hypot(b.x - a.x, b.z - a.z) < WJR_SAFE_MIN_LEN_M) continue;
        out.push({ ...live[i]!, a: { x: round6(a.x), z: round6(a.z) }, b: { x: round6(b.x), z: round6(b.z) } });
    }
    return out;
}

export { repairSegments as __repairSegmentsForTest, JUNCTION_WELD_TOL_M as __JUNCTION_WELD_TOL_M, WJR_SAFE_MIN_LEN_M as __WJR_SAFE_MIN_LEN_M };

/**
 * Extract walls + doors from the room footprints. Door/open edges of `graph` that
 * have no realised shared wall (rooms not actually adjacent in this placement) are
 * skipped — best-effort, never throws (placement quality is a P3 concern).
 */
/**
 * L3-γ-3 (2026-05-31) — EdgeType-aware door widths.
 *
 * The bubble graph's adjacency edges carry an optional semantic `kind`
 * (populated by L3-γ-2's `classifyEdge`) — SOCIAL_FLOW, INTIMATE_ACCESS,
 * BUFFER, SERVICE_ACCESS, CEREMONIAL_THRESHOLD, etc. Until this slice the
 * door pipeline emitted every door at the same width (0.9 m default);
 * now the width tracks the architectural role:
 *
 *   • SOCIAL_FLOW (public↔public, living↔kitchen):
 *       PASSAGE door, 1.10 m — encourages flow between social spaces.
 *   • CEREMONIAL_THRESHOLD (hall↔anything):
 *       ARRIVAL door, 1.00 m — the front-of-house first impression.
 *   • BUFFER (corridor↔private):
 *       STANDARD residential door, 0.90 m (default).
 *   • SERVICE_ACCESS (wet/service):
 *       STANDARD 0.90 m — same width; the privacy comes from T1.D's
 *       per-pair finish (wt-upvc-casement) not the width.
 *   • INTIMATE_ACCESS (master↔ensuite):
 *       NARROWER 0.80 m — privacy reading; tighter than a corridor door.
 *   • VISUAL_CONNECTION (open thresholds):
 *       Not a door — handled by the open-zone path, not addDoor().
 *
 * Falls back to the global default when the edge has no `kind` (AI-path
 * back-compat). Caller can override via `opts.doorWidthM` — when set,
 * that width is used uniformly (back-compat for tests).
 */
const DOOR_WIDTH_BY_KIND = {
    SOCIAL_FLOW:          1.10,
    CEREMONIAL_THRESHOLD: 1.00,
    BUFFER:               0.90,
    SERVICE_ACCESS:       0.90,
    INTIMATE_ACCESS:      0.80,
    // VISUAL_CONNECTION / ACOUSTIC_SEPARATION never reach addDoor() —
    // VISUAL is open-zone; ACOUSTIC is a validator promotion, not a door.
} as const;

export function buildWallsAndDoors(
    placements: readonly RoomPlacement[],
    graph: BubbleGraph,
    opts: WallsAndDoorsOpts = {},
): WallsAndDoors {
    const thickness = opts.wallThicknessM ?? 0.1;
    const defaultDoorW = opts.doorWidthM ?? 0.9;
    const userOverroad = opts.doorWidthM !== undefined;     // explicit override blocks per-kind widths
    const doorH = opts.doorHeightM ?? 2.1;
    const clear = opts.minClearanceM ?? 0.1;

    // L3-γ-3 — build a per-pair lookup of the edge's semantic kind so addDoor
    // can size the door by EdgeType. Unordered pair key matches bubbleGraph's.
    const edgeKindByPair = new Map<string, keyof typeof DOOR_WIDTH_BY_KIND | undefined>();
    for (const e of graph.edges) {
        const key = pairKey(e.a, e.b);
        const k = e.kind;
        if (k && (k in DOOR_WIDTH_BY_KIND)) {
            edgeKindByPair.set(key, k as keyof typeof DOOR_WIDTH_BY_KIND);
        }
    }
    const doorWForPair = (a: string, b: string): number => {
        if (userOverroad) return defaultDoorW;
        const k = edgeKindByPair.get(pairKey(a, b));
        return k ? DOOR_WIDTH_BY_KIND[k] : defaultDoorW;
    };

    // Faces: a vertical face at x with the room on the +x ('pos') / −x ('neg') side;
    // a horizontal face at z with the room above ('pos') / below ('neg').
    const vFaces: Face[] = [];
    const hFaces: Face[] = [];
    for (const { roomId, rect } of placements) {
        const r: Rect = rect;
        vFaces.push({ coord: r.x0, s0: r.z0, s1: r.z1, roomId, side: 'pos' });   // left face
        vFaces.push({ coord: r.x1, s0: r.z0, s1: r.z1, roomId, side: 'neg' });   // right face
        hFaces.push({ coord: r.z0, s0: r.x0, s1: r.x1, roomId, side: 'pos' });   // bottom face
        hFaces.push({ coord: r.z1, s0: r.x0, s1: r.x1, roomId, side: 'neg' });   // top face
    }

    // Open-plan ZONES: rooms connected (transitively) by 'open' thresholds form one
    // open space. A wall between any two rooms in the SAME zone is omitted — not just
    // directly-linked pairs. (Otherwise e.g. a hall|kitchen wall survives as a stub
    // jutting into the open hall–living–kitchen–dining space, which breaks room
    // detection.) Union-find over the 'open' edges gives the zones.
    const zoneRoot = new Map<string, string>();
    const find = (x: string): string => {
        let r = x;
        while ((zoneRoot.get(r) ?? r) !== r) r = zoneRoot.get(r)!;
        while ((zoneRoot.get(x) ?? x) !== r) { const n = zoneRoot.get(x)!; zoneRoot.set(x, r); x = n; }
        return r;
    };
    const union = (a: string, b: string): void => { zoneRoot.set(find(a), find(b)); };
    for (const r of graph.rooms) zoneRoot.set(r.id, r.id);
    for (const e of graph.edges) if (e.via === 'open') union(e.a, e.b);
    const sameZone = (a: string, b: string): boolean => find(a) === find(b);

    const segments: WallSeg[] = [];
    const boundaries: BoundarySeg[] = [];
    const sharedWallByPair = new Map<string, WallSeg>();
    let wid = 0;

    const emit = (axis: 'v' | 'h', coord: number, run: Run): void => {
        const ids = [run.neg, run.pos].filter((x): x is string => x !== null);
        const bounds = ids.length === 2 ? [...ids].sort() : ids;
        const a: Pt = axis === 'v' ? { x: coord, z: run.start } : { x: run.start, z: coord };
        const b: Pt = axis === 'v' ? { x: coord, z: run.end } : { x: run.end, z: coord };
        if (bounds.length === 2 && sameZone(bounds[0]!, bounds[1]!)) {
            // Intra-zone (open-plan) shared boundary: no wall, no door — but emit a
            // virtual RoomBoundingLine so the editor's RoomDetectionEngine still
            // separates the two open-plan spaces (the user's "room boundary" device,
            // matching how kitchen↔living is already split today). Without this they
            // collapse into one merged room on detection.
            boundaries.push({ a, b, betweenRoomIds: [bounds[0]!, bounds[1]!] });
            return;
        }
        const seg: WallSeg = { id: `w${wid++}`, a, b, thickness, boundsRoomIds: bounds };
        segments.push(seg);
        if (bounds.length === 2) sharedWallByPair.set(pairKey(bounds[0]!, bounds[1]!), seg);
    };

    for (const { coord, faces } of groupByCoord(vFaces)) for (const run of runsForLine(faces)) emit('v', coord, run);
    for (const { coord, faces } of groupByCoord(hFaces)) for (const run of runsForLine(faces)) emit('h', coord, run);

    // ── Doors ────────────────────────────────────────────────────────────────────
    // A door needs a real shared wall + must fit; one door per wall. The pipeline:
    //   (1) place the doors the bubble graph asks for (intended adjacencies);
    //   (2a) RECONCILE over PERMITTED pairs only — Kruskal over shared walls where
    //        `doorAllowedBetween` holds AND neither room is over its privacy cap,
    //        circulation first — so every room reachable from the entry through
    //        ARCHITECTURALLY LEGAL doors (no bedroom-through-bedroom, no bathroom
    //        off a kitchen, no en-suite off a corridor);
    //   (2b) LAST RESORT — if a room is still sealed, connect it across ANY shared
    //        wall (ignoring permission/caps) so it is never door-less, counting each
    //        such door as a `compromise` (P8 then prefers candidates with zero).
    const openings: OpeningSpec[] = [];
    const wallHasDoor = new Set<string>();
    const doorCount = new Map<string, number>(graph.rooms.map(r => [r.id, 0]));
    const typeOf = new Map(graph.rooms.map(r => [r.id, r.type]));
    let oid = 0;
    let compromises = 0;

    // §DOOR-CLEAR-OFFSET (2026-05-28): a door's footprint along its host wall must
    // NOT contain a perpendicular wall's endpoint — otherwise that perpendicular
    // wall visibly slices the door cavity (architect's main-entrance screenshot:
    // an interior partition meeting the perimeter exactly at the front-door
    // centre). The default has always been "centre the door"; we now search for
    // the offset CLOSEST to centre that keeps the doorway clear of every other
    // wall endpoint that projects onto the host wall.
    const findClearOffset = (host: WallSeg, width: number): number => {
        const dxh = host.b.x - host.a.x, dzh = host.b.z - host.a.z;
        const len = Math.hypot(dxh, dzh);
        const ux = dxh / len, uz = dzh / len;
        const centred = (len - width) / 2;
        const minOff = clear, maxOff = len - width - clear;
        if (maxOff < minOff - EPS) return centred;          // wall too short to slide; centre

        // Collect host-line crossings from OTHER segments. We project each
        // endpoint of every other segment onto the host wall's parametric axis;
        // if the perpendicular distance is ~0 AND the projection lies inside
        // [0, len], it's a crossing point.
        const crossings: number[] = [];
        for (const s of segments) {
            if (s.id === host.id) continue;
            for (const p of [s.a, s.b]) {
                const wx = p.x - host.a.x, wz = p.z - host.a.z;
                const t = wx * ux + wz * uz;                // along-host parameter
                if (t < -EPS || t > len + EPS) continue;
                const perpX = wx - t * ux, perpZ = wz - t * uz;
                if (Math.hypot(perpX, perpZ) > 1e-3) continue;
                crossings.push(t);
            }
        }
        if (crossings.length === 0) return centred;

        // A blocked zone for an endpoint at parameter `t` is [t - width, t]:
        // any door offset inside that zone has the endpoint inside [off, off+width].
        const blocked = (off: number): boolean =>
            crossings.some(t => off > t - width - EPS && off < t + EPS);
        if (!blocked(centred)) return centred;

        // Candidate offsets: just outside each blocked zone, plus the two wall
        // ends. Pick the one closest to the centred default that is feasible.
        const candidates: number[] = [minOff, maxOff];
        for (const t of crossings) {
            candidates.push(t + EPS);            // door starts just after the endpoint
            candidates.push(t - width - EPS);    // door ends just before the endpoint
        }
        let best = centred, bestD = Infinity, found = false;
        for (const c of candidates) {
            if (c < minOff - EPS || c > maxOff + EPS) continue;
            const off = Math.min(Math.max(c, minOff), maxOff);
            if (blocked(off)) continue;
            const d = Math.abs(off - centred);
            if (d < bestD) { best = off; bestD = d; found = true; }
        }
        return found ? best : centred;
    };

    const addDoor = (wall: WallSeg, a: string, b: string): boolean => {
        if (wallHasDoor.has(wall.id)) return false;
        const len = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
        // L3-γ-3 — per-pair EdgeType-aware width. Falls back to the global
        // default when the edge has no `kind` OR the caller explicitly
        // overrode via opts.doorWidthM.
        const preferredW = doorWForPair(a, b);
        const width = Math.min(preferredW, len - 2 * clear);
        if (width < 0.6 - EPS) return false;                    // wall too short for a usable door
        const offset = findClearOffset(wall, width);
        openings.push({
            id: `o${oid++}`, wallId: wall.id, type: 'door',
            offsetM: round6(offset), widthM: round6(width), heightM: doorH, sillM: 0,
            betweenRoomIds: [a, b],
        });
        wallHasDoor.add(wall.id);
        doorCount.set(a, (doorCount.get(a) ?? 0) + 1);
        doorCount.set(b, (doorCount.get(b) ?? 0) + 1);
        return true;
    };
    const underCap = (id: string): boolean => (doorCount.get(id) ?? 0) < maxDoorsFor(typeOf.get(id) ?? '');
    const permitted = (a: string, b: string): boolean =>
        doorAllowedBetween(typeOf.get(a) ?? '', typeOf.get(b) ?? '');

    // Connectivity DSU (rooms connected via open thresholds + placed doors).
    const cRoot = new Map<string, string>(graph.rooms.map(r => [r.id, r.id]));
    const cFind = (x: string): string => { while (cRoot.get(x)! !== x) { cRoot.set(x, cRoot.get(cRoot.get(x)!)!); x = cRoot.get(x)!; } return x; };
    const cUnion = (a: string, b: string): void => { const ra = cFind(a), rb = cFind(b); if (ra !== rb) cRoot.set(ra, rb); };
    for (const e of graph.edges) if (e.via === 'open') cUnion(e.a, e.b);

    // (1) bubble-requested doors, where realised. These are the INTENDED adjacencies
    // (corridor→bedroom, master↔ensuite, corridor→bathroom). The production bubble
    // graph emits only rule-legal door edges, but §D5.d (A.21.D5.d) hardens this
    // pass against ANY graph source (AI-path, future bubble changes, hand-authored
    // tests) that asks for a FORBIDDEN pair — e.g. bedroom↔bedroom, bathroom↔living.
    // Such an edge is SKIPPED here so the room falls through to the permitted-only
    // reconciliation (2a/2b) + circulation re-route (2c), which always route it onto
    // a legal access space (the corridor) instead of realising the illegal door.
    // This is THE founder-reported defect: "a bedroom connected directly and only to
    // another bedroom is not acceptable." A forbidden bubble door is never a door.
    for (const e of graph.edges) {
        if (e.via !== 'door') continue;
        if (!permitted(e.a, e.b)) continue;                 // §D5.d — never realise a forbidden pair
        const wall = sharedWallByPair.get(pairKey(e.a, e.b));
        if (wall && addDoor(wall, e.a, e.b)) cUnion(e.a, e.b);
    }

    // Shared-wall candidates, ranked: circulation-touching first, then longer walls,
    // then stable id (deterministic).
    const shared = segments
        .filter(s => s.boundsRoomIds.length === 2)
        .map(s => {
            const [a, b] = s.boundsRoomIds as readonly [string, string];
            const touchesCirc = isCirculation(typeOf.get(a) ?? '') || isCirculation(typeOf.get(b) ?? '') ? 1 : 0;
            return { seg: s, a, b, pref: touchesCirc, len: Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) };
        })
        .sort((p, q) => q.pref - p.pref || q.len - p.len || (p.seg.id < q.seg.id ? -1 : 1));

    // (2a) reconcile over PERMITTED, under-cap pairs only. TWO PASSES so a private
    // room's PRIMARY door always lands on circulation/public — never on a bathroom
    // (the user's bug: "bedrooms connect with bathrooms only"). With a single pass
    // a bedroom adjacent to both a corridor and a bathroom could spend its
    // maxDoors=1 budget on the bathroom and never connect to circulation.
    //
    // pass-i: only doors where a 'private' room reaches a 'circulation' / 'public'
    //         neighbour (the primary-access rule).
    // pass-ii: any remaining permitted pair (ensuite ↔ master, bathroom ↔ bedroom
    //         as a SECONDARY access once both have circulation).
    const isCircOrPublic = (t: string): boolean => {
        const p = roomRule(t).privacy;
        return p === 'circulation' || p === 'public';
    };
    const isPrimaryAccessPair = (a: string, b: string): boolean => {
        const ta = typeOf.get(a) ?? '', tb = typeOf.get(b) ?? '';
        const pa = roomRule(ta).privacy, pb = roomRule(tb).privacy;
        // A door is "primary access" when it connects a private/service room to
        // a circulation/public room. We also accept circulation↔circulation /
        // circulation↔public in this pass (those are uncapped public connectivity).
        if (pa === 'private' || pa === 'service') return isCircOrPublic(tb);
        if (pb === 'private' || pb === 'service') return isCircOrPublic(ta);
        return isCircOrPublic(ta) && isCircOrPublic(tb);
    };
    for (const c of shared) {
        if (cFind(c.a) === cFind(c.b)) continue;
        if (!permitted(c.a, c.b)) continue;
        if (!underCap(c.a) || !underCap(c.b)) continue;
        if (!isPrimaryAccessPair(c.a, c.b)) continue;       // pass-i: primary access only
        if (addDoor(c.seg, c.a, c.b)) cUnion(c.a, c.b);
    }
    for (const c of shared) {
        if (cFind(c.a) === cFind(c.b)) continue;
        if (!permitted(c.a, c.b)) continue;
        if (!underCap(c.a) || !underCap(c.b)) continue;
        if (addDoor(c.seg, c.a, c.b)) cUnion(c.a, c.b);     // pass-ii: any remaining permitted
    }

    // (2b) last resort — over-cap fallback. We RELAX the per-room maxDoors cap to
    // reconnect a still-sealed room, but we NEVER cross a forbidden pair (the user's
    // explicit rule: "there is a bedroom connected directly and only to another
    // bedroom — this is not acceptable"). A room that has no permitted neighbour at
    // all stays sealed; enumerate's legality gate then chooses a different strategy.
    for (const c of shared) {
        if (cFind(c.a) === cFind(c.b)) continue;
        if (!permitted(c.a, c.b)) continue;                   // HARD reject forbidden pairs
        if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); compromises++; }
    }

    // (2c) §CIRCULATION-REROUTE (2026-06-03, A.APT.SA.2 — corridor connectivity).
    //
    // Passes (1)–(2b) guarantee every room is CONNECTED (reachable from the
    // entry through legal doors) — but "connected" is not "opens onto the
    // circulation spine". A bedroom whose only door is into the LIVING room is
    // connected + a permitted pair (compromises === 0), yet it is the
    // architectural defect this task targets: a private room reachable only by
    // crossing a public/private room (the "bedroom you can only enter through
    // another room" anti-pattern).
    //
    // The architectural rule (programRules + validateCorridorConnectivity):
    // EVERY private/service room should have a DIRECT door onto a circulation
    // room (hall/corridor) — the sole exception being an ensuite, which is
    // reached through its master by design.
    //
    // This pass is CORRECTIVE + ADDITIVE — it never removes a door and never
    // crosses a forbidden pair. For each private/service room that lacks a
    // circulation door, it ADDS one on a permitted circulation-adjacent shared
    // wall (relaxing the privacy cap only as a last resort, exactly like 2b, so
    // a tight room is never left stranded behind a public room). Where no legal
    // circulation-adjacent wall exists the room is genuinely land-locked: we do
    // NOT force an illegal door (it stays as it was) and instead report it via
    // `unroutedToCirculationRoomIds` so the enumerate gate can prefer a strategy
    // that avoids the land-lock and the executor can surface a quality warning.
    //
    // `roomHasCirculationDoor` is recomputed from `openings` so it reflects
    // every door placed by passes (1)–(2b).
    const isCircType = (id: string): boolean => isCirculation(typeOf.get(id) ?? '');
    const roomHasCirculationDoor = (id: string): boolean =>
        openings.some(o => {
            if (o.type !== 'door') return false;
            const [a, b] = o.betweenRoomIds as readonly [string, string?];
            if (!b) return false;
            if (a === id) return isCircType(b);
            if (b === id) return isCircType(a);
            return false;
        });
    // A room that NEEDS a circulation door: private OR service, and NOT an
    // ensuite (the master-only exception). `isPrivate` covers bedroom / master /
    // bathroom / ensuite / wc / study; we add the 'service' privacy class too.
    const needsCirculationAccess = (id: string): boolean => {
        const t = typeOf.get(id) ?? '';
        if (t === 'ensuite') return false;                    // master-only by design
        if (isCircType(id)) return false;                     // a circulation room IS the spine
        const p = roomRule(t).privacy;
        return p === 'private' || p === 'service';
    };
    // Candidate circulation-adjacent walls for a target room, ranked: longer
    // walls first (a wider wall is more likely to host a clear door), then
    // stable id — deterministic.
    const circWallsFor = (id: string): typeof shared =>
        shared
            .filter(c => {
                const other = c.a === id ? c.b : c.b === id ? c.a : null;
                if (other === null) return false;             // wall doesn't bound this room
                return isCircType(other) && permitted(c.a, c.b);
            })
            .sort((p, q) => q.len - p.len || (p.seg.id < q.seg.id ? -1 : 1));

    // Re-route every private/service room that has no circulation door but a
    // legal circulation-adjacent wall. Process rooms in stable id order.
    const targets = graph.rooms
        .map(r => r.id)
        .filter(id => needsCirculationAccess(id) && !roomHasCirculationDoor(id))
        .sort();
    for (const id of targets) {
        const candidates = circWallsFor(id);
        if (candidates.length === 0) continue;                // land-locked — 2c-ii / diagnostic
        // First try a wall whose host (this room) AND the circulation room are
        // both under their door cap — a clean, no-compromise re-route.
        let placed = false;
        for (const c of candidates) {
            if (wallHasDoor.has(c.seg.id)) continue;
            if (!underCap(c.a) || !underCap(c.b)) continue;
            if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); placed = true; break; }
        }
        if (placed) continue;
        // Last resort — relax the privacy cap (the room's circulation access is
        // more important than the cap). This NEVER crosses a forbidden pair
        // (circWallsFor already filtered on `permitted`). Counts as a compromise
        // so P8 still prefers a candidate that didn't need it.
        for (const c of candidates) {
            if (wallHasDoor.has(c.seg.id)) continue;
            if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); compromises++; placed = true; break; }
        }
    }

    // (2c-ii) §CIRCULATION-REROUTE-TWOHOP (A.21.D14, 2026-06-06) — "try harder".
    //
    // A room still without a DIRECT circulation door at this point shares no
    // legal circulation-adjacent wall in this tiling (the corridor/hall simply
    // doesn't reach it). Before giving up to the connected-but-warned fallback,
    // route it onto circulation via ONE permitted INTERMEDIATE room that itself
    // already has a circulation door — e.g. bedroom→living where the living
    // room opens onto the hall. This turns "reachable only through a chain / via
    // a forbidden pair" into "reachable through a single permitted room that is
    // itself on the spine": a genuine improvement that never crosses a forbidden
    // pair and never invents geometry. The room remains in the strict
    // `unroutedToCirculationRoomIds` set (it has no DIRECT circulation door), but
    // it is now LEGALLY reachable; the resulting door is a (mild) compromise so
    // P8 keeps preferring a directly-routed strategy when one exists.
    //
    // `circulationServed(id)` ≡ id is a circulation room OR has a direct
    // circulation door (recomputed so it sees passes 1–2c).
    const circulationServed = (id: string): boolean =>
        isCircType(id) || roomHasCirculationDoor(id);
    // Permitted shared walls from `id` to an intermediate room M that is
    // circulation-served, ranked: longer walls first, then stable id.
    const twoHopWallsFor = (id: string): typeof shared =>
        shared
            .filter(c => {
                const other = c.a === id ? c.b : c.b === id ? c.a : null;
                if (other === null) return false;
                if (isCircType(other)) return false;          // direct case handled above
                return circulationServed(other) && permitted(c.a, c.b);
            })
            .sort((p, q) => q.len - p.len || (p.seg.id < q.seg.id ? -1 : 1));
    const stillLandLocked = graph.rooms
        .map(r => r.id)
        .filter(id => needsCirculationAccess(id) && !roomHasCirculationDoor(id))
        .sort();
    for (const id of stillLandLocked) {
        const candidates = twoHopWallsFor(id);
        if (candidates.length === 0) continue;                // truly land-locked
        let placed = false;
        for (const c of candidates) {                          // clean (under-cap) first
            if (wallHasDoor.has(c.seg.id)) continue;
            if (!underCap(c.a) || !underCap(c.b)) continue;
            if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); compromises++; placed = true; break; }
        }
        if (placed) continue;
        for (const c of candidates) {                          // cap-relaxed last resort
            if (wallHasDoor.has(c.seg.id)) continue;
            if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); compromises++; placed = true; break; }
        }
    }

    // §CIRCULATION-REROUTE diagnostic — private/service rooms STILL without a
    // DIRECT circulation door after the re-route passes: genuinely land-locked
    // (no legal circulation-adjacent wall in this placement). Reported as a
    // warning, not forced into an illegal door. The 2c-ii two-hop pass may have
    // given some of these legal connectivity via a permitted intermediate, but
    // they remain flagged here because "direct circulation door" is the
    // architectural target the gate ranks on. Deterministic — sorted by id.
    const unroutedToCirculationRoomIds = graph.rooms
        .filter(r => needsCirculationAccess(r.id) && !roomHasCirculationDoor(r.id))
        .map(r => r.id)
        .sort();

    // §EXTEND-TO-PERIMETER + §EXTEND-INTERIOR (2026-05-29) — for non-rectilinear
    // shells, walk every axis-aligned wall (exterior- AND interior-bounding)
    // and extend any endpoint strictly inside the shell polygon outward to the
    // perimeter. Capped at 0.5 m so interior junctions far from the perimeter
    // are never pushed past. Rectilinear shells: pass-through.
    const segmentsExtended = opts.shellPolygon && opts.shellPolygon.length >= 3
        ? extendWallsToShell(segments, opts.shellPolygon)
        : segments;

    // §JUNCTION-REPAIR (A.21.D14) — weld coincident endpoints to EXACTLY equal
    // coordinates + drop degenerate segments, so the editor's RoomDetectionEngine
    // (20 mm node grid) closes a loop around every enclosed area. Runs LAST so it
    // also absorbs the sub-grid drift `extendWallsToShell` introduces on slanted
    // shells. On a clean rectilinear layout it is a no-op (endpoints already
    // exactly shared) → bit-identical output, no regression.
    const segmentsOut = repairSegments(segmentsExtended);

    // §SEALED-ROOMS (2026-05-29) — diagnostic: which rooms ended up with ZERO
    // doors? `doorCount` tracks placements per room id; rooms missing from it
    // OR with count 0 are sealed. Deterministic — sorted by id.
    const sealedRoomIds = graph.rooms
        .filter(r => (doorCount.get(r.id) ?? 0) === 0)
        .map(r => r.id)
        .sort();

    return { segments: segmentsOut, openings, boundaries, compromises, sealedRoomIds, unroutedToCirculationRoomIds };
}

/** True when a door between these two room types satisfies the program rules. */
export function isLegalDoorPair(typeA: string, typeB: string): boolean {
    return doorAllowedBetween(typeA, typeB);
}
