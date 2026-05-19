// TODO(E.5.x): ORPHANED — UpdateCeilingHandler (plugins/ceiling/src/handlers/UpdateCeiling.ts)
// was migrated to produceCommand (TASK-07 Phase B). This class is no longer called by
// that handler. Confirm no other live callers exist then remove in Phase E.5.x cleanup.
/**
 * UpdateCeilingCommand
 *
 * Contract: docs/01_ELEMENTS/12_Ceilings/04-CEILING-TOOL-STATE-MACHINE-CONTRACT.md §4.3
 *
 * Undo: restores the previous CeilingData snapshot via CeilingStore.restoreSnapshot().
 * Does NOT use ceilingStore.update() in the undo path — that would increment version
 * and overwrite modifiedAt, corrupting the audit trail (§R-6 violation).
 */

import {
  Command,
  CommandType,
  CommandValidationResult,
  CommandResult,
  SerializedCommand,
  CommandContext,
} from '../types';
import { CeilingData } from '@pryzm/core-app-model';

export interface UpdateCeilingPayload {
  ceilingId: string;
  updates: Partial<CeilingData>;
}

export class UpdateCeilingCommand implements Command {
    readonly affectedStores = ["ceiling"] as const;
  readonly id: string;
  readonly type = CommandType.UPDATE_CEILING;
  readonly timestamp: number;
  readonly targetIds: string[];

  private _previousSnapshot: CeilingData | null = null;

  constructor(private readonly _payload: UpdateCeilingPayload) {
    this.id = `cmd-ceiling-update-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_payload.ceilingId];
  }

  canExecute(context: CommandContext): CommandValidationResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) return { ok: false, reason: 'CeilingStore not available.' };
    if (!ceilingStore.has(this._payload.ceilingId)) {
      return { ok: false, reason: `Ceiling "${this._payload.ceilingId}" not found.` };
    }
    return { ok: true };
  }

  execute(context: CommandContext): CommandResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error('[UpdateCeilingCommand] CeilingStore not available.');

    // Snapshot before mutation — needed for undo.
    this._previousSnapshot = ceilingStore.getById(this._payload.ceilingId) ?? null;
    if (!this._previousSnapshot) {
      return { success: false, affectedElementIds: [], error: 'Ceiling not found.' };
    }

    const updated = ceilingStore.update(this._payload.ceilingId, this._payload.updates);
    if (!updated) {
      return { success: false, affectedElementIds: [], error: 'Update failed — see CeilingStore warnings.' };
    }

    return { success: true, affectedElementIds: [this._payload.ceilingId] };
  }

  undo(context: CommandContext): CommandResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error('[UpdateCeilingCommand.undo] CeilingStore not available.');

    if (!this._previousSnapshot) {
      console.warn('[UpdateCeilingCommand.undo] No snapshot — cannot undo.');
      return { success: false, affectedElementIds: [] };
    }

    // §R-6: Use restoreSnapshot (preserves metadata) NOT update() (increments version).
    ceilingStore.remove(this._payload.ceilingId);
    ceilingStore.restoreSnapshot(this._previousSnapshot);

    return { success: true, affectedElementIds: [this._payload.ceilingId] };
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
