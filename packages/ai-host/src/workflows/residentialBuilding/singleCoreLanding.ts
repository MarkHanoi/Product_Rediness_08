// Residential building — §RESI-SINGLE-CORE-LANDING (ADR-0372, lane SMALLPLATE68, L-11190..L-11199).
//
// THE SMALL-PLATE TYPOLOGY the corridor partitioner does not know. The founder photographed a
// Barcelona corner block on a ~13 × 16 m plate: ONE compact stair/lift core against the party
// walls, a LANDING in front of it, and one or two apartments per floor whose front doors open
// STRAIGHT OFF THE LANDING. No corridor. `platePartition.ts` plans exactly one thing — a core +
// public corridor band(s) + apartment BAND RUNS either side — and on that plate it measured its
// own runs at 8.5 m against an 8.55 m minimum and refused ("core/corridor leave no usable band
// runs (placed 0/6)"). The refusal was honest by its own rules; the gap was a missing typology.
//
// This module is a SECOND pure partition PLANNER returning the SAME `PlatePartitionResult` shape,
// so the orchestrator, the per-cell D-TGL engine, the executor and the preview consume it
// unchanged (the landing rides in `publicCorridor`, every cell carries `doorEdge` +
// `coreDoorOffset` + `coreReachable` exactly as a corridor cell does). Two ARRANGEMENTS are tried,
// in the frame where the plate's long axis is Z and the core sits flush in a REAR corner
// (`z1`, hugging `x0` or `x1`) with its lobby/fire door facing −Z into the landing — the one
// orientation the executor's `_createCore` / `_buildCorePerimeter` build:
//
//   'front-rear'  A = the FRONT full-width cell  [x0,x1] × [z0, zA]      door on its z1 edge
//                 B = the REAR cell beside the core [core.x1, x1] × [zA, z1]   door on its x0 edge
//   'side-pocket' A' = the full-depth cell beside the core column [core.x1, x1] × [z0, z1]
//                 B' = the pocket in front of the landing [core.x0, core.x1] × [z0, zA]
//
//   with the LANDING = [core.x0, core.x1] × [zA, core.z0], zA = core.z0 − landingDepth.
//
// Every cell is an axis-aligned RECT whose door edge lies on its own bbox (the invariant every
// downstream consumer relies on), and every cell touches ≥ 1 plate edge (a façade — the daylight
// rule the D-TGL engine enforces per room). The ONLY free parameter is the landing depth, scanned
// upward from its architectural minimum (the core's own 1.2 m approach clearance) so it can
// absorb the slack between the two cells; it is never widened past a landing into a hall.
//
// SELECTED BY MEASUREMENT, NEVER BY A SIZE THRESHOLD. A cell is feasible iff it clears the SAME
// numbers the corridor partitioner refuses on: short side ≥ `ENGINE_MIN_ROW_DEPTH_M` (7.5 m),
// aspect ≤ `MAX_RECT_ASPECT` (3.5 : 1), area ≥ the user's stated minimum. N ∈ {1, 2} falls out of
// those checks; a region no cell can take is reported as `stranded` with its numbers
// (§CONTEXT-DATA-HONESTY: never silent waste). A refusal quotes BOTH arrangements' cells (C74).
//
// PURE + DETERMINISTIC L2: zero THREE, zero DOM, zero I/O, zero RNG. P8: one span.
// Contracts: C53 (generative engine), C50 §1.7 (soft-fail, never throw), C74 (name what you
// measured), C11/C16/P6 untouched (this plans rects; the executor builds through the bus).

