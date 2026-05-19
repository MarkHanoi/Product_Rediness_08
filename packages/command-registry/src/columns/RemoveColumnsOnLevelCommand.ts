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

export interface RemoveColumnsOnLevelPayload {
    levelId: string;
}

/**
 * RemoveColumnsOnLevelCommand
 *
 * §COLUMN-AUDIT-2026 §C1 — Non-undoable level-cascade column deletion FIX.
 *
 * Mirror of `RemoveSlabsOnLevelCommand` (§FIX-8 cmd-ref pattern). When a level
 * is deleted, all columns on that level must be removed from the columnStore,
 * bimManager, elementRegistry AND the SemanticGraph. Previously
 * `ColumnLevelCleanupHandler` called `columnStore.remove()` directly making
 * the cascade non-undoable and silently leaking the registrations in the
 * other three subsystems.
 *
 * This command makes batch column removal a first-class, undoable operation:
 *
 *   execute() — discovers all columns on the target level at execution time,
 *               captures structuredClone snapshots of each, then removes
 *               them from the store, bimManager, elementRegistry, and
 *               SemanticGraph (`'sitsOn'` relationship).
 *
 *   undo()    — re-adds all captured column snapshots to the store,
 *               re-registers each in bimManager + elementRegistry, and
 *               restores the `'sitsOn'` relationship to the original level,
 *               so Ctrl+Z on a level deletion fully restores both the level
 *               AND all columns that were on it.
 *
 * Contract compliance:
 * - §01 §2.1 Command-First: no direct store mutations outside execute/undo.
 * - §01 §2.2/§2.3 Undo/Redo: full structuredClone snapshots captured in execute().
 * - §02 §2.1: bimManager.unregisterElement on every removed column; symmetric
 *   bimManager.registerElement on undo.
 * - §03 §6.3: elementRegistry + SemanticGraph kept in lock-step with the store.
 *
 * Intended call site: ColumnLevelCleanupHandler.onLevelRemoved() — invoked by
 * the 'bim-level-removed' DOM event that DeleteLevelCommand fires after its
 * own execute(). This keeps level cleanup a single undo/redo entry from the
 * user's perspective (undo the level → columns come back automatically).
 */
export class RemoveColumnsOnLevelCommand implements Command {
    readonly affectedStores = ['column'] as const;
    readonly id: string;
    readonly type = CommandType.REMOVE_COLUMNS_ON_LEVEL;
    readonly timestamp: number;
    targetIds: string[];

    private snapshots: ColumnData[] = [];

    constructor(private payload: RemoveColumnsOnLevelPayload) {
        this.id = `cmd-remove-columns-on-level-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.payload.levelId) {
            return { ok: false, reason: 'RemoveColumnsOnLevelCommand: levelId is required.' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const columnsOnLevel = ctx.stores.columnStore
            .getAll()
            .filter((c) => c.levelId === this.payload.levelId);

        if (columnsOnLevel.length === 0) {
            return {
                success: true,
                affectedElementIds: [],
                info: [`No columns on level "${this.payload.levelId}".`],
            };
        }

        this.snapshots = columnsOnLevel.map((c) => structuredClone(c) as ColumnData);
        this.targetIds = this.snapshots.map((c) => c.id);

        for (const col of columnsOnLevel) {
            ctx.stores.columnStore.remove(col.id);

            try {
                ctx.bimManager.unregisterElement(col.id);
            } catch {
                /* may already be unregistered if the level deletion cascaded */
            }

            try {
                elementRegistry.unregister(col.id);
            } catch {
                /* may already be absent */
            }

            try {
                semanticGraphManager.removeAllRelationshipsForElement(col.id);
            } catch (err) {
                console.warn(
                    `[RemoveColumnsOnLevelCommand] SemanticGraph cleanup failed for ${col.id} (non-fatal):`,
                    err,
                );
            }
        }

        console.log(
            `[RemoveColumnsOnLevelCommand] Removed ${this.snapshots.length} column(s) ` +
                `from level "${this.payload.levelId}".`,
        );

        return {
            success: true,
            affectedElementIds: this.targetIds,
            info: [
                `Removed ${this.snapshots.length} column(s) from level "${this.payload.levelId}".`,
            ],
        };
    }

    undo(ctx: CommandContext): CommandResult {
        if (this.snapshots.length === 0) {
            return { success: true, affectedElementIds: [], info: ['Nothing to restore.'] };
        }

        for (const snapshot of this.snapshots) {
            // 1. Re-register in BimManager BEFORE store.add so any 'add' subscriber
            //    that queries bimManager finds the entry.
            try {
                ctx.bimManager.registerElement(snapshot.id, snapshot.levelId);
            } catch {
                /* may already be registered (redo path) */
            }

            // 2. Re-register semantic type.
            try {
                elementRegistry.registerSemantic(snapshot.id, 'column');
            } catch {
                /* may already be registered */
            }

            // 3. Restore SemanticGraph 'sitsOn' relationship to the original level.
            try {
                semanticGraphManager.addRelationship({
                    type: 'sitsOn',
                    sourceId: snapshot.id,
                    targetId: snapshot.levelId,
                    createdBy: 'RemoveColumnsOnLevelCommand.undo',
                    metadata: {},
                });
            } catch (err) {
                console.warn(
                    `[RemoveColumnsOnLevelCommand.undo] SemanticGraph restore failed for ${snapshot.id} (non-fatal):`,
                    err,
                );
            }

            // 4. Re-add to columnStore — fires 'add' event → builder rebuilds geometry.
            ctx.stores.columnStore.add(snapshot);
        }

        console.log(
            `[RemoveColumnsOnLevelCommand] UNDO: Restored ${this.snapshots.length} column(s) ` +
                `on level "${this.payload.levelId}".`,
        );

        return {
            success: true,
            affectedElementIds: this.targetIds,
            info: [
                `Restored ${this.snapshots.length} column(s) on level "${this.payload.levelId}" (undo).`,
            ],
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                levelId: this.payload.levelId,
            } as Record<string, unknown>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    static deserialize(data: SerializedCommand): RemoveColumnsOnLevelCommand {
        return new RemoveColumnsOnLevelCommand(data.payload as RemoveColumnsOnLevelPayload);
    }
}
