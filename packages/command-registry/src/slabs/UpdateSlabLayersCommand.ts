import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { SlabLayer } from '@pryzm/geometry-slab';

export interface UpdateSlabLayersPayload {
    slabId: string;
    /** ID of the SlabSystemType being applied, or null/undefined for custom/plain. */
    systemTypeId?: string | null;
    /** Complete ordered layer stack (top-to-bottom). Required when systemTypeId is set. */
    layers: SlabLayer[];
    /** New total thickness derived from the layer stack. */
    thickness: number;
}

/**
 * UpdateSlabLayersCommand
 *
 * Contract compliance:
 * - §01 §2.1: Command layer is the sole authority for mutating slab semantic data.
 * - §01 §3.4: Constructs a full nextState via structuredClone before calling store.update().
 * - §03-1.3: Stamps a deep-cloned layer snapshot from the chosen SlabSystemType onto
 *   the slab, ensuring it is immune to future type edits (edit-type semantics).
 * - Undo restores the full previous SlabData snapshot.
 */
export class UpdateSlabLayersCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_SLAB_LAYERS;
    readonly timestamp: number;
    targetIds: string[];
    private prevSnapshot?: any;

    constructor(private payload: UpdateSlabLayersPayload) {
        this.id = `cmd-update-slab-layers-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.slabId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) return { ok: false, reason: `Slab "${this.payload.slabId}" not found` };

        if (!Array.isArray(this.payload.layers) || this.payload.layers.length === 0) {
            return { ok: false, reason: 'Layer stack must have at least one layer' };
        }

        if (this.payload.thickness <= 0) {
            return { ok: false, reason: 'Total thickness must be positive' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slab = context.stores.slabStore.getById(this.payload.slabId);
        if (!slab) throw new Error(`[UpdateSlabLayersCommand] Slab "${this.payload.slabId}" not found`);

        // §01 §3.4: Snapshot full previous state for undo.
        this.prevSnapshot = structuredClone(slab);

        // Build complete nextState with new layer data.
        const nextState = structuredClone(slab);
        nextState.systemTypeId = this.payload.systemTypeId ?? null;
        nextState.layers = structuredClone(this.payload.layers);
        nextState.thickness = parseFloat(this.payload.thickness.toFixed(6));

        context.stores.slabStore.update(this.payload.slabId, nextState);

        return {
            success: true,
            affectedElementIds: [this.payload.slabId],
            info: [`Slab ${this.payload.slabId} layers updated (${this.payload.layers.length} layers, ${(this.payload.thickness * 1000).toFixed(0)}mm total)`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        context.stores.slabStore.update(this.payload.slabId, this.prevSnapshot);
        return { success: true, affectedElementIds: [this.payload.slabId] };
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
