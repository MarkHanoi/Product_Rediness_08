/**
 * UpdateLevelCommand
 *
 * Mutates an existing level's properties: name, elevation, height,
 * isVisible, or color.
 *
 * §01 §2.1  Single Source of Mutation — all changes go through this command.
 * §01 §2.2  Snapshot Rule — full Level snapshot captured before mutation.
 * §01 §2.3  Undo is full replacement of the previous snapshot.
 * §02 §1.5  Elevation change propagation — BimManager.updateLevel() fires the
 *            'spatial-authority-reconcile' window event which triggers the
 *            registered level rebuild callback (EngineBootstrap) → store events
 *            → DependencyResolver → Builders. This command must NOT call
 *            builders or the resolver directly.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Level } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();

export interface UpdateLevelPayload {
    levelId: string;
    updates: Partial<Pick<Level, 'name' | 'elevation' | 'height' | 'isVisible' | 'color'>>;
}

export class UpdateLevelCommand implements Command {
    readonly affectedStores = ["level"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_LEVEL;
    readonly timestamp: number;
    readonly targetIds: string[];

    private payload: UpdateLevelPayload;
    private prevSnapshot: Level | null = null;

    constructor(payload: UpdateLevelPayload) {
        this.id = `cmd-update-level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.levelId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { bimManager } = context;

        const level = bimManager.getLevelById(this.payload.levelId);
        if (!level) {
            return { ok: false, reason: `Level "${this.payload.levelId}" not found.` };
        }

        const { updates } = this.payload;

        if (updates.name !== undefined && updates.name.trim() === '') {
            return { ok: false, reason: 'Level name cannot be empty.' };
        }

        if (updates.elevation !== undefined && !isFinite(updates.elevation)) {
            return { ok: false, reason: 'Elevation must be a finite number.' };
        }

        if (updates.height !== undefined && updates.height <= 0) {
            return { ok: false, reason: 'Level height must be greater than zero.' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { bimManager } = context;

        const level = bimManager.getLevelById(this.payload.levelId);
        if (!level) {
            return { success: false, affectedElementIds: [], error: `Level "${this.payload.levelId}" not found.` };
        }

        // §01 §2.2: Capture full snapshot before mutation.
        this.prevSnapshot = structuredClone(level);

        // Apply updates via BimManager (spatial authority — §02 §1.1).
        // BimManager.updateLevel() fires 'spatial-authority-reconcile' when
        // elevation changes, which triggers the rebuild cascade via the
        // registered EngineBootstrap callback (§02 §1.5).
        bimManager.updateLevel(this.payload.levelId, this.payload.updates);

        _bus.emit('update-project-ui', {});
        _bus.emit('bim-level-updated', { id: this.payload.levelId });
        _bus.emit('ai-model-update', { model: '' });

        const name = this.payload.updates.name ?? level.name;
        return {
            success: true,
            affectedElementIds: [this.payload.levelId],
            info: [`Level "${name}" updated.`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo.' };
        }

        const { bimManager } = context;

        // §01 §2.3: Restore full previous snapshot.
        bimManager.updateLevel(this.payload.levelId, this.prevSnapshot);

        _bus.emit('update-project-ui', {});
        _bus.emit('bim-level-updated', { id: this.payload.levelId });

        return {
            success: true,
            affectedElementIds: [this.payload.levelId],
            info: [`Level "${this.prevSnapshot.name}" restored.`]
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
