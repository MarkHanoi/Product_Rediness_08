import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { serializeWallSnapshot } from './wallSnapshotUtils';

/**
 * §2.2 FIX: oldSnapshots now stores the full WallData before mutation
 * (baseLine serialized to plain {x,y,z} tuples for structuredClone safety).
 * §2.3 FIX: undo restores the full snapshot via wallStore.updateWall()
 * instead of a partial thickness patch.
 */
export class SetAllWallsWidthCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALL_PROPERTIES;
    timestamp = Date.now();
    targetIds: string[];

    private oldSnapshots: Map<string, any> = new Map();

    constructor(private elementIds: string[], private newWidth: number) {
        this.targetIds = [...elementIds];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (this.elementIds.length === 0) {
            return { ok: false, reason: "No walls specified" };
        }
        if (this.newWidth <= 0) {
            return { ok: false, reason: "Invalid width: must be greater than 0" };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        if (this.oldSnapshots.size > 0) {
            throw new Error("Command instance reused. This is not allowed.");
        }

        const affected: string[] = [];
        const errors: string[] = [];

        const missingWalls = this.elementIds.filter(
            id => !ctx.stores.wallStore.getById(id)
        );

        if (missingWalls.length > 0) {
            errors.push(`Walls not found: ${missingWalls.join(', ')}`);
        }

        this.elementIds.forEach(id => {
            const wall = ctx.stores.wallStore.getById(id);
            if (wall) {
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
        });

        if (affected.length > 0) {
            return {
                success: true,
                affectedElementIds: affected,
                info: errors.length > 0 ? errors : undefined
            };
        }

        return {
            success: false,
            affectedElementIds: [],
            info: errors.length > 0 ? errors : ["No walls found to update"]
        };
    }

    undo(ctx: CommandContext): CommandResult {
        const affected: string[] = [];
        const errors: string[] = [];

        this.oldSnapshots.forEach((snapshot, id) => {
            const wall = ctx.stores.wallStore.getById(id);
            if (wall) {
                // §2.3: Restore via full snapshot — restoreSnapshot() preserves
                // metadata.version unlike updateWall() which increments it on undo.
                ctx.stores.wallStore.restoreSnapshot(snapshot);
                affected.push(id);
            } else {
                errors.push(`Wall ${id} not found during undo`);
            }
        });

        return {
            success: true,
            affectedElementIds: affected,
            info: errors.length > 0 ? errors : undefined
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

    static deserialize(serialized: SerializedCommand): SetAllWallsWidthCommand {
        const { elementIds, width } = serialized.payload as { elementIds: string[], width: number };
        return new SetAllWallsWidthCommand(elementIds, width);
    }
}