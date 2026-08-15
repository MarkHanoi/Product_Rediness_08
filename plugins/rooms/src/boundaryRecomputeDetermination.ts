// ─── boundaryRecomputeDetermination — "I could not recompute this boundary"
//     stops being "the boundary is unchanged" (C78 §8.1 · C71 §4.4 · PR-11) ───
//
// THE SITE THIS EXISTS FOR. `plugins/rooms/src/handlers/RecomputeRoomBoundary.ts`,
// whose ENTIRE body was:
//
//     execute(): HandlerResult {
//       return { forward: [], inverse: [] };      // ← THE FINDING
//     }
//
// on a verb that is REGISTERED IN PRODUCTION (`registerRoomHandlers` ←
// `apps/editor/src/engine/engineLauncher.ts:530`) and declared in
// `ChatCommandClassification.ts` as class C_PLUMBING — *"derived-state plumbing
// dispatched by the editor itself (recomputes …)"*.
//
// FOUR DISTINGUISHABLE CASES, ONE VALUE. That single empty pair was returned when
//   (1) the boundary was recomputed and genuinely did not move — a real answer;
//   (2) the room store could not be read at all;
//   (3) the named id is not a room in the readable set;
//   (4) the geometry step ran and could not produce a ring (open loop, collapsed
//       ring, no walls on the level, no seed to flood-fill from).
// Only (1) is an answer. (2)–(4) are "I could not recompute", and the handler
// converted all three into the positive claim *the boundary is up to date*.
//
// WHY IT TRAVELS. An empty `{forward, inverse}` pair is what every instrument
// that counts registrations reads as COVERAGE: the verb is registered, it
// resolves, it never throws, and `check-verb-register` lists it. PR-11 names
// this shape directly — *"Registering a no-op and claiming coverage IS THE
// DEFECT, NOT THE FIX."* This module is the half that makes the verb answer.
//
// NO RIVAL VOCABULARY. The union is C78 §8.1's, CLOSED at eleven members, at
// `packages/command-bus/src/consequence.ts`. Exactly four members apply here:
//   · `INVALID_REQUEST`           — the caller named an id the readable room set
//                                   does not hold. The REQUEST is wrong, not the model.
//   · `RELATIONSHIP_NOT_READABLE` — the room or wall substrate is absent or threw.
//                                   "I could not look", precisely.
//   · `RELATIONSHIP_NOT_RECORDED` — the room carries no seedPoint, so the input
//                                   that records WHICH region it occupies was
//                                   never written. Nothing can be traced.
//   · `GEOMETRY_UNPREDICTABLE`    — the trace RAN and could not close a ring.
// Nothing is minted, nothing is extended, nothing is renamed — this module
// CLASSIFIES.
//
//   · NOT `STALE_DERIVED_STATE` — C78 §8.2 NARROWED that member specifically so
//     it stops being the default sink. A boundary that cannot be traced is not
//     stale; it was never derivable.
//   · NOT `TOPOLOGY_CHANGE_POSSIBLE` — that member belongs to the SPLIT/MERGE
//     question `predictRoomGeometry` answers (`@pryzm/room-topology`), which this
//     plugin deliberately does not depend on (see `SetRoomFinish.ts:79`,
//     `store.ts:37`). Claiming it here would name a determination this module
//     never makes.
//
// WHY THE UNION IS RESTATED STRUCTURALLY RATHER THAN IMPORTED. Identical
// reasoning to the four modules that already do this — `roomStoreDetermination`
// (room-topology), `boundingWallDetermination` (core-app-model),
// `wallRoomAdjacencyDetermination` (constraint-solver), `storeReadDetermination`
// (ai-host): `@pryzm/plugin-sdk` re-exports `UndeterminedReason` but NOT
// `ImpactDetermination`, and widening the L5 facade is a cross-lane edit. The
// companion test PINS these literals against the command-bus source text, so a
// drift in the closed union fails a test instead of forking in silence.
//
// SUB-REASONS ARE DELIBERATELY NOT PRODUCED. `analyseRoom` throws
// `DescriptorInvariantError` with a PROSE message; C78 §8.3 forbids branching on
// prose (*"no consumer may branch on it"*). Recovering `OPEN_LOOP` vs
// `COLLAPSED` would mean parsing that sentence, so this module classifies only
// what it can determine STRUCTURALLY and says `GEOMETRY_UNPREDICTABLE` once,
// honestly, rather than guessing a sub-reason it did not measure.

import type { Room, Wall } from '@pryzm/plugin-sdk';
import { recomputeRoomAnalytic, type RoomAnalyticUpdate } from './intent.js';

/**
 * The C78 §8.1 members this module can legitimately produce, restated
 * structurally.
 *
 * @see packages/command-bus/src/consequence.ts `UndeterminedReason` — the
 * authority. Only the producible members are named: a partial copy of a closed
 * union that lists members it never emits is a fork waiting to happen.
 */
