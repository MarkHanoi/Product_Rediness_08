import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { serializeWallSnapshot } from './wallSnapshotUtils';

export interface UpdateWallColorInput {
    wallId: string;
    materialColor?: string;
    materialId?: string | null;
}

/**
 * Updates the visual properties (colour / material) of a single wall.
 *
 * Contract §01 §2.1 — Inspector must NEVER write to the store directly.
 * All store mutations must flow through CommandManager.execute().
 *
 * Contract §01 §2.7 — No direct builder calls.
 * wallStore.updateWall() → emit('update') → subscriber → wallFragmentBuilder.updateWall().
 */
export class UpdateWallColorCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALL_COLOR;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: any = null;

    constructor(private input: UpdateWallColorInput) {
        this.targetIds = [input.wallId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };
        if (!this.input.materialColor && this.input.materialId === undefined) {
            return { ok: false, reason: 'No visual properties specified' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { success: false, affectedElementIds: [] };

        this.prevSnapshot = serializeWallSnapshot(wall);

        const nextState: any = { ...serializeWallSnapshot(wall) };
        if (this.input.materialColor !== undefined) nextState.materialColor = this.input.materialColor;
        if (this.input.materialId !== undefined) nextState.materialId = this.input.materialId ?? null;

        ctx.stores.wallStore.updateWall(nextState);
        return { success: true, affectedElementIds: [this.input.wallId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        // restoreSnapshot() preserves metadata.version (no audit-trail drift).
        ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
        return { success: true, affectedElementIds: [this.input.wallId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.input
        };
    }
}
