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
// §PLATE-ROLE CONVERGENCE (M-B, ADR-0063 H1, 2026-06-09) — the bedroom-COUNT growth
// (both the upper/single-storey `growBedrooms` pass AND the multi-storey ground
// `fillGroundPlate`) now delegates to the SHARED `scaleProgramToShell(…, 'ground' |
// 'upper')` density model — the apartment's own sizer — instead of the retired
// parallel `houseStoreyBand` grow-loop + §ENRICH-DENSITY-CAP. The convergence
// finding: the subdivider fills the real plate EXACTLY (squarify), so the ONLY lever
// on per-room size is room COUNT; a large house storey was starved of rooms (the old
// ≤5/≤2 caps) so each room stretched. The shared sizer packs the storey with ENOUGH
// rooms (denser ~45 m²/bed, bounded ≤8) that each squarifies into its band. This
// enricher keeps ONLY the genuinely-additional house logic: the role room-SET
// composition (ground public set vs upper private set, §LANDING-NOT-HALL) and the
// low ground guest-bedroom cap (bedrooms live upstairs).
//
// No I/O, no THREE, no DOM, no Math.random — same convention as the rest of the
// houseLayout pure core (spans live at the AiPlane boundary, P8 §C09 §2.4).

import type { ApartmentProgram } from '../apartmentLayout/types.js';
import type { StoreyRole } from './types.js';
import { scaleProgramToShell } from '../apartmentLayout/tgl/bubbleGraph.js';

/** §HOUSE-GROUND-FILL (A.21.D28 #4) — the most bedrooms a MULTI-storey GROUND
 *  floor may be filled with. The private level is upstairs, so the ground keeps at
 *  most a guest/accessible bedroom + (on a big plate) one more — never the full
 *  bedroom count, which belongs on the upper storeys. Low by design so the
 *  well-behaved 3-bed/2-storey case (1 ground guest bedroom) is unchanged. */
const MAX_GROUND_FILL_BEDROOMS = 2;

