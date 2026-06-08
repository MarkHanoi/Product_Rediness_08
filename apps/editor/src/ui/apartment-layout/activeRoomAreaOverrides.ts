// A.26.3 — Editable Living Graph: session stash for PER-ROOM area overrides.
//
// THE PROBLEM IT SOLVES (sibling to activeDesignParams.ts)
// -------------------------------------------------------
// The Living Graph inspect card sits OUTSIDE the generate call stack. The user
// selects a room IN the graph and edits its AREA; the edit must steer the NEXT
// generate the same way the design sliders do — without a parallel mutator
// (ADR-0061). So the card writes the per-room area override HERE, and
// `gatherLayoutPayload` reads THIS stash and merges it into the program's
// existing `roomAreasByName` field (which the D-TGL bubble graph already honours
// per-instance, clamped to the architectural minimum). The card then fires the
// SAME debounced `triggerApartmentLayout` re-generate the sliders use.
//
// Holds a name-keyed map of absolute target areas (m²). Key = the room's display
// name as the graph shows it ("Master Bedroom", "Bedroom 1", "Kitchen", …),
// which is the deterministic name the bubble graph mints — `roomAreasByName`
// looks up by that name FIRST and silently ignores names that don't match a
// minted room.
//
// EMPTY stash ⇒ no override ⇒ the payload's program is unchanged ⇒ generation
// reproduces the byte-identical baseline (ADR-0061 invariant I2). Typology-
// agnostic: pure { name → m² } numbers.

/** name → absolute target area (m²). Empty ⇒ no override. */
let _overrides: Record<string, number> = {};

/** Set (or clear) the area override for one room by its display name. A
 *  non-finite / non-positive value CLEARS the override for that name (so an
 *  edit back to blank/zero reverts to the engine default for that room). */
export function setRoomAreaOverride(roomName: string, areaM2: number | null | undefined): void {
    const name = (roomName ?? '').trim();
    if (!name) return;
    if (typeof areaM2 === 'number' && Number.isFinite(areaM2) && areaM2 > 0) {
        _overrides = { ..._overrides, [name]: areaM2 };
        console.log('[room-area-override] set', name, '→', areaM2, 'm²');
    } else if (name in _overrides) {
        const next = { ..._overrides };
        delete next[name];
        _overrides = next;
        console.log('[room-area-override] cleared', name);
    }
}

/** The current per-room area overrides, or null when NONE are set. Returns null
 *  (not an empty object) for the no-override case so callers can cleanly omit
 *  the field — keeping the baseline-identity invariant (I2) obvious. */
export function getRoomAreaOverrides(): Record<string, number> | null {
    return Object.keys(_overrides).length > 0 ? { ..._overrides } : null;
}

/** The override for a single room name, or undefined when unset. */
export function getRoomAreaOverride(roomName: string): number | undefined {
    return _overrides[(roomName ?? '').trim()];
}

/** Clear every override (e.g. project close / re-onboard / Rerun). */
export function clearRoomAreaOverrides(): void {
    _overrides = {};
}
