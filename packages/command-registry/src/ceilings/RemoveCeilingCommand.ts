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
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { Relationship } from '@pryzm/core-app-model';

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

  /**
   * §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6) — this producer
   * never purged the SemanticGraph while DeleteElementCommand's `ceiling`
   * branch did: two producers of the same delete, two behaviours. A
   * well-formed edge pointing at a deleted id is NOT self-erasing — it
   * survives serialize()/deserialize() and persists forever.
   *
   * Undo restores VERBATIM from a pre-delete capture rather than re-authoring
   * anything from the snapshot, per C71 §5.6 and the 3ee632f6 reference
   * shape: a reconstruction can only restore the edges the ceiling itself
   * knows about (levelId) and silently drops whatever another command
   * authored against it (a room's `contains`, an IFC importer's `partOf`).
   *
   * SCOPE NOTE: the capture spans the ceiling AND its hole elements, because
   * execute() unregisters the holes too — an edge to a hole is stranded by
   * exactly the same delete.
   */
  private _removedRelationships: Relationship[] | null = null;

  constructor(private readonly _ceilingId: string) {
    this.id = `cmd-ceiling-remove-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_ceilingId];
  }

  /**
   * §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — capture every edge touching any of
   * `ids` (source OR target), deduped by relationship id. Mirrors 3ee632f6's
   * `_captureRelationships`. MUST run before any removal.
   */
  private _captureRelationships(ids: string[]): void {
    const byRelId = new Map<string, Relationship>();
    for (const eid of ids) {
      if (!eid) continue;
      for (const rel of semanticGraphManager.getRelationships(eid)) {
        byRelId.set(rel.id, { ...rel });
      }
    }
    this._removedRelationships = [...byRelId.values()];
  }

  /**
   * §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — undo side: re-add the captured
   * edges verbatim. addRelationship() re-mints ids but is idempotent on
   * (source, target, type), so redo→undo cycles cannot duplicate.
   */
  private _restoreRelationships(): void {
    if (!this._removedRelationships) return;
    for (const rel of this._removedRelationships) {
      try {
        semanticGraphManager.addRelationship({
          type: rel.type,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          createdBy: rel.createdBy,
          ...(rel.metadata ? { metadata: rel.metadata } : {}),
        });
      } catch { /* noop — graph write is non-fatal, as in CreateCeilingCommand */ }
    }
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

    // §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — capture BEFORE any removal, over
    // the ceiling AND every hole element this execute() is about to unregister.
    const holeIds = (ceiling.holeElements ?? []).map(h => h.elementId).filter(Boolean);
    this._captureRelationships([this._ceilingId, ...holeIds]);

    // Unregistration order: ①②③
    try { elementRegistry.unregister(this._ceilingId); } catch { /* already unregistered */ }
    for (const hole of ceiling.holeElements) {
      try { elementRegistry.unregister(hole.elementId); } catch { /* already unregistered */ }
      try { context.bimManager.unregisterElement(hole.elementId); } catch { /* already unregistered */ }
      // …the hole's own edges die with the hole.
      try { semanticGraphManager.removeAllRelationshipsForElement(hole.elementId); } catch { /* noop */ }
    }
    try { context.bimManager.unregisterElement(this._ceilingId); } catch { /* already unregistered */ }
    // §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — …then purge the SEMANTIC graph,
    // matching DeleteElementCommand's ceiling branch so the two producers agree.
    try { semanticGraphManager.removeAllRelationshipsForElement(this._ceilingId); } catch { /* noop */ }
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

    // §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — restore the exact edges execute()
    // captured and purged, verbatim (never re-authored from snapshot.levelId).
    this._restoreRelationships();

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
