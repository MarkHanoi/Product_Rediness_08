import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { CreateSlabCommand } from './CreateSlabCommand';

export class CreateAllSlabsFromLevelToTopLevelCommand implements Command {
    readonly affectedStores = ["slab", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_ALL_SLABS_FROM_LEVEL_TO_TOP_LEVEL;
    readonly timestamp: number;
    // M6 FIX: removed 'readonly' — TypeScript readonly prevents reassignment but
    // NOT array mutation (.push), making it misleading. targetIds is intentionally
    // mutated in execute() to record the IDs of created slabs for undo/redo routing.
    targetIds: string[] = [];
    private createdCommands: CreateSlabCommand[] = [];

    constructor(private sourceLevelId: string) {
        this.id = `cmd-all-slabs-top-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const level = context.bimManager.getLevelById(this.sourceLevelId);
        if (!level) {
            return { ok: false, reason: `Source level ${this.sourceLevelId} not found.` };
        }
        const slabs = context.stores.slabStore.getAll().filter(s => s.levelId === this.sourceLevelId);
        if (slabs.length === 0) {
            return { ok: false, reason: `No slabs found on level ${this.sourceLevelId}.` };
        }
        const allLevels = context.bimManager.getLevels();
        if (allLevels.length <= 1) {
            return { ok: false, reason: "No other levels exist to replicate to." };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabStore = context.stores.slabStore;
        const sourceSlabs = slabStore.getAll().filter(s => s.levelId === this.sourceLevelId);
        const allLevels = context.bimManager.getLevels();
        
        console.log(`[CreateAllSlabsFromLevelToTopLevelCommand] allLevels: ${allLevels.map(l => l.id).join(', ')}`);
        console.log(`[CreateAllSlabsFromLevelToTopLevelCommand] sourceLevelId: ${this.sourceLevelId}`);

        // Find top level (highest elevation)
        const topLevel = [...allLevels].sort((a, b) => b.elevation - a.elevation)[0];

        if (topLevel.id === this.sourceLevelId) {
            return { success: true, affectedElementIds: [], info: ["Source level is already the top level."] };
        }

        const affectedIds: string[] = [];

        for (const refSlab of sourceSlabs) {
            // Avoid duplication
            const existingSlabs = slabStore.getAll().filter(s => s.levelId === topLevel.id);
            const isDuplicate = existingSlabs.some(s => 
                Math.abs(s.position.x - refSlab.position.x) < 0.01 &&
                Math.abs(s.position.z - refSlab.position.z) < 0.01 &&
                Math.abs(s.width - refSlab.width) < 0.01 &&
                Math.abs(s.depth - refSlab.depth) < 0.01
            );

            if (isDuplicate) continue;

            // C1 FIX §6.1, §18.3: Pre-generate both id and ifcGuid here so that
            // redo calls CreateSlabCommand.execute() with the SAME UUID — no ghost elements.
            const payload = {
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
                polygon: refSlab.polygon ? refSlab.polygon.map(p => ({ x: p.x, y: p.y })) : undefined
            };

            const cmd = new CreateSlabCommand(payload);
            const res = cmd.execute(context);

            if (res.success && res.affectedElementIds.length) {
                this.createdCommands.push(cmd);
                affectedIds.push(...res.affectedElementIds);
            }
        }

        this.targetIds.push(...affectedIds);

        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Replicated ${sourceSlabs.length} slabs to the top level (${topLevel.id}). Total created: ${affectedIds.length}`]
        };
    }

    undo(context: CommandContext): CommandResult {
        const affectedIds: string[] = [];
        for (let i = this.createdCommands.length - 1; i >= 0; i--) {
            const res = this.createdCommands[i].undo(context);
            if (res.success) {
                affectedIds.push(...res.affectedElementIds);
            }
        }
        return { success: true, affectedElementIds: affectedIds };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { sourceLevelId: this.sourceLevelId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
