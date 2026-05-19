/**
 * UpdateViewDefinitionCommand — Phase B
 *
 * Updates mutable fields of an existing ViewDefinition (name, discipline,
 * spatial context, temporal filter, vgTemplateId, AI intent string, tags).
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
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewDefinition, ViewSpatialContext, ViewTemporalContext } from '@pryzm/core-app-model';

export interface UpdateViewDefinitionPatch {
    name?:         string;
    discipline?:   ViewDefinition['discipline'];
    spatial?:      Partial<ViewSpatialContext>;
    temporal?:     Partial<ViewTemporalContext>;
    vgTemplateId?: string | null;
    intent?:       string;
    tags?:         string[];
    purpose?:      ViewDefinition['purpose'] | null;
}

export class UpdateViewDefinitionCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_VIEW_DEFINITION;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: ViewDefinition | null = null;

    constructor(
        private viewId: string,
        private patch:  UpdateViewDefinitionPatch,
    ) {
        this.targetIds = [viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this.viewId)) {
            return { ok: false, reason: `ViewDefinition '${this.viewId}' does not exist.` };
        }
        if (Object.keys(this.patch).length === 0) {
            return { ok: false, reason: 'Patch is empty — nothing to update.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = viewDefinitionStore.get(this.viewId) ?? null;
        if (!this.snapshot) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this.viewId}' not found.` };
        }
        const ok = viewDefinitionStore.update(this.viewId, this.patch);
        return { success: ok, affectedElementIds: [this.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        const snap = this.snapshot;
        const ok = viewDefinitionStore.update(this.viewId, {
            name:         snap.name,
            discipline:   snap.discipline,
            spatial:      snap.spatial,
            temporal:     snap.temporal,
            vgTemplateId: snap.vgTemplateId ?? null,
            intent:       snap.intent,
            tags:         snap.metadata.tags,
            purpose:      snap.purpose ?? null,
        } as any);
        return { success: ok, affectedElementIds: [this.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { viewId: this.viewId, patch: this.patch, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
