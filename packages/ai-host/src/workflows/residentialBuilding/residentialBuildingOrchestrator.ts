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
import { COINCIDENT_M, pointInPolygonXZ } from '@pryzm/geometry-kernel';
// §RESI-CORE-REWORK — derive the minimum core plan size from the stair + lift footprints +
// the 1.2 m approach clearances (single source of truth shared with the executor).
import { deriveCoreSizing, APPROACH_CLEAR_M } from './coreSizing.js';
// §RESI-SINGLE-CORE-LANDING (ADR-0372, L-11190) — the small-plate typology: one compact rear-corner
// core + a landing, no corridor. Planned by its own pure module, consumed through the SAME
// `PlatePartitionResult` shape as the corridor grid.
import { partitionSingleCoreLanding } from './singleCoreLanding.js';
// P8 (tracker) — the corridor-spine GATE. ISOLATED + GATED: importing it changes nothing on the
// default path; the assessment only RUNS when `__pryzmResidentialCorridorGate === true`, so
// production stays byte-identical until the founder browser-validates (tracker P8 gate column).
import { assessCorridorQuality, corridorQualityGateOn } from './residentialCorridorQuality.js';
import type { Pt, Rect } from '../apartmentLayout/tgl/rectDecomposition.js';
import { rectArea, rectWidth, rectDepth, principalAxisAngle, rotatePt, decomposeToRects } from '../apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../apartmentLayout/types.js';
import {
    packApartments,
    programFor,
    type PlannedApartment,
} from './apartmentPacker.js';
import {
    partitionLevelPlate,
    MAX_APARTMENT_DEPTH_M,
    MAX_RECT_ASPECT,
    TYPOLOGY_AREA_BAND,
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

/**
 * §DIAG-RESI-APARTMENT diagnostic gate. Per-apartment breadcrumb logging is OFF by
 * default (a 20-storey tower would emit thousands of lines in a hot loop). Set
 * `globalThis.__pryzmLayoutDiag = true` in the console to restore every §DIAG line.
 * The `if` short-circuits BOTH the console call AND the template-string build. P4:
 * cast through `globalThis`, never `(window as any)`.
 */
const _layoutDiagOn = (): boolean =>
    (globalThis as unknown as { __pryzmLayoutDiag?: boolean }).__pryzmLayoutDiag === true;

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

// §RESI-SMALL-PLATE-CORE-SCALE (founder 2026-06-24: "a ~352 m² plot rejects as too small") — the
// generator assumed a FIXED ~6×4 m core + 1.5 m corridor on every plate. On a small (~350 m²,
// ~19 m square) plot the centred 6 m core eats the middle, leaving only ~6.5 m-wide apartment runs
// either side — too narrow to host even a min-area apartment at the band depth → the partition
// returns "no usable band runs" → the orchestrator rejects ("too small"). The plot CAN hold a small
// point-block once the core is shrunk to a functional stair+lift minimum. So we SCALE THE CORE DOWN
// on a small plate: the effective core is the requested size, but never so large that it leaves a
// side-run narrower than `MIN_SIDE_RUN_M` (so an apartment fits beside it) and never below the
// functional `MIN_CORE_DIM_M` (a real stair + lift still fits). A LARGE plate (where `plate − 2·run`
// already exceeds the requested core) keeps the requested core EXACTLY — byte-identical to before.
/** Functional minimum core plan dimension (m) — a single scissor stair + a small lift still fit. */
const MIN_CORE_DIM_M = 2.6;
/** Minimum apartment run width (m) the core must leave on each side along X so a min-area apartment
 *  fits beside the core at the band depth (a ~66 m² cell at an ~8.5 m band is ~7.8 m wide). */
const MIN_SIDE_RUN_M = 8.5;
/** Minimum apartment band DEPTH (m) the core must leave front+back so a layout-able apartment fits
 *  toward each façade — mirrors the per-cell engine's ~7.5 m comb-feasibility floor. */
const MIN_BAND_DEPTH_M = 7.5;

// ─────────────────────────────────────────────────────────────────────────────────────────
// §RESI-NARROW-PLATE-SIDE-CORE (founder 2026-08-01: "why is a plot of 674 m² too small? …
// you could even build a resi building in a plot of 150 m²")
//
// THE MEASURED ROOT CAUSE — and why §RESI-SMALL-PLATE-CORE-SCALE (the 2026-06-24 fix for the
// SAME founder report) could not close this class:
//
//   There is NO plot-AREA gate anywhere in this engine. The binding quantity is the plate's
//   WIDTH (the X extent of the principal-axis plate). Sweeps over the real engine:
//     • 16 m × 45 m  =  720 m² → REJECTED      • 16.5 m × 16.5 m = 272 m² → builds
//   i.e. a 720 m² plate refuses while a 272 m² plate builds. Area is orthogonal to the gate.
//
//   MECHANISM. `platePartition` carves a vertical circulation SPINE at the core's X-centre out
//   of EVERY apartment row (that spine is what links the horizontal corridor bands back to the
//   core), so every row is split into TWO X-runs, one either side. A run narrower than an
//   apartment's own area-floor width (`MIN_ENGINE_FEASIBLE_AREA_M2 / MAX_APARTMENT_DEPTH_M` =
//   72 / 9 = 8 m) is SKIPPED. On a narrow plate both runs fall under that floor → zero cells.
//
//   WHY THE EARLIER FIX WAS INSUFFICIENT. `effectiveCoreSize` had exactly ONE lever — shrink the
//   core — and NO fallback for when shrinking is not enough. It computed
//   `wByRuns = plateW − 2·MIN_SIDE_RUN_M` and then took `max(MIN_CORE_DIM_M, min(req, wByRuns))`.
//   Once `wByRuns < MIN_CORE_DIM_M` — i.e. once `plateW < 2·8.5 + 2.6 = 19.6 m` — the
//   `MIN_CORE_DIM_M` FLOOR WINS and the two-usable-runs goal the function documents is SILENTLY
//   ABANDONED: it returns a core it has already proven cannot leave usable runs, the partition
//   places zero, and the orchestrator refuses. Shrinking the core further can never fix it (a
//   real stair + lift has a floor), so no further tuning of that constant could ever close the
//   class. The MISSING PIECE was an alternative ARRANGEMENT, not a smaller number.
//
//   THE FIX — the MISSING ARRANGEMENT, added as a FALLBACK (never as a new threshold). The centred
//   arrangement is still attempted FIRST on every plate, so nothing that builds today changes. Only
//   when it places zero apartments does the engine retry with the standard narrow-plot residential
//   typology: a SIDE core (flush to one plate edge) serving a SINGLE-LOADED run of apartments. That
//   needs only ONE run, so the buildable width floor drops from `2·MIN_SIDE_RUN_M + MIN_CORE_DIM_M`
//   (19.6 m) to `MIN_CORE_DIM_M + MIN_SIDE_RUN_M` (11.1 m) — MEASURED: the founder's 674 m² narrow
//   plate and a 12 × 12.5 m / 150 m² plot both build; an 11 m-wide plate of ANY area still refuses.
//   R-CENTRE (the centred-core invariant, file header + audit §3.1) therefore holds on every plate
//   that can host a centred core, and is relaxed ONLY where the alternative is refusing to build.
// ─────────────────────────────────────────────────────────────────────────────────────────

/** §RESI-NARROW-PLATE-SIDE-CORE — plate WIDTH (m) below which a CENTRED core can no longer reserve a
 *  full `MIN_SIDE_RUN_M` apartment run on BOTH sides: `2 × MIN_SIDE_RUN_M + MIN_CORE_DIM_M` = 19.6 m.
 *  ⚠ DOCUMENTARY ONLY — this is NOT a gate. The engine never switches arrangement on a width test; it
 *  attempts the centred plan and falls back only when that plan actually places nothing (so plates in
 *  the 16–19.6 m band, which do still build centred thanks to the partition's own smaller margins,
 *  keep their double-loaded plan). Exported so tests and docs quote a derived number, never a guess. */
export const MIN_CENTRED_CORE_PLATE_WIDTH_M = Math.round((2 * MIN_SIDE_RUN_M + MIN_CORE_DIM_M) * 1e4) / 1e4;

/** §RESI-NARROW-PLATE-SIDE-CORE — the ABSOLUTE minimum buildable plate WIDTH (m). A SIDE core at its
 *  functional minimum (a real stair + lift still fit) plus ONE apartment run wide enough to hold a
 *  min-area apartment. DERIVED: `MIN_CORE_DIM_M + MIN_SIDE_RUN_M` = 2.6 + 8.5 = 11.1 m. Below this
 *  NO core + corridor + apartment arrangement exists at ANY plate depth — so a refusal quoting this
 *  threshold is TRUE, and it is the ONLY plate-size threshold the product may quote. */
export const MIN_PLATE_WIDTH_M = Math.round((MIN_CORE_DIM_M + MIN_SIDE_RUN_M) * 1e4) / 1e4;

/** How the core is arranged on this plate. `'centre'` is the R-CENTRE default (double-loaded, a run
 *  either side); `'side'` is the narrow-plate single-loaded fallback (core flush to the x0 edge);
 *  `'corner'` is the §RESI-SINGLE-CORE-LANDING typology (ADR-0372): a compact core flush in a REAR
 *  corner with a landing in front of it and NO corridor — the small-plate building the founder
 *  photographed. Tried only after the corridor typology has measured itself unable to double-load a
 *  floor (see `_orchestrate`), never on a size threshold. */
export type CorePlacementMode = 'centre' | 'side' | 'corner';

/** §RESI-SINGLE-CORE-LANDING — which circulation typology an OK result was built with. */
export type CirculationTypology = 'corridor' | 'single-core-landing';

/**
 * §RESI-SMALL-PLATE-CORE-SCALE + §RESI-NARROW-PLATE-SIDE-CORE — the EFFECTIVE core plan size for a
 * plate, under a given core ARRANGEMENT.
 *
 * Scales the requested core DOWN (never up) just enough that the apartment run(s) beside it (along X)
 * stay ≥ `MIN_SIDE_RUN_M` and the bands in front/behind it (along Z) stay ≥ `MIN_BAND_DEPTH_M`,
 * floored at `MIN_CORE_DIM_M`. On a plate large enough for the requested core this is the identity.
 *
 * `placement: 'centre'` reserves TWO runs (the R-CENTRE double-loaded default) and is BYTE-IDENTICAL
 * to the pre-§RESI-NARROW-PLATE-SIDE-CORE behaviour. `placement: 'side'` reserves ONE run — the
 * narrow-plot single-loaded arrangement, tried only after the centred attempt has actually failed.
 * Pure + deterministic.
 */
function effectiveCoreSize(
    plateW: number,
    plateD: number,
    coreWidthM: number,
    coreDepthM: number,
    placement: CorePlacementMode,
): { coreWidthM: number; coreDepthM: number } {
    const runsReserved = placement === 'centre' ? 2 : 1;
    const wByRuns = plateW - runsReserved * MIN_SIDE_RUN_M;  // max core width that still leaves usable run(s)
    const dByBands = plateD - 2 * MIN_BAND_DEPTH_M;          // max core depth that still leaves usable bands
    const w = Math.max(MIN_CORE_DIM_M, Math.min(coreWidthM, wByRuns));
    const d = Math.max(MIN_CORE_DIM_M, Math.min(coreDepthM, dByBands));
    return { coreWidthM: round4(w), coreDepthM: round4(d) };
}

// §RESI-SMALL-PLATE-CORE-SCALE — the plate's shorter side (m) below which we also begin shrinking the
// public corridor. Above it the requested corridor is kept EXACTLY (large plates unchanged). Below it
// the depth the fixed 1.5 m corridor consumes is the marginal blocker: on a ~19 m plate the core +
// corridor leave bands too SHALLOW for the per-cell engine's comb (≈ 7.5 m). Shrinking the corridor
// recovers that depth so a genuine ~350 m² point-block builds (still ≥ the door-clear minimum).
const SMALL_PLATE_SIDE_M = 22;

/**
 * §RESI-SMALL-PLATE-CORE-SCALE — the EFFECTIVE corridor width (m). On a plate whose shorter side is
 * below `SMALL_PLATE_SIDE_M` the corridor is scaled DOWN linearly (recovering apartment-band depth),
 * floored at `MIN_CORRIDOR_WIDTH_M` (still a door-clear public way). A larger plate keeps the
 * requested width EXACTLY (identity). Never widens. Pure + deterministic.
 */
function effectiveCorridorWidth(plateShortSideM: number, corridorWidthM: number): number {
    if (plateShortSideM >= SMALL_PLATE_SIDE_M) return corridorWidthM;
    const scaled = corridorWidthM * (plateShortSideM / SMALL_PLATE_SIDE_M);
    return round4(Math.min(corridorWidthM, Math.max(MIN_CORRIDOR_WIDTH_M, scaled)));
}

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
    /** §RESI-CORRIDOR-ECONOMY (audit P1-2, C.4) — the partition's apartment fill ratio (placed
     *  footprint ÷ net plate area, 0..~1) for THIS level, surfaced so the preview card can quote
     *  "apartments NN% of plate". Absent on the ground floor (no partition runs there). */
    readonly fillRatio?: number;
    /** §RESI-CORRIDOR-ECONOMY — the level's shipped corridor UNION area (m²). Absent on the ground. */
    readonly corridorAreaM2?: number;
    /** §RESI-BAND-UNDERFILL (founder 2026-08-10) — set when this level's rows were left EMPTY
     *  because the user's minimum apartment area exceeds what a row on this plate can hold. Carries
     *  the two numbers the user can act on; the preview card turns it into a plain-language note so
     *  the stranded floor area is never silent. See `PlatePartitionResult.bandUnderfill`. */
    readonly bandUnderfill?: {
        readonly largestRowUnitAreaM2: number;
        readonly requestedMinAreaM2: number;
    };
    /** §RESI-SINGLE-CORE-LANDING / §CONTEXT-DATA-HONESTY — a REAL region of this level the typology
     *  left unassigned (no cell could take it on its own; no rect neighbour could absorb it), with
     *  its numbers and the measured reason, so the preview explains it instead of drawing white. */
    readonly stranded?: {
        readonly areaM2: number;
        readonly widthM: number;
        readonly depthM: number;
        readonly reason: string;
    };
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

/** Which axis-aligned (LOCAL-frame) footprint edge a façade element sits on. */
export type FootprintEdge = 'x0' | 'x1' | 'z0' | 'z1';

/**
 * §RESI-GROUND-FLOOR (2026-06-23) — the ground floor descriptor. The ground level is
 * "core + commercial shell, NO apartments", but it must still be a REAL, walkable space:
 * a MAIN ENTRANCE on the street façade leading into a LOBBY band that reaches the core
 * (so the path entrance → lobby → stair/lift exists). All geometry is in the orchestrator's
 * axis-aligned LOCAL (principal-axis) frame — the executor applies `transform` to land it on
 * the WORLD parcel, exactly like the core / cells / corridor. Pure + deterministic.
 */
export interface GroundFloorDescriptor {
    /** The lobby / public-corridor band on the ground floor (LOCAL frame, metres). It runs
     *  from the chosen street façade to the core so the entrance connects to circulation. */
    readonly lobby: Rect;
    /** The street-façade edge the main entrance door is hosted on (the footprint edge
     *  NEAREST the core along the lobby's run direction). */
    readonly entranceEdge: FootprintEdge;
    /** The entrance door CENTRE on that façade (LOCAL frame, metres) — the executor resolves
     *  the offset along the matching shell wall + punches the opening here. */
    readonly entranceCenter: { readonly x: number; readonly z: number };
    /** Clear width of the main entrance opening (metres). */
    readonly entranceWidthM: number;
}

export interface ResidentialBuildingOk {
    readonly status: 'ok';
    readonly levels: readonly BuildingLevel[];
    /** The shared centred core rect (same XZ on every level), metres, LOCAL frame —
     *  apply `transform` to land it on the world parcel. */
    readonly core: Rect;
    readonly perLevelApartments: readonly PerLevelApartments[];
    /** §RESI-GROUND-FLOOR — the ground floor's entrance + lobby (LOCAL frame). The core
     *  itself is `core` (built ground→top); this carries the entrance door + lobby band. */
    readonly groundFloor: GroundFloorDescriptor;
    /** §RESI-RIGID-TRANSFORM — maps LOCAL (principal-axis) geometry → WORLD parcel. */
    readonly transform: ResidentialRigidTransform;
    /** §RESI-STRETCH-TO-RUN honesty — the user's requested per-apartment [min,max] band (m²),
     *  echoed so the preview can flag units the stretch/absorb passes sized OUTSIDE it
     *  ("unit is NN m² — above your max band") instead of hiding the deviation. */
    readonly requestedBandM2: { readonly min: number; readonly max: number };
    /** §RESI-SINGLE-CORE-LANDING (ADR-0372) — the circulation typology this building was planned
     *  with. `'corridor'` = core + public corridor band(s) + apartment band runs (every result before
     *  this field existed); `'single-core-landing'` = one compact rear-corner core + a landing, no
     *  corridor, ≤ 2 apartments per floor opening straight off the landing. The preview card names
     *  it so a landing is never captioned as a corridor. */
    readonly circulationTypology: CirculationTypology;
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

/** §RESI-CORE-IN-BOUNDARY — point-in-polygon (plan XZ). §C73-PIP-CANONICAL:
 *  delegates to THE kernel ray cast. Used to test whether the bbox-centroid
 *  core sits inside the real (possibly concave) footprint before relocating it. */
function pointInPolygon(px: number, pz: number, poly: readonly Pt[]): boolean {
    return pointInPolygonXZ(px, pz, poly);
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
function deriveLocalFrame(footprintWorld: readonly Pt[], longAxisAlongZ = false): {
    thetaRad: number;
    pivot: { x: number; z: number };
    footprintLayout: Pt[];
} {
    const raw = principalAxisAngle(footprintWorld);
    let thetaRad = Math.abs(raw) >= PRINCIPAL_AXIS_MIN_RAD ? raw : 0;
    let cx = 0, cz = 0;
    for (const p of footprintWorld) { cx += p.x; cz += p.z; }
    const n = footprintWorld.length || 1;
    const pivot = { x: cx / n, z: cz / n };
    // De-rotate the parcel into the axis-aligned LOCAL (principal-axis) frame by −θ about
    // the pivot. θ = 0 ⇒ identity (the footprint is already axis-aligned).
    let footprintLayout = thetaRad === 0
        ? footprintWorld.map(p => ({ x: p.x, z: p.z }))
        : footprintWorld.map(p => rotatePt(p, -thetaRad, pivot));
    // §RESI-SINGLE-CORE-LANDING — the landing typology is planned in the frame where the plate's
    // LONG axis is Z: the executor builds the core with its lobby/fire door facing −Z and its solid
    // back wall at +Z (`_createCore`, `_buildCorePerimeter`), so a rear-corner core + a landing +
    // a front cell only tile the depth when the depth IS the long side. The principal-axis frame is
    // indifferent to which family of edges lands on X, so when it put the long side on X we turn the
    // whole local frame a quarter turn — the SAME rigid transform carries it back to the world
    // parcel; nothing downstream sees a rotation it did not already handle. Corridor modes never
    // pass the flag (byte-identical).
    if (longAxisAlongZ) {
        const b = bbox(footprintLayout);
        if (rectWidth(b) > rectDepth(b) + 1e-9) {
            thetaRad = thetaRad + Math.PI / 2;
            footprintLayout = footprintWorld.map(p => rotatePt(p, -thetaRad, pivot));
        }
    }
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
                    // P8 — the corridor-spine gate. DEFAULT OFF (the tracker's "HARD GATE,
                    // default-OFF"): the whole block short-circuits, so an unflagged run does not
                    // even build the report. The gate REPORTS; it never rejects a building and never
                    // throws (C50 §1.7) — promoting it to merge-blocking is tracker row P10.2.
                    if (corridorQualityGateOn()) {
                        const q = assessCorridorQuality(out);
                        span.setAttribute('pryzm.resi.corridor.reached', q.reached);
                        span.setAttribute('pryzm.resi.corridor.coreReached', q.coreReachable);
                        span.setAttribute('pryzm.resi.corridor.servedThrough', q.servedThrough);
                        span.setAttribute('pryzm.resi.corridor.pass', q.pass);
                        console.log(`[resi-building] ${q.diagnostic}`);
                    }
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
 *
 * §RESI-USER-MIN-IS-A-FLOOR (founder 2026-08-10) — the ±10% is a PLACEMENT tolerance (it lets the
 * partition snap a cell to the run's real division), NOT a licence to undercut the size the user
 * asked for. `userMinAreaM2` therefore floors the band: the tolerance may only widen a demand
 * UPWARD from the user's minimum. Without this floor a candidate layout with shallower rows can
 * win the area objective by placing cells just under the slider (e.g. 59.3 m² against a stated
 * 60 m² minimum) — the exact "the min slider does nothing" complaint, one layer down. When the
 * target is already above the minimum the floor is inert, so ordinary plates are unchanged.
 */
function demandFor(a: PlannedApartment, userMinAreaM2: number): ApartmentDemand {
    const tol = Math.max(2, a.targetAreaM2 * 0.1); // ±10% (≥2 m²) placement tolerance
    const minAreaM2 = Math.max(1, Math.min(a.targetAreaM2, userMinAreaM2), a.targetAreaM2 - tol);
    return {
        typology: a.typology,
        minAreaM2,
        maxAreaM2: Math.max(minAreaM2, a.targetAreaM2 + tol),
    };
}

// §C73-EPSILON-POLICY — the edge-coincidence question ("is this cell edge on the
// plate bbox edge?") is model-space point sameness in metres, so it CONSUMES the
// kernel's `COINCIDENT_M` rather than declaring a private `FACADE_TOL_M`. The
// local declaration was 1e-3, numerically IDENTICAL to `COINCIDENT_M` (0.001), so
// this is a rename onto the declared policy and not a change of behaviour. The
// partition rounds rects to 4 dp, so a 1 mm band remains ample.

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
        x0: Math.abs(r.x0 - plateBB.x0) <= COINCIDENT_M,
        x1: Math.abs(r.x1 - plateBB.x1) <= COINCIDENT_M,
        z0: Math.abs(r.z0 - plateBB.z0) <= COINCIDENT_M,
        z1: Math.abs(r.z1 - plateBB.z1) <= COINCIDENT_M,
    };
    for (const e of ['x0', 'x1', 'z0', 'z1'] as const) {
        if (e === cell.doorEdge) continue;       // corridor side → blind by construction
        if (onBoundary[e]) edges.push(e);        // on the plate perimeter → true façade
    }
    return edges;
}

/**
 * §RESI-GROUND-FLOOR — compute the ground floor's entrance + lobby (LOCAL frame). PURE.
 *
 * The lobby is a corridor band, `corridorWidthM` wide, centred on the core's X-centre,
 * running along +Z/−Z from the core to the NEAREST footprint edge (z0 or z1) — that edge is
 * the "street" façade the main entrance is hosted on. The entrance door is centred on the
 * lobby's X span at that façade. We pick the SHORTER run (the closer façade) so the lobby is
 * short and the walk entrance → core is direct. The lobby spans from the chosen façade to the
 * core's far edge (so it abuts the core and detection reads one continuous public space).
 *
 * All output is LOCAL (principal-axis) frame — the executor rotates it onto the WORLD parcel
 * via the rigid transform, exactly like the upper-floor corridor.
 */
export function computeGroundFloor(
    plateBB: Rect,
    core: Rect,
    corridorWidthM: number,
): GroundFloorDescriptor {
    // §RESI-NARROW-PLATE-SIDE-CORE — the lobby is centred on the core's X-centre, but a SIDE core sits
    // flush to the plate edge, so an un-clamped band of `corridorWidthM` would poke OUTSIDE the plate
    // (and the entrance door with it). Clamp the band's X-centre so the full-width band stays inside
    // the plate. A centred core is unaffected (the clamp is inactive).
    const halfW = Math.min(corridorWidthM, rectWidth(plateBB)) / 2;
    const coreCx = Math.min(
        Math.max((core.x0 + core.x1) / 2, plateBB.x0 + halfW),
        plateBB.x1 - halfW,
    );
    // Distance from the core to each of the two Z-façades; the entrance goes on the nearer one.
    const distToZ0 = core.z0 - plateBB.z0;   // gap in front of the core (toward z0)
    const distToZ1 = plateBB.z1 - core.z1;   // gap behind the core (toward z1)
    // §RESI-SINGLE-CORE-LANDING — a façade the core is FLUSH against cannot host the entrance: the
    // lobby band would be zero-deep and the front door would open straight into the core's solid
    // back wall (the rear-corner core of the landing typology sits on z1 exactly). Such a side is
    // out; the entrance goes on the other. A centred / side core (equidistant, both gaps > 0) is
    // unchanged.
    const MIN_LOBBY_DEPTH_M = 0.5;
    const z0Hostable = distToZ0 >= MIN_LOBBY_DEPTH_M;
    const z1Hostable = distToZ1 >= MIN_LOBBY_DEPTH_M;
    const useZ0 = z0Hostable === z1Hostable ? distToZ0 <= distToZ1 : z0Hostable;
    const entranceEdge: FootprintEdge = useZ0 ? 'z0' : 'z1';
    // Lobby band: full span from the chosen façade to the core's near edge, so the
    // entrance opens into a band that reaches the stair/lift.
    const lobby: Rect = useZ0
        ? { x0: round4(coreCx - halfW), x1: round4(coreCx + halfW), z0: round4(plateBB.z0), z1: round4(core.z0) }
        : { x0: round4(coreCx - halfW), x1: round4(coreCx + halfW), z0: round4(core.z1), z1: round4(plateBB.z1) };
    const entranceCenter = {
        x: round4(coreCx),
        z: round4(useZ0 ? plateBB.z0 : plateBB.z1),
    };
    // A wide (double-leaf) entrance, but never wider than the lobby band it opens into.
    const entranceWidthM = round4(Math.min(1.8, Math.max(1.2, corridorWidthM - 0.1)));
    return { lobby, entranceEdge, entranceCenter, entranceWidthM };
}

/**
 * §RESI-NARROW-PLATE-SIDE-CORE — R-CENTRE FIRST, side core only as a genuine FALLBACK.
 *
 * The centred (double-loaded) arrangement is ALWAYS attempted first, so every plate that builds today
 * builds identically — the fallback is reachable ONLY on a plate the engine would otherwise have
 * REFUSED OUTRIGHT, and only when the refusal was a partition-capacity miss (not a degenerate
 * footprint or an invalid brief, where a second attempt would just restate the same thing).
 *
 * If the fallback also fails, ITS refusal is the one surfaced: it is the more permissive attempt, so
 * "even a single-loaded plan places nothing here" is the truthful statement of what was tried.
 */
function _orchestrate(input: ResidentialBuildingOrchestratorInput): ResidentialBuildingResult {
    const centred = _orchestrateWith(input, 'centre');
    let corridor: ResidentialBuildingResult = centred;
    if (centred.status !== 'ok' && centred.reason.includes('placed zero apartments')) {
        const side = _orchestrateWith(input, 'side');
        // §RESI-NARROW-PLATE-SIDE-CORE — the fallback must not BUY a build with junk. A single-loaded run
        // on a SHALLOW plate degenerates into ribbons: MEASURED, a 40 × 8 m plate yields 34.0 m × 3.6 m
        // cells (9.4 : 1), which is not an apartment. The partition's own stated ceiling for a rectangular
        // unit is `MAX_RECT_ASPECT` (3.5 : 1 — "the sane max aspect the founder set", §RESI-FILL-COREFLANK).
        // If the single-loaded plan can only produce cells past that ceiling it has NOT found a building,
        // so we surface the ORIGINAL refusal instead of emitting ribbons. A plate that refuses today and
        // would only gain ribbons therefore keeps refusing — the fallback strictly adds real buildings.
        corridor = side.status !== 'ok' ? side : (allCellsWithinAspectCeiling(side) ? side : centred);
    }

    // ── §RESI-SINGLE-CORE-LANDING (ADR-0372, L-11190) — the small-plate typology, SELECTED BY
    // MEASUREMENT. A corridor exists to distribute a floor to at least two apartments. So the landing
    // typology is planned only when the corridor typology (centred, then side) has measured itself
    // NOT doing that on some upper level: it refused on capacity; it placed a single unit (on the
    // founder's 13 × 16 m rectangle that "unit" was the whole floor absorbed as one 187 m² residual
    // around a side core); or what it placed is not clean — a cell over the core or over a corridor
    // band (L-11192: the side path on the founder's plate rotated 27° minted two rect cells that
    // overlap the core by 0.85 × 4.6 m). The two are then compared by `preferByMeasurement`; ties
    // keep the corridor result. R-CENTRE and the side fallback are untouched wherever they already
    // double-load a floor cleanly (the residentialNarrowPlate sweep pins that), and there is no
    // plate-size threshold in this switch.
    if (corridor.status === 'ok' && minUpperLevelCells(corridor) >= 2 && hasCleanCells(corridor)) return corridor;
    if (corridor.status !== 'ok' && isInputRefusal(corridor.reason)) return corridor;

    const corner = _orchestrateWith(input, 'corner');
    if (corner.status !== 'ok') {
        if (corridor.status === 'ok') return corridor;
        // C74 — BOTH typologies were measured; name both, with their numbers.
        return reject(`${corridor.reason} — and the single-core landing typology also refused (${corner.reason})`);
    }
    if (corridor.status !== 'ok') return corner;
    return preferByMeasurement(corridor, corner);
}

/**
 * §RESI-SINGLE-CORE-LANDING — orchestrate under ONE named core arrangement, no ladder. The measuring
 * instrument behind `_orchestrate`'s selection, exported so a test (or a diagnostic) can put the
 * corridor result and the landing result for the same plate side by side and quote both — the
 * selection is only as honest as what it compared. Production reaches the ladder through
 * `orchestrateResidentialBuilding`. P8: one span.
 */
export function orchestrateResidentialBuildingWith(
    input: ResidentialBuildingOrchestratorInput,
    corePlacement: CorePlacementMode,
): ResidentialBuildingResult {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.residentialBuilding.orchestrateWith',
        (span) => {
            try {
                span.setAttribute('pryzm.resi.orchestrate.corePlacement', corePlacement);
                const out = _orchestrateWith(input, corePlacement);
                span.setAttribute('pryzm.resi.orchestrate.status', out.status);
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

/** §RESI-SINGLE-CORE-LANDING — the fewest placed cells on any upper level (0 when none). */
function minUpperLevelCells(result: ResidentialBuildingOk): number {
    let min = Infinity;
    for (const level of result.perLevelApartments) {
        if (level.role !== 'upper') continue;
        min = Math.min(min, level.apartments.length);
    }
    return Number.isFinite(min) ? min : 0;
}

/** §RESI-SINGLE-CORE-LANDING — a refusal about the REQUEST (not about capacity): restating it under a
 *  second typology would just restate it. Every other refusal is a capacity miss the landing typology
 *  may close. Local (not exported) ⇒ no separate span obligation (P8). */
function isInputRefusal(reason: string): boolean {
    return reason.includes('upperLevels must be')
        || reason.includes('core dimensions must be positive')
        || reason.includes('corridor width must be')
        || reason.includes('footprint needs')
        || reason.includes('footprint is degenerate');
}

/** §RESI-SINGLE-CORE-LANDING — rect interiors intersect (1 mm tolerance). Local; no span (P8). */
function rectsOverlap(p: Rect, q: Rect): boolean {
    return Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 1e-3 && Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0) > 1e-3;
}

/** §RESI-SINGLE-CORE-LANDING — does an apartment cell's REAL footprint overlap a rect (the core, a
 *  band)? A rect cell (4-corner polygon) is its rect. A RESHAPED cell (§NONRECT-CELLS-P1, > 4
 *  vertices — the L/U a residual-absorbed unit takes AROUND the core) is judged on its polygon, not
 *  its bbox: MEASURED on 16.5 × 16.5 … 18 × 18 m the centred grid's two 8-vertex cells wrap the core
 *  cleanly while their bboxes cover it, and a bbox test would have mis-read every one of those
 *  R-CENTRE plates as defective. Overlap ⇔ some rect sample point (a 6 × 6 lattice inset 1 cm — a
 *  sliver thinner than the lattice pitch is below the executor's wall gauge anyway) lies inside the
 *  polygon, or some polygon vertex lies strictly inside the rect. Deterministic. */
function cellOverlapsRect(cell: ApartmentCell, r: Rect): boolean {
    const poly = cell.polygon;
    if (!poly || poly.length <= 4) return rectsOverlap(cell.rect, r);
    if (!rectsOverlap(cell.rect, r)) return false;      // bbox disjoint ⇒ polygon disjoint
    const inset = 0.01;
    const N = 6;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const x = r.x0 + inset + (r.x1 - r.x0 - 2 * inset) * (i / (N - 1));
            const z = r.z0 + inset + (r.z1 - r.z0 - 2 * inset) * (j / (N - 1));
            if (pointInPolygon(x, z, poly)) return true;
        }
    }
    for (const v of poly) {
        if (v.x > r.x0 + inset && v.x < r.x1 - inset && v.z > r.z0 + inset && v.z < r.z1 - inset) return true;
    }
    return false;
}

/** §RESI-SINGLE-CORE-LANDING — true iff on EVERY upper level no apartment cell overlaps the core or a
 *  circulation band. A cell over the stair is not an apartment whatever it counts as (L-11192). */
function hasCleanCells(result: ResidentialBuildingOk): boolean {
    for (const level of result.perLevelApartments) {
        if (level.role !== 'upper') continue;
        for (const apt of level.apartments) {
            if (cellOverlapsRect(apt.cell, result.core)) return false;
            if (level.publicCorridor.some((band) => cellOverlapsRect(apt.cell, band))) return false;
        }
    }
    return true;
}

/** §RESI-SINGLE-CORE-LANDING — compare two OK buildings by measurement, on the first upper level
 *  AFTER the per-cell D-TGL engine has run. Strict order:
 *   (1) CLEAN geometry — no apartment cell overlaps the core or a circulation band (L-11192);
 *   (2) apartments that actually LAID OUT; (3) cells placed;
 *   (4) placed area − λ·circulation area (λ = 1, the corridor-economy charge).
 *  Ties keep `a` (the corridor result) so nothing that builds today changes. DELIBERATELY NOT a
 *  criterion: whether the core holds its stair (the corridor typology's §RESI-SMALL-PLATE-CORE-SCALE
 *  shrink to a 2.6 m "core" is an accepted, founder-visible compromise; ranking on it would move
 *  R-CENTRE plates that double-load cleanly today — ADR-0372 §5 names it as the next decision). Pure. */
function preferByMeasurement(a: ResidentialBuildingOk, b: ResidentialBuildingOk): ResidentialBuildingOk {
    const measure = (r: ResidentialBuildingOk): { clean: boolean; laidOut: number; cells: number; net: number } => {
        const level = r.perLevelApartments.find((l) => l.role === 'upper');
        if (!level) return { clean: false, laidOut: 0, cells: 0, net: 0 };
        const laidOut = level.apartments.filter((apt) => apt.status === 'ok').length;
        const placed = level.apartments.reduce((s, apt) => s + apt.cell.areaM2, 0);
        return { clean: hasCleanCells(r), laidOut, cells: level.apartments.length, net: placed - (level.corridorAreaM2 ?? 0) };
    };
    const ma = measure(a), mb = measure(b);
    if (mb.clean !== ma.clean) return mb.clean ? b : a;
    if (mb.laidOut !== ma.laidOut) return mb.laidOut > ma.laidOut ? b : a;
    if (mb.cells !== ma.cells) return mb.cells > ma.cells ? b : a;
    return mb.net > ma.net + 1e-6 ? b : a;
}

/** §RESI-NARROW-PLATE-SIDE-CORE — true iff EVERY placed cell is within the engine's own rectangular
 *  aspect ceiling. Pure; local (not exported) so it carries no separate span obligation (P8). */
function allCellsWithinAspectCeiling(result: ResidentialBuildingOk): boolean {
    for (const level of result.perLevelApartments) {
        for (const apt of level.apartments) {
            const w = rectWidth(apt.cell.rect);
            const d = rectDepth(apt.cell.rect);
            const shortSide = Math.min(w, d);
            if (!(shortSide > 0)) return false;
            if (Math.max(w, d) / shortSide > MAX_RECT_ASPECT + 1e-6) return false;
        }
    }
    return true;
}

function _orchestrateWith(
    input: ResidentialBuildingOrchestratorInput,
    corePlacement: CorePlacementMode,
): ResidentialBuildingResult {
    const {
        footprint: footprintWorld, upperLevels,
        coreWidthM: reqCoreWidthM, coreDepthM: reqCoreDepthM, corridorWidthM: reqCorridorWidthM,
        minApartmentAreaM2, maxApartmentAreaM2, typologies,
    } = input;

    if (!Number.isInteger(upperLevels) || upperLevels < 1 || upperLevels > 20) {
        return reject('upperLevels must be an integer in 1..20');
    }
    if (!(reqCoreWidthM > 0) || !(reqCoreDepthM > 0)) {
        return reject('core dimensions must be positive');
    }
    if (!(reqCorridorWidthM >= MIN_CORRIDOR_WIDTH_M)) {
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
    const { thetaRad, pivot, footprintLayout } = deriveLocalFrame(footprintWorld, corePlacement === 'corner');
    const transform: ResidentialRigidTransform = { thetaRad, pivot };

    // The footprint expressed in the axis-aligned LOCAL frame. All core/partition/packer math
    // below uses THIS frame; only `levels[].footprint` (the shell) keeps the WORLD parcel.
    const footprint = footprintLayout;
    // `let` (was `const`): the 'corner' typology may narrow the plate to the largest axis-aligned
    // rectangle INSIDE a hand-drawn boundary (see §RESI-SINGLE-CORE-LANDING core placement below).
    let bb = bbox(footprint);

    let plateW = rectWidth(bb);
    let plateD = rectDepth(bb);
    // §RESI-DEGENERATE-REJECT — a genuinely degenerate / too-thin plate (after de-rotation)
    // is the ONLY plate-shape reject now (the old "must be axis-aligned rectangle" stub is
    // gone). A plate too small to even hold the core is also rejected with a clear reason.
    if (!(plateW > 1e-3) || !(plateD > 1e-3)) {
        return reject('footprint is degenerate (zero width/depth after orienting)');
    }
    // §RESI-CORE-REWORK (founder 2026-06-26: "the core is too tight — the stair landing pokes past
    // the wall, the lift has no approach") — DERIVE the minimum core plan size from the stair + lift
    // footprints and the 1.2 m approach clearances (single source of truth: `deriveCoreSizing`), then
    // FLOOR the requested/default core at it so the core GROWS to contain the full U-stair body (incl.
    // the top landing) + the lift shaft + a 1.2 m run in front of each. The worst-case stair rise is
    // the executor's tall commercial ground (max(4.5, ftf)); the lift shaft uses the executor's
    // lower-bound passenger cab so the floor is the architectural minimum. Apartments packing around a
    // slightly bigger core is the founder's explicit trade.
    const floorToFloorMForCore = input.floorToFloorM ?? DEFAULT_FLOOR_TO_FLOOR_M;
    const coreMin = deriveCoreSizing({ maxFloorToFloorM: Math.max(4.5, floorToFloorMForCore) });
    const flooredCoreWidthM = Math.max(reqCoreWidthM, coreMin.coreWidthM);
    const flooredCoreDepthM = Math.max(reqCoreDepthM, coreMin.coreDepthM);
    // §RESI-SMALL-PLATE-CORE-SCALE — scale the (now clearance-floored) core DOWN on a small plate so the
    // apartment runs/bands beside it stay usable (see `effectiveCoreSize`). A large plate keeps the
    // floored core EXACTLY. The containment check below uses the EFFECTIVE core, so a small plate that
    // can't hold the full clearance core builds a smaller point-block instead (graceful, not a reject).
    // §RESI-NARROW-PLATE-SIDE-CORE — a TRUE refusal, stated in the quantity that actually binds.
    // Below `MIN_PLATE_WIDTH_M` NO arrangement exists (not even a side core + one apartment run), so
    // this refusal is sound at any plate depth or area. It names the MEASURED plate width and the
    // DERIVED threshold — never a plot area against a plate threshold (the defect the founder hit:
    // the old copy quoted "~674 m² < 400 m² of plate", which is both the wrong quantity and
    // self-contradictory).
    // §RESI-SINGLE-CORE-LANDING — this floor is DERIVED for the corridor typology (a side core + one
    // run); the landing typology has no run and measures its own cells, so the gate does not apply.
    if (corePlacement !== 'corner' && plateW < MIN_PLATE_WIDTH_M - 1e-6) {
        return reject(
            `plate is too narrow: the buildable plate measures ${round4(plateW)} m across its short ` +
            `side; a core + corridor + one apartment run needs at least ${MIN_PLATE_WIDTH_M} m`,
        );
    }
    // §RESI-SINGLE-CORE-LANDING — the landing typology builds the COMPACT core: exactly the clearance-
    // derived functional minimum (a real U-stair + lift + their 1.2 m approaches, `deriveCoreSizing`),
    // never the modal's default 6 × 4 and never a run-preserving shrink below the minimum — on a small
    // plate every m² the core does not need belongs to an apartment, and a core that cannot hold its
    // stair is not a core. The corridor modes keep `effectiveCoreSize` byte-identically.
    const { coreWidthM, coreDepthM } = corePlacement === 'corner'
        ? { coreWidthM: coreMin.coreWidthM, coreDepthM: coreMin.coreDepthM }
        : effectiveCoreSize(plateW, plateD, flooredCoreWidthM, flooredCoreDepthM, corePlacement);
    if (coreWidthM >= plateW || coreDepthM >= plateD) {
        return reject('core does not fit inside the footprint');
    }
    // §RESI-SMALL-PLATE-CORE-SCALE — also shrink the public corridor on a small plate to recover the
    // apartment-band depth the fixed 1.5 m corridor would otherwise consume (identity on a large plate).
    const corridorWidthM = effectiveCorridorWidth(Math.min(plateW, plateD), reqCorridorWidthM);

    // ── R-CENTRE: place the core centred on the footprint centroid, identical XZ on
    // every level. This is the residential divergence from the house's worst-aspect
    // corner placement (see file header + audit §3.1).
    // §RESI-NARROW-PLATE-SIDE-CORE — on a plate too narrow to double-load, the core sits FLUSH to the
    // x0 plate edge (its outer face becomes a blind party wall) so the whole remaining width is ONE
    // single-loaded apartment run, instead of two sub-feasible runs either side of a centred core.
    let fcx = corePlacement === 'side'
        ? bb.x0 + coreWidthM / 2
        : (bb.x0 + bb.x1) / 2;
    let fcz = (bb.z0 + bb.z1) / 2;
    // §RESI-SINGLE-CORE-LANDING — the REAR-CORNER core: flush to z1 (solid back wall on the plate
    // edge) and to x0 (its solid side wall on the party wall), lobby door facing −Z into the landing.
    // On a hand-drawn boundary the bbox corner can lie a few centimetres OUTSIDE the slanted edges,
    // so when the corner core fails the in-boundary probe the WHOLE plate is narrowed to the largest
    // axis-aligned rectangle inside the drawn line (the same `decomposeToRects` §RESI-CORE-IN-BOUNDARY
    // uses) and the core sits in ITS rear corner — every cell, the landing and the core then stay
    // inside the boundary; the shell is still built on the drawn line. x1 is tried before narrowing.
    if (corePlacement === 'corner') {
        const probeCorner = (plate: Rect, cx: number): boolean => {
            const hw = Math.max(0, coreWidthM / 2 - 1e-3), hd = Math.max(0, coreDepthM / 2 - 1e-3);
            const cz = plate.z1 - coreDepthM / 2;
            return pointInPolygon(cx, cz, footprint)
                && pointInPolygon(cx - hw, cz - hd, footprint) && pointInPolygon(cx + hw, cz - hd, footprint)
                && pointInPolygon(cx + hw, cz + hd, footprint) && pointInPolygon(cx - hw, cz + hd, footprint);
        };
        let cornerPlate: Rect;
        if (probeCorner(bb, bb.x0 + coreWidthM / 2)) {
            cornerPlate = bb; fcx = bb.x0 + coreWidthM / 2;
        } else if (probeCorner(bb, bb.x1 - coreWidthM / 2)) {
            cornerPlate = bb; fcx = bb.x1 - coreWidthM / 2;
        } else {
            let bestR: Rect | null = null, bestA = -Infinity;
            for (const r of decomposeToRects(footprint, Math.min(coreWidthM, coreDepthM))) {
                if (rectWidth(r) < coreWidthM || rectDepth(r) < coreDepthM) continue;
                const a = rectArea(r);
                if (a > bestA) { bestA = a; bestR = r; }
            }
            if (!bestR) {
                return reject(
                    `single-core landing: the ${round4(coreWidthM)} × ${round4(coreDepthM)} m compact core fits ` +
                    `in no axis-aligned rectangle inside the drawn boundary (${round4(plateW)} m × ${round4(plateD)} m box)`,
                );
            }
            cornerPlate = bestR; fcx = bestR.x0 + coreWidthM / 2;
        }
        bb = cornerPlate;
        plateW = rectWidth(bb);
        plateD = rectDepth(bb);
        fcz = bb.z1 - coreDepthM / 2;
    }
    // §RESI-CORE-IN-BOUNDARY (founder 2026-06-29: an L-SHAPE plate filled only ~3 units, both wings
    // wasted) — on a CONCAVE plate the bbox CENTROID can fall in the NOTCH (the missing wing), so the
    // centred core would sit OUTSIDE the real building → the apartments can't ring it and circulation
    // never reaches a wing. When the bbox-centroid core is NOT fully inside the real footprint, relocate
    // it to the centre of the LARGEST axis-aligned sub-rectangle of the de-rotated footprint (the proven
    // rectilinear slab-sweep), clamped so the core fits inside that sub-rect. A convex/rectangular plate
    // keeps the bbox centroid EXACTLY (the check passes) → byte-identical. Pure + deterministic.
    // §RESI-NARROW-PLATE-SIDE-CORE — probe the core's corners pulled 1 mm INSIDE the core rect. A core
    // deliberately placed FLUSH to a straight plate edge (the side-core case) has corners exactly ON
    // the boundary, where ray-casting point-in-polygon is undefined — so an un-inset probe would read
    // "outside" and bounce the core back to a sub-rect centre, undoing the side placement. The inset is
    // 1 mm against plates measured in metres, so a centred core on any real parcel is unaffected.
    const CORE_PROBE_INSET_M = 1e-3;
    const coreFullyInside = (cx: number, cz: number): boolean => {
        const hw = Math.max(0, coreWidthM / 2 - CORE_PROBE_INSET_M);
        const hd = Math.max(0, coreDepthM / 2 - CORE_PROBE_INSET_M);
        return pointInPolygon(cx, cz, footprint) &&
            pointInPolygon(cx - hw, cz - hd, footprint) && pointInPolygon(cx + hw, cz - hd, footprint) &&
            pointInPolygon(cx + hw, cz + hd, footprint) && pointInPolygon(cx - hw, cz + hd, footprint);
    };
    if (corePlacement !== 'corner' && !coreFullyInside(fcx, fcz)) {
        const rects = decomposeToRects(footprint, Math.min(coreWidthM, coreDepthM));
        let bestR: Rect | null = null, bestA = -Infinity;
        for (const r of rects) {
            if (rectWidth(r) < coreWidthM || rectDepth(r) < coreDepthM) continue;   // core must fit
            const a = rectArea(r);
            if (a > bestA) { bestA = a; bestR = r; }
        }
        if (bestR) {
            // §RESI-SIDE-CORE-KEEPS-SIDE (founder live repro 2026-08-10, Rambla Catalunya 75:
            // "No layout fits" on an 11.2333 × 34.6662 m plate) — THE narrow-deep-plate zero. The
            // 1 mm probe inset above only survives a side core on a PERFECTLY straight local x0
            // edge; every real envelope-inset parcel de-rotates to a quad whose long edge is a few
            // centimetres slanted, so the flush core's corners fall (barely) outside the polygon,
            // the probe fails, and this relocation used to CENTRE the core in the sub-rect — i.e.
            // it silently converted the single-loaded side plan back into the centred plan the
            // side fallback exists to replace. On an ~11 m plate the centred core leaves two
            // ~4.3 m runs (both under the ~8 m min-apartment width) → zero cells → the fallback
            // refused with the same message as the centred attempt. The fix: when the caller asked
            // for a SIDE core, relocate it FLUSH to the sub-rect's x0 edge (the nearest
            // in-boundary "side"), preserving the single-loaded arrangement; only a centred
            // request re-centres. Centred plates are byte-identical (corePlacement === 'centre').
            const cx = corePlacement === 'side'
                ? bestR.x0 + coreWidthM / 2
                : (bestR.x0 + bestR.x1) / 2;
            const cz = (bestR.z0 + bestR.z1) / 2;
            fcx = Math.min(Math.max(cx, bestR.x0 + coreWidthM / 2), bestR.x1 - coreWidthM / 2);
            fcz = Math.min(Math.max(cz, bestR.z0 + coreDepthM / 2), bestR.z1 - coreDepthM / 2);
        }
    }
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
        // §RESI-FILL-PLATE-SUPPLY (founder 2026-06-23) — the partition now lays a GRID of
        // parallel double-loaded corridors tiling the WHOLE plate depth (not just the single
        // core band) and places as many apartments as fit (it no longer rejects on surplus
        // demand). So the packer must be SUPPLIED with demand for the FULL-PLATE capacity — else
        // it under-supplies and the spine fills only a couple of rows near the core (the founder's
        // "apartments cluster, plate empty"). Each corridor pitch (2·cap + corridorWidth) yields
        // 2·cap of apartment depth, so the apartment fraction of the plate depth is 2·cap / pitch.
        // The partition stays geometrically authoritative (caps to true capacity), so a generous
        // estimate only lets it FILL — it never over-places. (frontDepth/backDepth retained for
        // the corridor-fit reasoning above.)
        void frontDepth; void backDepth;
        const plateDepth = Math.max(0, bb.z1 - bb.z0);
        const pitch = 2 * MAX_APARTMENT_DEPTH_M + corridorWidthM;
        const usableDepth = plateDepth * (2 * MAX_APARTMENT_DEPTH_M) / pitch;
        // §RESI-SINGLE-CORE-LANDING — the landing's minimum depth: the core's own approach clearance
        // (a door must swing on it), never under the door-clear corridor floor. The net for the packer
        // is then literally plate − core − landing: there are no corridor pitches to discount.
        const landingMinDepthM = Math.max(APPROACH_CLEAR_M, corridorWidthM);
        const netAreaM2 = corePlacement === 'corner'
            ? round4(Math.max(0, plateW * plateD - coreWidthM * coreDepthM - coreWidthM * landingMinDepthM))
            : round4(usableDepth * placeableXSpan);

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
        // §RESI-FILL-DEMAND (founder 2026-06-23) — THE "fill the plate" fix. The partition
        // packs apartments left→right across each corridor row, consuming this demand list in
        // order and STOPPING when the list is exhausted (cursor) OR the row is full. Pre-fix we
        // supplied only the packer's N (≈4) demands, so each deep row placed ~2 wide cells and
        // the rest of the row width — often a WHOLE side of the plate — sat EMPTY (the founder's
        // "still a lot of empty space"). The partition is geometrically authoritative (it caps to
        // true capacity and never over-places), so SUPPLYING the typology mix REPEATED to the
        // plate's gross capacity lets the rows fill across their full width; the partition returns
        // however many actually fit. We pair each PLACED cell back to a plan by `i % N` below
        // (same typology ⇒ same program ⇒ reusing a plan for another same-typology cell is sound).
        // §RESI-USER-MIN-IS-A-FLOOR — the user's own minimum floors every placement band.
        const baseDemands = packed.apartments.map((a) => demandFor(a, minApartmentAreaM2));
        // §RESI-EDGE-TYPE-VARIETY (founder 2026-06-27) — the packer picks ONE typology for its equal
        // slots, so baseDemands is single-typology and the partition's area-driven re-stamp would have
        // nothing to vary toward. DECLARE the full ENABLED typology set to the partition (each enabled
        // T1–T4 the user requested, with a band clamped into the user's [min,max]) so the partition
        // knows which typologies it may assign by area: corners (the largest cells) become the largest
        // enabled typology, edge-fill (the smallest cells) the smallest. The demands still drive cell
        // WIDTH/area via the packer's base sizing; the enabled set only widens the typology palette.
        // §RESI-USER-BAND-HONOURED (founder 2026-08-10: "raising the min slider does nothing") —
        // these tail demands are NOT palette-only: the residual-absorption / side-façade passes
        // consume them as real demand, so their bands must RESPECT the user's [min,max]. The old
        // inverted placeholder (min:=band.max when userMin exceeded the typology cap) let those
        // passes backfill sub-userMin cells — the slider was dead because the backfill ignored it.
        // Now: a typology that cannot meet the user band is EXCLUDED (no placeholder), and the
        // LARGEST enabled typology's cap extends to the user max (§RESI-USER-BAND-EXTEND, mirrors
        // the packer) so "T3 + max 130" genuinely targets 130 m² cells.
        const enabledList = (['T1', 'T2', 'T3', 'T4'] as const).filter((t) => typologies[t]);
        const largestEnabled = enabledList[enabledList.length - 1];
        const enabledTypologyDemands: ApartmentDemand[] = enabledList
            .map((t) => {
                const band = TYPOLOGY_AREA_BAND[t];
                const bandMax = (t === largestEnabled && maxApartmentAreaM2 > band.max)
                    ? maxApartmentAreaM2
                    : band.max;
                const min = Math.max(band.min, minApartmentAreaM2);
                const max = Math.min(bandMax, maxApartmentAreaM2);
                return min <= max + 1e-9 ? { typology: t, minAreaM2: min, maxAreaM2: max } : null;
            })
            .filter((d): d is ApartmentDemand => d !== null);
        const minDemandArea = Math.max(20, Math.min(...baseDemands.map((d) => d.minAreaM2)));
        // Gross plate area ÷ smallest cell area over-counts (ignores core/corridors) — but
        // over-supply is harmless (the partition caps), so a generous estimate only lets it FILL.
        const capacityCells = Math.ceil((plateW * plateD) / minDemandArea) + baseDemands.length;
        const reps = Math.max(1, Math.ceil(capacityCells / baseDemands.length));
        const allDemands: ApartmentDemand[] = [];
        for (let r = 0; r < reps; r++) allDemands.push(...baseDemands);
        // Append the enabled-typology declarations so the partition's re-stamp palette spans the full
        // requested mix (these tail demands are consumed only if the plate is huge; harmless otherwise).
        allDemands.push(...enabledTypologyDemands);
        // §RESI-PARTITION-BBOX-PLATE (large-plate zero-apartments fix, 2026-06-23) — hand the
        // partition the AXIS-ALIGNED BBOX RECTANGLE of the local footprint, NOT the (possibly
        // irregular) de-rotated parcel polygon. THE BUG: the orchestrator already commits to
        // `bb = bbox(footprint)` for EVERY downstream geometry op (core, corridor band, front/
        // back bands, netArea). It then passed the raw polygon to `partitionLevelPlate`, which
        // re-derives the SAME bbox for its geometry but ALSO runs a `bboxFill ≥ 0.80` gate on
        // the polygon. A real hand-drawn parcel (the founder's ~137×137 m / ~18,764 m² site) is
        // a slightly-irregular quad whose de-rotated corners don't land on the bbox corners → its
        // fill can dip below 0.80 → the partition HARD-rejects ("footprint must be roughly
        // rectangular") for EVERY k in the trim loop below → the loop exhausts → the orchestrator
        // reported the misleading `partition placed zero apartments (core/corridor leave no usable
        // band runs)`. Because the partition's geometry is bbox-only, feeding it the bbox rect is
        // byte-identical for a clean/rotated rectangle (fill = 1.0 ⇒ gate trivially passes) and
        // simply removes the spurious-reject failure mode on a large irregular plate. The cells
        // tile the same bbox the orchestrator already uses, so the rigid-transform containment is
        // unchanged. NOTE: this also means the partition's own polygon-fill gate is now only
        // reachable via its public API, not this orchestration path (intended — the orchestrator
        // is authoritative on plate shape and has already accepted the parcel upstream).
        const platePoly: Pt[] = [
            { x: bb.x0, z: bb.z0 },
            { x: bb.x1, z: bb.z0 },
            { x: bb.x1, z: bb.z1 },
            { x: bb.x0, z: bb.z1 },
        ];
        let partition: ReturnType<typeof partitionLevelPlate> | null = null;
        // §RESI-REFUSAL-LARGEST-UNIT — keep the FIRST attempt's reason (the FULL demand list,
        // including the enabled-typology tail whose min is the user's own slider number), not the
        // last (the k=1 prefix, whose demandFor-derived min is a number the user never typed).
        let firstRejectReason = '';
        if (corePlacement === 'corner') {
            // §RESI-SINGLE-CORE-LANDING — ONE plan, no prefix trim: the typology consumes at most two
            // demands and measures N ∈ {1, 2} from the plate itself.
            const attempt = partitionSingleCoreLanding({
                levelIndex,
                footprint: platePoly,
                core,
                landingMinDepthM,
                apartments: allDemands,
                clipPolygon: footprint,
                userMinApartmentAreaM2: minApartmentAreaM2,
                userMaxApartmentAreaM2: maxApartmentAreaM2,
            });
            if (attempt.status === 'ok') partition = attempt;
            else firstRejectReason = attempt.reason;
        }
        for (let k = corePlacement === 'corner' ? 0 : allDemands.length; k >= 1; k--) {
            const attempt = partitionLevelPlate({
                levelIndex,
                footprint: platePoly,
                core,
                corridor: { widthM: corridorWidthM },
                apartments: allDemands.slice(0, k),
                // §RESI-CLIP-BOUNDARY — the partition tiles the bbox (platePoly) but clips cells to
                // the REAL de-rotated parcel so an L/trapezoid stops building past the drawn line.
                clipPolygon: footprint,
                // §RESI-ROW-DEPTH-INFEASIBLE — the user's STATED minimum, so a row that cannot
                // reach it at any engine-feasible width stays empty (and is explained) rather than
                // shipping an undersized unit the user never asked for.
                userMinApartmentAreaM2: minApartmentAreaM2,
            });
            if (attempt.status === 'ok') {
                partition = attempt;
                break;
            }
            if (!firstRejectReason) firstRejectReason = attempt.reason;
        }
        if (!partition || partition.status !== 'ok') {
            // Surface the partition's REAL reason (no longer swallowed behind a fixed string), so
            // a genuine capacity miss on a too-small plate is diagnosable instead of misleading.
            // §RESI-NARROW-PLATE-SIDE-CORE — carry the MEASURED plate dimensions so the product can
            // quote the real limiting quantity. The engine has NO plot-area gate, so no plot area may
            // ever be quoted against a plate threshold (that was the founder's self-contradictory
            // "~674 m² … needs ≥400 m² of plate" message).
            return reject(
                `level ${levelIndex} partition placed zero apartments on a ` +
                `${round4(plateW)} m × ${round4(plateD)} m plate` +
                (firstRejectReason ? ` (${firstRejectReason})` : ' (core/corridor leave no usable band runs)'),
            );
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
            // §RESI-FILL-DEMAND — the partition may now place MORE cells than the packer's N
            // (the mix was repeated to fill the plate). Cells beyond N reuse an earlier same-
            // typology plan (cycled).
            // §RESI-EDGE-TYPE-VARIETY (2026-06-27) — the partition now RE-STAMPS each cell's typology
            // from its real area (corners → larger T, edge-fill → smaller T), so cell[i].typology may
            // NO LONGER equal baseDemands[i % N].typology. Pair each cell to a program BY ITS STAMPED
            // TYPOLOGY (so the bedroom count matches the cell that holds it) rather than the demand
            // index. We reuse a matching packed plan when one exists (preserving the packer's target
            // area), else synthesize the canonical program for the cell's typology.
            const cellTypology = cell.typology;
            const plan = packed.apartments.find((a) => a.typology === cellTypology)
                ?? {
                    typology: cellTypology,
                    targetAreaM2: round4(rectArea(cell.rect)),
                    program: programFor(cellTypology),
                };

            // §DIAG-PARTY-WALL — true exterior façade edges (the rest are blind party walls).
            const facadeEdges = facadeEdgesFor(cell, plateBB);
            const facadeSet = new Set<CellEdge>(facadeEdges);
            const blindEdges = (['x0', 'x1', 'z0', 'z1'] as const).filter((e) => !facadeSet.has(e));

            // P7 — run the FROZEN D-TGL engine on this clean apartment cell (rooms + windows
            // + doors). Windows are suppressed on blind party-wall edges. Soft-fails per cell.
            const cellResult: ApartmentCellLayoutResult = runApartmentCellLayout({
                cell: cell.rect,
                // §NONRECT-CELLS-P1 — thread the cell's REAL polygon so a RESHAPED (L-fronting) cell
                // lays out rooms in its non-rect perimeter; a rect cell (4-corner polygon) is the
                // identity (the engine takes the byte-identical rect path).
                ...(cell.polygon && cell.polygon.length > 4 ? { cellPolygon: cell.polygon } : {}),
                program: plan.program,
                facadeEdges,
                // §RESI-ENTRY-INTO-CORRIDOR — the cell's corridor-facing edge, so the engine routes
                // the internal corridor to the front door (door opens into circulation, not a room).
                doorEdge: cell.doorEdge,
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
            if (_layoutDiagOn()) console.log(
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
            // §RESI-CORRIDOR-ECONOMY (C.4) — surface the partition's fill honesty to the preview.
            fillRatio: partition.fillRatio,
            corridorAreaM2: partition.corridorAreaM2,
            // §RESI-BAND-UNDERFILL — carry the band-emptied-rows explanation to the preview card.
            ...(partition.bandUnderfill !== undefined ? { bandUnderfill: partition.bandUnderfill } : {}),
            // §RESI-SINGLE-CORE-LANDING — a bay the landing typology could not assign, explained.
            ...(partition.stranded !== undefined ? { stranded: partition.stranded } : {}),
        });
    }

    const apartmentsPerLevel = perLevelApartments.map((l) => l.apartments.length);
    const diagnostic =
        `§DIAG-RESI-ORCHESTRATE levels=${levels.length} ` +
        `coreCentre=(${round4(fcx)},${round4(fcz)}) corePlacement=${corePlacement} ` +
        `plate=${round4(plateW)}x${round4(plateD)} ` +
        `rot=${round4(thetaRad)}rad pivot=(${round4(pivot.x)},${round4(pivot.z)}) ` +
        `apartmentsPerLevel=[${apartmentsPerLevel.join(',')}]`;

    // §RESI-GROUND-FLOOR — the ground floor's entrance + lobby (LOCAL frame). The core is
    // already built ground→top via `core`; this carries the front door + the lobby band that
    // links it to circulation. Same LOCAL frame as the core → executor rotates it to world.
    const groundFloor = computeGroundFloor(bb, core, corridorWidthM);

    return {
        status: 'ok',
        levels,
        core,
        perLevelApartments,
        groundFloor,
        transform,
        // §RESI-STRETCH-TO-RUN honesty — echo the user band so the preview can flag deviations.
        requestedBandM2: { min: minApartmentAreaM2, max: maxApartmentAreaM2 },
        circulationTypology: corePlacement === 'corner' ? 'single-core-landing' : 'corridor',
        diagnostic,
    };
}
