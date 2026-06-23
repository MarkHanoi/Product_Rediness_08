// Residential building (multi-family) — Slice B / Tracker P3 — the ORCHESTRATOR SKELETON.
//
// A PURE deterministic L2 function (zero THREE, zero DOM, zero I/O, zero RNG) mirroring
// `houseLayout/houseOrchestrator.ts` BUT with the residential differences (audit §3):
//
//  • STOREY LOOP over N levels (ground + 1..20 upper) — like `houseOrchestrator`'s
//    enumeratePerStorey (`:467`) + assembleHouse (`:762`), but reframed for a building.
//
//  • A CENTRED CORE (stair + lift) in the SAME plan position on every level — the NEW
//    placement policy `corePlacement:'centre'` (audit §3.1). THE DIVERGENCE FROM THE
//    HOUSE: `houseLayout/stairPosition.ts:557` (`chooseStairCorePosition`) scores
//    candidates with `PERIMETER_PREFERENCE=1.0` + `ASPECT_WEIGHT` so the house stair
//    lands at a WORST-ASPECT BACK CORNER (correct for a single dwelling: don't waste
//    good frontage on circulation). A MULTI-FAMILY building wants circulation in the
//    MIDDLE with apartments ringing it — so the core is CENTRAL BY RULE. This module
//    computes the centred core DIRECTLY (footprint-bbox centroid) and does NOT touch
//    the house default; wiring the `'centre'` option INTO `chooseStairCorePosition`
//    itself (so the shared reserve path produces it) is the separate, additive tracker
//    task P3.1 (`stairPosition.ts` gains a `corePlacement` param). The new invariant is
//    **R-CENTRE: the core AABB centroid ≈ the footprint centroid** (audit §3.1).
//
//  • GROUND FLOOR = core + commercial ring, NO apartments (audit §3.3). The commercial
//    units are a STUB/MARKER here (`commercialGroundFloor` flag on the level) — the real
//    curtain-wall shopfront emission is the P5 slice.
//
//  • UPPER FLOORS = core + public corridor + apartments via P6.1 (`packApartments`) →
//    P6.2 (`partitionLevelPlate`). Each placed apartment cell exposes a STUB SEAM where
//    the per-cell D-TGL run (`generateDeterministicLayouts`) will subdivide it into rooms
//    in the P7 slice — we leave the seam (cell + program, `rooms` undefined), we do NOT
//    wire D-TGL yet.
//
// Returns a `ResidentialBuildingResult`-shaped object (levels[], core, perLevelApartments[]).
// Diagnostic: `§DIAG-RESI-ORCHESTRATE levels=… coreCentre=(x,z) apartmentsPerLevel=[…]`.
// Soft-fail (C50 §1.7): any infeasible level → `{ status:'rejected', reason }`; never throws.
//
// Contracts: audit §3 (orchestration divergences); C50 §1.7 (soft-fail not throw); C53
// (generative engine); C11 (the executor that consumes this is a later slice); ADR-0063 H3
// (core containment — a centred core is trivially contained); P8 (≥1 span per exported fn).

import { trace } from '@opentelemetry/api';
import type { Pt, Rect } from '../apartmentLayout/tgl/rectDecomposition.js';
import { rectArea, rectWidth, rectDepth } from '../apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../apartmentLayout/types.js';
import {
    packApartments,
    type PlannedApartment,
} from './apartmentPacker.js';
import {
    partitionLevelPlate,
    type Typology,
    type ApartmentDemand,
    type ApartmentCell,
} from './platePartition.js';
import {
    runApartmentCellLayout,
    type CellEdge,
    type ApartmentCellLayoutResult,
} from './runApartmentCellLayout.js';
import type { ScoredLayoutOption } from '../apartmentLayout/types.js';

const _tracer = trace.getTracer('@pryzm/ai-host', '0.1.0');

const DEFAULT_FLOOR_TO_FLOOR_M = 3.0;
const DEFAULT_BASE_ELEVATION_M = 0;
/** Door clear width (m) — the corridor must be ≥ this; reused by the partition. */
const MIN_CORRIDOR_WIDTH_M = 0.8;

export type LevelRole = 'ground' | 'upper';

