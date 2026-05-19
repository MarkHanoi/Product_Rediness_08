import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import * as THREE from '@pryzm/renderer-three/three';
import { windowStore } from '@pryzm/geometry-window';
import { wallOccupancyStore } from '@pryzm/geometry-wall';

/**
 * MoveWindowCommand — relative-move command (distance + direction).  Mirror of
 * MoveDoorCommand.  See MoveDoorCommand for the §REDO-IDEMPOTENCY contract.
 */
export class MoveWindowCommand implements Command {
    readonly affectedStores = ["window", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.MOVE_WINDOW;
    timestamp: number = Date.now();
    targetIds: string[];

    // §REDO-IDEMPOTENCY: captured once on first execute, reused on redo.
    private oldOffset: number | null = null;
    private newOffset: number | null = null;
    private executed = false;

    constructor(private windowId: string, private distance: number, private direction: 'left' | 'right') {
        this.targetIds = [windowId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const windowElem = context.stores.wallStore.getWindow(this.windowId);
        if (!windowElem) return { ok: false, reason: 'Window not found' };

        const wall = context.stores.wallStore.getById(windowElem.wallId);
        if (!wall) return { ok: false, reason: 'Host wall not found' };

        const start = wall.baseLine[0];
        const end = wall.baseLine[1];
        const wallLength = new THREE.Vector3().subVectors(end, start).length();

        // §REDO-IDEMPOTENCY: validate against saved newOffset on redo.
        const targetOffset = this.executed && this.newOffset !== null
            ? this.newOffset
            : this._clampedDelta(windowElem.offset, windowElem.width, wallLength);

        const occupancy = wallOccupancyStore.canPlace(wall, targetOffset, windowElem.width, windowElem.id);
        if (!occupancy.valid) {
            return { ok: false, reason: occupancy.reason ?? 'Position is occupied or out of bounds' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const windowElem = wallStore.getWindow(this.windowId);
        if (!windowElem) return { success: false, affectedElementIds: [] };

        const wall = wallStore.getById(windowElem.wallId);
        if (!wall) return { success: false, affectedElementIds: [] };

        // §REDO-IDEMPOTENCY: capture absolute offsets ONCE on first execute.
        if (!this.executed) {
            const start = wall.baseLine[0];
            const end = wall.baseLine[1];
            const wallLength = new THREE.Vector3().subVectors(end, start).length();
            this.oldOffset = windowElem.offset;
            this.newOffset = this._clampedDelta(windowElem.offset, windowElem.width, wallLength);
        }

        if (this.newOffset === null) return { success: false, affectedElementIds: [] };

        wallStore.updateWindow(this.windowId, { offset: this.newOffset });

        // Sync the new WindowStore so WindowBuilder repositions its geometry group.
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { offset: this.newOffset });
        }

        this.executed = true;
        return { success: true, affectedElementIds: [this.windowId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.executed || this.oldOffset === null) {
            return { success: false, affectedElementIds: [] };
        }
        context.stores.wallStore.updateWindow(this.windowId, { offset: this.oldOffset });

        // Sync the new WindowStore so WindowBuilder repositions its geometry group.
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { offset: this.oldOffset });
        }

        this.executed = false;
        return { success: true, affectedElementIds: [this.windowId] };
    }

    /**
     * PLAN-11 CENTER-convention clamp: offset is the distance from baseLine[0]
     * to the CENTRE of the opening, so the valid range is [halfW, length - halfW].
     */
    private _clampedDelta(currentOffset: number, width: number, wallLength: number): number {
        const moveDist = this.direction === 'right' ? this.distance : -this.distance;
        const halfW = width / 2;
        return Math.max(halfW, Math.min(currentOffset + moveDist, wallLength - halfW));
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, payload: { windowId: this.windowId, distance: this.distance, direction: this.direction }, version: 1 };
    }
}
