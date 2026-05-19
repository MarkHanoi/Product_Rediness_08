import {
    Command, CommandContext, CommandResult, CommandType,
    CommandValidationResult, SerializedCommand,
} from '../types';
import type { ElementState, OverrideLayer, OverrideTargetKind } from '@pryzm/core-app-model';
import { applyOverrideLayer, getOrCreateOverrideLayer, restoreOverrideLayer } from './OverrideCommandUtils';

export class ClearOverrideCommand implements Command {
    /** F4.4 — Mutates the view's intent instance overrides. */
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.CLEAR_OVERRIDE;
    timestamp = Date.now();
    targetIds: string[];
    private _previous: OverrideLayer | null = null;

    constructor(
        private viewId: string,
        private targetKind: OverrideTargetKind,
        private targetId: string,
        private state?: ElementState,
    ) {
        this.targetIds = [targetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.viewId || !this.targetKind || !this.targetId) return { ok: false, reason: 'viewId, targetKind and targetId are required.' };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = getOrCreateOverrideLayer(this.viewId);
        if (!current) return { success: false, affectedElementIds: this.targetIds, error: 'View intent instance is unavailable.' };
        this._previous = current;
        const visibilityOverrides = current.visibilityOverrides.filter(o => !(o.targetKind === this.targetKind && o.targetId === this.targetId));
        const graphicOverrides = current.graphicOverrides.filter(o => !(o.targetKind === this.targetKind && o.targetId === this.targetId && (!this.state || o.state === this.state)));
        const isolateActive = current.isolateActive && visibilityOverrides.some(o => o.action === 'isolate');
        applyOverrideLayer(this.viewId, { ...current, visibilityOverrides, graphicOverrides, isolateActive });
        return { success: true, affectedElementIds: this.targetIds };
    }

    undo(_ctx: CommandContext): CommandResult {
        restoreOverrideLayer(this.viewId, this._previous);
        return { success: true, affectedElementIds: this.targetIds };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: { viewId: this.viewId, targetKind: this.targetKind, targetId: this.targetId, state: this.state }, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}