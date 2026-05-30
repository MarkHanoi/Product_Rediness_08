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
    type WindowPlacement,
    type WindowableRoomType,
} from './types.js';

const segLenMm = (s: ExternalWallSegment): number => {
    const dx = s.end.x - s.start.x;
    const dy = s.end.y - s.start.y;
    return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Emit zero-or-one window placement for a room of `roomType`, hosted on
 * the longest viable external wall in `externalWalls`. Returns [] when:
 *   • roomType is not in the windowable set; or
 *   • externalWalls is empty (interior room); or
 *   • every external wall is shorter than `spec.minWidthMm`.
 *
 * `roomName` is optional and only used to stamp `WindowPlacement.name`.
 */
export function emitWindowsForRoom(
    roomType: RoomType,
    externalWalls: readonly ExternalWallSegment[],
    roomName?: string,
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

    const chosen = candidates[0]!;
    const wallLenMm = chosen.lenMm;
    const offsetMm = Math.max(0, (wallLenMm - chosenWidthMm) / 2);

    return [{
        wallIndex: chosen.w.wallIndex,
        offsetMm,
        widthMm:   chosenWidthMm,
        heightMm:  spec.heightMm,
        sillMm:    spec.sillMm,
        roomType:  roomType as WindowableRoomType,
        ...(roomName ? { name: `${roomName} Window` } : {}),
    }];
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
): readonly WindowPlacement[] {
    const out: WindowPlacement[] = [];
    for (const r of rooms) {
        const ws = emitWindowsForRoom(r.roomType, r.externalWalls, r.name);
        for (const w of ws) out.push(w);
    }
    return out;
}
