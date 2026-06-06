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
//  - UPPER level(s): bedrooms + bathrooms, the master en-suite. No kitchen.
//  - A stair + landing is reserved on every storey it passes through (handled
//    geometrically by `reserveStairCore` — the program here just carries the
//    room counts; the stair core is a non-room obstacle, not a program room).
//  - 1 storey → pass-through (the input program is the single plate).

import type { ApartmentProgram } from '../apartmentLayout/types.js';
import type { StoreyProgram, StoreyRole } from './types.js';

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

    // Single-storey: pass-through. The whole program lives on the ground plate.
    if (storeys === 1) {
        return [{ storeyIndex: 0, role: 'ground', program: { ...program } }];
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
                openPlanKitchenDining: false,
                livingRoom: false,
                // Upper storeys get a landing, not an entrance hall; the layout
                // engine still benefits from a circulation seed, so keep the hall
                // flag to anchor the stair-top landing/corridor.
                entranceHall: true,
                ...(program.roomAreas ? { roomAreas: program.roomAreas } : {}),
                ...(program.roomAreasByName ? { roomAreasByName: program.roomAreasByName } : {}),
            },
        });
    }

    return out;
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
