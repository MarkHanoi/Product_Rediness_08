/**
 * UpdateGridCommand
 *
 * Mutates an existing BIM structural grid's properties: name, position,
 * axis extents, visibility, or color.
 *
 * §01 §2.1  Single Source of Mutation.
 * §01 §2.2  Snapshot Rule — full Grid snapshot captured before mutation.
 * §01 §2.3  Undo is full replacement of the previous snapshot.
 * §01 §3.8  GridStore.update() emits StoreEventBus 'update' event. // TODO(TASK-08)
 *
 * Both GridStore (semantic) and BimManager (visual) are updated atomically.
 * On undo, both are fully restored from the snapshot.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Grid } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface UpdateGridPayload {
    gridId: string;
    updates: Partial<Pick<Grid, 'name' | 'position' | 'axis' | 'extentMin' | 'extentMax' | 'isVisible' | 'color' | 'isPinned'>>;
}

export class UpdateGridCommand implements Command {
    readonly affectedStores = ["grid"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_GRID;
    readonly timestamp: number;
    readonly targetIds: string[];

    private payload: UpdateGridPayload;
    private prevSnapshot: Grid | null = null;

    constructor(payload: UpdateGridPayload) {
        this.id = `cmd-update-grid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.gridId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { gridStore } = context.stores;

        if (!gridStore.has(this.payload.gridId)) {
            return { ok: false, reason: `Grid "${this.payload.gridId}" not found.` };
        }

        const { updates } = this.payload;

        if (updates.name !== undefined && updates.name.trim() === '') {
            return { ok: false, reason: 'Grid name cannot be empty.' };
        }

        if (updates.position !== undefined && !isFinite(updates.position)) {
            return { ok: false, reason: 'Grid position must be a finite number.' };
        }

        if (updates.extentMin !== undefined && updates.extentMax !== undefined &&
            updates.extentMin >= updates.extentMax) {
            return { ok: false, reason: 'extentMin must be less than extentMax.' };
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

        // §01 §2.2: Capture full snapshot before mutation.
        this.prevSnapshot = structuredClone(grid);

        // Single store write (emits StoreEventBus 'update' — §01 §3.8).
        gridStore.update(this.payload.gridId, this.payload.updates);

        _bus.emit('grid-updated', { id: this.payload.gridId }); // F.events.17
        _bus.emit('ai-model-update', {}); // F.events.17

        const name = this.payload.updates.name ?? grid.name;
        return {
            success: true,
            affectedElementIds: [this.payload.gridId],
            info: [`Grid "${name}" updated.`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo.' };
        }

        const { gridStore } = context.stores;

        // §01 §2.3 + §2.7: Restore full snapshot through the store only.
        gridStore.update(this.payload.gridId, this.prevSnapshot);

        _bus.emit('grid-updated', { id: this.payload.gridId }); // F.events.17

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
