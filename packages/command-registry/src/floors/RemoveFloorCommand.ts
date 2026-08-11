/**
 * RemoveFloorCommand — Deletes a floor with full undo restoration.
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/03-FLOOR-COMMAND-PIPELINE-CONTRACT.md §4.3
 *
 * Undo reversal order:
 * ① floorStore.add() (restore snapshot)
 * ② bimManager.registerElement()
 * ③ elementRegistry.registerSemantic()
 */

import {
  Command,
  CommandType,
  CommandValidationResult,
  CommandResult,
  SerializedCommand,
  CommandContext,
} from '../types';
import { FloorData } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
// §FIX-SEATING-DYNAMIC-REDATUM (W1-4) — deleting a finish LOWERS the FFL. The re-seat is
// the exact mirror of the create arm; leaving it off would strand every item on that floor
// hovering 15 mm in the air, which is the same defect with the sign flipped.
import { ReseatLevelElementsCommand } from '../seating/ReseatLevelElementsCommand';

export interface RemoveFloorPayload {
  floorId: string;
}

export class RemoveFloorCommand implements Command {
    readonly affectedStores = ["floor"] as const;
  readonly id: string;
  readonly type = CommandType.REMOVE_FLOOR;
  readonly timestamp: number;
  readonly targetIds: string[];

  /** Full floor snapshot captured in execute() for undo restoration. */
  private _removedSnapshot: FloorData | null = null;

  /** §FIX-SEATING-DYNAMIC-REDATUM (W1-4) — retained so `undo()` restores the exact prior Y. */
  private _reseat: ReseatLevelElementsCommand | null = null;

  constructor(private readonly _payload: RemoveFloorPayload) {
    this.id = `cmd-floor-rm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_payload.floorId];
  }

  canExecute(context: CommandContext): CommandValidationResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) return { ok: false, reason: 'FloorStore not available.' };
    if (!floorStore.has(this._payload.floorId)) {
      return { ok: false, reason: `Floor "${this._payload.floorId}" not found.` };
    }
    return { ok: true };
  }

  execute(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[RemoveFloorCommand] FloorStore not available.');

    const existing = floorStore.getById(this._payload.floorId);
    if (!existing) {
      console.warn(`[RemoveFloorCommand] Floor "${this._payload.floorId}" not found — already removed.`);
      return { success: true, affectedElementIds: [] };
    }

    // Capture snapshot for undo
    this._removedSnapshot = structuredClone(existing) as FloorData;

    const floorId = this._payload.floorId;

    // Remove in reverse order of creation: ①②③
    try { elementRegistry.unregister(floorId); } catch { /* not registered */ }
    try { context.bimManager.unregisterElement(floorId); } catch { /* not registered */ }
    floorStore.remove(floorId);

    // §FIX-SEATING-DYNAMIC-REDATUM (W1-4) — the finish is gone, so the FFL over its
    // footprint drops back to the slab top (or to the next-highest remaining finish, which
    // `resolveFflOffsetAt`'s highest-wins tie-break resolves). Re-seat AFTER the store
    // removal so the resolver reads the post-delete world. Idempotent and absolute: items
    // that did not move are skipped and never enter the undo record.
    const affected = [floorId];
    const levelId = this._removedSnapshot.levelId;
    if (levelId) {
      const reseat = new ReseatLevelElementsCommand(levelId);
      const r = reseat.execute(context);
      if (r.success && r.affectedElementIds.length > 0) {
        this._reseat = reseat;
        affected.push(...r.affectedElementIds);
      }
    }

    return { success: true, affectedElementIds: affected };
  }

  undo(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[RemoveFloorCommand.undo] FloorStore not available.');

    if (!this._removedSnapshot) {
      console.warn('[RemoveFloorCommand.undo] No snapshot to restore.');
      return { success: false, affectedElementIds: [], error: 'No snapshot.' };
    }

    const snap = this._removedSnapshot;

    // Restore in creation order: ①②③
    floorStore.restoreSnapshot(snap);
    try { context.bimManager.registerElement(snap.id, snap.levelId); } catch { /* already registered */ }
    try { elementRegistry.registerSemantic(snap.id, 'floor'); } catch { /* already registered */ }

    // §FIX-SEATING-DYNAMIC-REDATUM (W1-4) — lift the dependents back with the finish. The
    // stored records carry absolute before/after Y, so this restores exactly, never a delta.
    if (this._reseat) {
      this._reseat.undo(context);
      this._reseat = null;
    }

    return { success: true, affectedElementIds: [snap.id] };
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { ...this._payload },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
