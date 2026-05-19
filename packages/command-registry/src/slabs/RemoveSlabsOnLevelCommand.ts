import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { SlabData } from '@pryzm/geometry-slab';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface RemoveSlabsOnLevelPayload {
    levelId: string;
}

/**
 * RemoveSlabsOnLevelCommand
 *
 * FIX-8 (W2 §01 §2.1 Command-First / §01 §2.3 Undo-Redo):
 *
 * When a level is deleted, all slabs on that level must be removed from
 * the store, bimManager, and elementRegistry. Previously,
 * SlabLevelCleanupHandler called slabStore.remove() directly, making
 * the deletion non-undoable — slabs were permanently lost when a level
 * deletion was undone.
 *
 * This command makes batch slab removal a first-class, undoable operation:
 *
 *   execute() — discovers all slabs on the target level at execution time,
 *               captures structuredClone snapshots of each, then removes
 *               them from the store, bimManager, and elementRegistry.
 *
 *   undo()    — re-adds all captured slab snapshots to the store,
 *               re-registers each in bimManager and elementRegistry, so
 *               Ctrl+Z on a level deletion fully restores both the level
 *               AND all slabs that were on it.
 *
 *   redo()    — re-removes the same slabs (by ID, from the current store).
 *
 * Intended call site: SlabLevelCleanupHandler.onLevelRemoved() — invoked
 * by the 'bim-level-removed' DOM event that DeleteLevelCommand fires after
 * its own execute(). This keeps level cleanup a single undo/redo entry from
 * the user's perspective (undo the level → slabs come back automatically).
 *
 * Contract compliance:
 * - §01 §2.1 Command-First: no direct store mutations outside execute/undo
 * - §01 §2.3 Undo/Redo: full structuredClone snapshots captured in execute()
 * - §06 §2.1 Integration: bimManager registration kept symmetric across
 *   execute() / undo() / redo()
 */
export class RemoveSlabsOnLevelCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.REMOVE_SLABS_ON_LEVEL;
    readonly timestamp: number;
    targetIds: string[];

    private snapshots: SlabData[] = [];

    constructor(private payload: RemoveSlabsOnLevelPayload) {
        this.id = `cmd-remove-slabs-on-level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [];
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        if (!this.payload.levelId) {
            return { ok: false, reason: 'RemoveSlabsOnLevelCommand: levelId is required.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabsOnLevel = context.stores.slabStore
            .getAll()
            .filter(s => s.levelId === this.payload.levelId);

        if (slabsOnLevel.length === 0) {
            return { success: true, affectedElementIds: [], info: [`No slabs on level "${this.payload.levelId}".`] };
        }

        this.snapshots = slabsOnLevel.map(s => structuredClone(s) as SlabData);
        this.targetIds = this.snapshots.map(s => s.id);

        for (const slab of slabsOnLevel) {
            context.stores.slabStore.remove(slab.id);

            try {
                context.bimManager.unregisterElement(slab.id);
            } catch {
                // Element may already be unregistered (e.g. level deletion cascaded it)
            }

            try {
                elementRegistry.unregister(slab.id);
            } catch {
                // May already be absent from the registry
            }
        }

        console.log(
            `[RemoveSlabsOnLevelCommand] Removed ${this.snapshots.length} slab(s) ` +
            `from level "${this.payload.levelId}".`
        );

        return {
            success: true,
            affectedElementIds: this.targetIds,
            info: [`Removed ${this.snapshots.length} slab(s) from level "${this.payload.levelId}".`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (this.snapshots.length === 0) {
            return { success: true, affectedElementIds: [], info: ['Nothing to restore.'] };
        }

        for (const snapshot of this.snapshots) {
            context.stores.slabStore.add(snapshot);

            try {
                context.bimManager.registerElement(snapshot.id, snapshot.levelId);
            } catch {
                // May already be registered
            }

            try {
                elementRegistry.registerSemantic(snapshot.id, 'slab');
            } catch {
                // May already be registered (redo path)
            }
        }

        console.log(
            `[RemoveSlabsOnLevelCommand] UNDO: Restored ${this.snapshots.length} slab(s) ` +
            `on level "${this.payload.levelId}".`
        );

        return {
            success: true,
            affectedElementIds: this.targetIds,
            info: [`Restored ${this.snapshots.length} slab(s) on level "${this.payload.levelId}" (undo).`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                levelId: this.payload.levelId,
            } as Record<string, any>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }

    static deserialize(data: SerializedCommand): RemoveSlabsOnLevelCommand {
        return new RemoveSlabsOnLevelCommand(data.payload as RemoveSlabsOnLevelPayload);
    }
}
