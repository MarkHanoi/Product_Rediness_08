import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import { doorStore } from '@pryzm/geometry-door';

export class UpdateDoorFrameColorCommand implements Command {
    readonly affectedStores = ["door", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_DOOR_FRAME_COLOR;
    timestamp: number = Date.now();
    targetIds: string[];
    private oldValue: string | null = null;

    constructor(private doorId: string, private newValue: string) {
        this.targetIds = [doorId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const doorElem = context.stores.wallStore.getDoor(this.doorId);
        if (!doorElem) return { ok: false, reason: 'Door not found' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const doorElem = wallStore.getDoor(this.doorId);
        if (!doorElem) return { success: false, affectedElementIds: [] };

        // PLAN-15: Read old value from the authoritative DoorStore (not wallStore with hardcoded fallback).
        // DoorStore.getById() returns the rich record with the correct schema default '#f2f0ed'.
        const richDoor = doorStore.getById(this.doorId);
        this.oldValue = richDoor?.frameColor ?? '#f2f0ed';

        wallStore.updateDoor(this.doorId, { frameColor: this.newValue });
        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { frameColor: this.newValue });
        }

        return { success: true, affectedElementIds: [this.doorId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.oldValue === null) return { success: false, affectedElementIds: [] };
        context.stores.wallStore.updateDoor(this.doorId, { frameColor: this.oldValue });
        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { frameColor: this.oldValue! });
        }
        return { success: true, affectedElementIds: [this.doorId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, payload: { doorId: this.doorId, newValue: this.newValue }, version: 1 };
    }
}
