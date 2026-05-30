// T1.D — Per-room default door + window system-type resolvers (PURE).
// (MATRIX §D + memory queue `ai-creation-default-element-types`.)
//
// Today the apartment generator stamps EVERY interior door with the same
// `solid-timber` finish and (transitively, via the window-emission engine
// when it lands) every window with the same `timber-casement`. The matrix
// + the user-supplied queue both say: wet rooms want privacy doors, kitchens
// want ventilation windows, etc.
//
// This file ships the PURE resolvers + their data table. It is consumed by:
//   - The apartment-layout wiring layer (one follow-on slice: replace the
//     single global `stampDoorSysType` in executePlan.ts with a per-door
//     call to `defaultDoorSystemTypeId(roomA, roomB)`).
//   - The window-emission engine (T1.W, not yet shipped) — same pattern:
//     per-room call to `defaultWindowSystemTypeId(room)`.
//
// Design rules:
//   • Pure data + functions. ZERO imports beyond the room-type union.
//   • Door ID resolution takes the UNORDERED pair (a ↔ b) and consults a
//     priority order — the WETTER / MORE-PRIVATE side wins (a bedroom door
//     to a hall is a privacy door regardless of which side you call "a").
//   • Returned IDs match the LIVE DoorSystemTypeStore / WindowSystemTypeStore
//     built-in IDs ('dt-*' / 'wt-*'). A returned id that the store doesn't
//     recognise would be rejected at command dispatch — so this table is
//     pinned by id-existence tests against the catalogue.
//
// Fallback: when neither side matches a priority slot, both resolvers return
// the canonical default (solid-timber door / timber-casement window) — the
// same finish the editor itself picks when the user clicks the tool.

import type { RoomType } from '../types.js';

// ── Canonical defaults ──────────────────────────────────────────────────────

/** Editor default door (matches DoorTool.ts:74). */
export const DEFAULT_DOOR_TYPE_ID = 'dt-solid-timber';

/** Editor default window (matches WindowTool.ts:69). */
export const DEFAULT_WINDOW_TYPE_ID = 'wt-timber-casement';

// ── Door resolver ──────────────────────────────────────────────────────────

/**
 * Per-room-pair door defaults — priority-ordered. The FIRST entry whose
 * room-type set matches one side of the (a, b) pair wins. The pair is
 * unordered.
 *
 * Order matters: the most specific / strongest privacy rules come first so
 * a bedroom-to-bathroom door picks the bathroom privacy finish, not the
 * bedroom one.
 *
 * Catalogue source: packages/geometry-door/src/DoorSystemTypeStore.ts:101+.
 */
const DOOR_DEFAULTS_BY_TYPE: ReadonlyArray<{
    readonly types: ReadonlySet<RoomType>;
    readonly doorTypeId: string;
    readonly reason: string;
}> = [
    // 1. Wet-room privacy — flush white-primed door for easy clean + visual
    //    distinction from the timber leaves in the living spaces.
    { types: new Set(['bathroom', 'ensuite', 'wc']), doorTypeId: 'dt-white-primed',
      reason: 'wet-room privacy (flush white-primed)' },
    // 2. Utility — same flush primed door as wet rooms; a workshop reading.
    { types: new Set(['utility']),                   doorTypeId: 'dt-white-primed',
      reason: 'utility flush primed' },
    // 3. Kitchen → living/dining — half-light glazed timber so the cook
    //    keeps sight to the social space.
    { types: new Set(['kitchen']),                   doorTypeId: 'dt-glazed-timber',
      reason: 'kitchen half-light glazed' },
    // (Remaining pairs fall through to the canonical solid-timber default.)
];

/**
 * Resolves the door system-type id for an interior door between rooms of
 * types `a` and `b`. Pair is unordered. Falls back to the editor default
 * (solid timber) when no rule matches.
 *
 * For the apartment generator's CURRENT door set (corridor↔bedroom,
 * corridor↔bathroom, master↔ensuite, hall↔living, etc.):
 *   • Any door TO a bathroom / ensuite / wc → white-primed (privacy)
 *   • Any door TO a kitchen → glazed-timber (sight line)
 *   • Anything else → solid-timber (warm residential)
 */
