/**
 * SetWindowOffsetCommand — absolute-offset version for 2D plan-view live-drag.
 * Mirror of SetDoorOffsetCommand but for windows.
 *
 * §C15 DUAL-STORE RULE: every offset mutation MUST update BOTH wallStore
 * (via updateWindow) AND the standalone windowStore so that WindowBuilder
 * reads the current offset when it calls rebuildForWall().  Omitting the
 * windowStore.update() call causes the 3D mesh to stay at the old offset
 * while only the wall void repositions — the root cause of bug DW-14.
 */
import {
    Command,
    CommandContext,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
} from '../types';
import { wallOccupancyStore } from '@pryzm/geometry-wall';
import { windowStore } from '@pryzm/geometry-window';

export class SetWindowOffsetCommand implements Command {
    readonly affectedStores = ["window", "wall"] as const;
    readonly id             = crypto.randomUUID();
    readonly type           = CommandType.MOVE_WINDOW;
    readonly timestamp      = Date.now();
    readonly targetIds:     string[];

    constructor(
        private readonly windowId:   string,
        private readonly newOffset:  number,
        private readonly prevOffset: number,
    ) {
        this.targetIds = [windowId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const win = ctx.stores.wallStore.getWindow(this.windowId);
        if (!win)  return { ok: false, reason: 'Window not found' };
        const wall = ctx.stores.wallStore.getById(win.wallId);
        if (!wall) return { ok: false, reason: 'Host wall not found' };
        const occ  = wallOccupancyStore.canPlace(wall, this.newOffset, win.width, this.windowId);
        if (!occ.valid) return { ok: false, reason: occ.reason ?? 'Position occupied or out of bounds' };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const { wallStore } = ctx.stores;
        const win = wallStore.getWindow(this.windowId);
        if (!win) return { success: false, affectedElementIds: [] };
        wallStore.updateWindow(this.windowId, { offset: this.newOffset });
        // §C15 DUAL-STORE RULE: keep standalone windowStore in sync so that
        // WindowBuilder.rebuildForWall() reads the new offset when it calls
        // positionGroup().  Mirrors SetDoorOffsetCommand — doorStore.update().
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { offset: this.newOffset });
        }
        return { success: true, affectedElementIds: [this.windowId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const { wallStore } = ctx.stores;
        const win = wallStore.getWindow(this.windowId);
        if (!win) return { success: false, affectedElementIds: [] };
        wallStore.updateWindow(this.windowId, { offset: this.prevOffset });
        // §C15 DUAL-STORE RULE: revert standalone windowStore on undo.
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { offset: this.prevOffset });
        }
        return { success: true, affectedElementIds: [this.windowId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version:   1,
            payload:   { windowId: this.windowId, newOffset: this.newOffset, prevOffset: this.prevOffset },
        };
    }
}
