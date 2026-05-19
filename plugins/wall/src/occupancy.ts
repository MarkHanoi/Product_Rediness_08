// WallOccupancyStore — pure-query side system for opening placement
// validation (S10-T6, port of `src/elements/walls/WallOccupancyStore.ts:221`).
//
// PURE STATELESS LOGIC — no THREE, no store mutation, no own state.
// Reads `wall.openings[]` directly from a frozen `WallData` and answers
// "can this 1-D span be placed without overlapping?" with a structured
// result.  Used at handler `canExecute` time by `CreateWallOpening`,
// `MoveDoor` / `MoveWindow` (S11), and bulk-import validators.
//
// CONTRACT (mirrors PRYZM 1 §06-8.5):
//
//   • 1 mm tolerance (EPSILON_M = 0.001) so that openings with EXACT
//     touching edges (`a + width === b`) are NOT treated as overlapping
//     — adjacent doors/windows can share a frame edge without conflict.
//
//   • Two intervals `[a, a+wa]` and `[b, b+wb]` overlap iff
//        a < b + wb - eps   AND   a + wa > b + eps
//
//   • `excludeId` is for IN-PLACE moves: re-validating an existing
//     opening must not flag itself as a conflict.
//
//   • Wall length is computed from `baseLine` directly — for curved
//     walls this is the chord length, NOT the arc length.  Curved-wall
//     opening validation uses the chord today (matches PRYZM 1 behaviour
//     for the canonical openings catalog); arc-length validation is
//     a 1C+ refinement once `PathResolver.computeArcLengths` is ported
//     into the kernel surface.

import type { WallData } from './store.js';

/** 1 mm tolerance — see header. */
export const OCCUPANCY_EPSILON_M = 0.001;

export interface CanPlaceResult {
  readonly valid: boolean;
  readonly conflictIds: readonly string[];
  readonly reason?: string;
}

export interface OccupiedSpan {
  readonly openingId: string;
  readonly type: 'window' | 'door';
  readonly offsetM: number;
  readonly endM: number;
}

/** Compute the planar (XZ) baseline length of a wall.  The Y component
 *  carries level elevation per the canonical wall schema; including it
 *  in the length would produce the slope length, not the planar length. */
function planarBaselineLength(wall: WallData): number {
  const [a, b] = wall.baseLine;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Pure-query side system — see header for design rationale. */
export class WallOccupancyStore {
  /** Re-exported for callers that want to share the tolerance constant. */
  static readonly EPSILON_M = OCCUPANCY_EPSILON_M;

  /** Can a new opening `[offsetM, offsetM + widthM]` be placed on `wall`
   *  without overlapping any existing entry in `wall.openings[]`?
   *
   *  Returns `{ valid: true }` when clear, `{ valid: false, conflictIds,
   *  reason }` when blocked.  The result is INTENTIONALLY structured
   *  (not just a boolean) so handlers can surface the conflicting opening
   *  ids in user-facing error messages without re-querying. */
  canPlace(
    wall: WallData,
    offsetM: number,
    widthM: number,
    excludeId?: string,
  ): CanPlaceResult {
    const wallLengthM = planarBaselineLength(wall);
    if (wallLengthM <= 0) {
      return {
        valid: false,
        conflictIds: [],
        reason: 'Wall has zero length — cannot place openings',
      };
    }

    if (!Number.isFinite(widthM) || widthM <= 0) {
      return {
        valid: false,
        conflictIds: [],
        reason: `Opening width must be > 0 (got ${widthM})`,
      };
    }
    if (!Number.isFinite(offsetM)) {
      return {
        valid: false,
        conflictIds: [],
        reason: `Offset must be a finite number (got ${offsetM})`,
      };
    }

    const eps = OCCUPANCY_EPSILON_M;

    if (offsetM < -eps) {
      return {
        valid: false,
        conflictIds: [],
        reason: `Offset ${offsetM.toFixed(3)} m is before wall start`,
      };
    }

    const newEnd = offsetM + widthM;
    if (newEnd > wallLengthM + eps) {
      return {
        valid: false,
        conflictIds: [],
        reason:
          `Opening [${offsetM.toFixed(3)} m, ${newEnd.toFixed(3)} m] ` +
          `extends beyond wall length ${wallLengthM.toFixed(3)} m`,
      };
    }

    const conflicts: string[] = [];
    for (const existing of wall.openings ?? []) {
      if (excludeId !== undefined && existing.id === excludeId) continue;
      const exStart = existing.offset;
      const exEnd = existing.offset + existing.width;
      const overlaps = offsetM < exEnd - eps && newEnd > exStart + eps;
      if (overlaps) conflicts.push(existing.id);
    }
    if (conflicts.length > 0) {
      return {
        valid: false,
        conflictIds: conflicts,
        reason: `Opening overlaps existing opening(s): ${conflicts.join(', ')}`,
      };
    }
    return { valid: true, conflictIds: [] };
  }

  /** Read all existing openings on a wall, sorted by offset.  Useful
   *  for tool UI that needs to display occupied spans (e.g. greyed-out
   *  ranges in a placement preview). */
  getOccupiedSpans(wall: WallData): readonly OccupiedSpan[] {
    const out: OccupiedSpan[] = (wall.openings ?? []).map((o) => ({
      openingId: o.id,
      type: o.type,
      offsetM: o.offset,
      endM: o.offset + o.width,
    }));
    out.sort((a, b) => a.offsetM - b.offsetM);
    return out;
  }
}

/** Module-level singleton — see header.  No constructor state. */
export const wallOccupancyStore = new WallOccupancyStore();
