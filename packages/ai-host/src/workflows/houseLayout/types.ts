// Casa Unifamiliar (single-family house) — multi-storey house layout types.
// SPEC-CASA-UNIFAMILIAR-TYPOLOGY §3 (per-storey program), §6 (storey orchestrator),
// §7 (stair auto-placement + stairwell void).
//
// PURE L2: zero I/O, zero THREE, zero DOM. These plain types describe the OUTPUT
// of the storey orchestrator (`generateHouseLayout`) so the editor-wiring follow-up
// (A.21.e–g: level creation, per-storey command fan-out, stair commands, slab-void
// punch) can consume a fully-resolved, per-storey result. Mirrors the apartment
// workflow's idiom: `readonly` fields, mm where the apartment engine uses mm,
// metres for elevations (matching `ShellAnalysis` perimeter + level elevations).

import type { Pt } from '../apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, RoomType, ScoredLayoutOption } from '../apartmentLayout/types.js';
import type { StairCorePositionKind } from './stairPosition.js';
import type { HouseCirculationReport } from './circulationBanner.js';

export type { Pt };

/**
 * §PER-STOREY-PROGRAM (founder 2026-06-18, "a slider per level of bathrooms and
 * bedroom and all the rooms / with boolean — to decide what we want in each level —
 * but dynamic") — a PARTIAL per-storey override that the modal's per-level tabs emit,
 * indexed by `storeyIndex`. Each field is OPTIONAL; an ABSENT field ⇒ that storey keeps
 * the whole-house AUTO split's value for it (the engine's current `allocateProgramToStoreys`
 * behaviour). A PRESENT field WINS over the auto-allocated `StoreyProgram.program` for
 * that storey. With NO override (or an all-undefined entry) the allocation is
 * BYTE-IDENTICAL to today (ADR-0061 invariant I2) — the whole feature is gated on the
 * PRESENCE of an explicit override entry.
 *
 * INVARIANT INTERACTION (documented at the merge site in `storeyAllocation.ts`):
 *  - §HALL-SINGLETON / §LANDING-NOT-HALL — the override does NOT expose `entranceHall`;
 *    the hall stays GROUND-only, force-corrected by `assertHallSingleton` AFTER the merge,
 *    so no per-storey toggle can mint a second hall or strip the ground one.
 *  - §A.21.x-KITCHEN — `includeKitchen` is overridable PER STOREY (the founder's "decide
 *    what we want in each level"), so an upper storey CAN opt a kitchen IN explicitly; but
 *    when the field is ABSENT the ground-only auto policy is unchanged (upper = no kitchen).
 *    `openPlanKitchenDining`/`livingRoom` follow the same explicit-overrides-auto rule.
 */
export interface PerStoreyProgramOverride {
    readonly bedrooms?: number;
    readonly bathrooms?: number;
    readonly livingRoom?: boolean;
    readonly includeKitchen?: boolean;
    readonly openPlanKitchenDining?: boolean;
    readonly masterEnSuite?: boolean;
    /** Per-RoomType absolute area override (m²) for THIS storey, merged over the
     *  whole-house `program.roomAreas` (per-storey entries win). Same semantics +
     *  architectural-minimum clamp as `ApartmentProgram.roomAreas`. */
    readonly roomAreas?: Partial<Record<RoomType, number>>;
    /** §FORCE-CORRIDOR-DIRECT (founder 2026-06-18, per-level "↔ Corridor" toggles) — the
     *  room TYPES on THIS storey the user requested a DIRECT corridor door for. Merged
     *  onto the storey program's `corridorDirectRoomTypes` (which `buildWallsAndDoors`
     *  honours). Absent / empty ⇒ the engine decides (today's behaviour) ⇒ byte-identical
     *  (ADR-0061 invariant I2). */
    readonly corridorDirectRoomTypes?: readonly RoomType[];
}

/** The vertical role of a storey in the stack. `roof` is a synthetic top cap
 *  (no habitable program) carried for completeness; the habitable storeys are
 *  `ground` (entrance level) and `upper` (private levels above). */
export type StoreyRole = 'ground' | 'upper' | 'roof';

/**
 * One storey's single-plate room programme — an `ApartmentProgram`-shaped
 * sub-program the existing D-TGL engine can consume per storey (§3), plus the
 * storey's vertical role + index so the orchestrator can stamp `levelId` /
 * elevation deterministically. Wet rooms preferentially stack (§2) — captured by
 * keeping the kitchen on the ground role and bathrooms aligned across storeys.
 */
export interface StoreyProgram {
    /** 0 = ground (entrance) level; 1..n−1 = upper levels. */
    readonly storeyIndex: number;
    readonly role: StoreyRole;
    /** The single-plate program this storey hands to `generateDeterministicLayouts`. */
    readonly program: ApartmentProgram;
    /**
     * §PER-STOREY-COUNT-AUTHORITATIVE (founder 2026-06-18, "I said 2 bedrooms but it keeps 3")
     * — set true when the user EXPLICITLY set this storey's bedroom count via a per-level
     * override (`applyPerStoreyOverrides`). The orchestrator then DISABLES the plate-fill
     * `growBedrooms` for this storey so the explicit count is RESPECTED, not grown to fill the
     * plate. Absent / false ⇒ the auto-split count + the normal plate-fill grow (byte-identical).
     */
    readonly bedroomsExplicit?: boolean;
}

