// Furnish-layout occupancy resolution — PURE helpers (A.21.D24).
//
// Extracted from FurnishLayoutExecutor so they can be unit-tested. They turn a
// detected room (occupancyType + display name) into the D-FLE occupancy keys the
// archetype table understands. The robustness rule: prefer the explicit
// `occupancyType`, then fall back to deriving it from the room NAME — so a room
// whose naming pass hasn't applied yet (or a house room the apartment naming
// pass would have set) still resolves to a furnishable archetype. Without this,
// furnishing a freshly-built HOUSE produced nothing (rooms had no occupancyType).

/** A detected room as the furnish executor reads it from the room store. */
export interface FurnishRoomRef {
    readonly name?: string;
    readonly occupancyType?: string;
}

/**
 * Map a deterministic display name (from bubbleGraph.ts) back to a D-FLE
 * occupancy. The bubble graph mints names like "Living Room", "Kitchen",
 * "Master Bedroom" / "Bedroom 1" / "Bathroom" / "En-suite".
 */
export function occupancyFromName(name: string): string | undefined {
    const n = name.trim();
    if (/^Entrance Hall/i.test(n)) return 'entrance-lobby';
    if (/^Living Room/i.test(n)) return 'living-room';
    if (/^Kitchen/i.test(n)) return 'kitchen';
    if (/^Dining/i.test(n)) return 'dining-room';
    if (/^Corridor/i.test(n)) return 'corridor';
    if (/^Master Bedroom/i.test(n)) return 'bedroom';
    if (/^Bedroom/i.test(n)) return 'bedroom';
    if (/^En-?suite/i.test(n)) return 'bathroom';
    if (/^Bathroom/i.test(n)) return 'bathroom';
    if (/^Study|^Office|^Home Office/i.test(n)) return 'private-office';
    if (/^Utility/i.test(n)) return 'utility-room';
    return undefined;
}

/**
 * Occupancies for a room — single-occupancy rooms return [occupancy]; a
 * compound-name room (open-plan merged "Living Room / Kitchen / Dining")
 * returns each sub-program's occupancy, in the compound-name order (largest-
 * area-first — see the room-naming pass). occupancyType wins; absent → derived
 * from the room name; neither → [].
 */
export function occupanciesForRoom(r: FurnishRoomRef): string[] {
    const name = r.name ?? '';
    if (name.includes('/')) {
        const parts = name.split('/').map(p => occupancyFromName(p)).filter((o): o is string => !!o);
        if (parts.length > 0) return parts;
    }
    if (r.occupancyType) return [r.occupancyType];
    const fromName = occupancyFromName(name);
    return fromName ? [fromName] : [];
}

/** The single furnishable occupancy for a room — occupancyType first, then
 *  name-derived. '' when neither resolves. */
export function primaryOccupancy(r: FurnishRoomRef): string {
    if (r.occupancyType) return r.occupancyType;
    return occupancyFromName(r.name ?? '') ?? '';
}
