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
import { ReseatLevelElementsCommand } from '../seating/ReseatLevelElementsCommand';

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

  /**
   * §FIX-SEATING-DYNAMIC-REDATUM — the re-seat run triggered by THIS update, if the
   * edit moved the finished floor level. Held so undo() can roll it back in the same
   * step: one Ctrl-Z must restore both the finish and everything standing on it.
   */
  private _reseat: ReseatLevelElementsCommand | null = null;

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

    // §FIX-SEATING-DYNAMIC-REDATUM — creation-time seating is not enough. Furniture,
    // plumbing and lighting bake an ABSOLUTE `position.y` resolved when they were
    // created; thicken a finish (or move it, or hide it) afterwards and every item
    // standing on it stays at the old datum and is buried. Re-seat the level whenever
    // this edit actually moved the FFL or changed which points it covers.
    //
    // Gated, not unconditional: a colour- or material-only edit must not touch a
    // single element. The re-seat is idempotent and skips unmoved items anyway, so
    // the gate is an optimisation and a clarity aid, not a correctness crutch.
    const affected = [this._payload.floorId];
    if (this._datumRelevant(this._beforeSnapshot, updated as FloorData)) {
      const levelId = (updated as FloorData).levelId ?? this._beforeSnapshot.levelId;
      if (levelId) {
        const reseat = new ReseatLevelElementsCommand(levelId);
        const r = reseat.execute(context);
        // Retain only if it actually moved something — an empty run has nothing to
        // undo and would otherwise leave a misleading no-op in the undo record.
        if (r.success && r.affectedElementIds.length > 0) {
          this._reseat = reseat;
          affected.push(...r.affectedElementIds);
        }
      }
    }

    return { success: true, affectedElementIds: affected };
  }

  /**
   * Did this edit move the FINISHED FLOOR LEVEL, or change where it applies?
   *
   * `resolveFflOffsetAt` reads exactly three things: `boundary.baseOffset` (the FFL
   * itself), `boundary.polygon` (which points the finish covers) and `visible` (a
   * hidden finish does not seat anything). `thickness` is included because the layer
   * editor drives `baseOffset` from the layer stack, and a thickness change that has
   * not yet been reflected in `baseOffset` still signals a build-up change.
   */
  private _datumRelevant(before: FloorData | null, after: FloorData | null): boolean {
    if (!before || !after) return false;
    if ((before.visible !== false) !== (after.visible !== false)) return true;
    const b = before.boundary;
    const a = after.boundary;
    if (!b || !a) return b !== a;
    if ((b.baseOffset ?? 0) !== (a.baseOffset ?? 0)) return true;
    if ((b.thickness ?? 0) !== (a.thickness ?? 0)) return true;
    return JSON.stringify(b.polygon ?? null) !== JSON.stringify(a.polygon ?? null);
  }

  undo(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[UpdateFloorCommand.undo] FloorStore not available.');

    if (!this._beforeSnapshot) {
      console.warn('[UpdateFloorCommand.undo] No before-snapshot captured — cannot undo.');
      return { success: false, affectedElementIds: [], error: 'No before-snapshot.' };
    }

    // §FIX-SEATING-DYNAMIC-REDATUM — undo the re-seat FIRST, while the elements still
    // hold the post-change Y this command gave them. The re-seat records absolute
    // before/after values, so order only matters for legibility, but restoring the
    // dependents before the host mirrors how execute() built the pair.
    if (this._reseat) {
      this._reseat.undo(context);
      this._reseat = null;
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
