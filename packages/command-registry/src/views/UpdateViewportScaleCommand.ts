/**
 * UpdateViewportScaleCommand — Phase S1 (Sheet Integration)
 *
 * Updates the override scale on a placed SheetViewport.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation
 *   §01 §2.7   — No builders; no Three.js
 *   §03 §1.1   — Additive; schema stable
 *   §04 §2.1   — Class A
 *   §07        — No server routes
 *
 * Undo: restores the previous scale value.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';

export class UpdateViewportScaleCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_VIEWPORT_SCALE;
    timestamp = Date.now();
    targetIds: string[];

    private previousScale: number | undefined = undefined;

    constructor(
        private sheetId:    string,
        private viewportId: string,
        private newScale:   number,
    ) {
        this.targetIds = [sheetId, viewportId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (this.newScale <= 0) {
            return { ok: false, reason: 'Scale must be a positive number (e.g. 100 = 1:100).' };
        }
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
        const sheet = sheetStore.get(this.sheetId);
        const vp = sheet?.viewports.find(v => v.id === this.viewportId);
        if (vp) this.previousScale = vp.scale;

        const ok = sheetStore.updateViewportScale(this.sheetId, this.viewportId, this.newScale);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const restoreScale = this.previousScale ?? 100;
        const ok = sheetStore.updateViewportScale(this.sheetId, this.viewportId, restoreScale);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { sheetId: this.sheetId, viewportId: this.viewportId, newScale: this.newScale, previousScale: this.previousScale },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
