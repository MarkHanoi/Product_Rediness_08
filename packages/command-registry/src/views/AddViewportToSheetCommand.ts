/**
 * AddViewportToSheetCommand — Phase S1 (Sheet Integration)
 *
 * Places a ViewDefinition onto a Sheet by adding a SheetViewport entry.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store call from UI
 *   §01 §2.7   — No builders; no Three.js scene access
 *   §03 §1.1   — Additive; no existing schema mutation
 *   §04 §2.1   — Class A command
 *   §07        — No server routes
 *
 * Uniqueness rule: A View (except Schedules and Legends) may appear on only
 * one sheet at a time. canExecute() enforces this.
 * Schedule and Legend view types are exempt (viewType 'legend' or a schedule-placed view).
 *
 * Undo: removes the added viewport via sheetStore.removeViewport().
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { SheetViewport } from '@pryzm/core-app-model';

const MULTI_SHEET_EXEMPT_TYPES = ['legend'];

export interface AddViewportToSheetParams {
    sheetId:    string;
    viewportId: string;
    viewId:     string;
    position:   { x: number; y: number };
    scale?:     number;
    rotation?:  number;
    viewType?:  string;
}

export class AddViewportToSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.ADD_VIEWPORT_TO_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: AddViewportToSheetParams) {
        this.targetIds = [params.sheetId, params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.params.sheetId)) {
            return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        }

        const isExempt = this.params.viewType
            ? MULTI_SHEET_EXEMPT_TYPES.includes(this.params.viewType)
            : false;

        if (!isExempt) {
            const existingSheets = sheetStore.getByViewId(this.params.viewId);
            if (existingSheets.length > 0) {
                const existing = existingSheets[0];
                if (existing.id !== this.params.sheetId) {
                    return {
                        ok:     false,
                        reason: `View '${this.params.viewId}' is already placed on sheet '${existing.sheetNumber}'. A view may only appear on one sheet at a time.`,
                    };
                }
                const alreadyPlaced = existing.viewports.some(vp => vp.viewId === this.params.viewId);
                if (alreadyPlaced) {
                    return {
                        ok:     false,
                        reason: `View '${this.params.viewId}' is already placed on this sheet.`,
                    };
                }
            }
        }

        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const viewport: SheetViewport = {
            id:       this.params.viewportId,
            viewId:   this.params.viewId,
            position: { ...this.params.position },
            scale:    this.params.scale,
            rotation: this.params.rotation,
        };
        const ok = sheetStore.addViewport(this.params.sheetId, viewport);
        return { success: ok, affectedElementIds: [this.params.sheetId, this.params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const removed = sheetStore.removeViewport(this.params.sheetId, this.params.viewportId);
        return { success: removed !== null, affectedElementIds: [this.params.sheetId, this.params.viewId] };
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
