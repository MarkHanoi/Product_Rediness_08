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

import type { ApartmentProgram, ScoringWeights } from '../types.js';
import { decomposeToRects, polygonBBox, rectArea, subtractRectsFromRects, type Pt, type Rect } from './rectDecomposition.js';
import { buildBubbleGraph, type BubbleGraph, type ProgramRoom, type AdjacencyEdge } from './bubbleGraph.js';
import { subdivideWithReport, type DroppedRoom, type RoomPlacement } from './subdivide.js';
import { buildWallsAndDoors, type BoundarySeg } from './wallsAndDoors.js';
import { snapRectsAwayFromWindows, type WindowSpan } from './windowAvoidance.js';
import { buildSemanticGraph, type LayoutGraph } from './semanticGraph.js';
import { computeSpaceSyntax } from './spaceSyntax.js';
import { computeObjectives, OBJECTIVE_AXES, type ObjectiveVector } from './objectives.js';
import { priorityMultiplier } from './envDrivers.js';
import { validateAllRoomShapes, type RoomShape } from '../dimensions/validateRoomShape.js';
import { validateRoomFit } from '../dimensions/validateRoomFit.js';
import { validateFrontage, rectTouchesPerimeter } from '../dimensions/validateFrontage.js';
import { validateApartmentEnvelope } from '../dimensions/validateApartmentEnvelope.js';
import type { DimensionalValidation } from '../dimensions/types.js';
import { validateMandatoryAdjacencies, type DoorOpening } from '../topology/validateMandatoryAdjacencies.js';
import { validateForbiddenAdjacencies } from '../topology/validateForbiddenAdjacencies.js';
import { validateWetCluster } from '../topology/validateWetCluster.js';
import { validateAcousticZoning } from '../topology/validateAcousticZoning.js';
import { validateCirculationSequence } from '../topology/validateCirculationSequence.js';
import { validateCorridorConnectivity } from '../topology/validateCorridorConnectivity.js';
import { validateNoRoomOverlap, type RoomOverlap } from '../topology/validateNoRoomOverlap.js';
import { windowMandatoryFor, isPrivate, doorAllowedBetween, roomRule } from '../rules/programRules.js';

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
     * The ranker tier-splits hard-valid ABOVE hard-invalid; if EVERY strategy is
     * hard-invalid the pool is NEVER emptied (a loud §TOPO-HARD-REJECT-ALL warning
     * names the failing rules and the least-bad ships). The specific rules that failed
     * are in `hardFailedRules` (subset of {'window','circulation','privacy','overlap'}).
     */
    readonly hardValid: boolean;
    readonly hardFailedRules: readonly ('window' | 'circulation' | 'privacy' | 'overlap')[];
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
 *   C (circulation) — a room is land-locked (no door onto the spine).
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
}): readonly ('window' | 'circulation' | 'privacy' | 'overlap')[] {
    const { bubble, frontageHardRoomIds, unroutedToCirculationRoomIds, doorOpenings, hasRoomOverlap } = args;
    const typeById = new Map<string, string>();
    for (const r of bubble.rooms) typeById.set(r.id, r.type);

    const failed: ('window' | 'circulation' | 'privacy' | 'overlap')[] = [];

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

    return failed;
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
    if (input.keepOutRects && input.keepOutRects.length > 0) {
        const holesT = input.keepOutRects.map(r => {
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
    const base = buildBubbleGraph(
        input.program, shellArea, input.shellPolygon,
        input.spaceGenerosity !== undefined ? { spaceGenerosity: input.spaceGenerosity } : undefined,
    );
    let bubble: BubbleGraph = s.order === 'rev' ? { ...base, rooms: [...base.rooms].reverse() } : base;

    // A.25.3 — the `accessibility` slider widens the corridor strip. Absent ⇒ the
    // subdivider uses its built-in CORRIDOR_STRIP_WIDTH_M (1.2 m).
    // §STAIR-OBSTACLE-CARVE — `stairCarved` tells the subdivider a stair keep-out
    // fractured the plate so it keeps a corridor spine across the hole. Both
    // options reach subdivideWithReport.
    const subRes = subdivideWithReport(
        rectsT, bubble,
        {
            stairCarved,
            ...(input.corridorWidthM !== undefined ? { corridorWidthM: input.corridorWidthM } : {}),
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
            // pass can place the stair↔circulation door. (Clamping to the shell happens
            // downstream via §EXTEND-TO-PERIMETER for one-sided walls.)
            const rect: Rect = {
                x0: ko.x0 - KEEPOUT_MARGIN_M, z0: ko.z0 - KEEPOUT_MARGIN_M,
                x1: ko.x1 + KEEPOUT_MARGIN_M, z1: ko.z1 + KEEPOUT_MARGIN_M,
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
            console.log(
                `[D-TGL] §STAIR-ROOM cand ${strategyKey(s)} emitted ${stairRooms.length} stair room(s) ` +
                `at keep-out connected=${circId ? `→${circId}` : 'NONE'}`,
            );
        }
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
    const frontage = validateFrontage({
        shellPolygon: input.shellPolygon,
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
                rectTouchesPerimeter(p.rect, input.shellPolygon),
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

    // §TOPO-HARD-REJECT (Stage 5) — the founder's HARD topology gate. A candidate
    // is hard-invalid if it breaks ANY of the three architectural rules (windowless
    // habitable room / land-locked room / private-room-off-hall). Reuses the
    // already-computed frontage hard findings + unrouted signal + realised doors.
    const hardFailedRules = evaluateHardTopology({
        bubble,
        frontageHardRoomIds: frontage.hardFindings.map(f => f.roomId),
        unroutedToCirculationRoomIds,
        doorOpenings,
        hasRoomOverlap: !overlapResult.ok,
    });
    const hardValid = hardFailedRules.length === 0;
    // §DIAG-TOPO-GATE — per-candidate hard-gate decision line (logging only).
    console.log(
        `[D-TGL] §DIAG-TOPO-GATE strategy=${strategyKey(s)} hardValid=${hardValid} ` +
        `failed=[${hardFailedRules.join(',') || 'none'}]`,
    );

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

    return {
        strategy: strategyKey(s), graph, objectives,
        weighted, rank: 0,
        compromises, connected: metrics.connected, shapeAdmissible, topologyAdmissible,
        circulationRouted, hardValid, hardFailedRules, droppedRooms, roomOverlaps, boundaries,
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
    // §D3.5 gate keyed on bedroom count. Default path is byte-identical.
    const env = input.envelopeValidator
        ? input.envelopeValidator({ program: input.program, grossAreaM2: shellArea })
        : validateApartmentEnvelope({
            bedrooms: input.program.bedrooms,
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
    const hardValidCands = candidates.filter(c => c.hardValid);
    const allHardInvalid = hardValidCands.length === 0;
    let pool = selectTier(allHardInvalid ? candidates : hardValidCands);
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
