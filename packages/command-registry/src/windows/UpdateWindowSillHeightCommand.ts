import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import { windowStore } from '@pryzm/geometry-window';

export class UpdateWindowSillHeightCommand implements Command {
    readonly affectedStores = ["window", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_WINDOW_SILL_HEIGHT;
    timestamp: number = Date.now();
    targetIds: string[];
    private oldValue: number | null = null;

    constructor(private windowId: string, private newValue: number) {
        this.targetIds = [windowId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const windowElem = context.stores.wallStore.getWindow(this.windowId);
        if (!windowElem) return { ok: false, reason: 'Window not found' };
        if (this.newValue < 0) return { ok: false, reason: 'Sill height cannot be negative' };
        // PLAN-12: Validate that newSillHeight + window.height does not exceed wall height.
        const wall = context.stores.wallStore.getById(windowElem.wallId);
        if (wall && this.newValue + windowElem.height > wall.height) {
            return { ok: false, reason: `Sill height (${this.newValue.toFixed(2)}m) + window height (${windowElem.height.toFixed(2)}m) exceeds wall height (${wall.height.toFixed(2)}m)` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const windowElem = wallStore.getWindow(this.windowId);
        if (!windowElem) return { success: false, affectedElementIds: [] };

        this.oldValue = windowElem.sillHeight;
        wallStore.updateWindow(this.windowId, { sillHeight: this.newValue });
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { sillHeight: this.newValue });
        }

        return { success: true, affectedElementIds: [this.windowId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.oldValue === null) return { success: false, affectedElementIds: [] };
        context.stores.wallStore.updateWindow(this.windowId, { sillHeight: this.oldValue });
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { sillHeight: this.oldValue! });
        }
        return { success: true, affectedElementIds: [this.windowId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, payload: { windowId: this.windowId, newValue: this.newValue }, version: 1 };
    }
}
