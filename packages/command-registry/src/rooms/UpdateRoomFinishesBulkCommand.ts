/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 3
 * Files Modified:    src/commands/rooms/UpdateRoomFinishesBulkCommand.ts
 * Classification:    A
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/03-ROOM-COMMAND-PIPELINE-CONTRACT.md
 *
 * §RESI-FINISH-BULK (ADR-0087) — apply `room.finishes` to MANY rooms in ONE command.
 * The residential-building generate authored finishes by firing one
 * `UpdateRoomFinishesCommand` per room (~250 commands), each pushed through the
 * full CommandManager path → undo-stack push + sync/redetect trigger + telemetry
 * PER ROOM. With ~11 store events × N rooms ≈ 2883 events, the §E.1 CRDT adapter
 * measured the whole drain as one ~19 s blackout. This bulk command collapses all
 * of that command-manager-level overhead into a SINGLE execute: one mutation pass,
 * one undo entry that reverts every room together. Mirrors UpdateRoomFinishesCommand
 * patch + snapshot semantics exactly (one snapshot per room → exact restore).
 */

import {
  CommandType,
  type Command, type CommandValidationResult, type CommandResult,
  type SerializedCommand, type CommandContext,
} from '../types';
import type { RoomData, RoomFinishes } from '@pryzm/room-topology';

/** One room's target finishes. */
export interface RoomFinishPatch {
  readonly roomId: string;
  readonly finishes: RoomFinishes;
}

export class UpdateRoomFinishesBulkCommand implements Command {
    readonly affectedStores = ["room"] as const;
  id = crypto.randomUUID();
  type = CommandType.UPDATE_ROOM_FINISHES_BULK;
  timestamp = Date.now();
  targetIds: string[];

  // §07 / M5 fix (mirrored): one full pre-update snapshot per room actually
  // mutated, captured in execute order so undo restores them all exactly.
  private snapshots: RoomData[] = [];

  constructor(private readonly patches: readonly RoomFinishPatch[]) {
    this.targetIds = patches.map(p => p.roomId);
  }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
    if (this.patches.length === 0) return { ok: false, reason: 'No room finishes to apply' };
    // At least one target must resolve — per-room misses are tolerated in execute
    // (best-effort, matching the residential pipeline's per-room skip).
    const anyPresent = this.patches.some(p => !!roomStore.getById(p.roomId));
    if (!anyPresent) return { ok: false, reason: 'No target rooms found' };
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    this.snapshots = [];
    const affected: string[] = [];
    try {
      // ONE mutation pass over every room. Each roomStore.update still emits its
      // own store events, but the whole pass runs inside a SINGLE command-manager
      // execute (one undo entry, one sync/redetect trigger), not N of them.
      for (const { roomId, finishes } of this.patches) {
        const current = roomStore.getById(roomId);
        if (!current) continue; // best-effort: skip a vanished room, mirror per-room skip
        this.snapshots.push(current);
        const patch: Partial<RoomData> = { finishes };
        roomStore.update(roomId, patch);
        affected.push(roomId);
      }
      return { success: true, affectedElementIds: affected };
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
      // Reverse order so an undo mirrors the inverse of execute.
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
}
