// ─── wallRoomAdjacencyDetermination — the wall→room hop, with its determination
//     status carried in the TYPE (C78 §1.4 · §5 · C71 §4.4 · C79 §5.2.0) ──────
//
// THE DEFECT THIS EXISTS TO END, and why it is the sharpest instance in this
// package. Four tier-1 compliance rules make the same single hop:
//
//     const adjacent = roomStore.getRoomsAdjacentToWall?.(door.wallId) ?? [];
//
// That is ARM B of `check-no-empty-means-unknown`: the METHOD is optional-called,
// so `undefined` — "this store does not implement wall→room adjacency at all" —
// and `[]` — "this wall genuinely bounds no rooms" — arrive at the rule wearing
// the SAME value. They are opposite truths.
//
// WHY IT INVERTS THE VERDICT, rather than merely losing a check. Each of the
// three dangerous rules builds a POSITIVE membership set and then asserts on its
// ABSENCE:
//
//   · ROOM_NEEDS_DOOR       — `roomsWithDoor` stays empty, so EVERY non-exempt
//     room in the project is emitted at `severity: 'error'`, citing "Building
//     Regulations Part B (fire egress)", with the message "no door found on any
//     bounding wall". A store missing one method fabricates a fire-safety
//     failure against a perfectly valid model.
//   · HABITABLE_NEEDS_WINDOW — identically, "habitable room has no window".
//   · ACCESSIBLE_ROUTE      — `roomDoorWidths` stays empty, so `maxWidth`
//     collapses to `0` and the engine reports "widest door is 0mm" AS A
//     MEASUREMENT, citing BS 8300:2018 §5.3.
//
// This is the `FacadeOrientationService` shape (C79 §5.2.0, commit bed7aa67):
// **an absence becoming a positive, regulation-citing claim**. It is worse here
// only because the output is compliance advice a human acts on, and because
// `validateAll` is re-run by `WallMoveConsequencePlanner` /
// `WallCreateConsequencePlanner` as a before/after diff — so a phantom error
// becomes a phantom CONSEQUENCE shown pre-commit.
//
// The head guard at each rule (`if (!roomStore || !doorStore) return []`) does
// NOT catch this: a roomStore that EXISTS but lacks the method sails straight
// past it and into the `?.`.
//
// NO RIVAL VOCABULARY. The typed union is C78 §8.1's, closed at eleven members,
// living at `packages/command-bus/src/consequence.ts` (`UndeterminedReason` /
// `UndeterminedImpact` / `ImpactDetermination`). The member for "the store does
// not record/expose this relationship" is `RELATIONSHIP_NOT_RECORDED`, which
// C79 §5.2.0 names for exactly this defect. This module mints nothing.
//
// WHY THE UNION IS RESTATED STRUCTURALLY RATHER THAN IMPORTED. Identical
// reasoning to `packages/core-app-model/src/boundingWallDetermination.ts`:
// `@pryzm/command-bus` is not a declared dependency of `@pryzm/constraint-solver`,
// and adding it is a manifest + lockfile change that would collide with
// concurrent work in this shared tree. The literal is therefore restated and
// `wallRoomAdjacencyDetermination.test.ts` PINS it against the command-bus
// source text, so a drift in the closed union fails a test rather than forking
// silently. The type is structurally assignable to `ImpactDetermination`.

/**
 * The C78 §8.1 member this module produces, restated structurally.
 * @see packages/command-bus/src/consequence.ts `UndeterminedReason` — the
 * authority. Only the member this module can legitimately produce is named; a
 * partial copy of a closed union is a fork waiting to happen.
 */
export type WallRoomAdjacencyUndeterminedReason = 'RELATIONSHIP_NOT_RECORDED';

/**
 * The answer to "which rooms does this wall bound?", with its determination
 * status carried in the type rather than inferred from a length.
 *
 * Structurally assignable to `ImpactDetermination` from
 * `@pryzm/command-bus/consequence`: the `determined` arm's `elements`, and the
 * `undetermined` arm's `scope` / `reason` / `detail`, are the same field names
 * with the same meanings. `[]` is representable ONLY through the `determined`
 * arm, so C71 §4.4 ("`[]` may only ever mean zero results") holds by
 * construction.
 */
export type WallRoomAdjacencyDetermination =
  | {
      readonly kind: 'determined';
      /** MAY be empty — and an empty DETERMINED set is a real answer: the
       *  adjacency was read, and this wall bounds zero rooms. */
      readonly elements: readonly unknown[];
    }
  | {
      readonly kind: 'undetermined';
      /** WHAT question went unanswered, for a card / log line to render. */
      readonly scope: string;
      readonly reason: WallRoomAdjacencyUndeterminedReason;
      readonly detail?: string;
    };

/**
 * The minimal store shape the four rules actually use. Deliberately not
 * `RoomStore` — `ConstraintContext` holds six `any` handles, and narrowing here
 * would only push a cast to each rule.
 */
export interface WallRoomAdjacencyReader {
  getRoomsAdjacentToWall?: (wallId: string) => unknown[] | null | undefined;
}

