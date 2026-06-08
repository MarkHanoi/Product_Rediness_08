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
// Governed by docs/archive/pryzm3-internal/reference/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md.
// PURE DATA + pure predicates: ZERO imports except the RoomType vocabulary. The
// furniture/fixture vocabularies are plain strings on purpose so this database
// carries NO dependency on the furniture engine (the furnishLayout archetypes are
// asserted CONSISTENT with this database by a test, never the other way round).

import type { RoomType } from '../types.js';

/** Privacy gradient — drives the space-syntax depth + the door permission matrix. */
export type PrivacyClass = 'public' | 'circulation' | 'private' | 'service';

/**
 * T1.3 — Acoustic role
 * (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK §19.1).
 * Classifies a room as a noise SOURCE (TV/cooking/conversation/washer-dryer),
 * a noise RECEIVER (sleeping/concentrating), or NEUTRAL (transient circulation).
 * Read by `topology/validateAcousticZoning.ts` to penalise source↔receiver shared
 * walls. Previously held inline in `topology/adjacencyRules.ts` as Sets; lifted
 * here so the per-room database remains the single source of truth.
 */
export type AcousticRole = 'source' | 'receiver' | 'neutral';

/**
 * T1.6 — Frontage preference
 * (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK §19.1).
 * How strongly this room type benefits from sitting on the external perimeter:
 *   'required'  — habitable + window-mandatory (living, master, bedroom)
 *   'preferred' — gains quality from a façade but can ship without
 *                 (study, kitchen when not en-suite to dining, dining)
 *   'none'      — interior-acceptable (bathroom, wc, corridor, hall, utility)
 * Distinct from `windowMandatory` (which is about the glazing requirement when
 * a room IS on the perimeter). Read by L4-δ-4 frontage allocators + T2.5 spatial-
 * proportion validators.
 */
export type FrontagePreference = 'required' | 'preferred' | 'none';

// ── §FURNITURE-SPEC (2026-05-28, architect's interactive plan database) ──────
// Architect-mandated DOOR-VECTOR-AWARE placement metadata. The big algorithmic
// insight: every piece of furniture is placed RELATIVE TO THE DOOR ARC, not at
// a fixed position. When the engine generates a room rectangle, it first stamps
// the door arc; every furniture spec then claims a wall (per `placementRule`)
// that's not blocked by the arc's exclusion zone (when `excludeDoorSwing`) and
// not on the wall carrying the window (when `excludeWindowWall`).
//
// This is the SINGLE SOURCE OF TRUTH for furniture placement. The D-FLE engine
// currently reads dimensions from `furnishLayout/footprints.ts` and placement
// anchors from `furnishLayout/archetypes.ts`; a consistency test pins those two
// against the specs below so they cannot drift. The D-FLE migration to read
// FurnitureSpec directly is a follow-up.
//
// ALL DIMENSIONS IN MILLIMETRES — that is the canonical unit architects work
// in, and matches the format the interactive plan-database visualisation
// emits. D-FLE converts to metres at the boundary (×1/1000).

/**
 * Where a piece of furniture lives. Each rule is a function of the room's door
 * vector, window placement, and other furniture groups:
 *  - 'opposite_door'     : anchored on the wall most-opposite the primary door.
 *  - 'longest_wall'      : longest free wall (after door + window exclusions).
 *  - 'flank_group'       : pair-placed flanking a group leader (e.g. bedside ↔ bed).
 *  - 'beside_group'      : adjacent to a group leader (e.g. coffee table ↔ sofa).
 *  - 'centre'            : centred in the room (e.g. dining table).
 *  - 'around_group'      : arranged around a group leader (e.g. dining chairs ↔ table).
 *  - 'corner'            : any corner of the room.
 *  - 'window_wall'       : on the wall carrying the largest window (e.g. desk).
 *  - 'wet_wall'          : on the wall carrying drainage (toilet, washbasin).
 */
export type PlacementRule =
    | 'opposite_door'
    | 'longest_wall'
    | 'flank_group'
    | 'beside_group'
    | 'centre'
    | 'around_group'
    | 'corner'
    | 'window_wall'
    | 'wet_wall';

/**
 * One placed item in a room's furniture program. Dimensions + clearances drive
 * the D-FLE collision grid; the placement rule + exclusion flags drive which
 * wall the item lands on (door-vector aware).
 *
 * Example (architect's interactive plan database, bedroom bed):
 *   { kind: 'bed', sizeW: 1350, sizeD: 1900, clearFoot: 800, clearSide: 600,
 *     placementRule: 'opposite_door', excludeDoorSwing: true,
 *     excludeWindowWall: true, required: true }
 */
export interface FurnitureSpec {
    /** Catalogue kind — must match a key in @pryzm/geometry-furniture FurnitureType. */
    readonly kind: string;
    /** Width ALONG the anchor wall (mm). */
    readonly sizeW: number;
    /** Depth FROM the anchor wall into the room (mm). */
    readonly sizeD: number;
    /** Keep-clear depth in front (foot end) of the item (mm); 0 if not applicable. */
    readonly clearFoot: number;
    /** Keep-clear on EACH side (mm); 0 if not applicable. */
    readonly clearSide: number;
    /** Placement rule (function of the door vector + window + other groups). */
    readonly placementRule: PlacementRule;
    /** The item's footprint may NOT overlap the door's 90° opening arc. */
    readonly excludeDoorSwing: boolean;
    /** The item may NOT be anchored on the wall carrying the room's window. */
    readonly excludeWindowWall: boolean;
    /** Group leader (kind) for relative placement — `'bed'` for bedside_table,
     *  `'dining_table'` for dining_chair, `'sofa'` for coffee_table. */
    readonly group?: string;
    /** How many to place (default 1) — e.g. 2 bedside tables, 4 dining chairs. */
    readonly count?: number;
    /** True when the item is mandatory (the rules' `requiredFurniture` list);
     *  false when optional (nice-to-have, placed only when it fits). */
    readonly required: boolean;
}

export interface RoomRule {
    readonly type: RoomType;
    /** RoomOccupancyType string (editor) — how the detected room is coloured/tagged. */
    readonly occupancy: string;
    readonly privacy: PrivacyClass;
    /** T1.3 — acoustic role (noise source / receiver / neutral). */
    readonly acousticRole: AcousticRole;
    /** T1.6 — façade frontage preference. */
    readonly frontage: FrontagePreference;

