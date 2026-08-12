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

        // ─── §UNDO-SCOPED-TO-AUTHORED-FIELDS (C03 §4.5-4.8) ────────────────────
        //
        // Restore ONLY the two fields this command authored, never the whole
        // record.
        //
        // WHAT THE FULL RESTORE DID. `execute()` snapshots the ENTIRE `WallData`
        // before mutating, and `WallStore.restoreSnapshot` writes ~12 fields back
        // — `materialColor`, `layers`, `systemTypeId`, `properties`, `baseLine`
        // and the rest — none of which this command touched. Between the execute
        // and the undo, ANY of those fields may have been changed by somebody
        // else. Restoring them all reverts that person's work as collateral, and
        // silently: the store write succeeds, nothing refuses, and the only trace
        // is a value the user did not ask to change.
        //
        // MEASURED (tools/rac-conformance/certification two-client harness,
        // finding `undo/undo-reverted-peer-work`). Client A raises a wall to 5 m;
        // client B recolours the SAME wall to '#c0ffee'; the CRDT merges both
        // losslessly and A's store correctly holds height=5 AND '#c0ffee'. A then
        // presses Ctrl+Z on its OWN gesture — and the wall goes back to 3 m
        // (right) AND back to '#aabbcc' (wrong), because A's pre-execute snapshot
        // predates B's colour. C03 §4.5-4.8 makes undo PER-GESTURE: A's Ctrl+Z
        // reverts A's dimension change and nothing else.
        //
        // This is NOT collaboration-specific. The same clobber fires single-user
        // whenever any later edit touches a field this command snapshotted and
        // the user then undoes back past it — concurrency only makes it easy to
        // observe deterministically.
        //
        // WHY `update()` AND NOT `restoreSnapshot()`. `update(id, updates, true)`
        // is the store's single source of truth for mutation (WallStore.ts:510)
        // and the `preserveMetadata = true` third argument gives exactly what
        // `restoreSnapshot` was being used for here — no `modifiedAt` advance and
        // no version bump, so the audit trail stays clean (the §03-1.1 property
        // this code has always relied on). The difference is only the SCOPE of
        // the write.
        //
        // `_renderVersion` is restored explicitly for the §VIEW-DIRTY-CHECK
        // reason documented on `restoreSnapshot`: the builder compares version
        // keys by STRING EQUALITY, never by ordering, so handing back the
        // pre-execute value still differs from `_lastBuiltVersion` and the
        // rebuild fires. Omitting it here would leave the ratcheted version in
        // place — the exact +N-per-undo-cycle drift the certification flagged.
        const prev = this.prevSnapshot as {
            height?: number; thickness?: number; _renderVersion?: number;
        };
        ctx.stores.wallStore.update(
            this.input.wallId,
            {
                height:    prev.height,
                thickness: prev.thickness,
                _renderVersion: prev._renderVersion,
            } as any,
            true,
        );

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
