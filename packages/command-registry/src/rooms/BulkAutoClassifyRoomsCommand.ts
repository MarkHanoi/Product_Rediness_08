/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Files Modified:    packages/command-registry/src/rooms/BulkAutoClassifyRoomsCommand.ts (NEW)
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 *           C16 §8.6 (one gesture = one undo entry) · C84 EI-7 (affectedElementIds
 *           == measured write set) · C84 EI-9 (one authority per concept)
 *
 * §ROOMTYPE142 — founder: *"Create an easy algorithm in the room schedule to
 * autofill based on elements within the rooms ... This should enable automatic
 * renaming of the rooms: at the moment called 'Room 02-009', then will be
 * 'Bedroom 002' or similar."*
 *
 * ⭐ ONE COMMAND, ONE UNDO ENTRY for the WHOLE batch, mirrored EXACTLY on
 * `UpdateRoomFinishesBulkCommand` (§RESI-FINISH-BULK, ADR-0087): one snapshot
 * per room actually mutated, captured in execute order, restored in reverse on
 * undo. The classification itself (which rule matched, which rooms are
 * UNCLASSIFIED, which are protected because a human already renamed them) is
 * computed BEFORE this command is constructed — by
 * `apps/editor/src/ui/property-inspector/RoomAutoOrganiser.ts`'s
 * `buildRoomAutofillProposals()`, using `@pryzm/spatial-index`'s
 * `classifyRoomForAutofill` (the ONE classifier — see that file's header for
 * why it is not a rival of `RoomTypeInferenceEngine`) and `@pryzm/ai-host`'s
 * `isAutoDefaultRoomName` (the ONE "did a human already name this room?" test —
 * reused from the L-905 chat-rename feature, not re-implemented here). This
 * command therefore takes an already-decided PATCH LIST, exactly like
 * `UpdateRoomFinishesBulkCommand` takes an already-decided finishes list — it
 * does not re-run the classifier and does not re-decide authorship, so a
 * preview modal that lets the user uncheck individual rows stays authoritative
 * over what actually gets written.
 *
 * §CONTEXT-DATA-HONESTY partial-failure policy (mirrors
 * `BulkUpdateKitchenMaterialCommand`): every patch the caller supplies is
 * applied; a room that vanished between the preview and Apply is skipped, not
 * thrown; a patch list resolving to zero surviving rooms is a visible refusal,
 * never a silent no-op.
 */

import {
  CommandType,
  type Command, type CommandValidationResult, type CommandResult,
  type SerializedCommand, type CommandContext,
} from '../types';
import type { RoomData, RoomOccupancyType } from '@pryzm/room-topology';

/** One room's decided autofill outcome — name AND occupancy change together,
 *  in ONE store patch (mirrors `RenameRoomCommand`'s combined patch: a rename
 *  that also carries an occupancy change is one gesture, not two). */
export interface RoomAutoClassifyPatch {
  readonly roomId: string;
  readonly name: string;
  readonly occupancyType: RoomOccupancyType;
}

export class BulkAutoClassifyRoomsCommand implements Command {
    readonly affectedStores = ['room'] as const;
  id = crypto.randomUUID();
  type = CommandType.BULK_AUTO_CLASSIFY_ROOMS;
  timestamp = Date.now();
  targetIds: string[];

  // One full pre-update snapshot per room actually mutated, in execute order —
  // same discipline as UpdateRoomFinishesBulkCommand, so undo restores every
  // previous name AND occupancy exactly, not just the two named fields.
  private snapshots: RoomData[] = [];
  /** Rooms in the patch list that no longer existed at execute time. */
  private _vanished: string[] = [];

  constructor(private readonly patches: readonly RoomAutoClassifyPatch[]) {
    this.targetIds = patches.map((p) => p.roomId);
  }

  /** Rooms skipped because they vanished between preview and apply — empty
   *  before execute(). */
  get vanished(): readonly string[] { return this._vanished; }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    if (this.patches.length === 0) {
      return { ok: false, reason: 'Nothing to rename — every room is either unclassified or already named by hand.' };
    }
    const anyPresent = this.patches.some((p) => !!roomStore.getById(p.roomId));
    if (!anyPresent) return { ok: false, reason: 'None of the proposed rooms could be found — nothing to change.' };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    this.snapshots = [];
    this._vanished = [];
    const affected: string[] = [];
    try {
      // ONE mutation pass over every decided room — one undo entry, not N.
      for (const { roomId, name, occupancyType } of this.patches) {
        const current = roomStore.getById(roomId);
        if (!current) { this._vanished.push(roomId); continue; } // best-effort: room vanished since preview
        this.snapshots.push(current);
        const patch: Partial<RoomData> = { name, occupancyType };
        roomStore.update(roomId, patch);
        affected.push(roomId);
      }
      const info: string[] = [
        `Renamed ${affected.length} of ${this.patches.length} room${this.patches.length === 1 ? '' : 's'}.`,
      ];
      if (this._vanished.length > 0) {
        info.push(`${this._vanished.length} skipped — no longer present: ${this._vanished.join(', ')}.`);
      }
      return { success: affected.length > 0, affectedElementIds: affected, info };
    } catch (err: any) {
      // Roll back whatever already applied so a mid-pass failure leaves no torn state.
      for (let i = this.snapshots.length - 1; i >= 0; i--) {
        try { roomStore.restoreSnapshot(this.snapshots[i]); } catch { /* best-effort */ }
      }
      this.snapshots = [];
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  undo(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || this.snapshots.length === 0) {
      return { success: false, affectedElementIds: [], error: 'Cannot undo — no snapshots' };
    }
    try {
      const restored: string[] = [];
      // Reverse order — the inverse of execute.
      for (let i = this.snapshots.length - 1; i >= 0; i--) {
        const snap = this.snapshots[i];
        roomStore.restoreSnapshot(snap);
        restored.push(snap.id);
      }
      return { success: true, affectedElementIds: restored };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { patches: this.patches },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }

  static deserialize(serialized: SerializedCommand): BulkAutoClassifyRoomsCommand {
    const payload = serialized.payload as { patches: readonly RoomAutoClassifyPatch[] };
    return new BulkAutoClassifyRoomsCommand(payload.patches);
  }
}
