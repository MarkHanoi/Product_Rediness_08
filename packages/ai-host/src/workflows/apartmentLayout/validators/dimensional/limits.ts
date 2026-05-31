// G-1 / G-2 / G-3 / G-5 / G-6 / G-7 / G-10 hard bounds, per room type.
//
// Source-of-truth: `docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-1 / §G-2 / §G-3 / §G-5 / §G-6 / §G-7 / §G-10 tables — RESIDENTIAL defaults.
//
// G-8 (hierarchy) is an APARTMENT-LEVEL relational rule (largest social >
// largest private; kitchen ≥ smallest private) — it does NOT live in this
// per-room table. See `hierarchy.ts`.
//
// These are HARD ceilings: a corridor MUST NOT exceed 8 m² (above this it is a
// hall, a different programmatic type); a bathroom MUST NOT exceed 15 m² (above
// this it is a wet-room). Width caps follow the same architectural logic — a
// corridor wider than 2.5 m is no longer circulation, it is a gallery.
// Aspect-ratio caps (G-3) reject "tunnel" rooms (a 1.1 × 5.0 m bathroom is
// technically a polygon but architecturally absurd). Wall-usability minima
// (G-5) reject rooms with no continuous wall long enough to host the typical
// primary furniture piece (a bedroom with no wall ≥ 1.4 m has nowhere for a
// single bed).
//
// A future slice may migrate these onto `programRules.ts` directly so the
// connectivity matrix + the dimensional ceiling live next to each other; the
// standalone table keeps the validators dependency-free for now (the framework
// spec note: "this slice adds the upper bounds" — the existing `programRules`
// lower bounds remain authoritative).
//
// Keys are STRINGS (not RoomType union) on purpose: the framework spec lists
// room types `entrance_hall`, `private_office`, `storage`, `balcony`,
// `utility_room` that are not yet in the apartment-layout `RoomType` union but
// are valid future / multi-apartment / family-platform types. The validators
// degrade gracefully for any room type missing from this table (see
// `areaMax.ts` for the unknown-type policy).
//
// ── Sentinel values ─────────────────────────────────────────────────────────
// G-3: `aspectRatioMax === Infinity` means SKIP (corridor — corridors ARE
// elongated by nature; the G-3 check is meaningless there).
// G-5: `minUsableWallM === 0` means SKIP (corridor, balcony — no primary
// furniture piece to fit).
// G-6: `minCirculationWidthM === undefined` means SKIP (everything that is
// NOT a circulation-type room — corridors / entrance halls are the only
// rooms whose minimum clear width is governed by Part M / ADA ergonomic
// circulation; for every other room G-2's width-max ceiling already applies
// and G-6's floor is meaningless).
// G-7: `minFrontageM === undefined` means SKIP (rooms with no daylight
// requirement — corridor / hall / bathroom / wc / ensuite / utility /
// storage). Balcony is also `undefined` because the balcony IS the
// frontage; the check is meaningless. The framework spec §G-7 governs
// minimum external-wall (perimeter) length per habitable room type.
// G-10: `minLightRatio === undefined` means SKIP (no daylight requirement —
// circulation / wet rooms / service / balcony). The ratio is glazed area
// divided by floor area; per Building Regs Part F1 habitable rooms require
// glazing ≥ 10% of floor area (0.10). The framework spec §G-10 governs
// minimum window-to-floor-area ratio per habitable room type.

/** One G-1 / G-2 / G-3 / G-5 / G-6 / G-7 / G-10 row — all bounds together so adding a room type is one edit. */
export interface DimensionalLimits {
    /** G-1 — hard maximum net floor area (m²). */
    readonly areaMaxM2: number;
    /** G-2 — hard maximum clear width (m), the SHORTER plan dimension. */
    readonly widthMaxM: number;
    /** G-3 — hard maximum longest-side / shortest-side ratio. `Infinity` ⇒ skip. */
    readonly aspectRatioMax: number;
    /**
     * G-5 — minimum length (m) of the longest continuous wall segment NOT broken
     * by an opening (door/window). 0 ⇒ skip (room has no primary furniture piece).
     */
    readonly minUsableWallM: number;
    /**
     * G-6 — minimum clear circulation width (m). Applies to CIRCULATION-type
     * rooms only (corridor, entrance hall). `undefined` ⇒ skip (every other
     * room type — G-6 is the Part M / ADA ergonomic passageway floor, not a
     * habitable-room rule).
     */
    readonly minCirculationWidthM?: number | undefined;
    /**
     * G-7 — minimum external-wall (perimeter) length (m) the room owns for
     * daylight / ventilation. `undefined` ⇒ skip (room has no daylight
     * requirement: corridor / hall / bathroom / wc / ensuite / utility /
     * storage / balcony).
     */
    readonly minFrontageM?: number | undefined;
    /**
     * G-10 — minimum ratio of glazed window area to net floor area. Per
     * Building Regs Part F1 habitable rooms require glazing ≥ 10% of floor
     * area (0.10). `undefined` ⇒ skip (room has no daylight requirement:
     * circulation / wet rooms / service / balcony).
     */
    readonly minLightRatio?: number | undefined;
}

/**
 * THE TABLE. Residential defaults, per the framework §G-1/§G-2/§G-3/§G-5 tables.
 *
 * Width is the SHORTER plan dimension (the navigable cross-section) — for a
 * corridor it is the clear walking width; for a habitable room it is the
 * shorter of the two rectangular plan sides.
 */
