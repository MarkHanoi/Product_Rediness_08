import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import { windowStore } from '@pryzm/geometry-window';

export class UpdateWindowFrameColorCommand implements Command {
    readonly affectedStores = ["window", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_WINDOW_FRAME_COLOR;
    timestamp: number = Date.now();
    targetIds: string[];
    private oldValue: string | null = null;

    constructor(private windowId: string, private newValue: string) {
        this.targetIds = [windowId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const windowElem = context.stores.wallStore.getWindow(this.windowId);
        if (!windowElem) return { ok: false, reason: 'Window not found' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const windowElem = wallStore.getWindow(this.windowId);
        if (!windowElem) return { success: false, affectedElementIds: [] };

        this.oldValue = windowElem.frameColor || '#333333';
        wallStore.updateWindow(this.windowId, { frameColor: this.newValue });
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { frameColor: this.newValue });
        }

        return { success: true, affectedElementIds: [this.windowId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.oldValue === null) return { success: false, affectedElementIds: [] };
        context.stores.wallStore.updateWindow(this.windowId, { frameColor: this.oldValue });
        if (windowStore.has(this.windowId)) {
            windowStore.update(this.windowId, { frameColor: this.oldValue! });
        }
        return { success: true, affectedElementIds: [this.windowId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, payload: { windowId: this.windowId, newValue: this.newValue }, version: 1 };
    }
}
