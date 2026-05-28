// D-FLE F4 — wall analysis (SPEC-FURNITURE-LAYOUT-ENGINE §5).
//
// Pure helpers to pick the anchor wall for an item from a FurnishRoomInput:
// longest free wall, the wall most opposite the primary door, the wall carrying a
// window. Plus yaw-from-normal and wall geometry. Metres, world XZ. ZERO imports
// but types.

import type { OpeningPose, Pt, RoomWallSeg } from './types.js';

export const wallMid = (w: RoomWallSeg): Pt => ({ x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 });

/** Unit direction along the wall (a→b). */
export function wallDir(w: RoomWallSeg): Pt {
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
}

/** Yaw so the item's +z (front/depth) points along `n` (into the room). */
export const yawFromNormal = (n: Pt): number => Math.atan2(n.x, n.z);

const dot = (a: Pt, b: Pt): number => a.x * b.x + a.z * b.z;

/** Longest wall (stable: ties broken by lower midpoint x then z). */
export function longestWall(walls: readonly RoomWallSeg[]): RoomWallSeg | null {
    let best: RoomWallSeg | null = null;
    for (const w of walls) {
        if (!best || w.length > best.length + 1e-9 ||
            (Math.abs(w.length - best.length) < 1e-9 && (wallMid(w).x < wallMid(best).x - 1e-9))) best = w;
    }
    return best;
}

/** The wall most "opposite" the primary (first) door — its inward normal most
 *  anti-parallel to the door's into-room normal. Falls back to the longest wall. */
export function wallOppositeDoor(walls: readonly RoomWallSeg[], doors: readonly OpeningPose[]): RoomWallSeg | null {
    if (doors.length === 0) return longestWall(walls);
    const dn = doors[0]!.normal;
    let best: RoomWallSeg | null = null, bestScore = Infinity;
    for (const w of walls) {
        const score = dot(w.inwardNormal, dn);   // most negative = most opposite
        if (score < bestScore - 1e-9) { bestScore = score; best = w; }
    }
    return best ?? longestWall(walls);
}

/** True when an opening (window or door) sits on a wall: its centre lies near
 *  the wall's infinite line AND within its span. The same geometric test that
 *  `wallWithWindow` used internally — exported so the placement solver can
 *  enforce §FURNITURE-SPEC `excludeWindowWall` against any wall. */
export function openingOnWall(o: OpeningPose, w: RoomWallSeg): boolean {
    const d = wallDir(w);
    const t = (o.center.x - w.a.x) * d.x + (o.center.z - w.a.z) * d.z;
    if (t < -0.05 || t > w.length + 0.05) return false;
    const px = w.a.x + d.x * t, pz = w.a.z + d.z * t;
    return Math.hypot(o.center.x - px, o.center.z - pz) < 0.3;
}

/** True when ANY window lies on `w`. */
export const wallHasWindow = (w: RoomWallSeg, windows: readonly OpeningPose[]): boolean =>
    windows.some(win => openingOnWall(win, w));

/** True when ANY door lies on `w`. Used by §FURNITURE-SPEC `excludeDoorSwing`
 *  to keep door-respecting items (toilet, bed, wardrobe, sofa, kitchen run)
 *  off the wall the door is in — an item slid past the door on the same wall
 *  is awkward to use (you face it side-on as the door swings beside you). */
export const wallHasDoor = (w: RoomWallSeg, doors: readonly OpeningPose[]): boolean =>
    doors.some(d => openingOnWall(d, w));

/** A wall carrying a window (the window's center lies on the wall span). Prefers
 *  the longest such wall. Falls back to the longest wall overall. */
export function wallWithWindow(walls: readonly RoomWallSeg[], windows: readonly OpeningPose[]): RoomWallSeg | null {
    let best: RoomWallSeg | null = null;
    for (const w of walls) {
        if (wallHasWindow(w, windows) && (!best || w.length > best.length)) best = w;
    }
    return best ?? longestWall(walls);
}
