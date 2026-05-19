import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { ColumnData } from '@pryzm/geometry-column';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';

export interface DeleteColumnPayload {
    columnId: string;
}

/**
 * DeleteColumnCommand
 *
 * §COLUMN-AUDIT-2026 §C2 — Mirrors `DeleteSlabCommand`, closes the five
 * symmetry breaks of the polymorphic `DeleteElementCommand` column branch:
 *
 *   (a) ctx.stores.columnStore — no window-global reads.
 *   (b) Pre-state captured via `structuredClone(column)` — no shallow `{...col}`.
 *   (c) Side-effect symmetry on execute():
 *         columnStore.remove(id)
 *         bimManager.unregisterElement(id)
 *         elementRegistry.unregister(id)
 *         semanticGraphManager.removeAllRelationshipsForElement(id)
 *   (d) Side-effect symmetry on undo():
 *         bimManager.registerElement(id, levelId)        — BEFORE store.add
 *         elementRegistry.registerSemantic(id, 'column') — so add subscribers see it
 *         semanticGraphManager.addRelationship({ type: 'sitsOn', ... })
 *         columnStore.add(snapshot)                      — fires the 'add' event
 *   (e) Snapshot carries the original `ifcData.guid`, so the columnStore.add
 *       legacy-warn path does NOT regenerate a fresh GUID — IFC stability
 *       across delete/undo is preserved.
 *
 * Contract compliance:
 *   §01 §2.1 Command-First — exclusive owner of the four side-effects.
 *   §01 §2.2 Pre-state captured via structuredClone before any mutation.
 *   §01 §2.3 Undo restores full snapshot AND re-registers in all four subsystems.
 *   §02 §2.1 BimManager kept in lock-step with the store across execute/undo.
 *   §03 §6.3 ElementRegistry + SemanticGraph kept in lock-step.
 *   §03 §2.3 IFC GUID preserved across delete/undo cycle.
 */
export class DeleteColumnCommand implements Command {
    readonly affectedStores = ['column'] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_COLUMN;
    readonly timestamp: number;
    readonly targetIds: string[];

    private _deletedColumn?: ColumnData;
    private readonly columnId: string;

    constructor(payload: DeleteColumnPayload | string) {
        // Accept either { columnId } payload (collaboration deserialization) or
        // a bare string id (programmatic dispatch from DeleteElementCommand).
        this.columnId = typeof payload === 'string' ? payload : payload.columnId;
        this.id = `cmd-delete-column-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [this.columnId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!this.columnId) return { ok: false, reason: 'DeleteColumnCommand: columnId is required.' };
        const col = ctx.stores.columnStore.get(this.columnId);
        if (!col) return { ok: false, reason: `Column ${this.columnId} not found.` };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const col = ctx.stores.columnStore.get(this.columnId);
        if (!col) return { success: false, affectedElementIds: [] };

        // (b) Deep snapshot — never mutate the live store entry between delete and undo.
        this._deletedColumn = structuredClone(col) as ColumnData;

        // (c) Symmetric tear-down — exact reverse order of CreateColumnCommand.execute().

        // 1. Remove from columnStore — fires 'remove' event → builder + snap-provider react.
        ctx.stores.columnStore.remove(this.columnId);

        // 2. Unregister from BimManager spatial authority.
        try {
            ctx.bimManager.unregisterElement(this.columnId);
        } catch (err) {
            console.warn(
                `[DeleteColumnCommand] bimManager.unregisterElement failed for ${this.columnId} (non-fatal):`,
                err,
            );
        }

        // 3. Unregister from ElementRegistry (semantic type lookup).
        try {
            elementRegistry.unregister(this.columnId);
        } catch (err) {
            console.warn(
                `[DeleteColumnCommand] elementRegistry.unregister failed for ${this.columnId} (non-fatal):`,
                err,
            );
        }

        // 4. Purge SemanticGraph relationships (`'sitsOn'` → level, plus any future).
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.columnId);
        } catch (err) {
            console.warn(
                `[DeleteColumnCommand] SemanticGraph cleanup failed for ${this.columnId} (non-fatal):`,
                err,
            );
        }

        return { success: true, affectedElementIds: [this.columnId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this._deletedColumn) return { success: false, affectedElementIds: [] };

        const snapshot = this._deletedColumn;
        const levelId = snapshot.levelId as string;

        // (d) Restore order mirrors CreateColumnCommand.execute() side-effect order.

        // 1. Re-register in BimManager BEFORE columnStore.add so any 'add' subscriber
        //    that queries bimManager finds the spatial entry already in place.
        try {
            ctx.bimManager.registerElement(this.columnId, levelId);
        } catch (err) {
            console.warn(
                `[DeleteColumnCommand.undo] bimManager.registerElement failed for ${this.columnId} (non-fatal):`,
                err,
            );
        }

        // 2. Re-register semantic type.
        try {
            elementRegistry.registerSemantic(this.columnId, 'column');
        } catch (err) {
            console.warn(
                `[DeleteColumnCommand.undo] elementRegistry.registerSemantic failed for ${this.columnId} (non-fatal):`,
                err,
            );
        }

        // 3. Restore SemanticGraph 'sitsOn' relationship to the original level.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: this.columnId,
                targetId: levelId,
                createdBy: 'DeleteColumnCommand.undo',
                metadata: {},
            });
        } catch (err) {
            console.warn(
                `[DeleteColumnCommand.undo] SemanticGraph restore failed for ${this.columnId} (non-fatal):`,
                err,
            );
        }

        // 4. Re-add to columnStore — snapshot carries the original ifcData.guid so
        //    the legacy fallback synth in ColumnStore.add does NOT trigger.
        ctx.stores.columnStore.add(snapshot);

        return { success: true, affectedElementIds: [this.columnId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { columnId: this.columnId } as Record<string, unknown>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    static deserialize(data: SerializedCommand): DeleteColumnCommand {
        return new DeleteColumnCommand(data.payload as DeleteColumnPayload);
    }
}