export function defaultDoorSystemTypeId(a: RoomType, b: RoomType): string {
    for (const rule of DOOR_DEFAULTS_BY_TYPE) {
        if (rule.types.has(a) || rule.types.has(b)) return rule.doorTypeId;
    }
    return DEFAULT_DOOR_TYPE_ID;
}

/** Companion to `defaultDoorSystemTypeId` — exposes the human-readable
 *  reason for the door pick, used by the future modal door-defaults badge
 *  (T1.D follow-on). Returns 'editor default' when nothing matches. */
export function defaultDoorReason(a: RoomType, b: RoomType): string {
    for (const rule of DOOR_DEFAULTS_BY_TYPE) {
        if (rule.types.has(a) || rule.types.has(b)) return rule.reason;
    }
    return 'editor default (solid timber)';
}

// ── Window resolver ────────────────────────────────────────────────────────

/**
 * Per-room window defaults — single-room mapping (a window belongs to
 * exactly one interior room; the other side is the building exterior).
 *
 * Catalogue source: packages/geometry-window/src/WindowSystemTypeStore.ts:101+.
 */
const WINDOW_DEFAULTS_BY_TYPE: Readonly<Partial<Record<RoomType, {
    readonly windowTypeId: string;
    readonly reason: string;
}>>> = {
    // Wet rooms — uPVC casement: privacy-friendly, easy clean, condensation-
    // tolerant. Closest fit in today's catalogue (no dedicated obscure-glazed
    // variant yet — that's a future catalogue extension).
    bathroom: { windowTypeId: 'wt-upvc-casement', reason: 'wet-room privacy (uPVC, obscure glazing in spec)' },
    ensuite:  { windowTypeId: 'wt-upvc-casement', reason: 'wet-room privacy (uPVC, obscure glazing in spec)' },
    wc:       { windowTypeId: 'wt-upvc-casement', reason: 'wet-room privacy (uPVC, obscure glazing in spec)' },
    utility:  { windowTypeId: 'wt-upvc-casement', reason: 'utility uPVC (durable, low-maintenance)' },

    // Kitchen — uPVC tilt-turn for over-sink ventilation without sash hardware
    // obstructing the worktop.
    kitchen:  { windowTypeId: 'wt-upvc-tilt-turn', reason: 'kitchen tilt-turn (over-sink ventilation)' },

    // Living + dining + bedrooms + study — heritage timber casement is the
    // residential default. Same finish as the editor's default — only listed
    // here for the modal-badge reason text.
    living:   { windowTypeId: 'wt-timber-casement', reason: 'living timber casement' },
    dining:   { windowTypeId: 'wt-timber-casement', reason: 'dining timber casement' },
    bedroom:  { windowTypeId: 'wt-timber-casement', reason: 'bedroom timber casement' },
    master:   { windowTypeId: 'wt-timber-casement', reason: 'master timber casement' },
    study:    { windowTypeId: 'wt-timber-casement', reason: 'study timber casement' },

    // Hall + corridor — single-pane utilitarian (rarely on a façade, but
    // covered for completeness).
    hall:     { windowTypeId: 'wt-single-pane', reason: 'hall single-pane (utilitarian)' },
    corridor: { windowTypeId: 'wt-single-pane', reason: 'corridor single-pane (utilitarian)' },
};

/**
 * Resolves the window system-type id for a window belonging to a room of
 * type `roomType`. Falls back to the editor default (timber casement) when
 * the room type is unknown.
 */
export function defaultWindowSystemTypeId(roomType: RoomType): string {
    return WINDOW_DEFAULTS_BY_TYPE[roomType]?.windowTypeId ?? DEFAULT_WINDOW_TYPE_ID;
}

/** Companion to `defaultWindowSystemTypeId` — human-readable reason text. */
export function defaultWindowReason(roomType: RoomType): string {
    return WINDOW_DEFAULTS_BY_TYPE[roomType]?.reason ?? 'editor default (timber casement)';
}
