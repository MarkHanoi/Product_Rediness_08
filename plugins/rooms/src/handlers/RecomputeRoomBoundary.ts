// RecomputeRoomBoundaryHandler — re-derive a room's analytic from the current
// wall snapshot (S26, wall→room cross-rule).
//
// ═══════════════════════════════════════════════════════════════════════════════
// PR-11 — WHAT THIS FILE WAS, AND WHY THAT WAS THE DEFECT
// ═══════════════════════════════════════════════════════════════════════════════
// Until this commit the ENTIRE body was:
//
//     execute(): HandlerResult { return { forward: [], inverse: [] }; }
//
// on a verb that IS REGISTERED IN PRODUCTION — `registerRoomHandlers(_bus)` at
// `apps/editor/src/engine/engineLauncher.ts:530` — and that
// `ChatCommandClassification.ts` declares class C_PLUMBING: *"derived-state
// plumbing dispatched by the editor itself (recomputes …)"*.
//
// That is the shape the BIM30 gap register names on PR-11 itself, verbatim:
// **"Registering a no-op and claiming coverage IS THE DEFECT, NOT THE FIX."**
// A registered id with an empty implementation reads as COVERAGE to every
// instrument that counts registrations — `check-verb-register` lists it,
// the bus resolves it, it never throws — while answering nothing.
//
// The empty pair was returned for FOUR structurally different situations, one of
// which is a real answer and three of which are "I could not look":
//   (1) the boundary was recomputed and did not move   ← the only answer
//   (2) the room store could not be read at all
//   (3) the id names no room in the readable set
//   (4) the trace ran and could not close a ring
// `plugins/rooms/src/boundaryRecomputeDetermination.ts` is the module that
// separates them; this handler is its bus surface.
//
// ═══════════════════════════════════════════════════════════════════════════════
// MEASURED STATE OF THE SURROUNDING MACHINERY (2026-08-15) — stated so the next
// reader does not have to re-derive it, and so no sentence here overstates reach
// ═══════════════════════════════════════════════════════════════════════════════
//  • The previous header claimed this handler is *"Synthesised by
//    plugins/cross/src/wall-room.ts for every room a changed wall might bound"*
//    and *"kept … so the wall→room cascade rule has a target"*. Both were FALSE
//    in the present tense: `registerCrossHandlers` has ZERO production callers
//    and `CascadeRunner` is instantiated only in tests, so the rule fires on
//    ZERO wall edits. Production registration of the cascade is DEFERRED to
//    BIM30 plan R2 by a recorded disposition (ADR-0322 verdict / STR-06 §18) —
//    it is not this lane's to pre-empt, and PR-11's own sequencing rule is
//    "implement the handler FIRST".
//  • It also claimed the handler *"reads the live wall snapshot via
//    ctx.stores.wall"*. It did not — `affectedStores` is `[]` and it touched no
//    store. It does read a wall snapshot now, through the same `window` bridge
//    the eleven sibling room verbs use (§ROOM-ONE-LEGACY-SEAM).
//  • The plugin's own `RoomsState` is a DEPRECATED, DETACHED shim (`store.ts`
//    header, GE-04: *"Nothing reads this store's state; nothing writes it"*).
//    Writing Immer patches into it would be coverage theatre — and the bus
//    diagnoses the alternative anyway: patches returned with `affectedStores: []`
//    trip its own `§U-B6 UNDO-ROUTING BUG` report (`CommandBus.ts:477-483` — a
//    `console.error`, NOT a throw; it does not block, it records that the patches
//    are dropped from undo routing, which is the same outcome by a quieter road).
//    So REAL forward/inverse IMPACTS here are the C78 §8.1 determination
//    vocabulary, not Immer patches — that is the only tri-state channel this
//    verb can honestly speak.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY IT DETERMINES BUT DOES NOT WRITE — and the exit condition, so this is a
// debt with a name and not a permanent posture
// ═══════════════════════════════════════════════════════════════════════════════
// A recompute that WROTE would overwrite `RoomBoundary.polygon`. For a room whose
// boundary a human DREW (`detectionMethod: 'manual-boundary'` / `'point-pick'` —
// "User drew explicit polygon" / "User clicked inside a wall-enclosed zone") that
// destroys authored work, which is exactly the collapse C80 §2.3 forbids by name
// and which `check-authored-state-protection` clause (b) MEASURED on 2026-08-12:
// *seeded=2 · remaining=0 · the authored room survived=false*.
//
// The obvious guard — "write only when `detectionMethod === 'auto-topology'`" —
// still does not hold, though NOT for the reason an earlier draft of this header
// gave. ⚠ CORRECTED 2026-08-15 by reading the file: that draft said
// `auto-topology` "is ALSO written as a bare `||` default by
// `roomSnapshotUtils.ts:156`". Past tense. C75 REMOVED that default on
// 2026-08-12; `readBoundaryOrigin` (`packages/room-topology/src/
// roomSnapshotUtils.ts`) now parses the field with the union's own Zod schema and
// returns `origin-unknown` rather than fabricating a member. Citing a fixed
// defect in the present tense to justify a refusal is the same class of error as
// the no-op this commit removes, so it is corrected rather than inherited.
//
// The guard fails for the reason the FIX established: every snapshot written
// before 2026-08-12 carries NO `detectionMethod`, and the honest loader now reads
// those as `'origin-unknown'` + `predates-provenance` — *"an old snapshot is not
// evidence about origin in either direction"* (C75 §2.5). So the population this
// verb meets is dominated by rooms whose authority is RECORDED AS UNKNOWN, and
// unknown authority is not permission: a guard keyed on `=== 'auto-topology'`
// would refuse them anyway, and a guard keyed on `!== 'manual-boundary'` would
// overwrite a hand-drawn boundary the moment its provenance predates the field.
// Treating unknown authority as permission is C80 §2.3's first collapse with a
// verb's authority behind it.
//
// What HAS changed is that the exit is now reachable: for a room that positively
// declares `'manual-boundary'` / `'point-pick'` / `'auto-topology'` post-C75, the
// value is trustworthy and a per-room decision becomes possible. That is the
// GEN-GAP-2 work, not this lane's — see EXIT CONDITION below.
//
// This is not a novel judgement — it is the posture the SIBLING verb in this very
// directory already takes for the same reason (`RegenerateRooms.ts`, C80
// GEN-GAP-1), and it is why that file refuses rather than clears.
//
// So this verb REFUSES THE WRITE, in the open, with the REAL COMPUTED NUMBERS —
// the before/after area, perimeter and bounding-wall set it actually derived.
// That is categorically not the no-op it replaces: a no-op answered nothing; this
// reads the model, traces the boundary, and reports precisely what would change.
//
// **EXIT CONDITION**: when per-room boundary authority can be established
// (C80 GEN-GAP-2 / roadmap Phase 8), the determined-and-moved arm commits
// through `UpdateRoomBoundaryCommand` — already re-exported by this plugin's
// single legacy seam (`legacyCommands.ts`) and already undo-safe (snapshot +
// `restoreSnapshot`) — or through `ApplyPredictedRoomGeometryCommand`, which
// exists precisely so preview and execution cannot disagree. Nothing here needs
// redesigning for that: the determination is already the return contract.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE ONE EMPTY PAIR THAT SURVIVES, AND WHAT IT MEANS
// ═══════════════════════════════════════════════════════════════════════════════
// Exactly ONE branch returns a bare `{forward: [], inverse: []}` with no
// `refusal`: DETERMINED-unaffected — the recompute RAN and the boundary did not
// move. That is a real answer (C71 §4.4: `[]` may only ever mean zero results).
// Every other outcome carries a typed `CapabilityRefusal` whose `reason` is drawn
// from the CLOSED eleven-member `UndeterminedReason` union C78 §8.1 owns. So the
// empty pair now means precisely one thing instead of four, and
// `__tests__/recomputeRoomBoundary.test.ts` pins each arm against the others.
//
// CA COMPLIANCE — CA-1 type registered in ROOM_HANDLER_TYPES · CA-3 canExecute
// validates the payload with a named reason · CA-14 `withHandlerSpan` · CA-16
// writes no other family's store (it writes NO store) · CA-18 never returns a
// bare empty pair as the whole of its effect, and never reports success for an
// answer it does not have · CA-19 `affectedStores: []` is true.

