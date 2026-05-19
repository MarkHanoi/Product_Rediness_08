import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import { doorStore } from '@pryzm/geometry-door';

export class UpdateDoorWidthCommand implements Command {
    readonly affectedStores = ["door", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_DOOR_WIDTH;
    timestamp: number = Date.now();
    targetIds: string[];
    // §2.2: Full element snapshot captured before mutation — not just a scalar.
    // Width changes affect opening geometry so we snapshot the full door state.
    private oldDoorSnapshot: { width: number; wallId: string } | null = null;

    constructor(private doorId: string, private newValue: number) {
        this.targetIds = [doorId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const door = context.stores.wallStore.getDoor(this.doorId);
        if (!door) return { ok: false, reason: 'Door not found' };
        if (this.newValue <= 0) return { ok: false, reason: 'Width must be positive' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const doorElem = wallStore.getDoor(this.doorId);
        if (!doorElem) return { success: false, affectedElementIds: [] };

        // §2.2: Capture snapshot before mutation.
        this.oldDoorSnapshot = { width: doorElem.width, wallId: doorElem.wallId };

        wallStore.updateDoor(this.doorId, { width: this.newValue });
        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { width: this.newValue });
        }

        return { success: true, affectedElementIds: [this.doorId, doorElem.wallId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.oldDoorSnapshot) return { success: false, affectedElementIds: [] };

        context.stores.wallStore.updateDoor(this.doorId, { width: this.oldDoorSnapshot.width });
        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { width: this.oldDoorSnapshot.width });
        }

        return { success: true, affectedElementIds: [this.doorId, this.oldDoorSnapshot.wallId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            payload: { doorId: this.doorId, newValue: this.newValue },
            version: 1
        };
    }
}
