// §DIAG-ROOM-OVERLAP / §ROOM-OVERLAP-HARD — `validateNoRoomOverlap` pure validator
// (founder bug, 2026-06-10; APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-
// FRAMEWORK-2026-05-29 Part B; SPEC-ARCHITECTURAL-PROGRAM-RULES; C53 deterministic
// engine / ADR-0061).
//
// THE INVARIANT (founder): for every pair of rooms i ≠ j, Area(R_i ∩ R_j) == 0.
// Rooms may TOUCH along shared walls / edges / corners (a zero-area intersection)
// but their INTERIOR floor areas must be mutually exclusive — no square metre of
// floor may belong to two rooms. The screenshot defect (Entrance Hall floor area
// also claimed by Bedroom 1 and the Living Room) violates this.
//
// This is a DETECTOR + gate signal, NOT a re-pack: it computes the pairwise
// axis-aligned-rectangle intersection area and flags any pair whose overlap
// exceeds a small epsilon. The squarified treemap (squarify.ts) tiles exactly,
// but the subdivider's POST-PASSES (snapAxisLines, §EVERY-ROOM-ACCESS-COMB carve,
// snapRectsAwayFromWindows) move rects INDEPENDENTLY after the exact tiling, so
// overlaps can originate at subdivide time on a tight / over-capacity shell —
// hence the gate runs over the realised placements, before geometry emit.
//
// Pure + deterministic: reads room placements only, no RNG, stable iteration
// order (input order, then i < j). NOT a new exported package boundary function
// in the P8 sense — it is an internal engine validator consumed by enumerate.ts,
// mirroring validateWetCluster / validateForbiddenAdjacencies.

/**
 * Minimal room placement consumed by the validator — id + axis-aligned rect.
 * Mirrors `RoomPlacement` (subdivide.ts) without importing it, exactly like
 * `WetRoomPlacement` in validateWetCluster.ts.
 */
export interface OverlapRoomPlacement {
    readonly id: string;
    readonly rect: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number };
}

/** One pairwise interior-area overlap (area in m², > epsilon). */
export interface RoomOverlap {
    readonly a: string;          // room id A (input-order earlier of the pair)
    readonly b: string;          // room id B
    readonly areaM2: number;     // overlapping floor area in square metres
}

export interface NoRoomOverlapResult {
    /** True ⇒ no pair overlaps by more than `epsilonM2` (touching edges are OK). */
    readonly ok: boolean;
    /** Every overlapping pair, in deterministic (i < j) order. Empty when ok. */
    readonly overlaps: readonly RoomOverlap[];
    /** How many unordered pairs were tested (n·(n−1)/2). */
    readonly pairsChecked: number;
}

/**
 * Overlap area (m²) of two axis-aligned rectangles. Shared edges / corners give a
 * zero-width or zero-height overlap span ⇒ 0 area. Disjoint rects ⇒ 0.
 */
export function rectIntersectionArea(
    a: OverlapRoomPlacement['rect'],
    b: OverlapRoomPlacement['rect'],
): number {
    const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    if (dx <= 0 || dz <= 0) return 0;   // touching (==0) or disjoint (<0) ⇒ no interior overlap
    return dx * dz;
}

/**
 * Validate that no two rooms claim the same interior floor area.
 *
 * An overlap is any pairwise rectangle-intersection area STRICTLY GREATER than
 * `epsilonM2` (default 1e-3 m² = 10 cm²). The epsilon absorbs float noise and the
 * sub-millimetre slivers an alignment snap can leave at a shared wall, so two
 * rooms that merely share an edge are NEVER reported. Iteration is input-order,
 * i < j ⇒ deterministic.
 */
export function validateNoRoomOverlap(
    rooms: readonly OverlapRoomPlacement[],
    epsilonM2 = 1e-3,
): NoRoomOverlapResult {
    const overlaps: RoomOverlap[] = [];
    let pairsChecked = 0;
    for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
            pairsChecked++;
            const area = rectIntersectionArea(rooms[i]!.rect, rooms[j]!.rect);
            if (area > epsilonM2) {
                overlaps.push({ a: rooms[i]!.id, b: rooms[j]!.id, areaM2: area });
            }
        }
    }
    return { ok: overlaps.length === 0, overlaps, pairsChecked };
}
