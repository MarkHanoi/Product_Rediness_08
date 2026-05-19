/**
 * OverrideViewTemplatePropertyCommand — Phase 12
 *
 * Records a user-acknowledged reason for a view property deviating from its
 * ViewTemplate value. Sets `view.templateOverrides[key] = reason`.
 *
 * After this command a SyncStateEngine recompute will change the field's
 * outcome from 'conflict' to 'derived' (orange, not red).
 *
 * Undo clears the override (restores previous reason or removes the key).
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

export interface OverrideViewTemplatePropertyParams {
    viewId: string;
    key:    string;
    reason: string;
}

export class OverrideViewTemplatePropertyCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.OVERRIDE_VIEW_TEMPLATE_PROPERTY;
    timestamp = Date.now();
    targetIds: string[];

    private _params:     OverrideViewTemplatePropertyParams;
    private _prevReason: string | null = null;

    constructor(params: OverrideViewTemplatePropertyParams) {
        this._params   = params;
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this._params.viewId)) {
            return { ok: false, reason: `ViewDefinition '${this._params.viewId}' not found.` };
        }
        if (!this._params.key.trim()) {
            return { ok: false, reason: 'Override key must not be empty.' };
        }
        if (!this._params.reason.trim()) {
            return { ok: false, reason: 'Override reason must not be empty.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const view = viewDefinitionStore.get(this._params.viewId);
        this._prevReason = view?.templateOverrides?.[this._params.key] ?? null;

        const ok = viewDefinitionStore.setTemplateOverride(
            this._params.viewId,
            this._params.key,
            this._params.reason,
        );
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `View "${this._params.viewId}" not found.` };
        }

        syncStateEngine.scheduleRecompute(this._params.viewId);

        return { success: true, affectedElementIds: [this._params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        let ok: boolean;
        if (this._prevReason !== null) {
            ok = viewDefinitionStore.setTemplateOverride(this._params.viewId, this._params.key, this._prevReason);
        } else {
            ok = viewDefinitionStore.clearTemplateOverride(this._params.viewId, this._params.key);
        }

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
            payload: { params: this._params, prevReason: this._prevReason },
        };
    }

    static deserialize(data: SerializedCommand): OverrideViewTemplatePropertyCommand {
        const cmd = new OverrideViewTemplatePropertyCommand(data.payload.params);
        cmd.timestamp   = data.timestamp;
        cmd._prevReason = data.payload.prevReason ?? null;
        return cmd;
    }
}
