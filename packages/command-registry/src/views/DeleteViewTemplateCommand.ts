/**
 * DeleteViewTemplateCommand — Phase VII
 *
 * Deletes a ViewTemplate from the ViewTemplateStore.
 * Captures a full snapshot for undo (restore).
 *
 * NOTE: Does NOT automatically clear viewTemplateId on views referencing this
 * template. The caller should run SetViewTemplateCommand(null) on affected
 * views before or after deletion if desired.
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §02         — PlanOrdering priority 5
 *   §05         — Pure command; no DOM, no Three.js
 *   §07         — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewTemplateStore } from '@pryzm/core-app-model';
import type { ViewTemplate } from '@pryzm/core-app-model';

export class DeleteViewTemplateCommand implements Command {
    /** F4.4 — primary write is to viewTemplateStore; views referencing it are orphaned. */
    readonly affectedStores = ["view-template", "view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.DELETE_VIEW_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    private _templateId: string;
    private _snapshot:   ViewTemplate | null = null;

    constructor(templateId: string) {
        this._templateId = templateId;
        this.targetIds   = [templateId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewTemplateStore.has(this._templateId)) {
            return { ok: false, reason: `ViewTemplate '${this._templateId}' not found.` };
        }
        // Phase 12: guard — refuse deletion if any view still references this template
        const viewDefStore = window.viewDefinitionStore; // TODO(TASK-08)
        if (viewDefStore) {
            const usages: number = (viewDefStore.getAll?.() ?? []).filter(
                (v: any) => v.viewTemplateId === this._templateId,
            ).length;
            if (usages > 0) {
                return {
                    ok: false,
                    reason: `Cannot delete: ${usages} view${usages !== 1 ? 's' : ''} still use this template. Re-assign them first.`,
                };
            }
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this._snapshot = viewTemplateStore.get(this._templateId) ?? null;
        const ok = viewTemplateStore.delete(this._templateId);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `Template "${this._templateId}" not found.` };
        }
        console.log(`[DeleteViewTemplateCommand] Deleted template "${this._templateId}"`);
        return { success: true, affectedElementIds: [this._templateId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this._snapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot for undo.' };
        }
        viewTemplateStore.restore(this._snapshot);
        console.log(`[DeleteViewTemplateCommand.undo] Restored template "${this._templateId}"`);
        return { success: true, affectedElementIds: [this._templateId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { templateId: this._templateId, snapshot: this._snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
