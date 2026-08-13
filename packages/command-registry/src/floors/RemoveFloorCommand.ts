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
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { Relationship } from '@pryzm/core-app-model';
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

  /**
   * §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6) — this producer
   * never purged the SemanticGraph while DeleteElementCommand's `floor` branch
   * did: two producers of the same delete, two behaviours. A well-formed edge
   * pointing at a deleted id is NOT self-erasing — it survives
   * serialize()/deserialize() and persists forever.
   *
   * Undo restores VERBATIM from a pre-delete capture rather than re-authoring
   * anything from the snapshot, per C71 §5.6 and the 3ee632f6 reference shape:
   * a reconstruction can only restore the edges the floor itself knows about
   * (levelId, coveredRoomIds, boundingWallIds) and silently drops whatever
   * another command authored against it.
   *
   * NOTE the asymmetry this makes visible: execute() ALREADY drove a
   * ReseatLevelElementsCommand — a full cross-element consequence — while
   * leaving the floor's own graph edges behind. One delete, one consequence
   * honoured and one silently skipped.
   */
  private _removedRelationships: Relationship[] | null = null;

  constructor(private readonly _payload: RemoveFloorPayload) {
    this.id = `cmd-floor-rm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_payload.floorId];
  }

  /**
   * §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — capture every edge touching any of
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
   * §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — undo side: re-add the captured edges
   * verbatim. addRelationship() re-mints ids but is idempotent on
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
      } catch { /* noop — graph write is non-fatal, as in CreateFloorCommand */ }
    }
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

    // §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — capture BEFORE any removal. Scoped
    // to the floor id alone: unlike RemoveCeilingCommand, this execute() does
    // NOT unregister serviceHoles, so their ids are still live elements and
    // purging their edges here would be an over-purge (C71 §5.6).
    this._captureRelationships([floorId]);

    // Remove in reverse order of creation: ①②③
    try { elementRegistry.unregister(floorId); } catch { /* not registered */ }
    try { context.bimManager.unregisterElement(floorId); } catch { /* not registered */ }
    // §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — …then purge the SEMANTIC graph,
    // matching DeleteElementCommand's floor branch so the two producers agree.
    try { semanticGraphManager.removeAllRelationshipsForElement(floorId); } catch { /* noop */ }
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

    // §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — restore the exact edges execute()
    // captured and purged, verbatim (never re-authored from snapshot.levelId).
    this._restoreRelationships();

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
