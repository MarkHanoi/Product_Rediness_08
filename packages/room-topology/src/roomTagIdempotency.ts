// §A.21.D25 — Pure room-tag idempotency decision.
//
// Extracted from RoomTagAutoPopulator so the "is this tag already correct?"
// decision can be unit-tested WITHOUT pulling in THREE / command-registry.
// This is the guard that stops the plan-view re-projection feedback loop: a
// settled view must produce NO annotation writes, so the projection driver
// (onReprojectionNeeded → populate) cannot feed itself a store event that
// re-dirties + re-projects the same view forever.

/** The subset of a live detected room the tag mirrors. */
export interface RoomTagSourceLike {
    name?: string | null;
    roomNumber?: string | null;
    computed?: { area?: number };
}

/** The subset of an existing room-tag annotation's `parameters`. */
export interface RoomTagParamsLike {
    cachedLabel?: string;
    roomName?: string | null;
    area?: number;
}

/** The canonical label PRYZM shows for a room (name → number → 'Room'). */
export function desiredRoomLabel(room: RoomTagSourceLike): string {
    return room.name || room.roomNumber || 'Room';
}

/**
 * Return true when an existing room-tag's stored parameters NO LONGER match the
 * live room and therefore need a refresh. Returns false (a NO-OP) when the tag
 * is already correct — the property that makes populate() idempotent.
 *
 * Drift sources:
 *   • label drift — the room was renamed after the tag was first placed
 *     (the multi-storey HOUSE post-gen chain does exactly this per storey).
 *   • area drift  — the room boundary changed (edit / redetect).
 */
export function roomTagNeedsRefresh(params: RoomTagParamsLike, room: RoomTagSourceLike): boolean {
    const desiredLabel = desiredRoomLabel(room);
    const desiredArea  = room.computed?.area;
    const labelDrift = params.cachedLabel !== desiredLabel || (params.roomName ?? null) !== (room.name ?? null);
    const areaDrift  = typeof desiredArea === 'number' && params.area !== desiredArea;
    return labelDrift || areaDrift;
}
