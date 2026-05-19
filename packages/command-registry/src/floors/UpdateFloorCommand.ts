/**
 * UpdateFloorCommand — Updates floor properties with full undo/redo via snapshot.
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/03-FLOOR-COMMAND-PIPELINE-CONTRACT.md §4.2
 *
 * Stores the pre-update snapshot at execute time so undo can fully restore.
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
import { ensureFloorCCW as ensureCCW } from '@pryzm/core-app-model';

export interface UpdateFloorPayload {
  floorId: string;
  updates: Partial<FloorData>;
}

export class UpdateFloorCommand implements Command {
    readonly affectedStores = ["floor"] as const;
  readonly id: string;
  readonly type = CommandType.UPDATE_FLOOR;
  readonly timestamp: number;
  readonly targetIds: string[];

  /** Pre-update snapshot captured in execute() — used by undo(). */
  private _beforeSnapshot: FloorData | null = null;

  constructor(private readonly _payload: UpdateFloorPayload) {
    this.id = `cmd-floor-upd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_payload.floorId];
  }

  canExecute(context: CommandContext): CommandValidationResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) return { ok: false, reason: 'FloorStore not available.' };
    if (!floorStore.getById(this._payload.floorId)) {
      return { ok: false, reason: `Floor "${this._payload.floorId}" not found.` };
    }
    return { ok: true };
  }

  execute(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[UpdateFloorCommand] FloorStore not available.');

    const existing = floorStore.getById(this._payload.floorId);
    if (!existing) throw new Error(`[UpdateFloorCommand] Floor "${this._payload.floorId}" not found.`);

    // Capture before-snapshot for undo
    this._beforeSnapshot = structuredClone(existing) as FloorData;

    const updates = { ...this._payload.updates };
    if (updates.boundary?.polygon) {
      updates.boundary = { ...updates.boundary, polygon: ensureCCW(updates.boundary.polygon) };
    }

    const updated = floorStore.update(this._payload.floorId, updates);
    if (!updated) throw new Error(`[UpdateFloorCommand] Failed to update floor "${this._payload.floorId}".`);

    return { success: true, affectedElementIds: [this._payload.floorId] };
  }

  undo(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[UpdateFloorCommand.undo] FloorStore not available.');

    if (!this._beforeSnapshot) {
      console.warn('[UpdateFloorCommand.undo] No before-snapshot captured — cannot undo.');
      return { success: false, affectedElementIds: [], error: 'No before-snapshot.' };
    }

    floorStore.restoreSnapshot(this._beforeSnapshot);
    return { success: true, affectedElementIds: [this._payload.floorId] };
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
