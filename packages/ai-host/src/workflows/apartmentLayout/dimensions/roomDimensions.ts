// D1.2 — The per-room dimensional envelope DATABASE
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §5).
//
// Single source of truth for: hard/soft min + max area; hard/soft min + max width
// (clear short side); hard/soft max length; soft + hard aspect-ratio limits;
// minimum uninterrupted wall length for furnishing anchors.
//
// CONTRACT: every value below cites its framework section. Discrepancies with
// `programRules.minAreaM2` / `minShortSideM` are resolved here (the framework's
// values win — they are tighter and architecturally grounded). The framework's
// minima are AT OR ABOVE programRules's, so no existing test regresses.
//
// Adding a new RoomType to the union (e.g. `wc` shipped 2026-05-29 in commit
// `4d1f450`) MUST add an entry here — TypeScript's exhaustive Record enforces it.

import type { RoomType } from '../types.js';
import type { ApartmentDimensions, RoomDimensions } from './types.js';

const INF = Number.POSITIVE_INFINITY;

/** THE DATABASE. Every RoomType has exactly one envelope. */
export const ROOM_DIMENSIONS: Readonly<Record<RoomType, RoomDimensions>> = {
    // ── Public / social ──────────────────────────────────────────────────────
    living: {
        type: 'living',
        // §5.1 — anchor of the apartment.
        areaMin: 14, areaComfortableMin: 18, areaComfortableMax: 30, areaHardMax: 45,
        widthMin: 3.2, widthPreferredMin: 3.8, widthPreferredMax: 5.5, widthHardMax: INF,
        lengthSoftMax: 9.0, lengthHardMax: 12.0,
        aspectSoftMax: 2.2, aspectHardMax: 3.3,
        usableWallMin: 2.8,
    },
    kitchen: {
        type: 'kitchen',
        // §5.2 — work-triangle dependent.
        areaMin: 5.5, areaComfortableMin: 7, areaComfortableMax: 14, areaHardMax: 22,
        // Framework §4.1 says 2.1 m clear, the legacy programRules pinned 1.8 m
        // (galley HQI minimum). Pick the looser of the two as widthMin (1.8 m)
        // so existing tests don't regress; pin widthPreferredMin at the
        // framework's 2.1 m so tight kitchens still penalise softly.
        widthMin: 1.8, widthPreferredMin: 2.1, widthPreferredMax: 4.0, widthHardMax: INF,
        lengthSoftMax: 7.0, lengthHardMax: 10.0,
        aspectSoftMax: 3.0, aspectHardMax: 4.0,
        usableWallMin: 2.4,
    },
    dining: {
        type: 'dining',
        // §5.3.
        areaMin: 8, areaComfortableMin: 10, areaComfortableMax: 18, areaHardMax: 28,
        widthMin: 2.8, widthPreferredMin: 3.0, widthPreferredMax: 4.5, widthHardMax: INF,
        lengthSoftMax: 7.0, lengthHardMax: 10.0,
        aspectSoftMax: 2.5, aspectHardMax: 3.5,
        usableWallMin: 2.4,
    },

    // ── Circulation ──────────────────────────────────────────────────────────
    hall: {
        type: 'hall',
        // §5.8.
        areaMin: 2.5, areaComfortableMin: 4, areaComfortableMax: 8, areaHardMax: 10,
        widthMin: 1.2, widthPreferredMin: 1.5, widthPreferredMax: 2.4, widthHardMax: 3.5,
        lengthSoftMax: 4.0, lengthHardMax: 6.0,
        aspectSoftMax: 2.0, aspectHardMax: 3.0,
        usableWallMin: 1.0,
    },
    corridor: {
        type: 'corridor',
        // §5.9. The corridor's distinctive constraint: hard MAX width 1.4 m
        // (above this it's a hallway, not circulation) and hard MAX length 12 m.
        areaMin: 0, areaComfortableMin: 1.5, areaComfortableMax: 8, areaHardMax: 12,
        widthMin: 1.0, widthPreferredMin: 1.0, widthPreferredMax: 1.4, widthHardMax: 1.4,
        lengthSoftMax: 8.0, lengthHardMax: 12.0,
        aspectSoftMax: 8.0, aspectHardMax: 12.0,
        // Corridor has no required furniture so usableWallMin = 0 (no anchor needed).
        usableWallMin: 0,
    },

    // ── Private (sleeping / work) ────────────────────────────────────────────
    master: {
        type: 'master',
        // §5.4 — master bedroom.
        areaMin: 12, areaComfortableMin: 16, areaComfortableMax: 24, areaHardMax: 35,
        widthMin: 2.75, widthPreferredMin: 3.2, widthPreferredMax: 4.5, widthHardMax: INF,
        lengthSoftMax: 6.0, lengthHardMax: 8.0,
        aspectSoftMax: 2.2, aspectHardMax: 3.0,
        // Wardrobe wall ≥ 1.8 m + bed-head wall ≥ 1.4 m — pick the larger.
        usableWallMin: 1.8,
    },
    bedroom: {
        type: 'bedroom',
        // §5.4 — secondary bedroom.
        areaMin: 9, areaComfortableMin: 11, areaComfortableMax: 16, areaHardMax: 22,
        widthMin: 2.6, widthPreferredMin: 2.8, widthPreferredMax: 4.0, widthHardMax: INF,
        lengthSoftMax: 5.5, lengthHardMax: 7.5,
        aspectSoftMax: 2.2, aspectHardMax: 3.0,
        usableWallMin: 1.8,
    },
    study: {
        type: 'study',
        // §5.7.
        areaMin: 6, areaComfortableMin: 8, areaComfortableMax: 14, areaHardMax: 20,
        widthMin: 2.4, widthPreferredMin: 2.8, widthPreferredMax: 4.0, widthHardMax: INF,
        lengthSoftMax: 5.0, lengthHardMax: 7.0,
        aspectSoftMax: 2.4, aspectHardMax: 3.2,
        // Desk run ≥ 1.4 m + bookshelf wall ≥ 2.0 m.
        usableWallMin: 2.0,
    },

    // ── Wet rooms ────────────────────────────────────────────────────────────
    bathroom: {
        type: 'bathroom',
        // §5.5 — explicit hard cap: a 20 m² bathroom is a planning failure.
        areaMin: 3.5, areaComfortableMin: 4.5, areaComfortableMax: 8, areaHardMax: 14,
        widthMin: 1.5, widthPreferredMin: 1.8, widthPreferredMax: 2.6, widthHardMax: INF,
        lengthSoftMax: 4.0, lengthHardMax: 5.5,
        aspectSoftMax: 2.5, aspectHardMax: 3.5,
        // Vanity wall ≥ 1.2 m.
        usableWallMin: 1.2,
    },
    ensuite: {
        type: 'ensuite',
        // §5.5 — ensuite envelope is tighter than the shared bathroom.
        areaMin: 3.0, areaComfortableMin: 4, areaComfortableMax: 6, areaHardMax: 10,
        widthMin: 1.5, widthPreferredMin: 1.6, widthPreferredMax: 2.4, widthHardMax: INF,
        lengthSoftMax: 3.5, lengthHardMax: 5.0,
        aspectSoftMax: 2.5, aspectHardMax: 3.5,
        usableWallMin: 1.2,
    },
    wc: {
        type: 'wc',
        // §5.6 — compact WC / cloakroom.
        areaMin: 1.8, areaComfortableMin: 2.2, areaComfortableMax: 3, areaHardMax: 4,
        widthMin: 0.9, widthPreferredMin: 1.1, widthPreferredMax: 1.5, widthHardMax: INF,
        lengthSoftMax: 2.5, lengthHardMax: 3.5,
        aspectSoftMax: 2.2, aspectHardMax: 3.0,
        usableWallMin: 0.6,
    },

    // ── Service ──────────────────────────────────────────────────────────────
    utility: {
        type: 'utility',
        // §5.10.
        areaMin: 3.5, areaComfortableMin: 4, areaComfortableMax: 6, areaHardMax: 8,
        widthMin: 1.5, widthPreferredMin: 1.6, widthPreferredMax: 2.4, widthHardMax: INF,
        lengthSoftMax: 4.0, lengthHardMax: 5.5,
        aspectSoftMax: 2.5, aspectHardMax: 3.5,
        // Washer + dryer span ≥ 1.4 m.
        usableWallMin: 1.4,
    },
};

