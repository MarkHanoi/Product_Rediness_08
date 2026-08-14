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

/**
 * §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13.8, C73 §4.4) — the CLOSED set of
 * reasons THIS store's `canPlace` can refuse. One member per refusal arm below,
 * in source order.
 *
 * ⚠ THE DUPLICATION IS REAL AND IS NAMED HERE RATHER THAN PAPERED OVER.
 * `packages/geometry-wall/src/WallOccupancyStore.ts` carries a union of the same
 * shape (`CanPlaceRefusalCode`) — this file is the plugin-side port of that store
 * (see the header) and the two are a known duplicate family. The code STRINGS are
 * deliberately identical where the ARMS are identical, so a user never reads two
 * different names for one verdict. They are NOT identical sets, and pretending
 * otherwise would be the lie:
 *   • only geometry-wall checks rake, so only it can emit `OCC_HOST_RAKED`;
 *   • only this store validates offset finiteness separately, so only it can emit
 *     `OCC_OFFSET_NOT_FINITE`.
 * Collapsing the two rosters to look matched would assert a behavioural parity
 * that does not exist. When the family is collapsed for real (GE-04's recipe: one
 * owner, shipping copy named first), the union collapses with it.
 *
 * NEVER widen this to `string`.
 */
export type CanPlaceRefusalCode =
  | 'OCC_HOST_ZERO_LENGTH'         // degenerate host — no span exists to occupy
  | 'OCC_WIDTH_NOT_POSITIVE'       // requested width is not a finite positive number
  | 'OCC_OFFSET_NOT_FINITE'        // requested offset is NaN / Infinity
  | 'OCC_OFFSET_BEFORE_WALL_START' // requested span starts before the wall
  | 'OCC_SPAN_BEYOND_WALL_END'     // requested span runs past the wall end
  | 'OCC_OVERLAPS_SIBLING';        // 1-D overlap with an existing opening (conflictIds names them)

/** The union as a VALUE, so the set can be iterated as well as type-checked. */
export const CAN_PLACE_REFUSAL_CODES = [
  'OCC_HOST_ZERO_LENGTH',
  'OCC_WIDTH_NOT_POSITIVE',
  'OCC_OFFSET_NOT_FINITE',
  'OCC_OFFSET_BEFORE_WALL_START',
  'OCC_SPAN_BEYOND_WALL_END',
  'OCC_OVERLAPS_SIBLING',
] as const satisfies readonly CanPlaceRefusalCode[];

/** Compile-time completeness — `never` only when the roster covers the union. */
type _RosterIsComplete =
  Exclude<CanPlaceRefusalCode, (typeof CAN_PLACE_REFUSAL_CODES)[number]> extends never
    ? true
    : ['MISSING FROM CAN_PLACE_REFUSAL_CODES', Exclude<CanPlaceRefusalCode, (typeof CAN_PLACE_REFUSAL_CODES)[number]>];
const _rosterIsComplete: _RosterIsComplete = true;
void _rosterIsComplete;

export interface CanPlaceResult {
  readonly valid: boolean;
  readonly conflictIds: readonly string[];
  /** Present exactly when `valid` is false — the refusal's identity. */
  readonly code?: CanPlaceRefusalCode;
  readonly reason?: string;
}

/**
 * §REFUSAL-IDENTITY-CANPLACE (GE-09) — THE renderer for a `canPlace` refusal.
 *
 * Replaces `occ.reason ?? 'opening placement rejected'` at the handler. That
 * fallback fired exactly when the validator refused AND said nothing — a sentence
 * with the grammatical shape of an explanation and the information content of a
 * shrug, indistinguishable from a real reason, HIDING the under-reporting
 * validator. C58 §1.13.8 states the seam rule it broke: "the resolver's
 * distinction MUST reach the card."
 *
 * Six distinct verdicts reached the user as one string. They are not
 * interchangeable to someone trying to act: two are fixed by moving the opening,
 * one by resizing it, one by fixing the wall, and two are malformed input. The
 * rendered text CARRIES the code so the distinction survives the trip to a sink
 * that takes only a string.
 *
 * A refusal that arrives with NO code is reported AS unidentified — a producer
 * that refuses without saying why is a defect that must stay visible.
 *
 * @returns the refusal text, or `undefined` when the result is valid.
 */
export function canPlaceRefusalText(result: CanPlaceResult): string | undefined {
  if (result.valid) return undefined;
  const code: string = result.code ?? 'OCC_UNIDENTIFIED';
  const sentence = result.reason !== undefined && result.reason.length > 0
    ? result.reason
    : result.code === undefined
      ? 'the occupancy check refused this placement without stating a reason — that omission is the defect'
      : DEFAULT_SENTENCE[result.code];
  const conflicts = result.conflictIds.length > 0
    ? ` (conflicts: ${result.conflictIds.join(', ')})`
    : '';
  return `[${code}] ${sentence}${conflicts}`;
}

/** One arm per union member — `Record<...>` makes a missing arm a compile error. */
const DEFAULT_SENTENCE: Record<CanPlaceRefusalCode, string> = {
  OCC_HOST_ZERO_LENGTH:         'the host wall has no length, so there is no span for an opening to occupy',
  OCC_WIDTH_NOT_POSITIVE:       'the requested opening width is not a positive number',
  OCC_OFFSET_NOT_FINITE:        'the requested opening offset is not a finite number',
  OCC_OFFSET_BEFORE_WALL_START: 'the requested opening starts before the wall does',
  OCC_SPAN_BEYOND_WALL_END:     'the requested opening runs past the end of the wall',
  OCC_OVERLAPS_SIBLING:         'the requested opening overlaps an opening already on this wall',
};

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
        code: 'OCC_HOST_ZERO_LENGTH',
        reason: 'Wall has zero length — cannot place openings',
      };
    }

    if (!Number.isFinite(widthM) || widthM <= 0) {
      return {
        valid: false,
        conflictIds: [],
        code: 'OCC_WIDTH_NOT_POSITIVE',
        reason: `Opening width must be > 0 (got ${widthM})`,
      };
    }
    if (!Number.isFinite(offsetM)) {
      return {
        valid: false,
        conflictIds: [],
        code: 'OCC_OFFSET_NOT_FINITE',
        reason: `Offset must be a finite number (got ${offsetM})`,
      };
    }

    const eps = OCCUPANCY_EPSILON_M;

    if (offsetM < -eps) {
      return {
        valid: false,
        conflictIds: [],
        code: 'OCC_OFFSET_BEFORE_WALL_START',
        reason: `Offset ${offsetM.toFixed(3)} m is before wall start`,
      };
    }

    const newEnd = offsetM + widthM;
    if (newEnd > wallLengthM + eps) {
      return {
        valid: false,
        conflictIds: [],
        code: 'OCC_SPAN_BEYOND_WALL_END',
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
        code: 'OCC_OVERLAPS_SIBLING',
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
