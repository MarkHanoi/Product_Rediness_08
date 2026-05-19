/**
 * CreateSheetCommand — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2)
 *
 * Creates a new SheetDefinition in SheetStore.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store call from UI
 *   §01 §2.7   — Does NOT call builders; no Three.js scene access
 *   §03 §1.1   — No schema mutation; SheetDefinition is purely additive
 *   §07        — No server routes; no external network calls
 *
 * Undo: deletes the created SheetDefinition from SheetStore.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';

export interface CreateSheetParams {
    id:          string;
    sheetNumber: string;
    name:        string;
    revision?:   string;
    viewIds?:    string[];
    titleBlock?: string;
    createdBy?:  string;
}

export class CreateSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: CreateSheetParams) {
        this.targetIds = [params.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.params.id?.trim()) {
            return { ok: false, reason: 'Sheet id must be a non-empty string.' };
        }
        if (!this.params.name?.trim()) {
            return { ok: false, reason: 'Sheet name must be a non-empty string.' };
        }
        if (!this.params.sheetNumber?.trim()) {
            return { ok: false, reason: 'Sheet number must be a non-empty string.' };
        }
        if (sheetStore.has(this.params.id)) {
            return { ok: false, reason: `A sheet with id '${this.params.id}' already exists.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const sheet = sheetStore.create(this.params);
        if (!sheet) {
            return { success: false, affectedElementIds: [], error: 'Failed to create SheetDefinition.' };
        }
        return { success: true, affectedElementIds: [this.params.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = sheetStore.delete(this.params.id);
        return { success: ok, affectedElementIds: [this.params.id] };
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