export type RoomBoundaryUndeterminedReason =
  | 'INVALID_REQUEST'
  | 'RELATIONSHIP_NOT_READABLE'
  | 'RELATIONSHIP_NOT_RECORDED'
  | 'GEOMETRY_UNPREDICTABLE';

/**
 * The answer to ONE impact question, with determination status carried in the
 * TYPE rather than inferred from a length — `ImpactDetermination`'s shape
 * (`consequence.ts`), restated.
 *
 * `[]` is representable ONLY through the `determined` arm, so C71 §4.4 —
 * *"`[]` may only ever mean zero results"* — holds by construction. A
 * DETERMINED-unaffected room (the recompute ran, the boundary did not move) and
 * an UNDETERMINED one (the recompute could not run) are different values, not
 * the same empty array.
 */
export type RoomBoundaryImpact =
  | {
      readonly kind: 'determined';
      /**
       * MAY be empty. An empty DETERMINED set is a real answer: the boundary
       * was recomputed and nothing moved.
       */
      readonly elements: readonly string[];
    }
  | {
      readonly kind: 'undetermined';
      /** WHAT question went unanswered, for a card, a log line or a prompt. */
      readonly scope: string;
      readonly reason: RoomBoundaryUndeterminedReason;
      /** Free text for humans only (C78 §8.3). Never parsed, never branched on. */
      readonly detail: string;
    };

/** The analytic fields a boundary recompute can move. */
export interface RoomBoundaryAnalytic {
  readonly area: number;
  readonly perimeter: number;
  readonly boundingWallIds: readonly string[];
}

/**
 * The outcome of asking "recompute room R's boundary": the FORWARD impact (what
 * applying the recompute affects) and the INVERSE impact (what undoing it would
 * affect), each independently determined.
 *
 * The two are not redundant. A recompute that MOVED the boundary affects the
 * room in both directions; one that could not run affects nothing in either,
 * and says so with the same typed reason on both arms rather than reporting an
 * undetermined forward against a confidently-empty inverse.
 */
export interface RoomBoundaryRecomputeOutcome {
  readonly roomId: string;
  readonly forward: RoomBoundaryImpact;
  readonly inverse: RoomBoundaryImpact;
  /** TRUE only on the determined-and-moved arm. */
  readonly changed: boolean;
  /** Present ⇒ the recompute ran. The stored analytic before it. */
  readonly before?: RoomBoundaryAnalytic;
  /** Present ⇒ the recompute ran. The recomputed analytic. */
  readonly after?: RoomBoundaryAnalytic;
}

/** Minimal structural shapes; deliberately not the full schema types. */
interface MaybeRoom {
  readonly id?: unknown;
  readonly area?: unknown;
  readonly perimeter?: unknown;
  readonly boundingWallIds?: unknown;
  readonly boundaryMode?: unknown;
  readonly seedPoint?: unknown;
  readonly levelId?: unknown;
}

export interface RoomBoundaryRecomputeInput {
  readonly roomId: string;
  /**
   * The rooms the caller could read. `undefined` ⇒ the room store could NOT be
   * read (absent, no `getAll`, threw, or returned a non-array) — which is a
   * different fact from "the project holds no rooms" (`[]`), and the two must
   * not collapse (§CONTEXT-DATA-HONESTY / C71 §4.4).
   */
  readonly rooms: readonly Room[] | undefined;
  /** The walls the caller could read. Same `undefined`-vs-`[]` discipline. */
  readonly walls: readonly Wall[] | undefined;
  /**
   * Injected analyse step — defaults to this package's `recomputeRoomAnalytic`.
   * Injectable so the differentiating test can drive the geometry arms without
   * constructing a closed wall ring.
   */
  readonly analyse?: (
    room: Readonly<Room>,
    walls: readonly Readonly<Wall>[],
  ) => RoomAnalyticUpdate | undefined;
}

const undeterminedBoth = (
  roomId: string,
  reason: RoomBoundaryUndeterminedReason,
  detail: string,
): RoomBoundaryRecomputeOutcome => ({
  roomId,
  forward: { kind: 'undetermined', scope: `boundary recompute of room ${roomId}`, reason, detail },
  inverse: {
    kind: 'undetermined',
    scope: `undo of the boundary recompute of room ${roomId}`,
    reason,
    detail,
  },
  changed: false,
});

const numberOr = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const idsOf = (v: unknown): readonly string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** 1 mm² / 1 mm — below this a difference is float noise, not a boundary move. */
const AREA_EPSILON_M2 = 1e-6;
const LENGTH_EPSILON_M = 1e-3;

