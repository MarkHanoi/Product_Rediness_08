import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import * as THREE from '@pryzm/renderer-three/three';
import { windowStore } from '@pryzm/geometry-window';
import { wallOccupancyStore } from '@pryzm/geometry-wall';

export class CenterWindowInWallCommand implements Command {
    readonly affectedStores = ["window", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.CENTER_WINDOW_IN_WALL;
    timestamp: number = Date.now();
    targetIds: string[];
    private oldOffset: number | null = null;

    constructor(private windowId: string) {
        this.targetIds = [windowId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const windowElem = context.stores.wallStore.getWindow(this.windowId);
        if (!windowElem) return { ok: false, reason: 'Window not found' };

        const wall = context.stores.wallStore.getById(windowElem.wallId);
        if (!wall) return { ok: false, reason: 'Host wall not found' };

        if (!wall.baseLine || wall.baseLine.length < 2) {
            return { ok: false, reason: 'Wall baseLine is missing or invalid' };
        }

        const start = wall.baseLine[0];
        const end = wall.baseLine[1];
        const wallLength = new THREE.Vector3().subVectors(end, start).length();

        // DW-01 FIX: CENTER convention — offset is distance from baseLine[0] to CENTRE of opening.
        // The centered position is wallLength / 2, clamped so the full window fits within the wall.
        const halfW = windowElem.width / 2;
        const newOffset = Math.max(halfW, Math.min(wallLength / 2, wallLength - halfW));

        // DW-01 FIX: Occupancy check with excludeId so the window's own footprint is ignored.
        const occupancy = wallOccupancyStore.canPlace(wall, newOffset, windowElem.width, windowElem.id);
        if (!occupancy.valid) {
            return { ok: false, reason: occupancy.reason ?? 'Centered position is occupied or out of bounds' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const windowElem = wallStore.getWindow(this.windowId);
        if (!windowElem) {
            console.error(`[CenterWindowInWallCommand] Window ${this.windowId} not found`);
            return { success: false, affectedElementIds: [] };
        }

        const wall = wallStore.getById(windowElem.wallId);
        if (!wall) {
            console.error(`[CenterWindowInWallCommand] Wall ${windowElem.wallId} not found for window ${this.windowId}`);
            return { success: false, affectedElementIds: [] };
        }

        if (!wall.baseLine || wall.baseLine.length < 2) {
            console.error('[CenterWindowInWallCommand] Wall baseLine is missing or invalid', wall);
            return { success: false, affectedElementIds: [] };
        }

        const start = wall.baseLine[0];
        const end = wall.baseLine[1];
        const wallLength = new THREE.Vector3().subVectors(end, start).length();

        // Capture snapshot BEFORE mutation for undo symmetry (§2.2 Snapshot Rule).
        this.oldOffset = windowElem.offset;

        // DW-01 FIX: CENTER convention — offset is distance from baseLine[0] to CENTRE of opening.
        // Correct formula: wallLength / 2, clamped so the window stays fully within the wall.
        const halfW = windowElem.width / 2;
        const newOffset = Math.max(halfW, Math.min(wallLength / 2, wallLength - halfW));

        // Sync wallStore (wall-level opening record).
        wallStore.updateWindow(this.windowId, { offset: newOffset });

        // DW-01 FIX: Sync windowStore so StoreEventBus fires and WindowBuilder rebuilds geometry.
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { offset: newOffset });
        }

        return { success: true, affectedElementIds: [this.windowId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.oldOffset === null) return { success: false, affectedElementIds: [] };

        // Restore wallStore (wall-level opening record).
        context.stores.wallStore.updateWindow(this.windowId, { offset: this.oldOffset });

        // DW-01 FIX: Restore windowStore so WindowBuilder rebuilds geometry to the previous offset.
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { offset: this.oldOffset });
        }

        return { success: true, affectedElementIds: [this.windowId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, payload: { windowId: this.windowId }, version: 1 };
    }
}
