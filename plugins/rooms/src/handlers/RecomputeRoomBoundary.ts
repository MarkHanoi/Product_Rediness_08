// RecomputeRoomBoundaryHandler — re-derive a room's analytic from the current wall
// snapshot (S26, wall→room cross-rule). Synthesised by
// `plugins/cross/src/wall-room.ts` for every room a changed wall might bound.
//
// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — converted to a NO-OP LEGACY BRIDGE
// (`affectedStores:[]`). Same store-key root cause as its siblings (L-75): the
// previous `affectedStores:['room']` mismatched the bus storeKey `'rooms'` and
// threw "required store 'room' is missing" (ADR-002 §3) — and because this handler
// fires on EVERY wall create/move/resize/level-change, it threw on every such edit.
// The old body also mutated the disconnected plugin `RoomsState` that neither the
// renderer nor persistence read.
//
// Why a no-op (not a forwarded command): in the legacy-authoritative world the
// DETECTED / RENDERED / PERSISTED rooms live in `window.roomStore`, whose analytics
// are kept in sync by the legacy room-detection path independently of this plugin
// bus. There is no per-room legacy "recompute" command — the only legacy analog is
// a full `ReDetectRooms` (all rooms, renumbers), which would be catastrophic to run
// on every wall geometry change. So the correct bridge is to do nothing here and
// let the legacy store own room analytics; the P8 span is preserved for tracing.
//
// TODO(F-1.4): restore the authoritative plugin-store recompute (see git history)
// once the detected-room world is migrated off the legacy RoomStore.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';

export interface RecomputeRoomBoundaryPayload {
  readonly roomId: string;
  /** Optional source attribution recorded by the cross-rule for tracing. */
  readonly cascadedFrom?: string;
  readonly wallId?: string;
}

export class RecomputeRoomBoundaryHandler
  implements CommandHandler<RecomputeRoomBoundaryPayload, Record<string, unknown>>
{
  readonly type = 'room.recomputeBoundary';
  // No plugin store is touched — the legacy RoomStore owns room analytics.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RecomputeRoomBoundaryPayload,
  ): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    _cmd: RecomputeRoomBoundaryPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      // Intentional no-op — the legacy RoomStore keeps room analytics in sync (see
      // header). Kept as a registered handler so the wall→room cascade rule has a
      // target and never throws on wall edits.
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
