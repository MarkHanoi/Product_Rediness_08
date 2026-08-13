// ─── boundingWallDetermination — layer (c) of the three-layer `boundingWallIds`
//     defect, closed at the READER (C78 §1.4 · C71 §4.4 · C79 §5.2.0/§7) ──────
//
// THE DEFECT THIS EXISTS TO END.
// `room.boundingWallIds` is denied three times over:
//   (a) WRITER  — hardcoded `[]` by `CreateFloorCommand` / `CreateCeilingCommand`
//                 (C79 §7.1).
//   (b) REBUILD — read at the wrong path by `rebuildSemanticGraph` (C78 §0.3;
//                 fixed 2026-08-13, commit a55ed23e).
//   (c) READER  — `room.boundingWallIds ?? []` at every consumer.
// Any ONE fix alone changes nothing observable, which is precisely why the
// family survived. This module closes (c).
//
// WHAT `?? []` DESTROYS. Three DIFFERENT facts arrive at a reader wearing the
// same value:
//   1. the room genuinely bounds ZERO walls (a real, determined answer);
//   2. the field is ABSENT because no producer ever wrote it (C79 §7.1 — the
//      writer's hardcoded `[]`, and the reason C78 §8.1 row 8 exists);
//   3. the record itself is missing / unreadable.
// C71 §4.4: *"`[]` may only ever mean zero results."* C78 §1.4: an absent field
// and a `?? []` are **UNDETERMINED**, never DETERMINED-unaffected.
//
// NO RIVAL VOCABULARY. The typed union is C78 §8.1's, closed at eleven members,
// and it already lives at `packages/command-bus/src/consequence.ts`
// (`UndeterminedReason` / `UndeterminedImpact` / `ImpactDetermination`). C79
// §5.2.0 fixes the mapping for THIS defect by name: an edge that was never a
// reference because the field naming the dependency is written empty is
// **`RELATIONSHIP_NOT_RECORDED`**. This module mints nothing — it classifies.
//
// WHY THE UNION IS RESTATED STRUCTURALLY RATHER THAN IMPORTED. `@pryzm/command-bus`
// is not a declared dependency of `@pryzm/core-app-model` (L2 → L1 would be a
// legal edge, but adding it is a manifest + lockfile change that would collide
// with concurrent work in this shared tree). The literal spellings below are
// therefore restated, and `boundingWallDetermination.test.ts` PINS them against
// the command-bus source text so a drift in the union is a test failure, not a
// silent fork. The type is structurally assignable to `ImpactDetermination`; a
// caller that does hold the command-bus dependency may widen to it directly.

/**
 * The C78 §8.1 member this module produces, restated structurally.
 * @see packages/command-bus/src/consequence.ts `UndeterminedReason` — the
 * authority. Only the members this module can legitimately produce are named;
 * the union there is closed at eleven and is NOT re-declared in full here,
 * because a partial copy of a closed union is a fork waiting to happen.
 */
export type BoundingWallUndeterminedReason = 'RELATIONSHIP_NOT_RECORDED';

/**
 * The answer to "which walls bound this room?", with its determination status
 * carried in the type rather than inferred from a length.
 *
 * Structurally assignable to `ImpactDetermination` from
 * `@pryzm/command-bus/consequence` — the `determined` arm's `elements`, and the
 * `undetermined` arm's `scope` / `reason` / `detail`, are the same field names
 * and the same meanings. `[]` is representable ONLY through the `determined`
 * arm, so "I found nothing" and "I could not look" are unrepresentable as the
 * same value (ADR-0322 §5).
 */
export type BoundingWallDetermination =
  | {
      readonly kind: 'determined';
      /** MAY be empty — and an empty DETERMINED set is a real answer: this
       *  room was examined and bounds zero walls. */
      readonly elements: readonly string[];
    }
  | {
      readonly kind: 'undetermined';
      /** WHAT question went unanswered, for a card / log line to render. */
      readonly scope: string;
      readonly reason: BoundingWallUndeterminedReason;
      readonly detail?: string;
    };

/**
 * Minimal shape read. Deliberately not `RoomData` — every measured reader holds
 * the room as `any` from a legacy store, and narrowing the parameter would just
 * push a cast to each call site.
 */
export interface BoundingWallCarrier {
  readonly id?: string;
  readonly boundingWallIds?: readonly string[] | null;
}

/**
 * THE discriminator. Replaces `room.boundingWallIds ?? []` at every reader.
 *
 * - a **present array** → `determined`, whatever its length. A room that was
 *   examined and bounds zero walls is a real answer and reads as `determined`
 *   with `elements: []`.
 * - **absent / null / not an array** → `undetermined` +
 *   `RELATIONSHIP_NOT_RECORDED` (C79 §5.2.0). The field names a dependency and
 *   nothing wrote it; per C78 §1.4 that is a known-unknown, not zero walls.
 * - **a missing room record** → `undetermined` too, with the scope naming it.
 *   A reader handed `undefined` did not learn that the room has no walls.
 *
 * PURE: no store access, no I/O, no throw.
 */
export function determineBoundingWalls(
  room: BoundingWallCarrier | null | undefined,
  scopeLabel?: string,
): BoundingWallDetermination {
  const scope = scopeLabel ?? `bounding walls of ${room?.id ?? 'an unidentified room'}`;

  if (room === null || room === undefined) {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_RECORDED',
      detail: 'no room record was supplied, so the bounding-wall relationship was never read',
    };
  }

  const raw = room.boundingWallIds;
  if (!Array.isArray(raw)) {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_RECORDED',
      detail:
        'room.boundingWallIds is absent — the field names a dependency that no producer wrote ' +
        '(C79 §7.1). Zero walls was NOT determined.',
    };
  }

  return { kind: 'determined', elements: raw };
}

/**
 * The ids, or `null` when they could not be determined.
 *
 * The migration affordance for the ~20 measured readers whose whole use of the
 * field is to iterate it: `?? []` becomes this, and the `null` arm forces the
 * caller to write down what it does when the answer is unknown. It is NOT a
 * shorthand for `?? []` — returning `null` where the old code returned `[]` is
 * exactly the observable difference this task exists to create.
 */
export function boundingWallIdsOrUnknown(
  room: BoundingWallCarrier | null | undefined,
): readonly string[] | null {
  const d = determineBoundingWalls(room);
  return d.kind === 'determined' ? d.elements : null;
}

/**
 * Is this determination a known-unknown? Sugar for UI branches that must render
 * a "cannot determine" state rather than an empty list (C78 §5 — discovery must
 * be able to refuse).
 */
export function isBoundingWallsUndetermined(
  d: BoundingWallDetermination,
): d is Extract<BoundingWallDetermination, { kind: 'undetermined' }> {
  return d.kind === 'undetermined';
}

/**
 * The one sentence a UI shows in place of an empty list. Kept here so the two
 * measured UI readers (HierarchyTreePanel's count and its element groups) cannot
 * drift into two different phrasings of the same refusal.
 */
export function boundingWallsUndeterminedLabel(
  d: Extract<BoundingWallDetermination, { kind: 'undetermined' }>,
): string {
  return `Bounding walls — cannot determine (${d.reason})`;
}