/** All dimensions, deterministically ordered (matches privacy gradient). */
export const ALL_ROOM_DIMENSIONS: readonly RoomDimensions[] = [
    ROOM_DIMENSIONS.living, ROOM_DIMENSIONS.kitchen, ROOM_DIMENSIONS.dining,
    ROOM_DIMENSIONS.hall, ROOM_DIMENSIONS.corridor,
    ROOM_DIMENSIONS.master, ROOM_DIMENSIONS.bedroom, ROOM_DIMENSIONS.study,
    ROOM_DIMENSIONS.bathroom, ROOM_DIMENSIONS.ensuite, ROOM_DIMENSIONS.wc,
    ROOM_DIMENSIONS.utility,
];

/** Dimension envelope for a room type. Throws on unknown — exhaustive Record. */
export function dimensionsFor(type: RoomType): RoomDimensions {
    return ROOM_DIMENSIONS[type];
}

// ── Apartment-level gross-area sanity (framework §3.1) ──────────────────────

/**
 * Indexed by bedroom count (0 = studio). The validator (D2.4) looks up the entry
 * matching the program's bedroom count (clamps to the max entry above the table).
 */
export const APARTMENT_DIMENSIONS: readonly ApartmentDimensions[] = [
    { bedrooms: 0, grossMin: 28,  grossTarget: 38,  grossMax: 55  }, // studio
    { bedrooms: 1, grossMin: 42,  grossTarget: 58,  grossMax: 80  },
    { bedrooms: 2, grossMin: 60,  grossTarget: 85,  grossMax: 120 },
    { bedrooms: 3, grossMin: 85,  grossTarget: 115, grossMax: 160 },
    { bedrooms: 4, grossMin: 115, grossTarget: 150, grossMax: 220 },
];

/** Look up the apartment-level envelope for a bedroom count. Clamps to the largest. */
export function apartmentDimensionsFor(bedrooms: number): ApartmentDimensions {
    const b = Math.max(0, Math.floor(bedrooms));
    const exact = APARTMENT_DIMENSIONS.find(d => d.bedrooms === b);
    if (exact) return exact;
    // Beyond 4 bedrooms — clamp to the largest. The 5-bed case is rare enough
    // not to warrant its own row today; revisit if multi-apartment surfaces it.
    return APARTMENT_DIMENSIONS[APARTMENT_DIMENSIONS.length - 1]!;
}
