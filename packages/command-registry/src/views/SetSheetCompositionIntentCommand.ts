/**
 * SetSheetCompositionIntentCommand — Phase SC-7 (Next-Gen Sheet Composition Engine)
 *
 * Sets the compositionIntent, audience, and documentPhase fields on a SheetDefinition.
 * These fields are used by the AI authoring system to generate context for layout
 * suggestions, annotation audits, and drawing-set generation.
 *
 * Contract compliance:
 *   §01 §2   — Command-first mutation; no direct store call from UI
 *   §04 §2.1 — Class A command (undoable, logged)
 *   §04 §3   — AI-generated intents go through the same command; source field carries 'AI_GENERATED'
 *   §07      — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { SheetDefinition } from '@pryzm/core-app-model';

export interface SetSheetCompositionIntentParams {
    sheetId:           string;
    compositionIntent?: string;
    audience?:         SheetDefinition['audience'];
    documentPhase?:    string;
}

export class SetSheetCompositionIntentCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_SHEET_COMPOSITION_INTENT;
    timestamp = Date.now();
    targetIds: string[];

    private _previous: Partial<Pick<SheetDefinition, 'compositionIntent' | 'audience' | 'documentPhase'>> = {};

    constructor(private params: SetSheetCompositionIntentParams) {
        this.targetIds = [params.sheetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.params.sheetId)) {
            return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const sheet = sheetStore.get(this.params.sheetId);
        if (!sheet) return { success: false, affectedElementIds: [] };

        // Snapshot current values for undo
        this._previous = {
            compositionIntent: sheet.compositionIntent,
            audience:          sheet.audience,
            documentPhase:     sheet.documentPhase,
        };

        // Update via sheetStore.update() (which is Command-routable)
        const ok = sheetStore.update(this.params.sheetId, {
            // SheetStore.update() accepts arbitrary patch fields via the spread
            // We cast to 'any' here because update() only declares the S1 fields,
            // but the SC fields are additive and are stored on the same object.
            ...(this.params as any),
        });
        return { success: ok, affectedElementIds: [this.params.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = sheetStore.update(this.params.sheetId, {
            ...(this._previous as any),
        });
        return { success: ok, affectedElementIds: [this.params.sheetId] };
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
