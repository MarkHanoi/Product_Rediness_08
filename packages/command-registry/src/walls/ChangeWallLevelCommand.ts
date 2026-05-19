import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';

export interface ChangeWallLevelInput {
    wallId: string;
    newLevelId: string;
}

/**
 * ChangeWallLevelCommand
 *
 * Moves a wall to a different level. Uses WallStore.changeLevel() which bypasses
 * the levelId-immutability guard in update() by emitting 'remove' + 'add' events,
 * causing the EngineBootstrap subscriber to clean up old-level joins and rebuild
 * on the new level.
 *
 * Undo restores the original levelId via a second changeLevel() call.
 *
 * Contract compliance:
 *   §01-Core-Contract §2.1: No direct store mutations — all mutations go through
 *     WallStore.changeLevel() which owns its own event chain.
 *   §01 §2.3: Undo performs a full level revert (not a partial property patch).
 */
export class ChangeWallLevelCommand implements Command {
    readonly affectedStores = ["wall", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CHANGE_WALL_LEVEL;
    readonly timestamp: number;
    readonly targetIds: string[];

    private readonly wallId: string;
    private readonly newLevelId: string;
    private prevLevelId: string | null = null;
    private executed = false;

    constructor(input: ChangeWallLevelInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.wallId = input.wallId;
        this.newLevelId = input.newLevelId;
        this.targetIds = [input.wallId];
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.wallId);
        if (!wall) {
            return { ok: false, reason: 'WALL_NOT_FOUND', blockingIssues: [`WALL_NOT_FOUND: ${this.wallId}`] };
        }
        const bimManager = ctx.bimManager;
        const level = bimManager?.getLevelById?.(this.newLevelId);
        if (!level) {
            return { ok: false, reason: 'LEVEL_NOT_FOUND', blockingIssues: [`LEVEL_NOT_FOUND: ${this.newLevelId}`] };
        }
        if (wall.levelId === this.newLevelId) {
            return { ok: false, reason: 'ALREADY_ON_LEVEL', blockingIssues: ['ALREADY_ON_LEVEL'] };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        if (this.executed) {
            return { success: false, affectedElementIds: [], info: ['Command already executed'] };
        }
        const wall = ctx.stores.wallStore.getById(this.wallId);
        if (!wall) {
            return { success: false, affectedElementIds: [], info: [`Wall ${this.wallId} not found`] };
        }
        this.prevLevelId = wall.levelId;
        const result = ctx.stores.wallStore.changeLevel(this.wallId, this.newLevelId);
        if (!result) {
            return { success: false, affectedElementIds: [], info: ['changeLevel returned undefined'] };
        }
        this.executed = true;
        return { success: true, affectedElementIds: [this.wallId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || this.prevLevelId == null) {
            return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };
        }
        const result = ctx.stores.wallStore.changeLevel(this.wallId, this.prevLevelId);
        if (!result) {
            return { success: false, affectedElementIds: [], info: ['undo changeLevel returned undefined'] };
        }
        this.executed = false;
        return { success: true, affectedElementIds: [this.wallId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version:   1,
            payload: {
                wallId:      this.wallId,
                newLevelId:  this.newLevelId,
                prevLevelId: this.prevLevelId,
            },
        };
    }
}
