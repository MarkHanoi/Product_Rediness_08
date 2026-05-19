import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { serializeWallSnapshot } from './wallSnapshotUtils';

export interface UpdateWallSystemTypeInput {
    wallId: string;
    systemTypeId: string | null;
    layers: any[] | null;
    thickness?: number;
}

/**
 * Assigns a wall system type (or clears it) to a single wall.
 *
 * Contract §01 §2.1 — Must go through CommandManager, never wallStore.update() directly.
 * Contract §01 §2.7 — No direct builder calls; rebuild triggered via
 *   wallStore.updateWall() → emit('update') → subscriber → wallFragmentBuilder.updateWall().
 */
export class UpdateWallSystemTypeCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALL_SYSTEM_TYPE;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: any = null;

    constructor(private input: UpdateWallSystemTypeInput) {
        this.targetIds = [input.wallId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { success: false, affectedElementIds: [] };

        this.prevSnapshot = serializeWallSnapshot(wall);

        const nextState: any = {
            ...serializeWallSnapshot(wall),
            systemTypeId: this.input.systemTypeId ?? null,
            layers: this.input.layers ?? null
        };
        if (this.input.thickness !== undefined) {
            nextState.thickness = this.input.thickness;
        }

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
