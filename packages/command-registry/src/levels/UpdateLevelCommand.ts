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
// §LEVEL-DATUM-DIRTIES-ITS-VIEWS (L-11041) — see `_dirtyOwnViews`.
import { viewDependencyTracker } from '@pryzm/core-app-model';
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

        // §LEVEL-DATUM-DIRTIES-ITS-VIEWS (L-11041) — see `_dirtyOwnViews`.
        this._dirtyOwnViews(this.payload.updates);

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

        // §LEVEL-DATUM-DIRTIES-ITS-VIEWS (L-11041) — undo restores the whole
        // snapshot, so it can move BOTH datum fields back; dirty unconditionally.
        this._dirtyOwnViews({ elevation: this.prevSnapshot.elevation, height: this.prevSnapshot.height });

        return {
            success: true,
            affectedElementIds: [this.payload.levelId],
            info: [`Level "${this.prevSnapshot.name}" restored.`]
        };
    }

    /**
     * §LEVEL-DATUM-DIRTIES-ITS-VIEWS (L-11041, lane LEVELHEIGHT61) — mark this
     * level's 2D views stale when the edit moved the DATUM.
     *
     * `ViewDependencyTracker` listens to `StoreEventBus` ELEMENT events. A level
     * is not a store element, so a datum edit dirtied no view. The elevation half
     * was accidentally covered — `BimKernel.updateLevel` fires
     * `spatial-authority-reconcile` on an elevation change, the builders re-run,
     * and THEIR store events dirty the view — but that relay needs the level to
     * have `childrenIds` (SpatialAuthority returns early otherwise), and the
     * HEIGHT half has no dispatch at all (BimKernel:370 dispatches only on
     * elevation). An empty or freshly-added level therefore kept a stale drawing.
     *
     * Scoped deliberately to `elevation` / `height`: a name, colour or visibility
     * edit changes no projected geometry and must not pay for a re-projection.
     *
     * Never throws — the model change has already landed.
     */
    private _dirtyOwnViews(updates: Partial<Pick<Level, 'elevation' | 'height'>>): void {
        if (updates.elevation === undefined && updates.height === undefined) return;
        try {
            viewDependencyTracker.markLevelsDirty([this.payload.levelId]);
        } catch (err) {
            console.warn(
                `[UpdateLevelCommand] §LEVEL-DATUM-DIRTIES-ITS-VIEWS: could not mark views dirty for `
                + `"${this.payload.levelId}" — the model change stands; the drawing may be stale until `
                + 'the next edit or view activation.',
                err,
            );
        }
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