import {
  capabilityRefused,
  withHandlerSpan,
  type CapabilityRefusal,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type Room,
  type ValidationResult,
  type Wall,
} from '@pryzm/plugin-sdk';
import {
  determineRoomBoundaryRecompute,
  type RoomBoundaryImpact,
  type RoomBoundaryRecomputeOutcome,
} from '../boundaryRecomputeDetermination.js';

export interface RecomputeRoomBoundaryPayload {
  readonly roomId: string;
  /** Optional source attribution recorded by the cross-rule for tracing. */
  readonly cascadedFrom?: string;
  readonly wallId?: string;
}

/**
 * Total store reader — `undefined` means "could NOT be read", which the
 * determination module converts into a typed `RELATIONSHIP_NOT_READABLE`.
 *
 * The four unreadable cases are deliberately NOT collapsed into `[]`: an absent
 * store, a store with no callable `getAll`, a `getAll` that threw and a `getAll`
 * that returned a non-array are all "I could not look", and `[]` is the positive
 * claim "there are none". That collapse is the `check-no-empty-means-unknown`
 * ARM A finding this module refuses to re-create (the `readRoomsDetermined`
 * precedent, `packages/room-topology/src/roomStoreDetermination.ts`).
 */
function readAll<T>(store: unknown): readonly T[] | undefined {
  if (store === null || store === undefined) return undefined;
  const fn = (store as { getAll?: unknown }).getAll;
  if (typeof fn !== 'function') return undefined;
  let raw: unknown;
  try {
    raw = (fn as () => unknown).call(store);
  } catch {
    return undefined;
  }
  return Array.isArray(raw) ? (raw as readonly T[]) : undefined;
}

