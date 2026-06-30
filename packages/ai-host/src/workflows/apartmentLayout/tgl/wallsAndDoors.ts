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
import { cellFromRect } from './subdivide.js';
import { doorAllowedBetween, ENSUITE_HOST_EXTRA_DOORS, isCirculation, isOpenPlanEligible, maxDoorsFor, minDoorWidthBetween, roomRule } from '../rules/programRules.js';

/**
 * §DIAG diagnostic gate. All §DIAG breadcrumb logging is OFF by default (these fire
 * per-candidate in a hot tower loop). Set `globalThis.__pryzmLayoutDiag = true` in the
 * console to restore every §DIAG line. The `if` short-circuits BOTH the console call AND
 * the template-string build. P4: cast through `globalThis`, never `(window as any)`.
 */
const _layoutDiagOn = (): boolean =>
    (globalThis as unknown as { __pryzmLayoutDiag?: boolean }).__pryzmLayoutDiag === true;

export interface WallSeg {
    readonly id: string;
    readonly a: Pt;
    readonly b: Pt;
    readonly thickness: number;            // metres
    /** Rooms this wall bounds: 2 ⇒ interior shared, 1 ⇒ exterior. */
    readonly boundsRoomIds: readonly string[];
    /**
     * §FRACTURE-SEAL (2026-06-09, multi-storey room-merge cure) — explicit
     * exterior classification, set whenever the shell polygon is known (every TGL path).
     * A one-sided wall (`boundsRoomIds.length === 1`) is normally EXTERIOR, but on a
     * STAIR-CARVED plate the dominant rect's boundary that borders the EMPTY stair
     * keep-out fragment is ALSO one-sided — yet it is an INTERIOR sealing wall, not a
     * perimeter wall. semanticGraph flags `length===1 ⇒ isExternal` and the executor's
     * `skipExteriorWalls` then SKIPS it → the rooms abutting the fracture edge are left
     * open → RoomDetection floods across the gap → every room merges into one.
     *
     * When set, this overrides the `length===1` heuristic: a one-sided wall whose body
     * does NOT lie on the real shell perimeter is `false` (interior seal → BUILT), so the
     * loop closes by construction; a one-sided wall that DOES lie on the perimeter is
     * `true` — EQUAL to the legacy classification. The apartment / L-U-T / axis-aligned
     * plates are fully tiled (no empty fragment), so every one-sided wall is a genuine
     * perimeter wall → `true` for ALL of them → the CLASSIFICATION is unchanged there
     * (the field is now present, but its value matches `length===1`). Undefined only when
     * the shell polygon is unknown (the AI path never passes one) ⇒ semanticGraph falls
     * back to the legacy `length===1` heuristic.
     */
    readonly isExternal?: boolean;
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
    /**
     * §POLYGON-NATIVE (Phase 3, doc §13.4) — per-roomId REAL cell polygon override.
     * The sheared-convex-quad route (`enumerate.ts`) tiles the real quad with
     * `subdividePolygon`, producing non-rect cells; it passes them here so the wall
     * sweep matches their REAL (diagonal-perimeter, axis-parallel-interior) edges via
     * the §POLYGON-WALL-SWEEP collinear-edge matcher rather than each placement's bbox.
     * A roomId absent from the map falls back to `cellFromRect(placement)` (the lifted
     * rect). Absent entirely ⇒ every cell is a lifted rect ⇒ byte-identical to the
     * legacy axis-aligned fast path (the rect path + every test without this option). */
    readonly cellPolygonById?: ReadonlyMap<string, readonly Pt[]>;
    /**
     * §FORCE-CORRIDOR-DIRECT (founder 2026-06-18, the per-level "↔ Corridor" toggle —
     * "the user should be able to select which rooms in each level connect directly with
     * the corridor via door — the shortest path possible"). Room TYPES whose every
     * instance MUST get a DIRECT door onto the circulation spine, placed BEFORE the
     * generic reconcile so the forced room wins its corridor wall's budget. For each such
     * room the pass picks the room↔circulation shared wall with the LONGEST run, breaking
     * ties toward the wall NEAREST the room's centroid (the shortest-path door). The door
     * is placed ONLY when the pair is PERMITTED (`doorAllowedBetween`) and the host room is
     * under its door cap; a forced door that would breach a hard rule is SKIPPED and logged
     * `§DIAG-CORRIDOR-FORCE skipped`. A corridor host is preferred over a hall host. Absent
     * / empty ⇒ NO forced pass runs ⇒ byte-identical to the engine-decides baseline
     * (ADR-0061 invariant I2 — the whole pass is gated on a non-empty set). */
    readonly forceCorridorDirectRoomTypes?: readonly string[];
    /**
     * §WETROOM-PUBLIC-DOOR (founder 2026-06-18, "the ground-floor bathroom ships
     * SEALED") — on the GROUND floor of a house a wet room (bathroom) that would
     * OTHERWISE ship with ZERO doors may, as a LAST-RESORT fallback, open onto the
     * nearest reachable PUBLIC space in the founder-priority order hall → living →
     * dining. The architectural rationale (founder-authorised RULE CHANGE): a
     * downstairs bathroom is a guest/cloakroom WC reached off the entrance hall /
     * living zone; the apartment §BATH-CORRIDOR-ONLY rule (corridor-only) leaves it
     * sealed whenever the corridor doesn't reach it (or is itself sealed). This is a
     * NET-ADD ONLY relaxation: it fires ONLY for a wet room that every standard pass
     * (bubble / reconcile / circulation-reroute / multihop) left genuinely SEALED,
     * and it NEVER removes or moves an existing door. The relaxation is LOCAL to this
     * pass (the type-level `doorAllowedBetween` matrix is untouched), so the per-pass
     * `permissionViolations` diagnostic correctly counts the fallback door as a
     * deliberate, founder-authorised exception (logged §DIAG-WETROOM-PUBLIC).
     *
     * Gated: absent / false ⇒ the whole pass is skipped ⇒ byte-identical to the
     * apartment + every upper-storey baseline (ADR-0061 invariant I2). The house
     * orchestrator sets it true ONLY for the GROUND storey.
     */
    readonly groundFloorWetRoomPublicFallback?: boolean;
    /**
     * §HOUSE-STAIR-DOOR-ACCESS (founder defect B, 2026-06-24 — "the door to the stair room is
     * placed RIGHT AGAINST the flight; it must open into clear ACCESS space — the bottom run-in
     * landing — like the residential CORE §RESI-CORE-CIRCULATION"). The stair keep-out rect(s) (the
     * stair core footprint, engine emit frame). When present the §STAIR-DOOR-LANDING pass PREFERS the
     * stair↔circulation wall that lies on the stair's RUN-IN edge (the bottom-of-flight approach: the
     * SHORT edge at the low end of the keep-out's LONG axis — the flight runs +along the long axis
     * from its near corner, mirroring `computeStairWorldFootprint`), so the door opens into the clear
     * run-in landing rather than onto a tread or the side of the flight. It is a PURE DOOR-ANCHOR
     * preference: it only re-orders the candidate stair↔circulation walls (a length tie-break), never
     * moves a room / changes geometry / touches scoring (off the area-cap landmine). Absent / empty ⇒
     * the legacy longest-wall pick ⇒ byte-identical (apartment passes no keep-out, ADR-0061). */
    readonly stairKeepOutRects?: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }>;
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

// ─── §POLYGON-WALL-SWEEP (Phase 2, doc §13.4 step 2) ─────────────────────────
//
// Generalises the wall sweep to non-axis-aligned cell edges WITHOUT changing the
// current axis-aligned output. The legacy `vFaces`/`hFaces`/`groupByCoord`/
// `runsForLine` sweep above is a FAST PATH that fires whenever every cell is an
// axis-aligned box (which every PRODUCTION input is today — Phase-1 cells are all
// lifted rects). When at least one cell carries a non-axis edge (only the new unit
// tests do this in Phase 2), the GENERAL collinear-overlapping-edge matcher below
// runs instead and produces the SAME Run/wall/door semantics:
//   • two cells whose boundary edges are COLLINEAR within ε and OVERLAP along their
//     shared line → ONE interior wall bounding both rooms (`boundsRoomIds` length 2);
//   • an edge with no collinear-overlapping partner → a one-sided perimeter segment
//     (`boundsRoomIds` length 1), classified by `segmentOnPerimeter` exactly as the
//     fast path does.
// The emission goes through the SAME `emitWall` core (id minting, zone test, shell
// classification, sharedWallByPair), and the result feeds the SAME repairSegments /
// min-length floor / door pipeline — door placement keys off `boundsRoomIds` + the
// shared wall geometry, which is geometry-agnostic once the shared edge is known.

const POLY_WALL_EPS = 1e-6;

/** §POLYGON-WALL-SWEEP — true iff `poly` is (within `eps`) an axis-aligned box, and
 *  if so return the equivalent {@link Rect}. A box is exactly 4 vertices whose edges
 *  alternate horizontal / vertical with positive extent on both axes. The lifted-rect
 *  cells every production input produces (via `cellFromRect`/`rectPolygon`, vertex
 *  order `[(x0,z0),(x1,z0),(x1,z1),(x0,z1)]`) all pass → the caller takes the literal
 *  legacy fast path → byte-identical output. A sheared / rotated quad has at least one
 *  edge that is neither horizontal nor vertical → returns null → the general matcher
 *  runs. Pure; metres. */
export function isAxisAlignedBox(poly: readonly Pt[], eps = POLY_WALL_EPS): Rect | null {
    if (poly.length !== 4) return null;
    for (let i = 0; i < 4; i++) {
        const a = poly[i]!, b = poly[(i + 1) % 4]!;
        const dxAbs = Math.abs(a.x - b.x), dzAbs = Math.abs(a.z - b.z);
        // Each edge must be purely horizontal (Δx>0, Δz≈0) or purely vertical
        // (Δz>0, Δx≈0) — never diagonal, never degenerate.
        const horizontal = dzAbs <= eps && dxAbs > eps;
        const vertical = dxAbs <= eps && dzAbs > eps;
        if (!horizontal && !vertical) return null;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    if (maxX - minX <= eps || maxZ - minZ <= eps) return null;   // degenerate box
    return { x0: minX, z0: minZ, x1: maxX, z1: maxZ };
}

/** A directed boundary edge of a cell polygon (room on the LEFT in CCW order). */
interface CellEdge { readonly roomId: string; readonly a: Pt; readonly b: Pt }

/** A shared-wall emission discovered by the general matcher: the wall segment
 *  endpoints plus the room id(s) it bounds (1 = perimeter, 2 = interior). */
interface MatchedWall { readonly a: Pt; readonly b: Pt; readonly ids: string[] }

/** Signed twice-area of a polygon (shoelace); >0 ⇒ CCW in the {x→right, z→up} frame. */
function signedArea2(poly: readonly Pt[]): number {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        s += p.x * q.z - q.x * p.z;
    }
    return s;
}

