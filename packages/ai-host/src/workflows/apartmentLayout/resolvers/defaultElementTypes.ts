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

/**
 * §LIVING-PATIO-TYPE (founder 2026-06-11) — the product id for the living
 * room's full-height glazed SLIDING / PATIO door.
 *
 * v159 already SIZED the living "window" as a full-height patio door (sill
 * 10 mm, 2.19 m tall — WINDOW_SPECS.living, a glazed wall), but its product
 * TYPE still resolved to the generic `wt-timber-casement`, so the editor +
 * schedules showed a small casement product against a patio-door geometry.
 *
 * The window catalogue (geometry-window/WindowSystemTypeStore.ts) has no
 * dedicated "sliding-door" leaf, so we tag the living glazing with the
 * closest glazed-wall-grade product it DOES carry: `wt-aluminium-triple-
 * glazed` — a slim aluminium frame over a full glass infill, which is exactly
 * how a residential sliding patio set reads (and the energy spec a glazed
 * wall needs). When a true `wt-sliding-door` product lands in the catalogue
 * this constant is the single place to repoint it. */
export const LIVING_PATIO_WINDOW_TYPE_ID = 'wt-aluminium-triple-glazed';

/**
 * §ENTRANCE-DOOR-TYPE (founder 2026-06-11; modern-entrance 2026-06-22) — the
 * product id for the apartment's FRONT / main entrance door
 * (hall/corridor ↔ building exterior).
 *
 * The door catalogue (geometry-door/DoorSystemTypeStore.ts) now carries a
 * dedicated high-end residential entrance leaf — `dt-modern-entrance-glazed`:
 * a wide warm-timber frame, a horizontal-slat leaf, a long vertical bar
 * handle, and a fixed GLAZED SIDELIGHT beside the leaf (the correct premium
 * front-door reading for a dwelling). Generated houses get this modern glazed
 * entrance automatically. Single place to repoint should a future
 * `dt-external-entrance` product land. */
export const ENTRANCE_DOOR_TYPE_ID = 'dt-modern-entrance-glazed';

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

/**
 * §ENTRANCE-DOOR-TYPE — the FRONT / main entrance door resolves to a dedicated
 * EXTERNAL entrance leaf, NOT an interior pair finish.
 *
 * The entrance connects the hall/corridor to the building EXTERIOR; the
 * interior `defaultDoorSystemTypeId(hall, hall)` proxy used before fell through
 * to the generic interior solid-timber leaf, blurring the entrance with an
 * interior door in the schedule. This resolver is the explicit, documented
 * entrance default (`ENTRANCE_DOOR_TYPE_ID`); it ignores room type because the
 * entrance is exterior-facing by definition, so any hall/corridor entrance gets
 * the same heavy external leaf. Single place to repoint to a future
 * `dt-external-entrance` product. */
export function defaultEntranceDoorSystemTypeId(): string {
    return ENTRANCE_DOOR_TYPE_ID;
}

/** Companion to `defaultEntranceDoorSystemTypeId` — human-readable reason. */
export function defaultEntranceDoorReason(): string {
    return 'main external entrance (modern glazed timber leaf + sidelight)';
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
    // §WINDOWS-ALWAYS-TIMBER (founder 2026-06-16: "always windows should be timber").
    // Every window's FRAME is timber — the residential material the founder wants
    // throughout. The catalogue carries only two timber products (wt-timber-casement,
    // wt-timber-double-hung) — no timber tilt-turn / sliding / uPVC-grade variant — so
    // every room resolves to `wt-timber-casement` (the versatile timber default). The
    // per-room INTENT that used to pick a non-timber frame is preserved as a separate
    // spec, NOT a frame material: wet-room obscure GLAZING, kitchen over-sink
    // VENTILATION, and the living full-height PATIO sizing are glazing/operation/size
    // properties layered on the timber frame, not a reason to ship uPVC/aluminium.
    // (When the catalogue gains timber tilt-turn / sliding-patio products, re-map those
    // two rooms to them; the frame stays timber regardless.)
    bathroom: { windowTypeId: 'wt-timber-casement', reason: 'wet-room timber casement (obscure glazing in spec)' },
    ensuite:  { windowTypeId: 'wt-timber-casement', reason: 'wet-room timber casement (obscure glazing in spec)' },
    wc:       { windowTypeId: 'wt-timber-casement', reason: 'wet-room timber casement (obscure glazing in spec)' },
    utility:  { windowTypeId: 'wt-timber-casement', reason: 'utility timber casement (durable timber frame)' },

    // Kitchen — timber casement (over-sink ventilation is an operation/glazing spec;
    // no timber tilt-turn product in the catalogue yet → timber casement).
    kitchen:  { windowTypeId: 'wt-timber-casement', reason: 'kitchen timber casement (over-sink ventilation in spec)' },

    // §LIVING-PATIO-TYPE — living = full-height glazed PATIO sizing (v159: sill 10 mm,
    // ~2.19 m tall, a glazed wall). The SIZE/geometry stays a glazed wall; the FRAME is
    // timber per the founder directive (no timber sliding-patio product yet → the timber
    // casement type carries the full-height glazed unit on its patio dims).
    living:   { windowTypeId: 'wt-timber-casement', reason: 'living full-height glazed timber (patio sizing in spec)' },

    // Dining + bedrooms + study — heritage timber casement, the residential default.
    dining:   { windowTypeId: 'wt-timber-casement', reason: 'dining timber casement' },
    bedroom:  { windowTypeId: 'wt-timber-casement', reason: 'bedroom timber casement' },
    master:   { windowTypeId: 'wt-timber-casement', reason: 'master timber casement' },
    study:    { windowTypeId: 'wt-timber-casement', reason: 'study timber casement' },

    // Hall + corridor — timber casement (timber frame throughout; rarely on a façade).
    hall:     { windowTypeId: 'wt-timber-casement', reason: 'hall timber casement' },
    corridor: { windowTypeId: 'wt-timber-casement', reason: 'corridor timber casement' },
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