export interface ResidentialBuildingOrchestratorInput {
    /** The building footprint polygon (metres, plan frame). The stub requires an
     *  axis-aligned rectangle (the executor rectifies skewed plates upstream, like the
     *  house engine's principal-axis rotation). */
    readonly footprint: readonly Pt[];
    /** Number of UPPER residential levels (1..20). Ground is always level 0. */
    readonly upperLevels: number;
    /** Centred-core plan width (m) — the stair + lift keep-out. */
    readonly coreWidthM: number;
    /** Centred-core plan depth (m). */
    readonly coreDepthM: number;
    /** Public-corridor clear width (m). */
    readonly corridorWidthM: number;
    /** Per-apartment net-area band (m²) — the user input. */
    readonly minApartmentAreaM2: number;
    readonly maxApartmentAreaM2: number;
    /** Which apartment typologies are enabled. */
    readonly typologies: { readonly T1: boolean; readonly T2: boolean; readonly T3: boolean; readonly T4: boolean };
    /** Floor-to-floor height (m). Defaults to 3.0. */
    readonly floorToFloorM?: number;
    /** Base elevation of the ground floor (m). Defaults to 0. */
    readonly baseElevationM?: number;
    /** OPTIONAL site latitude (decimal degrees) → climate-driven per-cell window
     *  orientation (D-TGL P7). Absent ⇒ pure-length window placement. */
    readonly solar?: { readonly latDeg: number; readonly weight?: number };
}

/** One level in the stack. `footprint` is identical on every level (walls stack). */
export interface BuildingLevel {
    readonly levelIndex: number;
    readonly role: LevelRole;
    readonly elevationM: number;
    readonly floorToFloorM: number;
    readonly footprint: readonly Pt[];
    /** Ground only: the commercial ring marker for the P5 curtain-wall slice. */
    readonly commercialGroundFloor?: boolean;
}

/** One apartment placed on an upper level. P7 fills `layout` (the per-cell D-TGL run). */
export interface PlacedApartment {
    readonly typology: Typology;
    readonly targetAreaM2: number;
    readonly program: ApartmentProgram;
    /** The plate-partition cell rect this apartment occupies. */
    readonly cell: ApartmentCell;
    // ── P7 (D-TGL per cell) ──────────────────────────────────────────────────────────
    /** The chosen (best) D-TGL `LayoutOption` for this cell — rooms + windows + doors.
     *  Absent ONLY when `status === 'rejected'` (the cell soft-failed the engine, C50 §1.7);
     *  the building still ships with the OTHER apartments laid out. */
    readonly layout?: ScoredLayoutOption;
    /** P7 per-cell status. `'ok'` ⇒ `layout` present; `'rejected'` ⇒ no layout (soft-fail). */
    readonly status: 'ok' | 'rejected';
    /** Soft-fail reason when `status === 'rejected'`. */
    readonly rejectReason?: string;
    /** The TRUE EXTERIOR FAÇADE edges of `cell.rect` (the rest are blind party walls). */
    readonly facadeEdges: readonly CellEdge[];
    /** The BLIND party-wall edges of `cell.rect` (no windows hosted on these). */
    readonly blindEdges: readonly CellEdge[];
}

export interface PerLevelApartments {
    readonly levelIndex: number;
    readonly role: LevelRole;
    readonly apartments: readonly PlacedApartment[];
    /** The public-corridor band(s) on this level (empty on the ground). */
    readonly publicCorridor: readonly Rect[];
}

export interface ResidentialBuildingOk {
    readonly status: 'ok';
    readonly levels: readonly BuildingLevel[];
    /** The shared centred core rect (same XZ on every level), metres, plan frame. */
    readonly core: Rect;
    readonly perLevelApartments: readonly PerLevelApartments[];
    readonly diagnostic: string;
}

export interface ResidentialBuildingRejected {
    readonly status: 'rejected';
    readonly reason: string;
    readonly diagnostic: string;
}

export type ResidentialBuildingResult = ResidentialBuildingOk | ResidentialBuildingRejected;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function bbox(poly: readonly Pt[]): Rect {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { x0, z0, x1, z1 };
}

function isAxisAlignedRect(poly: readonly Pt[], bb: Rect): boolean {
    if (poly.length < 4) return false;
    for (const p of poly) {
        const onX = Math.abs(p.x - bb.x0) < 1e-4 || Math.abs(p.x - bb.x1) < 1e-4;
        const onZ = Math.abs(p.z - bb.z0) < 1e-4 || Math.abs(p.z - bb.z1) < 1e-4;
        if (!onX || !onZ) return false;
    }
    return rectWidth(bb) > 1e-6 && rectDepth(bb) > 1e-6;
}

