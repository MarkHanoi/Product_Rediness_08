/**
 * MoveViewportCommand — Phase S1 (Sheet Integration)
 *
 * Moves a placed SheetViewport to a new position on the sheet canvas.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation
 *   §01 §2.7   — No builders; no Three.js
 *   §03 §1.1   — Additive; schema stable
 *   §04 §2.1   — Class A
 *   §07        — No server routes
 *
 * Undo: restores the previous position.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';

export class MoveViewportCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.MOVE_VIEWPORT;
    timestamp = Date.now();
    targetIds: string[];

    private previousPosition: { x: number; y: number } | null = null;

    constructor(
        private sheetId:     string,
        private viewportId:  string,
        private newPosition: { x: number; y: number },
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
        const sheet = sheetStore.get(this.sheetId);
        const vp = sheet?.viewports.find(v => v.id === this.viewportId);
        if (vp) this.previousPosition = { ...vp.position };

        const ok = sheetStore.moveViewport(this.sheetId, this.viewportId, this.newPosition);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.previousPosition) return { success: false, affectedElementIds: [] };
        const ok = sheetStore.moveViewport(this.sheetId, this.viewportId, this.previousPosition);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { sheetId: this.sheetId, viewportId: this.viewportId, newPosition: this.newPosition, previousPosition: this.previousPosition },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
