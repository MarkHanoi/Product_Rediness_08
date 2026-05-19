/**
 * UpdateViewTemplateCommand — Phase VII
 *
 * Updates mutable fields of an existing ViewTemplate.
 * Captures a before-snapshot for undo.
 * Dispatches vt:template-updated so views using this template can react.
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
import { viewTemplateStore, syncStateEngine } from '@pryzm/core-app-model';
import type { ViewTemplate } from '@pryzm/core-app-model';
import type {
    ViewTemplateLock,
    ViewOutputSettings,
    ViewTemporalContext,
    AnnotationVisibilitySettings,
    VisibilityRuleStub,
} from '@pryzm/core-app-model';

export interface UpdateViewTemplatePatch {
    name?:         string;
    description?:  string | null;
    discipline?:   ViewTemplate['discipline'];
    vgTemplateId?: string | null;
    output?:       Partial<ViewOutputSettings> | null;
    temporal?:     Partial<ViewTemporalContext> | null;
    annotationOverrides?: Partial<AnnotationVisibilitySettings> | null;
    rules?:        VisibilityRuleStub[] | null;
    lockedFields?: (keyof ViewTemplateLock)[];
    intent?:       string | null;
}

export class UpdateViewTemplateCommand implements Command {
    /**
     * F4.4 — primary write is to viewTemplateStore; declares 'view' too because
     * sync-state recompute and locked-view cascade can affect ViewDefinition.
     */
    readonly affectedStores = ["view-template", "view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_VIEW_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    private _templateId: string;
    private _patch:      UpdateViewTemplatePatch;
    private _before:     ViewTemplate | null = null;

    constructor(templateId: string, patch: UpdateViewTemplatePatch) {
        this._templateId = templateId;
        this._patch      = patch;
        this.targetIds   = [templateId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewTemplateStore.has(this._templateId)) {
            return { ok: false, reason: `ViewTemplate '${this._templateId}' not found.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this._before = viewTemplateStore.get(this._templateId) ?? null;
        const ok = viewTemplateStore.update(this._templateId, this._patch);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `Template "${this._templateId}" not found.` };
        }
        // Phase 12: recompute sync state for every view assigned to this template
        syncStateEngine.scheduleRecomputeByTemplate(this._templateId);
        console.log(`[UpdateViewTemplateCommand] Updated template "${this._templateId}"`);
        return { success: true, affectedElementIds: [this._templateId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this._before) {
            return { success: false, affectedElementIds: [], error: 'No before-snapshot available.' };
        }
        viewTemplateStore.update(this._templateId, {
            name:               this._before.name,
            description:        this._before.description ?? null,
            discipline:         this._before.discipline,
            vgTemplateId:       this._before.vgTemplateId ?? null,
            output:             this._before.output ?? null,
            temporal:           this._before.temporal ?? null,
            annotationOverrides: this._before.annotationOverrides ?? null,
            rules:              this._before.rules ?? null,
            lockedFields:       this._before.lockedFields,
            intent:             this._before.intent ?? null,
        });
        // Phase 12: recompute sync state on undo
        syncStateEngine.scheduleRecomputeByTemplate(this._templateId);
        console.log(`[UpdateViewTemplateCommand.undo] Restored template "${this._templateId}"`);
        return { success: true, affectedElementIds: [this._templateId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { templateId: this._templateId, patch: this._patch },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
