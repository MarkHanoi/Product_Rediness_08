/**
 * DeleteViewDefinitionCommand — Phase B
 *
 * Deletes a ViewDefinition from ViewDefinitionStore.
 * Undo restores the full snapshot captured at execute() time.
 *
 * Contract compliance:
 *   §01 §2     — Command-first; snapshot captured before deletion
 *   §01 §2.7   — No builders; no Three.js scene access
 *   §03 §1.1   — Schema stable; only removes the record
 *   §07        — No server routes
 *
 * Note: The corresponding VGViewRecord in VGGovernanceStore is NOT deleted.
 * An orphaned VGViewRecord with no overrides is harmless — it wastes minimal
 * memory and is excluded from serialisation if empty. This avoids a complex
 * two-store undo transaction.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';

export class DeleteViewDefinitionCommand implements Command {
    /**
     * VIEW-SYSTEM-AUDIT-2026 F4.4 — declares cascading impact even though only
     * the 'view' write happens here.  ViewIntentInstanceStore + ViewCameraState
     * entries become orphaned references; downstream cleanup may target them.
     */
    readonly affectedStores = ["view", "view-intent-instance", "view-camera-state"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.DELETE_VIEW_DEFINITION;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: ViewDefinition | null = null;

    constructor(private viewId: string) {
        this.targetIds = [viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this.viewId)) {
            return { ok: false, reason: `ViewDefinition '${this.viewId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = viewDefinitionStore.get(this.viewId) ?? null;
        if (!this.snapshot) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this.viewId}' not found before delete.` };
        }
        const ok = viewDefinitionStore.delete(this.viewId);
        return { success: ok, affectedElementIds: [this.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        viewDefinitionStore.restore(this.snapshot);
        return { success: true, affectedElementIds: [this.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { viewId: this.viewId, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
