/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/RenameRoomCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 */

import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { RoomData, RoomOccupancyType } from '@pryzm/room-topology';

export class RenameRoomCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.RENAME_ROOM;
  timestamp = Date.now();
  targetIds: string[];

  // §07 / M5 fix: full pre-update snapshot so undo restores every derived
  // field (modifiedAt, version, etc.) — not just the named ones.
  private snapshot?: RoomData;

  constructor(
    private readonly roomId: string,
    // §L-905 (C78 §12) — `occupancyType` is ADDITIVE: "make room 003 a bedroom"
    // renames the auto-default label in the SAME gesture, and one gesture must
    // be ONE undo entry. Two sibling commands (RenameRoomCommand +
    // SetRoomOccupancyCommand) are two legacy history entries — two Ctrl+Z for
    // one user sentence — so the occupancy rides the SAME store patch here.
    // The full-RoomData snapshot above already restores it on undo.
    // §DEPT153 (L-12540+) — `department` rides the SAME combined patch for the
    // SAME reason occupancyType does: one gesture, one undo entry. This is the
    // "documented precedent" for the manual Department field (RoomPropertySection.ts)
    // and its bus verb (`room.setDepartment` → SetRoomDepartment.ts).
    private readonly updates: {
      name?: string; roomNumber?: string; occupancyType?: RoomOccupancyType; department?: string;
    },
  ) {
    this.targetIds = [roomId];
  }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    if (!roomStore.getById(this.roomId)) return { ok: false, reason: `Room '${this.roomId}' not found` };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    try {
      const current = roomStore.getById(this.roomId);
      if (!current) return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };

      this.snapshot = current;

      const patch: Partial<RoomData> = {};
      if (this.updates.name !== undefined)       patch.name       = this.updates.name;
      if (this.updates.roomNumber !== undefined) {
        patch.roomNumber = this.updates.roomNumber;
        // EI-7e (C84 §9) — RECORD the authorship, do not leave it to be inferred
        // from the value later. This command is the ONLY user-facing number path
        // (`room.setNumber` → SetRoomNumber.ts:90 → here; the Property Inspector
        // field at RoomPropertySection.ts:139 sends an arbitrary trimmed string).
        // Without this stamp `assignUniqueRoomNumbers` cannot tell the user's
        // '101' from a generator's '01', and re-detection overwrote both.
        // A BLANK number hands numbering back to the system, so the flag clears.
        const authored = this.updates.roomNumber.trim().length > 0;
        patch.metadata = { ...(patch.metadata ?? {}), roomNumberAuthored: authored } as RoomData['metadata'];
      }
      // §L-905 — occupancy in the SAME patch: one store update, one history
      // entry, one undo (the snapshot restore covers all three fields).
      if (this.updates.occupancyType !== undefined) patch.occupancyType = this.updates.occupancyType;

      // §DEPT153 (L-12540+) — department in the SAME patch, mirroring roomNumber's
      // own authorship stamp exactly (EI-7e, C84 §9): a HUMAN setting department
      // through this command (via `room.setDepartment`) must be RECORDED, not
      // inferred from the value, because an autofill-derived department
      // ("Residential") and a human-typed one are the identical shape. A blank
      // save clears the flag too — see RoomMetadata.departmentAuthored.
      if (this.updates.department !== undefined) {
        patch.department = this.updates.department;
        const authored = this.updates.department.trim().length > 0;
        patch.metadata = { ...(patch.metadata ?? {}), departmentAuthored: authored } as RoomData['metadata'];
      }

      roomStore.update(this.roomId, patch);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  undo(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || !this.snapshot) {
      return { success: false, affectedElementIds: [], error: 'Cannot undo — snapshot missing' };
    }

    try {
      // restoreSnapshot bypasses store-side derivation and rewrites the exact
      // pre-execute record (immutable contract — see RoomStore.restoreSnapshot).
      roomStore.restoreSnapshot(this.snapshot);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err: any) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { roomId: this.roomId, updates: this.updates },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
