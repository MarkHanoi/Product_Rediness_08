/**
 * AddDataPanelToSheetCommand — Phase SC-5 (Next-Gen Sheet Composition Engine)
 *
 * Places a DataPanel on a SheetDefinition's dataPanels[] array.
 * Undo removes the panel by its ID.
 *
 * Contract compliance:
 *   §01 §2   — Command-first mutation
 *   §04 §2.1 — Class A command (undoable, logged)
 *   §07      — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { DataPanel } from '@pryzm/core-app-model';

export interface AddDataPanelParams {
    sheetId: string;
    panel:   DataPanel;
}

export class AddDataPanelToSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.ADD_DATA_PANEL_TO_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: AddDataPanelParams) {
        this.targetIds = [params.sheetId, params.panel.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.params.sheetId)) {
            return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        }
        const sheet = sheetStore.get(this.params.sheetId);
        if (sheet?.dataPanels?.some(p => p.id === this.params.panel.id)) {
            return { ok: false, reason: `DataPanel '${this.params.panel.id}' is already on this sheet.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const ok = sheetStore.addDataPanel(this.params.sheetId, this.params.panel);
        return { success: ok, affectedElementIds: [this.params.sheetId, this.params.panel.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const removed = sheetStore.removeDataPanel(this.params.sheetId, this.params.panel.id);
        return { success: removed !== null, affectedElementIds: [this.params.sheetId, this.params.panel.id] };
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
