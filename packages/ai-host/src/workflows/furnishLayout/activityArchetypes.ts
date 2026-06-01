// F4.1 — Activity-archetype data model (SPEC-FURNITURE-LAYOUT-ENGINE §F4 /
// APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §2 / §Z.10 Tier 9).
//
// Plan §1 Cat D — "missing architectural activity system": multiple objects
// composed into a coherent function. Today the living-room archetype already
// places TV + TV unit (F1.3) via the 'media' group + leader/beside pairing,
// but as two independent FurnitureItemSpec entries — not a NAMED COMPOSED
// activity system that downstream tooling (Family Platform P0, AI hints,
// schedules, IFC-α exports) can refer to as a single semantic unit.
//
// This module introduces the activity-archetype data structure and the FIRST
// concrete instance — S1 Media Wall. The placement solver does NOT consume
// this yet (that's F4.1b); the existing archetype 'media' group continues to
// produce the build. The data here is forward-compatible scaffolding that
// (a) gives downstream callers a single source of truth for "what objects
// constitute system X" and (b) lets the living-room archetype self-declare
// `activitySystems: ['media-wall']` so the intent is discoverable.
//
// PURE: zero THREE, zero DOM, zero I/O. Sibling-only imports.

import type { FurnitureKind } from './types.js';

// ── Kind union ─────────────────────────────────────────────────────────────

/** The seven master-plan activity systems (SPEC §F4.1–F4.7).
 *  Only S1 (media-wall) is realised in this slice; the rest are stubs that
 *  future F4.x slices will populate. The union is exhaustive so a `switch`
 *  on `ActivitySystemKind` flags any new system at compile time. */
export type ActivitySystemKind =
    | 'media-wall'           // S1 — living-room TV composition
    | 'entry-storage'        // S2 — hall console / shoe / bench / mirror
    | 'study-workstation'    // S3 — desk + chair + storage
    | 'bathroom-vanity'      // S4 — vanity unit + mirror + towel rail
    | 'utility-laundry'      // S5 — washer + dryer + cabinet + sink
    | 'bedroom-dressing'     // S6 — dresser + vanity table
    | 'window-dressing';     // S7 — curtain rod + panels

// ── Member roles ───────────────────────────────────────────────────────────

/** Architectural role each member plays inside an activity system.
 *  - `primary`   — the system's reason for existing (the TV, the desk, the bed).
 *  - `anchor`    — the wall/floor furniture the primary lives ON or ABOVE
 *                  (TV unit beneath the TV; vanity unit beneath the mirror).
 *  - `companion` — flanking/supporting items that complete the composition
 *                  but the system reads cleanly without them.
 *  - `optional`  — fully discretionary; included only for rich rooms. */
export type ActivityMemberRole = 'primary' | 'anchor' | 'companion' | 'optional';

/** Hint to the placement solver about WHERE a member sits relative to the
 *  anchor. The solver is free to ignore the hint when the geometry won't
 *  accept it; the field is documentation + a target for the F4.1b solver. */
export type ActivityRelPosition = 'beside' | 'above' | 'below' | 'opposite';

export interface ActivityMember {
    readonly kind: FurnitureKind;
    readonly role: ActivityMemberRole;
    /** false = architecturally desirable but skippable in tight rooms. */
    readonly required: boolean;
    readonly relPositionHint?: ActivityRelPosition;
}

// ── Anchor strategies ──────────────────────────────────────────────────────

/** How the activity system picks its anchor wall/zone in the host room.
 *  Mirrors `Anchor` from types.ts but at the SYSTEM level (one strategy per
 *  archetype, vs. per-item). The future F4.1b solver consumes this. */
export type ActivityAnchorStrategy =
    | { readonly strategy: 'wall-opposite-door' }
    | { readonly strategy: 'wall-opposite-room-feature'; readonly feature: 'sofa' | 'bed' | 'sink' }
    | { readonly strategy: 'longest-free-wall' }
    | { readonly strategy: 'window-wall' }
    | { readonly strategy: 'corner' };