import { trace } from '@opentelemetry/api';
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';
import type { Pt, Rect } from '../apartmentLayout/tgl/rectDecomposition.js';
import { rectArea, rectWidth, rectDepth } from '../apartmentLayout/tgl/rectDecomposition.js';
import {
    type ApartmentCell,
    type ApartmentDemand,
    type PlatePartitionOutput,
    type PlatePartitionRejected,
    type Typology,
    rectPolygon,
    computeCoreDoorPlacement,
    typologyForArea,
    DOOR_WIDTH_M,
    ENGINE_MIN_ROW_DEPTH_M,
    MAX_RECT_ASPECT,
    MAX_APARTMENT_DEPTH_M,
    TYPOLOGY_KEEP_WIDTH,
    engineMaxCellWidth,
} from './platePartition.js';
import { APPROACH_CLEAR_M } from './coreSizing.js';

const _tracer = trace.getTracer('@pryzm/ai-host', '0.1.0');

const EPS = 1e-6;
/** A core face within this of a plate edge is FLUSH to it (millimetre class — the same tolerance the
 *  corridor partitioner's `FLUSH_CONTAIN_TOL` / spine-hug tests use). */
const FLUSH_TOL_M = 0.05;
/** The landing may deepen by at most this beyond its minimum to balance the two cells. Past it the
 *  landing is a hall — circulation the founder's typology does not have. */
const LANDING_MAX_EXTRA_M = 2.0;
const LANDING_STEP_M = 0.05;
/** Below this bbox fill the drawn boundary is not a near-rectangle (an L/T/U) and the rect cells
 *  here would tile past the drawn line — that plate belongs to the corridor partitioner's
 *  §RESI-RECT-DECOMP path, so this typology declines it by name. */
const NEAR_RECT_MIN_FILL = 0.9;
/** Circulation charge per m² in the candidate objective — mirrors `CORRIDOR_AREA_LAMBDA` (1: a
 *  landing m² costs exactly a placed m²). */
const CIRCULATION_AREA_LAMBDA = 1;

export type SingleCoreArrangement = 'front-rear' | 'side-pocket';

export interface SingleCoreLandingInput {
    /** Diagnostic level index (0 = ground). */
    readonly levelIndex: number;
    /** The level plate polygon (metres, LOCAL plan frame). Tiled as its axis-aligned bbox. */
    readonly footprint: readonly Pt[];
    /** The compact core rect, FLUSH to the plate's z1 edge AND to its x0 or x1 edge (rear corner). */
    readonly core: Rect;
    /** The landing's MINIMUM depth in front of the core's z0 (lobby) face, metres. Floored at the
     *  door clear width; the planner scans upward from it (see `LANDING_MAX_EXTRA_M`). */
    readonly landingMinDepthM: number;
    /** The apartment demand list (placement order); at most two are consumed. Its distinct typologies
     *  form the palette the placed cells are re-stamped from by area (§RESI-EDGE-TYPE-VARIETY). */
    readonly apartments: readonly ApartmentDemand[];
    /** The REAL (possibly slightly irregular) plate polygon in the same frame. A cell whose centre
     *  falls outside it is infeasible; a boundary that is not near-rectangular is declined. */
    readonly clipPolygon?: readonly Pt[];
    /** The user's STATED per-apartment minimum (m²). Absent ⇒ the smallest demand minimum. */
    readonly userMinApartmentAreaM2?: number;
    /** The user's STATED per-apartment maximum (m²) — a cell above it is still placed (the plate is
     *  what it is) but counts against the candidate so a within-band split is preferred. */
    readonly userMaxApartmentAreaM2?: number;
}

interface CandidateCell {
    readonly rect: Rect;
    readonly doorEdge: ApartmentCell['doorEdge'];
    readonly role: string;
}

