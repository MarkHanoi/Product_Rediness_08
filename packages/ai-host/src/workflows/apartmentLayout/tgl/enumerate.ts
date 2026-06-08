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
import { buildBubbleGraph, type BubbleGraph } from './bubbleGraph.js';
import { subdivideWithReport, type DroppedRoom, type RoomPlacement } from './subdivide.js';
import { buildWallsAndDoors, type BoundarySeg } from './wallsAndDoors.js';
import { snapRectsAwayFromWindows, type WindowSpan } from './windowAvoidance.js';
import { buildSemanticGraph, type LayoutGraph } from './semanticGraph.js';
import { computeSpaceSyntax } from './spaceSyntax.js';
import { computeObjectives, OBJECTIVE_AXES, type ObjectiveVector } from './objectives.js';
import { priorityMultiplier } from './envDrivers.js';
import { validateAllRoomShapes, type RoomShape } from '../dimensions/validateRoomShape.js';
import { validateRoomFit } from '../dimensions/validateRoomFit.js';
import { validateFrontage } from '../dimensions/validateFrontage.js';
import { validateApartmentEnvelope } from '../dimensions/validateApartmentEnvelope.js';
import type { DimensionalValidation } from '../dimensions/types.js';
import { validateMandatoryAdjacencies, type DoorOpening } from '../topology/validateMandatoryAdjacencies.js';
import { validateForbiddenAdjacencies } from '../topology/validateForbiddenAdjacencies.js';
import { validateWetCluster } from '../topology/validateWetCluster.js';
import { validateAcousticZoning } from '../topology/validateAcousticZoning.js';
import { validateCirculationSequence } from '../topology/validateCirculationSequence.js';
import { validateCorridorConnectivity } from '../topology/validateCorridorConnectivity.js';

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
     * §FEASIBILITY-ALLOC (A.21.D5, 2026-06-06) — requested rooms that could NOT
     * be placed at their per-type minimum short side in this strategy, even
     * after the subdivider's area-rebalance retry. Empty in the common case.
     * The gate prefers a strategy that drops FEWER rooms; when the best
     * candidate still drops some, the structured list (count + type + reason) is
     * logged so the trigger/modal can report "you asked for N, M fit" — the
     * engine NEVER silently loses a requested room. Deterministic.
     */
    readonly droppedRooms: readonly DroppedRoom[];
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
    if (input.keepOutRects && input.keepOutRects.length > 0) {
        const holesT = input.keepOutRects.map(r => {
            const h = xfRect(r, t.fwd);
            return {
                x0: h.x0 - KEEPOUT_MARGIN_M, z0: h.z0 - KEEPOUT_MARGIN_M,
                x1: h.x1 + KEEPOUT_MARGIN_M, z1: h.z1 + KEEPOUT_MARGIN_M,
            };
        });
        rectsT = subtractRectsFromRects(rectsT, holesT);
        if (rectsT.length === 0) return null;     // core consumed the whole plate
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
    const bubble: BubbleGraph = s.order === 'rev' ? { ...base, rooms: [...base.rooms].reverse() } : base;

    // A.25.3 — the `accessibility` slider widens the corridor strip. Absent ⇒ the
    // subdivider uses its built-in CORRIDOR_STRIP_WIDTH_M (1.2 m).
    const subRes = subdivideWithReport(
        rectsT, bubble,
        input.corridorWidthM !== undefined ? { corridorWidthM: input.corridorWidthM } : {},
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
    return {
        strategy: strategyKey(s), graph, objectives,
        weighted: weightedSum(objectives, input.weights), rank: 0,
        compromises, connected: metrics.connected, shapeAdmissible, topologyAdmissible,
        circulationRouted, droppedRooms, boundaries,
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
    const connected = candidates.filter(c => c.connected);
    const legal = connected.filter(c => c.compromises === 0);
    const clean = candidates.filter(c => c.shapeAdmissible && c.topologyAdmissible);
    const cleanAndLegal = clean.filter(c => c.connected && c.compromises === 0);
    const cleanLegalRouted = cleanAndLegal.filter(c => c.circulationRouted);
    const cleanAndConn = clean.filter(c => c.connected);
    let pool =
        cleanLegalRouted.length > 0 ? cleanLegalRouted :
        cleanAndLegal.length > 0 ? cleanAndLegal :
        cleanAndConn.length > 0 ? cleanAndConn :
        legal.length > 0 ? legal :
        connected.length > 0 ? connected :
        candidates;

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
    if (best && !best.circulationRouted) {
        console.warn(
            '[apartment-layout] §CIRCULATION-REROUTE: a habitable room is reachable ' +
            'only through a non-circulation room (no legal corridor/hall-adjacent ' +
            `wall to re-route it onto) in the best layout (strategy ${best.strategy}). ` +
            'The plan ships connected but with an architectural circulation compromise.',
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