// ── ActivityArchetype ──────────────────────────────────────────────────────

export interface ActivityArchetype {
    readonly id: ActivitySystemKind;
    /** Human-readable label for UI surfaces (modal annotations, schedules). */
    readonly label: string;
    /** Architect-facing rationale — appears in tooltips + audit logs. */
    readonly description: string;
    readonly members: ReadonlyArray<ActivityMember>;
    readonly anchor: ActivityAnchorStrategy;
    /** Minimum host-room area (m²) below which the system is skipped. */
    readonly minAreaM2?: number;
    /** Maximum host-room area (m²) above which a richer variant should
     *  be preferred — soft hint, not a hard ceiling. */
    readonly maxAreaM2?: number;
}

// ── S1 Media Wall (the only realised system in this slice) ─────────────────

/** S1 — TV / Media Wall.
 *
 *  Composition (architect's intent, plan §2):
 *    • TV         — the primary display surface (wall-mounted, ~1.4 m TWAB).
 *    • TV unit    — low cabinet beneath, holds AV gear + cable runs.
 *    • Bookshelf  — optional flanking storage (open shelving each side).
 *    • Wall art   — optional accent above/around (gallery pairing).
 *
 *  Anchor strategy: the wall OPPOSITE the sofa. The TV faces seated
 *  viewers across the coffee-table axis. (When the sofa wall hasn't been
 *  chosen yet — solver invocation order — the F4.1b solver falls back to
 *  'wall-opposite-door' via the existing FurnitureItemSpec.) */
export const MEDIA_WALL: ActivityArchetype = {
    id: 'media-wall',
    label: 'TV / Media Wall',
    description:
        'Composed display surface — TV, console, optional shelving and soundbar.',
    members: [
        { kind: 'tv',         role: 'primary',   required: true },
        { kind: 'tv_unit',    role: 'anchor',    required: true,  relPositionHint: 'below' },
        { kind: 'bookshelf',  role: 'companion', required: false, relPositionHint: 'beside' },
        { kind: 'wall_art',   role: 'companion', required: false, relPositionHint: 'above' },
    ],
    anchor: { strategy: 'wall-opposite-room-feature', feature: 'sofa' },
    minAreaM2: 12,
    maxAreaM2: 60,
};

// ── Registry + helpers ─────────────────────────────────────────────────────

/** All activity archetypes keyed by their kind. Future F4.x slices populate
 *  the missing entries — for now only MEDIA_WALL is realised. The Partial<>
 *  is intentional: `getActivityArchetype` returns `undefined` for stubs. */
export const ACTIVITY_ARCHETYPES: Readonly<Partial<Record<ActivitySystemKind, ActivityArchetype>>> = {
    'media-wall': MEDIA_WALL,
};

/** Lookup helper. Returns `undefined` for kinds that haven't shipped yet. */
export function getActivityArchetype(kind: ActivitySystemKind): ActivityArchetype | undefined {
    return ACTIVITY_ARCHETYPES[kind];
}

/** Flatten an activity archetype's members into a placement-engine-ready
 *  furniture-request list. By default returns ONLY required members
 *  (the minimal architectural composition); pass `includeOptional: true`
 *  to include companions for richer rooms.
 *
 *  The shape is intentionally minimal — `{ kind, required }` — so the
 *  F4.1b solver can splice these into the existing FurnitureItemSpec
 *  pipeline without a wider refactor. */
export function activityMembersAsFurnitureRequests(
    arch: ActivityArchetype,
    opts?: { readonly includeOptional?: boolean },
): ReadonlyArray<{ readonly kind: FurnitureKind; readonly required: boolean }> {
    const includeOptional = opts?.includeOptional === true;
    const out: Array<{ kind: FurnitureKind; required: boolean }> = [];
    for (const m of arch.members) {
        if (!m.required && !includeOptional) continue;
        out.push({ kind: m.kind, required: m.required });
    }
    return out;
}