    // ── Sizing (bubbleGraph P2) ────────────────────────────────────────────────
    /** Relative area weight — bigger rooms claim more of the shell. */
    readonly areaWeight: number;
    /** Hard minimum net floor area (m²); 0 ⇒ no minimum enforced. */
    readonly minAreaM2: number;
    /** Minimum shortest plan dimension (m) — a room narrower than this is unusable. */
    readonly minShortSideM: number;

    /**
     * §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08, re-done with the sealing fix) —
     * MAX shortest plan dimension (m). A corridor is a RECTANGLE whose SHORT side
     * is normally 0.9–1.2 m and whose LONG side is much larger. Without this cap a
     * multi-rect / squarify path can hand the corridor a NEAR-SQUARE cell (e.g.
     * 3 m × 3.5 m ≈ 10 m²) — a fat blob the founder reads as "a fat square
     * corridor", not a circulation spine. Read by `subdivide.ts`'s
     * `reshapeCorridorStrip` post-pass to narrow such a cell to a strip along its
     * SHORT axis. Only the corridor declares it; `undefined` ⇒ no cap (every
     * habitable room is uncapped — they WANT to be square-ish). */
    readonly maxShortSideM?: number;

    /**
     * §CORRIDOR-PHYSIOGNOMY (A.21.D46) — the corridor's ADVISORY long-side band
     * (m). minLongSideM is the §CIRCULATION floor (a real spine, not a stub);
     * maxLongSideM is the founder's "≈2–6 m" target. CRITICAL (the 2026-06-08
     * sealing-fix): maxLongSideM is BEST-EFFORT, NEVER enforced by shortening the
     * spine — a corridor serving N rooms across the shell MUST stay long enough to
     * share a wall with EVERY room it serves (the §EVERY-ROOM-ACCESS invariant).
     * The reshape only narrows the SHORT axis (always safe); it never trims the
     * long axis below the served-room span. `undefined` ⇒ no band (every other
     * room type). Read by `subdivide.ts`. */
    readonly minLongSideM?: number;
    readonly maxLongSideM?: number;

    /**
     * §AREA-FRACTIONS (2026-05-29, single-apartment-fix-pass-spec #3 +
     * program-rules-improvements-queue #3) — soft floor/ceiling on a room's
     * SHARE OF THE NET APARTMENT AREA. Both are clamps in the bubble graph
     * allocator, applied AFTER the weight-proportional split and AFTER any
     * roomAreas/roomAreasByName override:
     *   targetAreaM2 = clamp(raw, [
     *     max(minAreaM2, availableAreaM2 * minAreaFrac),
     *     availableAreaM2 * maxAreaFrac  // ∞ when undefined
     *   ])
     * Unlike areaWeight (proportional) these scale automatically with the
     * apartment size: corridor at 0.10 means 10% in a 60 m² studio AND in a
     * 200 m² family flat — exactly the spec's "size-scaled cap" intent.
     * Missing fields ⇒ no clamp (fully backward-compatible).
     */
    readonly maxAreaFrac?: number;
    readonly minAreaFrac?: number;
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

    /**
     * §ADJACENCY-PREFERENCE (2026-05-29, program-rules-improvements-queue #6) —
     * soft per-pair preference weight for room-to-room adjacencies. 0 = neutral
     * (no strong opinion), 1 = strongly preferred (e.g. kitchen↔dining). Used
     * by the layout SCORING objective (`adjacency` axis in objectives.ts) to
     * distinguish "good" layouts from merely-legal ones — a layout that
     * realises a kitchen↔dining adjacency scores higher than one that only
     * realises kitchen↔corridor. Optional; missing entries default to 1.0
     * (treat as fully required) so adding the field to one rule doesn't shift
     * the score of layouts that touch other rules.
     */
    readonly adjacencyPreference?: Readonly<Partial<Record<RoomType, number>>>;

    // ── Program: contents (furnishLayout) ──────────────────────────────────────
    /** Renderable furniture kinds that MUST be placed (geometry-furniture types). */
    readonly requiredFurniture: readonly string[];
    /** Renderable furniture kinds placed when they fit (nice-to-have). */
    readonly optionalFurniture: readonly string[];
    /** Wet-room fixtures that MUST be present (some are sourced from the Plumbing
     *  system, not the furniture catalogue — kept here as the architectural spec). */
    readonly requiredFixtures: readonly string[];

