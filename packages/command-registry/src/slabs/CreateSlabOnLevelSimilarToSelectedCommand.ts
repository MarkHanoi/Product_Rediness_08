import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { CreateSlabCommand } from './CreateSlabCommand';

export interface ReplicateSelectedSlabToAllLevelsPayload {
    referenceSlabId: string;
}

export class ReplicateSelectedSlabToAllLevelsCommand implements Command {
    readonly affectedStores = ["slab", "level"] as const;

    readonly id: string;
    readonly type = CommandType.CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED;
    readonly timestamp: number;
    // W9 FIX: Removed `readonly` — the array must be mutated during execute().
    targetIds: string[] = [];

    private createdCommands: CreateSlabCommand[] = [];

    constructor(private payload: ReplicateSelectedSlabToAllLevelsPayload) {
        this.id = `cmd-replicate-slab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const refSlab = context.stores.slabStore.getById(this.payload.referenceSlabId);
        if (!refSlab) {
            return { ok: false, reason: `Reference slab ${this.payload.referenceSlabId} not found.` };
        }

        const levels = context.bimManager.getLevels();
        if (!levels || levels.length < 2) {
            return { ok: false, reason: "No additional levels found." };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabStore = context.stores.slabStore;
        const refSlab = slabStore.getById(this.payload.referenceSlabId);

        if (!refSlab) {
            return { success: false, affectedElementIds: [] };
        }

        const allLevels = context.bimManager.getLevels();
        const topLevel = [...allLevels].sort((a, b) => b.elevation - a.elevation)[0];

        if (topLevel.id === refSlab.levelId) {
            return {
                success: true,
                affectedElementIds: [],
                info: ["Selected slab is already on the top level."]
            };
        }

        // C1 FIX §01 §2.6: Pre-generate stable ID + IFC GUID here, not inside execute().
        // C2 FIX §2.6: ifcGuid pre-generated so IFC GUID is stable across redo.
        const createPayload = {
            id: crypto.randomUUID(),
            ifcGuid: crypto.randomUUID(),
            width: refSlab.width,
            depth: refSlab.depth,
            thickness: refSlab.thickness,
            position: {
                x: refSlab.position.x,
                y: 0,
                z: refSlab.position.z
            },
            levelId: topLevel.id,
            polygon: refSlab.polygon
                ? refSlab.polygon.map(p => ({ x: p.x, y: p.y }))
                : undefined
        };

        // C10 NOTE: Child command is orchestrated directly without going through
        // commandManager.execute(). This is an internal batch-orchestration pattern.
        const cmd = new CreateSlabCommand(createPayload);
        const result = cmd.execute(context);

        const affectedIds: string[] = [];
        if (result.success && result.affectedElementIds.length > 0) {
            this.createdCommands.push(cmd);
            affectedIds.push(...result.affectedElementIds);
        }

        this.targetIds.push(...affectedIds);

        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Replicated selected slab to the top level (${topLevel.id}).`]
        };
    }

    undo(context: CommandContext): CommandResult {
        const affectedIds: string[] = [];

        for (let i = this.createdCommands.length - 1; i >= 0; i--) {
            const result = this.createdCommands[i].undo(context);
            if (result.success) {
                affectedIds.push(...result.affectedElementIds);
            }
        }

        return {
            success: true,
            affectedElementIds: affectedIds
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
