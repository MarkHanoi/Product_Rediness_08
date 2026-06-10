// §ROOM-NAME-BIJECTIVE (founder duplicate-Stair bug, 2026-06-10) — the PURE,
// runtime-free matcher that assigns each editor-detected room the semantic
// name + occupancy of the ONE D-TGL engine room it corresponds to.
//
// Extracted from `nameDetectedRooms` so the matching contract is unit-testable
// without the editor runtime (store/command-bus). It encodes the founder fix:
// the assignment is a BIJECTION — every engine room names AT MOST ONE detected
// room, so a single minted `stair` room can NEVER name two detected cells (the
// duplicate "Stair") and a contested cell that loses falls through unnamed
// rather than stealing an already-assigned name.
//
// Determinism (ADR-0061): the result depends only on the inputs and the
// nearest-first ordering tie-break; no RNG, no time, no global state.

export interface EngineRoom {
    readonly name: string;
    readonly occupancy?: string;
    readonly area: number;
    /** Centroid in the SAME frame as the detected polygons (metres, world XZ). */
    readonly cx: number;
    readonly cz: number;
}

export interface DetectedRoomPoly {
    readonly id: string;
    readonly polygon: ReadonlyArray<{ readonly x: number; readonly z: number }>;
}

export interface RoomRename {
    readonly roomId: string;
    readonly name: string;
    readonly occupancy?: string;
}

export function pointInPolygon(
    px: number, pz: number, poly: ReadonlyArray<{ readonly x: number; readonly z: number }>,
): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i]!.x, zi = poly[i]!.z, xj = poly[j]!.x, zj = poly[j]!.z;
        if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) hit = !hit;
    }
    return hit;
}

/**
 * Assign each detected room the name+occupancy of the engine room(s) it owns.
 *
 * BIJECTIVE: every engine room is consumed by AT MOST ONE detected room.
 *   Pass 1 — direct containment: a detected room claims every engine room whose
 *     centroid is strictly inside it (open-plan zones legitimately COMPOUND,
 *     e.g. "Kitchen / Dining"); each claimed engine room is marked used.
 *   Pass 2 — §ROOM-NAME-NEAREST fallback: detected rooms with no direct hit are
 *     paired to the nearest STILL-UNUSED engine room in global nearest-first
 *     order. A detected cell with no unused engine room left stays UNNAMED (a
 *     genuine extra cell / fractured stair seam) — it never duplicates a name
 *     already assigned in Pass 1.
 *
 * @returns the renames to apply (one per matched detected room) AND the count of
 *   detected rooms left unmatched (→ the editor's "Room 00-00x" fallback label).
 */
export function matchDetectedRooms(
    engineRooms: readonly EngineRoom[],
    detected: readonly DetectedRoomPoly[],
): { renames: RoomRename[]; unmatched: number } {
    // Largest engine room first — a stable, area-ranked order so a centroid that
    // lands inside two nested/overlapping detected polygons resolves the same way
    // every run (matches the legacy `.sort((a,b)=>b.area-a.area)` ordering).
    const tgl = [...engineRooms].sort((a, b) => b.area - a.area);
    const renames: RoomRename[] = [];
    if (tgl.length === 0) return { renames, unmatched: detected.length };

    const usedTgl = new Set<EngineRoom>();
    const pushRename = (roomId: string, matches: readonly EngineRoom[]): void => {
        const compoundName = matches.map(m => m.name).filter(Boolean).join(' / ');
        if (!compoundName) return;
        const dominantOccupancy = matches[0]!.occupancy;
        renames.push({ roomId, name: compoundName, ...(dominantOccupancy ? { occupancy: dominantOccupancy } : {}) });
    };

    interface Pending { id: string; cx: number; cz: number }
    const unmatched: Pending[] = [];

    // Pass 1 — direct centroid-in-polygon containment (uniqueness-tracked).
    for (const room of detected) {
        const poly = room.polygon;
        if (poly.length < 3) continue;
        const hits = tgl.filter(t => !usedTgl.has(t) && pointInPolygon(t.cx, t.cz, poly));
        if (hits.length > 0) {
            for (const h of hits) usedTgl.add(h);
            pushRename(room.id, hits);
            continue;
        }
        let cx = 0, cz = 0;
        for (const p of poly) { cx += p.x; cz += p.z; }
        cx /= poly.length; cz /= poly.length;
        unmatched.push({ id: room.id, cx, cz });
    }

    // Pass 2 — nearest fallback over STILL-UNUSED engine rooms, nearest-first.
    const candidates: Array<{ p: Pending; t: EngineRoom; d: number }> = [];
    for (const p of unmatched) {
        for (const t of tgl) {
            const d = (t.cx - p.cx) * (t.cx - p.cx) + (t.cz - p.cz) * (t.cz - p.cz);
            candidates.push({ p, t, d });
        }
    }
    candidates.sort((a, b) => a.d - b.d);
    const claimedRooms = new Set<string>();
    for (const c of candidates) {
        if (claimedRooms.has(c.p.id) || usedTgl.has(c.t)) continue;
        usedTgl.add(c.t);
        claimedRooms.add(c.p.id);
        pushRename(c.p.id, [c.t]);
    }

    // Count detected rooms with ≥3 vertices that ended up with no rename.
    const named = new Set(renames.map(r => r.roomId));
    let unmatchedCount = 0;
    for (const room of detected) {
        if (room.polygon.length < 3) continue;
        if (!named.has(room.id)) unmatchedCount++;
    }
    return { renames, unmatched: unmatchedCount };
}
