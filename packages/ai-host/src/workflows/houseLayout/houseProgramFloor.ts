// Casa Unifamiliar — §HOUSE-PLATE-PROGRAM-FLOOR (A.21.D25 Defect 2).
//
// PURE + DETERMINISTIC L2. The fix for the founder's "a 165 m² house plate yields
// ONE giant Room 00-001" defect.
//
// ROOT CAUSE: the per-storey D-TGL engine faithfully lays out exactly the program
// it is handed. When the captured brief is SPARSE (e.g. a 0/1-bedroom brief, or an
// upper storey that allocateProgramToStoreys left with just bedrooms=0 + a hall),
// the engine's `squarify` stretches those one or two rooms to fill the WHOLE plate
// — a 165 m² "living" blob, or a 165 m² "hall". The apartment path never hits this
// because the apartment's `scaleProgramToShell` density (~130 m²/bedroom, and an
// EXPLICIT-studio escape hatch) is tuned for a single small flat plate, NOT a house
// storey that must read as a full house.
//
// THE RULE (house-only — apartment path is NEVER touched): given a storey's plate
// area and its (possibly sparse) program, ADD rooms — never remove — until the
// programme's comfortable-target area approaches the plate, so the storey reads as
// a sensible house floor instead of one giant room. A ground floor is guaranteed
// living + kitchen + dining + hall + a WC; an upper floor is guaranteed a corridor
// + ≥1 bedroom + a bathroom; both then grow bedrooms/baths to fill the plate.
//
// This is a FLOOR, not a cap: every user-stated count is preserved (we only raise).
// The §HOUSE-MAX-CAP in the orchestrator still bounds the SUBDIVISION budget so the
// added rooms stay sensibly sized; this enricher and that cap are complementary.
//
// No I/O, no THREE, no DOM, no Math.random — same convention as the rest of the
// houseLayout pure core (spans live at the AiPlane boundary, P8 §C09 §2.4).

import type { ApartmentProgram } from '../apartmentLayout/types.js';
import type { StoreyRole } from './types.js';
import { houseStoreyBand } from './houseEnvelope.js';

/** A bedroom + its share of a bathroom consume ≈ this much comfortable-target area
 *  (bedroom mid-band ~13.5 m² + a fraction of a bathroom). Used to decide how many
 *  bedrooms a sparse plate can still absorb before the §HOUSE-MAX-CAP would bite. */
const APPROX_BEDROOM_BLOCK_M2 = 18;

/** Don't enrich past this many bedrooms on a single storey — above this you're
 *  authoring an HMO, and the brief should say so explicitly. Mirrors the apartment
 *  `scaleProgramToShell` cap philosophy. */
const MAX_ENRICHED_BEDROOMS = 5;

/** Stop adding rooms once the programme's comfortable area reaches this fraction of
 *  the plate. Below 1.0 because walls + circulation gross-up (the HOUSE_CIRCULATION
 *  _FACTOR) consume the remainder; aiming at ~85 % of net keeps rooms in their
 *  comfortable band rather than stretched to the hard max. */
const TARGET_FILL_FRACTION = 0.85;

/** Bedrooms-to-bathrooms ratio when enriching: 1 bath per 2 bedrooms, ≥1. */
function bathroomsForBedrooms(bedrooms: number): number {
    return Math.max(1, Math.floor(bedrooms / 2));
}

/** Options for {@link enrichStoreyProgramToPlate}. */
export interface EnrichStoreyOptions {
    /**
     * Whether the bedroom-growth pass may ADD bedrooms to fill the plate. For a
     * MULTI-storey house this is true ONLY for `upper` storeys (the private levels
     * that hold the bedrooms) — the ground floor of a multi-storey house keeps the
     * single guest bedroom `allocateProgramToStoreys` placed there and is NOT
     * stuffed with bedrooms (they belong upstairs). For a SINGLE-storey house the
     * whole programme lives on the ground plate, so the ground floor DOES grow
     * bedrooms. The orchestrator sets this; default false (conservative — only the
     * room-SET floor is guaranteed).
     */
    readonly growBedrooms?: boolean;
}