/** The numbers a refusal must carry (C80 §1.4 — both numbers, never prose-only). */
function describeDelta(outcome: RoomBoundaryRecomputeOutcome): string {
  const { before, after } = outcome;
  if (before === undefined || after === undefined) return 'no delta was computed';
  const fmt = (n: number): string => n.toFixed(3);
  const added = after.boundingWallIds.filter((w) => !before.boundingWallIds.includes(w));
  const removed = before.boundingWallIds.filter((w) => !after.boundingWallIds.includes(w));
  return (
    `area ${fmt(before.area)} m² → ${fmt(after.area)} m², ` +
    `perimeter ${fmt(before.perimeter)} m → ${fmt(after.perimeter)} m, ` +
    `bounding walls ${before.boundingWallIds.length} → ${after.boundingWallIds.length}` +
    (added.length > 0 ? ` (+${added.join(', ')})` : '') +
    (removed.length > 0 ? ` (−${removed.join(', ')})` : '')
  );
}

/** UNDETERMINED → a typed refusal carrying the C78 §8.1 member verbatim. */
function refuseUndetermined(
  roomId: string,
  impact: Extract<RoomBoundaryImpact, { kind: 'undetermined' }>,
): CapabilityRefusal {
  return capabilityRefused({
    commandType: 'room.recomputeBoundary',
    reason: impact.reason,
    asked: 1,
    unaccountedFor: 1,
    protects:
      "the room's last known boundary — a recompute that could not run must leave the " +
      'cached analytic INTACT and say so, never zero it and never report the boundary as ' +
      'up to date (C71 §4.4: undetermined is not "unchanged")',
    detail:
      `asked to recompute the boundary of room '${roomId}'; 1 of 1 could not be determined. ` +
      impact.detail,
  });
}

