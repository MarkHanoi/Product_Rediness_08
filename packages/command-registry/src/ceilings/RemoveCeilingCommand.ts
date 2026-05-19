/**
 * RemoveCeilingCommand
 *
 * Contract: docs/01_ELEMENTS/12_Ceilings/04-CEILING-TOOL-STATE-MACHINE-CONTRACT.md §4.2
 *
 * Spatial unregistration order (MANDATORY §R-3 — reverse of create):
 * ① elementRegistry.unregister(id) + each hole.elementId
 * ② bimManager.unregisterElement(id) + each hole.elementId
 * ③ ceilingStore.remove(id)
 *
 * Undo (re-create) order:
 * ① ceilingStore.restoreSnapshot()
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
import { CeilingData } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

const HOLE_SEMANTIC_MAP: Record<string, string> = {
  'light-fixture':   'ceiling-light-fixture',
  'hvac-diffuser':   'ceiling-hvac-diffuser',
  'skylight':        'ceiling-skylight',
  'access-hatch':    'ceiling-access-hatch',
  'structural-beam': 'ceiling-structural-beam',
  'generic':         'ceiling-hole',
};

export class RemoveCeilingCommand implements Command {
    readonly affectedStores = ["ceiling"] as const;
  readonly id: string;
  readonly type = CommandType.REMOVE_CEILING;
  readonly timestamp: number;
  readonly targetIds: string[];

  private _snapshot: CeilingData | null = null;

  constructor(private readonly _ceilingId: string) {
    this.id = `cmd-ceiling-remove-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_ceilingId];
  }

  canExecute(context: CommandContext): CommandValidationResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) return { ok: false, reason: 'CeilingStore not available.' };
    if (!ceilingStore.has(this._ceilingId)) {
      return { ok: false, reason: `Ceiling "${this._ceilingId}" not found.` };
    }
    return { ok: true };
  }

  execute(context: CommandContext): CommandResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error('[RemoveCeilingCommand] CeilingStore not available.');

    const ceiling = ceilingStore.getById(this._ceilingId);
    if (!ceiling) return { success: false, affectedElementIds: [], error: 'Ceiling not found.' };

    // Store snapshot for undo.
    this._snapshot = ceiling;

    // Unregistration order: ①②③
    try { elementRegistry.unregister(this._ceilingId); } catch { /* already unregistered */ }
    for (const hole of ceiling.holeElements) {
      try { elementRegistry.unregister(hole.elementId); } catch { /* already unregistered */ }
      try { context.bimManager.unregisterElement(hole.elementId); } catch { /* already unregistered */ }
    }
    try { context.bimManager.unregisterElement(this._ceilingId); } catch { /* already unregistered */ }
    ceilingStore.remove(this._ceilingId);

    return { success: true, affectedElementIds: [this._ceilingId] };
  }

  undo(context: CommandContext): CommandResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error('[RemoveCeilingCommand.undo] CeilingStore not available.');

    if (!this._snapshot) {
      console.warn('[RemoveCeilingCommand.undo] No snapshot — cannot restore.');
      return { success: false, affectedElementIds: [] };
    }

    const levelId = this._snapshot.levelId;

    // Restore order: ①②③
    ceilingStore.restoreSnapshot(this._snapshot);
    try { context.bimManager.registerElement(this._ceilingId, levelId); } catch { /* already registered */ }
    try { elementRegistry.registerSemantic(this._ceilingId, 'ceiling'); } catch { /* already registered */ }

    for (const hole of this._snapshot.holeElements) {
      try { context.bimManager.registerElement(hole.elementId, levelId); } catch { /* */ }
      try { elementRegistry.registerSemantic(hole.elementId, (HOLE_SEMANTIC_MAP[hole.subType] ?? 'ceiling') as any); } catch { /* */ }
    }

    return { success: true, affectedElementIds: [this._ceilingId] };
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { ceilingId: this._ceilingId },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
