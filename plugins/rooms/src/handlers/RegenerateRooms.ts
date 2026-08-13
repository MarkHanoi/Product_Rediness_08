// ─── RegenerateRoomsHandler — 'room.regenerate' (C80 GEN-GAP-1) ──────────────
//
// THE FIRST GENERATION-FAMILY BUS VERB IN THE REPOSITORY, and it does not
// regenerate. Read that sentence as the design, not as an apology.
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────
//
// C80 §0.1(1), re-measured at HEAD: every one of the nine generators — house,
// apartment, office, residential, ceiling, furnish and lighting layout
// executors plus two `ai-host` services — is a **UI controller**, and
// `grep -rn "\.regenerate'"` across `packages/`, `plugins/` and `apps/`
// returned **0 hits**. C80 states the consequence plainly:
//
//   "This is why nothing can enforce clear-then-rebuild centrally — there is
//    no central place, and it is also why a generation cannot be previewed,
//    refused, or undone as one unit: none of those are properties a UI
//    controller has."
//
// C80 §8's gap table names GEN-GAP-1 as the ONE gap that "blocks on NOTHING",
// and fixes the first task in its own words: **"wiring the existing refusal,
// not designing one."** This file is that wiring. It creates the central place.
//
// ── WHY IT REFUSES, AND WHAT WOULD MAKE IT STOP ──────────────────────────────
//
// `b0ca0c27` landed `check-authored-state-protection`, which seeds a level with
// one room a human DREW (`detectionMethod: 'manual-boundary'`) and one room
// topology flood-filled, then runs the live §GRAPH-CLEAR-FIRST loop —
// transcribed from `HouseLayoutExecutor.ts:1757-1766` — through the REAL
// RoomStore, the REAL CommandBus and the REAL `room.delete` handler. Its
// clause (b), verbatim, run for C80 on 2026-08-12:
//
//     (b) LIVE §GRAPH-CLEAR-FIRST over a level holding 1 AUTHORED + 1
//         generated room
//         → seeded=2 · remaining=0 · the authored room survived=false
//
// **A room whose boundary a human drew was destroyed.** Not predicted —
// executed, through the real handler, with the deletion `void`-dispatched and
// the failure path swallowed by an empty `catch {}`.
//
// The reason a v1 `room.regenerate` MUST NOT perform that clear is C80 §3.2's
// subject and it is **GEN-GAP-2**: no element in this repository carries
// provenance (`generationId` / `generatedBy` / `isGenerated` / `sourceGenerator`
// → 0 first-party element hits, C80 §0.1(2)). `RoomBoundary.detectionMethod` is
// the ONLY element-grain provenance signal that exists, it is
// room-topology-local, and per C80 §7.3(d) even ITS `auto-topology` value is
// ambiguous between "flood-filled" and "not recorded" because
// `roomSnapshotUtils.ts:156` also writes it as a `||` default.
//
// So the authority question (C80 §2.2) answers `unknown-authority` for
// essentially every room, and C80 §2.3 is explicit that this third answer
// **MUST NOT be treated as permission**:
//
//   "collapse it to `may` and a generator silently destroys the user's work
//    (what §GRAPH-CLEAR-FIRST does today); collapse it to `protected` and no
//    generator can ever run on a legacy model … Both collapses are
//    catastrophic and they are catastrophic in opposite directions."
//
// A v1 that regenerated would be the FIRST collapse, minted centrally, with a
// verb's authority behind it. That is strictly worse than the status quo. So
// this verb takes neither collapse: it refuses, in the open, with both numbers.
//
// **EXIT CONDITION, so this refusal is a debt with a name and not a permanent
// posture**: when GEN-GAP-2 lands the element-grain provenance field (roadmap
// Phase 8 / C75 §3's coverage ratchet), `execute()` calls the authority
// question — `mayRegenerate` / `planRegenerationClear`, which ALREADY EXIST and
// already refuse (`apps/editor/src/engine/provenance/ElementProvenanceIndex.ts`,
// C80 §0.1(4): *"The gap is not that nothing can refuse. The gap is that the
// live generator path does not ask."*) — and produces a `ConsequencePlan` for
// the clearable set instead of this blanket refusal. The refusal narrows to the
// protected and unknown-authority buckets. Nothing here needs redesigning for
// that; the plan-or-refusal shape is already the return contract.
//
// ── WHY THE REFUSAL IS RETURNED AND NOT THROWN (C16 CA-18) ───────────────────
//
// `canExecute({valid:false})` becomes a THROWN `CommandBusError`
// (`CommandBus.ts:426-432`), and a throw is exactly what a `catch {}` swallows
// — C80 §10.f's fire-and-forget shape, the very defect §0 measured. And a bare
// `{ forward: [], inverse: [] }` is PROHIBITED by C16 CA-18 shape (b) as the
// whole of a handler's effect, because it is indistinguishable from a mutation
// that silently did nothing.
//
// The refusal therefore rides as a VALUE on `HandlerResult.refusal`
// (`CapabilityRefusal`, C80 §1.4), whose `reason` is drawn from the CLOSED
// eleven-member `UndeterminedReason` union C78 §8.1 owns — no twelfth
// vocabulary is minted here (C69 §3.2's rival-list rule).
//
// `canExecute` still validates the PAYLOAD (C16 CA-3): a malformed levelId is a
// caller error and rejecting it is correct. What it does not do is convert the
// capability decision into a throw.
//
// ── WHICH UNION MEMBER, AND WHY NOT THE NEIGHBOURS ───────────────────────────
//
// **`RELATIONSHIP_NOT_RECORDED`** — "the relationship is known to exist as a
// concept but no producer writes it, so nothing can be traversed."
// element→origin is precisely such a relationship: C75 defines the vocabulary,
// C80 §2 defines the authority question over it, and NO PRODUCER WRITES IT onto
// an element. That is the exact sentence.
//
//   · NOT `NO_DEPENDENCY_INDEX` — that member is about a missing traversal
//     SUBSTRATE (dependency wiring, `joinedTo`). Here the substrate would be a
//     field on the element, and the concept is a relationship, not an index.
//   · NOT `ENGINE_NOT_AVAILABLE` — the engines are present and working. C80
//     §0.2 is emphatic that the generators are NOT the defect and §6.4 makes
//     rewriting one a MUST NOT. Blaming the engine would be false.
//   · NOT `UNSUPPORTED_ELEMENT_TYPE` — rooms are the ONE kind for which the
//     authority question is answerable at all (§0.1(2)). Rooms are the most
//     supported kind, not an unsupported one.
//   · NOT `STALE_DERIVED_STATE` — C78 §8.2 NARROWED that member specifically so
//     it stops being the default sink. Nothing here is stale; it was never
//     written.
//
// ── LAYERING / CA COMPLIANCE ────────────────────────────────────────────────
// CA-1  type registered in ROOM_HANDLER_TYPES · CA-3 canExecute validates the
// payload with a named reason · CA-14 `withHandlerSpan` · CA-16 writes no other
// family's store (it writes NO store) · CA-18 refuses with a named reason and
// returns neither a bare success nor silence · CA-19 `affectedStores: []` is
// TRUE here in the strongest sense — C80 §1.5's zero-mutation requirement makes
// it structural, not a bridge concession.
//
// ── C67 / C68 GOVERNANCE, AND THE PROOF IT IS ENFORCED ──────────────────────
//
// CLAUDE.md makes C67+C68 mandatory for any PR registering a bus command, and
// registering this verb puts `room.regenerate` in front of
// `tools/ga-gate/check-chat-capability-coverage.ts`, whose MAX_UNDECLARED is 0.
// It is declared class E (unsafe-to-expose) in
// `packages/ai-host/src/capabilities/ChatCommandClassification.ts` — NOT as a
// chat capability, because a capability advertising "I regenerate rooms" over a
// handler that returns a refusal would be a confident "Done" over a mutation
// that never happened.
//
// ⭐ That declaration is LOAD-BEARING, and it was measured rather than assumed
// (2026-08-13): deleting the one line that wires `E_REGENERATE` into
// `CHAT_CLASSIFIED` flips the gate to
//
//     [check-chat-capability-coverage] UNDECLARED: 1 (baseline 0)
//     FAIL — 1 undeclared bus command(s), baseline 0.
//       room.regenerate   [plugins/rooms/src/handlers/RegenerateRooms.ts]
//
// and it was restored byte-identical afterwards. Recorded because "the gate
// passes" and "the gate would notice if this were removed" are different facts,
// and only the second one protects the next person to touch this file.

