import {
    Command, CommandContext, CommandResult, CommandType,
    CommandValidationResult, SerializedCommand,
} from '../types';
import type { OverrideLayer } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
import { cloneOverrideLayer, getOrCreateOverrideLayer, restoreOverrideLayer } from './OverrideCommandUtils';

export class ClearAllOverridesCommand implements Command {
    /** F4.4 — Mutates the view's intent instance overrides. */
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.CLEAR_ALL_OVERRIDES;
    timestamp = Date.now();
    targetIds: string[];
    private _previous: OverrideLayer | null = null;

    constructor(private viewId: string) {
        this.targetIds = [viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.viewId) return { ok: false, reason: 'viewId is required.' };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = getOrCreateOverrideLayer(this.viewId);
        if (!current) return { success: false, affectedElementIds: [], error: 'View intent instance is unavailable.' };
        this._previous = cloneOverrideLayer(current);
        viewIntentInstanceStore.clearOverrides(this.viewId);
        return { success: true, affectedElementIds: [] };
    }

    undo(_ctx: CommandContext): CommandResult {
        restoreOverrideLayer(this.viewId, this._previous);
        return { success: true, affectedElementIds: [] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: { viewId: this.viewId }, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}