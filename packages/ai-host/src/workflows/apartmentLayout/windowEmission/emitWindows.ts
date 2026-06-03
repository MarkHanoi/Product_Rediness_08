// T1.W — Window emission engine (P1 — pure placement).
//
// Pure + deterministic. Given a single room (its type) and the set of
// EXTERNAL wall segments bounding that room, emits 0 or 1 WindowPlacement
// at the centre of the longest viable host wall.
//
// Today the apartment-layout pipeline ships ZERO emitted windows — the
// modal renders shell windows from the existing perimeter but never
// creates new ones. This engine ships the per-room placement logic; the
// wiring layer (T1.W-B follow-on) is responsible for:
//   • resolving each room's bounding-external-wall segments from the
//     bubble graph's BOUNDS edges + the shell perimeter;
//   • dispatching window.createOpening commands hosted on the resolved
//     wall ids (mirrors the existing door cascade);
//   • applying the per-room window system-type id from T1.D's
//     `defaultWindowSystemTypeId(roomType)` resolver.
//
// Algorithm (intentionally simple):
//   1. Filter externalWalls to those at least `spec.minWallLengthMm` long.
//      If none qualify, retry against `minWidthMm` (the smaller fallback).
//      Still none → return [] (room ships without an emitted window).
//   2. Pick the LONGEST qualifying wall (single deterministic choice;
//      ties broken by lowest wallIndex for determinism).
//   3. Place ONE centred window:
//        offset = (wallLen − chosenWidth) / 2
//        width  = chosenWidth (preferred or fallback)
//      Centred placement gives a balanced façade reading; future variants
//      may shift along sub-walls or emit multiple windows on long runs.
//
// Pure: no I/O, no THREE, no DOM, no random; ai-host unit-tests in plain
// Node.

import type { RoomType } from '../types.js';
import {
    isWindowable,
    WINDOW_SPECS,
    type ExternalWallSegment,
    type OccupiedSpan,
    type WindowPlacement,
    type WindowableRoomType,
} from './types.js';

const segLenMm = (s: ExternalWallSegment): number => {
    const dx = s.end.x - s.start.x;
    const dy = s.end.y - s.start.y;
    return Math.sqrt(dx * dx + dy * dy);
};

/** Clearance (mm) kept between a window edge and any door footprint / wall end
 *  when sliding a window clear of an obstruction. 100 mm matches the door
 *  pipeline's `minClearanceM` (wallsAndDoors.ts) so windows + doors read as a
 *  deliberate, spaced façade rhythm rather than touching. */
const WINDOW_CLEARANCE_MM = 100;

/**
 * Door footprints on one host wall (mm, along the wall from its `start`), each
 * already padded by the window clearance, sorted by `lo`. Returned by
 * `blockedSpansFor`.
 */
interface BlockedSpan { readonly lo: number; readonly hi: number }

/** Build the sorted, clearance-padded blocked-span list for `wallIndex` from
 *  the raw door spans. Spans are clamped to ≥ 0 on the low side. */
function blockedSpansFor(
    wallIndex: number,
    occupied: readonly OccupiedSpan[],
): BlockedSpan[] {
    return occupied
        .filter(s => s.wallIndex === wallIndex)
        .map(s => ({
            lo: Math.min(s.startMm, s.endMm) - WINDOW_CLEARANCE_MM,
            hi: Math.max(s.startMm, s.endMm) + WINDOW_CLEARANCE_MM,
        }))
        .sort((a, b) => a.lo - b.lo);
}

/** True when the window `[off, off+width]` overlaps any blocked span. */
function overlapsAny(off: number, widthMm: number, blocked: readonly BlockedSpan[]): boolean {
    const hi = off + widthMm;
    return blocked.some(b => off < b.hi && hi > b.lo);
}

/**
 * Find the offset (mm from wall start) for a `widthMm`-wide window on a wall of
 * `wallLenMm`, as close to the centred position as possible while:
 *   • keeping WINDOW_CLEARANCE_MM clear of each wall end; and
 *   • not overlapping any door footprint in `blocked`.
 * Returns null when no door-clear position fits on this wall.
 */
function clearOffsetMm(
    wallLenMm: number,
    widthMm: number,
    blocked: readonly BlockedSpan[],
): number | null {
    const minOff = WINDOW_CLEARANCE_MM;
    const maxOff = wallLenMm - widthMm - WINDOW_CLEARANCE_MM;
    if (maxOff < minOff) {
        // Wall too short to keep both end-clearances — fall back to a simple
        // centred offset (no door overlap possible if there are no doors).
        const centred = Math.max(0, (wallLenMm - widthMm) / 2);
        return blocked.length > 0 && overlapsAny(centred, widthMm, blocked) ? null : centred;
    }
    const centred = (wallLenMm - widthMm) / 2;
    const clampToRange = (o: number): number => Math.min(Math.max(o, minOff), maxOff);

    if (!overlapsAny(centred, widthMm, blocked)) return centred;

    // Candidate offsets: just clear of each blocked span on either side, plus
    // the two end-clamped extremes. Pick the feasible one closest to centre.
    const candidates: number[] = [minOff, maxOff];
    for (const b of blocked) {
        candidates.push(b.hi);                 // window starts just after the door
        candidates.push(b.lo - widthMm);       // window ends just before the door
    }
    let best: number | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
        if (c < minOff - 1e-6 || c > maxOff + 1e-6) continue;
        const off = clampToRange(c);
        if (overlapsAny(off, widthMm, blocked)) continue;
        const d = Math.abs(off - centred);
        if (d < bestDist) { best = off; bestDist = d; }
    }
    return best;
}

