/**
 * SetViewProjectionCommand — Phase VII (Camera Persistence)
 *
 * Stores or clears the camera projection settings on a ViewDefinition.
 *
 * Typical usage — "Save View Camera":
 *   1. Read the current Three.js camera state from the engine.
 *   2. Construct a ViewProjectionSettings object from that state.
 *   3. Dispatch SetViewProjectionCommand with the active viewDefinitionId.
 *
 * On view activation (handled in EngineBootstrap view-selected listener):
 *   - If ViewDefinition.projection is defined, the camera is restored to
 *     the saved position/target/type.
 *   - If ViewDefinition.projection is undefined, engine uses default framing.
 *
 * Pass projection: null to clear saved camera state.
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §02         — PlanOrdering priority 5
 *   §05         — References Three.js camera state only via plain
 *                 [number, number, number] tuples in ViewProjectionSettings
 *   §07         — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewProjectionSettings } from '@pryzm/core-app-model';

export interface SetViewProjectionParams {
    viewDefinitionId: string;
    /** New projection state, or null to clear the saved camera. */
    projection: ViewProjectionSettings | null;
}

export class SetViewProjectionCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_PROJECTION;
    timestamp = Date.now();
    targetIds: string[];

    private _viewId:     string;
    private _projection: ViewProjectionSettings | null;
    private _before:     ViewProjectionSettings | undefined = undefined;

    constructor(params: SetViewProjectionParams) {
        this._viewId     = params.viewDefinitionId;
        this._projection = params.projection;
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
        this._before = view?.projection;
        const ok = viewDefinitionStore.setProjection(this._viewId, this._projection);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this._viewId}' not found.` };
        }
        const type = this._projection?.type ?? 'cleared';
        console.log(`[SetViewProjectionCommand] Set projection type="${type}" on view "${this._viewId}"`);
        return { success: true, affectedElementIds: [this._viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setProjection(this._viewId, this._before ?? null);
        console.log(`[SetViewProjectionCommand.undo] Restored projection for view "${this._viewId}"`);
        return { success: ok, affectedElementIds: [this._viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { viewDefinitionId: this._viewId, projection: this._projection, before: this._before ?? null },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
