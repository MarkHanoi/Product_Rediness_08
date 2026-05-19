/**
 * ResetViewTemplatePropertyCommand — Phase 12
 *
 * Removes a user-declared override for a view property, clearing
 * `view.templateOverrides[key]`. After this command a SyncStateEngine
 * recompute will change the field back from 'derived' to 'conflict'
 * (or 'synced' if the value now matches the template).
 *
 * Undo restores the previous override reason.
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

export interface ResetViewTemplatePropertyParams {
    viewId: string;
    key:    string;
}

export class ResetViewTemplatePropertyCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.RESET_VIEW_TEMPLATE_PROPERTY;
    timestamp = Date.now();
    targetIds: string[];

    private _params:     ResetViewTemplatePropertyParams;
    private _prevReason: string | null = null;

    constructor(params: ResetViewTemplatePropertyParams) {
        this._params   = params;
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this._params.viewId)) {
            return { ok: false, reason: `ViewDefinition '${this._params.viewId}' not found.` };
        }
        const view = viewDefinitionStore.get(this._params.viewId);
        if (!view?.templateOverrides?.[this._params.key]) {
            return { ok: false, reason: `No override for key '${this._params.key}' on view '${this._params.viewId}'.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const view = viewDefinitionStore.get(this._params.viewId);
        this._prevReason = view?.templateOverrides?.[this._params.key] ?? null;

        const ok = viewDefinitionStore.clearTemplateOverride(this._params.viewId, this._params.key);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `View "${this._params.viewId}" not found or override key absent.` };
        }

        syncStateEngine.scheduleRecompute(this._params.viewId);

        return { success: true, affectedElementIds: [this._params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this._prevReason) {
            return { success: false, affectedElementIds: [], error: 'No reason snapshot for undo.' };
        }
        const ok = viewDefinitionStore.setTemplateOverride(this._params.viewId, this._params.key, this._prevReason);
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

    static deserialize(data: SerializedCommand): ResetViewTemplatePropertyCommand {
        const cmd = new ResetViewTemplatePropertyCommand(data.payload.params);
        cmd.timestamp   = data.timestamp;
        cmd._prevReason = data.payload.prevReason ?? null;
        return cmd;
    }
}
