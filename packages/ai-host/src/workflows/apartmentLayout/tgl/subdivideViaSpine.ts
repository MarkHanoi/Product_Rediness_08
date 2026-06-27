// §SPINE-FIRST P3 (ADR-0073 HAG, 2026-06-21) — the ADAPTER that composes P1 (deriveCorridorSpine) +
// P2 (packRoomsAlongSpine) from a BubbleGraph, producing the corridor + room rects with the
// circulation/façade invariants guaranteed. This is the spine-first replacement for the area-first
// carve family in `subdivide` — kept as a SEPARATE pure function so it can be measured against the
// §CIRCULATION-ROBUSTNESS-SWEEP and flag-wired without touching the legacy path (zero regression).
//
// PURE + deterministic. Metres, world XZ. P3 core = straight spine on the shell bbox (the double-
// loaded case); skewed-residual clipping + L/T legs land in a later slice.

import { deriveCorridorSpine } from './deriveCorridorSpine.js';
import { packRoomsAlongSpine, packRoomsAlongSpineTree, type SpineRoom, type SpinePackResult, type PackedRoom } from './packRoomsAlongSpine.js';
import { roomRule } from '../rules/programRules.js';
import { carveEnsuiteWithinHost } from './subdivide.js';
import { clipToConvexShell } from './polySubdivide.js';
import type { BubbleGraph, ProgramRoom } from './bubbleGraph.js';
import type { Pt, Rect } from './rectDecomposition.js';

/**
 * §DIAG diagnostic gate. §DIAG breadcrumb logging is OFF by default. Set
 * `globalThis.__pryzmLayoutDiag = true` in the console to restore every §DIAG line. The
 * `if` short-circuits BOTH the console call AND the template-string build. P4: cast
 * through `globalThis`, never `(window as any)`.
 */
const _layoutDiagOn = (): boolean =>
    (globalThis as unknown as { __pryzmLayoutDiag?: boolean }).__pryzmLayoutDiag === true;

const bboxOf = (poly: readonly Pt[]): Rect => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { x0, z0, x1, z1 };
};

export interface SubdivideViaSpineOptions {
    /** Stair keep-out rect (a leg is derived to reach it). */
    readonly stairKeepOut?: Rect;
    /** Corridor width (m). Default 1.2. */
    readonly corridorWidthM?: number;
    /** §18 slice 4 — use the multi-leg, polygon-native tree pack (`packRoomsAlongSpineTree`) instead of
     *  the straight-run pack: rooms comb off ALL spine segments (run + legs), cells clip to the REAL
     *  shell (so sheared GIS quads are fine), and on a MIXED floor PUBLIC/PRIVATE zone to opposite sides
     *  of the run. Default false ⇒ the proven straight-run pack (byte-identical). */
    readonly spineTree?: boolean;
    /** §SINGLE-LOAD-PERIPHERAL (§19.3 / §20.1) — on a COMPACT (non-fragmented) plate, force the tree
     *  pack into SINGLE-LOADED mode: the corridor hugs the core/stair edge and ALL rooms sit in ONE
     *  band against the far façade, so each room gets BOTH a corridor wall AND a façade (the escape
     *  from the windows-vs-circulation trap). Only meaningful with `spineTree`. Default false ⇒ the
     *  double-loaded multi-leg pack (byte-identical). The caller gates this to non-fragmented plates. */
    readonly singleLoaded?: boolean;
    /** §RESI-ENTRY-INTO-CORRIDOR — the apartment FRONT-DOOR / entry anchor (this strategy frame,
     *  metres). Threaded into `deriveCorridorSpine` so the corridor spine reaches the entry edge
     *  (an L/T when off the primary run) → the front door opens INTO circulation, not a room. */
    readonly entry?: Pt;
}

/**
 * §SUITE-HOST-ADJACENCY (founder rule, 2026-06-22) — a (host bedroom → ensuite) pair, collected
 * from the `ensuiteHostId` stamps the bubble graph sets. Empty unless the §HOTEL-SUITES program
 * minted ensuites (the apartment / no-suite path has none ⇒ this whole pass is a no-op there).
 */
