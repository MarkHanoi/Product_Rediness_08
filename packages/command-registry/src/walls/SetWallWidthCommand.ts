import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { serializeWallSnapshot } from './wallSnapshotUtils';

/**
 * §2.2 FIX: oldSnapshots now stores the full WallData before mutation
 * (baseLine serialized to plain {x,y,z} tuples for structuredClone safety).
 * §2.3 FIX: undo restores the full snapshot via wallStore.updateWall()
 * instead of a partial thickness patch.
 */
export class SetWallWidthCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALL_PROPERTIES;
    timestamp = Date.now();
    targetIds: string[];

    private oldSnapshots: Map<string, any> = new Map();

    constructor(
        private elementIds: string[],
        private newWidth: number
    ) {
        this.targetIds = [...elementIds];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (this.elementIds.length === 0) {
            return { ok: false, reason: "No walls specified" };
        }

        if (this.newWidth <= 0) {
            return { ok: false, reason: "Invalid width" };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        // Clear any stale snapshot data from previous executions
        this.oldSnapshots.clear();

        const affected: string[] = [];

        for (const id of this.elementIds) {
            const wall = ctx.stores.wallStore.getById(id);
            if (!wall) continue;

            // §2.2: Capture full wall snapshot before mutation.
            this.oldSnapshots.set(id, serializeWallSnapshot(wall));

            // §2.1/§2.3 FIX: execute() must use full-replacement semantics (updateWall)
            // to be symmetric with undo() which also calls updateWall(snapshot).
            // serializeWallSnapshot converts baseLine Vector3 → plain {x,y,z} so that
            // wallStore.updateWall() → update() can safely reconstruct Vector3 instances.
            const nextState: any = { ...serializeWallSnapshot(wall), thickness: this.newWidth };
            ctx.stores.wallStore.updateWall(nextState);

            affected.push(id);
        }

        return {
            success: affected.length > 0,
            affectedElementIds: affected,
            info: affected.length === 0 ? ["No walls found to update"] : undefined
        };
    }

    undo(ctx: CommandContext): CommandResult {
        const affected: string[] = [];

        for (const [id, snapshot] of this.oldSnapshots.entries()) {
            const wall = ctx.stores.wallStore.getById(id);
            if (!wall) continue;

            // §2.3: Restore via full snapshot — restoreSnapshot() preserves
            // metadata.version unlike updateWall() which increments it on undo.
            ctx.stores.wallStore.restoreSnapshot(snapshot);

            affected.push(id);
        }

        return {
            success: true,
            affectedElementIds: affected
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: {
                elementIds: this.elementIds,
                width: this.newWidth
            }
        };
    }
}