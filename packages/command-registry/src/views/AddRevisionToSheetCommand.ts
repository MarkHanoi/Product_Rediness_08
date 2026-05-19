/**
 * AddRevisionToSheetCommand — Phase S1 (Sheet Integration)
 *
 * Adds a RevisionEntry to a SheetDefinition's revision history.
 * Also updates the legacy `revision` string to the new entry's code.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation
 *   §01 §2.7   — No builders; no Three.js
 *   §03 §1.1   — Additive; schema stable
 *   §04 §2.1   — Class A
 *   §07        — No server routes
 *
 * Undo: removes the revision entry via sheetStore.removeRevision().
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { RevisionEntry } from '@pryzm/core-app-model';

export interface AddRevisionParams {
    sheetId:     string;
    revisionId:  string;
    code:        string;
    description: string;
    date:        string;
    issuedBy:    string;
    issuedTo?:   string;
}

export class AddRevisionToSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.ADD_REVISION_TO_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: AddRevisionParams) {
        this.targetIds = [params.sheetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.params.sheetId)) {
            return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        }
        if (!this.params.code.trim()) {
            return { ok: false, reason: 'Revision code must be a non-empty string.' };
        }
        if (!this.params.date.trim()) {
            return { ok: false, reason: 'Revision date must be a non-empty string.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const entry: RevisionEntry = {
            id:          this.params.revisionId,
            code:        this.params.code,
            description: this.params.description,
            date:        this.params.date,
            issuedBy:    this.params.issuedBy,
            issuedTo:    this.params.issuedTo,
        };
        const ok = sheetStore.addRevision(this.params.sheetId, entry);
        return { success: ok, affectedElementIds: [this.params.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const removed = sheetStore.removeRevision(this.params.sheetId, this.params.revisionId);
        return { success: removed !== null, affectedElementIds: [this.params.sheetId] };
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
