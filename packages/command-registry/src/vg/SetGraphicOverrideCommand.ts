import {
    Command, CommandContext, CommandResult, CommandType,
    CommandValidationResult, SerializedCommand,
} from '../types';
import type {
    ElementState, ElementStateAppearance, GraphicOverride, OverrideLayer, OverrideTargetKind,
} from '@pryzm/core-app-model';
import { applyOverrideLayer, getOrCreateOverrideLayer, restoreOverrideLayer } from './OverrideCommandUtils';

export class SetGraphicOverrideCommand implements Command {
    /** F4.4 — Mutates the view's intent instance overrides. */
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.SET_GRAPHIC_OVERRIDE;
    timestamp = Date.now();
    targetIds: string[];
    private _previous: OverrideLayer | null = null;

    constructor(
        private viewId: string,
        private targetKind: OverrideTargetKind,
        private targetId: string,
        private state: ElementState,
        private patch: Partial<ElementStateAppearance>,
    ) {
        this.targetIds = [targetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.viewId || !this.targetId || !this.targetKind || !this.state) return { ok: false, reason: 'viewId, targetKind, targetId and state are required.' };
        if (!this.patch || Object.keys(this.patch).length === 0) return { ok: false, reason: 'patch is required.' };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = getOrCreateOverrideLayer(this.viewId);
        if (!current) return { success: false, affectedElementIds: this.targetIds, error: 'View intent instance is unavailable.' };
        this._previous = current;
        const graphicOverrides = current.graphicOverrides.filter(o => !(o.targetKind === this.targetKind && o.targetId === this.targetId && o.state === this.state));
        const next: GraphicOverride = { targetKind: this.targetKind, targetId: this.targetId, state: this.state, patch: this.patch };
        graphicOverrides.push(next);
        applyOverrideLayer(this.viewId, { ...current, graphicOverrides });
        return { success: true, affectedElementIds: this.targetIds };
    }

    undo(_ctx: CommandContext): CommandResult {
        restoreOverrideLayer(this.viewId, this._previous);
        return { success: true, affectedElementIds: this.targetIds };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: { viewId: this.viewId, targetKind: this.targetKind, targetId: this.targetId, state: this.state, patch: this.patch }, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}