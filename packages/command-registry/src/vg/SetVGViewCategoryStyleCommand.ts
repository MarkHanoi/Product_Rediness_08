/**
 * SetVGViewCategoryStyleCommand — View-level VG category style override.
 *
 * Phase 2 — View-Level Overrides (P2.3)
 * Identical pattern to SetVGCategoryStyleCommand but targets a view within a model.
 *
 * Contract compliance:
 *   §01 §2 — All mutations routed through CommandManager
 *   §05 §4 — Pure data command; no DOM, no Three.js
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { vgGovernanceStore, VGCategoryStyle } from '@pryzm/core-app-model';

export class SetVGViewCategoryStyleCommand implements Command {
    /** F4.4 — Mutates view-level category overrides on vgGovernanceStore. */
    readonly affectedStores = ['vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_SET_VIEW_CATEGORY_STYLE;
    timestamp = Date.now();
    targetIds: string[] = [];

    private previousValues: Partial<VGCategoryStyle> = {};

    constructor(
        private viewId:   string,
        private modelId:  string,
        private category: string,
        private newStyle: Partial<VGCategoryStyle>,
    ) {}

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!vgGovernanceStore.getModel(this.modelId)) {
            return { ok: false, reason: `Model '${this.modelId}' is not registered.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const resolved = vgGovernanceStore.resolveStyle(this.modelId, this.category, this.viewId);
        this.previousValues = {};
        for (const prop of Object.keys(this.newStyle) as Array<keyof VGCategoryStyle>) {
            (this.previousValues as any)[prop] = (resolved.style as any)[prop];
        }
        const ok = vgGovernanceStore.setViewCategoryOverride(this.viewId, this.category, this.newStyle);
        return { success: ok, affectedElementIds: [this.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const keysToReset = Object.keys(this.previousValues) as Array<keyof VGCategoryStyle>;
        for (const prop of keysToReset) {
            const wasOverridden = vgGovernanceStore.isViewPropOverridden(this.viewId, this.category, prop);
            if (!wasOverridden) {
                vgGovernanceStore.resetViewCategoryOverride(this.viewId, this.category, prop);
            }
        }
        if (Object.keys(this.previousValues).length > 0) {
            vgGovernanceStore.setViewCategoryOverride(this.viewId, this.category, this.previousValues);
        }
        return { success: true, affectedElementIds: [this.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                viewId: this.viewId,
                modelId: this.modelId,
                category: this.category,
                newStyle: this.newStyle,
                previousValues: this.previousValues,
            },
            targetIds: [],
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