/**
 * THE boundary-recompute discriminator. Replaces `return { forward: [],
 * inverse: [] }`.
 *
 * - **room absent from a READABLE room set** → `undetermined` /
 *   `INVALID_REQUEST`. The caller named something that is not a room here.
 * - **room set unreadable** (`rooms === undefined`) → `undetermined` /
 *   `RELATIONSHIP_NOT_READABLE`. Nothing was read; this is NOT "no such room".
 * - **wall set unreadable** (`walls === undefined`) → `undetermined` /
 *   `RELATIONSHIP_NOT_READABLE`. The boundary is traced FROM walls.
 * - **`wallBound` room with no usable `seedPoint`** → `undetermined` /
 *   `RELATIONSHIP_NOT_RECORDED`. The input recording WHICH region the room
 *   occupies was never written, so no trace can start.
 * - **analyse returned nothing** → `undetermined` / `GEOMETRY_UNPREDICTABLE`.
 *   The trace RAN and could not close a ring.
 * - **analyse produced an analytic** → `determined`. `elements` is `[roomId]`
 *   when the boundary MOVED and `[]` when it did not — and the empty case is a
 *   real answer, not a shrug.
 *
 * TOTAL: never throws, so callers need no try/catch — which is what would
 * rebuild the very defect this closes.
 */
export function determineRoomBoundaryRecompute(
  input: RoomBoundaryRecomputeInput,
): RoomBoundaryRecomputeOutcome {
  const { roomId } = input;

  if (input.rooms === undefined) {
    return undeterminedBoth(
      roomId,
      'RELATIONSHIP_NOT_READABLE',
      'the room store could not be read (absent, no callable getAll, threw, or returned a ' +
        'non-array) — nothing was read, which is NOT the same as "this project holds no rooms"',
    );
  }
  if (input.walls === undefined) {
    return undeterminedBoth(
      roomId,
      'RELATIONSHIP_NOT_READABLE',
      'the wall store could not be read — a room boundary is traced FROM walls, so an ' +
        'unreadable wall set leaves the boundary undetermined, NOT unchanged',
    );
  }

  const room = input.rooms.find((r) => (r as MaybeRoom).id === roomId);
  if (room === undefined) {
    return undeterminedBoth(
      roomId,
      'INVALID_REQUEST',
      `the room store was read successfully (${input.rooms.length} room(s)) and holds no room ` +
        `with id '${roomId}'. The id may name a different element kind, or a room that was ` +
        'already deleted.',
    );
  }

  const raw = room as MaybeRoom;
  if (raw.boundaryMode === 'wallBound') {
    const seed = raw.seedPoint as { x?: unknown; y?: unknown; z?: unknown } | null | undefined;
    const seedUsable =
      seed !== null &&
      seed !== undefined &&
      Number.isFinite(seed.x) &&
      Number.isFinite(seed.y) &&
      Number.isFinite(seed.z);
    if (!seedUsable) {
      return undeterminedBoth(
        roomId,
        'RELATIONSHIP_NOT_RECORDED',
        `room '${roomId}' declares boundaryMode 'wallBound' but carries no usable seedPoint. ` +
          'The seed is the input that records WHICH enclosed region this room occupies; ' +
          'without it there is no point to flood-fill from and no boundary can be traced. ' +
          'Nothing recorded it — this is not a geometry failure.',
      );
    }
  }

  const before: RoomBoundaryAnalytic = {
    area: numberOr(raw.area, 0),
    perimeter: numberOr(raw.perimeter, 0),
    boundingWallIds: idsOf(raw.boundingWallIds),
  };

  const analyse = input.analyse ?? recomputeRoomAnalytic;
  let update: RoomAnalyticUpdate | undefined;
  try {
    update = analyse(room, input.walls);
  } catch (err) {
    return undeterminedBoth(
      roomId,
      'GEOMETRY_UNPREDICTABLE',
      `the boundary trace for room '${roomId}' threw: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  if (update === undefined) {
    return undeterminedBoth(
      roomId,
      'GEOMETRY_UNPREDICTABLE',
      `the boundary trace for room '${roomId}' ran and could not produce a closed ring ` +
        '(no walls on the room\'s level, a chain that does not close, or a ring of ' +
        '(near-)zero area). The previous analytic is LEFT INTACT rather than zeroed — a ' +
        'boundary that could not be traced is undetermined, not empty.',
    );
  }

  const after: RoomBoundaryAnalytic = {
    area: update.area,
    perimeter: update.perimeter,
    boundingWallIds: [...update.boundingWallIds],
  };

  const moved =
    Math.abs(after.area - before.area) > AREA_EPSILON_M2 ||
    Math.abs(after.perimeter - before.perimeter) > LENGTH_EPSILON_M ||
    !sameIds(before.boundingWallIds, after.boundingWallIds);

  // DETERMINED both ways. `elements: []` here is the real answer "the recompute
  // ran and this room's boundary did not move" — the case the old empty pair
  // was indistinguishable from.
  const elements = moved ? [roomId] : [];
  return {
    roomId,
    forward: { kind: 'determined', elements },
    inverse: { kind: 'determined', elements },
    changed: moved,
    before,
    after,
  };
}