/**
 * §POLYGON-WALL-SWEEP — the GENERAL collinear-overlapping-edge matcher.
 *
 * Enumerate every cell polygon's boundary edges, then find shared interior walls by
 * COLLINEAR-OVERLAPPING-EDGE matching: two edges from DIFFERENT cells that lie on the
 * same infinite line (within ε) and overlap along it → one interior wall over the
 * overlap, bounding BOTH rooms. The non-overlapping remainders of each edge (and any
 * edge with no collinear partner at all) are one-sided perimeter segments.
 *
 * For each maximal line (a cluster of collinear edges) we run a 1-D interval sweep
 * over the line parameter `t` — the direct analogue of `runsForLine`: cut points are
 * every edge endpoint's `t`; each elementary sub-interval is owned by whichever cell's
 * edge covers its midpoint on each side (the edge's room is on its interior side). A
 * sub-interval covered by two cells → interior wall (2 ids); by one → perimeter (1 id).
 * Contiguous equal runs are merged. Result emissions are deterministic (lines sorted
 * by geometry, runs in ascending t) and reuse the SAME emitWall core as the fast path.
 *
 * Pure; metres. `eps` governs collinearity + overlap; `lenFloor` drops zero/sub-ε runs
 * (the real min-length floor is applied later by `repairSegments`, exactly as the fast
 * path — this only avoids emitting degenerate cut slivers).
 */
function collinearSharedWalls(
    cells: readonly { roomId: string; polygon: readonly Pt[] }[],
    eps = POLY_WALL_EPS,
): MatchedWall[] {
    // 1. Collect every directed boundary edge with the room on its interior (LEFT) side.
    //    Normalise each polygon to CCW so the room is consistently to the edge's left;
    //    this matters only for naming, not for the geometry of the shared line.
    const edges: CellEdge[] = [];
    for (const c of cells) {
        const poly = signedArea2(c.polygon) >= 0 ? c.polygon : [...c.polygon].slice().reverse();
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
            if (Math.hypot(b.x - a.x, b.z - a.z) <= eps) continue;   // skip degenerate edge
            edges.push({ roomId: c.roomId, a, b });
        }
    }

    // 2. Cluster edges by their supporting LINE. A line is identified by a normalised
    //    direction (canonical sign) + signed perpendicular offset, both rounded so
    //    collinear-within-ε edges share a key. Deterministic (sorted keys).
    const lineKey = (e: CellEdge): { key: string; nx: number; nz: number; ox: number; oz: number } => {
        let dx = e.b.x - e.a.x, dz = e.b.z - e.a.z;
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        // Canonical direction sign so a→b and b→a map to the same line.
        if (dx < -eps || (Math.abs(dx) <= eps && dz < 0)) { dx = -dx; dz = -dz; }
        // Perpendicular distance of the line from the origin (signed).
        const off = -dz * e.a.x + dx * e.a.z;   // normal (-dz, dx) · point
        const q = (n: number): number => Math.round(n / (eps * 10)) * (eps * 10);
        const ox = e.a.x, oz = e.a.z;            // a reference point on the line (for the frame)
        return { key: `${q(dx)},${q(dz)},${q(off)}`, nx: dx, nz: dz, ox, oz };
    };

    interface LineGroup { dir: { x: number; z: number }; origin: Pt; members: CellEdge[] }
    const groups = new Map<string, LineGroup>();
    for (const e of edges) {
        const { key, nx, nz, ox, oz } = lineKey(e);
        let g = groups.get(key);
        if (!g) { g = { dir: { x: nx, z: nz }, origin: { x: ox, z: oz }, members: [] }; groups.set(key, g); }
        g.members.push(e);
    }

    const out: MatchedWall[] = [];
    const sortedKeys = [...groups.keys()].sort();
    for (const key of sortedKeys) {
        const g = groups.get(key)!;
        const { dir, origin } = g;
        // Parameter t of a point projected onto the line through `origin` along `dir`.
        const tOf = (p: Pt): number => (p.x - origin.x) * dir.x + (p.z - origin.z) * dir.z;
        const ptAt = (t: number): Pt => ({ x: round6(origin.x + dir.x * t), z: round6(origin.z + dir.z * t) });

        // Each member edge owns an interval [t0,t1] on the line and contributes its
        // room. Many cells may overlap a given sub-interval (an interior wall: 2).
        interface Span { readonly roomId: string; readonly t0: number; readonly t1: number }
        const spans: Span[] = g.members.map(e => {
            const ta = tOf(e.a), tb = tOf(e.b);
            return { roomId: e.roomId, t0: Math.min(ta, tb), t1: Math.max(ta, tb) };
        });
        const cuts = Array.from(new Set(spans.flatMap(s => [round6(s.t0), round6(s.t1)]))).sort((a, b) => a - b);
        const covers = (s: Span, m: number): boolean => s.t0 - eps <= m && m <= s.t1 + eps;

        interface PRun { start: number; end: number; ids: string[] }
        const runs: PRun[] = [];
        for (let i = 0; i + 1 < cuts.length; i++) {
            const lo = cuts[i]!, hi = cuts[i + 1]!;
            if (hi - lo <= eps) continue;
            const mid = (lo + hi) / 2;
            // Distinct rooms whose edge covers this sub-interval, sorted (stable id order).
            const ids = Array.from(new Set(spans.filter(s => covers(s, mid)).map(s => s.roomId))).sort();
            if (ids.length === 0) continue;
            const prev = runs[runs.length - 1];
            if (prev && Math.abs(prev.end - lo) < eps && prev.ids.length === ids.length && prev.ids.every((x, k) => x === ids[k])) {
                prev.end = hi;
            } else {
                runs.push({ start: lo, end: hi, ids });
            }
        }
        for (const r of runs) {
            // A boundary line can have ≥3 cells meeting (e.g. a T-junction sampled at
            // one t); only ≤2 can SHARE a single wall. >2 is geometrically impossible
            // for non-overlapping cells, but clamp defensively to the first two.
            const ids = r.ids.slice(0, 2);
            out.push({ a: ptAt(r.start), b: ptAt(r.end), ids });
        }
    }
    return out;
}

export { isAxisAlignedBox as __isAxisAlignedBoxForTest, collinearSharedWalls as __collinearSharedWallsForTest };

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

/** Perpendicular distance from `p` to the closed polygon ring (metres). */
function distPointToRing(p: Pt, poly: readonly Pt[]): number {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const ex = b.x - a.x, ez = b.z - a.z;
        const L2 = ex * ex + ez * ez;
        let t = L2 > 0 ? ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(p.x - (a.x + t * ex), p.z - (a.z + t * ez));
        if (d < best) best = d;
    }
    return best;
}

/** §FRACTURE-SEAL membership test (metres). A one-sided wall segment is a genuine
 *  PERIMETER wall (→ exterior, skipped by the executor's pre-drawn shell) iff its
 *  BODY lies on the real shell ring: the segment is sampled at three points (both
 *  ends + midpoint) and ALL must be within `tol` of the ring. A wall that borders an
 *  EMPTY stair-carve fragment lies metres inside the ring → fails this test → it is an
 *  INTERIOR seal that MUST be built. On an apartment / axis-aligned / L-U-T plate every
 *  one-sided wall genuinely sits on the perimeter (rooms tile the whole shell) → every
 *  sample is on the ring → returns true for all of them → byte-identical (no room is
 *  ever flipped from exterior to interior there). `tol` is generous (matches the
 *  §RECTIFY bbox-vs-shell divergence band) so a perimeter wall on a slightly-rectified
 *  edge is never mis-flagged interior. */
