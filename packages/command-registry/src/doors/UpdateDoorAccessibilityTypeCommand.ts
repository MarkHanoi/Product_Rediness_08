import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import { doorStore } from '@pryzm/geometry-door';

export class UpdateDoorAccessibilityTypeCommand implements Command {
    readonly affectedStores = ["door", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_DOOR_ACCESSIBILITY_TYPE;
    timestamp: number = Date.now();
    targetIds: string[];
    private oldValue: string | null = null;

    constructor(private doorId: string, private newValue: string) {
        this.targetIds = [doorId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const door = context.stores.wallStore.getDoor(this.doorId);
        if (!door) return { ok: false, reason: 'Door not found' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const door = wallStore.getDoor(this.doorId);
        if (!door) return { success: false, affectedElementIds: [] };
        this.oldValue = door.accessibilityType || '';
        wallStore.updateDoor(this.doorId, { accessibilityType: this.newValue });
        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { accessibilityType: this.newValue });
        }
        return { success: true, affectedElementIds: [this.doorId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.oldValue === null) return { success: false, affectedElementIds: [] };
        context.stores.wallStore.updateDoor(this.doorId, { accessibilityType: this.oldValue });
        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { accessibilityType: this.oldValue! });
        }
        return { success: true, affectedElementIds: [this.doorId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, payload: { doorId: this.doorId, newValue: this.newValue }, version: 1 };
    }
}