interface Candidate {
    readonly arrangement: SingleCoreArrangement;
    readonly landingDepthM: number;
    readonly landing: Rect;
    readonly cells: readonly CandidateCell[];
    readonly stranded?: { readonly rect: Rect; readonly role: string; readonly reason: string };
    readonly placedAreaM2: number;
    readonly overMaxCount: number;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
function normRect(r: Rect): Rect {
    return { x0: round4(r.x0), z0: round4(r.z0), x1: round4(r.x1), z1: round4(r.z1) };
}
function bbox(poly: readonly Pt[]): Rect {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { x0, z0, x1, z1 };
}
function polygonArea(poly: readonly Pt[]): number {
    let a = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
        const p = poly[i]!, q = poly[(i + 1) % n]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}
function fmt(n: number): string { return n.toFixed(2); }
function dims(r: Rect): string { return `${fmt(rectWidth(r))} × ${fmt(rectDepth(r))} m (${rectArea(r).toFixed(0)} m²)`; }

/** The engine's proven MAX long side (m) for a cell of this short side, for the LARGEST typology in
 *  the enabled palette — the corridor partitioner's OWN calibration (§RESI-T3-FIT-REGRESSION-FIX
 *  `engineMaxCellWidth` for 1/2-bed cells, `TYPOLOGY_KEEP_WIDTH[...].maxW` scaled by depth for a
 *  3/4-bed), re-used here so this typology never mints a cell the D-TGL engine is known to reject
 *  as over-wide — the 285 m² "apartment" a 10.5 × 34.7 m plate would otherwise yield. */
function engineMaxLongSide(shortSideM: number, enabled: readonly Typology[]): number {
    let cap = engineMaxCellWidth(shortSideM);
    for (const t of enabled) {
        const keep = TYPOLOGY_KEEP_WIDTH[t];
        if (keep) cap = Math.max(cap, keep.maxW * (MAX_APARTMENT_DEPTH_M / Math.max(EPS, shortSideM)));
    }
    return cap;
}

/**
 * Is this rect a cell the per-cell D-TGL engine can lay out AND the user asked for? Returns null
 * when feasible, else the ONE measured reason it is not — in the same units the corridor
 * partitioner refuses in, so the two typologies' refusals read side by side.
 */
function cellVerdict(
    rect: Rect, floorAreaM2: number, enabled: readonly Typology[], clipPolygon: readonly Pt[] | undefined,
): string | null {
    const w = rectWidth(rect), d = rectDepth(rect);
    const shortSide = Math.min(w, d), longSide = Math.max(w, d);
    if (!(shortSide > EPS)) return 'degenerate (zero extent)';
    if (shortSide < ENGINE_MIN_ROW_DEPTH_M - EPS) {
        return `short side ${fmt(shortSide)} m is under the ${ENGINE_MIN_ROW_DEPTH_M} m engine floor`;
    }
    if (longSide / shortSide > MAX_RECT_ASPECT + EPS) {
        return `aspect ${(longSide / shortSide).toFixed(1)}:1 exceeds the ${MAX_RECT_ASPECT}:1 ceiling`;
    }
    const cap = engineMaxLongSide(shortSide, enabled);
    if (longSide > cap + EPS) {
        return `long side ${fmt(longSide)} m exceeds the ${fmt(cap)} m the engine lays out at a ${fmt(shortSide)} m depth`;
    }
    const area = rectArea(rect);
    if (area < floorAreaM2 - EPS) {
        return `${area.toFixed(0)} m² is under the ${floorAreaM2.toFixed(0)} m² minimum`;
    }
    if (clipPolygon && clipPolygon.length >= 3) {
        const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
        if (!pointInPolygonXZ(cx, cz, clipPolygon)) return 'its centre falls outside the drawn boundary';
    }
    return null;
}

/**
 * Plan a small plate as ONE compact rear-corner core + a LANDING + N ∈ {1, 2} apartments whose
 * doors open off the landing — no corridor. Pure + deterministic; infeasible ⇒ `status:'rejected'`
 * with both arrangements' measured cells in the reason (C50 §1.7 / C74). Never throws on a miss.
 */
export function partitionSingleCoreLanding(input: SingleCoreLandingInput): PlatePartitionOutput {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.residentialBuilding.singleCoreLanding',
        (span) => {
            try {
                const out = _plan(input);
                span.setAttribute('pryzm.resi.singleCore.status', out.status);
                if (out.status === 'ok') {
                    span.setAttribute('pryzm.resi.singleCore.cells', out.apartmentCells.length);
                }
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        },
    ) as PlatePartitionOutput;
}

function reject(levelIndex: number, reason: string): PlatePartitionRejected {
    return {
        status: 'rejected',
        reason,
        diagnostic: `§DIAG-RESI-SINGLE-CORE level=${levelIndex} status=rejected reason="${reason}"`,
    };
}

function _plan(input: SingleCoreLandingInput): PlatePartitionOutput {
    const { levelIndex, footprint, apartments, clipPolygon } = input;
    if (footprint.length < 3) return reject(levelIndex, 'single-core landing: footprint is degenerate');
    const bb = bbox(footprint);
    const W = rectWidth(bb), D = rectDepth(bb);
    if (!(W > EPS) || !(D > EPS)) return reject(levelIndex, 'single-core landing: footprint is degenerate (zero-area plate)');
    if (apartments.length === 0) return reject(levelIndex, 'single-core landing: no apartments requested');

    // A near-rectangle only: the rect cells tile the bbox, and on an L/T/U they would tile past the
    // drawn line. That plate is the corridor partitioner's §RESI-RECT-DECOMP territory — decline by name.
    if (clipPolygon && clipPolygon.length >= 3) {
        const fill = polygonArea(clipPolygon) / Math.max(EPS, W * D);
        if (fill < NEAR_RECT_MIN_FILL) {
            return reject(
                levelIndex,
                `single-core landing: needs a near-rectangular plate (drawn boundary fills ${fill.toFixed(2)} ` +
                `of its ${fmt(W)} × ${fmt(D)} m box, below ${NEAR_RECT_MIN_FILL.toFixed(2)})`,
            );
        }
    }

    // The core must sit FLUSH in a rear corner: z1 (its solid back wall against the plate edge) and
    // x0 or x1 (its solid side wall against the party wall). Snap the flush faces onto the plate edges
    // so every downstream coincidence test sees them exactly.
    const c = normRect(input.core);
    const flushBack = Math.abs(c.z1 - bb.z1) <= FLUSH_TOL_M;
    const flushLeft = Math.abs(c.x0 - bb.x0) <= FLUSH_TOL_M;
    const flushRight = Math.abs(c.x1 - bb.x1) <= FLUSH_TOL_M;
    if (!flushBack || (!flushLeft && !flushRight)) {
        return reject(
            levelIndex,
            `single-core landing: the core must sit flush in a rear corner of the ${fmt(W)} × ${fmt(D)} m plate ` +
            `(got core x[${fmt(c.x0)},${fmt(c.x1)}] z[${fmt(c.z0)},${fmt(c.z1)}])`,
        );
    }
    const left = flushLeft;
    const core: Rect = {
        x0: left ? bb.x0 : c.x0,
        x1: left ? c.x1 : bb.x1,
        z0: c.z0,
        z1: bb.z1,
    };
    const cw = rectWidth(core), cd = rectDepth(core);
    if (cw >= W - EPS || cd >= D - EPS) {
        return reject(levelIndex, `single-core landing: the ${fmt(cw)} × ${fmt(cd)} m core does not fit inside the ${fmt(W)} × ${fmt(D)} m plate`);
    }

    // The area floor is the user's STATED minimum (a constraint), else the smallest demand minimum
    // (a derived target) — the same precedence the corridor partitioner's row gate uses.
    const smallestDemandMin = Math.min(...apartments.map((a) => a.minAreaM2));
    const floorAreaM2 = input.userMinApartmentAreaM2 !== undefined
        ? Math.max(1, input.userMinApartmentAreaM2)
        : Math.max(1, smallestDemandMin);
    const userMax = input.userMaxApartmentAreaM2;
    const enabled: Typology[] = Array.from(new Set(apartments.map((a) => a.typology)));

    // Landing depth scan: from its architectural minimum (never under a door width, never under the
    // core's own approach clearance) up to a bounded extra. Deterministic, ascending.
    const lwMin = round4(Math.max(DOOR_WIDTH_M, APPROACH_CLEAR_M, input.landingMinDepthM));
    const lwMax = round4(lwMin + LANDING_MAX_EXTRA_M);

    /** The two arrangements at one landing depth. Cells are listed door-first (the cell whose door
     *  fronts the landing's FACE, then the cell fronting its side). */
    const arrangementsAt = (lw: number): Array<{ arrangement: SingleCoreArrangement; landing: Rect; cells: CandidateCell[] }> => {
        const zA = round4(core.z0 - lw);
        if (zA - bb.z0 <= EPS) return [];
        const landing = normRect({ x0: core.x0, x1: core.x1, z0: zA, z1: core.z0 });
        // Beside-the-core X span (the party-wall side is the core's).
        const sideX0 = left ? core.x1 : bb.x0;
        const sideX1 = left ? bb.x1 : core.x0;
        const sideDoor: ApartmentCell['doorEdge'] = left ? 'x0' : 'x1';
        return [
            {
                arrangement: 'front-rear',
                landing,
                cells: [
                    { role: 'front', rect: normRect({ x0: bb.x0, x1: bb.x1, z0: bb.z0, z1: zA }), doorEdge: 'z1' },
                    { role: 'rear', rect: normRect({ x0: sideX0, x1: sideX1, z0: zA, z1: bb.z1 }), doorEdge: sideDoor },
                ],
            },
            {
                arrangement: 'side-pocket',
                landing,
                cells: [
                    { role: 'side', rect: normRect({ x0: sideX0, x1: sideX1, z0: bb.z0, z1: bb.z1 }), doorEdge: sideDoor },
                    { role: 'pocket', rect: normRect({ x0: core.x0, x1: core.x1, z0: bb.z0, z1: zA }), doorEdge: 'z1' },
                ],
            },
        ];
    };

    // ── Enumerate + score. Objective (strict order): most feasible cells; fewest cells above the
    // user's maximum; then placed area − λ·landing area (the corridor-economy term, so the smallest
    // landing that works wins). Ties keep the earlier candidate (front-rear first, shallower landing).
    let best: Candidate | null = null;
    const better = (a: Candidate, b: Candidate | null): boolean => {
        if (!b) return true;
        if (a.cells.length !== b.cells.length) return a.cells.length > b.cells.length;
        if (a.overMaxCount !== b.overMaxCount) return a.overMaxCount < b.overMaxCount;
        const sa = a.placedAreaM2 - CIRCULATION_AREA_LAMBDA * rectArea(a.landing);
        const sb = b.placedAreaM2 - CIRCULATION_AREA_LAMBDA * rectArea(b.landing);
        return sa > sb + EPS;
    };
    // The measured cells at the minimum landing, kept for the refusal copy (C74).
    const refusalLines: string[] = [];
    for (let lw = lwMin; lw <= lwMax + EPS; lw = round4(lw + LANDING_STEP_M)) {
        for (const arr of arrangementsAt(lw)) {
            const verdicts = arr.cells.map((cell) => ({ cell, why: cellVerdict(cell.rect, floorAreaM2, enabled, clipPolygon) }));
            if (lw === lwMin) {
                for (const v of verdicts) {
                    refusalLines.push(`${arr.arrangement}/${v.cell.role} ${dims(v.cell.rect)}${v.why ? ` — ${v.why}` : ' — feasible'}`);
                }
            }
            const feasible = verdicts.filter((v) => v.why === null).map((v) => v.cell);
            if (feasible.length === 0) continue;
            const infeasible = verdicts.find((v) => v.why !== null);
            const placedAreaM2 = feasible.reduce((s, cell) => s + rectArea(cell.rect), 0);
            const overMaxCount = userMax !== undefined
                ? feasible.filter((cell) => rectArea(cell.rect) > userMax + EPS).length
                : 0;
            const cand: Candidate = {
                arrangement: arr.arrangement,
                landingDepthM: lw,
                landing: arr.landing,
                cells: feasible,
                ...(infeasible ? { stranded: { rect: infeasible.cell.rect, role: infeasible.cell.role, reason: infeasible.why! } } : {}),
                placedAreaM2,
                overMaxCount,
            };
            if (better(cand, best)) best = cand;
        }
    }

    if (!best) {
        return reject(
            levelIndex,
            `single-core landing: on the ${fmt(W)} × ${fmt(D)} m plate a ${fmt(cw)} × ${fmt(cd)} m rear-corner core ` +
            `+ a ${fmt(lwMin)} m landing leaves no feasible apartment cell — ` +
            `a cell needs a short side ≥ ${ENGINE_MIN_ROW_DEPTH_M} m, aspect ≤ ${MAX_RECT_ASPECT}:1 and ` +
            `≥ ${floorAreaM2.toFixed(0)} m²; measured: ${refusalLines.join('; ')} (placed 0/2)`,
        );
    }

    // ── Materialise the winner as `ApartmentCell`s: typology re-stamped from area within the demand's
    // enabled palette, door centred in the span the door edge SHARES with the landing (clear of the
    // core / corners), reachability tagged from that same shared span.
    const landingBands: readonly Rect[] = [best.landing];
    const connected = new Set<number>([0]);
    const placements: ApartmentCell[] = [];
    let reached = 0;
    best.cells.forEach((cell, i) => {
        const demand = apartments[Math.min(i, apartments.length - 1)]!;
        const areaM2 = round4(rectArea(cell.rect));
        const typology = enabled.length > 1 ? typologyForArea(areaM2, enabled) : demand.typology;
        const base: ApartmentCell = {
            typology,
            rect: cell.rect,
            areaM2,
            doorEdge: cell.doorEdge,
            polygon: rectPolygon(cell.rect),
        };
        const dp = computeCoreDoorPlacement(base, landingBands, connected);
        if (dp) reached++;
        placements.push({
            ...base,
            coreReachable: dp !== null,
            ...(dp ? { coreDoorOffset: dp.offset, coreDoorWidth: dp.width } : {}),
        });
    });

    const bbArea = W * D;
    const netPlateArea = Math.max(EPS, bbArea - rectArea(core));
    const fillRatio = round4(best.placedAreaM2 / netPlateArea);
    const corridorAreaM2 = round4(rectArea(best.landing));
    const stranded = best.stranded
        ? {
            areaM2: round4(rectArea(best.stranded.rect)),
            widthM: round4(rectWidth(best.stranded.rect)),
            depthM: round4(rectDepth(best.stranded.rect)),
            reason: `the ${best.stranded.role} bay ${dims(best.stranded.rect)} is left unassigned: ${best.stranded.reason}`,
        }
        : undefined;
    const diagnostic =
        `§DIAG-RESI-SINGLE-CORE level=${levelIndex} status=ok arrangement=${best.arrangement} ` +
        `N=${placements.length} core=${fmt(cw)}x${fmt(cd)}@${left ? 'x0' : 'x1'}/z1 landing=${fmt(best.landingDepthM)}m ` +
        `cells=[${best.cells.map((cell) => `${cell.role}:${dims(cell.rect)}`).join(', ')}] ` +
        `mix=[${placements.map((p) => p.typology).join(',')}] reached=${reached}/${placements.length} ` +
        `fillRatio=${fillRatio.toFixed(3)} landingArea=${corridorAreaM2.toFixed(1)}m²` +
        (stranded ? ` stranded=${stranded.areaM2.toFixed(0)}m²` : '');

    return {
        status: 'ok',
        core: normRect(core),
        publicCorridor: landingBands,
        apartmentCells: placements,
        apartmentsReached: reached,
        apartmentsCoreReachable: reached,
        fillRatio,
        corridorAreaM2,
        strategy: 'single-core-landing',
        ...(stranded ? { stranded } : {}),
        diagnostic,
    };
}
