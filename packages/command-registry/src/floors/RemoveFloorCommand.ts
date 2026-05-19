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

    return { success: true, affectedElementIds: [floorId] };
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