/**
 * THE discriminator. Replaces `roomStore.getRoomsAdjacentToWall?.(id) ?? []`.
 *
 * - **method present, returns an array** → `determined`, whatever its length. A
 *   wall that was examined and bounds zero rooms is a real answer.
 * - **method ABSENT** → `undetermined` + `RELATIONSHIP_NOT_RECORDED`. The store
 *   does not implement the wall→room hop; nothing was read, so "zero rooms" was
 *   never determined. This is ARM B by construction (C78 §20).
 * - **method present but THREW, or returned a non-array** → `undetermined` too.
 *   A throw is "I could not look" by definition (ARM A's rule).
 * - **no store at all** → `undetermined`, with the scope naming the wall.
 *
 * TOTAL: never throws, so a rule may call it inside its own loop without a
 * try/catch that would rebuild the very defect this closes.
 */
export function determineRoomsAdjacentToWall(
  roomStore: WallRoomAdjacencyReader | null | undefined,
  wallId: string,
): WallRoomAdjacencyDetermination {
  const scope = `rooms bounded by wall ${wallId}`;

  if (roomStore === null || roomStore === undefined) {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_RECORDED',
      detail: 'no room store was supplied, so wall→room adjacency was never read',
    };
  }

  const fn = roomStore.getRoomsAdjacentToWall;
  if (typeof fn !== 'function') {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_RECORDED',
      detail:
        'the room store does not implement getRoomsAdjacentToWall — the wall→room ' +
        'relationship is not recorded by this store. Zero bounding rooms was NOT determined.',
    };
  }

  let raw: unknown;
  try {
    raw = fn.call(roomStore, wallId);
  } catch (e) {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_RECORDED',
      detail: `getRoomsAdjacentToWall threw: ${String((e as Error)?.message ?? e)}`,
    };
  }

  if (!Array.isArray(raw)) {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_RECORDED',
      detail:
        'getRoomsAdjacentToWall returned a non-array, so the adjacency answer could not be read',
    };
  }

  return { kind: 'determined', elements: raw };
}

/**
 * A rule's accumulated view of the wall→room hop across a whole `check()` pass.
 *
 * WHY A RULE NEEDS THIS AND NOT JUST THE PER-WALL ANSWER. The three dangerous
 * rules assert on the ABSENCE of a room from a positive membership set. If ANY
 * wall's adjacency was undetermined, the set is incomplete, and "room X is not
 * in the set" no longer supports "room X has no door" — the very inference the
 * rule exists to make. So the honest disposition is per-PASS, not per-wall.
 *
 * NEGATIVE CONTROL BUILT INTO THE DESIGN (the point the task calls out): this
 * does NOT declare every pass undetermined. `sawUndetermined` flips only when a
 * real refusal arrives. A pass over a store that DOES implement the method
 * stays fully determined, and every rule keeps firing exactly as before —
 * including firing correctly on a genuinely door-less room. A fix that refused
 * everywhere would be the same defect with the opposite sign.
 */
export class AdjacencyPass {
  private _sawUndetermined = false;
  private _firstDetail: string | undefined;
  private _firstScope: string | undefined;

  /**
   * Read one wall's bounding rooms, recording a refusal if it could not be
   * determined. Returns the rooms to credit — empty when undetermined, but the
   * PASS now knows the difference, which is the whole point.
   */
  read(roomStore: WallRoomAdjacencyReader | null | undefined, wallId: string): readonly unknown[] {
    const d = determineRoomsAdjacentToWall(roomStore, wallId);
    if (d.kind === 'undetermined') {
      if (!this._sawUndetermined) {
        this._sawUndetermined = true;
        this._firstScope = d.scope;
        this._firstDetail = d.detail;
      }
      return [];
    }
    return d.elements;
  }

  /**
   * TRUE when at least one wall's adjacency could not be determined during this
   * pass — i.e. the membership set is INCOMPLETE and no absence-based verdict
   * may be drawn from it.
   */
  get incomplete(): boolean {
    return this._sawUndetermined;
  }

  /**
   * The refusal a rule emits INSTEAD of its absence-based findings, as a typed
   * `undetermined` determination. C78 §5: discovery must be able to refuse, and
   * the refusal must be VISIBLE — not an empty result list.
   */
  refusal(scopeLabel: string): Extract<WallRoomAdjacencyDetermination, { kind: 'undetermined' }> {
    return {
      kind: 'undetermined',
      scope: scopeLabel,
      reason: 'RELATIONSHIP_NOT_RECORDED',
      ...(this._firstDetail !== undefined
        ? { detail: `${this._firstDetail} (first seen at: ${this._firstScope})` }
        : {}),
    };
  }

  /** The sentence a rule puts in a `ValidationResult.message`. */
  message(what: string): string {
    return (
      `${what} could not be determined — the wall→room adjacency relationship was not ` +
      `readable for at least one wall (RELATIONSHIP_NOT_RECORDED), so no room may be ` +
      `reported as compliant or non-compliant on this rule`
    );
  }
}
