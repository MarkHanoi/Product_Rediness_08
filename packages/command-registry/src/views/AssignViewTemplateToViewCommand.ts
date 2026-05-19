/**
 * AssignViewTemplateToViewCommand — Phase 12
 *
 * Assigns a ViewTemplate to a ViewDefinition (or clears it when templateId is null).
 * Schedules a sync-state recompute for the view after assignment.
 * Undo restores the previous templateId.
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §05         — Pure command; no DOM, no Three.js
 *   §07         — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore, syncStateEngine } from '@pryzm/core-app-model';

export interface AssignViewTemplateToViewParams {
    viewId:     string;
    templateId: string | null;
}

export class AssignViewTemplateToViewCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.ASSIGN_VIEW_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    private _params:     AssignViewTemplateToViewParams;
    private _prevTemplateId: string | null = null;

    constructor(params: AssignViewTemplateToViewParams) {
        this._params   = params;
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this._params.viewId)) {
            return { ok: false, reason: `ViewDefinition '${this._params.viewId}' not found.` };
        }
        if (this._params.templateId !== null) {
            const vts = window.viewTemplateStore; // TODO(TASK-08)
            if (!vts?.has?.(this._params.templateId)) {
                return { ok: false, reason: `ViewTemplate '${this._params.templateId}' not found.` };
            }
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const existing = viewDefinitionStore.get(this._params.viewId);
        this._prevTemplateId = existing?.viewTemplateId ?? null;

        const ok = viewDefinitionStore.setViewTemplate(this._params.viewId, this._params.templateId);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `View "${this._params.viewId}" not found.` };
        }

        syncStateEngine.scheduleRecompute(this._params.viewId);

        return { success: true, affectedElementIds: [this._params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setViewTemplate(this._params.viewId, this._prevTemplateId);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `View "${this._params.viewId}" not found during undo.` };
        }

        syncStateEngine.scheduleRecompute(this._params.viewId);

        return { success: true, affectedElementIds: [this._params.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type, timestamp: this.timestamp, version: 1,
            targetIds: this.targetIds,
            payload: { params: this._params, prevTemplateId: this._prevTemplateId },
        };
    }

    static deserialize(data: SerializedCommand): AssignViewTemplateToViewCommand {
        const cmd = new AssignViewTemplateToViewCommand(data.payload.params);
        cmd.timestamp         = data.timestamp;
        cmd._prevTemplateId   = data.payload.prevTemplateId ?? null;
        return cmd;
    }
}
