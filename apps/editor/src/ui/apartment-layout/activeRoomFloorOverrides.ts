// XFLOOR-GRAPH XA — Cross-floor Living Graph: session stash for PER-ROOM FLOOR
// (storey) overrides. The third sibling of `activeRoomAreaOverrides.ts` (AREA)
// and `activeRoomTypeOverrides.ts` (TYPE) — this one re-assigns which STOREY a
// room instance lives on, so the concatenated cross-floor graph can "move a
// bedroom from upstairs to downstairs" (SPEC §9.4a / X3).
//
// THE PROBLEM IT SOLVES
// ---------------------
// Room→storey assignment in the house engine is by COUNT, not by named instance
// (`allocateProgramToStoreys` splits the whole-house program into per-storey
// programs purely by integer room counts). There is NO per-instance "which floor
// does Bedroom 2 live on" field today. To express a cross-floor move WITHOUT a
// parallel mutator (C52 §3.4 / ADR-0061), the modal graph writes the move HERE,
// and the controller reads THIS stash and merges it into the program's new
// `roomFloorByName` field before re-running the SAME deterministic house engine.
//
// THE KEY — STOREY-QUALIFIED NODE ID (the one place this diverges from the
// area/type stashes). Room display names are unique WITHIN a storey but NOT
// across storeys (a "Bathroom" can exist on the ground AND the first floor). The
// area/type stashes are single-storey (apartment) so a bare name is unambiguous
// there; the house override is whole-house, so a bare "Bathroom" key would be
// ambiguous. The concatenated graph mints node ids as `storey:<s>/<roomName>`
// (SPEC §9.3) — unique across the whole house — so we key on THAT node id. The
// orchestrator resolves the room TYPE from the name and the SOURCE storey from
// the `storey:<s>/` prefix, then moves one count of that type to the target.
//
// EMPTY stash ⇒ no override ⇒ the program carries no `roomFloorByName` ⇒ the
// allocator's count-split is unchanged ⇒ byte-identical baseline (C52 I2 /
// ADR-0061). Apartment (single storey) is structurally unaffected — storeyCount
// = 1 has no other storey to move a room to.

/** Storey-qualified node id (`storey:<s>/<roomName>`) → target storey index
 *  (0 = ground). Empty ⇒ no override. */
let _overrides: Record<string, number> = {};

/** Set (or clear) the floor override for one room INSTANCE by its storey-
 *  qualified graph node id (e.g. `"storey:1/Bedroom 2"`). A non-finite /
 *  negative target, or `null`, CLEARS the override for that node id (so dragging
 *  a node back to its own lane reverts to the engine default). */
export function setRoomFloorOverride(nodeId: string, storeyIndex: number | null | undefined): void {
    const id = (nodeId ?? '').trim();
    if (!id) return;
    if (typeof storeyIndex === 'number' && Number.isFinite(storeyIndex) && storeyIndex >= 0) {
        const idx = Math.floor(storeyIndex);
        _overrides = { ..._overrides, [id]: idx };
        console.log('[room-floor-override] set', id, '→ storey', idx);
    } else if (id in _overrides) {
        const next = { ..._overrides };
        delete next[id];
        _overrides = next;
        console.log('[room-floor-override] cleared', id);
    }
}

/** The current per-room floor overrides, or null when NONE are set. Returns null
 *  (not an empty object) for the no-override case so callers can cleanly OMIT the
 *  field — keeping the baseline-identity invariant (C52 I2) obvious. */
export function getRoomFloorOverrides(): Record<string, number> | null {
    return Object.keys(_overrides).length > 0 ? { ..._overrides } : null;
}

/** The target storey for a single node id, or undefined when unset. */
export function getRoomFloorOverride(nodeId: string): number | undefined {
    return _overrides[(nodeId ?? '').trim()];
}

/** Clear every floor override (e.g. project close / re-onboard / Rerun). */
export function clearRoomFloorOverrides(): void {
    _overrides = {};
}