/**
 * Enrich a storey's program so it fills its plate with a sensible house room set
 * (A.21.D25 Defect 2). Returns a NEW program (never mutates the input). Pure +
 * deterministic.
 *
 * `role` selects the room-set FLOOR (always guaranteed, regardless of growth):
 *  - `ground`: guarantees living + kitchen + dining + entrance hall (so the
 *    entrance level always reads as a house, never one open blob).
 *  - `upper`: guarantees a circulation seed + ≥1 bedroom + a bathroom, never a
 *    kitchen (SPEC-CASA §3).
 *
 * The bedroom-GROWTH pass (gated on `opts.growBedrooms`) then raises bedrooms/baths
 * until the programme's comfortable-target area reaches the plate. The growth loop
 * measures programme area via the SAME `houseStoreyBand` the envelope gate +
 * §HOUSE-MAX-CAP use, so the enricher, the gate, and the cap all agree on "how full
 * is this plate". Growth NEVER touches a normal multi-storey GROUND floor (its
 * bedrooms live upstairs), so the well-behaved 3-bed/2-storey case is unchanged.
 */
export function enrichStoreyProgramToPlate(
    program: ApartmentProgram,
    plateAreaM2: number,
    role: StoreyRole,
    opts: EnrichStoreyOptions = {},
): ApartmentProgram {
    if (!(plateAreaM2 > 0)) return { ...program };

    // 1. Guarantee the role's minimum room SET (only ever turning flags ON / raising
    //    counts — never removing a user-stated room).
    let enriched: ApartmentProgram = { ...program };
    if (role === 'ground') {
        enriched = {
            ...enriched,
            livingRoom: true,
            entranceHall: true,
            includeKitchen: enriched.includeKitchen ?? true,
            // A ground floor reads as a home with a dining zone; default open-plan
            // on so the kitchen has a dining companion rather than the kitchen blob
            // stretching to fill the plate.
            openPlanKitchenDining: true,
        };
    } else if (role === 'upper') {
        // Upper storeys are the private level: at least one bedroom + a bathroom,
        // a hall flag to seed the stair-top landing/corridor, never a kitchen.
        enriched = {
            ...enriched,
            bedrooms: Math.max(1, Math.floor(enriched.bedrooms)),
            bathrooms: Math.max(1, Math.floor(enriched.bathrooms)),
            entranceHall: true,
            includeKitchen: false,
            openPlanKitchenDining: false,
            livingRoom: false,
        };
    }

    // 2. Grow bedrooms (+ proportional bathrooms) until the programme's comfortable
    //    area reaches TARGET_FILL_FRACTION of the plate, capped at
    //    MAX_ENRICHED_BEDROOMS. Bounded, deterministic — at most a handful of steps.
    //    Gated: only when this storey is meant to hold the house's bedrooms.
    if (!opts.growBedrooms) return enriched;

    const targetArea = plateAreaM2 * TARGET_FILL_FRACTION;
    for (let guard = 0; guard < MAX_ENRICHED_BEDROOMS; guard++) {
        const band = houseStoreyBand({ program: enriched, grossAreaM2: plateAreaM2 });
        // programAreaM2 is NET room area; grossTarget folds in circulation. Compare
        // the gross target to the plate so we don't over-pack (walls eat the rest).
        if (band.grossTargetM2 >= targetArea) break;
        if (enriched.bedrooms >= MAX_ENRICHED_BEDROOMS) break;
        // Roughly how many bedroom blocks the remaining area can still absorb; add
        // at least one per iteration so the loop always progresses.
        const remaining = targetArea - band.grossTargetM2;
        const add = Math.max(1, Math.floor(remaining / APPROX_BEDROOM_BLOCK_M2));
        const nextBedrooms = Math.min(MAX_ENRICHED_BEDROOMS, enriched.bedrooms + add);
        if (nextBedrooms === enriched.bedrooms) break;   // no progress → stop
        enriched = {
            ...enriched,
            bedrooms: nextBedrooms,
            bathrooms: Math.max(enriched.bathrooms, bathroomsForBedrooms(nextBedrooms)),
            // A house with ≥3 bedrooms gets a master en-suite (parity with
            // scaleProgramToShell); never DOWN-grade an explicit en-suite.
            masterEnSuite: enriched.masterEnSuite || nextBedrooms >= 3,
        };
    }

    return enriched;
}

export {
    APPROX_BEDROOM_BLOCK_M2 as __APPROX_BEDROOM_BLOCK_M2_FOR_TEST,
    TARGET_FILL_FRACTION as __TARGET_FILL_FRACTION_FOR_TEST,
};
