// TGL P8 — deterministic Pareto enumeration (SPEC §2.2).
//
// THE NSGA-II REPLACEMENT. Instead of evolving a random population, we enumerate a
// FIXED, finite strategy set (coordinate axis × room order × mirror = 8 candidates),
// run the pure P1→P7 pipeline for each, then rank by exact Pareto dominance +
// weighted sum. No RNG, no populations, no time-dependent budget ⇒ identical output
// every run. The "search" is the enumeration; it is enumerated, never mutated.
//
// Strategy knobs change HOW the shell is tiled (they transform coordinates before
// subdivision and untransform the result), so candidates are genuinely different
// layouts — but every emitted graph is in the canonical {x,z} frame.

import type { ApartmentProgram, RoomType, ScoringWeights } from '../types.js';
import { decomposeToRects, polygonBBox, rectArea, rectifyConvexQuad, subtractRectsFromRects, type Pt, type Rect } from './rectDecomposition.js';
import { buildBubbleGraph, scaleProgramToShell, type BubbleGraph, type ProgramRoom, type AdjacencyEdge } from './bubbleGraph.js';
import { subdivideWithReport, findCorridorStubToKeepOut, claimResidualPlacements, type DroppedRoom, type RoomPlacement } from './subdivide.js';
import { buildWallsAndDoors, type BoundarySeg } from './wallsAndDoors.js';
import { snapRectsAwayFromWindows, type WindowSpan } from './windowAvoidance.js';
import { buildSemanticGraph, type LayoutGraph } from './semanticGraph.js';
import { computeSpaceSyntax } from './spaceSyntax.js';
import { computeObjectives, OBJECTIVE_AXES, type ObjectiveVector } from './objectives.js';
import { priorityMultiplier } from './envDrivers.js';
import { validateAllRoomShapes, type RoomShape } from '../dimensions/validateRoomShape.js';
import { validateRoomFit } from '../dimensions/validateRoomFit.js';
import { validateFrontage, rectTouchesPerimeter, rectDistToPerimeter } from '../dimensions/validateFrontage.js';
import { validateApartmentEnvelope } from '../dimensions/validateApartmentEnvelope.js';
import type { DimensionalValidation } from '../dimensions/types.js';
import { validateMandatoryAdjacencies, type DoorOpening } from '../topology/validateMandatoryAdjacencies.js';
import { validateForbiddenAdjacencies } from '../topology/validateForbiddenAdjacencies.js';
import { validateWetCluster } from '../topology/validateWetCluster.js';
import { validateAcousticZoning } from '../topology/validateAcousticZoning.js';
import { validateCirculationSequence } from '../topology/validateCirculationSequence.js';
import { validateCorridorConnectivity } from '../topology/validateCorridorConnectivity.js';
import { validateNoRoomOverlap, type RoomOverlap } from '../topology/validateNoRoomOverlap.js';
import { windowMandatoryFor, isPrivate, roomRule } from '../rules/programRules.js';
import { dimensionsFor } from '../dimensions/roomDimensions.js';

/** §DIAG-MIN-AREA-GATE / §DIAG-MANDATORY-GATE (tracker §68.1/§68.2) — the HARD
 *  architectural rules a candidate can fail. `minarea` = a habitable room below its
 *  `areaMin`; `mandatory` = a requested mandatory room (kitchen/living/bedroom/
 *  bathroom) is missing. The first four mirror the original §TOPO-HARD-REJECT set.
 *  `reach` (tracker §55, §DIAG-CIRCULATION-REACH) = a HABITABLE room is SEALED /
 *  unreachable from the entrance through the door + open-threshold access graph —
 *  computed angle-independently (graph BFS, no axis-aligned bbox heuristic). */
export type HardFailedRule =
    | 'window' | 'circulation' | 'privacy' | 'overlap' | 'minarea' | 'mandatory' | 'reach';

/** §DIAG-MIN-AREA-GATE (tracker §68.1) — the habitable room types whose own
 *  `areaMin` is enforced as a HARD floor. A room of one of these types emitted below
 *  its minimum makes the candidate hard-invalid (the auto-sizer must drop a room, not
 *  shrink one below its minimum). Wet/service/circulation rooms are excluded — they
 *  legitimately come small and are governed by the short-side / drop logic instead. */
const MIN_AREA_HABITABLE_TYPES: ReadonlySet<RoomType> = new Set<RoomType>([
    'living', 'kitchen', 'dining', 'master', 'bedroom', 'study',
]);

export interface EnumerateInput {
    readonly shellPolygon: readonly Pt[];      // metres, plan frame
    readonly program: ApartmentProgram;
    readonly levelId: string;
    readonly seed: string;
    readonly weights: ScoringWeights;
    readonly count: number;
    readonly shellAreaM2?: number;             // default = decomposed area
    readonly wallThicknessM?: number;
    readonly wallHeightM?: number;
    readonly doorWidthM?: number;
    /** Axis-aligned WORLD-XZ window spans on the shell perimeter (metres).
     *  Passed to `snapRectsAwayFromWindows` so interior partitions never
     *  terminate inside a window opening. Omitted/empty ⇒ no snap. */
    readonly windowSpansWorld?: readonly WindowSpan[];
    /** §DOOR-AVOIDANCE (2026-05-29): axis-aligned WORLD-XZ door spans on the
     *  shell perimeter (metres) for pre-existing exterior doors (e.g. the
     *  front door placed before generation). The snap treats them identically
     *  to window spans — partition endpoints never land inside the opening. */
    readonly doorSpansWorld?: readonly WindowSpan[];
    /** Minimum clearance (metres) between a partition coord line and any
     *  window-span boundary. Defaults to 0.1 m. */
    readonly windowClearanceM?: number;
    /** A.21.h — OPTIONAL injected gross-area envelope validator. Defaults to the
     *  apartment §D3.5 gate (`validateApartmentEnvelope`, keyed on bedroom count).
     *  The house orchestrator injects `validateHouseStorey` so a house plate is
     *  judged by its FULL programme, not bedroom count alone — WITHOUT forking the
     *  engine. Absent ⇒ byte-identical apartment behaviour. */
    readonly envelopeValidator?: (args: { program: ApartmentProgram; grossAreaM2: number }) => DimensionalValidation;
    /** §STAIR-KEEPOUT (A.21.D21) — OPTIONAL axis-aligned keep-out rectangles in
     *  the engine's plan frame (metres) — the vertical stair core(s) a multi-storey
     *  house reserves. Subtracted from the decomposed shell BEFORE subdivide so no
     *  room/partition ever tiles across the stair (SPEC-CASA §7). Apartment path
     *  never passes any ⇒ decomposition is bit-identical. */
    readonly keepOutRects?: readonly Rect[];
    /** §DIAG-FILL-RESIDUAL (founder defect §65.2, 2026-06-11) — OPTIONAL extra
     *  axis-aligned exclusion rect(s) in the engine plan frame that the residual-claim
     *  pass treats as occupied (so a grown/minted cell never tiles into them) but the
     *  main subdivide carve IGNORES (so layouts are byte-identical). Used to carry the
     *  RESERVED stair-core rect (the modal "Stair" cell), which can differ in position
     *  from the SHIPPED stair-footprint `keepOutRects` (the core is reserved BEFORE the
     *  upstream containment shift). Without this the residual pass could mint a "Store"
     *  in the reserved-core cell (the v149 keep-out invariant). Absent ⇒ no extra
     *  exclusion (apartment + every keep-out-free path byte-identical). */
    readonly residualExcludeRects?: readonly Rect[];
    /** §ENV-E2-SOLAR (E.2, 2026-06-07) — OPTIONAL site latitude (decimal degrees)
     *  for the solar room-placement bias axis (`objectives.solarOrientation`).
     *  Threaded straight into `computeObjectives`. Absent / non-finite / near-
     *  equatorial ⇒ the axis is the neutral 1.0 for every candidate (rank-
     *  invisible), so the apartment/house path with no site data is byte-identical. */
    readonly solarLatDeg?: number;
    /** A.25.3 — Living Design Parameter: program-rules adjacency strictness
     *  multiplier (neutral 1.0). > 1 sharpens the preferred/forbidden adjacency
     *  scoring (preferred rewarded harder, low-preference penalised more); < 1
     *  relaxes. Threaded into `computeObjectives`. Absent ⇒ neutral 1.0. */
    readonly adjacencyStrictness?: number;
    /** A.25.3 — Living Design Parameter: corridor clear-width (metres, neutral
     *  1.2 = engine default). Threaded into the subdivider's corridor strip so a
     *  high accessibility slider widens the corridor. Absent ⇒ engine default. */
    readonly corridorWidthM?: number;
    /** A.25.3 — Living Design Parameter: habitable-room area-weight multiplier
     *  (neutral 1.0). > 1 grows living/bedroom areas. Threaded into
     *  `buildBubbleGraph`. Absent ⇒ neutral 1.0. */
    readonly spaceGenerosity?: number;
}

export interface TglCandidate {
    readonly strategy: string;
    readonly graph: LayoutGraph;
    readonly objectives: ObjectiveVector;
    readonly weighted: number;                 // weighted-sum score (0..1)
    readonly rank: number;                     // Pareto rank (0 = best front)
    /** Reconciliation doors that broke a program rule (forbidden pair / over-cap).
     *  0 ⇒ an architecturally-legal plan; lower is better (legality gate, §rules). */
    readonly compromises: number;
    /** Every space reachable from the entry through doors/open thresholds. */
    readonly connected: boolean;
    /** §D3.1 — every room passes its dimensional shape envelope (D2.1
     *  validateRoomShape). False ⇒ at least one tunnel / oversized / undersized
     *  room. The enumerate gate prefers shape-admissible candidates over not.
     *  Soft findings still accumulate into `objectives.shapeQuality`. */
    readonly shapeAdmissible: boolean;
    /** §T3.3 — every mandatory adjacency is realised + every door is a permitted
     *  pair (T2.1 validateMandatoryAdjacencies + T2.2 validateForbiddenAdjacencies).
     *  False ⇒ a missing master↔ensuite door, a forbidden bedroom↔bedroom door,
     *  etc. Gate prefers topology-admissible candidates. */
    readonly topologyAdmissible: boolean;
    /** §CIRCULATION-REROUTE (A.APT.SA.2, 2026-06-03) — every private/service room
     *  opens DIRECTLY onto a circulation room (hall/corridor), with the ensuite-
     *  via-master exception. True ⇒ no room is reachable only by crossing
     *  another room. False ⇒ at least one room is land-locked behind a non-
     *  circulation room (the "bedroom you can only enter through the living
     *  room / another bedroom" defect). The gate prefers circulation-routed
     *  candidates so a fully-routed plan is offered whenever any strategy yields
     *  one. The specific land-locked room ids are in `wallsAndDoors`'
     *  `unroutedToCirculationRoomIds` diagnostic. */
    readonly circulationRouted: boolean;
    /**
     * §TOPO-HARD-REJECT (Stage 5, 2026-06-09) — the founder's HARD topology gate.
     * A candidate is `hardValid: false` when it violates ANY of three architectural
     * rules that a topology-quality-0 layout exhibits (merged-name rooms / windowless
     * bedrooms in the founder's console audit):
     *   • W — a `windowMandatory` habitable room (bedroom/master/living/kitchen/dining)
     *         is FULLY INTERIOR ⇒ no perimeter wall to host a window ⇒ ZERO windows
     *         (reuses the `frontage` validator's hard findings; §WINDOW-MANDATORY-RESCUE
     *         already reduces the residual — this gate catches what's left).
     *   • C — at least one room has NO door onto circulation (the
     *         `unroutedToCirculationRoomIds` / §SEALED-ROOMS signal; == !circulationRouted).
     *   • P — a private room (bedroom/master/bathroom/ensuite/wc) opens DIRECTLY off
     *         the entrance hall (a privacy breach — `hall.accessFrom` excludes them).
     *   • O — §ROOM-OVERLAP-HARD (founder bug, 2026-06-10): two rooms claim the SAME
     *         interior floor area (Area(R_i ∩ R_j) > ε). Rooms may touch along shared
     *         walls only; an interior overlap is invalid (ambiguous ownership). This
     *         makes a NON-overlapping strategy rank ABOVE an overlapping one, so when
     *         any of the 8 strategies is overlap-free the engine ships it.
     *   • A — §DIAG-MIN-AREA-GATE (tracker §68.1, 2026-06-11): a HABITABLE room
     *         (living/kitchen/dining/master/bedroom/study) is emitted BELOW its
     *         `roomDimensions[type].areaMin` (e.g. a 2 m² bedroom, min 9 m²). The
     *         auto-sizer must DROP a room before it shrinks one under its minimum, so
     *         a candidate that still contains a sub-areaMin habitable room is HARD-
     *         INVALID (filtered from the Pareto set), never just low-scored. The
     *         specific room ids + areas are logged via §DIAG-MIN-AREA-GATE.
     *   • M — §DIAG-MANDATORY-GATE (tracker §68.2, 2026-06-11): a REQUESTED mandatory
     *         room — kitchen (unless includeKitchen=false), living (unless
     *         livingRoom=false), plus the requested bedroom + bathroom counts — is
     *         MISSING from the realised layout. A candidate that dropped a mandatory
     *         room down to a low score is HARD-INVALID, not low-score. When NO strategy
     *         can satisfy the full mandatory set the engine surfaces a structured
     *         rejection (empty result + reason) rather than ship a degenerate option.
     * The ranker tier-splits hard-valid ABOVE hard-invalid; if EVERY strategy is
     * hard-invalid the pool is NEVER emptied (a loud §TOPO-HARD-REJECT-ALL warning
     * names the failing rules and the least-bad ships) — EXCEPT a universal `mandatory`
     * failure, which IS surfaced as an empty/structured rejection (§68.2). The specific
     * rules that failed are in `hardFailedRules` (subset of {'window','circulation',
     * 'privacy','overlap','minarea','mandatory'}).
     */
    readonly hardValid: boolean;
    readonly hardFailedRules: readonly HardFailedRule[];
    /** §DIAG-MIN-AREA-GATE / §DIAG-MANDATORY-GATE (tracker §68.1/§68.2) — the
     *  habitable rooms emitted below their `areaMin` (with the realised area), and
     *  the requested-but-missing mandatory room TYPES, for this candidate. Empty in
     *  the common case. Surfaced so the trigger/modal can report the exact shortfall
     *  ("Bedroom 2 was 6.4 m² < 9 m² min" / "no kitchen on this plate"). Deterministic. */
    readonly underMinAreaRooms: readonly { readonly roomId: string; readonly type: RoomType; readonly areaM2: number; readonly areaMinM2: number }[];
    readonly missingMandatoryTypes: readonly RoomType[];
    /**
     * §FEASIBILITY-ALLOC (A.21.D5, 2026-06-06) — requested rooms that could NOT
     * be placed at their per-type minimum short side in this strategy, even
     * after the subdivider's area-rebalance retry. Empty in the common case.
     * The gate prefers a strategy that drops FEWER rooms; when the best
     * candidate still drops some, the structured list (count + type + reason) is
     * logged so the trigger/modal can report "you asked for N, M fit" — the
     * engine NEVER silently loses a requested room. Deterministic.
     */
    readonly droppedRooms: readonly DroppedRoom[];
    /** §ROOM-OVERLAP-HARD (founder bug, 2026-06-10) — the overlapping room pairs in
     *  this candidate (DISPLAY NAMES + area m²), empty when overlap-free. Stored so
     *  the ranker can emit the founder's "Room Overlap Detected" message naming the
     *  actual rooms IF the shipped winner overlaps (every strategy over-capacity). */
    readonly roomOverlaps: readonly { readonly nameA: string; readonly nameB: string; readonly areaM2: number }[];
    /** Virtual room-bounding lines at open-plan thresholds (no wall, no door)
     *  in METRES; the LayoutOption converts to mm at emit time. */
    readonly boundaries: readonly BoundarySeg[];
}

