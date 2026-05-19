/**
 * SetViewUnderlayCommand — Phase VI
 *
 * Sets (or clears) the underlay configuration for a plan-type ViewDefinition.
 * Underlay shows another level's elements as a ghosted reference in plan views,
 * enabling floor-to-floor relationship comparison without switching views.
 *
 * Only applicable to plan-family view types: 'plan', 'ceiling-plan'.
 * Rejected for sections, elevations, 3D, and structural-plan views.
 *
 * All levelId references are optional BimManager references (§02 authority).
 *
 * Pass `underlay: null` to remove the underlay entirely.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store write from UI
 *   §01 §2.7   — No builders; no Three.js scene access in this command
 *   §02        — baseLevelId / topLevelId are BimManager references (optional)
 *   §03 §1.1   — All ViewUnderlaySettings fields are serialisable primitives
 *   §07        — No server routes; client-side only
 *
 * Undo: restores the previous underlay settings snapshot captured in execute().
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewUnderlaySettings } from '@pryzm/core-app-model';

const UNDERLAY_VIEW_TYPES = ['plan', 'ceiling-plan'] as const;

export interface SetViewUnderlayParams {
    viewId: string;
    /** New underlay settings. Pass null to remove the underlay. */
    underlay: ViewUnderlaySettings | null;
}

export class SetViewUnderlayCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_UNDERLAY;
    timestamp = Date.now();
    targetIds: string[];

    private _previousUnderlay: ViewUnderlaySettings | undefined = undefined;

    constructor(private params: SetViewUnderlayParams) {
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
        if (!(UNDERLAY_VIEW_TYPES as readonly string[]).includes(view.viewType)) {
            return {
                ok: false,
                reason: `Underlay is only applicable to plan and ceiling-plan views. ` +
                        `This view is '${view.viewType}'.`,
            };
        }
        if (this.params.underlay !== null) {
            const u = this.params.underlay;
            if (u.orientation !== 'lookingDown' && u.orientation !== 'lookingUp') {
                return { ok: false, reason: "underlay.orientation must be 'lookingDown' or 'lookingUp'." };
            }
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = viewDefinitionStore.get(this.params.viewId);
        if (!current) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this.params.viewId}' not found.` };
        }
        this._previousUnderlay = current.underlay;

        const ok = viewDefinitionStore.setUnderlay(this.params.viewId, this.params.underlay);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: 'setUnderlay failed in store.' };
        }
        console.log(`[SetViewUnderlayCommand] View '${this.params.viewId}' underlay updated.`, this.params.underlay);
        return { success: true, affectedElementIds: [this.params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setUnderlay(
            this.params.viewId,
            this._previousUnderlay ?? null,
        );
        return { success: ok, affectedElementIds: [this.params.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params, previousUnderlay: this._previousUnderlay ?? null },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