function reject(reason: string): ResidentialBuildingRejected {
    const diagnostic = `§DIAG-RESI-ORCHESTRATE status=rejected reason="${reason}"`;
    return { status: 'rejected', reason, diagnostic };
}

/**
 * Orchestrate a multi-family residential building. PURE + DETERMINISTIC.
 *
 * Per the audit §3 differences:
 *  - level 0 = ground (core + commercial stub, NO apartments);
 *  - levels 1..N = upper (core + corridor + packed apartments);
 *  - one CENTRED core, identical XZ on every level (R-CENTRE invariant).
 *
 * Infeasible inputs → `{ status:'rejected' }` (C50 soft-fail; never throws on a miss).
 */
export function orchestrateResidentialBuilding(
    input: ResidentialBuildingOrchestratorInput,
): ResidentialBuildingResult {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.residentialBuilding.orchestrate',
        (span) => {
            try {
                const out = _orchestrate(input);
                span.setAttribute('pryzm.resi.orchestrate.status', out.status);
                if (out.status === 'ok') {
                    span.setAttribute('pryzm.resi.orchestrate.levels', out.levels.length);
                }
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        },
    ) as ResidentialBuildingResult;
}

/**
 * Bridge a packed apartment into the plate-partition's `ApartmentDemand`. The packer has
 * already chosen the target area; we hand the partition a TIGHT band around that target
 * (clamped non-negative) so the partition places a cell at (≈) the target size.
 */
function demandFor(a: PlannedApartment): ApartmentDemand {
    const tol = Math.max(2, a.targetAreaM2 * 0.1); // ±10% (≥2 m²) placement tolerance
    return {
        typology: a.typology,
        minAreaM2: Math.max(1, a.targetAreaM2 - tol),
        maxAreaM2: a.targetAreaM2 + tol,
    };
}

/** Edge-coincidence tolerance (m) — a cell edge is on the footprint boundary when its
 *  constant coordinate is within this of the plate bbox edge. The partition rounds rects
 *  to 4 dp, so a tight tolerance is enough. */
const FACADE_TOL_M = 1e-3;

/**
 * §DIAG-PARTY-WALL (audit §7) — the TRUE EXTERIOR FAÇADE edges of an apartment cell.
 *
 * A cell edge is a façade (window-eligible) iff it lies on the BUILDING FOOTPRINT boundary
 * (`plateBB`) AND it is NOT the cell's corridor-facing door edge. Every OTHER edge is BLIND:
 *  - the `doorEdge` faces the public corridor (a party wall to circulation);
 *  - an interior edge (not on the footprint boundary) is shared with a neighbouring
 *    apartment or straddles the core (a party wall to a neighbour / the core).
 *
 * The centred core straddles the corridor, so it never abuts an apartment's exterior edge —
 * the boundary test alone correctly excludes the corridor/core/neighbour party walls. Pure.
 */
function facadeEdgesFor(cell: ApartmentCell, plateBB: Rect): CellEdge[] {
    const r = cell.rect;
    const edges: CellEdge[] = [];
    const onBoundary: Record<CellEdge, boolean> = {
        x0: Math.abs(r.x0 - plateBB.x0) <= FACADE_TOL_M,
        x1: Math.abs(r.x1 - plateBB.x1) <= FACADE_TOL_M,
        z0: Math.abs(r.z0 - plateBB.z0) <= FACADE_TOL_M,
        z1: Math.abs(r.z1 - plateBB.z1) <= FACADE_TOL_M,
    };
    for (const e of ['x0', 'x1', 'z0', 'z1'] as const) {
        if (e === cell.doorEdge) continue;       // corridor side → blind by construction
        if (onBoundary[e]) edges.push(e);        // on the plate perimeter → true façade
    }
    return edges;
}