const EPS = 1e-9;

/** §STAIR-KEEPOUT (A.21.D21) — clearance ring (m) added around each stair-core
 *  keep-out before carving. Matches the subdivider's ALIGNMENT_SNAP_EPS_M (0.05 m)
 *  so a post-carve alignment snap can never push a room back into the real core. */
const KEEPOUT_MARGIN_M = 0.05;

interface Strategy { readonly axis: boolean; readonly order: 'fwd' | 'rev'; readonly mirror: boolean }
const STRATEGIES: readonly Strategy[] = (() => {
    const out: Strategy[] = [];
    for (const axis of [false, true])
        for (const order of ['fwd', 'rev'] as const)
            for (const mirror of [false, true]) out.push({ axis, order, mirror });
    return out;                                 // 8, in fixed order
})();
const strategyKey = (s: Strategy): string => `${s.axis ? 'z' : 'x'}-${s.order}-${s.mirror ? 'mir' : 'id'}`;

/** §DIAG-CIRCULATION-REACH (tracker §55) — the HABITABLE room types whose
 *  reachability from the entrance is enforced as a HARD architectural floor. A
 *  room of one of these types that the access graph cannot reach FROM THE ENTRANCE
 *  is a SEALED room (the "bedroom you can only enter through a wall" / "windowless
 *  living room with no door" defect) ⇒ the candidate is hard-invalid. Mirrors the
 *  §68.1 MIN_AREA_HABITABLE_TYPES set: wet/service/circulation rooms come small and
 *  are governed by the circulation-reroute / drop logic, not this gate. */
const REACH_HABITABLE_TYPES: ReadonlySet<RoomType> = new Set<RoomType>([
    'living', 'kitchen', 'dining', 'master', 'bedroom', 'study',
]);

/**
 * §DIAG-CIRCULATION-REACH (tracker §55, 2026-06-11) — ANGLE-INDEPENDENT entrance
 * reachability. Returns the HABITABLE rooms (REACH_HABITABLE_TYPES) that the
 * door + open-threshold access graph CANNOT reach starting from the entrance,
 * deterministically sorted by id (empty ⇒ every habitable room is reachable).
 *
 * The permeability graph is purely TOPOLOGICAL — realised doors
 * (`doorOpenings` of type 'door') PLUS bubble open-plan thresholds
 * (`bubble.edges` with `via === 'open'`) — so the check operates identically on
 * an axis-aligned plate and on a rotated/skewed one (the founder's
 * angle-dependent failures came from axis-aligned bbox heuristics; this uses NONE).
 * It does NOT depend on room polygons, wall coordinates, or any orientation.
 *
 * Root selection (deterministic, never throws): the bubble's `entryId` when set,
 * else the lowest-id circulation room (hall/corridor/stair), else the lowest-id
 * room — so a program with no explicit entrance still gets a well-defined root and
 * the gate measures "reachable from SOME single front", not "graph is one blob".
 *
 * Pure + deterministic. Exported ONLY for the §55 regression test (the gate must be
 * verifiable angle-independently in isolation); it is a pure predicate over an
 * in-memory graph — no I/O, no THREE, no DOM — so it adds no runtime side effect and
 * needs no P8 span (consistent with the other tgl engine predicates, ADR-0061).
 */
export function unreachableHabitableRoomIds(args: {
    readonly bubble: BubbleGraph;
    readonly doorOpenings: readonly DoorOpening[];
}): readonly string[] {
    const { bubble, doorOpenings } = args;
    const ids = bubble.rooms.map(r => r.id);
    if (ids.length === 0) return [];
    const typeById = new Map<string, RoomType>();
    for (const r of bubble.rooms) typeById.set(r.id, r.type);

    // Permeability adjacency: realised doors + open thresholds. Sorted neighbour
    // lists ⇒ stable BFS order (determinism).
    const adj = new Map<string, string[]>();
    for (const id of ids) adj.set(id, []);
    const link = (a: string | undefined, b: string | undefined): void => {
        if (!a || !b || a === b) return;
        if (!adj.has(a) || !adj.has(b)) return;             // ignore ids not in the room set
        adj.get(a)!.push(b);
        adj.get(b)!.push(a);
    };
    for (const o of doorOpenings) {
        if (o.type !== 'door') continue;                    // only doorways are permeable connectors
        const [a, b] = o.betweenRoomIds as readonly [string, string?];
        link(a, b ?? undefined);
    }
    for (const e of bubble.edges) {
        if (e.via === 'open') link(e.a, e.b);               // open-plan threshold (no wall, no door)
    }
    for (const [, ns] of adj) ns.sort();

    // Deterministic entrance root.
    const isCirc = (t: RoomType | undefined): boolean => {
        if (!t) return false;
        const p = roomRule(t).privacy;
        return p === 'circulation';
    };
    const sortedIds = [...ids].sort();
    const root =
        (bubble.entryId && adj.has(bubble.entryId)) ? bubble.entryId :
        (sortedIds.find(id => isCirc(typeById.get(id))) ?? sortedIds[0]!);

    // BFS over the permeability graph from the entrance.
    const reached = new Set<string>([root]);
    const queue: string[] = [root];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of adj.get(cur) ?? []) {
            if (!reached.has(nb)) { reached.add(nb); queue.push(nb); }
        }
    }

    // The unreachable HABITABLE rooms (the sealed set).
    return sortedIds.filter(id => {
        const t = typeById.get(id);
        return t !== undefined && REACH_HABITABLE_TYPES.has(t) && !reached.has(id);
    });
}

/**
 * §TOPO-HARD-REJECT (Stage 5) — the founder's HARD topology gate predicate.
 *
 * Returns which of the three architectural rules a candidate violates (empty ⇒
 * hard-valid). Pure + deterministic — reuses signals already computed in
 * `buildCandidate` (the `frontage` validator's hard findings, the
 * `unroutedToCirculationRoomIds` signal, and the realised door set), so it adds
 * no new geometry pass. NOT exported — an internal slice of the enumerate/rank
 * path (no new exported package function ⇒ no new P8 span; consistent with the
 * other pure tgl engine functions, ADR-0061).
 *
 *   W (window)      — a `windowMandatory` room is fully interior (no perimeter
 *                     wall ⇒ it can host ZERO windows).
 *   C (circulation) — a room is land-locked (no DIRECT door onto the spine).
 *   R (reach)       — §DIAG-CIRCULATION-REACH: a HABITABLE room is SEALED /
 *                     unreachable from the ENTRANCE through the door + open-threshold
 *                     access graph (strictly stronger than C: catches a sealed PUBLIC
 *                     room and any disconnected-from-front room). Angle-independent.
 *   P (privacy)     — a private room opens DIRECTLY off the entrance hall.
 *   O (overlap)     — §ROOM-OVERLAP-HARD: two rooms' interior floor areas overlap
 *                     (Area(R_i ∩ R_j) > ε). `hasRoomOverlap` is the precomputed
 *                     `validateNoRoomOverlap(...).ok === false` signal.
 */
function evaluateHardTopology(args: {
    readonly bubble: BubbleGraph;
    readonly frontageHardRoomIds: readonly string[];
    readonly unroutedToCirculationRoomIds: readonly string[];
    readonly doorOpenings: readonly DoorOpening[];
    readonly hasRoomOverlap: boolean;
    /** §DIAG-MIN-AREA-GATE (§68.1) — true ⇒ at least one habitable room is below its areaMin. */
    readonly hasUnderMinArea: boolean;
    /** §DIAG-MANDATORY-GATE (§68.2) — true ⇒ at least one requested mandatory room is missing. */
    readonly hasMissingMandatory: boolean;
    /** §DIAG-CIRCULATION-REACH (§55) — the HABITABLE rooms the access graph cannot
     *  reach from the entrance (the SEALED set). Non-empty ⇒ Rule R fails. Computed
     *  angle-independently by `unreachableHabitableRoomIds`. */
    readonly unreachableHabitableRoomIds: readonly string[];
}): readonly HardFailedRule[] {
    const { bubble, frontageHardRoomIds, unroutedToCirculationRoomIds, doorOpenings, hasRoomOverlap, hasUnderMinArea, hasMissingMandatory, unreachableHabitableRoomIds } = args;
    const typeById = new Map<string, string>();
    for (const r of bubble.rooms) typeById.set(r.id, r.type);

    const failed: HardFailedRule[] = [];

    // Rule W — a windowMandatory room with no perimeter frontage (the frontage
    // validator's hard findings ARE the rooms with no perimeter wall). The
    // frontage:'required' set ⊇ the windowMandatory set; intersect to the
    // founder's exact predicate so a non-windowMandatory frontage-required room
    // (none today, but future-safe) doesn't trip this rule.
    if (frontageHardRoomIds.some(id => windowMandatoryFor(typeById.get(id) ?? ''))) {
        failed.push('window');
    }

    // Rule C — any room land-locked from circulation (== !circulationRouted).
    if (unroutedToCirculationRoomIds.length > 0) {
        failed.push('circulation');
    }

    // Rule R — §DIAG-CIRCULATION-REACH (tracker §55, 2026-06-11). A SEALED habitable
    // room: a living/kitchen/dining/master/bedroom/study that the door + open-threshold
    // ACCESS GRAPH cannot reach FROM THE ENTRANCE. This is STRICTLY STRONGER than Rule C
    // in two ways the founder hit: (a) Rule C only inspects PRIVATE/SERVICE rooms via
    // `unroutedToCirculationRoomIds` and so MISSES a sealed PUBLIC room (a living/kitchen
    // with zero doors is reachable=false but circulation-routed=true); (b) Rule C asks
    // "has a DIRECT circulation door", not "is reachable from the entrance", so a room
    // reachable only across a disconnected sub-graph (no path back to the front door) can
    // pass Rule C yet be a genuine sealed room. Rule R closes both. It is computed
    // ANGLE-INDEPENDENTLY (pure graph BFS over doors + open thresholds — no axis-aligned
    // bbox, no room-polygon orientation), so it rejects a sealed room on a ROTATED/SKEWED
    // plate identically to an axis-aligned one (the founder's prior angle-dependent miss).
    if (unreachableHabitableRoomIds.length > 0) {
        failed.push('reach');
    }

    // Rule P — a private room opens DIRECTLY off the entrance hall. We read the
    // realised door set: a door between a `hall`-type room and a private room is a
    // privacy breach (`hall.accessFrom` lists only living/corridor). The
    // forbidden-adjacency validator already rejects this pair, but the founder
    // wants it as an explicit hard rule so a least-bad fallback that ships such a
    // door is still ranked below a hard-valid plan.
    for (const o of doorOpenings) {
        if (o.type !== 'door') continue;
        const [a, b] = o.betweenRoomIds as readonly [string, string?];
        if (!a || !b) continue;
        const ta = typeById.get(a);
        const tb = typeById.get(b);
        if (!ta || !tb) continue;
        const hallSide = roomRule(ta).type === 'hall' ? tb : roomRule(tb).type === 'hall' ? ta : null;
        if (hallSide && isPrivate(hallSide)) {
            failed.push('privacy');
            break;
        }
    }

    // Rule O — §ROOM-OVERLAP-HARD (founder bug, 2026-06-10). Any pairwise interior
    // floor-area overlap makes the candidate hard-invalid, so a non-overlapping
    // strategy is preferred when one exists (and the §TOPO-HARD-REJECT-ALL least-bad
    // path still ships when ALL strategies overlap — a genuinely over-capacity shell).
    if (hasRoomOverlap) {
        failed.push('overlap');
    }

    // Rule A — §DIAG-MIN-AREA-GATE (tracker §68.1, 2026-06-11). A habitable room
    // (living/kitchen/dining/master/bedroom/study) emitted below its own
    // `roomDimensions[type].areaMin` is a hard architectural failure (a "2 m²
    // bedroom"). The engine must drop a room before it shrinks one under its
    // minimum, so any candidate that still carries a sub-areaMin habitable room
    // ranks BELOW every candidate that doesn't — never just low-scored.
    if (hasUnderMinArea) {
        failed.push('minarea');
    }

    // Rule M — §DIAG-MANDATORY-GATE (tracker §68.2, 2026-06-11). A requested
    // mandatory room (kitchen / living / the requested bedroom + bathroom counts)
    // MISSING from the realised layout is a hard failure: the picker must never be
    // offered a candidate that silently dropped the kitchen or living down to a low
    // score. A universal `mandatory` failure is surfaced as a structured rejection
    // by `enumerateLayouts` (empty result + reason), like the §ENVELOPE-DIAGNOSTIC.
    if (hasMissingMandatory) {
        failed.push('mandatory');
    }

    return failed;
}

