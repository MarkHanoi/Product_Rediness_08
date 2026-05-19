/**
 * DeleteSheetCommand — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2)
 *
 * Deletes a SheetDefinition from SheetStore.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; snapshot captured for undo
 *   §01 §2.7   — No builders; no Three.js scene access
 *   §03 §1.1   — Schema stable
 *   §07        — No server routes
 *
 * Undo: restores the deleted SheetDefinition via sheetStore.restore().
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { SheetDefinition } from '@pryzm/core-app-model';

export class DeleteSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.DELETE_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: SheetDefinition | null = null;

    constructor(private sheetId: string) {
        this.targetIds = [sheetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.sheetId)) {
            return { ok: false, reason: `Sheet '${this.sheetId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = sheetStore.get(this.sheetId) ?? null;
        const ok = sheetStore.delete(this.sheetId);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        sheetStore.restore(this.snapshot);
        return { success: true, affectedElementIds: [this.sheetId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { sheetId: this.sheetId, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