function _orchestrate(input: ResidentialBuildingOrchestratorInput): ResidentialBuildingResult {
    const {
        footprint, upperLevels, coreWidthM, coreDepthM, corridorWidthM,
        minApartmentAreaM2, maxApartmentAreaM2, typologies,
    } = input;

    if (!Number.isInteger(upperLevels) || upperLevels < 1 || upperLevels > 20) {
        return reject('upperLevels must be an integer in 1..20');
    }
    if (!(coreWidthM > 0) || !(coreDepthM > 0)) {
        return reject('core dimensions must be positive');
    }
    if (!(corridorWidthM >= MIN_CORRIDOR_WIDTH_M)) {
        return reject(`corridor width must be ≥ ${MIN_CORRIDOR_WIDTH_M} m`);
    }

    const bb = bbox(footprint);
    if (!isAxisAlignedRect(footprint, bb)) {
        return reject('footprint must be an axis-aligned rectangle (stub)');
    }

    const plateW = rectWidth(bb);
    const plateD = rectDepth(bb);
    if (coreWidthM >= plateW || coreDepthM >= plateD) {
        return reject('core does not fit inside the footprint');
    }

    // ── R-CENTRE: place the core centred on the footprint centroid, identical XZ on
    // every level. This is the residential divergence from the house's worst-aspect
    // corner placement (see file header + audit §3.1).
    const fcx = (bb.x0 + bb.x1) / 2;
    const fcz = (bb.z0 + bb.z1) / 2;
    const core: Rect = {
        x0: round4(fcx - coreWidthM / 2),
        z0: round4(fcz - coreDepthM / 2),
        x1: round4(fcx + coreWidthM / 2),
        z1: round4(fcz + coreDepthM / 2),
    };

    const floorToFloorM = input.floorToFloorM ?? DEFAULT_FLOOR_TO_FLOOR_M;
    const baseElevationM = input.baseElevationM ?? DEFAULT_BASE_ELEVATION_M;

    const levels: BuildingLevel[] = [];
    const perLevelApartments: PerLevelApartments[] = [];

    // ── Storey loop: level 0 = ground, levels 1..N = upper.
    for (let levelIndex = 0; levelIndex <= upperLevels; levelIndex++) {
        const role: LevelRole = levelIndex === 0 ? 'ground' : 'upper';
        const elevationM = round4(baseElevationM + levelIndex * floorToFloorM);

        if (role === 'ground') {
            // Ground = core + commercial ring (NO apartments). Commercial is a STUB
            // marker for the P5 curtain-wall slice.
            levels.push({
                levelIndex, role, elevationM, floorToFloorM,
                footprint, commercialGroundFloor: true,
            });
            perLevelApartments.push({ levelIndex, role, apartments: [], publicCorridor: [] });
            continue;
        }

        // ── Upper level: core + public corridor + apartments.
        // The partition (P6.2) is GEOMETRICALLY AUTHORITATIVE: it runs the corridor band
        // full-width across X at the core's Z-centre, splitting the plate into a FRONT
        // band + a BACK band, and packs apartments FULL-BAND-DEEP into the X-runs each
        // band leaves either side of the core. So the true NET residential area the packer
        // may target is the SUM of those two band areas (NOT the naïve footprint − core −
        // corridor, which over-counts the strips beside the corridor that the full-band
        // packer can't use). Deriving the packer's net from the SAME geometry the partition
        // will use keeps the packer's N within the partition's placeable capacity → no
        // spurious orchestrator rejection on a feasible plate.
        const corrHalf = corridorWidthM / 2;
        const frontDepth = Math.max(0, (fcz - corrHalf) - bb.z0);
        const backDepth = Math.max(0, bb.z1 - (fcz + corrHalf));
        // The core straddles the corridor (centred), so its X-interval is carved out of
        // BOTH bands; the placeable X span per band is plate width − core width.
        const placeableXSpan = Math.max(0, plateW - coreWidthM);
        const netAreaM2 = round4((frontDepth + backDepth) * placeableXSpan);

        const packed = packApartments({
            levelIndex,
            netAreaM2,
            minApartmentAreaM2,
            maxApartmentAreaM2,
            typologies,
        });
        if (packed.status === 'rejected') {
            return reject(`level ${levelIndex} pack failed: ${packed.reason}`);
        }

        // P6.2: place the packed apartments into the plate via the partition planner.
        // The partition is GEOMETRICALLY AUTHORITATIVE and packs the WHOLE demand list or
        // rejects (it never partially places). The packer's net-area capacity is an AREA
        // estimate; the partition's true capacity is an INTEGER count bounded by how many
        // band-deep cells fit in the X-runs the centred core leaves either side. When the
        // packer proposes more than the runs can hold, we DETERMINISTICALLY trim the demand
        // list to the largest accepted PREFIX (drop the tail — the partition packs in
        // order). First K (packed.length → 1) the partition accepts wins. ZERO → soft-fail.
        const allDemands = packed.apartments.map(demandFor);
        let partition: ReturnType<typeof partitionLevelPlate> | null = null;
        for (let k = allDemands.length; k >= 1; k--) {
            const attempt = partitionLevelPlate({
                levelIndex,
                footprint,
                core,
                corridor: { widthM: corridorWidthM },
                apartments: allDemands.slice(0, k),
            });
            if (attempt.status === 'ok') {
                partition = attempt;
                break;
            }
        }
        if (!partition || partition.status !== 'ok') {
            return reject(`level ${levelIndex} partition placed zero apartments (core/corridor leave no usable band runs)`);
        }

        // Pair each PLACED cell back to its planned apartment, index-aligned: the
        // partition packs the demands in the GIVEN order, so cell[i] is plan[i]. The
        // partition is GEOMETRICALLY AUTHORITATIVE — it may place FEWER than the packer
        // proposed when the core fragments the bands into X-runs that can't hold every
        // proposed cell at its band-deep width. We honour the partition's actual count
        // (the placed cells are the real apartments; any un-placed plan tail is dropped,
        // never spuriously failing a feasible plate). A level that placed ZERO apartments
        // is a genuine capacity miss → soft-fail (C50 §1.7).
        const placed = partition.apartmentCells;
        if (placed.length === 0) {
            return reject(`level ${levelIndex} placed zero apartments (net area too small for the core/corridor split)`);
        }
        const plateBB = bb;   // the footprint bbox bounds every cell's façade test.
        const apartments: PlacedApartment[] = placed.map((cell: ApartmentCell, i: number) => {
            const plan = packed.apartments[i]!; // index-aligned with the demands fed in

            // §DIAG-PARTY-WALL — true exterior façade edges (the rest are blind party walls).
            const facadeEdges = facadeEdgesFor(cell, plateBB);
            const facadeSet = new Set<CellEdge>(facadeEdges);
            const blindEdges = (['x0', 'x1', 'z0', 'z1'] as const).filter((e) => !facadeSet.has(e));

            // P7 — run the FROZEN D-TGL engine on this clean apartment cell (rooms + windows
            // + doors). Windows are suppressed on blind party-wall edges. Soft-fails per cell.
            const cellResult: ApartmentCellLayoutResult = runApartmentCellLayout({
                cell: cell.rect,
                program: plan.program,
                facadeEdges,
                ...(input.solar ? { solar: input.solar } : {}),
            });

            const apt: PlacedApartment =
                cellResult.status === 'ok'
                    ? {
                          typology: plan.typology,
                          targetAreaM2: round4(rectArea(cell.rect)),
                          program: plan.program,
                          cell,
                          status: 'ok',
                          layout: cellResult.layout,
                          facadeEdges,
                          blindEdges,
                      }
                    : {
                          typology: plan.typology,
                          targetAreaM2: round4(rectArea(cell.rect)),
                          program: plan.program,
                          cell,
                          status: 'rejected',
                          rejectReason: cellResult.reason,
                          facadeEdges,
                          blindEdges,
                      };

            // §DIAG-RESI-APARTMENT level=k apt=i typology=Tn rooms=… windows=… blindEdges=…
            const rooms = cellResult.status === 'ok' ? cellResult.roomCount : 0;
            const windows = cellResult.status === 'ok' ? cellResult.windowCount : 0;
            console.log(
                `[resi-building] §DIAG-RESI-APARTMENT level=${levelIndex} apt=${i} ` +
                `typology=${plan.typology} status=${cellResult.status} rooms=${rooms} ` +
                `windows=${windows} blindEdges=[${blindEdges.join(',')}]` +
                (cellResult.status === 'rejected' ? ` reason="${cellResult.reason}"` : ''),
            );

            return apt;
        });

        levels.push({ levelIndex, role, elevationM, floorToFloorM, footprint });
        perLevelApartments.push({
            levelIndex, role, apartments, publicCorridor: partition.publicCorridor,
        });
    }

    const apartmentsPerLevel = perLevelApartments.map((l) => l.apartments.length);
    const diagnostic =
        `§DIAG-RESI-ORCHESTRATE levels=${levels.length} ` +
        `coreCentre=(${round4(fcx)},${round4(fcz)}) ` +
        `apartmentsPerLevel=[${apartmentsPerLevel.join(',')}]`;

    return {
        status: 'ok',
        levels,
        core,
        perLevelApartments,
        diagnostic,
    };
}
