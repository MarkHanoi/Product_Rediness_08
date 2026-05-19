/**
 * RemoveGridCommand
 *
 * Removes a BIM structural grid from both the semantic store (GridStore)
 * and the visual layer (BimManager).
 *
 * §01 §2.1  Single Source of Mutation — replaces the fragile optional-chain
 *            call in AddGridCommand.undo() that previously called
 *            bimManager.removeGrid?.() without error handling.
 * §01 §2.2  Snapshot Rule — full Grid snapshot captured before removal for undo.
 * §01 §2.3  Undo re-adds the grid to both stores.
 * §01 §3.8  GridStore.remove() emits StoreEventBus 'delete' event. // TODO(TASK-08)
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Grid } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface RemoveGridPayload {
    gridId: string;
}

export class RemoveGridCommand implements Command {
    readonly affectedStores = ["grid"] as const;
    readonly id: string;
    readonly type = CommandType.REMOVE_GRID;
    readonly timestamp: number;
    readonly targetIds: string[];

    private payload: RemoveGridPayload;
    private prevSnapshot: Grid | null = null;

    constructor(payload: RemoveGridPayload) {
        this.id = `cmd-remove-grid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.gridId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { gridStore } = context.stores;

        if (!gridStore.has(this.payload.gridId)) {
            return { ok: false, reason: `Grid "${this.payload.gridId}" not found.` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        // §01 §2.7 Builder Isolation: only mutate GridStore. The renderer is
        // updated by BimManager's StoreEventBus listener.
        const { gridStore } = context.stores;

        const grid = gridStore.get(this.payload.gridId);
        if (!grid) {
            return { success: false, affectedElementIds: [], error: `Grid "${this.payload.gridId}" not found.` };
        }

        // §01 §2.2: Capture full snapshot before removal.
        this.prevSnapshot = structuredClone(grid);

        // Single store write (emits StoreEventBus 'delete' — §01 §3.8).
        gridStore.remove(this.payload.gridId);

        _bus.emit('grid-removed', { id: this.payload.gridId }); // F.events.17
        _bus.emit('ai-model-update', {}); // F.events.17

        return {
            success: true,
            affectedElementIds: [this.payload.gridId],
            info: [`Grid "${grid.name}" removed.`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo.' };
        }

        const { gridStore } = context.stores;

        // §01 §2.3 + §2.7: Restore full snapshot through the store only.
        gridStore.add(this.prevSnapshot);

        _bus.emit('grid-added', { id: this.prevSnapshot.id }); // F.events.17

        return {
            success: true,
            affectedElementIds: [this.payload.gridId],
            info: [`Grid "${this.prevSnapshot.name}" restored.`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
