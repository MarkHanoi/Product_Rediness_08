/**
 * UpdateDataPanelCommand — Phase SC-5 (Next-Gen Sheet Composition Engine)
 *
 * Applies a partial patch to a DataPanel on a sheet.
 * Stores the previous state for undo.
 *
 * Contract compliance:
 *   §01 §2   — Command-first mutation
 *   §04 §2.1 — Class A command (undoable, logged)
 *   §07      — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { DataPanel } from '@pryzm/core-app-model';

export interface UpdateDataPanelParams {
    sheetId:  string;
    panelId:  string;
    patch:    Partial<Omit<DataPanel, 'id'>>;
}

export class UpdateDataPanelCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_DATA_PANEL;
    timestamp = Date.now();
    targetIds: string[];

    private _previousState: Partial<Omit<DataPanel, 'id'>> = {};

    constructor(private params: UpdateDataPanelParams) {
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
        const sheet = sheetStore.get(this.params.sheetId);
        const panel = sheet?.dataPanels?.find(p => p.id === this.params.panelId);
        if (!panel) return { success: false, affectedElementIds: [] };

        // Snapshot only the fields we are about to change
        this._previousState = {};
        for (const key of Object.keys(this.params.patch) as Array<keyof typeof this.params.patch>) {
            (this._previousState as any)[key] = (panel as any)[key];
        }

        const ok = sheetStore.updateDataPanel(this.params.sheetId, this.params.panelId, this.params.patch);
        return { success: ok, affectedElementIds: [this.params.sheetId, this.params.panelId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = sheetStore.updateDataPanel(this.params.sheetId, this.params.panelId, this._previousState);
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
