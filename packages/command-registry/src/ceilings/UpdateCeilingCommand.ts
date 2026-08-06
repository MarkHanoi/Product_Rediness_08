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
import { ReseatLevelElementsCommand } from '../seating/ReseatLevelElementsCommand';

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

  /**
   * §FIX-SEATING-DYNAMIC-REDATUM — re-seat triggered by this edit, held so undo()
   * rolls the ceiling-hung fixtures back together with the ceiling itself.
   */
  private _reseat: ReseatLevelElementsCommand | null = null;

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

    // §FIX-SEATING-DYNAMIC-REDATUM — the mirror of the floor case. A downlight hangs
    // from the FINISHED SOFFIT (`baseOffset + height − thickness`, per
    // `resolveCflOffsetAt` / `CeilingPanelBuilder`). Drop the ceiling, or thicken its
    // build-up, and every ceiling-hung fixture must come down with it — otherwise the
    // fixture is swallowed by the new plenum. Seating was resolved once at create
    // time and never revisited, so it did not.
    const affected = [this._payload.ceilingId];
    if (this._soffitMoved(this._previousSnapshot, updated as CeilingData)) {
      const levelId = (updated as CeilingData).levelId ?? this._previousSnapshot.levelId;
      if (levelId) {
        const reseat = new ReseatLevelElementsCommand(levelId);
        const r = reseat.execute(context);
        if (r.success && r.affectedElementIds.length > 0) {
          this._reseat = reseat;
          affected.push(...r.affectedElementIds);
        }
      }
    }

    return { success: true, affectedElementIds: affected };
  }

  /**
   * Did the FINISHED SOFFIT move, or the area it covers change?
   *
   * `resolveCflOffsetAt` reads `baseOffset + height − thickness`, `boundary.polygon`
   * and `visible` — so those are exactly the inputs that matter here.
   */
  private _soffitMoved(before: CeilingData | null, after: CeilingData | null): boolean {
    if (!before || !after) return false;
    if ((before.visible !== false) !== (after.visible !== false)) return true;
    const b = before.boundary;
    const a = after.boundary;
    if (!b || !a) return b !== a;
    const soffit = (x: typeof b): number =>
      (x.baseOffset ?? 0) + (x.height ?? 0) - (x.thickness ?? 0);
    if (Math.abs(soffit(b) - soffit(a)) > 1e-9) return true;
    return JSON.stringify(b.polygon ?? null) !== JSON.stringify(a.polygon ?? null);
  }

  undo(context: CommandContext): CommandResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error('[UpdateCeilingCommand.undo] CeilingStore not available.');

    if (!this._previousSnapshot) {
      console.warn('[UpdateCeilingCommand.undo] No snapshot — cannot undo.');
      return { success: false, affectedElementIds: [] };
    }

    // §FIX-SEATING-DYNAMIC-REDATUM — roll the hung fixtures back with the ceiling.
    if (this._reseat) {
      this._reseat.undo(context);
      this._reseat = null;
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
