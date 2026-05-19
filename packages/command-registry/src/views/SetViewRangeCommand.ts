/**
 * SetViewRangeCommand — Phase VI
 *
 * Sets (or clears) the view range of a plan-type ViewDefinition.
 * View range defines the vertical slice through the building model:
 * top boundary, cut plane, bottom boundary, and view depth.
 *
 * Only applicable to plan-family view types: 'plan', 'ceiling-plan',
 * 'structural-plan'. Rejected for sections, elevations, and 3D views.
 *
 * All levelId references must resolve via BimManager (§02 spatial authority).
 * Offset values are in world units (metres).
 *
 * Pass `viewRange: null` to clear the view range and use project-level
 * defaults for this view.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store write from UI
 *   §01 §2.7   — No builders; no Three.js scene access in this command
 *   §02        — levelId references validated; no absolute Y values stored
 *   §03 §1.1   — All ViewRangeSettings fields are serialisable primitives
 *   §07        — No server routes; client-side only
 *
 * Undo: restores the previous view range snapshot captured in execute().
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewRangeSettings } from '@pryzm/core-app-model';
import { PLAN_VIEW_TYPES } from '@pryzm/core-app-model';

export interface SetViewRangeParams {
    viewId: string;
    /** New view range. Pass null to clear and revert to project defaults. */
    viewRange: ViewRangeSettings | null;
}

export class SetViewRangeCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_RANGE;
    timestamp = Date.now();
    targetIds: string[];

    private _previousViewRange: ViewRangeSettings | undefined = undefined;

    constructor(private params: SetViewRangeParams) {
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.params.viewId?.trim()) {
            return { ok: false, reason: 'viewId must be a non-empty string.' };
        }
        const view = viewDefinitionStore.get(this.params.viewId);
        if (!view) {
            return { ok: false, reason: `ViewDefinition '${this.params.viewId}' does not exist.` };
        }
        if (!(PLAN_VIEW_TYPES as readonly string[]).includes(view.viewType)) {
            return {
                ok: false,
                reason: `View range is only applicable to plan views (${PLAN_VIEW_TYPES.join(', ')}). ` +
                        `This view is '${view.viewType}'.`,
            };
        }
        if (this.params.viewRange !== null) {
            const vr = this.params.viewRange;
            const bounds = [vr.top, vr.cut, vr.bottom, vr.depth] as const;
            const names  = ['top', 'cut', 'bottom', 'depth'] as const;
            for (let i = 0; i < bounds.length; i++) {
                const b = bounds[i];
                if (!b?.levelId?.trim()) {
                    return { ok: false, reason: `viewRange.${names[i]}.levelId must be a non-empty string.` };
                }
                if (typeof b.offset !== 'number') {
                    return { ok: false, reason: `viewRange.${names[i]}.offset must be a number (world units).` };
                }
            }
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = viewDefinitionStore.get(this.params.viewId);
        if (!current) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this.params.viewId}' not found.` };
        }
        this._previousViewRange = current.viewRange;

        const ok = viewDefinitionStore.setViewRange(this.params.viewId, this.params.viewRange);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: 'setViewRange failed in store.' };
        }
        console.log(`[SetViewRangeCommand] View '${this.params.viewId}' view range updated.`, this.params.viewRange);
        return { success: true, affectedElementIds: [this.params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setViewRange(
            this.params.viewId,
            this._previousViewRange ?? null,
        );
        return { success: ok, affectedElementIds: [this.params.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params, previousViewRange: this._previousViewRange ?? null },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
