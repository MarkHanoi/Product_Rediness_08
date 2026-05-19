import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { serializeWallSnapshot } from './wallSnapshotUtils';

/**
 * §2.2 FIX: oldSnapshots now stores the full WallData before mutation
 * (baseLine serialized to plain {x,y,z} tuples for structuredClone safety).
 * §2.3 FIX: undo restores the full snapshot via wallStore.updateWall()
 * instead of a partial patch.
 *
 * §WALL-AUDIT-2026-M1 — renamed from UpdateWallVisualPropertiesCommand. The
 * command operates on the entire wall store (every wall is a target), so the
 * `SetAllWalls…` prefix matches the sibling `SetAllWallsWidthCommand` naming
 * convention and removes the false implication that it patches a single wall.
 * The CommandType registry value (`UPDATE_WALL_PROPERTIES`) is preserved for
 * serialization back-compat with persisted undo histories.
 */
export class SetAllWallsVisualPropertiesCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALL_PROPERTIES;
    timestamp = Date.now();
    targetIds: string[] = [];

    private oldSnapshots: Map<string, any> = new Map();

    constructor(private updates: { color?: string, material?: string }) {}

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.updates.color && !this.updates.material) {
            return { ok: false, reason: "No properties specified to update" };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const walls = ctx.stores.wallStore.getAll();
        const affected: string[] = [];

        walls.forEach(wall => {
            // §2.2: Capture full wall snapshot before mutation (not just visual fields).
            this.oldSnapshots.set(wall.id, serializeWallSnapshot(wall));

            // §2.1/§2.3 FIX: execute() must use full-replacement semantics (updateWall)
            // to be symmetric with undo() which also calls updateWall(snapshot).
            // Partial patch via update(id, partial) was asymmetric with undo.
            // serializeWallSnapshot converts baseLine Vector3 → plain {x,y,z} so that
            // wallStore.updateWall() → update() can safely reconstruct Vector3 instances.
            const nextState: any = { ...serializeWallSnapshot(wall) };
            if (this.updates.color !== undefined) nextState.materialColor = this.updates.color;
            if (this.updates.material !== undefined) nextState.materialId = this.updates.material;

            ctx.stores.wallStore.updateWall(nextState);
            affected.push(wall.id);
            // Rebuild triggered automatically via wallStore.updateWall() → emit('update')
            // → subscriber in main.ts → wallFragmentBuilder.updateWall().
        });

        this.targetIds = [...affected];
        if (affected.length > 0) {
            return { success: true, affectedElementIds: affected };
        }
        return { success: false, affectedElementIds: [], info: ["No walls found"] };
    }

    undo(ctx: CommandContext): CommandResult {
        const affected: string[] = [];
        this.oldSnapshots.forEach((snapshot, id) => {
            const wall = ctx.stores.wallStore.getById(id);
            if (wall) {
                // §2.3: Restore via full snapshot — restoreSnapshot() preserves
                // metadata.version unlike updateWall() which increments it on undo.
                ctx.stores.wallStore.restoreSnapshot(snapshot);
                affected.push(id);
            }
        });
        return { success: true, affectedElementIds: affected };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.updates
        };
    }
}