/** §DIAG-ENRICH target-fill fraction — diagnostic-only (the bedroom GROWTH now goes
 *  through the shared `scaleProgramToShell` density, not this fraction). Retained so
 *  the §DIAG-ENRICH "targetFillM2" log line keeps its meaning for prod diagnosis. */
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
    // §HOUSE-GROUND-FILL-LARGE (M-B, 2026-06-09) — a genuinely LARGE multi-storey
    // ground plate (a 250 m²+ floor) cannot be filled by living+kitchen+dining+hall
    // + ONE guest bedroom without those few rooms ballooning (the founder's "Living
    // 108 m²"). Such a ground legitimately reads as a home with a study/second guest
    // suite, so scale the ground cap GENTLY with the plate (≤3) — far below the upper
    // (the private level), so the "bedrooms live upstairs" invariant holds and the
    // well-behaved ~165 m² ground (→ cap 2, but allocated-1 collapses it to 1) is
    // unchanged. Bounded + deterministic.
    const largeGroundCap = Math.min(3, Math.max(MAX_GROUND_FILL_BEDROOMS, Math.floor(plateAreaM2 / 90)));
    const bedCap = allocatedGroundBeds === 0
        ? largeGroundCap
        : Math.max(1, allocatedGroundBeds);

    // A multi-storey ground always reads as a home with at least a guest bedroom +
    // a bath — even from an empty brief — so the public set isn't stretched across
    // the whole plate. Raise (never lower) to that floor first.
    const floored: ApartmentProgram = {
        ...program,
        bedrooms: Math.max(1, Math.floor(program.bedrooms)),
        bathrooms: Math.max(1, Math.floor(program.bathrooms)),
    };
    // §PLATE-ROLE (M-B, 2026-06-09) — size the ground's guest-bedroom count through
    // the SHARED `scaleProgramToShell` density (the apartment's exact discipline)
    // instead of the retired `houseStoreyBand` grow-loop, then CLAMP to the low
    // ground cap (the private level is upstairs). On a normal plate this collapses to
    // the allocated guest bedroom (unchanged); on a big empty-brief plate it adds the
    // second guest bedroom the cap allows so the ground gets real partitions.
    const scaled = scaleProgramToShell(floored, plateAreaM2, 'ground');
    const groundBeds = Math.min(bedCap, Math.max(floored.bedrooms, scaled.bedrooms));
    return {
        ...floored,
        bedrooms: groundBeds,
        // 1 bath per 2 bedrooms, ≥ the existing count (a WC + a guest bath).
        bathrooms: Math.max(floored.bathrooms, bathroomsForBedrooms(groundBeds)),
        // The master/en-suite stays UPSTAIRS — the ground never gets one here
        // (mirrors `allocateProgramToStoreys`, which keeps masterEnSuite false on
        // the ground role).
        masterEnSuite: false,
    };
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
 *  - `upper`: guarantees ≥1 bedroom + a bathroom, never a kitchen (SPEC-CASA §3)
 *    and — §LANDING-NOT-HALL (G14) — NEVER an entrance hall. The stair-arrival
 *    circulation is the `corridor` the engine mints from bedrooms+bathrooms > 0
 *    (named "Landing" by the executor), not an impossible upper-floor "Entrance
 *    Hall" (that room is where the front door lands → GROUND-only).
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
    // §DIAG-ENRICH — capture the BEFORE programme + the target fill (logging only).
    // The AFTER line is emitted at every return so the delta is visible per storey.
    const beforeBeds = Math.max(0, Math.floor(program.bedrooms));
    const beforeBaths = Math.max(0, Math.floor(program.bathrooms));
    const targetAreaM2 = plateAreaM2 > 0 ? plateAreaM2 * TARGET_FILL_FRACTION : 0;
    console.log(
        `[D-TGL] §DIAG-ENRICH before: role=${role} plateAreaM2=${Math.round(plateAreaM2)} ` +
        `targetFillM2=${Math.round(targetAreaM2)} (frac=${TARGET_FILL_FRACTION}) ` +
        `bedrooms=${beforeBeds} baths=${beforeBaths} living=${program.livingRoom === true} ` +
        `kitchen=${program.includeKitchen !== false} hall=${program.entranceHall === true} ` +
        `growBedrooms=${opts.growBedrooms === true} growGroundRooms=${opts.growGroundRooms === true}`,
    );
    const logEnrichAfter = (r: ApartmentProgram, why: string): ApartmentProgram => {
        const ab = Math.max(0, Math.floor(r.bedrooms));
        const abt = Math.max(0, Math.floor(r.bathrooms));
        console.log(
            `[D-TGL] §DIAG-ENRICH after: role=${role} path=${why} ` +
            `bedrooms=${beforeBeds}->${ab} (+${ab - beforeBeds}) baths=${beforeBaths}->${abt} (+${abt - beforeBaths}) ` +
            `living=${r.livingRoom === true} kitchen=${r.includeKitchen !== false} ` +
            `dining=${r.openPlanKitchenDining === true} ensuite=${r.masterEnSuite === true}`,
        );
        return r;
    };
    if (!(plateAreaM2 > 0)) return logEnrichAfter({ ...program }, 'no-plate');

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
        // never a kitchen. §LANDING-NOT-HALL (G14, 2026-06-09) — NEVER an entrance
        // hall: an "Entrance Hall" is where the front door lands (GROUND-only). The
        // stair arrives at a LANDING, which is the `corridor` the bubble graph mints
        // whenever bedrooms+bathrooms > 0 — guaranteed here by the bedroom+bathroom
        // floor below — so leaving `entranceHall` OFF still gives every upper storey
        // its stair-arrival circulation, just typed `corridor` (named "Landing" by
        // the executor) instead of an impossible upper-floor "Entrance Hall".
        enriched = {
            ...enriched,
            bedrooms: Math.max(1, Math.floor(enriched.bedrooms)),
            bathrooms: Math.max(1, Math.floor(enriched.bathrooms)),
            entranceHall: false,
            includeKitchen: false,
            openPlanKitchenDining: false,
            livingRoom: false,
        };
        // §LANDING-NOT-HALL (G14, 2026-06-09) — record the upper-storey circulation
        // decision: no entrance hall; the stair arrives at a LANDING (the engine's
        // `corridor`, present because beds+baths ≥ 1 here), named "Landing" downstream.
        console.log(
            `[D-TGL] §LANDING-NOT-HALL role=upper hall=false circulation=corridor->Landing ` +
            `(beds=${Math.max(1, Math.floor(enriched.bedrooms))} baths=${Math.max(1, Math.floor(enriched.bathrooms))})`,
        );
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
        return logEnrichAfter(fillGroundPlate(enriched, plateAreaM2), 'fillGroundPlate');
    }

    // 2. §PLATE-ROLE (M-B, ADR-0063 H1, 2026-06-09) — grow bedrooms (+ proportional
    //    baths + en-suite) through the SHARED `scaleProgramToShell` density model
    //    (the apartment's exact discipline) instead of the retired parallel
    //    `houseStoreyBand` grow-loop + §ENRICH-DENSITY-CAP. Gated: only when this
    //    storey holds the house's bedrooms (an upper storey, or a single-storey
    //    ground). `scaleProgramToShell('upper')` scales the bedroom COUNT to the
    //    plate at the house density (~45 m²/bed, bounded ≤ MAX_BEDROOMS_HOUSE_STOREY),
    //    so a large storey is filled with ENOUGH rooms that each one squarifies into
    //    its comfortable band — never the founder's "Bedroom 88 m²". It NEVER lowers a
    //    stated count (scaleProgramToShell only raises). Pure + deterministic.
    if (!opts.growBedrooms) return logEnrichAfter(enriched, 'room-set-floor');

    // A bedroom-bearing storey ALWAYS has ≥1 bedroom + ≥1 bath FLOOR before density
    // scaling. This matters for a SINGLE-STOREY ground enriched from an EMPTY/SPARSE
    // brief (bedrooms=0 ∧ bathrooms=0): `scaleProgramToShell`'s studio escape hatch
    // (0 beds ∧ 0 baths ⇒ pass-through) would otherwise leave the whole house with no
    // bedrooms. The `ground` set-floor (above) adds the public set but NOT a bedroom;
    // here we add the private floor so the shared density sizer engages. (`upper` was
    // already floored to ≥1/≥1 in step 1.)
    const floored: ApartmentProgram = {
        ...enriched,
        bedrooms: Math.max(1, Math.floor(enriched.bedrooms)),
        bathrooms: Math.max(1, Math.floor(enriched.bathrooms)),
    };
    const scaled = scaleProgramToShell(floored, plateAreaM2, 'upper');
    enriched = {
        ...enriched,
        bedrooms: Math.max(floored.bedrooms, scaled.bedrooms),
        bathrooms: Math.max(floored.bathrooms, scaled.bathrooms),
        // A house with ≥3 bedrooms gets a master en-suite (parity with
        // scaleProgramToShell); never DOWN-grade an explicit en-suite.
        masterEnSuite: enriched.masterEnSuite || scaled.masterEnSuite,
    };

    return logEnrichAfter(enriched, 'grow-bedrooms');
}
