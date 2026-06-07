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

/** §HOUSE-GROUND-FILL (A.21.D28 #4) — the most bedrooms a MULTI-storey GROUND
 *  floor may be filled with. The private level is upstairs, so the ground keeps at
 *  most a guest/accessible bedroom + (on a big plate) one more — never the full
 *  bedroom count, which belongs on the upper storeys. Low by design so the
 *  well-behaved 3-bed/2-storey case (1 ground guest bedroom) is unchanged. */
const MAX_GROUND_FILL_BEDROOMS = 2;

/** Stop adding rooms once the programme's comfortable area reaches this fraction of
 *  the plate. Below 1.0 because walls + circulation gross-up (the HOUSE_CIRCULATION
 *  _FACTOR) consume the remainder; aiming at ~85 % of net keeps rooms in their
 *  comfortable band rather than stretched to the hard max. */
const TARGET_FILL_FRACTION = 0.85;

/** Bedrooms-to-bathrooms ratio when enriching: 1 bath per 2 bedrooms, ≥1. */
function bathroomsForBedrooms(bedrooms: number): number {
    return Math.max(1, Math.floor(bedrooms / 2));
}

/**
 * §HOUSE-GROUND-FILL (A.21.D28 #4) — fill a MULTI-storey GROUND plate with
 * GROUND-appropriate rooms until its comfortable target reaches
 * {@link TARGET_FILL_FRACTION} of the plate, WITHOUT moving the house's bedroom
 * count down off the upper storeys.
 *
 * The frozen single-plate bubble graph (`tgl/bubbleGraph.buildBubbleGraph`) only
 * emits rooms it can derive from the program counts + flags — there is no `study`
 * room flag on `ApartmentProgram`, so the only fill levers available WITHOUT
 * forking the engine are: a guest bedroom (capped at {@link MAX_GROUND_FILL_BEDROOMS}
 * so the private level upstairs keeps the rest) and a proportional bathroom/WC.
 * Both add a DISTINCT enclosed room (walls + a door) — exactly the partitions room
 * detection needs to break the one-giant-room defect — so the ground floor reads as
 * a real home (living + kitchen + dining + hall + guest bed(s) + bath) instead of a
 * stretched 4-room blob. It NEVER lowers a user-stated count (a floor, not a cap),
 * is bounded (≤ MAX_GROUND_FILL_BEDROOMS steps), and deterministic (no RNG). The
 * §HOUSE-MAX-CAP in the orchestrator still bounds the subdivision budget so the
 * added rooms stay sensibly sized.
 *
 * Pure; returns a NEW program.
 */
function fillGroundPlate(program: ApartmentProgram, plateAreaM2: number): ApartmentProgram {
    // The number of bedrooms the captured brief ALREADY placed on the ground (via
    // `allocateProgramToStoreys`, which keeps ≤1 guest bedroom downstairs for a
    // normal multi-bedroom house). We only ADD ground bedrooms beyond this when the
    // ground would otherwise be SPARSE — i.e. the brief gave it none (a 0/1-bedroom
    // whole-house brief, or the founder's empty brief). A normal multi-bedroom house
    // keeps its single ground guest bedroom (bedrooms live upstairs); the cap below
    // collapses to that one so the well-behaved 3-bed/2-storey case is unchanged and
    // the "bedrooms stay upstairs" invariant holds.
    const allocatedGroundBeds = Math.max(0, Math.floor(program.bedrooms));
    // Sparse ground (no allocated bedroom) → may fill up to MAX_GROUND_FILL_BEDROOMS
    // so a big empty-brief plate gets real partitions; otherwise keep the allocated
    // count (never invent a second ground bedroom for a house whose bedrooms belong
    // upstairs).
    const bedCap = allocatedGroundBeds === 0
        ? MAX_GROUND_FILL_BEDROOMS
        : Math.max(1, allocatedGroundBeds);

    let enriched: ApartmentProgram = { ...program };
    // A multi-storey ground always reads as a home with at least a guest bedroom +
    // a bath — even from an empty brief — so the public set isn't stretched across
    // the whole plate. Raise (never lower) to that floor first.
    enriched = {
        ...enriched,
        bedrooms: Math.max(1, Math.floor(enriched.bedrooms)),
        bathrooms: Math.max(1, Math.floor(enriched.bathrooms)),
    };

    const targetArea = plateAreaM2 * TARGET_FILL_FRACTION;
    for (let guard = 0; guard < MAX_GROUND_FILL_BEDROOMS; guard++) {
        const band = houseStoreyBand({ program: enriched, grossAreaM2: plateAreaM2 });
        if (band.grossTargetM2 >= targetArea) break;
        if (enriched.bedrooms >= bedCap) break;
        const nextBedrooms = enriched.bedrooms + 1;
        enriched = {
            ...enriched,
            bedrooms: nextBedrooms,
            // 1 bath per 2 bedrooms, ≥ the existing count (a WC + a guest bath).
            bathrooms: Math.max(enriched.bathrooms, bathroomsForBedrooms(nextBedrooms)),
            // The master/en-suite stays UPSTAIRS — the ground never gets one here
            // (mirrors `allocateProgramToStoreys`, which keeps masterEnSuite false on
            // the ground role).
        };
    }
    return enriched;
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
    /**
     * §HOUSE-GROUND-FILL (A.21.D28 #4) — whether a MULTI-storey GROUND floor may be
     * FILLED with ground-appropriate rooms until its programme approaches the plate.
     *
     * The defect: a multi-storey ground floor relied on the (sparse) captured brief
     * — living + kitchen + dining + hall + maybe one guest bedroom — and on a large
     * (~165 m²) plate the frozen engine STRETCHED those few rooms to fill it, so room
     * detection read ONE giant space. A SINGLE-storey ground (via `growBedrooms`)
     * already fills its plate; a multi-storey ground did NOT, because its bedrooms
     * live upstairs.
     *
     * This pass fills the ground plate WITHOUT moving the upstairs bedroom count
     * down: it adds a guest bedroom (capped at {@link MAX_GROUND_FILL_BEDROOMS}) and
     * a proportional bath/WC as the plate allows, until the comfortable-target gross
     * area reaches {@link TARGET_FILL_FRACTION} of the plate. It NEVER lowers a
     * user-stated count and is bounded/deterministic. The orchestrator sets this true
     * for the GROUND storey of a multi-storey house ONLY — `growBedrooms` stays false
     * there (so the heavy bedroom-stuffing reserved for the private level never runs
     * on the ground). Mutually-distinct from `growBedrooms`; if both were set,
     * `growBedrooms` (the stronger fill) wins.
     */
    readonly growGroundRooms?: boolean;
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

    // 2b. §HOUSE-GROUND-FILL (A.21.D28 #4) — fill a MULTI-storey GROUND plate with
    //     GROUND-appropriate rooms (a guest bedroom + a proportional bath/WC) until
    //     its comfortable target approaches the plate, WITHOUT pulling the house's
    //     bedroom count down off the upper storeys. Runs only when the orchestrator
    //     set `growGroundRooms` AND the heavy `growBedrooms` fill is NOT in play
    //     (single-storey ground / upper storeys use that path instead). Bounded +
    //     deterministic — see fillGroundPlate (the frozen bubble graph has no study
    //     flag, so a guest bedroom + bath are the only fill levers without forking it).
    if (role === 'ground' && opts.growGroundRooms && !opts.growBedrooms) {
        return fillGroundPlate(enriched, plateAreaM2);
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