/**
 * A resolved storey plate: where it sits in the stack + its exterior footprint.
 * `footprint` is the exterior shell polygon (world X-Z, metres) — identical on
 * every storey so walls stack (§7 vertical alignment v1). `elevationM` is the
 * floor level of THIS storey; `floorToFloorM` is the gap to the storey above.
 */
export interface StoreyPlate {
    readonly levelId: string;
    readonly storeyIndex: number;
    readonly elevationM: number;
    readonly floorToFloorM: number;
    readonly footprint: Pt[];
}

/** The vertical-circulation form chosen for the stair core (A.21.D18). The
 *  multi-storey house pipeline picks one per core from the core's aspect ratio:
 *  long-thin → `I` (one straight flight), squarer → `L` (two flights round a
 *  corner landing), generous square → `U` (two parallel flights + half-landing). */
export type StairShape = 'I' | 'L' | 'U';

/** One flight's risers + plan direction (unit XZ). For `I` there is one flight;
 *  for `L`/`U` two (the risers split ≈half each, see `risersBeforeLanding`). */
export interface StairFlightPlan {
    readonly riserCount: number;
    /** Unit plan direction (world XZ); `y` is always 0. */
    readonly direction: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * The reserved stair core: an axis-aligned rectangle (mm, plan frame) occupying
 * the SAME XZ footprint on every storey it passes through (§7), connecting one
 * adjacent level pair. `fromLevelId` is the lower level, `toLevelId` the upper.
 *
 * A.21.D18 — the core now carries the chosen `shape` + the resolved `flights`
 * (riser split + direction) + the `landingDepthM` and `risersBeforeLanding` so
 * the editor executor can emit the matching `CreateStairInput` directly (no
 * shape re-derivation in the editor). `flights[i].riserCount` sums to the total
 * risers for the floor-to-floor gap.
 */
export interface StairCore {
    readonly rectMm: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly fromLevelId: string;
    readonly toLevelId: string;
    /** A.21.D18 — the chosen stair form (`I` | `L` | `U`). */
    readonly shape: StairShape;
    /** A.21.D18 — per-flight risers + direction. One entry for `I`, two for `L`/`U`. */
    readonly flights: StairFlightPlan[];
    /** A.21.D18 — landing depth (m). Present (>0) for `L`/`U`, omitted/0 for `I`. */
    readonly landingDepthM?: number;
    /** A.21.D18 — risers in flight 1 before the landing (`L`/`U` only). */
    readonly risersBeforeLanding?: number;
    /** A.21.D18 — the core footprint (mm) the shape was sized for (== rectMm.w/h). */
    readonly footprintMm: { readonly w: number; readonly h: number };
    /**
     * A.21.D24 — the layout's principal-axis angle (radians). On a SKEWED plot the
     * D-TGL engine rotates the whole layout to its dominant-edge orientation, lays
     * out axis-aligned in that frame, then rotates walls/rooms back to world by
     * `+principalAxisRad` about `pivot`. The stair core `rectMm` + `flights` are
     * authored in that SAME rotated (layout) frame; the editor executor rotates the
     * stair's footprint + flight directions back to world by `+principalAxisRad`
     * about `pivot` so the stair sits squarely within the rotated floor plate. 0 for
     * an axis-aligned (rectangle / L / U / T) plot → no rotation (bit-identical).
     */
    readonly principalAxisRad: number;
    /** A.21.D24 — the world-XZ pivot (metres) the principal-axis rotation turns
     *  about (the footprint centroid). Paired with `principalAxisRad`. */
    readonly pivot: { readonly x: number; readonly z: number };
    /**
     * §STAIR-HALF-LANDING-INWARD (2026-06-09, founder "set the half-landing towards the
     * inside") — the stair-core placement KIND (`'central' | 'left' | 'right' | 'back'`)
     * from {@link chooseStairCorePosition}, in the plate-local LAYOUT frame. It tells the
     * editor which plate side the INTERIOR is on so a U-stair's half-landing + return
     * flight fold INWARD rather than poking OUT past the perimeter wall the core hugs:
     *   `'left'` (flush x≈0) → interior +x · `'right'` (flush x≈plateW) → interior −x ·
     *   `'back'` (flush rear) → interior −z · `'central'` → no flush wall (legacy offset).
     * OPTIONAL for backward compatibility — absent ⇒ the executor keeps the legacy
     * left-of-flight-1 offset (I/L are unaffected; only the U branch consumes it).
     */
    readonly interiorSide?: StairCorePositionKind;
    /**
     * §STAIR-CONTAIN-UPSTREAM (2026-06-09, founder "circulation must be perfectly
     * orchestrated") — the WORLD-XZ inward-containment offset (metres) the orchestrator
     * solved AT RESERVE TIME against the (rotated) world shell, so the room-tiling
     * keep-out is carved around the CONTAINED stair footprint. The editor executor
     * applies this SAME shift to the shipped stair body (start + every flight
     * startOverride) so the shipped footprint == the carved keep-out by construction —
     * closing the §8.5 desync. {0,0} (or absent) ⇒ the reserved footprint already fits
     * (axis-aligned plates / fitting cores are byte-identical). The executor's
     * §STAIR-CONTAIN then becomes a VERIFICATION of this offset, not an independent move.
     */
    readonly containOffsetWorld?: { readonly x: number; readonly z: number };
}

/**
 * The stairwell void punched in an upper storey's slab over the stair core (§7).
 * `rectMm` matches the stair core's plan rect (mm). One per non-ground storey.
 */
export interface SlabVoid {
    readonly levelId: string;
    readonly rectMm: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

/** Roof form over the topmost storey (§4 house-specific element). */
export type RoofKind = 'flat' | 'gable' | 'hip';

/**
 * The roof descriptor capping the stack. `footprint` is the exterior shell
 * polygon (metres) so the roof matches the building outline. `pitchDeg` is
 * meaningful only for pitched (`gable`/`hip`) roofs.
 */
export interface RoofDescriptor {
    readonly levelId: string;
    readonly footprint: Pt[];
    readonly kind: RoofKind;
    readonly pitchDeg?: number;
    /**
     * §ROOF-CAP-ELEVATION (founder v45) — the roof base world-Y (metres) that caps
     * the TOPMOST storey's walls = top-storey floor elevation + wall head. Computed
     * once (purely) from (storeyCount × floorToFloor) + base elevation so an
     * N-storey house caps at the right height every time. The editor executor places
     * the roof at this elevation (via the top level + this offset above its floor),
     * never one storey too low and never floating.
     */
    readonly baseElevationM?: number;
    /** §ROOF-CAP-ELEVATION — the `baseOffset` (metres above the TOP storey's own
     *  floor) the roof command should use so the builder resolves `baseElevationM`. */
    readonly baseOffsetM?: number;
}

/**
 * The full output of the storey orchestrator (§6). `perStoreyLayout` is STRICTLY
 * index-aligned with `storeys`: `perStoreyLayout[i]` is the chosen
 * `ScoredLayoutOption` for `storeys[i]`, or `null` if that storey's plate produced
 * no layout (a blank/rejected plate). Always the same length as `storeys`, so a
 * blank middle storey never desyncs the two arrays (HSE-AUDIT-1). Consumers that
 * read positionally must null-guard each slot. For a 1-storey house `stairs` and
 * `voids` are empty (strict superset of today's single-storey single-plate bridge).
 */
export interface HouseLayoutResult {
    readonly storeys: StoreyPlate[];
    readonly perStoreyLayout: (ScoredLayoutOption | null)[];
    readonly stairs: StairCore[];
    readonly voids: SlabVoid[];
    readonly roof: RoofDescriptor;
    /**
     * §CI-1-BANNER (SPEC-49 §4 CI-1; founder decision 2026-08-13) — the per-storey
     * circulation verdict the orchestrator accumulated while assembling this house,
     * plus the blocking banner naming the sealed rooms and the failed rules.
     *
     * REQUIRED, not optional, and deliberately so. `assembleHouse` is the only
     * producer of a `HouseLayoutResult`, it always fills this, and a consumer must
     * never be able to read a house that has no verdict block and conclude the house
     * is fine. Whether a given STOREY was measured is answered INSIDE the report, per
     * storey, with a reason — see {@link HouseCirculationReport}.
     *
     * `report.storeys` is STRICTLY index-aligned with {@link storeys} (and therefore
     * with {@link perStoreyLayout}): one verdict per plate, blank plates included.
     *
     * ⚠ THIS CHANGES NO GEOMETRY. The house still ships the least-bad option on every
     * storey exactly as before (ADR-0061 invariant I2 holds for the apartment path,
     * which never touches this module). The banner is the thing that used to be a
     * console.warn nobody read.
     */
    readonly circulation: HouseCirculationReport;
}

/**
 * A.21.k — one whole-house VARIANT for the "Choose a house layout" modal. The
 * house sibling of the apartment's `ScoredLayoutOption`: a complete
 * `HouseLayoutResult` (every storey's rooms + the stairs/voids/roof) PLUS an
 * aggregate `overallScore` (0-100, the mean of the per-storey option scores) so
 * the modal can rank + bar the variants exactly like the apartment cards. The
 * variants are produced deterministically (NO `Math.random`) by varying which
 * per-storey option index each whole-house variant selects — see
 * `generateHouseLayoutOptions`.
 */
export interface ScoredHouseLayoutOption {
    /** The full multi-storey result this variant builds (executor consumes it). */
    readonly result: HouseLayoutResult;
    /** Aggregate 0-100 score (mean of the chosen per-storey option scores). */
    readonly overallScore: number;
    /** 0-based variant index (stable, deterministic ordering, best-first). */
    readonly variantIndex: number;
}