import type {
  CapabilityRefusal,
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { capabilityRefused, withHandlerSpan } from '@pryzm/plugin-sdk';

export interface RegenerateRoomsPayload {
  /** The level whose rooms a generation pass proposes to replace. */
  readonly levelId: string;
  /**
   * OPTIONAL — the rooms the caller proposes to clear, when it has enumerated
   * them. Supplied ⇒ the refusal's `asked` count is REAL. Absent ⇒ `asked` is
   * `undefined`, never `0`: "the caller named no set" and "the caller named an
   * empty set" are different facts, and reporting both as zero is the
   * §CONTEXT-DATA-HONESTY defect (C80 §5.2) inside a refusal.
   */
  readonly roomIds?: readonly string[];
  /** WHICH generator is asking, for the refusal sentence. Free text. */
  readonly generator?: string;
}

/**
 * The refusal sentence, built where it can be unit-tested independently of the
 * bus. C80 §1.4's both-numbers discipline is structural here: the counts come
 * from the payload, and `protects` names the subject per C80 §3.2.
 */
export function buildRegenerationRefusal(
  cmd: RegenerateRoomsPayload,
): CapabilityRefusal {
  const generator = cmd.generator ?? 'a generation pass';
  // §5.2 discipline — an ABSENT list is `undefined`, not `0`.
  const asked = cmd.roomIds === undefined ? undefined : cmd.roomIds.length;
  // Every room is unaccounted-for today: no element carries provenance, so the
  // authority question answers `unknown-authority` for all of them. When the
  // list is absent this is `undefined` for the same reason `asked` is.
  const unaccountedFor = asked;

  const askedText = asked === undefined
    ? 'an unenumerated set of rooms'
    : `${asked} room(s)`;
  const unaccountedText = unaccountedFor === undefined
    ? 'every one of them is of unknown provenance'
    : `all ${unaccountedFor} are of unknown provenance`;

  return capabilityRefused({
    commandType: 'room.regenerate',
    reason: 'RELATIONSHIP_NOT_RECORDED',
    asked,
    unaccountedFor,
    protects:
      'rooms whose boundary a human drew (RoomBoundary.detectionMethod ' +
      "'manual-boundary' / 'point-pick') — which cannot yet be distinguished " +
      'from rooms a generator produced, because no element in this model ' +
      'carries provenance (C80 GEN-GAP-2, open)',
    detail:
      `${generator} asked to regenerate ${askedText} on level '${cmd.levelId}', and ${unaccountedText}. ` +
      'Regeneration is WITHHELD. No element in this model records where it came from, so a room a ' +
      'human drew is indistinguishable from one a generator produced (C80 §0.1(2): generationId / ' +
      'generatedBy / isGenerated → 0 element hits; RoomBoundary.detectionMethod is the only ' +
      'element-grain signal and it is room-local and itself ambiguous — roomSnapshotUtils.ts:156 ' +
      "writes 'auto-topology' as a || default). Overwriting them anyway would treat " +
      'unknown-authority as permission, which C80 §2.3 forbids by name — and which was MEASURED ' +
      'destroying a hand-drawn room on 2026-08-12 (check-authored-state-protection clause (b): ' +
      'seeded=2 · remaining=0 · the authored room survived=false). ' +
      'THE ASK: replace the rooms on this level. THE BLOCKER: element-grain provenance ' +
      '(C80 GEN-GAP-2 / roadmap Phase 8). This verb regenerates the moment authority can be ' +
      'established per element — the refusal will then narrow to the protected and ' +
      'unknown-authority buckets instead of covering the whole set.',
  });
}

export class RegenerateRoomsHandler
  implements CommandHandler<RegenerateRoomsPayload>
{
  readonly type = 'room.regenerate';
  /**
   * CA-19 — and here it is a STRUCTURAL truth rather than a bridge
   * concession: C80 §1.5 requires that this verb mutate NOTHING, so there is
   * no store to name. A future version that regenerates will declare the
   * stores it writes in the same commit that makes it write them.
   */
  readonly affectedStores = [] as const;

  /**
   * CA-3 — validates the PAYLOAD only. The capability decision is NOT taken
   * here: `canExecute({valid:false})` throws (`CommandBus.ts:426-432`) and a
   * throw is swallowable by the `catch {}` C80 §10.f names. The refusal must
   * be a value the caller reads, so it is produced in `execute()`.
   */
  canExecute(
    _ctx: HandlerContext,
    cmd: RegenerateRoomsPayload,
  ): ValidationResult {
    if (typeof cmd?.levelId !== 'string' || cmd.levelId.length === 0) {
      return {
        valid: false,
        reason: 'room.regenerate: levelId must be a non-empty string',
      };
    }
    if (cmd.roomIds !== undefined && !Array.isArray(cmd.roomIds)) {
      return {
        valid: false,
        reason: 'room.regenerate: roomIds must be an array of ids when provided',
      };
    }
    return { valid: true };
  }

  /**
   * Returns the typed refusal. ZERO store mutations (C80 §1.5), zero
   * dispatches, zero events — asserted by
   * `check-generation-is-consequential` arm (b) statically and by
   * `__tests__/roomRegenerate.test.ts` dynamically over a real bus.
   */
  execute(
    _ctx: HandlerContext,
    cmd: RegenerateRoomsPayload,
  ): HandlerResult {
    return withHandlerSpan(
      this.type + '.handler',
      { 'pryzm.command.type': this.type },
      () => ({
        // EMPTY BY CONSTRUCTION, and NOT a CA-18(b) silent no-op: the empty
        // pair is qualified by `refusal` below, which states what did not
        // happen and why. C80 §1.5 — a generation pass that cannot proceed
        // safely performs no mutation at all.
        forward: [],
        inverse: [],
        refusal: buildRegenerationRefusal(cmd),
      }),
    );
  }
}
