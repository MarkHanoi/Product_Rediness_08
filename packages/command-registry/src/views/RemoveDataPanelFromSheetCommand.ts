/**
 * RemoveDataPanelFromSheetCommand — Phase SC-5 (Next-Gen Sheet Composition Engine)
 *
 * Removes a DataPanel from a sheet's dataPanels[]. Stores the removed panel for undo.
 *
 * Contract compliance:
 *   §01 §2   — Command-first mutation
 *   §04 §2.1 — Class A command (undoable, logged)
 *   §07      — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { DataPanel } from '@pryzm/core-app-model';

export interface RemoveDataPanelParams {
    sheetId:  string;
    panelId:  string;
}

export class RemoveDataPanelFromSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.REMOVE_DATA_PANEL_FROM_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    private _removedPanel: DataPanel | null = null;

    constructor(private params: RemoveDataPanelParams) {
        this.targetIds = [params.sheetId, params.panelId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const sheet = sheetStore.get(this.params.sheetId);
        if (!sheet) return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        if (!sheet.dataPanels?.some(p => p.id === this.params.panelId)) {
            return { ok: false, reason: `DataPanel '${this.params.panelId}' not found on this sheet.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this._removedPanel = sheetStore.removeDataPanel(this.params.sheetId, this.params.panelId);
        return { success: this._removedPanel !== null, affectedElementIds: [this.params.sheetId, this.params.panelId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this._removedPanel) return { success: false, affectedElementIds: [] };
        const ok = sheetStore.addDataPanel(this.params.sheetId, this._removedPanel);
        return { success: ok, affectedElementIds: [this.params.sheetId, this.params.panelId] };
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