interface SpineSuite { readonly hostId: string; readonly ensuite: ProgramRoom }

const collectSuites = (graph: BubbleGraph): SpineSuite[] => {
    const suites: SpineSuite[] = [];
    for (const r of graph.rooms) {
        if (r.type !== 'ensuite' || !r.ensuiteHostId) continue;
        if (!graph.rooms.some(h => h.id === r.ensuiteHostId)) continue;   // host must exist
        suites.push({ hostId: r.ensuiteHostId, ensuite: r });
    }
    return suites;
};

/**
 * §SUITE-HOST-ADJACENCY — carve each suite's ensuite out of a CORNER of its host's PACKED rect so
 * the ensuite shares a wall with — and doors to — its host bedroom, NEVER banded as a detached
 * row (the founder's "en-suites separated from their bedrooms" defect on the §SPINE-TREE path).
 * The host rect already carries the COMBINED (host + ensuite) area because the caller hoisted the
 * ensuite area onto the host's SpineRoom target BEFORE packing. Returns a NEW SpinePackResult with
 * the host rect shrunk + the ensuite rect appended; an ensuite whose host couldn't seat both rooms
 * is DROPPED (added to `dropped`) — reported, never shipped detached. Pure + deterministic.
 */
function carveSpineSuites(res: SpinePackResult | null, suites: readonly SpineSuite[]): SpinePackResult | null {
    if (!res || suites.length === 0) return res;
    const byId = new Map<string, PackedRoom>(res.rooms.map(p => [p.roomId, p]));
    const hadPoly = res.cellPolygonById !== undefined;
    const polyById = new Map<string, readonly Pt[]>(res.cellPolygonById ?? []);
    const dropped = [...res.dropped];
    let carved = 0, droppedCount = 0;
    for (const suite of suites) {
        const ensId = suite.ensuite.id;
        const hostP = byId.get(suite.hostId);
        if (!hostP) {                                       // host itself wasn't placed → drop the ensuite
            if (!dropped.includes(ensId)) dropped.push(ensId);
            droppedCount += 1;
            continue;
        }
        const ec = carveEnsuiteWithinHost(hostP.rect, suite.ensuite.targetAreaM2, res.corridor);
        if (!ec) {                                          // host too tight even for the guaranteed split
            if (!dropped.includes(ensId)) dropped.push(ensId);
            droppedCount += 1;
            continue;
        }
        byId.set(suite.hostId, { roomId: suite.hostId, rect: ec.master });
        byId.set(ensId, { roomId: ensId, rect: ec.ensuite });
        if (hadPoly) {
            // The host polygon was clipped to the real shell; carve both children from it so the
            // sheared-façade edge stays correct. A rect child clipped to the host polygon is the
            // sub-cell; fall back to the rect ring on a degenerate clip (rectangular shell).
            const hostPoly = polyById.get(suite.hostId);
            const ring = (r: Rect): Pt[] => [
                { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 },
            ];
            const sub = (r: Rect): readonly Pt[] => {
                if (!hostPoly || hostPoly.length < 3) return ring(r);
                const c = clipToConvexShell(ring(r), hostPoly);
                return c.length >= 3 ? c : ring(r);
            };
            polyById.set(suite.hostId, sub(ec.master));
            polyById.set(ensId, sub(ec.ensuite));
        }
        carved += 1;
    }
    // §DIAG-SUITE — host-adjacency proof: carved (attached) vs dropped; detached MUST be 0 by
    // construction (every carve splits the host rect, so the ensuite always shares the cut wall).
    if (_layoutDiagOn()) console.log(
        `[D-TGL spine] §DIAG-SUITE carve: suites=${suites.length} carved=${carved} dropped=${droppedCount} detached=0 ` +
        `(every carved ensuite is a corner of its host; host-adjacency guaranteed by construction).`,
    );
    return {
        ...res,
        rooms: [...byId.values()],
        dropped,
        ...(hadPoly ? { cellPolygonById: polyById } : {}),
    };
}

/**
 * Spine-first subdivision from a bubble graph. Returns the corridor + per-room rects (keyed by the
 * graph room ids), with every room on the corridor and every window-room on the façade BY
 * CONSTRUCTION. Returns null when there is no corridor/room to pack or the shell is degenerate
 * (caller falls back to the legacy carve).
 */