const PERIMETER_MEMBER_TOL_M = 0.35;
function segmentOnPerimeter(a: Pt, b: Pt, poly: readonly Pt[], tol = PERIMETER_MEMBER_TOL_M): boolean {
    if (poly.length < 3) return true;                    // unknown shell → preserve legacy (treat as perimeter)
    const mid: Pt = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return distPointToRing(a, poly) <= tol
        && distPointToRing(b, poly) <= tol
        && distPointToRing(mid, poly) <= tol;
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
 *  long → this is a no-op on the apartment + rectilinear paths (no regression).
 *
 *  §SELF-CLUSTER-FLOOR (2026-06-08) — RAISED 0.05 → 0.50 m. The prior 0.05 m comment
 *  claimed it "equals the editor's degeneracy floor", but the resolver actually
 *  self-clusters any wall shorter than its CLUSTER SNAP RADIUS — clamped to [0.05, 1.0]
 *  with a 0.5 m default, which is what a non-ortho batch rebuild uses. So a stub of
 *  0.05–0.50 m survived the engine but had BOTH endpoints fall in one cluster in the
 *  resolver → §SELF-CLUSTER-GUARD flagged it §WJR-INVALID → the mesh builder skipped it
 *  → a MISSING wall + a room that floods into its neighbour (the founder's
 *  "Kitchen / Entrance Hall merged" + upper-floor missing wall). Matching the floor to
 *  the resolver's 0.5 m band guarantees every wall the engine KEEPS is one the resolver
 *  can join WITHOUT self-clustering. Real residential partitions are ≥ 1 m; a 0.05–0.5 m
 *  segment is a clamp/weld artifact on a skewed plate, not a wanted wall — dropping it
 *  lets the adjacent (long) room edges form the boundary. Axis-aligned/apartment paths
 *  have metre-long edges → still a no-op. */
const WJR_SAFE_MIN_LEN_M = 0.50;

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
/** §DOOR-NO-CLASH (founder defect #7, 2026-06-12) — minimum separation (m) the door pipeline keeps
 *  between two door openings on the SAME room's walls (and the clearance their swings need not to
 *  overlap). A door leaf is ~the door width; 0.5 m of clear wall between two leaves (and between a
 *  leaf and a perpendicular corner door) keeps the swings from colliding while staying small enough
 *  that a normal corridor can still host all its doors. Deterministic constant (no RNG). */
const DOOR_SWING_CLEAR_M = 0.5;

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
    // §OPEN-PLAN-ELIGIBLE (A.21.D40 #5, 2026-06-08) — HARD guarantee that only the
    // social cluster (living / kitchen / dining) ever forms a wall-less open zone.
    // An `open` edge is honoured ONLY when BOTH endpoints are open-plan-eligible;
    // any `open` edge touching a sleeping / wet / circulation room is DOWNGRADED to
    // a real wall (it is simply not unioned, so `emit` keeps the partition + the
    // door pipeline still connects the pair via a doorway). This is what stops the
    // central blob: a bedroom / bathroom / corridor can never be merged into a
    // shared open space, whatever adjacency the bubble/AI graph requests.
    const eligibleById = new Map<string, boolean>(graph.rooms.map(r => [r.id, isOpenPlanEligible(r.type)]));
    // §STAIR-CIRC-STUB (founder defect §65.3, 2026-06-11) — a corridor STUB (minted by enumerate.ts
    // to reach an otherwise-landlocked stair) is type `corridor` and joins the main corridor via an
    // `open` edge: they are the SAME circulation function, so the shared wall is omitted (the L-leg
    // reads as one continuous corridor) and a virtual boundary line still splits them for room
    // detection — exactly the open-plan kitchen↔living mechanism, restricted to corridor↔corridor.
    const typeForOpen = new Map<string, string>(graph.rooms.map(r => [r.id, roomRule(r.type).type]));
    const bothCorridor = (a: string, b: string): boolean =>
        typeForOpen.get(a) === 'corridor' && typeForOpen.get(b) === 'corridor';
    for (const e of graph.edges) {
        if (e.via !== 'open') continue;
        if ((eligibleById.get(e.a) === true && eligibleById.get(e.b) === true) || bothCorridor(e.a, e.b)) union(e.a, e.b);
    }
    const sameZone = (a: string, b: string): boolean => find(a) === find(b);

    const segments: WallSeg[] = [];
    const boundaries: BoundarySeg[] = [];
    const sharedWallByPair = new Map<string, WallSeg>();
    let wid = 0;
    // §FRACTURE-SEAL — the real shell ring for one-sided-wall classification (house path
    // only; apartment / AI path leaves shellPolygon undefined → legacy heuristic).
    const shellPoly = opts.shellPolygon && opts.shellPolygon.length >= 3 ? opts.shellPolygon : null;

    // Core wall emission: given the segment endpoints + the (already-deduped, sorted)
    // bounding room ids, classify it (open-plan boundary vs interior seal vs perimeter)
    // and push it. Shared by BOTH the axis-aligned fast path (`emit`) and the general
    // collinear-edge matcher (Phase 2) so the wall/door semantics are identical.
    const emitWall = (a: Pt, b: Pt, bounds: string[]): void => {
        if (bounds.length === 2 && sameZone(bounds[0]!, bounds[1]!)) {
            // Intra-zone (open-plan) shared boundary: no wall, no door — but emit a
            // virtual RoomBoundingLine so the editor's RoomDetectionEngine still
            // separates the two open-plan spaces (the user's "room boundary" device,
            // matching how kitchen↔living is already split today). Without this they
            // collapse into one merged room on detection.
            boundaries.push({ a, b, betweenRoomIds: [bounds[0]!, bounds[1]!] });
            return;
        }
        // §FRACTURE-SEAL — classify one-sided walls against the REAL shell when known
        // (house path). A one-sided wall on the perimeter is exterior (legacy); one that
        // borders an empty stair-carve fragment lies INSIDE the shell → interior seal →
        // must be built (NOT skipped as exterior). Two-sided walls are always interior.
        // shellPolygon absent (apartment / AI path) ⇒ field left undefined ⇒ semanticGraph
        // uses the legacy `length===1` heuristic → byte-identical.
        const isExternal = bounds.length === 1 && shellPoly
            ? segmentOnPerimeter(a, b, shellPoly)
            : undefined;
        const seg: WallSeg = {
            id: `w${wid++}`, a, b, thickness, boundsRoomIds: bounds,
            ...(isExternal !== undefined ? { isExternal } : {}),
        };
        segments.push(seg);
        if (bounds.length === 2) sharedWallByPair.set(pairKey(bounds[0]!, bounds[1]!), seg);
    };

    const emit = (axis: 'v' | 'h', coord: number, run: Run): void => {
        const ids = [run.neg, run.pos].filter((x): x is string => x !== null);
        const bounds = ids.length === 2 ? [...ids].sort() : ids;
        const a: Pt = axis === 'v' ? { x: coord, z: run.start } : { x: run.start, z: coord };
        const b: Pt = axis === 'v' ? { x: coord, z: run.end } : { x: run.end, z: coord };
        emitWall(a, b, bounds);
    };

    // §POLYGON-WALL-SWEEP (Phase 2) — DISPATCH. Lift each placement to its cell polygon
    // (`cellFromRect`); when EVERY cell is an axis-aligned box (every production input
    // today — Phase-1 cells are all lifted rects) take the EXISTING vFaces/hFaces sweep
    // UNCHANGED (byte-identical). Only when a cell has a non-axis edge (the Phase-2 unit
    // tests; Phase-3 production) does the general collinear-overlapping-edge matcher run
    // — emitting through the SAME emitWall core so the wall/door semantics match.
    // §POLYGON-NATIVE (Phase 3) — use the REAL cell polygon when supplied (the sheared-
    // quad route), else lift the placement's rect (every other path → byte-identical).
    const cellOverride = opts.cellPolygonById;
    const cells = placements.map(p => {
        const real = cellOverride?.get(p.roomId);
        return real && real.length >= 3 ? { roomId: p.roomId, polygon: real } : cellFromRect(p);
    });
    const allAxisAligned = cells.every(c => isAxisAlignedBox(c.polygon) !== null);
    if (allAxisAligned) {
        for (const { coord, faces } of groupByCoord(vFaces)) for (const run of runsForLine(faces)) emit('v', coord, run);
        for (const { coord, faces } of groupByCoord(hFaces)) for (const run of runsForLine(faces)) emit('h', coord, run);
    } else {
        for (const m of collinearSharedWalls(cells)) {
            const bounds = m.ids.length === 2 ? [...m.ids].sort() : m.ids;
            emitWall(m.a, m.b, bounds);
        }
    }

    // ── §DOOR-WALL-SURVIVES (A.21.D29 #8, 2026-06-12, house ensuite/bathroom sealed) ──
    // THE DEFECT: door `openings` are placed against the raw `segments` built above, but
    // the walls the editor actually BUILDS (and the semantic graph hosts doors on) are the
    // POST-PROCESSED set — `extendWallsToShell` then `repairSegments`, the latter of which
    // DROPS any wall a weld/clamp collapsed below WJR_SAFE_MIN_LEN_M (0.50 m). A door placed
    // on a wall that the repair then drops becomes an ORPHAN opening: `buildSemanticGraph`
    // skips it (host wall guid missing) → the door is never created → the room ships SEALED
    // (the founder's "En-suite + Bathroom have NO door on the first floor"). Worse, the old
    // `sealedRoomIds` was derived from `doorCount`, which counted the now-orphaned door, so
    // the SEAL was INVISIBLE to the §SEALED-ROOMS / §DIAG-ADJACENCY diagnostics.
    //
    // THE FIX: compute the FINAL surviving wall-id set HERE (the SAME deterministic
    // extend→repair the function already runs at the end — these are pure functions of
    // `segments` + shellPolygon and nothing mutates `segments` after the sweep above, so
    // this is byte-identical to the later call and is reused for the final output). Doors
    // are then placed ONLY on walls that SURVIVE the repair, so the reroute / multihop
    // passes route a sealed room onto a wall that actually gets built. A clean rectilinear
    // apartment plate has every wall ≥ 1 m → the repair drops nothing → `survivingWallIds`
    // is the full set → byte-identical door placement (no apartment regression).
    const segmentsExtendedFinal = opts.shellPolygon && opts.shellPolygon.length >= 3
        ? extendWallsToShell(segments, opts.shellPolygon)
        : segments;
    const segmentsRepaired = repairSegments(segmentsExtendedFinal);
    const survivingWallIds = new Set(segmentsRepaired.map(s => s.id));

    // ── §DIAG-MERGE-DIVIDER (tracker §57.3, 2026-06-11) ───────────────────────────
    // Per ADJACENT room pair that SHOULD be separated by a real partition, log whether a
    // divider wall is present (`dividerPresent=YES/NO`) and whether the wall was instead
    // suppressed as an OPEN-PLAN threshold (`openZone=YES/NO` — the wall-less merge). A
    // pair that should separate but ends with NO divider AND is NOT a legitimate open-plan
    // pair is the room-MERGE defect (the compound "Living Room / Dining / Bathroom"). The
    // ONLY legitimate wall-less pair is two open-plan-eligible rooms (kitchen/dining/living)
    // the program intentionally merged into one open zone. Logging only — no behaviour
    // change; the next console paste confirms the divider survived. `weldDropped` is left to
    // the editor's §GROUND-WELD log (this pure pass has no shell to weld against).
    {
        const roomTypeById = new Map(graph.rooms.map(r => [r.id, r.type]));
        const seen = new Set<string>();
        const reportPair = (x: string, y: string, dividerPresent: boolean, openZone: boolean): void => {
            const key = pairKey(x, y);
            if (seen.has(key)) return;
            seen.add(key);
            const tx = roomTypeById.get(x), ty = roomTypeById.get(y);
            if (!tx || !ty) return;
            // A pair is LEGITIMATELY wall-less only when it is an intentional open-plan
            // merge (both open-plan-eligible) OR a §STAIR-CIRC-STUB corridor↔corridor L-leg join
            // (the same circulation function), with the engine in one open zone.
            const legitOpenPlan = openZone
                && ((eligibleById.get(x) === true && eligibleById.get(y) === true) || bothCorridor(x, y));
            const shouldSeparate = !legitOpenPlan;
            if (!shouldSeparate) return;   // intentional kitchen-diner — not a divider candidate
            const ok = dividerPresent;
            if (_layoutDiagOn()) console.log(
                `[D-TGL] §DIAG-MERGE-DIVIDER pair=${tx}↔${ty} dividerPresent=${ok ? 'YES' : 'NO'} ` +
                `openZone=${openZone ? 'YES' : 'NO'} weldDropped=${'N/A(pre-weld)'} ` +
                `${ok ? '✓' : '⚠ MERGE-RISK (room-separating wall missing → rooms flood-merge)'}`,
            );
            if (!ok) {
                if (_layoutDiagOn()) console.warn(
                    `[D-TGL] §DIAG-MERGE-DIVIDER ⚠ ${tx}↔${ty} should be SEPARATE rooms but has NO divider ` +
                    `(openZone=${openZone}). If this is NOT an intended open-plan kitchen+dining pair the two ` +
                    `rooms will detect as ONE compound room. See §OPEN-PLAN-ELIGIBLE / openPlanLivingDining.`,
                );
            }
        };
        // Real-wall pairs (have a divider).
        for (const [, seg] of sharedWallByPair) {
            if (seg.boundsRoomIds.length === 2) reportPair(seg.boundsRoomIds[0]!, seg.boundsRoomIds[1]!, true, false);
        }
        // Open-zone pairs (no wall — a virtual boundary line only).
        for (const bd of boundaries) reportPair(bd.betweenRoomIds[0]!, bd.betweenRoomIds[1]!, false, true);
    }

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

    // §DOOR-NO-CLASH (founder defect #7, 2026-06-12) — doors must not be placed too close
    // together / with overlapping swings, ESPECIALLY in a small corridor that hosts many doors.
    // `findClearOffset` already slides a door clear of perpendicular WALL endpoints (so a partition
    // never slices the cavity); this adds the symmetric guard against an existing DOOR LEAF. We
    // record each placed door's two world endpoints + the rooms it serves; when a NEW door is sized
    // on a wall, any already-placed door leaf within DOOR_SWING_CLEAR_M of the host line (a door at
    // a shared corner, or another door on the same room's adjacent wall) becomes a BLOCKED point the
    // new door slides clear of — so two door openings keep a min separation and their swings don't
    // collide. Deterministic (offsets come from the deterministic findClearOffset). On a wall with
    // room to slide this never changes connectivity (the door is still placed); only its OFFSET
    // moves. A 1-door-per-room apartment corridor has no second door to clash → byte-identical.
    interface PlacedDoor { readonly p0: Pt; readonly p1: Pt; readonly rooms: ReadonlySet<string> }
    const placedDoors: PlacedDoor[] = [];

    // §BEDROOM-ENSUITE-2DOOR (founder rule, 2026-06-10) — per-INSTANCE ensuite
    // pairing. The bubble graph stamps `ensuiteHostId` on each ensuite with the
    // id of the bedroom/master that hosts it. We build the symmetric pair set so
    // the door pipeline can, for THAT specific pair only: (a) PERMIT the
    // ensuite↔host door even when the host's type rule wouldn't (a non-master
    // bedroom's `accessFrom` excludes ensuite by design), and (b) grant the HOST
    // ONE extra door slot (corridor door + ensuite door = 2). Every other bedroom
    // keeps `maxDoors = 1` and an ensuite never opens onto a shared bathroom or an
    // un-paired bedroom — the global type rules are untouched. The master host is
    // byte-identical: its type rule already permits the door + a 2-door cap, so
    // both overrides below are no-ops for it (ADR-0061).
    const ensuiteHostPairKeys = new Set<string>();   // pairKey(ensuiteId, hostId)
    const ensuiteHostBonus = new Map<string, number>();  // hostId → extra door slots
    for (const r of graph.rooms) {
        if (r.type !== 'ensuite' || !r.ensuiteHostId) continue;
        // The host must be a real bedroom/master in this layout (a stale id is ignored).
        const hostType = typeOf.get(r.ensuiteHostId);
        if (hostType !== 'bedroom' && hostType !== 'master') continue;
        ensuiteHostPairKeys.add(pairKey(r.id, r.ensuiteHostId));
        // The CAP bonus is granted ONLY to a NON-master host: the `master` type rule
        // already encodes `maxDoors = 2` (corridor + ensuite), so bumping it would let
        // the master earn a SPURIOUS 3rd door (master↔living/dining) — a behaviour
        // change. Keeping the master strictly byte-identical (ADR-0061), the extra slot
        // is for a `bedroom` host whose type cap is 1 → 2. The pair PERMISSION above is
        // still set for both (a no-op for the master, which already permits the pair).
        if (hostType === 'bedroom') {
            ensuiteHostBonus.set(
                r.ensuiteHostId, (ensuiteHostBonus.get(r.ensuiteHostId) ?? 0) + ENSUITE_HOST_EXTRA_DOORS,
            );
        }
    }
    const isEnsuiteHostPair = (a: string, b: string): boolean =>
        ensuiteHostPairKeys.has(pairKey(a, b));

    // §DIAG-BEDROOM-ENSUITE-2DOOR — one line naming each ensuite-hosting bedroom,
    // its host id + type, and the host's effective door cap (type cap + ensuite
    // bonus). For the apartment this is the master (cap was already 2, bonus a
    // no-op); a non-master host shows cap 1+1=2 — the founder's "corridor + ensuite"
    // arrangement. Logging only; no behaviour change.
    for (const r of graph.rooms) {
        if (r.type !== 'ensuite' || !r.ensuiteHostId) continue;
        const hostType = typeOf.get(r.ensuiteHostId) ?? '?';
        const paired = isEnsuiteHostPair(r.id, r.ensuiteHostId);
        if (_layoutDiagOn()) console.log(
            `[D-TGL] §DIAG-BEDROOM-ENSUITE-2DOOR ensuite=${r.id} host=${r.ensuiteHostId}(${hostType}) ` +
            `paired=${paired} hostEffectiveMaxDoors=${maxDoorsFor(hostType) + (ensuiteHostBonus.get(r.ensuiteHostId) ?? 0)}`,
        );
    }

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

        // §DOOR-NO-CLASH (founder defect #7) — add a blocked point for every ALREADY-PLACED door
        // whose leaf would clash with a door on THIS host: project each placed door's two endpoints
        // onto the host line and, when an endpoint lies within DOOR_SWING_CLEAR_M of the host wall
        // (a door at a shared corridor corner, or another door on the same room's adjacent wall),
        // treat that projection as a crossing the new door must keep DOOR_SWING_CLEAR_M clear of.
        // We only guard against doors that SHARE A ROOM with the host wall (the same corridor /
        // room hosts both leaves — the clash the founder reported); doors in unrelated rooms can
        // never collide. The `width`-zone in `blocked` (below) is widened by the swing clearance so
        // two openings keep a real gap, not merely non-overlapping footprints.
        const hostRooms = new Set(host.boundsRoomIds);
        const swingPoints: number[] = [];
        for (const d of placedDoors) {
            let sharesRoom = false;
            for (const rid of d.rooms) if (hostRooms.has(rid)) { sharesRoom = true; break; }
            if (!sharesRoom) continue;
            for (const p of [d.p0, d.p1]) {
                const wx = p.x - host.a.x, wz = p.z - host.a.z;
                const t = wx * ux + wz * uz;
                if (t < -DOOR_SWING_CLEAR_M || t > len + DOOR_SWING_CLEAR_M) continue;
                const perpX = wx - t * ux, perpZ = wz - t * uz;
                if (Math.hypot(perpX, perpZ) > DOOR_SWING_CLEAR_M + 1e-3) continue;
                swingPoints.push(Math.max(0, Math.min(len, t)));
            }
        }
        if (crossings.length === 0 && swingPoints.length === 0) return centred;

        // A blocked zone for a WALL-endpoint crossing at `t` is [t - width, t]: any door offset
        // inside that zone puts the endpoint inside the cavity [off, off+width]. A §DOOR-NO-CLASH
        // swing point at `t` blocks the WIDER zone [t - width - swing, t + swing]: the new door must
        // keep DOOR_SWING_CLEAR_M clear of an existing door leaf on either side (so two openings
        // never abut and their swings don't overlap).
        const sw = DOOR_SWING_CLEAR_M;
        const blocked = (off: number): boolean =>
            crossings.some(t => off > t - width - EPS && off < t + EPS)
            || swingPoints.some(t => off > t - width - sw - EPS && off < t + sw + EPS);
        if (!blocked(centred)) return centred;

        // Candidate offsets: just outside each blocked zone, plus the two wall
        // ends. The centred default is blocked, so the door must slide off-centre.
        const candidates: number[] = [minOff, maxOff];
        for (const t of crossings) {
            candidates.push(t + EPS);            // door starts just after the endpoint
            candidates.push(t - width - EPS);    // door ends just before the endpoint
        }
        for (const t of swingPoints) {
            candidates.push(t + sw + EPS);             // door starts a swing-clearance past the leaf
            candidates.push(t - width - sw - EPS);     // door ends a swing-clearance before the leaf
        }
        // §DOOR-APPROACH-QUALITY (2026-06-08, F3 P2-3) — among the CLEAR slid
        // candidates, prefer the one that sits on the LONGEST unobstructed run of wall
        // (maximises the SHORTER of its two clear approaches), so the door reads
        // centred on its wall segment rather than shoved against a junction. The
        // obstacle set is the perpendicular crossings plus the two wall ends; for a
        // door at [off, off+width] each side's clear approach is the gap to the nearest
        // obstacle beyond the leaf. Tie-break: closest to the centred default (the prior
        // behaviour), so equal-approach candidates are byte-identical to before.
        const obstacles = [0, len, ...crossings, ...swingPoints];
        const approachScore = (off: number): number => {
            let left = 0, right = len;
            for (const o of obstacles) {
                if (o <= off + EPS && o > left) left = o;
                if (o >= off + width - EPS && o < right) right = o;
            }
            return Math.min(off - left, right - (off + width));
        };
        let best = centred, bestScore = -Infinity, bestD = Infinity, found = false;
        for (const c of candidates) {
            if (c < minOff - EPS || c > maxOff + EPS) continue;
            const off = Math.min(Math.max(c, minOff), maxOff);
            if (blocked(off)) continue;
            const score = approachScore(off);
            const d = Math.abs(off - centred);
            if (score > bestScore + EPS || (Math.abs(score - bestScore) <= EPS && d < bestD)) {
                best = off; bestScore = score; bestD = d; found = true;
            }
        }
        return found ? best : centred;
    };

    const addDoor = (wall: WallSeg, a: string, b: string): boolean => {
        if (wallHasDoor.has(wall.id)) return false;
        // §DOOR-WALL-SURVIVES (A.21.D29 #8) — never host a door on a wall the final
        // extend→repair pass DROPS: the editor wouldn't build it and the semantic graph
        // would orphan the opening (room ships SEALED). Forces reroute onto a built wall.
        if (!survivingWallIds.has(wall.id)) return false;
        const len = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
        // L3-γ-3 — per-pair EdgeType-aware width. Falls back to the global
        // default when the edge has no `kind` OR the caller explicitly
        // overrode via opts.doorWidthM.
        const preferredW = doorWForPair(a, b);
        // §DOOR-MINIMUMS (A.21.D47, 2026-06-08) — the architectural CLEAR-WIDTH
        // floor for a door serving BOTH rooms (Part M, the more-demanding room
        // wins). The emitted door is the PREFERRED width but NEVER below this
        // floor — so a BUFFER door onto a bathroom is still ≥ 0.80 m (corridor
        // side), a hall door ≥ 0.90 m, a wet-room-only door ≥ 0.70 m. An
        // explicit caller override (opts.doorWidthM, test back-compat) bypasses
        // the floor so the existing fixed-width tests still pin their value.
        const minW = userOverroad
            ? 0                                                 // explicit override: no floor
            : minDoorWidthBetween(typeOf.get(a) ?? '', typeOf.get(b) ?? '');
        // Target width = preferred, clamped UP to the floor. The wall must be
        // able to host at least the floor (with clearance each side); if it
        // can't, this wall is NOT a valid host — return false so reconciliation
        // picks a longer wall rather than emitting a sub-minimum door.
        const usableW = len - 2 * clear;
        if (usableW < minW - EPS) return false;                 // too short for the room-type floor
        const width = Math.max(Math.min(preferredW, usableW), minW);
        if (width < 0.6 - EPS) return false;                    // belt-and-braces hard floor
        const offset = findClearOffset(wall, width);
        openings.push({
            id: `o${oid++}`, wallId: wall.id, type: 'door',
            offsetM: round6(offset), widthM: round6(width), heightM: doorH, sillM: 0,
            betweenRoomIds: [a, b],
        });
        // §DOOR-NO-CLASH (founder defect #7) — record this door's world endpoints + the rooms it
        // serves so the NEXT door on either of those rooms slides clear of this leaf (min separation
        // + non-overlapping swings, esp. in a small corridor hosting many doors).
        {
            const dxw = wall.b.x - wall.a.x, dzw = wall.b.z - wall.a.z;
            const wlen = Math.hypot(dxw, dzw) || 1;
            const wux = dxw / wlen, wuz = dzw / wlen;
            placedDoors.push({
                p0: { x: wall.a.x + wux * offset, z: wall.a.z + wuz * offset },
                p1: { x: wall.a.x + wux * (offset + width), z: wall.a.z + wuz * (offset + width) },
                rooms: new Set([a, b]),
            });
        }
        wallHasDoor.add(wall.id);
        doorCount.set(a, (doorCount.get(a) ?? 0) + 1);
        doorCount.set(b, (doorCount.get(b) ?? 0) + 1);
        return true;
    };
    // §BEDROOM-ENSUITE-2DOOR — the effective door cap is the type cap PLUS any
    // per-instance ensuite-host bonus (only a bedroom that hosts its own ensuite
    // earns it; the master's type cap is already 2 so its bonus is irrelevant).
    const effectiveMaxDoors = (id: string): number =>
        maxDoorsFor(typeOf.get(id) ?? '') + (ensuiteHostBonus.get(id) ?? 0);
    const underCap = (id: string): boolean => (doorCount.get(id) ?? 0) < effectiveMaxDoors(id);
    // §BEDROOM-ENSUITE-2DOOR — a door is permitted when the type rule allows it OR
    // when this is the specific ensuite↔host pair the bubble graph minted. This is
    // the ONLY relaxation of the access matrix, and it is per-instance: an ensuite
    // can still never open onto a shared bathroom or an un-paired bedroom.
    const permitted = (a: string, b: string): boolean =>
        doorAllowedBetween(typeOf.get(a) ?? '', typeOf.get(b) ?? '') || isEnsuiteHostPair(a, b);

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
    // §OPEN-WELD-FALLBACK-DOOR (founder audit, 2026-06-17) — a bubble `via:'open'` edge whose rooms
    // did NOT weld into one open zone (`sameZone` false — e.g. hall↔living: the hall is NOT open-plan-
    // eligible, so the union at the top of this function never merged them) gets NEITHER a weld NOR a
    // door from the pass above → the intended threshold becomes a SOLID WALL and the room is SEALED
    // apart (the founder's "you can't reach the living room / kitchen / dining from the hall" defect).
    // Realise the intended connection as a real DOOR when the two rooms share a wall AND the pair is
    // permitted. A welded `open` pair (kitchen↔dining) is skipped (it is a real open zone, no door);
    // a non-adjacent `open` pair has no shared wall so nothing is placed (the carve must seat them
    // adjacent — that genuine seal is now correctly surfaced by §OPEN-WELD-ADJACENCY, not masked).
    for (const e of graph.edges) {
        if (e.via !== 'open') continue;
        if (sameZone(e.a, e.b)) continue;                   // realised as an open zone ⇒ no door needed
        if (!permitted(e.a, e.b)) continue;                 // never realise a forbidden pair
        const wall = sharedWallByPair.get(pairKey(e.a, e.b));
        if (wall && addDoor(wall, e.a, e.b)) cUnion(e.a, e.b);
    }
    // §DIAG-DOORS — per-pass door tally (logging only; no behaviour change). Each
    // pass logs the cumulative door count so a single paste shows which PASS placed
    // how many doors (bubble vs primary/permitted reconcile vs over-cap vs reroute).
    let diagDoorsPrev = 0;
    const diagPass = (label: string): void => {
        const placed = openings.length - diagDoorsPrev;
        if (_layoutDiagOn()) console.log(
            `[D-TGL] §DIAG-DOORS pass=${label} placed=${placed} ` +
            `cumulativeDoors=${openings.length} compromises=${compromises}`,
        );
        diagDoorsPrev = openings.length;
    };
    diagPass('bubble');

    // §CORRIDOR-FIRST (founder GF/FF "corridor serves zero rooms", 2026-06-17) — a room adjacent
    // to BOTH the corridor and the entrance hall previously broke the door-host tie by WALL LENGTH,
    // so a private room doored onto whichever circulation wall was longer — often the hall, leaving
    // the 9 m² corridor serving nobody (the founder's GF defect). Refine the preference so a
    // PRIVATE/SERVICE room prefers the CORRIDOR over the hall, while a PUBLIC room still prefers the
    // HALL (we must never route public traffic onto the private spine — §CORRIDOR-PUBLIC would
    // reject that candidate). Pairs with no circulation side keep pref 0 (unchanged). The corridor
    // IS the private spine on every plan, so this is architecturally correct on apartments too.
    // Order (high→low): private→corridor (4), public→hall (3), private→hall (2),
    // public/circ→corridor + circ↔circ (1), no circulation (0).
    const circPref = (a: string, b: string): number => {
        const ta = typeOf.get(a) ?? '', tb = typeOf.get(b) ?? '';
        const aCirc = isCirculation(ta), bCirc = isCirculation(tb);
        if (!aCirc && !bCirc) return 0;                          // no circulation side → unchanged
        const circType = aCirc ? ta : tb;                        // the circulation room's type
        const otherType = aCirc ? tb : ta;                       // the room being served
        const isCorridor = roomRule(circType).type === 'corridor';
        const p = roomRule(otherType).privacy;
        if (p === 'private' || p === 'service') return isCorridor ? 4 : 2;   // private: corridor ≫ hall
        if (isCirculation(otherType)) return 1;                  // circulation↔circulation (hall↔corridor)
        return isCorridor ? 1 : 3;                               // public: hall (3) ≫ corridor (1)
    };

    // Shared-wall candidates, ranked: §CORRIDOR-FIRST preference (private→corridor first), then
    // longer walls, then stable id (deterministic).
    const shared = segments
        // §DOOR-WALL-SURVIVES (A.21.D29 #8) — only walls that survive the final repair
        // are real door hosts; a dropped wall can never carry a built door.
        .filter(s => s.boundsRoomIds.length === 2 && survivingWallIds.has(s.id))
        .map(s => {
            const [a, b] = s.boundsRoomIds as readonly [string, string];
            return { seg: s, a, b, pref: circPref(a, b), len: Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) };
        })
        .sort((p, q) => q.pref - p.pref || q.len - p.len || (p.seg.id < q.seg.id ? -1 : 1));

    // (1a-forced) §FORCE-CORRIDOR-DIRECT (founder 2026-06-18, per-level "↔ Corridor"
    // toggle) — for each room whose TYPE the caller listed in `forceCorridorDirectRoomTypes`,
    // FORCE a direct door onto the circulation spine (corridor preferred over hall) BEFORE
    // any generic reconcile, so the forced room wins its corridor wall's budget. The door
    // lands on the room↔circulation shared wall with the LONGEST run, ties broken toward the
    // wall NEAREST the room's CENTROID (the shortest-path door — the wall the room most
    // directly faces). HARD-RESPECTS the program rules: only a PERMITTED pair under the host's
    // door cap is placed; a forced door that would breach either is SKIPPED + logged
    // `§DIAG-CORRIDOR-FORCE skipped`. Gated on a non-empty set ⇒ absent ⇒ this whole block is
    // skipped ⇒ byte-identical (the apartment + every house with no toggle).
    const forcedTypes = opts.forceCorridorDirectRoomTypes && opts.forceCorridorDirectRoomTypes.length > 0
        ? new Set(opts.forceCorridorDirectRoomTypes.map(t => roomRule(t).type))
        : null;
    if (forcedTypes) {
        // Room centroid (metres) from its placement rect, for the shortest-path tie-break.
        const centroidById = new Map<string, Pt>();
        for (const { roomId, rect } of placements) {
            centroidById.set(roomId, { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 });
        }
        const wallMidDistToCentroid = (seg: WallSeg, c: Pt | undefined): number => {
            if (!c) return Infinity;
            const mx = (seg.a.x + seg.b.x) / 2, mz = (seg.a.z + seg.b.z) / 2;
            return Math.hypot(mx - c.x, mz - c.z);
        };
        // Process target rooms in stable id order (deterministic).
        const forcedTargets = graph.rooms
            .filter(r => forcedTypes.has(roomRule(r.type).type) && !isCirculation(r.type))
            .map(r => r.id)
            .sort();
        for (const id of forcedTargets) {
            const c = centroidById.get(id);
            // Circulation-adjacent shared walls for this room. Corridor host wins over hall
            // (pref 1/0); then LONGEST run; then NEAREST the room centroid; then stable id.
            const candidates = shared
                .filter(w => {
                    const other = w.a === id ? w.b : w.b === id ? w.a : null;
                    return other !== null && isCirculation(typeOf.get(other) ?? '');
                })
                .map(w => {
                    const other = w.a === id ? w.b : w.a;
                    return { w, corridorPref: roomRule(typeOf.get(other) ?? '').type === 'corridor' ? 1 : 0 };
                })
                .sort((p, q) =>
                    q.corridorPref - p.corridorPref
                    || q.w.len - p.w.len
                    || wallMidDistToCentroid(p.w.seg, c) - wallMidDistToCentroid(q.w.seg, c)
                    || (p.w.seg.id < q.w.seg.id ? -1 : 1));
            if (candidates.length === 0) {
                if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-CORRIDOR-FORCE skipped ${id}(${typeOf.get(id) ?? '?'}) (no circulation-adjacent wall)`);
                continue;
            }
            // Already corridor-served by a bubble/open door? Then nothing to force.
            const alreadyServed = openings.some(o => {
                if (o.type !== 'door') return false;
                const [a, b] = o.betweenRoomIds as readonly [string, string?];
                if (!b) return false;
                if (a === id) return isCirculation(typeOf.get(b) ?? '');
                if (b === id) return isCirculation(typeOf.get(a) ?? '');
                return false;
            });
            if (alreadyServed) continue;
            let placed = false;
            for (const { w } of candidates) {
                if (!permitted(w.a, w.b)) {
                    if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-CORRIDOR-FORCE skipped ${id}(${typeOf.get(id) ?? '?'}) (forbidden pair with ${typeOf.get(w.a === id ? w.b : w.a) ?? '?'})`);
                    continue;
                }
                if (!underCap(w.a) || !underCap(w.b)) {
                    if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-CORRIDOR-FORCE skipped ${id}(${typeOf.get(id) ?? '?'}) (door cap reached)`);
                    continue;
                }
                if (wallHasDoor.has(w.seg.id)) continue;            // a sibling already took this wall
                if (addDoor(w.seg, w.a, w.b)) {
                    cUnion(w.a, w.b);
                    placed = true;
                    if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-CORRIDOR-FORCE placed ${id}(${typeOf.get(id) ?? '?'}) → corridor door on ${w.seg.id} (len=${w.len.toFixed(2)}m)`);
                    break;
                }
            }
            if (!placed) {
                if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-CORRIDOR-FORCE skipped ${id}(${typeOf.get(id) ?? '?'}) (no host wall could fit a legal door)`);
            }
        }
        diagPass('corridor-force');
    }

    // (1b) §STAIR-DOOR-LANDING (A.21.D29 #5, 2026-06-12, founder "stair→corridor door
    // inaccurate") — the STAIR is a vertical-circulation core reached FROM the corridor /
    // hall / landing. Its door MUST land CLEANLY on the shared stair↔circulation wall:
    // centred + corner-clear + on the LONGEST such wall (the landing face, where you step
    // off the flight) — not on whatever short stair stub a later generic pass happens to
    // claim first. The generic reroute (2c) eventually gives the stair a door, but it runs
    // AFTER 2a/2b which can already consume the stair's wall budget on a worse run; placing
    // the stair door HERE, deterministically on its best wall, before any generic pass, is
    // what makes it land accurately. Only fires for a `stair` room (apartment has none →
    // byte-identical). `addDoor` centres the door via findClearOffset (corner + junction
    // clear).
    //
    // §HOUSE-STAIR-DOOR-ACCESS (founder defect B, 2026-06-24 — "the door is placed RIGHT AGAINST
    // the flight; it must open into the clear ACCESS / run-in landing, like §RESI-CORE-CIRCULATION").
    // When the caller supplies the stair keep-out rect(s), PREFER the stair↔circulation wall that
    // lies on the stair's RUN-IN edge (the bottom-of-flight approach) over the merely-longest wall:
    // a side wall (parallel to the flight) drops you onto a tread mid-flight, whereas the run-in edge
    // wall opens into the clear landing the founder wants. The run-in edge is the SHORT edge at the
    // LOW end of the keep-out's LONG axis (the flight runs +along that axis from its near corner —
    // mirroring `computeStairWorldFootprint`'s `runAlongZ ? z0 : x0` start). This is a PURE door-anchor
    // re-order (a tie-break ABOVE length); it never moves a room / changes geometry / touches scoring.
    const stairKO = opts.stairKeepOutRects && opts.stairKeepOutRects.length > 0 ? opts.stairKeepOutRects : null;
    // The fraction of a wall segment that must lie on the run-in edge for it to count as the approach
    // face (a near-coincident, overlapping wall). Returns 1 when on the run-in edge, else 0.
    const onRunInEdge = (seg: WallSeg): number => {
        if (!stairKO) return 0;
        const mx = (seg.a.x + seg.b.x) / 2, mz = (seg.a.z + seg.b.z) / 2;
        const horizontal = Math.abs(seg.b.z - seg.a.z) < Math.abs(seg.b.x - seg.a.x);   // wall runs along x
        for (const ko of stairKO) {
            const w = ko.x1 - ko.x0, h = ko.z1 - ko.z0;
            const runAlongZ = h >= w;                       // flight runs +Z (long axis Z) ⇒ run-in = z0 edge
            if (runAlongZ) {
                // run-in is the z0 (min-Z) edge: a HORIZONTAL wall coincident with z=z0, spanning x within the KO.
                if (horizontal && Math.abs(mz - ko.z0) < 0.06 && mx > ko.x0 - 0.06 && mx < ko.x1 + 0.06) return 1;
            } else {
                // run-in is the x0 (min-X) edge: a VERTICAL wall coincident with x=x0, spanning z within the KO.
                if (!horizontal && Math.abs(mx - ko.x0) < 0.06 && mz > ko.z0 - 0.06 && mz < ko.z1 + 0.06) return 1;
            }
        }
        return 0;
    };
    for (const r of graph.rooms) {
        if (r.type !== 'stair') continue;
        const stairId = r.id;
        // Run-in-edge first (defect B), then longest, then stable id — deterministic.
        const stairWalls = shared
            .filter(c => {
                const other = c.a === stairId ? c.b : c.b === stairId ? c.a : null;
                return other !== null && isCirculation(typeOf.get(other) ?? '') && permitted(c.a, c.b);
            })
            .sort((p, q) =>
                onRunInEdge(q.seg) - onRunInEdge(p.seg)   // §HOUSE-STAIR-DOOR-ACCESS: run-in edge wins
                || q.len - p.len
                || (p.seg.id < q.seg.id ? -1 : 1));
        for (const c of stairWalls) {
            if (cFind(c.a) === cFind(c.b)) break;   // stair already door-linked to circulation
            if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); break; }
        }
    }
    diagPass('stair-landing');

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
    diagPass('permitted-reconcile');

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
    diagPass('over-cap');

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
        // §STAIR-ROOM-DOOR (founder defect, 2026-06-10) — the `stair` is a CIRCULATION
        // type but, unlike the corridor/hall spine, it is a DEAD-END VERTICAL CORE that
        // must be REACHED FROM the landing/corridor/hall (accessFrom = corridor/hall).
        // Its only door came from the bubble-edge primary pass, which fires solely when
        // the stair already shares a realised wall with circId — so a stair tiled one
        // rect off the spine logged `stair0(stair) → NO DOOR`. Treat the stair as a
        // reroute TARGET so the circulation-reroute + multihop passes give it a legal
        // door (circWallsFor / chainToCirculation already gate on `permitted`, so only a
        // corridor/hall wall is ever chosen). All OTHER circulation rooms (corridor/hall)
        // ARE the spine and stay excluded → byte-identical for the apartment (no stair)
        // and for any layout whose stair already has its bubble-edge door.
        if (t === 'stair') return true;
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
    diagPass('circulation-reroute');

    // (2c-ii) §CIRCULATION-REROUTE-MULTIHOP (A.21.D14 → A.21.D36, 2026-06-07) —
    // "try harder", generalised from the original single two-hop pass.
    //
    // A room still without a DIRECT circulation door at this point shares no
    // legal circulation-adjacent wall in this tiling (the corridor/hall simply
    // doesn't reach it). Before giving up to the connected-but-warned fallback,
    // route it onto circulation via a CHAIN of permitted INTERMEDIATE rooms that
    // ends at a circulation-served room — e.g. bedroom→study→living where the
    // living room opens onto the hall. The original pass only handled ONE
    // intermediate (two hops); a room buried two rooms deep behind the spine
    // stayed stranded. This BFS finds the SHORTEST permitted door-chain from the
    // land-locked room to any circulation-served room and realises every door on
    // it, so EVERY habitable room becomes legally corridor-connected whenever any
    // permitted path exists. It never crosses a forbidden pair and never invents
    // geometry (every hop is an existing shared wall). Each realised door is a
    // (mild) compromise so P8 keeps preferring a directly-routed strategy.
    //
    // `circulationServed(id)` ≡ id is a circulation room OR has a direct
    // circulation door (recomputed each pass so it sees doors placed 1–2c).
    const circulationServed = (id: string): boolean =>
        isCircType(id) || roomHasCirculationDoor(id);
    // Adjacency over PERMITTED shared walls (id → [{other, seg}]), ranked longer-
    // wall-first then stable id so the chosen chain is deterministic.
    const permittedAdj = new Map<string, Array<{ other: string; seg: WallSeg }>>();
    for (const r of graph.rooms) permittedAdj.set(r.id, []);
    for (const c of [...shared].sort((p, q) => q.len - p.len || (p.seg.id < q.seg.id ? -1 : 1))) {
        if (!permitted(c.a, c.b)) continue;
        permittedAdj.get(c.a)?.push({ other: c.b, seg: c.seg });
        permittedAdj.get(c.b)?.push({ other: c.a, seg: c.seg });
    }
    // BFS from `id` to the nearest circulation-served room over permitted walls;
    // returns the door-chain (sequence of {seg, a, b}) to realise, or null.
    const chainToCirculation = (
        id: string,
    ): Array<{ seg: WallSeg; a: string; b: string }> | null => {
        const prev = new Map<string, { from: string; seg: WallSeg }>();
        const visited = new Set<string>([id]);
        let frontier = [id];
        let target: string | null = null;
        while (frontier.length > 0 && target === null) {
            const next: string[] = [];
            for (const cur of frontier) {
                for (const { other, seg } of permittedAdj.get(cur) ?? []) {
                    if (visited.has(other)) continue;
                    visited.add(other);
                    prev.set(other, { from: cur, seg });
                    // A circulation-served neighbour ends the search (the chain
                    // from id → … → cur → other lands on the spine).
                    if (circulationServed(other)) { target = other; break; }
                    next.push(other);
                }
                if (target !== null) break;
            }
            frontier = next;
        }
        if (target === null) return null;
        const chain: Array<{ seg: WallSeg; a: string; b: string }> = [];
        let node = target;
        while (node !== id) {
            const step = prev.get(node)!;
            chain.push({ seg: step.seg, a: step.from, b: node });
            node = step.from;
        }
        return chain.reverse();
    };
    const stillLandLocked = graph.rooms
        .map(r => r.id)
        .filter(id => needsCirculationAccess(id) && !roomHasCirculationDoor(id))
        .sort();
    for (const id of stillLandLocked) {
        if (roomHasCirculationDoor(id)) continue;             // an earlier chain already served it
        const chain = chainToCirculation(id);
        if (!chain) continue;                                 // truly land-locked
        for (const step of chain) {
            if (cFind(step.a) === cFind(step.b)) continue;    // already linked by an existing door
            if (wallHasDoor.has(step.seg.id)) { cUnion(step.a, step.b); continue; }
            if (addDoor(step.seg, step.a, step.b)) { cUnion(step.a, step.b); compromises++; }
        }
    }
    diagPass('multihop-reroute');

    // (2d) §WETROOM-PUBLIC-DOOR (founder 2026-06-18, "the ground-floor bathroom ships
    // SEALED — it is wall-adjacent to the Entrance Hall AND the Living Room, both public,
    // yet has NO door"). LAST-RESORT, NET-ADD fallback, GROUND-floor only, gated on
    // `opts.groundFloorWetRoomPublicFallback`. The apartment §BATH-CORRIDOR-ONLY rule
    // (`bathroom.accessFrom = ['corridor']`) is correct for a flat, but on a HOUSE ground
    // floor a downstairs bathroom is a guest/cloakroom reached off the entrance hall /
    // living zone — so when the corridor doesn't reach it (or is itself sealed) every
    // standard pass above leaves it with ZERO doors. The founder explicitly authorised
    // opening such an otherwise-SEALED wet room onto the nearest reachable space in the
    // priority order corridor → living → dining.
    //
    // §HALL-NOT-WETROOM-ONLY (founder rule, 2026-06-22) — "the only door from the hall to
    // the rest of the layout cannot be to a bathroom". A wet room must NOT be served off the
    // ENTRANCE HALL: doing so can make the hall's only connection a bathroom (the founder's
    // ground-floor defect). So the `hall` is REMOVED from the wet-room fallback targets — the
    // bathroom is routed to the corridor or a non-hall public room (living/dining) instead.
    // The hall keeps its own door to the corridor / a public room via the standard passes.
    //
    // STRICTLY conservative:
    //   • fires ONLY for a `bathroom` that, after ALL standard passes, has ZERO built
    //     doors (genuinely sealed). A bathroom that already got its corridor door is
    //     UNTOUCHED, so the well-behaved house is byte-identical.
    //   • NET-ADD only — `addDoor` never removes/moves a door; an existing door's
    //     position is unchanged (§DIAG-PARITY-OPENINGS posDrift stays 0).
    //   • the relaxation is LOCAL (bypasses `permitted` for this one fallback pair only);
    //     the type-level matrix is untouched, so apartments / upper floors are unaffected.
    //   • priority: corridor first (the proper circulation host), then living, then dining;
    //     NEVER the hall. Within a priority tier the LONGEST shared wall wins (most likely to
    //     host a clear door), ties broken by stable id (deterministic).
    if (opts.groundFloorWetRoomPublicFallback === true) {
        // Recompute door coverage from the openings placed so far (every standard pass).
        const hasAnyDoor = (id: string): boolean =>
            openings.some(o => {
                if (o.type !== 'door') return false;
                const [a, b] = o.betweenRoomIds as readonly [string, string?];
                return a === id || b === id;
            });
        // Founder priority order for the public fallback target. §HALL-NOT-WETROOM-ONLY — the
        // `hall` is DELIBERATELY ABSENT: a wet room may never be served off the entrance hall.
        const PUBLIC_FALLBACK_PRIORITY: Record<string, number> = { corridor: 0, living: 1, dining: 2 };
        const sealedWetRooms = graph.rooms
            .filter(r => roomRule(r.type).type === 'bathroom' && !hasAnyDoor(r.id))
            .map(r => r.id)
            .sort();
        for (const id of sealedWetRooms) {
            // Shared walls to a corridor / living / dining room, ranked by the founder
            // priority (corridor ≫ living ≫ dining — NEVER the hall), then LONGEST wall, then id.
            const candidates = shared
                .map(w => {
                    const other = w.a === id ? w.b : w.b === id ? w.a : null;
                    if (other === null) return null;
                    const otherType = roomRule(typeOf.get(other) ?? '').type;
                    const prio = PUBLIC_FALLBACK_PRIORITY[otherType];
                    if (prio === undefined) return null;             // not a corridor/living/dining wall (hall excluded)
                    return { w, otherType, prio };
                })
                .filter((c): c is NonNullable<typeof c> => c !== null)
                .sort((p, q) => p.prio - q.prio || q.w.len - p.w.len || (p.w.seg.id < q.w.seg.id ? -1 : 1));
            if (candidates.length === 0) {
                if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-WETROOM-PUBLIC skipped ${id}(bathroom) (no corridor/living/dining-adjacent wall — hall excluded — stays sealed)`);
                continue;
            }
            let placed = false;
            for (const { w, otherType } of candidates) {
                if (wallHasDoor.has(w.seg.id)) continue;             // a sibling already took this wall
                // LOCAL fallback relaxation: bathroom↔public is NOT in `permitted`, so we
                // bypass it here ON PURPOSE (founder-authorised). `addDoor` still enforces
                // the wall-survives + min-door-width geometry floors, so a sub-minimum wall
                // is skipped and the next priority/length candidate is tried.
                if (addDoor(w.seg, w.a, w.b)) {
                    cUnion(w.a, w.b);
                    compromises++;
                    placed = true;
                    if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-WETROOM-PUBLIC placed ${id}(bathroom) → ${otherType} door on ${w.seg.id} (len=${w.len.toFixed(2)}m)`);
                    break;
                }
            }
            if (!placed) {
                if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-WETROOM-PUBLIC skipped ${id}(bathroom) (no host wall could fit a door — stays sealed)`);
            }
        }
        diagPass('wetroom-public');
    }

    // (2e) §DOOR-RESCUE-REACH (founder §CIRCULATION-GRAPH PART 9, 2026-06-30, ADR-0087) —
    // the GENERATOR GUARANTEE of MAXIMUM circulation: after every pass above, EVERY
    // HABITABLE room must be reachable through a PATH OF DOORS from the entrance. The
    // earlier reroute passes (2c / 2c-ii) only target PRIVATE/SERVICE rooms (a sealed
    // PUBLIC living/kitchen/dining room is invisible to them — `needsCirculationAccess`
    // returns false for a public type), and the multihop chain only fires when a PERMITTED
    // door-chain exists. This pass closes BOTH gaps: it BFS-marks every room reachable from
    // the entrance over the realised DOOR graph (the same predicate `unreachableHabitableRoomIds`
    // and the modal's `computeCirculationReachability` use), then for each still-UNREACHED
    // HABITABLE room it adds ONE door onto a shared wall with an already-REACHED neighbour —
    // PRIVACY-FIRST (a `permitted` pair, longest wall first), relaxing the door cap and then
    // the type matrix only as a graded last resort (each counted as a compromise so P8 keeps
    // preferring a plan that needed none). It iterates: a rescue makes the room reached, so a
    // room reachable only through it is rescued on the next round. Cross-typology — runs on the
    // SHARED apartment + house path (no `housePath` gate) so `fraction → 1` for every normal
    // plan. NET-ADD only (never removes/moves a door); a fully-reachable layout is byte-identical.
    {
        // Habitable = the rooms whose entrance-reachability is THE guarantee — EXACTLY the
        // engine `REACH_HABITABLE_TYPES` set that `unreachableHabitableRoomIds` (and the modal's
        // `computeCirculationReachability`) measures, so the rescue target and the score's
        // denominator are one set. WET / SERVICE rooms (bathroom/wc/utility) are DELIBERATELY
        // EXCLUDED: a sealed wet room is governed by the dedicated privacy passes (the apartment
        // §BATH-CORRIDOR-ONLY rule + the house §WETROOM-PUBLIC-DOOR / §HALL-NOT-WETROOM-ONLY
        // fallbacks), NOT by a blanket rescue — opening a bathroom onto an arbitrary neighbour
        // would re-introduce the bathroom↔bedroom / bathroom-off-hall anti-patterns those passes
        // exist to prevent. Mirrors `REACH_HABITABLE_TYPES` in enumerate.ts.
        const RESCUE_HABITABLE_TYPES = new Set(['living', 'kitchen', 'dining', 'master', 'bedroom', 'study']);
        const isHabitable = (id: string): boolean =>
            RESCUE_HABITABLE_TYPES.has(roomRule(typeOf.get(id) ?? '').type);
        // Deterministic entrance root: explicit entry → lowest-id circulation room → lowest-id
        // room. Identical selection to `unreachableHabitableRoomIds` so the in-engine guarantee
        // and the modal's % agree on the same front.
        const allIds = graph.rooms.map(r => r.id).sort();
        const circIds = allIds.filter(id => isCirculation(typeOf.get(id) ?? ''));
        const rootId =
            (graph.entryId && typeOf.has(graph.entryId)) ? graph.entryId :
            (circIds[0] ?? allIds[0]);
        if (rootId !== undefined) {
            // Door + open-threshold permeability adjacency, rebuilt from the REALISED openings
            // each round (so a door this pass adds is immediately seen). Sorted ⇒ stable BFS.
            const reachedFrom = (root: string): Set<string> => {
                const adj = new Map<string, string[]>();
                for (const id of allIds) adj.set(id, []);
                const link = (a: string | undefined, b: string | undefined): void => {
                    if (!a || !b || a === b || !adj.has(a) || !adj.has(b)) return;
                    adj.get(a)!.push(b); adj.get(b)!.push(a);
                };
                for (const o of openings) {
                    if (o.type !== 'door') continue;
                    const [a, b] = o.betweenRoomIds as readonly [string, string?];
                    link(a, b ?? undefined);
                }
                for (const e of graph.edges) if (e.via === 'open') link(e.a, e.b);
                for (const [, ns] of adj) ns.sort();
                const seen = new Set<string>([root]);
                const q = [root];
                while (q.length) {
                    const cur = q.shift()!;
                    for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
                }
                return seen;
            };
            // Add a door from an UNREACHED habitable room to its best already-REACHED neighbour.
            // PRIVACY-FIRST and PERMITTED-ONLY (never a forbidden pair — that would re-introduce
            // the bedroom↔bedroom / bathroom-off-living anti-patterns the matrix exists to block):
            //   Tier 1 — a clean, rule-legal, under-cap door.
            //   Tier 2 — a permitted pair, relaxing only the door CAP (counts as a compromise so
            //            P8 keeps preferring a plan that needed none).
            // Within a tier, longest wall first (most likely to host a clear door), then stable id.
            // A habitable room with NO permitted reached neighbour stays unreached (genuinely
            // land-locked in this tiling) — surfaced by the reach diagnostic + the ranker, never
            // forced open illegally. Returns true if a door was placed.
            const rescueOne = (id: string, reached: ReadonlySet<string>): boolean => {
                const toReached = shared
                    .filter(c => (c.a === id || c.b === id) && reached.has(c.a === id ? c.b : c.a) && permitted(c.a, c.b));
                const byRun = (p: (typeof shared)[number], q: (typeof shared)[number]): number =>
                    q.len - p.len || (p.seg.id < q.seg.id ? -1 : 1);
                // Tier 1 — a clean, rule-legal, under-cap door.
                for (const c of toReached.filter(c => underCap(c.a) && underCap(c.b)).sort(byRun)) {
                    if (wallHasDoor.has(c.seg.id)) continue;
                    if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); return true; }
                }
                // Tier 2 — permitted pair, relax the door cap (counts as a compromise).
                for (const c of toReached.sort(byRun)) {
                    if (wallHasDoor.has(c.seg.id)) continue;
                    if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); compromises++; return true; }
                }
                return false;
            };
            // Iterate to convergence: each round rescues every habitable room adjacent to the
            // current reached frontier, then re-expands the frontier. Bounded by room count
            // (each round adds ≥1 reached room or stops). Deterministic id order within a round.
            let guard = allIds.length + 1;
            for (;;) {
                if (guard-- <= 0) break;                       // belt-and-braces (never reached in practice)
                const reached = reachedFrom(rootId);
                const unreached = allIds.filter(id => isHabitable(id) && !reached.has(id));
                if (unreached.length === 0) break;            // GUARANTEE met — every habitable room reached
                let progressed = false;
                for (const id of unreached) {
                    if (rescueOne(id, reached)) { progressed = true; break; }  // re-BFS after each add
                }
                if (!progressed) break;                       // genuinely land-locked (no reached neighbour)
            }
        }
        diagPass('door-rescue-reach');
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

    // §EXTEND-TO-PERIMETER + §EXTEND-INTERIOR + §JUNCTION-REPAIR — the final wall set.
    // Computed ONCE at §DOOR-WALL-SURVIVES above (the SAME deterministic extend→repair;
    // `segments` is not mutated after the sweep), so door placement above and the built
    // walls here are guaranteed consistent — no orphan-opening sealed room. On a clean
    // rectilinear layout the repair is a no-op → bit-identical output, no regression.
    const segmentsOut = segmentsRepaired;

    // §DOOR-WALL-SURVIVES (A.21.D29 #8) — every door was already gated onto a surviving
    // wall in addDoor, so no opening should reference a dropped wall; prune defensively so
    // a stray opening can never reach the semantic graph (which would orphan + seal it).
    const openingsOut = openings.filter(o => survivingWallIds.has(o.wallId));

    // §SEALED-ROOMS (2026-05-29, recomputed from the SURVIVING openings — A.21.D29 #8) —
    // which rooms ended up with ZERO BUILT doors? Recompute door coverage from
    // `openingsOut` (the openings whose host wall actually survives) rather than the raw
    // `doorCount`, so a room whose only door was orphaned by a wall-drop is now CORRECTLY
    // reported sealed (the old count counted the orphaned door → the seal was invisible).
    // Deterministic — sorted by id.
    const builtDoorRooms = new Set<string>();
    for (const o of openingsOut) {
        if (o.type !== 'door') continue;
        const [a, b] = o.betweenRoomIds as readonly [string, string?];
        if (a) builtDoorRooms.add(a);
        if (b) builtDoorRooms.add(b);
    }
    const sealedRoomIds = graph.rooms
        .filter(r => !builtDoorRooms.has(r.id))
        .map(r => r.id)
        .sort();

    // §DIAG-STAIR-CIRC (founder defect, 2026-06-11) — the STAIR is a vertical-circulation
    // CORE that MUST be reached FROM the corridor/hall/landing, never through a habitable
    // room (the founder's "stair … served through Bedroom 3"). For EVERY `stair` room, log
    // (a) does it SHARE A WALL with a corridor/hall (so a door CAN be placed there), and
    // (b) does its REALISED door land on circulation. A stair whose door partner is a
    // bedroom (`doorOntoCirc=NO` with a non-circulation partner) is the founder's bug — the
    // next console paste confirms the fix. Pure logging; house-only (apartment has no stair).
    for (const r of graph.rooms) {
        if (r.type !== 'stair') continue;
        const sharesCircWall = shared.some(c => {
            const other = c.a === r.id ? c.b : c.b === r.id ? c.a : null;
            return other !== null && isCirculation(typeOf.get(other) ?? '') && c.len >= 0.9;
        });
        const doorPartnerTypes = openingsOut
            .filter(o => o.type === 'door')
            .map(o => o.betweenRoomIds as readonly [string, string?])
            .filter(([a, b]) => b && (a === r.id || b === r.id))
            .map(([a, b]) => typeOf.get(a === r.id ? b! : a) ?? '?');
        const doorOntoCirc = doorPartnerTypes.some(t => isCirculation(t));
        if (_layoutDiagOn()) console.log(
            `[D-TGL] §DIAG-STAIR-CIRC ${r.id}(stair) sharesCorridorWall=${sharesCircWall ? 'YES' : 'NO'} ` +
            `doorPartners=[${doorPartnerTypes.join(',') || 'none'}] ` +
            `doorOntoCirculation=${doorOntoCirc ? 'YES' : doorPartnerTypes.length > 0 ? 'NO (served through a room — founder bug)' : 'NO (SEALED)'}`,
        );
    }

    // §DIAG-DOORS — final summary (logging only; no behaviour change). Names the
    // total doors, any SEALED (door-less) rooms, and any room left land-locked /
    // routed only via a compromise (unrouted-to-circulation).
    const sealedNamed = sealedRoomIds
        .map(id => `${id}(${typeOf.get(id) ?? '?'})`)
        .join(',') || 'none';
    const reroutedNamed = unroutedToCirculationRoomIds
        .map(id => `${id}(${typeOf.get(id) ?? '?'})`)
        .join(',') || 'none';
    if (_layoutDiagOn()) console.log(
        `[D-TGL] §DIAG-DOORS summary: doors=${openingsOut.length} compromises=${compromises} ` +
        `walls=${segmentsOut.length} sealed=[${sealedNamed}] unroutedToCirculation=[${reroutedNamed}]`,
    );

    // ── §DIAG-ADJACENCY + §DIAG-DOOR-RULE (A.21.D61, 2026-06-09) ──────────────────
    // The founder's explicit ask: "which rooms are connected by doors to which
    // rooms … add logs so we can understand what's going on." For the WINNING
    // layout, print one line per room naming the rooms it is door-connected to,
    // each tagged ✓/✗ for whether that door satisfies the access-permission matrix
    // (`doorAllowedBetween`), and flag any room with ZERO doors. Then a one-line
    // §DIAG-DOOR-RULE roll-up: rooms-with-door / rooms-without / permission
    // violations. Pure logging — no behaviour change.
    const doorPartners = new Map<string, Array<{ other: string; ok: boolean }>>();
    for (const r of graph.rooms) doorPartners.set(r.id, []);
    let permissionViolations = 0;
    for (const o of openingsOut) {
        if (o.type !== 'door') continue;
        const [a, b] = o.betweenRoomIds as readonly [string, string?];
        if (!a || !b) continue;
        const ta = typeOf.get(a) ?? '?', tb = typeOf.get(b) ?? '?';
        // §BEDROOM-ENSUITE-2DOOR — the per-instance ensuite↔host pair is legal even
        // when the host's type rule wouldn't permit it (a non-master bedroom), so it
        // is NOT a permission violation.
        const ok = doorAllowedBetween(ta, tb) || isEnsuiteHostPair(a, b);
        if (!ok) permissionViolations++;
        doorPartners.get(a)?.push({ other: b, ok });
        doorPartners.get(b)?.push({ other: a, ok });
    }
    const roomsWithDoor: string[] = [];
    const roomsWithoutDoor: string[] = [];
    for (const r of [...graph.rooms].sort((p, q) => (p.id < q.id ? -1 : 1))) {
        const partners = doorPartners.get(r.id) ?? [];
        if (partners.length === 0) roomsWithoutDoor.push(`${r.id}(${r.type})`);
        else roomsWithDoor.push(r.id);
        const desc = partners.length === 0
            ? 'NO DOOR ✗'
            : partners.map(p => `${typeOf.get(p.other) ?? '?'}${p.ok ? '✓' : '✗'}`).join(', ');
        if (_layoutDiagOn()) console.log(`[D-TGL] §DIAG-ADJACENCY ${r.id}(${r.type}) → ${desc}`);
    }
    if (_layoutDiagOn()) console.log(
        `[D-TGL] §DIAG-DOOR-RULE roomsWithDoor=${roomsWithDoor.length}/${graph.rooms.length} ` +
        `roomsWithoutDoor=[${roomsWithoutDoor.join(',') || 'none'}] ` +
        `permissionViolations=${permissionViolations}`,
    );

    return { segments: segmentsOut, openings: openingsOut, boundaries, compromises, sealedRoomIds, unroutedToCirculationRoomIds };
}

/** True when a door between these two room types satisfies the program rules. */
export function isLegalDoorPair(typeA: string, typeB: string): boolean {
    return doorAllowedBetween(typeA, typeB);
}
