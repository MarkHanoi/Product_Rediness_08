// Architectural Program Rules — the normative room database (SINGLE SOURCE OF TRUTH).
//
// "Massive database" of architecturally-sound rules that govern WHAT each room is,
// HOW it may connect to other rooms (privacy/access), and WHAT must be inside it
// (furniture + fixtures). Every layout decision in the engine reads from here:
//   • bubbleGraph.ts  — area weights, minima, habitability, the required adjacencies
//   • wallsAndDoors.ts — which doors are PERMITTED between two room types + door caps
//   • validate.ts      — minimum areas, mandatory windows, connectivity legality
//   • furnishLayout/   — the required/optional furniture + wet-room fixtures per room
//
// Governed by docs/03_PRYZM3/reference/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md.
// PURE DATA + pure predicates: ZERO imports except the RoomType vocabulary. The
// furniture/fixture vocabularies are plain strings on purpose so this database
// carries NO dependency on the furniture engine (the furnishLayout archetypes are
// asserted CONSISTENT with this database by a test, never the other way round).

import type { RoomType } from '../types.js';

/** Privacy gradient — drives the space-syntax depth + the door permission matrix. */
export type PrivacyClass = 'public' | 'circulation' | 'private' | 'service';

export interface RoomRule {
    readonly type: RoomType;
    /** RoomOccupancyType string (editor) — how the detected room is coloured/tagged. */
    readonly occupancy: string;
    readonly privacy: PrivacyClass;

    // ── Sizing (bubbleGraph P2) ────────────────────────────────────────────────
    /** Relative area weight — bigger rooms claim more of the shell. */
    readonly areaWeight: number;
    /** Hard minimum net floor area (m²); 0 ⇒ no minimum enforced. */
    readonly minAreaM2: number;
    /** Minimum shortest plan dimension (m) — a room narrower than this is unusable. */
    readonly minShortSideM: number;
    /** Habitable: benefits from daylight (sizing + the daylight objective). */
    readonly needsWindow: boolean;
    /** Legal hard-requirement: a layout where this room lacks a window is REJECTED. */
    readonly windowMandatory: boolean;

    // ── Connectivity (wallsAndDoors P4 + validate) ─────────────────────────────
    /**
     * Room types a DOOR into this room may connect to. The permission is symmetric:
     * a door A↔B is allowed when B ∈ accessFrom(A) OR A ∈ accessFrom(B). Anything
     * else is FORBIDDEN (e.g. bedroom↔bedroom, bathroom↔kitchen, ensuite↔corridor).
     */
    readonly accessFrom: readonly RoomType[];
    /** Privacy door cap — max doorways this room may have (Infinity ⇒ uncapped). */
    readonly maxDoors: number;

    // ── Program: contents (furnishLayout) ──────────────────────────────────────
    /** Renderable furniture kinds that MUST be placed (geometry-furniture types). */
    readonly requiredFurniture: readonly string[];
    /** Renderable furniture kinds placed when they fit (nice-to-have). */
    readonly optionalFurniture: readonly string[];
    /** Wet-room fixtures that MUST be present (some are sourced from the Plumbing
     *  system, not the furniture catalogue — kept here as the architectural spec). */
    readonly requiredFixtures: readonly string[];

    /** One-line human description (SPEC tables + UI tooltips). */
    readonly description: string;
}

const INF = Number.POSITIVE_INFINITY;

/**
 * THE DATABASE. Every RoomType has exactly one rule (TypeScript's
 * Record<RoomType,…> enforces exhaustiveness — a new room type fails to compile
 * until its rule is authored here).
 */
