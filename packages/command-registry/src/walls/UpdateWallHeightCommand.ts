import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, WALL_HEIGHT_CONSTRAINTS, CommandContext } from '../types';
// §FIX-WALL-SHRINK-REFIT (W2-1) — the wall-side use of the ALREADY-EXISTING
// opening gate. See the policy note on `planOpeningRefit`.
import { wallOccupancyStore } from '@pryzm/geometry-wall';
import type { Opening, WallData } from '@pryzm/geometry-wall';
// §L-916-FRAME-RECORD-SYNC — `updateOpening` writes the VOID record only; the
// FRAME mesh is positioned from a SECOND store this package must write itself.
// A height re-clamp moves `sillHeight`, so this command carries the SAME defect
// as the two baseline commands, in the vertical axis instead of the horizontal.
import { reseatOpeningWithFrame } from './hostedOpeningFrameSync';
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

    /**
     * §FIX-WALL-SHRINK-REFIT (W2-1) — per wall, the PRE-CLAMP openings this
     * command moved so they stayed inside the lowered wall.
     *
     * `WallStore.restoreSnapshot()` restores `height` but **NOT `openings`**
     * (openings have their own mutation API), so `prevSnapshots` alone cannot
     * revert a relocation. Without this record an undo would raise the wall back
     * to 3.0 m and leave the window sill where the 1.0 m wall pushed it.
     */
    private relocated: Map<string, Opening[]> = new Map();

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

            // §FIX-WALL-SHRINK-REFIT (W2-1, EV-03 R-2) — until now the ONLY
            // validation here was the two GLOBAL height constants, and
            // execute() copied `openings` forward verbatim
            // (`wall.openings.map(o => ({...o}))`) without ever consulting
            // them — so lowering a 3.0 m wall to 1.0 m left a 2.1 m door
            // exceeding its host by 1.1 m (EXECUTED probe, EV-03 §2.1).
            //
            // The gate is the same one the length axis uses; the policy is the
            // same policy: a sill that no longer fits is MOVED, a door that is
            // taller than the wall at any sill is a REFUSAL naming both numbers.
            const refit = wallOccupancyStore.planOpeningRefit(
                { ...wall, height: this.newHeight } as WallData,
            );
            if (!refit.ok) {
                for (const r of refit.refusals) {
                    blockingIssues.push(`OPENING_DOES_NOT_FIT: ${r.reason} (Wall: ${wallId})`);
                }
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
        const refusedInfo: string[] = [];
        this.prevSnapshots.clear();
        this.relocated.clear();

        for (const wallId of this.wallIds) {
            const wall = ctx.stores.wallStore.getById(wallId);
            if (!wall) continue;

            // §FIX-WALL-SHRINK-REFIT (W2-1) — re-ask the gate per wall as the
            // last line of defence for any caller that dispatched without
            // canExecute(). A refused wall is SKIPPED, not damaged: it keeps its
            // current height and its openings, and the reason is reported in
            // `info`. This mirrors the existing `if (!wall) continue` shape —
            // the command reports what it actually did, per §C7.
            const refit = wallOccupancyStore.planOpeningRefit(
                { ...wall, height: this.newHeight } as WallData,
            );
            if (!refit.ok) {
                const reason = refit.refusals.map(r => r.reason).join('; ');
                console.warn(
                    `[UpdateWallHeightCommand] §FIX-WALL-SHRINK-REFIT skipping wall ${wallId}: ${reason}`,
                );
                refusedInfo.push(`OPENING_DOES_NOT_FIT (${wallId}): ${reason}`);
                continue;
            }

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

                // §FIX-WALL-SHRINK-REFIT (W2-1) — the wall is now shorter; pull
                // any opening whose SILL fell outside it back inside. Only
                // positions are ever in `relocations` — an opening too TALL for
                // the new wall was refused above, never silently squashed.
                // Applied through `updateOpening` (the sanctioned API) and AFTER
                // the height write, so the store's own clampToWall agrees.
                if (refit.relocations.length > 0) {
                    const moved: Opening[] = [];
                    for (const r of refit.relocations) {
                        try {
                            reseatOpeningWithFrame(
                                ctx.stores.wallStore,
                                wallId,
                                {
                                    ...r.opening,
                                    offset:     r.next.offset,
                                    sillHeight: r.next.sillHeight,
                                },
                                'UpdateWallHeightCommand',
                            );
                            moved.push(r.opening);   // PRE-clamp record, for undo
                            console.log(
                                `[UpdateWallHeightCommand] §FIX-WALL-SHRINK-REFIT re-clamped ` +
                                `${r.opening.type} ${r.opening.elementId ?? r.opening.id} on wall ` +
                                `${wallId}: sill ${r.opening.sillHeight.toFixed(3)} → ` +
                                `${r.next.sillHeight.toFixed(3)} m`,
                            );
                        } catch (err) {
                            console.warn(
                                `[UpdateWallHeightCommand] §FIX-WALL-SHRINK-REFIT could not re-clamp ` +
                                `opening ${r.opening.id} on wall ${wallId}:`, err,
                            );
                        }
                    }
                    if (moved.length > 0) this.relocated.set(wallId, moved);
                }

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
                info: [
                    `Updated height for ${successfulUpdates.length} walls to ${this.newHeight}m`,
                    ...refusedInfo,
                ]
            };
        }

        return {
            success: false,
            affectedElementIds: [],
            info: refusedInfo.length > 0 ? refusedInfo : ['Failed to update any walls'],
            error: refusedInfo[0],
        };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed) return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };

        const restoredIds: string[] = [];
        for (const [wallId, snapshot] of this.prevSnapshots.entries()) {
            // §2.3 — Restore FULL snapshot via restoreSnapshot() which preserves
            // metadata.version (no audit-trail drift). cloneWallData() inside the
            // store reconstructs Vector3 from plain {x,y,z} tuples automatically.
            ctx.stores.wallStore.restoreSnapshot(snapshot);

            // §FIX-WALL-SHRINK-REFIT (W2-1) — restoreSnapshot does NOT carry
            // `openings`, so put back any sill this command moved. Ordered AFTER
            // the restore: the wall is already back at its original height, so
            // the store's re-clamp is a no-op on these known-good values.
            // §L-916-FRAME-RECORD-SYNC — same seam as execute(), so ONE Ctrl+Z
            // puts BOTH records back (C70 C-INV-3).
            for (const opening of this.relocated.get(wallId) ?? []) {
                try {
                    reseatOpeningWithFrame(
                        ctx.stores.wallStore, wallId, opening, 'UpdateWallHeightCommand.undo',
                    );
                } catch (err) {
                    console.warn(
                        `[UpdateWallHeightCommand] §FIX-WALL-SHRINK-REFIT undo could not restore ` +
                        `opening ${opening.id} on wall ${wallId}:`, err,
                    );
                }
            }

            restoredIds.push(wallId);
            this.emitWallUpdatedEvent(wallId, snapshot.height);
        }
        this.relocated.clear();

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
