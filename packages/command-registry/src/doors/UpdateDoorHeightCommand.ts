import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import { doorStore } from '@pryzm/geometry-door';

export class UpdateDoorHeightCommand implements Command {
    readonly affectedStores = ["door", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_DOOR_HEIGHT;
    timestamp: number = Date.now();
    targetIds: string[];
    private oldValue: number | null = null;

    constructor(private doorId: string, private newValue: number) {
        this.targetIds = [doorId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        // §3.4 FIX: Use public getDoor() API — never access private store internals directly.
        const door = context.stores.wallStore.getDoor(this.doorId);
        if (!door) return { ok: false, reason: 'Door not found' };
        if (this.newValue <= 0) return { ok: false, reason: 'Height must be positive' };
        // PLAN-12: Validate that sillHeight + newHeight does not exceed the host wall height.
        const wall = context.stores.wallStore.getById(door.wallId);
        if (wall && door.sillHeight + this.newValue > wall.height) {
            return { ok: false, reason: `Door height (${this.newValue.toFixed(2)}m) + sill (${door.sillHeight.toFixed(2)}m) exceeds wall height (${wall.height.toFixed(2)}m)` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        // §3.4 FIX: Use public getDoor() API.
        const doorElem = wallStore.getDoor(this.doorId);
        if (!doorElem) return { success: false, affectedElementIds: [] };

        this.oldValue = doorElem.height;
        wallStore.updateDoor(this.doorId, { height: this.newValue });
        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { height: this.newValue });
        }

        return { success: true, affectedElementIds: [this.doorId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.oldValue === null) return { success: false, affectedElementIds: [] };
        context.stores.wallStore.updateDoor(this.doorId, { height: this.oldValue });
        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { height: this.oldValue! });
        }
        return { success: true, affectedElementIds: [this.doorId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, payload: { doorId: this.doorId, newValue: this.newValue }, version: 1 };
    }
}
