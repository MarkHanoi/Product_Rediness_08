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
import { rectArea, rectWidth, rectDepth, principalAxisAngle, rotatePt } from '../apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../apartmentLayout/types.js';
import {
    packApartments,
    type PlannedApartment,
} from './apartmentPacker.js';
import {
    partitionLevelPlate,
    MAX_APARTMENT_DEPTH_M,
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
/** §RESI-ENGINE-FEASIBLE-MIN — the per-apartment net-area floor the packer targets so
 *  cells come out COMFORTABLY layout-able by the per-cell D-TGL engine (a lean 2-bed
 *  lays out reliably at ≥ ~72 m²; below that the squarify carve soft-fails). Bounded by
 *  the user's MAX so a deliberately-small request still runs (cells then scale to
 *  studios / 1-beds). */
const MIN_ENGINE_FEASIBLE_AREA_M2 = 72;

export type LevelRole = 'ground' | 'upper';

export interface ResidentialBuildingOrchestratorInput {
    /** The building footprint polygon (metres, WORLD plan frame). May be a ROTATED
     *  (off-axis) parcel drawn on the map — the orchestrator derives the principal-axis
     *  oriented bounding box, runs the whole partition/packer/per-cell engine in that
     *  axis-aligned LOCAL frame, and carries a rigid transform back to WORLD on the
     *  result (`transform`). Mirrors the HOUSE engine's §PRINCIPAL-AXIS rotation
     *  (`houseOrchestrator.ts:555` + Project-North rectify). Only a degenerate/too-small
     *  plate is rejected. */
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

/** One level in the stack. `footprint` is the WORLD drawn parcel polygon, identical on
 *  every level (walls stack). Unlike the core/cells/corridor (LOCAL frame), the level
 *  footprint is ALREADY world — the executor builds the shell on it directly. */
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

/**
 * §RESI-RIGID-TRANSFORM (2026-06-23) — the rigid transform that maps the orchestrator's
 * axis-aligned LOCAL (principal-axis) geometry back onto the real WORLD parcel. Mirrors
 * the house's `{ principalAxisRad, pivot }` (`houseOrchestrator.ts`). The orchestrator
 * derived the parcel's oriented bounding box (centre `pivot`, angle `thetaRad`), de-rotated
 * the footprint into the axis-aligned local frame, and ran the WHOLE partition/packer/
 * per-cell D-TGL engine there UNCHANGED. So `core`, every `cell.rect`, every
 * `publicCorridor` band, and every per-cell `layout` (walls/doors/windows, plan-mm) are in
 * that LOCAL frame. The executor maps a local point `p` to world by
 * `rotatePt(p, thetaRad, pivot)`. `thetaRad === 0` ⇒ identity (an axis-aligned parcel ⇒
 * byte-identical to the pre-transform behaviour). `levels[].footprint` is the EXCEPTION —
 * it is already the WORLD drawn footprint (the shell is built directly on the parcel).
 */
export interface ResidentialRigidTransform {
    /** local→world rotation (rad, CCW, plan {x,z}) about `pivot`. 0 ⇒ identity. */
    readonly thetaRad: number;
    /** The pivot the rotation turns about (WORLD metres) — the parcel centroid. */
    readonly pivot: { readonly x: number; readonly z: number };
}

export interface ResidentialBuildingOk {
    readonly status: 'ok';
    readonly levels: readonly BuildingLevel[];
    /** The shared centred core rect (same XZ on every level), metres, LOCAL frame —
     *  apply `transform` to land it on the world parcel. */
    readonly core: Rect;
    readonly perLevelApartments: readonly PerLevelApartments[];
    /** §RESI-RIGID-TRANSFORM — maps LOCAL (principal-axis) geometry → WORLD parcel. */
    readonly transform: ResidentialRigidTransform;
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

/** A near-axis-aligned plate (|θ| < ~0.6°) collapses to θ = 0 so it stays byte-identical to
 *  the pre-transform behaviour. Mirrors the house's `Math.abs(rawAngle) >= 0.01` threshold
 *  (`houseOrchestrator.ts:556`) + `deriveProjectNorthFrame`. */
const PRINCIPAL_AXIS_MIN_RAD = 0.01;

/**
 * §RESI-RIGID-TRANSFORM — derive the parcel's ORIENTED bounding box (the principal-axis
 * frame) from the drawn WORLD footprint: the dominant-edge angle `thetaRad`, the centroid
 * `pivot`, and the LOCAL axis-aligned footprint that results from de-rotating the parcel by
 * `−thetaRad` about the pivot. EXACTLY mirrors the house engine (`houseOrchestrator.ts:555`):
 * the OBB is the AABB of the de-rotated polygon, so a ROTATED rectangle de-rotates to a clean
 * axis-aligned rectangle of side W×D and the whole downstream engine runs as if axis-aligned.
 * θ = 0 ⇒ the footprint passes through unrotated (identity). Pure + deterministic.
 */
function deriveLocalFrame(footprintWorld: readonly Pt[]): {
    thetaRad: number;
    pivot: { x: number; z: number };
    footprintLayout: Pt[];
} {
    const raw = principalAxisAngle(footprintWorld);
    const thetaRad = Math.abs(raw) >= PRINCIPAL_AXIS_MIN_RAD ? raw : 0;
    let cx = 0, cz = 0;
    for (const p of footprintWorld) { cx += p.x; cz += p.z; }
    const n = footprintWorld.length || 1;
    const pivot = { x: cx / n, z: cz / n };
    // De-rotate the parcel into the axis-aligned LOCAL (principal-axis) frame by −θ about
    // the pivot. θ = 0 ⇒ identity (the footprint is already axis-aligned).
    const footprintLayout = thetaRad === 0
        ? footprintWorld.map(p => ({ x: p.x, z: p.z }))
        : footprintWorld.map(p => rotatePt(p, -thetaRad, pivot));
    return { thetaRad, pivot, footprintLayout };
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
        footprint: footprintWorld, upperLevels, coreWidthM, coreDepthM, corridorWidthM,
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
    if (footprintWorld.length < 3) {
        return reject('footprint needs ≥3 distinct corners');
    }

    // ── §RESI-RIGID-TRANSFORM (replaces the axis-aligned-rectangle STUB) — accept a ROTATED
    // (or any) parcel by deriving its principal-axis ORIENTED bounding box, then run the
    // whole partition/packer/per-cell engine in the axis-aligned LOCAL frame and carry the
    // rigid transform back to WORLD on the result. Mirrors the HOUSE engine
    // (`houseOrchestrator.ts:555` §PRINCIPAL-AXIS). `bb` (the local AABB) IS the oriented box
    // of the world parcel: a rotated W×D rectangle de-rotates to a clean axis-aligned W×D
    // rect, so every downstream geometry op (core / partition / packer / per-cell D-TGL) runs
    // EXACTLY as it did on an axis-aligned plate — no engine code changes.
    const { thetaRad, pivot, footprintLayout } = deriveLocalFrame(footprintWorld);
    const transform: ResidentialRigidTransform = { thetaRad, pivot };

    // The footprint expressed in the axis-aligned LOCAL frame. All core/partition/packer math
    // below uses THIS frame; only `levels[].footprint` (the shell) keeps the WORLD parcel.
    const footprint = footprintLayout;
    const bb = bbox(footprint);

    const plateW = rectWidth(bb);
    const plateD = rectDepth(bb);
    // §RESI-DEGENERATE-REJECT — a genuinely degenerate / too-thin plate (after de-rotation)
    // is the ONLY plate-shape reject now (the old "must be axis-aligned rectangle" stub is
    // gone). A plate too small to even hold the core is also rejected with a clear reason.
    if (!(plateW > 1e-3) || !(plateD > 1e-3)) {
        return reject('footprint is degenerate (zero width/depth after orienting)');
    }
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
                // §RESI-RIGID-TRANSFORM — the level footprint is the WORLD parcel (the shell
                // is built on it directly); only the core/cells/corridor are LOCAL-frame.
                footprint: footprintWorld, commercialGroundFloor: true,
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
        // §RESI-PACKER-CAPACITY-MATCH (Task 1, 2026-06-23) — the partition CAPS each
        // apartment's depth at MAX_APARTMENT_DEPTH_M (§RESI-CELL-FEASIBLE) and leaves any
        // deeper band residual UN-tiled. The packer's net-area estimate must use the SAME
        // CAPPED depth, else it over-counts capacity (a ~20 m-deep band looks like ~20 m of
        // usable apartment when only ~9 m is). Pre-fix, the founder plate's bands (~20 m
        // each) made the packer propose N=22 tiny apartments for a plate that physically
        // holds ~8 — the orchestrator then prefix-trimmed AND the partition clamped the few
        // it placed into 22-28 m² slivers (below every typology's grossMin → every cell
        // rejected). Capping the depth here aligns the packer's N with the partition's real
        // capacity, so the cells come out at the typology target size + lay out.
        const usableDepth = Math.min(frontDepth, MAX_APARTMENT_DEPTH_M) + Math.min(backDepth, MAX_APARTMENT_DEPTH_M);
        const netAreaM2 = round4(usableDepth * placeableXSpan);

        // §RESI-ENGINE-FEASIBLE-MIN (Task 1, 2026-06-23) — the per-cell D-TGL engine needs
        // a cell COMFORTABLY above the bare envelope grossMin before a real multi-room
        // apartment lays out (a full 2-bed needs ~72 m², not the 60 m² envelope floor — the
        // dining + hall + corridor push the room budget up; see §RESI-LEAN-PROGRAM which
        // trims those, but the cell still needs headroom for the squarify carve). If we let
        // the packer size cells down to the bare user/envelope min it produces ~64 m² cells
        // that the engine still soft-fails. So FLOOR the per-apartment min the packer targets
        // at MIN_ENGINE_FEASIBLE_AREA_M2 — bounded by the user's MAX so we never exceed the
        // requested band. The result is FEWER, LARGER, engine-feasible cells. When the user
        // MAX is below the floor (a deliberately tiny-apartment request) we keep their min so
        // the packer still runs (those cells lay out as studios / 1-beds via scaleCellProgram).
        const packerMin = Math.min(
            Math.max(minApartmentAreaM2, MIN_ENGINE_FEASIBLE_AREA_M2),
            maxApartmentAreaM2,
        );

        const packed = packApartments({
            levelIndex,
            netAreaM2,
            minApartmentAreaM2: packerMin,
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

        levels.push({ levelIndex, role, elevationM, floorToFloorM, footprint: footprintWorld });
        perLevelApartments.push({
            levelIndex, role, apartments, publicCorridor: partition.publicCorridor,
        });
    }

    const apartmentsPerLevel = perLevelApartments.map((l) => l.apartments.length);
    const diagnostic =
        `§DIAG-RESI-ORCHESTRATE levels=${levels.length} ` +
        `coreCentre=(${round4(fcx)},${round4(fcz)}) ` +
        `rot=${round4(thetaRad)}rad pivot=(${round4(pivot.x)},${round4(pivot.z)}) ` +
        `apartmentsPerLevel=[${apartmentsPerLevel.join(',')}]`;

    return {
        status: 'ok',
        levels,
        core,
        perLevelApartments,
        transform,
        diagnostic,
    };
}