/**
 * §DIAG-MANDATORY-GATE (tracker §68.2) — the set of mandatory room TYPES the program
 * REQUESTED, as a multiset count keyed by type. Mirrors `buildBubbleGraph`'s minting:
 *   • kitchen — unless `includeKitchen === false`
 *   • living  — when `livingRoom` is set
 *   • dining  — when `openPlanKitchenDining` is set (a separate dining room is minted)
 *   • bedroom/master — `bedrooms` count (the first is a master iff `masterEnSuite`)
 *   • bathroom — `bathrooms` count
 * Small apartments (studio / 1-bed) that legitimately set `livingRoom:false` get NO
 * living in the requested set, so the gate is keyed on the REQUESTED program, never a
 * blanket rule. Hall / corridor / ensuite / wc / study / utility are NOT mandatory
 * here (they are desirable-but-droppable; the §FEASIBILITY-ALLOC drop logic governs
 * them). Pure + deterministic.
 */
function requestedMandatoryCounts(program: ApartmentProgram): Map<RoomType, number> {
    const want = new Map<RoomType, number>();
    const add = (t: RoomType, n: number): void => { if (n > 0) want.set(t, (want.get(t) ?? 0) + n); };
    if (program.includeKitchen !== false) add('kitchen', 1);
    if (program.livingRoom) add('living', 1);
    if (program.openPlanKitchenDining) add('dining', 1);
    const beds = Math.max(0, Math.floor(program.bedrooms));
    const baths = Math.max(0, Math.floor(program.bathrooms));
    if (beds > 0) {
        if (program.masterEnSuite) { add('master', 1); add('bedroom', beds - 1); }
        else add('bedroom', beds);
    }
    add('bathroom', baths);
    return want;
}

/** Coordinate transform for a strategy (involutions ⇒ inv is the reverse compose). */
function makeTransform(bb: Rect, s: Strategy): { fwd: (p: Pt) => Pt; inv: (p: Pt) => Pt } {
    const mir = (p: Pt): Pt => (s.mirror ? { x: bb.x0 + bb.x1 - p.x, z: p.z } : p);
    const sw = (p: Pt): Pt => (s.axis ? { x: p.z, z: p.x } : p);
    return { fwd: p => sw(mir(p)), inv: p => mir(sw(p)) };
}
const xfRect = (r: Rect, f: (p: Pt) => Pt): Rect => {
    const a = f({ x: r.x0, z: r.z0 }), b = f({ x: r.x1, z: r.z1 });
    return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
};