/**
 * Emit zero-or-one window placement for a room of `roomType`, hosted on the
 * longest viable external wall in `externalWalls`. Returns [] when:
 *   • roomType is not in the windowable set; or
 *   • externalWalls is empty (interior room); or
 *   • every external wall is shorter than `spec.minWidthMm`; or
 *   • every qualifying wall is fully blocked by door footprints (`occupied`).
 *
 * `roomName` is optional and only used to stamp `WindowPlacement.name`.
 *
 * `occupied` (T1.W-B-2 — door avoidance): door footprints already placed on
 * these walls, in mm along each wall from its `start` endpoint. The window is
 * never placed over a door on the same wall — it is slid clear (keeping
 * WINDOW_CLEARANCE_MM either side), and when no door-clear slot fits on the
 * longest wall the engine falls through to the next-longest qualifying wall.
 * Omit / pass [] to disable door avoidance (legacy + unit-test callers).
 */
export function emitWindowsForRoom(
    roomType: RoomType,
    externalWalls: readonly ExternalWallSegment[],
    roomName?: string,
    occupied: readonly OccupiedSpan[] = [],
): readonly WindowPlacement[] {
    if (!isWindowable(roomType)) return [];
    if (externalWalls.length === 0) return [];

    const spec = WINDOW_SPECS[roomType as WindowableRoomType];
    if (!spec) return [];

    // Walls long enough for the preferred width; fall back to the smaller
    // variant when the preferred width can't host on any wall.
    const longEnough = externalWalls
        .map(w => ({ w, lenMm: segLenMm(w) }))
        .filter(x => x.lenMm >= spec.minWallLengthMm)
        .sort((a, b) => b.lenMm - a.lenMm || a.w.wallIndex - b.w.wallIndex);

    let chosenWidthMm = spec.widthMm;
    let candidates = longEnough;
    if (candidates.length === 0) {
        // Try the smaller variant — minWidthMm + 100 mm padding either side.
        const minHostMm = spec.minWidthMm + 200;
        candidates = externalWalls
            .map(w => ({ w, lenMm: segLenMm(w) }))
            .filter(x => x.lenMm >= minHostMm)
            .sort((a, b) => b.lenMm - a.lenMm || a.w.wallIndex - b.w.wallIndex);
        if (candidates.length === 0) return [];
        chosenWidthMm = spec.minWidthMm;
    }

    // Try each qualifying wall in order (longest → next) until one yields a
    // door-clear offset. Door avoidance: a window must not overlap a door on
    // the SAME wall (the front door / reconciliation doors can land on a shell
    // wall the room also fronts).
    for (const cand of candidates) {
        const wallLenMm = cand.lenMm;
        const blocked = blockedSpansFor(cand.w.wallIndex, occupied);
        const offsetMm = clearOffsetMm(wallLenMm, chosenWidthMm, blocked);
        if (offsetMm === null) continue;     // fully blocked on this wall — next wall
        return [{
            wallIndex: cand.w.wallIndex,
            offsetMm,
            widthMm:   chosenWidthMm,
            heightMm:  spec.heightMm,
            sillMm:    spec.sillMm,
            roomType:  roomType as WindowableRoomType,
            ...(roomName ? { name: `${roomName} Window` } : {}),
        }];
    }
    return [];
}

/**
 * Convenience: emit windows for every entry in `rooms`, flattening the
 * results into a single placements array. Each room is independent —
 * collisions between the resulting windows are NOT checked here (a single
 * external wall hosting two rooms is impossible in the current generator,
 * so collisions can only arise via wiring bugs — caught at the wall.createOpening
 * dispatch layer).
 */
export function emitAllWindows(
    rooms: readonly { readonly roomType: RoomType; readonly externalWalls: readonly ExternalWallSegment[]; readonly name?: string }[],
    occupied: readonly OccupiedSpan[] = [],
): readonly WindowPlacement[] {
    const out: WindowPlacement[] = [];
    for (const r of rooms) {
        const ws = emitWindowsForRoom(r.roomType, r.externalWalls, r.name, occupied);
        for (const w of ws) out.push(w);
    }
    return out;
}
