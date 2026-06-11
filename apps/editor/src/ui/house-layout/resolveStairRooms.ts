// §STAIR-VOID-EXCLUDE (founder defect #7, 2026-06-10) — the PURE, runtime-free
// resolver that collapses the editor-detected rooms inside a stair void to EXACTLY
// ONE non-habitable `stair` room (named "Stair") and drops every extra cell.
//
// ROOT CAUSE the founder reported: the engine DESIGNS exactly one stair cell — it
// SUBTRACTS the stair keep-out from the buildable plate (so no habitable room tiles
// across it) and emits ONE `stair` ProgramRoom there (enumerate.ts §STAIR-OBSTACLE-
// CARVE). But the EDITOR's room redetect runs over the BUILT WALL GRAPH after the
// stair body is placed: the stair structure spans a wall line, so the trace splits
// the footprint into TWO enclosed faces (e.g. the founder's 8.1 m² + 25.3 m²) — the
// "area beneath the stair" and the "area around the stair" become two detected
// rooms. §ROOM-NAME-BIJECTIVE (matchDetectedRooms) stops the duplicate NAME, but the
// SECOND cell survives as a ~25 m² habitable-looking "Room 00-00x" fallback. The cure
// is a DETECTION-TIME exclusion: any detected room whose centroid lies inside a stair
// keep-out rect is part of the stair void — keep ONE, type it non-habitable `stair`,
// and DELETE the rest, so the footprint resolves to exactly one non-habitable void.
//
// This module is the PURE decision (no store / command-bus / runtime); the wiring
// in `nameDetectedRooms` applies the rename + deletes. Determinism (ADR-0061): the
// chosen keep is the centroid NEAREST the stair-rect centre, area-then-id tie-broken;
// no RNG, no time, no global state.
//
// Apartment-safe: the apartment path passes NO stair keep-out rects (it builds no
// stair), so `stairRects` is empty → this returns the empty decision and the naming
// pass behaves byte-for-byte as before (ADR-0061).
//
// Governance: ADR-0063 (house generative-layout doctrine — the stair is a single
// non-habitable vertical-circulation void) · C53 (generative-layout engine→editor
// boundary) · C11 (element-creation / room-detection pipeline — post-detection
// reconciliation). The §STAIR-ROOM-TYPE doctrine (one named `stair` room at the
// keep-out) is enforced here at the DETECTION boundary, completing it.

/** A stair keep-out region in WORLD XZ (metres) — the same shape `houseStairRects`
 *  records and `§DIAG-EXEC-STAIR` already reads. The min/max fields are the
 *  axis-aligned AABB (used as a fast pre-cull); `poly` — when present — is the
 *  TRUE rotated stair cell (4 corners, world XZ), so containment is exact on a
 *  rotated plate where the AABB over-bounds the real cell (founder defect #1). */
export interface StairRect {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    /** The rotated stair cell's corners (world XZ, metres). When omitted the AABB
     *  alone is the keep-out (apartment path / unit tests pass AABB-only rects). */
    readonly poly?: ReadonlyArray<{ readonly x: number; readonly z: number }>;
}

/** A detected room flattened for the decision (world XZ metres). */
export interface DetectedRoomLite {
    readonly id: string;
    /** Centroid in world XZ (metres) — the room-store centroid or polygon mean. */
    readonly cx: number;
    readonly cz: number;
    /** Detected area (m²) — used only for the deterministic keep tie-break. */
    readonly area: number;
}

/** One detected room to KEEP as the stair (rename + occupancy-tag it). */
export interface StairKeep {
    readonly roomId: string;
    readonly name: string;
    readonly occupancy: 'stair';
}

/** The pure decision for one level. */
export interface StairRoomResolution {
    /** The single detected room per stair rect to retain + type `stair`. */
    readonly keep: readonly StairKeep[];
    /** Extra detected rooms inside a stair void to DELETE (`room.delete`). */
    readonly drop: readonly string[];
    /** EVERY detected-room id that fell in a stair void (keep ∪ drop). These must be
     *  EXCLUDED from the engine→detected name matcher so an engine room never re-names
     *  a kept/dropped stair cell. */
    readonly excludedRoomIds: ReadonlySet<string>;
    /** Per stair rect: how many detected rooms fell inside it (for §DIAG). */
    readonly perRectCounts: readonly number[];
}

