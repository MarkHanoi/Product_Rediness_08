import {
    Command, CommandContext, CommandResult, CommandType,
    CommandValidationResult, SerializedCommand,
} from '../types';
import type { OverrideLayer, VisibilityOverride } from '@pryzm/core-app-model';
import { applyOverrideLayer, getOrCreateOverrideLayer, restoreOverrideLayer } from './OverrideCommandUtils';

export class GhostElementInViewCommand implements Command {
    /** F4.4 — Mutates the view's intent instance overrides. */
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.GHOST_ELEMENT_IN_VIEW;
    timestamp = Date.now();
    targetIds: string[];
    private _previous: OverrideLayer | null = null;

    constructor(private viewId: string, private elementId: string, private ghostStyle: VisibilityOverride['ghostStyle'] = 'fade') {
        this.targetIds = [elementId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.viewId || !this.elementId) return { ok: false, reason: 'viewId and elementId are required.' };
        if (this.ghostStyle !== 'fade' && this.ghostStyle !== 'dash') return { ok: false, reason: 'ghostStyle must be fade or dash.' };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = getOrCreateOverrideLayer(this.viewId);
        if (!current) return { success: false, affectedElementIds: [this.elementId], error: 'View intent instance is unavailable.' };
        this._previous = current;
        const visibilityOverrides = current.visibilityOverrides.filter(o => !(o.targetKind === 'element' && o.targetId === this.elementId));
        visibilityOverrides.push({ targetKind: 'element', targetId: this.elementId, action: 'ghost', ghostStyle: this.ghostStyle });
        applyOverrideLayer(this.viewId, { ...current, visibilityOverrides });
        return { success: true, affectedElementIds: [this.elementId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        restoreOverrideLayer(this.viewId, this._previous);
        return { success: true, affectedElementIds: [this.elementId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: { viewId: this.viewId, elementId: this.elementId, ghostStyle: this.ghostStyle }, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}