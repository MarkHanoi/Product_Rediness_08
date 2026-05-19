/**
 * SetSheetLayoutRuleCommand — Phase SC-4 (Next-Gen Sheet Composition Engine)
 *
 * Sets the LayoutRule[] on a SheetDefinition.
 * Replaces the entire layout rule array (previous rules are the undo snapshot).
 *
 * Contract compliance:
 *   §01 §2   — Command-first mutation; no direct store call from UI
 *   §04 §2.1 — Class A command (fully undoable, preview-safe, logged)
 *   §07      — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { LayoutRule } from '@pryzm/core-app-model';

export interface SetSheetLayoutRuleParams {
    sheetId:  string;
    rules:    LayoutRule[];
}

export class SetSheetLayoutRuleCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_SHEET_LAYOUT_RULE;
    timestamp = Date.now();
    targetIds: string[];

    private _previousRules: LayoutRule[] = [];

    constructor(private params: SetSheetLayoutRuleParams) {
        this.targetIds = [params.sheetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.params.sheetId)) {
            return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const sheet = sheetStore.get(this.params.sheetId);
        this._previousRules = sheet?.layoutRules ?? [];
        const ok = sheetStore.setLayoutRules(this.params.sheetId, this.params.rules);
        return { success: ok, affectedElementIds: [this.params.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = sheetStore.setLayoutRules(this.params.sheetId, this._previousRules);
        return { success: ok, affectedElementIds: [this.params.sheetId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