export const ROOM_RULES: Readonly<Record<RoomType, RoomRule>> = {
    // ── Public / social ────────────────────────────────────────────────────────
    // Numeric minima below are the UK BUILDING REGULATIONS / HQI mandatory values
    // from the 248-constraint database (SPEC-LAYOUT-CONSTRAINT-DATABASE) — every
    // value carries the constraint id it implements (e.g. DB-047 = constraint #047).

    living: {
        type: 'living', occupancy: 'living-room', privacy: 'public',
        // DB-047 minAreaM2 14 (HQI mandatory); DB-049 minShortSide 3.2 m.
        areaWeight: 1.7, minAreaM2: 14, minShortSideM: 3.2, needsWindow: true, windowMandatory: true,
        accessFrom: ['hall', 'corridor', 'kitchen', 'dining'], maxDoors: INF,
        requiredFurniture: ['sofa'], optionalFurniture: ['coffee_table', 'lamp'], requiredFixtures: [],
        description: 'Primary social space. Front of the privacy gradient; open to kitchen/dining and the entrance hall.',
    },
    kitchen: {
        type: 'kitchen', occupancy: 'kitchen', privacy: 'public',
        // DB-052 minAreaM2 6.0 (galley HQI mandatory); DB-054 min galley aisle 1.0 m,
        // counter depth 600 mm ⇒ min short side ≈ 1.8 m for a working galley.
        areaWeight: 0.95, minAreaM2: 6, minShortSideM: 1.8, needsWindow: true, windowMandatory: true,
        // No direct hall→kitchen: kitchen is reached via the living/dining zone.
        accessFrom: ['corridor', 'living', 'dining', 'utility'], maxDoors: INF,
        requiredFurniture: ['kitchen_l_shape'], optionalFurniture: [], requiredFixtures: ['sink'],
        description: 'Food preparation. Works open-plan with dining; reached via the living/dining zone, never directly off the entrance hall.',
    },
    dining: {
        type: 'dining', occupancy: 'dining-room', privacy: 'public',
        // DB-060 minAreaM2 9.0 (HQI separate dining mandatory).
        areaWeight: 0.9, minAreaM2: 9, minShortSideM: 2.4, needsWindow: true, windowMandatory: false,
        // No direct hall→dining: same reason as kitchen.
        accessFrom: ['corridor', 'living', 'kitchen'], maxDoors: INF,
        requiredFurniture: ['dining_table', 'dining_chair'], optionalFurniture: ['lamp'], requiredFixtures: [],
        description: 'Eating space. Typically open to kitchen + living; reached via the living/kitchen zone.',
    },

    // ── Circulation ──────────────────────────────────────────────────────────────
    hall: {
        type: 'hall', occupancy: 'entrance-lobby', privacy: 'circulation',
        // DB-065 minAreaM2 2.5 (HQI mandatory); DB-062 main corridor clear 1.0 m.
        areaWeight: 0.5, minAreaM2: 2.5, minShortSideM: 1.2, needsWindow: false, windowMandatory: false,
        // The entrance hall is a CLEAN lobby: it distributes ONLY to the living space
        // and the corridor — never directly to a bedroom, bathroom or service room.
        // The front (perimeter) door lands in the hall; you then choose social
        // (→ living) or private (→ corridor → bedrooms/baths). This is the user's
        // explicit rule and the only sane interpretation of "the entrance is connected
        // to a bathroom" being not acceptable.
        accessFrom: ['living', 'corridor'], maxDoors: INF,
        requiredFurniture: [], optionalFurniture: ['entrance_table'], requiredFixtures: [],
        description: 'Entrance lobby — the door on the perimeter lands here. Opens ONLY to the living space and the corridor.',
    },
    corridor: {
        type: 'corridor', occupancy: 'corridor', privacy: 'circulation',
        // DB-062 main corridor clear 1.0 m mandatory (Part M); 1.2 m recommended HQI;
        // DB-064 secondary corridor 0.9 m mandatory. Pick 1.0 m as the default minimum.
        // areaWeight bumped 0.45 → 0.85: the corridor must physically span all
        // private rooms so each bedroom shares a wall with it (the bedroom-to-bath-
        // -only defect comes from a small corridor that only touches 1–2 bedrooms).
        areaWeight: 0.85, minAreaM2: 0, minShortSideM: 1.0, needsWindow: false, windowMandatory: false,
        accessFrom: ['hall', 'living', 'kitchen', 'dining', 'bedroom', 'master', 'bathroom', 'study', 'utility'], maxDoors: INF,
        requiredFurniture: [], optionalFurniture: [], requiredFixtures: [],
        description: 'Private-zone circulation spine. Serves bedrooms, bathrooms, study, utility; never an en-suite.',
    },

    // ── Private (sleeping / work) ──────────────────────────────────────────────
    master: {
        type: 'master', occupancy: 'bedroom', privacy: 'private',
        // DB-020 master minAreaM2 12 (Building Regs mandatory); DB-022 min clear width
        // 2.75 m to fit a double bed with circulation both sides; DB-023 clear length
        // 3.2 m recommended HQI; DB-021 recommended 16-20 m².
        areaWeight: 1.3, minAreaM2: 12, minShortSideM: 2.75, needsWindow: true, windowMandatory: true,
        // Master is reached from CORRIDOR / living / dining AND connects to its
        // en-suite — never directly off the entrance hall (the user's rule).
        accessFrom: ['corridor', 'living', 'dining', 'ensuite'], maxDoors: 2,
        requiredFurniture: ['bed', 'bedside_table', 'wardrobe', 'lamp'], optionalFurniture: [], requiredFixtures: [],
        description: 'Master bedroom. One door to circulation, one to its en-suite. Requires bed, 2 bedside tables, lighting, a wardrobe.',
    },
    bedroom: {
        type: 'bedroom', occupancy: 'bedroom', privacy: 'private',
        // DB-026 double bedroom minAreaM2 11.5 (Building Regs mandatory); DB-028 min
        // clear width 2.6 m. (Single bedroom 7.5 m² / 2.15 m is permitted by Building
        // Regs DB-030/031 but we default to double-capable to avoid box rooms.)
        areaWeight: 1.0, minAreaM2: 11.5, minShortSideM: 2.6, needsWindow: true, windowMandatory: true,
        // A bedroom's door MUST land on circulation or a social space — never another
        // bedroom and never directly off the entrance hall. The user's explicit rule:
        // "bedrooms should connect with the door to a corridor / living / dining."
        accessFrom: ['corridor', 'living', 'dining'], maxDoors: 1,
        requiredFurniture: ['bed', 'bedside_table', 'wardrobe', 'lamp'], optionalFurniture: [], requiredFixtures: [],
        description: 'Bedroom. Exactly one door, onto a corridor / living / dining. Requires bed, 2 bedside tables, lighting, a wardrobe.',
    },
    study: {
        type: 'study', occupancy: 'private-office', privacy: 'private',
        areaWeight: 0.85, minAreaM2: 5, minShortSideM: 2.0, needsWindow: true, windowMandatory: false,
        accessFrom: ['corridor', 'living'], maxDoors: 1,
        requiredFurniture: ['dining_table'], optionalFurniture: ['dining_chair', 'lamp'], requiredFixtures: [],
        description: 'Home office / study. One door to the corridor or the living space.',
    },

    // ── Wet rooms ────────────────────────────────────────────────────────────────
    bathroom: {
        type: 'bathroom', occupancy: 'bathroom', privacy: 'private',
        // DB-035 full bathroom minAreaM2 5.0 (BS 8300 mandatory); DB-037 min clear
        // width 1.8 m. DB-039 shower-room only is 3.5 m² — we default to full.
        areaWeight: 0.45, minAreaM2: 5, minShortSideM: 1.8, needsWindow: false, windowMandatory: false,
        // A bathroom connects to exactly ONE of: a corridor or a bedroom — NEVER the
        // entrance hall (the user's explicit rule), never a kitchen / living / dining.
        accessFrom: ['corridor', 'bedroom', 'master'], maxDoors: 1,
        requiredFurniture: ['toilet_radiator', 'shower_glass_panel'], optionalFurniture: [],
        requiredFixtures: ['toilet', 'washbasin', 'shower'],
        description: 'Shared bathroom. Exactly one door — to a corridor or a bedroom; never the entrance hall. Requires a toilet, a washbasin, and a shower or bath.',
    },
    ensuite: {
        type: 'ensuite', occupancy: 'bathroom', privacy: 'private',
        // DB-039 shower-room minAreaM2 3.5 (BS 8300 mandatory); DB-040 min width 1.5 m.
        areaWeight: 0.4, minAreaM2: 3.5, minShortSideM: 1.5, needsWindow: false, windowMandatory: false,
        // An en-suite is reached ONLY through its master bedroom.
        accessFrom: ['master'], maxDoors: 1,
        requiredFurniture: ['toilet_radiator', 'shower_glass_panel'], optionalFurniture: [],
        requiredFixtures: ['toilet', 'washbasin', 'shower'],
        description: 'Master en-suite. One door, only from the master bedroom. Requires a toilet, a washbasin, and a shower or bath.',
    },

    // ── Service ──────────────────────────────────────────────────────────────────
    utility: {
        type: 'utility', occupancy: 'utility-room', privacy: 'service',
        // DB-068 utility room minAreaM2 3.5 (HQI recommended, washer + dryer side-by-side).
        areaWeight: 0.4, minAreaM2: 3.5, minShortSideM: 1.5, needsWindow: false, windowMandatory: false,
        accessFrom: ['corridor', 'kitchen'], maxDoors: 1,
        requiredFurniture: [], optionalFurniture: [], requiredFixtures: ['sink'],
        description: 'Utility / laundry. One door to the corridor or the kitchen.',
    },
};

