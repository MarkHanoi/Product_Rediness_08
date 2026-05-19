/**
 * SetViewDesignOptionCommand — Phase VIII (Design Options)
 *
 * Associates a ViewDefinition with a named Design Option entity.
 * A view scoped to a design option shows only the primary elements plus
 * those belonging to the selected alternative — the PRYZM equivalent of
 * Revit's Design Options system.
 *
 * Typical usage — "Scope this view to Design Option B":
 *   commandManager.execute(new SetViewDesignOptionCommand({
 *       viewDefinitionId: 'floor-plan-01',
 *       designOptionId:   'option-facade-variant-b',
 *   }));
 *
 * Pass designOptionId: null to remove the design option association.
 *
 * Note: The DesignOptionStore (Phase VIII entity store) is not yet created.
 *       This command stores the reference ID on the ViewDefinition; the
 *       engine resolves the entity via window.designOptionStore at activation // TODO(TASK-08)
 *       time when the store exists.
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §03        — Additive; designOptionId is optional on ViewDefinition
 *   §05        — No DOM, no Three.js, no rendering imports
 *   §07        — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';

export interface SetViewDesignOptionParams {
    viewDefinitionId: string;
    /** Design option entity ID to associate with this view, or null to remove. */
    designOptionId: string | null;
}

export class SetViewDesignOptionCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_DESIGN_OPTION;
    timestamp = Date.now();
    targetIds: string[];

    private _viewId:          string;
    private _designOptionId:  string | null;
    private _before:          string | undefined = undefined;

    constructor(params: SetViewDesignOptionParams) {
        this._viewId         = params.viewDefinitionId;
        this._designOptionId = params.designOptionId;
        this.targetIds       = [params.viewDefinitionId];
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
        this._before = view.designOptionId;

        const ok = viewDefinitionStore.setDesignOption(this._viewId, this._designOptionId);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `Failed to set design option for view '${this._viewId}'.` };
        }
        const label = this._designOptionId ?? 'none';
        console.log(`[SetViewDesignOptionCommand] designOptionId="${label}" on view "${this._viewId}"`);
        return { success: true, affectedElementIds: [this._viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setDesignOption(this._viewId, this._before ?? null);
        console.log(`[SetViewDesignOptionCommand.undo] Restored designOptionId for view "${this._viewId}"`);
        return { success: ok, affectedElementIds: [this._viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   {
                viewDefinitionId: this._viewId,
                designOptionId:   this._designOptionId,
                before:           this._before ?? null,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
