/**
 * UpdateSheetCommand — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2)
 *
 * Updates mutable fields of an existing SheetDefinition.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; snapshot captured in execute()
 *   §01 §2.7   — No builders; no Three.js scene access
 *   §03 §1.1   — Additive update only; schema stable
 *   §07        — No server routes
 *
 * Undo: restores the snapshot captured at execute() time.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { SheetDefinition, SheetViewport, RevisionEntry, SheetStatus } from '@pryzm/core-app-model';

export interface UpdateSheetPatch {
    sheetNumber?: string;
    name?:        string;
    revision?:    string;
    viewports?:   SheetViewport[];
    viewIds?:     string[];
    titleBlock?:  string;
    revisions?:   RevisionEntry[];
    issueDate?:   string;
    issuedBy?:    string;
    status?:      SheetStatus;
}

export class UpdateSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: SheetDefinition | null = null;

    constructor(
        private sheetId: string,
        private patch:   UpdateSheetPatch,
    ) {
        this.targetIds = [sheetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.sheetId)) {
            return { ok: false, reason: `Sheet '${this.sheetId}' does not exist.` };
        }
        if (Object.keys(this.patch).length === 0) {
            return { ok: false, reason: 'Patch is empty — nothing to update.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = sheetStore.get(this.sheetId) ?? null;
        if (!this.snapshot) {
            return { success: false, affectedElementIds: [], error: `Sheet '${this.sheetId}' not found.` };
        }
        const ok = sheetStore.update(this.sheetId, this.patch);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        const snap = this.snapshot;
        const ok = sheetStore.update(this.sheetId, {
            sheetNumber: snap.sheetNumber,
            name:        snap.name,
            revision:    snap.revision,
            viewports:   snap.viewports,
            titleBlock:  snap.titleBlock,
            revisions:   snap.revisions,
            issueDate:   snap.issueDate,
            issuedBy:    snap.issuedBy,
            status:      snap.status,
        });
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { sheetId: this.sheetId, patch: this.patch, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
