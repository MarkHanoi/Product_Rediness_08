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
import { wallOccupancyStore } from '@pryzm/geometry-wall';

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
        if (!occ.valid) return { ok: false, reason: occ.reason ?? 'Position occupied or out of bounds' };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const { wallStore } = ctx.stores;
        const door = wallStore.getDoor(this.doorId);
        if (!door) return { success: false, affectedElementIds: [] };
        wallStore.updateDoor(this.doorId, { offset: this.newOffset });
        if (doorStore.has(this.doorId)) doorStore.update(this.doorId, { offset: this.newOffset });
        return { success: true, affectedElementIds: [this.doorId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const { wallStore } = ctx.stores;
        const door = wallStore.getDoor(this.doorId);
        if (!door) return { success: false, affectedElementIds: [] };
        wallStore.updateDoor(this.doorId, { offset: this.prevOffset });
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