export const DIMENSIONAL_LIMITS: Readonly<Record<string, DimensionalLimits>> = {
    // ── Circulation ──────────────────────────────────────────────────────────
    corridor:       { areaMaxM2:  8, widthMaxM: 2.5, aspectRatioMax: Infinity, minUsableWallM: 0,   minCirculationWidthM: 1.0, minFrontageM: undefined, minLightRatio: undefined },
    entrance_hall:  { areaMaxM2: 10, widthMaxM: 3.5, aspectRatioMax: 3.0,      minUsableWallM: 1.0, minCirculationWidthM: 1.2, minFrontageM: undefined, minLightRatio: undefined },
    // Apartment-layout RoomType union calls the entrance lobby `hall`. Mirror
    // the spec's `entrance_hall` limits onto `hall` so the current vocabulary
    // is validated without renaming. (When the union later splits hall vs
    // entrance_hall the two rows can diverge.)
    hall:           { areaMaxM2: 10, widthMaxM: 3.5, aspectRatioMax: 3.0,      minUsableWallM: 1.0, minCirculationWidthM: 1.2, minFrontageM: undefined, minLightRatio: undefined },

    // ── Wet rooms ────────────────────────────────────────────────────────────
    bathroom:       { areaMaxM2: 15, widthMaxM: 3.0, aspectRatioMax: 2.5,      minUsableWallM: 1.5, minCirculationWidthM: undefined, minFrontageM: undefined, minLightRatio: undefined },
    wc:             { areaMaxM2:  6, widthMaxM: 2.0, aspectRatioMax: 2.5,      minUsableWallM: 0.6, minCirculationWidthM: undefined, minFrontageM: undefined, minLightRatio: undefined },
    ensuite:        { areaMaxM2: 12, widthMaxM: 3.0, aspectRatioMax: 2.5,      minUsableWallM: 1.5, minCirculationWidthM: undefined, minFrontageM: undefined, minLightRatio: undefined },

    // ── Service ──────────────────────────────────────────────────────────────
    utility_room:   { areaMaxM2: 10, widthMaxM: 3.0, aspectRatioMax: 2.5,      minUsableWallM: 1.2, minCirculationWidthM: undefined, minFrontageM: undefined, minLightRatio: undefined },
    // Apartment-layout RoomType union calls this `utility`.
    utility:        { areaMaxM2: 10, widthMaxM: 3.0, aspectRatioMax: 2.5,      minUsableWallM: 1.2, minCirculationWidthM: undefined, minFrontageM: undefined, minLightRatio: undefined },

    // ── Public / social ──────────────────────────────────────────────────────
    kitchen:        { areaMaxM2: 40, widthMaxM: 6.0, aspectRatioMax: 3.5,      minUsableWallM: 2.4, minCirculationWidthM: undefined, minFrontageM: 1.5, minLightRatio: 0.10 },
    // Apartment-layout vocabulary uses `dining` (not `dining_room`).
    dining_room:    { areaMaxM2: 30, widthMaxM: 6.0, aspectRatioMax: 2.5,      minUsableWallM: 1.6, minCirculationWidthM: undefined, minFrontageM: 2.0, minLightRatio: 0.10 },
    dining:         { areaMaxM2: 30, widthMaxM: 6.0, aspectRatioMax: 2.5,      minUsableWallM: 1.6, minCirculationWidthM: undefined, minFrontageM: 2.0, minLightRatio: 0.10 },
    living_room:    { areaMaxM2: 60, widthMaxM: 8.0, aspectRatioMax: 2.5,      minUsableWallM: 2.4, minCirculationWidthM: undefined, minFrontageM: 2.5, minLightRatio: 0.10 },
    living:         { areaMaxM2: 60, widthMaxM: 8.0, aspectRatioMax: 2.5,      minUsableWallM: 2.4, minCirculationWidthM: undefined, minFrontageM: 2.5, minLightRatio: 0.10 },

    // ── Private (sleeping / work) ────────────────────────────────────────────
    bedroom:        { areaMaxM2: 25, widthMaxM: 5.0, aspectRatioMax: 2.5,      minUsableWallM: 1.4, minCirculationWidthM: undefined, minFrontageM: 1.5, minLightRatio: 0.10 },
    master_bedroom: { areaMaxM2: 35, widthMaxM: 6.0, aspectRatioMax: 2.5,      minUsableWallM: 1.8, minCirculationWidthM: undefined, minFrontageM: 2.0, minLightRatio: 0.10 },
    // Apartment-layout RoomType union uses `master`.
    master:         { areaMaxM2: 35, widthMaxM: 6.0, aspectRatioMax: 2.5,      minUsableWallM: 1.8, minCirculationWidthM: undefined, minFrontageM: 2.0, minLightRatio: 0.10 },
    private_office: { areaMaxM2: 20, widthMaxM: 5.0, aspectRatioMax: 3.0,      minUsableWallM: 1.4, minCirculationWidthM: undefined, minFrontageM: 1.5, minLightRatio: 0.10 },
    // Apartment-layout RoomType union uses `study`.
    study:          { areaMaxM2: 20, widthMaxM: 5.0, aspectRatioMax: 3.0,      minUsableWallM: 1.4, minCirculationWidthM: undefined, minFrontageM: 1.5, minLightRatio: 0.10 },

    // ── Spec-listed types not yet in the apartment-layout RoomType union ─────
    storage:        { areaMaxM2:  8, widthMaxM: 3.0, aspectRatioMax: 4.0,      minUsableWallM: 0.6, minCirculationWidthM: undefined, minFrontageM: undefined, minLightRatio: undefined },
    balcony:        { areaMaxM2: 20, widthMaxM: 3.5, aspectRatioMax: 6.0,      minUsableWallM: 0,   minCirculationWidthM: undefined, minFrontageM: undefined, minLightRatio: undefined },
};

/** Lookup — returns `undefined` for an unknown type so callers degrade. */
export function limitsFor(roomType: string): DimensionalLimits | undefined {
    return DIMENSIONAL_LIMITS[roomType];
}
