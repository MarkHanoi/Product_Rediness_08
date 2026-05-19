/**
 * ApplySheetLayoutPresetCommand — Phase SC-4 (Next-Gen Sheet Composition Engine)
 *
 * Applies a named layout preset to a sheet by computing and setting its LayoutRule[].
 * The LayoutEngine.buildPreset() function is called at execute() time, not in the constructor,
 * so the rules reflect the current viewport IDs on the sheet at the time of execution.
 *
 * Contract compliance:
 *   §01 §2   — Command-first; LayoutEngine is called inside execute(), not from UI
 *   §04 §2.1 — Class A command (fully undoable)
 *   §07      — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import { layoutEngine } from '@pryzm/core-app-model';
import type { LayoutPresetKey } from '@pryzm/core-app-model';
import type { LayoutRule } from '@pryzm/core-app-model';

export interface ApplySheetLayoutPresetParams {
    sheetId:     string;
    presetKey:   LayoutPresetKey;
    paperW:      number;
    paperH:      number;
    marginMm:    number;
}

export class ApplySheetLayoutPresetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.APPLY_SHEET_LAYOUT_PRESET;
    timestamp = Date.now();
    targetIds: string[];

    private _previousRules: LayoutRule[] = [];
    private _appliedRules:  LayoutRule[] = [];

    constructor(private params: ApplySheetLayoutPresetParams) {
        this.targetIds = [params.sheetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.params.sheetId)) {
            return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        }
        const validKeys: LayoutPresetKey[] = [
            'single-centred', 'plan-two-sections', 'plan-detail-column',
            'four-up', 'schedule-sheet', 'detail-sheet',
        ];
        if (!validKeys.includes(this.params.presetKey)) {
            return { ok: false, reason: `Unknown layout preset: '${this.params.presetKey}'.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const sheet = sheetStore.get(this.params.sheetId);
        if (!sheet) return { success: false, affectedElementIds: [] };

        this._previousRules = sheet.layoutRules ?? [];

        const viewportIds = sheet.viewports.map(vp => vp.id);
        this._appliedRules = layoutEngine.buildPreset(
            this.params.presetKey,
            viewportIds,
            { w: this.params.paperW, h: this.params.paperH, marginMm: this.params.marginMm },
        );

        const ok = sheetStore.setLayoutRules(this.params.sheetId, this._appliedRules);
        console.log(`[ApplySheetLayoutPresetCommand] Applied preset '${this.params.presetKey}' → ${this._appliedRules.length} rules`);
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
