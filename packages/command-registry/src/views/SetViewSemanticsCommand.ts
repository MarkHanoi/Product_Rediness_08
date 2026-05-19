/**
 * SetViewSemanticsCommand — Phase VIII (Semantic Context)
 *
 * Sets or clears the ViewSemanticContext on a ViewDefinition.
 * Semantic context makes views self-describing for LLM authoring and
 * World Model reasoning — audience, purpose, tags, and filter descriptions.
 *
 * Typical usage — "Tag this view for contractor coordination":
 *   commandManager.execute(new SetViewSemanticsCommand({
 *       viewDefinitionId: 'view-01',
 *       semantics: { audience: 'contractor', purpose: 'coordination' },
 *   }));
 *
 * Pass semantics: null to clear all semantic context.
 * Pass a partial object to merge with existing semantics (patch mode).
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §03        — Additive; all fields are optional on ViewDefinition
 *   §04        — semantics field is exposed in AIReadModel.getViewsForLLM()
 *   §05        — No DOM, no Three.js, no rendering imports
 *   §07        — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewSemanticContext } from '@pryzm/core-app-model';

export interface SetViewSemanticsParams {
    viewDefinitionId: string;
    /**
     * New semantic context, or null to clear.
     * Partial objects are merged with existing semantics — each supplied key
     * overwrites the existing value; omitted keys are left unchanged.
     * Pass null to wipe all semantic context for this view.
     */
    semantics: Partial<ViewSemanticContext> | null;
}

export class SetViewSemanticsCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_SEMANTICS;
    timestamp = Date.now();
    targetIds: string[];

    private _viewId:    string;
    private _semantics: Partial<ViewSemanticContext> | null;
    private _before:    ViewSemanticContext | undefined = undefined;

    constructor(params: SetViewSemanticsParams) {
        this._viewId    = params.viewDefinitionId;
        this._semantics = params.semantics;
        this.targetIds  = [params.viewDefinitionId];
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
        if (!view) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this._viewId}' not found.` };
        }
        this._before = view.semantics ? { ...view.semantics } : undefined;

        let resolved: ViewSemanticContext | null;
        if (this._semantics === null) {
            resolved = null;
        } else {
            resolved = { ...(view.semantics ?? {}), ...this._semantics } as ViewSemanticContext;
        }

        const ok = viewDefinitionStore.setSemantics(this._viewId, resolved);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `Failed to update semantics for view '${this._viewId}'.` };
        }
        const summary = resolved
            ? `audience=${resolved.audience ?? '—'} purpose=${resolved.purpose ?? '—'}`
            : 'cleared';
        console.log(`[SetViewSemanticsCommand] ${summary} on view "${this._viewId}"`);
        return { success: true, affectedElementIds: [this._viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setSemantics(this._viewId, this._before ?? null);
        console.log(`[SetViewSemanticsCommand.undo] Restored semantics for view "${this._viewId}"`);
        return { success: ok, affectedElementIds: [this._viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   {
                viewDefinitionId: this._viewId,
                semantics:        this._semantics,
                before:           this._before ?? null,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
