import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { SlabData } from '@pryzm/geometry-slab';

export interface UpdateAllSlabsPayload {
    materialColor?: string;
    thickness?: number;
}

/**
 * UpdateAllSlabsCommand
 *
 * Contract compliance:
 * - W2 FIX §3.4: Replaced JSON.parse/JSON.stringify with structuredClone for all
 *   snapshot operations. structuredClone is safer, faster, and does not lose object
 *   fields due to JSON serialization limitations.
 */
export class UpdateAllSlabsCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_ALL_SLABS;
    readonly timestamp: number;
    targetIds: string[] = [];
    private prevSnapshots: Map<string, SlabData> = new Map();

    constructor(private payload: UpdateAllSlabsPayload) {
        this.id = `cmd-update-all-slabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slabs = context.stores.slabStore.getAll();
        if (slabs.length === 0)
            return { ok: false, reason: 'No slabs exist to update' };
        if (this.payload.thickness !== undefined && this.payload.thickness <= 0)
            return { ok: false, reason: 'Thickness must be greater than 0' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { materialColor, thickness } = this.payload;

        const slabs = context.stores.slabStore.getAll();
        this.targetIds = slabs.map(s => s.id);

        // W2 FIX: Use structuredClone for all snapshot captures.
        this.prevSnapshots.clear();
        slabs.forEach(slab => {
            this.prevSnapshots.set(slab.id, structuredClone(slab) as SlabData);
        });

        slabs.forEach(slab => {
            const nextState = structuredClone(slab);
            if (materialColor !== undefined) nextState.materialColor = materialColor;
            if (thickness !== undefined) nextState.thickness = thickness;
            context.stores.slabStore.update(slab.id, nextState);
        });

        return {
            success: true,
            affectedElementIds: this.targetIds,
            info: [`Updated ${this.targetIds.length} slabs`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (this.prevSnapshots.size === 0)
            return { success: false, affectedElementIds: [] };

        this.prevSnapshots.forEach((snapshot, id) => {
            context.stores.slabStore.update(id, snapshot);
        });

        return {
            success: true,
            affectedElementIds: Array.from(this.prevSnapshots.keys())
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