/** DETERMINED-and-moved → the write is withheld, with the real numbers. */
function refuseWithheldWrite(outcome: RoomBoundaryRecomputeOutcome): CapabilityRefusal {
  return capabilityRefused({
    commandType: 'room.recomputeBoundary',
    reason: 'RELATIONSHIP_NOT_RECORDED',
    asked: 1,
    unaccountedFor: 1,
    protects:
      "rooms whose boundary a human drew (RoomBoundary.detectionMethod 'manual-boundary' / " +
      "'point-pick') — which cannot yet be distinguished from a flood-filled one for the " +
      'rooms that matter, because every boundary snapshot written before 2026-08-12 carries ' +
      "no detectionMethod at all and loads as 'origin-unknown' / predates-provenance (C75 " +
      '§2.5: an old snapshot is not evidence about origin in either direction). Unknown ' +
      'authority is not permission (C80 GEN-GAP-2, open)',
    detail:
      `the boundary of room '${outcome.roomId}' WAS recomputed and it MOVED: ` +
      `${describeDelta(outcome)}. The recomputed boundary is NOT written. ` +
      'Overwriting RoomBoundary.polygon would destroy a hand-drawn boundary wherever the ' +
      'provenance value is a default rather than a determination — treating unknown ' +
      'authority as permission, which C80 §2.3 forbids by name and which ' +
      'check-authored-state-protection clause (b) measured on 2026-08-12 ' +
      '(seeded=2 · remaining=0 · the authored room survived=false). ' +
      'THE ASK: refresh this room\'s cached boundary. THE BLOCKER: per-room boundary ' +
      'authority (C80 GEN-GAP-2 / roadmap Phase 8). This verb commits the delta through ' +
      'UpdateRoomBoundaryCommand the moment authority can be established per room.',
  });
}

export class RecomputeRoomBoundaryHandler
  implements CommandHandler<RecomputeRoomBoundaryPayload, Record<string, unknown>>
{
  readonly type = 'room.recomputeBoundary';
  // CA-19 — TRUE: this verb writes no store. The plugin `RoomsState` is a
  // detached shim (GE-04) and the authoritative RoomStore is written only
  // through the legacy seam, which this verb deliberately does not invoke yet
  // (see the WHY IT DETERMINES BUT DOES NOT WRITE section above).
  readonly affectedStores = [] as const;

  /** CA-3 — validates the PAYLOAD only; the capability decision is a VALUE. */
  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RecomputeRoomBoundaryPayload,
  ): ValidationResult {
    if (typeof cmd?.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RecomputeRoomBoundaryPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const w = globalThis as unknown as { roomStore?: unknown; wallStore?: unknown };
      const outcome = determineRoomBoundaryRecompute({
        roomId: cmd.roomId,
        rooms: readAll<Room>(w.roomStore),
        walls: readAll<Wall>(w.wallStore),
      });

      if (outcome.forward.kind === 'undetermined') {
        // EMPTY BY CONSTRUCTION and NOT a silent no-op: the pair is qualified by
        // `refusal`, which names WHICH C78 §8.1 member applies and what is protected.
        return {
          forward: [],
          inverse: [],
          refusal: refuseUndetermined(cmd.roomId, outcome.forward),
        };
      }

      if (outcome.changed) {
        // DETERMINED-affected. The delta is real and it is reported with both
        // numbers; the WRITE is withheld pending per-room boundary authority.
        return { forward: [], inverse: [], refusal: refuseWithheldWrite(outcome) };
      }

      // DETERMINED-unaffected — THE ONE branch that returns a bare empty pair,
      // and it now means exactly one thing: the recompute RAN and the boundary
      // did not move. C71 §4.4 — `[]` may only ever mean zero results.
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
