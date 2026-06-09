// Casa Unifamiliar — storey allocation policy (§3 "per-storey allocation").
//
// PURE + DETERMINISTIC L2. Splits ONE `ApartmentProgram` (the whole-house brief)
// into N `StoreyProgram`s — each an `ApartmentProgram`-shaped single-plate
// sub-program the existing D-TGL engine consumes per storey. No I/O, no spans
// (matches the apartment tgl pure-function convention: spans live at the plane
// boundary, not in pure helpers).
//
// Default policy (§3):
//  - GROUND (entrance) level: public/wet/living + kitchen + dining + entrance hall,
//    a WC (one ground bathroom), and OPTIONALLY one ground-floor bedroom (guest /
//    accessible master).
//  - UPPER level(s): bedrooms + bathrooms, the master en-suite. No kitchen, and
//    NO entrance hall — the stair arrives at a LANDING (the engine's `corridor`),
//    never an "Entrance Hall" (§LANDING-NOT-HALL / G14).
//  - A stair + landing is reserved on every storey it passes through (handled
//    geometrically by `reserveStairCore` — the program here just carries the
//    room counts; the stair core is a non-room obstacle, not a program room).
//  - 1 storey → pass-through (the input program is the single plate).

import type { ApartmentProgram } from '../apartmentLayout/types.js';
import type { StoreyProgram, StoreyRole } from './types.js';
import {
    verticalStackAcousticScore, type StoreyAcousticProfile,
} from '../apartmentLayout/tgl/envDrivers.js';

/** Clamp storey count to a sane single-family-house range (≥1). */
function clampStoreyCount(n: number): number {
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.floor(n));
}

/**
 * Allocate a whole-house `program` across `storeyCount` storeys (§3 policy).
 * Deterministic: same input → same output. For `storeyCount <= 1` this is a
 * strict pass-through (one storey carrying the full program), so the house path
 * is a superset of today's single-plate apartment path.
 *
 * Bedroom distribution: with a `masterLocation`-style ground bedroom we keep ONE
 * bedroom downstairs when there are ≥2 bedrooms (a guest/accessible room); the
 * remaining bedrooms go upstairs. The master en-suite follows the master, which
 * is upstairs by default. Bathrooms: one WC stays on the ground; the rest go up.
 */
