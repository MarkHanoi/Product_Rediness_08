import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { SlabData } from '@pryzm/geometry-slab';

export interface UpdateSlabLevelPayload {
    slabId: string;
    newLevelId: string;
}

/**
 * UpdateSlabLevelCommand
 *
 * Moves a slab to a different level, maintaining full spatial authority compliance.
 *
 * Contract compliance:
 * - §01 §2.1: Spatial re-registration is performed exclusively in this command.
 *   Old levelId is unregistered from BimManager; new levelId is registered.
 * - §01 §2.2: Full snapshot of previous SlabData is taken via structuredClone
 *   before any mutation, enabling complete undo.
 * - §01 §2.3: Undo restores the full semantic snapshot AND re-registers the
 *   original levelId in BimManager.
 * - §02 §1.2: worldY is resolved at projection time by the builder from
 *   BimManager.getLevelById(newLevelId).elevation — not stored here.
 * - §03 Store Immutability: Update is a full-state replacement via store.update().
 */
export class UpdateSlabLevelCommand implements Command {
    readonly affectedStores = ["slab", "level"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_SLAB_LEVEL;
    readonly timestamp: number;
    targetIds: string[];
    private prevSnapshot?: SlabData;

    constructor(private payload: UpdateSlabLevelPayload) {
        this.id = `cmd-update-slab-level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.slabId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) return { ok: false, reason: `Slab ${this.payload.slabId} not found` };

        const newLevel = context.bimManager.getLevelById(this.payload.newLevelId);
        if (!newLevel) return { ok: false, reason: `Target level ${this.payload.newLevelId} not found` };

        if (slab.levelId === this.payload.newLevelId) {
            return { ok: false, reason: 'Slab is already on this level' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) throw new Error(`SpatialAuthorityError: Slab ${this.payload.slabId} not found`);

        const newLevel = context.bimManager.getLevelById(this.payload.newLevelId);
        if (!newLevel) throw new Error(`SpatialAuthorityError: Level ${this.payload.newLevelId} not found`);

        this.prevSnapshot = structuredClone(slab) as SlabData;

        // §01 §2.1: Re-register in BimManager's spatial authority.
        context.bimManager.unregisterElement(this.payload.slabId);
        context.bimManager.registerElement(this.payload.slabId, this.payload.newLevelId);

        const nextState = structuredClone(slab) as SlabData;
        nextState.levelId = this.payload.newLevelId;
        nextState.parentId = this.payload.newLevelId;

        context.stores.slabStore.update(this.payload.slabId, nextState);

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [`Slab ${this.payload.slabId} moved to level ${this.payload.newLevelId}`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        // §01 §2.3: Restore spatial registration to original level.
        context.bimManager.unregisterElement(this.payload.slabId);
        context.bimManager.registerElement(this.payload.slabId, this.prevSnapshot.levelId);

        context.stores.slabStore.update(this.payload.slabId, this.prevSnapshot);

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [`Slab ${this.payload.slabId} restored to level ${this.prevSnapshot.levelId}`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