    /** §FURNITURE-SPEC: door-vector-aware placement metadata per item. The kinds
     *  in this list MUST be a superset of `requiredFurniture` (consistency test
     *  enforces). Optional items appear with `required: false`. Empty for rooms
     *  with no furniture program (corridor). */
    readonly furnitureSpec: readonly FurnitureSpec[];

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
        acousticRole: 'source', frontage: 'required',
        // DB-047 minAreaM2 14 (HQI mandatory); DB-049 minShortSide 3.2 m.
        // §AREA-FRACTIONS — living must be ≥ 15 % of the apartment (spec floor).
        areaWeight: 1.7, minAreaM2: 14, minShortSideM: 3.2, needsWindow: true, windowMandatory: true,
        minAreaFrac: 0.15,
        accessFrom: ['hall', 'corridor', 'kitchen', 'dining'], maxDoors: INF,
        adjacencyPreference: { kitchen: 1.0, dining: 1.0, hall: 0.8, corridor: 0.5 },
        requiredFurniture: ['sofa'], optionalFurniture: ['coffee_table', 'tv_unit', 'tv', 'bookshelf_glass', 'wall_art', 'curtain_rod', 'curtain_panel', 'lamp'], requiredFixtures: [],
        furnitureSpec: [
            { kind: 'sofa',             sizeW: 2000, sizeD: 900, clearFoot: 450, clearSide: 100, placementRule: 'longest_wall',   excludeDoorSwing: true,  excludeWindowWall: false, required: true, group: 'sofa' },
            { kind: 'coffee_table',     sizeW: 1100, sizeD: 600, clearFoot: 300, clearSide: 100, placementRule: 'beside_group',   excludeDoorSwing: true,  excludeWindowWall: false, required: false, group: 'sofa' },
            // F1.3 — Media wall: TV unit on the wall opposite the sofa;
            // wall-mounted TV pairs with it via the 'media' group.
            { kind: 'tv_unit',          sizeW: 1600, sizeD: 400, clearFoot: 600, clearSide: 0,   placementRule: 'opposite_door',  excludeDoorSwing: true,  excludeWindowWall: true,  required: false, group: 'media' },
            { kind: 'tv',               sizeW: 1400, sizeD: 80,  clearFoot: 0,   clearSide: 0,   placementRule: 'beside_group',   excludeDoorSwing: false, excludeWindowWall: true,  required: false, group: 'media' },
            // F1.2 — Glass-front bookshelf for living-room storage.
            { kind: 'bookshelf_glass',  sizeW: 800,  sizeD: 350, clearFoot: 600, clearSide: 0,   placementRule: 'longest_wall',   excludeDoorSwing: true,  excludeWindowWall: true,  required: false },
            // F1.10 — Wall art above the sofa (paired group).
            { kind: 'wall_art',         sizeW: 600,  sizeD: 40,  clearFoot: 0,   clearSide: 0,   placementRule: 'beside_group',   excludeDoorSwing: false, excludeWindowWall: true,  required: false, group: 'sofa' },
            // F1.11 — Curtains on the living-room window wall.
            { kind: 'curtain_rod',      sizeW: 2000, sizeD: 40,  clearFoot: 0,   clearSide: 0,   placementRule: 'window_wall',    excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'curtains' },
            { kind: 'curtain_panel',    sizeW: 1000, sizeD: 50,  clearFoot: 0,   clearSide: 0,   placementRule: 'beside_group',   excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'curtains' },
            { kind: 'lamp',             sizeW: 350,  sizeD: 350, clearFoot: 100, clearSide: 0,   placementRule: 'corner',         excludeDoorSwing: false, excludeWindowWall: false, required: false },
        ],
        description: 'Primary social space. Front of the privacy gradient; open to kitchen/dining and the entrance hall.',
    },
    kitchen: {
        type: 'kitchen', occupancy: 'kitchen', privacy: 'public',
        acousticRole: 'source', frontage: 'required',
        // DB-052 minAreaM2 6.0 (galley HQI mandatory); DB-054 min galley aisle 1.0 m,
        // counter depth 600 mm ⇒ min short side ≈ 1.8 m for a working galley.
        // §AREA-FRACTIONS — kitchen ≥ 7 % of the apartment (spec floor).
        areaWeight: 0.95, minAreaM2: 6, minShortSideM: 1.8, needsWindow: true, windowMandatory: true,
        minAreaFrac: 0.07,
        // No direct hall→kitchen: kitchen is reached via the living/dining zone.
        accessFrom: ['corridor', 'living', 'dining', 'utility'], maxDoors: INF,
        // §ADJACENCY-PREFERENCE — kitchen↔dining is the classic open-plan pair (1.0),
        // kitchen↔living is the common open-plan extension (0.8), utility off the
        // kitchen is sensible (0.6).
        // §F1-2 (2026-06-08, layout-quality fix-pass) — kitchen↔corridor raised 0.3 → 0.6.
        // The old 0.3 only LIGHTLY penalised a kitchen buried in the private zone (behind
        // the corridor, separated from living/dining by bedrooms). 0.6 stays below
        // kitchen↔dining (1.0) but is strong enough to discourage a wrong-zone kitchen.
        adjacencyPreference: { dining: 1.0, living: 0.8, utility: 0.6, corridor: 0.6 },
        requiredFurniture: ['kitchen_straight'], optionalFurniture: ['kitchen_straight', 'pantry_cabinet'], requiredFixtures: ['sink'],
        furnitureSpec: [
            // Kitchen runs sit on the LONGEST FREE WALL (architectural intent of
            // "L-shape" is the TWO ADJACENT WALLS case). The pure engine emits
            // two perpendicular `kitchen_straight` runs; the cascading anchor
            // resolver puts the second on a wall adjacent to the first, naturally
            // forming an L at a corner. Door arc clears the working zone; the
            // sink prefers the window wall so excludeWindowWall is FALSE.
            { kind: 'kitchen_straight', sizeW: 3000, sizeD: 600, clearFoot: 1000, clearSide: 0, placementRule: 'longest_wall', excludeDoorSwing: true, excludeWindowWall: false, required: true },
            { kind: 'kitchen_straight', sizeW: 3000, sizeD: 600, clearFoot: 1000, clearSide: 0, placementRule: 'longest_wall', excludeDoorSwing: true, excludeWindowWall: false, required: false },
            // F1.14 (2026-05-30) — Pantry cabinet.
            { kind: 'pantry_cabinet',   sizeW: 600,  sizeD: 450, clearFoot: 1000, clearSide: 0, placementRule: 'longest_wall', excludeDoorSwing: true, excludeWindowWall: true,  required: false },
        ],
        description: 'Food preparation. Works open-plan with dining; reached via the living/dining zone, never directly off the entrance hall.',
    },
    dining: {
        type: 'dining', occupancy: 'dining-room', privacy: 'public',
        acousticRole: 'source', frontage: 'preferred',
        // DB-060 minAreaM2 9.0 (HQI separate dining mandatory).
        areaWeight: 0.9, minAreaM2: 9, minShortSideM: 2.4, needsWindow: true, windowMandatory: false,
        // No direct hall→dining: same reason as kitchen.
        accessFrom: ['corridor', 'living', 'kitchen'], maxDoors: INF,
        adjacencyPreference: { kitchen: 1.0, living: 0.9, corridor: 0.4 },
        requiredFurniture: ['dining_table', 'dining_chair'], optionalFurniture: ['sideboard', 'buffet', 'lamp'], requiredFixtures: [],
        furnitureSpec: [
            { kind: 'dining_table', sizeW: 1400, sizeD: 900, clearFoot: 900, clearSide: 900, placementRule: 'centre',       excludeDoorSwing: true,  excludeWindowWall: false, required: true,  group: 'dining' },
            { kind: 'dining_chair', sizeW: 500,  sizeD: 500, clearFoot: 0,   clearSide: 0,   placementRule: 'around_group', excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'dining', count: 4 },
            // F1.9 (2026-05-30) — Dining-room storage.
            { kind: 'sideboard',    sizeW: 1800, sizeD: 450, clearFoot: 700, clearSide: 0,   placementRule: 'longest_wall', excludeDoorSwing: true,  excludeWindowWall: true,  required: false },
            { kind: 'buffet',       sizeW: 1500, sizeD: 450, clearFoot: 700, clearSide: 0,   placementRule: 'longest_wall', excludeDoorSwing: true,  excludeWindowWall: true,  required: false },
            { kind: 'lamp',         sizeW: 350,  sizeD: 350, clearFoot: 100, clearSide: 0,   placementRule: 'corner',       excludeDoorSwing: false, excludeWindowWall: false, required: false },
        ],
        description: 'Eating space. Typically open to kitchen + living; reached via the living/kitchen zone. Optional sideboard/buffet for tableware storage.',
    },

    // ── Circulation ──────────────────────────────────────────────────────────────
    hall: {
        type: 'hall', occupancy: 'entrance-lobby', privacy: 'circulation',
        acousticRole: 'neutral', frontage: 'none',
        // DB-065 minAreaM2 2.5 (HQI mandatory); DB-062 main corridor clear 1.0 m.
        areaWeight: 0.5, minAreaM2: 2.5, minShortSideM: 1.2, needsWindow: false, windowMandatory: false,
        // The entrance hall is a CLEAN lobby: it distributes ONLY to the living space
        // and the corridor — never directly to a bedroom, bathroom or service room.
        // The front (perimeter) door lands in the hall; you then choose social
        // (→ living) or private (→ corridor → bedrooms/baths). This is the user's
        // explicit rule and the only sane interpretation of "the entrance is connected
        // to a bathroom" being not acceptable.
        accessFrom: ['living', 'corridor'], maxDoors: INF,
        // Hall→living is the architectural intent (clean lobby opens onto the social
        // space); hall→corridor is the route to the private zone, also strongly desired.
        adjacencyPreference: { living: 1.0, corridor: 0.9 },
        requiredFurniture: [], optionalFurniture: ['entrance_table', 'shoe_cabinet', 'console_table', 'coat_rack', 'entry_bench'], requiredFixtures: [],
        furnitureSpec: [
            // Entrance table — legacy small entrance accent (kept for back-compat
            // with smaller halls that can only fit one piece).
            { kind: 'entrance_table', sizeW: 1000, sizeD: 400, clearFoot: 300, clearSide: 0, placementRule: 'longest_wall',  excludeDoorSwing: true, excludeWindowWall: false, required: false },
            // F1.4 (2026-05-30) — S2 entry storage activity system.
            { kind: 'shoe_cabinet',   sizeW: 900,  sizeD: 350, clearFoot: 500, clearSide: 0, placementRule: 'longest_wall',  excludeDoorSwing: true, excludeWindowWall: false, required: false, group: 'entry' },
            { kind: 'console_table',  sizeW: 1000, sizeD: 300, clearFoot: 400, clearSide: 0, placementRule: 'opposite_door', excludeDoorSwing: true, excludeWindowWall: false, required: false, group: 'entry' },
            { kind: 'coat_rack',      sizeW: 450,  sizeD: 450, clearFoot: 300, clearSide: 0, placementRule: 'corner',        excludeDoorSwing: false, excludeWindowWall: false, required: false },
            { kind: 'entry_bench',    sizeW: 1200, sizeD: 400, clearFoot: 500, clearSide: 0, placementRule: 'beside_group',  excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'entry' },
        ],
        description: 'Entrance lobby — the door on the perimeter lands here. Opens ONLY to the living space and the corridor. Furnished with the S2 entry storage system (shoe cabinet + console + coat rack + bench) when room allows.',
    },
    corridor: {
        type: 'corridor', occupancy: 'corridor', privacy: 'circulation',
        acousticRole: 'neutral', frontage: 'none',
        // DB-062 main corridor clear 1.0 m mandatory (Part M); 1.2 m recommended HQI;
        // DB-064 secondary corridor 0.9 m mandatory. Pick 1.0 m as the default minimum.
        // areaWeight bumped 0.45 → 0.85: the corridor must physically span all
        // private rooms so each bedroom shares a wall with it (the bedroom-to-bath-
        // -only defect comes from a small corridor that only touches 1–2 bedrooms).
        // §AREA-FRACTIONS — cap corridor at 10 % of the apartment so the 0.85
        // weight doesn't eat 25 %+ of a 60 m² studio (the fix-pass-spec
        // "corridor/hall combined ≤ 12 %"; hall is small so 10 + 2 % gives slack).
        areaWeight: 0.85, minAreaM2: 0, minShortSideM: 1.0, needsWindow: false, windowMandatory: false,
        maxAreaFrac: 0.10,
        // §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08, re-done with the sealing fix;
        // founder rule "a corridor is a RECTANGLE — one dimension 0.9–1.2 m, the
        // OTHER ≈2–6 m"). The corridor must read as a NARROW STRIP, never a fat
        // SQUARIFIED cell:
        //   • maxShortSideM 1.2 — the strip's clear width is capped at the HQI
        //     recommended 1.2 m (minShortSideM 1.0 m is the Part-M floor). The
        //     §SINGLE-RECT carve already builds the corridor at this width; this cap
        //     lets the reshape post-pass narrow a NEAR-SQUARE corridor (handed out by
        //     the multi-rect / squarify path) back to a strip along its SHORT axis.
        //   • minLongSideM 2.0 / maxLongSideM 6.0 — the ADVISORY long band. minLong is
        //     the §CIRCULATION floor. maxLong is BEST-EFFORT only: the reshape NEVER
        //     trims the long axis (that is what sealed the dining room in the reverted
        //     5b472cfb attempt — a shortened spine lost a served room's shared wall).
        //     The corridor stays as long as the rooms it serves require; the §EVERY-
        //     ROOM-ACCESS invariant always wins over the cosmetic length cap.
        maxShortSideM: 1.2, minLongSideM: 2.0, maxLongSideM: 6.0,
        accessFrom: ['hall', 'living', 'kitchen', 'dining', 'bedroom', 'master', 'bathroom', 'study', 'utility'], maxDoors: INF,
        // Corridor IS the private-zone spine — bedroom/master/bath off the corridor are
        // strongly preferred (1.0/0.9). Hall→corridor is the architectural entry point.
        // Kitchen / living / dining off the corridor are permitted (open-plan fallback)
        // but the social rooms prefer to cluster off the hall directly (preference 0.3).
        adjacencyPreference: {
            hall: 1.0, bedroom: 0.9, master: 0.9, bathroom: 0.9, study: 0.8, utility: 0.6,
            kitchen: 0.3, living: 0.3, dining: 0.3,
        },
        requiredFurniture: [], optionalFurniture: [], requiredFixtures: [],
        furnitureSpec: [],   // circulation — kept clear by design.
        description: 'Private-zone circulation spine. Serves bedrooms, bathrooms, study, utility; never an en-suite.',
    },

    // ── Private (sleeping / work) ──────────────────────────────────────────────
    master: {
        type: 'master', occupancy: 'bedroom', privacy: 'private',
        acousticRole: 'receiver', frontage: 'required',
        // DB-020 master minAreaM2 12 (Building Regs mandatory); DB-022 min clear width
        // 2.75 m to fit a double bed with circulation both sides; DB-023 clear length
        // 3.2 m recommended HQI; DB-021 recommended 16-20 m².
        // §AREA-FRACTIONS — master ≤ 20 % of the apartment (spec ceiling). Stops
        // the master from eating living/kitchen area in small flats.
        areaWeight: 1.3, minAreaM2: 12, minShortSideM: 2.75, needsWindow: true, windowMandatory: true,
        maxAreaFrac: 0.20,
        // Master is reached from CORRIDOR / living / dining AND connects to its
        // en-suite — never directly off the entrance hall (the user's rule).
        accessFrom: ['corridor', 'living', 'dining', 'ensuite'], maxDoors: 2,
        // Master → ensuite is the defining adjacency (1.0); master → corridor is the
        // architectural entry (0.9). Master → living/dining is permitted but unusual
        // (studio-like layouts where the master opens onto a shared social space).
        adjacencyPreference: { ensuite: 1.0, corridor: 0.9, living: 0.4, dining: 0.3 },
        requiredFurniture: ['bed', 'bedside_table', 'wardrobe', 'lamp'], optionalFurniture: ['dresser', 'vanity_table', 'wall_mirror', 'curtain_rod', 'curtain_panel'], requiredFixtures: [],
        furnitureSpec: [
            // Architect's interactive plan database — door-vector-aware placement.
            // Bed: opposite the door, on a SOLID wall (never the window wall —
            // privacy + thermal). Bedside tables flank the bed (group: 'bed').
            // Wardrobe: longest free wall, never the window wall (tall furniture
            // blocks daylight) and never inside the door arc.
            { kind: 'bed',           sizeW: 1350, sizeD: 1900, clearFoot: 800, clearSide: 600, placementRule: 'opposite_door', excludeDoorSwing: true,  excludeWindowWall: true,  required: true, group: 'bed' },
            { kind: 'bedside_table', sizeW: 450,  sizeD: 400,  clearFoot: 0,   clearSide: 0,   placementRule: 'flank_group',   excludeDoorSwing: false, excludeWindowWall: false, required: true, group: 'bed', count: 2 },
            { kind: 'wardrobe',      sizeW: 1200, sizeD: 600,  clearFoot: 900, clearSide: 0,   placementRule: 'longest_wall',  excludeDoorSwing: true,  excludeWindowWall: true,  required: true },
            // F1.12 — Bedroom dressing.
            { kind: 'dresser',       sizeW: 1200, sizeD: 500,  clearFoot: 800, clearSide: 0,   placementRule: 'longest_wall',  excludeDoorSwing: true,  excludeWindowWall: true,  required: false },
            { kind: 'vanity_table',  sizeW: 900,  sizeD: 450,  clearFoot: 850, clearSide: 100, placementRule: 'window_wall',   excludeDoorSwing: true,  excludeWindowWall: false, required: false },
            // F1.10 — Wall mirror above the bed (paired with bed group).
            { kind: 'wall_mirror',   sizeW: 500,  sizeD: 40,   clearFoot: 0,   clearSide: 0,   placementRule: 'beside_group',  excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'bed' },
            // F1.11 — Curtains on the master bedroom window wall.
            { kind: 'curtain_rod',   sizeW: 2000, sizeD: 40,   clearFoot: 0,   clearSide: 0,   placementRule: 'window_wall',   excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'curtains' },
            { kind: 'curtain_panel', sizeW: 1000, sizeD: 50,   clearFoot: 0,   clearSide: 0,   placementRule: 'beside_group',  excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'curtains' },
            { kind: 'lamp',          sizeW: 350,  sizeD: 350,  clearFoot: 100, clearSide: 0,   placementRule: 'corner',        excludeDoorSwing: false, excludeWindowWall: false, required: true },
        ],
        description: 'Master bedroom. One door to circulation, one to its en-suite. Requires bed, 2 bedside tables, lighting, a wardrobe. Optional wall mirror, curtains on the window wall.',
    },
    bedroom: {
        type: 'bedroom', occupancy: 'bedroom', privacy: 'private',
        acousticRole: 'receiver', frontage: 'required',
        // DB-026 double bedroom minAreaM2 11.5 (Building Regs mandatory); DB-028 min
        // clear width 2.6 m. (Single bedroom 7.5 m² / 2.15 m is permitted by Building
        // Regs DB-030/031 but we default to double-capable to avoid box rooms.)
        // §AREA-FRACTIONS — secondary bedroom ≤ 16 % each (spec ceiling).
        areaWeight: 1.0, minAreaM2: 11.5, minShortSideM: 2.6, needsWindow: true, windowMandatory: true,
        maxAreaFrac: 0.16,
        // A bedroom's door MUST land on circulation or a social space — never another
        // bedroom and never directly off the entrance hall. The user's explicit rule:
        // "bedrooms should connect with the door to a corridor / living / dining."
        accessFrom: ['corridor', 'living', 'dining'], maxDoors: 1,
        // Bedroom off the corridor is the canonical layout (1.0); off living/dining
        // is permitted (loft / small flat) but less preferred.
        adjacencyPreference: { corridor: 1.0, living: 0.4, dining: 0.3 },
        requiredFurniture: ['bed', 'bedside_table', 'wardrobe', 'lamp'], optionalFurniture: ['curtain_rod', 'curtain_panel'], requiredFixtures: [],
        furnitureSpec: [
            // Same program as master — door-vector-aware. Identical specs so the
            // engine treats both bedroom types consistently.
            { kind: 'bed',           sizeW: 1350, sizeD: 1900, clearFoot: 800, clearSide: 600, placementRule: 'opposite_door', excludeDoorSwing: true,  excludeWindowWall: true,  required: true, group: 'bed' },
            { kind: 'bedside_table', sizeW: 450,  sizeD: 400,  clearFoot: 0,   clearSide: 0,   placementRule: 'flank_group',   excludeDoorSwing: false, excludeWindowWall: false, required: true, group: 'bed', count: 2 },
            { kind: 'wardrobe',      sizeW: 1200, sizeD: 600,  clearFoot: 900, clearSide: 0,   placementRule: 'longest_wall',  excludeDoorSwing: true,  excludeWindowWall: true,  required: true },
            // F1.11 — Curtains on the bedroom window wall.
            { kind: 'curtain_rod',   sizeW: 2000, sizeD: 40,   clearFoot: 0,   clearSide: 0,   placementRule: 'window_wall',   excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'curtains' },
            { kind: 'curtain_panel', sizeW: 1000, sizeD: 50,   clearFoot: 0,   clearSide: 0,   placementRule: 'beside_group',  excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'curtains' },
            { kind: 'lamp',          sizeW: 350,  sizeD: 350,  clearFoot: 100, clearSide: 0,   placementRule: 'corner',        excludeDoorSwing: false, excludeWindowWall: false, required: true },
        ],
        description: 'Bedroom. Exactly one door, onto a corridor / living / dining. Requires bed, 2 bedside tables, lighting, a wardrobe. Optional curtains on the window wall.',
    },
    study: {
        type: 'study', occupancy: 'private-office', privacy: 'private',
        acousticRole: 'receiver', frontage: 'preferred',
        areaWeight: 0.85, minAreaM2: 5, minShortSideM: 2.0, needsWindow: true, windowMandatory: false,
        accessFrom: ['corridor', 'living'], maxDoors: 1,
        // F1.1 (2026-05-30) — proper `desk` + `desk_chair` shipped, replacing
        // the dining-table-as-desk workaround.
        requiredFurniture: ['desk'], optionalFurniture: ['desk_chair', 'bookshelf', 'lamp'], requiredFixtures: [],
        furnitureSpec: [
            // Desk WANTS the window wall (natural light from the side, screen not
            // facing the window). Worktop 1.4 × 0.7 m at 0.75 m height; 0.9 m
            // front clearance for chair pull-out.
            { kind: 'desk',       sizeW: 1400, sizeD: 700, clearFoot: 900, clearSide: 450, placementRule: 'window_wall',  excludeDoorSwing: true,  excludeWindowWall: false, required: true,  group: 'desk' },
            { kind: 'desk_chair', sizeW: 550,  sizeD: 550, clearFoot: 0,   clearSide: 0,   placementRule: 'beside_group', excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'desk', count: 1 },
            // F1.2 — Open bookshelf as the canonical study companion. Long
            // wall, not the window wall (tall piece blocks daylight).
            { kind: 'bookshelf',  sizeW: 800,  sizeD: 350, clearFoot: 600, clearSide: 0,   placementRule: 'longest_wall', excludeDoorSwing: true,  excludeWindowWall: true,  required: false },
            { kind: 'lamp',       sizeW: 350,  sizeD: 350, clearFoot: 100, clearSide: 0,   placementRule: 'corner',       excludeDoorSwing: false, excludeWindowWall: false, required: false },
        ],
        description: 'Home office / study. One door to the corridor or the living space. Anchored by a desk on the window wall + matching task chair + optional open bookshelf on the long wall.',
    },

    // ── Wet rooms ────────────────────────────────────────────────────────────────
    bathroom: {
        type: 'bathroom', occupancy: 'bathroom', privacy: 'private',
        // A.21.D55 — DAYLIGHT IN EVERY ROOM. Promoted 'none' → 'preferred': a wet
        // room with a window (obscure-glazed, raised sill) is architecturally
        // desirable wherever the plate allows it, NOT forbidden. 'preferred' adds
        // only a SOFT validateFrontage penalty when a bathroom is buried fully
        // interior — never a HARD reject (an internal bath is still legal, it's the
        // LAST-resort interior room), so the Pareto-equality baseline is preserved.
        acousticRole: 'neutral', frontage: 'preferred',
        // DB-035 full bathroom minAreaM2 5.0 (BS 8300 mandatory); DB-037 min clear
        // width 1.8 m. DB-039 shower-room only is 3.5 m² — we default to full.
        // §AREA-FRACTIONS — bathroom ≥ 5 % of the apartment (spec floor) so it
        // doesn't get squeezed below the legal full-bath minimum in small flats.
        areaWeight: 0.45, minAreaM2: 5, minShortSideM: 1.8, needsWindow: false, windowMandatory: false,
        minAreaFrac: 0.05,
        // §BATH-CORRIDOR-ONLY (2026-05-29) — shared bathroom door goes to the
        // CORRIDOR only. The previous list permitted `bedroom` and `master`,
        // which lets a layout open a SHARED bath directly into a bedroom — that
        // semantic is an EN-SUITE, and we already model it as a separate room
        // type (`ensuite`, accessFrom: ['master']). Bathroom-off-bedroom is
        // ONLY architecturally acceptable as a Jack-and-Jill, which is a
        // different first-class room type to add later — not a blanket bathroom
        // permission. See program-rules-improvements-queue.md item #2.
        accessFrom: ['corridor'], maxDoors: 1,
        // Bathroom only goes off the corridor (post §BATH-CORRIDOR-ONLY).
        adjacencyPreference: { corridor: 1.0 },
        requiredFurniture: ['toilet_radiator', 'shower_glass_panel'], optionalFurniture: ['vanity_unit', 'bathroom_mirror', 'towel_rail'],
        requiredFixtures: ['toilet', 'washbasin', 'shower'],
        furnitureSpec: [
            // Toilet sits on the plumbing wall (drainage stack); shower in the
            // corner farthest from the door. Both clear the door swing — a
            // toilet behind the door is awkward, a shower behind the door is
            // dangerous when wet.
            { kind: 'toilet_radiator',    sizeW: 400,  sizeD: 700, clearFoot: 600, clearSide: 100, placementRule: 'wet_wall',      excludeDoorSwing: true, excludeWindowWall: false, required: true },
            { kind: 'shower_glass_panel', sizeW: 900,  sizeD: 900, clearFoot: 200, clearSide: 0,   placementRule: 'corner',        excludeDoorSwing: true, excludeWindowWall: false, required: true },
            // F1.5 (2026-05-30) — S4 vanity system (mirror pairs via 'vanity' group).
            { kind: 'vanity_unit',        sizeW: 1000, sizeD: 500, clearFoot: 700, clearSide: 50,  placementRule: 'opposite_door', excludeDoorSwing: true, excludeWindowWall: false, required: false, group: 'vanity' },
            { kind: 'bathroom_mirror',    sizeW: 800,  sizeD: 40,  clearFoot: 0,   clearSide: 0,   placementRule: 'beside_group',  excludeDoorSwing: false, excludeWindowWall: false, required: false, group: 'vanity' },
            { kind: 'towel_rail',         sizeW: 500,  sizeD: 100, clearFoot: 0,   clearSide: 0,   placementRule: 'longest_wall',  excludeDoorSwing: true, excludeWindowWall: false, required: false },
        ],
        description: 'Shared bathroom. Exactly one door — to a corridor; never the entrance hall, never directly off a bedroom (that semantic is an en-suite). Requires a toilet, a washbasin, and a shower or bath. Optional S4 vanity + mirror + towel rail.',
    },
    ensuite: {
        type: 'ensuite', occupancy: 'bathroom', privacy: 'private',
        // A.21.D55 — promoted 'none' → 'preferred' (see bathroom). A window in the
        // ensuite is desirable where the plate allows; SOFT-only, never a hard reject.
        acousticRole: 'neutral', frontage: 'preferred',
        // DB-039 shower-room minAreaM2 3.5 (BS 8300 mandatory); DB-040 min width 1.5 m.
        areaWeight: 0.4, minAreaM2: 3.5, minShortSideM: 1.5, needsWindow: false, windowMandatory: false,
        // An en-suite is reached ONLY through its master bedroom.
        accessFrom: ['master'], maxDoors: 1,
        // Ensuite ONLY goes off master.
        adjacencyPreference: { master: 1.0 },
        requiredFurniture: ['toilet_radiator', 'shower_glass_panel'], optionalFurniture: [],
        requiredFixtures: ['toilet', 'washbasin', 'shower'],
        furnitureSpec: [
            // Same fixtures as a shared bathroom; smaller minimum, so the toilet
            // ↔ shower layout is tighter.
            { kind: 'toilet_radiator',    sizeW: 400, sizeD: 700, clearFoot: 600, clearSide: 100, placementRule: 'wet_wall', excludeDoorSwing: true, excludeWindowWall: false, required: true },
            { kind: 'shower_glass_panel', sizeW: 900, sizeD: 900, clearFoot: 200, clearSide: 0,   placementRule: 'corner',   excludeDoorSwing: true, excludeWindowWall: false, required: true },
        ],
        description: 'Master en-suite. One door, only from the master bedroom. Requires a toilet, a washbasin, and a shower or bath.',
    },

    // §WC (2026-05-29, queue #1) — separate toilet, extremely common in
    // French/European F3+ layouts where the WC is split from the bathroom for
    // privacy + parallel use. The CORRIDOR/HALL is the access point — never a
    // bedroom (that's the en-suite semantic) and never the kitchen / living /
    // dining (a WC off a social room is the architectural anti-pattern).
    wc: {
        type: 'wc', occupancy: 'wc', privacy: 'private',
        // A.21.D55 — promoted 'none' → 'preferred' (see bathroom). A small WC is the
        // most common genuinely-interior room, so this stays SOFT (never hard) — the
        // ranker nudges toward a fronted WC but a windowless internal WC is still legal.
        acousticRole: 'neutral', frontage: 'preferred',
        // UK Building Regs typical: 1.2 m² + 0.9 m short side for a "cloakroom WC"
        // (DB-039-related, smaller envelope than a full bathroom).
        areaWeight: 0.25, minAreaM2: 1.2, minShortSideM: 0.9, needsWindow: false, windowMandatory: false,
        accessFrom: ['corridor', 'hall'], maxDoors: 1,
        // §ADJACENCY-PREFERENCE — corridor is the canonical access; hall is the
        // "cloakroom WC by the front door" pattern, also fully sensible.
        adjacencyPreference: { corridor: 1.0, hall: 0.9 },
        requiredFurniture: ['toilet_radiator', 'wc_washbasin'], optionalFurniture: ['wc_mirror'],
        requiredFixtures: ['toilet', 'washbasin'],
        furnitureSpec: [
            // F1.7 + F3.5 (2026-05-31) closure of the queue item — the
            // wc_washbasin is now a real renderable kind, so the furnitureSpec
            // can include it (was fixture-only before F1.7). Toilet on the
            // plumbing wall (drainage stack), small wall-hung washbasin
            // perpendicular / opposite, compact mirror above it.
            { kind: 'toilet_radiator', sizeW: 400, sizeD: 700, clearFoot: 600, clearSide: 100, placementRule: 'wet_wall', excludeDoorSwing: true, excludeWindowWall: false, required: true },
            { kind: 'wc_washbasin',    sizeW: 450, sizeD: 300, clearFoot: 550, clearSide:  50, placementRule: 'opposite_door', excludeDoorSwing: true, excludeWindowWall: false, required: true },
            { kind: 'wc_mirror',       sizeW: 400, sizeD:  30, clearFoot:   0, clearSide:   0, placementRule: 'beside_group',  excludeDoorSwing: false, excludeWindowWall: false, required: false },
        ],
        description: 'Separate WC / cloakroom. One door — to a corridor or the entrance hall; never off a bedroom / kitchen / living / dining. Requires a toilet and a washbasin.',
    },

    // ── Service ──────────────────────────────────────────────────────────────────
    utility: {
        type: 'utility', occupancy: 'utility-room', privacy: 'service',
        acousticRole: 'source', frontage: 'none',
        // DB-068 utility room minAreaM2 3.5 (HQI recommended, washer + dryer side-by-side).
        areaWeight: 0.4, minAreaM2: 3.5, minShortSideM: 1.5, needsWindow: false, windowMandatory: false,
        accessFrom: ['corridor', 'kitchen'], maxDoors: 1,
        requiredFurniture: [], optionalFurniture: [], requiredFixtures: ['sink'],
        furnitureSpec: [],   // washer/dryer not yet catalogued as renderable furniture.
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
 * §OPEN-PLAN-ELIGIBLE (A.21.D40 #5, 2026-06-08) — may this room type EVER share a
 * wall-less open-plan threshold with a neighbour?
 *
 * Open-plan is an architectural property of SOCIAL rooms only: the living /
 * kitchen / dining cluster (the "lounge-diner" / "open-plan living" pattern). A
 * SLEEPING room (bedroom / master / study), a WET room (bathroom / ensuite / wc),
 * and CIRCULATION (hall / corridor) must ALWAYS be enclosed by real partitions —
 * they may never be merged into a shared open zone. This is the hard guarantee
 * that stops the "one 100 m² space labelled Living / Bedroom / Corridor /
 * Bathroom" central-blob defect: a wall between an open-plan-eligible room and a
 * NON-eligible room (or between two non-eligible rooms) is NEVER suppressed,
 * whatever adjacency the bubble/AI graph requests.
 *
 * Pure data lookup; deterministic.
 */
export function isOpenPlanEligible(type: RoomType | string): boolean {
    const t = roomRule(type).type;
    return t === 'living' || t === 'kitchen' || t === 'dining';
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

/**
 * §ADJACENCY-PREFERENCE (2026-05-29, queue #6) — soft preference weight in
 * [0,1] for an adjacency between two room types. Returns the MAX of either
 * direction's preference (i.e. a high preference on either side wins —
 * "kitchen prefers dining" is symmetric with "dining prefers kitchen"). When
 * NEITHER side declares a preference, returns 1.0 (treat as fully required —
 * backward-compatible default; missing fields don't change layout scoring).
 */
export function preferenceBetween(a: RoomType | string, b: RoomType | string): number {
    const ra = roomRule(a), rb = roomRule(b);
    const aToB = ra.adjacencyPreference?.[b as RoomType];
    const bToA = rb.adjacencyPreference?.[a as RoomType];
    if (aToB === undefined && bToA === undefined) return 1.0;
    return Math.max(aToB ?? 0, bToA ?? 0);
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

/** §FURNITURE-SPEC: the door-vector-aware placement specs for an occupancy. The
 *  D-FLE engine will (next round) read sizes + clearances + placement rules
 *  from this list instead of its own per-engine catalogues. Returns [] when
 *  the occupancy has no furniture program (corridor, utility). */
export function furnitureSpecsFor(occupancy: string): readonly FurnitureSpec[] {
    for (const r of Object.values(ROOM_RULES)) {
        if (r.occupancy === occupancy) return r.furnitureSpec;
    }
    return [];
}

/** All room rules, in privacy-gradient order (public → circulation → private → service). */
export const ALL_ROOM_RULES: readonly RoomRule[] = [
    ROOM_RULES.living, ROOM_RULES.kitchen, ROOM_RULES.dining,
    ROOM_RULES.hall, ROOM_RULES.corridor,
    ROOM_RULES.master, ROOM_RULES.bedroom, ROOM_RULES.study,
    ROOM_RULES.bathroom, ROOM_RULES.ensuite, ROOM_RULES.wc,
    ROOM_RULES.utility,
];

// ─── §DOOR-MINIMUMS (A.21.D47, 2026-06-08) ───────────────────────────────────
//
// "Every door needs to have a [minimum] door … and the rules were defined
// earlier." — founder. Two architectural guarantees this section underpins:
//   (1) every habitable/service room is reachable through AT LEAST ONE door
//       (no sealed room) — enforced in wallsAndDoors §SEALED-ROOMS +
//       §CIRCULATION-REROUTE; the WIDTH floor below makes sure the door that
//       reconciliation places is never narrower than the room type can use.
//   (2) every emitted door clears a MINIMUM CLEAR WIDTH per room type — the
//       architectural FLOOR a door must never drop below, even on a short wall.
//
// The pre-existing L3-γ-3 per-EdgeType widths (SOCIAL_FLOW 1.10 / CEREMONIAL
// 1.00 / BUFFER · SERVICE 0.90 / INTIMATE 0.80) set the PREFERRED width by the
// door's architectural role; the values below are the HARD per-room-type floor
// the emission clamps UP to (never a parallel scheme — preferred ≥ floor by
// construction). A wall too short for the floor is a wall the room must not
// door onto (pick a longer wall) — NOT a reason to shrink the door below its
// floor. Values are CLEAR-OPENING widths in metres, from the UK Building Regs
// Part M / Approved Document M accessible-threshold table (the same source the
// area minima cite):
//   • general habitable (bedroom · master · study · living · kitchen · dining ·
//     utility): 0.80 m — the Part M minimum clear width for an internal doorway
//     approached head-on (0.75 m is the absolute floor; 0.80 m is the usable
//     residential standard and what the BUFFER/STANDARD door already emits).
//   • entrance / front door (hall): 0.90 m — a wider arrival leaf (matches the
//     §A.21.D29 entrance-door 1.0 m intent; 0.90 m is its hard floor).
//   • wet rooms (bathroom · ensuite · wc): 0.70 m — the compact-cloakroom floor
//     (Part M permits 0.70 m clear to a WC/shower room); narrower than a
//     habitable door because the room itself is small, but never below 0.70 m.
//
// This is kept as a STANDALONE table + helper (NOT a new RoomRule field) so it
// stays clear of the parallel corridor-rules edits to ROOM_RULES and is trivial
// to merge. Pure data lookup; deterministic.

/** General habitable-room clear-door floor (m) — Part M internal doorway. */
const MIN_DOOR_WIDTH_GENERAL_M = 0.80;
/** Entrance / front-door clear floor (m) — the arrival leaf (§A.21.D29). */
const MIN_DOOR_WIDTH_ENTRANCE_M = 0.90;
/** Compact wet-room clear floor (m) — cloakroom WC / shower room (Part M). */
const MIN_DOOR_WIDTH_WET_M = 0.70;

/**
 * Minimum CLEAR door width (m) for a doorway INTO this room type. The hard
 * architectural floor an emitted door must never drop below. Exhaustive over
 * RoomType (Record enforces a value for every room type at compile time).
 */
export const MIN_DOOR_WIDTH_BY_TYPE: Readonly<Record<RoomType, number>> = {
    // Habitable + service — 0.80 m Part M internal doorway.
    master:   MIN_DOOR_WIDTH_GENERAL_M,
    bedroom:  MIN_DOOR_WIDTH_GENERAL_M,
    living:   MIN_DOOR_WIDTH_GENERAL_M,
    kitchen:  MIN_DOOR_WIDTH_GENERAL_M,
    dining:   MIN_DOOR_WIDTH_GENERAL_M,
    study:    MIN_DOOR_WIDTH_GENERAL_M,
    utility:  MIN_DOOR_WIDTH_GENERAL_M,
    corridor: MIN_DOOR_WIDTH_GENERAL_M,
    // Entrance / arrival — wider leaf.
    hall:     MIN_DOOR_WIDTH_ENTRANCE_M,
    // Wet rooms — compact floor.
    bathroom: MIN_DOOR_WIDTH_WET_M,
    ensuite:  MIN_DOOR_WIDTH_WET_M,
    wc:       MIN_DOOR_WIDTH_WET_M,
};

/** Absolute floor for ANY door (the narrowest a single leaf may ever be), used
 *  for an unknown room-type string. Matches the wet-room compact minimum. */
export const MIN_DOOR_WIDTH_FLOOR_M = MIN_DOOR_WIDTH_WET_M;

/** Minimum clear door width (m) for a doorway into a single room type. Returns
 *  the absolute floor for an unknown string (fallback-safe, like `roomRule`). */
export function minDoorWidthFor(type: RoomType | string): number {
    return (MIN_DOOR_WIDTH_BY_TYPE as Record<string, number>)[type] ?? MIN_DOOR_WIDTH_FLOOR_M;
}

/**
 * §DOOR-MINIMUMS — the minimum clear width (m) a door between two room types
 * must clear. The door serves BOTH rooms, so the floor is the MAX of the two
 * per-room minima (the more-demanding room wins): a corridor↔bathroom door is
 * sized for the corridor's 0.80 m, a hall↔living door for the hall's 0.90 m.
 * Deterministic, pure.
 */
export function minDoorWidthBetween(a: RoomType | string, b: RoomType | string): number {
    return Math.max(minDoorWidthFor(a), minDoorWidthFor(b));
}
