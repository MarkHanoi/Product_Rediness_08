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
import type { ApartmentProgram, ScoredLayoutOption } from '../apartmentLayout/types.js';

export type { Pt };

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
}

/**
 * The full output of the storey orchestrator (§6). `perStoreyLayout[i]` is the
 * chosen `ScoredLayoutOption` for `storeys[i]` (option[0] per storey). For a
 * 1-storey house `stairs` and `voids` are empty (strict superset of today's
 * single-storey single-plate bridge).
 */
export interface HouseLayoutResult {
    readonly storeys: StoreyPlate[];
    readonly perStoreyLayout: ScoredLayoutOption[];
    readonly stairs: StairCore[];
    readonly voids: SlabVoid[];
    readonly roof: RoofDescriptor;
}