/** Build one candidate layout for a strategy. Returns null if it can't be placed. */
function buildCandidate(input: EnumerateInput, shellArea: number, s: Strategy): TglCandidate | null {
    const bb = polygonBBox(input.shellPolygon);
    const t = makeTransform(bb, s);
    const polyT = input.shellPolygon.map(t.fwd);
    let rectsT = decomposeToRects(polyT);
    if (rectsT.length === 0) return null;

    // §STAIR-KEEPOUT (A.21.D21) — carve the reserved stair core(s) out of the
    // buildable rect set so no room/partition tiles across the stair. The keep-out
    // rects arrive in the engine plan frame; map each into THIS strategy's frame
    // (the same `t.fwd` the shell polygon went through — a mirror/swap transform
    // keeps rectangles axis-aligned, so `xfRect` is exact) before subtracting.
    //
    // The carve is INFLATED by KEEPOUT_MARGIN_M on every side. Rationale: the
    // subdivider runs a post-pass alignment snap (`snapAxisLines`, clustering edges
    // within ALIGNMENT_SNAP_EPS_M = 0.05 m and snapping to the cluster mean), which
    // can nudge a carved room edge a few cm BACK toward the core after subtraction.
    // Reserving a 0.05 m clearance ring guarantees that even a worst-case snap leaves
    // every room strictly clear of the actual stair footprint — a genuine keep-out,
    // and an architecturally-correct clearance gap around the stair.
    let stairCarved = false;                      // §STAIR-OBSTACLE-CARVE signal
    // §STAIR-CIRC-FACE (2026-06-11) — the inflated keep-out(s) in THIS strategy's frame,
    // hoisted so the subdivider can orient the corridor against the stair (see below).
    let holesT: Rect[] = [];
    if (input.keepOutRects && input.keepOutRects.length > 0) {
        holesT = input.keepOutRects.map(r => {
            const h = xfRect(r, t.fwd);
            return {
                x0: h.x0 - KEEPOUT_MARGIN_M, z0: h.z0 - KEEPOUT_MARGIN_M,
                x1: h.x1 + KEEPOUT_MARGIN_M, z1: h.z1 + KEEPOUT_MARGIN_M,
            };
        });
        const before = rectsT.length;
        rectsT = subtractRectsFromRects(rectsT, holesT);
        if (rectsT.length === 0) return null;     // core consumed the whole plate
        // The carve actually fractured the plate (added sub-rects) → flag the
        // subdivider so it keeps a corridor spine across the hole rather than
        // packing each fragment independently (the central-stair merged-blob fix).
        stairCarved = rectsT.length > before;
    }

    // §L1-α-3 — pass shell polygon so the bubble graph carries a per-edge
    // FacadeValueField (env / facadeValueField.ts). No downstream consumer
    // today; ready for the next commit's façade-priority allocator.
    // A.25.3 — the `space` slider modulates habitable-room area weights. Absent /
    // neutral (1.0) ⇒ byte-identical bubble graph (Pareto-equality invariant).
    // §ENVELOPE-FIT-GROWTH (founder bug #1, 2026-06-10) — enable the apartment §3.1
    // envelope-fit bedroom growth ONLY on the apartment path. A HOUSE storey injects an
    // `envelopeValidator` (validateHouseStorey) and has ALREADY sized + clamped its storey
    // bedroom count via the house's own 'ground'/'upper' density; growing it again to the
    // apartment envelope wrongly inflates the sub-programme (the §HOUSE-PLATE blob
    // regression). The internal re-scale DENSITY stays 'single' for both (the house always
    // relied on it as a no-op 130-rule floor) — only the new growth is suppressed, so the
    // house is byte-identical (ADR-0061). Apartment: no validator ⇒ growth ON ⇒ bug cured.
    const envelopeFitGrowth = !input.envelopeValidator;
    const base = buildBubbleGraph(
        input.program, shellArea, input.shellPolygon,
        (input.spaceGenerosity !== undefined || !envelopeFitGrowth)
            ? {
                ...(input.spaceGenerosity !== undefined ? { spaceGenerosity: input.spaceGenerosity } : {}),
                envelopeFitGrowth,
            }
            : undefined,
    );
    let bubble: BubbleGraph = s.order === 'rev' ? { ...base, rooms: [...base.rooms].reverse() } : base;

    // A.25.3 — the `accessibility` slider widens the corridor strip. Absent ⇒ the
    // subdivider uses its built-in CORRIDOR_STRIP_WIDTH_M (1.2 m).
    // §STAIR-OBSTACLE-CARVE — `stairCarved` tells the subdivider a stair keep-out
    // fractured the plate so it keeps a corridor spine across the hole. Both
    // options reach subdivideWithReport.
    // §ENTRANCE-HALL-ON-SHELL (tracker §57.4, 2026-06-11) — the shell was RECTIFIED iff its
    // rectified (bbox) form differs from the raw perimeter (a sheared/skewed convex quad). On
    // such a plate the subdivider suppresses the hall-slice (the §RECTIFY-SHELL-PROJECT invariant
    // only snaps bbox-edge endpoints, so a re-squarified `others` partition could dangle a few cm
    // shy of the projected ring). Axis-aligned rectangle / L / U / T → rectify is the identity →
    // false → the hall-slice runs (the founder's primary case).
    const rectifiedPoly = rectifyConvexQuad(input.shellPolygon);
    const shellRectified =
        rectifiedPoly.length !== input.shellPolygon.length ||
        rectifiedPoly.some((p, i) => Math.abs(p.x - input.shellPolygon[i]!.x) > 1e-6 || Math.abs(p.z - input.shellPolygon[i]!.z) > 1e-6);
    const subRes = subdivideWithReport(
        rectsT, bubble,
        {
            stairCarved,
            shellRectified,
            ...(input.corridorWidthM !== undefined ? { corridorWidthM: input.corridorWidthM } : {}),
            // §STAIR-CIRC-FACE — pass the inflated keep-out(s) so the subdivider orients the
            // corridor/landing to share a wall with the stair (founder defect 2026-06-11).
            ...(holesT.length > 0 ? { keepOutRects: holesT } : {}),
        },
    );
    const placementsT = subRes.placements;
    if (placementsT.length === 0) return null;
    // §FEASIBILITY-ALLOC (A.21.D5) — rooms the subdivider could not place at
    // their min short side, even after the area-rebalance retry. Carried onto
    // the candidate so enumerateLayouts can prefer a strategy that drops fewer
    // rooms and surface the structured shortfall (never a silent drop).
    const droppedRooms: readonly DroppedRoom[] = subRes.droppedRooms;
    let placements: RoomPlacement[] = placementsT.map(p => ({ roomId: p.roomId, rect: xfRect(p.rect, t.inv) }));

    // ── Window-aware partition snap (post-subdivide, WORLD frame) ─────────
    // For every interior partition coordinate that lands inside a shell-wall
    // window span, nudge it to the nearest clearance edge so the partition
    // never terminates inside a window opening (user-reported defect 2026-05-26)
    // OR a pre-existing exterior door opening (§DOOR-AVOIDANCE 2026-05-29 —
    // the architect screenshot shows interior walls crossing the front door
    // when it's placed before generation runs). The snap is the same algorithm
    // — both opening kinds are axis-aligned perimeter spans — so we just merge
    // both arrays and pass them through. No-op when both lists are empty.
    const clearanceSpans = [
        ...(input.windowSpansWorld ?? []),
        ...(input.doorSpansWorld ?? []),
    ];
    if (clearanceSpans.length > 0) {
        const idMap = new Map<string, RoomPlacement>();
        const rectsWithIds = placements.map(p => {
            const r = { id: p.roomId, x0: p.rect.x0, z0: p.rect.z0, x1: p.rect.x1, z1: p.rect.z1 };
            idMap.set(r.id, p);
            return r;
        });
        const { rects: snapped } = snapRectsAwayFromWindows(
            rectsWithIds, clearanceSpans, input.windowClearanceM ?? 0.1,
        );
        placements = snapped.map(r => ({ roomId: r.id, rect: { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 } }));
    }

    // §STAIR-OBSTACLE-CARVE — EMIT a named `stair` room (founder rule #1, ADR-0063).
    // The stair keep-out was SUBTRACTED from the buildable plate above (so no room
    // tiles across it); here we MODEL that same region as a first-class `stair` room
    // so the modal draws a "Stair" cell EQUAL to the executed stair footprint and the
    // executor never places a habitable room there. We add ONE `stair` ProgramRoom to
    // the bubble + ONE `stair` placement at the keep-out rect (already in the engine
    // frame, like `placements` after the t.inv map back). The reconcile pass then
    // connects it to the circulation spine (corridor / hall) over the shared wall —
    // `doorAllowedBetween('stair','corridor'/'hall')` holds (stair.accessFrom). The
    // stair is `frontage:'none'` + not windowMandatory, so it never trips the
    // frontage / window gates. House-only: the apartment never passes a keep-out, so
    // `input.keepOutRects` is empty and this block is skipped (byte-identical, ADR-0061).
    if (input.keepOutRects && input.keepOutRects.length > 0) {
        const circId = bubble.corridorId ?? bubble.entryId;   // landing/corridor, else hall
        const stairRooms: ProgramRoom[] = [];
        const stairEdges: AdjacencyEdge[] = [];
        const stairPlacements: RoomPlacement[] = [];
        input.keepOutRects.forEach((ko, i) => {
            // The plate was carved with the keep-out INFLATED by KEEPOUT_MARGIN_M on
            // every side (so rooms sit a 0.05 m clearance ring clear of the real core).
            // Fill that SAME inflated region with the stair rect so the stair is FLUSH
            // with the cleared rooms — its faces are then coincident with the adjacent
            // room/corridor faces, so `buildWallsAndDoors` shares a wall + the reconcile
            // pass can place the stair↔circulation door.
            //
            // §STAIR-SHELL-CLAMP (v102 regression cure, 2026-06-10) — the inflation must
            // NEVER push the stair rect past the shell perimeter. When a keep-out ABUTS the
            // façade (the GROUND-floor stair against the bottom wall in the founder v101
            // screenshot), `ko ± KEEPOUT_MARGIN_M` puts the stair's outer edge 0.05 m OUTSIDE
            // the shell → that one-sided edge becomes a wall stub BEYOND the façade (the
            // purple wall the founder saw) AND the inflated interior edges no longer coincide
            // with a neighbour room face, so they emit EXTRA seal walls (the ground-only
            // "EXTRA 4" the §DIAG-LEVELS log reported). CLAMP the inflated rect back into the
            // shell bounding box: the un-inflated keep-out is guaranteed fully inside the
            // shell (the orchestrator's R3 `keepOutInShell === 4` gate), so an edge clamped to
            // the bbox lies ON the perimeter (→ §FRACTURE-SEAL classifies it EXTERNAL → the
            // executor's pre-drawn shell already bounds the stair, no duplicate wall) and a
            // fully-interior edge is unchanged (the inflation is preserved, still flush with
            // the cleared rooms). On an interior keep-out (no façade contact) the clamp is a
            // no-op → byte-identical (ADR-0061). `bb` is the shell-polygon bbox in this
            // (world) frame, computed once above.
            const rect: Rect = {
                x0: Math.max(ko.x0 - KEEPOUT_MARGIN_M, bb.x0),
                z0: Math.max(ko.z0 - KEEPOUT_MARGIN_M, bb.z0),
                x1: Math.min(ko.x1 + KEEPOUT_MARGIN_M, bb.x1),
                z1: Math.min(ko.z1 + KEEPOUT_MARGIN_M, bb.z1),
            };
            // Skip a degenerate keep-out (sub-mm) — nothing to model.
            if (rect.x1 - rect.x0 < 1e-3 || rect.z1 - rect.z0 < 1e-3) return;
            const id = `stair${i}`;
            stairRooms.push({
                id, type: 'stair',
                name: input.keepOutRects!.length > 1 ? `Stair ${i + 1}` : 'Stair',
                targetAreaM2: round6((rect.x1 - rect.x0) * (rect.z1 - rect.z0)),
                isPrivate: false, needsWindow: false,
            });
            stairPlacements.push({ roomId: id, rect });
            // Connect the stair to the circulation it serves (door). The geometric
            // door is only realised if the stair shares a real wall with `circId`;
            // when it does not, the reconcile pass still routes it over any permitted
            // shared wall (stair.accessFrom = corridor/hall) so it is never sealed.
            if (circId) stairEdges.push({ a: id, b: circId, via: 'door' });
        });
        if (stairRooms.length > 0) {
            bubble = {
                ...bubble,
                rooms: [...bubble.rooms, ...stairRooms],
                edges: [...bubble.edges, ...stairEdges],
            };
            placements = [...placements, ...stairPlacements];

            // §STAIR-SPINE-TOUCH (founder defect, 2026-06-10) — the stair room sits at
            // the carved keep-out, which is OUTSIDE the dominant rect the corridor was
            // carved into, so the stair often does NOT share a wall with the corridor →
            // `buildWallsAndDoors` can place no door and the stair ships SEALED (the prod
            // log `stair0(stair) → NO DOOR`; the stair may only door onto a corridor/hall
            // per `stair.accessFrom`, so the multihop reroute can't rescue it either).
            // CURE: when the corridor and a stair are SEPARATED ONLY BY EMPTY SPACE (the
            // carved clearance sliver — never another room), GROW the corridor rect across
            // that gap so its face becomes coincident with the stair's → a shared wall →
            // the §STAIR-ROOM-DOOR reconcile pass places the corridor↔stair door. The
            // growth is REJECTED if it would overlap any non-corridor/non-stair room
            // (interior floor), so a room is never clipped (§EVERY-ROOM-ACCESS preserved).
            // Pure + deterministic; house-only (apartment passes no keep-out).
            if (circId) {
                const corIdx = placements.findIndex(p => p.roomId === circId);
                if (corIdx >= 0) {
                    let cor = placements[corIdx]!.rect;
                    const others = placements.filter(p => p.roomId !== circId);
                    const interiorOverlaps = (r: Rect): boolean => others.some(p => {
                        if (p.roomId.startsWith('stair')) return false;   // empty sliver / the target stair
                        const ox = Math.min(r.x1, p.rect.x1) - Math.max(r.x0, p.rect.x0);
                        const oz = Math.min(r.z1, p.rect.z1) - Math.max(r.z0, p.rect.z0);
                        return ox > 1e-3 && oz > 1e-3;                    // real interior-area overlap
                    });
                    const sharesWall = (a: Rect, b: Rect): boolean => {
                        const vAbut = Math.abs(a.x1 - b.x0) < 0.05 || Math.abs(b.x1 - a.x0) < 0.05;
                        const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
                        if (vAbut && zOv > 0.05) return true;
                        const hAbut = Math.abs(a.z1 - b.z0) < 0.05 || Math.abs(b.z1 - a.z0) < 0.05;
                        const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
                        return hAbut && xOv > 0.05;
                    };
                    let bridged = 0;
                    const unbridged: RoomPlacement[] = [];
                    for (const sp of stairPlacements) {
                        if (sharesWall(cor, sp.rect)) { bridged++; continue; }   // already touching
                        // Grow the corridor toward the stair on the axis with the smaller
                        // gap (the clearance sliver), keeping the perpendicular overlap so
                        // the new face actually coincides with the stair edge. Try each of
                        // the 4 directions; accept the first that touches without overlap.
                        const candidates: Rect[] = [
                            { ...cor, x1: Math.max(cor.x1, sp.rect.x0) },   // grow +x to stair's left
                            { ...cor, x0: Math.min(cor.x0, sp.rect.x1) },   // grow −x to stair's right
                            { ...cor, z1: Math.max(cor.z1, sp.rect.z0) },   // grow +z to stair's near
                            { ...cor, z0: Math.min(cor.z0, sp.rect.z1) },   // grow −z to stair's far
                        ];
                        let grew = false;
                        for (const cand of candidates) {
                            if (cand.x1 - cand.x0 < 1e-3 || cand.z1 - cand.z0 < 1e-3) continue;
                            if (interiorOverlaps(cand)) continue;
                            if (!sharesWall(cand, sp.rect)) continue;
                            cor = cand;
                            placements[corIdx] = { roomId: circId, rect: cand };
                            bridged++; grew = true;
                            break;
                        }
                        if (!grew) unbridged.push(sp);
                    }
                    console.log(
                        `[D-TGL] §STAIR-SPINE-TOUCH cand ${strategyKey(s)} corridor=${circId} ` +
                        `stairsBridgedToCorridor=${bridged}/${stairPlacements.length}`,
                    );

                    // §STAIR-CIRC-STUB (founder defect §65.3, 2026-06-11) — the FRAGMENTED-DENSE
                    // fallback: on a dense GROUND plate the corridor is a full-width strip on one
                    // z-band and the stair sits on the OPPOSITE z-edge with the private comb in
                    // between, so neither the §STAIR-CIRC-FACE reflection (a parallel strip can't
                    // reach an opposite-edge keep-out) nor the §STAIR-SPINE-TOUCH straight grow
                    // (the comb blocks it) connects the stair → it ships served through a bedroom.
                    // CURE: route a PERPENDICULAR corridor STUB through the EMPTY band beside the
                    // keep-out and mint it as a DEDICATED circulation room (`corridorStubN`, type
                    // corridor) wired stub↔corridor + stub↔stair — ONE rect per room (so the
                    // semantic graph stays clean; no duplicate corridor placement). Empty-space
                    // only: never carves through a habitable room (no overlap). When no empty
                    // channel exists the stair stays on the door-pipeline reroute (the §65.3
                    // compromise the brief permits). House-only; deterministic.
                    // §STUB-ONLY-RESCUE-CLEAN — fire the stub ONLY when it WON'T flip the Pareto
                    // winner toward a worse-SIZED candidate on a plate v142 already handled. The
                    // §PLATE-ROLE sizer tests guard against "blob" candidates (an OVERSIZED room —
                    // bedroom 85 m², bathroom 27 m²): without the stub such a candidate ships
                    // circulation-FAILED and ranks below the well-sized winner; WITH a stub it becomes
                    // circulation-routed and wrongly WINS. So we skip the stub on any candidate that
                    // ALREADY carries a room overlap OR an OVERSIZE / blob shape finding (areaHardMax,
                    // widthHardMax, lengthHardMax, aspectHardMax) — adding a stub there would only
                    // perturb the ranking. We DELIBERATELY still stub a candidate whose only shape
                    // flaws are UNDERSIZE (areaMin / widthMin) — the genuinely over-constrained dense
                    // founder plate the brief says to keep "clear+connected" (the §65.3 compromise).
                    const typeOfRoom = new Map(bubble.rooms.map(r => [r.id, r.type]));
                    const habitable = placements.filter(p => (typeOfRoom.get(p.roomId) ?? '') !== 'stair');
                    const preStubOverlap = validateNoRoomOverlap(
                        habitable.map(p => ({ id: p.roomId, rect: p.rect })),
                    ).ok === false;
                    const preStubShapes: RoomShape[] = [];
                    for (const p of habitable) {
                        const t = typeOfRoom.get(p.roomId);
                        if (t) preStubShapes.push({ id: p.roomId, type: t, rect: p.rect });
                    }
                    const OVERSIZE_METRICS = new Set(['areaHardMax', 'widthHardMax', 'lengthHardMax', 'aspectHardMax']);
                    const preStubBlob = validateAllRoomShapes(preStubShapes).hardFindings
                        .some(f => OVERSIZE_METRICS.has(f.metric));
                    if (unbridged.length > 0 && !preStubOverlap && !preStubBlob) {
                        const shellBBWorld = polygonBBox(input.shellPolygon);
                        const typeByRoomId = new Map(bubble.rooms.map(r => [r.id, r.type]));
                        let stubbed = 0;
                        unbridged.forEach((sp, k) => {
                            const stubRect = findCorridorStubToKeepOut(
                                placements, circId, [sp.rect], typeByRoomId,
                                input.corridorWidthM ?? 1.2, shellBBWorld,
                            );
                            if (!stubRect) return;
                            const stubId = `corridorStub_${sp.roomId}_${k}`;
                            const stubRoom: ProgramRoom = {
                                id: stubId, type: 'corridor', name: 'Stair Corridor',
                                targetAreaM2: round6(rectArea(stubRect)),
                                isPrivate: false, needsWindow: false,
                            };
                            bubble = {
                                ...bubble,
                                rooms: [...bubble.rooms, stubRoom],
                                edges: [
                                    ...bubble.edges,
                                    { a: stubId, b: circId, via: 'open' },   // stub IS the corridor — no door between
                                    { a: sp.roomId, b: stubId, via: 'door' }, // the stair's door lands on the stub
                                ],
                            };
                            placements = [...placements, { roomId: stubId, rect: stubRect }];
                            typeByRoomId.set(stubId, 'corridor');
                            stubbed++;
                        });
                        console.log(
                            `[D-TGL] §STAIR-CIRC-STUB cand ${strategyKey(s)} routed ${stubbed}/${unbridged.length} ` +
                            `empty-space corridor stub(s) to otherwise-landlocked stair(s) (§65.3)`,
                        );
                    }
                }
            }

            console.log(
                `[D-TGL] §STAIR-ROOM cand ${strategyKey(s)} emitted ${stairRooms.length} stair room(s) ` +
                `at keep-out connected=${circId ? `→${circId}` : 'NONE'}`,
            );
        }
    }

    // §DIAG-FILL-RESIDUAL (founder defect §65.2, 2026-06-11) — guarantee EVERY plate is
    // fully tiled by NAMED rooms (no blank "Room NN" cell). On a large/dense HOUSE plate the
    // stair keep-out fractures the plate; the §STAIR-CARVE-NO-DROP short-circuit packs the
    // whole programme into the DOMINANT rect and leaves the side fragments (e.g. a 51 m² band)
    // EMPTY → room detection ships them as the founder's "Room 00-001 63.9 m²" blanks.
    //
    // RANK-NEUTRALITY (critical): the claim is computed here but applied to the EMITTED geometry
    // ONLY (`graph` below) — it is DELIBERATELY EXCLUDED from every SCORING / gate computation
    // (shapeVal, objectives, validators, Pareto rank), which all run on the UN-augmented
    // `placements`/`bubble`. So the residual fill can NEVER flip the Pareto winner toward an
    // otherwise-inferior candidate (e.g. promoting a squarified-blob plate). The chosen plan is
    // identical to the pre-fix ranking; we then fill ITS blanks. House-only (gated on a keep-out):
    // apartment passes none ⇒ no claim ⇒ byte-identical (ADR-0061). The stair keep-out is honoured
    // by construction (the buildable set has the stair subtracted + every stair placement is
    // occupied), so no grown/minted cell ever tiles across the stair (v149 keep-out invariant).
    // §RESIDUAL-RECTILINEAR-ONLY — suppress the claim on a RECTIFIED (sheared/skewed convex
    // quad) shell, exactly as the §ENTRANCE-HALL-ON-SHELL hall-slice is suppressed there: the
    // residual rects are computed from the rectified (bbox) decomposition, so on a sheared ring
    // a minted cell's outer edge can dangle a fraction off the projected perimeter → an open
    // seam (the §RECTIFY-SHELL-PROJECT invariant only snaps bbox-EDGE endpoints). The founder's
    // §65.2 blanks are RECTILINEAR-plate cases (rectangle / L / U / T — never rectified), where
    // every minted edge lands exactly on the perimeter. Axis-aligned ⇒ `shellRectified` false ⇒
    // the claim runs (the founder's case). Apartment never reaches here (no keep-out).
    let residualMints: readonly NonNullable<import('./subdivide.js').ClaimedResidual['mint']>[] = [];
    let residualPlacements: readonly RoomPlacement[] = placements;
    if (input.keepOutRects && input.keepOutRects.length > 0 && placements.length > 0 && !shellRectified) {
        const stairExclusions: Rect[] = [...input.keepOutRects, ...(input.residualExcludeRects ?? [])];
        const buildableWorld = subtractRectsFromRects(
            decomposeToRects(input.shellPolygon), stairExclusions,
        );
        // Per-room max-area cap (§AREA-FRACTIONS: maxAreaFrac × shellArea; ∞ when uncapped) so a
        // GROWN room can never exceed its own ceiling (no "master over-allocated" oversize).
        const roomMeta = new Map<string, { type: RoomType; maxAreaM2: number }>();
        for (const r of bubble.rooms) {
            const frac = roomRule(r.type).maxAreaFrac;
            roomMeta.set(r.id, {
                type: r.type,
                maxAreaM2: frac !== undefined ? frac * shellArea : Number.POSITIVE_INFINITY,
            });
        }
        // §STAIR-LANDING-SEAL (founder §68.6) — pass the INFLATED stair keep-out(s) so the
        // residual claim ALWAYS seals a blank band that abuts the stair (the unwalled landing
        // slack that floods the stair room at detection — the founder's oversized-stair
        // defect), even on a plate that is otherwise below the §65.2 cavern gate. The
        // residualExcludeRects (the reserved cell) are NOT stair adjacency keys — only the
        // SHIPPED keep-out is the wall a landing-band shares — so we pass `input.keepOutRects`.
        const claim = claimResidualPlacements(
            placements, buildableWorld, roomMeta, strategyKey(s), input.keepOutRects,
        );
        residualMints = claim.mints;
        residualPlacements = claim.placements;
        console.log(
            `[D-TGL] §DIAG-FILL-RESIDUAL cand ${strategyKey(s)} ` +
            `largestBlankBefore=${claim.largestBlankBeforeM2.toFixed(1)} totalBlankBefore=${claim.totalBlankBeforeM2.toFixed(1)} ` +
            `→ grown+minted ${claim.mints.length} mint(s) ` +
            `largestBlankAfter=${claim.largestBlankM2.toFixed(1)} totalBlankAfter=${claim.totalBlankM2.toFixed(1)} ` +
            `(target ~0; >2 m² after ⇒ a still-blank cell — the §65.2 defect surface)`,
        );
    }

    // §D3.1 — pre-furnishing SHAPE GATE. Validate every room rectangle against
    // its dimensional envelope (D2.1). Hard findings flag the candidate as
    // `shapeAdmissible: false` — the enumerateLayouts gate prefers admissible
    // candidates. Soft findings accumulate into `shapeQuality` which Pareto-
    // ranks against. This runs BEFORE walls + doors (D-TGL's later passes don't
    // change room rectangles, so checking here is sound + cheap).
    const typeByRoomId = new Map(bubble.rooms.map(r => [r.id, r.type]));
    const roomShapes: RoomShape[] = [];
    for (const p of placements) {
        const type = typeByRoomId.get(p.roomId);
        if (!type) continue;                                  // unknown room — skip
        roomShapes.push({
            id: p.roomId, type,
            ...(bubble.rooms.find(r => r.id === p.roomId)?.name !== undefined
                ? { name: bubble.rooms.find(r => r.id === p.roomId)!.name }
                : {}),
            rect: p.rect,
        });
    }
    const shapeVal = validateAllRoomShapes(roomShapes);

    // §DIAG-MIN-AREA-GATE (tracker §68.1, 2026-06-11) — collect every HABITABLE room
    // (living/kitchen/dining/master/bedroom/study) whose realised footprint is below
    // its own `roomDimensions[type].areaMin`. A "2 m² bedroom" is the founder defect:
    // the auto-sizer must DROP a room (the §FEASIBILITY-ALLOC drop logic) rather than
    // shrink one below its minimum. A candidate that still carries such a room is
    // HARD-INVALID below. Wet/service/circulation rooms are excluded — they come small
    // by design and are governed by the short-side / drop logic, not an area floor.
    const underMinAreaRooms: { roomId: string; type: RoomType; areaM2: number; areaMinM2: number }[] = [];
    for (const rs of roomShapes) {
        if (!MIN_AREA_HABITABLE_TYPES.has(rs.type)) continue;
        const areaMinM2 = dimensionsFor(rs.type).areaMin;
        const areaM2 = (rs.rect.x1 - rs.rect.x0) * (rs.rect.z1 - rs.rect.z0);
        if (areaM2 < areaMinM2 - 1e-6) {
            underMinAreaRooms.push({ roomId: rs.id, type: rs.type, areaM2, areaMinM2 });
        }
    }
    const hasUnderMinArea = underMinAreaRooms.length > 0;

    // §DIAG-MANDATORY-GATE (tracker §68.2, 2026-06-11) — the requested mandatory room
    // multiset (kitchen/living/dining/bedroom+master/bathroom, keyed on the REQUESTED
    // program) MUST be fully present in the realised PLACED set. A candidate that
    // dropped a mandatory room to a low score is HARD-INVALID below. We count the
    // PLACED rooms by type (a dropped room has no placement, so it is absent here) and
    // compare against the requested multiset.
    //
    // The requested mandatory multiset is read from the BUBBLE's MINTED rooms (which
    // already reflect any `roomTypesByName` re-type — e.g. "Bedroom 2 → Study" removes a
    // bedroom from the requested set), NOT the raw program flags, so a re-typed program
    // is judged on what it actually asked the engine to build. We intersect the minted
    // types with the program's mandatory set so only kitchen/living/dining/sleeping/
    // bathroom rooms count (a minted study/hall/corridor is droppable, not mandatory).
    //
    // PATH SPLIT — the founder's §68.2 defect ("ground = Bedroom/Bath/Corridor only, no
    // kitchen + no living") spans BOTH the apartment AND the multi-storey HOUSE GROUND.
    // So the PUBLIC mandatory rooms (kitchen / living / dining) are gated on EVERY path:
    // a storey that minted them must never drop them. The SLEEPING-room + BATHROOM COUNT
    // check, however, is APARTMENT-ONLY (`!input.envelopeValidator`): the house storey
    // program deliberately OVER-REQUESTS bedrooms (the density allocates e.g. 7 to a
    // 500 m² plate and relies on the engine packing what fits, the rest landing on other
    // storeys), so a house storey legitimately places fewer sleeping rooms than its raw
    // request — counting them would wrongly reject every house plate (byte-identical
    // house preserved, ADR-0061).
    const isHousePath = input.envelopeValidator !== undefined;
    const PUBLIC_MANDATORY: ReadonlySet<RoomType> = new Set<RoomType>(['kitchen', 'living', 'dining']);
    const programMand = requestedMandatoryCounts(input.program);
    const mandTypes = new Set<RoomType>(programMand.keys());
    const wantMand = new Map<RoomType, number>();
    for (const r of bubble.rooms) {
        if (!mandTypes.has(r.type)) continue;
        // On the house path, count ONLY the public mandatory rooms (kitchen/living/
        // dining); skip the sleeping + bathroom count (the house over-requests those).
        if (isHousePath && !PUBLIC_MANDATORY.has(r.type)) continue;
        wantMand.set(r.type, (wantMand.get(r.type) ?? 0) + 1);
    }
    const placedByType = new Map<RoomType, number>();
    for (const rs of roomShapes) placedByType.set(rs.type, (placedByType.get(rs.type) ?? 0) + 1);
    // Sleeping rooms (master + bedroom) are compared as ONE combined count: the gate
    // cares that the requested NUMBER of sleeping rooms is present, not how the engine
    // split master vs secondary. A genuinely missing bedroom (a dropped sleeping room)
    // still trips the gate; a master↔bedroom re-label does not. (Empty on the house path.)
    const wantSleep = (wantMand.get('master') ?? 0) + (wantMand.get('bedroom') ?? 0);
    const haveSleep = (placedByType.get('master') ?? 0) + (placedByType.get('bedroom') ?? 0);
    const missingMandatoryTypes: RoomType[] = [];
    for (const [type, need] of wantMand) {
        if (type === 'master' || type === 'bedroom') continue;   // handled by the combined sleep count
        const have = placedByType.get(type) ?? 0;
        for (let i = 0; i < need - have; i++) missingMandatoryTypes.push(type);
    }
    for (let i = 0; i < wantSleep - haveSleep; i++) missingMandatoryTypes.push('bedroom');
    const hasMissingMandatory = missingMandatoryTypes.length > 0;

    // §D2.2 (2026-05-30) — fold the furniture-fit lower-bound check into the
    // same shape gate. A room that's geometrically valid (D2.1) but too
    // small for its required furniture program (D2.2) is dropped at the
    // same gate. Soft findings (rooms tight against the fit lower bound)
    // accumulate into `shapeQuality` alongside the existing D2.1 soft
    // findings.
    let fitAdmissible = true;
    const fitSoftSum: { delta: number } = { delta: 0 };
    for (const rs of roomShapes) {
        const fit = validateRoomFit({
            roomId: rs.id, type: rs.type,
            ...(rs.name !== undefined ? { name: rs.name } : {}),
            rect: rs.rect,
        });
        if (!fit.admissible) fitAdmissible = false;
        for (const sf of fit.softFindings) fitSoftSum.delta += sf.delta;
    }
    const shapeAdmissible = shapeVal.admissible && fitAdmissible;
    // Penalty per soft finding accumulates → shapeQuality (D2.1 + D2.2 combined).
    const softPenaltySum = shapeVal.softFindings.reduce((s, f) => s + f.delta, 0)
        + fitSoftSum.delta;
    const numRooms = Math.max(1, roomShapes.length);
    const shapeQuality = Math.max(0, Math.min(1, 1 - softPenaltySum / numRooms));

    const { segments, openings, boundaries, compromises, unroutedToCirculationRoomIds } = buildWallsAndDoors(placements, bubble, {
        ...(input.wallThicknessM !== undefined ? { wallThicknessM: input.wallThicknessM } : {}),
        ...(input.doorWidthM !== undefined ? { doorWidthM: input.doorWidthM } : {}),
        // §EXTEND-TO-PERIMETER — pass the WORLD-frame shell polygon so interior
        // walls bounding the void extend out to the actual perimeter (closes
        // the gap visible at slanted exterior walls in screenshot 2026-05-27).
        // `placements` are already in world frame (transformed back via t.inv),
        // so we use `input.shellPolygon` directly, not `polyT`.
        shellPolygon: input.shellPolygon,
    });
    const graph = buildSemanticGraph(placements, segments, openings, bubble, {
        levelId: input.levelId, seed: `${input.seed}|${strategyKey(s)}`, shellAreaM2: shellArea,
        ...(input.wallHeightM !== undefined ? { wallHeightM: input.wallHeightM } : {}),
    });
    // §T3.3 TOPOLOGY GATE — run Part B validators against the realised
    // openings + placements:
    //   • validateMandatoryAdjacencies: every declared adjacency has a door.
    //   • validateForbiddenAdjacencies: every door is a permitted pair.
    //   • validateWetCluster: wet rooms share at most one plumbing stack
    //     (SOFT — fragmentation lowers topologyQuality but doesn't drop).
    // Future T2.3 (acoustic) + T2.6 (sequence) plug in here.
    const doorOpenings: DoorOpening[] = openings.map(o => ({
        type: o.type, betweenRoomIds: o.betweenRoomIds,
    }));
    const mand = validateMandatoryAdjacencies(input.program, bubble, doorOpenings);
    const forb = validateForbiddenAdjacencies(bubble, doorOpenings);
    // Validators consume `{ id, rect }` placements; RoomPlacement uses
    // `roomId`. Adapt at the boundary so the validators can stay
    // independent of the tgl/subdivide.ts internal naming.
    const idPlacements = placements.map((p) => ({ id: p.roomId, rect: p.rect }));
    // §ROOM-OVERLAP-HARD (founder bug, 2026-06-10) — DETECT any pairwise interior
    // floor-area overlap (Area(R_i ∩ R_j) > ε). Rooms may share walls/edges/corners
    // (zero-area intersection) but NEVER interior floor. The squarified tiling is
    // exact, but the subdivider's post-passes (snapAxisLines / comb carve / window
    // snap) move rects independently, so overlaps can appear on a tight shell.
    const nameById = new Map<string, string>();
    for (const r of bubble.rooms) nameById.set(r.id, r.name);
    const overlapResult = validateNoRoomOverlap(idPlacements);
    const roomOverlaps = overlapResult.overlaps.map((o: RoomOverlap) => ({
        nameA: nameById.get(o.a) ?? o.a,
        nameB: nameById.get(o.b) ?? o.b,
        areaM2: o.areaM2,
    }));
    // §DIAG-ROOM-OVERLAP — always-on per-candidate diagnostic (logging only).
    {
        const detail = roomOverlaps
            .map(o => `${o.nameA}↔${o.nameB} area=${o.areaM2.toFixed(1)}m²`)
            .join(', ');
        console.log(
            `[D-TGL] §DIAG-ROOM-OVERLAP cand ${strategyKey(s)} ` +
            `pairsChecked=${overlapResult.pairsChecked} overlaps=${roomOverlaps.length}` +
            `${detail ? ` [${detail}]` : ''}`,
        );
    }
    const wet = validateWetCluster(bubble, idPlacements);
    const acoustic = validateAcousticZoning(bubble, idPlacements);
    const sequence = validateCirculationSequence(bubble, idPlacements, doorOpenings);
    // T1.C (2026-05-30) — every private room (bedroom/master/bathroom/ensuite/wc)
    // must have a direct door to a corridor or hall (ensuite-via-master is the
    // sole exception). SOFT-only — §BATH-CORRIDOR-ONLY already enforces the
    // worst case at generation time; this is a regression net via soft penalty.
    const corridorConn = validateCorridorConnectivity(bubble, doorOpenings);
    // §T2.5 (2026-05-30) — frontage HARD-reject: every `frontage: 'required'`
    // room (living / kitchen / master / bedroom — per T1.6) must touch the
    // shell perimeter. Catches the "habitable room buried fully interior"
    // failure that a smooth daylight axis misses (a fully-interior bedroom
    // could still register some daylight via field falloff from neighbours;
    // T2.5 makes it a hard rule). SOFT penalty for `frontage: 'preferred'`
    // rooms (dining / study) that are fully interior.
    // §FRONTAGE-RECTIFY-FRAME (rotated-plate frontage false-negative cure, 2026-06-10;
    // ADR-0063 §8.6). The room rects in `placements` were TILED by `decomposeToRects`,
    // which internally rectifies a convex quad to its bbox (§RECTIFY-QUAD) before the
    // axis-sweep — so on a freehand (rotated) quad the rooms sit on the RECTIFIED BBOX
    // edges, NOT on the raw sheared-quad edges. `rectTouchesPerimeter` only matches
    // AXIS-ALIGNED shell edges (it skips diagonals by construction); a principal-axis-
    // rotated freehand quad has FOUR diagonal edges in this frame → every room reads
    // "interior" → EVERY frontage:'required' room false-fails → all 8 strategies trip
    // the `window` hard rule (founder v107 218 m² rotated-plate defect: frontageFail=
    // [living,kitchen,hall,bed,bed], perimeterAdjacent=0, daylight=0.12).
    //
    // CURE: test frontage against the SAME perimeter the rooms were tiled against —
    // `rectifyConvexQuad(input.shellPolygon)`. This is the IDENTITY for any shell that
    // does NOT rectify (axis-aligned rectangle, concave L/U/T, > 4 vertices, sub-fill
    // quad → `rectifyConvexQuad` returns the polygon unchanged), so axis-aligned plates
    // and the apartment are BYTE-IDENTICAL (ADR-0061). Only the convex-quad path — which
    // is exactly the path that tiles to the bbox — now tests against the bbox it tiled to.
    const frontagePerimeter = rectifyConvexQuad(input.shellPolygon);
    const frontage = validateFrontage({
        shellPolygon: frontagePerimeter,
        rooms: placements.map(p => {
            const r = bubble.rooms.find(br => br.id === p.roomId);
            return {
                roomId: p.roomId,
                type: r?.type ?? 'corridor',
                ...(r?.name !== undefined ? { name: r.name } : {}),
                rect: p.rect,
            };
        }),
    });
    // §DIAG-FRONTAGE-DIST — per frontageFail room, its distance (m) to the nearest
    // perimeter edge in the FRAME BEING TESTED (the rectified frontage perimeter). A
    // near-zero distance on a "fail" proves a FALSE NEGATIVE (room is on the edge but the
    // test missed it); a metres-large distance proves a GENUINE interior room (comb /
    // stair pushed it in). Logging only — no behaviour change.
    if (frontage.hardFindings.length > 0 || frontage.softFindings.length > 0) {
        const placementById = new Map(placements.map(p => [p.roomId, p.rect]));
        const failIds = [
            ...frontage.hardFindings.map(f => f.roomId),
            ...frontage.softFindings.map(f => f.roomId),
        ];
        const detail = failIds.map(id => {
            const rect = placementById.get(id);
            const d = rect ? rectDistToPerimeter(rect, frontagePerimeter) : -1;
            return `${id}=${d < 0 ? '?' : `${d.toFixed(2)}m`}`;
        }).join(' ');
        console.log(
            `[D-TGL] §DIAG-FRONTAGE-DIST cand ${strategyKey(s)} ` +
            `rectified=${frontagePerimeter.length !== input.shellPolygon.length || frontagePerimeter.some((p, i) => Math.abs(p.x - input.shellPolygon[i]!.x) > 1e-6 || Math.abs(p.z - input.shellPolygon[i]!.z) > 1e-6)} ` +
            `[${detail}]`,
        );
    }
    // §DIAG-HALL-PERIMETER (ADR-0063, founder rule #2) — confirm the entrance hall(s)
    // abut a perimeter wall (the front door's shell edge). frontage:'required' makes a
    // fully-interior hall a HARD frontage finding, so the ranker prefers perimeter
    // halls; this line surfaces the per-candidate verdict (✓ all halls perimeter-
    // adjacent / ⚠ at least one interior). Logging only — no behaviour change.
    {
        const hallPlacements = placements.filter(p => {
            const r = bubble.rooms.find(br => br.id === p.roomId);
            return r?.type === 'hall';
        });
        if (hallPlacements.length > 0) {
            const onPerimeter = hallPlacements.filter(p =>
                // §FRONTAGE-RECTIFY-FRAME — test against the rectified frontage perimeter
                // (the frame the rooms were tiled in), identical to validateFrontage above.
                rectTouchesPerimeter(p.rect, frontagePerimeter),
            ).length;
            const allOn = onPerimeter === hallPlacements.length;
            console.log(
                `[D-TGL] §DIAG-HALL-PERIMETER cand ${strategyKey(s)} ` +
                `halls=${hallPlacements.length} perimeterAdjacent=${onPerimeter} ` +
                `${allOn ? '✓' : '⚠'}`,
            );
        }
    }
    const topologyAdmissible =
        mand.admissible && forb.admissible &&
        wet.admissible && acoustic.admissible && sequence.admissible &&
        frontage.admissible && corridorConn.admissible;
    // Quality: 1 minus soft-finding penalty sum / numRooms — same shape as
    // shapeQuality (D3.1). HARD failures still drop topologyAdmissible.
    const topoSoftSum =
        wet.softFindings.reduce((s, f) => s + f.delta, 0) +
        acoustic.softFindings.reduce((s, f) => s + f.delta, 0) +
        sequence.softFindings.reduce((s, f) => s + f.delta, 0) +
        frontage.softFindings.reduce((s, f) => s + f.delta, 0) +
        corridorConn.softFindings.reduce((s, f) => s + f.delta, 0);
    const topologyQuality = topologyAdmissible
        ? Math.max(0, Math.min(1, 1 - topoSoftSum / Math.max(1, bubble.rooms.length)))
        : 0;

    const entryGuid = graph.nodes.find(n => n.kind === 'Space' && n.sourceId === bubble.entryId)?.guid ?? null;
    const metrics = computeSpaceSyntax(graph, entryGuid);
    // §ENV-E2-SOLAR (E.2) — thread the site latitude so the solarOrientation axis
    // biases daytime rooms toward the sun face. Undefined ⇒ neutral axis.
    const objectives = computeObjectives(graph, metrics, bubble, shapeQuality, topologyQuality, input.solarLatDeg, input.adjacencyStrictness);
    // §CIRCULATION-REROUTE — a candidate is "circulation-routed" when every
    // private/service room opens onto the spine (the wallsAndDoors re-route pass
    // could place a circulation door for every such room). A non-empty
    // `unroutedToCirculationRoomIds` means at least one room is land-locked.
    const circulationRouted = unroutedToCirculationRoomIds.length === 0;

    // §DIAG-CIRCULATION-REACH (tracker §55) — ANGLE-INDEPENDENT entrance reachability:
    // the HABITABLE rooms the door + open-threshold access graph cannot reach from the
    // entrance (the SEALED set). Computed on the room/adjacency graph, NOT on any
    // axis-aligned bbox — so it rejects a sealed room on a rotated plate identically.
    const unreachableHabitable = unreachableHabitableRoomIds({ bubble, doorOpenings });
    {
        const typeById = new Map<string, string>();
        for (const r of bubble.rooms) typeById.set(r.id, r.type);
        const habitable = bubble.rooms.filter(r => REACH_HABITABLE_TYPES.has(r.type));
        const unreachNamed = unreachableHabitable
            .map(id => `${id}(${typeById.get(id) ?? '?'})`)
            .join(',') || 'none';
        console.log(
            `[D-TGL] §DIAG-CIRCULATION-REACH cand ${strategyKey(s)} ` +
            `entry=${bubble.entryId ?? 'none'} ` +
            `allHabitableReachable=${unreachableHabitable.length === 0 ? 'YES' : 'NO'} ` +
            `reachable=${habitable.length - unreachableHabitable.length}/${habitable.length} ` +
            `sealed=[${unreachNamed}]`,
        );
    }

    // §TOPO-HARD-REJECT (Stage 5) — the founder's HARD topology gate. A candidate
    // is hard-invalid if it breaks ANY architectural rule (windowless habitable room /
    // land-locked room / SEALED-unreachable habitable room / private-room-off-hall /
    // overlap / sub-min / missing-mandatory). Reuses the already-computed frontage hard
    // findings + unrouted signal + realised doors + the angle-independent reach set.
    const hardFailedRules = evaluateHardTopology({
        bubble,
        frontageHardRoomIds: frontage.hardFindings.map(f => f.roomId),
        unroutedToCirculationRoomIds,
        doorOpenings,
        hasRoomOverlap: !overlapResult.ok,
        hasUnderMinArea,
        hasMissingMandatory,
        unreachableHabitableRoomIds: unreachableHabitable,
    });
    const hardValid = hardFailedRules.length === 0;
    // §DIAG-TOPO-GATE — per-candidate hard-gate decision line (logging only).
    console.log(
        `[D-TGL] §DIAG-TOPO-GATE strategy=${strategyKey(s)} hardValid=${hardValid} ` +
        `failed=[${hardFailedRules.join(',') || 'none'}]`,
    );
    // §DIAG-MIN-AREA-GATE (tracker §68.1) — per-candidate min-area decision line: the
    // habitable rooms emitted below their areaMin (room → area < min), and whether the
    // candidate was rejected (hard-invalid). Logging only.
    {
        const detail = underMinAreaRooms
            .map(r => `${r.roomId}(${r.type})=${r.areaM2.toFixed(1)}<${r.areaMinM2}`)
            .join(' ');
        console.log(
            `[D-TGL] §DIAG-MIN-AREA-GATE cand ${strategyKey(s)} ` +
            `underMin=${underMinAreaRooms.length}${detail ? ` [${detail}]` : ''} ` +
            `rejected=${hasUnderMinArea ? 'YES' : 'no'}`,
        );
    }
    // §DIAG-MANDATORY-GATE (tracker §68.2) — per-candidate mandatory-set decision line:
    // the requested mandatory multiset vs the realised PLACED set, plus the missing
    // types (the reject reason). Logging only.
    {
        const requested = Array.from(requestedMandatoryCounts(input.program).entries())
            .map(([t, n]) => `${n}×${t}`).join(',') || 'none';
        const missing = missingMandatoryTypes.join(',') || 'none';
        console.log(
            `[D-TGL] §DIAG-MANDATORY-GATE cand ${strategyKey(s)} ` +
            `requested=[${requested}] missing=[${missing}] ` +
            `rejected=${hasMissingMandatory ? 'YES' : 'no'}`,
        );
    }

    // §DIAG-ENUM — terse per-candidate decision line (logging only; no behaviour
    // change). Surfaces the strategy, the rooms it DROPPED, the frontage-required
    // rooms that failed to touch the shell (the missing-window root), and the key
    // objective scores. `frontage.hardFindings` are the `frontage:'required'` rooms
    // that did not reach the perimeter.
    const droppedTypes = droppedRooms.map(d => d.type).join(',') || 'none';
    const frontageFailIds = frontage.hardFindings.map(f => f.roomId).join(',') || 'none';
    const weighted = weightedSum(objectives, input.weights);
    console.log(
        `[D-TGL] §DIAG-ENUM cand ${strategyKey(s)} weighted=${weighted.toFixed(3)} ` +
        `connected=${metrics.connected} shapeOK=${shapeAdmissible} topoOK=${topologyAdmissible} ` +
        `circRouted=${circulationRouted} compromises=${compromises} ` +
        `dropped=[${droppedTypes}] frontageFail=[${frontageFailIds}] ` +
        `eff=${objectives.efficiency.toFixed(2)} adj=${objectives.adjacency.toFixed(2)} ` +
        `daylight=${objectives.daylight.toFixed(2)} circ=${objectives.circulation.toFixed(2)} ` +
        `daylightReach=${objectives.daylightReach.toFixed(2)}`,
    );

    // §DIAG-FILL-RESIDUAL — build the EMITTED graph from the residual-augmented placements +
    // bubble (the minted "Store" cells / grown rooms that tile every blank). This is the ONLY
    // place the fill touches; all scoring above used the un-augmented `graph`, so the Pareto
    // ranking is byte-identical to the pre-fix engine — the fill never flips the winner. When no
    // residual was claimed (the common + apartment case) the augmented data === the originals, so
    // `emitGraph === graph` semantically (byte-identical, ADR-0061).
    let emitGraph = graph;
    if (residualMints.length > 0) {
        const mintRooms: ProgramRoom[] = residualMints.map(m => ({
            id: m.id, type: m.type, name: m.name,
            targetAreaM2: m.targetAreaM2, isPrivate: false, needsWindow: false,
        }));
        const mintEdges: AdjacencyEdge[] = residualMints
            .filter(m => m.neighbourId !== null)
            // Minted cell joins the room it abuts via an OPEN threshold (extra space — never sealed).
            .map(m => ({ a: m.id, b: m.neighbourId as string, via: 'open' as const }));
        const emitBubble: BubbleGraph = {
            ...bubble,
            rooms: [...bubble.rooms, ...mintRooms],
            edges: [...bubble.edges, ...mintEdges],
        };
        const emitWalls = buildWallsAndDoors(residualPlacements, emitBubble, {
            ...(input.wallThicknessM !== undefined ? { wallThicknessM: input.wallThicknessM } : {}),
            ...(input.doorWidthM !== undefined ? { doorWidthM: input.doorWidthM } : {}),
            shellPolygon: input.shellPolygon,
        });
        emitGraph = buildSemanticGraph(residualPlacements, emitWalls.segments, emitWalls.openings, emitBubble, {
            levelId: input.levelId, seed: `${input.seed}|${strategyKey(s)}`, shellAreaM2: shellArea,
            ...(input.wallHeightM !== undefined ? { wallHeightM: input.wallHeightM } : {}),
        });
    }

    return {
        strategy: strategyKey(s), graph: emitGraph, objectives,
        weighted, rank: 0,
        compromises, connected: metrics.connected, shapeAdmissible, topologyAdmissible,
        circulationRouted, hardValid, hardFailedRules, droppedRooms, roomOverlaps, boundaries,
        underMinAreaRooms, missingMandatoryTypes,
    };
}

