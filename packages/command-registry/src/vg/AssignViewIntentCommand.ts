import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
import type { ViewIntentInstance } from '@pryzm/core-app-model';

export interface AssignViewIntentParams {
    viewId: string;
    intentId: string;
    /**
     * Master Implementation Plan Wave 6 / Stage A6 — keepOverrides flag.
     *
     * When `true` (the default — preserves pre-Wave-6 behaviour), the view's
     * existing `localOverrides` are carried across the rebind.  Use case: the
     * user is switching one Intent for another but wants their three custom
     * wall-colour tweaks to survive the transition.
     *
     * When `false`, `localOverrides` is reset to `EMPTY_OVERRIDE_LAYER`
     * immediately after the rebind.  Use case: "Bind to" with the
     * "discard my customisations" checkbox unchecked in the action sheet.
     *
     * The flag has no effect on first-time bindings (no previous overrides).
     */
    keepOverrides?: boolean;
}

export class AssignViewIntentCommand implements Command {
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.ASSIGN_VIEW_INTENT;
    timestamp = Date.now();
    targetIds: string[];
    private previous: ViewIntentInstance | null = null;

    constructor(private params: AssignViewIntentParams) {
        this.targetIds = [params.viewId, params.intentId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this.params.viewId)) return { ok: false, reason: `View '${this.params.viewId}' does not exist.` };
        if (!visibilityIntentStore.has(this.params.intentId)) return { ok: false, reason: `VisibilityIntent '${this.params.intentId}' does not exist.` };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.previous = viewIntentInstanceStore.get(this.params.viewId) ?? null;
        const next = viewIntentInstanceStore.assign(this.params.viewId, this.params.intentId);
        if (!next) return { success: false, affectedElementIds: [], error: 'Failed to assign VisibilityIntent to view.' };

        // Wave 6 / A6 — explicit-discard path. Default is to keep overrides
        // (matches every pre-Wave-6 call site without changes).  When the
        // caller explicitly opts out, clear immediately after the assign so
        // the rebind + clear is atomic from the journal's perspective.
        if (this.params.keepOverrides === false && this.previous) {
            viewIntentInstanceStore.clearOverrides(this.params.viewId);
        }
        return { success: true, affectedElementIds: [this.params.viewId, this.params.intentId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this.previous) {
            viewIntentInstanceStore.delete(this.params.viewId);
            viewIntentInstanceStore.restore(this.previous);
            return { success: true, affectedElementIds: [this.params.viewId, this.previous.intentId] };
        }
        const ok = viewIntentInstanceStore.delete(this.params.viewId);
        return { success: ok, affectedElementIds: [this.params.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { params: this.params, previous: this.previous },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}