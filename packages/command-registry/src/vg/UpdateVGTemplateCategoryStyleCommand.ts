/**
 * UpdateVGTemplateCategoryStyleCommand — Edit a user-created template's category style.
 *
 * Phase 2 — Template Category Editing (P2.9)
 * Only applicable to non-built-in templates. Built-in templates are read-only.
 * Dispatches vg:template-updated so all models using this template update immediately
 * via VGSceneApplicator.
 *
 * Contract compliance:
 *   §01 §2 — All mutations routed through CommandManager
 *   §05 §4 — Pure data command; no DOM, no Three.js
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { vgGovernanceStore, VGCategoryStyle } from '@pryzm/core-app-model';

export class UpdateVGTemplateCategoryStyleCommand implements Command {
    /** F4.4 — Edits a non-built-in template stored in vgGovernanceStore. */
    readonly affectedStores = ['vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_UPDATE_TEMPLATE_CATEGORY_STYLE;
    timestamp = Date.now();
    targetIds: string[] = [];

    private previousValues: Partial<VGCategoryStyle> = {};

    constructor(
        private templateId: string,
        private category:   string,
        private newStyle:   Partial<VGCategoryStyle>,
    ) {}

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const tpl = vgGovernanceStore.getTemplate(this.templateId);
        if (!tpl) {
            return { ok: false, reason: `Template '${this.templateId}' does not exist.` };
        }
        if (tpl.isBuiltIn) {
            return { ok: false, reason: `Template '${tpl.name}' is built-in and cannot be edited.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const tpl = vgGovernanceStore.getTemplate(this.templateId);
        if (!tpl) return { success: false, affectedElementIds: [] };

        const currentCatStyle = tpl.categories[this.category] ?? {};
        this.previousValues = {};
        for (const prop of Object.keys(this.newStyle) as Array<keyof VGCategoryStyle>) {
            (this.previousValues as any)[prop] = (currentCatStyle as any)[prop];
        }

        const ok = vgGovernanceStore.updateTemplateCategoryStyle(this.templateId, this.category, this.newStyle);
        return { success: ok, affectedElementIds: [this.templateId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (Object.keys(this.previousValues).length > 0) {
            vgGovernanceStore.updateTemplateCategoryStyle(this.templateId, this.category, this.previousValues);
        }
        return { success: true, affectedElementIds: [this.templateId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                templateId: this.templateId,
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
