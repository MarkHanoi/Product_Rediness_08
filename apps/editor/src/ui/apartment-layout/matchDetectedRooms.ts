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
    /** §ROOM-NAME-ROBUST (founder full-house test, 2026-06-12) — the engine room's
     *  OWN footprint polygon (world XZ, metres), when the layout supplies it. Lets
     *  the fallback pass match by CROSS-CONTAINMENT (detected centroid inside the
     *  engine polygon) and by max polygon-OVERLAP, not centroid distance alone — so
     *  a detected cell whose own centroid drifts just outside the engine centroid
     *  (open-plan / slightly-off Living/Dining) is still named, instead of keeping
     *  the editor's "Room NN-NNN" fallback. Optional: absent ⇒ distance-only
     *  fallback (byte-identical to the prior behaviour, ADR-0061). */
    readonly polygon?: ReadonlyArray<{ readonly x: number; readonly z: number }>;
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

/** Mean of a polygon's vertices (world XZ, metres). A cheap, winding-agnostic
 *  centroid proxy — good enough for the nearest-room tie-break. */
function polyMean(poly: ReadonlyArray<{ readonly x: number; readonly z: number }>): { cx: number; cz: number } {
    let cx = 0, cz = 0;
    for (const p of poly) { cx += p.x; cz += p.z; }
    return { cx: cx / poly.length, cz: cz / poly.length };
}

/** §ROOM-NAME-ROBUST — a deterministic overlap PROXY between an engine room and a
 *  detected polygon, returned as a small ordered score (higher = stronger match):
 *    2  the detected centroid lies inside the engine polygon (and/or vice-versa)
 *    1  only one of the cross-containment tests passes
 *    0  neither — fall back to centroid distance only.
 *  No polygon clipping (which would need robust non-convex intersection); the two
 *  cross-containment tests catch the founder's "centroid drifted just outside"
 *  failure mode cheaply and deterministically. When the engine room has no polygon
 *  the score is 0 and the match degrades to nearest-centroid (prior behaviour). */
function containmentScore(
    engine: EngineRoom,
    detPoly: ReadonlyArray<{ readonly x: number; readonly z: number }>,
    detCx: number,
    detCz: number,
): number {
    let s = 0;
    if (engine.polygon && engine.polygon.length >= 3 && pointInPolygon(detCx, detCz, engine.polygon)) s++;
    if (detPoly.length >= 3 && pointInPolygon(engine.cx, engine.cz, detPoly)) s++;
    return s;
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

    interface Pending {
        id: string;
        cx: number;
        cz: number;
        poly: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    }
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
        const { cx, cz } = polyMean(poly);
        unmatched.push({ id: room.id, cx, cz, poly });
    }

    // Pass 2 — §ROOM-NAME-ROBUST fallback over STILL-UNUSED engine rooms. The prior
    // pass paired purely on centroid DISTANCE, so a detected cell whose centroid
    // drifted just outside its engine room's centroid lost the race to a closer (but
    // wrong) engine room, and — once the right engine room was consumed by another
    // cell — stayed UNNAMED (the founder's "Room 00-001"/"Room 01-003" for Living /
    // Dining). Now each (detected, engine) pair is ranked by CROSS-CONTAINMENT first
    // (detected centroid inside the engine polygon, or vice-versa) and only then by
    // distance, so the correctly-overlapping engine room wins even when neither
    // centroid sits exactly inside the other. Still a strict BIJECTION (each engine
    // room names ≤1 detected room) so the duplicate-"Stair" guard holds, and fully
    // deterministic — score desc, distance asc, then id tie-breaks (ADR-0061).
    const candidates: Array<{ p: Pending; t: EngineRoom; score: number; d: number }> = [];
    for (const p of unmatched) {
        for (const t of tgl) {
            const d = (t.cx - p.cx) * (t.cx - p.cx) + (t.cz - p.cz) * (t.cz - p.cz);
            const score = containmentScore(t, p.poly, p.cx, p.cz);
            candidates.push({ p, t, score, d });
        }
    }
    candidates.sort((a, b) =>
        (b.score - a.score) ||           // stronger cross-containment first
        (a.d - b.d) ||                   // then nearest centroid
        (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0) ||   // deterministic id tie-break
        (a.t.name < b.t.name ? -1 : a.t.name > b.t.name ? 1 : 0),
    );
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