export function subdivideViaSpine(
    shellPolygon: readonly Pt[],
    graph: BubbleGraph,
    opts: SubdivideViaSpineOptions = {},
): SpinePackResult | null {
    const corridorId = graph.corridorId;
    // §SUITE-HOST-ADJACENCY — collect the (host → ensuite) suites and EXCLUDE the ensuites from the
    // pack (they are carved from their hosts AFTER packing, never banded separately). HOIST each
    // ensuite's area onto its host so the host band is sized for the COMBINED footprint we then
    // split. No suites ⇒ the apartment / no-ensuite path is BYTE-IDENTICAL (empty maps below).
    const suites = collectSuites(graph);
    const ensuiteIds = new Set(suites.map(s => s.ensuite.id));
    const hoistByHost = new Map<string, number>();
    for (const s of suites) hoistByHost.set(s.hostId, (hoistByHost.get(s.hostId) ?? 0) + s.ensuite.targetAreaM2);

    const nonCorridor = graph.rooms.filter(r => r.id !== corridorId && !ensuiteIds.has(r.id));
    const toSpineRoom = (r: typeof nonCorridor[number]): SpineRoom => ({
        id: r.id,
        // §SUITE-HOST-ADJACENCY — a host carries its ensuite's hoisted area so its packed band is
        // big enough to split into host + ensuite afterwards.
        targetAreaM2: r.targetAreaM2 + (hoistByHost.get(r.id) ?? 0),
        needsWindow: r.needsWindow,
        minShortSideM: roomRule(r.type).minShortSideM,
    });
    const spineRooms: SpineRoom[] = nonCorridor.map(toSpineRoom);
    if (spineRooms.length === 0) return null;

    const spine = deriveCorridorSpine(shellPolygon, {
        ...(opts.stairKeepOut ? { stairKeepOut: opts.stairKeepOut } : {}),
        widthM: opts.corridorWidthM ?? 1.2,
        // §RESI-ENTRY-INTO-CORRIDOR — route the spine to the front-door entry edge.
        ...(opts.entry ? { entry: opts.entry } : {}),
    });
    if (!spine) return null;

    // §18 slice 4 — the multi-leg, polygon-native tree pack: rooms comb off ALL spine segments, cells
    // clip to the REAL shell, and PUBLIC (+ hall/circulation) zone to one side of the run, PRIVATE to
    // the other (the corridor between social + sleeping). An all-private (upper) floor has no public
    // rooms ⇒ cohorts undefined ⇒ area-balanced both sides.
    if (opts.spineTree) {
        const publicSide = nonCorridor.filter(r => roomRule(r.type).privacy !== 'private');
        const privateSide = nonCorridor.filter(r => roomRule(r.type).privacy === 'private');
        const cohorts: readonly [readonly SpineRoom[], readonly SpineRoom[]] | undefined =
            publicSide.length > 0 && privateSide.length > 0
                ? [publicSide.map(toSpineRoom), privateSide.map(toSpineRoom)]
                : undefined;
        // §SINGLE-LOAD-PERIPHERAL — single-loaded mode ignores cohorts (all rooms in ONE band, so
        // there is no public/private SIDE split to zone — the corridor hugs the core edge). The
        // public/private zoning is preserved on the double-loaded path (cohorts passed only there).
        if (opts.singleLoaded) {
            return carveSpineSuites(packRoomsAlongSpineTree(bboxOf(shellPolygon), spine, spineRooms, {
                shellPolygon,
                ...(opts.stairKeepOut ? { keepOut: opts.stairKeepOut } : {}),
                singleLoaded: true,
            }), suites);
        }
        return carveSpineSuites(packRoomsAlongSpineTree(bboxOf(shellPolygon), spine, spineRooms, {
            shellPolygon,
            ...(opts.stairKeepOut ? { keepOut: opts.stairKeepOut } : {}),
            ...(cohorts ? { cohorts } : {}),
        }), suites);
    }

    return carveSpineSuites(packRoomsAlongSpine(bboxOf(shellPolygon), spine, spineRooms), suites);
}
