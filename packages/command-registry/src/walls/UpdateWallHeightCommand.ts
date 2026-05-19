import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, WALL_HEIGHT_CONSTRAINTS, CommandContext } from '../types';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface UpdateWallHeightInput {
    wallIds: string[];
    newHeight: number;
}

export class UpdateWallHeightCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_WALL_HEIGHT;
    readonly timestamp: number;
    readonly targetIds: string[];

    private readonly wallIds: string[];
    private readonly newHeight: number;

    // §2.2/§2.3 FIX: Store FULL wall snapshots, not just the height field.
    // Partial snapshot undo (patching only `height`) violated §2.3 —
    // undo must be a full state replacement, not a partial property revert.
    private prevSnapshots: Map<string, any> = new Map();
    private executed: boolean = false;

    constructor(input: UpdateWallHeightInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.wallIds = input.wallIds;
        this.newHeight = input.newHeight;
        this.targetIds = [...input.wallIds];

        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const blockingIssues: string[] = [];
        const warnings: string[] = [];

        if (this.wallIds.length === 0) {
            return {
                ok: false,
                reason: 'No walls specified',
                blockingIssues: ['NO_WALLS_SPECIFIED']
            };
        }

        for (const wallId of this.wallIds) {
            const wall = ctx.stores.wallStore.getById(wallId);
            if (!wall) {
                blockingIssues.push(`WALL_NOT_FOUND: ${wallId}`);
                continue;
            }

            if (this.newHeight < WALL_HEIGHT_CONSTRAINTS.MIN_HEIGHT) {
                blockingIssues.push(
                    `HEIGHT_BELOW_MINIMUM: ${this.newHeight}m < ${WALL_HEIGHT_CONSTRAINTS.MIN_HEIGHT}m (Wall: ${wallId})`
                );
            }

            if (this.newHeight > WALL_HEIGHT_CONSTRAINTS.MAX_HEIGHT) {
                blockingIssues.push(
                    `HEIGHT_EXCEEDS_MAXIMUM: ${this.newHeight}m > ${WALL_HEIGHT_CONSTRAINTS.MAX_HEIGHT}m (Wall: ${wallId})`
                );
            }
        }

        if (blockingIssues.length > 0) {
            return {
                ok: false,
                reason: blockingIssues[0].split(':')[0],
                blockingIssues,
                warnings
            };
        }

        return { ok: true, warnings: warnings.length > 0 ? warnings : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        if (this.executed) {
            return { success: false, affectedElementIds: [], info: ['Command already executed'] };
        }

        const successfulUpdates: string[] = [];
        this.prevSnapshots.clear();

        for (const wallId of this.wallIds) {
            const wall = ctx.stores.wallStore.getById(wallId);
            if (!wall) continue;

            // §2.2 — Capture FULL semantic snapshot BEFORE mutation.
            // Phase B DTO migration: baseLine is [Point3D, Point3D] — plain spread suffices.
            this.prevSnapshots.set(wallId, {
                ...wall,
                baseLine: [{ ...wall.baseLine[0] }, { ...wall.baseLine[1] }],
                openings: wall.openings ? wall.openings.map((o: any) => ({ ...o })) : [],
                childrenIds: wall.childrenIds ? [...wall.childrenIds] : []
            });

            // §2.1/§2.3 FIX: execute() must use full-replacement semantics (updateWall)
            // to be symmetric with undo() which also calls updateWall(snapshot).
            // Partial patch via update(id, { height }) was asymmetric with undo.
            const nextState = {
                ...wall,
                // baseLine is already [Point3D, Point3D] — spread for isolation.
                baseLine: [{ ...wall.baseLine[0] }, { ...wall.baseLine[1] }] as typeof wall.baseLine,
                height: this.newHeight
            };
            console.log("Updating wall:", wallId, "new height:", this.newHeight);
            ctx.stores.wallStore.updateWall(nextState);
            // Read back from store to confirm the update succeeded
            const updated = ctx.stores.wallStore.getById(wallId);

            if (updated) {
                successfulUpdates.push(wallId);
                this.emitWallUpdatedEvent(updated.id, updated.height);
                // Rebuild triggered automatically via wallStore.updateWall() → emit('update')
                // → subscriber in main.ts → wallFragmentBuilder.updateWall().
            }
        }

        if (successfulUpdates.length > 0) {
            this.triggerAIRefresh(successfulUpdates);
            this.executed = true;
            return {
                success: true,
                affectedElementIds: successfulUpdates,
                info: [`Updated height for ${successfulUpdates.length} walls to ${this.newHeight}m`]
            };
        }

        return { success: false, affectedElementIds: [], info: ['Failed to update any walls'] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed) return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };

        const restoredIds: string[] = [];
        for (const [wallId, snapshot] of this.prevSnapshots.entries()) {
            // §2.3 — Restore FULL snapshot via restoreSnapshot() which preserves
            // metadata.version (no audit-trail drift). cloneWallData() inside the
            // store reconstructs Vector3 from plain {x,y,z} tuples automatically.
            ctx.stores.wallStore.restoreSnapshot(snapshot);
            restoredIds.push(wallId);
            this.emitWallUpdatedEvent(wallId, snapshot.height);
        }

        this.triggerAIRefresh(restoredIds);
        this.executed = false;
        return { success: true, affectedElementIds: restoredIds, info: [`Restored height for ${restoredIds.length} walls`] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: [...this.targetIds],
            timestamp: this.timestamp,
            version: 1,
            payload: { wallIds: this.wallIds, newHeight: this.newHeight }
        };
    }

    static deserialize(data: SerializedCommand): UpdateWallHeightCommand {
        const wallIds = data.payload.wallIds || (data.payload.wallId ? [data.payload.wallId] : []);
        return new UpdateWallHeightCommand({
            wallIds,
            newHeight: data.payload.newHeight
        });
    }

    private emitWallUpdatedEvent(wallId: string, _height: number): void {
        _bus.emit('wall-updated', { id: wallId }); // F.events.17
    }

    private triggerAIRefresh(_elementIds: string[]): void {
        _bus.emit('bim-model-changed', {}); // F.events.17
    }
}
