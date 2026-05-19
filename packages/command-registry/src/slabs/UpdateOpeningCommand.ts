import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { OpeningData } from '@pryzm/core-app-model';

export interface UpdateOpeningPayload {
    id: string;
    updates: Partial<OpeningData>;
}

/**
 * UpdateOpeningCommand
 *
 * Contract compliance:
 * - §01 §2.7: Removed direct slabBuilder.updateSlab() calls from both execute()
 *   and undo(). The slab rebuild is now triggered by slabStore.triggerRebuild(hostId),
 *   which fires 'bim-slab-updated' → main.ts → slabBuilder.updateSlab().
 * - §01 §3.4 FIX (W4): Converted from partial patch to full-replacement pattern.
 *   execute() now merges `updates` with the captured pre-state snapshot (prevData)
 *   to construct a complete OpeningData, then passes that full object to
 *   openingStore.update(). This eliminates the Partial<OpeningData> partial-patch
 *   violation and keeps the update semantics identical to the undo restore path.
 */
export class UpdateOpeningCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_OPENING;
    readonly timestamp: number;
    targetIds: string[];
    private prevData?: OpeningData;

    constructor(private payload: UpdateOpeningPayload) {
        this.id = `cmd-upd-opening-${Date.now()}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const opening = (context.stores as any).openingStore.getById(this.payload.id);
        if (!opening) return { ok: false, reason: 'Opening not found' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const openingStore = (context.stores as any).openingStore;
        const opening: OpeningData | undefined = openingStore.getById(this.payload.id);
        if (!opening) return { success: false, affectedElementIds: [] };

        this.prevData = structuredClone(opening);
        const hostId = opening.hostId;

        // W4 FIX §01 §3.4: Build a complete replacement object from the captured
        // snapshot merged with the payload updates. This avoids partial patching —
        // openingStore.update() receives a full OpeningData object, not a partial.
        const nextData: OpeningData = { ...this.prevData, ...this.payload.updates };
        openingStore.update(this.payload.id, nextData);

        // §01 §2.7: Trigger slab re-projection via explicit rebuild signal.
        context.stores.slabStore.triggerRebuild(hostId);

        return {
            success: true,
            affectedElementIds: [this.payload.id, hostId]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevData) return { success: false, affectedElementIds: [] };

        const openingStore = (context.stores as any).openingStore;
        // Restore full snapshot — always a full OpeningData object (never partial).
        openingStore.update(this.payload.id, this.prevData);

        // §01 §2.7: Trigger slab re-projection via explicit rebuild signal.
        context.stores.slabStore.triggerRebuild(this.prevData.hostId);

        return {
            success: true,
            affectedElementIds: [this.payload.id, this.prevData.hostId]
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
