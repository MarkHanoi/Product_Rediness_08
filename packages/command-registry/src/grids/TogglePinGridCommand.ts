/**
 * TogglePinGridCommand — locks or unlocks a grid's geometry against edits.
 *
 * §40 §3 — When `isPinned` is true, GridStore.update() refuses to mutate any
 * geometry-touching field (axis, position, extents, mode, start/end). Visual,
 * naming and visibility updates remain allowed.
 *
 * This command is the ONLY supported way to flip the pin state — it bypasses
 * the GridStore guard via the `_force: true` flag (§40 §3.2).
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface TogglePinGridPayload {
    gridId: string;
    /** Optional explicit target state. If omitted, the current state is flipped. */
    pinned?: boolean;
}

export class TogglePinGridCommand implements Command {
    readonly affectedStores = ['grid'] as const;
    readonly id: string;
    readonly type = CommandType.TOGGLE_PIN_GRID;
    readonly timestamp: number;
    readonly targetIds: string[];
    private prevPinned: boolean | null = null;

    constructor(private readonly payload: TogglePinGridPayload) {
        this.id = `cmd-pin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.gridId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const grid = context.stores.gridStore.get(this.payload.gridId);
        if (!grid) return { ok: false, reason: `Grid "${this.payload.gridId}" not found.` };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { gridStore } = context.stores;
        const grid = gridStore.get(this.payload.gridId);
        if (!grid) {
            return { success: false, affectedElementIds: [], error: `Grid "${this.payload.gridId}" not found.` };
        }

        this.prevPinned = grid.isPinned ?? false;
        const next = this.payload.pinned ?? !this.prevPinned;

        // _force bypasses the pin guard so we can actually unpin.
        gridStore.update(this.payload.gridId, { isPinned: next, _force: true } as any);

        _bus.emit('grid-updated', { id: this.payload.gridId }); // F.events.17
        _bus.emit('ai-model-update', {}); // F.events.17

        return {
            success: true,
            affectedElementIds: [this.payload.gridId],
            info: [`Grid "${grid.name}" ${next ? 'pinned' : 'unpinned'}.`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (this.prevPinned === null) {
            return { success: false, affectedElementIds: [], error: 'No prior state to restore.' };
        }
        const { gridStore } = context.stores;
        gridStore.update(this.payload.gridId, { isPinned: this.prevPinned, _force: true } as any);

        _bus.emit('grid-updated', { id: this.payload.gridId }); // F.events.17
        _bus.emit('ai-model-update', {}); // F.events.17

        return { success: true, affectedElementIds: [this.payload.gridId] };
    }

    serialize(): SerializedCommand {
        return {
            type: CommandType.TOGGLE_PIN_GRID,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
