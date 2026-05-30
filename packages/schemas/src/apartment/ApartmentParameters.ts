// D-α-0 (BIM 2/3 §6 — Workstream D-α-0) — L0 building-graph parameter schemas.
//
// The user-editable PARAMETERS of an apartment + its rooms, distinct from the
// derived geometry. These are the data nodes the Data Management Panel
// edits; the geometry is RE-DERIVED from them by the apartment-solver (D-α-3).
//
// Pure Zod. Lives in @pryzm/schemas/apartment (L0 of the layered model) —
// no I/O, no THREE, no DOM, no commands. Stores (L3) consume these; commands
// (L4) dispatch updates to them; the propagation engine (L2) re-solves
// downstream.
//
// References:
//   - APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md §3
//     (L0 Node Vocabulary)
//   - APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md §3
//     (the cognition-stack typing for these nodes)
//   - APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-
//     2026-05-29.md (G1-G10 thresholds the constraints reference)

import { z } from 'zod';

// ── Apartment typology + room-type enums (mirrors ai-host RoomType) ──────────

/** Architectural typology — drives default constraint thresholds + furniture
 *  archetypes. Aligns with the AI prompt's "open-plan" / "compact" hints. */
export const ApartmentTypology = z.enum([
    'open-plan-mid-rise',
    'closed-plan-mid-rise',
    'compact-studio',
    'duplex',
    'penthouse',
]);
export type ApartmentTypology = z.infer<typeof ApartmentTypology>;

/** Room type — duplicates the ai-host RoomType union so schemas don't depend
 *  on the workflow package. Source of truth: this file (L0 → ai-host imports
 *  it at L2 when needed). */
export const RoomType = z.enum([
    'master', 'bedroom', 'living', 'kitchen', 'dining',
    'bathroom', 'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility',
]);
export type RoomType = z.infer<typeof RoomType>;

// ── Parameter envelopes ──────────────────────────────────────────────────────

/** Numeric parameter with a hard envelope. Outside [min, max] the parameter
 *  is REJECTED; inside, the propagation engine re-solves. Used for area,
 *  width, depth — everything dimensional. All metres / square metres. */
export const ParameterEnvelope = z.object({
    /** Current value. Always finite + non-negative. */
    value: z.number().finite().nonnegative(),
    /** Hard lower bound. Edits below this fail validation. */
    min:   z.number().finite().nonnegative(),
    /** Hard upper bound. Edits above this fail validation. Use
     *  `Number.POSITIVE_INFINITY` for "no upper bound". */
    max:   z.number().finite().nonnegative().or(z.literal(Number.POSITIVE_INFINITY)),
}).refine(p => p.min <= p.value && p.value <= p.max, {
    message: 'value must be within [min, max]',
});
export type ParameterEnvelope = z.infer<typeof ParameterEnvelope>;

// ── Apartment-scope parameters ───────────────────────────────────────────────

/**
 * Top-level apartment parameters. The editable "what does the user actually
 * want" record — distinct from the derived geometry (which lives on the
 * walls/openings/spaces in the existing stores).
 *
 * The shellAreaM2 here is the TARGET; the realised shell area (from the
 * drawn perimeter) may differ slightly. The propagation engine resolves the
 * mismatch by adjusting room targets, not the shell.
 */
export const ApartmentParameters = z.object({
    /** Per-apartment unique id (matches the apartment instance in the
     *  multi-apartment floor-plate brief; for single-apartment shells this is
     *  the project's apartment id). */
    id: z.string().min(1),

    /** Target shell area envelope. The D2.4 envelope validator HARD-rejects
     *  shells outside this band. */
    shellAreaM2: ParameterEnvelope,

    /** Bedroom count (master + secondary). Drives the room program. */
    bedrooms: z.number().int().min(0).max(8),

    /** Bathroom count (en-suite + main). Drives the program. */
    bathrooms: z.number().int().min(0).max(8),

    /** Is the master bedroom en-suited? Default true for ≥ 2-bed apartments. */
    masterEnSuite: z.boolean(),

    /** Open-plan kitchen + dining? Drives whether walls partition them. */
    openPlanKitchenDining: z.boolean(),

    /** Does the apartment have a separate living room? `false` only for
     *  compact studios where the living merges with the bedroom. */
    livingRoom: z.boolean(),

    /** Does the apartment have an entrance hall? `false` for studios where
     *  the front door opens directly into the main space. */
    entranceHall: z.boolean(),

    /** Architectural typology — drives default constraint thresholds. */
    typology: ApartmentTypology,
});
export type ApartmentParameters = z.infer<typeof ApartmentParameters>;

// ── Room-scope parameters ────────────────────────────────────────────────────

/**
 * Per-room parameters. The Room Data panel edits these (panel B). Geometry
 * (rectangle, polygon, host walls) is re-derived from these by the
 * apartment-solver — the user never edits rectangles directly post-execute.
 *
 * `name` is the user-visible label ("Master Bedroom", "Sleeping Bedroom 2");
 * `type` is the semantic kind (RoomType). Either MAY change post-execute
 * (renaming or retyping the room — e.g. converting "Study" to "Bedroom 3").
 */
export const RoomParameters = z.object({
    /** Stable room id (matches the bubble-graph LayoutRoom.id). */
    id: z.string().min(1),

    /** Apartment this room belongs to. Foreign key to ApartmentParameters.id. */
    apartmentId: z.string().min(1),

    /** Semantic room kind. */
    type: RoomType,

    /** Display name. Free text — but the auto-namer suggests one. */
    name: z.string().min(1),

    /** Floor area envelope. The G1 max-area validator HARD-rejects values
     *  above the typology-derived max; the user's hand-edit can override
     *  within the envelope. */
    areaM2: ParameterEnvelope,

    /** Minimum wall-side length envelope (the room's narrowest dimension).
     *  G2 width-max enforces an upper bound (a 1.8 m × 6 m bedroom-as-
     *  corridor is rejected). */
    widthM:  ParameterEnvelope,
    /** Depth envelope (the perpendicular dimension). */
    depthM:  ParameterEnvelope,

    /** Daylight requirement. Habitable rooms (living, dining, kitchen,
     *  bedroom, master, study) are `true` by default; service rooms
     *  (corridor, hall, utility) `false`. */
    daylightRequired: z.boolean(),

    /** Privacy depth tier (1 = entry-adjacent, 4 = master/ensuite depth).
     *  Drives the hierarchy axis + the L2-β-1 privacy-gradient validator. */
    privacyTier: z.number().int().min(1).max(4),

    /** Optional acoustic isolation requirement (master bedroom shares walls
     *  with no living-room speaker side). True ⇒ T2.3 acoustic validator
     *  enforces. */
    acousticIsolation: z.boolean().optional(),
});
export type RoomParameters = z.infer<typeof RoomParameters>;

// ── Validation helpers ──────────────────────────────────────────────────────

/** Type-guard: is this value an apartment parameter record? */
export const isApartmentParameters = (v: unknown): v is ApartmentParameters =>
    ApartmentParameters.safeParse(v).success;

/** Type-guard: is this value a room parameter record? */
export const isRoomParameters = (v: unknown): v is RoomParameters =>
    RoomParameters.safeParse(v).success;
