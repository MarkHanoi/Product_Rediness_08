/**
 * SetViewTemplateCommand — Phase VII
 *
 * Associates a ViewDefinition with a ViewTemplate (or clears the association).
 *
 * Setting a template does NOT immediately copy the template's property values
 * into the ViewDefinition. The VGSceneApplicator / engine reads
 * ViewDefinition.viewTemplateId at apply-time and cascades the template
 * properties through the 4-tier VG governance system (Tier 3).
 *
 * Pass templateId: null to detach the view from its current template.
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §02         — PlanOrdering priority 5
 *   §05         — Pure command; no DOM, no Three.js
 *   §07         — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';

export interface SetViewTemplateParams {
    viewDefinitionId: string;
    /** ViewTemplate id to apply, or null to detach. */
    templateId: string | null;
}

export class SetViewTemplateCommand implements Command {
    /** F4.4 — view's viewTemplateId mutates; sync state cascade may revisit view-intent-instance. */
    readonly affectedStores = ["view", "view-intent-instance"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    private _viewId:     string;
    private _templateId: string | null;
    private _before:     string | undefined = undefined;

    constructor(params: SetViewTemplateParams) {
        this._viewId     = params.viewDefinitionId;
        this._templateId = params.templateId;
        this.targetIds   = [params.viewDefinitionId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this._viewId) {
            return { ok: false, reason: 'viewDefinitionId is required.' };
        }
        if (!viewDefinitionStore.has(this._viewId)) {
            return { ok: false, reason: `ViewDefinition '${this._viewId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const view = viewDefinitionStore.get(this._viewId);
        this._before = view?.viewTemplateId;
        const ok = viewDefinitionStore.setViewTemplate(this._viewId, this._templateId);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this._viewId}' not found.` };
        }
        const action = this._templateId ? `applied template "${this._templateId}"` : 'detached template';
        console.log(`[SetViewTemplateCommand] ${action} on view "${this._viewId}"`);
        return { success: true, affectedElementIds: [this._viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setViewTemplate(this._viewId, this._before ?? null);
        console.log(`[SetViewTemplateCommand.undo] Restored template ref for view "${this._viewId}"`);
        return { success: ok, affectedElementIds: [this._viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { viewDefinitionId: this._viewId, templateId: this._templateId, before: this._before ?? null },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
