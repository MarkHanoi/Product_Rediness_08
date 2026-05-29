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
import { decomposeToRects, polygonBBox, rectArea, type Pt, type Rect } from './rectDecomposition.js';
import { buildBubbleGraph, type BubbleGraph } from './bubbleGraph.js';
import { subdivide, type RoomPlacement } from './subdivide.js';
import { buildWallsAndDoors, type BoundarySeg } from './wallsAndDoors.js';
import { snapRectsAwayFromWindows, type WindowSpan } from './windowAvoidance.js';
import { buildSemanticGraph, type LayoutGraph } from './semanticGraph.js';
import { computeSpaceSyntax } from './spaceSyntax.js';
import { computeObjectives, OBJECTIVE_AXES, type ObjectiveVector } from './objectives.js';
import { validateAllRoomShapes, type RoomShape } from '../dimensions/validateRoomShape.js';
import { validateApartmentEnvelope } from '../dimensions/validateApartmentEnvelope.js';

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
    /** Virtual room-bounding lines at open-plan thresholds (no wall, no door)
     *  in METRES; the LayoutOption converts to mm at emit time. */
    readonly boundaries: readonly BoundarySeg[];
}

const EPS = 1e-9;

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
    const rectsT = decomposeToRects(polyT);
    if (rectsT.length === 0) return null;

    const base = buildBubbleGraph(input.program, shellArea);
    const bubble: BubbleGraph = s.order === 'rev' ? { ...base, rooms: [...base.rooms].reverse() } : base;

    const placementsT = subdivide(rectsT, bubble);
    if (placementsT.length === 0) return null;
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
    const shapeAdmissible = shapeVal.admissible;
    // Penalty per soft finding accumulates → shapeQuality.
    const softPenaltySum = shapeVal.softFindings.reduce((s, f) => s + f.delta, 0);
    const numRooms = Math.max(1, roomShapes.length);
    const shapeQuality = Math.max(0, Math.min(1, 1 - softPenaltySum / numRooms));

    const { segments, openings, boundaries, compromises } = buildWallsAndDoors(placements, bubble, {
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
    const entryGuid = graph.nodes.find(n => n.kind === 'Space' && n.sourceId === bubble.entryId)?.guid ?? null;
    const metrics = computeSpaceSyntax(graph, entryGuid);
    const objectives = computeObjectives(graph, metrics, bubble, shapeQuality);
    return {
        strategy: strategyKey(s), graph, objectives,
        weighted: weightedSum(objectives, input.weights), rank: 0,
        compromises, connected: metrics.connected, shapeAdmissible, boundaries,
    };
}

/** Map the 4 user weights onto the 7 axes (regularity + hierarchy + shapeQuality get fixed weights), normalise, sum. */
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
    };
    const total = OBJECTIVE_AXES.reduce((s, a) => s + raw[a], 0) || 1;
    return OBJECTIVE_AXES.reduce((s, a) => s + (raw[a] / total) * o[a], 0);
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
    const env = validateApartmentEnvelope({
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

    // LEGALITY GATE (§rules): an architecturally-legal plan — every room reachable
    // through rule-PERMITTED doors (connected, zero compromises) — beats any plan
    // that needed a forbidden door (e.g. bedroom-through-bedroom). We PRE-FILTER the
    // pool to the best achievable legality tier, THEN Pareto-rank within it (so the
    // returned list stays Pareto-consistent).
    //
    // §D3.1 SHAPE GATE — extends the legality gate. A "shape-admissible" candidate
    // (every room within its dimensional envelope: G1 area, G2 width, G3 length,
    // G4 aspect, G6 wall) is architecturally cleaner than one with a tunnel /
    // oversized / undersized room. Tiers (best → worst fallback):
    //   shape-admissible AND legal      ← architecturally clean + rule-legal
    //   shape-admissible AND connected  ← clean but with reconciliation doors
    //   legal                            ← rule-legal but a room is awkward
    //   connected                        ← reachable but rule + shape compromises
    //   anything                         ← last resort
    const connected = candidates.filter(c => c.connected);
    const legal = connected.filter(c => c.compromises === 0);
    const shapeAdmissible = candidates.filter(c => c.shapeAdmissible);
    const shapeAdmAndLegal = shapeAdmissible.filter(c => c.connected && c.compromises === 0);
    const shapeAdmAndConn = shapeAdmissible.filter(c => c.connected);
    const pool =
        shapeAdmAndLegal.length > 0 ? shapeAdmAndLegal :
        shapeAdmAndConn.length > 0 ? shapeAdmAndConn :
        legal.length > 0 ? legal :
        connected.length > 0 ? connected :
        candidates;

    const ranked = assignParetoRanks(pool).sort((a, b) =>
        a.rank - b.rank ||
        b.weighted - a.weighted ||
        (a.strategy < b.strategy ? -1 : a.strategy > b.strategy ? 1 : 0));   // stable tie-break
    return ranked.slice(0, Math.max(1, input.count));
}
