/**
 * RemoveViewportFromSheetCommand — Phase S1 (Sheet Integration)
 *
 * Removes a placed SheetViewport from a Sheet.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation
 *   §01 §2.7   — No builders; no Three.js
 *   §03 §1.1   — Additive; schema stable
 *   §04 §2.1   — Class A
 *   §07        — No server routes
 *
 * Undo: re-adds the viewport via sheetStore.addViewport() with its full snapshot.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { SheetViewport } from '@pryzm/core-app-model';

export class RemoveViewportFromSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.REMOVE_VIEWPORT_FROM_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: SheetViewport | null = null;

    constructor(
        private sheetId:    string,
        private viewportId: string,
    ) {
        this.targetIds = [sheetId, viewportId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const sheet = sheetStore.get(this.sheetId);
        if (!sheet) {
            return { ok: false, reason: `Sheet '${this.sheetId}' does not exist.` };
        }
        const vp = sheet.viewports.find(v => v.id === this.viewportId);
        if (!vp) {
            return { ok: false, reason: `Viewport '${this.viewportId}' not found on sheet '${this.sheetId}'.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = sheetStore.removeViewport(this.sheetId, this.viewportId);
        return { success: this.snapshot !== null, affectedElementIds: [this.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        const ok = sheetStore.addViewport(this.sheetId, this.snapshot);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { sheetId: this.sheetId, viewportId: this.viewportId, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
