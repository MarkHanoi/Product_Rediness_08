import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';

/**
 * DeleteSlabCommand
 *
 * §SLAB-SYSTEM-AUDIT-2026 C2 + C1:
 *
 * Dedicated, self-contained command for slab deletion.  Supersedes the
 * inline slab branch inside DeleteElementCommand (which now delegates here).
 *
 * C1 fixes applied:
 *   execute():
 *     - Removes each hosted opening from openingStore, bimManager, and
 *       elementRegistry before removing the slab (prevents orphaned openings).
 *     - Calls bimManager.unregisterElement(slabId) after the store remove so
 *       BimManager.elementsOnLevel() no longer returns the deleted slab.
 *     - Calls semanticGraphManager.removeAllRelationshipsForElement(slabId) so
 *       the SemanticGraph is consistent with the store.
 *   undo():
 *     - Re-registers the slab in bimManager and elementRegistry before calling
 *       slabStore.add(), making it visible to spatial queries immediately.
 *     - Restores the SemanticGraph sitsOn relationship.
 *     - Re-adds every hosted opening to openingStore, bimManager, and
 *       elementRegistry with correct 'opening' semantic type (W3 opening
 *       registry symmetry fix).
 *
 * W3 fix applied:
 *   - elementRegistry.unregister(op.id) on execute() for each opening.
 *   - elementRegistry.registerSemantic(op.id, 'opening') on undo() for each opening.
 *
 * Registered as CommandType.DELETE_SLAB in CommandRegistry (W1).
 */
export class DeleteSlabCommand implements Command {
    readonly affectedStores = ['slab'] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_SLAB;
    readonly timestamp: number;
    targetIds: string[];

    private _deletedSlab?: any;
    private _deletedOpenings: any[] = [];

    constructor(private slabId: string) {
        this.id = `cmd-del-slab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [slabId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const slab = ctx.stores.slabStore?.getById?.(this.slabId);
        if (!slab) return { ok: false, reason: `Slab ${this.slabId} not found` };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const slabStore    = ctx.stores.slabStore;
        const openingStore = (ctx.stores as any).openingStore;
        const bimManager   = ctx.bimManager;

        const slab = slabStore?.getById?.(this.slabId);
        if (!slab) return { success: false, affectedElementIds: [] };

        // 1. Snapshot the slab (deep clone so frozen internal ref is safe to mutate later)
        this._deletedSlab = structuredClone(slab);

        // 2. Capture and remove every hosted opening (C1 — prevents orphan openings)
        if (openingStore) {
            const openings: any[] = openingStore.getByHostId(this.slabId);
            this._deletedOpenings = structuredClone(openings);
            for (const op of openings) {
                bimManager?.unregisterElement?.(op.id);
                elementRegistry.unregister(op.id);            // W3
                openingStore.remove(op.id);
            }
        }

        // 3. Remove the slab from the store.
        //    slabStore.remove() fires 'bim-slab-removed' → builder.removeSlab(id)
        //    → elementRegistry.unregister(id) is handled by the builder.
        slabStore.remove(this.slabId);

        // 4. Unregister from bimManager — store event path does NOT do this (C1).
        bimManager?.unregisterElement?.(this.slabId);

        // 5. Purge SemanticGraph relationships (C1).
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.slabId);
        } catch (err) {
            console.warn('[DeleteSlabCommand] SemanticGraph cleanup failed (non-fatal):', err);
        }

        return { success: true, affectedElementIds: [this.slabId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this._deletedSlab) return { success: false, affectedElementIds: [] };

        const slabStore    = ctx.stores.slabStore;
        const openingStore = (ctx.stores as any).openingStore;
        const bimManager   = ctx.bimManager;
        const levelId      = this._deletedSlab.levelId as string;

        // 1. Re-register in bimManager (C1) — must precede slabStore.add() so that
        //    any listener that queries bimManager on 'bim-slab-added' finds the entry.
        bimManager?.registerElement?.(this.slabId, levelId);

        // 2. Re-register semantic type (C1).
        try { elementRegistry.registerSemantic(this.slabId, 'slab'); } catch (_) {}

        // 3. Restore SemanticGraph sitsOn relationship (C1).
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: this.slabId,
                targetId: levelId,
                createdBy: 'DeleteSlabCommand.undo',
                metadata: {}
            });
        } catch (err) {
            console.warn('[DeleteSlabCommand.undo] SemanticGraph restore failed (non-fatal):', err);
        }

        // 4. Re-add slab to store — fires 'bim-slab-added' → builder rebuilds geometry.
        slabStore.add(this._deletedSlab);

        // 5. Restore hosted openings (C1 + W3 — symmetric with execute removal).
        const affectedIds: string[] = [this.slabId];
        for (const op of this._deletedOpenings) {
            bimManager?.registerElement?.(op.id, op.levelId);
            try { elementRegistry.registerSemantic(op.id, 'opening'); } catch (_) {}
            openingStore?.add?.(op);
            affectedIds.push(op.id);
        }

        // 6. If any openings were restored, trigger a rebuild so the builder punches
        //    the holes correctly (the slab add event alone may have already done this,
        //    but an explicit trigger guarantees the opening data is present first).
        if (this._deletedOpenings.length > 0) {
            slabStore.triggerRebuild(this.slabId);
        }

        return { success: true, affectedElementIds: affectedIds };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { slabId: this.slabId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
