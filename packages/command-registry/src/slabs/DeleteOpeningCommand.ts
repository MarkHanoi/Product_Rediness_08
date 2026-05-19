import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
// W3 §SLAB-SYSTEM-AUDIT-2026: elementRegistry must be called symmetrically with bimManager.
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

/**
 * DeleteOpeningCommand
 *
 * Contract compliance:
 * - §01 §2.7 FIX: Removed direct slabBuilder.updateSlab() calls from both execute()
 *   and undo(). The slab rebuild is now triggered by slabStore.update(hostId, {}),
 *   which fires 'bim-slab-updated' → main.ts → slabBuilder.updateSlab().
 */
export class DeleteOpeningCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_OPENING;
    readonly timestamp: number;
    targetIds: string[];
    private deletedData?: any;

    constructor(private openingId: string) {
        this.id = `cmd-del-opening-${Date.now()}`;
        this.timestamp = Date.now();
        this.targetIds = [openingId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const opening = (context.stores as any).openingStore.getById(this.openingId);
        if (!opening) return { ok: false, reason: 'Opening not found' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const opening = (context.stores as any).openingStore.getById(this.openingId);
        if (!opening) {
            return { success: false, affectedElementIds: [] };
        }

        // Capture snapshot before removal so undo can restore.
        this.deletedData = structuredClone(opening);
        const hostId = this.deletedData.hostId;

        context.bimManager.unregisterElement(this.openingId);
        // W3 §SLAB-SYSTEM-AUDIT-2026: unregister from elementRegistry symmetrically.
        elementRegistry.unregister(this.openingId);
        (context.stores as any).openingStore.remove(this.openingId);

        // §01 §2.7: Trigger slab re-projection via explicit rebuild signal.
        context.stores.slabStore.triggerRebuild(hostId);

        return {
            success: true,
            affectedElementIds: [this.openingId, hostId]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.deletedData) return { success: false, affectedElementIds: [] };

        context.bimManager.registerElement(this.deletedData.id, this.deletedData.levelId);
        // W3 §SLAB-SYSTEM-AUDIT-2026: re-register semantic type on undo (mirrors execute unregister).
        try { elementRegistry.registerSemantic(this.deletedData.id, 'opening'); } catch (_) {}
        (context.stores as any).openingStore.add(this.deletedData);

        // §01 §2.7: Trigger slab re-projection via explicit rebuild signal.
        context.stores.slabStore.triggerRebuild(this.deletedData.hostId);

        return {
            success: true,
            affectedElementIds: [this.openingId, this.deletedData.hostId]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { openingId: this.openingId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
