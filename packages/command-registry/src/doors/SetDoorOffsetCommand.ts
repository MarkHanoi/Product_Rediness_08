/**
 * SetDoorOffsetCommand — absolute-offset version designed for the 2D plan-view
 * live-drag workflow.
 *
 * MoveDoorCommand uses a relative (distance + direction) API which is not suitable
 * for drag-commits where the store is already at the new position. This command
 * takes explicit prevOffset / newOffset and re-applies newOffset on execute()
 * (idempotent if the store is already there) so undo correctly reverts.
 *
 * WallOccupancyStore clamp is still enforced in canExecute().
 */
import {
    Command,
    CommandContext,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
} from '../types';
import { doorStore } from '@pryzm/geometry-door';
import { wallOccupancyStore, canPlaceRefusalText } from '@pryzm/geometry-wall';

export class SetDoorOffsetCommand implements Command {
    readonly affectedStores = ["door", "wall"] as const;
    readonly id             = crypto.randomUUID();
    readonly type           = CommandType.MOVE_DOOR;
    readonly timestamp      = Date.now();
    readonly targetIds:     string[];

    constructor(
        private readonly doorId:     string,
        private readonly newOffset:  number,
        private readonly prevOffset: number,
    ) {
        this.targetIds = [doorId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const door = ctx.stores.wallStore.getDoor(this.doorId);
        if (!door) return { ok: false, reason: 'Door not found' };
        const wall = ctx.stores.wallStore.getById(door.wallId);
        if (!wall)  return { ok: false, reason: 'Host wall not found' };
        const occ = wallOccupancyStore.canPlace(wall, this.newOffset, door.width, this.doorId);
        // §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13.8) — render through the shared
        // canPlaceRefusalText() so the refusal reaches the user CARRYING its
        // CanPlaceRefusalCode, instead of manufacturing a verdict sentence exactly
        // when the validator refused and said nothing.
        if (!occ.valid) return { ok: false, reason: canPlaceRefusalText(occ) };
        return { ok: true };
    }

    /**
     * §ADR-0319-CLASS-2 — the host wall's `_renderVersion` as it stood BEFORE
     * `execute()` ran. `undo()` writes it back verbatim so the counter returns to
     * State A instead of ratcheting +2 per undo/redo cycle (the defect the BIM
     * 2.0 certification measured on this exact verb: `expected 3 got 5`).
     * `undefined` until the command has executed, and `undefined` for legacy
     * walls that carry no version stamp — in both cases the mutator keeps its
     * default bump, which is the pre-existing behaviour.
     */
    private prevWallRenderVersion: number | undefined = undefined;

    execute(ctx: CommandContext): CommandResult {
        const { wallStore } = ctx.stores;
        const door = wallStore.getDoor(this.doorId);
        if (!door) return { success: false, affectedElementIds: [] };
        this.prevWallRenderVersion = wallStore.getById(door.wallId)?._renderVersion;
        wallStore.updateDoor(this.doorId, { offset: this.newOffset });
        if (doorStore.has(this.doorId)) doorStore.update(this.doorId, { offset: this.newOffset });
        return { success: true, affectedElementIds: [this.doorId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const { wallStore } = ctx.stores;
        const door = wallStore.getDoor(this.doorId);
        if (!door) return { success: false, affectedElementIds: [] };
        wallStore.updateDoor(this.doorId, { offset: this.prevOffset },
            { restoreRenderVersion: this.prevWallRenderVersion });
        if (doorStore.has(this.doorId)) doorStore.update(this.doorId, { offset: this.prevOffset });
        return { success: true, affectedElementIds: [this.doorId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version:   1,
            payload:   { doorId: this.doorId, newOffset: this.newOffset, prevOffset: this.prevOffset },
        };
    }
}