/** Map the 4 user weights onto the 10 axes (regularity + hierarchy + shapeQuality + topologyQuality + edgeRealisation + openingCadence get fixed weights), normalise, sum. */
function weightedSum(o: ObjectiveVector, w: ScoringWeights): number {
    const raw: Record<keyof ObjectiveVector, number> = {
        efficiency: Math.max(0, w.corridorEfficiency),
        adjacency: Math.max(0, w.kitchenWorkflow),
        daylight: Math.max(0, w.naturalLight),
        circulation: Math.max(0, w.privacy),
        regularity: 0.5,
        // §PRIVACY-DEPTH (L2-β-1) — hierarchy axis. Carried at the same weight
        // as the user's "privacy" slider scaled down by 0.5, so privacy already
        // gets weighted via `circulation` (smooth gradient) AND `hierarchy`
        // (discrete tier). Together they form a 2-pass privacy scorer.
        hierarchy: Math.max(0, w.privacy) * 0.5,
        // §SHAPE-QUALITY (D3.4) — fixed weight comparable to regularity. Layouts
        // where every room sits in its comfortable envelope score higher.
        shapeQuality: 0.6,
        // §TOPOLOGY-QUALITY (T3.3) — fixed weight comparable to shapeQuality.
        // Layouts where every mandatory adjacency is realised + every door is
        // a permitted pair score higher. Today's validators emit only HARD
        // findings → axis is binary {0, 1}; future T2.3/T2.4/T2.6 will gradient.
        topologyQuality: 0.6,
        // §L3-γ-4 edgeRealisation (2026-05-30) — semantic-edge geometric match.
        // Carried at a fixed mid weight: significant enough to break ties
        // between layouts that score identically on the other axes but differ
        // on (e.g.) INTIMATE_ACCESS via door vs via open.
        edgeRealisation: 0.5,
        // §L4-δ-3 openingCadence (2026-05-30) — compositional opening rhythm.
        // Lower fixed weight than the other quality axes — cadence is a tie-
        // breaker, not a primary driver. Rhythm matters but secondary to
        // adjacency / privacy / shape.
        openingCadence: 0.3,
        // §L4-δ-4 proportionalElegance (2026-05-30) — per-room aspect comfort.
        // Mid-weight: more important than rhythm but less than core
        // adjacency/privacy. Distinguishes "all rooms in comfort band" from
        // "rooms-fit-but-feel-tunnel-like."
        proportionalElegance: 0.4,
        // §L2-β-4 spatialClimax (2026-05-30) — dominant-room arrival depth.
        // Couples with `hierarchy` (also Layer 2): hierarchy scores
        // PRIVATE-ROOM depth correctness; spatialClimax scores DOMINANT-
        // SPACE arrival sequence. Same Layer-2 importance weight.
        spatialClimax: Math.max(0, w.privacy) * 0.5,
        // §L2-β-2 entrySightline (2026-05-30) — entry "sightline" via
        // graph distance. Same Layer-2 family weight as spatialClimax —
        // the two together describe the arrival sequence (entry reveal +
        // climax depth).
        entrySightline: Math.max(0, w.privacy) * 0.4,
        // §L2-β-3 arrivalSequence (2026-05-30) — compression-release ratio.
        // Same Layer-2 family weight as entrySightline.
        arrivalSequence: Math.max(0, w.privacy) * 0.4,
        // §L4-δ-2 wetStackAlignment (2026-05-30) — wet-room centroid axis
        // alignment. Fixed mid weight comparable to proportionalElegance —
        // matters but secondary to core adjacency/privacy.
        wetStackAlignment: 0.4,
        // §L4-δ-1 alignmentField (2026-05-30) — plan-wide axis discipline.
        // Lower fixed weight: rewards designed-looking plans, tie-breaker.
        alignmentField: 0.3,
        // §L1-α-4 facadeAlignment (2026-05-31) — habitable rooms on high-
        // value shell edges. Coupled to the user's `naturalLight` weight
        // (scaled by 0.5) since both axes pull the same architectural
        // intent (good rooms front the best façades); together with
        // `daylight` they form a 2-pass façade scorer.
        facadeAlignment: Math.max(0, w.naturalLight) * 0.5,
        // §ENV-E2-SOLAR (E.2) — solar room-placement bias. Coupled to the user's
        // `naturalLight` weight (scaled by 0.5) like facadeAlignment: both express
        // the orientation/solar driver (spec §1 driver 1). Neutral (1.0) for every
        // candidate when no site latitude is supplied → contributes a constant that
        // cancels in ranking, so absent site data leaves the order unchanged.
        solarOrientation: Math.max(0, w.naturalLight) * 0.5,
        // §ENV-E3-ACOUSTIC (E.3) — acoustic-zoning bias (spec §1 driver 5,
        // Env-performance). Coupled to the user's `privacy` weight (scaled 0.5):
        // acoustic separation is the aural face of privacy. Neutral (1.0) for every
        // candidate when the layout has no quiet↔noisy relation, so absent acoustic
        // tension contributes a constant that cancels in ranking. The priority band
        // (env-performance) is applied on top via `priorityMultiplier`.
        acousticZoning: Math.max(0, w.privacy) * 0.5,
        // §ENV-E4-VENT (E.4) — natural-ventilation bias (spec §1 driver 6,
        // Env-performance). Coupled to the user's `naturalLight` weight (scaled 0.5):
        // cross-ventilation rides the same façade-opening intent as daylight.
        // Neutral (1.0) for every candidate when there is no external-wall/opening
        // data, so absent ventilation data cancels in ranking.
        naturalVentilation: Math.max(0, w.naturalLight) * 0.5,
        // §A.21.D55 daylightReach — fraction of WINDOWABLE rooms (habitable + wet)
        // that reach the façade. Coupled to the user's `naturalLight` weight (scaled
        // 0.5), like `daylight` / `facadeAlignment`: all three express the
        // maximise-daylight intent. This is the term that makes the ranker PREFER a
        // tiling that fronts MORE rooms (incl. the wet rooms) so each can host a
        // window — the founder's "daylight in every room". Neutral (1.0) for every
        // candidate when there are no windowable rooms / no external walls → a
        // constant that cancels in ranking, so absent data leaves the order
        // byte-identical (Pareto-equality baseline preserved).
        daylightReach: Math.max(0, w.naturalLight) * 0.5,
    };
    // §ENV-E1-PRIORITY (E.1) — apply the priority-hierarchy band (spec §1) ON TOP
    // of the per-axis weights above. Axes that serve a higher-priority driver
    // (Site-fixed > Env-performance > Technical-systems > Form/regulation) are
    // amplified so conflicts resolve in the higher driver's favour. Axes with no
    // §1 driver get a 1.0 multiplier (no change). Regulation (10) + structure (7)
    // remain HARD gates in the pool selection below — never relaxed here. The
    // multiplier is purely a re-weighting of the EXISTING axes; it adds no axis and
    // changes no raw objective value, so it only TUNES the secondary weighted-sum
    // tie-break (Pareto rank is computed from raw `o`, untouched by this).
    const eff = (a: keyof ObjectiveVector): number => raw[a] * priorityMultiplier(a);
    const total = OBJECTIVE_AXES.reduce((s, a) => s + eff(a), 0) || 1;
    return OBJECTIVE_AXES.reduce((s, a) => s + (eff(a) / total) * o[a], 0);
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
/** a dominates b: ≥ on every axis and > on at least one (EPS-tolerant). */
function dominates(a: ObjectiveVector, b: ObjectiveVector): boolean {
    let strictly = false;
    for (const ax of OBJECTIVE_AXES) {
        const va = round6(a[ax]), vb = round6(b[ax]);
        if (va < vb - EPS) return false;
        if (va > vb + EPS) strictly = true;
    }
    return strictly;
}

/** Deterministic non-dominated ranking: front 0, then 1, … (no evolution). */
function assignParetoRanks(cands: TglCandidate[]): TglCandidate[] {
    const ranked: TglCandidate[] = [];
    let remaining = cands.map((c, i) => ({ c, i }));
    let rank = 0;
    while (remaining.length) {
        const front = remaining.filter(({ c }) => !remaining.some(o => o.c !== c && dominates(o.c.objectives, c.objectives)));
        for (const { c } of front) ranked.push({ ...c, rank });
        const inFront = new Set(front.map(f => f.i));
        remaining = remaining.filter(r => !inFront.has(r.i));
        rank++;
    }
    return ranked;
}

/**
 * Enumerate candidate layouts and return the best `count`, Pareto-ranked then
 * weighted-sorted. Deterministic: same input ⇒ identical output (graphs + GUIDs).
 */
export function enumerateLayouts(input: EnumerateInput): TglCandidate[] {
    const decomposedArea = decomposeToRects(input.shellPolygon).reduce((s, r) => s + rectArea(r), 0);
    const shellArea = input.shellAreaM2 && input.shellAreaM2 > 0 ? input.shellAreaM2 : decomposedArea;
    if (shellArea <= 0) return [];

    // §D3.5 APARTMENT-ENVELOPE GATE — refuse to generate when the shell + program
    // combination is architecturally absurd (e.g. 200 m² 1-bedroom or 35 m²
    // 3-bedroom). The 5-tier shape gate later HARD-rejects unfit room rectangles,
    // but it can't tell the user *why* nothing fits cleanly — the envelope check
    // names the specific architectural mismatch BEFORE we waste cycles building
    // 8 strategies. Returns empty + logs a structured warning that the trigger
    // can surface as a clear toast.
    // A.21.h — use the injected envelope validator when present (the house
    // orchestrator threads `validateHouseStorey`); otherwise the default apartment
    // §D3.5 gate keyed on bedroom count.
    //
    // §ENVELOPE-FIT-GROWTH (founder bug #1, 2026-06-10) — the gate must validate the
    // SCALED bedroom count (the program `buildCandidate` actually builds via
    // `scaleProgramToShell`), NOT the raw request. Before this, an over-capacity shell
    // (e.g. 206 m² with a 2-bed request) was hard-rejected here at the raw 2-bed
    // grossMax (120 m²) — even though the engine would grow it to a 4-bed program that
    // FITS the §3.1 envelope (grossMax 220 m²). Scaling the gate's count to match the
    // builder turns "over-capacity ⇒ hard-reject" into "over-capacity ⇒ grow the
    // program + admit". A genuinely-TOO-SMALL shell still hard-rejects (D2.4 grossMin):
    // growth only RAISES the count, never lowers it, so a shell below the floor count's
    // grossMin still fails grossMin. Byte-identical for an in-band shell (the scaled
    // count equals the raw count there). The house path is untouched — its injected
    // validator already judges the full storey programme.
    const env = input.envelopeValidator
        ? input.envelopeValidator({ program: input.program, grossAreaM2: shellArea })
        : validateApartmentEnvelope({
            bedrooms: scaleProgramToShell(input.program, shellArea).bedrooms,
            grossAreaM2: shellArea,
        });
    if (!env.admissible) {
        for (const f of env.hardFindings) {
            console.warn(`[apartment-layout] §D3.5 envelope reject: ${f.reason}`);
        }
        return [];
    }

    const candidates: TglCandidate[] = [];
    for (const s of STRATEGIES) {
        const c = buildCandidate(input, shellArea, s);
        if (c) candidates.push(c);
    }
    if (candidates.length === 0) return [];

    // LEGALITY + SHAPE + TOPOLOGY GATE (§rules + D3.1 + T3.3, 5-tier fallback)
    //
    // An architecturally-COMPLETE plan satisfies four orthogonal axes:
    //   • shapeAdmissible    — every room within its dimensional envelope
    //   • topologyAdmissible — every mandatory adjacency realised + no
    //                          forbidden doors emitted
    //   • connected          — every space reachable from the entry
    //   • compromises === 0  — no reconciliation doors broke a rule
    //
    // A `clean` candidate satisfies BOTH validator flags (shape + topology).
    // The 5-tier fallback prefers architecturally-complete candidates, gracefully
    // degrading when the shell + program forces compromises (e.g. very tight
    // 3-bedroom layouts that can't satisfy every soft constraint).
    //
    // §CIRCULATION-REROUTE (A.APT.SA.2) adds an orthogonal axis:
    //   • circulationRouted — every private/service room opens directly onto a
    //                         circulation room (no room reachable only through
    //                         another room). The wallsAndDoors re-route pass
    //                         places these doors wherever a legal circulation-
    //                         adjacent wall exists; a candidate is unrouted only
    //                         when a room is GENUINELY land-locked.
    //
    // Tiers (best → worst fallback):
    //   clean AND legal AND routed ← architecturally complete, rule-legal, every
    //                                room opens onto the spine
    //   clean AND legal            ← complete + rule-legal (a room may be land-locked)
    //   clean AND connected        ← complete shape+topology, with reconciliation doors
    //   legal                       ← rule-legal but a room is awkward OR a soft
    //                                 topology issue (acoustic / wet) is present
    //   connected                   ← reachable; multiple compromises
    //   anything                    ← last resort
    // The existing 5-tier (now 7-tier) clean→legal→connected fallback, factored so
    // it can run over the hard-valid subset first (§TOPO-HARD-REJECT below).
    // §TOPO-ROUTED-PREFERENCE (F2 / ADR-0062 D4-sharpened, 2026-06-08) — when EVERY
    // candidate fails the shape gate (universal on elongated/rotated plates, so the
    // three `clean*` tiers are empty), the old fallback dropped straight to `legal`/
    // `connected`, which do NOT prefer a circulation-routed plan — so the engine could
    // ship a `circRouted=false` / `topologyQuality=0.00` layout (the founder's console
    // audit, F2). Two routed-preferring tiers sit BELOW the clean tiers: among
    // connected+legal (and then connected) candidates, prefer the circulation-routed
    // ones. SAFE: each tier is only chosen if non-empty and otherwise falls straight
    // through, so the pool is NEVER emptied (D4 — never a zero result); byte-identical
    // when a clean tier is populated OR when no routed candidate exists at that tier.
    const selectTier = (cs: TglCandidate[]): TglCandidate[] => {
        const connected = cs.filter(c => c.connected);
        const legal = connected.filter(c => c.compromises === 0);
        const clean = cs.filter(c => c.shapeAdmissible && c.topologyAdmissible);
        const cleanAndLegal = clean.filter(c => c.connected && c.compromises === 0);
        const cleanLegalRouted = cleanAndLegal.filter(c => c.circulationRouted);
        const cleanAndConn = clean.filter(c => c.connected);
        const legalRouted = legal.filter(c => c.circulationRouted);
        const connectedRouted = connected.filter(c => c.circulationRouted);
        return (
            cleanLegalRouted.length > 0 ? cleanLegalRouted :
            cleanAndLegal.length > 0 ? cleanAndLegal :
            cleanAndConn.length > 0 ? cleanAndConn :
            legalRouted.length > 0 ? legalRouted :
            legal.length > 0 ? legal :
            connectedRouted.length > 0 ? connectedRouted :
            connected.length > 0 ? connected :
            cs
        );
    };

    // §TOPO-HARD-REJECT (Stage 5, 2026-06-09) — the founder's NEW TOP-LEVEL TIER
    // SPLIT. A candidate that breaks any of the three architectural rules
    // (windowless habitable room / land-locked room / private-room-off-hall) is
    // HARD-INVALID and must rank BELOW every hard-valid candidate, so the ranker
    // picks a better one of the 8 strategies instead of shipping the
    // topologyQuality=0 layout the founder's console audit caught (merged-name
    // rooms + windowless bedrooms). The split is applied OUTSIDE the existing
    // tier ordering: run the clean→legal→connected fallback over the HARD-VALID
    // candidates first; only if NO strategy is hard-valid (a genuinely hard
    // plate/program) do we fall through to the same fallback over ALL candidates —
    // the pool is NEVER emptied ("prefer hard-valid, never crash"). Byte-identical
    // when at least one strategy already passed the three rules (the common case).
    // §DIAG-MANDATORY-GATE (§68.2) + §DIAG-MIN-AREA-GATE (§68.1) — VIABILITY GATE.
    //
    // A candidate is "viable" only when it realises the FULL requested mandatory set
    // (kitchen / living / dining always; the requested bedroom + bathroom counts on the
    // apartment path) AND emits NO habitable room below its `areaMin`. These two gates
    // are coupled on a tight plate: the only way to keep every mandatory room is
    // sometimes to shrink one below its minimum (§68.1) — and the founder rule is that
    // the engine must REDUCE the room count rather than shrink below minimum, which makes
    // the candidate mandatory-INCOMPLETE. So "complete at minimum sizes" is the right
    // viability predicate.
    const isViable = (c: TglCandidate): boolean =>
        c.missingMandatoryTypes.length === 0 && c.underMinAreaRooms.length === 0;
    const viable = candidates.filter(isViable);

    // APARTMENT STRUCTURED REJECTION — when NO strategy is viable on the APARTMENT path,
    // the plate is genuinely too small for the requested program at minimum room sizes;
    // there is no degenerate option worth shipping. Return EMPTY so the caller
    // (generate.ts) surfaces a structured `status:'rejected'` with the reason, exactly
    // like the §ENVELOPE-DIAGNOSTIC HARD reject — NEVER ship a "no kitchen + no living"
    // OR a "2 m² bedroom" option down to a low score.
    //
    // HOUSE PATH (`input.envelopeValidator` present) — the multi-storey house has NO
    // rejection UX: a storey MUST always produce a layout (the orchestrator stacks the
    // storeys, then documents/exports them). So the house NEVER empties here; instead the
    // viability filter is applied only as a RANKING PREFERENCE below (a viable candidate
    // ranks above a sub-min / mandatory-incomplete one when one exists), and the
    // least-bad fallback over ALL candidates still ships when none is viable. This keeps
    // the house byte-identical when a viable candidate exists, and never worse than the
    // pre-fix least-bad when none does (ADR-0061). The founder's §68.2 house-ground
    // "no kitchen+living" defect is still cured by the public-mandatory hard-invalid
    // ranking (a kitchen+living candidate ALWAYS outranks one that dropped them).
    const isHousePath = input.envelopeValidator !== undefined;
    if (viable.length === 0 && !isHousePath) {
        const anyMandatoryComplete = candidates.some(c => c.missingMandatoryTypes.length === 0);
        const missingUnion = Array.from(new Set(candidates.flatMap(c => c.missingMandatoryTypes)));
        const underMinUnion = Array.from(new Set(candidates.flatMap(c => c.underMinAreaRooms.map(r => r.type))));
        const requested = Array.from(requestedMandatoryCounts(input.program).entries())
            .map(([t, n]) => `${n}× ${t}`).join(', ');
        const reason = !anyMandatoryComplete
            ? `every strategy dropped a REQUESTED mandatory room (missing: [${missingUnion.join(', ')}])`
            : `every strategy shrank a habitable room below its minimum area (under-min: [${underMinUnion.join(', ')}])`;
        console.warn(
            `[apartment-layout] §DIAG-MANDATORY-GATE/§DIAG-MIN-AREA-GATE reject: ` +
            `${reason} across all ${candidates.length} strategies. The plate is too small for the ` +
            `requested program (${requested}) at minimum room sizes — surfacing a structured ` +
            `rejection rather than shipping a degenerate option (no kitchen/living, or a sub-min room).`,
        );
        return [];
    }

    // §68.1/§68.2 — prefer the VIABLE subset (full mandatory set + no sub-areaMin room)
    // when one exists; otherwise (house path only, since apartment already returned) fall
    // back to ALL candidates so the house is never emptied. The standard hard-valid →
    // least-bad fallback then runs over the chosen pool.
    const eligible = viable.length > 0 ? viable : candidates;
    const hardValidCands = eligible.filter(c => c.hardValid);
    const allHardInvalid = hardValidCands.length === 0;
    let pool = selectTier(allHardInvalid ? eligible : hardValidCands);
    if (allHardInvalid) {
        // Name the rules that failed in the least-bad shipped plan so the gap is
        // diagnosable (the founder's "name which rule failed"). The union across
        // the chosen pool is the most informative single line.
        const failedUnion = Array.from(
            new Set(pool.flatMap(c => c.hardFailedRules)),
        ).join(',') || 'unknown';
        console.warn(
            `[apartment-layout] §TOPO-HARD-REJECT-ALL: every one of the ${candidates.length} ` +
            `strategies is HARD-INVALID (failed rules across the shipped pool: [${failedUnion}]). ` +
            'The shell + program forces an architectural compromise — shipping the LEAST-BAD ' +
            'layout (never an empty result). Surface the failing rule(s) to the user.',
        );
    }

    // §FEASIBILITY-ALLOC (A.21.D5) — within the chosen tier, prefer the
    // strategies that DROP THE FEWEST rooms. A tiling that keeps all requested
    // rooms at their minimum sizes is strictly better than one that drops a
    // bedroom; this never crosses tiers (a routed/clean plan still wins over a
    // worse tier that happens to drop nothing). Only narrows when it leaves a
    // non-empty pool — never empties it.
    const minDropped = pool.reduce((m, c) => Math.min(m, c.droppedRooms.length), Infinity);
    if (Number.isFinite(minDropped)) {
        const fewestDrops = pool.filter(c => c.droppedRooms.length === minDropped);
        if (fewestDrops.length > 0) pool = fewestDrops;
    }

    const ranked = assignParetoRanks(pool).sort((a, b) =>
        a.rank - b.rank ||
        b.weighted - a.weighted ||
        (a.strategy < b.strategy ? -1 : a.strategy > b.strategy ? 1 : 0));   // stable tie-break

    // §CIRCULATION-REROUTE (A.APT.SA.2) — layout-quality WARNING. When even the
    // best-ranked candidate is not circulation-routed, EVERY strategy left a room
    // land-locked behind a non-circulation room (no legal circulation-adjacent
    // wall exists in any tiling). We never force an illegal door — instead we
    // surface a structured warning the trigger can relay so the user knows the
    // shell + program forced a less-than-ideal circulation graph.
    const best = ranked[0];

    // §DIAG-WINNER — detailed breakdown of the chosen layout (logging only; no
    // behaviour change). Names the winning strategy, the per-axis objective vector,
    // and the final dropped rooms — so a single paste shows EXACTLY which strategy
    // shipped and where it compromised.
    if (best) {
        // Tier name derived from the winning candidate's own flags (the per-subset
        // tier variables now live inside `selectTier`); `hardInvalid` marks the
        // §TOPO-HARD-REJECT-ALL least-bad fallback.
        const pool_ =
            best.shapeAdmissible && best.topologyAdmissible && best.connected && best.compromises === 0 && best.circulationRouted ? 'clean+legal+routed' :
            best.shapeAdmissible && best.topologyAdmissible && best.connected && best.compromises === 0 ? 'clean+legal' :
            best.shapeAdmissible && best.topologyAdmissible && best.connected ? 'clean+connected' :
            best.connected && best.compromises === 0 && best.circulationRouted ? 'legal+routed' :
            best.connected && best.compromises === 0 ? 'legal' :
            best.connected && best.circulationRouted ? 'connected+routed' :
            best.connected ? 'connected' : 'any';
        const axes = OBJECTIVE_AXES
            .map(a => `${a}=${best.objectives[a].toFixed(2)}`)
            .join(' ');
        const winDropped = best.droppedRooms.map(d => d.type).join(',') || 'none';
        console.log(
            `[D-TGL] §DIAG-WINNER strategy=${best.strategy} tier=${pool_} ` +
            `hardValid=${best.hardValid} hardFailed=[${best.hardFailedRules.join(',') || 'none'}] ` +
            `rank=${best.rank} weighted=${best.weighted.toFixed(3)} ` +
            `connected=${best.connected} shapeOK=${best.shapeAdmissible} ` +
            `topoOK=${best.topologyAdmissible} circRouted=${best.circulationRouted} ` +
            `compromises=${best.compromises} droppedRooms=[${winDropped}]`,
        );
        console.log(`[D-TGL] §DIAG-WINNER objectives: ${axes}`);
    }

    if (best && !best.circulationRouted) {
        console.warn(
            '[apartment-layout] §CIRCULATION-REROUTE: a habitable room is reachable ' +
            'only through a non-circulation room (no legal corridor/hall-adjacent ' +
            `wall to re-route it onto) in the best layout (strategy ${best.strategy}). ` +
            'The plan ships connected but with an architectural circulation compromise.',
        );
    }
    // §ROOM-OVERLAP-HARD (founder bug, 2026-06-10) — when even the shipped WINNER
    // overlaps (EVERY one of the 8 strategies had an interior floor-area overlap —
    // a genuinely over-capacity shell), surface the founder's user-facing message
    // naming the actual overlapping rooms, the same way §TOPO-HARD-REJECT-ALL and
    // §CIRCULATION-REROUTE surface a relayable line. The gate already ranked any
    // overlap-free strategy ABOVE this one, so this only fires when none exists.
    if (best && best.roomOverlaps.length > 0) {
        const pairs = best.roomOverlaps
            .map(o => `${o.nameA} ↔ ${o.nameB} (${o.areaM2.toFixed(1)} m²)`)
            .join('; ');
        const names = Array.from(
            new Set(best.roomOverlaps.flatMap(o => [o.nameA, o.nameB])),
        );
        const primary = names[0] ?? 'A room';
        const others = names.slice(1).join(' and/or ') || 'neighbouring rooms';
        console.warn(
            `[apartment-layout] §ROOM-OVERLAP-HARD (strategy ${best.strategy}): ` +
            `Room Overlap Detected: The ${primary} overlaps with neighboring rooms ` +
            `(${others}). Room polygons must be mutually exclusive and may only touch ` +
            'along shared boundaries. Adjust the room boundaries so that no floor area ' +
            `belongs to more than one room. [overlaps: ${pairs}]`,
        );
    }
    // §FEASIBILITY-ALLOC (A.21.D5) — when even the best (fewest-drop) candidate
    // still couldn't fit every requested room at its minimum, REPORT the
    // shortfall (count + types) so the trigger/modal can tell the user
    // "you asked for N bedrooms, M fit on this plot" — never a silent drop.
    if (best && best.droppedRooms.length > 0) {
        const byType = best.droppedRooms.reduce<Record<string, number>>((m, d) => {
            m[d.type] = (m[d.type] ?? 0) + 1; return m;
        }, {});
        const summary = Object.entries(byType).map(([t, n]) => `${n}× ${t}`).join(', ');
        console.warn(
            `[apartment-layout] §FEASIBILITY-ALLOC: ${best.droppedRooms.length} requested ` +
            `room(s) (${summary}) could not be placed at their minimum size on this plot ` +
            `even in the best layout (strategy ${best.strategy}). The plan ships with a ` +
            'REDUCED PROGRAM — these rooms were dropped, not silently lost; surface the ' +
            'shortfall to the user. See candidate.droppedRooms for the per-room detail.',
        );
    }

    return ranked.slice(0, Math.max(1, input.count));
}