const FALLBACK: RoomRule = ROOM_RULES.utility;

/** The rule for a room type (utility-shaped fallback for an unknown string). */
export function roomRule(type: RoomType | string): RoomRule {
    return (ROOM_RULES as Record<string, RoomRule>)[type] ?? FALLBACK;
}

/** RoomOccupancyType string for a room type. */
export function occupancyOf(type: RoomType | string): string {
    return roomRule(type).occupancy;
}

export function isCirculation(type: RoomType | string): boolean {
    return roomRule(type).privacy === 'circulation';
}
export function isPrivate(type: RoomType | string): boolean {
    const p = roomRule(type).privacy;
    return p === 'private';
}

/**
 * May a doorway connect two room types? Symmetric: permitted when EITHER type lists
 * the other in its `accessFrom`. This is THE rule that forbids illogical doors —
 * bedroom↔bedroom, bathroom↔kitchen, an en-suite off a corridor, etc.
 */
export function doorAllowedBetween(a: RoomType | string, b: RoomType | string): boolean {
    const ra = roomRule(a), rb = roomRule(b);
    return ra.accessFrom.includes(b as RoomType) || rb.accessFrom.includes(a as RoomType);
}

/** Privacy door cap for a room type (Infinity ⇒ uncapped). */
export function maxDoorsFor(type: RoomType | string): number {
    return roomRule(type).maxDoors;
}

/** Required + optional renderable furniture kinds for an occupancy string. */
export function programForOccupancy(occupancy: string): {
    required: readonly string[]; optional: readonly string[]; fixtures: readonly string[];
} {
    for (const r of Object.values(ROOM_RULES)) {
        if (r.occupancy === occupancy) {
            return { required: r.requiredFurniture, optional: r.optionalFurniture, fixtures: r.requiredFixtures };
        }
    }
    return { required: [], optional: [], fixtures: [] };
}

/** All room rules, in privacy-gradient order (public → circulation → private → service). */
export const ALL_ROOM_RULES: readonly RoomRule[] = [
    ROOM_RULES.living, ROOM_RULES.kitchen, ROOM_RULES.dining,
    ROOM_RULES.hall, ROOM_RULES.corridor,
    ROOM_RULES.master, ROOM_RULES.bedroom, ROOM_RULES.study,
    ROOM_RULES.bathroom, ROOM_RULES.ensuite,
    ROOM_RULES.utility,
];