const EMPTY: StairRoomResolution = {
    keep: [], drop: [], excludedRoomIds: new Set<string>(), perRectCounts: [],
};

function centreOf(r: StairRect): { x: number; z: number } {
    return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

/** Ray-cast point-in-polygon test (world XZ). */
function pointInPoly(
    px: number, pz: number, poly: ReadonlyArray<{ readonly x: number; readonly z: number }>,
): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i]!.x, zi = poly[i]!.z, xj = poly[j]!.x, zj = poly[j]!.z;
        if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) hit = !hit;
    }
    return hit;
}

// §STAIR-ROTATED-POLY (founder defect #1, 2026-06-11) — the AABB (min/max) is the
// fast pre-cull only; the AUTHORITATIVE containment is point-in the ROTATED stair
// cell `poly`. On a 42.9°-rotated plate the AABB over-bounds the real cell, so a
// detected room whose centroid is inside the AABB but OUTSIDE the rotated cell was
// wrongly excluded (roomsInVoidPerRect mismatch → the stair cell kept an empty
// fallback name). Testing the rotated polygon fixes the bijection on a skewed plate.
// When no `poly` is supplied (apartment path / AABB-only tests) the AABB IS the
// keep-out, so the behaviour is byte-identical there.
function centroidInRect(d: DetectedRoomLite, r: StairRect): boolean {
    if (d.cx < r.minX || d.cx > r.maxX || d.cz < r.minZ || d.cz > r.maxZ) return false;
    if (r.poly && r.poly.length >= 3) return pointInPoly(d.cx, d.cz, r.poly);
    return true;
}

/**
 * Resolve the stair-void detected rooms for ONE level.
 *
 * For each stair keep-out rect, gather every detected room whose centroid lies
 * inside it. Keep the room whose centroid is NEAREST the rect centre (deterministic
 * tie-break: larger area first, then lexicographic id) — that is the cell that best
 * represents the stair core — name it "Stair" + occupancy `stair`. Mark every OTHER
 * room in the same rect for deletion. A detected room that is the SOLE occupant of a
 * rect is simply kept + typed (the common 1-room case ⇒ no deletions). A detected
 * room counted for one rect is never re-counted for another (`assigned` guard), so a
 * room straddling two adjacent voids is resolved once, deterministically.
 *
 * @param detected   detected rooms on the level (world-XZ centroids).
 * @param stairRects stair keep-out AABBs (world XZ); empty ⇒ EMPTY (apartment path).
 */
export function resolveStairRooms(
    detected: readonly DetectedRoomLite[],
    stairRects: readonly StairRect[],
): StairRoomResolution {
    if (stairRects.length === 0 || detected.length === 0) return EMPTY;

    const keep: StairKeep[] = [];
    const drop: string[] = [];
    const excluded = new Set<string>();
    const perRectCounts: number[] = [];
    const assigned = new Set<string>();   // a detected room belongs to ≤ 1 stair rect

    // Deterministic rect order (by min corner) so the perRectCounts + assignment are
    // stable regardless of the caller's rect array order.
    const rects = [...stairRects].sort((a, b) => a.minX - b.minX || a.minZ - b.minZ);

    for (const r of rects) {
        const inside = detected.filter(d => !assigned.has(d.id) && centroidInRect(d, r));
        perRectCounts.push(inside.length);
        if (inside.length === 0) continue;

        const c = centreOf(r);
        // Nearest-centre keep; area-desc then id-asc tie-break → fully deterministic.
        const ranked = [...inside].sort((a, b) => {
            const da = (a.cx - c.x) * (a.cx - c.x) + (a.cz - c.z) * (a.cz - c.z);
            const db = (b.cx - c.x) * (b.cx - c.x) + (b.cz - c.z) * (b.cz - c.z);
            if (da !== db) return da - db;
            if (a.area !== b.area) return b.area - a.area;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        const winner = ranked[0]!;
        const name = stairRects.length > 1 ? `Stair ${perRectCounts.length}` : 'Stair';
        keep.push({ roomId: winner.id, name, occupancy: 'stair' });
        excluded.add(winner.id);
        assigned.add(winner.id);
        for (let i = 1; i < ranked.length; i++) {
            drop.push(ranked[i]!.id);
            excluded.add(ranked[i]!.id);
            assigned.add(ranked[i]!.id);
        }
    }

    return { keep, drop, excludedRoomIds: excluded, perRectCounts };
}
