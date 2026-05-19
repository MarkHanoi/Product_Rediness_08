// TODO(E.5.x): ORPHANED — UpdateWallDimensionsHandler (plugins/wall/src/handlers/UpdateWallDimensions.ts)
// was migrated from window.commandManager bridge to produceCommand (§TASK-07-PHASE-B).
// This legacy command class is no longer called from the bus handler path.
// It may still be invoked from legacy call sites that bypass the bus.
// Remove in Phase E.5.x cleanup once all direct window.commandManager call sites are migrated.
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { serializeWallSnapshot } from './wallSnapshotUtils';

export interface UpdateWallDimensionsInput {
    wallId: string;
    height: number;
    thickness: number;
}

export class UpdateWallDimensionsCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALL_DIMENSIONS;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: any = null;

    constructor(private input: UpdateWallDimensionsInput) {
        this.targetIds = [input.wallId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { ok: false, reason: "Wall not found" };
        if (this.input.height <= 0) return { ok: false, reason: "Invalid height" };
        if (this.input.thickness <= 0) return { ok: false, reason: "Invalid thickness" };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const currentState = ctx.stores.wallStore.getById(this.input.wallId);
        if (!currentState) return { success: false, affectedElementIds: [] };

        // §2.2: Serialize for undo storage (converts Vector3 → plain {x,y,z} for safe cloning).
        this.prevSnapshot = serializeWallSnapshot(currentState);

        // §SNAPSHOT-TOLERANT FIX: Do NOT spread serializeWallSnapshot() into nextState —
        // serializeWallSnapshot converts baseLine to plain {x,y,z} which would fail
        // WallDataUpdateSchema's z.instanceof(THREE.Vector3) check inside updateWall().
        // Instead, spread currentState directly (keeps proper Vector3 instances) and
        // only override the changed fields. WallStore.update() reconstructs Vector3
        // from plain objects automatically, but we avoid the issue entirely here.
        const nextState = {
            ...currentState,
            height: this.input.height,
            thickness: this.input.thickness
        };

        // updateWall() → emit('update') → subscriber in EngineBootstrap → wallFragmentBuilder.updateWall().
        ctx.stores.wallStore.updateWall(nextState);

        // §2.8 FIX: WallJoinResolver.resolveLevel() call removed.
        // Commands must not call resolvers, builders, topology, or world model directly.
        // Join resolution is handled downstream via the store emit → DependencyResolver path.

        return { success: true, affectedElementIds: [this.input.wallId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        // Restore full snapshot — restoreSnapshot() preserves metadata.version
        // (no audit-trail drift).  Emits 'update' → subscriber → builder rebuild.
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
