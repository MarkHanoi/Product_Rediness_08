/**
 * SetInstanceVGOverrideCommand — DOC-4.1
 *
 * Sets or clears a per-element VG style override in a specific view.
 * Maps to Tier 4.5 in the VG cascade (above view/category, below VisibilityRuleEngine).
 *
 * Usage:
 *   // Override a wall's fill to red in view "plan-gf":
 *   commandManager.execute(
 *     new SetInstanceVGOverrideCommand('wall-123', 'plan-gf', { fillColor: '#ff0000' }),
 *     { source: 'HUMAN_DIRECT' }
 *   );
 *
 *   // Clear the override:
 *   commandManager.execute(
 *     new SetInstanceVGOverrideCommand('wall-123', 'plan-gf', null),
 *     { source: 'HUMAN_DIRECT' }
 *   );
 *
 * Contract compliance:
 *   §01 §2  — Mutation via command; store.set() / store.clear() called only here.
 *   §01 §3.3 — Serialise/deserialize are plain objects + primitives only.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { vgInstanceOverrideStore } from '@pryzm/core-app-model';
import type { VGCategoryStyle } from '@pryzm/core-app-model';

export class SetInstanceVGOverrideCommand implements Command {
    /** F4.4 — Sets/clears entries in vgInstanceOverrideStore (Tier 4.5). */
    readonly affectedStores = ['vg-instance-override'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_SET_INSTANCE_OVERRIDE;
    timestamp = Date.now();
    targetIds: string[];

    /** Style snapshot captured before execute(); used for undo. */
    private _previousStyle: Partial<VGCategoryStyle> | null = null;

    /**
     * @param elementId  — The element whose appearance is being overridden.
     * @param viewId     — The view in which the override applies.
     * @param newStyle   — Partial style to merge; pass `null` to clear the override.
     */
    constructor(
        private elementId: string,
        private viewId:    string,
        private newStyle:  Partial<VGCategoryStyle> | null,
    ) {
        this.targetIds = [elementId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.elementId || !this.viewId) {
            return { ok: false, reason: 'elementId and viewId are required.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        // Capture previous state for undo
        this._previousStyle = vgInstanceOverrideStore.get(this.elementId, this.viewId) ?? null;

        if (this.newStyle === null) {
            vgInstanceOverrideStore.clear(this.elementId, this.viewId);
        } else {
            vgInstanceOverrideStore.set(this.elementId, this.viewId, this.newStyle);
        }

        return { success: true, affectedElementIds: [this.elementId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this._previousStyle === null) {
            // There was no override before; restore that state.
            vgInstanceOverrideStore.clear(this.elementId, this.viewId);
        } else {
            vgInstanceOverrideStore.set(this.elementId, this.viewId, this._previousStyle);
        }
        return { success: true, affectedElementIds: [this.elementId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   {
                elementId:     this.elementId,
                viewId:        this.viewId,
                newStyle:      this.newStyle,
                previousStyle: this._previousStyle,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
