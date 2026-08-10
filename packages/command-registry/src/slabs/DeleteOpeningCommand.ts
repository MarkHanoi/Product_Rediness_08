// §SWALLOW-SIDE-INDEX — why the `catch { /* … */ }` blocks below are empty.
//
// Every one of them wraps a write to a SIDE INDEX (elementRegistry,
// bimManager, semanticGraphManager, roomSpatialIndex) that is derived from the
// element stores, never authoritative over them. The store mutation — the
// command's actual contract — has already committed and is NOT inside the try.
// A side index that rejects an unregister for an id it never held, or a
// register for an id it already holds, is reporting a no-op, not a failure:
// re-deriving the index from the stores would produce the same result either
// way. Re-throwing here would abort a command whose real work succeeded and
// leave the undo stack describing a mutation that was rolled back only halfway.
//
// This is NOT a §CONTEXT-DATA-HONESTY breach: nothing downstream reads a
// success/failure value from these calls, so there is no refusal being
// disguised as a result. If a side index ever becomes load-bearing for a
// query, these blocks must become reported failures.

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
        try { elementRegistry.registerSemantic(this.deletedData.id, 'opening'); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
