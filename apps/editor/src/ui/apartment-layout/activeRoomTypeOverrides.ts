// A.26.4 — Editable Living Graph: session stash for PER-ROOM TYPE (occupancy)
// overrides. The direct sibling of activeRoomAreaOverrides.ts (A.26.3).
//
// THE PROBLEM IT SOLVES
// ---------------------
// The Living Graph inspect card lets the user re-type a DETECTED room — "make
// Bedroom 2 a Study". That edit must steer the NEXT generate the same way the
// AREA edit does (ADR-0061 / C52: no parallel mutator, one engine). So the card
// writes the per-room type override HERE; `gatherLayoutPayload` reads THIS stash
// and merges it into the program's `roomTypesByName` field, which the D-TGL
// bubble graph honours by re-typing the minted room of that name (re-deriving its
// area weight / minima / habitability / adjacency rules from the new type — via
// the single-source-of-truth `roomRule`). The card then fires the SAME debounced
// `triggerApartmentLayout` re-generate the AREA edit + the A.25 sliders use.
//
// Holds a name-keyed map of RoomType strings keyed by the room's display name as
// the graph shows it ("Master Bedroom", "Bedroom 2", "Kitchen", …) — the
// deterministic name the bubble graph mints + looks up by. Names that don't match
// a minted room, or values that aren't a real RoomType, are silently ignored by
// the engine.
//
// EMPTY stash ⇒ no override ⇒ the payload's program omits `roomTypesByName` ⇒
// generation reproduces the byte-identical baseline (ADR-0061 invariant I2).
// Typology-agnostic: pure { name → type } strings.

/** The room-type vocabulary the D-TGL engine accepts (mirror of ai-host
 *  `RoomType`). Kept as a local const so the editor stash carries no L2 import
 *  at module load (the editor already imports `@pryzm/ai-host` types lazily in
 *  `gatherLayoutPayload`); the validity check below is purely a UX guard — the
 *  engine re-validates and ignores anything it doesn't recognise. */
export const ROOM_TYPE_VALUES = [
    'master', 'bedroom', 'living', 'kitchen', 'dining',
    'bathroom', 'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility',
] as const;
export type RoomTypeValue = (typeof ROOM_TYPE_VALUES)[number];

/** True when `v` is a RoomType the engine accepts. */
export function isRoomTypeValue(v: string): v is RoomTypeValue {
    return (ROOM_TYPE_VALUES as readonly string[]).includes(v);
}

/** name → RoomType string. Empty ⇒ no override. */
let _overrides: Record<string, RoomTypeValue> = {};

/** Set (or clear) the type override for one room by its display name. A blank /
 *  unknown value CLEARS the override for that name (so an edit back to the
 *  detected default reverts that room to the engine's flag-derived type). */
export function setRoomTypeOverride(roomName: string, type: string | null | undefined): void {
    const name = (roomName ?? '').trim();
    if (!name) return;
    if (typeof type === 'string' && isRoomTypeValue(type)) {
        _overrides = { ..._overrides, [name]: type };
        console.log('[room-type-override] set', name, '→', type);
    } else if (name in _overrides) {
        const next = { ..._overrides };
        delete next[name];
        _overrides = next;
        console.log('[room-type-override] cleared', name);
    }
}

/** The current per-room type overrides, or null when NONE are set. Returns null
 *  (not an empty object) for the no-override case so callers can cleanly omit the
 *  field — keeping the baseline-identity invariant (I2) obvious. */
export function getRoomTypeOverrides(): Record<string, RoomTypeValue> | null {
    return Object.keys(_overrides).length > 0 ? { ..._overrides } : null;
}

/** The override for a single room name, or undefined when unset. */
export function getRoomTypeOverride(roomName: string): RoomTypeValue | undefined {
    return _overrides[(roomName ?? '').trim()];
}

/** Clear every override (e.g. project close / re-onboard / Rerun). */
export function clearRoomTypeOverrides(): void {
    _overrides = {};
}
