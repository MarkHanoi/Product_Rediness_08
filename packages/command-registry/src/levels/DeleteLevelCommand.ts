/**
 * DeleteLevelCommand
 *
 * Permanently removes a level from the project.
 *
 * §01 §2.1  Single Source of Mutation.
 * §01 §2.2  Snapshot Rule — full Level snapshot captured before deletion for undo.
 * §01 §2.3  Undo re-creates the level exactly as it was.
 *
 * Safety constraints enforced in canExecute():
 *  - Cannot delete the last remaining level.
 *  - Cannot delete a level that still contains elements (childrenIds > 0).
 *    The UI must guide the user to move or delete elements first.
 *  - Cannot delete 'L0' (ground level) if it is the only remaining level.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Level } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();

export interface DeleteLevelPayload {
    levelId: string;
}

export class DeleteLevelCommand implements Command {
    readonly affectedStores = ["level", "wall", "slab"] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_LEVEL;
    readonly timestamp: number;
    readonly targetIds: string[];

    private payload: DeleteLevelPayload;
    private prevSnapshot: Level | null = null;
    private prevActiveLevelId: string | null = null;

    constructor(payload: DeleteLevelPayload) {
        this.id = `cmd-delete-level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

        const allLevels = bimManager.getLevels();
        if (allLevels.length <= 1) {
            return { ok: false, reason: 'Cannot delete the last remaining level.' };
        }

        // §02 §1.3: No silent orphaning — elements must be explicitly moved first.
        if (level.childrenIds.length > 0) {
            return {
                ok: false,
                reason: `Level "${level.name}" contains ${level.childrenIds.length} element(s). Move or delete all elements before removing the level.`
            };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { bimManager, projectContext } = context;

        const level = bimManager.getLevelById(this.payload.levelId);
        if (!level) {
            return { success: false, affectedElementIds: [], error: `Level "${this.payload.levelId}" not found.` };
        }

        // §01 §2.2: Capture full snapshot before deletion.
        this.prevSnapshot = structuredClone(level);
        this.prevActiveLevelId = projectContext.activeLevelId;

        bimManager.removeLevel(this.payload.levelId);

        // Switch active level if the deleted level was active.
        if (projectContext.activeLevelId === this.payload.levelId) {
            const remaining = bimManager.getLevels();
            if (remaining.length > 0) {
                // Pick the level immediately below by elevation, or the first one.
                const sorted = remaining.slice().sort((a, b) => a.elevation - b.elevation);
                const below = sorted.filter(l => l.elevation < level.elevation);
                projectContext.activeLevelId = below.length > 0
                    ? below[below.length - 1].id
                    : sorted[0].id;
            }
        }

        _bus.emit('update-project-ui', {});
        _bus.emit('bim-level-removed', { id: this.payload.levelId });
        _bus.emit('ai-model-update', { model: '' });

        return {
            success: true,
            affectedElementIds: [this.payload.levelId],
            info: [`Level "${level.name}" deleted.`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo.' };
        }

        const { bimManager, projectContext } = context;

        // §01 §2.3: Full restoration of the snapshot.
        bimManager.addLevel(this.prevSnapshot);

        if (this.prevActiveLevelId) {
            projectContext.activeLevelId = this.prevActiveLevelId;
        }

        _bus.emit('update-project-ui', {});
        _bus.emit('bim-level-added', { id: this.prevSnapshot.id, elevation: this.prevSnapshot.elevation });

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