export function allocateProgramToStoreys(
    program: ApartmentProgram,
    storeyCount: number,
): StoreyProgram[] {
    const storeys = clampStoreyCount(storeyCount);

    // §DIAG-ALLOC — log the BRIEF → per-storey program split (logging only; no
    // behaviour change). One line for the whole-house brief, one per emitted storey.
    console.log(
        `[D-TGL] §DIAG-ALLOC brief: storeys=${storeys} bedrooms=${program.bedrooms} ` +
        `baths=${program.bathrooms} masterEnSuite=${program.masterEnSuite === true} ` +
        `kitchen=${program.includeKitchen !== false} living=${program.livingRoom === true} ` +
        `hall=${program.entranceHall === true} openPlanKD=${program.openPlanKitchenDining === true}`,
    );
    const logAllocStorey = (s: StoreyProgram): void => {
        const p = s.program;
        console.log(
            `[D-TGL] §DIAG-ALLOC storey[${s.storeyIndex}] role=${s.role} ` +
            `bedrooms=${Math.max(0, Math.floor(p.bedrooms))} baths=${Math.max(0, Math.floor(p.bathrooms))} ` +
            `kitchen=${p.includeKitchen !== false} living=${p.livingRoom === true} ` +
            `hall=${p.entranceHall === true} ensuite=${p.masterEnSuite === true}`,
        );
    };

    // Single-storey: pass-through. The whole program lives on the ground plate.
    if (storeys === 1) {
        const out: StoreyProgram[] = [{ storeyIndex: 0, role: 'ground', program: { ...program } }];
        out.forEach(logAllocStorey);
        return out;
    }

    const totalBedrooms = Math.max(0, Math.floor(program.bedrooms));
    const totalBathrooms = Math.max(0, Math.floor(program.bathrooms));

    // Keep one ground-floor bedroom (guest / accessible) when there's more than
    // one bedroom; otherwise all bedrooms go upstairs (the private level).
    const groundBedrooms = totalBedrooms >= 2 ? 1 : 0;
    const upperBedrooms = totalBedrooms - groundBedrooms;

    // One bathroom (the entrance-level WC) stays on the ground; the remainder is
    // distributed across the upper storeys (family bath + master en-suite).
    const groundBathrooms = totalBathrooms > 0 ? 1 : 0;
    const upperBathrooms = totalBathrooms - groundBathrooms;

    const upperCount = storeys - 1;

    // Spread the upper bedrooms/bathrooms evenly across the upper storeys,
    // front-loading the lowest upper storey (where the master lives) so the
    // remainder lands deterministically near the stair-top landing.
    const bedroomsPerUpper = distributeEven(upperBedrooms, upperCount);
    const bathroomsPerUpper = distributeEven(upperBathrooms, upperCount);

    const out: StoreyProgram[] = [];

    // GROUND — public/living/kitchen/dining + the optional ground bedroom + WC.
    out.push({
        storeyIndex: 0,
        role: 'ground',
        program: {
            bedrooms: groundBedrooms,
            bathrooms: groundBathrooms,
            // The master (with its en-suite) is upstairs by default, so the
            // ground keeps no en-suite even if the house has one.
            masterEnSuite: false,
            // Kitchen/dining + living + entrance hall are house-entrance features.
            includeKitchen: true, // §A.21.x-KITCHEN — the house kitchen lives on the ground floor only
            openPlanKitchenDining: program.openPlanKitchenDining,
            livingRoom: program.livingRoom,
            entranceHall: program.entranceHall,
            ...(program.roomAreas ? { roomAreas: program.roomAreas } : {}),
            ...(program.roomAreasByName ? { roomAreasByName: program.roomAreasByName } : {}),
        },
    });

    // UPPER storeys — bedrooms + bathrooms; no kitchen/dining. The master
    // en-suite lands on the FIRST upper storey (storeyIndex 1) where the master is.
    for (let i = 0; i < upperCount; i++) {
        const isFirstUpper = i === 0;
        const role: StoreyRole = 'upper';
        out.push({
            storeyIndex: i + 1,
            role,
            program: {
                bedrooms: bedroomsPerUpper[i] ?? 0,
                bathrooms: bathroomsPerUpper[i] ?? 0,
                masterEnSuite: isFirstUpper ? program.masterEnSuite : false,
                includeKitchen: false, // §A.21.x-KITCHEN — SPEC-CASA §3: upper storeys have NO kitchen
                openPlanKitchenDining: false,
                livingRoom: false,
                // §LANDING-NOT-HALL (G14, 2026-06-09) — an UPPER storey must NOT mint an
                // entrance hall. An "Entrance Hall" is where the FRONT DOOR lands and can
                // ONLY exist on the GROUND (entrance) floor; an upper storey is reached by
                // the stair, which arrives at a LANDING (circulation), not an entrance hall.
                // The bubble graph mints a `hall` named "Entrance Hall" purely from
                // `entranceHall === true`, so we leave it OFF here — the stair-arrival
                // circulation seed is the `corridor` the engine already mints whenever
                // bedrooms+bathrooms > 0 (guaranteed on every upper storey by
                // `enrichStoreyProgramToPlate`'s upper room-set floor), named "Landing" on
                // upper storeys by the executor's naming pass.
                entranceHall: false,
                ...(program.roomAreas ? { roomAreas: program.roomAreas } : {}),
                ...(program.roomAreasByName ? { roomAreasByName: program.roomAreasByName } : {}),
            },
        });
    }

    out.forEach(logAllocStorey);
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// §ENV-E3-ACOUSTIC (vertical) — SOFT storey-allocation acoustic preference (spec
// §4): bedroom-above-bedroom is fine; a bedroom directly above a kitchen/noisy
// storey is a structure-borne penalty. This is a PREFERENCE used to compare two
// candidate allocations — NOT a hard gate (a 1-storey house, or a house whose only
// kitchen is on the ground with bedrooms above, is the common acoustically-sound
// case and scores 1.0). Pure + deterministic; no I/O, no spans.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive each storey's acoustic profile (bedroom / noisy presence) from an
 * allocated stack, ground first. A storey is "noisy" when it carries a kitchen
 * (the dominant structure-borne source in a dwelling) or a utility/laundry. The
 * apartment-program shape exposes `includeKitchen`; `openPlanKitchenDining` (a
 * kitchen-dining) is also treated as a kitchen.
 */
export function storeyAcousticProfiles(
    storeys: readonly StoreyProgram[],
): StoreyAcousticProfile[] {
    return storeys.map(s => {
        const p = s.program;
        const hasBedroom = Math.max(0, Math.floor(p.bedrooms)) > 0;
        const hasNoisy = p.includeKitchen === true || p.openPlanKitchenDining === true;
        return { hasBedroom, hasNoisy };
    });
}

/**
 * §ENV-E3-ACOUSTIC (vertical) — score an allocated stack in [0, 1] (spec §4). 1.0
 * = no upper bedroom sits directly above a noisy storey; lower = some do. A SOFT
 * preference (the orchestrator/variants can use it to break ties between equally-
 * valid allocations); never a gate. Neutral 1.0 for a single storey or when no
 * upper bedroom sits over any storey.
 */
export function storeyAcousticPreference(storeys: readonly StoreyProgram[]): number {
    return verticalStackAcousticScore(storeyAcousticProfiles(storeys));
}

/**
 * Distribute `total` units across `buckets` as evenly as possible, front-loading
 * the remainder (bucket 0 gets the extra). Deterministic. `buckets <= 0` → [].
 */
function distributeEven(total: number, buckets: number): number[] {
    if (buckets <= 0) return [];
    const base = Math.floor(total / buckets);
    const rem = total - base * buckets;
    const out: number[] = [];
    for (let i = 0; i < buckets; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
}

export { distributeEven as __distributeEvenForTest, clampStoreyCount as __clampStoreyCountForTest };
